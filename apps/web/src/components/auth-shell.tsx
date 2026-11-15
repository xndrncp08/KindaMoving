import Link from 'next/link';
import { Brand } from './brand';
import { RunPreview } from './run-preview';
/** Shared frame for sign-in, recovery and onboarding: one column, plus a night panel on wide screens. */
export function AuthShell({
  children,
  legal,
  pitch,
}: {
  children: React.ReactNode;
  legal?: React.ReactNode;
  pitch?: React.ReactNode;
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
      <aside className="auth-art night">
        {pitch}
        <RunPreview />
      </aside>
    </main>
  );
}
