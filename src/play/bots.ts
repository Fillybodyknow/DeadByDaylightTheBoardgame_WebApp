// The computer's seats in a game on one shared device (offline): which players are bots
// (`GameState.bots`), when one is waited on, and its move (engine/bot.ts). The screen plays the
// bots' moves itself, after the animations before them, so the people at the table see each one.
//
// On one device the survivors plan together, the killer after them (Planning): a bot's hand is
// set along with the people's, or by itself when no person plans. The people may only make their
// own moves, and a hand-off curtain is only for hiding things between people of both sides.

import { botMove } from './engine/bot'
import { twoPlayer } from './engine/engine'
import { KILLER_PLAYER, actorsOf, handsToPlan, mayAct } from './engine/seats'
import type { Action, GameState, MoveCard } from './engine/types'

export const isBot = (st: GameState, player: number) => !!st.bots?.includes(player)

/** The players at the table: the killer, then each survivor hand's. */
const players = (st: GameState) => [KILLER_PLAYER, ...new Set(st.handPlayers)]

/** Whether the people play both sides (then hidden things need the hand-off curtain). */
export function peopleOnBothSides(st: GameState): boolean {
  if (!st.bots?.length) return true
  return !isBot(st, KILLER_PLAYER) && st.handPlayers.some((p) => !isBot(st, p))
}

/**
 * Who the game waits on, as one shared device sees it: the survivors' planning is theirs alone
 * (the killer plans after them, his own step), else the engine's.
 */
function waitedOn(st: GameState): number[] {
  if (st.step.t === 'planSurvivors') return twoPlayer(st) ? [st.handPlayers[0]] : [...new Set(handsToPlan(st).map((h) => st.handPlayers[h]))]
  return actorsOf(st)
}

/** The game waits on bots only: nothing on screen is for the people now. */
export function botsOnly(st: GameState): boolean {
  if (!st.bots?.length || st.phase === 'over') return false
  const who = waitedOn(st)
  return who.length > 0 && who.every((p) => isBot(st, p))
}

/** The bot players being waited on (to name them while they think). */
export const botsWaitedOn = (st: GameState) => waitedOn(st).filter((p) => isBot(st, p))

/**
 * The cards of the bots' survivors, for the survivors' planning on one device (by survivor index,
 * null for the people's): what each bot hand sets, as online it sends its own.
 */
export function botPlanCards(st: GameState): (MoveCard | null)[] {
  const cards: (MoveCard | null)[] = [null, null, null, null]
  if (st.step.t !== 'planSurvivors' || twoPlayer(st)) return cards
  for (const hand of handsToPlan(st)) {
    const p = st.handPlayers[hand]
    if (!isBot(st, p)) continue
    const a = botMove(st, p)
    if (a?.t === 'planHand') a.cards.forEach((c, i) => c && st.survivors[i].hand === hand && (cards[i] = c))
  }
  return cards
}

/**
 * A bot is to move now: only bots are waited on, or a bot is among those of a step everyone
 * answers (Crowd Control, Weaving Spiders), where it answers alongside the people.
 */
export function botTurn(st: GameState): boolean {
  if (botsOnly(st)) return true
  return (st.step.t === 'crowdPay' || st.step.t === 'weavePay') && waitedOn(st).some((p) => isBot(st, p))
}

/** The bots' next move on one device, or null while a person is to move (or nothing is waited on). */
export function botAction(st: GameState): Action | null {
  if (!botTurn(st)) return null
  // the survivors' planning, every hand a bot's: set all at once, as one device does
  if (st.step.t === 'planSurvivors' && !twoPlayer(st)) return { t: 'planSurvivors', cards: botPlanCards(st) }
  for (const p of waitedOn(st)) {
    if (!isBot(st, p)) continue
    const a = botMove(st, p)
    if (a) return a
  }
  return null
}

/**
 * Online: a bot the game waits on and its move. Each player sends their own moves online, a bot's
 * too (a hand's plan at a time, the killer's alongside), from the device that plays the bots.
 * `standIns`: people's seats a bot plays for now (their player gone, session.ts).
 */
export function onlineBotMove(st: GameState, standIns: number[] = []): { player: number; action: Action } | null {
  if ((!st.bots?.length && !standIns.length) || st.phase === 'over') return null
  for (const p of actorsOf(st)) {
    if (!isBot(st, p) && !standIns.includes(p)) continue
    const action = botMove(st, p)
    if (action) return { player: p, action }
  }
  return null
}

/**
 * Whether a person at the device may make this move (the bots' are theirs): a move one of the
 * people's players may send, or the survivors' planning on one device while a person plans in it.
 */
export function peopleMay(st: GameState, action: Action): boolean {
  if (!st.bots?.length) return true
  if (action.t === 'planSurvivors') return st.step.t === 'planSurvivors' && waitedOn(st).some((p) => !isBot(st, p))
  return players(st).some((p) => !isBot(st, p) && mayAct(st, p, action))
}
