import { create } from 'zustand';

/**
 * 창 위치 잠금. 잠그면 창을 옮기거나 크기를 바꾸지 못한다.
 * 내용을 누르고 입력하는 것은 잠금과 상관없이 그대로 된다.
 * 켤 때의 상태는 메인 프로세스가 정하고(기본은 풀림), 제목 줄이 받아 맞춘다.
 */
function applyToPage(locked: boolean): void {
  document.documentElement.classList.toggle('window-locked', locked);
}

interface WindowLockState {
  locked: boolean;
  setLocked: (locked: boolean) => void;
}

applyToPage(false);

export const useWindowLockStore = create<WindowLockState>((set) => ({
  locked: false,
  setLocked: (locked) => {
    applyToPage(locked);
    set({ locked });
  },
}));
