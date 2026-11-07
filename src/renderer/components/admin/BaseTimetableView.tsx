import React, { useState } from 'react';
import { format } from 'date-fns';
import type { School } from '@shared/types';
import { useAuthStore } from '../../store/authStore';
import { LINK_SCHOOLS, useComciganLinksStore } from '../../store/comciganLinksStore';
import { useDarkMode } from '../../hooks/useDarkMode';
import { Ic } from '../common/Ic';
import { BaseTimetableUpload } from './BaseTimetableUpload';

const SHORT_LABEL: Record<School, string> = { taeseong_middle: '태성중', taeseong_high: '태성고' };

/** 관리자만 연다. 관리자 계정은 학교와 상관없이 두 학교 기초 시간표를 모두 올릴 수 있다 */
function isTimetableAdmin(user: { status?: string; role?: string } | null | undefined): boolean {
  return user?.status === 'active' && (user.role === 'admin' || user.role === 'super_admin');
}

/**
 * 기초 시간표 메뉴. 태성중과 태성고의 컴시간 파일을 학교마다 올리고, 지금 올라 있는 표와 그 주 나이스 대조 결과를 본다.
 */
export function BaseTimetableView({ onBack }: { onBack: () => void }) {
  const user = useAuthStore((s) => s.user);
  const bases = useComciganLinksStore((s) => s.bases);
  const isDark = useDarkMode();
  const [school, setSchool] = useState<School>(user?.school === 'taeseong_high' ? 'taeseong_high' : 'taeseong_middle');

  if (!isTimetableAdmin(user)) {
    return (
      <div style={styles.container}>
        <div style={styles.toolbar}>
          <button onClick={onBack} style={styles.backBtn} title="캘린더로 돌아가기"><Ic name="calendar" />캘린더</button>
          <span style={styles.label}><Ic name="sheet" />기초 시간표</span>
        </div>
        <p style={styles.denied}>관리자 권한이 필요합니다.</p>
      </div>
    );
  }

  const colorOf = (s: School) => {
    const key = s === 'taeseong_high' ? 'school-high' : 'school-middle';
    return `var(--${key}${isDark ? '-bright' : ''})`;
  };

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <button onClick={onBack} style={styles.backBtn} title="캘린더로 돌아가기"><Ic name="calendar" />캘린더</button>
        <span style={styles.label}><Ic name="sheet" />기초 시간표</span>
      </div>

      <div style={styles.schoolToggle} role="group" aria-label="학교">
        {LINK_SCHOOLS.map((s) => {
          const base = bases[s];
          const status = base === undefined ? '확인 중'
            : base === null ? '아직 없음'
              : base.updatedAt ? `${format(base.updatedAt, 'M/d')} 올림` : '올림';
          const on = school === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setSchool(s)}
              aria-pressed={on}
              style={{
                ...styles.schoolBtn,
                ...(on ? { background: colorOf(s), color: 'var(--on-accent)', border: '1px solid transparent' } : {}),
              }}
            >
              <span style={styles.schoolName}>
                <Ic name={s === 'taeseong_high' ? 'graduation' : 'school'} />{SHORT_LABEL[s]}
              </span>
              <span style={{ ...styles.status, ...(on ? { color: 'var(--on-accent)' } : {}) }}>{status}</span>
            </button>
          );
        })}
      </div>

      <div style={styles.content}>
        <BaseTimetableUpload key={school} school={school} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  toolbar: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 12px', borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0, background: 'var(--tint-neutral)',
  },
  backBtn: {
    background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
    border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
    cursor: 'pointer', padding: '4px 10px', borderRadius: 6,
    fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--accent)',
  },
  label: { flex: 1, fontSize: 'var(--fs-control)', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' },
  schoolToggle: {
    display: 'flex', gap: 6,
    padding: '6px 12px',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  schoolBtn: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1,
    padding: '5px 10px',
    fontSize: 'var(--fs-body)',
    fontWeight: 700,
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  schoolName: { display: 'flex', alignItems: 'center' },
  status: { fontSize: 'var(--fs-caption)', fontWeight: 500, color: 'var(--text-muted)' },
  content: { flex: 1, overflow: 'auto', padding: '8px 12px' },
  denied: { textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 'var(--fs-control)' },
};
