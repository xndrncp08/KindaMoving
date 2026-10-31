import type { MetadataRoute } from 'next';
export default function sitemap(): MetadataRoute.Sitemap {
  return ['', '/privacy', '/terms'].map((path) => ({
    url: (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000') + path,
  }));
}
