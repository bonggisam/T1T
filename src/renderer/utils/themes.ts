/**
 * 기본 테마 6종, 컨셉 테마 15종(분위기·시대·계절·교과), 강조색. 값은 제안 시안에서 사진과 흰색, 검은색 바탕 위 대비를 확인한 것이다.
 * 컨셉 테마는 색 말고도 제목 글꼴, 모서리 둥글기, 빛 번짐, 판 무늬를 함께 바꾼다.
 * 글꼴은 Windows와 Mac에 기본으로 있는 것만 쓴다 (없으면 Pretendard로 돌아간다).
 *
 * 투명 창이라 글자 뒤로 바탕화면이 비친다. 그래서 테마마다 배경 농도의 하한을 계산해 두고,
 * 어떤 바탕화면이어도 글자 대비가 기준 아래로 떨어지지 않게 한다.
 * 시안 값에서 주말 날짜와 희미한 글자를 조금 진하게 조정해 농도 75%에서도 기준을 맞췄다.
 */

export type ThemePresetKey =
  | 'clear' | 'grid' | 'chalk' | 'night' | 'blossom' | 'contrast'
  | 'mist' | 'cyber' | 'blueprint' | 'watercolor'
  | 'bamti' | 'nineties' | 'y2k' | 'future'
  | 'spring' | 'summer' | 'maple' | 'winter'
  | 'korean' | 'english' | 'music';
export type ThemeChoice = ThemePresetKey | 'system';
export type AccentKey = 'theme' | 'blue' | 'indigo' | 'teal' | 'orange' | 'pink';
export type TodayMark = 'fill' | 'ring' | 'pen';

interface ThemePreset {
  name: string;
  mode: 'light' | 'dark';
  /** 판의 색 */
  surf: [number, number, number];
  /** 기본 배경 농도 */
  alpha: number;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  vline: string;
  weekend: string;
  frame: string;
  /** 테마 기본 강조색 (oklch) */
  accent: [number, number, number];
  today: TodayMark;
  sun: string;
  sat: string;
  pen: string;
  tint: number;
  soft: number;
  texture?: string;
  textureSize?: string;
  solidChips?: boolean;
  /** 고대비는 농도를 낮추지 못하게 고정한다 */
  lockAlpha?: boolean;
  /** 컨셉 한 줄 설명 (설정 타일 풍선 도움말) */
  blurb?: string;
  /** 제목 글꼴. 없으면 본문 글꼴 */
  display?: string;
  /** 모서리 둥글기 xs, sm, md, lg (px) */
  radius?: [number, number, number, number];
  /** 강조색 빛 번짐 크기 (px). 사이버 컨셉처럼 빛나는 테두리 */
  glow?: number;
  /** 본문 글꼴. 90년대 굴림, 2000년대 돋움처럼 시대 느낌을 낸다. 없으면 Pretendard */
  body?: string;
  /** 카드와 단추의 입체 테두리 (box-shadow). 90년대 창 같은 느낌 */
  bevel?: string;
  /** 카드 테두리를 점선으로 */
  dashed?: boolean;
}

/** Windows와 Mac에 기본으로 있는 고정폭·명조 글꼴. 한글은 Pretendard로 이어진다 */
const MONO = "'SF Mono', Menlo, Consolas, 'D2Coding', 'Pretendard Variable', Pretendard, monospace";
const SERIF = "'Nanum Myeongjo', AppleMyungjo, Batang, 'Noto Serif KR', serif";
/** 옛 한글 웹 글꼴. Mac에는 없어서 AppleGothic으로 이어진다 */
const GULIM = "Gulim, '굴림', AppleGothic, 'Apple SD Gothic Neo', sans-serif";
const DOTUM = "Dotum, '돋움', AppleGothic, 'Apple SD Gothic Neo', sans-serif";
/** 영어 교과: 로마자는 세리프, 한글은 Pretendard */
const LATIN_SERIF = "Georgia, 'Times New Roman', 'Pretendard Variable', Pretendard, serif";
/** global.css의 기본 본문 글꼴과 같은 값. 테마를 바꿀 때 되돌린다 */
const DEFAULT_SANS = "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif";

