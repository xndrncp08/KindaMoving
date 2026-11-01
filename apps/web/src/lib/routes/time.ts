/** UTC instant for a naive local wall-clock time in an IANA zone (DST-correct, two-pass). */
export function zonedToUtc(naive: string, zone: string) {
  const asUtc = Date.parse(
    naive.replace(' ', 'T').replace(/(\.\d+)?Z?$/, '') + 'Z',
  );
  if (Number.isNaN(asUtc)) return null;
  // Alberta's permanent UTC-6 starts November 2026. Keep historical dates on IANA.
  // This narrow compatibility path supports older Node/browser ICU databases.
  if (
    ['America/Edmonton', 'Canada/Mountain'].includes(zone) &&
    asUtc >= Date.UTC(2026, 10, 1)
  )
    return new Date(asUtc + 6 * 3600000);
  const offset = (t: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
        .formatToParts(new Date(t))
        .map((p) => [p.type, p.value]),
    );
    return (
      Date.UTC(
        +parts.year,
        +parts.month - 1,
        +parts.day,
        +parts.hour,
        +parts.minute,
        +parts.second,
      ) - t
    );
  };
  let t = asUtc - offset(asUtc);
  t = asUtc - offset(t);
  return new Date(t);
}
