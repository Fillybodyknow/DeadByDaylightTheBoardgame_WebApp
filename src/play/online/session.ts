// The online room this device is in, and its flow:
//   lobby — everyone picks a side (1 killer, 2–4 survivor players) and says ready; the host goes on.
//   pick  — survivors pick their survivors (seeing each other's, no duplicates, the killer's
//           choice never shown), the killer picks; when every player has locked in, the killer
//           starts the game.
//   game  — mirrored into game.ts, which every game screen already reads.

import { computed, reactive, toRaw } from 'vue'
import { killerById, survivorById } from '../../data'
import { createGame, handLayout } from '../engine/engine'
import { boards, macmillan } from '../engine/boards'
import { KILLER_PLAYER } from '../engine/seats'
import { game, online, receive, restoreLocal } from '../game'
import { firebaseBackend, firebaseConfigured } from './firebase'
import { localBackend } from './local'
import { clientId, newRoomCode, type Backend, type Room, type RoomData, type Side } from './transport'

/** Firebase when configured (.env.local), otherwise the same-browser test backend. */
export const backend: Backend = firebaseConfigured ? firebaseBackend : localBackend

const LAST_ROOM = 'dbdl-last-room'
const NAME = 'dbdl-player-name'
export const MAX_SURVIVOR_PLAYERS = 4
export const MIN_SURVIVOR_PLAYERS = 2

export const session = reactive({
  me: clientId(backend.name === 'local'),
  room: null as Room | null,
  data: null as RoomData | null,
  error: '',
  busy: false,
  /** Connected to the room's server; false while the connection is down and being retried. */
  connected: true,
})

let unsubscribe: (() => void) | null = null
let unwatchConnection: (() => void) | null = null

export const isHost = computed(() => !!session.data && session.data.host === session.me)
export const me = computed(() => session.data?.members[session.me] ?? null)

/** Player number this device sits at, or null. */
export const mySeat = computed(() => {
  const seats = session.data?.seats ?? {}
  const hit = Object.entries(seats).find(([, v]) => v.id === session.me)
  return hit ? Number(hit[0]) : null
})

/** Members in join order. */
export const memberList = computed(() =>
  Object.entries(session.data?.members ?? {})
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => a.joinedAt - b.joinedAt),
)

/** Why the host can't leave the lobby yet (empty when they can). */
export const lobbyBlocker = computed(() => {
  const ms = memberList.value
  const killers = ms.filter((m) => m.side === 'killer').length
  const survivors = ms.filter((m) => m.side === 'survivor').length
  if (killers !== 1) return 'ต้องมี Killer 1 คน'
  if (survivors < MIN_SURVIVOR_PLAYERS) return `ต้องมีผู้เล่นฝั่ง Survivor อย่างน้อย ${MIN_SURVIVOR_PLAYERS} คน`
  if (ms.some((m) => !m.side)) return 'ทุกคนต้องเลือกฝั่ง'
  if (ms.some((m) => !m.ready)) return 'รอทุกคนกดพร้อม'
  return ''
})

/** Survivor slots (0–3) played by each player, for the seated player count (p.19). */
export function slotsOf(player: number, players = session.data?.players ?? 0): number[] {
  if (player === KILLER_PLAYER || players < 3) return []
  return handLayout(players as 3 | 4 | 5).flatMap((hand, slot) => (hand === player - 2 ? [slot] : []))
}

/** Players still to lock in their characters. */
export const pickWaiting = computed(() => {
  const d = session.data
  if (!d || d.phase !== 'pick') return []
  return Array.from({ length: d.players }, (_, i) => i + 1).filter((p) => !d.locked[String(p)])
})

export function savedName(): string {
  try {
    return localStorage.getItem(NAME) ?? ''
  } catch {
    return ''
  }
}

function remember(code: string | null, name?: string) {
  try {
    if (code) localStorage.setItem(LAST_ROOM, code)
    else localStorage.removeItem(LAST_ROOM)
    if (name) localStorage.setItem(NAME, name)
  } catch {
    // storage blocked: the player just retypes the code
  }
}

export function lastRoom(): string | null {
  try {
    return localStorage.getItem(LAST_ROOM)
  } catch {
    return null
  }
}

function enter(room: Room) {
  session.room = room
  unwatchConnection?.()
  session.connected = true
  unwatchConnection = room.onConnection?.((up) => (session.connected = up)) ?? null
  unsubscribe?.()
  unsubscribe = room.subscribe((data) => {
    session.data = data
    if (!data) return leaveRoom()
    // Mirror the room's game. A device without a seat watches (seat 0 may not act).
    online.value = data.game ? { room, seat: mySeat.value ?? 0, latest: () => toRaw(session.data)?.game ?? null } : null
    if (data.game) receive(data.game)
    else if (game.value && online.value === null) restoreLocal()
  })
}

