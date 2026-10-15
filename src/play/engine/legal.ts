// Every legal action in a state. Used by the tests (random playthroughs) and usable by a bot.

import {
  anyMoves,
  carryMoves,
  itemUses,
  killerInteractions,
  killerMoves,
  hookHere,
  isPower,
  offeredPerks,
  perkButtons,
  perkChoices,
  phantasmInteractions,
  propsIn,
  rerollers,
  survivorInteractions,
  survivorMoves,
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
    case 'planSurvivors':
      for (const cards of survivorPlans(st)) out.push({ t: 'planSurvivors', cards })
      break
    case 'planKiller':
      for (const l of st.killer.hand) for (const r of st.killer.hand) if (l !== r) out.push({ t: 'planKiller', cards: [l, r] })
      break
    case 'survivorMove':
      for (const m of survivorMoves(st, step.s, step.card)) out.push({ t: 'move', path: m.path.id })
      break
    case 'anyMove':
      for (const m of anyMoves(st, step.s)) out.push({ t: 'move', path: m.path.id })
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
    case 'roll':
      if (step.keep) step.dice.forEach((_, die) => out.push({ t: 'acceptRoll', die }))
      else out.push({ t: 'acceptRoll' })
      for (const s of rerollers(st)) step.dice.forEach((d, die) => !d.rerolled && out.push({ t: 'reroll', s, die }))
      break
    case 'offer':
      for (const perk of offeredPerks(step))
        for (const choice of perkChoices(st, perk, step.owner, step.w)) out.push({ t: 'perk', perk, use: true, choice })
      out.push({ t: 'perk', perk: step.perk, use: false }, { t: 'perk', perk: step.perk, use: false, quiet: true })
      break
    case 'turnStart':
      out.push({ t: 'continue' })
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
    case 'replaceCard':
      for (const card of new Set(st.survivorHands[st.survivors[step.s].hand])) out.push({ t: 'replace', card })
      break
    case 'killerMove':
      for (const m of killerMoves(st, step.card)) out.push({ t: 'move', path: m.path.id })
      break
    case 'killerInteract':
      if (step.canInteract) for (const i of killerInteractions(st)) if (!step.powerOnly || isPower(i)) out.push({ t: 'interact', i })
      out.push({ t: 'endTurn' })
      break
    case 'killerBonusOffer':
      for (const c of st.killer.hand) out.push({ t: 'bonus', card: c })
      out.push({ t: 'declineBonus' })
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

/** Every way to assign one card per survivor, sharing hands between survivors of one player. */
function survivorPlans(st: GameState): (MoveCard | null)[][] {
  const results: (MoveCard | null)[][] = []
  const pick = (i: number, acc: (MoveCard | null)[], hands: MoveCard[][]) => {
    if (i === 4) return void results.push([...acc])
    const sv = st.survivors[i]
    if (sv.status === 'hooked') return pick(i + 1, [...acc, null], hands)
    for (const c of new Set(hands[sv.hand])) {
      const next = hands.map((h, j) => (j === sv.hand ? h.filter((x, k) => k !== h.indexOf(c) || x !== c) : h))
      pick(i + 1, [...acc, c], next)
    }
  }
  pick(0, [], st.survivorHands)
  return results
}
