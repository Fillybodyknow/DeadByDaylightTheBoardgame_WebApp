// The app's own loading page, as a PC game's launcher: a screen over the whole app while what the
// menu itself needs is fetched, and then — once the menu is up and nobody is waiting — the quiet
// warming of the pictures every trial needs, whoever is playing, so a game's own loading page
// (TrialLoading) has less left to fetch.
//
// Two lists, and they are kept apart on purpose:
// - BOOT: the handful the menu draws itself with. The loading page waits for these.
// - WARM: the shared pictures of a trial (the maps, the realms behind them, the props, the dice,
//   the movement cards, the tokens, the survivors' minis) — about 8 MB. Nothing waits for these:
//   they go in the background, one at a time or three, into the browser's and the service
//   worker's caches. The character card art (over 100 MB) is never warmed; a game fetches the
//   four or five boards it actually needs.

import { ref } from 'vue'
import { components, survivorById } from './data'
import { asset } from './i18n'
import { boards } from './play/engine/boards'
import { PROP_IMAGE, cardImage } from './play/labels'
import { settings } from './settings'

/** The loading page is up: the app waits behind it (App.vue), and the greeting waits with it. */
export const booting = ref(true)
/** How many of the menu's own pictures are in, and how many there are. */
export const bootLoaded = ref(0)
export const bootTotal = ref(0)

/** What the menu draws itself with: its backdrop, the three mode cards, the mark in the top bar. */
export function bootAssets(): string[] {
  return [
    'icon.svg',
    'assets/app/background-img/background_lobby.webp',
    'assets/app/background-img/background_dbd.webp',
    'assets/app/background-img/background_macmillan.webp',
    'assets/app/background-img/background_autohaven.webp',
  ]
}

/** What every trial needs, whoever plays it. The character art is left out: it is the bulk. */
function warmAssets(): string[] {
  const list = [
    ...Object.values(boards).map((b) => b.image),
    ...Object.keys(boards).map((k) => `assets/app/background-img/background_${k}.webp`),
    ...Object.values(PROP_IMAGE),
    ...(['objective', 'survival', 'altruism', 'boldness'] as const).map((c) => `assets/props/back-${c}.webp`),
    ...(['sneak', 'sprint', 'crouch', 'vault', 'wait'] as const).map(cardImage),
    ...components.skillDieFaces,
    ...components.dangerDieFaces,
    components.bloodpoint.image,
    components.entity.image,
    components.generatorProgress.image,
    components.sacrificeProgress.image,
    components.firstPlayer.image,
    components.breakableWall.image,
    ...[...survivorById.values()].map((c) => c.images.mini),
  ]
  return [...new Set(list.filter((p): p is string => !!p))]
}

/** A picture is in (or gave up). Used for the loading page's bar, which is a real count. */
export function preloadImage(path: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => void img.decode().then(resolve, resolve)
    img.onerror = () => resolve()
    img.src = asset(path)
  })
}

/** The device says the connection is paid for by the megabyte, or is too slow to spend on this. */
function sparing(): boolean {
  const c = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  return !!c && (c.saveData === true || c.effectiveType === '2g' || c.effectiveType === 'slow-2g')
}

let warmed = false
/**
 * Warm the shared pictures in the background, three at a time. Fetched, not decoded: the point is
 * to fill the caches, and a decoded image would hold memory for nothing. Never on a metered or
 * crawling connection, and never twice in one page.
 */
export function warmShared() {
  if (warmed || !settings.warmAssets || sparing()) return
  warmed = true
  const queue = warmAssets()
  let at = 0
  const next = (): Promise<void> => {
    const path = queue[at++]
    if (!path) return Promise.resolve()
    // low priority where the browser knows the hint: nothing on screen is waiting for these
    return fetch(asset(path), { cache: 'force-cache', priority: 'low' } as RequestInit)
      .then(
        () => undefined,
        () => undefined,
      )
      .then(next)
  }
  const start = () => void Promise.all([next(), next(), next()])
  const idle = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback
  if (idle) idle(start, { timeout: 4000 })
  else window.setTimeout(start, 1500)
}
