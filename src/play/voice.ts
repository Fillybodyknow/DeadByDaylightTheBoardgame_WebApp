// Voice chat (online): one channel for the room, the lobby and the game alike. The players talk,
// a spectator only listens (the user's rule): before the seats are dealt a player is a member in
// the lineup (a side picked), after it whoever holds a seat. Everyone hears everyone, the killer
// too: survivors may talk but never in secret (p.8). Like chat and pings it is not part of the
// game: nothing of it is saved or replayed.
//
// The sound goes straight between the devices (WebRTC), never through the room: a table is at
// most five players and a few watchers, so each device connects to each other one (a mesh). The
// room only says who is in (`Room.onVoice`) and carries the few messages that connect two devices
// (`Room.voiceSignal`: an offer, its answer, the network routes). Of each pair, the device with
// the smaller client id makes the offer, so two never offer to each other at once.
//
// Finding a route: a free STUN server tells each device its public address, which connects most
// homes. A device behind a strict network (some mobile carriers, offices) needs a TURN relay; set
// VITE_TURN_URLS (comma-separated), VITE_TURN_USERNAME and VITE_TURN_CREDENTIAL to use one.
// Without it such a device can't hear or be heard, and the voice panel says so.

import { computed, reactive, watch } from 'vue'
import { settings } from '../settings'
import { muted, volumes } from '../sound'
import { session } from './online/session'
import type { Room, RoomData, VoiceEntry, VoiceSignal } from './online/transport'

const env = import.meta.env

function iceServers(): RTCIceServer[] {
  const out: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
  if (env.VITE_TURN_URLS) out.push({ urls: String(env.VITE_TURN_URLS).split(','), username: env.VITE_TURN_USERNAME, credential: env.VITE_TURN_CREDENTIAL })
  return out
}

/** How a connection to another member is doing. */
export type LinkState = 'connecting' | 'connected' | 'failed'

export const voice = reactive({
  /** This device is in the voice channel. */
  joined: false,
  /** Joining: the microphone being asked for. */
  busy: false,
  /** This device's microphone is off (it stays in the channel, hearing the others). */
  micOff: false,
  /** Push to talk: the key (or the 🎙️ button) is held now. */
  talking: false,
  /** Why joining failed, in Thai. */
  error: '',
  /** Who is in the voice channel: client id → their entry. */
  roster: {} as Record<string, VoiceEntry>,
  /** Who is speaking now (this device included). */
  speaking: {} as Record<string, boolean>,
  /** The connection to each other member in the channel. */
  links: {} as Record<string, LinkState>,
  /** The browser held the others' sound back until a tap (Safari, or joining by itself). */
  blocked: false,
  /** Each other member's volume on this device (0–1; unset: 1), this visit only. */
  gain: {} as Record<string, number>,
})

const supported = typeof RTCPeerConnection === 'function' && !!navigator.mediaDevices?.getUserMedia

/** This device may use voice: a browser that can, in a room that carries it, as one of its members. */
export const canVoice = computed(() => supported && !!session.room?.voiceJoin && !!session.data?.members[session.me])

/** A member may talk: a player (in a seat; in the lobby, in the lineup), not a spectator. */
export function mayTalk(d: RoomData | null, id: string): boolean {
  if (!d) return false
  const seats = Object.values(d.seats ?? {})
  if (seats.length) return seats.some((s) => s.id === id)
  return !!d.members[id]?.side
}

/** This device may talk (otherwise it joins to listen only). */
export const canSpeak = computed(() => mayTalk(session.data, session.me))

export interface VoiceMember {
  id: string
  name: string
  me: boolean
  /** A spectator, listening only. */
  listener: boolean
  micOff: boolean
  speaking: boolean
  link: LinkState
}

/** The members in the channel, this device first. */
export const voiceMembers = computed<VoiceMember[]>(() =>
  Object.entries(voice.roster)
    .map(([id, e]) => ({
      id,
      name: session.data?.members[id]?.name ?? '…',
      me: id === session.me,
      listener: !!e.l,
      micOff: e.m,
      speaking: !!voice.speaking[id],
      link: id === session.me ? ('connected' as const) : (voice.links[id] ?? 'connecting'),
    }))
    .sort((a, b) => Number(b.me) - Number(a.me) || a.name.localeCompare(b.name)),
)

