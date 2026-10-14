import { ref, watch } from 'vue'
import { asset } from './i18n'

// Sound effects synthesised with the Web Audio API, so the app ships no audio files.
// Browsers only allow audio after a user gesture; the context is created lazily on first use
// (every sound here is triggered by a tap), and a muted state is remembered per device.

function readMuted(): boolean {
  try {
    return localStorage.getItem('muted') === '1'
  } catch {
    return false
  }
}

export const muted = ref(readMuted())
watch(muted, (m) => {
  try {
    localStorage.setItem('muted', m ? '1' : '0')
  } catch {
    // storage unavailable
  }
  if (m) stopHeartbeat()
  syncAmbient()
})

let ctx: AudioContext | null = null
let master: GainNode | null = null

// Recorded clips in public/assets/app/sound/ replace the synthesised version of the same effect.
// Add an entry here when a file is added; effects without a file stay synthesised.
const SOUND_FILES: Partial<Record<keyof typeof sfx, string>> = {
  escape: 'assets/app/sound/escape.mp3',
  sacrifice: 'assets/app/sound/sacrifice.mp3',
}
const buffers = new Map<string, AudioBuffer>()

let clipsLoaded: Promise<void> | null = null

function loadClips(c: AudioContext): Promise<void> {
  clipsLoaded ??= Promise.all(
    Object.entries(SOUND_FILES).map(async ([name, path]) => {
      try {
        const res = await fetch(asset(path))
        if (res.ok) buffers.set(name, await c.decodeAudioData(await res.arrayBuffer()))
      } catch {
        // missing or undecodable: the synthesised sound is used
      }
    }),
  ).then(() => undefined)
  return clipsLoaded
}

/**
 * Play the recorded clip for an effect, or run `fallback` (the synthesised sound) when there is
 * no file. Waits for the clips to finish loading, so the first sound of a session isn't missed.
 */
function clipOr(name: keyof typeof sfx, fallback: () => void, gain = 0.9) {
  const a = audio()
  if (!a) return
  void loadClips(a.ctx).then(() => {
    const buf = buffers.get(name)
    if (!buf) return fallback()
    playBuffer(a, buf, gain)
  })
}

function playBuffer(a: { ctx: AudioContext; out: GainNode }, buf: AudioBuffer, gain: number) {
  const src = a.ctx.createBufferSource()
  src.buffer = buf
  const g = a.ctx.createGain()
  g.gain.value = gain
  src.connect(g).connect(a.out)
  src.start()
}

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (muted.value || typeof AudioContext === 'undefined') return null
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0.6
    master.connect(ctx.destination)
    void loadClips(ctx)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return { ctx, out: master! }
}

/** A tone with a quick attack and exponential decay. */
function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; at?: number; slideTo?: number } = {}) {
  const a = audio()
  if (!a) return
  const t = a.ctx.currentTime + (opts.at ?? 0)
  const osc = a.ctx.createOscillator()
  const g = a.ctx.createGain()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, t)
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.3, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(a.out)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

/** A burst of filtered noise (clicks, rattles, whooshes). */
function noise(dur: number, opts: { freq?: number; q?: number; gain?: number; at?: number; type?: BiquadFilterType } = {}) {
  const a = audio()
  if (!a) return
  const t = a.ctx.currentTime + (opts.at ?? 0)
  const len = Math.max(1, Math.floor(a.ctx.sampleRate * dur))
  const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = a.ctx.createBufferSource()
  src.buffer = buf
  const f = a.ctx.createBiquadFilter()
  f.type = opts.type ?? 'bandpass'
  f.frequency.value = opts.freq ?? 2000
  f.Q.value = opts.q ?? 1
  const g = a.ctx.createGain()
  g.gain.value = opts.gain ?? 0.3
  src.connect(f).connect(g).connect(a.out)
  src.start(t)
}

