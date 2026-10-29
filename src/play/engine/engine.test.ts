import { describe, expect, it } from 'vitest'
import { macmillan } from './boards'
import { apply, createGame, isFailure, killerInteractions, nextToPlan, propsIn, survivorMoves, turnOrder, tryApply, type GameConfig } from './engine'
import { legalActions } from './legal'
import { mayAct } from './seats'
import type { GameState, Prop, PropKind } from './types'

const config = (seed = 1, players: GameConfig['players'] = 5, killer = 'trapper'): GameConfig => ({
  board: 'macmillan',
  survivors: ['dwight', 'meg', 'claudette', 'jake'].map((id) => ({ id, name: id })),
  killer: { id: killer, name: killer },
  players,
  seed,
})

/** A game past the setup reveals, waiting for survivor planning. Core-rule tests play without perks. */
function planned(seed = 1, perks = false): GameState {
  let st = createGame(config(seed))
  if (!perks) {
    st.survivors.forEach((sv) => (sv.perks = []))
    st.killer.perks = []
  }
  while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
  return st
}

/** Put a revealed prop of `kind` into `room` (taking one from the supply on the board). */
function placeProp(st: GameState, kind: PropKind, room: string): Prop {
  const p = st.props.find((x) => x.kind === kind && !x.removed && !x.done && x.occupant === null && x.room !== room)!
  Object.assign(p, { room, path: null, revealed: true })
  return p
}

/** Hand the turn to survivor `s`, ready to interact. */
function survivorInteracting(st: GameState, s: number) {
  st.phase = 'survivors'
  st.activeSurvivor = s
  st.canInteract = true
  st.step = { t: 'survivorInteract', s, canInteract: true }
  st.queue = [{ k: 'endSurvivorTurn', s }]
  st.survivors.forEach((sv) => Object.assign(sv, { planned: 'sneak', plannedRevealed: true }))
  st.killer.planned = ['wait', 'wait']
}

function killerInteracting(st: GameState) {
  st.phase = 'killer'
  st.canInteract = true
  st.killer.planned = ['wait', 'sneak']
  st.killer.revealedCount = 1
  st.step = { t: 'killerInteract', turn: 0, canInteract: true }
  st.queue = [{ k: 'endKillerTurn', turn: 0 }]
}

/** Try rng seeds until `pick` accepts the result of `run`. */
function findOutcome(make: (rng: number) => GameState, pick: (st: GameState) => boolean): GameState {
  for (let rng = 1; rng < 500; rng++) {
    const st = make(rng)
    if (pick(st)) return st
  }
  throw new Error('outcome never happened')
}

describe('MacMillan board', () => {
  it('has the props of the box, by category (p.3)', () => {
    const count = (c: string) => macmillan.rooms.flatMap((r) => r.props).filter((p) => p === c).length
    expect([count('objective'), count('survival'), count('altruism'), count('boldness')]).toEqual([10, 12, 12, 10])
  })

  it('has 4 breakable walls, start faces 0–5 and valid paths', () => {
    expect(macmillan.paths.filter((p) => p.wall)).toHaveLength(4)
    expect(macmillan.rooms.map((r) => r.startFace).filter((f) => f !== null).sort()).toEqual([0, 1, 2, 3, 4, 5])
    const ids = new Set(macmillan.rooms.map((r) => r.id))
    for (const p of macmillan.paths) expect(ids.has(p.a) && ids.has(p.b)).toBe(true)
  })

  it('connects every room', () => {
    const seen = new Set([macmillan.rooms[0].id])
    for (let changed = true; changed; ) {
      changed = false
      for (const p of macmillan.paths)
        if (seen.has(p.a) !== seen.has(p.b)) {
          seen.add(p.a).add(p.b)
          changed = true
        }
    }
    expect(seen.size).toBe(macmillan.rooms.length)
  })
})

