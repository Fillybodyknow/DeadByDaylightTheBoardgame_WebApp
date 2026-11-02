// The player's settings, as the PC game's settings menu has them: remembered on this device, read
// by the game wherever they matter (SettingsDialog sets them). The sound levels and the card
// language have their own homes (sound.ts, i18n.ts); this holds the rest.

import { computed, reactive, ref, watch } from 'vue'

/** How long the game's animations take: longer, as made, half as long, or next to none. */
export type AnimSpeed = 'slow' | 'normal' | 'fast' | 'skip'

export interface Settings {
  animSpeed: AnimSpeed
  /** Always reduce motion (no pulsing, shaking, sweeping); off: as the device's own setting says. */
  reduceMotion: boolean
  /** The killer's chase theme when he stands on a survivor. */
  chaseMusic: boolean
  /** Online, your turn: the warning and the chime. */
  turnSound: boolean
  /** Online, your turn with the tab in the background: a system notification and a blinking title. */
  turnNotify: boolean
  /** Online, still your turn after 20 s: ring again. */
  turnRemind: boolean
  /** Online voice: how loud the others are (0–1, under the master volume). */
  voiceVolume: number
  /** The microphone to use (a device id); empty: the system's own. */
  micId: string
  /** Online voice: join it on entering a room (the microphone permission given before). */
  voiceAuto: boolean
  /** Online voice: the mic always open (M turns it off and on), or only while a key is held. */
  micMode: 'open' | 'ptt'
  /** Push to talk: the key held (a KeyboardEvent.code). */
  pttKey: string
  /**
   * Open mic: how loud the mic must be to send (0–1 on the level bar; 0: always sends). A gate:
   * quieter than this, a fan or a room's hum, and nothing goes.
   */
  voiceGate: number
  /** The browser's noise suppression and level control on the mic (its echo cancellation stays on). */
  noiseFilter: boolean
  /** A room announced in the looking-for-players chat: a card on any page, a chime (lfgNotify.ts). */
  lfgNotify: boolean
  /**
   * Where the hand of movement cards floats (CardHand). `auto`: where it covers neither the map nor
   * the side panel's buttons nor the players — under the panel, in its column beside the map; or,
   * the panel floating over the map (a tablet), under the map between the players and the panel.
   * `map`: under the map on every screen (on a wide one too, where raised cards cover the map's foot).
   * `corner`: the bottom-right corner, over the panel's foot (as it was first).
   */
  handPlace: 'auto' | 'map' | 'corner'
  /**
   * How the hand's cards are laid (CardHand): a fan, a little turned and lower towards the ends; a
   * straight row with a gap between; or overlapping, a strip of each showing, to take less width.
   */
  handLayout: 'fan' | 'row' | 'stack'
  /**
   * A picked card, until the choice is confirmed: drawn up above the hand, or left in it (sunk with
   * the others), only glowing gold, so it covers none of the map.
   */
  handPicked: 'raise' | 'sink'
  /**
   * The pointer on a card: the whole hand rises to full size, halfway, or only that card does (the
   * others stay sunk). The card pointed at always draws up whole.
   */
  handHover: 'full' | 'half' | 'one'
  /** A tablet: a hand to pick from comes up by itself (one tap picks); off: a first tap raises it, a second picks. */
  handTouchRaise: boolean
}

const DEFAULTS: Settings = { animSpeed: 'normal', reduceMotion: false, chaseMusic: true, turnSound: true, turnNotify: true, turnRemind: true, voiceVolume: 1, micId: '', voiceAuto: false, micMode: 'open', pttKey: 'KeyV', voiceGate: 0.25, noiseFilter: true, lfgNotify: true, handPlace: 'auto', handLayout: 'fan', handPicked: 'raise', handHover: 'full', handTouchRaise: true }

const KEY = 'dbdl-settings'

function read(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) }
  } catch {
    return { ...DEFAULTS }
  }
}

export const settings = reactive<Settings>(read())
watch(settings, () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // storage blocked: the settings hold for this visit only
  }
})

/** Every setting back to its default. */
export function resetSettings() {
  Object.assign(settings, DEFAULTS)
}

// ---------- reduced motion: the device's preference, or the setting ----------

const systemReduce = ref(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
if (typeof matchMedia === 'function') matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => (systemReduce.value = e.matches))

/** Motion is to be reduced: the device asks for it, or the player does. */
export const reducedMotion = computed(() => systemReduce.value || settings.reduceMotion)

// The whole page follows it: `html.reduce-motion` stops CSS animations and transitions (style.css).
if (typeof document !== 'undefined')
  watch(reducedMotion, (on) => document.documentElement.classList.toggle('reduce-motion', on), { immediate: true })

// ---------- animation speed ----------

/** What the animations' durations are multiplied by. */
const SCALE: Record<AnimSpeed, number> = { slow: 1.5, normal: 1, fast: 0.5, skip: 0.05 }
export const animScale = computed(() => SCALE[settings.animSpeed] ?? 1)

/** A duration of the game's animations (ms), at the player's speed. */
export const anim = (ms: number) => Math.round(ms * animScale.value)

// The page's CSS animations and transitions follow it too: each one that ends is played faster
// (its delay with it), so a CSS fill and the JS timer waiting for it stay in step. Endless ones (a
// glow, a slow spin) keep their pace, and so do the board's walks (Web Animations, timed in JS).
let raf = 0
function cssRate(rate: number) {
  for (const a of document.getAnimations())
    if ((a instanceof CSSAnimation || a instanceof CSSTransition) && a.playbackRate !== rate && a.effect?.getTiming().iterations !== Infinity) a.playbackRate = rate
}
function followSpeed() {
  cssRate(1 / animScale.value)
  raf = requestAnimationFrame(followSpeed)
}
if (typeof document !== 'undefined' && typeof document.getAnimations === 'function')
  watch(
    animScale,
    (k) => {
      cancelAnimationFrame(raf)
      if (k === 1) cssRate(1)
      else followSpeed()
    },
    { immediate: true },
  )
