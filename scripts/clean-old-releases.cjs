#!/usr/bin/env node
/**
 * release/ 폴더에서 현재 버전이 아닌 옛 아티팩트를 삭제.
 *
 * 목적: gh release create에 glob으로 업로드할 때 옛 버전 파일이 섞여
 *       stale upload 또는 부분 업로드를 유발하는 문제를 방지.
 *
 * 보존 조건:
 *   - 파일명에 현재 package.json version이 포함된 것
 *   - latest*.yml (electron-updater 메타데이터)
 *   - blockmap 파일은 같은 이름의 dmg/exe와 함께 보존
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RELEASE_DIR = path.join(ROOT, 'release');
const pkg = require(path.join(ROOT, 'package.json'));
const CURRENT_VERSION = pkg.version;

if (!fs.existsSync(RELEASE_DIR)) {
  console.log(`[clean:release] ${RELEASE_DIR} 없음 — 건너뜀`);
  process.exit(0);
}

const files = fs.readdirSync(RELEASE_DIR);
let removed = 0;
let kept = 0;

for (const f of files) {
  const fullPath = path.join(RELEASE_DIR, f);
  const stat = fs.statSync(fullPath);
  if (!stat.isFile()) continue;

  // 보존: 현재 버전을 포함한 파일
  if (f.includes(CURRENT_VERSION)) {
    kept++;
    continue;
  }
  // 보존: latest*.yml (electron-updater 메타)
  if (/^latest.*\.yml$/.test(f)) {
    kept++;
    continue;
  }
  // 삭제 대상: 옛 버전 .dmg/.exe/.zip/.blockmap
  if (/\.(dmg|exe|zip|blockmap)$/i.test(f)) {
    try {
      fs.unlinkSync(fullPath);
      removed++;
      console.log(`  ✗ 삭제: ${f}`);
    } catch (e) {
      console.warn(`  ⚠ 삭제 실패 ${f}: ${e.message}`);
    }
  }
}

console.log(`[clean:release] 현재 v${CURRENT_VERSION} — 보존 ${kept}개, 삭제 ${removed}개`);
