import type { MetadataRoute } from 'next';

import { SITE_URL as BASE } from '@/lib/site-url';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Gated or personal surfaces. Not a security measure — the gates are — just tidiness.
      disallow: ['/admin', '/history', '/api/', '/auth/'],
    },
    sitemap: `${BASE}/sitemap.xml`,
  };
}
