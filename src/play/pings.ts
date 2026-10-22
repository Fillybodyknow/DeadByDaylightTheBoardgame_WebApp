// Pings: online, a player points at a spot on the map for everyone to see — a ring in the colour
// they picked in the lobby, pulsing for a few seconds. They are for planning together, not part of
// the game: they go round the room once (`Room.ping`) and are never replayed or saved.
//
// Everyone sees every ping, the killer too: survivors may talk but never in secret, everything said
// aloud for the killer to hear (p.8).
//
// Spam: one ping per player on the map at a time (a new one replaces the last), at most one a
// second (also enforced by the database rules) and a few in a row before a short wait.

import { computed, ref, watch } from 'vue'
import { sfx } from '../sound'
import { online } from './game'
import { KILLER_PLAYER } from './engine/seats'
import { pingHex } from './online/pingColors'
import { pingColors, session } from './online/session'

export interface ShownPing {
  /** Client id of whoever pinged: one ring each, the newest. */
  from: string
  /** Changes with every ping, so the ring restarts its animation. */
  key: number
  x: number
  y: number
  hex: string
  name: string
}

/** How long a ring stays on the map. */
export const PING_MS = 4000
/**
 * At least this long between two pings of one player. The database rules refuse faster than one a
 * second, by the server's clock: the margin keeps network jitter from tripping that.
 */
const GAP_MS = 1500
/** A burst: this many pings within BURST_MS, then a wait until the oldest drops out. */
const BURST = 4
const BURST_MS = 10000

export const shownPings = ref<ShownPing[]>([])
/** The next click on the map pings instead of acting (the 📍 button). */
export const pingArmed = ref(false)
/** Seconds to wait before this player may ping again (0: now). */
export const pingWait = ref(0)
/** The room refused this player's last ping (database rules without pings): said for a moment. */
export const pingFailed = ref(false)
let failTimer: number | undefined

let serial = 0
const timers = new Map<string, number>()

/** A seated player's side (null: watching). */
function sideOf(id: string): 'killer' | 'survivor' | null {
  const seat = Object.entries(session.data?.seats ?? {}).find(([, s]) => s.id === id)?.[0]
  if (!seat) return null
  return Number(seat) === KILLER_PLAYER ? 'killer' : 'survivor'
}

/** This device may ping: online, in a seat, the room able to carry pings. */
export const canPing = computed(() => !!online.value?.seat && !!session.room?.ping && sideOf(session.me) !== null)

function show(from: string, x: number, y: number) {
  const hex = pingHex(pingColors.value[from])
  const name = session.data?.members[from]?.name ?? ''
  shownPings.value = [...shownPings.value.filter((p) => p.from !== from), { from, key: ++serial, x, y, hex, name }]
  clearTimeout(timers.get(from))
  timers.set(
    from,
    window.setTimeout(() => {
      shownPings.value = shownPings.value.filter((p) => p.from !== from)
      timers.delete(from)
    }, PING_MS),
  )
  sfx.ping()
}

// ---------- sending ----------

let sent: number[] = []
let waitTimer: number | undefined

/** How long until this player may ping again (ms), counting the pings just sent. */
function waitFor(now: number): number {
  sent = sent.filter((t) => now - t < BURST_MS)
  const last = sent[sent.length - 1]
  const gap = last === undefined ? 0 : GAP_MS - (now - last)
  const burst = sent.length >= BURST ? BURST_MS - (now - sent[0]) : 0
  return Math.max(0, gap, burst)
}

function countDown() {
  clearInterval(waitTimer)
  const tick = () => {
    pingWait.value = Math.ceil(waitFor(Date.now()) / 1000)
    if (!pingWait.value) clearInterval(waitTimer)
  }
  tick()
  waitTimer = window.setInterval(tick, 250)
}

/** Ping a spot (fractions of the board); false when it is too soon after the last ones. */
export function sendPing(x: number, y: number): boolean {
  const room = session.room
  if (!canPing.value || !room?.ping) return false
  const now = Date.now()
  if (waitFor(now) > 0) {
    countDown()
    return false
  }
  sent.push(now)
  pingArmed.value = false
  const p = { from: session.me, x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }
  show(p.from, p.x, p.y)
  room.ping(p).catch((e) => {
    console.warn('online: the ping was not sent (database.rules.json needs "pings"?)', e)
    pingFailed.value = true
    clearTimeout(failTimer)
    failTimer = window.setTimeout(() => (pingFailed.value = false), PING_MS)
  })
  // the burst is used up: say how long until the next one
  if (sent.length >= BURST) countDown()
  return true
}

// ---------- receiving ----------

function receive(p: { from: string; x: number; y: number }) {
  if (p.from === session.me || !online.value) return
  show(p.from, p.x, p.y)
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') pingArmed.value = false
})

watch(
  () => session.room,
  (room, _old, onCleanup) => {
    shownPings.value = []
    pingArmed.value = false
    const off = room?.onPings?.(receive)
    onCleanup(() => off?.())
  },
  { immediate: true },
)
