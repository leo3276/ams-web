import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}', './lib/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface0: 'var(--surface-0)',
        surface1: 'var(--surface-1)',
        surface2: 'var(--surface-2)',
        textPrimary: 'var(--text-primary)',
        textSecondary: 'var(--text-secondary)',
        textMuted: 'var(--text-muted)',
        border: 'var(--border-subtle)',
        borderStrong: 'var(--border-strong)',
        accent: 'var(--accent-primary)',
        accentText: 'var(--accent-text)',
        accentBg: 'var(--accent-bg)',
        success: 'var(--success-text)',
        successBg: 'var(--success-bg)',
        danger: 'var(--danger-text)',
        dangerBg: 'var(--danger-bg)',
      },
    },
  },
  plugins: [],
};
export default config;
