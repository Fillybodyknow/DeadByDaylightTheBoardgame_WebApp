// The app's version, set at build time from package.json (see vite.config.ts). Bump
// package.json's "version" for a release: major.minor.patch — patch for fixes, minor for new
// features, major for changes that break saved games or rooms.

declare const __APP_VERSION__: string
declare const __APP_COMMIT__: string
declare const __APP_BUILT__: string

export const APP_VERSION = __APP_VERSION__
/** Short commit hash of the build ('' when built without git). */
export const APP_COMMIT = __APP_COMMIT__
/** When this build was made (ISO time). */
export const APP_BUILT = __APP_BUILT__

/** "v1.0.0 · a1b2c3d · 21 ต.ค. 2569", for the screen. */
export function versionLabel(): string {
  const built = new Date(APP_BUILT).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
  return [`v${APP_VERSION}`, APP_COMMIT, built].filter(Boolean).join(' · ')
}
