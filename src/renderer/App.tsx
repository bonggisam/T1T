import React, { useEffect, useState } from 'react';
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
import { TPassView } from './components/tpass/TPassView';
import { TodosView } from './components/todos/TodosView';
import { ReservView } from './components/reserv/ReservView';
import { MealView } from './components/meal/MealView';
import { UpdateBanner } from './components/common/UpdateBanner';
import { ToastContainer } from './components/common/Toast';
import { useComciganStore } from './store/comciganStore';
import { useTodosStore } from './store/todosStore';
import { useUsersStore } from './store/usersStore';
import { useReminder } from './hooks/useReminder';

type AuthScreen = 'login' | 'signup';

export function App() {
  const { user, loading, initialize } = useAuthStore();
  const { subscribeToEvents, cleanup: cleanupEvents, showEventModal, showEventDetail } = useCalendarStore();
  const { subscribeToNotifications, cleanup: cleanupNotifications, showPanel: showNotifications } = useNotificationStore();
  const { subscribeToPersonalEvents, startAutoSync, stopAutoSync, cleanup: cleanupPersonal } = usePersonalEventStore();
  const { loadConfig: loadComcigan, cleanup: cleanupComcigan } = useComciganStore();
  const { subscribeToTodos, cleanup: cleanupTodos } = useTodosStore();
  const { subscribeToUsers, cleanup: cleanupUsers } = useUsersStore();
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  const [showSettings, setShowSettings] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showPersonalModal, setShowPersonalModal] = useState(false);
  const [showTPass, setShowTPass] = useState(false);
  const [showTodos, setShowTodos] = useState(false);
  const [showReserv, setShowReserv] = useState(false);
  const [showMeal, setShowMeal] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // 일정 알림 리마인더
  useReminder();

  useEffect(() => {
    const unsub = initialize();
    return unsub;
  }, [initialize]);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  useEffect(() => {
    if (user?.status === 'active') {
      subscribeToEvents();
      subscribeToNotifications(user.id);
      subscribeToPersonalEvents(user.id);
      subscribeToTodos(user.id);
      subscribeToUsers();
      startAutoSync(user.settings?.syncInterval ?? 15);
      loadComcigan();
      return () => {
        cleanupEvents();
        cleanupNotifications();
        stopAutoSync();
        cleanupPersonal();
        cleanupTodos();
        cleanupUsers();
        cleanupComcigan();
      };
    }
  }, [user?.id, user?.status]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Apply saved schedule font size on startup
  useEffect(() => {
    const savedFontSize = localStorage.getItem('tonet-schedule-font-size');
    if (savedFontSize) {
      document.documentElement.style.setProperty('--schedule-font-size', `${savedFontSize}px`);
    }
  }, []);

  useEffect(() => {
    if (user?.settings?.theme) {
      if (user.settings.theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(prefersDark ? 'dark' : 'light');
      } else {
        setTheme(user.settings.theme);
      }
    }
  }, [user?.settings?.theme]);

  if (loading) {
    return (
      <div className="glass" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div className="spinner" />
          <p style={{ marginTop: 12, fontSize: 14 }}>로딩 중...</p>
        </div>
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

  if (user.status === 'rejected') {
    return (
      <div className="glass" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <TitleBar
          onToggleSettings={() => {}}
          onToggleAdmin={() => {}}
          showSettingsBtn={false}
          showAdminBtn={false}
        />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center' }}>
          <div>
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>가입이 거절되었습니다</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>관리자에게 문의해주세요.</p>
          </div>
        </div>
      </div>
    );
  }

  const isAdmin = user.role === 'admin' || user.role === 'super_admin';

  // 하나의 탭만 활성화되게 다른 모든 탭 닫기
  function closeAllTabs() {
    setShowSettings(false); setShowAdmin(false); setShowTPass(false);
    setShowTodos(false); setShowReserv(false); setShowMeal(false);
  }

  // ToneT 로고 클릭 — 모든 탭 닫고 월간 달력으로 이동
  function goHome() {
    closeAllTabs();
    useCalendarStore.getState().setView('month');
    useCalendarStore.getState().setCurrentMonth(new Date());
    useCalendarStore.getState().setSelectedDate(new Date());
  }

  return (
    <div className="glass" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TitleBar
        onToggleSettings={() => { const next = !showSettings; closeAllTabs(); setShowSettings(next); }}
        onToggleAdmin={() => { const next = !showAdmin; closeAllTabs(); setShowAdmin(next); }}
        showSettingsBtn={true}
        showAdminBtn={isAdmin}
        onToggleTPass={() => { const next = !showTPass; closeAllTabs(); setShowTPass(next); }}
        showTPass={showTPass}
        onToggleTodos={() => { const next = !showTodos; closeAllTabs(); setShowTodos(next); }}
        showTodos={showTodos}
        onToggleReserv={() => { const next = !showReserv; closeAllTabs(); setShowReserv(next); }}
        showReserv={showReserv}
        onToggleMeal={() => { const next = !showMeal; closeAllTabs(); setShowMeal(next); }}
        showMeal={showMeal}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        onGoHome={goHome}
      />
      <UpdateBanner />
      {isOffline && (
        <div style={{
          background: 'var(--warning)',
          color: '#fff',
          textAlign: 'center',
          fontSize: 11,
          fontWeight: 600,
          padding: '3px 0',
          flexShrink: 0,
        }}>
          오프라인 모드 — 캐시된 일정을 표시 중
        </div>
      )}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {showSettings ? (
          <SettingsPanel onClose={() => setShowSettings(false)} theme={theme} setTheme={setTheme} />
        ) : showAdmin ? (
          <AdminPanel onClose={() => setShowAdmin(false)} />
        ) : showTPass ? (
          <TPassView onBack={() => setShowTPass(false)} />
        ) : showTodos ? (
          <TodosView onBack={() => setShowTodos(false)} />
        ) : showReserv ? (
          <ReservView onBack={() => setShowReserv(false)} />
        ) : showMeal ? (
          <MealView onBack={() => setShowMeal(false)} />
        ) : (
          <Calendar onAddPersonalEvent={() => setShowPersonalModal(true)} />
        )}

        {showEventModal && <EventModal />}
        {showEventDetail && <EventDetail />}
        {showNotifications && <NotificationPanel />}
        {showPersonalModal && <PersonalEventModal onClose={() => setShowPersonalModal(false)} />}
      </div>
      <ToastContainer />
    </div>
  );
}
