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
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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
