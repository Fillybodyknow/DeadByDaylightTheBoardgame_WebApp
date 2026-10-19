// Local backend: the room lives in IndexedDB and tabs of the same browser stay in sync through a
// BroadcastChannel. Good for trying online play alone (one tab per player) and for automated
// tests. IndexedDB, not localStorage: Chromium may run tabs in separate processes and syncs
// localStorage between them lazily, so a read-modify-write could miss another tab's write.
// An IndexedDB readwrite transaction is atomic across every tab.

import { tryApply } from '../engine/engine'
import type { Action, GameState } from '../engine/types'
import type { Backend, Room, RoomData, RoomListing } from './transport'
import { CHECKPOINT_EVERY, emptyRoom, normalizeRoom } from './transport'

const DB = 'dbdl-rooms'
const STORE = 'rooms'

/**
 * What a room holds on disk. Like the Firebase backend it keeps a checkpoint and the moves since,
 * so both run the same protocol and the tests exercise the real one.
 */
type StoredRoom = Omit<RoomData, 'game' | 'rev'> & {
  checkpoint?: GameState | null
  moves?: Action[]
  /** Moves already folded into the checkpoint, so `rev` keeps counting up. */
  base?: number
}

/** The checkpoint with its moves replayed: what every device sees. */
function roomOf(stored: StoredRoom): RoomData {
  let game = stored.checkpoint ?? null
  for (const a of stored.moves ?? []) {
    const next = game && tryApply(game, a)
    if (!next) break
    game = next
  }
  return normalizeRoom({ ...stored, game, rev: (stored.base ?? 0) + (stored.moves ?? []).length })
}

let dbp: Promise<IDBDatabase> | null = null
function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}

async function read(code: string): Promise<RoomData | null> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(code)
    req.onsuccess = () => resolve(req.result ? roomOf(req.result as StoredRoom) : null)
    req.onerror = () => reject(req.error)
  })
}

/** Read, change and write one room in a single transaction; false if `fn` declined. */
async function modify(code: string, fn: (cur: StoredRoom | null) => StoredRoom | null): Promise<boolean> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    let wrote = false
    const req = store.get(code)
    req.onsuccess = () => {
      const next = fn((req.result as StoredRoom | null) ?? null)
      if (next) {
        // a JSON copy: the state is plain data, and Vue proxies can't be stored
        store.put(JSON.parse(JSON.stringify(next)), code)
        wrote = true
      }
    }
    tx.oncomplete = () => resolve(wrote)
    tx.onerror = () => reject(tx.error)
  })
}

class LocalRoom implements Room {
  readonly code: string
  private channel: BroadcastChannel
  private listeners = new Set<(d: RoomData | null) => void>()

  constructor(code: string) {
    this.code = code
    this.channel = new BroadcastChannel(`${DB}-${code}`)
    this.channel.onmessage = () => void this.notify()
  }

  private async notify() {
    const d = await read(this.code)
    this.listeners.forEach((cb) => cb(d))
  }

  subscribe(cb: (d: RoomData | null) => void) {
    this.listeners.add(cb)
    void read(this.code).then(cb)
    return () => void this.listeners.delete(cb)
  }

  private async write(fn: (cur: StoredRoom) => StoredRoom | null): Promise<boolean> {
    const ok = await modify(this.code, (cur) => (cur ? fn(cur) : null))
    // a write still finishing as the room is left (leaving writes, then closes): nobody to tell
    if (ok && !this.closed) {
      this.channel.postMessage('changed')
      await this.notify()
    }
    return ok
  }

  startGame(st: GameState) {
    return this.write((cur) => (cur.checkpoint ? null : { ...cur, checkpoint: st, moves: [], base: 0 }))
  }

  sendMove(fn: (cur: GameState | null) => Action | null) {
    // One IndexedDB transaction reads and writes, so the move lands on the game as it is now —
    // the same promise the Firebase slot transaction makes.
    return this.write((cur) => {
      const room = roomOf(cur)
      const action = fn(room.game)
      if (!action || !room.game) return null
      const moves = [...(cur.moves ?? []), action]
      // every so often the moves fold into a fresh checkpoint, as they do online
      if (moves.length < CHECKPOINT_EVERY) return { ...cur, moves }
      const next = tryApply(room.game, action)
      return next ? { ...cur, checkpoint: next, moves: [], base: (cur.base ?? 0) + moves.length } : { ...cur, moves }
    })
  }

  async resetGame() {
    await this.write((cur) => ({ ...cur, checkpoint: null, moves: [], base: 0 }))
  }

  updateRoom(fn: (cur: RoomData) => RoomData | null) {
    return this.write((cur) => {
      const next = fn(roomOf(cur))
      if (!next) return null
      const { game, rev, ...rest } = next
      void game
      void rev
      return { ...cur, ...rest }
    })
  }

  private closed = false

  close() {
    this.closed = true
    this.listeners.clear()
    this.channel.close()
  }
}

// ---------- the room board: one record of listings, beside the rooms ----------

const INDEX = '__room-board__'
const indexChannel = () => new BroadcastChannel(`${DB}-board`)

async function readBoard(): Promise<RoomListing[]> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(INDEX)
    req.onsuccess = () => resolve(Object.values((req.result as Record<string, RoomListing> | undefined) ?? {}))
    req.onerror = () => reject(req.error)
  })
}

async function writeBoard(fn: (cur: Record<string, RoomListing>) => Record<string, RoomListing>) {
  await modify(INDEX, (cur) => fn((cur as unknown as Record<string, RoomListing>) ?? {}) as unknown as StoredRoom)
  const ch = indexChannel()
  ch.postMessage('changed')
  ch.close()
}

export const localBackend: Backend = {
  name: 'local',
  listRooms(cb) {
    const ch = indexChannel()
    const send = () => void readBoard().then(cb)
    ch.onmessage = send
    send()
    return () => ch.close()
  },
  async publishRoom(listing) {
    await writeBoard((cur) => ({ ...cur, [listing.code]: listing }))
  },
  async lockOf(code, member) {
    const d = await read(code)
    return { ...(d?.passwordHash ? { hash: d.passwordHash } : {}), member: !!d?.members[member] }
  },
  async unlistRoom(code) {
    await writeBoard((cur) => {
      const next = { ...cur }
      delete next[code]
      return next
    })
  },
  async create(code, host) {
    await modify(code, () => emptyRoom(host))
    return new LocalRoom(code)
  },
  async join(code) {
    return (await read(code)) ? new LocalRoom(code) : null
  },
}
