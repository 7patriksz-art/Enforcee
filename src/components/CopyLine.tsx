'use client';

import { useRef, useState } from 'react';

/**
 * A command you can actually take with you.
 *
 * Every install instruction on this site was a `<pre>` a visitor had to select by hand.
 * On a phone that means a long-press, a drag handle and a fair chance of grabbing the
 * paragraph above it. For a product whose whole argument is "we removed the manual step",
 * asking someone to hand-select `npx enforcee audit CLAUDE.md answer.md` was not a small
 * irony.
 *
 * Three things that are easy to get wrong here:
 *
 * 1. `navigator.clipboard` IS NOT ALWAYS THERE. It requires a secure context, so it is
 *    undefined on plain http — which includes anyone previewing a deploy over http and
 *    every LAN address. It can also reject when the document is not focused. A button that
 *    silently does nothing is worse than no button, because the user believes they copied.
 *    So: try the API, fall back to selecting the text so a manual copy is one keystroke,
 *    and only ever claim success when something actually succeeded.
 *
 * 2. THE CONFIRMATION HAS TO BE ANNOUNCED, not just coloured. `aria-live` on the status
 *    means a screen-reader user hears "Copied" instead of nothing at all.
 *
 * 3. The button must not be inside the copyable region, or a manual select-all drags the
 *    word "Copy" into the command. That is a genuinely nasty one: the paste then fails in
 *    a shell with an error that looks like our command is wrong.
 */
export default function CopyLine({
  code,
  label,
  className = '',
  tone = 'default',
}: {
  code: string;
  /** What is being copied, for assistive tech. Defaults to the code itself. */
  label?: string;
  className?: string;
  /** `invert` for the dark-on-light command blocks in the hero and install steps. */
  tone?: 'default' | 'invert';
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'select'>('idle');
  const codeRef = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function copy() {
    clearTimeout(timer.current);
    try {
      // Optional chaining rather than a truthiness check: on http, `navigator.clipboard`
      // is undefined and reading `.writeText` off it throws before we ever get to try.
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard api');
      await navigator.clipboard.writeText(code);
      setState('copied');
    } catch {
      // Select it instead, so the user is one Ctrl/Cmd-C away rather than stranded.
      const el = codeRef.current;
      if (el && window.getSelection) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      setState('select');
    }
    timer.current = setTimeout(() => setState('idle'), 2200);
  }

  const surface =
    tone === 'invert'
      ? 'counter-theme bg-paper text-ink'
      : 'bg-paper-soft text-ink hairline border';

  return (
    <div className={`group relative overflow-hidden rounded-lg ${surface} ${className}`}>
      <pre className="overflow-x-auto px-4 py-3 pr-[104px] font-mono text-[13px] leading-relaxed">
        <code ref={codeRef}>{code}</code>
      </pre>

      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label ?? code}`}
        className="press absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-ink/15 bg-white/80 px-2.5 py-1.5 font-mono text-[11px] text-ink-mid backdrop-blur hover:border-ink/35 hover:text-ink"
      >
        {state === 'copied' ? 'copied' : state === 'select' ? 'select + ⌘C' : 'copy'}
      </button>

      {/* Announced, not merely shown. The visual state change is invisible to a screen
          reader without this, so the button would appear to do nothing at all. */}
      <span aria-live="polite" className="sr-only">
        {state === 'copied' ? 'Copied to clipboard' : state === 'select' ? 'Selected — press Control or Command C to copy' : ''}
      </span>
    </div>
  );
}
