'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import {
  Activity,
  BarChart3,
  Ghost,
  House,
  Map,
  TriangleAlert,
  CalendarDays,
  Footprints,
  ScanEye,
  Settings,
  Ellipsis,
  SunMoon,
  LogOut,
  Upload,
} from 'lucide-react';
import { Button, Dialog } from '@km/ui';
import { Brand } from './brand';
import { JobSync } from './job-sync';
import { OfflineSync } from './offline-sync';
import { purgeOtherUsers } from '@/lib/offline/db';
import { browserSupabase } from '@/lib/supabase/client';
import { resetStores, usePreferences } from '@/lib/stores';
import { toast } from 'sonner';
type Item = readonly [href: string, label: string, icon: typeof House];
// Grouped by what the runner is trying to do; desktop rail and mobile "More" share this order.
const groups: readonly (readonly [string | null, readonly Item[]])[] = [
  [null, [['/app', 'Home', House]]],
  [
    'Review',
    [
      ['/app/activities', 'Runs', Activity],
      ['/app/analytics', 'Trends', BarChart3],
      ['/app/ghost', 'Ghost', Ghost],
    ],
  ],
  [
    'Plan',
    [
      ['/app/routes', 'Routes', Map],
      ['/app/training', 'Training', CalendarDays],
      ['/app/conditions', 'Conditions', TriangleAlert],
    ],
  ],
  [
    'Equip',
    [
      ['/app/gear', 'Gear', Footprints],
      ['/app/form', 'Form', ScanEye],
    ],
  ],
];
const tabs: readonly Item[] = [
  ['/app', 'Home', House],
  ['/app/activities', 'Runs', Activity],
  ['/app/routes', 'Routes', Map],
  ['/app/training', 'Training', CalendarDays],
];
const active = (path: string, href: string) =>
  href === '/app' ? path === href : path.startsWith(href);
export function Shell({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId: string;
}) {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const client = useQueryClient();
  const { resolvedTheme, setTheme } = useTheme();
  useEffect(() => {
    resetStores();
    void usePreferences.persist.rehydrate();
    const { data } = browserSupabase().auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT' || (session && session.user.id !== userId)) {
          client.clear();
          resetStores();
          void purgeOtherUsers(null);
          window.location.assign('/login');
        }
      },
    );
    return () => data.subscription.unsubscribe();
  }, [client, userId]);
  async function logout() {
    const { error } = await browserSupabase().auth.signOut();
    if (error) {
      toast.error(error.message);
      return;
    }
    client.clear();
    resetStores();
    await purgeOtherUsers(null); // shared devices: no previous user's drafts or queue survive logout
    location.assign('/login');
  }
  const link = ([href, label, Icon]: Item) => (
    <Link
      key={href}
      href={href}
      className="nav-link"
      aria-current={active(path, href) ? 'page' : undefined}
      onClick={() => setMenu(false)}
    >
      <Icon size={18} aria-hidden="true" />
      {label}
    </Link>
  );
  const nav = (
    <nav aria-label="App navigation" className="nav-groups">
      {groups.map(([label, items]) => (
        <div
          className="nav-group"
          key={label ?? 'home'}
          role="group"
          aria-label={label ?? undefined}
        >
          {label && <p className="nav-group-label">{label}</p>}
          {items.map(link)}
        </div>
      ))}
      <div className="nav-group">
        {link(['/app/settings', 'Settings', Settings])}
      </div>
    </nav>
  );
  const toggleTheme = () =>
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  const moreActive = !tabs.some(([href]) => active(path, href));
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <Button asChild>
          <Link href="/app/activities#import">
            <Upload size={16} aria-hidden="true" />
            Import Run
          </Link>
        </Button>
        {nav}
        <div className="sidebar-bottom">
          <Button variant="ghost" onClick={toggleTheme}>
            <SunMoon size={16} aria-hidden="true" />
            Switch Theme
          </Button>
          <Button variant="ghost" onClick={logout}>
            <LogOut size={16} aria-hidden="true" />
            Log Out
          </Button>
        </div>
      </aside>
      <div>
        <OfflineSync userId={userId} />
        <header className="mobile-header">
          <Brand />
          <Button asChild variant="outline">
            <Link href="/app/activities#import">
              <Upload size={16} aria-hidden="true" />
              Import
            </Link>
          </Button>
        </header>
        <main id="main" className="main">
          {children}
        </main>
        <JobSync userId={userId} />
      </div>
      <nav className="tabbar" aria-label="Primary">
        {tabs.map(([href, label, Icon]) => (
          <Link
            key={href}
            href={href}
            className="tab"
            aria-current={active(path, href) ? 'page' : undefined}
          >
            <Icon size={20} aria-hidden="true" />
            {label}
          </Link>
        ))}
        <button
          type="button"
          className="tab"
          aria-expanded={menu}
          aria-haspopup="dialog"
          aria-current={moreActive ? 'page' : undefined}
          onClick={() => setMenu(true)}
        >
          <Ellipsis size={20} aria-hidden="true" />
          More
        </button>
      </nav>
      <Dialog
        title="Everything else"
        description="Review, plan and equip, grouped the same way as on desktop."
        open={menu}
        onOpenChange={setMenu}
        sheet
      >
        {nav}
        <div className="row">
          <Button variant="outline" onClick={toggleTheme}>
            <SunMoon size={16} aria-hidden="true" />
            Switch Theme
          </Button>
          <Button variant="ghost" onClick={logout}>
            <LogOut size={16} aria-hidden="true" />
            Log Out
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
