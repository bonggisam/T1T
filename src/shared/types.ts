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

export interface AppearanceChoices {
  theme: 'clear' | 'grid' | 'chalk' | 'night' | 'blossom' | 'contrast' | 'system';
  accent: 'theme' | 'blue' | 'indigo' | 'teal' | 'orange' | 'pink';
  eventFontPx: 13 | 15 | 18;
  colorBy: 'school' | 'category' | 'author';
  colorAssist: boolean;
  hideWeekend: boolean;
}

export interface UserSettings {
  notificationSound: boolean;
  notificationBadge: boolean;
  alwaysOnTop: boolean;
  clickThrough: boolean;
  defaultView: CalendarView;
  theme: 'light' | 'dark' | 'system';
  /** 테마, 강조색, 일정 글자 등. 없으면 theme에서 옮겨 온다 */
  appearance?: AppearanceChoices;
  syncInterval: number; // minutes
  connectedCalendars: ConnectedCalendar[];
  reminderDefault: ReminderTime;
  /** 다중 알림 — 활성화된 알림 시점 (복수 선택 가능) */
  multiReminders?: ReminderTime[]; // 예: ['10min', '1hour', '1day']
}

export type CalendarView = 'month' | 'week' | 'day' | 'year' | 'agenda' | 'stats' | 'today';
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
  /** 같은 반복으로 만든 회차를 묶는 값. 없으면 한 번뿐인 일정 */
  seriesId?: string | null;
  /** 응답을 받는 일정이면 그 종류 */
  responseType?: ResponseType | null;
  /** 달력에 함께 그리는 내 감독·당직 차례. 일정 문서가 아니어서 저장하지 않고 화면에서만 쓴다. */
  duty?: DutyRef;
  attachments: Attachment[];
  checklist: ChecklistItem[];
  readBy: Record<string, ReadReceipt>; // userId -> { name, readAt }
  createdAt: Date;
  updatedAt: Date;
}

export type EventCategory = 'event' | 'meeting' | 'deadline' | 'notice' | 'other';

/**
 * 반복 규칙. 표시와 다시 계산에 쓰는 설명이고, 일정 자체는 회차마다 문서 하나로 저장한다.
 * 구글 동기화가 문서 단위이고 고정 ID로 중복을 막으므로, 회차를 문서로 두면 그 구조를 그대로 쓴다.
 */
export interface RepeatConfig {
  /** weekdays=평일 매일, weekly=요일 지정, monthly=매월 같은 날, monthlyNth=매월 N째 요일 */
  type: 'weekdays' | 'weekly' | 'monthly' | 'monthlyNth';
  /** weekly에서 몇 주마다인지. 1=매주, 2=격주 */
  interval: number;
  /** 마지막 날 (포함, yyyy-MM-dd) */
  until: string;
  daysOfWeek?: number[]; // 0=Sun, 6=Sat
  skipHolidays: boolean;
}

/** 수정, 삭제를 적용할 회차 범위 */
export type SeriesScope = 'this' | 'following' | 'all';

/** attendance=참석·불참, confirm=확인 */
export type ResponseType = 'attendance' | 'confirm';
export type ResponseStatus = 'attend' | 'absent' | 'confirm';

export interface EventResponse {
  userId: string;
  name: string;
  status: ResponseStatus;
  respondedAt: Date;
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
  repeat?: RepeatConfig | null;
  seriesId?: string | null;
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
  /** 연결표로 확인한 컴시간 표기. 있으면 이름 앞 두 글자 대신 이 값으로 내 수업을 찾는다. */
  teacherLabel?: string;
}

/** 한 교사의 전교 시간표 요약. 어느 반에 들어가는지는 넘기지 않는다. */
export interface ComciganTeacherSlots {
  /** 수업이 있는 칸. `요일-교시`, 요일은 1=월 ~ 5=금 */
  slots: string[];
  subjects: string[];
  grades: number[];
}

/** 회의 찾기와 연결표에 쓰는 학교 전체의 교사별 수업 칸 */
export interface ComciganSchoolGrid {
  schoolCode: number;
  /** 컴시간 교사 표기(두 글자)별 수업 */
  teachers: Record<string, ComciganTeacherSlots>;
  classTimes: string[];
  fetchedAt: string;
}

export interface ComciganLinkEntry {
  label: string;
  userId: string;
  name: string;
}

/** 컴시간 표기와 계정 연결표. 학교마다 문서 하나이고 관리자가 고친다. */
export interface ComciganLinkDoc {
  school: School;
  schoolCode: number;
  schoolName: string;
  maxGrade: number;
  entries: ComciganLinkEntry[];
  updatedBy?: string;
  updatedAt?: Date | null;
}

// 시험 감독·당직 표
export interface DutyEntry {
  id: string;
  date: string; // yyyy-MM-dd
  /** 자정부터 분. 없으면 하루 종일로 표시한다 */
  startMin: number | null;
  endMin: number | null;
  /** 표에 적힌 교시. 시각을 교시마다 고칠 때 쓴다 */
  periods: number[];
  name: string;
  kind: string;
  place: string;
}

