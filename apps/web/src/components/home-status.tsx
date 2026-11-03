'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, TriangleAlert, Watch } from 'lucide-react';
import { api, conditionsQuery, keys } from '@/lib/queries';
import { useMap } from '@/lib/stores';

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (mins < 60) return rtf.format(-mins, 'minute');
  if (mins < 48 * 60) return rtf.format(-Math.round(mins / 60), 'hour');
  return rtf.format(-Math.round(mins / 1440), 'day');
};

/**
 * Glanceable device and outdoor status for Home: COROS sync state and current
 * condition reports around the area the runner last looked at on a map.
 */
export function HomeStatus({ userId }: { userId: string }) {
  const coros = useQuery({
    queryKey: keys.resource(userId, 'coros'),
    queryFn: () =>
      api<{ status: string; last_sync_at?: string | null }>('coros'),
  });
  const { latitude, longitude } = useMap((s) => s.viewport);
  const near = useQuery(conditionsQuery(userId, latitude, longitude));
  const active = (near.data?.assessments ?? []).filter(
    (a) => a.status === 'likely' || a.status === 'possible',
  ).length;
  const connected = coros.data?.status === 'connected';
  return (
    <section className="status-strip" aria-label="Device and conditions">
      <Link href="/app/settings#coros" className="status-item">
        {connected ? (
          <RefreshCw size={18} aria-hidden="true" />
        ) : (
          <Watch size={18} aria-hidden="true" />
        )}
        <span>
          <span className="eyebrow">COROS</span>
          <span className="status-value" suppressHydrationWarning>
            {coros.isPending
              ? 'Checking…'
              : connected
                ? coros.data?.last_sync_at
                  ? `Synced ${ago(coros.data.last_sync_at)}`
                  : 'Connected, not synced yet'
                : 'Not connected'}
          </span>
        </span>
      </Link>
      <Link href="/app/conditions" className="status-item">
        <TriangleAlert size={18} aria-hidden="true" />
        <span>
          <span className="eyebrow">Conditions nearby</span>
          <span className="status-value">
            {near.isPending
              ? 'Checking…'
              : near.error
                ? 'Unavailable'
                : active === 0
                  ? 'No current reports'
                  : `${active} reported`}
          </span>
        </span>
      </Link>
    </section>
  );
}
