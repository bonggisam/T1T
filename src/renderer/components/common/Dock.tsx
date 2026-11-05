import React, { useRef, useState } from 'react';

/*
 * 아이콘에 마우스를 가까이 대면 애플 독처럼 커지고 이름이 나온다.
 * 크기는 화면 변환으로만 바꾼다. 줄의 배치가 흔들리지 않고 옆 칸과 겹치지 않는다.
 * 이름은 마우스 화살표에 가리지 않는 쪽에 띄운다. 화살표는 오른쪽 아래로 뻗으므로 위나 왼쪽이 좋다.
 */

interface DockProps {
  /** 커서 바로 아래 아이콘의 배율 */
  maxScale?: number;
  /** 이 거리 안의 아이콘이 함께 커진다 (px) */
  radius?: number;
  /** 이름을 띄울 쪽. 창 맨 위에 붙은 아이콘은 위쪽에 자리가 없어 왼쪽에 띄운다 */
  tipSide?: 'above' | 'left';
  className?: string;
  style?: React.CSSProperties;
  role?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}

interface Tip {
  text: string;
  left: number;
  top: number;
}

const TIP_GAP = 3;
const TIP_MARGIN = 4;
const EDGE_MARGIN = 3;

function scaleAt(distance: number, maxScale: number, radius: number): number {
  if (distance >= radius) return 1;
  const near = Math.cos((distance / radius) * (Math.PI / 2));
  return 1 + (maxScale - 1) * near * near;
}

function prefersLessMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** 아이콘에는 className="dock-item"과 data-dock-label을 준다 */
export function Dock({ maxScale = 1.7, radius = 72, tipSide = 'above', className, style, role, ariaLabel, children }: DockProps) {
  const root = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  function reset() {
    root.current?.querySelectorAll<HTMLElement>('.dock-item').forEach((el) => {
      el.style.transform = '';
      el.removeAttribute('data-near');
    });
    setTip(null);
  }

  function update(x: number) {
    const box = root.current;
    if (!box) return;
    const items = [...box.querySelectorAll<HTMLElement>('.dock-item')];
    if (items.length === 0) return;
    // 창이 아주 좁아 두 줄로 접히면 밀어내기를 하지 않고 이름과 색만 바꾼다
    const still = prefersLessMotion() || items.some((el) => el.offsetTop !== items[0].offsetTop);
    const centers = items.map((el) => el.offsetLeft + el.offsetWidth / 2);
    const wanted = centers.map((center) => (still ? 1 : scaleAt(Math.abs(x - center), maxScale, radius)));
    const growth = wanted.reduce((sum, scale, i) => sum + items[i].offsetWidth * (scale - 1), 0);

    // 창이 좁으면 남은 자리만큼만 커져 양 끝이 창 밖으로 나가지 않게 한다
    const boxLeft = box.getBoundingClientRect().left;
    const leftRoom = boxLeft + items[0].offsetLeft;
    const lastItem = items[items.length - 1];
    const rightRoom = window.innerWidth - boxLeft - lastItem.offsetLeft - lastItem.offsetWidth;
    const room = Math.max(0, 2 * (Math.min(leftRoom, rightRoom) - EDGE_MARGIN));
    const fit = growth > room ? room / growth : 1;
    const scales = wanted.map((scale) => 1 + (scale - 1) * fit);
    const grown = scales.map((scale, i) => items[i].offsetWidth * (scale - 1));
    const total = grown.reduce((sum, value) => sum + value, 0);

    // 커진 만큼 양옆을 밀어내어 진짜 독처럼 벌어지게 한다
    let shift = -total / 2;
    let nearest = 0;
    const moved: number[] = [];
    items.forEach((el, i) => {
      const moveBy = shift + grown[i] / 2;
      moved.push(moveBy);
      el.style.transform = `translateX(${moveBy.toFixed(1)}px) scale(${scales[i].toFixed(3)})`;
      shift += grown[i];
      if (Math.abs(x - centers[i]) < Math.abs(x - centers[nearest])) nearest = i;
    });
    items.forEach((el, i) => {
      if (i === nearest) el.setAttribute('data-near', 'true');
      else el.removeAttribute('data-near');
    });

    const target = items[nearest];
    const text = target.dataset.dockLabel ?? target.getAttribute('aria-label') ?? '';
    if (!text) {
      setTip(null);
      return;
    }
    // 창 가장자리에서 이름이 잘리지 않게 한다. 한글 폭으로 어림한다.
    const tipWidth = text.length * 12 + 16;
    const tipCenter = centers[nearest] + moved[nearest];
    const height = target.offsetHeight;
    const width = target.offsetWidth * scales[nearest];
    if (tipSide === 'left') {
      setTip({
        text,
        left: Math.max(TIP_MARGIN + tipWidth - boxLeft, tipCenter - width / 2 - TIP_GAP),
        top: target.offsetTop + height / 2,
      });
      return;
    }
    const half = tipWidth / 2;
    setTip({
      text,
      left: Math.max(TIP_MARGIN + half - boxLeft, Math.min(window.innerWidth - TIP_MARGIN - half - boxLeft, tipCenter)),
      // 아이콘은 가운데를 기준으로 커진다
      top: target.offsetTop + height / 2 - (height * scales[nearest]) / 2 - TIP_GAP,
    });
  }

  return (
    <div
      ref={root}
      className={className}
      style={{ position: 'relative', zIndex: 30, WebkitAppRegion: 'no-drag', ...style } as React.CSSProperties}
      role={role}
      aria-label={ariaLabel}
      onPointerMove={(e) => update(e.clientX - e.currentTarget.getBoundingClientRect().left)}
      onPointerLeave={reset}
      onFocus={(e) => {
        const item = e.target as HTMLElement;
        if (item.matches?.('.dock-item:focus-visible')) update(item.offsetLeft + item.offsetWidth / 2);
      }}
      onBlur={reset}
    >
      {children}
      {tip && (
        <span
          className="dock-tip"
          role="tooltip"
          style={{ left: tip.left, top: tip.top, transform: tipSide === 'left' ? 'translate(-100%, -50%)' : 'translate(-50%, -100%)' }}
        >
          {tip.text}
        </span>
      )}
    </div>
  );
}
