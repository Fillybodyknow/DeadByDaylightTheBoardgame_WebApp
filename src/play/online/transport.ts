// A room shared by the players of one online game, behind a small interface with two backends:
// Firebase Realtime Database (real online play) and a local one that syncs browser tabs on the
// same computer (for development and tests, no account needed).
//
// Everyone trusts each other (friends, not strangers): every client runs the same engine and
// writes the new state itself. Writes go through a transaction so two players acting at once
// can't overwrite each other; the loser's action is re-checked against the new state.

import type { GameState } from '../engine/types'

export interface SeatInfo {
  /** Client id of the device sitting here. */
  id: string
  name: string
}

export type Side = 'killer' | 'survivor'

/** Someone in the room (by client id). */
export interface Member {
  name: string
  /** Side chosen in the lobby; null = not chosen yet (or just watching). */
  side: Side | null
  ready: boolean
  joinedAt: number
}

/**
 * What the room holds. The game state travels as a JSON string (see `firebase.ts`).
 *
 * Phases: `lobby` (everyone picks a side and says ready; the host goes on) → `pick` (characters:
 * survivors pick theirs, the killer theirs; the killer starts) → a game. Maps hold no nulls, which
 * the Realtime Database would drop.
 */
export interface RoomData {
  host: string
  createdAt: number
  phase: 'lobby' | 'pick'
  members: Record<string, Member>
  /** Player number → who sits there; set when leaving the lobby (1 = killer, 2.. = survivors). */
  seats: Record<string, SeatInfo>
  /** Number of players (3–5) once seated; 0 in the lobby. */
  players: number
  /** Character picks: 'killer' → killer id, survivor slot '0'..'3' → survivor id. */
  picks: Record<string, string>
  /** Player number → picks confirmed. */
  locked: Record<string, boolean>
  game: GameState | null
  /** Bumped on every game write. */
  rev: number
}

export interface Room {
  readonly code: string
  /** Called now with the current data and again on every change; returns an unsubscribe. */
  subscribe(cb: (data: RoomData | null) => void): () => void
  /** Atomically replace the game: `fn` gets the latest state and returns the next, or null to abort. */
  updateGame(fn: (cur: GameState | null) => GameState | null): Promise<boolean>
  /** Remove the game (the host ends it; the room stays). */
  resetGame(): Promise<void>
  /** Atomically update the rest of the room (lobby, seats, picks). */
  updateRoom(fn: (cur: RoomData) => RoomData | null): Promise<boolean>
  /** Whether this device is connected to the room's server (a backend without one is always). */
  onConnection?(cb: (up: boolean) => void): () => void
  close(): void
}

export interface Backend {
  readonly name: 'firebase' | 'local'
  create(code: string, host: string): Promise<Room>
  /** null when there is no room with this code. */
  join(code: string): Promise<Room | null>
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0/O, 1/I/L

export function newRoomCode(): string {
  return Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')
}

/**
 * A stable id for this device, so a player can reload (or come back later) and keep their seat.
 * `perTab`: one id per browser tab instead — the local test backend plays each seat in a tab.
 */
export function clientId(perTab = false): string {
  const KEY = 'dbdl-client-id'
  const store = perTab ? sessionStorage : localStorage
  try {
    let id = store.getItem(KEY)
    if (!id) store.setItem(KEY, (id = crypto.randomUUID()))
    return id
  } catch {
    return crypto.randomUUID()
  }
}

export function emptyRoom(host: string): RoomData {
  return { host, createdAt: Date.now(), phase: 'lobby', members: {}, seats: {}, players: 0, picks: {}, locked: {}, game: null, rev: 0 }
}

/** Fill the fields a stored room may lack (the database drops empty maps). */
export function normalizeRoom(r: Partial<RoomData> & { host: string }): RoomData {
  return {
    ...emptyRoom(r.host),
    ...r,
    members: r.members ?? {},
    seats: r.seats ?? {},
    picks: r.picks ?? {},
    locked: r.locked ?? {},
    players: r.players ?? 0,
    phase: r.phase ?? 'lobby',
    game: r.game ?? null,
    rev: r.rev ?? 0,
  }
}
