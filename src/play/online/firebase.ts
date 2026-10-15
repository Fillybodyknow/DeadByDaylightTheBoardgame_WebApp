// Firebase Realtime Database backend.
//
// Layout:  rooms/<code>/lobby  { host, createdAt, phase, members, seats, players, picks, locked }
//          rooms/<code>/game   { rev, json }
//          rooms/<code>/log    { r1: json, r2: json, … }  log of finished rounds (see logArchive.ts)
// The game is stored as a JSON string: the database drops null values and turns some arrays
// into objects, and the engine state relies on both. Lobby and game are separate nodes so
// seat changes and game moves never fight over one transaction. The game written on each move
// leaves out the log of rounds already archived, so a write stays small however long the game.
//
// Config comes from Vite env vars (`.env.local`, never committed):
//   VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_DATABASE_URL,
//   VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID

import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getDatabase, onValue, ref, runTransaction, set, update, type Database } from 'firebase/database'
import type { GameState, LogEntry } from '../engine/types'
import { archivedRounds, roundKey, roundsToArchive, trimLog, withFullLog } from './logArchive'
import type { Backend, Room, RoomData } from './transport'
import { emptyRoom, normalizeRoom } from './transport'

const env = import.meta.env

export const firebaseConfigured = Boolean(env.VITE_FIREBASE_DATABASE_URL)

let db: Database | null = null
function database(): Database {
  if (!db) {
    const app: FirebaseApp = initializeApp({
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      databaseURL: env.VITE_FIREBASE_DATABASE_URL,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    })
    db = getDatabase(app)
  }
  return db
}

type Lobby = Omit<RoomData, 'game' | 'rev'>

/** The lobby node: everything in the room but the game. */
function lobbyOf(r: RoomData): Lobby {
  return { host: r.host, createdAt: r.createdAt, phase: r.phase, members: r.members, seats: r.seats, players: r.players, picks: r.picks, locked: r.locked }
}
interface GameNode {
  rev: number
  json: string
}

type RawRoom = { lobby?: Partial<Lobby>; game?: GameNode; log?: Record<string, string> } | null

/** Parsed archives, by their text (an archive never changes once written). */
const parsedArchives = new Map<string, LogEntry[]>()
function parseArchive(text: string): LogEntry[] {
  let entries = parsedArchives.get(text)
  if (!entries) parsedArchives.set(text, (entries = JSON.parse(text) as LogEntry[]))
  return entries
}

/** The written game, without the archived rounds' log. */
function coreOf(raw: RawRoom): GameState | null {
  return raw?.game?.json ? (JSON.parse(raw.game.json) as GameState) : null
}

function toRoom(raw: RawRoom): RoomData | null {
  if (!raw?.lobby) return null
  const core = coreOf(raw)
  return normalizeRoom({
    ...raw.lobby,
    host: raw.lobby.host ?? '',
    game: core ? withFullLog(core, raw.log, parseArchive) : null,
    rev: raw.game?.rev ?? 0,
  })
}
class FirebaseRoom implements Room {
  private unsubs: (() => void)[] = []
  /** Last known room, so transactions can be answered when the local cache is still empty. */
  private last: RoomData | null = null
  /** Resolves on the first snapshot: lobby writes wait for it (see updateRoom). */
  private loaded: Promise<void>
  private markLoaded!: () => void
  /** Rounds archived in the room, from the last snapshot. */
  private archived = new Set<number>()
  /** Archives being written by this device. */
  private archiving = new Set<number>()
  private archiveTimer: number | null = null
  /** Set when archives can't be written (database rules without the log node): stop trying. */
  private archiveDenied = false

  readonly code: string

  constructor(code: string) {
    this.code = code
    this.loaded = new Promise((r) => (this.markLoaded = r))
  }

  private path(p = '') {
    return ref(database(), `rooms/${this.code}${p}`)
  }