export const THEME_PRESETS: Record<ThemePresetKey, ThemePreset> = {
  clear: { name: '맑음', mode: 'light', surf: [247, 248, 251], alpha: 85, ink: '#111827', ink2: '#3F4957', ink3: '#5E6673', line: 'rgb(17 24 39 / .11)', vline: 'rgb(17 24 39 / .06)', weekend: 'rgb(17 24 39 / .025)', frame: 'rgb(17 24 39 / .14)', accent: [0.33, 0.07, 265], today: 'fill', sun: '#8F1717', sat: '#163BA8', pen: '#D92D20', tint: 15, soft: 12 },
  grid: { name: '모눈노트', mode: 'light', surf: [252, 253, 255], alpha: 90, ink: '#16244A', ink2: '#3A4A6E', ink3: '#5A6580', line: 'rgb(46 88 160 / .24)', vline: 'rgb(46 88 160 / .14)', weekend: 'rgb(46 88 160 / .03)', frame: 'rgb(30 50 110 / .2)', accent: [0.42, 0.15, 264], today: 'pen', sun: '#8F1717', sat: '#1E40AF', pen: '#D92D20', tint: 13, soft: 11, texture: 'linear-gradient(rgb(46 88 160 / .055) 1px, transparent 1px), linear-gradient(90deg, rgb(46 88 160 / .055) 1px, transparent 1px)', textureSize: '11px 11px' },
  chalk: { name: '칠판', mode: 'dark', surf: [31, 58, 50], alpha: 95, ink: '#F4F2E8', ink2: '#D6D7CA', ink3: '#ADB4A8', line: 'rgb(244 242 232 / .17)', vline: 'rgb(244 242 232 / .09)', weekend: 'rgb(244 242 232 / .03)', frame: 'rgb(10 20 16 / .55)', accent: [0.88, 0.13, 95], today: 'pen', sun: '#FFC4BB', sat: '#B8DAFF', pen: '#F2D66B', tint: 24, soft: 18, texture: 'radial-gradient(60% 40% at 20% 10%, rgb(255 255 255 / .05), transparent 70%), radial-gradient(50% 40% at 85% 90%, rgb(255 255 255 / .04), transparent 70%)' },
  night: { name: '야간자습', mode: 'dark', surf: [21, 23, 30], alpha: 90, ink: '#EEF0F5', ink2: '#C6CBD6', ink3: '#9AA1B1', line: 'rgb(238 240 245 / .13)', vline: 'rgb(238 240 245 / .07)', weekend: 'rgb(238 240 245 / .025)', frame: 'rgb(0 0 0 / .6)', accent: [0.78, 0.11, 275], today: 'fill', sun: '#FFA89E', sat: '#A6C2FF', pen: '#FF8A7A', tint: 24, soft: 20 },
  blossom: { name: '벚꽃', mode: 'light', surf: [255, 248, 250], alpha: 88, ink: '#2F1D27', ink2: '#5A4250', ink3: '#75606C', line: 'rgb(120 40 80 / .14)', vline: 'rgb(120 40 80 / .07)', weekend: 'rgb(214 69 127 / .035)', frame: 'rgb(90 30 60 / .18)', accent: [0.55, 0.18, 355], today: 'fill', sun: '#8F1332', sat: '#163BA8', pen: '#D0253A', tint: 15, soft: 12 },
  contrast: { name: '고대비', mode: 'light', surf: [255, 255, 255], alpha: 100, ink: '#000000', ink2: '#1C1C1C', ink3: '#3D3D3D', line: 'rgb(0 0 0 / .5)', vline: 'rgb(0 0 0 / .28)', weekend: 'rgb(0 0 0 / .04)', frame: 'rgb(0 0 0 / .9)', accent: [0.38, 0.2, 262], today: 'ring', sun: '#B3160B', sat: '#0B3FB3', pen: '#B3160B', tint: 18, soft: 14, solidChips: true, lockAlpha: true },

  // ── 컨셉 테마 ──
  mist: {
    name: '차분한 안개', blurb: '채도를 낮춘 회청색. 오래 봐도 눈이 편하다',
    mode: 'light', surf: [243, 245, 247], alpha: 86, ink: '#1E2630', ink2: '#47515D', ink3: '#68717C',
    line: 'rgb(30 38 48 / .10)', vline: 'rgb(30 38 48 / .055)', weekend: 'rgb(30 38 48 / .022)', frame: 'rgb(30 38 48 / .12)',
    accent: [0.5, 0.045, 240], today: 'ring', sun: '#8E2B2B', sat: '#284A7A', pen: '#B4413A', tint: 12, soft: 10,
    texture: 'linear-gradient(180deg, rgb(255 255 255 / .35), transparent 45%)',
  },
  cyber: {
    name: '사이버 네온', blurb: '어두운 화면에 청록·분홍 네온, 주사선과 빛 번짐',
    mode: 'dark', surf: [8, 11, 22], alpha: 92, ink: '#E8F4FF', ink2: '#B7CBEA', ink3: '#8DA2C6',
    line: 'rgb(0 229 255 / .20)', vline: 'rgb(0 229 255 / .09)', weekend: 'rgb(255 0 200 / .04)', frame: 'rgb(0 229 255 / .45)',
    accent: [0.84, 0.15, 200], today: 'ring', sun: '#FF7AC8', sat: '#7DD3FF', pen: '#FF4FD8', tint: 26, soft: 20,
    texture: 'repeating-linear-gradient(0deg, rgb(0 229 255 / .045) 0 1px, transparent 1px 4px), radial-gradient(60% 50% at 100% 0%, rgb(255 0 200 / .16), transparent 70%), radial-gradient(60% 50% at 0% 100%, rgb(0 229 255 / .14), transparent 70%)',
    display: MONO, radius: [2, 4, 6, 8], glow: 10,
  },
  blueprint: {
    name: '청사진', blurb: '설계도 같은 파란 바탕과 모눈, 고정폭 제목',
    mode: 'dark', surf: [14, 46, 92], alpha: 94, ink: '#EEF5FF', ink2: '#C7D9F5', ink3: '#A2BBE0',
    line: 'rgb(190 220 255 / .24)', vline: 'rgb(190 220 255 / .12)', weekend: 'rgb(190 220 255 / .04)', frame: 'rgb(190 220 255 / .35)',
    accent: [0.88, 0.09, 215], today: 'ring', sun: '#FFB4A8', sat: '#BFE0FF', pen: '#FFD27A', tint: 24, soft: 18,
    texture: 'linear-gradient(rgb(190 220 255 / .14) 1px, transparent 1px), linear-gradient(90deg, rgb(190 220 255 / .14) 1px, transparent 1px), linear-gradient(rgb(190 220 255 / .06) 1px, transparent 1px), linear-gradient(90deg, rgb(190 220 255 / .06) 1px, transparent 1px)',
    textureSize: '60px 60px, 60px 60px, 12px 12px, 12px 12px',
    display: MONO, radius: [2, 4, 6, 8],
  },
  watercolor: {
    name: '수채화', blurb: '종이에 번진 물감 네 가지 색, 명조 제목, 둥근 모서리',
    mode: 'light', surf: [253, 251, 247], alpha: 88, ink: '#2A2A3A', ink2: '#4F4F66', ink3: '#6E6E85',
    line: 'rgb(80 70 120 / .12)', vline: 'rgb(80 70 120 / .06)', weekend: 'rgb(255 140 160 / .035)', frame: 'rgb(80 70 120 / .14)',
    accent: [0.55, 0.12, 280], today: 'fill', sun: '#9A2B4A', sat: '#2B4C9A', pen: '#D0425E', tint: 15, soft: 12,
    texture: 'radial-gradient(38% 30% at 12% 18%, rgb(130 170 255 / .20), transparent 70%), radial-gradient(34% 28% at 88% 14%, rgb(255 150 180 / .20), transparent 70%), radial-gradient(40% 32% at 78% 86%, rgb(255 210 120 / .18), transparent 70%), radial-gradient(36% 30% at 18% 88%, rgb(140 220 180 / .18), transparent 70%)',
    display: SERIF, radius: [6, 10, 16, 20],
  },
  maple: {
    name: '가을 단풍', blurb: '따뜻한 아이보리에 단풍빛 주황과 빨강',
    mode: 'light', surf: [252, 246, 238], alpha: 88, ink: '#2E1E14', ink2: '#55402F', ink3: '#735C49',
    line: 'rgb(140 70 30 / .14)', vline: 'rgb(140 70 30 / .07)', weekend: 'rgb(200 80 30 / .035)', frame: 'rgb(140 70 30 / .17)',
    accent: [0.55, 0.16, 40], today: 'fill', sun: '#9A1B12', sat: '#2B4A80', pen: '#C2410C', tint: 15, soft: 13,
    texture: 'radial-gradient(40% 30% at 100% 0%, rgb(230 110 40 / .16), transparent 70%), radial-gradient(35% 28% at 0% 100%, rgb(200 60 30 / .12), transparent 70%)',
  },
  // ── 시대 ──
  bamti: {
    name: '밤티 감성', blurb: '옛날 벽걸이 달력처럼 누렇게 바랜 종이, 빨간 일요일, 굵은 명조',
    mode: 'light', surf: [246, 238, 214], alpha: 94, ink: '#2B1D0E', ink2: '#4E3B22', ink3: '#6E5A3E',
    line: 'rgb(90 60 20 / .20)', vline: 'rgb(90 60 20 / .10)', weekend: 'rgb(190 30 20 / .05)', frame: 'rgb(90 60 20 / .28)',
    accent: [0.5, 0.17, 30], today: 'ring', sun: '#B3180F', sat: '#1F3F8F', pen: '#B3180F', tint: 16, soft: 14,
    texture: 'radial-gradient(120% 90% at 50% 40%, transparent 60%, rgb(150 110 40 / .16)), repeating-linear-gradient(0deg, rgb(120 90 40 / .03) 0 1px, transparent 1px 3px)',
    display: SERIF, radius: [2, 4, 6, 8],
  },
  nineties: {
    name: '90년대', blurb: '윈도95 같은 회색 판과 입체 테두리, 남색 강조, 굴림 글꼴',
    mode: 'light', surf: [192, 192, 192], alpha: 98, ink: '#000000', ink2: '#1A1A1A', ink3: '#3A3A3A',
    line: 'rgb(0 0 0 / .35)', vline: 'rgb(0 0 0 / .18)', weekend: 'rgb(0 0 128 / .04)', frame: 'rgb(0 0 0 / .6)',
    accent: [0.3, 0.19, 264], today: 'fill', sun: '#A00000', sat: '#00007A', pen: '#A00000', tint: 18, soft: 16,
    body: GULIM, display: GULIM, radius: [0, 0, 0, 0],
    bevel: 'inset 1px 1px 0 rgb(255 255 255 / .95), inset -1px -1px 0 rgb(0 0 0 / .45)',
  },
  y2k: {
    name: '2000년대', blurb: '미니홈피 시절 하늘색과 주황, 물방울 무늬, 점선 테두리, 돋움 글꼴',
    mode: 'light', surf: [240, 248, 255], alpha: 92, ink: '#1F2A44', ink2: '#3D4A66', ink3: '#5D6986',
    line: 'rgb(80 140 210 / .35)', vline: 'rgb(80 140 210 / .18)', weekend: 'rgb(255 140 0 / .04)', frame: 'rgb(80 140 210 / .45)',
    accent: [0.66, 0.17, 55], today: 'fill', sun: '#C2185B', sat: '#1565C0', pen: '#FF6F00', tint: 16, soft: 14,
    texture: 'radial-gradient(rgb(120 180 255 / .22) 2px, transparent 2.5px)', textureSize: '18px 18px',
    body: DOTUM, display: DOTUM, radius: [3, 6, 8, 10], dashed: true,
  },
  future: {
    name: '미래 홀로그램', blurb: '무지갯빛 홀로그램 유리, 큰 둥근 모서리, 은은한 빛',
    mode: 'light', surf: [246, 247, 252], alpha: 84, ink: '#141826', ink2: '#3A4058', ink3: '#5C6380',
    line: 'rgb(110 100 200 / .16)', vline: 'rgb(110 100 200 / .08)', weekend: 'rgb(120 200 255 / .04)', frame: 'rgb(110 100 200 / .22)',
    accent: [0.56, 0.17, 290], today: 'ring', sun: '#A61E4D', sat: '#2F4BB5', pen: '#7C3AED', tint: 14, soft: 12,
    texture: 'linear-gradient(120deg, rgb(150 220 255 / .28), rgb(215 180 255 / .24) 35%, rgb(255 195 230 / .20) 62%, rgb(170 255 225 / .24))',
    radius: [8, 12, 18, 24], glow: 6,
  },

  // ── 계절 (가을은 maple) ──
  spring: {
    name: '봄', blurb: '개나리 노랑과 연둣빛 새싹, 흩날리는 꽃잎',
    mode: 'light', surf: [253, 252, 240], alpha: 88, ink: '#26301A', ink2: '#4A5536', ink3: '#677252',
    line: 'rgb(120 140 40 / .15)', vline: 'rgb(120 140 40 / .075)', weekend: 'rgb(250 200 40 / .05)', frame: 'rgb(120 140 40 / .18)',
    accent: [0.55, 0.13, 125], today: 'fill', sun: '#A3283D', sat: '#2B5590', pen: '#D99A00', tint: 15, soft: 13,
    texture: 'radial-gradient(3px 2px at 20% 30%, rgb(255 170 200 / .45), transparent 70%), radial-gradient(2.5px 2px at 70% 70%, rgb(255 190 210 / .40), transparent 70%), radial-gradient(60% 40% at 0% 0%, rgb(255 225 80 / .22), transparent 70%), radial-gradient(50% 40% at 100% 100%, rgb(160 220 90 / .18), transparent 70%)',
    textureSize: '120px 90px, 120px 90px, 100% 100%, 100% 100%',
    radius: [6, 10, 14, 18],
  },
  summer: {
    name: '여름', blurb: '쨍한 하늘색과 햇살, 아래로 출렁이는 물빛',
    mode: 'light', surf: [240, 250, 255], alpha: 88, ink: '#0D2A3A', ink2: '#2F4E60', ink3: '#4E6D7E',
    line: 'rgb(0 140 200 / .16)', vline: 'rgb(0 140 200 / .08)', weekend: 'rgb(255 80 80 / .04)', frame: 'rgb(0 140 200 / .2)',
    accent: [0.58, 0.15, 235], today: 'fill', sun: '#B91C1C', sat: '#1D4ED8', pen: '#F59E0B', tint: 15, soft: 13,
    texture: 'radial-gradient(35% 30% at 100% 0%, rgb(255 220 80 / .30), transparent 70%), linear-gradient(0deg, rgb(0 190 230 / .14), transparent 40%)',
    radius: [6, 10, 14, 18],
  },
  winter: {
    name: '겨울', blurb: '눈 내리는 하얀 바탕과 차가운 청색',
    mode: 'light', surf: [246, 250, 253], alpha: 88, ink: '#0F1E33', ink2: '#33455E', ink3: '#53647B',
    line: 'rgb(60 110 170 / .14)', vline: 'rgb(60 110 170 / .07)', weekend: 'rgb(60 110 170 / .03)', frame: 'rgb(60 110 170 / .18)',
    accent: [0.52, 0.12, 245], today: 'ring', sun: '#9F1D35', sat: '#1E4FA0', pen: '#2563EB', tint: 14, soft: 12,
    texture: 'radial-gradient(2px 2px at 15% 25%, rgb(150 185 230 / .60), transparent 70%), radial-gradient(1.5px 1.5px at 60% 10%, rgb(150 185 230 / .55), transparent 70%), radial-gradient(2.5px 2.5px at 80% 60%, rgb(150 185 230 / .50), transparent 70%), radial-gradient(1.5px 1.5px at 35% 80%, rgb(150 185 230 / .55), transparent 70%)',
    textureSize: '140px 120px',
    radius: [6, 10, 14, 18],
  },

  // ── 교과 ──
  korean: {
    name: '국어', blurb: '초록 원고지 칸과 명조 제목, 먹색 글자',
    mode: 'light', surf: [253, 252, 247], alpha: 92, ink: '#1B1B1B', ink2: '#3F3F3F', ink3: '#5F5F5F',
    line: 'rgb(46 140 80 / .22)', vline: 'rgb(46 140 80 / .11)', weekend: 'rgb(200 60 50 / .03)', frame: 'rgb(46 120 70 / .24)',
    accent: [0.45, 0.14, 25], today: 'pen', sun: '#A31616', sat: '#1F3F8F', pen: '#C62828', tint: 14, soft: 12,
    texture: 'linear-gradient(rgb(46 160 90 / .16) 1px, transparent 1px), linear-gradient(90deg, rgb(46 160 90 / .16) 1px, transparent 1px)',
    textureSize: '22px 22px',
    display: SERIF, radius: [2, 4, 6, 8],
  },
  english: {
    name: '영어', blurb: '영어 공책 가로줄과 빨간 여백선, 세리프 제목',
    mode: 'light', surf: [252, 253, 255], alpha: 92, ink: '#14213D', ink2: '#344563', ink3: '#56658A',
    line: 'rgb(60 110 200 / .18)', vline: 'rgb(60 110 200 / .09)', weekend: 'rgb(220 60 60 / .03)', frame: 'rgb(60 110 200 / .2)',
    accent: [0.5, 0.15, 260], today: 'fill', sun: '#B91C1C', sat: '#1D4ED8', pen: '#DC2626', tint: 14, soft: 12,
    texture: 'linear-gradient(90deg, transparent 38px, rgb(230 70 70 / .35) 38px, rgb(230 70 70 / .35) 39px, transparent 39px), repeating-linear-gradient(0deg, rgb(70 120 210 / .14) 0 1px, transparent 1px 24px)',
    display: LATIN_SERIF, radius: [3, 6, 8, 10],
  },
  music: {
    name: '음악', blurb: '오선지 다섯 줄과 보랏빛 강조',
    mode: 'light', surf: [252, 250, 255], alpha: 90, ink: '#221A33', ink2: '#463B5C', ink3: '#665A7D',
    line: 'rgb(90 60 150 / .15)', vline: 'rgb(90 60 150 / .075)', weekend: 'rgb(150 90 220 / .035)', frame: 'rgb(90 60 150 / .2)',
    accent: [0.5, 0.16, 300], today: 'fill', sun: '#A3205A', sat: '#2E44A8', pen: '#7E22CE', tint: 15, soft: 13,
    texture: 'repeating-linear-gradient(180deg, rgb(90 60 150 / .16) 0 1px, transparent 1px 7px, rgb(90 60 150 / .16) 7px 8px, transparent 8px 14px, rgb(90 60 150 / .16) 14px 15px, transparent 15px 21px, rgb(90 60 150 / .16) 21px 22px, transparent 22px 28px, rgb(90 60 150 / .16) 28px 29px, transparent 29px 64px)',
    radius: [6, 10, 14, 18],
  },
};

