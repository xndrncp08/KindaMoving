import 'server-only';
/**
 * Hourly weather at an activity's start from Open-Meteo (CC BY 4.0). The free
 * endpoints are licensed for non-commercial use only; set OPEN_METEO_API_KEY to
 * use the commercial customer endpoints. Coordinates are rounded to 0.01° (~1 km)
 * before leaving the server so exact run locations are never sent.
 * Best effort: any failure returns null and never blocks an import.
 */
export interface Weather {
  source: 'open-meteo';
  temperature_c: number | null;
  apparent_c: number | null;
  humidity_pct: number | null;
  precipitation_mm: number | null;
  snowfall_cm: number | null;
  wind_kmh: number | null;
  weather_code: number | null;
  hour_utc: string;
}
const VARS =
  'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,snowfall,wind_speed_10m,weather_code';
export async function weatherAt(
  lat: number,
  lon: number,
  startIso: string,
): Promise<Weather | null> {
  if (process.env.WEATHER_DISABLED === 'true') return null;
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;
  const day = start.toISOString().slice(0, 10);
  const key = process.env.OPEN_METEO_API_KEY;
  // The archive lags ~5 days; recent runs come from the forecast API's past data.
  const recent = Date.now() - start.getTime() < 5 * 86400000;
  const host = recent
    ? key
      ? 'https://customer-api.open-meteo.com/v1/forecast'
      : 'https://api.open-meteo.com/v1/forecast'
    : key
      ? 'https://customer-archive-api.open-meteo.com/v1/archive'
      : 'https://archive-api.open-meteo.com/v1/archive';
  const params = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    start_date: day,
    end_date: day,
    hourly: VARS,
    timezone: 'GMT',
    ...(key ? { apikey: key } : {}),
  });
  try {
    const response = await fetch(host + '?' + params, {
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return pickHour(await response.json(), start);
  } catch {
    return null;
  }
}
/** Select the hour containing the start instant from an Open-Meteo hourly response. */
export function pickHour(
  body: { hourly?: Record<string, (number | string | null)[]> },
  start: Date,
): Weather | null {
  const h = body.hourly;
  if (!h?.time) return null;
  const hour = start.toISOString().slice(0, 13) + ':00';
  const i = h.time.indexOf(hour);
  if (i < 0) return null;
  const n = (k: string) =>
    typeof h[k]?.[i] === 'number' ? (h[k][i] as number) : null;
  return {
    source: 'open-meteo',
    temperature_c: n('temperature_2m'),
    apparent_c: n('apparent_temperature'),
    humidity_pct: n('relative_humidity_2m'),
    precipitation_mm: n('precipitation'),
    snowfall_cm: n('snowfall'),
    wind_kmh: n('wind_speed_10m'),
    weather_code: n('weather_code'),
    hour_utc: hour,
  };
}
