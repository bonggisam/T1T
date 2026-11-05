import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useWidgetStore } from '../../store/widgetStore';
import { useComciganStore } from '../../store/comciganStore';
import { AppearanceSettings } from './AppearanceSettings';
import { CalendarSyncSettings } from './CalendarSyncSettings';
import { ComciganSettings } from './ComciganSettings';
import { Ic, type IconName } from '../common/Ic';
import type { UpdateState } from '@shared/types';

interface SettingsPanelProps {
  onClose: () => void;
}

const COLOR_PRESETS = [
  '#FF6B6B', '#EF4444', '#F97316', '#F59E0B', '#EAB308',
  '#84CC16', '#22C55E', '#10B981', '#14B8A6', '#06B6D4',
  '#0EA5E9', '#3B82F6', '#6366F1', '#8B5CF6', '#A78BFA',
  '#D946EF', '#EC4899', '#F43F5E', '#78716C', '#475569',
];

// (이전 모드에서 사용하던 리사이즈 폭/높이 상수 — 현재 모달 오버레이라 사용 안 함)

function clockOf(iso: string | undefined): string {
  if (!iso) return '';
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '' : `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

/** 지금 업데이트가 어디까지 왔는지 한 줄로 */
function describeUpdateState(state: UpdateState): string {
  if (state.phase === 'downloading') return `v${state.version ?? state.latest ?? ''} 다운로드 중 ${state.percent ?? 0}%`;
  if (state.phase === 'downloaded') return `v${state.version ?? state.latest ?? ''} 설치 준비 완료`;
  if (state.phase === 'available') return `v${state.version ?? state.latest ?? ''} 다운로드 시작 중`;
  if (state.error) return state.error;
  if (state.checkError) return `마지막 확인 실패 (${clockOf(state.checkedAt)}): ${state.checkError}`;
  if (state.checkedAt) return `마지막 확인 ${clockOf(state.checkedAt)}${state.latest ? ` · 최신 v${state.latest}` : ''}`;
  return '';
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { user, logout, saveSettings } = useAuthStore();
  const widget = useWidgetStore();
  const [alwaysOnTop, setAlwaysOnTop] = useState(user?.settings.alwaysOnTop ?? true);
  const [clickThrough, setClickThrough] = useState(user?.settings.clickThrough ?? false);
  const [notifSound, setNotifSound] = useState(user?.settings.notificationSound ?? true);
  const [notifBadge, setNotifBadge] = useState(user?.settings.notificationBadge ?? true);
  const [profileColor, setProfileColor] = useState(user?.profileColor || '#4A90E2');
  const [syncInterval, setSyncInterval] = useState(user?.settings.syncInterval ?? 15);
  const [appVersion, setAppVersion] = useState('1.0.0');
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateNote, setUpdateNote] = useState('');
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const hasTimetable = useComciganStore((s) => !!s.config && !!s.timetableData);

  // 창이 열려 있는 동안 업데이트 상태를 보여 준다. 자동 확인이 실패해도 배너를 띄우지 않으므로 여기서 알 수 있어야 한다.
  useEffect(() => {
    const refresh = () => {
      window.electronAPI?.updaterGetState?.().then(setUpdateState).catch(() => {});
    };
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    window.electronAPI?.getAppVersion().then((v) => setAppVersion(v)).catch(() => {});
    window.electronAPI?.getAutoLaunch().then((v) => setAutoLaunch(v)).catch(() => {});
  }, []);
  // 이전: 설정창이 전체 화면을 차지하던 시절 윈도우 리사이즈 로직 — 이제 모달이라 불필요

  function handleAlwaysOnTop(value: boolean) {
    setAlwaysOnTop(value);
    window.electronAPI?.toggleAlwaysOnTop(value);
  }

  function handleClickThrough(value: boolean) {
    if (value) {
      // 클릭 통과를 켜면 UI 클릭이 안 되므로 해제 방법을 먼저 안내
      const ok = window.confirm(
        '클릭 통과 모드를 켜면 앱 UI를 클릭할 수 없게 됩니다.\n\n' +
        '해제 방법:\n' +
        '• 단축키: Ctrl/Cmd + Shift + X\n' +
        '• 작업표시줄 트레이 아이콘 우클릭 → "클릭 통과 해제"\n\n' +
        '계속하시겠습니까?'
      );
      if (!ok) return;
    }
    setClickThrough(value);
    window.electronAPI?.toggleClickThrough(value);
  }

  // 외부(트레이/단축키)에서 클릭 통과 변경 시 UI 동기화
  useEffect(() => {
    const unsub = window.electronAPI?.onClickThroughChanged((enabled) => {
      setClickThrough(enabled);
    });
    return () => unsub?.();
  }, []);

  // 이전 윈도우 리사이즈 모드에서 사용하던 함수 — 모달 전환 후 no-op으로 유지 (참조 위치 호환성)
  async function restoreOriginalBounds() {
    // intentionally empty
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    setSaveMsg('');
    try {
      // 스토어도 함께 갱신된다. 그래야 다시 열었을 때 옛 값이 보이거나 옛 값으로 덮어쓰지 않는다.
      await saveSettings({
        alwaysOnTop,
        clickThrough,
        notificationSound: notifSound,
        notificationBadge: notifBadge,
        syncInterval,
      }, profileColor);
      // Restore window size before closing
      await restoreOriginalBounds();
      onClose();
    } catch (err: any) {
      setSaveMsg('저장 실패: ' + (err?.message || '알 수 없는 오류'));
    } finally {
      setSaving(false);
    }
  }

  async function handleClose() {
    await restoreOriginalBounds();
    onClose();
  }

  return (
    <div
      style={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="animate-fade-in glass" style={styles.modal} onClick={(e) => e.stopPropagation()}>
      <div style={styles.header}>
        <h3 style={styles.title}><Ic name="settings" />설정</h3>
        <button onClick={handleClose} style={styles.closeBtn}><Ic name="x" gap={false} /></button>
      </div>

      <div style={styles.sections}>
        {/* Profile section */}
        <Section icon="user" title="내 프로필">
          <div style={styles.infoRow}>
            <span style={styles.label}>이름</span>
            <span style={styles.value}>{user?.name}</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.label}>이메일</span>
            <span style={styles.value}>{user?.email}</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.label}>역할</span>
            <span style={styles.value}>
              {user?.role === 'super_admin' ? '슈퍼관리자' : user?.role === 'admin' ? '관리자' : user?.role === 'head_teacher' ? '부장교사' : '교사'}
            </span>
          </div>
          {user && (
            <div>
              <span style={styles.label}>프로필 색상</span>
              <div style={styles.colorGrid}>
                {COLOR_PRESETS.map((c) => (
                  <div
                    key={c}
                    onClick={() => setProfileColor(c)}
                    style={{
                      ...styles.colorSwatch,
                      background: c,
                      outline: profileColor === c ? '2px solid var(--text-primary)' : 'none',
                      outlineOffset: 2,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Display section */}
        <Section icon="palette" title="화면">
          <AppearanceSettings />
          <div style={{ height: 4 }} />
          <ToggleRow label="항상 위 표시" value={alwaysOnTop} onChange={handleAlwaysOnTop} />
          <ToggleRow label="클릭 통과 모드" value={clickThrough} onChange={handleClickThrough} />
        </Section>

        {/* Notification section */}
        <Section icon="bell" title="알림 설정">
          <ToggleRow label="알림음" value={notifSound} onChange={setNotifSound} />
          <ToggleRow label="NEW 배지 표시" value={notifBadge} onChange={setNotifBadge} />
        </Section>

        {/* 수업 화면 보호 — 끄는 옵션 없이 항상 동작한다. 단축키는 잠시 숨기거나 보이게 할 뿐이다. */}
        <Section icon="lock" title="수업 화면 보호">
          <div style={styles.settingRow}>
            <span style={styles.label}>가리기·보이기</span>
            <kbd style={styles.shortcutKey}>Ctrl+Shift+H</kbd>
          </div>
          <p style={styles.privacyNote}>
            내 수업 시간에는 시작 1분 전부터 끝날 때까지 개인 일정, 할 일, 직접 넣은 D-Day를 자동으로 가립니다.
            이 동안 온 알림은 소리 없이 모았다가 가림이 풀리면 보여 줍니다.
          </p>
          {!hasTimetable && (
            <p style={{ ...styles.privacyNote, color: 'var(--warning)' }}>
              컴시간 시간표를 연결해야 자동으로 가립니다. 연결 전에는 단축키로만 가릴 수 있습니다.
            </p>
          )}
        </Section>

        {/* Today widgets — 이 PC에만 저장, 즉시 적용 */}
        <Section icon="cloudSun" title="오늘 화면 위젯">
          <ToggleRow label="날씨·미세먼지" value={widget.showWeather} onChange={(v) => widget.setPref('showWeather', v)} />
          <ToggleRow label="D-Day (시험·방학 자동)" value={widget.showDDay} onChange={(v) => widget.setPref('showDDay', v)} />
          {widget.hiddenAutoDDays.length > 0 && (
            <div style={styles.settingRow}>
              <span style={styles.label}>숨긴 자동 D-Day {widget.hiddenAutoDDays.length}개</span>
              <button onClick={widget.resetHiddenAutoDDays} style={styles.widgetSelect}>다시 보이기</button>
            </div>
          )}
          <ToggleRow label="지금·다음 수업 (컴시간)" value={widget.showNextClass} onChange={(v) => widget.setPref('showNextClass', v)} />
          <div style={styles.settingRow}>
            <span style={styles.label}>수업 시작 전 알림</span>
            <select
              value={widget.classReminderMin}
              onChange={(e) => widget.setPref('classReminderMin', Number(e.target.value))}
              style={styles.widgetSelect}
            >
              <option value={0}>끔</option>
              <option value={1}>1분 전</option>
              <option value={3}>3분 전</option>
              <option value={5}>5분 전</option>
              <option value={10}>10분 전</option>
            </select>
          </div>
          <ToggleRow label="시간표 변경 알림" value={widget.timetableChangeAlert} onChange={(v) => widget.setPref('timetableChangeAlert', v)} />
          <ToggleRow label="시험감독 미리 알림" value={widget.dutyReminder} onChange={(v) => widget.setPref('dutyReminder', v)} />
        </Section>

        {/* Calendar Sync */}
        <Section icon="calendar" title="캘린더 연동">
          <CalendarSyncSettings
            syncInterval={syncInterval}
            onSyncIntervalChange={setSyncInterval}
          />
        </Section>

        {/* Comcigan timetable */}
        <Section icon="school" title="컴시간 시간표">
          <ComciganSettings />
        </Section>

        {/* Info */}
        <Section icon="info" title="정보">
          <div style={styles.infoRow}>
            <span style={styles.label}>버전</span>
            <span style={styles.value}>v{appVersion}</span>
          </div>
          <ToggleRow
            label="시작 시 자동 실행"
            value={autoLaunch}
            onChange={async (v) => {
              setAutoLaunch(v);
              try {
                const actual = await window.electronAPI?.setAutoLaunch(v);
                if (typeof actual === 'boolean') setAutoLaunch(actual);
                const { showToast } = await import('../common/Toast');
                showToast(v ? '시작 시 자동 실행이 설정되었습니다' : '시작 시 자동 실행이 해제되었습니다', 'success');
              } catch {
                const { showToast } = await import('../common/Toast');
                showToast('자동 실행 설정 실패', 'error');
                setAutoLaunch(!v);
              }
            }}
          />
          <div style={styles.settingRow}>
            <span style={styles.label}>업데이트 확인 (현재 v{appVersion})</span>
            <button
              disabled={checkingUpdate}
              onClick={async () => {
                const { showToast } = await import('../common/Toast');
                // 알림은 금방 사라지므로 결과를 단추 아래에도 남긴다
                const report = (text: string, kind: 'info' | 'success' | 'error') => {
                  setUpdateNote(text);
                  showToast(text, kind);
                };
                setCheckingUpdate(true);
                report('업데이트 확인 중…', 'info');
                try {
                  const result = await window.electronAPI?.updaterCheck();
                  if (!result) {
                    report('업데이트 응답 없음 — 수동 다운로드를 시도하세요', 'error');
                  } else if (!result.ok) {
                    report(`${result.error} — 수동 다운로드 페이지를 엽니다`, 'error');
                    setTimeout(() => window.electronAPI?.updaterOpenDownloadPage(), 3000);
                  } else if (result.version) {
                    report(`새 버전 v${result.version} — 상단 배너에서 진행 상황 확인`, 'success');
                  } else {
                    report(`최신 버전을 사용 중입니다 (v${result.latest ?? appVersion})`, 'success');
                  }
                } catch (e: any) {
                  report(`업데이트 확인 실패: ${e?.message || '알 수 없는 오류'} — 수동 다운로드 페이지를 엽니다`, 'error');
                  setTimeout(() => window.electronAPI?.updaterOpenDownloadPage(), 3000);
                }
                setCheckingUpdate(false);
              }}
              style={{
                padding: '3px 10px',
                fontSize: 'var(--fs-label)',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: checkingUpdate ? 'default' : 'pointer',
                opacity: checkingUpdate ? 0.5 : 1,
              }}
            >
              확인
            </button>
          </div>
          {updateNote && <p role="status" style={styles.privacyNote}>{updateNote}</p>}
          {updateState && describeUpdateState(updateState) && (
            <p style={styles.privacyNote}>{describeUpdateState(updateState)}</p>
          )}
          <div style={styles.settingRow}>
            <span style={styles.label}>업데이트가 안 될 때 기록 복사</span>
            <button
              onClick={async () => {
                const { showToast } = await import('../common/Toast');
                const result = await window.electronAPI?.updaterCopyLog?.();
                showToast(
                  result?.ok ? '업데이트 기록을 복사했습니다. 운영자에게 붙여 넣어 보내 주세요' : '아직 업데이트 기록이 없습니다',
                  result?.ok ? 'success' : 'info',
                );
              }}
              style={{
                padding: '3px 10px',
                fontSize: 'var(--fs-label)',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              복사
            </button>
          </div>
          <div style={styles.settingRow}>
            <span style={styles.label}>수동 다운로드 (자동 안 될 때)</span>
            <button
              onClick={() => window.electronAPI?.updaterOpenDownloadPage()}
              style={{
                padding: '3px 10px',
                fontSize: 'var(--fs-label)',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                background: 'transparent',
                color: 'var(--accent)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
              title="GitHub 릴리스 페이지를 열어 최신 .exe 파일을 직접 다운로드"
            >
              <Ic name="download" />페이지 열기
            </button>
          </div>
        </Section>
      </div>

      <div style={styles.footer}>
        <button onClick={handleSave} disabled={saving} style={styles.saveBtn}>
          {saving ? '저장 중...' : '설정 저장'}
        </button>
        {saveMsg && <span style={{ fontSize: 'var(--fs-label)', color: 'var(--danger)', alignSelf: 'center' }}>{saveMsg}</span>}
        <button onClick={logout} style={styles.logoutBtn}>로그아웃</button>
      </div>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon?: IconName; title: string; children: React.ReactNode }) {
  return (
    <div style={sectionStyles.container}>
      <h4 style={sectionStyles.title}>{icon && <Ic name={icon} />}{title}</h4>
      <div style={sectionStyles.content}>{children}</div>
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={styles.settingRow}>
      <span style={styles.label}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        style={{
          ...styles.toggleBtn,
          background: value ? 'var(--accent)' : 'var(--bg-secondary)',
        }}
      >
        <span style={{
          ...styles.toggleDot,
          transform: value ? 'translateX(16px)' : 'translateX(0)',
        }} />
      </button>
    </div>
  );
}

const sectionStyles: Record<string, React.CSSProperties> = {
  container: {
    marginBottom: 16,
  },
  title: {
    fontSize: 'var(--fs-control)',
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 8,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    paddingLeft: 4,
  },
};

const styles: Record<string, React.CSSProperties> = {
  // 모달 오버레이 — 메인 콘텐츠 위에 떠 있는 형태
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'var(--scrim)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 90,
    padding: 12,
  },
  modal: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    maxWidth: 460,
    maxHeight: '92%',
    background: 'var(--bg-modal)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border-color)',
    boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
    overflow: 'hidden',
    padding: '4px 16px 0',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    flexShrink: 0,
  },
  title: {
    fontSize: 'var(--fs-subtitle)',
    fontWeight: 700,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 'var(--fs-lead)',
    color: 'var(--text-muted)',
  },
  sections: {
    flex: 1,
    overflow: 'auto',
    paddingBottom: 10,
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 'var(--fs-body)',
    color: 'var(--text-secondary)',
  },
  value: {
    fontSize: 'var(--fs-body)',
    fontWeight: 500,
    color: 'var(--text-primary)',
  },
  shortcutKey: {
    fontSize: 'var(--fs-label)',
    fontFamily: 'inherit',
    padding: '1px 6px',
    borderRadius: 4,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
  },
  privacyNote: {
    margin: 0,
    fontSize: 'var(--fs-label)',
    lineHeight: 1.5,
    color: 'var(--text-muted)',
  },
  widgetSelect: {
    fontSize: 'var(--fs-body)',
    padding: '3px 8px',
    borderRadius: 6,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
  slider: {
    width: 120,
    accentColor: 'var(--accent)',
  },
  toggleBtn: {
    width: 36,
    height: 20,
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    position: 'relative' as const,
    transition: 'background 0.2s',
    padding: 0,
  },
  toggleDot: {
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: 'var(--paper)',
    position: 'absolute' as const,
    top: 2,
    left: 2,
    transition: 'transform 0.2s',
    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
  },
  themeToggle: {
    display: 'flex',
    gap: 4,
  },
  themeBtn: {
    padding: '3px 10px',
    fontSize: 'var(--fs-label)',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  themeBtnActive: {
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    borderColor: 'var(--accent)',
  },
  colorGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  colorSwatch: {
    width: 22,
    height: 22,
    borderRadius: '50%',
    cursor: 'pointer',
    transition: 'transform 0.12s',
  },
  footer: {
    display: 'flex',
    gap: 8,
    padding: '10px 0',
    borderTop: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  saveBtn: {
    flex: 1,
    padding: '8px',
    fontSize: 'var(--fs-control)',
    fontWeight: 600,
    border: 'none',
    borderRadius: 8,
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    cursor: 'pointer',
  },
  logoutBtn: {
    padding: '8px 16px',
    fontSize: 'var(--fs-control)',
    border: '1px solid var(--border-color)',
    borderRadius: 8,
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
};
