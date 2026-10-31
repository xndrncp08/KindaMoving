import Link from 'next/link';
export default function NotFound() {
  return (
    <main id="main" className="legal">
      <h1>Wrong turn.</h1>
      <p>This page is not on the route.</p>
      <Link href="/">Back to the start ↗</Link>
    </main>
  );
}
