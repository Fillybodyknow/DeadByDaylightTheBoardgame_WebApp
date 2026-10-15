// Installing the app (PWA): the service worker, and the browser's install prompt for a button.

import { ref } from 'vue'

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** The browser's install prompt, kept until the player asks for it (Chrome, Edge, Android). */
const deferred = ref<InstallPromptEvent | null>(null)

/** Running as an installed app (its own window, no browser bar). */
export const installed = ref(
  typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true),
)

/** The browser can install it with one tap. */
export const canInstall = ref(false)

/** iPhone / iPad Safari: no prompt, installing is Share → Add to Home Screen. */
export const iosHint = ref(
  typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !installed.value,
)

export function setupInstall() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred.value = e as InstallPromptEvent
    canInstall.value = true
  })
  window.addEventListener('appinstalled', () => {
    deferred.value = null
    canInstall.value = false
    installed.value = true
  })
  // The service worker only in the build: in development it would cache what Vite serves.
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        // not installable here (e.g. a private window); the app still works
      })
    })
  }
}

export async function install() {
  const e = deferred.value
  if (!e) return
  await e.prompt()
  await e.userChoice
  deferred.value = null
  canInstall.value = false
}
