/**
 * NEIS 학사일정 (SchoolSchedule) API.
 * 학교별 교육청+학교 코드로 학사일정을 가져와 CalendarEvent 형식으로 변환.
 */

interface NeisConfig { education: string; school: string; }

interface NeisScheduleItem {
  date: string; // YYYY-MM-DD
  title: string;
  content: string;
}

export function getNeisConfig(schoolKey: string): NeisConfig | null {
  try {
    const raw = localStorage.getItem(`tonet-neis-${schoolKey}`);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('[NEIS] getNeisConfig failed:', err);
    return null;
  }
}

export function removeNeisConfig(schoolKey: string): void {
  try { localStorage.removeItem(`tonet-neis-${schoolKey}`); }
  catch (err) { console.warn('[NEIS] removeNeisConfig failed:', err); }
}

export function setNeisConfig(schoolKey: string, cfg: NeisConfig): void {
  try { localStorage.setItem(`tonet-neis-${schoolKey}`, JSON.stringify(cfg)); }
  catch (err) { console.warn('[NEIS] setNeisConfig failed:', err); }
}

/**
 * 기간 내 학사일정 가져오기.
 */
export async function fetchNeisSchedule(
  schoolKey: string,
  from: Date,
  to: Date,
): Promise<NeisScheduleItem[]> {
  const cfg = getNeisConfig(schoolKey);
  if (!cfg) throw new Error('NEIS 학교 코드가 설정되지 않았습니다');

  const fmt = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

  const url = `https://open.neis.go.kr/hub/SchoolSchedule?Type=json&pIndex=1&pSize=300&ATPT_OFCDC_SC_CODE=${cfg.education}&SD_SCHUL_CODE=${cfg.school}&AA_FROM_YMD=${fmt(from)}&AA_TO_YMD=${fmt(to)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NEIS HTTP ${res.status}`);
  const json = await res.json();

  if (json?.RESULT && json.RESULT.CODE !== 'INFO-000') {
    return [];
  }

  const rows = json?.SchoolSchedule?.[1]?.row || [];
  return rows.map((r: any) => ({
    date: r.AA_YMD, // YYYYMMDD
    title: (r.EVENT_NM || '').trim(),
    content: (r.EVENT_CNTNT || '').trim(),
  })).filter((item: NeisScheduleItem) => item.title);
}

/**
 * NEIS 일정을 Firestore events 컬렉션에 추가.
 * 중복 방지를 위해 externalId (neis_YYYYMMDD_title) 사용.
 */
import { collection, addDoc, query, where, getDocs, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { School } from '@shared/types';

export async function importNeisScheduleToFirestore(
  schoolKey: School,
  userId: string,
  userName: string,
  from: Date,
  to: Date,
): Promise<number> {
  const items = await fetchNeisSchedule(schoolKey, from, to);
  if (items.length === 0) return 0;

  // 이미 import 된 일정 중복 방지 — externalId 필드 사용
  const existingQ = query(
    collection(db, 'events'),
    where('school', '==', schoolKey),
    where('neisImport', '==', true),
  );
  const existingSnap = await getDocs(existingQ);
  const existingIds = new Set(existingSnap.docs.map((d) => d.data().externalId));

  let imported = 0;
  for (const item of items) {
    const externalId = `neis_${item.date}_${item.title}`;
    if (existingIds.has(externalId)) continue;

    const year = parseInt(item.date.slice(0, 4));
    const month = parseInt(item.date.slice(4, 6)) - 1;
    const day = parseInt(item.date.slice(6, 8));
    const startDate = new Date(year, month, day, 0, 0, 0);
    const endDate = new Date(year, month, day, 23, 59, 59);

    await addDoc(collection(db, 'events'), {
      title: item.title,
      description: item.content || '',
      startDate: Timestamp.fromDate(startDate),
      endDate: Timestamp.fromDate(endDate),
      allDay: true,
      category: 'event',
      school: schoolKey,
      createdBy: userId,
      adminName: userName,
      adminColor: '#8B5CF6', // 학사일정 전용 색상 — 보라색
      repeat: null,
      attachments: [],
      checklist: [],
      readBy: {},
      neisImport: true,
      externalId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    imported++;
  }
  return imported;
}
