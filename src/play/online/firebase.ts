// Firebase Realtime Database backend.
//
// Layout:  rooms/<code>/lobby  { host, createdAt, phase, members, seats, players, picks, locked, double?, board? }
//          rooms/<code>/game   { rev, json }               checkpoint: the state after `rev` moves
//          rooms/<code>/moves  { m000001: json, … }        one action each, played in key order
//          rooms/<code>/log    { r1: json, r2: json, … }  log of finished rounds (see logArchive.ts)
//
// A move is written to its own numbered slot, and every device replays the moves on top of the
// checkpoint to get the same game (see transport.ts). That keeps a move at a few hundred bytes
// instead of the whole state. Every CHECKPOINT_EVERY moves the player who made the move writes a
// new checkpoint and clears the moves it covers, so joining late stays cheap too.
//
// Game states and actions are stored as JSON strings: the database drops null values and turns
// some arrays into objects, and both rely on neither happening. Lobby and game are separate nodes
// so seat changes and game moves never fight over one transaction. A checkpoint leaves out the
// log of rounds already archived, so it stays small however long the game.
//
// Config comes from Vite env vars (`.env.local`, never committed):
//   VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_DATABASE_URL,
//   VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID

import { initializeApp, type FirebaseApp } from 'firebase/app'
import { get, getDatabase, onChildAdded, onDisconnect, onValue, ref, remove, runTransaction, set, update, type Database } from 'firebase/database'
import { tryApply } from '../engine/engine'
import type { Action, GameState, LogEntry } from '../engine/types'
import { archivedRounds, roundKey, roundsToArchive, trimLog, withFullLog } from './logArchive'
import type { Backend, Room, RoomData, RoomListing } from './transport'
import { CHECKPOINT_EVERY, emptyRoom, moveKey, normalizeRoom } from './transport'

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
  // `double`, `board` and `settings` are optional: the database rejects undefined, so they are
  // only written when set
  return {
    host: r.host,
    createdAt: r.createdAt,
    phase: r.phase,
    members: r.members,
    seats: r.seats,
    players: r.players,
    picks: r.picks,
    locked: r.locked,
    ...(r.double ? { double: r.double } : {}),
    ...(r.board ? { board: r.board } : {}),
    ...(r.settings ? { settings: r.settings } : {}),
    ...(r.name ? { name: r.name } : {}),
    ...(r.passwordHash ? { passwordHash: r.passwordHash } : {}),
  }
}
interface GameNode {
  rev: number
  json: string
}


/** Parsed archives, by their text (an archive never changes once written). */
const parsedArchives = new Map<string, LogEntry[]>()
function parseArchive(text: string): LogEntry[] {
  let entries = parsedArchives.get(text)
  if (!entries) parsedArchives.set(text, (entries = JSON.parse(text) as LogEntry[]))
  return entries
}

class FirebaseRoom implements Room {
  private unsubs: (() => void)[] = []
  private listener: ((d: RoomData | null) => void) | null = null
  /** Last known room, so transactions can be answered when the local cache is still empty. */
  private last: RoomData | null = null
  /** Resolves on the first snapshot: lobby writes wait for it (see updateRoom). */
  private loaded: Promise<void>
  private markLoaded!: () => void

