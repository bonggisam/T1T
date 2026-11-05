import type { WeatherData } from '@shared/types';
import type { IconName } from '../components/common/Ic';

/**
 * 날씨·미세먼지 표시 헬퍼.
 * 태성중·태성고 위치(경기 용인시 처인구 백옥대로 1059-2) 기준으로 조회.
 */
export const SCHOOL_LOCATION = { lat: 37.2296, lon: 127.2148, label: '용인 처인구' };

const CACHE_KEY = 'tonet-weather-cache';
export const WEATHER_REFRESH_MS = 30 * 60 * 1000;

/** WMO weather code → 아이콘 + 한글 설명 */
export function describeWeather(code: number | null): { icon: IconName; label: string } {
  if (code === null) return { icon: 'thermometer', label: '날씨' };
  if (code === 0) return { icon: 'sun', label: '맑음' };
  if (code <= 2) return { icon: 'cloudSun', label: '구름 조금' };
  if (code === 3) return { icon: 'cloud', label: '흐림' };
  if (code === 45 || code === 48) return { icon: 'cloudFog', label: '안개' };
  if (code >= 51 && code <= 57) return { icon: 'cloudDrizzle', label: '이슬비' };
  if (code >= 61 && code <= 67) return { icon: 'cloudRain', label: '비' };
  if (code >= 71 && code <= 77) return { icon: 'cloudSnow', label: '눈' };
  if (code >= 80 && code <= 82) return { icon: 'cloudRain', label: '소나기' };
  if (code === 85 || code === 86) return { icon: 'cloudSnow', label: '소낙눈' };
  if (code >= 95) return { icon: 'cloudLightning', label: '뇌우' };
  return { icon: 'thermometer', label: '날씨' };
}

export type AirGrade = { label: '좋음' | '보통' | '나쁨' | '매우나쁨'; color: string; level: number };

const GRADES: AirGrade[] = [
  { label: '좋음', color: '#3B82F6', level: 0 },
  { label: '보통', color: '#22C55E', level: 1 },
  { label: '나쁨', color: '#F59E0B', level: 2 },
  { label: '매우나쁨', color: '#EF4444', level: 3 },
];

/** 환경부 기준 미세먼지(PM10) 등급 */
export function gradePm10(v: number | null): AirGrade | null {
  if (v === null) return null;
  return GRADES[v <= 30 ? 0 : v <= 80 ? 1 : v <= 150 ? 2 : 3];
}

/** 환경부 기준 초미세먼지(PM2.5) 등급 */
export function gradePm25(v: number | null): AirGrade | null {
  if (v === null) return null;
  return GRADES[v <= 15 ? 0 : v <= 35 ? 1 : v <= 75 ? 2 : 3];
}

/** 두 등급 중 나쁜 쪽 (요약 표시용) */
export function worseGrade(a: AirGrade | null, b: AirGrade | null): AirGrade | null {
  if (!a) return b;
  if (!b) return a;
  return a.level >= b.level ? a : b;
}

export function readWeatherCache(): WeatherData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isWeatherCacheFresh(data: WeatherData | null): boolean {
  if (!data) return false;
  return Date.now() - new Date(data.fetchedAt).getTime() < WEATHER_REFRESH_MS;
}

export async function loadWeather(): Promise<WeatherData | null> {
  if (!window.electronAPI?.weatherFetch) return null;
  const data = await window.electronAPI.weatherFetch(SCHOOL_LOCATION.lat, SCHOOL_LOCATION.lon);
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); }
  catch (e) { console.warn('[Weather] cache write failed:', e); }
  return data;
}
