import { statusTheme, statusVariables } from './tailwind.status-palette.js';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        lifted: 'var(--shadow-lifted)'
      },
      // Light-surface utilities follow the theme; dark shades (700+) stay fixed for overlays and dark panels.
      backgroundColor: {
        ...statusTheme.backgroundColor,
        white: 'rgb(var(--white-rgb) / <alpha-value>)',
        slate: {
          50: 'rgb(var(--slate-bg-50) / <alpha-value>)',
          100: 'rgb(var(--slate-bg-100) / <alpha-value>)',
          200: 'rgb(var(--slate-bg-200) / <alpha-value>)'
        }
      },
      borderColor: {
        ...statusTheme.borderColor,
        white: 'rgb(var(--white-rgb) / <alpha-value>)',
        slate: {
          100: 'rgb(var(--slate-line-100) / <alpha-value>)',
          200: 'rgb(var(--slate-line-200) / <alpha-value>)',
          300: 'rgb(var(--slate-line-300) / <alpha-value>)'
        }
      },
      textColor: {
        ...statusTheme.textColor,
        slate: {
          400: 'rgb(var(--slate-text-400) / <alpha-value>)',
          500: 'rgb(var(--slate-text-500) / <alpha-value>)',
          600: 'rgb(var(--slate-text-600) / <alpha-value>)',
          700: 'rgb(var(--slate-text-700) / <alpha-value>)',
          800: 'rgb(var(--slate-text-800) / <alpha-value>)',
          900: 'rgb(var(--slate-text-900) / <alpha-value>)',
          950: 'rgb(var(--slate-text-950) / <alpha-value>)'
        }
      },
      colors: {
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        surface: {
          DEFAULT: 'var(--surface)',
          muted: 'var(--surface-muted)'
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)'
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)'
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
          soft: 'var(--primary-soft)'
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)'
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)'
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)'
        },
        amber: {
          DEFAULT: 'var(--amber)',
          foreground: 'var(--amber-foreground)',
          soft: 'var(--amber-soft)'
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
          soft: 'var(--destructive-soft)'
        },
        success: {
          DEFAULT: 'var(--success)',
          soft: 'var(--success-soft)'
        },
        info: {
          DEFAULT: 'var(--info)',
          soft: 'var(--info-soft)'
        },
        sidebar: {
          DEFAULT: 'var(--sidebar)',
          foreground: 'var(--sidebar-foreground)',
          primary: 'var(--sidebar-primary)',
          'primary-foreground': 'var(--sidebar-primary-foreground)',
          accent: 'var(--sidebar-accent)',
          'accent-foreground': 'var(--sidebar-accent-foreground)',
          border: 'var(--sidebar-border)',
          ring: 'var(--sidebar-ring)'
        },
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
          5: 'var(--chart-5)'
        }
      },
      borderRadius: {
        sm: 'calc(var(--radius) - 4px)',
        md: 'calc(var(--radius) - 2px)',
        lg: 'var(--radius)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)',
        '3xl': 'calc(var(--radius) + 12px)',
        '4xl': 'calc(var(--radius) + 16px)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: [statusVariables],
};
