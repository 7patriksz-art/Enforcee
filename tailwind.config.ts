import type { Config } from 'tailwindcss';

/**
 * One Tailwind colour scale, every shade pointed at a CSS variable.
 *
 * `<alpha-value>` is the load-bearing part. Without it `ring-red-600/20` and
 * `bg-emerald-50/60` compile to a fully opaque colour and every translucent chip
 * on the site turns into a solid block — a failure that looks like a design
 * choice rather than a bug, which is why it survives review.
 */
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

function ramp(prefix: string): Record<string, string> {
  return Object.fromEntries(
    SHADES.map((s) => [String(s), `rgb(var(--${prefix}-${s}) / <alpha-value>)`])
  );
}

export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
      },
      colors: {
        // Every colour is `rgb(var(--c-x) / <alpha-value>)` rather than a hex literal.
        // The alpha placeholder is what keeps `bg-paper/85` and `text-white/40` working —
        // drop it and every translucent surface on the site silently goes opaque.

        // `white` is REDEFINED, not left as #fff, and that one line is what makes dark
        // mode a theme rather than a rewrite. Seventy-five surfaces say `bg-white` and
        // thirty-eight labels say `text-white`; both are asking for the same thing —
        // "the colour that opposes ink" — so both resolve to one token.
        //   light: card = #fff on paper, and white text on the near-black ink button.
        //   dark:  card = raised espresso, and near-black text on the cream ink button.
        // Chasing this with `dark:` variants on 113 class strings would have been 113
        // chances to miss one. One idea lives in one place.
        white: 'rgb(var(--c-card) / <alpha-value>)',
        paper: {
          DEFAULT: 'rgb(var(--c-paper) / <alpha-value>)',
          soft: 'rgb(var(--c-paper-soft) / <alpha-value>)',
          deep: 'rgb(var(--c-paper-deep) / <alpha-value>)',
          line: 'rgb(var(--c-paper-line) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--c-ink) / <alpha-value>)',
          soft: 'rgb(var(--c-ink-soft) / <alpha-value>)',
          mid: 'rgb(var(--c-ink-mid) / <alpha-value>)',
          light: 'rgb(var(--c-ink-light) / <alpha-value>)',
        },
        clay: {
          DEFAULT: 'rgb(var(--c-clay) / <alpha-value>)',
          soft: 'rgb(var(--c-clay-soft) / <alpha-value>)',
          pale: 'rgb(var(--c-clay-pale) / <alpha-value>)',
          line: 'rgb(var(--c-clay-line) / <alpha-value>)',
        },
        honey: {
          DEFAULT: 'rgb(var(--c-honey) / <alpha-value>)',
          pale: 'rgb(var(--c-honey-pale) / <alpha-value>)',
          line: 'rgb(var(--c-honey-line) / <alpha-value>)',
        },
        pass: {
          DEFAULT: 'rgb(var(--c-pass) / <alpha-value>)',
          pale: 'rgb(var(--c-pass-pale) / <alpha-value>)',
          line: 'rgb(var(--c-pass-line) / <alpha-value>)',
        },
        fail: {
          DEFAULT: 'rgb(var(--c-fail) / <alpha-value>)',
          pale: 'rgb(var(--c-fail-pale) / <alpha-value>)',
          line: 'rgb(var(--c-fail-line) / <alpha-value>)',
        },
        unknown: {
          DEFAULT: 'rgb(var(--c-unknown) / <alpha-value>)',
          pale: 'rgb(var(--c-unknown-pale) / <alpha-value>)',
          line: 'rgb(var(--c-unknown-line) / <alpha-value>)',
        },
        skip: 'rgb(var(--c-skip) / <alpha-value>)',
        brand: {
          DEFAULT: 'rgb(var(--c-brand) / <alpha-value>)',
          deep: 'rgb(var(--c-brand-deep) / <alpha-value>)',
          pale: 'rgb(var(--c-brand-pale) / <alpha-value>)',
        },

        // ── The five stock ramps, reclaimed ────────────────────────────────
        // Overriding these rather than rewriting 181 class names. Every shade of
        // each scale is listed even where the codebase does not use it yet: an
        // `extend.colors.neutral` object REPLACES the scale, so an unlisted
        // `neutral-950` would compile to nothing and the element would silently
        // lose its colour. A gap here is an invisible bug, not a build error.
        // Values live in globals.css so they can flip with the theme.
        neutral: ramp('n'),
        emerald: ramp('g'),
        red: ramp('r'),
        amber: ramp('a'),
        blue: ramp('b'),
      },
      maxWidth: { prose: '68ch' },
    },
  },
  plugins: [],
} satisfies Config;