export const sfx = {
  /** UI tap. */
  click() {
    tone(880, 0.06, { type: 'triangle', gain: 0.12 })
  },
  /** Confirming a choice: a short bright two-note chime. */
  select() {
    tone(659, 0.12, { type: 'triangle', gain: 0.15 })
    tone(988, 0.2, { type: 'triangle', gain: 0.12, at: 0.07 })
  },
  /** A reel or die face flicking past. */
  tick() {
    noise(0.025, { freq: 3500, q: 4, gain: 0.25 })
  },
  /** Dice rattling in a hand. */
  rattle() {
    for (let i = 0; i < 4; i++) noise(0.03, { freq: 1800 + Math.random() * 1500, q: 3, gain: 0.3, at: i * 0.045 })
  },
  /** A die or reel coming to rest. */
  land() {
    tone(140, 0.18, { gain: 0.45, slideTo: 70 })
    noise(0.08, { freq: 900, q: 1, gain: 0.25 })
  },
  /** A mini set down on the board. */
  drop() {
    tone(220, 0.12, { type: 'triangle', gain: 0.25, slideTo: 110 })
  },
  /** The Entity: a low dissonant swell, for reveals. */
  entity() {
    tone(55, 1.6, { type: 'sawtooth', gain: 0.12, slideTo: 41 })
    tone(58.3, 1.6, { type: 'sawtooth', gain: 0.1, slideTo: 43.6 })
    tone(311, 1.2, { type: 'sine', gain: 0.06, at: 0.15, slideTo: 207 })
    noise(1.4, { type: 'lowpass', freq: 400, gain: 0.15 })
  },
  /** Survivors escaped: a rising, opening chord. */
  escape() {
    clipOr('escape', () =>
      [262, 330, 392, 523].forEach((f, i) => tone(f, 1.4, { type: 'triangle', gain: 0.12, at: i * 0.12 })),
    )
  },
  /** Killer won: a heavy boom with a falling tail. */
  sacrifice() {
    clipOr('sacrifice', () => {
      tone(80, 2, { gain: 0.6, slideTo: 30 })
      noise(1.8, { type: 'lowpass', freq: 300, gain: 0.35 })
      tone(466, 1.6, { type: 'sawtooth', gain: 0.05, at: 0.1, slideTo: 233 })
    })
  },
}

// ---------- heartbeat (the Killer's terror radius) ----------

let beatTimer: number | null = null

function beat() {
  // lub-dub
  tone(62, 0.16, { gain: 0.55, slideTo: 40 })
  tone(56, 0.14, { gain: 0.4, slideTo: 38, at: 0.2 })
}

/** Loop a heartbeat; `bpm` rises as the Killer gets closer. */
export function startHeartbeat(bpm = 70) {
  stopHeartbeat()
  if (muted.value) return
  beat()
  beatTimer = window.setInterval(beat, 60000 / bpm)
}

export function stopHeartbeat() {
  if (beatTimer !== null) clearInterval(beatTimer)
  beatTimer = null
}

// ---------- ambient music ----------
// One looping track per part of the app; switching tracks cross-fades between them.

const AMBIENT_TRACKS = {
  lobby: { src: 'assets/app/sound/theme/lobby-ambient.mp3', volume: 0.35 },
  play: { src: 'assets/app/sound/theme/during-play-ambient.mp3', volume: 0.3 },
} as const
export type AmbientTrack = keyof typeof AMBIENT_TRACKS

const ambientEls = new Map<AmbientTrack, HTMLAudioElement>()
const fades = new Map<HTMLAudioElement, number>()
let ambientWanted: AmbientTrack | null = null
let gestureArmed = false

function fadeTo(el: HTMLAudioElement, target: number, ms: number, then?: () => void) {
  const running = fades.get(el)
  if (running !== undefined) clearInterval(running)
  const steps = Math.max(1, Math.round(ms / 50))
  const delta = (target - el.volume) / steps
  let n = 0
  const id = window.setInterval(() => {
    n++
    el.volume = Math.min(1, Math.max(0, el.volume + delta))
    if (n >= steps) {
      clearInterval(id)
      fades.delete(el)
      el.volume = target
      then?.()
    }
  }, 50)
  fades.set(el, id)
}

// Browsers block audio until the user interacts; retry on the first tap.
function retryOnGesture() {
  if (gestureArmed) return
  gestureArmed = true
  const go = () => {
    gestureArmed = false
    syncAmbient()
  }
  window.addEventListener('pointerdown', go, { once: true })
  window.addEventListener('keydown', go, { once: true })
}

function element(track: AmbientTrack): HTMLAudioElement {
  let el = ambientEls.get(track)
  if (!el) {
    el = new Audio(asset(AMBIENT_TRACKS[track].src))
    el.loop = true
    el.volume = 0
    el.preload = 'auto'
    ambientEls.set(track, el)
  }
  return el
}

function syncAmbient() {
  const want = muted.value ? null : ambientWanted
  // fade out every other track
  for (const [track, el] of ambientEls)
    if (track !== want && !el.paused) fadeTo(el, 0, 1200, () => el.pause())
  if (!want) return
  const el = element(want)
  const volume = AMBIENT_TRACKS[want].volume
  if (el.paused)
    el.play().then(
      () => fadeTo(el, volume, 1500),
      () => retryOnGesture(),
    )
  else fadeTo(el, volume, 800)
}

/** Play an ambient track (cross-fading from any other), or fade everything out with null. */
export function setAmbient(track: AmbientTrack | null) {
  ambientWanted = track
  syncAmbient()
}

// Warm up on the first tap anywhere: create the audio context and start loading the clips.
if (typeof window !== 'undefined') {
  const warm = () => void audio()
  window.addEventListener('pointerdown', warm, { once: true })
}
