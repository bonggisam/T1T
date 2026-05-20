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
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
};

function httpRequest(urlStr: string, options: https.RequestOptions, body?: string): Promise<{ status: number; body: string; setCookie: string[] }> {
  return new Promise((resolve, reject) => {
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
        resolve({
          status: res.statusCode || 0,
          body: Buffer.concat(chunks).toString('utf-8'),
          setCookie,
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Timeout')));
    if (body) req.write(body);
    req.end();
  });
}

/** 학사일정 조회 — 1년치 데이터를 가져옴 */
export async function fetchSchoolSchedule(schoolKey: SchoolKey): Promise<{
  events: Array<{ startDate: string; endDate: string; title: string; seq: string }>;
}> {
  const s = SCHOOLS[schoolKey];

  // 1단계: 메인 페이지로 세션 쿠키 받기
  const page = await httpRequest(
    `${s.base}/${s.sysId}/ps/schdul/selectSchdulMainList.do?mi=${s.scheduleMi}`,
    { method: 'GET', headers: COMMON_HEADERS },
  );
  const cookieHeader = page.setCookie
    .map((c) => c.split(';')[0])
    .join('; ');

  // 2단계: AJAX 호출로 연간 일정 받기
  const ajaxBody = 'schdulLevel=Y&fromDate=&toDate=&date=&schdulSeq=';
  const resp = await httpRequest(
    `${s.base}/${s.sysId}/ps/schdul/selectSchdulList.do?mi=${s.scheduleMi}`,
    {
      method: 'POST',
      headers: {
        ...COMMON_HEADERS,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `${s.base}/${s.sysId}/ps/schdul/selectSchdulMainList.do?mi=${s.scheduleMi}`,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Content-Length': String(Buffer.byteLength(ajaxBody)),
        'Cookie': cookieHeader,
      },
    },
    ajaxBody,
  );

  if (resp.status !== 200) throw new Error(`HTTP ${resp.status}`);

  // 응답은 JSON-escaped HTML 문자열. JSON.parse로 풀기
  let html: string;
  try { html = JSON.parse(resp.body); }
  catch { html = resp.body; }

  // 파싱: viewSchdulInfo('SEQ', 'YYYY/MM/DD', 'YYYY/MM/DD', '...');"...">제목</a>
  const events: Array<{ startDate: string; endDate: string; title: string; seq: string }> = [];
  // 예: <a href="javascript:viewSchdulInfo('62087', '2026/01/01', '2026/01/01', '');">신정</a>
  const re = /viewSchdulInfo\('(\d+)',\s*'(\d{4}\/\d{2}\/\d{2})',\s*'(\d{4}\/\d{2}\/\d{2})',\s*'[^']*'\);">([^<]+)<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    events.push({
      seq: m[1],
      startDate: m[2].replace(/\//g, '-'),
      endDate: m[3].replace(/\//g, '-'),
      title: m[4].trim(),
    });
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

  // 페이지 GET — 날짜 파라미터를 ymd 형태로 전달 시 해당 주차로 이동
  const url = dateYMD
    ? `${s.base}/${s.sysId}/ad/fm/foodmenu/selectFoodMenuView.do?mi=${s.mealMi}&schulCode=&ymd=${dateYMD}`
    : `${s.base}/${s.sysId}/ad/fm/foodmenu/selectFoodMenuView.do?mi=${s.mealMi}`;
  const resp = await httpRequest(url, { method: 'GET', headers: COMMON_HEADERS });
  if (resp.status !== 200) throw new Error(`HTTP ${resp.status}`);
  const html = resp.body;

  // 주차 헤더: 급식일 : 2026년05월17일 ~ 2026년05월23일
  const weekMatch = html.match(/급식일\s*:\s*(\d{4})년(\d{2})월(\d{2})일\s*~\s*(\d{4})년(\d{2})월(\d{2})일/);
  const weekStart = weekMatch ? `${weekMatch[1]}-${weekMatch[2]}-${weekMatch[3]}` : '';
  const weekEnd = weekMatch ? `${weekMatch[4]}-${weekMatch[5]}-${weekMatch[6]}` : '';

  // 7일 날짜 헤더 (일~토): <th scope="col">일 <br>2026-05-17</th>
  const headerRe = /<th scope="col">([일월화수목금토])\s*<br>(\d{4}-\d{2}-\d{2})<\/th>/g;
  const headers: Array<{ weekday: string; date: string }> = [];
  let hm;
  while ((hm = headerRe.exec(html)) !== null) {
    headers.push({ weekday: hm[1], date: hm[2] });
  }

  // <tbody>...<tr> ... <th>중식</th><td>...메뉴...</td>...
  // 각 td 안의 <p class="">메뉴</p> 추출 + <p class="fm_tit_p mgt15">XXXKcal</p>
  // tbody 내 첫 번째 <tr> (중식)만 대상 — tr 구조에서 td만 7개 추출
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  const days: Array<{ date: string; weekday: string; menu: string[]; calorie: string }> = headers.map((h) => ({
    ...h,
    menu: [],
    calorie: '',
  }));
  if (tbodyMatch) {
    const tbody = tbodyMatch[1];
    // 모든 td 추출
    const tdRe = /<td>([\s\S]*?)<\/td>/g;
    const tds: string[] = [];
    let tdm;
    while ((tdm = tdRe.exec(tbody)) !== null) {
      tds.push(tdm[1]);
    }
    // 헤더(td 수)와 매칭
    for (let i = 0; i < days.length && i < tds.length; i++) {
      const td = tds[i];
      // 칼로리: <p class="fm_tit_p mgt15">1,304Kcal</p>
      const calMatch = td.match(/fm_tit_p[^>]*>([^<]+)</);
      days[i].calorie = calMatch ? calMatch[1].trim() : '';
      // 메뉴: <p class="">아이템1<br/>(알레르기)<br/>아이템2...</p> — 마지막 <p class="">만
      const menuMatches = [...td.matchAll(/<p class="">([\s\S]*?)<\/p>/g)];
      if (menuMatches.length > 0) {
        const menuRaw = menuMatches[menuMatches.length - 1][1];
        // 알레르기 정보 (숫자.숫자) 제거, <br/> 줄바꿈
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