/** 설정 화면의 순서와 묶음 */
export const BASE_THEME_ORDER: ThemePresetKey[] = ['clear', 'grid', 'chalk', 'night', 'blossom', 'contrast'];
export const CONCEPT_GROUPS: Array<{ title: string; keys: ThemePresetKey[] }> = [
  { title: '분위기', keys: ['mist', 'cyber', 'blueprint', 'watercolor'] },
  { title: '시대', keys: ['bamti', 'nineties', 'y2k', 'future'] },
  { title: '계절', keys: ['spring', 'summer', 'maple', 'winter'] },
  { title: '교과', keys: ['korean', 'english', 'music'] },
];
export const CONCEPT_THEME_ORDER: ThemePresetKey[] = CONCEPT_GROUPS.flatMap((g) => g.keys);

/** 강조색 5가지. 대비를 미리 계산한 값이다. 자유 색상은 두지 않는다. */
export const ACCENTS: Record<Exclude<AccentKey, 'theme'>, { name: string; light: [number, number, number]; dark: [number, number, number] }> = {
  blue: { name: '파랑', light: [0.57, 0.19, 258], dark: [0.66, 0.162, 258] },
  indigo: { name: '남색', light: [0.575, 0.17, 275], dark: [0.665, 0.145, 275] },
  teal: { name: '청록', light: [0.555, 0.094, 195], dark: [0.645, 0.102, 195] },
  orange: { name: '주황', light: [0.58, 0.166, 45], dark: [0.67, 0.145, 45] },
  pink: { name: '분홍', light: [0.59, 0.18, 355], dark: [0.68, 0.153, 355] },
};

