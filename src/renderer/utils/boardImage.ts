/**
 * 게시판 사진 준비. Firebase Storage를 쓰지 않아 사진 한 장을 Firestore 문서 하나에 넣는다.
 * 문서 크기 제한(1MiB) 안으로 들어올 때까지 줄인다. 표의 글자를 읽어야 하므로 크기보다 화질부터 낮춘다.
 */

export const BOARD_IMAGE_MAX_BYTES = 950_000;
/** 글 하나에 올리는 사진 수 */
export const BOARD_MAX_IMAGES = 20;

const LONG_SIDES = [2400, 2000, 1600, 1280, 1024];
const QUALITIES = [0.85, 0.7];

export interface PreparedBoardImage {
  blob: Blob;
  width: number;
  height: number;
}

/** 화면에 그대로 보여 줄 수 있는 까닭을 담는다 */
export class BoardImageError extends Error {}

export function isImageFile(file: { type?: string; name?: string }): boolean {
  if (file.type?.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|bmp|gif|heic|heif)$/i.test(file.name ?? '');
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
}

export async function prepareBoardImage(file: Blob & { name?: string }): Promise<PreparedBoardImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (/\.(heic|heif)$/i.test(file.name ?? '') || /heic|heif/i.test(file.type)) {
      throw new BoardImageError('아이폰 HEIC 사진은 읽지 못합니다. 화면을 캡처해 붙여 넣어 주세요.');
    }
    throw new BoardImageError('사진으로 읽지 못했습니다.');
  }
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    for (const side of LONG_SIDES) {
      const scale = Math.min(1, side / longest);
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new BoardImageError('사진을 처리하지 못했습니다.');
      // 투명한 캡처가 어두운 화면에서 까맣게 보이지 않게 흰 바탕을 깐다
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      for (const quality of QUALITIES) {
        const blob = await encode(canvas, quality);
        if (blob && blob.size <= BOARD_IMAGE_MAX_BYTES) return { blob, width, height };
      }
    }
  } finally {
    bitmap.close();
  }
  throw new BoardImageError('사진이 너무 커서 올리지 못했습니다.');
}

/** 저장용: 어느 프로그램에서나 열리도록 PNG로 바꾼다 */
export async function imageUrlToPng(url: string): Promise<Blob> {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob());
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('png');
    return blob;
  } finally {
    bitmap.close();
  }
}
