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
import { bloodwebHands, choicesFor, loadoutProblem, packLoadout, takenBy, unpackLoadout, type LoadoutCharacter } from '../engine/loadout'
import type { PerkId } from '../engine/perks'
import { game, online, receive, restoreLocal } from '../game'
import { firebaseBackend, firebaseConfigured } from './firebase'
import { localBackend } from './local'
import { settingsOf, playableKillers, playableSurvivors, type RoomSettings } from './settings'
import { clientId, newRoomCode, type Backend, type Room, type RoomData, type RoomListing, type Side } from './transport'

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
  /** A room that asked for its password (the code), for the board to ask the player. */
  needPassword: null as string | null,
  /** The room the host kicked this device out of (shown on the entry page until closed). */
  kicked: null as string | null,
})

let unsubscribe: (() => void) | null = null
let unwatchConnection: (() => void) | null = null

export const isHost = computed(() => !!session.data && session.data.host === session.me)
/** The room's settings, defaults filled in. */
export const roomSettings = computed(() => settingsOf(session.data?.settings))
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

/** This device's member entry is in the room (set once joining is done): its removal is a kick. */
let joined = false

/** Every device in a room keeps its listing fresh, so a room in use never looks abandoned. */
const HEARTBEAT_MS = 4 * 60 * 1000
let heartbeat: number | null = null
function stopHeartbeat() {
  if (heartbeat !== null) clearInterval(heartbeat)
  heartbeat = null
}