type Rgb = [number, number, number];

export function oklchToRgb(L: number, C: number, H: number): Rgb {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const toSrgb = (c: number) => {
    const v = Math.max(0, Math.min(1, c));
    return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  };
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function luminance(c: Rgb): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return [0, 1, 2].map((i) => Math.round(fg[i] * alpha + bg[i] * (1 - alpha))) as Rgb;
}

const WALLPAPERS: Rgb[] = [[0, 0, 0], [255, 255, 255], [128, 128, 128]];

/**
 * 어떤 바탕화면이어도 글자가 읽히는 가장 낮은 농도.
 * 보조 글자와 주말 날짜는 4.5:1, 희미한 안내 글자는 3:1. 일정 칩은 판 색 위에 섞으므로 바탕화면과 상관없다.
 */
function minAlpha(preset: ThemePreset): number {
  const needs: Array<[Rgb, number]> = [
    [hexToRgb(preset.ink2), 4.5],
    [hexToRgb(preset.sun), 4.5],
    [hexToRgb(preset.sat), 4.5],
    [hexToRgb(preset.ink3), 3],
  ];
  for (let a = 40; a <= 100; a++) {
    const plates = WALLPAPERS.map((w) => over(preset.surf, a / 100, w));
    if (needs.every(([color, ratio]) => plates.every((plate) => contrastRatio(color, plate) >= ratio))) return a;
  }
  return 100;
}

