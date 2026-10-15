// Keeping online writes small. The game log is most of the state (over 90% late in a game) and
// only grows, so a write doesn't carry it all: once a round is over, its log entries are stored
// once, separately, as an archive (one string per round), and the game written on every move
// drops the rounds already archived. Each device puts the full log back together.
//
// The engine itself only looks at the current round's log, so it plays the same on the
// trimmed state.
//
// A round is dropped only after its archive is in the room, and an archive is always made from
// a game state that still holds the whole round. So no entry can be lost, whoever writes it and
// however often.

import type { GameState, LogEntry } from '../engine/types'

/** Archive key of a round. */
export const roundKey = (round: number) => `r${round}`

/** The rounds an archive map holds. */
export function archivedRounds(archive: Record<string, unknown> | null | undefined): Set<number> {
  return new Set(
    Object.keys(archive ?? {})
      .map((k) => Number(k.slice(1)))
      .filter((n) => Number.isInteger(n)),
  )
}

/** The state to write: without the log of finished rounds that are already archived. */
export function trimLog(st: GameState, archived: Set<number>): GameState {
  if (!st.log.some((e) => e.round < st.round && archived.has(e.round))) return st
  return { ...st, log: st.log.filter((e) => e.round >= st.round || !archived.has(e.round)) }
}

/** Finished rounds whose entries this state holds but the room has no archive of yet. */
export function roundsToArchive(st: GameState, archived: Set<number>): Map<number, LogEntry[]> {
  const out = new Map<number, LogEntry[]>()
  for (const e of st.log) {
    if (e.round >= st.round || archived.has(e.round)) continue
    if (!out.has(e.round)) out.set(e.round, [])
    out.get(e.round)!.push(e)
  }
  return out
}

/**
 * The full state: the archived rounds the written state no longer holds, merged in round order
 * with the log it does hold (entries keep their order within a round). `parse` turns one archive
 * string into its entries (callers cache it).
 */
export function withFullLog(st: GameState, archive: Record<string, string> | null | undefined, parse: (raw: string) => LogEntry[] = JSON.parse): GameState {
  const held = new Set(st.log.map((e) => e.round))
  const missing = [...archivedRounds(archive)].filter((r) => !held.has(r))
  if (!missing.length) return st
  const log = [...missing.flatMap((r) => parse(archive![roundKey(r)])), ...st.log]
  return { ...st, log: log.sort((a, b) => a.round - b.round) } // stable: keeps order within a round
}
