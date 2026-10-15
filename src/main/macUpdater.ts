/**
 * macOS 자체 업데이트 설치기.
 *
 * 앱이 Apple 인증서로 서명되어 있지 않아 Squirrel.Mac(electron-updater 기본 경로)은 항상 실패한다.
 * 대신 GitHub 릴리스의 DMG를 직접 받아 latest-mac.yml의 sha512로 검증한 뒤,
 * 앱 종료 후 셸 스크립트가 .app 번들을 교체하고 (선택) 다시 실행한다.
 *
 * 교체 대상 위치에 쓰기 권한이 없으면(예: 다른 계정 소유 /Applications, App Translocation)
 * isSupported()가 false → 호출 측이 기존 "다운로드 페이지 열기" 안내로 되돌아간다.
 */

import * as https from 'https';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { app } from 'electron';

const RELEASE_DOWNLOAD_BASE = 'https://github.com/bonggisam/T1T/releases/download';

export interface UpdateFileInfo {
  url: string;
  sha512: string;
  size?: number;
}

export interface MacProgress {
  percent: number;
  transferred: number;
  total: number;
}

/** 실행 중인 .app 번들 경로 (…/T1T.app) */
export function getAppBundlePath(): string | null {
  // process.execPath = /Applications/T1T.app/Contents/MacOS/T1T
  const bundle = path.resolve(path.dirname(process.execPath), '..', '..');
  return bundle.endsWith('.app') ? bundle : null;
}

/** 번들을 교체할 수 있는 위치에서 실행 중인지 확인 */
export function isSupported(): boolean {
  if (process.platform !== 'darwin') return false;
  const bundle = getAppBundlePath();
  if (!bundle) return false;
  // Gatekeeper App Translocation(읽기 전용 임시 경로)이나 DMG에서 직접 실행 중이면 교체 불가
  if (bundle.includes('/AppTranslocation/') || bundle.startsWith('/Volumes/')) return false;
  try {
    fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
    fs.accessSync(bundle, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** 현재 CPU에 맞는 DMG 선택 (arm64 → *-arm64.dmg, x64 → arm64가 아닌 .dmg) */
export function pickDmg(files: UpdateFileInfo[] | undefined): UpdateFileInfo | null {
  const dmgs = (files || []).filter((f) => f.url.endsWith('.dmg'));
  const isArm = process.arch === 'arm64';
  return dmgs.find((f) => /-arm64\.dmg$/.test(f.url) === isArm) ?? null;
}

function pendingDir(): string {
  const dir = path.join(app.getPath('userData'), 'pending-update');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 리다이렉트(github → objects.githubusercontent.com)를 따라가며 파일로 저장 + sha512 검증 */
export function downloadDmg(
  version: string,
  file: UpdateFileInfo,
  onProgress: (p: MacProgress) => void,
): Promise<string> {
  const dest = path.join(pendingDir(), path.basename(file.url));
  const url = `${RELEASE_DOWNLOAD_BASE}/v${encodeURIComponent(version)}/${encodeURIComponent(file.url)}`;

  // 이미 받아 둔 같은 파일이 검증되면 재사용
  if (fs.existsSync(dest)) {
    try {
      const hash = crypto.createHash('sha512').update(fs.readFileSync(dest)).digest('base64');
      if (hash === file.sha512) return Promise.resolve(dest);
    } catch {}
    try { fs.unlinkSync(dest); } catch {}
  }

  const tmp = `${dest}.part`;

  return new Promise((resolve, reject) => {
    const get = (target: string, redirects: number) => {
      const req = https.get(target, { headers: { 'User-Agent': `T1T/${app.getVersion()}` } }, (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirects >= 5) { reject(new Error('다운로드 리다이렉트가 너무 많습니다')); return; }
          get(new URL(res.headers.location, target).toString(), redirects + 1);
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new Error(`다운로드 실패 (HTTP ${status})`));
          return;
        }

        const total = Number(res.headers['content-length']) || file.size || 0;
        let transferred = 0;
        let lastPercent = -1;
        const hash = crypto.createHash('sha512');
        const out = fs.createWriteStream(tmp);

        res.on('data', (chunk: Buffer) => {
          transferred += chunk.length;
          hash.update(chunk);
          const percent = total ? Math.floor((transferred / total) * 100) : 0;
          if (percent !== lastPercent) {
            lastPercent = percent;
            onProgress({ percent, transferred, total });
          }
        });
        res.on('error', (err) => { out.destroy(); reject(err); });
        res.pipe(out);
        out.on('error', reject);
        out.on('finish', () => {
          const digest = hash.digest('base64');
          if (digest !== file.sha512) {
            try { fs.unlinkSync(tmp); } catch {}
            reject(new Error('sha512 checksum mismatch — 파일이 손상되었습니다'));
            return;
          }
          fs.renameSync(tmp, dest);
          resolve(dest);
        });
      });
      req.on('error', reject);
      req.setTimeout(60000, () => req.destroy(new Error('download timeout (60s 무응답)')));
    };
    get(url, 0);
  });
}

/**
 * 앱 종료 후 번들을 교체하는 스크립트를 분리 실행한다.
 * 호출 직후 app.quit()을 불러야 스크립트가 진행된다.
 * 교체에 실패하면 원래 번들을 되돌려 놓는다.
 */
export function spawnInstaller(dmgPath: string, relaunch: boolean): void {
  const bundle = getAppBundlePath();
  if (!bundle) throw new Error('앱 번들 경로를 찾을 수 없습니다');

  const dir = pendingDir();
  const script = path.join(dir, 'install.sh');
  const log = path.join(app.getPath('userData'), 'update.log');

  fs.writeFileSync(script, `#!/bin/bash
PID="$1"; DMG="$2"; APP="$3"; RELAUNCH="$4"
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [mac-install] $*"; }
for _ in $(seq 1 120); do kill -0 "$PID" 2>/dev/null || break; sleep 0.5; done
log "app exited, installing from $DMG"
MNT="$(mktemp -d /tmp/t1t-update.XXXXXX)"
if ! hdiutil attach "$DMG" -nobrowse -noautoopen -readonly -mountpoint "$MNT" >/dev/null; then
  log "hdiutil attach failed"; [ "$RELAUNCH" = 1 ] && open "$APP"; exit 1
fi
SRC="$(find "$MNT" -maxdepth 1 -name '*.app' | head -1)"
NEW="$APP.updating"; OLD="$APP.old"
rm -rf "$NEW" "$OLD"
OK=0
if [ -n "$SRC" ] && ditto "$SRC" "$NEW"; then
  if mv "$APP" "$OLD"; then
    if mv "$NEW" "$APP"; then OK=1; rm -rf "$OLD"; else mv "$OLD" "$APP"; fi
  fi
fi
hdiutil detach "$MNT" -quiet || hdiutil detach "$MNT" -force -quiet
rmdir "$MNT" 2>/dev/null
rm -rf "$NEW"
if [ "$OK" = 1 ]; then
  xattr -dr com.apple.quarantine "$APP" 2>/dev/null
  rm -f "$DMG"
  log "installed OK"
else
  log "install FAILED — kept current version"
fi
[ "$RELAUNCH" = 1 ] && open "$APP"
exit 0
`, { mode: 0o755 });

  const logFd = fs.openSync(log, 'a');
  const child = spawn('/bin/bash', [script, String(process.pid), dmgPath, bundle, relaunch ? '1' : '0'], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();
}
