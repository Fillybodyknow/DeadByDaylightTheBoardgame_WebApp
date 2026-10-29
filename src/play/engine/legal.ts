// Every legal action in a state. Used by the tests (random playthroughs) and usable by a bot.

import {
  anyMoves,
  carryMoves,
  crowdPayments,
  carnifexProps,
  connectedRoomsOf,
  crowdPledges,
  pledgedPay,
  weavePledges,
  WEAVING_COST,
  purgeOptions,
  antidoteKillerMoves,
  darkMoves,
  reignCards,
  itemUses,
  killerInteractions,
  killerCardCount,
  killerMoves,
  hookHere,
  isPower,
  KILLER_CARDS,
  mustMove,
  offeredPerks,
  perkButtons,
  perkChoices,
  phantasmInteractions,
  propsIn,
  rerollers,
  rollHelpers,
  survivorInteractions,
  survivorMoves,
  twoPlayer,
} from './engine'
import { boards } from './boards'
import type { Action, GameState, MoveCard } from './types'

export function legalActions(st: GameState): Action[] {
  const step = st.step
  const out: Action[] = []
  switch (step.t) {
    case 'setupReveal':
      for (const p of faceDown(st)) out.push({ t: 'setupReveal', prop: p })
      break
    case 'revealProp':
      for (const p of propsIn(st, step.room)) if (!p.revealed) out.push({ t: 'reveal', prop: p.id })
      break
    case 'planStridor':
      for (const c of new Set(st.survivorHands[st.survivors[step.s].hand])) out.push({ t: 'planStridor', card: c })
      break
    case 'planSurvivors':
      // The online-only actions of this step are left out, as `planHand` is: the killer may also
      // send `planKiller` here (he plans at the same time), and each player sends their own hand.
      // two players: one card at a time, to the next survivor in turn order (p.6)
      if (twoPlayer(st)) for (const card of new Set(st.survivorHands[0])) out.push({ t: 'planNext', card })
      else for (const cards of survivorPlans(st)) out.push({ t: 'planSurvivors', cards })
      break
    case 'planKiller':
      out.push(...killerPlans(st))
      break
    case 'survivorMove':
      for (const m of survivorMoves(st, step.s, step.card)) out.push({ t: 'move', path: m.path.id })
      break
    case 'anyMove':
      for (const m of anyMoves(st, step.s)) out.push({ t: 'move', path: m.path.id })
      // Dead Hard's and Spine Chill's moves are a must
      if (!mustMove(step.why)) out.push({ t: 'stop' })
      break
    case 'survivorInteract':
      if (step.canInteract) for (const i of survivorInteractions(st, step.s)) out.push({ t: 'interact', i })
      out.push({ t: 'endTurn' })
      break
    case 'bonusOffer':
      for (const c of new Set(st.survivorHands[st.survivors[step.s].hand])) out.push({ t: 'bonus', card: c })
      out.push({ t: 'declineBonus' })
      break
    case 'keepItem':
      out.push({ t: 'keepItem', keep: 'new' }, { t: 'keepItem', keep: 'old' })
      break
    case 'pickItem':
      step.drawn.forEach((_, item) => out.push({ t: 'pickItem', item }))
      break
    case 'machineLearning':
    case 'selfAware':
      for (const perk of step.cards) out.push({ t: 'selfAware', perk })
      break
    case 'roll':
      if (step.keep) step.dice.forEach((_, die) => out.push({ t: 'acceptRoll', die }))
      else out.push({ t: 'acceptRoll' })
      for (const s of rerollers(st)) step.dice.forEach((d, die) => !d.rerolled && out.push({ t: 'reroll', s, die }))
      // the roller passes by accepting; anyone else who could change the roll passes on their own
      for (const s of rollHelpers(st)) if (s !== step.ctx.s) out.push({ t: 'passRoll', s })
      break
    case 'offer':
      for (const perk of offeredPerks(step))
        for (const choice of perkChoices(st, perk, step.owner, step.w)) out.push({ t: 'perk', perk, use: true, choice })
      out.push({ t: 'perk', perk: step.perk, use: false }, { t: 'perk', perk: step.perk, use: false, quiet: true })
      break
    case 'turnStart':
      out.push({ t: 'continue' })
      break
    case 'carnifexProp':
      for (const p of carnifexProps(st)) out.push({ t: 'guardProp', prop: p.id })
      break
    case 'carnifexMove':
      for (const room of connectedRoomsOf(st, st.guards!.carnifex!)) out.push({ t: 'guardRoom', room })
      break
    case 'pickSurvivor':
      for (const s of step.options) out.push({ t: 'pick', s })
      break
    case 'sparkChoice':
      out.push({ t: 'spark', pay: false })
      if (st.survivors[step.s].bp >= 1) out.push({ t: 'spark', pay: true })
      break
    case 'phantasmChoice':
      out.push({ t: 'phantasm', teleport: false })
      if (st.killer.bp >= step.face) {
        out.push({ t: 'phantasm', teleport: true })
        for (const i of phantasmInteractions(st, step.room)) out.push({ t: 'phantasm', teleport: true, i })
      }
      break
    case 'purgeChoice':
      for (const perk of purgeOptions(st, step.s, step.mode)) out.push({ t: 'purgeChoice', perk })
      break
    case 'replaceCard':
      for (const card of new Set(st.survivorHands[st.survivors[step.s].hand])) out.push({ t: 'replace', card })
      break
    case 'crowdPay':
      for (const pay of crowdPayments(st)) out.push({ t: 'crowdPay', pay })
      {
        // online: each survivor still to say puts in what they can
        const pledge = step.pledge ?? crowdPledges(st)
        const total = pledge.reduce<number>((t, p) => t + (p ?? 0), 0)
        pledge.forEach((p, s) => {
          if (p === null) for (let n = 0; n <= Math.min(2, st.survivors[s].bp, 2 - total); n++) out.push({ t: 'crowdPledge', s, n })
        })
      }
      break
    case 'weavePay': {
      // each survivor in her room still to say puts in what they can; at 6 she pays, or calls it off
      const pledge = step.pledge ?? weavePledges(st, step.s)
      const total = pledge.reduce<number>((t, p) => t + (p ?? 0), 0)
      pledge.forEach((p, s) => {
        if (p === null) for (let n = 0; n <= Math.min(st.survivors[s].bp, WEAVING_COST - total); n++) out.push({ t: 'weavePledge', s, n })
      })
      if (total === WEAVING_COST) out.push({ t: 'weavePay', pay: pledgedPay(pledge) })
      out.push({ t: 'weavePay', pay: [] })
      break
    }
    case 'empathyAsk':
      out.push({ t: 'empathyAnswer', yes: true }, { t: 'empathyAnswer', yes: false })
      break
    case 'innerFocus':
      for (const face of step.faces) out.push({ t: 'innerFocus', face })
      break
    case 'reignCard':
      for (const card of reignCards(st, step.s)) out.push({ t: 'reignCard', card })
      break
    case 'reignPath':
      for (const m of survivorMoves(st, step.s, step.card)) out.push({ t: 'move', path: m.path.id })
      break
    case 'crowdPick':
      for (const card of new Set(st.survivorHands[st.survivors[step.s].hand])) out.push({ t: 'crowdPick', card })
      break
    case 'redeemerGuess':
      for (const card of KILLER_CARDS) out.push({ t: 'guess', card })
      break
    case 'twinChoice':
      out.push({ t: 'twin', victor: false }, { t: 'twin', victor: true })
      break
    case 'killerMove':
      for (const m of killerMoves(st, step.card)) out.push({ t: 'move', path: m.path.id })
      break
    case 'killerAnyMove':
      for (const m of step.why === 'darkness' ? darkMoves(st) : antidoteKillerMoves(st)) out.push({ t: 'move', path: m.path.id })
      out.push({ t: 'stop' })
      break
    case 'killerInteract':
      if (step.canInteract) for (const i of killerInteractions(st)) if (!step.powerOnly || isPower(i)) out.push({ t: 'interact', i })
      out.push({ t: 'endTurn' })
      break
    case 'killerBonusOffer':
      for (const c of st.killer.hand) out.push({ t: 'bonus', card: c })
      // Slipstream's bonus turn is taken
      if (!step.free) out.push({ t: 'declineBonus' })
      break
    case 'carryDice':
      for (const n of [1, 2, 3, 4]) out.push({ t: 'carryDice', n })
      if (hookHere(st)) out.push({ t: 'hang' })
      break
    case 'carryMove':
      for (const m of carryMoves(st)) out.push({ t: 'move', path: m.path.id })
      out.push({ t: 'stop' })
      if (hookHere(st)) out.push({ t: 'hang' })
      break
    case 'reaction':
      for (const s of step.holders) out.push({ t: 'react', s })
      out.push({ t: 'react', s: null })
      break
  }
  for (const b of perkButtons(st)) for (const choice of b.choices) out.push({ t: 'perk', perk: b.perk, use: true, choice })
  st.survivors.forEach((_, s) => {
    for (const use of itemUses(st, s)) {
      if (use.k === 'reveal') {
        const props = faceDown(st)
        if (props.length) out.push({ t: 'useItem', s, use: { k: 'reveal', props: props.slice(0, 3) } })
      } else out.push({ t: 'useItem', s, use })
    }
  })
  return out
}