describe('setup', () => {
  it('deals all 44 props face down; the minis roll their start rooms after the reveals (p.6)', () => {
    let st = createGame(config(7))
    expect(st.props).toHaveLength(44)
    expect(st.props.every((p) => !p.revealed)).toBe(true)
    expect(st.step).toEqual({ t: 'setupReveal', s: st.firstPlayer })
    expect(st.startPending).toBe(true)
    expect(st.log.some((e) => /เริ่มที่/.test(e.text))).toBe(false)
    while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
    expect(st.startPending).toBeUndefined()
    const startRooms = macmillan.rooms.filter((r) => r.startFace !== null).map((r) => r.id)
    for (const sv of st.survivors) expect(startRooms).toContain(sv.room)
    expect(startRooms).toContain(st.killer.room)
    // the four reveals come first in the log, then the five start rolls
    const lastReveal = st.log.findLastIndex((e) => e.ev?.k === 'reveal')
    const firstStart = st.log.findIndex((e) => /เริ่มที่/.test(e.text))
    expect(firstStart).toBeGreaterThan(lastReveal)
    expect(st.log.filter((e) => /เริ่มที่/.test(e.text))).toHaveLength(5)
  })

  it("starts with the ▲ the online room set, else the rulebook's (p.6)", () => {
    const st = createGame({ ...config(2), startBp: { survivor: 0, killer: 6 } })
    expect(st.survivors.map((sv) => sv.bp)).toEqual([0, 0, 0, 0])
    expect(st.killer.bp).toBe(6)
    expect(createGame(config(2)).killer.bp).toBe(4)
  })

  it('lets each survivor reveal one prop, then plans', () => {
    const st = planned(3)
    expect(st.props.filter((p) => p.revealed)).toHaveLength(4)
    expect(st.step.t).toBe('planSurvivors')
  })

  it('shares one hand between two survivors of one player (p.19)', () => {
    let st = createGame(config(1, 3))
    while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
    expect(() => apply(st, { t: 'planSurvivors', cards: ['sneak', 'sneak', 'crouch', 'vault'] })).toThrow()
    expect(apply(st, { t: 'planSurvivors', cards: ['sneak', 'sprint', 'sneak', 'vault'] }).step.t).toBe('planKiller')
  })
})