function enter(room: Room) {
  joined = false
  session.room = room
  stopHeartbeat()
  heartbeat = window.setInterval(() => void backend.touchRoom(room.code).catch(() => {}), HEARTBEAT_MS)
  unwatchConnection?.()
  session.connected = true
  unwatchConnection = room.onConnection?.((up) => (session.connected = up)) ?? null
  unsubscribe?.()
  unsubscribe = room.subscribe((data) => {
    session.data = data
    if (!data) return leaveRoom()
    // Taken out of the lobby by the host: back to the entry page, with a notice
    if (joined && data.phase === 'lobby' && !data.game && !data.members[session.me]) {
      const code = room.code
      leaveRoom()
      session.kicked = code
      return
    }
    if (data.host === session.me) publish(room.code, data)
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
    if (cur.kicked?.[session.me]) return null
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

/** A room's password, hashed with its code (the room holds the hash, never the password). */
export async function hashPassword(code: string, password: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`dbdl:${code}:${password}`))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Create a room: `roomName` names it on the board, `password` (optional) is asked of anyone
 * joining who isn't in it already.
 */
export function createRoom(name: string, roomName = '', password = '') {
  return guard(async () => {
    const code = newRoomCode()
    const room = await backend.create(code, session.me)
    const pw = password.trim()
    const hash = pw ? await hashPassword(code, pw) : ''
    remember(code, name)
    // in the room first: Firebase holds lobby writes until the room is being listened to
    enter(room)
    await room.updateRoom((cur) => ({ ...cur, name: roomName.trim() || randomRoomName(), ...(hash ? { passwordHash: hash } : {}) }))
    await join(name)
    joined = true
    return code
  })
}

export function joinRoom(code: string, name: string, password = '') {
  return guard(async () => {
    const room = await backend.join(code.trim().toUpperCase())
    if (!room) throw new Error(`ไม่พบห้อง ${code.toUpperCase()}`)
    // a password, unless this device is in the room already (coming back)
    const lock = await backend.lockOf(room.code, session.me)
    if (lock.kicked && !lock.member) {
      room.close()
      throw new Error('คุณถูกเตะออกจากห้องนี้ เข้าอีกไม่ได้')
    }
    if (lock.hash && !lock.member) {
      if (!password || (await hashPassword(room.code, password.trim())) !== lock.hash) {
        room.close()
        session.needPassword = room.code
        throw new Error(password ? 'รหัสผ่านไม่ถูกต้อง' : 'ห้องนี้ต้องใช้รหัสผ่าน')
      }
    }
    session.needPassword = null
    remember(room.code, name)
    enter(room)
    await join(name)
    joined = true
    return room.code
  })
}

export function leaveRoom() {
  joined = false
  stopHeartbeat()
  const room = session.room
  const d = session.data
  // the last one out of a lobby closes the room: its data goes with it, not left on the server
  const lastOut = !!room && !!d && d.phase === 'lobby' && !d.game && Object.keys(d.members).every((id) => id === session.me)
  // In the lobby, leaving frees the place; once seated, the member stays so they can come back.
  if (room && !lastOut && d?.phase === 'lobby' && !d.game)
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
  // after the listeners are off: they would see the room vanish and call this again
  if (room && lastOut) void backend.deleteRoom(room.code).catch(() => {})
  session.room = null
  session.data = null
  remember(null)
  restoreLocal()
}

// ---------- the room board ----------

let published = ''
/** The host's device keeps the room's listing current (only when something on it changed). */
function publish(code: string, d: RoomData) {
  const listing: Omit<RoomListing, 'updatedAt'> = {
    code,
    name: d.name || `ห้อง ${code}`,
    host: d.members[d.host]?.name ?? '',
    members: Object.keys(d.members).length,
    phase: d.game ? 'game' : d.phase,
    locked: !!d.passwordHash,
  }
  const key = JSON.stringify(listing)
  if (key === published) return
  published = key
  void backend.publishRoom({ ...listing, updatedAt: Date.now() }).catch(() => {
    // the board is a convenience: a room still works by its code
  })
}

/** A listing nobody has touched for this long (a few heartbeats) is a room with nobody in it: off the board. */
export const BOARD_STALE_MS = 15 * 60 * 1000
/** …and for this long, the room is abandoned: whoever opens the board deletes it from the server. */
export const ROOM_TTL_MS = 72 * 60 * 60 * 1000

const reaped = new Set<string>()
/** Delete the rooms of the board that nobody has used for `ROOM_TTL_MS` (each tried once per page). */
export function sweepRooms(list: RoomListing[]) {
  const cutoff = Date.now() - ROOM_TTL_MS
  for (const r of list) {
    if (!r?.code || r.updatedAt >= cutoff || reaped.has(r.code)) continue
    reaped.add(r.code)
    void backend.reapRoom(r.code, cutoff).catch(() => {})
  }
}

const NAME_START = ['คืนหลอนที่', 'หนีตายจาก', 'ปาร์ตี้ที่', 'ล่าท้าผีที่', 'เอาตัวรอดใน', 'หมอกดำเหนือ', 'เสียงกรีดร้องจาก', 'ทริปสยองที่']
const NAME_END = ['MacMillan', 'Autohaven', 'Coldwind', 'Crotus Prenn', 'Haddonfield', 'Ormond', 'Red Forest', 'Backwater', 'Yamaoka', 'Silent Hill', 'Grave of Glenvale']
/** A room name to start from (the creator may type their own). */
export function randomRoomName(): string {
  const pick = <T>(l: T[]) => l[Math.floor(Math.random() * l.length)]
  return `${pick(NAME_START)} ${pick(NAME_END)}`
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
/** Host, in the lobby: take a player out of the room, and keep them out. */
export function kickMember(id: string) {
  return update((cur) => {
    if (session.me !== cur.host || id === cur.host || cur.phase !== 'lobby' || cur.game || !cur.members[id]) return null
    const members = { ...cur.members }
    delete members[id]
    // everyone un-readies: the table changed under them
    const readied = Object.fromEntries(Object.entries(members).map(([k, m]) => [k, { ...m, ready: false }]))
    return { ...cur, members: readied, kicked: { ...(cur.kicked ?? {}), [id]: Date.now() }, ...(cur.double === id ? { double: undefined } : {}) }
  })
}

export function setDouble(id: string) {
  return update((cur) => {
    const target = cur.members[id]
    if (cur.phase !== 'lobby' || !target || target.side !== 'survivor') return null
    if (session.me !== cur.host && session.me !== id) return null
    const members = Object.fromEntries(Object.entries(cur.members).map(([k, m]) => [k, { ...m, ready: false }]))
    return { ...cur, double: id, members }
  })
}

/** Host: change the room's settings (lobby only). Everyone says "ready" again, so the change is seen. */
export function setSettings(patch: Partial<RoomSettings>) {
  return update((cur) => {
    if (session.me !== cur.host || cur.phase !== 'lobby') return null
    // everyone stays ready (the host often sets several in a row); the settings card tells the
    // others what changed instead
    return { ...cur, settings: { ...settingsOf(cur.settings), ...patch } }
  })
}

const draw = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)]

/** Every character drawn (random characters): none banned; teammates differ unless repeats are allowed. */
function drawPicks(s: RoomSettings, banned: string[]): Record<string, string> {
  const picks: Record<string, string> = {}
  const free = (list: { id: string }[]) => list.map((c) => c.id).filter((id) => !banned.includes(id))
  const pool = free(playableSurvivors())
  for (const slot of [0, 1, 2, 3]) {
    const left = s.dupes ? pool : pool.filter((id) => !Object.values(picks).includes(id))
    if (left.length) picks[String(slot)] = draw(left)
  }
  const ks = free(playableKillers())
  if (ks.length) picks.killer = draw(ks)
  return picks
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
    const s = settingsOf(cur.settings)
    // drawn at once, so everyone sees the result while confirming: the board, and with random
    // characters every pick (none banned; teammates differ unless repeats are allowed)
    const board = s.map === 'random' ? draw(Object.keys(boards)) : undefined
    // with a Banlist the characters are drawn once the bans are in (lockBans)
    const picks = s.random && !s.banlist ? drawPicks(s, []) : {}
    const perkSeed = Math.floor(Math.random() * 0x7fffffff) + 1
    const next: RoomData = {
      ...cur,
      phase: 'pick',
      seats,
      players: survivors.length + 1,
      picks,
      locked: {},
      loadouts: {},
      perksDone: {},
      perkSeed,
      boardSet: !!board,
      banPicks: { killer: '', survivors: '' },
      bansLocked: {},
    }
    // the map is picked in its own stage, after the characters (and perks): none until then
    if (board) next.board = board
    else delete next.board
    return next
  })
}

