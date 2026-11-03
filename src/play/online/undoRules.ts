// Who votes on an online undo, and when the vote is settled (online/undo.ts runs it). A house rule:
// the killer's request needs more than half of the survivors' players to agree (half or less: no);
// a survivor player's needs the killer's yes. Bots don't vote, nor does a player whose connection is
// gone (a bot playing for them, or not): with nobody to ask, the request passes.

import { KILLER_PLAYER } from '../engine/seats'
import type { RoomData, UndoVote } from './transport'

/** Who votes on `by`'s request: the other side's people, here and playing their own seat. */
export function undoVoters(d: RoomData, by: number): number[] {
  const seats = by === KILLER_PLAYER ? Array.from({ length: d.players - 1 }, (_, i) => i + 2) : [KILLER_PLAYER]
  return seats.filter((p) => {
    const seat = d.seats[String(p)]
    return !!seat && !seat.bot && !d.dropped?.[seat.id] && !d.standIn?.[String(p)]
  })
}

export interface Tally {
  voters: number[]
  yes: number
  no: number
  /** Yes votes needed: more than half. */
  need: number
  /** Settled: enough yes, or too many no for enough yes; null while it can go either way. */
  decided: 'yes' | 'no' | null
}

export function tally(d: RoomData, v: UndoVote): Tally {
  const voters = undoVoters(d, v.by)
  const yes = voters.filter((p) => v.votes?.[String(p)] === true).length
  const no = voters.filter((p) => v.votes?.[String(p)] === false).length
  const need = Math.floor(voters.length / 2) + 1
  const decided = !voters.length || yes >= need ? 'yes' : voters.length - no < need ? 'no' : null
  return { voters, yes, no, need, decided }
}
