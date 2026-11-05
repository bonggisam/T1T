import React from 'react';
import {
  AlertTriangle, BarChart3, Bell, BookOpen, Briefcase, Building2, Calendar, CalendarDays, Check, CheckCircle2,
  CheckSquare, Clock, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Crown, DoorOpen,
  Download, Eye, Flame, Folder, Globe2, GraduationCap, Inbox, Info, Lightbulb, Link, ListChecks, Lock, Megaphone, MessageSquare,
  Palette, PartyPopper, Pencil, Phone, Pin, Printer, RefreshCw, School, Search, Settings, Square, Sun, Moon, Thermometer,
  Trash2, Umbrella, User, Users, UtensilsCrossed, Wand2, Wrench, X, Zap,
} from 'lucide-react';

const ICONS = {
  alert: AlertTriangle,
  bell: Bell,
  book: BookOpen,
  briefcase: Briefcase,
  building: Building2,
  calendar: Calendar,
  calendarDays: CalendarDays,
  chart: BarChart3,
  check: Check,
  checkCircle: CheckCircle2,
  checkSquare: CheckSquare,
  clock: Clock,
  cloud: Cloud,
  cloudDrizzle: CloudDrizzle,
  cloudFog: CloudFog,
  cloudLightning: CloudLightning,
  cloudRain: CloudRain,
  cloudSnow: CloudSnow,
  cloudSun: CloudSun,
  crown: Crown,
  door: DoorOpen,
  download: Download,
  eye: Eye,
  flame: Flame,
  folder: Folder,
  globe: Globe2,
  graduation: GraduationCap,
  inbox: Inbox,
  info: Info,
  bulb: Lightbulb,
  link: Link,
  list: ListChecks,
  lock: Lock,
  megaphone: Megaphone,
  message: MessageSquare,
  moon: Moon,
  palette: Palette,
  party: PartyPopper,
  pencil: Pencil,
  phone: Phone,
  pin: Pin,
  printer: Printer,
  refresh: RefreshCw,
  school: School,
  search: Search,
  settings: Settings,
  square: Square,
  sun: Sun,
  thermometer: Thermometer,
  trash: Trash2,
  umbrella: Umbrella,
  user: User,
  users: Users,
  meal: UtensilsCrossed,
  wand: Wand2,
  wrench: Wrench,
  x: X,
  zap: Zap,
} as const;

export type IconName = keyof typeof ICONS;

interface IcProps {
  name: IconName;
  /** 글자 옆에 놓을 때 오른쪽 여백. 아이콘만 있는 단추에서는 끈다 */
  gap?: boolean;
  /** 글자 크기를 따라가는 것이 기본이다 */
  size?: number | string;
  style?: React.CSSProperties;
}

/** 글자 흐름 안에 넣는 선 아이콘. 색과 크기는 주변 글자를 따른다. */
export function Ic({ name, gap = true, size = '1.05em', style }: IcProps) {
  const Icon = ICONS[name];
  return (
    <Icon
      size={size}
      strokeWidth={2.2}
      aria-hidden="true"
      style={{ verticalAlign: '-0.16em', flexShrink: 0, marginRight: gap ? '0.3em' : 0, ...style }}
    />
  );
}
