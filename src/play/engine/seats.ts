// Who plays what in an online game. Players are numbered 1..n (player 1 is the killer); each
// survivor belongs to a hand, and each hand to a player (`state.handPlayers`, p.19).
//
// `actorsOf` says which players the game is waiting on; `mayAct` checks that a player is allowed
// to send an action. The engine itself still decides whether the action is legal.

import type { Action, GameState, PerkOwner } from './types'

export const KILLER_PLAYER = 1

/** Player controlling survivor `s`. */
export function playerOfSurvivor(st: GameState, s: number): number {
  return st.handPlayers[st.survivors[s].hand]
}

export function playerOfOwner(st: GameState, owner: PerkOwner): number {
  return owner === 'killer' ? KILLER_PLAYER : playerOfSurvivor(st, owner)
}

/** Survivor or killer whose decision the current step waits for (null: several, or nobody). */
export function stepOwner(st: GameState): PerkOwner | null {
  const s = st.step
  switch (s.t) {
    case 'setupReveal':
    case 'survivorMove':
    case 'survivorInteract':
    case 'bonusOffer':
    case 'anyMove':
    case 'keepItem':
    case 'turnStart':
    case 'sparkChoice':
    case 'replaceCard':
    case 'redeemerGuess':
      return s.s
    case 'revealProp':
      return s.who
    case 'offer':
      return s.owner
    case 'roll':
      return s.ctx.s
    case 'planKiller':
    case 'killerMove':
    case 'killerInteract':
    case 'killerBonusOffer':
    case 'carryDice':
    case 'carryMove':
    case 'pickSurvivor':
    case 'phantasmChoice':
      return 'killer'
    default:
      return null
  }
}

/** Survivor hands that still have to send their planning cards. */
export function handsToPlan(st: GameState): number[] {
  if (st.step.t !== 'planSurvivors') return []
  const draft = st.planDraft ?? []
  const hands = new Set<number>()
  st.survivors.forEach((sv, i) => {
    if (sv.status !== 'hooked' && !draft[i]) hands.add(sv.hand)
  })
  return [...hands].sort()
}

/** Players the game is waiting on right now. */
export function actorsOf(st: GameState): number[] {
  const s = st.step
  if (s.t === 'gameOver' || s.t === 'idle') return []
  if (s.t === 'planSurvivors') return [...new Set(handsToPlan(st).map((h) => st.handPlayers[h]))]
  if (s.t === 'reaction') return [...new Set(s.holders.map((h) => playerOfSurvivor(st, h)))]
  const owner = stepOwner(st)
  return owner === null ? [] : [playerOfOwner(st, owner)]
}

/** Whether `player` may send `action` now (legality is the engine's job). */
export function mayAct(st: GameState, player: number, action: Action): boolean {
  // Items and re-rolls belong to their holder and can be used outside their own step.
  if (action.t === 'useItem' || action.t === 'reroll') return playerOfSurvivor(st, action.s) === player
  if (action.t === 'react') return st.step.t === 'reaction' && actorsOf(st).includes(player) && (action.s === null || playerOfSurvivor(st, action.s) === player)
  if (action.t === 'planHand') return st.step.t === 'planSurvivors' && st.handPlayers[action.hand] === player
  // The whole-table planning action only makes sense on one shared device.
  if (action.t === 'planSurvivors') return false
  return actorsOf(st).includes(player)
}
