/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector', '.darkui'], // 全站暗色由 body.darkui 驱动(不是 .dark)
  content: ['./index.html', './seasky.html', './src/**/*.{ts,tsx}'],
  // P0 通电(2026-07-05):preflight 必须保持关闭,否则全局 reset 会砸烂 legacy-ui.css 的既有页面;
  // 等 P3(legacy 清退完)才能开。变量桥在 src/styles/tailwind.css。
  // seasky 入口自带微 reset(src/seasky/styles/globals.css),不依赖 preflight。
  corePlugins: { preflight: false },
  theme: {
    extend: {
      fontFamily: {
        // 与 DESIGN.md 字体权威一致(legacy-ui.css --font-sans/--font-mono)
        sans: ['Space Grotesk', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['Space Mono', 'ui-monospace', 'Consolas', 'monospace'],
        // 海天 OS(seasky 入口):CJK 细字重签名 + 引导行等宽
        skcjk: ['Noto Sans SC', 'PingFang SC', 'HarmonyOS Sans SC', 'Microsoft YaHei', 'sans-serif'],
        skmono: ['IBM Plex Mono', 'monospace'],
      },
      colors: {
        // ===== 板块色板(DESIGN.md 第 3 节,暗色板专用;页内 C 常量的 token 化替身) =====
        brand: {
          purple: '#7c5cff',
          blue: '#42a5ff',
          gold: '#d7a86e',
          cyan: '#36e6d4',
          red: '#ff5e66',
          amber: '#fdab3d',
          green: '#49d18d',
        },
        ink: { DEFAULT: '#f4f1ea', 2: '#d8d4cc' },
        mut: { DEFAULT: '#8f96a5', 2: '#5f6674' },
        line: { DEFAULT: 'rgba(255,255,255,.08)', 2: 'rgba(255,255,255,.12)' },
        // ===== shadcn 语义变量(主题反应式,亮暗随 .darkui 翻转) =====
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
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        // ===== 海天 OS token(seasky 入口专用,变量声明见 src/seasky/styles/tokens.css) =====
        sk: {
          bg: 'var(--sk-background)',
          fg: 'var(--sk-foreground)',
          muted: 'var(--sk-muted)',
          muted2: 'var(--sk-muted-2)',
          primary: 'var(--sk-primary)',
          deep: 'var(--sk-primary-deep)',
          ok: 'var(--sk-ok)',
          warn: 'var(--sk-warn)',
          risk: 'var(--sk-risk)',
          card: 'var(--sk-card)',
          heavy: 'var(--sk-card-heavy)',
          composer: 'var(--sk-composer)',
          border: 'var(--sk-border)',
          hair: 'var(--sk-hair)',
          hairsoft: 'var(--sk-hair-soft)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        // 海天 OS 圆角层级
        sktile: 'var(--sk-r-tile)',
        skcard: 'var(--sk-r-card)',
        skpanel: 'var(--sk-r-panel)',
        skcomposer: 'var(--sk-r-composer)',
      },
      boxShadow: {
        skpop: 'var(--sk-shadow-pop)',
        skglow: 'var(--sk-shadow-glow)',
        sklogo: 'var(--sk-shadow-logo)',
      },
      zIndex: {
        skchrome: 'var(--sk-z-chrome)',
        skdrop: 'var(--sk-z-drop)',
        skpop: 'var(--sk-z-pop)',
        skoverlay: 'var(--sk-z-overlay)',
      },
    },
  },
  plugins: [],
}