// ---------- bans (Banlist) ----------

const listOf = (s: string | undefined) => (s ? s.split(',').filter(Boolean) : [])
/** Every character banned, both sides' lists together. */
export const bannedOf = (d: RoomData | null): string[] => (d ? [...listOf(d.banPicks?.killer), ...listOf(d.banPicks?.survivors)] : [])
const bansDoneOf = (d: RoomData) => Array.from({ length: d.players }, (_, i) => String(i + 1)).every((p) => d.bansLocked?.[p])
const seatOf = (d: RoomData) => Object.entries(d.seats).find(([, v]) => v.id === session.me)?.[0]

/** The bans are final (everyone confirmed), or the room has none. */
export const bansDone = computed(() => !!session.data && (!roomSettings.value.banlist || bansDoneOf(session.data)))
/** What is banned, once it is public: after both sides have confirmed. */
export const revealedBans = computed(() => (bansDone.value ? bannedOf(session.data) : []))
/** This player's side's list: the killers the survivors ban, or the survivors the killer bans. */
export const myBans = computed(() => {
  const d = session.data
  const seat = d && seatOf(d)
  return d && seat ? listOf(d.banPicks?.[Number(seat) === KILLER_PLAYER ? 'killer' : 'survivors']) : []
})

/**
 * Ban (or take back) a character of the other side, for this player's side. The survivors share
 * one list: when it changes every survivor confirms it again.
 */
