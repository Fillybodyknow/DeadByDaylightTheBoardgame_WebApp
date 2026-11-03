// Online undo by vote (a house rule): a player asks to take back their last move of the round, and
// the other side decides (who votes and what passes: undoRules.ts).
//
// The request lives in the room (`RoomData.undoVote`); while it is open no move goes to the room
// (`onlineHold`). The asking device holds the state to go back to (`myMoves`, game.ts) and, once
// the vote passes, puts it in the room (`Room.restore`): every device then shows it.

import { computed, ref, toRaw, watch } from 'vue'
import type { GameState } from '../engine/types'
import { game, myMoves, online, onlineHold } from '../game'
import { mySeat, session } from './session'
import type { UndoVote } from './transport'
import { tally, undoVoters } from './undoRules'

/** How long the other side has to vote: no decision by then is a no. */
export const UNDO_VOTE_MS = 30_000
/** How long the outcome stays on screen. */
export const UNDO_SHOW_MS = 5000

/** A clock for the countdown and the outcome's few seconds, ticking only while there is a vote. */
const now = ref(Date.now())
let ticker: number | null = null

const open = (v: UndoVote | undefined, at: number): v is UndoVote => !!v && !v.result && at - v.at < UNDO_VOTE_MS

/** The vote going on now, or null. */
export const undoVote = computed(() => {
  const v = session.data?.undoVote
  return session.data?.game && open(v, now.value) ? v : null
})

/** A vote's outcome, for its few seconds on screen. */
export const undoOutcome = computed(() => {
  const v = session.data?.undoVote
  return v?.result && v.doneAt && now.value - v.doneAt < UNDO_SHOW_MS ? v : null
})

/** Seconds left to vote. */
export const undoSecondsLeft = computed(() => (undoVote.value ? Math.max(0, Math.ceil((undoVote.value.at + UNDO_VOTE_MS - now.value) / 1000)) : 0))

export const undoTally = computed(() => (session.data && undoVote.value ? tally(session.data, undoVote.value) : null))

/** This player is asked to vote now (and hasn't yet). */
export const undoAsksMe = computed(() => {
  const v = undoVote.value
  const seat = mySeat.value
  return !!v && !!seat && !!undoTally.value?.voters.includes(seat) && v.votes?.[String(seat)] === undefined
})

/** The state this player's last move of the round went from: what an undo goes back to (null: none). */
export const myUndo = computed(() => {
  const st = game.value
  const last = myMoves.value[myMoves.value.length - 1]
  if (!st || !online.value?.seat || st.phase === 'over' || !last || last.round !== st.round) return null
  return last
})

/** The asking device's request: the state to go back to, and the room's game it was asked in. */
let pending: { target: GameState; asked: GameState } | null = null
let busy = false

/** The game without its log: a checkpoint leaves archived rounds out of the log. */
const sameGame = (a: GameState, b: GameState) => JSON.stringify({ ...a, log: [] }) === JSON.stringify({ ...b, log: [] })

/** Ask to take back this player's last move of the round. */
export async function requestUndo(): Promise<boolean> {
  const target = myUndo.value
  const seat = mySeat.value
  const asked = online.value?.latest()
  if (!target || !seat || !asked || !session.room || undoVote.value) return false
  // what goes: the first thing the log says after it
  const what = asked.log.slice(target.log.length).find((e) => e.text)?.text ?? ''
  const ok = await session.room.updateRoom((cur) => {
    if (!cur.game || open(cur.undoVote, Date.now())) return null
    return { ...cur, undoVote: { by: seat, at: Date.now(), round: target.round, what: what.slice(0, 160) } }
  })
  if (ok) pending = { target: toRaw(target), asked: toRaw(asked) }
  return ok
}

export function voteUndo(yes: boolean) {
  const seat = mySeat.value
  if (!seat || !session.room) return
  return session.room.updateRoom((cur) => {
    const v = cur.undoVote
    if (!open(v, Date.now()) || !undoVoters(cur, v.by).includes(seat)) return null
    return { ...cur, undoVote: { ...v, votes: { ...(v.votes ?? {}), [String(seat)]: yes } } }
  })
}

/** The asking device writes how it ended. */
function finish(result: NonNullable<UndoVote['result']>, at: number) {
  return session.room?.updateRoom((cur) => (cur.undoVote && cur.undoVote.at === at && !cur.undoVote.result ? { ...cur, undoVote: { ...cur.undoVote, result, doneAt: Date.now() } } : null))
}

/** The asking device: the vote passed, so the game goes back (if nothing moved meanwhile). */
async function carryOut(v: UndoVote) {
  const p = pending
  pending = null
  if (!p || !session.room) return finish('failed', v.at)
  const ok = await session.room.restore((cur) => (cur && sameGame(cur, p.asked) ? p.target : null)).catch(() => false)
  // the move taken back is no longer there to take back
  if (ok) myMoves.value = myMoves.value.filter((s) => s !== p.target && s.round === p.target.round && s.log.length < p.target.log.length)
  await finish(ok ? 'yes' : 'failed', v.at)
}

/** The outcome last seen, so each device reacts to one once. */
let seenOutcome = 0

watch(
  () => session.data?.undoVote,
  (v) => {
    // the clock runs while there is something to show
    if (v && (!v.result || (v.doneAt && Date.now() - v.doneAt < UNDO_SHOW_MS))) {
      now.value = Date.now()
      ticker ??= window.setInterval(() => {
        now.value = Date.now()
        const cur = session.data?.undoVote
        if (!cur || (cur.result && (!cur.doneAt || now.value - cur.doneAt >= UNDO_SHOW_MS))) {
          clearInterval(ticker!)
          ticker = null
        }
      }, 500)
    }
    // the game went back: every other device's own moves since are gone (the asker's were kept above)
    if (v?.result === 'yes' && v.doneAt && v.doneAt !== seenOutcome) {
      seenOutcome = v.doneAt
      if (v.by !== mySeat.value) myMoves.value = []
    }
  },
  { immediate: true },
)

// No move goes to the room while it votes.
watch(undoVote, (v) => (onlineHold.value = !!v), { immediate: true })

// The asking device settles the vote: yes (the game goes back), no, or no answer in time.
watch([undoVote, undoTally, now], () => {
  const d = session.data
  const v = d?.undoVote
  if (busy || !d?.game || !v || v.result || v.by !== mySeat.value) return
  const t = tally(d, v)
  const expired = Date.now() - v.at >= UNDO_VOTE_MS
  if (t.decided !== 'yes' && t.decided !== 'no' && !expired) return
  busy = true
  void Promise.resolve(t.decided === 'yes' ? carryOut(v) : finish('no', v.at)).finally(() => (busy = false))
})
