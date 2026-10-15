// Firebase Realtime Database backend.
//
// Layout:  rooms/<code>/lobby  { host, createdAt, phase, members, seats, players, picks, locked }
//          rooms/<code>/game   { rev, json }
// The game is stored as a JSON string: the database drops null values and turns some arrays
// into objects, and the engine state relies on both. Lobby and game are separate nodes so
// seat changes and game moves never fight over one transaction.
//
// Config comes from Vite env vars (`.env.local`, never committed):
//   VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_DATABASE_URL,
//   VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID

import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getDatabase, onValue, ref, runTransaction, set, type Database } from 'firebase/database'
import type { GameState } from '../engine/types'
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

function toRoom(raw: { lobby?: Partial<Lobby>; game?: GameNode } | null): RoomData | null {
  if (!raw?.lobby) return null
  return normalizeRoom({
    ...raw.lobby,
    host: raw.lobby.host ?? '',
    game: raw.game?.json ? (JSON.parse(raw.game.json) as GameState) : null,
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
      this.last = toRoom(snap.val())
      this.markLoaded()
      cb(this.last)
    })
    this.unsubs.push(off)
    return off
  }

  async updateGame(fn: (cur: GameState | null) => GameState | null): Promise<boolean> {
    let aborted = false
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
      return { rev: (cur?.rev ?? 0) + 1, json: JSON.stringify(next) }
    })
    return res.committed && !aborted
  }

  async resetGame() {
    await set(this.path('/game'), null)
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
