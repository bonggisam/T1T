import { create } from 'zustand';

/**
 * 수업 화면 보호.
 *
 * 항상 위 창은 프로젝터나 전자칠판에 그대로 비친다. 개인 일정이 학생에게 보이면 안 되므로
 * 내 수업 시간에는 자동으로 가리고, 단축키로 언제든 숨기거나 잠시 보이게 한다.
 *
 * 저장하지 않는다. 앱을 다시 켜면 항상 자동 상태로 돌아가 안전한 쪽에서 시작한다.
 */
type Manual = 'hide' | 'show' | null;

export function computeHidden(inClass: boolean, manual: Manual): boolean {
  return manual === 'hide' || (inClass && manual !== 'show');
}

interface PrivacyState {
  /** 지금 내 수업 시간인가 */
  inClass: boolean;
  /** 사용자가 단축키로 정한 상태. hide는 다시 누를 때까지, show는 이번 수업이 끝날 때까지 유지 */
  manual: Manual;
  setInClass: (inClass: boolean) => void;
  toggle: () => void;
}

export const usePrivacyStore = create<PrivacyState>((set, get) => ({
  inClass: false,
  manual: null,

  setInClass: (inClass) => {
    const { inClass: was, manual } = get();
    if (was === inClass) return;
    // 수업이 끝나면 "잠시 보기"를 풀어, 다음 수업에서 다시 자동으로 가려지게 한다
    set({ inClass, manual: !inClass && manual === 'show' ? null : manual });
  },

  toggle: () => {
    const { inClass, manual } = get();
    if (computeHidden(inClass, manual)) {
      set({ manual: inClass ? 'show' : null });
    } else {
      set({ manual: 'hide' });
    }
  },
}));

/** React 밖(알림 등)에서 쓰는 현재 상태 */
export function isPersonalHidden(): boolean {
  const { inClass, manual } = usePrivacyStore.getState();
  return computeHidden(inClass, manual);
}

export function usePersonalHidden(): boolean {
  return usePrivacyStore((s) => computeHidden(s.inClass, s.manual));
}
