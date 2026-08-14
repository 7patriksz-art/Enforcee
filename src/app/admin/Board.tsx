'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import type { CampaignItem } from '@/lib/admin';

type Status = CampaignItem['status'];

const TINT: Record<Status, string> = {
  idea: 'border-paper-line bg-white',
  drafting: 'border-brand/20 bg-brand-pale',
  ready: 'border-pass-line bg-pass-pale',
  scheduled: 'border-honey-line bg-honey-pale',
  posted: 'border-ink/20 bg-paper-deep',
  killed: 'border-paper-line bg-paper-soft opacity-60',
};

const BLANK: Omit<CampaignItem, 'id' | 'created_at' | 'updated_at'> = {
  surface: '',
  kind: 'post',
  title: '',
  body: '',
  status: 'idea',
  scheduled_for: null,
  posted_url: null,
  notes: '',
  constraints: '',
  effort_hours: 1,
  author: 'patrik',
};

export default function Board({
  items,
  lanes,
}: {
  items: CampaignItem[];
  lanes: { key: Status; label: string; note: string }[];
}) {
  const [rows, setRows] = useState(items);
  const [editing, setEditing] = useState<Partial<CampaignItem> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byLane = useMemo(() => {
    const m = new Map<Status, CampaignItem[]>();
    for (const l of lanes) m.set(l.key, []);
    for (const r of rows) m.get(r.status)?.push(r);
    return m;
  }, [rows, lanes]);

  const totalHours = rows
    .filter((r) => r.status === 'scheduled' || r.status === 'ready')
    .reduce((n, r) => n + Number(r.effort_hours ?? 0), 0);

  async function save(item: Partial<CampaignItem>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...BLANK, ...item, effort_hours: Number(item.effort_hours ?? 1) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed.');
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  async function move(item: CampaignItem, status: Status) {
    setRows((rs) => rs.map((r) => (r.id === item.id ? { ...r, status } : r)));
    await fetch('/api/admin/campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item, status }),
    });
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setEditing({ ...BLANK })}
          className="rounded-lg bg-ink px-4 py-2 text-[13.5px] font-medium text-white hover:bg-ink-soft transition-colors"
        >
          New item
        </button>
        <span className="font-mono text-[11.5px] text-skip">
          {rows.length} items · {totalHours.toFixed(1)}h queued
        </span>
        {totalHours > 6 && (
          <span className="rounded-md bg-unknown-pale px-2 py-1 font-mono text-[11px] text-unknown">
            over the 6h/week ceiling — cut something
          </span>
        )}
      </div>

      {error && <p className="mb-4 rounded-lg border border-fail-line bg-fail-pale px-3 py-2 text-[13px] text-fail">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {lanes.map((lane) => (
          <div key={lane.key} className="min-w-0">
            <div className="mb-2 flex items-baseline gap-2">
              <span className="text-[13px] font-semibold">{lane.label}</span>
              <span className="font-mono text-[10px] text-skip">{byLane.get(lane.key)?.length ?? 0}</span>
              <span className="ml-auto font-mono text-[10px] text-ink-light">{lane.note}</span>
            </div>
            <div className="space-y-2">
              {(byLane.get(lane.key) ?? []).map((it) => (
                <button
                  key={it.id}
                  onClick={() => setEditing(it)}
                  className={clsx('block w-full rounded-xl border px-3 py-2.5 text-left transition-colors hover:border-ink/30', TINT[lane.key])}
                >
                  <div className="font-mono text-[10px] uppercase tracking-wide text-clay">{it.surface}</div>
                  <div className="mt-1 text-[13px] font-medium leading-snug">{it.title}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 font-mono text-[10px] text-skip">
                    <span>{it.kind}</span>
                    <span>·</span>
                    <span>{it.effort_hours}h</span>
                    {it.scheduled_for && (
                      <>
                        <span>·</span>
                        <span>{new Date(it.scheduled_for).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                      </>
                    )}
                  </div>
                </button>
              ))}
              {(byLane.get(lane.key) ?? []).length === 0 && (
                <p className="rounded-xl border border-dashed hairline px-3 py-4 text-center font-mono text-[10.5px] text-ink-light">
                  empty
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-auto bg-ink/40 p-6" onClick={() => setEditing(null)}>
          <div
            className="w-full max-w-3xl rounded-2xl border hairline bg-paper p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <h2 className="font-display text-[21px] tracking-tight">{editing.id ? 'Edit item' : 'New item'}</h2>
              {editing.id && (
                <div className="ml-auto flex flex-wrap gap-1.5">
                  {lanes.map((l) => (
                    <button
                      key={l.key}
                      onClick={() => move(editing as CampaignItem, l.key)}
                      className={clsx(
                        'rounded-md border px-2 py-1 font-mono text-[10px] uppercase transition-colors',
                        editing.status === l.key ? 'border-ink bg-ink text-white' : 'hairline bg-white hover:border-ink/30'
                      )}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Surface" hint="reddit:r/ClaudeAI · hn · devto · github-issue">
                <input className={inputCls} value={editing.surface ?? ''} onChange={(e) => setEditing({ ...editing, surface: e.target.value })} />
              </Field>
              <Field label="Kind">
                <select className={inputCls} value={editing.kind ?? 'post'} onChange={(e) => setEditing({ ...editing, kind: e.target.value })}>
                  {['post', 'comment', 'reply', 'submission', 'article', 'video', 'email', 'other'].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Title" className="mt-3">
              <input className={inputCls} value={editing.title ?? ''} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </Field>

            <Field label="Draft" hint="Raw material. Rewrite every sentence yourself before posting — several of these places ban generated text." className="mt-3">
              <textarea
                className={clsx(inputCls, 'h-56 resize-y font-mono text-[12.5px] leading-relaxed')}
                value={editing.body ?? ''}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              />
            </Field>

            <Field label="The rules of this place" hint="Self-promo policy, karma gates, what gets removed." className="mt-3">
              <textarea
                className={clsx(inputCls, 'h-20 resize-y text-[12.5px]')}
                value={editing.constraints ?? ''}
                onChange={(e) => setEditing({ ...editing, constraints: e.target.value })}
              />
            </Field>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="Scheduled for">
                <input
                  type="datetime-local"
                  className={inputCls}
                  value={editing.scheduled_for ? String(editing.scheduled_for).slice(0, 16) : ''}
                  onChange={(e) => setEditing({ ...editing, scheduled_for: e.target.value ? new Date(e.target.value).toISOString() : null })}
                />
              </Field>
              <Field label="Effort (hours)">
                <input
                  type="number"
                  step="0.5"
                  className={inputCls}
                  value={editing.effort_hours ?? 1}
                  onChange={(e) => setEditing({ ...editing, effort_hours: Number(e.target.value) })}
                />
              </Field>
              <Field label="Posted URL">
                <input className={inputCls} value={editing.posted_url ?? ''} onChange={(e) => setEditing({ ...editing, posted_url: e.target.value })} />
              </Field>
            </div>

            <Field label="Notes" className="mt-3">
              <textarea
                className={clsx(inputCls, 'h-20 resize-y text-[12.5px]')}
                value={editing.notes ?? ''}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              />
            </Field>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                onClick={() => save(editing)}
                disabled={saving || !editing.title || !editing.surface}
                className="rounded-lg bg-ink px-4 py-2 text-[13.5px] font-medium text-white hover:bg-ink-soft disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditing(null)} className="rounded-lg border hairline bg-white px-4 py-2 text-[13.5px] hover:border-ink/30">
                Cancel
              </button>
              {editing.id && (
                <button
                  onClick={async () => {
                    await fetch(`/api/admin/campaign?id=${editing.id}`, { method: 'DELETE' });
                    window.location.reload();
                  }}
                  className="ml-auto font-mono text-[11.5px] text-fail hover:underline"
                >
                  delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-paper-line bg-white px-3 py-2 text-[13.5px] outline-none focus:border-brand';

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1 block font-mono text-[10.5px] uppercase tracking-wide text-skip">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] leading-snug text-ink-light">{hint}</span>}
    </label>
  );
}
