// Who plays what in an online game. Players are numbered 1..n (player 1 is the killer); each
// survivor belongs to a hand, and each hand to a player (`state.handPlayers`, p.19).
//
// `actorsOf` says which players the game is waiting on; `mayAct` checks that a player is allowed
// to send an action. The engine itself still decides whether the action is legal.

import { crowdPledges, pledgedPay, rollHelpers, weavePledges, weavers, WEAVING_COST } from './engine'
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
    case 'planStridor':
    case 'survivorMove':
    case 'innerFocus':
    case 'empathyAsk':
    case 'survivorInteract':
    case 'bonusOffer':
    case 'anyMove':
    case 'keepItem':
    case 'pickItem':
    case 'selfAware':
    case 'turnStart':
    case 'sparkChoice':
    case 'replaceCard':
    case 'redeemerGuess':
    case 'crowdPay':
    case 'weavePay':
    case 'purgeChoice':
      return s.s
    case 'revealProp':
      return s.who
    case 'offer':
      return s.owner
    case 'roll':
      return s.ctx.s
    case 'planKiller':
    case 'killerMove':
    case 'killerAnyMove':
    case 'killerInteract':
    case 'killerBonusOffer':
    case 'machineLearning':
    case 'carryDice':
    case 'carryMove':
    case 'pickSurvivor':
    case 'phantasmChoice':
    case 'twinChoice':
    case 'crowdPick':
    case 'reignCard':
    case 'reignPath':
    case 'carnifexProp':
    case 'carnifexMove':
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
    // a survivor on a hook, or already face up from Stridor, needs no card here
    if (sv.status !== 'hooked' && sv.planned === null && !draft[i]) hands.add(sv.hand)
  })
  return [...hands].sort()
}

/** Players the game is waiting on right now. */
export function actorsOf(st: GameState): number[] {
  const s = st.step
  if (s.t === 'gameOver' || s.t === 'idle') return []
  // Planning runs for everyone at once: the survivor hands still to come in, and the killer
  // until he has set his two cards.
  if (s.t === 'planSurvivors')
    return [...new Set(handsToPlan(st).map((h) => st.handPlayers[h])), ...(st.killerDraft ? [] : [KILLER_PLAYER])].sort((a, b) => a - b)
  if (s.t === 'reaction') return [...new Set(s.holders.map((h) => playerOfSurvivor(st, h)))]
  // A roll a key or Iron Will can change: the roller, and everyone else still to decide.
  if (s.t === 'roll')
    return [...new Set([s.ctx.s, ...rollHelpers(st)].map((h) => playerOfSurvivor(st, h)))].sort((a, b) => a - b)
  // Crowd Control: every survivor's player, until the chosen survivor's player confirms — each
  // may still change what they put in
  if (s.t === 'crowdPay') return [...new Set(st.survivors.map((_, i) => playerOfSurvivor(st, i)))].sort((a, b) => a - b)
  // Weaving Spiders: the players of everyone in her room, until she confirms
  if (s.t === 'weavePay') return [...new Set([s.s, ...weavers(st, s.s)].map((i) => playerOfSurvivor(st, i)))].sort((a, b) => a - b)
  const owner = stepOwner(st)
  return owner === null ? [] : [playerOfOwner(st, owner)]
}

/** Whether `player` may send `action` now (legality is the engine's job). */
export function mayAct(st: GameState, player: number, action: Action): boolean {
  // Items and re-rolls belong to their holder and can be used outside their own step.
  if (action.t === 'useItem' || action.t === 'reroll' || action.t === 'passRoll') return playerOfSurvivor(st, action.s) === player
  // the roll itself is the roller's: a key holder waiting on it can't accept it for them
  if (action.t === 'acceptRoll') return st.step.t === 'roll' && playerOfSurvivor(st, st.step.ctx.s) === player
  if (action.t === 'react') return st.step.t === 'reaction' && actorsOf(st).includes(player) && (action.s === null || playerOfSurvivor(st, action.s) === player)
  if (action.t === 'planHand') return st.step.t === 'planSurvivors' && st.handPlayers[action.hand] === player
  // two players: the one survivor player sets the cards
  if (action.t === 'planNext') return st.step.t === 'planSurvivors' && st.handPlayers[0] === player
  // planning runs for everyone at once, so both actions are legal in the same step: each belongs
  // to its own side
  if (action.t === 'planKiller') return player === KILLER_PLAYER && actorsOf(st).includes(player)
  if (action.t === 'unplanKiller') return player === KILLER_PLAYER && st.step.t === 'planSurvivors' && !!st.killerDraft
  if (action.t === 'unplanHand') return st.step.t === 'planSurvivors' && st.handPlayers[action.hand] === player
  // Crowd Control: a survivor's ▲ are put in by their own player; the payment is what was put in
  if (action.t === 'crowdPledge') return st.step.t === 'crowdPay' && playerOfSurvivor(st, action.s) === player
  if (action.t === 'crowdPay') {
    const s = st.step
    // the confirm is the chosen survivor's: it's their card the killer would set
    if (s.t !== 'crowdPay' || playerOfSurvivor(st, s.s) !== player) return false
    const pledge = s.pledge ?? crowdPledges(st)
    const pay = pledgedPay(pledge)
    // refusing: only once everyone has said and it came short of 2
    if (!action.pay.length) return pay.length < 2 && pledge.every((p) => p !== null)
    return pay.length === 2 && JSON.stringify(pay) === JSON.stringify(action.pay)
  }
  // Weaving Spiders: a survivor's ▲ are put in by their own player; Sable's player pays what was
  // put in (6 ▲), or calls it off at any time
  if (action.t === 'weavePledge') return st.step.t === 'weavePay' && playerOfSurvivor(st, action.s) === player
  if (action.t === 'weavePay') {
    const s = st.step
    if (s.t !== 'weavePay' || playerOfSurvivor(st, s.s) !== player) return false
    if (!action.pay.length) return true
    const pay = pledgedPay(s.pledge ?? weavePledges(st, s.s))
    return pay.length === WEAVING_COST && JSON.stringify(pay) === JSON.stringify(action.pay)
  }
  // The whole-table planning action only makes sense on one shared device.
  if (action.t === 'planSurvivors') return false
  return actorsOf(st).includes(player)
}
