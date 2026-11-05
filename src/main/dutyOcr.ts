import { nativeImage } from 'electron';
import * as path from 'path';

/**
 * 시험감독 표 사진의 글자를 이 PC 안에서 읽는다. 글자 데이터가 앱에 들어 있어 네트워크를 쓰지 않는다.
 * 표는 글자가 칸마다 흩어져 있어 희소 글자 모드(11)가 잘 맞는다. 기본 모드는 표에서 거의 읽지 못한다.
 * 무거운 작업이라 쓸 때만 불러오고 한동안 안 쓰면 내린다.
 */

export interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  confidence: number;
}

export interface OcrResult {
  ok: boolean;
  words?: OcrWord[];
  reason?: string;
}

const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
/** 시험해 보니 이 폭일 때 고사실 번호와 이름을 함께 가장 잘 읽었다 */
const TARGET_WIDTH = 2000;
const MAX_UPSCALE = 3;
const MAX_WIDTH = 3600;
const MIN_CONFIDENCE = 20;
const IDLE_MS = 2 * 60 * 1000;
const TIMEOUT_MS = 2 * 60 * 1000;

let workerPromise: Promise<any> | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let queue: Promise<unknown> = Promise.resolve();

function loadWorker(): Promise<any> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = require('tesseract.js');
      const dataRoot = path.dirname(require.resolve('@tesseract.js-data/kor/package.json'));
      const worker = await createWorker(['kor'], 1, {
        langPath: path.join(dataRoot, '4.0.0_best_int'),
        gzip: true,
        cacheMethod: 'none',
        logger: () => {},
        errorHandler: (e: unknown) => console.warn('[DutyOcr] 작업기 오류:', e),
      });
      await worker.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1', user_defined_dpi: '300' });
      return worker;
    })();
    workerPromise.catch(() => { workerPromise = null; });
  }
  return workerPromise;
}

function scheduleUnload(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const current = workerPromise;
    workerPromise = null;
    current?.then((worker) => worker.terminate()).catch(() => {});
  }, IDLE_MS);
  idleTimer.unref?.();
}

function prepareImage(bytes: Buffer): Buffer | null {
  const image = nativeImage.createFromBuffer(bytes);
  if (image.isEmpty()) return null;
  const { width } = image.getSize();
  if (width > MAX_WIDTH) return image.resize({ width: MAX_WIDTH, quality: 'best' }).toPNG();
  if (width >= TARGET_WIDTH) return image.toPNG();
  return image.resize({ width: Math.round(width * Math.min(MAX_UPSCALE, TARGET_WIDTH / width)), quality: 'best' }).toPNG();
}

async function recognize(png: Buffer): Promise<OcrWord[]> {
  const worker = await loadWorker();
  const { data } = await worker.recognize(png, {}, { blocks: true });
  const words: OcrWord[] = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) {
          if (word.confidence < MIN_CONFIDENCE) continue;
          words.push({ text: word.text, ...word.bbox, confidence: word.confidence });
        }
      }
    }
  }
  return words;
}

export async function readImageWords(input: Uint8Array): Promise<OcrResult> {
  if (!(input instanceof Uint8Array) || input.length === 0) return { ok: false, reason: 'empty' };
  if (input.length > MAX_IMAGE_BYTES) return { ok: false, reason: 'too-large' };
  const png = prepareImage(Buffer.from(input));
  if (!png) return { ok: false, reason: 'unsupported-image' };
  // 작업기는 한 번에 한 장만 읽는다
  const job = queue.then(() => Promise.race([
    recognize(png),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
  ]));
  queue = job.catch(() => {});
  try {
    const words = await job;
    return { ok: true, words };
  } catch (e: any) {
    console.warn('[DutyOcr] 읽기 실패:', e?.message);
    return { ok: false, reason: e?.message === 'timeout' ? 'timeout' : 'failed' };
  } finally {
    scheduleUnload();
  }
}
