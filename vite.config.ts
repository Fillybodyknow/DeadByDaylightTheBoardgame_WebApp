import vue from '@vitejs/plugin-vue'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// The app's version, shown on the menu: package.json's version, the commit it was built from
// and the build date (src/version.ts reads them).
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
function commit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return '' // no git (a copy of the files): the version alone
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // Relative base: the build works from any sub-path (GitHub Pages serves it at
  // /<repo>/) as well as the root. Routing uses the URL hash, so no server rewrites are needed.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit()),
    __APP_BUILT__: JSON.stringify(new Date().toISOString()),
  },
})
