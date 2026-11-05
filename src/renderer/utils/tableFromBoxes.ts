/**
 * 사진 글자 인식이나 PDF에서 받은 "글자와 위치"로 표를 되살려 탭으로 나눈 글로 만든다.
 *
 * 병합된 칸의 글자는 칸 가운데에 찍힌다. 그래서 세 줄을 묶은 날짜는 둘째 줄 높이에 있고, 두 줄을 묶은 날짜는
 * 어느 줄에도 맞지 않는다. 글자가 드문 왼쪽 열과 머리글은 가운데 위치로 묶인 범위를 거꾸로 계산해 모든 칸에 채운다.
 */

export interface TextBox {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Cell extends TextBox {
  xc: number;
  yc: number;
}

/** 표 선을 글자로 잘못 읽은 조각 */
const LINE_NOISE_RE = /^[|｜¦ㅣl_\-–—=~.,:;'"`[\]{}()!/\\·•]+$/;
/** 머리글에서 여러 칸을 묶을 수 있는 말 */
const SPAN_HEAD_RE = /\d{1,2}월\s*\d{1,2}일|\d{1,2}[./]\d{1,2}|20\d{2}[.\-/]|\d\s*학년|\([일월화수목금토]\)|일차/;
/** 표 머리글에 나오는 말 */
const HEAD_WORD_RE = /^(?:일자|날짜|교시|시간|고사실|시험실|성명|이름|구분|\d\s*-\s*\d{1,2}|\d{2,3}|\d\s*학년|\d{1,2}\s*반)$/;
const MAX_SKEW = 0.06;
/** 글자가 이보다 넓으면 제목이나 병합 칸이라 열을 찾을 때 뺀다 (보통 칸 폭의 배수) */
const WIDE_CELL_RATIO = 2.2;
/** 칸을 이만큼 채운 줄을 표의 본문으로 친다 */
const DENSE_ROW_RATIO = 0.6;
/** 이보다 드문 열은 여러 줄을 묶은 칸으로 본다 */
const SPARSE_COLUMN_RATIO = 0.7;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** 살짝 기운 사진을 바로 세운다. 가까운 글자끼리의 기울기 중앙값을 쓴다 */
function straighten(boxes: TextBox[], lineHeight: number): TextBox[] {
  const slopes: number[] = [];
  const sorted = [...boxes].sort((a, b) => a.x0 - b.x0);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && slopes.length < 4000; j++) {
      const a = sorted[i];
      const b = sorted[j];
      const dx = (b.x0 + b.x1 - a.x0 - a.x1) / 2;
      if (dx < lineHeight * 3) continue;
      const dy = (b.y0 + b.y1 - a.y0 - a.y1) / 2;
      if (Math.abs(dy) / dx <= MAX_SKEW) slopes.push(dy / dx);
    }
  }
  const slope = median(slopes);
  if (Math.abs(slope) < 0.002) return boxes;
  return boxes.map((box) => ({
    ...box,
    x0: box.x0 + slope * box.y0,
    x1: box.x1 + slope * box.y1,
    y0: box.y0 - slope * box.x0,
    y1: box.y1 - slope * box.x1,
  }));
}

/** 높이가 같은 글자를 한 줄로 묶는다 */
function groupRows(boxes: TextBox[], lineHeight: number): TextBox[][] {
  const sorted = [...boxes].sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const rows: Array<{ yc: number; items: TextBox[] }> = [];
  for (const box of sorted) {
    const yc = (box.y0 + box.y1) / 2;
    const row = rows[rows.length - 1];
    if (row && Math.abs(yc - row.yc) <= lineHeight * 0.45) {
      row.items.push(box);
      row.yc = (row.yc * (row.items.length - 1) + yc) / row.items.length;
    } else {
      rows.push({ yc, items: [box] });
    }
  }
  return rows.map((row) => row.items);
}

/** 가까운 글자를 한 칸으로 잇는다 */
function joinCells(items: TextBox[], lineHeight: number): Cell[] {
  const sorted = [...items].sort((a, b) => a.x0 - b.x0);
  const cells: Cell[] = [];
  for (const box of sorted) {
    const last = cells[cells.length - 1];
    const gap = last ? box.x0 - last.x1 : Infinity;
    if (last && gap < lineHeight * 0.9) {
      last.text += gap > lineHeight * 0.22 ? ` ${box.text}` : box.text;
      last.x1 = Math.max(last.x1, box.x1);
      last.y0 = Math.min(last.y0, box.y0);
      last.y1 = Math.max(last.y1, box.y1);
      last.xc = (last.x0 + last.x1) / 2;
      last.yc = (last.y0 + last.y1) / 2;
    } else {
      cells.push({ ...box, xc: (box.x0 + box.x1) / 2, yc: (box.y0 + box.y1) / 2 });
    }
  }
  return cells;
}