/** 배경 농도 하한. 대비 계산값과 75% 중 큰 값이다. */
export function plateFloor(key: ThemePresetKey): number {
  const preset = THEME_PRESETS[key];
  return preset.lockAlpha ? 100 : Math.max(75, minAlpha(preset));
}

/** 설정 화면에 보여 주는 대비 값 */
export function worstContrast(key: ThemePresetKey, alpha: number): { dark: number; bright: number } {
  const preset = THEME_PRESETS[key];
  const ink2 = hexToRgb(preset.ink2);
  return {
    dark: contrastRatio(ink2, over(preset.surf, alpha / 100, [0, 0, 0])),
    bright: contrastRatio(ink2, over(preset.surf, alpha / 100, [255, 255, 255])),
  };
}

export interface ThemeTokens {
  mode: 'light' | 'dark';
  today: TodayMark;
  solidChips: boolean;
  accentRgb: Rgb;
  vars: Record<string, string>;
}

/** 강조색을 고르고, 위에 올라가는 글자와 대비 4.5:1이 될 때까지 밝기를 조정한다 */
function resolveAccent(preset: ThemePreset, accent: AccentKey): { rgb: Rgb; on: string } {
  const lch: [number, number, number] = accent === 'theme'
    ? [...preset.accent]
    : [...ACCENTS[accent][preset.mode]];
  if (preset.lockAlpha && accent !== 'theme') lch[0] = Math.min(lch[0], 0.45);
  const on = preset.mode === 'light' ? '#ffffff' : '#0B1020';
  const onRgb = hexToRgb(on);
  let rgb = oklchToRgb(lch[0], lch[1], lch[2]);
  for (let guard = 0; contrastRatio(rgb, onRgb) < 4.5 && guard < 30; guard++) {
    lch[0] += preset.mode === 'light' ? -0.01 : 0.01;
    rgb = oklchToRgb(lch[0], lch[1], lch[2]);
  }
  return { rgb, on };
}

