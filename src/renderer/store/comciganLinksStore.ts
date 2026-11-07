import { create } from 'zustand';
import { onSnapshot } from 'firebase/firestore';
import { SCHOOL_LABELS } from '@shared/types';
import type { BaseTimetable, ComciganLinkDoc, School, TeachingAssignment } from '@shared/types';
import { getNeisConfig } from '../utils/neisSchedule';
import { loadNeisWeek, NeisTimetableError } from '../utils/neisTimetable';
import { buildSchoolGrid } from '../utils/teachingAssignments';
import {
  baseDoc, parseAssignmentDoc, parseBaseDoc, parseClassTimesDoc, schoolTimesDoc, teachersCollection,
} from '../utils/teachingDocs';
import type { SchoolGrids, SchoolLinks } from '../utils/meetingFinder';
import { useUsersStore } from './usersStore';

export const LINK_SCHOOLS: School[] = ['taeseong_middle', 'taeseong_high'];

function schoolCodeOf(school: School): number {
  return Number(getNeisConfig(school)?.school) || 0;
}

type UserRow = { id: string; name: string; school: string };

/** 표의 이름을 계정과 잇는다. 같은 이름이 여럿이면 그 학교 사람을 고르고, 그래도 여럿이면 잇지 않는다 */
function linkOf(name: string, school: School, users: UserRow[]): UserRow | null {
  const same = users.filter((u) => u.name.trim() === name);
  if (same.length === 1) return same[0];
  const inSchool = same.filter((u) => u.school === school);
  return inSchool.length === 1 ? inSchool[0] : null;
}

/** 회의 찾기가 쓰는 표기와 계정 연결. 이제 표기가 곧 이름이다 */
function deriveLinks(assignments: Partial<Record<School, TeachingAssignment[]>>, users: UserRow[]): SchoolLinks {
  const links: SchoolLinks = {};
  for (const school of LINK_SCHOOLS) {
    const rows = assignments[school];
    if (!rows) continue;
    const doc: ComciganLinkDoc = {
      school,
      schoolCode: schoolCodeOf(school),
      schoolName: SCHOOL_LABELS[school],
      maxGrade: 3,
      entries: rows.flatMap((row) => {
        const user = linkOf(row.name, school, users);
        return user ? [{ label: row.name, userId: user.id, name: user.name }] : [];
      }),
    };
    links[school] = doc;
  }
  return links;
}

interface ComciganLinksState {
  /** 학교별 담당 학급 표 */
  assignments: Partial<Record<School, TeachingAssignment[]>>;
  /** 학교별 시정표 */
  classTimes: Partial<Record<School, string[]>>;
  /** 학교별 기초 시간표. 컴시간 파일을 올린 적이 없으면 null */
  bases: Partial<Record<School, BaseTimetable | null>>;
  /** 기초 시간표를 읽을 권한이 없다. 서버 규칙이 아직 배포되지 않았다 */
  basesDenied: boolean;
  links: SchoolLinks;
  linksLoaded: boolean;
  /** 서버 규칙이 아직 배포되지 않았거나 읽을 권한이 없다 */
  linksDenied: boolean;
  grids: SchoolGrids;
  gridLoading: boolean;
  gridError: string | null;
  unsubscribers: Array<() => void>;

  subscribe: () => void;
  cleanup: () => void;
  loadGrids: (force?: boolean) => Promise<void>;
}

export const useComciganLinksStore = create<ComciganLinksState>((set, get) => ({
  assignments: {},
  classTimes: {},
  bases: {},
  basesDenied: false,
  links: {},
  linksLoaded: false,
  linksDenied: false,
  grids: {},
  gridLoading: false,
  gridError: null,
  unsubscribers: [],

  subscribe: () => {
    get().unsubscribers.forEach((unsub) => unsub());
    let pending = LINK_SCHOOLS.length;
    const relink = () => {
      set((state) => ({ links: deriveLinks(state.assignments, useUsersStore.getState().users) }));
    };
    const unsubscribers: Array<() => void> = LINK_SCHOOLS.flatMap((school) => {
      let first = true;
      const once = () => {
        if (!first) return;
        first = false;
        pending -= 1;
        if (pending <= 0) set({ linksLoaded: true });
      };
      return [
        onSnapshot(teachersCollection(school), (snap) => {
          const rows = snap.docs.map((d) => parseAssignmentDoc(d.id, d.data()));
          set((state) => ({
            linksDenied: false,
            assignments: { ...state.assignments, [school]: rows },
          }));
          relink();
          once();
        }, (err) => {
          console.warn('[Teaching] subscription error:', err);
          set({ linksDenied: true });
          once();
        }),
        onSnapshot(schoolTimesDoc(school), (snap) => {
          const times = snap.exists() ? parseClassTimesDoc(snap.data()) : [];
          set((state) => ({ classTimes: { ...state.classTimes, [school]: times } }));
        }, (err) => console.warn('[Teaching] class times error:', err)),
        // 규칙이 아직 없는 서버에서는 읽지 못한다. 그러면 담당 학급 표만으로 맞춘다
        onSnapshot(baseDoc(school), (snap) => {
          const base = snap.exists() ? parseBaseDoc(school, snap.data()) : null;
          set((state) => ({ basesDenied: false, bases: { ...state.bases, [school]: base } }));
        }, (err) => {
          console.warn('[Teaching] base timetable error:', err);
          set({ basesDenied: true });
        }),
      ];
    });
    // 가입이나 이름 변경으로 명단이 바뀌면 다시 잇는다
    unsubscribers.push(useUsersStore.subscribe((state, prev) => {
      if (state.users !== prev.users) relink();
    }));
    set({ unsubscribers });
  },

  cleanup: () => {
    get().unsubscribers.forEach((unsub) => unsub());
    set({
      unsubscribers: [],
      assignments: {},
      classTimes: {},
      bases: {},
      basesDenied: false,
      links: {},
      linksLoaded: false,
      linksDenied: false,
      grids: {},
      gridError: null,
    });
  },

  loadGrids: async (force = false) => {
    const { assignments, classTimes, bases } = get();
    const targets = LINK_SCHOOLS.filter((school) => (assignments[school]?.length ?? 0) > 0);
    if (targets.length === 0) {
      set({ gridLoading: false, gridError: null, grids: {} });
      return;
    }
    set({ gridLoading: true, gridError: null });
    const results = await Promise.allSettled(targets.map(async (school) => {
      const week = await loadNeisWeek(school, force);
      return {
        school,
        grid: buildSchoolGrid(
          schoolCodeOf(school), week.cells, assignments[school] ?? [], classTimes[school] ?? [], bases[school]?.lessons,
        ),
      };
    }));
    const grids: SchoolGrids = {};
    let failure: string | null = null;
    results.forEach((result) => {
      if (result.status === 'fulfilled') grids[result.value.school] = result.value.grid;
      else {
        console.warn('[Teaching] grid failed:', result.reason);
        failure = result.reason instanceof NeisTimetableError
          ? result.reason.message
          : '나이스에서 시간표를 받지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
      }
    });
    set({ grids, gridLoading: false, gridError: failure });
  },
}));
