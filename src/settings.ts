// The player's settings, as the PC game's settings menu has them: remembered on this device, read
// by the game wherever they matter (SettingsDialog sets them). The sound levels and the card
// language have their own homes (sound.ts, i18n.ts); this holds the rest.

import { computed, reactive, ref, watch } from 'vue'

/** How long the game's animations take: as made, half as long, or next to none. */
export type AnimSpeed = 'normal' | 'fast' | 'skip'

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
}

const DEFAULTS: Settings = { animSpeed: 'normal', reduceMotion: false, chaseMusic: true, turnSound: true, turnNotify: true, turnRemind: true, voiceVolume: 1, micId: '', voiceAuto: false, micMode: 'open', pttKey: 'KeyV' }

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
export const animScale = computed(() => (settings.animSpeed === 'fast' ? 0.5 : settings.animSpeed === 'skip' ? 0.05 : 1))

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
