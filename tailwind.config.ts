import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: { DEFAULT: '#0d1117', soft: '#161b22', line: '#21262d' },
        paper: { DEFAULT: '#fbfbfa', soft: '#f2f2ef', line: '#e2e2dd' },
        pass: '#0f8a5f',
        fail: '#c0392b',
        unknown: '#a16207',
        skip: '#6b7280',
        brand: { DEFAULT: '#1f6feb', deep: '#0b3d91' },
      },
    },
  },
  plugins: [],
} satisfies Config;
