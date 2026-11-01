import Link from 'next/link';
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="KindaMoving home">
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <rect width="48" height="48" rx="10" fill="#d4ff3a" />
        <path
          d="M10 34V14h5v8l7-8h6L18 25l7 9h-6l-4-6v6zm15 0V14h5l4 9 4-9h4v20h-5V24l-3 7-4-7v10z"
          fill="#161816"
        />
      </svg>
      <span translate="no">KindaMoving</span>
    </Link>
  );
}
