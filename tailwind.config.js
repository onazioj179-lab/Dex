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
        sans: ['Berkeley Mono', 'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        mono: ['Berkeley Mono', 'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        display: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'xs': ['11px', '16px'],
        'sm': ['12px', '18px'],
        'base': ['14px', '22px'],
        'md': ['14px', '22px'],
        'lg': ['16px', '24px'],
        'xl': ['20px', '28px'],
        '2xl': ['24px', '32px'],
        '3xl': ['28px', '36px'],
        '4xl': ['32px', '40px'],
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
        // Bound to the canonical radius scale in design-system.css — never
        // restate pixel values here.
        'window': 'var(--radius-xl)',
        'dock': 'var(--radius-2xl)',
      },
      animation: {
        'fade-in': 'fadeIn 0.06s ease-out',
        'scale-in': 'scaleIn 0.08s ease-out',
        'slide-up': 'slideUp 0.06s ease-out',
        'slide-right': 'slideRight 0.08s ease-out',
        'dock-bounce': 'dockBounce 0.3s ease-in-out',
        'app-enter': 'appEnter 0.06s ease-out',
      },
    },
  },
  plugins: [],
}
