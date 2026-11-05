/**
 * 시험감독 표 파일을 글로 읽는다. 모든 처리는 이 PC 안에서 하고 파일은 저장하지 않는다.
 * 읽은 글은 칸을 탭으로 나눈 표이며 dutyTableParser가 이어 받는다.
 * 라이브러리가 크므로 파일을 올릴 때만 불러온다.
 */
import { dropOverlaps, repairOcrTable, tableFromBoxes, type TextBox } from './tableFromBoxes';

export interface DutyFileResult {
  text: string;
  /** 사진 글자 인식으로 읽어 틀릴 수 있다 */
  fromOcr: boolean;
}

/** 읽지 못한 까닭을 담당자에게 그대로 보여 준다 */
export class DutyFileError extends Error {}

const SHEET_RE = /\.(xlsx|xlsm|xlsb|xls|ods|csv|tsv|html?)$/i;
const IMAGE_RE = /\.(png|jpe?g|webp|bmp|gif)$/i;
const HEIC_RE = /\.(heic|heif)$/i;
const TEXT_RE = /\.(txt|text)$/i;
const MAX_FILE_BYTES = 60 * 1024 * 1024;
/** 병합 칸이 표 폭의 이 비율을 넘으면 제목으로 보고 채우지 않는다 */
const TITLE_SPAN_RATIO = 0.6;
const PDF_RENDER_SCALE = 2.5;
const MIN_PDF_TEXT = 12;
const DATE_NAME_RE = /\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}[./]\d{1,2}/;
/** 시트에서 읽는 줄과 칸의 한계. 감독표는 이보다 훨씬 작다. 표 밖 먼 칸에 값이 하나 있어도 멈추지 않게 한다 */
const MAX_SHEET_ROWS = 5000;
const MAX_SHEET_COLS = 300;
const HTML_HEAD_RE = /^\s*<(?:!doctype\s+html|html|head|meta|body|table)\b/i;

export const DUTY_FILE_ACCEPT = '.xlsx,.xlsm,.xlsb,.xls,.ods,.csv,.tsv,.txt,.html,.htm,.hwp,.hwpx,.docx,.pdf,.png,.jpg,.jpeg,.webp,.bmp,.gif';

export interface GridCell {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  text: string;
}