describe('two players (p.6)', () => {
  /** A two-player game past the setup reveals, at its first planning. */
  function two(seed = 1): GameState {
    let st = createGame(config(seed, 2))
    st.survivors.forEach((sv) => (sv.perks = []))
    st.killer.perks = []
    while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
    return st
  }
  /** Every survivor card of the round, wherever it is: two sets. */
  const cardsOf = (st: GameState) => [...st.survivorHands[0], ...(st.survivorDeck ?? []), ...st.survivors.flatMap((sv) => (sv.planned ? [sv.planned] : [])), ...((st.planDraft ?? []).filter(Boolean) as string[])]

  it('one player holds the four survivors: three cards drawn from two sets', () => {
    const st = two()
    expect(st.handPlayers).toEqual([2])
    expect(st.survivors.map((sv) => sv.hand)).toEqual([0, 0, 0, 0])
    expect(st.step.t).toBe('planSurvivors')
    expect(st.survivorHands[0]).toHaveLength(3)
    expect(st.survivorDeck).toHaveLength(5)
    expect(cardsOf(st).sort()).toEqual(['crouch', 'crouch', 'sneak', 'sneak', 'sprint', 'sprint', 'vault', 'vault'])
  })

  it('a card to each survivor in turn order, one more drawn after each, and set for good', () => {
    let st = two(2)
    const order = turnOrder(st)
    expect(() => apply(st, { t: 'planSurvivors', cards: ['sneak', 'sneak', 'sneak', 'sneak'] })).toThrow()
    const chosen: string[] = []
    for (let n = 0; n < 4; n++) {
      expect(nextToPlan(st)).toBe(order[n])
      const card = st.survivorHands[0][0]
      const deckBefore = st.survivorDeck!.length
      st = apply(st, { t: 'planNext', card })
      chosen.push(card)
      if (n < 3) {
        // drawn again: three in hand, one fewer in the deck; the one set can't be taken back
        expect(st.survivorHands[0]).toHaveLength(3)
        expect(st.survivorDeck).toHaveLength(deckBefore - 1)
        expect(() => apply(st, { t: 'unplanHand', hand: 0 })).toThrow()
        expect(cardsOf(st)).toHaveLength(8)
      }
    }
    // all four set: the killer plans; the three left stay in hand, one card in the deck
    expect(st.step.t).toBe('planKiller')
    expect(order.map((i) => st.survivors[i].planned)).toEqual(chosen)
    expect(st.survivorHands[0]).toHaveLength(3)
    expect(st.survivorDeck).toHaveLength(1)
    expect(cardsOf(st)).toHaveLength(8)
  })

  it('a card not in the drawn ones is refused', () => {
    const st = two(3)
    const missing = (['sneak', 'sprint', 'crouch', 'vault'] as const).find((c) => !st.survivorHands[0].includes(c))
    if (missing) expect(() => apply(st, { t: 'planNext', card: missing })).toThrow()
    expect(() => apply(st, { t: 'planNext', card: 'wait' })).toThrow()
  })

  it('a survivor on a hook is skipped', () => {
    let st = two(4)
    const order = turnOrder(st)
    st.survivors[order[1]].status = 'hooked'
    st = apply(st, { t: 'planNext', card: st.survivorHands[0][0] })
    expect(nextToPlan(st)).toBe(order[2])
    st = apply(st, { t: 'planNext', card: st.survivorHands[0][0] })
    st = apply(st, { t: 'planNext', card: st.survivorHands[0][0] })
    expect(st.step.t).toBe('planKiller')
    expect(st.survivors[order[1]].planned).toBe(null)
  })

  it('online: only the survivor player sets cards; the killer planning first starts the round with the last card', () => {
    let st = two(5)
    const card = st.survivorHands[0][0]
    expect(mayAct(st, 2, { t: 'planNext', card })).toBe(true)
    expect(mayAct(st, 1, { t: 'planNext', card })).toBe(false)
    const killerCards = legalActions({ ...st, step: { t: 'planKiller' } }).find((a) => a.t === 'planKiller')!
    st = apply(st, killerCards)
    expect(st.step.t).toBe('planSurvivors')
    for (let n = 0; n < 4; n++) st = apply(st, { t: 'planNext', card: st.survivorHands[0][0] })
    expect(st.phase).not.toBe('planning')
  })

  it('every planning shuffles the eight again and draws three', () => {
    let st = two(6)
    let r = 99
    for (let n = 0; n < 3000 && st.round < 2; n++) {
      const options = legalActions(st)
      r = (r * 1103515245 + 12345) >>> 0
      st = apply(st, options[r % options.length])
    }
    expect(st.round).toBe(2)
    while (st.step.t !== 'planSurvivors' && st.phase !== 'over') {
      const options = legalActions(st)
      r = (r * 1103515245 + 12345) >>> 0
      st = apply(st, options[r % options.length])
    }
    if (st.phase === 'over') return
    expect(st.survivorHands[0]).toHaveLength(3)
    expect(st.survivorDeck).toHaveLength(5)
  })
})

