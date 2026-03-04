/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: 'var(--color-bg-surface)',
        'surface-solid': 'var(--color-bg-surface-solid)',
        base: 'var(--color-bg-base)',
        border: 'var(--color-border-default)',
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        hover: 'var(--color-bg-hover)',
        active: 'var(--color-bg-active)',
        primary: 'var(--color-text-primary)',
        secondary: 'var(--color-text-secondary)',
        tertiary: 'var(--color-text-tertiary)',
        muted: 'var(--color-text-muted)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        error: 'var(--color-error)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'xs': ['10px', '14px'],
        'sm': ['12px', '16px'],
        'base': ['14px', '20px'],
        'md': ['15px', '22px'],
        'lg': ['17px', '24px'],
        'xl': ['20px', '28px'],
        '2xl': ['24px', '32px'],
        '3xl': ['28px', '36px'],
        '4xl': ['34px', '42px'],
      },
      boxShadow: {
        'depth-1': 'var(--shadow-depth-1)',
        'depth-2': 'var(--shadow-depth-2)',
        'depth-3': 'var(--shadow-depth-3)',
        'depth-4': 'var(--shadow-depth-4)',
        'inset': 'var(--shadow-inset)',
        'float': 'var(--shadow-float)',
        'dock': 'var(--shadow-dock)',
        'glow': 'var(--shadow-glow)',
      },
      borderRadius: {
        'window': '10px',
        'dock': '14px',
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'slide-up': 'slideUp 0.15s ease-out',
        'slide-right': 'slideRight 0.2s ease-out',
        'dock-bounce': 'dockBounce 0.6s ease-in-out',
        'app-enter': 'appEnter 0.15s ease-out',
      },
    },
  },
  plugins: [],
}
