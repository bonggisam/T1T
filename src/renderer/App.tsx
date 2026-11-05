import React, { useEffect, useRef, useState } from 'react';
import { useAuthStore } from './store/authStore';
import { useCalendarStore } from './store/calendarStore';
import { useNotificationStore } from './store/notificationStore';
import { usePersonalEventStore } from './store/personalEventStore';
import { TitleBar } from './components/common/TitleBar';
import { Calendar } from './components/calendar/Calendar';
import { LoginForm } from './components/auth/LoginForm';
import { SignupForm } from './components/auth/SignupForm';
import { PendingApproval } from './components/auth/PendingApproval';
import { EventModal } from './components/calendar/EventModal';
import { EventDetail } from './components/calendar/EventDetail';
import { NotificationPanel } from './components/notifications/NotificationPanel';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { AdminPanel } from './components/admin/AdminPanel';
import { PersonalEventModal } from './components/calendar/PersonalEventModal';
import { PasteEventsModal } from './components/calendar/PasteEventsModal';
import { PrivacyBanner, PrivateContent, PrivateNotice } from './components/common/PrivacyGuard';
import { TimetableChangeBanner } from './components/common/TimetableChangeBanner';
import { ComciganOutageBanner, OperatorOutageBanner } from './components/common/ComciganCall';
import { TPassView } from './components/tpass/TPassView';
import { OutingView } from './components/outing/OutingView';
import { TodosView } from './components/todos/TodosView';
import { ReservView } from './components/reserv/ReservView';
import { MealView } from './components/meal/MealView';
import { UpdateBanner } from './components/common/UpdateBanner';
import { ToastContainer, showToast } from './components/common/Toast';
import { useComciganStore } from './store/comciganStore';
import { useTodosStore } from './store/todosStore';
import { useUsersStore } from './store/usersStore';
import { useUIStore } from './store/uiStore';
import { useAppearanceStore } from './store/appearanceStore';
import { useReminder } from './hooks/useReminder';
import { useWidgetStore } from './store/widgetStore';
import { AccountNotice } from './components/auth/AccountNotice';
import { publishOwnDirectoryRow, reconcileUserDirectory } from './utils/userDirectory';
import { useClassReminder } from './hooks/useClassReminder';
import { useClassPrivacy } from './hooks/useClassPrivacy';
import { useDutyReminder } from './hooks/useDutyReminder';
import { useComciganOutageWatch, useOperatorOutageAlert } from './hooks/useComciganOutage';
import { useDutyStore, useDutySubscription } from './store/dutyStore';
import { useComciganLinksStore } from './store/comciganLinksStore';
import { isPersonalHidden } from './store/privacyStore';
import { parseEventDrafts } from './utils/pasteEventParser';
import { ScheduleView } from './components/schedule/ScheduleView';
import { KeyphoneView } from './components/keyphone/KeyphoneView';
import { LibraryView } from './components/library/LibraryView';
import { MeetingFinderView } from './components/meeting/MeetingFinderView';
import { DutyView } from './components/duty/DutyView';
import { DutyEntryDetail } from './components/duty/DutyEntryDetail';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ResizeHandles } from './components/common/ResizeHandles';
import { startSchoolScheduleAutoSync } from './utils/schoolScheduleSync';
import { syncSharedEventsToGoogle } from './utils/sharedEventsGoogleSync';

type AuthScreen = 'login' | 'signup';

const WEB_TABS = ['tpass', 'outing', 'reserv', 'library'] as const;
type WebTab = typeof WEB_TABS[number];
const isWebTab = (tab: string): tab is WebTab => (WEB_TABS as readonly string[]).includes(tab);

