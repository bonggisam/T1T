import { create } from 'zustand';

/**
 * 창 위치 잠금. 잠그면 창을 옮기거나 크기를 바꾸지 못한다.
 * 내용을 누르고 입력하는 것은 잠금과 상관없이 그대로 된다.
 */
function applyToPage(locked: boolean): void {
  document.documentElement.classList.toggle('window-locked', locked);
}

interface WindowLockState {
  locked: boolean;
  setLocked: (locked: boolean) => void;
}

applyToPage(true);

export const useWindowLockStore = create<WindowLockState>((set) => ({
  locked: true,
  setLocked: (locked) => {
    applyToPage(locked);
    set({ locked });
  },
}));
