import { describe, expect, it } from 'vitest'
import { apply, createGame, tryApply } from './engine/engine'
import { legalActions } from './engine/legal'
import type { Action, GameState } from './engine/types'
import { CHECKPOINT_EVERY, type RoomData } from './online/transport'
import { Playback, dropTrail, endsAt, recordTrail, replayFor, replayStates } from './replay'

/** A whole game of random legal moves (seeded, so it is the same every run). */
function game(seed: number) {
  let st = createGame({ board: 'macmillan', survivors: ['dwight', 'meg', 'claudette', 'jake'].map((id) => ({ id, name: id })), killer: { id: 'trapper', name: 'trapper' }, players: 5, seed })
  const start = st
  const moves: Action[] = []
  let r = seed
  const random = () => (r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  while (st.phase !== 'over' && moves.length < 3000) {
    const ls = legalActions(st)
    const a = ls[Math.floor(random() * ls.length)]
    st = apply(st, a)
    moves.push(a)
  }
  return { start, moves, final: st }
}

const emit = (room: string, game: GameState, base: number, start: GameState, moves: Action[]) =>
  recordTrail(room, { game, trail: { base, start, moves } } as unknown as RoomData)

/**
 * A room's updates as a device sees them: one per move, a checkpoint every CHECKPOINT_EVERY moves.
 * `seesFold`: the checkpoint's own move is seen as a move first (Firebase); otherwise it comes
 * folded into the checkpoint at once.
 */
function play(room: string, g: ReturnType<typeof game>, seesFold = true) {
  let base = 0
  let cp = g.start
  let pending: Action[] = []
  let cur = g.start
  emit(room, cur, base, cp, [])
  for (const a of g.moves) {
    cur = tryApply(cur, a)!
    pending = [...pending, a]
    const folds = pending.length >= CHECKPOINT_EVERY
    if (!folds || seesFold) emit(room, cur, base, cp, pending)
    if (folds) {
      base += pending.length
      cp = cur
      pending = []
      emit(room, cur, base, cp, [])
    }
  }
  return { base, cp, pending, cur }
}

describe('replay: recording an online game', () => {
  const a = game(3)

  it('records every move from the start, and plays back to the game’s end', () => {
    play('ROOM', a)
    const r = replayFor('ROOM', a.final, a.moves.length)
    expect(r).not.toBeNull()
    expect(r!.from).toBe(0)
    expect(r!.moves).toHaveLength(a.moves.length)
    const p = new Playback(r!)
    expect(p.length).toBe(a.moves.length + 1)
    expect(endsAt(p.end, a.final)).toBe(true)
    dropTrail('ROOM')
  }, 120_000)

  it('finds the move a checkpoint folded in before it was seen', () => {
    play('ROOM', a, false)
    const r = replayFor('ROOM', a.final, a.moves.length)
    expect(r?.from).toBe(0)
    expect(endsAt(new Playback(r!).end, a.final)).toBe(true)
    dropTrail('ROOM')
  }, 120_000)

  it('has no replay when the record stops short of the game’s last move', () => {
    play('ROOM', a)
    expect(replayFor('ROOM', a.final, a.moves.length + 1)).toBeNull()
    expect(replayFor('OTHER', a.final, a.moves.length)).toBeNull()
    dropTrail('ROOM')
  }, 120_000)

  it('records a rematch (same board, characters and seats) after the last game’s record was dropped', () => {
    const end = play('ROOM', a)
    dropTrail('ROOM')
    // the ended room updates again (its last round archived) while everyone reads the summary
    emit('ROOM', end.cur, end.base, end.cp, end.pending)
    const b = game(4)
    play('ROOM', b)
    const r = replayFor('ROOM', b.final, b.moves.length)
    expect(r?.from).toBe(0)
    expect(endsAt(new Playback(r!).end, b.final)).toBe(true)
    dropTrail('ROOM')
  }, 120_000)
})

describe('replay: an undo the room voted for', () => {
  it('cuts the record back to the state the game went back to, and records on from there', () => {
    const g = game(6)
    // moves 1–40 as usual (a checkpoint after 25), then an undo back to the state after 36: the
    // room's next slot (41) is the undo's, and its checkpoint is that state
    const states = [g.start]
    for (const a of g.moves) states.push(tryApply(states[states.length - 1], a)!)
    emit('UNDO', g.start, 0, g.start, [])
    for (let n = 1; n <= 25; n++) emit('UNDO', states[n], 0, g.start, g.moves.slice(0, n))
    emit('UNDO', states[25], 25, states[25], [])
    for (let n = 26; n <= 40; n++) emit('UNDO', states[n], 25, states[25], g.moves.slice(25, n))
    emit('UNDO', states[36], 41, states[36], [])
    // the game goes on from there with the same moves (one more checkpoint on the way)
    const rest = g.moves.slice(36)
    let base = 41
    let cp = states[36]
    let pending: Action[] = []
    for (let i = 0; i < rest.length; i++) {
      pending = [...pending, rest[i]]
      emit('UNDO', states[37 + i], base, cp, pending)
      if (pending.length >= CHECKPOINT_EVERY) {
        base += pending.length
        cp = states[37 + i]
        pending = []
        emit('UNDO', cp, base, cp, [])
      }
    }
    // the room counted the undone moves and the undo's slot: 5 more than the game's moves
    expect(replayFor('UNDO', g.final, g.moves.length)).toBeNull()
    const r = replayFor('UNDO', g.final, g.moves.length + 5)
    expect(r?.from).toBe(0)
    expect(r!.moves).toHaveLength(g.moves.length)
    expect(endsAt(new Playback(r!).end, g.final)).toBe(true)
    dropTrail('UNDO')
  }, 120_000)
})

describe('replay: watching', () => {
  it('gives every state, stepping on, back and jumping, as playing it all through does', () => {
    const g = game(5)
    const r = { from: 0, start: JSON.stringify(g.start), moves: g.moves }
    const all = replayStates(r)
    const p = new Playback(r)
    expect(p.length).toBe(all.length)
    expect(p.rounds[0]).toEqual({ round: 1, at: 0 })
    for (const { round, at } of p.rounds) expect(all[at].round).toBe(round)
    // step on, step back, jump about
    const order = [1, 2, 3, 2, 60, 61, 26, all.length - 1, 0, 49, 50, 51, Math.floor(all.length / 2)]
    for (const i of order) expect(JSON.stringify(p.at(i))).toBe(JSON.stringify(all[i]))
  }, 120_000)
})
