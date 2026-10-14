import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// The full playable game: a separate app in play/ with its own dev server and build
// (dist-play/). It reuses the companion's card data and images but is not part of the
// GitHub Pages deploy, which builds only vite.config.ts.
export default defineConfig({
  root: fileURLToPath(new URL('./play', import.meta.url)),
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  plugins: [vue()],
  base: './',
  server: { port: 5174 },
  build: {
    outDir: fileURLToPath(new URL('./dist-play', import.meta.url)),
    emptyOutDir: true,
  },
})
