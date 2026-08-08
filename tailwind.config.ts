import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
      },
      colors: {
        // Warm paper rather than clinical white. The product is about trust, and a
        // cream page reads as considered where a pure-white one reads as a dashboard.
        paper: { DEFAULT: '#FDFCF9', soft: '#F7F4ED', deep: '#EFEADF', line: '#E4DED0' },
        ink: { DEFAULT: '#1A1614', soft: '#2E2823', mid: '#57504A', light: '#7C736A' },
        clay: { DEFAULT: '#C2410C', soft: '#EA580C', pale: '#FFF1E7', line: '#FBBF9B' },
        honey: { DEFAULT: '#B45309', pale: '#FEF3C7', line: '#FCD34D' },
        pass: { DEFAULT: '#15803D', pale: '#ECFDF3', line: '#86EFAC' },
        fail: { DEFAULT: '#B91C1C', pale: '#FEF2F2', line: '#FCA5A5' },
        unknown: { DEFAULT: '#B45309', pale: '#FFFBEB', line: '#FDE68A' },
        skip: '#7C736A',
        brand: { DEFAULT: '#1D4ED8', deep: '#1E3A8A', pale: '#EFF6FF' },
      },
      maxWidth: { prose: '68ch' },
    },
  },
  plugins: [],
} satisfies Config;