/** By seat (player number): its player is in the channel, with the mic off, speaking now. For the tiles. */
export const seatVoice = computed(() => {
  const out: Record<string, { micOff: boolean; speaking: boolean }> = {}
  for (const [seat, s] of Object.entries(session.data?.seats ?? {})) {
    const e = voice.roster[s.id]
    if (e) out[seat] = { micOff: e.m, speaking: !!voice.speaking[s.id] }
  }
  return out
})

// ---------- this device's microphone ----------

let mic: MediaStream | null = null

async function openMic(): Promise<MediaStream> {
  const base: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  if (settings.micId) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: { ...base, deviceId: { exact: settings.micId } } })
    } catch (e) {
      // the chosen microphone is gone: the system's own
      if (!['OverconstrainedError', 'NotFoundError'].includes((e as DOMException).name)) throw e
    }
  }
  return navigator.mediaDevices.getUserMedia({ audio: base })
}

function micError(e: unknown): string {
  const name = (e as DOMException)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'ไม่ได้รับสิทธิ์ใช้ไมค์ — อนุญาตไมค์ให้เว็บนี้ในเบราว์เซอร์ แล้วลองใหม่'
  if (name === 'NotFoundError') return 'ไม่พบไมโครโฟนในเครื่องนี้'
  if (name === 'NotReadableError') return 'ไมค์ถูกโปรแกรมอื่นใช้อยู่'
  return 'เปิดไมค์ไม่ได้'
}

/** The microphone sends now: open and not turned off, or held in push to talk. */
export const micLive = computed(() => voice.joined && !!voice.roster[session.me] && !voice.roster[session.me].l && (settings.micMode === 'ptt' ? voice.talking : !voice.micOff))

function setMicTracks() {
  const on = !!mic && (settings.micMode === 'ptt' ? voice.talking : !voice.micOff)
  mic?.getAudioTracks().forEach((t) => (t.enabled = on))
}

function stopMic() {
  mic?.getTracks().forEach((t) => t.stop())
  mic = null
}

/** The microphones of this device, for the settings (their names show once the mic was allowed). */
export async function micList(): Promise<{ id: string; label: string }[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  const all = await navigator.mediaDevices.enumerateDevices()
  return all.filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications').map((d, i) => ({ id: d.deviceId, label: d.label || `ไมโครโฟน ${i + 1}` }))
}

// ---------- who is speaking: the level of each stream ----------

let ctx: AudioContext | null = null
const meters = new Map<string, { src: MediaStreamAudioSourceNode; an: AnalyserNode; buf: Uint8Array<ArrayBuffer>; last: number }>()
let meterTimer = 0
/** Loud enough to be speech (the RMS of the waveform), and how long the ring stays after it. */
const LOUD = 0.035
const HOLD_MS = 350

function meter(id: string, stream: MediaStream) {
  unmeter(id)
  try {
    ctx ??= new AudioContext()
    void ctx.resume()
    const src = ctx.createMediaStreamSource(stream)
    const an = ctx.createAnalyser()
    an.fftSize = 512
    src.connect(an)
    meters.set(id, { src, an, buf: new Uint8Array(an.fftSize), last: 0 })
    if (!meterTimer) meterTimer = window.setInterval(measure, 120)
  } catch {
    // no level for this stream: its speaker just gets no ring
  }
}

function unmeter(id: string) {
  meters.get(id)?.src.disconnect()
  meters.delete(id)
  delete voice.speaking[id]
  if (!meters.size && meterTimer) {
    clearInterval(meterTimer)
    meterTimer = 0
  }
}

function measure() {
  const now = performance.now()
  for (const [id, m] of meters) {
    m.an.getByteTimeDomainData(m.buf)
    let sum = 0
    for (const v of m.buf) sum += ((v - 128) / 128) ** 2
    const off = id === session.me ? !mic?.getAudioTracks()[0]?.enabled : !!voice.roster[id]?.m
    if (!off && Math.sqrt(sum / m.buf.length) > LOUD) m.last = now
    const speaking = now - m.last < HOLD_MS
    if (!!voice.speaking[id] !== speaking) voice.speaking[id] = speaking
  }
}

// ---------- the connections, one per other member ----------

