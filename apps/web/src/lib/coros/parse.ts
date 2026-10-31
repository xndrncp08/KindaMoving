import type { ToolResult } from './mcp';

/**
 * Parsing of COROS MCP tool results. The official tool guide documents
 * parameters and example outputs but not a stable machine schema, so parsing
 * is defensive and ordered by reliability:
 *   1. `structuredContent` (MCP structured output),
 *   2. JSON inside text content,
 *   3. the documented human-readable text format.
 * A record without a provable `labelId` and `sportType` is never guessed; it is
 * skipped and counted, so a format change degrades to "nothing imported" with a
 * diagnostic instead of importing wrong data.
 */
export interface SportRecord {
  labelId: string;
  sportType: number;
  date: string | null; // yyyy-mm-dd
  distanceM: number | null;
}

/** COROS activity sport codes treated as running (run, indoor run, trail run, track run). */
export const RUNNING_SPORTS = new Set([100, 101, 102, 103]);

function texts(result: ToolResult) {
  return (result.content ?? [])
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string);
}
function jsonValues(result: ToolResult): unknown[] {
  const out: unknown[] = [];
  if (result.structuredContent !== undefined)
    out.push(result.structuredContent);
  for (const t of texts(result)) {
    const s = t.trim();
    if (s.startsWith('{') || s.startsWith('[')) {
      try {
        out.push(JSON.parse(s));
      } catch {
        /* not JSON */
      }
    }
  }
  return out;
}
function* walk(value: unknown, depth = 0): Generator<Record<string, unknown>> {
  if (depth > 8 || value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const v of value) yield* walk(v, depth + 1);
    return;
  }
  const obj = value as Record<string, unknown>;
  yield obj;
  for (const v of Object.values(obj)) yield* walk(v, depth + 1);
}
const pick = (o: Record<string, unknown>, keys: string[]) =>
  keys.map((k) => o[k]).find((v) => v !== undefined && v !== null);
function toDate(v: unknown): string | null {
  if (typeof v === 'number' && v > 19000000 && v < 21000000) v = String(v);
  if (typeof v === 'string' && /^\d{8}$/.test(v))
    return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v))
    return v.slice(0, 10);
  if (typeof v === 'number' && v > 1e9)
    return new Date(v > 1e12 ? v : v * 1000).toISOString().slice(0, 10);
  return null;
}

export function parseSportRecords(result: ToolResult): {
  records: SportRecord[];
  unparsed: number;
} {
  const found = new Map<string, SportRecord>();
  for (const root of jsonValues(result)) {
    for (const o of walk(root)) {
      const label = pick(o, ['labelId', 'label_id']);
      const sport = Number(pick(o, ['sportType', 'sport_type', 'sportCode']));
      if (
        (typeof label === 'string' || typeof label === 'number') &&
        /^\d{1,30}$/.test(String(label)) &&
        Number.isInteger(sport)
      ) {
        const km = Number(pick(o, ['distanceKm']));
        found.set(String(label), {
          labelId: String(label),
          sportType: sport,
          date: toDate(
            pick(o, [
              'date',
              'startDate',
              'startTime',
              'startTimestamp',
              'happenDay',
            ]),
          ),
          distanceM: Number.isFinite(km) && km > 0 ? km * 1000 : null,
        });
      }
    }
  }
  let unparsed = 0;
  if (found.size === 0) {
    // Documented text format: numbered blocks "1. Sport(9807) — 2026-10-03 ... Distance: 12.03 km",
    // with identifiers given as "labelId: <digits>" and "sportType: <digits>".
    for (const t of texts(result)) {
      for (const block of t.split(/\n(?=\s*\d+\.\s)/)) {
        if (!/^\s*\d+\.\s/.test(block)) continue;
        const label = block.match(
          /label\s*id["']?\s*[:=]\s*["']?(\d{1,30})/i,
        )?.[1];
        const sport =
          block.match(/sport\s*type["']?\s*[:=]\s*["']?(\d{1,6})/i)?.[1] ??
          block.match(/Sport\((\d{1,6})\)/)?.[1];
        if (!label || !sport) {
          unparsed++;
          continue;
        }
        const km = block.match(/Distance:\s*([\d.]+)\s*km/i)?.[1];
        found.set(label, {
          labelId: label,
          sportType: Number(sport),
          date: block.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null,
          distanceM: km ? Number(km) * 1000 : null,
        });
      }
    }
  }
  return { records: [...found.values()], unparsed };
}

/** HTTPS FIT download links from queryActivityFitFileDownloadUrls, optionally keyed by labelId. */
export function parseFitUrls(
  result: ToolResult,
): { labelId: string | null; url: string }[] {
  const out = new Map<string, string | null>();
  for (const root of jsonValues(result)) {
    for (const o of walk(root)) {
      const url = pick(o, ['url', 'downloadUrl', 'fileUrl', 'fitUrl']);
      const label = pick(o, ['labelId', 'label_id']);
      if (typeof url === 'string' && url.startsWith('https://'))
        out.set(url, label != null ? String(label) : null);
    }
  }
  if (out.size === 0)
    for (const t of texts(result))
      for (const m of t.matchAll(/https:\/\/[^\s"'<>)\]]+/g))
        out.set(m[0].replace(/[.,;]+$/, ''), null);
  return [...out].map(([url, labelId]) => ({ url, labelId }));
}

/** Documented quota: 50 FIT files (downloads + links) per platform user per fixed 24 h window. */
export const FIT_QUOTA = 50;
export const FIT_QUOTA_MARGIN = 2;
export function quotaState(
  q: { window_start?: string; used?: number },
  now = Date.now(),
) {
  const start = q.window_start ? Date.parse(q.window_start) : NaN;
  if (!Number.isFinite(start) || now - start >= 86400000)
    return {
      window_start: new Date(now).toISOString(),
      used: 0,
      resets_at: new Date(now + 86400000).toISOString(),
    };
  return {
    window_start: q.window_start!,
    used: q.used ?? 0,
    resets_at: new Date(start + 86400000).toISOString(),
  };
}
export const quotaAvailable = (q: { used: number }) =>
  q.used < FIT_QUOTA - FIT_QUOTA_MARGIN;
