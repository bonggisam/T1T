// User roles
export type UserRole = 'super_admin' | 'admin' | 'head_teacher' | 'teacher';
export type UserStatus = 'pending' | 'active' | 'rejected' | 'deactivated';
export type School = 'taeseong_middle' | 'taeseong_high';

export const SCHOOL_LABELS: Record<School, string> = {
  taeseong_middle: '태성중학교',
  taeseong_high: '태성고등학교',
};

/** 기본 프로필/이벤트 색상 */
export const DEFAULT_PROFILE_COLOR = '#4A90E2';
export const SUPER_ADMIN_PROFILE_COLOR = '#FF6B6B';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  school: School;
  profileColor?: string; // HEX, admin only
  createdAt: Date;
  lastLogin: Date;
  settings: UserSettings;
}

export interface UserSettings {
  notificationSound: boolean;
  notificationBadge: boolean;
  transparency: number; // 0~100
  alwaysOnTop: boolean;
  clickThrough: boolean;
  defaultView: CalendarView;
  theme: 'light' | 'dark' | 'system';
  syncInterval: number; // minutes
  connectedCalendars: ConnectedCalendar[];
  reminderDefault: ReminderTime;
  /** 다중 알림 — 활성화된 알림 시점 (복수 선택 가능) */
  multiReminders?: ReminderTime[]; // 예: ['10min', '1hour', '1day']
}

export type CalendarView = 'month' | 'week' | 'day' | 'year' | 'agenda' | 'stats';
export type ReminderTime = '10min' | '30min' | '1hour' | '1day' | 'none';

export interface ConnectedCalendar {
  type: 'google' | 'apple' | 'notion' | 'outlook';
  connected: boolean;
  color: string;
  lastSync?: Date;
}

// Events
export interface ReadReceipt {
  name: string;
  readAt: Date; // Firestore Timestamp → Date 로 변환되어 저장됨
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  category: EventCategory;
  school: School | 'all'; // 공유 범위: 'all' = 양교 공통
  creatorSchool?: School; // 작성자의 학교 (태그 표시용; 기존 데이터는 fallback으로 school 사용)
  createdBy: string; // userId
  adminName?: string;
  adminColor: string;
  repeat: RepeatConfig | null;
  attachments: Attachment[];
  checklist: ChecklistItem[];
  readBy: Record<string, ReadReceipt>; // userId -> { name, readAt }
  createdAt: Date;
  updatedAt: Date;
}

export type EventCategory = 'event' | 'meeting' | 'deadline' | 'notice' | 'other';

/**
 * 반복 일정 설정 (아직 UI 미노출 — 향후 구현 예정).
 * CalendarEvent.repeat은 항상 null로 저장되며, UI에서 편집 불가.
 */
export interface RepeatConfig {
  type: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  interval: number;
  endDate?: Date;
  daysOfWeek?: number[]; // 0=Sun, 6=Sat
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
  order: number;
}

// Personal events (from external calendars)
export interface PersonalEvent {
  id: string;
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  allDay: boolean; // 종일 이벤트 (구글 동기화 시 date vs dateTime)
  source: 'local' | 'google' | 'apple' | 'notion' | 'outlook';
  externalId: string | null;
  checklist: ChecklistItem[];
  color: string;
}

// Todos
export interface Todo {
  id: string;
  userId: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  dueDate?: Date;
  school: School | 'all';
  createdAt: Date;
  updatedAt: Date;
}

// Event Comments
export interface EventComment {
  id: string;
  eventId: string;
  userId: string;
  userName: string;
  userColor: string;
  text: string;
  createdAt: Date;
}

// Notifications
export type NotificationType = 'new_event' | 'event_updated' | 'event_deleted' | 'approval';

export interface AppNotification {
  id: string;
  type: NotificationType;
  eventId?: string;
  message: string;
  read: boolean;
  createdAt: Date;
  createdBy: string;
}

// Comcigan (school timetable)
export interface ComciganSchool {
  code: number;
  name: string;
  region: string;
}

export interface ComciganConfig {
  schoolCode: number;
  schoolName: string;
  teacherName: string;
  maxGrade: number;
}

export interface TeacherPeriod {
  grade: number;
  classNum: number;
  weekday: number; // 1=Mon, 5=Fri
  weekdayStr: string;
  period: number;
  subject: string;
  startTime?: string; // e.g. '09:10'
}

export interface ComciganTimetableData {
  teacherSchedule: TeacherPeriod[];
  classTimes: string[];
  lastUpdated: string;
  schoolName: string;
}

// Electron API bridge
export interface ElectronAPI {
  toggleAlwaysOnTop: (value: boolean) => Promise<void>;
  setOpacity: (opacity: number) => Promise<void>;
  toggleClickThrough: (enabled: boolean) => Promise<void>;
  minimize: () => Promise<void>;
  close: () => Promise<void>;
  setSize: (width: number, height: number) => Promise<void>;
  setWidgetMode: (enabled: boolean) => Promise<void>;
  getWidgetMode: () => Promise<boolean>;
  getBounds: () => Promise<{ x: number; y: number; width: number; height: number }>;
  setBounds: (bounds: { x: number; y: number; width: number; height: number }) => Promise<void>;
  onWidgetModeChanged: (callback: (enabled: boolean) => void) => () => void;
  onClickThroughChanged: (callback: (enabled: boolean) => void) => () => void;
  setTrayBadge: (hasBadge: boolean) => Promise<void>;
  // Auto-updater
  updaterDownload: () => Promise<void>;
  updaterInstall: () => Promise<void>;
  updaterCheck: () => Promise<void>;
  getAppVersion: () => Promise<string>;
  onUpdaterEvent: (callback: (channel: string, data: any) => void) => () => void;
  // Google Calendar
  googleAuth: () => Promise<{ access_token: string; expires_in: number } | null>;
  // Comcigan
  comciganSearch: (name: string) => Promise<ComciganSchool[]>;
  comciganConfigure: (config: ComciganConfig) => Promise<void>;
  comciganGetConfig: () => Promise<ComciganConfig | null>;
  comciganFetch: () => Promise<ComciganTimetableData | null>;
  comciganGetCached: () => Promise<ComciganTimetableData | null>;
  comciganClear: () => Promise<void>;
  onComciganUpdate: (callback: (data: ComciganTimetableData) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
