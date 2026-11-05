/**
 * 컴시간 표기와 계정 연결표 계산.
 *
 * 컴시간은 교사 이름을 두 글자로만 보여 주므로 이름 앞 두 글자로 후보를 찾아 제안하고,
 * 관리자가 확인해 저장한 값만 연결로 친다.
 */
import type { ComciganLinkEntry } from '@shared/types';

export interface LinkUser {
  id: string;
  name: string;
  school?: string;
}

/**
 * linked=저장된 연결, suggested=후보가 하나라 제안, ambiguous=후보가 여럿, none=후보 없음
 */
export type LinkStatus = 'linked' | 'suggested' | 'ambiguous' | 'none';

export interface LinkRow {
  label: string;
  /** 지금 고른 계정. 제안이면 저장 전이다 */
  userId: string | null;
  name: string | null;
  status: LinkStatus;
  candidates: LinkUser[];
  /** 이번 주 시간표에 없는 표기 (휴직, 표기 변경 등) */
  inTimetable: boolean;
  /** 연결된 계정이 비활성이 되었거나 사라짐 */
  accountGone: boolean;
  /** 고른 계정이 다른 학교 소속 (겸임) */
  otherSchool: boolean;
}

function labelOfName(name: string): string {
  return name.replace(/\s+/g, '').slice(0, 2);
}

export function buildLinkRows(
  labels: string[],
  saved: ComciganLinkEntry[],
  users: LinkUser[],
  school: string,
): LinkRow[] {
  const known = new Set(labels);
  const all = [...labels, ...saved.map((e) => e.label).filter((l) => !known.has(l))];
  const rows = all.map((label): LinkRow => {
    const candidates = users.filter((u) => labelOfName(u.name) === label);
    const sameSchool = candidates.filter((u) => u.school === school);
    const entry = saved.find((e) => e.label === label);
    if (entry) {
      const account = users.find((u) => u.id === entry.userId);
      return {
        label,
        userId: entry.userId,
        name: account?.name ?? entry.name,
        status: 'linked',
        candidates,
        inTimetable: known.has(label),
        accountGone: !account,
        otherSchool: !!account && !!account.school && account.school !== school,
      };
    }
    // 같은 학교 후보를 먼저 본다. 같은 학교에 없을 때만 다른 학교(겸임) 후보를 제안한다.
    const pool = sameSchool.length > 0 ? sameSchool : candidates;
    if (pool.length === 1) {
      return {
        label,
        userId: pool[0].id,
        name: pool[0].name,
        status: 'suggested',
        candidates,
        inTimetable: true,
        accountGone: false,
        otherSchool: pool[0].school !== school,
      };
    }
    return {
      label,
      userId: null,
      name: null,
      status: pool.length > 1 ? 'ambiguous' : 'none',
      candidates,
      inTimetable: true,
      accountGone: false,
      otherSchool: false,
    };
  });
  return rows.sort((a, b) => a.label.localeCompare(b.label, 'ko'));
}

/** 관리자가 표에서 계정을 바꾼다. 비우면 후보 수에 따라 상태를 되돌린다. */
export function chooseAccount(row: LinkRow, user: LinkUser | null, school: string): LinkRow {
  if (!user) {
    return {
      ...row,
      userId: null,
      name: null,
      status: row.candidates.length > 1 ? 'ambiguous' : 'none',
      accountGone: false,
      otherSchool: false,
    };
  }
  return {
    ...row,
    userId: user.id,
    name: user.name,
    status: 'linked',
    accountGone: false,
    otherSchool: !!user.school && user.school !== school,
  };
}

/** 같은 학교에서 한 계정을 여러 표기에 연결한 경우. 저장은 막지 않고 알려 준다. */
export function duplicateUserIds(rows: LinkRow[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const row of rows) {
    if (!row.userId) continue;
    if (seen.has(row.userId)) duplicates.add(row.userId);
    seen.add(row.userId);
  }
  return duplicates;
}

/** 저장할 값. 제안은 "제안 모두 적용"이나 직접 고른 뒤에야 연결이 된다. */
export function linkEntriesOf(rows: LinkRow[]): ComciganLinkEntry[] {
  return rows
    .filter((r) => r.status === 'linked' && r.userId && r.name)
    .map((r) => ({ label: r.label, userId: r.userId as string, name: r.name as string }));
}

export function needsAttention(row: LinkRow): boolean {
  return row.status !== 'linked' || row.accountGone || !row.inTimetable;
}
