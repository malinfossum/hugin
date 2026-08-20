import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:5111' } },
  build: { outDir: '../Hugin.Api/wwwroot', emptyOutDir: true },
  test: {
    environment: 'jsdom',
    // jsdom's localStorage throws for the opaque "about:blank" origin it defaults to, and on
    // Node 22+ that failure surfaces as Node's own (unrelated) experimental global `localStorage`
    // silently shadowing it instead. A real http(s) origin sidesteps both.
    environmentOptions: { jsdom: { url: 'http://localhost/' } },
    setupFiles: './src/test-setup.ts',
    globals: true,
  },
})