export function toggleBan(id: string) {
  return update((cur) => {
    const s = settingsOf(cur.settings)
    const seat = seatOf(cur)
    if (cur.phase !== 'pick' || !s.banlist || !seat || bansDoneOf(cur) || cur.bansLocked?.[seat]) return null
    const key = Number(seat) === KILLER_PLAYER ? 'killer' : 'survivors'
    const pool = (key === 'killer' ? playableSurvivors() : playableKillers()).map((c) => c.id)
    if (!pool.includes(id)) return null
    const list = listOf(cur.banPicks?.[key])
    const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
    // a ban that would leave too few to play is refused: 4 survivors (1 with repeats), 1 killer
    if (next.length > s.banCount || pool.length - next.length < (key === 'killer' ? (s.dupes ? 1 : 4) : 1)) return null
    const bansLocked = { ...(cur.bansLocked ?? {}) }
    if (key === 'survivors') for (const p of Object.keys(cur.seats)) if (Number(p) !== KILLER_PLAYER) delete bansLocked[p]
    return { ...cur, banPicks: { killer: '', survivors: '', ...cur.banPicks, [key]: next.join(',') }, bansLocked }
  })
}

/** Confirm (or reopen) this player's side's bans. With the last confirmation random characters are drawn. */
export function lockBans(on: boolean) {
  return update((cur) => {
    const s = settingsOf(cur.settings)
    const seat = seatOf(cur)
    if (cur.phase !== 'pick' || !s.banlist || !seat || bansDoneOf(cur)) return null
    const bansLocked = { ...(cur.bansLocked ?? {}) }
    if (on) bansLocked[seat] = true
    else delete bansLocked[seat]
    const next: RoomData = { ...cur, bansLocked }
    if (on && s.random && bansDoneOf(next)) next.picks = drawPicks(s, bannedOf(next))
    return next
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
    const s = settingsOf(cur.settings)
    // the bans come first; drawn characters stay; banned ones can't be picked
    if ((s.banlist && !bansDoneOf(cur)) || s.random || (id && bannedOf(cur).includes(id))) return null
    const player = Number(seat)
    if (slot === 'killer' ? player !== KILLER_PLAYER : !slotsOf(player, cur.players).includes(slot)) return null
    const key = String(slot)
    if (id && slot !== 'killer' && !s.dupes && Object.entries(cur.picks).some(([k, v]) => k !== 'killer' && k !== key && v === id)) return null
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
    if (cur.phase !== 'pick' || !seat || (settingsOf(cur.settings).banlist && !bansDoneOf(cur))) return null
    // once everyone has confirmed the characters the stage is over: there is no way back to it
    if (!locked && everyoneLocked(cur)) return null
    const player = Number(seat)
    const mine = player === KILLER_PLAYER ? ['killer'] : slotsOf(player, cur.players).map(String)
    if (locked && mine.some((k) => !cur.picks[k])) return null
    const next = { ...cur.locked }
    if (locked) next[seat] = true
    else delete next[seat]
    // a character may change: the perks (Bloodweb's cards, who plays what) are set again
    return locked ? { ...cur, locked: next } : { ...cur, locked: next, loadouts: {}, perksDone: {} }
  })
}

export const allLocked = computed(() => {
  const d = session.data
  return !!d && d.phase === 'pick' && pickWaiting.value.length === 0
})

// ---------- perks (Bloodweb, Devout — p.19) ----------

/** The characters of a room, for their loadouts: survivor slots in order, then the killer. */
function charsOf(d: RoomData): LoadoutCharacter[] {
  const out: LoadoutCharacter[] = [0, 1, 2, 3].flatMap((i) => (d.picks[String(i)] ? [{ key: String(i), side: 'survivor' as const, id: d.picks[String(i)] }] : []))
  return d.picks.killer ? [...out, { key: 'killer', side: 'killer', id: d.picks.killer }] : out
}

function loadoutsOf(d: RoomData): Record<string, PerkId[] | undefined> {
  return Object.fromEntries(Object.entries(d.loadouts ?? {}).map(([k, v]) => [k, unpackLoadout(v)]))
}

/** The loadout keys of a seat: the killer's, or the survivor slots that player plays. */
function keysOf(d: RoomData, seat: string): string[] {
  const player = Number(seat)
  return player === KILLER_PLAYER ? ['killer'] : slotsOf(player, d.players).map(String)
}

const everyoneLocked = (d: RoomData) => Array.from({ length: d.players }, (_, i) => String(i + 1)).every((p) => d.locked[p])

