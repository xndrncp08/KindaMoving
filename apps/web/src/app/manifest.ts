import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KindaMoving',
    short_name: 'KindaMoving',
    description: 'Run smarter. Suffer better.',
    start_url: '/app',
    display: 'standalone',
    background_color: '#f5f5ef',
    theme_color: '#172723',
    icons: [
      { src: '/app-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/app-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
