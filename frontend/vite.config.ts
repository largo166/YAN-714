import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 项目站点部署在 /YAN-714/；本地开发仍使用根路径。
  base: process.env.GITHUB_ACTIONS ? '/YAN-714/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      // 退役波(2026-07-06):海天 OS 升唯一主入口——index=seasky 本体;
      // seasky.html 保留为同一入口的别名(兼容既有 /seasky.html 回归链接)。
      // 紫黑主 App(src/main.tsx)已无入口指向:代码冻结在库,tag retire-purple-final-20260706 可回滚。
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        seasky: fileURLToPath(new URL('./seasky.html', import.meta.url)),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true, // 端口被占即报错退出,不悄悄换端口(避免「以为在5173实则在5174」的脏状态)
  },
})
