/**
 * 태성중·태성고 학교 홈페이지 스크래퍼 (메인 프로세스).
 *
 * 학사일정: /ps/schdul/selectSchdulList.do?mi=XXXX  (POST, schdulLevel=Y)
 * 급식: /ad/fm/foodmenu/selectFoodMenuView.do?mi=XXXX (GET, 페이지 직접 파싱)
 */

import * as https from 'https';
import { URL } from 'url';

export type SchoolKey = 'taeseong_middle' | 'taeseong_high';

interface SchoolUrls {
  base: string;
  sysId: string;
  scheduleMi: string;
  mealMi: string;
}

const SCHOOLS: Record<SchoolKey, SchoolUrls> = {
  taeseong_middle: {
    base: 'https://taesung-m.goeyi.kr',
    sysId: 'taesung-m',
    scheduleMi: '4372',
    mealMi: '4651',
  },
  taeseong_high: {
    base: 'https://taesung-h.goeyi.kr',
    sysId: 'taesung-h',
    scheduleMi: '14259',
    mealMi: '14280',
  },
};

const COMMON_HEADERS = {
  // 최신 Chrome User-Agent (2026-06 기준)
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

/** Set-Cookie 헤더 배열에서 모든 쿠키의 name=value만 추출 (속성 제거) */
function buildCookieHeader(setCookies: string[]): string {
  return setCookies
    .map((c) => c.split(';')[0].trim())
    .filter((c) => c.length > 0)
    .join('; ');
}

/** 에러 메시지를 사용자 UI에 표시 가능한 길이(150자)로 자르고 콘솔에 상세 로그 */
function shortError(prefix: string, detail: string): Error {
  const MAX = 150;
  const trimmed = detail.length > MAX ? detail.slice(0, MAX) + '…' : detail;
  console.warn(`[schoolScrape:${prefix}] ${detail}`);
  return new Error(`[${prefix}] ${trimmed}`);
}

function httpRequest(urlStr: string, options: https.RequestOptions, body?: string): Promise<{ status: number; body: string; setCookie: string[] }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const safeResolve = (v: { status: number; body: string; setCookie: string[] }) => {
      if (settled) return; settled = true; resolve(v);
    };
    const safeReject = (e: Error) => {
      if (settled) return; settled = true; reject(e);
    };
    const url = new URL(urlStr);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      port: url.port || 443,
      ...options,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'] || [];
        safeResolve({
          status: res.statusCode || 0,
          body: Buffer.concat(chunks).toString('utf-8'),
          setCookie,
        });
      });
      res.on('error', safeReject);
    });
    req.on('error', safeReject);
    req.setTimeout(15000, () => {
      req.destroy();
      safeReject(new Error('학교 홈페이지 응답 시간 초과 (15초)'));
    });
    if (body) req.write(body);
    req.end();
  });
}

