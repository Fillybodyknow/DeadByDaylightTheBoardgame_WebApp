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