export interface DutyTable {
  id: string;
  title: string;
  school: School | 'all';
  createdBy: string;
  createdByName: string;
  firstDate: string;
  lastDate: string;
  entries: DutyEntry[];
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface DutyRef {
  tableId: string;
  entryId: string;
  tableTitle: string;
  kind: string;
  place: string;
  periods: number[];
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

// Weather (Open-Meteo)
export interface WeatherData {
  temperature: number | null; // °C
  weatherCode: number | null; // WMO weather code
  precipitation: number | null; // mm (현재)
  tempMax: number | null;
  tempMin: number | null;
  precipProbability: number | null; // % (오늘 최대)
  pm10: number | null; // μg/m³ (모델 추정치)
  pm25: number | null; // μg/m³ (모델 추정치)
  fetchedAt: string; // ISO
}

/** 업데이트 진행 상태. 화면이 늦게 떠도 알 수 있게 메인 프로세스가 들고 있다 */
export interface UpdateState {
  phase: 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  manualOnly?: boolean;
  idleMinutes?: number;
  error?: string;
  /** 마지막으로 확인한 시각 (ISO) */
  checkedAt?: string;
  /** GitHub에 올라온 최신 버전 */
  latest?: string;
  /** 마지막 확인이나 다운로드의 오류. 자동 확인 오류는 배너에 띄우지 않으므로 설정에서 보여 준다 */
  checkError?: string;
}

// Electron API bridge
export interface ElectronAPI {
  toggleAlwaysOnTop: (value: boolean) => Promise<void>;
  setZoomFactor: (factor: number) => void;
  toggleClickThrough: (enabled: boolean) => Promise<void>;
  getClickThrough: () => Promise<boolean>;
  minimize: () => Promise<void>;
  close: () => Promise<void>;
  setSize: (width: number, height: number) => Promise<void>;
  setWidgetMode: (enabled: boolean) => Promise<void>;
  getWidgetMode: () => Promise<boolean>;
  getBounds: () => Promise<{ x: number; y: number; width: number; height: number }>;
  setBounds: (bounds: { x: number; y: number; width: number; height: number }) => Promise<void>;
  startEdgeResize: (edge: 'top'|'right'|'bottom'|'left'|'top-left'|'top-right'|'bottom-left'|'bottom-right') => Promise<void>;
  stopEdgeResize: () => Promise<void>;
  openExternal: (url: string) => Promise<{ ok: boolean; reason?: string }>;
  onWidgetModeChanged: (callback: (enabled: boolean) => void) => () => void;
  onClickThroughChanged: (callback: (enabled: boolean) => void) => () => void;
  /** 절전 복귀나 화면 잠금 해제 때 호출 */
  onSystemWoke: (callback: () => void) => () => void;
  onPrivacyToggle: (callback: () => void) => () => void;
  setTrayBadge: (hasBadge: boolean) => Promise<void>;
  // Auto-updater
  updaterDownload: () => Promise<void>;
  updaterInstall: () => Promise<void>;
  /** version은 받을 새 버전이 있을 때만 있다. latest는 GitHub에 올라온 최신 버전이다. */
  updaterCheck: () => Promise<{ ok: true; version?: string; latest?: string } | { ok: false; error: string }>;
  updaterOpenDownloadPage: () => Promise<{ ok: boolean; reason?: string }>;
  updaterGetState: () => Promise<UpdateState>;
  /** update.log 끝부분을 클립보드에 넣는다 */
  updaterCopyLog: () => Promise<{ ok: boolean; lines: number }>;
  getAppVersion: () => Promise<string>;
  getAutoLaunch: () => Promise<boolean>;
  setAutoLaunch: (enabled: boolean) => Promise<boolean>;
  onUpdaterEvent: (callback: (channel: string, data: any) => void) => () => void;
  // Google Calendar
  googleAuth: () => Promise<{ access_token: string; refresh_token?: string; expires_in: number } | { error: string }>;
  googleRefresh: (refreshToken: string) => Promise<{ access_token: string; expires_in: number } | { error: string }>;
  // School website scraper
  schoolFetchSchedule: (schoolKey: string) => Promise<{
    events: Array<{ startDate: string; endDate: string; title: string; seq: string }>;
  }>;
  schoolFetchMeal: (schoolKey: string, dateYMD?: string) => Promise<{
    weekStart: string;
    weekEnd: string;
    days: Array<{ date: string; weekday: string; menu: string[]; calorie: string }>;
  }>;
  // Weather
  weatherFetch: (lat: number, lon: number) => Promise<WeatherData>;
  // Comcigan
  comciganSearch: (name: string) => Promise<ComciganSchool[]>;
  comciganConfigure: (config: ComciganConfig) => Promise<void>;
  comciganGetConfig: () => Promise<ComciganConfig | null>;
  comciganFetch: () => Promise<ComciganTimetableData | null>;
  comciganGetCached: () => Promise<ComciganTimetableData | null>;
  comciganClear: () => Promise<void>;
  /** 학교 전체의 교사별 수업 칸. 내 시간표 설정과 상관없이 학교 코드로 읽는다. */
  comciganSchoolGrid: (schoolCode: number, maxGrade: number, force?: boolean) => Promise<ComciganSchoolGrid>;
  onComciganUpdate: (callback: (data: ComciganTimetableData) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
