import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Relative base + hash routing (src/router/index.js) so the built dist/ can be
// dropped into any static directory of the Kotlin server without rewrite rules.
export default defineConfig({
  base: './',
  plugins: [vue()],
  // 5173 unless PORT says otherwise, so a second dev server (another agent's,
  // another checkout's) can be told where to land instead of silently sliding
  // to 5174 and leaving whoever launched it pointed at the wrong port.
  server: { port: Number(process.env.PORT) || 5173 },
  build: { outDir: 'dist', emptyOutDir: true },
})
