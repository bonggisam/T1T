import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useNotificationStore } from '../../store/notificationStore';
import { useAuthStore } from '../../store/authStore';
import { useCalendarStore } from '../../store/calendarStore';

export function NotificationPanel() {
  const { notifications, markAsRead, markAllAsRead, setShowPanel } = useNotificationStore();
  const { user } = useAuthStore();
  const { events, setSelectedEvent, setShowEventDetail } = useCalendarStore();

  function handleNotificationClick(notification: typeof notifications[0]) {
    if (!user) return;
    if (!notification.read) {
      markAsRead(notification.id, user.id).catch((err) => console.warn('[Notification] markAsRead failed:', err));
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
    <div style={styles.overlay} onClick={() => setShowPanel(false)}>
      <div className="glass-solid animate-fade-in" style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h4 style={styles.title}>🔔 알림</h4>
          <div style={styles.headerActions}>
            {notifications.some((n) => !n.read) && user && (
              <button onClick={() => markAllAsRead(user.id).catch((err) => console.warn('[Notification] markAllAsRead failed:', err))} style={styles.readAllBtn}>
                모두 읽음
              </button>
            )}
            <button onClick={() => setShowPanel(false)} style={styles.closeBtn}>✕</button>
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
                  {n.type === 'new_event' && '📅'}
                  {n.type === 'event_updated' && '✏️'}
                  {n.type === 'event_deleted' && '🗑️'}
                  {n.type === 'approval' && '✅'}
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
    background: 'rgba(0,0,0,0.15)',
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
    fontSize: 14,
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
    fontSize: 11,
    color: 'var(--accent)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    color: 'var(--text-muted)',
  },
  list: {
    flex: 1,
    overflow: 'auto',
    padding: 4,
  },
  empty: {
    textAlign: 'center',
    fontSize: 13,
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
    fontSize: 16,
    flexShrink: 0,
    marginTop: 1,
  },
  itemContent: {
    flex: 1,
    minWidth: 0,
  },
  itemMessage: {
    fontSize: 12,
    color: 'var(--text-primary)',
    lineHeight: 1.4,
  },
  itemTime: {
    fontSize: 10,
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
