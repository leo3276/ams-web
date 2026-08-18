import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface0: '#FFFFFF',
        surface1: '#F4F4F5',
        surface2: '#FFFFFF',
        textPrimary: '#18181B', // Elegant soft charcoal-black (zero dark blue)
        textSecondary: '#52525B',
        textMuted: '#A1A1AA',
        border: '#E4E4E7',
        borderStrong: '#D4D4D8',
        accent: '#18181B',
        accentText: '#18181B',
        accentBg: '#F4F4F5',
        success: '#16A34A',
        successBg: '#F0FDF4',
        danger: '#DC2626',
        dangerBg: '#FEF2F2',
      },
    },
  },
  plugins: [],
};
export default config;