/** 학사일정 조회 — 1년치 데이터를 가져옴 */
export async function fetchSchoolSchedule(schoolKey: SchoolKey): Promise<{
  events: Array<{ startDate: string; endDate: string; title: string; seq: string }>;
}> {
  const s = SCHOOLS[schoolKey];
  const mainUrl = `${s.base}/${s.sysId}/ps/schdul/selectSchdulMainList.do?mi=${s.scheduleMi}`;
  const ajaxUrl = `${s.base}/${s.sysId}/ps/schdul/selectSchdulList.do?mi=${s.scheduleMi}`;

  // 1단계: 메인 페이지로 세션 쿠키 받기
  let page;
  try {
    page = await httpRequest(mainUrl, { method: 'GET', headers: COMMON_HEADERS });
  } catch (e: any) {
    throw shortError('학사일정', `메인 페이지 접속 실패 — ${e?.message || e}`);
  }
  if (page.status !== 200) {
    throw shortError('학사일정', `메인 페이지 HTTP ${page.status}`);
  }
  const cookieHeader = buildCookieHeader(page.setCookie);

  // 2단계: AJAX 호출로 연간 일정 받기
  const ajaxBody = 'schdulLevel=Y&fromDate=&toDate=&date=&schdulSeq=';
  let resp;
  try {
    resp = await httpRequest(ajaxUrl, {
      method: 'POST',
      headers: {
        ...COMMON_HEADERS,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': mainUrl,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Content-Length': String(Buffer.byteLength(ajaxBody)),
        ...(cookieHeader && { 'Cookie': cookieHeader }),
      },
    }, ajaxBody);
  } catch (e: any) {
    throw shortError('학사일정', `AJAX 요청 실패 — ${e?.message || e}`);
  }

  if (resp.status !== 200) throw shortError('학사일정', `AJAX HTTP ${resp.status}`);
  if (!resp.body || resp.body.length < 50) {
    throw shortError('학사일정', `응답 본문 부족 (${resp.body?.length || 0} bytes)`);
  }

  // 응답은 JSON-escaped HTML 문자열일 수 있음
  let html: string;
  try {
    const parsed = JSON.parse(resp.body);
    html = typeof parsed === 'string' ? parsed : resp.body;
  } catch {
    html = resp.body;
  }

  // 파싱 — 여러 패턴 폴백 (학교 사이트 HTML 변경 내성)
  const events: Array<{ startDate: string; endDate: string; title: string; seq: string }> = [];

  // 패턴 A: viewSchdulInfo('SEQ', 'YYYY/MM/DD', 'YYYY/MM/DD', '...');">제목</a>
  const reA = /viewSchdulInfo\(['"](\d+)['"],\s*['"](\d{4}\/\d{2}\/\d{2})['"],\s*['"](\d{4}\/\d{2}\/\d{2})['"][^)]*\)[^>]*>([^<]+)<\/a>/g;
  // 패턴 B: 따옴표 형식이 escape된 경우 (\")
  const reB = /viewSchdulInfo\(\\?['"](\d+)\\?['"],\s*\\?['"](\d{4}\/\d{2}\/\d{2})\\?['"],\s*\\?['"](\d{4}\/\d{2}\/\d{2})\\?['"][^)]*\)[^>]*>([^<]+)<\/a>/g;
  // 패턴 C: title 위치가 a 태그 다른 속성 안에 있는 경우 (title="...")
  const reC = /viewSchdulInfo\(['"](\d+)['"],\s*['"](\d{4}\/\d{2}\/\d{2})['"],\s*['"](\d{4}\/\d{2}\/\d{2})['"][^)]*\)[^>]*title=['"]([^'"]+)['"]/g;

  for (const re of [reA, reB, reC]) {
    let m;
    while ((m = re.exec(html)) !== null) {
      const seq = m[1];
      // 중복 SEQ 방지
      if (events.some((e) => e.seq === seq)) continue;
      events.push({
        seq,
        startDate: m[2].replace(/\//g, '-'),
        endDate: m[3].replace(/\//g, '-'),
        title: m[4].trim(),
      });
    }
    if (events.length > 0) break; // 첫 패턴이 잡으면 다음 안 시도
  }

  if (events.length === 0) {
    const snippet = html.slice(0, 100).replace(/\s+/g, ' ');
    throw shortError('학사일정', `일정 0건 — 학교 사이트 구조 변경 의심 (${html.length} bytes, 시작: ${snippet})`);
  }

  return { events };
}

/** 주간 급식 조회 — YYYYMMDD 기준 1주일 식단 */
export async function fetchSchoolMeal(schoolKey: SchoolKey, dateYMD?: string): Promise<{
  weekStart: string;
  weekEnd: string;
  days: Array<{ date: string; weekday: string; menu: string[]; calorie: string }>;
}> {
  const s = SCHOOLS[schoolKey];

  // 🔴 C1 수정: 1단계로 메인(또는 학교 첫) 페이지에서 세션 쿠키 받기
  const seedUrl = `${s.base}/${s.sysId}/ad/fm/foodmenu/selectFoodMenuView.do?mi=${s.mealMi}`;
  let seed;
  try {
    seed = await httpRequest(seedUrl, { method: 'GET', headers: COMMON_HEADERS });
  } catch (e: any) {
    throw shortError('급식', `학교 사이트 접속 실패 — ${e?.message || e}`);
  }
  if (seed.status !== 200) throw shortError('급식', `메인 페이지 HTTP ${seed.status}`);
  const cookieHeader = buildCookieHeader(seed.setCookie);

  // 2단계: 날짜 지정 페이지 — 세션 쿠키 포함
  // (dateYMD 미지정이면 seed 응답을 그대로 사용)
  let html = seed.body;
  if (dateYMD) {
    const url = `${seedUrl}&schulCode=&ymd=${dateYMD}`;
    let resp;
    try {
      resp = await httpRequest(url, {
        method: 'GET',
        headers: {
          ...COMMON_HEADERS,
          'Referer': seedUrl,
          ...(cookieHeader && { 'Cookie': cookieHeader }),
        },
      });
    } catch (e: any) {
      throw shortError('급식', `날짜 페이지 접속 실패 — ${e?.message || e}`);
    }
    if (resp.status !== 200) throw shortError('급식', `날짜 페이지 HTTP ${resp.status}`);
    html = resp.body;
  }

  if (!html || html.length < 200) {
    throw shortError('급식', `응답 본문 부족 (${html?.length || 0} bytes)`);
  }

  // 주차 헤더
  const weekMatch = html.match(/급식일\s*:\s*(\d{4})년(\d{2})월(\d{2})일\s*~\s*(\d{4})년(\d{2})월(\d{2})일/);
  const weekStart = weekMatch ? `${weekMatch[1]}-${weekMatch[2]}-${weekMatch[3]}` : '';
  const weekEnd = weekMatch ? `${weekMatch[4]}-${weekMatch[5]}-${weekMatch[6]}` : '';

  // 7일 날짜 헤더 — 다양한 br/공백 변형 대응
  const headerRe = /<th[^>]*scope=['"]col['"][^>]*>\s*([일월화수목금토])\s*<br[^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/th>/g;
  const headers: Array<{ weekday: string; date: string }> = [];
  let hm;
  while ((hm = headerRe.exec(html)) !== null) {
    headers.push({ weekday: hm[1], date: hm[2] });
  }
  if (headers.length === 0) {
    const snippet = html.slice(0, 100).replace(/\s+/g, ' ');
    throw shortError('급식', `일자 헤더 0건 — 사이트 구조 변경 의심 (${html.length} bytes, 시작: ${snippet})`);
  }

  // tbody 내 td 파싱
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  const days: Array<{ date: string; weekday: string; menu: string[]; calorie: string }> = headers.map((h) => ({
    ...h,
    menu: [],
    calorie: '',
  }));
  if (tbodyMatch) {
    const tbody = tbodyMatch[1];
    const tdRe = /<td>([\s\S]*?)<\/td>/g;
    const tds: string[] = [];
    let tdm;
    while ((tdm = tdRe.exec(tbody)) !== null) {
      tds.push(tdm[1]);
    }
    for (let i = 0; i < days.length && i < tds.length; i++) {
      const td = tds[i];
      const calMatch = td.match(/fm_tit_p[^>]*>([^<]+)</);
      days[i].calorie = calMatch ? calMatch[1].trim() : '';
      const menuMatches = [...td.matchAll(/<p class="">([\s\S]*?)<\/p>/g)];
      if (menuMatches.length > 0) {
        const menuRaw = menuMatches[menuMatches.length - 1][1];
        const items = menuRaw
          .split(/<br\s*\/?>/g)
          .map((item) => item.replace(/<[^>]+>/g, '').replace(/\([\d.,\s]+\)/g, '').trim())
          .filter((item) => item.length > 0);
        days[i].menu = items;
      }
    }
  }

  return { weekStart, weekEnd, days };
}
