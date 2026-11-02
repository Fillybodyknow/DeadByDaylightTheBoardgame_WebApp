// Replays of online games: every move, recorded on this device as the game is played, so a game in
// the history can be watched again on the board (ReplayView).
//
// The room keeps only the moves since its last checkpoint (firebase.ts drops the rest), so each
// device keeps its own record: a first state and every move since (`RoomData.trail` says what the
// room's game was replayed from here). It goes to IndexedDB as it grows, so a reload in the middle
// of a game carries on with it. A device that missed moves (it joined late, or was away past a
// checkpoint) starts again from the checkpoint it has, and its replay starts there. When the game
// ends the record goes into its history (history.ts) if it reaches the game's last move; the
// replay view plays it back and checks that it ends where the game did.

import { toRaw } from 'vue'
import { killerCardCount, tryApply } from './engine/engine'
import { legalActions } from './engine/legal'
import type { Action, GameState, MoveCard } from './engine/types'
import type { RoomData } from './online/transport'

export interface Replay {
  /** Moves played before the first state (0: the game's very start). */
  from: number
  /** The first state, as JSON. */
  start: string
  moves: Action[]
}

interface Trail extends Replay {
  room: string
  game: string
  /** The first state's RNG: a new game in the same room, with the same characters, differs here. */
  rng: number
  /** Last written (ms), for dropping records of games that never ended. */
  at: number
}

/**
 * Same through a whole game: not `gameKey`, whose props' kinds change as they are revealed, nor
 * the first player, who moves on every round.
 */
function gameId(st: GameState): string {
  return [st.board, st.killer.characterId, st.handPlayers.join(''), ...st.survivors.map((s) => s.characterId)].join('|')
}

/** Two states the same game at the same point (the log aside: a checkpoint leaves archived rounds out of it). */
const sameState = (a: GameState, b: GameState) => JSON.stringify({ ...a, log: [] }) === JSON.stringify({ ...b, log: [] })

/** The orders `k` cards can be taken from `pool` in. */
function orders(pool: MoveCard[], k: number): MoveCard[][] {
  if (k === 0) return [[]]
  return [...new Set(pool)].flatMap((c) => {
    const rest = [...pool]
    rest.splice(rest.indexOf(c), 1)
    return orders(rest, k - 1).map((o) => [c, ...o])
  })
}

/**
 * The moves that could be played in `st`: the legal ones, and every plan (legalActions offers a
 * sample of them, and none of the online planning's per-hand plans): each hand's survivors that
 * still plan taking any of its cards, and the killer any of his. Illegal ones simply don't apply.
 */
function candidates(st: GameState): Action[] {
  const plans: Action[] = []
  if (st.step.t === 'planSurvivors' || st.step.t === 'planKiller') {
    plans.push(...orders(st.killer.hand, killerCardCount(st)).map((cards): Action => ({ t: 'planKiller', cards })))
    st.survivorHands.forEach((pool, hand) => {
      const mine = st.survivors.flatMap((sv, i) => (sv.hand === hand && sv.status !== 'hooked' && sv.planned === null ? [i] : []))
      if (!mine.length) return
      for (const picked of orders(pool, mine.length)) {
        const cards: (MoveCard | null)[] = [null, null, null, null]
        mine.forEach((s, j) => (cards[s] = picked[j]))
        plans.push({ t: 'planHand', hand, cards })
      }
    })
  }
  return [...legalActions(st), ...plans]
}

/**
 * The one move missing between the record and a checkpoint just after it: the move that made the
 * checkpoint (the local backend folds it in at once; online the checkpoint may come before it).
 * Found among the moves that could be played there; false when none leads to the checkpoint.
 * `before`: the state the record ends in, when known (else it is played back).
 */
function bridge(t: Trail, checkpoint: GameState, before: GameState | null): boolean {
  let end = before
  if (!end) {
    const states = replayStates(t)
    if (states.length !== t.moves.length + 1) return false
    end = states[states.length - 1]
  }
  for (const a of candidates(end)) {
    const next = tryApply(end, a)
    if (next && sameState(next, checkpoint)) {
      t.moves.push(a)
      return true
    }
  }
  return false
}

/** The game played back from a replay: every state from its first, one more per move. */
export function replayStates(r: Replay): GameState[] {
  let st = JSON.parse(r.start) as GameState
  const out = [st]
  for (const a of r.moves) {
    const next = tryApply(st, a)
    if (!next) break
    out.push((st = next))
  }
  return out
}

/** A state kept every this many moves while watching (each holds the log so far: not all of them). */
const SNAP_EVERY = 25

/**
 * A replay played back for watching (ReplayView): one pass at the start finds its rounds and keeps
 * a state every SNAP_EVERY moves; any state is played forward from the one before it, and the
 * next one from the last shown, so stepping on costs one move.
 */
export class Playback {
  /** How many states: the first and one per move that applied. */
  readonly length: number
  /** The first state of each round. */
  readonly rounds: { round: number; at: number }[] = []
  /** The last state, to check it against the game's end. */
  readonly end: GameState
  private moves: Action[]
  private snaps: GameState[] = []
  private last: { at: number; st: GameState }

  constructor(r: Replay) {
    this.moves = r.moves
    let st = JSON.parse(r.start) as GameState
    let n = 0
    this.snaps.push(st)
    this.rounds.push({ round: st.round, at: 0 })
    for (const a of r.moves) {
      const next = tryApply(st, a)
      if (!next) break
      st = next
      n++
      if (n % SNAP_EVERY === 0) this.snaps.push(st)
      if (st.round !== this.rounds[this.rounds.length - 1].round) this.rounds.push({ round: st.round, at: n })
    }
    this.length = n + 1
    this.end = st
    this.last = { at: 0, st: this.snaps[0] }
  }