/** Perks are set once every character is locked in: Bloodweb deals from all of them at once. */
export const perkStage = computed(() => roomSettings.value.mode !== 'adept' && allLocked.value)
export const perkChars = computed(() => (session.data ? charsOf(session.data) : []))
export const roomLoadouts = computed(() => (session.data ? loadoutsOf(session.data) : {}))
export const perkHands = computed(() => {
  const d = session.data
  return d && roomSettings.value.mode === 'bloodweb' && perkStage.value ? bloodwebHands(d.perkSeed ?? 1, perkChars.value) : {}
})
/** This device's loadout keys. */
export const myPerkKeys = computed(() => {
  const d = session.data
  const seat = mySeat.value
  return d && seat ? keysOf(d, String(seat)) : []
})
/** Characters whose perks aren't confirmed yet. */
export const perksWaiting = computed(() => (perkStage.value ? perkChars.value.filter((c) => !session.data?.perksDone?.[c.key]) : []))
/** Everyone is in: characters locked and, in Bloodweb or Devout, every loadout confirmed. */
export const allReady = computed(() => allLocked.value && (roomSettings.value.mode === 'adept' || perksWaiting.value.length === 0))

/** Why this loadout can't be confirmed ('' when it can): the room's rules, as of now. */
export function perkProblem(key: string, perks: PerkId[]): string {
  const d = session.data
  const c = perkChars.value.find((x) => x.key === key)
  if (!d || !c) return ''
  return loadoutProblem(roomSettings.value.mode, c, perks, perkHands.value[key], takenBy(perkChars.value, roomLoadouts.value, key))
}

/**
 * Set one of this player's loadouts (it shows at once as taken for the others: one card each).
 * Checked against the room as it is when written, so two players can't take the same perk.
 */
export function setLoadout(key: string, perks: PerkId[]) {
  return update((cur) => {
    const seat = Object.entries(cur.seats).find(([, v]) => v.id === session.me)?.[0]
    const s = settingsOf(cur.settings)
    if (cur.phase !== 'pick' || !seat || s.mode === 'adept' || !everyoneLocked(cur)) return null
    if (!keysOf(cur, seat).includes(key) || cur.perksDone?.[key]) return null
    const chars = charsOf(cur)
    const c = chars.find((x) => x.key === key)
    if (!c) return null
    // the rules of engine/loadout.ts, against the room as it is now (a card taken meanwhile fails)
    const hand = s.mode === 'bloodweb' ? bloodwebHands(cur.perkSeed ?? 1, chars)[key] : undefined
    if (loadoutProblem(s.mode, c, perks, hand, takenBy(chars, loadoutsOf(cur), key))) return null
    return { ...cur, loadouts: { ...(cur.loadouts ?? {}), [key]: packLoadout(perks) } }
  })
}

/** Confirm (or reopen) one of this player's loadouts; confirming needs it to be playable. */
export function confirmPerks(key: string, on: boolean) {
  return update((cur) => {
    const seat = Object.entries(cur.seats).find(([, v]) => v.id === session.me)?.[0]
    const s = settingsOf(cur.settings)
    if (cur.phase !== 'pick' || !seat || s.mode === 'adept' || !everyoneLocked(cur) || !keysOf(cur, seat).includes(key)) return null
    const done = { ...(cur.perksDone ?? {}) }
    if (on) {
      const chars = charsOf(cur)
      const c = chars.find((x) => x.key === key)
      const mine = loadoutsOf(cur)[key]
      if (!c) return null
      const hand = s.mode === 'bloodweb' ? bloodwebHands(cur.perkSeed ?? 1, chars)[key] : undefined
      if (loadoutProblem(s.mode, c, mine ?? choicesFor('adept', c, undefined), hand, takenBy(chars, loadoutsOf(cur), key))) return null
      done[key] = true
    } else delete done[key]
    return { ...cur, perksDone: done }
  })
}

