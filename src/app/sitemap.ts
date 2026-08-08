import type { MetadataRoute } from 'next';

import { SITE_URL as BASE } from '@/lib/site-url';

/** Public surfaces only. /admin and /history are gated and have no business being indexed. */
const ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
  { path: '', priority: 1, changeFrequency: 'weekly' },
  { path: '/audit', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/enforce', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/pricing', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/how-it-works', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/install', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/learn', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/session', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ROUTES.map((r) => ({
    url: `${BASE}${r.path}`,
    lastModified,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
