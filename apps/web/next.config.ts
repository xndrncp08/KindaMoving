import type { NextConfig } from 'next';
const config: NextConfig = {
  transpilePackages: ['@km/ui', '@km/types'],
  devIndicators: false, // the dev badge sits over the mobile tab bar
  experimental: { proxyClientMaxBodySize: '6mb' },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self)',
          },
        ],
      },
    ];
  },
};
export default config;
