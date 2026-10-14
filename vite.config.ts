import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // Relative base: the build works from any sub-path (GitHub Pages serves it at
  // /<repo>/) as well as the root. Routing uses the URL hash, so no server rewrites are needed.
  base: './',
})