  subscribe(cb: (d: RoomData | null) => void) {
    const off = onValue(this.path(), (snap) => {
      const raw = snap.val() as RawRoom
      this.archived = archivedRounds(raw?.log)
      this.last = toRoom(raw)
      this.markLoaded()
      cb(this.last)
      // The writer archives finished rounds right after its move; if that got lost (it closed
      // the page, say), whoever is still here does it a moment later from the same state.
      const core = coreOf(raw)
      if (core && roundsToArchive(core, this.archived).size) this.scheduleArchive(core, 1500)
    })
    this.unsubs.push(off)
    return off
  }

  async updateGame(fn: (cur: GameState | null) => GameState | null): Promise<boolean> {
    let aborted = false
    let written: GameState | null = null
    const res = await runTransaction(this.path('/game'), (cur: GameNode | null) => {
      // A null first call can just mean "not cached yet": answering it is safe, because the
      // write only commits if the server really holds null; otherwise it runs again with data.
      const game = cur?.json ? (JSON.parse(cur.json) as GameState) : null
      const next = fn(game)
      if (!next) {
        aborted = true
        return undefined
      }
      aborted = false
      written = trimLog(next, this.archived)
      return { rev: (cur?.rev ?? 0) + 1, json: JSON.stringify(written) }
    })
    const ok = res.committed && !aborted
    if (ok && written) this.scheduleArchive(written, 0)
    return ok
  }

  /** Write the archive of every finished round the room lacks, from a state holding them whole. */
  private scheduleArchive(st: GameState, delay: number) {
    if (this.archiveDenied) return
    if (this.archiveTimer !== null) clearTimeout(this.archiveTimer)
    this.archiveTimer = window.setTimeout(() => {
      this.archiveTimer = null
      for (const [round, entries] of roundsToArchive(st, this.archived)) {
        if (this.archiving.has(round)) continue
        this.archiving.add(round)
        set(this.path(`/log/${roundKey(round)}`), JSON.stringify(entries))
          .catch((e) => {
            // Rules from before the log node: keep writing the whole game, as before.
            this.archiveDenied = true
            console.warn('online: cannot archive the log (update database.rules.json):', e)
          })
          .finally(() => this.archiving.delete(round))
      }
    }, delay)
  }

  onConnection(cb: (up: boolean) => void) {
    const off = onValue(ref(database(), '.info/connected'), (snap) => cb(snap.val() === true))
    this.unsubs.push(off)
    return off
  }
  async resetGame() {
    await update(this.path(), { game: null, log: null })
  }

  async updateRoom(fn: (cur: RoomData) => RoomData | null): Promise<boolean> {
    // Answering a cold-cache null with null would be applied locally first, and every listener
    // would briefly see a room without a lobby (= deleted). So wait for the room to be loaded,
    // and answer a null from the last known lobby; the server re-runs it if that was stale.
    await this.loaded
    const res = await runTransaction(this.path('/lobby'), (cur: Partial<Lobby> | null) => {
      const base = cur ?? (this.last ? lobbyOf(this.last) : null)
      if (!base) return undefined // the room is gone
      const room = toRoom({ lobby: base, game: undefined })!
      const next = fn({ ...room, game: this.last?.game ?? null, rev: this.last?.rev ?? 0 })
      if (!next) return undefined
      return lobbyOf(next)
    })
    return res.committed
  }

  close() {
    if (this.archiveTimer !== null) clearTimeout(this.archiveTimer)
    this.unsubs.forEach((u) => u())
    this.unsubs = []
  }
}

export const firebaseBackend: Backend = {
  name: 'firebase',
  async create(code, host) {
    const room = emptyRoom(host)
    await set(ref(database(), `rooms/${code}/lobby`), lobbyOf(room))
    return new FirebaseRoom(code)
  },
  async join(code) {
    const room = new FirebaseRoom(code)
    const exists = await new Promise<boolean>((resolve) => {
      const off = onValue(ref(database(), `rooms/${code}/lobby`), (snap) => {
        off()
        resolve(snap.exists())
      })
    })
    return exists ? room : null
  },
}
