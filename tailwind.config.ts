import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface1: '#F1EFE8',
        surface2: '#FFFFFF',
        textPrimary: '#1A1A18',
        textSecondary: '#5F5E5A',
        textMuted: '#888780',
        border: '#E4E2DB',
        borderStrong: '#C9C7BE',
        accent: '#378ADD',
        accentText: '#0C447C',
        accentBg: '#E6F1FB',
        success: '#3B6D11',
        successBg: '#EAF3DE',
        danger: '#A32D2D',
        dangerBg: '#FCEBEB',
      },
    },
  },
  plugins: [],
};
export default config;
