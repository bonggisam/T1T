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
  /** 학교 홈페이지에서 자동으로 가져온 학사일정 */
  schoolScheduleImport?: boolean;
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
export type NotificationType = 'new_event' | 'event_updated' | 'event_deleted' | 'approval' | 'board_post';

export interface AppNotification {
  id: string;
  type: NotificationType;
  eventId?: string;
  message: string;
  read: boolean;
  createdAt: Date;
  createdBy: string;
}

// 내 시간표 (나이스 시간표 + 담당 학급 표). 이름은 컴시간을 쓰던 때 그대로다
export interface ComciganConfig {
  schoolCode: number;
  schoolName: string;
  teacherName: string;
  maxGrade: number;
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
  /** 교사 이름별 수업 */
  teachers: Record<string, ComciganTeacherSlots>;
  classTimes: string[];
  fetchedAt: string;
}

/** 한 교사가 맡은 과목과 학급 한 칸 */
export interface TeachingItem {
  subject: string;
  grade: number;
  classNum: number;
}

/** 나이스에 칸이 없는 수업(선택과목 이동수업 등). 요일과 교시로 적는다 */
export interface TeachingSlot extends TeachingItem {
  /** 1=월 ~ 5=금 */
  weekday: number;
  period: number;
}

export type TeachingSource = 'timetable' | 'admin' | 'self' | 'file';

/** 학교 기초 시간표(관리자가 올린 컴시간 파일)의 수업 한 칸 */
export interface BaseTimetableLesson {
  /** 교사 이름 */
  name: string;
  /** 1=월 ~ 5=금 */
  weekday: number;
  period: number;
  grade: number;
  classNum: number;
  /** 나이스 과목 이름. 찾지 못했으면 파일의 줄임말이다 */
  subject: string;
  /** 나이스에서 과목 이름을 찾지 못했다. 나이스와 칸을 대조하지 않고 그 요일과 교시에 둔다 */
  fixed?: boolean;
}

/** 학교마다 하나. 매일 나이스 시간표와 칸마다 대조해 바뀐 수업만 그 주에 덧씌운다 */
export interface BaseTimetable {
  school: School;
  lessons: BaseTimetableLesson[];
  fileName?: string;
  updatedBy?: string;
  updatedAt?: Date | null;
}

/** 담당 학급 표의 한 사람. 학교와 이름으로 찾는다 */
export interface TeachingAssignment {
  name: string;
  items: TeachingItem[];
  slots: TeachingSlot[];
  /**
   * timetable=전에 받은 시간표에서 자동으로 만듦, admin=관리자 표, self=본인 입력,
   * file=관리자가 올린 컴시간 파일(학교 전체 기초 시간표로 만들어 이 PC의 옛 기록보다 정확하다)
   */
  source: TeachingSource;
  updatedBy?: string;
  updatedAt?: Date | null;
}

export interface ComciganLinkEntry {
  label: string;
  userId: string;
  name: string;
}

/** 표의 이름과 계정 연결. 담당 학급 표와 명단에서 만든다. */
export interface ComciganLinkDoc {
  school: School;
  schoolCode: number;
  schoolName: string;
  maxGrade: number;
  entries: ComciganLinkEntry[];
  updatedBy?: string;
  updatedAt?: Date | null;
}

// 시험감독 게시판: 부서, 교과별로 사진을 올려 탭으로 본다
export type BoardGroup = 'dept' | 'subject';

export interface BoardImageRef {
  id: string;
  width: number;
  height: number;
}

export interface BoardPost {
  id: string;
  group: BoardGroup;
  /** 탭 이름. 교무부, 수학 등 */
  tab: string;
  title: string;
  school: School | 'all';
  images: BoardImageRef[];
  createdBy: string;
  createdByName: string;
  createdAt: Date | null;
}

export interface TeacherPeriod {
  grade: number;
  classNum: number;
  weekday: number; // 1=Mon, 5=Fri
  weekdayStr: string;
  period: number;
  subject: string;
  startTime?: string; // e.g. '09:10'
  /** 기초 시간표에 없던 칸. 나이스에서 수업이 바뀌어 들어왔다 */
  moved?: boolean;
}

export interface ComciganTimetableData {
  teacherSchedule: TeacherPeriod[];
  classTimes: string[];
  lastUpdated: string;
  schoolName: string;
  /** neis면 나이스에서 받은 자료다. 없으면 전에 컴시간에서 받은 값이다 */
  source?: 'neis';
  /** 어느 주의 자료인지. 그 주 월요일 yyyy-MM-dd */
  weekStart?: string;
  /** base면 학교 기초 시간표를 나이스와 대조해 만들었다. 없으면 담당 학급 표로 만들었다 */
  basis?: 'base';
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
  /** 외출시스템 비밀번호 단계를 넘긴다. 값은 메인 프로세스에만 있다 */
  tpassAutoLogin: (webContentsId: number) => Promise<{ ok: boolean; reason?: string; attempt?: number }>;
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
  googleRefresh: (refreshToken: string) => Promise<{ access_token: string; expires_in: number } | { error: string; expired?: boolean }>;
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
  // 앱 설정
  clearWebSessions: () => Promise<void>;
  setEditShortcut: (enabled: boolean) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
