import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(240 3.7% 15.9%)',
        input: 'hsl(240 3.7% 15.9%)',
        ring: 'hsl(240 4.9% 83.9%)',
        background: 'hsl(224 71% 4%)',
        foreground: 'hsl(213 31% 91%)',
        primary: {
          DEFAULT: 'hsl(179 100% 50%)',
          foreground: 'hsl(224 71% 4%)',
        },
        secondary: {
          DEFAULT: 'hsl(216 34% 17%)',
          foreground: 'hsl(180 10% 80%)',
        },
        destructive: {
          DEFAULT: 'hsl(0 62% 30%)',
          foreground: 'hsl(210 40% 98%)',
        },
        muted: {
          DEFAULT: 'hsl(223 47% 11%)',
          foreground: 'hsl(215 20% 65%)',
        },
        accent: {
          DEFAULT: 'hsl(216 34% 17%)',
          foreground: 'hsl(180 10% 80%)',
        },
        card: {
          DEFAULT: 'hsl(222 47% 8%)',
          foreground: 'hsl(213 31% 91%)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
