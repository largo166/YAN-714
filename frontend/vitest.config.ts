import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/* 组件测试专用配置(2026-07-06,与 vite.config.ts 分离):
   独立文件规避 vitest 自带 vite 副本与项目 vite 的 Plugin 类型冲突;
   不入 tsconfig build 图(tsc -b 只收 vite.config.ts),故不影响 typecheck/build。
   仅覆盖已写 *.test.tsx(当前 = CleanupWizard P0 回归守卫),不扩散范围。 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
