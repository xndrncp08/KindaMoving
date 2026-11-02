import { headers } from 'next/headers';
import type { Metadata, Viewport } from 'next';
import { Archivo, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
// Self-hosted at build time by next/font: same-origin files, so the strict CSP (font-src 'self') holds.
const sans = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-archivo',
  display: 'swap',
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f1ea' },
    { media: '(prefers-color-scheme: dark)', color: '#111311' },
  ],
  viewportFit: 'cover',
  // The keyboard shrinks the layout viewport, so focused fields and their
  // errors stay visible above it (Chrome/Android; iOS Safari already pans).
  interactiveWidget: 'resizes-content',
};
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
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