describe('movement', () => {
  it('stops survivors at breakable walls (p.13)', () => {
    const st = planned()
    st.survivors[0].room = 'mine-depths'
    expect(survivorMoves(st, 0, 'sneak')).toHaveLength(0)
  })

  it('vault paths are one-way', () => {
    const st = planned()
    st.survivors[0].room = 'mine-entrance'
    expect(survivorMoves(st, 0, 'vault')).toHaveLength(0)
    st.survivors[0].room = 'foundry-upper'
    expect(survivorMoves(st, 0, 'vault').map((m) => m.to)).toEqual(['mine-entrance'])
  })

  it('lets the killer break walls', () => {
    let st = planned()
    st.killer.room = 'mine-depths'
    st.phase = 'killer'
    st.killer.planned = ['sneak', 'wait']
    st.step = { t: 'killerMove', turn: 0, card: 'sneak' }
    st.queue = [{ k: 'killerInteract', turn: 0 }, { k: 'endKillerTurn', turn: 0 }]
    st.survivors.forEach((sv) => (sv.item = null))
    st = apply(st, { t: 'move', path: 'p4' })
    expect(st.killer.room).toBe('shack')
    expect(st.paths.p4.wall).toBe(false)
  })

  it('a pallet stops the killer and costs the interaction (p.14)', () => {
    let st = planned()
    st.survivors[0].room = 'ancient-tree'
    const pallet = placeProp(st, 'pallet', 'ancient-tree')
    survivorInteracting(st, 0)
    st = apply(st, { t: 'interact', i: { k: 'dropPallet', prop: pallet.id, path: 'p14' } })
    expect(st.props.find((p) => p.id === pallet.id)!.path).toBe('p14')

    st.killer.room = 'scrapyard'
    st.phase = 'killer'
    st.killer.planned = ['sneak', 'wait']
    st.step = { t: 'killerMove', turn: 0, card: 'sneak' }
    st.queue = [{ k: 'killerInteract', turn: 0 }, { k: 'endKillerTurn', turn: 0 }]
    st = apply(st, { t: 'move', path: 'p14' })
    expect(st.killer.room).toBe('scrapyard')
    expect(st.props.find((p) => p.id === pallet.id)!.removed).toBe(true)
    expect(st.step).toEqual({ t: 'killerInteract', turn: 0, canInteract: false })
  })
})

describe('The Trapper', () => {
  const trapped = (rng: number) => {
    const st = planned()
    st.survivors.forEach((sv) => (sv.item = null))
    st.survivors[0].room = 'ancient-tree'
    st.paths.p14.trap = true
    st.killer.trapsInSupply = 3
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.step = { t: 'survivorMove', s: 0, card: 'sneak' }
    st.queue = [{ k: 'survivorInteract', s: 0 }]
    st.rng = rng
    return apply(st, { t: 'move', path: 'p14' })
  }

  it('wounds a survivor and takes the trap back on a failure', () => {
    const st = findOutcome(trapped, (s) => s.survivors[0].wounded)
    expect(st.paths.p14.trap).toBe(false)
    expect(st.killer.trapsInSupply).toBe(4)
    expect(st.survivors[0].woundedThisRound).toBe(true)
    expect(isFailure(st.log.findLast((l) => l.dice)!.dice![0])).toBe(true)
  })

  it('keeps the trap on a great success', () => {
    const st = findOutcome(trapped, (s) => !s.survivors[0].wounded)
    expect(st.paths.p14.trap).toBe(true)
    expect(st.survivors[0].room).toBe('scrapyard')
  })

  it('places a trap on a connected free path once per round', () => {
    let st = planned()
    st.killer.room = 'shack'
    st.survivors.forEach((sv) => (sv.item = null))
    killerInteracting(st)
    st = apply(st, { t: 'interact', i: { k: 'power', path: 'p16' } })
    expect(st.paths.p16.trap).toBe(true)
    expect(st.killer.trapsInSupply).toBe(3)
    expect(st.killer.powerUsed).toBe(true)
  })
})

