// The history of online games, kept on this device (IndexedDB, nothing on the server): when an
// online game ends, its record is saved — who played what, the result, the stats, the headline
// events and the whole log — for the history page (HistoryView). The latest KEEP games stay.
//
// The log is kept as this device saw it: a line naming the item another survivor got (a chest, a
// draw, Plunderer's Instinct) has the item left out, as it was secret (`itemHidden`, a house rule).

import { watch } from 'vue'
import { KILLER_PLAYER } from './engine/seats'
import type { GameState, LogEntry } from './engine/types'
import { game, online, tutorial } from './game'
import { gameKey } from './intro'
import { roomSettings, session } from './online/session'
import { gameStats, timeline, type TimelineItem } from './stats'

/** How many games this device keeps (the oldest goes first). */
export const KEEP = 50

export interface HistoryPlayer {
  /** The character's id (its mini, from the data). */
  id: string
  name: string
  /** The player's name in the room, and their seat (player number). */
  player: string
  seat: number
}

export interface HistoryHead {
  id: string
  /** When it ended (ms). */
  at: number
  room: string
  roomName: string
  board: string
  mode: string
  rounds: number
  winner: 'survivors' | 'killer'
  sacrifice: number
  /** This device's seat (0: watching) and side. */
  seat: number
  side: 'killer' | 'survivor' | 'spectator'
  killer: HistoryPlayer
  survivors: HistoryPlayer[]
}

export interface HistoryGame {
  head: HistoryHead
  stats: ReturnType<typeof gameStats>
  timeline: TimelineItem[]
  log: LogEntry[]
}

// ---------- the log as this device may see it ----------

/** Lines naming an item another survivor got, with the item left out. */
export function maskLog(st: GameState, seat: number): LogEntry[] {
  const hidden = (s: number) => !seat || seat === KILLER_PLAYER || st.handPlayers[st.survivors[s].hand] !== seat
  return st.log
    .filter((e) => e.text)
    .map((e) => {
      const s = e.ev?.k === 'itemGot' ? e.ev.s : typeof e.who === 'number' ? e.who : null
      if (s === null || !hidden(s)) return e
      const name = st.survivors[s].name
      if (e.ev?.k === 'itemGot') return { ...e, text: `${name} ได้ item 1 ใบ` }
      const drew = e.text.match(/ จั่ว (\d+) ใบ: .* — เลือกเก็บ 1 ใบ$/)
      if (drew) return { ...e, text: `${name} จั่ว item ${drew[1]} ใบ — เลือกเก็บ 1 ใบ` }
      if (e.text.endsWith('(สัญชาตญาณขโมย)') && e.text.includes(' เลือก ')) return { ...e, text: `${name} เลือกเก็บ item 1 ใบ (สัญชาตญาณขโมย)` }
      return e
    })
}

// ---------- IndexedDB: the heads (for the list) apart from the games (heads with their logs) ----------

const DB = 'dbdl-history'
let dbp: Promise<IDBDatabase> | null = null
function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('heads', { keyPath: 'id' })
      req.result.createObjectStore('games', { keyPath: 'head.id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

/** Every game's head, newest first. */
export async function listHistory(): Promise<HistoryHead[]> {
  const db = await open()
  const heads = await new Promise<HistoryHead[]>((resolve, reject) => {
    const req = db.transaction('heads').objectStore('heads').getAll()
    req.onsuccess = () => resolve(req.result as HistoryHead[])
    req.onerror = () => reject(req.error)
  })
  return heads.sort((a, b) => b.at - a.at)
}

export async function getHistory(id: string): Promise<HistoryGame | null> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = db.transaction('games').objectStore('games').get(id)
    req.onsuccess = () => resolve((req.result as HistoryGame | undefined) ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function deleteHistory(id: string) {
  const db = await open()
  const tx = db.transaction(['heads', 'games'], 'readwrite')
  tx.objectStore('heads').delete(id)
  tx.objectStore('games').delete(id)
  await done(tx)
}

export async function clearHistory() {
  const db = await open()
  const tx = db.transaction(['heads', 'games'], 'readwrite')
  tx.objectStore('heads').clear()
  tx.objectStore('games').clear()
  await done(tx)
}

/** Save a game (again: the same id replaces it), then drop the oldest past KEEP. */
export async function saveHistory(g: HistoryGame) {
  const db = await open()
  // a plain copy: the state's arrays may be Vue proxies, which IndexedDB can't store
  const copy = JSON.parse(JSON.stringify(g)) as HistoryGame
  const tx = db.transaction(['heads', 'games'], 'readwrite')
  tx.objectStore('heads').put(copy.head)
  tx.objectStore('games').put(copy)
  await done(tx)
  const heads = await listHistory()
  for (const h of heads.slice(KEEP)) await deleteHistory(h.id)
}

// ---------- the record of a game that just ended ----------

function record(st: GameState, seat: number): HistoryGame {
  const d = session.data
  const playerName = (n: number) => d?.seats?.[String(n)]?.name ?? `ผู้เล่น ${n}`
  const side = !seat ? 'spectator' : seat === KILLER_PLAYER ? 'killer' : 'survivor'
  const winner = st.step.t === 'gameOver' ? st.step.winner : st.sacrifice >= 8 ? 'killer' : 'survivors'
  const head: HistoryHead = {
    id: `${session.room?.code ?? 'room'}:${gameKey(st)}`,
    at: Date.now(),
    room: session.room?.code ?? '',
    roomName: d?.name ?? '',
    board: st.board,
    mode: roomSettings.value.mode,
    rounds: st.round,
    winner,
    sacrifice: st.sacrifice,
    seat,
    side,
    killer: { id: st.killer.characterId, name: st.killer.name, player: playerName(KILLER_PLAYER), seat: KILLER_PLAYER },
    survivors: st.survivors.map((sv) => {
      const n = st.handPlayers[sv.hand]
      return { id: sv.characterId, name: sv.name, player: playerName(n), seat: n }
    }),
  }
  return { head, stats: gameStats(st), timeline: timeline(st), log: maskLog(st, seat) }
}

/** Ids saved this visit: a game is saved once, when it ends. */
const saved = new Set<string>()

watch(
  () => game.value,
  (st) => {
    const o = online.value
    if (!st || !o || tutorial.value || st.phase !== 'over') return
    const g = record(st, o.seat)
    if (saved.has(g.head.id)) return
    saved.add(g.head.id)
    saveHistory(g).catch((e) => console.warn('history: the game was not saved', e))
  },
)
