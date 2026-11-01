import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface0: '#FFFFFF',
        surface1: '#FFFFFF',
        surface2: '#F8FAFC',
        textPrimary: '#0F172A',
        textSecondary: '#475569',
        textMuted: '#94A3B8',
        border: '#E2E8F0',
        borderStrong: '#CBD5E1',
        accent: '#0F172A',
        accentText: '#0F172A',
        accentBg: '#F1F5F9',
        success: '#0F172A',
        successBg: '#F8FAFC',
        danger: '#DC2626',
        dangerBg: '#FEF2F2',
      },
    },
  },
  plugins: [],
};
export default config;
