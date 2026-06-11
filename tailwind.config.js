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
      // Font stacks and text sizes are bound to the canonical tokens in
      // design-system.css — never restate the values here.
      fontFamily: {
        sans: ['var(--font-family)'],
        mono: ['var(--font-mono)'],
        display: ['var(--font-sans)'],
      },
      fontSize: {
        'xs': ['var(--text-xs)', '16px'],
        'sm': ['var(--text-sm)', '18px'],
        'base': ['var(--text-base)', '22px'],
        'md': ['var(--text-md)', '22px'],
        'lg': ['var(--text-lg)', '24px'],
        'xl': ['var(--text-xl)', '28px'],
        '2xl': ['var(--text-2xl)', '32px'],
        '3xl': ['var(--text-3xl)', '36px'],
        '4xl': ['var(--text-4xl)', '40px'],
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
        'none': '0',
        'sm': 'var(--radius-xs)',
        'DEFAULT': 'var(--radius-sm)',
        'md': 'var(--radius-md)',
        'lg': 'var(--radius-lg)',
        'xl': 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        'full': 'var(--radius-full)',
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