  /** The state after `i` moves. */
  at(i: number): GameState {
    if (i === this.last.at) return this.last.st
    let at = this.last.at
    let st = this.last.st
    // not just after the last one shown: from the snapshot before it
    if (i < at || i - at > SNAP_EVERY) {
      at = Math.floor(i / SNAP_EVERY) * SNAP_EVERY
      st = this.snaps[at / SNAP_EVERY]
    }
    while (at < i) st = tryApply(st, this.moves[at++])!
    this.last = { at: i, st }
    return st
  }
}

/** Whether a replay's last state is the game's end (`final`, its state as saved). */
export function endsAt(end: GameState, final: GameState): boolean {
  return end.rng === final.rng && end.round === final.round && end.sacrifice === final.sacrifice && JSON.stringify(end.step) === JSON.stringify(final.step)
}

// ---------- IndexedDB: one record per room ----------

const DB = 'dbdl-replays'
/** A record not written for this long is a game that never ended: dropped. */
const TRAIL_TTL_MS = 3 * 24 * 60 * 60 * 1000

let dbp: Promise<IDBDatabase> | null = null
function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore('trails', { keyPath: 'room' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}

async function store<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction('trails', mode).objectStore('trails'))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const readTrail = (room: string) => store('readonly', (s) => s.get(room) as IDBRequest<Trail | undefined>)

/** The record of a room's game is no longer needed (it went into the history). */
export function dropTrail(room: string) {
  if (cur?.room !== room) return
  cur = null
  clearTimeout(saveTimer)
  saveTimer = undefined
  void store('readwrite', (s) => s.delete(room)).catch(() => {})
}

// ---------- recording ----------

let cur: Trail | null = null
/** The room's game as last seen, after `at` moves: where a missing move is looked for from. */
let seen: { room: string; at: number; st: GameState } | null = null
let saveTimer: ReturnType<typeof setTimeout> | undefined

function fresh(room: string, base: number, start: GameState): Trail {
  return { room, game: gameId(start), rng: start.rng, from: base, start: JSON.stringify(start), moves: [], at: Date.now() }
}

function write(t: Trail) {
  t.at = Date.now()
  void store('readwrite', (s) => s.put(t)).catch((e) => console.warn('replay: not recorded', e))
}

/** Written at most every 1.5 s (not only after a quiet moment: quick moves would keep putting it off). */
function save() {
  if (saveTimer !== undefined) return
  saveTimer = setTimeout(() => {
    saveTimer = undefined
    if (cur) write(cur)
  }, 1500)
}

/** A record of this game stored before (a reload in the middle of it): the moves before `t`'s first state. */
async function resume(t: Trail) {
  const old = await readTrail(t.room).catch(() => undefined)
  if (cur !== t || !old || old.game !== t.game || old.from > t.from || old.from + old.moves.length < t.from) return
  t.moves = [...old.moves.slice(0, t.from - old.from), ...t.moves]
  t.from = old.from
  t.start = old.start
  t.rng = old.rng
  save()
}

/** A room's latest data (session.ts): the moves it was replayed with go into this game's record. */
export function recordTrail(room: string, data: RoomData | null) {
  const trail = data?.trail
  if (!trail?.start || !data?.game) return
  const start = toRaw(trail.start)
  const isNew =
    !cur ||
    cur.room !== room ||
    cur.game !== gameId(start) ||
    // a new game, the same characters in the same seats: from a checkpoint before the record's
    // first (they only go up within a game), or from the start with another first state
    trail.base < cur.from ||
    (trail.base === 0 && cur.from === 0 && cur.rng !== start.rng)
  if (isNew) {
    // another room: what is left of the last one's record is written first
    if (cur && cur.room !== room) write(cur)
    cur = fresh(room, trail.base, start)
    if (trail.base > 0) void resume(cur)
  } else if (trail.base > cur!.from + cur!.moves.length) {
    // moves missed: the one that made the checkpoint is found again; more (away past a
    // checkpoint), and the record starts again from the checkpoint there is
    const end = cur!.from + cur!.moves.length
    const before = seen?.room === room && seen.at === end ? seen.st : null
    if (trail.base > end + 1 || !bridge(cur!, start, before)) cur = fresh(room, trail.base, start)
  }
  const t = cur!
  trail.moves.forEach((a, i) => {
    // move number trail.base + i + 1, at this place in the record (a slot replaced after a race is taken again)
    const at = trail.base + i - t.from
    if (at >= 0 && at <= t.moves.length) t.moves[at] = toRaw(a)
  })
  seen = { room, at: trail.base + trail.moves.length, st: toRaw(data.game) }
  save()
}

/**
 * The replay of `room`'s game that ended in `final` after `rev` moves, or null: none recorded
 * here, or not up to its end. Not played back here (the moment the game ends, on every device,
 * is no time for it): ReplayView checks that it ends where the game did (`endsAt`).
 */
export function replayFor(room: string, final: GameState, rev: number): Replay | null {
  const t = cur
  if (!t || t.room !== room || t.game !== gameId(final) || t.from + t.moves.length !== rev) return null
  return { from: t.from, start: t.start, moves: [...t.moves] }
}

// records of games that never ended (everyone left halfway) don't stay for ever
void store('readonly', (s) => s.getAll() as IDBRequest<Trail[]>)
  .then((all) => all.filter((t) => t.at < Date.now() - TRAIL_TTL_MS).forEach((t) => void store('readwrite', (s) => s.delete(t.room))))
  .catch(() => {})
