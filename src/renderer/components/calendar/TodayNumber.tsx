import React from 'react';

/** 오늘 날짜. 테마에 따라 채움, 테두리, 펜 동그라미로 그린다 (global.css의 data-today). */
export function TodayNumber({ children }: { children: React.ReactNode }) {
  return (
    <span className="today-num" aria-current="date">
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <path d="M26.2 6.6C20 3 9.6 4.6 6.1 12.4c-3.4 7.8 1.6 17 10.5 18.4 8.7 1.3 16.5-4.5 16.7-13C33.5 10 26.8 5.2 18.6 5.5" />
      </svg>
      {children}
    </span>
  );
}
