// Sound effects for the full game, synthesised with Web Audio like the companion's
// src/sound.ts (whose mute toggle this follows). Kept here so the companion is untouched.

import { muted } from '../../sound'

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (muted.value) return null
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

interface ToneOpts {
  type?: OscillatorType
  gain?: number
  at?: number
  slideTo?: number
}

function tone(freq: number, dur: number, o: ToneOpts = {}) {
  const a = audio()
  if (!a) return
  const t = a.currentTime + (o.at ?? 0)
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, t)
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(o.gain ?? 0.2, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(a.destination)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

interface NoiseOpts {
  type?: BiquadFilterType
  freq?: number
  q?: number
  gain?: number
  at?: number
}

function noise(dur: number, o: NoiseOpts = {}) {
  const a = audio()
  if (!a) return
  const t = a.currentTime + (o.at ?? 0)
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  const src = a.createBufferSource()
  src.buffer = buf
  const f = a.createBiquadFilter()
  f.type = o.type ?? 'bandpass'
  f.frequency.value = o.freq ?? 1000
  f.Q.value = o.q ?? 1
  const g = a.createGain()
  g.gain.value = o.gain ?? 0.3
  src.connect(f).connect(g).connect(a.destination)
  src.start(t)
}

export const fxSound = {
  /** A footstep per room moved. */
  step() {
    noise(0.05, { type: 'lowpass', freq: 500, gain: 0.25 })
  },
  /** A tile flipping over. */
  flip() {
    noise(0.12, { freq: 2500, q: 0.7, gain: 0.18 })
    tone(660, 0.08, { type: 'triangle', gain: 0.06, at: 0.08 })
  },
  /** The killer's blow: a thud with a wet slash. */
  hit() {
    tone(110, 0.25, { gain: 0.6, slideTo: 45 })
    noise(0.22, { freq: 1800, q: 0.8, gain: 0.45 })
    noise(0.3, { type: 'lowpass', freq: 300, gain: 0.4, at: 0.04 })
  },
  /** Metal on metal, then the Entity's spikes. */
  hook() {
    tone(880, 0.6, { type: 'square', gain: 0.05, slideTo: 830 })
    tone(1320, 0.4, { type: 'triangle', gain: 0.05 })
    noise(0.5, { type: 'highpass', freq: 3000, gain: 0.15, at: 0.05 })
    tone(55, 1.4, { type: 'sawtooth', gain: 0.12, at: 0.2, slideTo: 38 })
  },
  /** Bear trap snapping shut. */
  snap() {
    noise(0.06, { type: 'highpass', freq: 2500, gain: 0.6 })
    tone(220, 0.12, { type: 'square', gain: 0.12, slideTo: 90 })
  },
  /** Generator done: an engine spinning up and a chime. */
  generator() {
    tone(80, 0.9, { type: 'sawtooth', gain: 0.08, slideTo: 220 })
    ;[523, 659, 784].forEach((f, i) => tone(f, 0.6, { type: 'triangle', gain: 0.1, at: 0.5 + i * 0.09 }))
  },
  /** Exit gates powered: the siren. */
  powered() {
    for (let i = 0; i < 3; i++) tone(440, 0.5, { type: 'sawtooth', gain: 0.07, at: i * 0.55, slideTo: 660 })
  },
  /** Wood cracking (pallet / wall broken). */
  crack() {
    noise(0.25, { freq: 700, q: 2, gain: 0.5 })
    noise(0.15, { type: 'lowpass', freq: 200, gain: 0.5, at: 0.05 })
  },
  /** Gaining bloodpoints. */
  bp() {
    tone(988, 0.12, { type: 'triangle', gain: 0.07 })
    tone(1319, 0.16, { type: 'triangle', gain: 0.06, at: 0.06 })
  },
  /** A perk card revealed: a shimmer rising into a chord (darker for the killer). */
  perk(killer: boolean) {
    noise(0.5, { type: 'highpass', freq: 4000, gain: 0.12 })
    const notes = killer ? [146.8, 174.6, 220, 277.2] : [392, 493.9, 587.3, 784]
    notes.forEach((n, i) => tone(n, 0.9, { type: killer ? 'sawtooth' : 'triangle', gain: killer ? 0.05 : 0.08, at: 0.05 + i * 0.07 }))
    if (killer) tone(55, 1.1, { type: 'sawtooth', gain: 0.1, slideTo: 41 })
  },
  /** An item used: a bright clink and a rising sparkle. */
  item() {
    tone(1568, 0.25, { type: 'triangle', gain: 0.1 })
    tone(2093, 0.3, { type: 'triangle', gain: 0.08, at: 0.06 })
    ;[784, 988, 1175].forEach((f, i) => tone(f, 0.5, { type: 'sine', gain: 0.06, at: 0.12 + i * 0.06 }))
    noise(0.3, { type: 'highpass', freq: 5000, gain: 0.08, at: 0.05 })
  },
  /** A banner sliding in. */
  whoosh() {
    noise(0.35, { type: 'bandpass', freq: 600, q: 0.6, gain: 0.18 })
  },
}
