import Link from 'next/link';
import { CONTACT_EMAIL } from '@/lib/contact';

export function LegalShell({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-14">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-clay">legal</p>
      <h1 className="mt-4 font-display text-[36px] leading-[1.12] tracking-tight">{title}</h1>
      <p className="mt-3 font-mono text-[11.5px] text-skip">Last updated {updated}</p>
      <div className="readable mt-6">{intro}</div>
      <div className="mt-10 space-y-9">{children}</div>
      <div className="mt-14 border-t hairline pt-6 text-[13px] text-ink-mid">
        Questions about either document go to{' '}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand hover:underline">{CONTACT_EMAIL}</a>. The other one
        is here:{' '}
        <Link href="/privacy" className="text-brand hover:underline">Privacy</Link> ·{' '}
        <Link href="/terms" className="text-brand hover:underline">Terms</Link>
      </div>
    </main>
  );
}

export function Clause({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="flex items-baseline gap-3 font-display text-[21px] tracking-tight">
        <span className="font-mono text-[12px] text-ink-light">{n}</span>
        {title}
      </h2>
      <div className="readable mt-3 space-y-3 [&_li]:my-1 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">{children}</div>
    </section>
  );
}

export function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-clay-line bg-clay-pale px-4 py-3 text-[13.5px] leading-relaxed text-ink">
      {children}
    </div>
  );
}

export function DataTable({ rows }: { rows: [string, string, string, string][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border hairline">
      <table className="w-full min-w-[560px] text-left text-[12.5px]">
        <thead>
          <tr className="bg-paper-soft text-[10px] uppercase tracking-wide text-skip">
            <th className="px-3 py-2 font-medium">What</th>
            <th className="px-3 py-2 font-medium">Why</th>
            <th className="px-3 py-2 font-medium">Lawful basis</th>
            <th className="px-3 py-2 font-medium">Kept for</th>
          </tr>
        </thead>
        <tbody className="divide-y hairline bg-white">
          {rows.map((r) => (
            <tr key={r[0]}>
              <td className="px-3 py-2 align-top font-medium text-ink">{r[0]}</td>
              <td className="px-3 py-2 align-top text-ink-mid">{r[1]}</td>
              <td className="px-3 py-2 align-top text-ink-mid">{r[2]}</td>
              <td className="px-3 py-2 align-top text-ink-mid">{r[3]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