describe('attack and sacrifice', () => {
  it('hangs a picked-up survivor at once on a free hook in the room (p.18)', () => {
    let st = planned()
    st.killer.room = 'shack'
    st.survivors.forEach((sv) => Object.assign(sv, { item: null, room: 'backlot' }))
    Object.assign(st.survivors[1], { room: 'shack', wounded: true })
    placeProp(st, 'hook', 'shack')
    killerInteracting(st)
    st = apply(st, { t: 'interact', i: { k: 'pickUp', target: 1 } })
    // no choice, no struggle dice: hung here
    expect(st.step.t).not.toBe('carryDice')
    expect(st.survivors[1].status).toBe('hooked')
    expect(st.survivors[1].room).toBe('shack')
    expect(st.sacrifice).toBe(1)
    expect(st.survivors[1].sacrificeToken).toBe(false)
  })

  it('cannot pick up a survivor wounded this round', () => {
    let st = planned()
    st.killer.room = 'shack'
    st.survivors.forEach((sv) => Object.assign(sv, { item: null, room: 'backlot' }))
    st.survivors[1].room = 'shack'
    killerInteracting(st)
    st = apply(st, { t: 'interact', i: { k: 'attack', target: 1 } })
    expect(st.survivors[1].wounded).toBe(true)
    expect(() => apply({ ...st, step: { t: 'killerInteract', turn: 0, canInteract: true } }, { t: 'interact', i: { k: 'pickUp', target: 1 } })).toThrow()
  })

  it('carries a survivor when there is no hook, then cleanup adds sacrifice per hooked survivor', () => {
    let st = planned()
    st.killer.room = 'mine-depths'
    st.survivors.forEach((sv) => Object.assign(sv, { item: null, room: 'backlot' }))
    Object.assign(st.survivors[2], { room: 'mine-depths', wounded: true })
    for (const p of st.props) if (p.kind === 'hook') Object.assign(p, { room: 'mine-entrance', revealed: true })
    killerInteracting(st)
    st = apply(st, { t: 'interact', i: { k: 'pickUp', target: 2 } })
    expect(st.step).toEqual({ t: 'carryDice', s: 2 })
    const make = (rng: number) => apply({ ...st, rng }, { t: 'carryDice', n: 1 })
    const carried = findOutcome(make, (s) => s.step.t === 'carryMove')
    let after = apply(carried, { t: 'move', path: 'p1' })
    while (after.step.t === 'revealProp') after = apply(after, legalActions(after)[0])
    expect(after.survivors[2].status).toBe('hooked')
    expect(after.sacrifice).toBe(1)
    // Finish the killer's turns: cleanup adds 1 for the hooked survivor.
    while (after.phase === 'killer') {
      const a = legalActions(after).find((x) => x.t === 'endTurn' || x.t === 'declineBonus' || x.t === 'move') ?? legalActions(after)[0]
      after = apply(after, a)
    }
    expect(after.sacrifice).toBe(2)
    expect(after.round).toBe(2)
    expect(after.step.t).toBe('planSurvivors')
  })

  it('carrying past a free hook with steps left: hang there or keep going', () => {
    let st = planned()
    st.killer.room = 'mine-depths'
    st.survivors.forEach((sv) => Object.assign(sv, { item: null, room: 'backlot' }))
    Object.assign(st.survivors[2], { room: 'mine-depths', wounded: true })
    for (const p of st.props) if (p.kind === 'hook') Object.assign(p, { room: 'mine-entrance', revealed: true })
    killerInteracting(st)
    st = apply(st, { t: 'interact', i: { k: 'pickUp', target: 2 } })
    const carried = findOutcome((rng) => apply({ ...st, rng }, { t: 'carryDice', n: 2 }), (s) => s.step.t === 'carryMove')
    let mid = apply(carried, { t: 'move', path: 'p1' })
    while (mid.step.t === 'revealProp') mid = apply(mid, legalActions(mid)[0])
    expect(mid.step).toEqual({ t: 'carryMove', s: 2, steps: 1 })
    expect(legalActions(mid)).toContainEqual({ t: 'hang' })
    // Keep going instead: no hook further on, so the survivor drops after the last step.
    let on = apply(mid, { t: 'move', path: 'p7' })
    while (on.step.t === 'revealProp') on = apply(on, legalActions(on)[0])
    expect(on.survivors[2].status).toBe('board')
    // Or hang right there.
    expect(apply(mid, { t: 'hang' }).survivors[2].status).toBe('hooked')
  })

  it('the killer can damage a generator with no progress (p.14)', () => {
    const st = planned()
    st.killer.room = 'scrapyard'
    const gen = placeProp(st, 'generator', 'scrapyard')
    gen.progress = 0
    killerInteracting(st)
    expect(killerInteractions(st)).toContainEqual({ k: 'damage', prop: gen.id })
  })

  it('a rescue frees the survivor and gives the rescuer 1 ▲ (p.13)', () => {
    let st = planned()
    st.survivors.forEach((sv) => Object.assign(sv, { item: null, room: 'backlot', bp: 2 }))
    const hook = placeProp(st, 'hook', 'shack')
    Object.assign(st.survivors[3], { room: 'shack', status: 'hooked', wounded: true })
    hook.occupant = 3
    st.survivors[0].room = 'shack'
    survivorInteracting(st, 0)
    st = apply(st, { t: 'interact', i: { k: 'sabotage', prop: hook.id } })
    expect(st.survivors[3].status).toBe('board')
    expect(st.survivors[0].bp).toBe(3)
    expect(st.entity).toEqual({ prop: hook.id })
    expect(st.step).toEqual({ t: 'anyMove', s: 0 })
  })
})

