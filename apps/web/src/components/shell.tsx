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
  LayoutDashboard,
  Map,
  TriangleAlert,
  CalendarDays,
  Footprints,
  Settings,
  Menu,
  SunMoon,
  LogOut,
} from 'lucide-react';
import { Button, Dialog } from '@km/ui';
import { Brand } from './brand';
import { JobSync } from './job-sync';
import { OfflineSync } from './offline-sync';
import { purgeOtherUsers } from '@/lib/offline/db';
import { browserSupabase } from '@/lib/supabase/client';
import { resetStores, usePreferences } from '@/lib/stores';
import { toast } from 'sonner';
const links = [
  ['/app', 'Overview', LayoutDashboard],
  ['/app/activities', 'Activities', Activity],
  ['/app/analytics', 'Analyze', BarChart3],
  ['/app/ghost', 'Ghost', Ghost],
  ['/app/routes', 'Routes', Map],
  ['/app/conditions', 'Conditions', TriangleAlert],
  ['/app/training', 'Training', CalendarDays],
  ['/app/gear', 'Gear', Footprints],
  ['/app/settings', 'Settings', Settings],
] as const;
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
  const nav = (
    <nav aria-label="App navigation">
      {links.map(([href, label, Icon]) => (
        <Link
          key={href}
          href={href}
          className="nav-link"
          aria-current={
            (href === '/app' ? path === href : path.startsWith(href))
              ? 'page'
              : undefined
          }
          onClick={() => setMenu(false)}
        >
          <Icon size={18} />
          {label}
        </Link>
      ))}
    </nav>
  );
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        {nav}
        <div className="sidebar-bottom stack">
          <p className="eyebrow muted">Forward is a pace.</p>
          <Button
            variant="outline"
            onClick={() =>
              setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
            }
          >
            <SunMoon size={16} />
            Switch theme
          </Button>
          <Button variant="ghost" onClick={logout}>
            <LogOut size={16} />
            Log out
          </Button>
        </div>
      </aside>
      <div>
        <OfflineSync userId={userId} />
        <header className="mobile-header">
          <Brand />
          <Button
            variant="outline"
            aria-label="Open navigation"
            onClick={() => setMenu(true)}
          >
            <Menu size={20} />
          </Button>
        </header>
        <main id="main" className="main">
          {children}
        </main>
        <JobSync userId={userId} />
      </div>
      <Dialog
        title="Your running"
        description="Navigate your running log."
        open={menu}
        onOpenChange={setMenu}
        drawer
      >
        {nav}
        <Button
          variant="outline"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        >
          Switch theme
        </Button>
        <Button variant="ghost" onClick={logout}>
          Log out
        </Button>
      </Dialog>
    </div>
  );
}
