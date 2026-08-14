'use client';

import { useEffect, useRef, useState } from 'react';
import { THEME_KEY } from '@/lib/theme';

/**
 * The theme switch.
 *
 * Three decisions worth stating, because each one is a bug avoided rather than a
 * preference:
 *
 * 1. THE ICON IS SWAPPED BY CSS, NOT BY STATE. The server has no idea which theme
 *    the visitor uses — it is in their localStorage — so any component that renders
 *    a sun or a moon from React state hydrates with a mismatch, and React blanks the
 *    subtree. Both glyphs are always in the DOM and `dark:` hides one. The markup is
 *    therefore identical on server and client, and the correct glyph is painted in
 *    the same frame as the rest of the page.
 *
 * 2. IT FOLLOWS THE OS UNTIL YOU DISAGREE WITH IT. No stored choice means the
 *    system preference wins and keeps winning — flip your laptop to dark at sunset
 *    and this page follows, live, without a reload. The moment you press the button
 *    that is an explicit choice and the OS stops overriding it. Most implementations
 *    read the media query once at boot and then ignore it forever.
 *
 * 3. ONLY THE PRESS ANIMATES. `theme-animating` is added for the length of the
 *    cross-fade and removed. Leaving that class on permanently would put a 220ms
 *    colour transition on every element on the page, so every hover would smear.
 */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  // `null` until mounted: it is the honest value, and it keeps the first client
  // render byte-identical to the server's.
  const [isDark, setIsDark] = useState<boolean | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const root = document.documentElement;
    setIsDark(root.classList.contains('dark'));

    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const onSystemChange = () => {
      if (localStorage.getItem(THEME_KEY)) return; // an explicit choice outranks the OS
      root.classList.toggle('dark', mq.matches);
      setIsDark(mq.matches);
    };

    // Two tabs open, theme changed in one. Without this the other tab keeps the old
    // theme until it is reloaded, which reads as the setting not having saved.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_KEY) return;
      const next = e.newValue === 'dark' || (e.newValue !== 'light' && mq.matches);
      root.classList.toggle('dark', next);
      setIsDark(next);
    };

    mq.addEventListener('change', onSystemChange);
    window.addEventListener('storage', onStorage);
    return () => {
      mq.removeEventListener('change', onSystemChange);
      window.removeEventListener('storage', onStorage);
      clearTimeout(timer.current);
    };
  }, []);

  function toggle() {
    const root = document.documentElement;
    const next = !root.classList.contains('dark');

    root.classList.add('theme-animating');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => root.classList.remove('theme-animating'), 260);

    root.classList.toggle('dark', next);
    setIsDark(next);
    try {
      localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
    } catch {
      // Private browsing. The theme still switches for this session; it just will
      // not be remembered. Failing to persist is not a reason to fail to switch.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      // Announced only once we actually know. Before mount there is no truthful
      // value to give, and guessing "false" would tell a screen reader the page is
      // in light mode when it may not be.
      aria-checked={isDark ?? undefined}
      aria-label="Dark mode"
      title="Switch theme"
      className={`press grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-ink/10 text-ink-mid hover:border-ink/25 hover:text-ink ${className}`}
    >
      {/* Sun — shown in dark mode, because the button offers what you get next. */}
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        className="hidden h-[17px] w-[17px] dark:block"
      >
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6" />
      </svg>
      {/* Moon — shown in light mode. */}
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[17px] w-[17px] dark:hidden"
      >
        <path d="M20.4 13.6A8.4 8.4 0 1 1 10.4 3.6a6.6 6.6 0 0 0 10 10Z" />
      </svg>
    </button>
  );
}
