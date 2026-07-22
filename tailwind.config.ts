import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#090a0f',
        foreground: '#f3f4f6',
        surface: {
          DEFAULT: '#11131a',
          hover: '#1a1d27',
          border: '#232736',
        },
        brand: {
          50: '#f0f7ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          accent: '#6366f1',
          gold: '#eab308',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '1', filter: 'drop-shadow(0 0 15px rgba(59, 130, 246, 0.4))' },
          '50%': { opacity: '0.6', filter: 'drop-shadow(0 0 5px rgba(59, 130, 246, 0.1))' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