describe('winning', () => {
  it('survivors win when an exit gate reaches 3 progress', () => {
    const base = planned()
    base.survivors.forEach((sv) => Object.assign(sv, { item: null }))
    const gens = base.props.filter((p) => p.kind === 'generator').slice(0, 4)
    gens.forEach((g) => Object.assign(g, { done: true, progress: 3 }))
    const gate = placeProp(base, 'exitGate', base.survivors[0].room)
    gate.progress = 2
    survivorInteracting(base, 0)
    const won = findOutcome(
      (rng) => apply({ ...base, rng }, { t: 'interact', i: { k: 'openGate', prop: gate.id } }),
      (s) => s.phase === 'over',
    )
    expect(won.step).toEqual({ t: 'gameOver', winner: 'survivors' })
  })

  it('needs 4 repaired generators before a gate can be opened', () => {
    const st = planned()
    const gate = placeProp(st, 'exitGate', st.survivors[0].room)
    survivorInteracting(st, 0)
    expect(() => apply(st, { t: 'interact', i: { k: 'openGate', prop: gate.id } })).toThrow()
  })
})

describe('random playthroughs', () => {
  it('only ever offers legal actions and keeps the invariants', () => {
    let finished = 0
    for (let seed = 1; seed <= 40; seed++) {
      let st = createGame(config(seed, ([2, 3, 4, 5] as const)[seed % 4], ['trapper', 'nurse', 'huntress', 'hillbilly'][Math.floor(seed / 4) % 4]))
      let rng = seed * 7919
      for (let n = 0; n < 4000 && st.phase !== 'over'; n++) {
        const options = legalActions(st)
        expect(options.length).toBeGreaterThan(0)
        rng = (rng * 1103515245 + 12345) >>> 0
        const prev = st
        const act = options[rng % options.length]
        st = apply(st, act)
        // A round ends once: nothing left over to run cleanup again later.
        if (st.phase === 'planning') expect(st.queue.some((t) => t.k === 'cleanup')).toBe(false)
        if (act.t === 'planKiller') expect(st.round).toBe(prev.round)
        expect(st.killer.bp).toBeLessThanOrEqual(12)
        expect(st.sacrifice).toBeLessThanOrEqual(8)
        for (const sv of st.survivors) expect(sv.bp).toBeLessThanOrEqual(6)
        // two players: never more than the two sets in the hand and the deck
        if (st.handPlayers.length === 1) expect(st.survivorHands[0].length + (st.survivorDeck?.length ?? 0)).toBeLessThanOrEqual(8)
        for (const r of macmillan.rooms) expect(propsIn(st, r.id).filter((p) => p.occupant !== null).length).toBeLessThanOrEqual(4)
      }
      if (st.phase === 'over') finished++
    }
    expect(finished).toBeGreaterThan(25)
  }, 180_000)
})

