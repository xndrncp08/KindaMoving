import Link from 'next/link';
import { Brand } from './brand';
import { RouteArt } from './route-art';
/** Shared frame for sign-in, recovery and onboarding: one column, plus a route panel on wide screens. */
export function AuthShell({
  children,
  legal,
}: {
  children: React.ReactNode;
  legal?: React.ReactNode;
}) {
  return (
    <main id="main" className="auth">
      <div className="auth-column">
        <Brand />
        <div className="auth-body stack">{children}</div>
        <p className="auth-legal muted">
          {legal ?? (
            <>
              <Link href="/terms">Terms</Link> ·{' '}
              <Link href="/privacy">Privacy</Link>
            </>
          )}
        </p>
      </div>
      <aside className="auth-art" aria-hidden="true">
        <RouteArt />
        <p>Forward is a pace.</p>
      </aside>
    </main>
  );
}
