import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  presets: [require('./src/ui/tailwind.config')],
  theme: {
    extend: {
      colors: {
        ink: '#101828',
        sand: '#f8f3eb',
        coral: '#ef6f5e',
        teal: '#1d7063',
        gold: '#f7c66b'
      },
      boxShadow: {
        panel: '0 24px 60px rgba(16, 24, 40, 0.14)'
      }
    }
  },
  plugins: []
};

export default config;
