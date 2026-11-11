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
import { components, killerById, survivorById } from './data'
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

/**
 * The pictures one character brings to a trial: their board (the strip of it the lobby and the
 * loading page show, and the whole of it in their details), their mini on the map, their three
 * perk cards, and for a killer the power and passive panels and the tokens. A few megabytes each.
 */
function characterAssets(kind: 'survivor' | 'killer', id: string): string[] {
  const c = kind === 'killer' ? killerById.get(id) : survivorById.get(id)
  if (!c) return []
  const k = kind === 'killer' ? killerById.get(id) : undefined
  const list = [
    c.images.boardTh,
    c.images.mini,
    // the three printed on their board; a loadout's own cards are not known until they are set
    ...c.perks.map((p) => p.image?.th),
    k?.power.image?.th,
    k?.passiveImage?.th,
    ...(k?.tokens ?? []).map((t) => t.image),
  ]
  return list.filter((p): p is string => !!p)
}

/** Everything already sent to the queue, so nothing is fetched twice in one page. */
const queued = new Set<string>()
let running = 0
const queue: string[] = []

/** Three at a time, low priority: nothing on screen waits for any of this. */
function pump() {
  while (running < 3) {
    const path = queue.shift()
    if (!path) return
    running++
    void fetch(asset(path), { cache: 'force-cache', priority: 'low' } as RequestInit)
      .then(
        () => undefined,
        () => undefined,
      )
      .then(() => {
        running--
        pump()
      })
  }
}

/** Put paths in the background queue. Fetched, not decoded: the point is only to fill the caches. */
function warm(paths: string[], idle = false) {
  if (!settings.warmAssets || sparing()) return
  const fresh = paths.filter((p) => p && !queued.has(p))
  if (!fresh.length) return
  fresh.forEach((p) => queued.add(p))
  queue.push(...fresh)
  if (!idle) return pump()
  const run = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback
  if (run) run(pump, { timeout: 4000 })
  else window.setTimeout(pump, 1500)
}

/** Once the menu is up: what every trial needs, whoever plays it. */
export function warmShared() {
  warm(warmAssets(), true)
}

/**
 * A character has been locked in (the online room's picks): fetch what they bring, there and
 * then, while the others are still choosing. The trial's own loading page is then left with
 * almost nothing to wait for. Called again with the same character costs nothing.
 */
export function warmCharacter(kind: 'survivor' | 'killer', id: string | null | undefined) {
  if (id) warm(characterAssets(kind, id))
}
