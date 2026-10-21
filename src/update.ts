// Is this tab running the newest build? The deploy publishes `version.json` beside the app (see
// vite.config.ts); a tab compares it with the build it was loaded from, on start, when it comes
// back into view and every few minutes. Also remembers which version the player last saw, so the
// "what's new" panel opens once after an update.

import { reactive } from 'vue'
import { APP_BUILT, APP_VERSION } from './version'

export const update = reactive({
  /** A newer build is published: reloading gets it. */
  available: false,
  /** Its version, once known. */
  latest: '',
  /** The "what's new" panel is open. */
  panel: false,
  /** The version the panel lists changes since (the player's last one; '' for all). */
  since: '',
})

const SEEN = 'dbdl-seen-version'
const CHECK_EVERY_MS = 10 * 60 * 1000

export async function checkForUpdate() {
  // the dev server has no version.json, and the build is always the newest
  if (!import.meta.env.PROD) return
  try {
    // a unique query: the service worker (an old one cached by URL) can't answer from its cache
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    const latest = (await res.json()) as { version?: string; built?: string }
    if (latest.built && latest.built !== APP_BUILT) {
      update.available = true
      update.latest = latest.version ?? ''
    }
  } catch {
    // offline: try again later
  }
}

/** Once at start: opens the panel when the version changed since this device last ran the app. */
export function startUpdateWatch() {
  void checkForUpdate()
  setInterval(() => void checkForUpdate(), CHECK_EVERY_MS)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void checkForUpdate())
  try {
    const seen = localStorage.getItem(SEEN)
    // a first visit has nothing to be "new" to
    if (seen && seen !== APP_VERSION) {
      update.since = seen
      update.panel = true
    }
    localStorage.setItem(SEEN, APP_VERSION)
  } catch {
    // storage blocked: no panel, the menu button still has it
  }
}

/** The menu's button: every release. */
export function openChangelog() {
  update.since = ''
  update.panel = true
}