function cleanCell(text: string): string {
  return text.replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 칸 목록을 표로 만든다. 병합된 칸은 묶인 모든 칸에 같은 값을 넣는다 (제목처럼 넓은 칸은 첫 칸에만) */
export function gridToText(cells: GridCell[]): string {
  if (cells.length === 0) return '';
  let rows = 0;
  let cols = 0;
  for (const c of cells) {
    rows = Math.max(rows, c.row + c.rowSpan);
    cols = Math.max(cols, c.col + c.colSpan);
  }
  const grid = Array.from({ length: rows }, () => new Array<string>(cols).fill(''));
  for (const cell of cells) {
    const text = cleanCell(cell.text);
    if (!text) continue;
    const wide = cell.colSpan > 1 && cell.rowSpan === 1 && cell.colSpan / cols > TITLE_SPAN_RATIO;
    for (let r = cell.row; r < cell.row + cell.rowSpan; r++) {
      for (let c = cell.col; c < cell.col + cell.colSpan; c++) {
        if (wide && (r !== cell.row || c !== cell.col)) continue;
        grid[r][c] = text;
      }
    }
  }
  return grid.map((row) => row.join('\t').replace(/\t+$/, '')).filter((line) => line.trim()).join('\n');
}

// ─── 엑셀 ───

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function sheetCellText(cell: any): string {
  if (!cell || cell.v === undefined || cell.v === null) return '';
  if (cell.t === 'd' && cell.v instanceof Date) {
    const date: Date = cell.v;
    if (date.getUTCFullYear() < 1905) return `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
  }
  return String(cell.w ?? cell.v);
}

function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('euc-kr').decode(bytes);
  }
}

/**
 * 값이 있는 칸의 범위를 구한다. 시트의 사용 범위는 서식 때문에 끝까지(A1:XFD1048576) 잡혀 있을 수 있어 그대로 돌면 앱이 멈춘다.
 * 표 왼쪽의 빈 열은 표 모양의 일부이므로 남긴다.
 */
function valueRange(sheet: any, utils: typeof import('xlsx').utils) {
  let top = Infinity;
  let left = Infinity;
  let bottom = -1;
  let right = -1;
  for (const key of Object.keys(sheet)) {
    if (key[0] === '!' || !sheetCellText(sheet[key]).trim()) continue;
    const { r, c } = utils.decode_cell(key);
    top = Math.min(top, r);
    left = Math.min(left, c);
    bottom = Math.max(bottom, r);
    right = Math.max(right, c);
  }
  if (bottom < 0) return null;
  const s = { r: top, c: Math.min(left, utils.decode_range(sheet['!ref']).s.c) };
  return { s, e: { r: Math.min(bottom, s.r + MAX_SHEET_ROWS - 1), c: Math.min(right, s.c + MAX_SHEET_COLS - 1) } };
}

/** 웹 표로 저장한 파일인가. 확장자가 xls여도 속은 웹 표인 파일이 있다 */
function isHtmlFile(bytes: Uint8Array, name: string): boolean {
  if (/\.html?$/i.test(name)) return true;
  // 글자 인코딩을 모르므로 앞쪽의 영문 태그만 본다. 맨 앞의 UTF-8 표시는 뗀다
  return HTML_HEAD_RE.test(new TextDecoder('latin1').decode(bytes.subarray(0, 512)).replace(/^\xEF\xBB\xBF/, ''));
}

async function readSheetFile(bytes: Uint8Array, name: string): Promise<string> {
  // 엑셀 라이브러리는 웹 표 칸 안의 문단을 붙여 읽으므로 붙여 넣은 표처럼 읽는다
  if (isHtmlFile(bytes, name)) {
    const table = tableHtmlToText(decodeText(bytes));
    if (table) return table;
  }
  const XLSX = await import('xlsx');
  const options = { cellDates: true, cellText: true, cellNF: false } as const;
  let workbook;
  if (/\.(csv|tsv)$/i.test(name)) {
    // raw를 주지 않으면 "1-1" 같은 고사실 번호를 날짜로 바꾼다
    workbook = XLSX.read(decodeText(bytes), { ...options, type: 'string', raw: true });
  } else {
    // 옛 엑셀 파일의 한글을 읽는 데 필요한 코드표
    XLSX.set_cptable(await import('xlsx/dist/cpexcel.full.mjs'));
    workbook = XLSX.read(bytes, { ...options, type: 'array', codepage: 949 });
  }
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const hidden = workbook.Workbook?.Sheets?.find((s: any) => s.name === sheetName)?.Hidden;
    const sheet: any = workbook.Sheets[sheetName];
    if (hidden || !sheet?.['!ref']) continue;
    const range = valueRange(sheet, XLSX.utils);
    if (!range) continue;
    const merges: any[] = sheet['!merges'] ?? [];
    const covered = new Set<string>();
    const cells: GridCell[] = [];
    for (const m of merges) {
      // 시트 끝까지 잡힌 병합도 있어 값이 있는 범위 안에서만 채운다
      const lastRow = Math.min(m.e.r, range.e.r);
      const lastCol = Math.min(m.e.c, range.e.c);
      for (let r = Math.max(m.s.r, range.s.r); r <= lastRow; r++) {
        for (let c = Math.max(m.s.c, range.s.c); c <= lastCol; c++) covered.add(`${r}:${c}`);
      }
      const text = sheetCellText(sheet[XLSX.utils.encode_cell(m.s)]);
      if (!text.trim() || m.s.r > lastRow || m.s.c > lastCol) continue;
      cells.push({
        row: m.s.r - range.s.r,
        col: m.s.c - range.s.c,
        rowSpan: lastRow - m.s.r + 1,
        colSpan: lastCol - m.s.c + 1,
        text,
      });
    }
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        if (covered.has(`${r}:${c}`)) continue;
        const text = sheetCellText(sheet[XLSX.utils.encode_cell({ r, c })]);
        if (text) cells.push({ row: r - range.s.r, col: c - range.s.c, rowSpan: 1, colSpan: 1, text });
      }
    }
    const table = gridToText(cells);
    if (!table) continue;
    // 날짜별 시트면 시트 이름이 그날의 날짜다
    parts.push(DATE_NAME_RE.test(sheetName) ? `${sheetName}\n${table}` : table);
  }
  return parts.join('\n\n');
}

// ─── 붙여 넣은 표 (엑셀, 한글, 워드, 웹) ───

/** 칸 안에서 줄을 바꾸는 태그 */
const HTML_LINE_TAG_RE = /^(br|hr|p|div|li|ul|ol|table|tr|td|th|h[1-6]|pre|blockquote)$/;

/** 칸의 글을 잇는다. 줄이 바뀌는 자리는 띄우고, 글자 꾸밈(span)은 그대로 잇는다 */
function htmlCellText(el: Element): string {
  let out = '';
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const text = htmlCellText(node as Element);
      out += HTML_LINE_TAG_RE.test((node as Element).localName) ? ` ${text} ` : text;
    }
  });
  return out;
}

function tableElementToText(table: Element): string {
  const cells: GridCell[] = [];
  const taken = new Set<string>();
  const rows = table.querySelectorAll('tr');
  rows.forEach((tr, row) => {
    let col = 0;
    tr.querySelectorAll(':scope > td, :scope > th').forEach((td) => {
      while (taken.has(`${row}:${col}`)) col += 1;
      // 병합 수가 터무니없이 커도 멈추지 않게 표 안으로 줄인다
      const rowSpan = Math.min(rows.length - row, Math.max(1, Number(td.getAttribute('rowspan')) || 1));
      const colSpan = Math.min(MAX_SHEET_COLS, Math.max(1, Number(td.getAttribute('colspan')) || 1));
      for (let r = row; r < row + rowSpan; r++) for (let c = col; c < col + colSpan; c++) taken.add(`${r}:${c}`);
      cells.push({ row, col, rowSpan, colSpan, text: htmlCellText(td) });
      col += colSpan;
    });
  });
  return gridToText(cells);
}

/** 클립보드의 HTML에 표가 있으면 병합을 풀어 글로 만든다 */
export function tableHtmlToText(html: string): string | null {
  if (!/<table[\s>]/i.test(html)) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tables = [...doc.querySelectorAll('table')].filter((t) => !t.parentElement?.closest('table'));
  const text = tables.map(tableElementToText).filter(Boolean).join('\n\n');
  return text || null;
}

// ─── 압축된 문서 (hwpx, docx) ───

function localName(el: Element): string {
  return el.localName || el.nodeName.split(':').pop() || '';
}

function directChildren(el: Element, name: string): Element[] {
  return [...el.children].filter((child) => localName(child) === name);
}

function descendants(el: Element, name: string): Element[] {
  return [...el.getElementsByTagName('*')].filter((child) => localName(child) === name);
}

/** 글자 대신 칸을 띄우는 표시. hwpx는 글 안에, docx는 글 옆에 놓인다 */
const WORD_SPACE_TAGS = new Set(['br', 'cr', 'tab', 'lineBreak', 'nbSpace', 'fwSpace']);

/**
 * 글을 잇는다. 한 문단의 글 조각은 그대로 잇고, 문단과 줄바꿈 자리는 띄운다.
 * 띄우지 않으면 한 칸에 두 줄로 적은 "김철수", "이영희"가 한 덩어리가 되어 이름으로 읽지 못한다.
 */
function wordText(el: Element): string {
  const name = localName(el);
  if (WORD_SPACE_TAGS.has(name)) return ' ';
  let out = '';
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) out += wordText(node as Element);
    else if (name === 't' && (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE)) out += node.nodeValue ?? '';
  });
  return name === 'p' ? `${out} ` : out;
}

/** hwpx의 표. 칸마다 주소와 병합 수가 적혀 있다 */
function hwpxTable(table: Element): string {
  const cells: GridCell[] = [];
  directChildren(table, 'tr').forEach((tr, trIndex) => {
    directChildren(tr, 'tc').forEach((tc, tcIndex) => {
      const addr = directChildren(tc, 'cellAddr')[0];
      const span = directChildren(tc, 'cellSpan')[0];
      cells.push({
        row: Number(addr?.getAttribute('rowAddr') ?? trIndex),
        col: Number(addr?.getAttribute('colAddr') ?? tcIndex),
        rowSpan: Math.max(1, Number(span?.getAttribute('rowSpan')) || 1),
        colSpan: Math.max(1, Number(span?.getAttribute('colSpan')) || 1),
        text: wordText(tc),
      });
    });
  });
  return gridToText(cells);
}

/** docx의 표. 가로 병합은 gridSpan, 세로 병합은 vMerge로 적는다 */
function docxTable(table: Element): string {
  const cells: GridCell[] = [];
  const open = new Map<number, GridCell>();
  directChildren(table, 'tr').forEach((tr, row) => {
    let col = 0;
    directChildren(tr, 'tc').forEach((tc) => {
      const props = directChildren(tc, 'tcPr')[0];
      const gridSpan = props ? directChildren(props, 'gridSpan')[0] : undefined;
      const vMerge = props ? directChildren(props, 'vMerge')[0] : undefined;
      const colSpan = Math.max(1, Number(gridSpan?.getAttribute('w:val') ?? gridSpan?.getAttribute('val')) || 1);
      const mergeValue = vMerge?.getAttribute('w:val') ?? vMerge?.getAttribute('val');
      if (vMerge && mergeValue !== 'restart' && open.has(col)) {
        open.get(col)!.rowSpan += 1;
      } else {
        const cell: GridCell = { row, col, rowSpan: 1, colSpan, text: wordText(tc) };
        cells.push(cell);
        if (vMerge) open.set(col, cell);
        else open.delete(col);
      }
      col += colSpan;
    });
  });
  return gridToText(cells);
}

function walkDocument(root: Element, tableName: string, toText: (table: Element) => string): string {
  const parts: string[] = [];
  const visit = (el: Element) => {
    if (localName(el) === tableName) {
      const text = toText(el);
      if (text) parts.push(text);
      return;
    }
    if (localName(el) === 'p' && descendants(el, tableName).length === 0) {
      const text = cleanCell(wordText(el));
      if (text) parts.push(text);
      return;
    }
    [...el.children].forEach(visit);
  };
  visit(root);
  return parts.join('\n');
}

async function readZippedDocument(bytes: Uint8Array, name: string): Promise<string> {
  const { unzipSync, strFromU8 } = await import('fflate');
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new DutyFileError('파일이 손상되었거나 암호가 걸려 있어 열지 못했습니다.');
  }
  const parse = (data: Uint8Array) => new DOMParser().parseFromString(strFromU8(data), 'application/xml').documentElement;
  if (/\.docx$/i.test(name)) {
    const main = files['word/document.xml'];
    if (!main) throw new DutyFileError('워드 문서의 내용을 찾지 못했습니다.');
    return walkDocument(parse(main), 'tbl', docxTable);
  }
  const sections = Object.keys(files)
    .filter((key) => /^Contents\/section\d+\.xml$/i.test(key))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  if (sections.length === 0) throw new DutyFileError('한글 문서의 내용을 찾지 못했습니다.');
  return sections.map((key) => walkDocument(parse(files[key]), 'tbl', hwpxTable)).filter(Boolean).join('\n');
}

// ─── 한글 (hwp) ───

const HWP_TAG_PARA_TEXT = 67;
const HWP_TAG_LIST_HEADER = 72;
const HWP_TAG_TABLE = 77;
/** 글자가 아닌 조절 문자. 16바이트를 차지한다 */
const HWP_LONG_CONTROLS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);

function hwpParaText(data: Uint8Array): string {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let out = '';
  for (let i = 0; i + 1 < data.length;) {
    const code = view.getUint16(i, true);
    if (code < 32) {
      if (code === 10 || code === 13) out += ' ';
      i += HWP_LONG_CONTROLS.has(code) ? 16 : 2;
    } else {
      out += String.fromCharCode(code);
      i += 2;
    }
  }
  return out;
}

interface HwpTable {
  level: number;
  cells: GridCell[];
  current: GridCell | null;
}

/** 한글 본문 레코드에서 표와 문단을 문서 순서대로 뽑는다 */
export function hwpSectionToText(data: Uint8Array): string {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const parts: string[] = [];
  const stack: HwpTable[] = [];
  const closeTables = (level: number) => {
    while (stack.length > 0 && level < stack[stack.length - 1].level) {
      const table = stack.pop()!;
      const text = gridToText(table.cells);
      const parent = stack[stack.length - 1];
      if (parent?.current) parent.current.text += ` ${text.replace(/\s+/g, ' ')}`;
      else if (text) parts.push(text);
    }
  };
  let offset = 0;
  while (offset + 4 <= data.length) {
    const head = view.getUint32(offset, true);
    offset += 4;
    const tag = head & 0x3ff;
    const level = (head >>> 10) & 0x3ff;
    let size = head >>> 20;
    if (size === 0xfff) {
      if (offset + 4 > data.length) break;
      size = view.getUint32(offset, true);
      offset += 4;
    }
    if (offset + size > data.length) break;
    const body = data.subarray(offset, offset + size);
    offset += size;
    closeTables(level);
    if (tag === HWP_TAG_TABLE) {
      stack.push({ level, cells: [], current: null });
    } else if (tag === HWP_TAG_LIST_HEADER) {
      const table = stack[stack.length - 1];
      if (table && level === table.level && body.length >= 16) {
        const fields = new DataView(body.buffer, body.byteOffset, body.byteLength);
        const cell: GridCell = {
          col: fields.getUint16(8, true),
          row: fields.getUint16(10, true),
          colSpan: Math.max(1, fields.getUint16(12, true)),
          rowSpan: Math.max(1, fields.getUint16(14, true)),
          text: '',
        };
        table.cells.push(cell);
        table.current = cell;
      }
    } else if (tag === HWP_TAG_PARA_TEXT) {
      const text = hwpParaText(body);
      const table = stack[stack.length - 1];
      if (table?.current) table.current.text += text;
      else if (!table && text.trim()) parts.push(cleanCell(text));
    }
  }
  closeTables(-1);
  return parts.join('\n');
}

export async function readHwpFile(bytes: Uint8Array): Promise<string> {
  const [{ CFB }, { inflateSync }] = await Promise.all([import('xlsx'), import('fflate')]);
  let container: any;
  try {
    container = CFB.read(bytes, { type: 'array' });
  } catch {
    throw new DutyFileError('한글 파일을 열지 못했습니다. 다른 이름으로 저장해 다시 올려 주세요.');
  }
  const header = CFB.find(container, '/FileHeader');
  if (!header?.content) throw new DutyFileError('한글 파일을 열지 못했습니다. 다른 이름으로 저장해 다시 올려 주세요.');
  const headerBytes = Uint8Array.from(header.content as ArrayLike<number>);
  const props = new DataView(headerBytes.buffer).getUint32(36, true);
  if (props & 2) throw new DutyFileError('암호가 걸린 한글 파일입니다. 암호를 풀어 저장한 뒤 다시 올려 주세요.');
  if (props & 4) throw new DutyFileError('배포용 한글 파일은 읽을 수 없습니다. 일반 문서로 저장한 뒤 다시 올려 주세요.');
  const compressed = (props & 1) !== 0;
  const parts: string[] = [];
  for (let index = 0; index < 256; index++) {
    const section = CFB.find(container, `/BodyText/Section${index}`);
    if (!section?.content) break;
    const raw = Uint8Array.from(section.content as ArrayLike<number>);
    const text = hwpSectionToText(compressed ? inflateSync(raw) : raw);
    if (text) parts.push(text);
  }
  return parts.join('\n');
}

// ─── PDF ───

async function readImageBytes(bytes: Uint8Array): Promise<string> {
  const api = window.electronAPI;
  if (!api?.dutyOcr) throw new DutyFileError('이 버전에서는 사진을 읽을 수 없습니다.');
  const result = await api.dutyOcr(bytes);
  if (!result.ok) {
    if (result.reason === 'unsupported-image') throw new DutyFileError('이 사진 형식은 읽지 못합니다. JPG나 PNG로 저장해 다시 올려 주세요.');
    if (result.reason === 'too-large') throw new DutyFileError('사진이 너무 큽니다. 크기를 줄여 다시 올려 주세요.');
    throw new DutyFileError('사진의 글자를 읽지 못했습니다. 다시 시도하거나 표를 직접 붙여 넣어 주세요.');
  }
  const boxes: TextBox[] = dropOverlaps(result.words ?? []);
  return repairOcrTable(tableFromBoxes(boxes));
}

async function readPdfFile(bytes: Uint8Array): Promise<DutyFileResult> {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  let doc: any;
  try {
    doc = await pdfjs.getDocument({ data: bytes }).promise;
  } catch (e: any) {
    if (e?.name === 'PasswordException') throw new DutyFileError('암호가 걸린 PDF입니다. 암호를 풀어 저장한 뒤 다시 올려 주세요.');
    throw new DutyFileError('PDF를 열지 못했습니다.');
  }
  const parts: string[] = [];
  let fromOcr = false;
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const boxes: TextBox[] = content.items
      .filter((item: any) => item.str?.trim())
      .map((item: any) => {
        const y = viewport.height - item.transform[5];
        const height = item.height || Math.abs(item.transform[3]);
        return { text: item.str, x0: item.transform[4], x1: item.transform[4] + item.width, y0: y - height, y1: y };
      });
    if (boxes.map((box) => box.text).join('').length >= MIN_PDF_TEXT) {
      parts.push(tableFromBoxes(boxes));
      continue;
    }
    // 글자가 없으면 스캔한 PDF다. 그림으로 그려 사진처럼 읽는다
    const scaled = page.getViewport({ scale: PDF_RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(scaled.width);
    canvas.height = Math.ceil(scaled.height);
    await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: scaled }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) {
      parts.push(await readImageBytes(new Uint8Array(await blob.arrayBuffer())));
      fromOcr = true;
    }
  }
  doc.destroy?.();
  return { text: parts.filter(Boolean).join('\n\n'), fromOcr };
}

export function isImageFile(file: File): boolean {
  return IMAGE_RE.test(file.name) || file.type.startsWith('image/');
}

export function isSlowFile(file: File): boolean {
  return isImageFile(file) || /\.pdf$/i.test(file.name);
}

export async function readDutyFile(file: File): Promise<DutyFileResult> {
  const name = file.name;
  if (file.size === 0) throw new DutyFileError('빈 파일입니다.');
  if (file.size > MAX_FILE_BYTES) throw new DutyFileError('파일이 너무 큽니다. 표가 있는 부분만 올려 주세요.');
  if (HEIC_RE.test(name)) throw new DutyFileError('아이폰 사진(HEIC)은 읽지 못합니다. JPG로 바꾸거나 화면을 캡처해 올려 주세요.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (isImageFile(file)) return { text: await readImageBytes(bytes), fromOcr: true };
  if (/\.pdf$/i.test(name)) return readPdfFile(bytes);
  if (/\.hwpx$/i.test(name) || /\.docx$/i.test(name)) return { text: await readZippedDocument(bytes, name), fromOcr: false };
  if (/\.hwp$/i.test(name)) return { text: await readHwpFile(bytes), fromOcr: false };
  if (TEXT_RE.test(name)) return { text: decodeText(bytes), fromOcr: false };
  if (SHEET_RE.test(name)) {
    try {
      return { text: await readSheetFile(bytes, name), fromOcr: false };
    } catch (e: any) {
      if (/password|encrypted/i.test(String(e?.message))) throw new DutyFileError('암호가 걸린 파일입니다. 암호를 풀어 저장한 뒤 다시 올려 주세요.');
      throw new DutyFileError('엑셀 파일을 열지 못했습니다. 다른 이름으로 저장해 다시 올려 주세요.');
    }
  }
  throw new DutyFileError('이 형식은 읽지 못합니다. 엑셀, 한글, 워드, PDF, 사진을 올려 주세요.');
}
