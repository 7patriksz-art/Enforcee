import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import { getServiceSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const Item = z.object({
  id: z.string().uuid().optional(),
  surface: z.string().min(1).max(120),
  kind: z.enum(['post', 'comment', 'reply', 'submission', 'article', 'video', 'email', 'other']),
  title: z.string().min(1).max(300),
  body: z.string().max(40_000).default(''),
  status: z.enum(['idea', 'drafting', 'ready', 'scheduled', 'posted', 'killed']),
  scheduled_for: z.string().nullable().optional(),
  posted_url: z.string().max(500).nullable().optional(),
  notes: z.string().max(8000).default(''),
  constraints: z.string().max(8000).default(''),
  effort_hours: z.number().min(0).max(80).default(1),
  author: z.string().max(40).default('claude'),
});

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });

  const db = getServiceSupabase();
  if (!db) return NextResponse.json({ error: 'No database configured.' }, { status: 503 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON.' }, { status: 400 });
  }

  // Bulk seed or single upsert, same route.
  const many = z.object({ items: z.array(Item).max(200) }).safeParse(json);
  const rows = many.success ? many.data.items : [Item.parse(json)];

  const { data, error } = await db.from('campaign_items').upsert(rows, { onConflict: 'id' }).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ saved: data?.length ?? 0 });
}

export async function DELETE(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: 403 });
  const db = getServiceSupabase();
  if (!db) return NextResponse.json({ error: 'No database configured.' }, { status: 503 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 });
  const { error } = await db.from('campaign_items').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: 1 });
}
