import { create } from 'zustand';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../utils/firebase';
import type { ComciganConfig, ComciganLinkDoc, ComciganLinkEntry, ComciganSchoolGrid, School } from '@shared/types';
import type { DutyLabelLinks } from '../utils/dutyEntries';
import type { SchoolGrids, SchoolLinks } from '../utils/meetingFinder';
import { useComciganStore } from './comciganStore';

export const LINK_SCHOOLS: School[] = ['taeseong_middle', 'taeseong_high'];

/** 내 컴시간 설정의 학교가 어느 쪽인지. 연결표가 없어도 내 학교만은 볼 수 있게 한다. */
function schoolOfName(name: string | undefined): School | null {
  if (!name) return null;
  if (name.includes('태성중')) return 'taeseong_middle';
  if (name.includes('태성고')) return 'taeseong_high';
  return null;
}

export interface GridTarget {
  school: School;
  code: number;
  maxGrade: number;
}

/** 시간표를 읽을 학교: 연결표에 코드가 있는 학교와 내 컴시간 설정의 학교 */
export function gridTargets(links: SchoolLinks, config: ComciganConfig | null): GridTarget[] {
  const targets: GridTarget[] = [];
  for (const school of LINK_SCHOOLS) {
    const link = links[school];
    if (link?.schoolCode) targets.push({ school, code: link.schoolCode, maxGrade: link.maxGrade || 3 });
  }
  const own = schoolOfName(config?.schoolName);
  if (config && own && !targets.some((t) => t.school === own)) {
    targets.push({ school: own, code: config.schoolCode, maxGrade: config.maxGrade || 3 });
  }
  return targets;
}

interface SaveLinksInput {
  school: School;
  schoolCode: number;
  schoolName: string;
  maxGrade: number;
  entries: ComciganLinkEntry[];
  updatedBy: string;
}

interface ComciganLinksState {
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
  /** 연결표에 코드가 있는 학교와 내 컴시간 설정의 학교를 읽는다 */
  loadGrids: (force?: boolean) => Promise<void>;
  /** 연결표를 쓰는 관리자 화면에서 학교 하나를 읽는다 */
  loadGrid: (school: School, schoolCode: number, maxGrade: number, force?: boolean) => Promise<ComciganSchoolGrid>;
  saveLinks: (input: SaveLinksInput) => Promise<void>;
}

export const useComciganLinksStore = create<ComciganLinksState>((set, get) => ({
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
    const settled = () => {
      pending -= 1;
      if (pending <= 0) set({ linksLoaded: true });
    };
    const unsubscribers = LINK_SCHOOLS.map((school) => {
      let first = true;
      const once = () => {
        if (first) { first = false; settled(); }
      };
      return onSnapshot(doc(db, 'comcigan_links', school), (snap) => {
        const data = snap.exists() ? snap.data() : null;
        set((state) => ({
          linksDenied: false,
          links: {
            ...state.links,
            [school]: data
              ? {
                school,
                schoolCode: Number(data.schoolCode) || 0,
                schoolName: data.schoolName || '',
                maxGrade: Number(data.maxGrade) || 3,
                entries: Array.isArray(data.entries) ? data.entries : [],
                updatedBy: data.updatedBy,
                updatedAt: data.updatedAt?.toDate?.() ?? null,
              } as ComciganLinkDoc
              : undefined,
          },
        }));
        once();
      }, (err) => {
        console.warn('[ComciganLinks] subscription error:', err);
        set({ linksDenied: true });
        once();
      });
    });
    set({ unsubscribers });
  },

  cleanup: () => {
    get().unsubscribers.forEach((unsub) => unsub());
    set({ unsubscribers: [], links: {}, linksLoaded: false, linksDenied: false, grids: {}, gridError: null });
  },

  loadGrids: async (force = false) => {
    const targets = gridTargets(get().links, useComciganStore.getState().config);
    if (targets.length === 0) {
      set({ gridLoading: false, gridError: null });
      return;
    }
    set({ gridLoading: true, gridError: null });
    const results = await Promise.allSettled(
      targets.map((t) => get().loadGrid(t.school, t.code, t.maxGrade, force)),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    set({
      gridLoading: false,
      gridError: failed > 0 ? '컴시간에서 시간표를 받지 못했습니다. 잠시 뒤 다시 시도해 주세요.' : null,
    });
  },

  loadGrid: async (school, schoolCode, maxGrade, force = false) => {
    const api = window.electronAPI;
    if (!api?.comciganSchoolGrid) throw new Error('이 환경에서는 컴시간을 읽을 수 없습니다');
    const grid = await api.comciganSchoolGrid(schoolCode, maxGrade, force);
    set((state) => ({ grids: { ...state.grids, [school]: grid } }));
    return grid;
  },

  saveLinks: async ({ school, schoolCode, schoolName, maxGrade, entries, updatedBy }) => {
    await setDoc(doc(db, 'comcigan_links', school), {
      school,
      schoolCode,
      schoolName,
      maxGrade,
      entries: entries.map(({ label, userId, name }) => ({ label, userId, name })),
      updatedBy,
      updatedAt: serverTimestamp(),
    });
  },
}));

/** 표기로 된 감독표에서 내 차례를 가리는 데 쓴다 */
export function labelLinksFor(links: SchoolLinks, userId: string | undefined): DutyLabelLinks {
  const mine: DutyLabelLinks['mine'] = {};
  const others = new Set<string>();
  for (const school of LINK_SCHOOLS) {
    for (const entry of links[school]?.entries ?? []) {
      if (entry.userId === userId) mine[school] = [...(mine[school] ?? []), entry.label];
      else others.add(entry.label);
    }
  }
  // 겸임 교사의 표기는 다른 학교에서 다른 사람 표기로 치지 않는다
  Object.values(mine).flat().forEach((label) => others.delete(label as string));
  return { mine, others };
}

/** 연결표에서 표기 → 이름. 같은 표기를 다른 사람이 쓰면 이름으로 바꾸지 않는다. */
export function labelNamesOf(links: SchoolLinks, school: School | 'all'): Record<string, string> {
  const names: Record<string, string> = {};
  const clash = new Set<string>();
  for (const key of LINK_SCHOOLS) {
    if (school !== 'all' && school !== key) continue;
    for (const entry of links[key]?.entries ?? []) {
      if (names[entry.label] && names[entry.label] !== entry.name) clash.add(entry.label);
      names[entry.label] = entry.name;
    }
  }
  clash.forEach((label) => delete names[label]);
  return names;
}
