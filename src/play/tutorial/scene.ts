// Building a chapter's scene: a real game on MacMillan Estate, set up and then laid out by hand —
// where everyone stands, which props lie where and face which way, what is in the hands.

import { apply, createGame, killerDeck } from '../engine/engine'
import { legalActions } from '../engine/legal'
import type { Action, GameState, MoveCard, PathKind, PropKind } from '../engine/types'

/** The learner's survivor, the three others, and a killer with nothing on the board. */
export function baseScene(seed = 11): GameState {
  let st = createGame({
    board: 'macmillan',
    survivors: [
      { id: 'dwight', name: 'Dwight' },
      { id: 'meg', name: 'Meg' },
      { id: 'claudette', name: 'Claudette' },
      { id: 'jake', name: 'Jake' },
    ],
    killer: { id: 'hillbilly', name: 'The Hillbilly' },
    players: 5,
    seed,
  })
  while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
  st = structuredClone(st)
  st.startPending = false
  st.round = 1
  st.firstPlayer = 0
  // a clean table: no perks or items to explain yet, no walls in the way, every prop face down
  st.survivors.forEach((sv) => Object.assign(sv, { perks: [], item: null, status: 'board', wounded: false, planned: null, plannedRevealed: false, acted: false }))
  st.killer.perks = []
  for (const id of Object.keys(st.paths)) st.paths[id].wall = false
  st.props.forEach((p) => p.room && (p.revealed = false))
  place(st, { 0: 'ancient-tree', 1: 'foundry-upper', 2: 'mine-depths', 3: 'coal-tower-ground' }, 'backlot')
  st.log = []
  st.queue = []
  return st
}

/** Everyone's room. */
export function place(st: GameState, survivors: Record<number, string>, killer: string) {
  for (const [s, room] of Object.entries(survivors)) st.survivors[Number(s)].room = room
  st.killer.room = killer
}

/** Rooms already laid out in a scene: their props stay where they were put. */
const arranged = new WeakMap<GameState, Set<string>>()

/** A room holds exactly these props (taken from rooms not laid out yet), face up or down. */
export function roomProps(st: GameState, room: string, kinds: PropKind[], revealed: boolean) {
  const done = arranged.get(st) ?? new Set<string>()
  arranged.set(st, done.add(room))
  const dump = ['mine-depths', 'foundry-basement', 'coal-tower-upper'].find((r) => !done.has(r))!
  for (const p of st.props) if (p.room === room && !p.removed) p.room = dump
  for (const kind of kinds) {
    const p = st.props.find((x) => x.kind === kind && x.room && !done.has(x.room) && !x.removed && !x.done && x.occupant === null && !x.path)
    if (p) Object.assign(p, { room, revealed, progress: 0 })
  }
}

/** The props in a room. */
export const propsOf = (st: GameState, room: string) => st.props.filter((p) => p.room === room && !p.removed)

/** Take a card out of a survivor's hand (it is planned, or spent). */
export function takeCard(st: GameState, s: number, card: MoveCard) {
  const hand = st.survivorHands[st.survivors[s].hand]
  const i = hand.indexOf(card)
  if (i >= 0) hand.splice(i, 1)
}

/**
 * The learner's turn, on the move: their card face up, the move to make next, then the rest of
 * the turn as the engine queues it (interact, the end of the turn).
 */
export function learnerMoving(st: GameState, card: PathKind) {
  const sv = st.survivors[0]
  takeCard(st, 0, card)
  Object.assign(sv, { planned: card, plannedRevealed: true, acted: true })
  othersPlanned(st)
  st.phase = 'survivors'
  st.activeSurvivor = 0
  st.canInteract = true
  st.step = { t: 'survivorMove', s: 0, card }
  st.queue = [
    { k: 'survivorInteract', s: 0 },
    { k: 'trigger', w: { k: 'turnEnd', s: 0 }, done: [] },
    { k: 'endSurvivorTurn', s: 0 },
  ]
}

/** The learner's turn, ready to interact in the room they are in. */
export function learnerInteracting(st: GameState) {
  const sv = st.survivors[0]
  takeCard(st, 0, 'sneak')
  Object.assign(sv, { planned: 'sneak', plannedRevealed: true, acted: true })
  othersPlanned(st)
  st.phase = 'survivors'
  st.activeSurvivor = 0
  st.canInteract = true
  st.step = { t: 'survivorInteract', s: 0, canInteract: true }
  st.queue = [
    { k: 'trigger', w: { k: 'turnEnd', s: 0 }, done: [] },
    { k: 'endSurvivorTurn', s: 0 },
  ]
}

/** The other three survivors and the killer have their cards down already (the killer waits). */
export function othersPlanned(st: GameState) {
  const cards: MoveCard[] = ['sprint', 'crouch', 'sneak']
  for (const s of [1, 2, 3]) {
    takeCard(st, s, cards[s - 1])
    Object.assign(st.survivors[s], { planned: cards[s - 1], plannedRevealed: false, acted: false })
  }
  if (!st.killer.planned.length) {
    st.killer.hand.splice(st.killer.hand.indexOf('wait'), 1)
    st.killer.planned = ['wait', st.killer.hand.includes('sneak') ? 'sneak' : st.killer.hand[0]]
    st.killer.hand.splice(st.killer.hand.indexOf(st.killer.planned[1]), 1)
  }
}

/** The killer's two cards for the round (the rest of his deck in hand). */
export function killerPlans(st: GameState, cards: [MoveCard, MoveCard]) {
  const hand = killerDeck(st.killer.characterId)
  for (const c of cards) hand.splice(hand.indexOf(c), 1)
  Object.assign(st.killer, { planned: cards, hand, revealedCount: 0 })
}

/** The killer's turn, about to interact in the room he stands in (his first card was Wait). */
export function killerInteracting(st: GameState) {
  othersPlanned(st)
  Object.assign(st.survivors[0], { planned: st.survivors[0].planned ?? 'sneak', plannedRevealed: true, acted: true })
  killerPlans(st, ['wait', 'wait'])
  st.killer.revealedCount = 1
  st.phase = 'killer'
  st.activeSurvivor = null
  st.canInteract = true
  st.step = { t: 'killerInteract', turn: 0, canInteract: true }
  st.queue = [{ k: 'endKillerTurn', turn: 0 }]
}

/** `n` generators repaired already (on the track). */
export function generatorsRepaired(st: GameState, n: number) {
  for (const g of st.props.filter((p) => p.kind === 'generator' && !p.done && !p.removed).slice(-n)) Object.assign(g, { done: true, progress: 3, revealed: true })
}

/** A prop of this kind in the room. */
export const propIn = (st: GameState, room: string, kind: string) => st.props.find((p) => p.room === room && p.kind === kind && !p.removed)

/** The first rng (from 1) under which `act` played on `st` gives a state `want` accepts. */
export function rigged(st: GameState, act: (s: GameState) => GameState, want: (s: GameState) => boolean): number {
  for (let rng = 1; rng < 5000; rng++) {
    try {
      if (want(act({ ...structuredClone(st), rng }))) return rng
    } catch {
      // that line of play wasn't legal from here: try the next
    }
  }
  return st.rng
}

/** A roll waiting on the roller is accepted (one nobody can change settles by itself). */
export function settle(st: GameState): GameState {
  let s = st
  for (let n = 0; n < 4 && s.step.t === 'roll'; n++) s = apply(s, { t: 'acceptRoll' })
  return s
}

/** Apply actions one after another. */
export const play = (st: GameState, ...actions: Action[]) => actions.reduce((s, a) => apply(s, a), st)