/** Which stage of the picks the room is in: characters, then perks (Bloodweb, Devout), then the map. */
export type PickStage = 'bans' | 'chars' | 'perks' | 'map'
export const pickStage = computed<PickStage>(() =>
  !bansDone.value ? 'bans' : !allLocked.value ? 'chars' : perksWaiting.value.length ? 'perks' : 'map',
)
/** The map is settled: drawn at the start of the picks, or picked by whoever the room lets. */
export const mapDone = computed(() => !!session.data?.boardSet)
/** Everything is in: the killer may start. */
export const startable = computed(() => allReady.value && mapDone.value)

/** Who picks the board under the room's settings: the killer's seat, the host, or nobody (drawn). */
export const mayPickBoard = computed(() => {
  const d = session.data
  if (!d || d.phase !== 'pick') return false
  const how = roomSettings.value.map
  return how === 'killer' || how === 'secret' ? mySeat.value === KILLER_PLAYER : how === 'host' ? isHost.value : false
})

/** The board is picked (any time before the game starts); everyone sees it. */
export function setBoard(id: string) {
  if (!boards[id]) return
  return update((cur) => {
    const seat = Object.entries(cur.seats).find(([, v]) => v.id === session.me)?.[0]
    const how = settingsOf(cur.settings).map
    const may = how === 'killer' || how === 'secret' ? Number(seat) === KILLER_PLAYER : how === 'host' && session.me === cur.host
    return cur.phase === 'pick' && may ? { ...cur, board: id, boardSet: true } : null
  })
}

/** The killer starts the game once everyone has locked in. The seed is drawn here, once. */
export function startOnlineGame() {
  const d = session.data
  if (!d || !startable.value || mySeat.value !== KILLER_PLAYER) return
  const perks = roomSettings.value.mode === 'adept' ? {} : loadoutsOf(d)
  const survivors = [0, 1, 2, 3].map((i) => d.picks[String(i)])
  const killer = d.picks.killer
  if (!killer || survivors.some((s) => !s)) return
  return guard(() =>
    session.room!.startGame(
      createGame({
        board: d.board && boards[d.board] ? d.board : macmillan.id,
        // the same survivor twice (repeats allowed): the second is told apart by a number
        survivors: survivors.map((id, i) => {
          const name = survivorById.get(id)!.name
          const n = survivors.slice(0, i).filter((x) => x === id).length
          return { id, name: n ? `${name} ${n + 1}` : name, perks: perks[String(i)] }
        }),
        killer: { id: killer, name: killerById.get(killer)!.name, perks: perks.killer },
        players: d.players as 3 | 4 | 5,
        startBp: { survivor: roomSettings.value.survivorBp, killer: roomSettings.value.killerBp },
        seed: (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0,
      }),
    ),
  )
}

/** Host: back to the lobby from the character picks. */
export function backToLobby() {
  if (!isHost.value) return
  return update((cur) => ({ ...cur, phase: 'lobby', seats: {}, players: 0, picks: {}, locked: {}, loadouts: {}, perksDone: {}, boardSet: false, banPicks: { killer: '', survivors: '' }, bansLocked: {} }))
}

/** Seated players still on the game's summary (not back in the lobby yet). */
export const stillInGame = computed(() => {
  const d = session.data
  if (!d?.game) return []
  return Object.values(d.seats).filter((s) => !d.members[s.id]?.back)
})

/**
 * The game is over: this player goes back to the lobby (or, `back` false, to the summary again).
 * The room resets once every seated player has gone back; until then they wait in the lobby.
 */
export async function returnToLobby(back = true) {
  await update((cur) => {
    const mine = cur.members[session.me]
    if (!mine || !cur.game || cur.game.phase !== 'over') return null
    const { back: _was, ...rest } = mine
    void _was
    return { ...cur, members: { ...cur.members, [session.me]: back ? { ...rest, back: true } : rest } }
  })
  if (back && stillInGame.value.length === 0) await closeOnlineGame()
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
      loadouts: {},
      perksDone: {},
      // everyone un-ready, and no one left waiting (the database takes no undefined: `back` is dropped)
      members: Object.fromEntries(Object.entries(cur.members).map(([id, { back, ...m }]) => (void back, [id, { ...m, ready: false }]))),
    }))
  })
}
