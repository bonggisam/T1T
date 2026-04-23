import type { CalendarEvent } from '@shared/types';

/**
 * CalendarEvent 배열을 iCalendar (.ics) 형식 문자열로 변환.
 * Google/Apple/Outlook 등 모든 캘린더 앱에서 import 가능.
 */
export function exportToICS(events: CalendarEvent[], calendarName = 'T1T'): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//T1T//KR',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeICS(calendarName)}`,
  ];

  for (const e of events) {
    const start = e.startDate instanceof Date ? e.startDate : new Date(e.startDate);
    const end = e.endDate instanceof Date ? e.endDate : new Date(e.endDate);
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${e.id}@t1t`);
    lines.push(`DTSTAMP:${toICSDate(new Date(), false)}`);
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${toICSDate(start, true)}`);
      // 종일은 end date에 +1일 추가가 관례
      const endPlus = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
      lines.push(`DTEND;VALUE=DATE:${toICSDate(endPlus, true)}`);
    } else {
      lines.push(`DTSTART:${toICSDate(start, false)}`);
      lines.push(`DTEND:${toICSDate(end, false)}`);
    }
    lines.push(`SUMMARY:${escapeICS(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeICS(e.description)}`);
    if (e.adminName) lines.push(`ORGANIZER;CN=${escapeICS(e.adminName)}:mailto:noreply@t1t.local`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function toICSDate(d: Date, dateOnly: boolean): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  if (dateOnly) return `${y}${m}${day}`;
  const h = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  return `${y}${m}${day}T${h}${mi}${s}`;
}

function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * 이벤트 배열을 .ics 파일로 다운로드.
 */
export function downloadICS(events: CalendarEvent[], filename = 't1t-events.ics'): void {
  const content = exportToICS(events);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
