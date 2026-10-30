import { describe, expect, it } from 'vitest'
import { botMove, nextActor } from './bot'
import { apply, createGame, type GameConfig } from './engine'
import { legalActions } from './legal'
import { mayAct } from './seats'
import type { GameState } from './types'

const ALL_KILLERS = ['trapper', 'nurse', 'huntress', 'hillbilly', 'doctor', 'hag', 'wraith', 'oni', 'deathslinger', 'twins', 'blight', 'spirit', 'legion', 'trickster', 'plague', 'clown', 'knight', 'dredge', 'artist', 'skullmerchant', 'unknown', 'singularity']

/**
 * A game the bots play on their own (every seat a bot), until it is over or `rounds` have gone by.
 * Every move is checked to be the acting player's own to make.
 */
function botGame(killer: string, seed: number, opts: { players?: GameConfig['players']; board?: string; rounds?: number } = {}) {
  let st: GameState = createGame({
    board: opts.board ?? 'macmillan',
    survivors: ['dwight', 'meg', 'claudette', 'jake'].map((id) => ({ id, name: id })),
    killer: { id: killer, name: killer },
    players: opts.players ?? 5,
    seed,
    // every seat a bot: the survivors plan as one team
    bots: Array.from({ length: opts.players ?? 5 }, (_, i) => i + 1),
  })
  const rounds = opts.rounds ?? 60
  for (let n = 0; n < 8000 && st.phase !== 'over' && st.round <= rounds; n++) {
    const player = nextActor(st)
    // nobody to wait on but the game isn't over: only the setup reveals do that
    const act = player === null ? legalActions(st)[0] : botMove(st, player)
    if (!act) throw new Error(`no move for player ${player} at ${st.step.t}`)
    if (player !== null && !mayAct(st, player, act)) throw new Error(`player ${player} may not send ${act.t} at ${st.step.t}`)
    st = apply(st, act)
  }
  return st
}

describe('bots', () => {
  it('play every killer for a few rounds, only ever their own legal moves', () => {
    for (const [n, killer] of ALL_KILLERS.entries()) {
      const st = botGame(killer, 100 + n, { rounds: 3 })
      expect(st.phase === 'over' || st.round > 3).toBe(true)
    }
  }, 300_000)

  it('play games to the end, at every player count and on other boards', () => {
    const games = [
      { killer: 'trapper', players: 5, board: 'macmillan' },
      { killer: 'twins', players: 5, board: 'macmillan' },
      { killer: 'nurse', players: 4, board: 'autohaven' },
      { killer: 'legion', players: 3, board: 'ormond' },
      { killer: 'spirit', players: 2, board: 'crotus-prenn' },
    ] as const
    for (const [n, g] of games.entries()) {
      const st = botGame(g.killer, 300 + n, { players: g.players, board: g.board })
      expect(st.phase, `${g.killer}, ${g.players} players, ${g.board}`).toBe('over')
    }
  }, 300_000)

  it('plan a survivor and the killer with what each side can see', () => {
    let st = createGame({ board: 'macmillan', survivors: ['dwight', 'meg', 'claudette', 'jake'].map((id) => ({ id, name: id })), killer: { id: 'trapper', name: 'trapper' }, players: 5, seed: 7 })
    while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
    expect(st.step.t).toBe('planSurvivors')
    // each survivor player plans their own hand, the killer his cards alongside (online)
    const hand = botMove(st, 2)
    expect(hand).toMatchObject({ t: 'planHand', hand: 0 })
    const killer = botMove(st, 1)
    expect(killer?.t).toBe('planKiller')
    // a player not being waited on has no move
    st = apply(st, hand!)
    expect(botMove(st, 2)).toBeNull()
  })
})