  // ----- the game, as a checkpoint plus the moves played on top of it -----
  private lobby: Partial<Lobby> | null = null
  private haveLobby = false
  /** The checkpoint, and how many moves it already holds. */
  private base: GameState | null = null
  private baseRev = 0
  /** Moves from the room, by their number; they may arrive before the ones in front of them. */
  private moves = new Map<number, Action>()
  /** The checkpoint with every move so far replayed on it, and how many that is. */
  private state: GameState | null = null
  private applied = 0
  private archives: Record<string, string> = {}

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
    this.listener = cb
    // The lobby and the archives are small and change rarely: a value listener each.
    this.unsubs.push(
      onValue(this.path('/lobby'), (snap) => {
        this.lobby = (snap.val() as Partial<Lobby> | null) ?? null
        this.haveLobby = true
        this.markLoaded()
        this.emit()
      }),
      onValue(this.path('/log'), (snap) => {
        this.archives = (snap.val() as Record<string, string> | null) ?? {}
        this.archived = archivedRounds(this.archives)
        this.emit()
      }),
      // The checkpoint: a whole state, so it only comes every CHECKPOINT_EVERY moves.
      onValue(this.path('/game'), (snap) => {
        const node = snap.val() as GameNode | null
        if (!node?.json) {
          this.base = null
          this.baseRev = 0
          this.moves.clear()
        } else if (node.rev >= this.baseRev) {
          this.base = JSON.parse(node.json) as GameState
          this.baseRev = node.rev
          for (const n of [...this.moves.keys()]) if (n <= node.rev) this.moves.delete(n)
        }
        this.replay()
      }),
      // The moves themselves: a few hundred bytes each, and only the new ones are sent.
      onChildAdded(this.path('/moves'), (snap) => {
        const n = Number(String(snap.key).slice(1))
        if (!Number.isInteger(n) || n <= this.baseRev) return
        this.moves.set(n, JSON.parse(snap.val() as string) as Action)
        this.replay()
      }),
    )
    return () => this.close()
  }

  /** The checkpoint with every move in front of it applied, in order. */
  private replay() {
    let st = this.base
    let n = this.baseRev
    while (st && this.moves.has(n + 1)) {
      const next = tryApply(st, this.moves.get(n + 1)!)
      // A move the engine won't take means this device is out of step: keep what we have and
      // wait for the next checkpoint, which replaces everything.
      if (!next) {
        console.warn(`online: move ${n + 1} does not fit the game here`)
        break
      }
      st = next
      n++
    }
    this.state = st
    this.applied = n
    this.emit()
    // The player who made the move archives and checkpoints; if that got lost (they closed the
    // page, say), whoever is still here does it a moment later from the same state.
    if (st && roundsToArchive(st, this.archived).size) this.scheduleArchive(st, 1500)
  }

  private emit() {
    if (!this.haveLobby) return
    if (!this.lobby) {
      this.last = null
      this.listener?.(null)
      return
    }
    this.last = normalizeRoom({
      ...this.lobby,
      host: this.lobby.host ?? '',
      game: this.state ? withFullLog(this.state, this.archives, parseArchive) : null,
      rev: this.applied,
    })
    this.listener?.(this.last)
  }

  async startGame(st: GameState): Promise<boolean> {
    const res = await runTransaction(this.path('/game'), (cur: GameNode | null) => {
      // A null first call can just mean "not cached yet": answering it is safe, because the
      // write only commits if the server really holds null; otherwise it runs again with data.
      if (cur?.json) return undefined
      return { rev: 0, json: JSON.stringify(st) }
    })
    return res.committed
  }

  async sendMove(fn: (cur: GameState | null) => Action | null): Promise<boolean> {
    // Each move takes the next numbered slot. Losing the race to it means someone else moved
    // first: catch up with their move and ask again, as a transaction on the state used to.
    for (let tries = 0; tries < 10; tries++) {
      const action = fn(this.state ? withFullLog(this.state, this.archives, parseArchive) : null)
      if (!action) return false
      const n = this.applied + 1
      let taken = false
      const res = await runTransaction(this.path(`/moves/${moveKey(n)}`), (cur: string | null) => {
        if (cur !== null) {
          taken = true
          return undefined
        }
        return JSON.stringify(action)
      })
      if (res.committed && !taken) {
        await this.afterMove(n)
        return true
      }
      await this.catchUp(n)
    }
    return false
  }

  /** Wait for the room to deliver move `n` (ours or someone else's) before trying again. */
  private catchUp(n: number): Promise<void> {
    if (this.applied >= n) return Promise.resolve()
    return new Promise((resolve) => {
      const started = Date.now()
      const timer = window.setInterval(() => {
        if (this.applied >= n || Date.now() - started > 3000) {
          clearInterval(timer)
          resolve()
        }
      }, 40)
    })
  }

  /** After our own move: archive finished rounds, and write a checkpoint now and then. */
  private async afterMove(n: number) {
    await this.catchUp(n)
    const st = this.state
    if (!st) return
    this.scheduleArchive(st, 0)
    if (n % CHECKPOINT_EVERY !== 0) return
    try {
      await set(this.path('/game'), { rev: n, json: JSON.stringify(trimLog(st, this.archived)) })
      // The checkpoint holds them now, so the moves it covers can go.
      const done: Record<string, null> = {}
      for (const i of this.moves.keys()) if (i <= n) done[moveKey(i)] = null
      if (Object.keys(done).length) await update(this.path('/moves'), done)
    } catch (e) {
      console.warn('online: could not write the checkpoint', e)
    }
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
    await update(this.path(), { game: null, log: null, moves: null })
  }

  async updateRoom(fn: (cur: RoomData) => RoomData | null): Promise<boolean> {
    // Answering a cold-cache null with null would be applied locally first, and every listener
    // would briefly see a room without a lobby (= deleted). So wait for the room to be loaded,
    // and answer a null from the last known lobby; the server re-runs it if that was stale.
    await this.loaded
    const res = await runTransaction(this.path('/lobby'), (cur: Partial<Lobby> | null) => {
      const base = cur ?? (this.last ? lobbyOf(this.last) : null)
      if (!base) return undefined // the room is gone
      const room = normalizeRoom({ ...base, host: base.host ?? '' })
      const next = fn({ ...room, game: this.last?.game ?? null, rev: this.last?.rev ?? 0 })
      if (!next) return undefined
      return lobbyOf(next)
    })
    return res.committed
  }

  close() {
    if (this.archiveTimer !== null) clearTimeout(this.archiveTimer)
    this.listener = null
    this.unsubs.forEach((u) => u())
    this.unsubs = []
  }
}

export const firebaseBackend: Backend = {
  name: 'firebase',
  // The board lives apart from the rooms (roomIndex/<code>), readable by anyone: the rooms
  // themselves are only read with their code.
  listRooms(cb) {
    return onValue(ref(database(), 'roomIndex'), (snap) => cb(Object.values((snap.val() as Record<string, RoomListing> | null) ?? {})))
  },
  async publishRoom(listing) {
    const node = ref(database(), `roomIndex/${listing.code}`)
    await set(node, listing)
    // the host's device keeps it; when it goes, the room leaves the board (the code still works)
    await onDisconnect(node).remove()
  },
  async lockOf(code, member) {
    const [hash, inRoom] = await Promise.all([get(ref(database(), `rooms/${code}/lobby/passwordHash`)), get(ref(database(), `rooms/${code}/lobby/members/${member}`))])
    return { ...(hash.exists() ? { hash: hash.val() as string } : {}), member: inRoom.exists() }
  },
  async unlistRoom(code) {
    await remove(ref(database(), `roomIndex/${code}`))
  },
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