interface Peer {
  id: string
  /** Their joining this connection is for (VoiceEntry.s). */
  remote: string
  pc: RTCPeerConnection
  audio: HTMLAudioElement
  /** Routes that came before the offer or answer they belong to. */
  routes: RTCIceCandidateInit[]
  stuck?: number
}

const peers = new Map<string, Peer>()
/** Failed attempts in a row per member: the offering side stops trying after a few. */
const tries = new Map<string, number>()
const MAX_TRIES = 3
/** The room this device joined voice in, and its joining's id there. */
let room: Room | null = null
let mine = ''
let offSignals: (() => void) | null = null
/** Signals are handled one at a time, in the order they came. */
let chain: Promise<void> = Promise.resolve()

const newId = () => Math.random().toString(36).slice(2, 10)

/** This device's entry in the channel. */
// In push to talk the mic shows as on: the others see who talks by the ring, and a key press
// needn't write to the room each time.
const entry = (): VoiceEntry => ({ s: mine, m: !mic || (settings.micMode === 'open' && voice.micOff), ...(mic ? {} : { l: true }) })

function volumeOf(id: string): number {
  return Math.min(1, volumes.master * settings.voiceVolume * (voice.gain[id] ?? 1))
}

function send(to: string, remote: string, k: VoiceSignal['k'], d: unknown) {
  room?.voiceSignal?.(to, { f: session.me, s: mine, r: remote, k, d: JSON.stringify(d) }).catch((e) => console.warn('voice: a signal was not sent', e))
}

function open(id: string, remote: string): Peer {
  drop(id)
  const pc = new RTCPeerConnection({ iceServers: iceServers() })
  const audio = document.createElement('audio')
  audio.autoplay = true
  audio.setAttribute('playsinline', '')
  audio.hidden = true
  document.body.append(audio)
  const p: Peer = { id, remote, pc, audio, routes: [] }
  peers.set(id, p)
  voice.links[id] = 'connecting'
  if (mic) for (const t of mic.getTracks()) pc.addTrack(t, mic)
  pc.onicecandidate = (e) => {
    if (e.candidate) send(id, remote, 'ice', e.candidate.toJSON())
  }
  pc.ontrack = (e) => {
    const stream = e.streams[0] ?? new MediaStream([e.track])
    audio.srcObject = stream
    audio.volume = volumeOf(id)
    audio.muted = muted.value || !mayTalk(session.data, id)
    audio.play().catch(() => (voice.blocked = true))
    meter(id, stream)
  }
  pc.onconnectionstatechange = () => {
    if (peers.get(id) !== p) return
    const s = pc.connectionState
    clearTimeout(p.stuck)
    if (s === 'connected') {
      voice.links[id] = 'connected'
      tries.delete(id)
    } else if (s === 'failed') retry(p)
    else if (s === 'disconnected') p.stuck = window.setTimeout(() => retry(p), 5000)
  }
  return p
}

function drop(id: string) {
  const p = peers.get(id)
  if (!p) return
  peers.delete(id)
  clearTimeout(p.stuck)
  p.pc.onicecandidate = null
  p.pc.ontrack = null
  p.pc.onconnectionstatechange = null
  p.pc.close()
  p.audio.srcObject = null
  p.audio.remove()
  unmeter(id)
  delete voice.links[id]
}

async function call(id: string, remote: string) {
  const p = open(id, remote)
  // listening only: no track to send, but the offer must still ask for theirs
  if (!mic) p.pc.addTransceiver('audio', { direction: 'recvonly' })
  const offer = await p.pc.createOffer()
  if (peers.get(id) !== p) return
  await p.pc.setLocalDescription(offer)
  send(id, remote, 'offer', p.pc.localDescription!.toJSON())
}

/** A connection failed or stayed down: the offering side starts it again, a few times. */
function retry(p: Peer) {
  if (peers.get(p.id) !== p) return
  voice.links[p.id] = 'failed'
  if (session.me >= p.id) return // theirs to offer again
  const n = (tries.get(p.id) ?? 0) + 1
  tries.set(p.id, n)
  if (n >= MAX_TRIES) return
  window.setTimeout(() => {
    if (peers.get(p.id) === p && voice.roster[p.id]?.s === p.remote) void call(p.id, p.remote).catch((e) => console.warn('voice:', e))
  }, 2000 * n)
}

