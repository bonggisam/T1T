import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import type { DutyEntry, DutyTable } from '@shared/types';
import { canManageDutyTable, countByTeacher, dutyTitle, dutyWhenText, groupByDate, isMyDuty } from '../../utils/dutyEntries';
import { useAuthStore } from '../../store/authStore';
import { labelLinksFor, useComciganLinksStore } from '../../store/comciganLinksStore';
import { useDutyStore, useMyDuties } from '../../store/dutyStore';
import { showToast } from '../common/Toast';
import { DutyImportModal } from './DutyImportModal';

const UPCOMING_LIMIT = 40;

function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return format(new Date(y, m - 1, d), 'M월 d일 (EEE)', { locale: ko });
}

function rangeLabel(table: DutyTable): string {
  if (!table.firstDate) return '';
  const short = (date: string) => {
    const [y, m, d] = date.split('-').map(Number);
    return format(new Date(y, m - 1, d), 'M/d');
  };
  return table.firstDate === table.lastDate ? short(table.firstDate) : `${short(table.firstDate)}~${short(table.lastDate)}`;
}

/** 시험감독 표: 내 차례, 표 목록, 표 내용 */
export function DutyView({ onBack }: { onBack: () => void }) {
  const user = useAuthStore((s) => s.user);
  const tables = useDutyStore((s) => s.tables);
  const loaded = useDutyStore((s) => s.loaded);
  const denied = useDutyStore((s) => s.denied);
  const focusTableId = useDutyStore((s) => s.focusTableId);
  const setFocusTable = useDutyStore((s) => s.setFocusTable);
  const deleteTable = useDutyStore((s) => s.deleteTable);
  const mine = useMyDuties();
  const [openId, setOpenId] = useState<string | null>(focusTableId);
  const [editing, setEditing] = useState<{ table: DutyTable | null } | null>(null);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    if (!focusTableId) return;
    setOpenId(focusTableId);
    setFocusTable(null);
  }, [focusTableId, setFocusTable]);

  const today = format(new Date(), 'yyyy-MM-dd');
  const upcoming = useMemo(() => mine.filter((d) => d.entry.date >= today), [mine, today]);
  const myCountByTable = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { table, entry } of mine) {
      if (entry.date >= today) counts.set(table.id, (counts.get(table.id) ?? 0) + 1);
    }
    return counts;
  }, [mine, today]);

  const current = tables.filter((t) => t.lastDate >= today);
  const past = tables.filter((t) => t.lastDate < today);
  const open = openId ? tables.find((t) => t.id === openId) ?? null : null;

  async function remove(table: DutyTable) {
    if (!window.confirm(`"${table.title}" 표를 지울까요?\n각 선생님 달력의 차례도 함께 사라집니다.`)) return;
    try {
      await deleteTable(table.id);
      setOpenId(null);
      showToast('표를 지웠습니다');
    } catch (err) {
      console.error('[Duty] delete failed:', err);
      showToast('표를 지우지 못했습니다', 'error');
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <button
          onClick={() => (open ? setOpenId(null) : onBack())}
          style={styles.backBtn}
          aria-label={open ? '표 목록으로 돌아가기' : '달력으로 돌아가기'}
        >
          <ArrowLeft size={14} />
        </button>
        <h3 style={styles.heading}>{open ? open.title : '시험감독'}</h3>
        {open
          ? canManageDutyTable(open, user) && (
            <>
              <button onClick={() => setEditing({ table: open })} style={styles.iconBtn} aria-label="표 고치기" title="표 고치기"><Pencil size={14} /></button>
              <button onClick={() => remove(open)} style={styles.iconBtn} aria-label="표 지우기" title="표 지우기"><Trash2 size={14} /></button>
            </>
          )
          : (
            <button onClick={() => setEditing({ table: null })} style={styles.addBtn}><Plus size={13} />표 올리기</button>
          )}
      </div>

      <div style={styles.body}>
        {denied && (
          <p style={styles.warn}>시험감독 표를 불러오지 못했습니다. 서버 규칙 적용 여부를 관리자에게 확인해 주세요.</p>
        )}
        {!loaded && !denied && <p style={styles.note}>불러오는 중입니다...</p>}

        {open ? (
          <TableDetail table={open} />
        ) : (
          <>
            <section style={styles.section} aria-label="내 차례">
              <h4 style={styles.sectionTitle}>내 차례</h4>
              {upcoming.length === 0 ? (
                <p style={styles.note}>{loaded ? '앞으로 내 차례가 없습니다.' : ''}</p>
              ) : (
                groupByDate(upcoming.slice(0, UPCOMING_LIMIT).map((d) => ({ ...d, date: d.entry.date }))).map(({ date, items }) => (
                  <div key={date} style={styles.dayBlock}>
                    <b style={styles.dayLabel}>{dateLabel(date)}</b>
                    {items.map(({ table, entry }) => (
                      <button
                        key={`${table.id}-${entry.id}`}
                        type="button"
                        style={styles.myRow}
                        onClick={() => setOpenId(table.id)}
                      >
                        <span style={styles.when}>{dutyWhenText(entry)}</span>
                        <span style={styles.what}>{dutyTitle(entry)}</span>
                      </button>
                    ))}
                  </div>
                ))
              )}
              {upcoming.length > UPCOMING_LIMIT && <p style={styles.note}>외 {upcoming.length - UPCOMING_LIMIT}건은 표에서 볼 수 있습니다.</p>}
            </section>

            <section style={styles.section} aria-label="표 목록">
              <h4 style={styles.sectionTitle}>표</h4>
              {loaded && current.length === 0 && <p style={styles.note}>진행 중인 표가 없습니다. 담당자가 표를 붙여 넣으면 여기에 나타납니다.</p>}
              {current.map((table) => (
                <TableCard key={table.id} table={table} mine={myCountByTable.get(table.id) ?? 0} onOpen={setOpenId} />
              ))}
              {past.length > 0 && (
                <button type="button" style={styles.linkBtn} onClick={() => setShowPast((v) => !v)}>
                  지난 표 {past.length}개 {showPast ? '접기' : '보기'}
                </button>
              )}
              {showPast && past.map((table) => <TableCard key={table.id} table={table} mine={0} onOpen={setOpenId} />)}
            </section>
          </>
        )}
      </div>

      {editing && <DutyImportModal table={editing.table} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TableCard({ table, mine, onOpen }: { table: DutyTable; mine: number; onOpen: (id: string) => void }) {
  return (
    <button type="button" style={styles.card} onClick={() => onOpen(table.id)}>
      <span style={styles.cardTitle}>{table.title}</span>
      <span style={styles.cardMeta}>
        {rangeLabel(table)} · {table.entries.length}건 · {table.createdByName}
        {mine > 0 && <b style={styles.cardMine}> · 내 차례 {mine}건</b>}
      </span>
    </button>
  );
}

/** 표 내용. 교사별 횟수는 표를 만든 사람과 관리자에게만 보여 준다. */
function TableDetail({ table }: { table: DutyTable }) {
  const user = useAuthStore((s) => s.user);
  const links = useComciganLinksStore((s) => s.links);
  const [query, setQuery] = useState('');
  const canManage = canManageDutyTable(table, user);
  const labelLinks = useMemo(() => labelLinksFor(links, user?.id), [links, user?.id]);

  const entries = useMemo(() => {
    const q = query.trim();
    return q ? table.entries.filter((e) => e.name.includes(q) || e.place.includes(q)) : table.entries;
  }, [table.entries, query]);
  const groups = useMemo(() => groupByDate(entries), [entries]);
  const counts = useMemo(() => countByTeacher(table.entries), [table.entries]);
  const today = format(new Date(), 'yyyy-MM-dd');
  const nearest = groups.find((g) => g.date >= today)?.date ?? groups[0]?.date;

  const isMine = (entry: DutyEntry) => !!user && isMyDuty(table, entry, { id: user.id, name: user.name, school: user.school }, labelLinks);

  return (
    <>
      <p style={styles.note}>
        {rangeLabel(table)} · {table.entries.length}건 · 작성 {table.createdByName}
      </p>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="이름이나 장소로 찾기"
        aria-label="표에서 찾기"
        style={styles.input}
      />
      {groups.length === 0 && <p style={styles.note}>맞는 내용이 없습니다.</p>}
      {groups.map(({ date, items }) => (
        <details key={date} open={!!query || date === nearest} style={styles.dateGroup}>
          <summary style={styles.dateSummary}>{dateLabel(date)} <small style={styles.small}>{items.length}건</small></summary>
          <div role="table" aria-label={`${dateLabel(date)} 내용`}>
            {items.map((entry) => (
              <div key={entry.id} role="row" style={{ ...styles.entryRow, ...(isMine(entry) ? styles.entryMine : {}) }}>
                <span style={styles.when} role="cell">{dutyWhenText(entry)}</span>
                <span style={styles.what} role="cell">{dutyTitle(entry)}</span>
                <b style={styles.who} role="cell">{entry.name}</b>
              </div>
            ))}
          </div>
        </details>
      ))}
      {canManage && (
        <details style={styles.dateGroup}>
          <summary style={styles.dateSummary}>교사별 횟수 <small style={styles.small}>담당자에게만 보입니다</small></summary>
          <div style={styles.countGrid}>
            {counts.map((c) => <span key={c.name} style={styles.countItem}>{c.name} {c.count}</span>)}
          </div>
        </details>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    position: 'relative',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    flexShrink: 0,
    borderBottom: '1px solid var(--border-subtle)',
  },
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 8px',
    border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
    borderRadius: 6,
    background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
    color: 'var(--accent)',
    cursor: 'pointer',
  },
  heading: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 'var(--fs-control)',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  iconBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: 4,
    border: 'none',
    borderRadius: 6,
    background: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  addBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    padding: '4px 10px',
    border: 'none',
    borderRadius: 6,
    background: 'var(--accent)',
    color: 'var(--on-accent)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-body)',
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '10px 12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  sectionTitle: {
    fontSize: 'var(--fs-body)',
    fontWeight: 700,
    color: 'var(--text-secondary)',
  },
  note: {
    fontSize: 'var(--fs-label)',
    lineHeight: 1.4,
    color: 'var(--text-muted)',
  },
  warn: {
    fontSize: 'var(--fs-label)',
    lineHeight: 1.4,
    fontWeight: 600,
    color: 'var(--warning)',
  },
  dayBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  dayLabel: {
    fontSize: 'var(--fs-body)',
    color: 'var(--text-primary)',
  },
  myRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)',
    gap: 6,
    padding: '4px 8px',
    border: 'none',
    borderRadius: 6,
    background: 'color-mix(in oklab, var(--fam-duty) var(--chip-tint), rgb(var(--plate-rgb)))',
    color: 'var(--fam-duty-ink)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-body)',
    textAlign: 'left',
    cursor: 'pointer',
  },
  when: {
    fontVariantNumeric: 'tabular-nums',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  what: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: 600,
  },
  linkBtn: {
    alignSelf: 'flex-start',
    padding: 0,
    border: 'none',
    background: 'none',
    color: 'var(--accent)',
    fontFamily: 'inherit',
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '6px 10px',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    background: 'var(--bg-secondary)',
    fontFamily: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
  },
  cardTitle: {
    fontSize: 'var(--fs-control)',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  cardMeta: {
    fontSize: 'var(--fs-label)',
    color: 'var(--text-secondary)',
  },
  cardMine: {
    color: 'var(--fam-duty-ink)',
  },
  input: {
    padding: '4px 8px',
    fontSize: 'var(--fs-body)',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    outline: 'none',
  },
  dateGroup: {
    border: '1px solid var(--border-subtle)',
    borderRadius: 7,
    padding: '4px 8px',
  },
  dateSummary: {
    cursor: 'pointer',
    fontSize: 'var(--fs-body)',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  small: {
    fontSize: 'var(--fs-label)',
    fontWeight: 400,
    color: 'var(--text-muted)',
  },
  entryRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 0.7fr)',
    gap: 6,
    padding: '2px 4px',
    borderRadius: 5,
    fontSize: 'var(--fs-body)',
    color: 'var(--text-secondary)',
  },
  entryMine: {
    background: 'color-mix(in oklab, var(--fam-duty) var(--chip-tint), rgb(var(--plate-rgb)))',
    color: 'var(--fam-duty-ink)',
  },
  who: {
    color: 'inherit',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  countGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '2px 10px',
    padding: '4px 0',
  },
  countItem: {
    fontSize: 'var(--fs-label)',
    color: 'var(--text-secondary)',
    fontVariantNumeric: 'tabular-nums',
  },
};
