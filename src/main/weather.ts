/**
 * 날씨 + 미세먼지 (메인 프로세스).
 *
 * Open-Meteo 무료 API 사용 — API 키 불필요.
 * - 날씨: api.open-meteo.com/v1/forecast
 * - 대기질: air-quality-api.open-meteo.com/v1/air-quality (CAMS 모델 추정치)
 * 렌더러 CSP(connect-src)를 넓히지 않기 위해 메인 프로세스에서 호출한다.
 */

import * as https from 'https';
import type { WeatherData } from '../shared/types';

function getJson(urlStr: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(urlStr, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        if ((res.statusCode || 0) >= 400) {
          reject(new Error(`날씨 서버 오류 (${res.statusCode})`));
          return;
        }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); }
        catch { reject(new Error('날씨 응답 해석 실패')); }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('날씨 서버 응답 시간 초과 (10초)'));
    });
  });
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const loc = `latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&timezone=Asia%2FSeoul`;
  const [forecast, air] = await Promise.all([
    getJson(
      `https://api.open-meteo.com/v1/forecast?${loc}` +
      '&current=temperature_2m,weather_code,precipitation' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1',
    ),
    // 대기질 실패는 날씨 표시를 막지 않음
    getJson(`https://air-quality-api.open-meteo.com/v1/air-quality?${loc}&current=pm10,pm2_5`).catch((err) => {
      console.warn('[Weather] air quality fetch failed:', err?.message);
      return null;
    }),
  ]);

  return {
    temperature: num(forecast?.current?.temperature_2m),
    weatherCode: num(forecast?.current?.weather_code),
    precipitation: num(forecast?.current?.precipitation),
    tempMax: num(forecast?.daily?.temperature_2m_max?.[0]),
    tempMin: num(forecast?.daily?.temperature_2m_min?.[0]),
    precipProbability: num(forecast?.daily?.precipitation_probability_max?.[0]),
    pm10: num(air?.current?.pm10),
    pm25: num(air?.current?.pm2_5),
    fetchedAt: new Date().toISOString(),
  };
}
