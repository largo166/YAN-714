/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', '.darkui'], // 全站暗色由 body.darkui 驱动(不是 .dark)
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // P0 通电(2026-07-05):preflight 必须保持关闭,否则全局 reset 会砸烂 legacy-ui.css 的既有页面;
  // 等 P3(legacy 清退完)才能开。变量桥在 src/styles/tailwind.css。
  corePlugins: { preflight: false },
  theme: {
    extend: {
      fontFamily: {
        // 与 DESIGN.md 字体权威一致(legacy-ui.css --font-sans/--font-mono)
        sans: ['Space Grotesk', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['Space Mono', 'ui-monospace', 'Consolas', 'monospace'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}
