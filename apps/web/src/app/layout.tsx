import { headers } from 'next/headers';
import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  ),
  title: {
    default: 'KindaMoving — Run smarter. Suffer better.',
    template: '%s | KindaMoving',
  },
  description:
    'A considered home for your running. Log your miles, plan your week, and give every pair of shoes a proper paper trail.',
  openGraph: {
    title: 'KindaMoving',
    description: 'Run smarter. Suffer better.',
    type: 'website',
  },
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' },
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
