/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2563EB',
          hover: '#1D4ED8',
          light: '#EFF6FF',
        },
        secondary: '#0F172A',
        success: { DEFAULT: '#10B981', light: '#ECFDF5' },
        warning: { DEFAULT: '#F59E0B', light: '#FFFBEB' },
        danger: { DEFAULT: '#EF4444', light: '#FEF2F2' },
        background: '#F8FAFC',
        surface: '#FFFFFF',
        border: '#E2E8F0',
        sidebar: {
          DEFAULT: '#0F172A',
          hover: '#1E293B',
          border: '#1E293B',
        },
        text: {
          primary: '#0F172A',
          secondary: '#64748B',
          muted: '#94A3B8',
          inverse: '#F8FAFC',
        },
      },
      spacing: {
        sidebar: '260px',
        topbar: '64px',
        tabbar: '48px',
        // topbar + tabbar stacked — how far page content starts from the top.
        'content-top': '112px',
        gutter: '24px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