async function flush(p: Peer) {
  for (const c of p.routes.splice(0)) await p.pc.addIceCandidate(c).catch(() => {})
}

async function onSignal(sig: VoiceSignal) {
  if (!voice.joined || sig.r !== mine) return // for an earlier joining of this device
  const d = JSON.parse(sig.d) as RTCSessionDescriptionInit & RTCIceCandidateInit
  if (sig.k === 'offer') {
    const p = open(sig.f, sig.s)
    await p.pc.setRemoteDescription(d)
    await flush(p)
    const answer = await p.pc.createAnswer()
    if (peers.get(sig.f) !== p) return
    await p.pc.setLocalDescription(answer)
    send(sig.f, sig.s, 'answer', p.pc.localDescription!.toJSON())
    return
  }
  const p = peers.get(sig.f)
  if (!p || p.remote !== sig.s) return
  if (sig.k === 'answer') {
    if (p.pc.signalingState !== 'have-local-offer') return
    await p.pc.setRemoteDescription(d)
    await flush(p)
  } else if (p.pc.remoteDescription) await p.pc.addIceCandidate(d).catch(() => {})
  else p.routes.push(d)
}

let rejoinAt = 0

/** Match the connections to who is in the channel now. */
function sync() {
  if (!voice.joined || !room) return
  const r = voice.roster
  if (!r[session.me]) {
    // the server took this device out (its connection dropped): back in, as a new joining, so
    // everyone connects to it afresh
    if (Date.now() - rejoinAt < 3000) return
    rejoinAt = Date.now()
    for (const id of [...peers.keys()]) drop(id)
    tries.clear()
    mine = newId()
    void room.voiceJoin?.(session.me, entry()).catch(() => {})
    return
  }
  for (const [id, p] of peers) if (r[id]?.s !== p.remote) drop(id)
  for (const [id, e] of Object.entries(r))
    // two listeners have nothing to send each other
    if (id !== session.me && session.me < id && !peers.has(id) && (mic || !e.l) && (tries.get(id) ?? 0) < MAX_TRIES) void call(id, e.s).catch((err) => console.warn('voice:', err))
}

// ---------- joining and leaving ----------

export async function joinVoice() {
  const r = session.room
  if (!r?.voiceJoin || voice.joined || voice.busy || !canVoice.value) return
  voice.busy = true
  voice.error = ''
  // a spectator listens only: no microphone is asked for
  if (canSpeak.value)
    try {
      mic = await openMic()
    } catch (e) {
      voice.error = micError(e)
      voice.busy = false
      return
    }
  if (session.room !== r) {
    stopMic()
    voice.busy = false
    return
  }
  setMicTracks()
  room = r
  mine = newId()
  tries.clear()
  offSignals =
    r.onVoiceSignals?.(session.me, (sig) => {
      chain = chain.then(() => onSignal(sig)).catch((e) => console.warn('voice:', e))
    }) ?? null
  try {
    await r.voiceJoin(session.me, entry())
  } catch (e) {
    console.warn('voice: cannot join (database.rules.json needs "voice" and "vsig")', e)
    teardown()
    voice.error = 'ห้องนี้ยังใช้เสียงพูดไม่ได้ (ต้องอัปเดตกฎของฐานข้อมูล)'
    voice.busy = false
    return
  }
  voice.joined = true
  voice.busy = false
  void ctx?.resume()
  if (mic) meter(session.me, mic)
  sync()
}

function teardown() {
  offSignals?.()
  offSignals = null
  for (const id of [...peers.keys()]) drop(id)
  unmeter(session.me)
  stopMic()
  room = null
  mine = ''
  voice.joined = false
  voice.blocked = false
}

export async function leaveVoice() {
  const r = room
  teardown()
  try {
    await r?.voiceLeave?.(session.me)
  } catch {
    // the room is gone or closed: nothing of this device is left in it
  }
}

export function toggleMic() {
  if (!mic || settings.micMode === 'ptt') return
  voice.micOff = !voice.micOff
  setMicTracks()
  if (voice.joined && room) void room.voiceJoin?.(session.me, entry()).catch(() => {})
}

