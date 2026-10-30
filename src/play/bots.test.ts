import { describe, expect, it } from 'vitest'
import { botAction, botPlanCards, botTurn, botsOnly, onlineBotMove, peopleMay, peopleOnBothSides } from './bots'
import { botMove } from './engine/bot'
import { apply, createGame } from './engine/engine'
import { legalActions } from './engine/legal'
import { actorsOf, mayAct } from './engine/seats'
import type { Action, GameState } from './engine/types'

function game(bots: number[], players: 2 | 3 | 4 | 5 = 5, seed = 11): GameState {
  let st = createGame({ board: 'macmillan', survivors: ['dwight', 'meg', 'claudette', 'jake'].map((id) => ({ id, name: id })), killer: { id: 'trapper', name: 'trapper' }, players, seed, bots })
  while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
  return st
}

/**
 * Play on one device: the bots' moves from the driver (`botAction`), a person's from `person`, and
 * every person's move checked to be theirs to make.
 */
function playOffline(st: GameState, person: (st: GameState) => Action, rounds: number): GameState {
  for (let n = 0; n < 4000 && st.phase !== 'over' && st.round <= rounds; n++) {
    const a = botTurn(st) ? botAction(st) : person(st)
    if (!a) throw new Error(`nothing to play at ${st.step.t}`)
    if (!botTurn(st)) expect(peopleMay(st, a), `${a.t} at ${st.step.t}`).toBe(true)
    st = apply(st, a)
  }
  return st
}

describe('bots on one device', () => {
  it('plays four bot survivors against a person as the killer', () => {
    const st0 = game([2, 3, 4, 5])
    expect(peopleOnBothSides(st0)).toBe(false)
    // the survivors' planning is the bots' alone: set at once
    expect(botsOnly(st0)).toBe(true)
    expect(botAction(st0)).toMatchObject({ t: 'planSurvivors' })
    // the person (a stand-in playing the killer's moves) is waited on in his own steps
    const st = playOffline(st0, (s) => botMove(s, 1) ?? legalActions(s)[0], 4)
    expect(st.round > 4 || st.phase === 'over').toBe(true)
  }, 120_000)

  it('lets a person plan with the bots, and only make their own moves', () => {
    const st = game([1, 3, 4, 5])
    expect(peopleOnBothSides(st)).toBe(false)
    // a person plans: the survivors' planning waits on them, not only on bots
    expect(botsOnly(st)).toBe(false)
    const bots = botPlanCards(st)
    expect(bots[0]).toBeNull()
    expect(bots.slice(1).every((c) => c !== null)).toBe(true)
    // the person's card for their survivor, the bots' for theirs: one plan for the table
    const plan: Action = { t: 'planSurvivors', cards: [st.survivorHands[0][0], ...bots.slice(1)] }
    expect(peopleMay(st, plan)).toBe(true)
    const next = apply(st, plan)
    // then the bot killer plans: none of it is the person's
    expect(next.step.t).toBe('planKiller')
    expect(botTurn(next)).toBe(true)
    const killerPlan = botAction(next)!
    expect(killerPlan.t).toBe('planKiller')
    expect(peopleMay(next, killerPlan)).toBe(false)
  })

  it('needs the hand-off curtain only with people on both sides', () => {
    expect(peopleOnBothSides(game([]))).toBe(true)
    expect(peopleOnBothSides(game([3, 4, 5]))).toBe(true)
    expect(peopleOnBothSides(game([1]))).toBe(false)
  })

  it('plays a bot survivor player of a two-player game, one card at a time', () => {
    const st = game([2], 2)
    expect(botsOnly(st)).toBe(true)
    expect(botAction(st)).toMatchObject({ t: 'planNext' })
  })
})

describe('bots online', () => {
  // each player sends their own moves, a bot's from the host's device: a hand's plan at a time
  it('plays its own seats only, a move at a time, through a game with a person in it', () => {
    let st = game([1, 3, 4, 5])
    for (let n = 0; n < 6000 && st.phase !== 'over' && st.round <= 4; n++) {
      const m = onlineBotMove(st)
      if (m) {
        expect(st.bots).toContain(m.player)
        expect(mayAct(st, m.player, m.action), `${m.action.t} at ${st.step.t}`).toBe(true)
        st = apply(st, m.action)
        continue
      }
      // nothing for the bots: the person (player 2, a stand-in playing as a bot would) is waited on
      expect(actorsOf(st)).toContain(2)
      st = apply(st, botMove(st, 2) ?? legalActions(st).find((a) => mayAct(st, 2, a))!)
    }
    expect(st.round > 4 || st.phase === 'over').toBe(true)
  }, 120_000)

  it('plans a hand at a time, not the whole table at once', () => {
    const m = onlineBotMove(game([2, 3, 4, 5]))
    expect(m).toMatchObject({ player: 2, action: { t: 'planHand' } })
  })

  it("plays a person's seat only while a bot stands in for them", () => {
    // nobody is a bot: nothing to play, until the host hands player 3 to one (gone a while)
    const st = game([])
    expect(onlineBotMove(st)).toBeNull()
    const m = onlineBotMove(st, [3])
    expect(m).toMatchObject({ player: 3, action: { t: 'planHand' } })
    expect(mayAct(st, 3, m!.action)).toBe(true)
  })
})
