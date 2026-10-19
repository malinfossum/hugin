import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  // The router plugin must come before the React one. It generates src/routeTree.gen.ts from
  // src/routes (committed, so `tsc` and CI typecheck work without running Vite first).
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: false }), react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
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
