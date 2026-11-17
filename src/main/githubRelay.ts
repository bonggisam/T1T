/**
 * 업데이트 연결 중계기.
 *
 * 어떤 망에서는 GitHub 파일 서버 주소 네 개 중 하나가 TCP 연결은 받아 주고 데이터는 보내지 않는다
 * (2026-11-16 학교망에서 185.199.110.133). Chromium은 TCP가 붙으면 다른 주소로 넘어가지 않고 30초 뒤
 * ERR_TIMED_OUT으로 끝낸다. 그 주소가 DNS 답의 맨 앞에 오는 동안(Windows는 최대 한 시간 기억한다)
 * 업데이트 확인과 다운로드가 모두 실패했다.
 *
 * electron-updater의 세션만 이 중계기를 HTTP 프록시로 쓰게 한다. 중계기는 대상 이름을 직접 풀어 주소를
 * 차례로 시도하고, 서버의 첫 응답이 정해 둔 시간 안에 오지 않으면 그 주소를 버리고 다음 주소로 다시 붙는다.
 * 그때까지 받은 클라이언트 바이트(TLS 첫 인사)를 그대로 다시 보내므로 암호화 연결은 끝과 끝이 그대로다.
 * 마지막 주소는 시간 제한 없이 기다려 직접 연결보다 나빠지지 않는다.
 */
import * as http from 'http';
import * as net from 'net';
import * as dns from 'dns';

export interface RelayOptions {
  /** 서버의 첫 응답을 기다리는 시간. 넘으면 다음 주소로 넘어간다 */
  firstByteMs: number;
  /** 주소를 건너뛸 때 남기는 기록 */
  log: (message: string) => void;
}

export interface RelayHandle {
  port: number;
  close: () => void;
}

/** CONNECT 대상 "host:port"를 나눈다. 443만 허용한다 */
function parseTarget(url: string | undefined): { host: string; port: number } | null {
  const match = /^([a-z0-9.-]+):(\d+)$/i.exec(url ?? '');
  if (!match) return null;
  const port = Number(match[2]);
  return port === 443 ? { host: match[1].toLowerCase(), port } : null;
}

function relayConnect(req: http.IncomingMessage, client: net.Socket, head: Buffer, opts: RelayOptions): void {
  const target = parseTarget(req.url);
  if (!target) {
    client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    return;
  }
  client.setNoDelay(true);
  // 서버 첫 응답 전까지 받은 클라이언트 바이트. 주소를 바꾸면 처음부터 다시 보낸다
  const pending: Buffer[] = head && head.length > 0 ? [head] : [];
  let upstream: net.Socket | null = null;
  let established = false;
  let closed = false;
  let timer: NodeJS.Timeout | null = null;

  const closeAll = () => {
    if (closed) return;
    closed = true;
    if (timer) clearTimeout(timer);
    upstream?.destroy();
    client.destroy();
  };

  client.on('data', (chunk: Buffer) => {
    if (established) {
      upstream?.write(chunk);
      return;
    }
    pending.push(chunk);
    if (upstream && !upstream.connecting) upstream.write(chunk);
  });
  client.on('end', () => upstream?.end());
  client.on('error', closeAll);
  client.on('close', closeAll);
  client.write('HTTP/1.1 200 Connection Established\r\n\r\n');

  dns.lookup(target.host, { all: true }, (err, addresses) => {
    if (closed) return;
    if (err || addresses.length === 0) {
      opts.log(`${target.host} 주소를 찾지 못했습니다 (${err?.code ?? '빈 답'})`);
      closeAll();
      return;
    }
    let index = 0;
    const tryNext = () => {
      if (closed) return;
      if (index >= addresses.length) {
        opts.log(`${target.host}의 주소 ${addresses.length}개가 모두 답하지 않습니다`);
        closeAll();
        return;
      }
      const { address, family } = addresses[index];
      index += 1;
      const isLast = index >= addresses.length;
      const sock = net.connect({ host: address, port: target.port, family });
      upstream = sock;
      sock.setNoDelay(true);
      const giveUp = (reason: string) => {
        if (timer) clearTimeout(timer);
        timer = null;
        sock.removeAllListeners();
        sock.on('error', () => {});
        sock.destroy();
        opts.log(`${target.host} ${address}: ${reason}. 다음 주소로 넘어갑니다`);
        tryNext();
      };
      // 마지막 주소는 시간 제한 없이 기다린다 (Chromium 자체 제한이 끊는다)
      timer = isLast ? null : setTimeout(() => giveUp(`${opts.firstByteMs / 1000}초 동안 응답 없음`), opts.firstByteMs);
      sock.on('connect', () => {
        for (const chunk of pending) sock.write(chunk);
      });
      sock.once('data', (first: Buffer) => {
        if (timer) clearTimeout(timer);
        timer = null;
        established = true;
        pending.length = 0;
        client.write(first);
        sock.pipe(client);
      });
      sock.on('error', (e: NodeJS.ErrnoException) => {
        if (established || isLast) {
          closeAll();
          return;
        }
        giveUp(e.code ?? '연결 오류');
      });
      sock.on('close', () => {
        if (established) closeAll();
      });
    };
    tryNext();
  });
}

/** 127.0.0.1의 빈 포트에 중계기를 띄운다 */
export function startGithubRelay(opts: RelayOptions): Promise<RelayHandle> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(405);
      res.end();
    });
    server.on('connect', (req: http.IncomingMessage, client: net.Socket, head: Buffer) => {
      relayConnect(req, client, head, opts);
    });
    server.on('clientError', (_err, socket) => socket.destroy());
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('중계기 포트를 얻지 못했습니다'));
        return;
      }
      resolve({ port: address.port, close: () => server.close() });
    });
  });
}
