import { describe, expect, it } from 'vitest'
import { botMove, nextActor } from './bot'
import { apply, createGame, palletOn, pathState, perkChoices, type GameConfig } from './engine'
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

describe('bot perks: The Trapper', () => {
  /**
   * The Trapper has just wounded survivor 0 in his room, on his first card or his last, and is
   * offered Brutal Strength; `trapped`: a bear trap on one of the paths out.
   */
  function attacked(last: boolean, trapped: boolean): GameState {
    let st = createGame({ board: 'macmillan', survivors: ['dwight', 'meg', 'claudette', 'jake'].map((id) => ({ id, name: id })), killer: { id: 'trapper', name: 'trapper' }, players: 5, seed: 9, bots: [1, 2, 3, 4, 5] })
    while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
    Object.assign(st.killer, { perks: ['brutal_strength'], bp: 6, planned: ['wait', 'wait'], revealedCount: last ? 2 : 1 })
    st.survivors.forEach((sv, i) => Object.assign(sv, { room: i ? 'backlot' : st.killer.room, status: 'board', wounded: i === 0, planned: 'sneak', acted: true }))
    const w = { k: 'afterAttack', target: 0 } as const
    const paths = perkChoices(st, 'brutal_strength', 'killer', w).map((c) => c.path!)
    expect(paths.length).toBeGreaterThan(0)
    if (trapped) pathState(st, paths[0]).trap = true
    Object.assign(st, { phase: 'killer', canInteract: false })
    st.step = { t: 'offer', perk: 'brutal_strength', owner: 'killer', w, done: [] }
    st.queue = [{ k: 'endKillerTurn', turn: last ? 1 : 0 }]
    return st
  }

  it('Brutal Strength: on his last card, the one just wounded is pushed onto a bear trap', () => {
    const st = attacked(true, true)
    const a = botMove(st, 1)
    expect(a).toMatchObject({ t: 'perk', perk: 'brutal_strength', use: true })
    expect(a?.t === 'perk' && pathState(st, a.choice!.path!).trap).toBe(true)
  }, 60_000)

  it('Brutal Strength: with no bear trap and no pallet to push them through, it is passed up', () => {
    for (const st of [attacked(false, false), attacked(true, false)]) {
      const a = botMove(st, 1)
      // passed up, to be asked again later in the round
      expect(a).toMatchObject({ t: 'perk', perk: 'brutal_strength', use: false })
      expect(a?.t === 'perk' && a.quiet).toBeFalsy()
    }
  })

  it('Brutal Strength: a pallet on a path out is weighed — the push breaks it (p.14)', () => {
    const st = attacked(true, false)
    const w = { k: 'afterAttack', target: 0 } as const
    const path = perkChoices(st, 'brutal_strength', 'killer', w)[0].path!
    const pallet = st.props.find((p) => p.kind === 'pallet')!
    Object.assign(pallet, { room: null, path, revealed: true, removed: false })
    // with the pallet there the use is no longer gated away; whether he takes it is the score's call
    const a = botMove(st, 1)
    expect(a).toMatchObject({ t: 'perk', perk: 'brutal_strength' })
    if (a?.t === 'perk' && a.use) expect(palletOn(st, a.choice!.path!)).toBeTruthy()
  }, 60_000)

  it('a survivor bot still declines its perks for the round', () => {
    let st = createGame({ board: 'macmillan', survivors: ['dwight', 'meg', 'claudette', 'jake'].map((id) => ({ id, name: id })), killer: { id: 'trapper', name: 'trapper' }, players: 5, seed: 9, bots: [1, 2, 3, 4, 5] })
    while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
    const perk = st.survivors[0].perks[0]
    st.step = { t: 'offer', perk, owner: 0, w: { k: 'planningStart' }, done: [] }
    expect(botMove(st, 2)).toMatchObject({ t: 'perk', use: false, quiet: true })
  })
})