/** 칸들이 차지한 가로 범위를 겹쳐 열을 찾는다 */
function findColumns(rows: Cell[][]): Array<{ x0: number; x1: number }> {
  const widths = rows.flat().map((cell) => cell.x1 - cell.x0);
  const limit = median(widths) * WIDE_CELL_RATIO;
  const spans = rows
    .filter((row) => row.length >= 2)
    .flat()
    .filter((cell) => cell.x1 - cell.x0 <= limit)
    .map((cell) => ({ x0: cell.x0, x1: cell.x1 }))
    .sort((a, b) => a.x0 - b.x0);
  const columns: Array<{ x0: number; x1: number }> = [];
  for (const span of spans) {
    const last = columns[columns.length - 1];
    if (last && span.x0 <= last.x1) last.x1 = Math.max(last.x1, span.x1);
    else columns.push({ ...span });
  }
  return columns;
}

function columnOf(cell: Cell, columns: Array<{ x0: number; x1: number }>): number {
  let best = 0;
  let bestScore = -Infinity;
  columns.forEach((column, index) => {
    const overlap = Math.min(cell.x1, column.x1) - Math.max(cell.x0, column.x0);
    const center = (column.x0 + column.x1) / 2;
    const score = overlap > 0 ? overlap : -Math.abs(center - cell.xc);
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}

export function tableFromBoxes(input: TextBox[]): string {
  const boxes = input
    .map((box) => ({ ...box, text: box.text.trim() }))
    .filter((box) => box.text && !LINE_NOISE_RE.test(box.text));
  if (boxes.length === 0) return '';
  const lineHeight = median(boxes.map((box) => box.y1 - box.y0)) || 1;
  const rows = groupRows(straighten(boxes, lineHeight), lineHeight).map((items) => joinCells(items, lineHeight));
  const columns = findColumns(rows);
  if (columns.length < 2) {
    return rows.map((row) => row.map((cell) => cell.text).join('\t')).join('\n');
  }
  const width = columns.length;
  const grid: Array<Array<string>> = rows.map(() => new Array<string>(width).fill(''));
  const placed: Array<Array<Cell | null>> = rows.map(() => new Array<Cell | null>(width).fill(null));
  const titles = new Set<number>();
  const widest = median(rows.flat().map((cell) => cell.x1 - cell.x0)) * WIDE_CELL_RATIO * 2;
  rows.forEach((row, r) => {
    // 칸이 하나인 넓은 글은 제목이나 안내문이다
    if (row.length === 1 && row[0].x1 - row[0].x0 > widest) {
      titles.add(r);
      grid[r][0] = row[0].text;
      return;
    }
    for (const cell of row) {
      const col = columnOf(cell, columns);
      grid[r][col] = grid[r][col] ? `${grid[r][col]} ${cell.text}` : cell.text;
      placed[r][col] = cell;
    }
  });

  // 본문: 칸이 많이 찬 줄
  const filled = (r: number) => grid[r].filter(Boolean).length;
  const denseLimit = Math.max(2, Math.ceil(width * DENSE_ROW_RATIO));
  const dense = rows.map((_, r) => !titles.has(r) && filled(r) >= denseLimit);
  const denseRows = dense.flatMap((isDense, r) => (isDense ? [r] : []));
  // 맨 위의 머리글 줄은 병합 계산에서 뺀다
  const isHeadRow = (r: number) => {
    const cells = grid[r].filter(Boolean);
    return cells.filter((cell) => HEAD_WORD_RE.test(cell)).length >= Math.max(2, cells.length / 3);
  };
  const bodyRows = denseRows.length > 2 && isHeadRow(denseRows[0]) ? denseRows.slice(1) : denseRows;
  if (bodyRows.length >= 2) {
    const yOf = (r: number) => median(rows[r].map((cell) => cell.yc));
    // 왼쪽 열에서 글자가 드물면 여러 줄을 묶은 칸이다. 가운데 위치로 묶인 줄을 찾아 채운다.
    for (let col = 0; col < width; col++) {
      const present = bodyRows.filter((r) => grid[r][col]).length;
      if (present === 0 || present >= bodyRows.length * SPARSE_COLUMN_RATIO) continue;
      // 데이터 열의 빈칸과 헷갈리지 않도록 표 왼쪽에 있는 열만 본다
      if (col >= Math.max(2, width / 3)) continue;
      const first = bodyRows[0];
      const last = bodyRows[bodyRows.length - 1];
      const spans: Array<{ r: number; yc: number; text: string }> = [];
      for (let r = first; r <= last; r++) {
        if (!titles.has(r) && grid[r][col]) spans.push({ r, yc: placed[r][col]?.yc ?? yOf(r), text: grid[r][col] });
      }
      if (spans.length === 0) continue;
      const body = bodyRows.filter((r) => r >= first && r <= last);
      let at = 0;
      for (const span of spans) {
        if (at >= body.length) break;
        const start = at;
        let end = start;
        // 묶음의 가운데가 글자 높이에 가장 가까운 끝 줄을 찾는다
        let bestDiff = Infinity;
        for (let e = start; e < body.length; e++) {
          const diff = Math.abs((yOf(body[start]) + yOf(body[e])) / 2 - span.yc);
          if (diff < bestDiff) {
            bestDiff = diff;
            end = e;
          }
        }
        for (let e = start; e <= end; e++) grid[body[e]][col] = span.text;
        at = end + 1;
      }
    }
    // 본문 사이에 끼어 그 열 글자만 남은 줄은 위에서 나누어 채웠으므로 없앤다
    for (let r = bodyRows[0]; r <= bodyRows[bodyRows.length - 1]; r++) {
      if (!dense[r] && !titles.has(r)) grid[r] = [];
    }

    // 머리글: 날짜처럼 여러 칸을 묶는 말이 드문 줄은 가로로 같은 계산을 한다
    for (let r = 0; r < bodyRows[0]; r++) {
      if (titles.has(r)) continue;
      const cols = grid[r].flatMap((text, col) => (text ? [col] : []));
      if (cols.length < 1 || cols.length >= width) continue;
      const spanCols = cols.filter((col) => SPAN_HEAD_RE.test(grid[r][col]));
      if (spanCols.length === 0) continue;
      const centers = columns.map((column) => (column.x0 + column.x1) / 2);
      let at = spanCols[0];
      // 앞 칸(줄 머리)이 차지한 열 뒤부터 시작한다
      const before = cols.filter((col) => col < spanCols[0]);
      if (before.length > 0) at = Math.min(at, before[before.length - 1] + 1);
      const fresh = grid[r].map((text, col) => (col < at ? text : ''));
      for (const col of spanCols) {
        const xc = placed[r][col]?.xc ?? centers[col];
        let end = at;
        let bestDiff = Infinity;
        for (let e = at; e < width; e++) {
          const diff = Math.abs((centers[at] + centers[e]) / 2 - xc);
          if (diff < bestDiff) {
            bestDiff = diff;
            end = e;
          }
        }
        for (let e = at; e <= end; e++) fresh[e] = grid[r][col];
        at = end + 1;
      }
      grid[r] = fresh;
    }
  }
  return grid
    .map((cells) => cells.join('\t').replace(/\t+$/, ''))
    .filter((line) => line.trim())
    .join('\n');
}

/** 사진 글자 인식이 같은 글자를 겹쳐 읽은 것을 뺀다 */
export function dropOverlaps<T extends TextBox>(boxes: T[]): T[] {
  const kept: T[] = [];
  for (const box of [...boxes].sort((a, b) => b.text.length - a.text.length)) {
    const area = Math.max(1, (box.x1 - box.x0) * (box.y1 - box.y0));
    const overlapped = kept.some((other) => {
      const w = Math.min(box.x1, other.x1) - Math.max(box.x0, other.x0);
      const h = Math.min(box.y1, other.y1) - Math.max(box.y0, other.y0);
      return w > 0 && h > 0 && (w * h) / area > 0.6;
    });
    if (!overlapped) kept.push(box);
  }
  return kept;
}

const ROOM_TOKEN_RE = /^(\d)\s*[-–—~_.7]?\s*(\d{1,2})$/;
const ROOM_LABEL_RE = /^(?:일자|날짜|교시|시간|고사실|시험실|구분|과목)?$/;
const WEEKDAYS = '일월화수목금토';

function parseRoomToken(cell: string): [number, number] | null {
  const match = cell.trim().match(ROOM_TOKEN_RE);
  if (!match) return null;
  const grade = Number(match[1]);
  const room = Number(match[2]);
  return grade >= 1 && grade <= 3 && room >= 1 && room <= 20 ? [grade, room] : null;
}

/** "12", "171"처럼 읽힌 고사실 번호를 고치고, 빠진 칸은 앞뒤 번호로 메운다 */
function repairRoomRow(row: string[]): void {
  const known = row.map(parseRoomToken);
  // 뒤 번호와 어긋나면 잘못 읽은 것이다 ("37" 뒤에 "3-2")
  known.forEach((room, i) => {
    const next = known.slice(i + 1).find(Boolean);
    if (room && next && (room[0] > next[0] || (room[0] === next[0] && room[1] >= next[1]))) known[i] = null;
  });
  const cols = known.flatMap((room, i) => (room ? [i] : []));
  if (cols.length < 3) return;
  const first = cols[0];
  const last = cols[cols.length - 1];
  // 맨 앞 번호가 안 읽혔으면 바로 앞 칸이 그 자리다
  const start = first > 0 && known[first]![1] > 1 && !/\d/.test(row[first - 1] ?? '')
    && (first === 1 || ROOM_LABEL_RE.test((row[first - 2] ?? '').trim())) && !ROOM_LABEL_RE.test((row[first - 1] ?? '').trim() || 'x')
    ? first - 1 : first;
  for (let i = start; i <= last; i++) {
    if (known[i]) continue;
    const before = i > 0 ? known[i - 1] : null;
    const after = known[i + 1];
    if (after && after[1] > 1) known[i] = [after[0], after[1] - 1];
    else if (before) known[i] = [before[0], before[1] + 1];
    if (known[i]) row[i] = `${known[i]![0]}-${known[i]![1]}`;
  }
  known.forEach((room, i) => {
    if (room) row[i] = `${room[0]}-${room[1]}`;
  });
}

/** "116(월", "1117)"처럼 빗금이 빠진 날짜를 요일로 가려 고친다 */
function repairDateCell(cell: string, base: Date): string {
  const text = cell.trim();
  const match = text.match(/^(\d{3,4})\s*[)）.]*\s*(?:[(（]\s*([일월화수목금토]))?[)）.]*$/);
  if (!match) return cell;
  const digits = match[1];
  const options = digits.length === 4
    ? [[digits.slice(0, 2), digits.slice(2)]]
    : [
      [digits.slice(0, 2), digits.slice(2)],
      [digits.slice(0, 1), digits.slice(1)],
      // "11/16"에서 빗금과 숫자 하나를 놓친 경우. 요일이 맞을 때만 쓴다
      ...(match[2] ? [[digits.slice(0, 2), digits.slice(1)]] : []),
    ];
  for (const [m, d] of options) {
    const month = Number(m);
    const day = Number(d);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    for (const year of [base.getFullYear(), base.getFullYear() + 1]) {
      const date = new Date(year, month - 1, day);
      if (match[2] && date.getDay() !== WEEKDAYS.indexOf(match[2])) continue;
      return `${month}/${day}${match[2] ? `(${match[2]})` : ''}`;
    }
  }
  return cell;
}

/** 교시 열에서 숫자가 빠졌거나 이상하게 읽힌 칸을 앞 칸에 이어 채운다 */
function repairPeriodColumn(rows: string[][]): void {
  const width = Math.max(0, ...rows.map((row) => row.length));
  for (let col = 0; col < width; col++) {
    const cells = rows.map((row) => (row[col] ?? '').replace(/\s+/g, ''));
    const good = cells.filter((cell) => /^\d{1,2}교시$/.test(cell)).length;
    if (good < 2) continue;
    const dateCol = col - 1;
    let previous = 0;
    let previousDate = '';
    let started = false;
    rows.forEach((row, r) => {
      const cell = cells[r];
      const date = (row[dateCol] ?? '').trim();
      if (date && date !== previousDate) {
        previous = 0;
        previousDate = date;
      }
      const match = cell.match(/^(\d{1,2})교시$/);
      if (match) {
        previous = Number(match[1]);
        started = true;
        row[col] = `${previous}교시`;
        return;
      }
      if (!started && !date) return;
      // 본문 줄(옆에 칸이 많은 줄)의 빈칸이나 깨진 칸만 메운다
      if (row.filter(Boolean).length >= 3 && cell.length <= 3) {
        previous += 1;
        started = true;
        row[col] = `${previous}교시`;
      }
    });
  }
}

/** 사진에서 읽은 표에 자주 나는 오류를 고친다. 그래도 틀릴 수 있어 담당자가 확인한다 */
export function repairOcrTable(text: string, base: Date = new Date()): string {
  const rows = text.split('\n').map((line) => line.split('\t').map((cell) => cell.trim()));
  for (const row of rows) {
    if (row.filter((cell) => parseRoomToken(cell)).length >= 3) repairRoomRow(row);
    row.forEach((cell, i) => { row[i] = repairDateCell(cell, base); });
  }
  repairPeriodColumn(rows);
  return rows.map((row) => row.join('\t')).join('\n');
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return dp[b.length];
}

/** 아는 교사 이름과 한 글자만 다른 낱말은 그 이름으로 고친다. 후보가 둘 이상이면 건드리지 않는다 */
export function snapKnownNames(text: string, known: Iterable<string>): string {
  const names = [...new Set(known)].filter((name) => name.length >= 2);
  if (names.length === 0) return text;
  const set = new Set(names);
  return text.split('\n').map((line) => line.split('\t').map((cell) => {
    const compact = cell.replace(/\s+/g, '');
    if (!/^[가-힣]{2,5}$/.test(compact)) return cell;
    if (set.has(compact)) return compact;
    if (compact.length < 3) return cell;
    const near = names.filter((name) => name.length === compact.length && editDistance(name, compact) === 1);
    return near.length === 1 ? near[0] : cell;
  }).join('\t')).join('\n');
}