/** Push to talk: the key or the button pressed, and let go. */
export function pttDown() {
  if (!mic || settings.micMode !== 'ptt' || voice.talking) return
  voice.talking = true
  setMicTracks()
}
export function pttUp() {
  if (!voice.talking) return
  voice.talking = false
  setMicTracks()
}

/** A key's name as the settings show it (KeyV → V). */
export function keyLabel(code: string): string {
  const named: Record<string, string> = { Space: 'Space', Backquote: '`', CapsLock: 'Caps Lock', ShiftLeft: 'Shift ซ้าย', ShiftRight: 'Shift ขวา', ControlLeft: 'Ctrl ซ้าย', ControlRight: 'Ctrl ขวา' }
  return named[code] ?? code.replace(/^Key|^Digit/, '').replace(/^Numpad/, 'Num ')
}

/** Keys the game or the browser already uses, refused for push to talk. */
export const TAKEN_KEYS = ['Escape', 'Enter', 'NumpadEnter', 'Tab', 'KeyQ', 'KeyM', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (!!el.closest?.('input, textarea, select, [contenteditable="true"]') || el.isContentEditable)
}

// The keys: push to talk held (not while typing), M turns an open mic off and on (as Q pings).
window.addEventListener('keydown', (e) => {
  if (!voice.joined || !mic || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return
  if (settings.micMode === 'ptt' && e.code === settings.pttKey) {
    e.preventDefault()
    if (!e.repeat) pttDown()
  } else if (settings.micMode === 'open' && e.code === 'KeyM' && !e.repeat) {
    e.preventDefault()
    toggleMic()
  }
})
window.addEventListener('keyup', (e) => {
  if (e.code === settings.pttKey) pttUp()
})
// a key let go in another window never comes back here: stop talking when this one loses focus
window.addEventListener('blur', pttUp)

/** A tap lets the browser play the others' sound (it was held back). */
export function unblock() {
  void ctx?.resume()
  for (const p of peers.values()) void p.audio.play().catch(() => {})
  voice.blocked = false
}

// the others' volume follows the settings, the master volume and the mute toggle; a spectator's
// sound is never played, whatever their device sends
watch(
  () => [muted.value, volumes.master, settings.voiceVolume, JSON.stringify(voice.gain), JSON.stringify(session.data?.seats ?? {}), JSON.stringify(Object.entries(session.data?.members ?? {}).map(([id, m]) => [id, m.side]))],
  () => {
    for (const p of peers.values()) {
      p.audio.volume = volumeOf(p.id)
      p.audio.muted = muted.value || !mayTalk(session.data, p.id)
    }
  },
)

// a spectator taking a seat (or a player leaving theirs): joined again, with or without the mic
watch(canSpeak, (can) => {
  if (!voice.joined || can === !!mic) return
  void leaveVoice().then(joinVoice)
})

// the mic's mode changed: the tracks and this device's entry follow
watch(
  () => settings.micMode,
  () => {
    voice.talking = false
    setMicTracks()
    if (voice.joined && room) void room.voiceJoin?.(session.me, entry()).catch(() => {})
  },
)

// another microphone picked in the settings: swapped in on every connection, without reconnecting
watch(
  () => settings.micId,
  async () => {
    if (!voice.joined || !mic) return
    try {
      const next = await openMic()
      const track = next.getAudioTracks()[0]
      for (const p of peers.values()) for (const s of p.pc.getSenders()) if (s.track?.kind === 'audio') await s.replaceTrack(track)
      stopMic()
      mic = next
      setMicTracks()
      meter(session.me, mic)
    } catch (e) {
      voice.error = micError(e)
    }
  },
)

// the room's channel: who is in, from entering the room (shown before joining too)
watch(
  () => session.room,
  (r, _old, onCleanup) => {
    if (room && room !== r) void leaveVoice()
    voice.roster = {}
    const off = r?.onVoice?.((roster) => {
      voice.roster = roster
      sync()
    })
    onCleanup(() => off?.())
  },
  { immediate: true },
)

// out of the room's members (left, kicked): out of voice; in a room with auto-join on: in
watch(
  canVoice,
  (can) => {
    if (!can && voice.joined) void leaveVoice()
    else if (can && settings.voiceAuto && !voice.joined) void joinVoice()
  },
  { immediate: true },
)