function faceDown(st: GameState): string[] {
  return boards[st.board].rooms.flatMap((r) => propsIn(st, r.id).filter((p) => !p.revealed).map((p) => p.id))
}

/** The killer's two cards, by place in the hand (The Blight holds two copies of each). */
function killerPlans(st: GameState): Action[] {
  // two cards in order (The Unknown: one per Unknown on the board), by place in the hand
  const n = killerCardCount(st)
  const out: Action[] = []
  const pick = (used: number[]) => {
    if (used.length === n) return void out.push({ t: 'planKiller', cards: used.map((h) => st.killer.hand[h]) })
    st.killer.hand.forEach((_, h) => !used.includes(h) && pick([...used, h]))
  }
  pick([])
  return out
}

/** Every way to assign one card per survivor, sharing hands between survivors of one player. */
function survivorPlans(st: GameState): (MoveCard | null)[][] {
  const results: (MoveCard | null)[][] = []
  const pick = (i: number, acc: (MoveCard | null)[], hands: MoveCard[][]) => {
    if (i === 4) return void results.push([...acc])
    const sv = st.survivors[i]
    // hooked, or already face up from Stridor: no card of their own here
    if (sv.status === 'hooked' || sv.planned !== null) return pick(i + 1, [...acc, null], hands)
    for (const c of new Set(hands[sv.hand])) {
      const next = hands.map((h, j) => (j === sv.hand ? h.filter((x, k) => k !== h.indexOf(c) || x !== c) : h))
      pick(i + 1, [...acc, c], next)
    }
  }
  pick(0, [], st.survivorHands)
  return results
}
