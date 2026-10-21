// A room shared by the players of one online game, behind a small interface with two backends:
// Firebase Realtime Database (real online play) and a local one that syncs browser tabs on the
// same computer (for development and tests, no account needed).
//
// Everyone trusts each other (friends, not strangers): every client runs the same engine, so the
// room carries the *moves*, not the state. Each device replays them from the last checkpoint and
// arrives at the same game — the engine is a pure reducer and its RNG lives in the state, so a
// replay is exact. A move is a few hundred bytes where a state is over ten kilobytes.
//
// Two players acting at once can't overwrite each other: a move is written with a transaction on
// its own numbered slot, and whoever loses the slot re-checks their action against the new state.

import type { Action, GameState } from '../engine/types'
import type { RoomSettings } from './settings'

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
  /** The game is over and this member went back to the lobby (waiting for the others). */
  back?: boolean
}

/**
 * What the room holds. The game state travels as a JSON string (see `firebase.ts`).
 *
 * Phases: `lobby` (everyone picks a side and says ready; the host goes on) → `pick` → a game.
 * The picks go through stages, each of which opens when everyone has finished the one before
 * (session.ts `pickStage`): characters, then perks (Bloodweb, Devout), then the map; the killer
 * starts the game last. Maps hold no nulls, which the Realtime Database would drop.
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
  /** Lobby with 3 survivor players: the member who plays two survivors (unset: the first to join). */
  double?: string
  /** The board picked (by the killer or the host, or drawn; unset: MacMillan Estate). */
  board?: string
  /** The board is settled (drawn, or picked by whoever the room lets): the map stage is done. */
  boardSet?: boolean
  /** The host's room settings (anything unset: its default, see settings.ts). */
  settings?: Partial<RoomSettings>
  /** The room's name, shown on the room board and in the room. */
  name?: string
  /** A password to join (hashed with the code, see session.ts); unset: open to anyone. */
  passwordHash?: string
  /** Players the host kicked from the lobby (client id → when): they can't come back in. */
  kicked?: Record<string, number>
  /**
   * Banlist (settings `banlist`): what each side banned of the other, as "a,b" lists — 'killer':
   * the survivors the killer banned, 'survivors': the killers the survivors banned.
   */
  banPicks?: Record<string, string>
  /** Player number → this player confirmed their side's bans (all of them: the bans are final). */
  bansLocked?: Record<string, boolean>
  /** Character picks: 'killer' → killer id, survivor slot '0'..'3' → survivor id. */
  picks: Record<string, string>
  /** Player number → picks confirmed. */
  locked: Record<string, boolean>
  /**
   * Bloodweb / Devout (settings `mode`): each character's 3 perks, by the same keys as `picks`
   * ("a,b,c", see engine/loadout.ts), and whether that loadout is confirmed.
   */
  loadouts?: Record<string, string>
  perksDone?: Record<string, boolean>
  /** Bloodweb's shuffle, drawn when the picks open: every device deals the same cards. */
  perkSeed?: number
  game: GameState | null
  /** Moves played so far (the checkpoint's own count plus the ones replayed on top). */
  rev: number
}

/** A move's slot name: zero-padded so the database sorts them in the order they were played. */
export function moveKey(n: number): string {
  return `m${String(n).padStart(6, '0')}`
}

/** How often a full state is written, so joining or reloading replays only a few moves. */
export const CHECKPOINT_EVERY = 25

export interface Room {
  readonly code: string
  /** Called now with the current data and again on every change; returns an unsubscribe. */
  subscribe(cb: (data: RoomData | null) => void): () => void
  /** Put the first state in the room; false when a game is already there. */
  startGame(st: GameState): Promise<boolean>
  /**
   * Play one move. `fn` sees the room's latest state and returns the action to send, or null to
   * drop it (someone else got there first and it is no longer this player's to make).
   */
  sendMove(fn: (cur: GameState | null) => Action | null): Promise<boolean>
  /** Remove the game (the host ends it; the room stays). */
  resetGame(): Promise<void>
  /** Atomically update the rest of the room (lobby, seats, picks). */
  updateRoom(fn: (cur: RoomData) => RoomData | null): Promise<boolean>
  /** Whether this device is connected to the room's server (a backend without one is always). */
  onConnection?(cb: (up: boolean) => void): () => void
  close(): void
}

/** A room on the public board (rooms/<code> itself is only read with its code). */
export interface RoomListing {
  code: string
  name: string
  /** The host's name. */
  host: string
  /** People in the room. */
  members: number
  phase: 'lobby' | 'pick' | 'game'
  /** A password is needed to join. */
  locked: boolean
  updatedAt: number
}

export interface Backend {
  readonly name: 'firebase' | 'local'
  create(code: string, host: string): Promise<Room>
  /** null when there is no room with this code. */
  join(code: string): Promise<Room | null>
  /** The room board: called now and on every change; returns an unsubscribe. */
  listRooms(cb: (rooms: RoomListing[]) => void): () => void
  /** Put a room on the board (or update it); the host's device keeps it current. */
  publishRoom(listing: RoomListing): Promise<void>
  /** A room is still in use: refresh its listing's time (a listing that is gone stays gone). */
  touchRoom(code: string): Promise<void>
  /** Delete a room and its listing, now. */
  deleteRoom(code: string): Promise<void>
  /** Delete a room and its listing if the listing was last touched before `olderThan`; whether it was. */
  reapRoom(code: string, olderThan: number): Promise<boolean>
  /** Before joining: the room's password hash (if any) and whether `member` is in it already. */
  lockOf(code: string, member: string): Promise<{ hash?: string; member: boolean; kicked?: boolean }>
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
