/** Pace in seconds per kilometre; null represents an undefined pace. */
export function pace(distance_m: number, elapsed_s: number) {
  return distance_m > 0 &&
    elapsed_s > 0 &&
    Number.isFinite(distance_m) &&
    Number.isFinite(elapsed_s)
    ? elapsed_s / (distance_m / 1000)
    : null;
}
export function duration(seconds: number) {
  const s = Math.round(seconds);
  const mm = String(Math.floor((s % 3600) / 60));
  const ss = String(s % 60).padStart(2, '0');
  return s >= 3600
    ? `${Math.floor(s / 3600)}:${mm.padStart(2, '0')}:${ss}`
    : `${Math.floor(s / 60)}:${ss}`;
}
/** Human span for totals ("1 h 20 min"), never confused with a pace or split. */
export function span(seconds: number) {
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}
/** Local calendar date of a YYYY-MM-DD or ISO string, formatted with Intl. */
export function day(
  value: string,
  opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
) {
  const d = new Date(value.length === 10 ? value + 'T12:00:00' : value);
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}
export function distance(metres: number, units = 'metric') {
  return `${(metres / (units === 'imperial' ? 1609.344 : 1000)).toFixed(2)} ${units === 'imperial' ? 'mi' : 'km'}`;
}
export function shoeMileage(
  shoe: { id: string; initial_distance_m: number },
  activities: { shoe_id: string | null; distance_m: number }[],
) {
  return (
    shoe.initial_distance_m +
    activities
      .filter((a) => a.shoe_id === shoe.id)
      .reduce((sum, a) => sum + a.distance_m, 0)
  );
}
