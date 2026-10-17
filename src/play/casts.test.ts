import { describe, expect, it } from 'vitest'
import { CastBuilder } from './casts'
import { createGame, apply } from './engine/engine'
import { legalActions } from './engine/legal'
import type { GameState, LogEntry } from './engine/types'

function game(): GameState {
  let st = createGame({ board: 'macmillan', survivors: ['dwight', 'meg', 'claudette', 'jake'].map((id) => ({ id, name: id })), killer: { id: 'trapper', name: 'trapper' }, players: 5, seed: 1 })
  while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
  return st
}

const move = (who: number | 'killer'): LogEntry => ({ round: 1, text: `${who} → Shack`, who, ev: { k: 'move', who, from: 'a', to: 'shack', path: 'p1' } })

describe('action cards', () => {
  it('shows a move made with a movement card, with that card', () => {
    const prev = game()
    prev.step = { t: 'survivorMove', s: 1, card: 'sprint' }
    const cast = new CastBuilder(prev, prev).of(move(1))
    expect(cast?.kind).toBe('move')
    expect(cast?.image).toContain('sprint')
  })

  it('leaves out a move without a card: carried, a perk, a teleport', () => {
    const prev = game()
    prev.step = { t: 'anyMove', s: 1 }
    expect(new CastBuilder(prev, prev).of(move(1))).toBeNull()
    prev.step = { t: 'carryMove', s: 1, steps: 2 }
    expect(new CastBuilder(prev, prev).of(move('killer'))).toBeNull()
  })

  it("takes the card from the card line when the move follows it in the same batch", () => {
    const prev = game()
    const b = new CastBuilder(prev, prev)
    expect(b.of({ round: 1, text: 'trapper เปิด Vault', who: 'killer' })).toBeNull()
    expect(b.of(move('killer'))?.image).toContain('vault')
  })
})

describe('a power that wounds a whole room', () => {
  it('shows one card naming everyone hit, however many', () => {
    let prev = createGame({ board: 'macmillan', survivors: ['dwight', 'meg', 'claudette', 'jake'].map((id) => ({ id, name: id })), killer: { id: 'legion', name: 'legion' }, players: 5, seed: 1 })
    while (prev.step.t === 'setupReveal') prev = apply(prev, legalActions(prev)[0])
    const room = prev.killer.room
    prev.survivors.forEach((sv) => Object.assign(sv, { room, status: 'board', wounded: false }))
    prev.phase = 'killer'
    prev.killer.planned = ['wait', 'wait']
    prev.killer.revealedCount = 1
    prev.step = { t: 'killerInteract', turn: 0, canInteract: true }
    prev.queue = [{ k: 'endKillerTurn', turn: 0 }]
    const st = apply(prev, { t: 'interact', i: { k: 'frenzy' } })
    const b = new CastBuilder(prev, st)
    // the power's card, then the next turn's (the scene runs on): one card for the whole room
    const casts = st.log.slice(prev.log.length).map((e) => b.of(e)).filter((c) => c && c.kind !== 'move')
    expect(casts).toHaveLength(1)
    expect(casts[0]!.kind).toBe('power')
    expect(casts[0]!.targets).toEqual([0, 1, 2, 3])
  })
})