describe('Firecracker while carrying (house rule)', () => {
  /** The killer carrying Dwight with `steps` left, Meg holding a Firecracker in the next room. */
  function carrying(steps: number) {
    const st = planned()
    const k = st.killer
    const path = macmillan.paths.find((p) => p.a === k.room || p.b === k.room)!
    const next = path.a === k.room ? path.b : path.a
    st.props.forEach((p) => p.kind === 'hook' && (p.revealed = false))
    st.phase = 'killer'
    k.planned = ['sneak', 'sneak']
    k.revealedCount = 1
    Object.assign(st.survivors[0], { status: 'carried', room: k.room, wounded: true })
    Object.assign(st.survivors[1], { status: 'board', room: next, item: 'firecracker' })
    st.survivors.slice(2).forEach((sv) => (sv.room = k.room === 'shack' ? 'backlot' : 'shack'))
    st.step = { t: 'carryMove', s: 0, steps }
    st.queue = [{ k: 'endKillerTurn', turn: 0 }]
    return { st, path, from: k.room, next }
  }

  it('asks the holder before he carries into her room', () => {
    const { st, path } = carrying(3)
    const asked = apply(st, { t: 'move', path: path.id })
    expect(asked.step).toMatchObject({ t: 'reaction', item: 'firecracker', holders: [1] })
  })

  it('used: he stays, loses the step, and carries on with what is left', () => {
    const { st, path, from } = carrying(3)
    const after = apply(apply(st, { t: 'move', path: path.id }), { t: 'react', s: 1 })
    expect(after.killer.room).toBe(from)
    expect(after.survivors[1].item).toBeNull()
    expect(after.step).toMatchObject({ t: 'carryMove', s: 0, steps: 2 })
  })

  it('used on the last step, with no hook: the carried survivor escapes where he stands', () => {
    const { st, path, from } = carrying(1)
    const after = apply(apply(st, { t: 'move', path: path.id }), { t: 'react', s: 1 })
    expect(after.survivors[0].status).toBe('board')
    expect(after.survivors[0].room).toBe(from)
  })

  it('not used: he carries on into the room', () => {
    const { st, path, next } = carrying(3)
    const after = apply(apply(st, { t: 'move', path: path.id }), { t: 'react', s: null })
    expect(after.killer.room).toBe(next)
    expect(after.survivors[1].item).toBe('firecracker')
  })
})

describe('a key while carried (house rule)', () => {
  it('the carried survivor re-rolls their own struggle with their key', () => {
    const st = planned()
    const k = st.killer
    st.phase = 'killer'
    Object.assign(st.survivors[0], { status: 'carried', room: k.room, wounded: true, item: 'broken_key' })
    st.survivors.slice(1).forEach((sv) => (sv.item = null))
    st.step = { t: 'roll', ctx: { k: 'carry', s: 0 }, dice: [{ kind: 'skill', face: 1, rerolled: false }] }
    st.queue = [{ k: 'endKillerTurn', turn: 0 }]
    const after = apply(st, { t: 'reroll', s: 0, die: 0 })
    expect(after.survivors[0].item).toBeNull()
    // not on someone else's roll while carried
    const other = planned()
    Object.assign(other.survivors[0], { status: 'carried', room: other.killer.room, item: 'broken_key' })
    other.step = { t: 'roll', ctx: { k: 'repair', s: 1, prop: other.props.find((p) => p.kind === 'generator')!.id }, dice: [{ kind: 'skill', face: 0, rerolled: false }] }
    expect(tryApply(other, { t: 'reroll', s: 0, die: 0 })).toBeNull()
  })
})