async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
  session.busy = true
  session.error = ''
  try {
    return await fn()
  } catch (e) {
    session.error = e instanceof Error ? e.message : String(e)
    return undefined
  } finally {
    session.busy = false
  }
}

const update = (fn: (cur: RoomData) => RoomData | null) => guard(() => session.room!.updateRoom(fn))

/** Add this device to the room's members (keeping its side if it was here before). */
function join(name: string) {
  return session.room!.updateRoom((cur) => {
    const old = cur.members[session.me]
    return {
      ...cur,
      members: {
        ...cur.members,
        [session.me]: { name: name || old?.name || 'ผู้เล่น', side: old?.side ?? null, ready: old?.ready ?? false, joinedAt: old?.joinedAt ?? Date.now() },
      },
    }
  })
}

export function createRoom(name: string) {
  return guard(async () => {
    const code = newRoomCode()
    const room = await backend.create(code, session.me)
    remember(code, name)
    enter(room)
    await join(name)
    return code
  })
}

export function joinRoom(code: string, name: string) {
  return guard(async () => {
    const room = await backend.join(code.trim().toUpperCase())
    if (!room) throw new Error(`ไม่พบห้อง ${code.toUpperCase()}`)
    remember(room.code, name)
    enter(room)
    await join(name)
    return room.code
  })
}

export function leaveRoom() {
  const room = session.room
  // In the lobby, leaving frees the place; once seated, the member stays so they can come back.
  if (room && session.data?.phase === 'lobby' && !session.data.game)
    void room.updateRoom((cur) => {
      const members = { ...cur.members }
      delete members[session.me]
      return { ...cur, members }
    })
  unsubscribe?.()
  unsubscribe = null
  unwatchConnection?.()
  unwatchConnection = null
  session.connected = true
  room?.close()
  session.room = null
  session.data = null
  remember(null)
  restoreLocal()
}

// ---------- lobby ----------

export function setName(name: string) {
  remember(session.room?.code ?? null, name)
  return update((cur) => (cur.members[session.me] ? { ...cur, members: { ...cur.members, [session.me]: { ...cur.members[session.me], name } } } : null))
}

/** Pick a side (or none); taking a side clears "ready". The killer side holds one player. */
export function setSide(side: Side | null) {
  return update((cur) => {
    const mine = cur.members[session.me]
    if (!mine || cur.phase !== 'lobby') return null
    const others = Object.entries(cur.members).filter(([id]) => id !== session.me)
    if (side === 'killer' && others.some(([, m]) => m.side === 'killer')) return null
    if (side === 'survivor' && others.filter(([, m]) => m.side === 'survivor').length >= MAX_SURVIVOR_PLAYERS) return null
    return { ...cur, members: { ...cur.members, [session.me]: { ...mine, side, ready: false } } }
  })
}

export function setReady(ready: boolean) {
  return update((cur) => {
    const mine = cur.members[session.me]
    if (!mine || cur.phase !== 'lobby' || (ready && !mine.side)) return null
    return { ...cur, members: { ...cur.members, [session.me]: { ...mine, ready } } }
  })
}

/**
 * With 3 survivor players one of them plays two survivors (p.19): the member chosen in the lobby,
 * or the first survivor to join. Null with any other number of survivor players.
 */
export const doubleId = computed(() => {
  const d = session.data
  if (!d) return null
  const survivors = Object.entries(d.members)
    .filter(([, m]) => m.side === 'survivor')
    .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
  if (survivors.length !== 3) return null
  return survivors.some(([id]) => id === d.double) ? d.double! : survivors[0][0]
})

/**
 * Choose who plays two survivors: the host for anyone, a survivor player for themselves. Everyone
 * says "ready" again, so the change is seen.
 */
export function setDouble(id: string) {
  return update((cur) => {
    const target = cur.members[id]
    if (cur.phase !== 'lobby' || !target || target.side !== 'survivor') return null
    if (session.me !== cur.host && session.me !== id) return null
    const members = Object.fromEntries(Object.entries(cur.members).map(([k, m]) => [k, { ...m, ready: false }]))
    return { ...cur, double: id, members }
  })
}

/**
 * Host: seat everyone (killer = player 1, survivors in join order, the one playing two survivors
 * first as player 2) and go to character picks.
 */
