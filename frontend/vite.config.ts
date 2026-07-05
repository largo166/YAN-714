import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      // 双入口:index=主 App(五板块业务),seasky=海天 OS 工程化迁移(视觉母版 prototypes/romai-seasky-os-v2.html)
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
