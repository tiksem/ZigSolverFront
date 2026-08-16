import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Relative base + hash routing (src/router/index.js) so the built dist/ can be
// dropped into any static directory of the Kotlin server without rewrite rules.
export default defineConfig({
  base: './',
  plugins: [vue()],
  server: { port: 5173 },
  build: { outDir: 'dist', emptyOutDir: true },
})
