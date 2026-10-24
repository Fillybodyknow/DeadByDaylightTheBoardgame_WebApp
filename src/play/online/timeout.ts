// The room's turn timer (room settings): what a player's device answers for them when their time
// runs out. Only decisions that can be passed over are answered — "no" to a perk, an item or a
// bonus turn, a roll taken as rolled, nothing put in for Crowd Control. A move, an interaction or
// the planning is the player's own: running out of time on those only tells the room.

import { pledgedPay, crowdPledges, rollHelpers, tryApply, weavePledges, WEAVING_COST } from '../engine/engine'
import { mayAct, playerOfOwner, playerOfSurvivor } from '../engine/seats'
import type { Action, GameState } from '../engine/types'

/** One answer for `seat` in this state, or null when there is none to give for them. */
function answer(st: GameState, seat: number): Action | null {
  const s = st.step
  const mine = (sv: number) => playerOfSurvivor(st, sv) === seat
  switch (s.t) {
    case 'offer':
      return playerOfOwner(st, s.owner) === seat ? { t: 'perk', perk: s.perk, use: false } : null
    case 'reaction':
      // nobody reacts — only when every holder is this player's (the others still decide)
      return s.holders.every(mine) ? { t: 'react', s: null } : null
    case 'bonusOffer':
    case 'killerBonusOffer':
      return { t: 'declineBonus' }
    case 'turnStart':
      return { t: 'continue' }
    case 'phantasmChoice':
      return { t: 'phantasm', teleport: false }
    case 'twinChoice':
      return { t: 'twin', victor: false }
    case 'roll': {
      // helpers pass; the roller takes the roll (Bond: the better die)
      const helper = rollHelpers(st).find((h) => h !== s.ctx.s && mine(h))
      if (helper !== undefined) return { t: 'passRoll', s: helper }
      if (!mine(s.ctx.s)) return null
      if (!s.keep) return { t: 'acceptRoll' }
      const best = s.dice.reduce((b, d, i) => (d.face > s.dice[b].face ? i : b), 0)
      return { t: 'acceptRoll', die: best }
    }
    case 'crowdPay': {
      const pledge = s.pledge ?? crowdPledges(st)
      const open = pledge.findIndex((p, i) => p === null && mine(i))
      if (open >= 0) return { t: 'crowdPledge', s: open, n: 0 }
      // the chosen survivor's player confirms what was put in, once everyone has said
      if (!mine(s.s) || pledge.some((p) => p === null)) return null
      const pay = pledgedPay(pledge)
      return { t: 'crowdPay', pay: pay.length === 2 ? pay : [] }
    }
    case 'weavePay': {
      // nothing put in for those out of time; Sable pays what came in, or calls it off
      const pledge = s.pledge ?? weavePledges(st, s.s)
      const open = pledge.findIndex((p, i) => p === null && mine(i))
      if (open >= 0) return { t: 'weavePledge', s: open, n: 0 }
      if (!mine(s.s) || pledge.some((p) => p === null)) return null
      const pay = pledgedPay(pledge)
      return { t: 'weavePay', pay: pay.length === WEAVING_COST ? pay : [] }
    }
    default:
      return null
  }
}

/**
 * What `seat` answers when their time is up. One decision only: a roll or Crowd Control may take
 * a few answers (each helper's pass, each survivor's ▲), but a new question that follows gets its
 * own time.
 */
export function timeoutActions(st: GameState, seat: number): Action[] {
  const out: Action[] = []
  let cur: GameState | null = st
  for (let n = 0; n < 8 && cur && cur.step.t === st.step.t; n++) {
    const a = answer(cur, seat)
    if (!a || !mayAct(cur, seat, a)) break
    const next = tryApply(cur, a)
    if (!next) break
    out.push(a)
    cur = next
    if (st.step.t !== 'roll' && st.step.t !== 'crowdPay' && st.step.t !== 'weavePay') break
  }
  return out
}