export function proceedToPick() {
  if (!isHost.value || lobbyBlocker.value) return
  return update((cur) => {
    const ms = Object.entries(cur.members).sort((a, b) => a[1].joinedAt - b[1].joinedAt)
    const killer = ms.find(([, m]) => m.side === 'killer')
    const survivors = ms.filter(([, m]) => m.side === 'survivor')
    // player 2 plays the first hand, which holds two survivors when there are 3 survivor players
    const double = survivors.length === 3 ? survivors.findIndex(([id]) => id === cur.double) : -1
    if (double > 0) survivors.unshift(...survivors.splice(double, 1))
    if (!killer || survivors.length < MIN_SURVIVOR_PLAYERS || ms.some(([, m]) => !m.side || !m.ready)) return null
    const seats: RoomData['seats'] = { [KILLER_PLAYER]: { id: killer[0], name: killer[1].name } }
    survivors.forEach(([id, m], i) => (seats[String(i + 2)] = { id, name: m.name }))
    return { ...cur, phase: 'pick', seats, players: survivors.length + 1, picks: {}, locked: {} }
  })
}

// ---------- characters ----------

/**
 * Pick (or clear, with null) a character: 'killer' for the killer's seat, otherwise one of this
 * player's survivor slots. A survivor already taken by a teammate can't be picked.
 */
export function pickCharacter(slot: 'killer' | number, id: string | null) {
  return update((cur) => {
    const seat = Object.entries(cur.seats).find(([, v]) => v.id === session.me)?.[0]
    if (cur.phase !== 'pick' || !seat || cur.locked[seat]) return null
    const player = Number(seat)
    if (slot === 'killer' ? player !== KILLER_PLAYER : !slotsOf(player, cur.players).includes(slot)) return null
    const key = String(slot)
    if (id && slot !== 'killer' && Object.entries(cur.picks).some(([k, v]) => k !== 'killer' && k !== key && v === id)) return null
    const picks = { ...cur.picks }
    if (id) picks[key] = id
    else delete picks[key]
    return { ...cur, picks }
  })
}

/** Lock in (or reopen) this player's picks; locking needs every own slot filled. */
export function lockPicks(locked: boolean) {
  return update((cur) => {
    const seat = Object.entries(cur.seats).find(([, v]) => v.id === session.me)?.[0]
    if (cur.phase !== 'pick' || !seat) return null
    const player = Number(seat)
    const mine = player === KILLER_PLAYER ? ['killer'] : slotsOf(player, cur.players).map(String)
    if (locked && mine.some((k) => !cur.picks[k])) return null
    const next = { ...cur.locked }
    if (locked) next[seat] = true
    else delete next[seat]
    return { ...cur, locked: next }
  })
}

export const allLocked = computed(() => {
  const d = session.data
  return !!d && d.phase === 'pick' && pickWaiting.value.length === 0
})

/** The killer picks the board (any time before the game starts); everyone sees it. */
export function setBoard(id: string) {
  if (!boards[id]) return
  return update((cur) => {
    const seat = Object.entries(cur.seats).find(([, v]) => v.id === session.me)?.[0]
    return cur.phase === 'pick' && Number(seat) === KILLER_PLAYER ? { ...cur, board: id } : null
  })
}

/** The killer starts the game once everyone has locked in. The seed is drawn here, once. */
export function startOnlineGame() {
  const d = session.data
  if (!d || !allLocked.value || mySeat.value !== KILLER_PLAYER) return
  const survivors = [0, 1, 2, 3].map((i) => d.picks[String(i)])
  const killer = d.picks.killer
  if (!killer || survivors.some((s) => !s)) return
  return guard(() =>
    session.room!.startGame(
      createGame({
        board: d.board && boards[d.board] ? d.board : macmillan.id,
        survivors: survivors.map((id) => ({ id, name: survivorById.get(id)!.name })),
        killer: { id: killer, name: killerById.get(killer)!.name },
        players: d.players as 3 | 4 | 5,
        seed: (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0,
      }),
    ),
  )
}

/** Host: back to the lobby from the character picks. */
export function backToLobby() {
  if (!isHost.value) return
  return update((cur) => ({ ...cur, phase: 'lobby', seats: {}, players: 0, picks: {}, locked: {} }))
}

/** Host: end the game for everyone and go back to the lobby (sides kept, everyone un-ready). */
export function closeOnlineGame() {
  return guard(async () => {
    await session.room!.resetGame()
    await session.room!.updateRoom((cur) => ({
      ...cur,
      phase: 'lobby',
      seats: {},
      players: 0,
      picks: {},
      locked: {},
      members: Object.fromEntries(Object.entries(cur.members).map(([id, m]) => [id, { ...m, ready: false }])),
    }))
  })
}
