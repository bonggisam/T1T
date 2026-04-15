import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../utils/firebase';

interface AdminInfo {
  id: string;
  name: string;
  profileColor: string;
}

export function EventLegend() {
  const [admins, setAdmins] = useState<AdminInfo[]>([]);

  useEffect(() => {
    async function fetchAdmins() {
      try {
        const q = query(
          collection(db, 'users'),
          where('role', 'in', ['admin', 'super_admin']),
          where('status', '==', 'active')
        );
        const snapshot = await getDocs(q);
        const list = snapshot.docs.map((d) => ({
          id: d.id,
          name: d.data().name,
          profileColor: d.data().profileColor || '#4A90E2',
        }));
        setAdmins(list);
      } catch {
        // Firestore not configured yet
      }
    }
    fetchAdmins();
  }, []);

  if (admins.length === 0) return null;

  return (
    <div style={styles.container}>
      {admins.map((admin) => (
        <div key={admin.id} style={styles.item}>
          <span style={{ ...styles.dot, background: admin.profileColor }} />
          <span style={styles.label}>{admin.name}</span>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    padding: '6px 12px',
    borderTop: '1px solid var(--border-subtle)',
    flexShrink: 0,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  label: {
    fontSize: 10,
    color: 'var(--text-secondary)',
  },
};
