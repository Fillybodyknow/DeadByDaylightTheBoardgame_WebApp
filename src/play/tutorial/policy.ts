// Who acts in a tutorial chapter, and how the tutorial plays everyone but the learner.

import { legalActions } from '../engine/legal'
import { stepOwner } from '../engine/seats'
import type { Action, GameState, PerkOwner } from '../engine/types'
import { LEARNER } from './types'

/**
 * The game waits on the learner (`who`): their own step, or the survivors' planning when they play
 * a survivor (the killer's planning comes after it, a step of his own).
 */
export function learnersTurn(st: GameState, who: PerkOwner = LEARNER): boolean {
  if (st.step.t === 'planSurvivors') return who !== 'killer'
  return stepOwner(st) === who
}

/** The plainest move: plan to wait, end the turn, pass a perk; otherwise the first legal one. */
export function plainest(st: GameState): Action | null {
  const acts = legalActions(st)
  if (!acts.length) return null
  if (st.step.t === 'planKiller') {
    const waits = (a: Action) => (a.t === 'planKiller' ? a.cards.filter((c) => c === 'wait').length : 0)
    return [...acts].sort((x, y) => waits(y) - waits(x))[0]
  }
  const quiet = acts.find((a) => ['continue', 'endTurn', 'declineBonus', 'stop'].includes(a.t) || (a.t === 'perk' && !a.use && !a.quiet))
  return quiet ?? acts[0]
}
