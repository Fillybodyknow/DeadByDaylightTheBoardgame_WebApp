// Local backend: the room lives in IndexedDB and tabs of the same browser stay in sync through a
// BroadcastChannel. Good for trying online play alone (one tab per player) and for automated
// tests. IndexedDB, not localStorage: Chromium may run tabs in separate processes and syncs
// localStorage between them lazily, so a read-modify-write could miss another tab's write.
// An IndexedDB readwrite transaction is atomic across every tab.

import type { Backend, Room, RoomData } from './transport'
import { emptyRoom, normalizeRoom } from './transport'

const DB = 'dbdl-rooms'
const STORE = 'rooms'

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
    req.onsuccess = () => resolve(req.result ? normalizeRoom(req.result as RoomData) : null)
    req.onerror = () => reject(req.error)
  })
}

/** Read, change and write one room in a single transaction; false if `fn` declined. */
async function modify(code: string, fn: (cur: RoomData | null) => RoomData | null): Promise<boolean> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    let wrote = false
    const req = store.get(code)
    req.onsuccess = () => {
      const next = fn(req.result ? normalizeRoom(req.result as RoomData) : null)
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

  private async write(fn: (cur: RoomData) => RoomData | null): Promise<boolean> {
    const ok = await modify(this.code, (cur) => (cur ? fn(cur) : null))
    if (ok) {
      this.channel.postMessage('changed')
      await this.notify()
    }
    return ok
  }

  updateGame(fn: (cur: RoomData['game']) => RoomData['game']) {
    return this.write((cur) => {
      const game = fn(cur.game)
      return game ? { ...cur, game, rev: cur.rev + 1 } : null
    })
  }

  async resetGame() {
    await this.write((cur) => ({ ...cur, game: null, rev: cur.rev + 1 }))
  }

  updateRoom(fn: (cur: RoomData) => RoomData | null) {
    return this.write(fn)
  }

  close() {
    this.listeners.clear()
    this.channel.close()
  }
}

export const localBackend: Backend = {
  name: 'local',
  async create(code, host) {
    await modify(code, () => emptyRoom(host))
    return new LocalRoom(code)
  },
  async join(code) {
    return (await read(code)) ? new LocalRoom(code) : null
  },
}
