'use client';
import { ErrorState } from '@km/ui';
export default function Error({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="legal">
      <h1>Lost our stride.</h1>
      <ErrorState
        message="We couldn’t load this page. Your records have not been changed."
        retry={reset}
      />
    </main>
  );
}
