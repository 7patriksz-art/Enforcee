import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';

/**
 * Metadata for a client page.
 *
 * `session/page.tsx` is a client component, and a client component cannot export
 * `metadata` — Next silently ignores it, which is worse than erroring, because the page
 * then quietly inherits the ROOT title. Six pages did exactly that, so `/pricing`,
 * `/audit` and the rest all shipped to search as "Enforcee — stop fighting your own AI"
 * and the site competed against itself for every query.
 *
 * A server layout beside the client page is the documented way round it.
 */
export const metadata: Metadata = pageMeta({
  title: 'Session evidence',
  description:
    'Drop a Claude Code session file and see what the model could actually see: skills offered, MCP servers that never connected, tools that vanished mid-session.',
  path: '/session',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
