// Sound effects for the full game. Recorded clips (public/assets/app/sound/game/) where there
// is one, otherwise synthesised with Web Audio like src/sound.ts (whose mute toggle and master /
// effects volume this follows).

import { watch } from 'vue'
import { asset } from '../../i18n'
import { muted, sfxLevel, volumes } from '../../sound'

let ctx: AudioContext | null = null
/** Every effect goes through this, set by the master and effects sliders (`volumes`). */
let out: GainNode | null = null
watch(volumes, () => {
  if (out) out.gain.value = sfxLevel()
})

function audio(): AudioContext | null {
  if (muted.value) return null
  try {
    if (!ctx) {
      ctx = new AudioContext()
      out = ctx.createGain()
      out.gain.value = sfxLevel()
      out.connect(ctx.destination)
      void loadClips(ctx)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

// ---------- recorded clips ----------

const CLIPS = [
  'crow-caw', 'item', 'skill-warn', 'skill-good', 'skill-great', 'skill-fail', 'damage', 'gen-done',
  'cleanse', 'pallet-drop', 'pallet-break', 'pick-up', 'hook', 'lever', 'gate-open', 'gates-powered',
  'vault', 'pallet-run', 'equip', 'unequip', 'lobby-join', 'lobby-leave', 'char-pick', 'char-confirm',
  'char-unconfirm', 'match-ready', 'locker-open', 'locker-close', 'locker-search', 'sabotage',
  'crow-touch', 'crow-destroy', 'totem-touch', 'bw-refresh',
] as const
type Clip = (typeof CLIPS)[number]

const buffers = new Map<Clip, AudioBuffer>()
let clipsLoaded: Promise<void> | null = null

function loadClips(c: AudioContext): Promise<void> {
  clipsLoaded ??= Promise.all(
    CLIPS.map(async (name) => {
      try {
        const res = await fetch(asset(`assets/app/sound/game/${name}.ogg`))
        if (res.ok) buffers.set(name, await c.decodeAudioData(await res.arrayBuffer()))
      } catch {
        // missing or undecodable: the synthesised sound is used
      }
    }),
  ).then(() => undefined)
  return clipsLoaded
}

/** Play a recorded clip, or `fallback` (synthesised) when it didn't load. */
function clip(name: Clip, fallback: () => void = () => {}, gain = 0.7) {
  const a = audio()
  if (!a) return
  void loadClips(a).then(() => {
    const buf = buffers.get(name)
    if (!buf) return fallback()
    const src = a.createBufferSource()
    src.buffer = buf
    const g = a.createGain()
    g.gain.value = gain
    src.connect(g).connect(out!)
    src.start()
  })
}

// ---------- synthesised ----------

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
  osc.connect(g).connect(out!)
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
  src.connect(f).connect(g).connect(out!)
  src.start(t)
}

/** Every effect drawn with oscillators and noise: the sound itself, or a clip's stand-in. */
const synth = {
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
  /** Skill check coming up: the short high warning ding. */
  skillWarn() {
    tone(1760, 0.14, { type: 'sine', gain: 0.12 })
    tone(2637, 0.1, { type: 'sine', gain: 0.05, at: 0.02 })
  },
  /** Needle stopped in the good zone: a soft click. */
  skillGood() {
    tone(1047, 0.1, { type: 'triangle', gain: 0.12 })
    noise(0.04, { type: 'highpass', freq: 3000, gain: 0.12 })
  },
  /** Great skill check: a bright rising double chime. */
  skillGreat() {
    tone(1319, 0.18, { type: 'triangle', gain: 0.12 })
    tone(1976, 0.3, { type: 'triangle', gain: 0.1, at: 0.08 })
    noise(0.2, { type: 'highpass', freq: 5000, gain: 0.08, at: 0.05 })
  },
  /** Failed skill check: the generator's bang and a falling buzz. */
  skillFail() {
    noise(0.45, { type: 'lowpass', freq: 900, gain: 0.7 })
    tone(140, 0.5, { type: 'sawtooth', gain: 0.18, slideTo: 50 })
    noise(0.3, { freq: 2200, q: 0.8, gain: 0.25, at: 0.03 })
  },
}

export const fxSound = {
  ...synth,
  hook: () => clip('hook', synth.hook),
  generator: () => clip('gen-done', synth.generator),
  powered: () => clip('gates-powered', synth.powered),
  item: () => clip('item', synth.item),
  skillWarn: () => clip('skill-warn', synth.skillWarn),
  skillGood: () => clip('skill-good', synth.skillGood),
  skillGreat: () => clip('skill-great', synth.skillGreat),
  skillFail: () => clip('skill-fail', synth.skillFail),
  /** Generator damaged: sparks and the engine dying. */
  damage: () => clip('damage', synth.crack),
  /** Pallet thrown down. */
  palletDrop: () => clip('pallet-drop', synth.crack),
  /** Pallet or breakable wall smashed. */
  palletBreak: () => clip('pallet-break', synth.crack),
  /** A crow revealed: it caws. */
  crow: () => clip('crow-caw', undefined, 0.5),
  /** Hex totem cleansed. */
  cleanse: () => clip('cleanse', undefined, 0.6),
  /** The killer picks a survivor up (or drags one out of a locker). */
  pickUp: () => clip('pick-up'),
  /** An exit gate's lever pulled a notch. */
  lever: () => clip('lever'),
  /** An exit gate fully open. */
  gateOpen: () => clip('gate-open', undefined, 0.6),
  // ----- moving about the board -----
  /** A survivor or the killer going through a vault path. */
  vault: () => clip('vault', synth.step),
  /** A survivor going over a path with a pallet on it. */
  palletRun: () => clip('pallet-run', synth.step),
  // ----- props handled -----
  /** A survivor gets into a locker: the door opens, then shuts. */
  lockerIn() {
    clip('locker-open')
    window.setTimeout(() => clip('locker-close'), 450)
  },
  /** A survivor comes out of a locker (or is dragged out). */
  lockerOut: () => clip('locker-open'),
  /** The killer searches a locker. */
  lockerSearch: () => clip('locker-search'),
  /** A survivor shoos a crow. */
  crowTouch: () => clip('crow-touch', undefined, 0.8),
  /** The killer scares a crow off. */
  crowDestroy: () => clip('crow-destroy'),
  /** A survivor sabotages a hook. */
  sabotage: () => clip('sabotage'),
  /** The killer venerates a hex totem. */
  totemTouch: () => clip('totem-touch', undefined, 0.6),
  // ----- before the game: the room -----
  /** Perk cards (and anything else) put on / taken off in the loadout. */
  equip: () => clip('equip'),
  unequip: () => clip('unequip'),
  /** Someone joins / leaves the lobby. */
  lobbyJoin: () => clip('lobby-join', undefined, 0.6),
  lobbyLeave: () => clip('lobby-leave', undefined, 0.6),
  /** A character picked; confirmed; taken back. */
  charPick: () => clip('char-pick', undefined, 0.6),
  charConfirm: () => clip('char-confirm', undefined, 0.7),
  charUnconfirm: () => clip('char-unconfirm', undefined, 0.6),
  /** The loading page opens (the Bloodweb's refresh). */
  bwRefresh: () => clip('bw-refresh', undefined, 0.7),
  /** Everyone is ready: the match is about to start. */
  matchReady: () => clip('match-ready', undefined, 0.8),
  /**
   * One half of a heartbeat ("lub", or the softer "dub"): a thump that falls in pitch, with a
   * knock in the low mids so laptop and tablet speakers, which barely play under 100 Hz, carry it.
   */
  heartbeat(strong = true) {
    const g = strong ? 1 : 0.6
    tone(150, 0.18, { gain: 0.7 * g, slideTo: 55 })
    tone(90, 0.22, { type: 'triangle', gain: 0.35 * g, slideTo: 45 })
    noise(0.09, { type: 'lowpass', freq: 420, gain: 0.55 * g })
  },
}