const DEFAULT_RADIUS: [number, number, number, number] = [4, 8, 12, 16];

export function themeTokens(key: ThemePresetKey, accent: AccentKey): ThemeTokens {
  const preset = THEME_PRESETS[key];
  const { rgb, on } = resolveAccent(preset, accent);
  const accentColor = `rgb(${rgb.join(' ')})`;
  const dark = preset.mode === 'dark';
  return {
    mode: preset.mode,
    today: preset.today,
    solidChips: !!preset.solidChips,
    accentRgb: rgb,
    vars: {
      '--plate-rgb': preset.surf.join(' '),
      '--plate-texture': preset.texture ?? 'none',
      '--plate-texture-size': preset.textureSize ?? 'auto',
      '--window-frame': preset.frame,
      '--text-primary': preset.ink,
      '--text-secondary': preset.ink2,
      '--text-muted': preset.ink3,
      '--grid-line': preset.line,
      '--border-color': preset.line,
      '--border-subtle': preset.vline,
      '--tint-neutral': preset.weekend,
      '--bg-modal': `rgb(${preset.surf.join(' ')})`,
      '--bg-secondary': preset.lockAlpha ? 'rgb(0 0 0 / .03)' : dark ? 'rgb(255 255 255 / .07)' : 'rgb(255 255 255 / .42)',
      '--bg-hover': `color-mix(in oklab, ${preset.ink} 7%, transparent)`,
      '--bg-active': `color-mix(in oklab, ${preset.ink} 12%, transparent)`,
      '--accent': accentColor,
      '--accent-hover': `color-mix(in oklab, ${accentColor} 88%, ${preset.ink})`,
      '--accent-soft': `color-mix(in oklab, ${accentColor} ${preset.soft}%, transparent)`,
      '--accent-ink': `color-mix(in oklab, ${accentColor} 72%, ${preset.ink})`,
      '--on-accent': on,
      '--today-bg': `color-mix(in oklab, ${accentColor} ${preset.soft}%, transparent)`,
      '--weekend-text': preset.sun,
      '--saturday-text': preset.sat,
      '--pen': preset.pen,
      '--chip-tint': `${preset.tint}%`,
      '--danger': dark ? '#F0645A' : '#D92D20',
      '--warning': dark ? '#FBBF24' : '#B45309',
      '--focus-ring': `0 0 0 3px color-mix(in oklab, ${accentColor} 25%, transparent)`,
      // 컨셉 테마의 글꼴, 모서리, 빛 번짐. 테마를 바꾸면 지난 값이 남지 않게 언제나 넣는다
      '--font-display': preset.display ?? 'var(--font-sans)',
      '--radius-xs': `${(preset.radius ?? DEFAULT_RADIUS)[0]}px`,
      '--radius-sm': `${(preset.radius ?? DEFAULT_RADIUS)[1]}px`,
      '--radius-md': `${(preset.radius ?? DEFAULT_RADIUS)[2]}px`,
      '--radius-lg': `${(preset.radius ?? DEFAULT_RADIUS)[3]}px`,
      '--accent-glow': preset.glow ? `0 0 ${preset.glow}px color-mix(in oklab, ${accentColor} 55%, transparent)` : '0 0 0 transparent',
      '--font-sans': preset.body ?? DEFAULT_SANS,
      '--surface-bevel': preset.bevel ?? '0 0 0 transparent',
      '--card-border-style': preset.dashed ? 'dashed' : 'solid',
    },
  };
}
