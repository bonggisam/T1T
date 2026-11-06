import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useNotificationStore } from '../../store/notificationStore';
import { useAuthStore } from '../../store/authStore';
import { useCalendarStore } from '../../store/calendarStore';
import { showToast } from '../common/Toast';
import { Ic } from '../common/Ic';

export function NotificationPanel({ onOpenBoard }: { onOpenBoard?: () => void }) {
  const { notifications, markAsRead, markAllAsRead, setShowPanel } = useNotificationStore();
  const { user } = useAuthStore();
  const { events, setSelectedEvent, setShowEventDetail } = useCalendarStore();

  function handleNotificationClick(notification: typeof notifications[0]) {
    if (!user) return;
    if (!notification.read) {
      markAsRead(notification.id, user.id).catch((err) => {
        console.warn('[Notification] markAsRead failed:', err);
        showToast('알림 읽음 표시 실패', 'error');
      });
    }
    if (notification.type === 'board_post') {
      setShowPanel(false);
      onOpenBoard?.();
      return;
    }
    if (notification.eventId) {
      const event = events.find((e) => e.id === notification.eventId);
      if (event) {
        setSelectedEvent(event);
        setShowEventDetail(true);
        setShowPanel(false);
      }
    }
  }

  return (
    <div
      style={styles.overlay}
      onClick={() => setShowPanel(false)}
      role="dialog"
      aria-modal="true"
      aria-label="알림"
    >
      <div
        className="glass-solid animate-fade-in"
        style={styles.panel}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return;
          const modal = e.currentTarget as HTMLElement;
          const focusable = Array.from(
            modal.querySelectorAll<HTMLElement>(
              'button:not([disabled]), input:not([disabled]):not([type="hidden"]), [tabindex]:not([tabindex="-1"])'
            )
          ).filter((el) => el.offsetParent !== null);
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const active = document.activeElement as HTMLElement | null;
          if (!active || !modal.contains(active)) { e.preventDefault(); first.focus(); return; }
          if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
        }}
      >
        <div style={styles.header}>
          <h4 style={styles.title}><Ic name="bell" />알림</h4>
          <div style={styles.headerActions}>
            {notifications.some((n) => !n.read) && user && (
              <button onClick={() => markAllAsRead(user.id).catch((err) => { console.warn('[Notification] markAllAsRead failed:', err); showToast('모두 읽음 표시 실패', 'error'); })} style={styles.readAllBtn}>
                모두 읽음
              </button>
            )}
            <button onClick={() => setShowPanel(false)} style={styles.closeBtn}><Ic name="x" gap={false} /></button>
          </div>
        </div>

        <div style={styles.list}>
          {notifications.length === 0 ? (
            <p style={styles.empty}>알림이 없습니다.</p>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                style={{
                  ...styles.item,
                  background: n.read ? 'transparent' : 'var(--bg-hover)',
                }}
              >
                <div style={styles.itemIcon}>
                  {n.type === 'new_event' && <Ic name="calendar" gap={false} />}
                  {n.type === 'event_updated' && <Ic name="pencil" gap={false} />}
                  {n.type === 'event_deleted' && <Ic name="trash" gap={false} />}
                  {n.type === 'approval' && <Ic name="checkCircle" gap={false} />}
                  {n.type === 'board_post' && <Ic name="clipboardCheck" gap={false} />}
                </div>
                <div style={styles.itemContent}>
                  <p style={styles.itemMessage}>{n.message}</p>
                  <span style={styles.itemTime}>
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: ko })}
                  </span>
                </div>
                {!n.read && <span style={styles.unreadDot} />}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'var(--scrim-soft)',
    zIndex: 90,
  },
  panel: {
    position: 'absolute',
    top: 40,
    right: 8,
    width: 280,
    maxHeight: '70%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    borderBottom: '1px solid var(--border-subtle)',
  },
  title: {
    fontSize: 'var(--fs-lead)',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  readAllBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 'var(--fs-label)',
    color: 'var(--accent)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 'var(--fs-control)',
    color: 'var(--text-muted)',
  },
  list: {
    flex: 1,
    overflow: 'auto',
    padding: 4,
  },
  empty: {
    textAlign: 'center',
    fontSize: 'var(--fs-control)',
    color: 'var(--text-muted)',
    padding: 30,
  },
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'background 0.12s',
  },
  itemIcon: {
    fontSize: 'var(--fs-title)',
    flexShrink: 0,
    marginTop: 1,
  },
  itemContent: {
    flex: 1,
    minWidth: 0,
  },
  itemMessage: {
    fontSize: 'var(--fs-body)',
    color: 'var(--text-primary)',
    lineHeight: 1.4,
  },
  itemTime: {
    fontSize: 'var(--fs-caption)',
    color: 'var(--text-muted)',
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--accent)',
    flexShrink: 0,
    marginTop: 4,
  },
};