export function App() {
  const { user, loading, initialize, profileUnavailable, retryProfile } = useAuthStore();
  const { subscribeToEvents, cleanup: cleanupEvents, showEventModal, showEventDetail, selectedEvent, events: sharedEvents } = useCalendarStore();
  const { subscribeToNotifications, cleanup: cleanupNotifications, showPanel: showNotifications } = useNotificationStore();
  const { subscribeToPersonalEvents, startAutoSync, stopAutoSync, cleanup: cleanupPersonal } = usePersonalEventStore();
  const { loadConfig: loadComcigan, cleanup: cleanupComcigan } = useComciganStore();
  const { subscribeToTodos, cleanup: cleanupTodos } = useTodosStore();
  const { subscribeToUsers, cleanup: cleanupUsers } = useUsersStore();
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  // 단일 activeTab 상태 — 한 번에 하나의 탭만 활성, race condition 제거
  type Tab = null | 'settings' | 'admin' | 'tpass' | 'outing' | 'todos' | 'reserv' | 'meal' | 'schedule' | 'keyphone' | 'library' | 'meeting' | 'duty';
  const [activeTab, setActiveTab] = useState<Tab>(null);
  const [showPersonalModal, setShowPersonalModal] = useState(false);
  // 붙여 넣기 창에 넣을 글. null이면 닫힘
  const [pasteText, setPasteText] = useState<string | null>(null);
  const showSettings = activeTab === 'settings';
  // 설정은 위에 뜨는 창이다. 그 뒤의 화면은 그대로 두고, 닫으면 돌아간다
  const tabBehindSettings = useRef<Tab>(null);
  const view: Tab = showSettings ? tabBehindSettings.current : activeTab;
  const showAdmin = view === 'admin';
  const showTodos = view === 'todos';
  const showMeal = view === 'meal';
  const showSchedule = view === 'schedule';
  const showKeyphone = view === 'keyphone';
  const showMeeting = view === 'meeting';
  const showDuty = view === 'duty';
  const toggle = (tab: Exclude<Tab, null>) => setActiveTab((cur) => {
    if (tab !== 'settings') return cur === tab ? null : tab;
    if (cur === 'settings') return tabBehindSettings.current;
    tabBehindSettings.current = cur;
    return 'settings';
  });
  // 한 번 연 웹 화면은 숨겨서 둔다. 지우면 입력하던 내용이 사라지고 페이지를 처음부터 다시 받는다
  const [openedWebTabs, setOpenedWebTabs] = useState<WebTab[]>([]);
  const webTabs = view && isWebTab(view) && !openedWebTabs.includes(view) ? [...openedWebTabs, view] : openedWebTabs;
  useEffect(() => {
    if (webTabs !== openedWebTabs) setOpenedWebTabs(webTabs);
  }, [webTabs, openedWebTabs]);
  const theme = useAppearanceStore((s) => s.mode);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // 일정 알림 리마인더
  useReminder();
  useClassReminder();
  // 내 수업 시간에 개인 일정 자동 가리기, 단축키 처리
  useClassPrivacy();
  // 시험감독 표와 내 차례 미리 알림
  useDutySubscription(user?.status === 'active' ? user.id : null);
  useDutyReminder();
  // 컴시간이 막혔는지 지켜보고, 운영자는 선생님이 보낸 알림을 받는다
  const isOperator = user?.status === 'active' && (user.role === 'admin' || user.role === 'super_admin');
  useComciganOutageWatch();
  useOperatorOutageAlert(isOperator);

  useEffect(() => {
    const unsub = initialize();
    return unsub;
  }, [initialize]);

  // 달력을 보는 중에 Ctrl+V를 누르면 붙여 넣기 창을 연다. 입력칸과 다른 창에서는 건드리지 않는다.
  const canPasteEvents = user?.status === 'active' && activeTab === null;
  useEffect(() => {
    if (!canPasteEvents) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const calendar = useCalendarStore.getState();
      if (calendar.showEventModal || calendar.showEventDetail || document.querySelector('[role="dialog"]')) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!text.trim()) return;
      e.preventDefault();
      if (isPersonalHidden()) {
        showToast('개인 일정을 가린 동안에는 붙여 넣기를 열지 않습니다');
        return;
      }
      const classTimes = useComciganStore.getState().timetableData?.classTimes ?? [];
      if (parseEventDrafts(text, new Date(), classTimes).length === 0) {
        showToast('붙여 넣은 글에서 날짜를 찾지 못했습니다');
        return;
      }
      setPasteText(text);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [canPasteEvents]);

  // 업데이트 후 첫 실행 감지 — 사용자에게 명확한 확인 토스트
  useEffect(() => {
    (async () => {
      try {
        const current = await window.electronAPI?.getAppVersion();
        if (!current) return;
        const last = localStorage.getItem('t1t-last-version');
        if (last && last !== current) {
          const { showToast } = await import('./components/common/Toast');
          showToast(`v${last} → v${current} 업데이트 완료`, 'success');
        }
        localStorage.setItem('t1t-last-version', current);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    // 재연결 후 구독 복구 — exponential backoff (1s, 2s, 4s, 8s, 최대 4회)
    const reconnectWithRetry = (attempt = 0) => {
      const currentUser = useAuthStore.getState().user;
      if (currentUser?.status !== 'active') return;
      try {
        subscribeToEvents();
        subscribeToNotifications(currentUser.id);
        subscribeToPersonalEvents(currentUser.id);
        subscribeToTodos(currentUser.id);
        subscribeToUsers();
        useDutyStore.getState().subscribe();
        useComciganLinksStore.getState().subscribe();
      } catch (e) {
        console.warn(`[App] 재구독 실패 (시도 ${attempt + 1}):`, e);
        if (attempt < 3) {
          const delay = Math.pow(2, attempt) * 1000;
          setTimeout(() => reconnectWithRetry(attempt + 1), delay);
        } else {
          import('./components/common/Toast').then(({ showToast }) => {
            showToast('연결 복구 실패. 새로고침 후 재시도해주세요.', 'error');
          });
        }
      }
    };
    const goOnline = () => {
      setIsOffline(false);
      reconnectWithRetry();
    };
    const googleAuthExpired = (ev: Event) => {
      const reason = (ev as CustomEvent).detail?.reason;
      // 동적 import로 순환 방지
      import('./components/common/Toast').then(({ showToast }) => {
        showToast(
          reason === 'security-migration'
            ? '보안 강화(사용자별 토큰 분리)로 Google Calendar를 한 번만 다시 연동해주세요 — 설정 > Google 연동'
            : 'Google Calendar 인증이 만료되었습니다. 설정에서 다시 연동해주세요.',
          'error',
        );
      });
    };
    // 창 focus / visibility 복귀 시 Google Calendar 즉시 동기화 (양방향 즉시성 강화)
    const triggerSync = () => {
      const u = useAuthStore.getState().user;
      if (u?.status === 'active') {
        // Pull (Google → 앱) — 외부 등록 일정 가져오기
        usePersonalEventStore.getState().syncExternalCalendars().catch(() => {});
        // Push (공유/학사 → 사용자 Google) — 본인 학교 + 'all' 일정만
        if (u.school === 'taeseong_middle' || u.school === 'taeseong_high') {
          const events = useCalendarStore.getState().events;
          syncSharedEventsToGoogle(u.id, u.school, events).catch(() => {});
        }
      }
    };
    const onVisibility = () => { if (!document.hidden) triggerSync(); };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    window.addEventListener('google:auth-expired', googleAuthExpired);
    window.addEventListener('focus', triggerSync);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('google:auth-expired', googleAuthExpired);
      window.removeEventListener('focus', triggerSync);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (user?.status === 'active') {
      // 최초 로그인 시 viewingSchool을 본인 학교로 초기화 (저장값 없을 때만)
      useUIStore.getState().initViewingSchoolForUser(user.id, user.school);
      useWidgetStore.getState().bindUser(user.id);
      subscribeToEvents();
      subscribeToNotifications(user.id);
      subscribeToPersonalEvents(user.id);
      subscribeToTodos(user.id);
      subscribeToUsers();
      loadComcigan(user.id);
      // 학교 홈페이지 학사일정 자동 동기화 (매일 오전 7시)
      const stopSchoolSync = startSchoolScheduleAutoSync(user.id, user.name || '학사일정 자동동기화');
      return () => {
        cleanupEvents();
        cleanupNotifications();
        cleanupPersonal();
        cleanupTodos();
        cleanupUsers();
        cleanupComcigan();
        stopSchoolSync();
        useWidgetStore.getState().bindUser(null);
        // 다음 교사에게 앞 교사가 열어 둔 화면을 넘기지 않는다
        tabBehindSettings.current = null;
        setActiveTab(null);
        setOpenedWebTabs([]);
      };
    }
  }, [user?.id, user?.status]);

  // 외부 캘린더 동기화. 설정에서 주기를 바꾸면 바로 적용한다
  const syncInterval = user?.settings?.syncInterval ?? 0.25;
  useEffect(() => {
    if (user?.status !== 'active') return undefined;
    startAutoSync(syncInterval);
    return () => stopAutoSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.status, syncInterval]);

  // 알림 대상과 @멘션에 쓰는 교사 명단에 내 줄을 올린다. 관리자는 승인된 사람과 맞춘다
  useEffect(() => {
    if (!user || user.status !== 'active') return;
    publishOwnDirectoryRow(user).catch((err) => console.warn('[Directory] publish failed:', err));
    if (user.role === 'admin' || user.role === 'super_admin') {
      reconcileUserDirectory().catch((err) => console.warn('[Directory] reconcile failed:', err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.status, user?.role, user?.name, user?.school, user?.profileColor]);

  // Word, PowerPoint의 서식 복사와 겹치는 단축키는 설정에서 끌 수 있다
  const editShortcut = useWidgetStore((s) => s.editShortcut);
  useEffect(() => {
    window.electronAPI?.setEditShortcut?.(editShortcut)?.catch?.(() => {});
  }, [editShortcut]);

  // 공유 이벤트(학교 일정 + 학사일정) 변경 시 → 사용자 개인 Google Calendar로 자동 push.
  // 디바운스 2초 — 여러 변경이 빠르게 들어와도 한 번만 sync.
  // 개인 일정(personal_events)은 이 useEffect와 무관 (절대 다른 사람에게 공유되지 않음)
  useEffect(() => {
    if (!user?.id) return;
    if (user.school !== 'taeseong_middle' && user.school !== 'taeseong_high') return;
    if (!sharedEvents || sharedEvents.length === 0) return;
    const t = setTimeout(() => {
      syncSharedEventsToGoogle(user.id, user.school, sharedEvents)
        .then((r) => {
          if (r.created + r.updated + r.deleted > 0) {
            console.log(
              `[SharedGoogleSync] ${r.created} 생성, ${r.updated} 수정, ${r.deleted} 삭제, ${r.skipped} skip, ${r.errors} 에러`,
            );
          }
        })
        .catch((e) => console.warn('[SharedGoogleSync] failed:', e));
    }, 2000);
    return () => clearTimeout(t);
  }, [user?.id, user?.school, sharedEvents]);

  // 날짜가 바뀌거나 절전에서 돌아오면 오늘 표시와 일정을 새로 맞춘다.
  // 달력은 켜 둔 채 며칠씩 지나가므로, 자정 넘어 옛 날짜가 오늘로 남지 않아야 한다.
  const [dayKey, setDayKey] = useState(() => new Date().toDateString());
  const dayKeyRef = useRef(dayKey);
  useEffect(() => {
    const refreshDay = () => {
      const now = new Date();
      const next = now.toDateString();
      if (dayKeyRef.current === next) return;
      const calendar = useCalendarStore.getState();
      // 오늘을 보고 있던 사람만 새 날짜로 옮긴다. 다른 날을 보던 사람의 화면은 건드리지 않는다.
      if (calendar.selectedDate.toDateString() === dayKeyRef.current) {
        calendar.setSelectedDate(now);
        calendar.setCurrentMonth(now);
      }
      dayKeyRef.current = next;
      setDayKey(next);
    };
    const timer = setInterval(refreshDay, 60 * 1000);
    const unsubscribe = window.electronAPI?.onSystemWoke(() => {
      refreshDay();
      if (useAuthStore.getState().user?.status === 'active') {
        usePersonalEventStore.getState().syncExternalCalendars().catch(() => {});
      }
    });
    return () => {
      clearInterval(timer);
      unsubscribe?.();
    };
  }, []);

  // 저장된 항상 위 설정을 적용. 위젯 모드에서는 메인 프로세스가 기억만 하고 해제할 때 쓴다.
  const savedAlwaysOnTop = user?.settings?.alwaysOnTop;
  useEffect(() => {
    if (typeof savedAlwaysOnTop !== 'boolean') return;
    window.electronAPI?.toggleAlwaysOnTop(savedAlwaysOnTop)
      .catch((err) => console.warn('[Window] toggleAlwaysOnTop failed:', err));
  }, [savedAlwaysOnTop]);

  // 로그인한 계정의 테마와 글자 크기를 적용한다
  useEffect(() => {
    if (!user?.id) return;
    useAppearanceStore.getState().loadFromSettings(useAuthStore.getState().user?.settings);
    // 처음 로그인할 때 한 번만 읽는다. 이 PC에서 바꾸는 동안 다시 덮어쓰지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (loading) {
    return (
      <div className="glass" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div className="spinner" />
          <p style={{ marginTop: 12, fontSize: 'var(--fs-lead)' }}>로딩 중...</p>
        </div>
      </div>
    );
  }

  // 로그인은 돼 있는데 네트워크가 없어 계정을 읽지 못했다. 로그인 화면으로 보내지 않고 기다린다
  if (!user && profileUnavailable) {
    return (
      <div className="glass" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <TitleBar
          onToggleSettings={() => {}}
          onToggleAdmin={() => {}}
          showSettingsBtn={false}
          showAdminBtn={false}
        />
        <AccountNotice
          title="인터넷 연결을 기다리는 중입니다"
          message="연결되면 자동으로 달력이 열립니다."
          onRetry={retryProfile}
        />
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="glass" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <TitleBar
          onToggleSettings={() => {}}
          onToggleAdmin={() => {}}
          showSettingsBtn={false}
          showAdminBtn={false}
        />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          {authScreen === 'login' ? (
            <LoginForm onSwitchToSignup={() => setAuthScreen('signup')} />
          ) : (
            <SignupForm onSwitchToLogin={() => setAuthScreen('login')} />
          )}
        </div>
      </div>
    );
  }

  // Pending approval
  if (user.status === 'pending') {
    return (
      <div className="glass" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <TitleBar
          onToggleSettings={() => {}}
          onToggleAdmin={() => {}}
          showSettingsBtn={false}
          showAdminBtn={false}
        />
        <PendingApproval />
      </div>
    );
  }

  if (user.status === 'rejected' || user.status === 'deactivated') {
    return (
      <div className="glass" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <TitleBar
          onToggleSettings={() => {}}
          onToggleAdmin={() => {}}
          showSettingsBtn={false}
          showAdminBtn={false}
        />
        <AccountNotice
          title={user.status === 'rejected' ? '가입이 거절되었습니다' : '계정이 비활성화되었습니다'}
          message="관리자에게 문의해 주세요."
        />
      </div>
    );
  }

  const isAdmin = user.role === 'admin' || user.role === 'super_admin';

  // T1T 로고 클릭 — 모든 탭 닫고 월간 달력으로 이동
  function goHome() {
    setActiveTab(null);
    useCalendarStore.getState().setView('month');
    useCalendarStore.getState().setCurrentMonth(new Date());
    useCalendarStore.getState().setSelectedDate(new Date());
  }

  // 개인 일정을 쓰는 창은 가린 동안 열지 않는다. 열려 있어도 표시되지 않아 눌러도 반응이 없어 보이기 때문이다.
  function openPrivateForm(open: () => void) {
    if (isPersonalHidden()) {
      showToast('개인 일정을 가린 동안에는 열 수 없습니다. 위쪽의 "지금 보기"를 눌러 주세요');
      return;
    }
    open();
  }

  // 도구 모음의 밝게·어둡게. 맑음과 야간자습을 오간다.
  function handleToggleTheme() {
    useAppearanceStore.getState().update({ theme: theme === 'dark' ? 'clear' : 'night' });
  }

  return (
    <div className="glass" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TitleBar
        onToggleSettings={() => toggle('settings')}
        onToggleAdmin={() => toggle('admin')}
        showSettingsBtn={true}
        showAdminBtn={isAdmin}
        activeTab={activeTab}
        onOpenTab={toggle}
        onOpenCalendar={() => setActiveTab(null)}
        onPasteEvents={() => openPrivateForm(() => { setActiveTab(null); setPasteText(''); })}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onGoHome={goHome}
      />
      <UpdateBanner />
      {isOffline && (
        <div style={{
          background: 'var(--warning)',
          color: 'var(--on-accent)',
          textAlign: 'center',
          fontSize: 'var(--fs-label)',
          fontWeight: 600,
          padding: '3px 0',
          flexShrink: 0,
        }}>
          오프라인 모드 — 캐시된 일정을 표시 중
        </div>
      )}
      <PrivacyBanner />
      <TimetableChangeBanner />
      {isOperator && <OperatorOutageBanner />}
      <ComciganOutageBanner />
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <ErrorBoundary key={view || 'calendar'}>
          {showAdmin ? (
            <AdminPanel onClose={() => setActiveTab(null)} />
          ) : view && isWebTab(view) ? null : showTodos ? (
            <PrivateContent fallback={<PrivateNotice>할 일은 개인 내용이라 가렸습니다</PrivateNotice>}>
              <TodosView onBack={() => setActiveTab(null)} />
            </PrivateContent>
          ) : showMeal ? (
            <MealView onBack={() => setActiveTab(null)} />
          ) : showSchedule ? (
            <ScheduleView onBack={() => setActiveTab(null)} />
          ) : showKeyphone ? (
            <KeyphoneView onBack={() => setActiveTab(null)} />
          ) : showMeeting ? (
            <MeetingFinderView onBack={() => setActiveTab(null)} />
          ) : showDuty ? (
            <DutyView onBack={() => setActiveTab(null)} />
          ) : (
            <Calendar
              key={dayKey}
              onAddPersonalEvent={() => openPrivateForm(() => setShowPersonalModal(true))}
            />
          )}
        </ErrorBoundary>
        {webTabs.map((tab) => (
          <div key={tab} style={{ position: 'absolute', inset: 0, visibility: view === tab ? 'visible' : 'hidden', zIndex: view === tab ? 1 : -1 }}>
            <ErrorBoundary>
              {tab === 'tpass' && <TPassView onBack={() => setActiveTab(null)} />}
              {tab === 'outing' && <OutingView onBack={() => setActiveTab(null)} />}
              {tab === 'reserv' && <ReservView onBack={() => setActiveTab(null)} />}
              {tab === 'library' && <LibraryView onBack={() => setActiveTab(null)} />}
            </ErrorBoundary>
          </div>
        ))}
        {/* 설정은 모달 오버레이로 표시 — 메인 콘텐츠를 가리지 않음 */}
        {showSettings && (
          <SettingsPanel onClose={() => setActiveTab(tabBehindSettings.current)} />
        )}

        {showEventModal && <EventModal />}
        {showEventDetail && (selectedEvent?.duty
          ? <DutyEntryDetail onOpenTable={() => setActiveTab('duty')} />
          : <EventDetail />)}
        {showNotifications && <NotificationPanel />}
        {/* 쓰는 중에 수업이 시작되면 글을 잃지 않고 표시만 끈다 */}
        {showPersonalModal && (
          <PrivateContent>
            <PersonalEventModal onClose={() => setShowPersonalModal(false)} />
          </PrivateContent>
        )}
        {pasteText !== null && (
          <PrivateContent>
            <PasteEventsModal initialText={pasteText} onClose={() => setPasteText(null)} />
          </PrivateContent>
        )}
      </div>
      <ToastContainer />
      <ResizeHandles />
    </div>
  );
}
