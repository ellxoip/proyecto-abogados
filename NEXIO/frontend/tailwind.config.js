/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Light professional surfaces
        surface: {
          0: '#f0f4f8',   // body bg — light gray
          1: '#ffffff',   // card / panel — white
          2: '#f8fafc',   // hover / elevated
          3: '#edf2f7',   // input bg / active row
          4: '#e2e8f0',   // tooltip / popover
        },
        // Primary blue (replaces lime)
        lime: {
          DEFAULT: '#4361ee',
          dim: 'rgba(67,97,238,0.10)',
          glow: 'rgba(67,97,238,0.30)',
        },
        neon: {
          DEFAULT: '#3a86ff',
          dim: 'rgba(58,134,255,0.10)',
        },
        danger: {
          DEFAULT: '#ef233c',
          dim: 'rgba(239,35,60,0.10)',
        },
        warn: {
          DEFAULT: '#fb8500',
          dim: 'rgba(251,133,0,0.10)',
        },
      },
      fontFamily: {
        sans:    ['Manrope', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'sans-serif'],
      },
      boxShadow: {
        'card':      '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-lg':   '0 4px 16px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.06)',
        'lime':      '0 4px 20px rgba(67,97,238,0.25)',
        'lime-lg':   '0 6px 30px rgba(67,97,238,0.35)',
        'neon':      '0 4px 20px rgba(58,134,255,0.20)',
        'modal':     '0 25px 50px -12px rgba(0,0,0,0.20)',
        'glow-lime': '0 0 12px rgba(67,97,238,0.40)',
        'inner-lime':'inset 0 0 15px rgba(67,97,238,0.15)',
      },
      backgroundImage: {
        'lime-subtle': 'linear-gradient(135deg, rgba(67,97,238,0.08) 0%, rgba(67,97,238,0.02) 100%)',
        'neon-subtle': 'linear-gradient(135deg, rgba(58,134,255,0.08) 0%, rgba(58,134,255,0.02) 100%)',
      },
      animation: {
        'pulse-lime': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      backdropBlur: {
        glass: '16px',
      },
    },
  },
  plugins: [],
}
