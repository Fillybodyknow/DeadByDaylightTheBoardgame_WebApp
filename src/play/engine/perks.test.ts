import { describe, expect, it } from 'vitest'
import { apply, createGame, isFailure, killerInteractions, perkChoices, powerOptions } from './engine'
import { legalActions } from './legal'
import { PERKS, PRINTED_PERKS, type PerkId } from './perks'
import type { Action, GameState, PropKind } from './types'

const SURVIVORS = ['dwight', 'meg', 'claudette', 'jake']
const ALL_SURVIVORS = ['dwight', 'meg', 'claudette', 'jake', 'feng', 'ace', 'nea']
const ALL_KILLERS = ['trapper', 'nurse', 'huntress', 'hillbilly', 'doctor', 'hag', 'wraith']

function game(killer = 'trapper', seed = 1): GameState {
  let st = createGame({ board: 'macmillan', survivors: SURVIVORS.map((id) => ({ id, name: id })), killer: { id: killer, name: killer }, players: 5, seed })
  while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
  return st
}

/** Only these perks are owned (by whoever prints them). */
function only(st: GameState, ...perks: PerkId[]) {
  st.survivors.forEach((sv) => (sv.perks = sv.perks.filter((p) => perks.includes(p))))
  st.killer.perks = st.killer.perks.filter((p) => perks.includes(p))
  st.survivors.forEach((sv) => Object.assign(sv, { item: null, bp: 6 }))
  st.killer.bp = 8
}

function placeProp(st: GameState, kind: PropKind, room: string) {
  const p = st.props.find((x) => x.kind === kind && !x.removed && !x.done && x.occupant === null && x.room !== room)!
  Object.assign(p, { room, path: null, revealed: true })
  return p
}

function killerInteracting(st: GameState) {
  st.phase = 'killer'
  st.canInteract = true
  st.killer.planned = ['wait', 'wait']
  st.killer.revealedCount = 1
  st.step = { t: 'killerInteract', turn: 0, canInteract: true }
  st.queue = [{ k: 'endKillerTurn', turn: 0 }]
}

function findOutcome(make: (rng: number) => GameState, pick: (st: GameState) => boolean): GameState {
  for (let rng = 1; rng < 500; rng++) {
    const st = make(rng)
    if (pick(st)) return st
  }
  throw new Error('outcome never happened')
}

describe('perk data', () => {
  it('gives each automate character its 3 printed perks', () => {
    for (const c of [...ALL_SURVIVORS, ...ALL_KILLERS]) expect(PRINTED_PERKS[c]).toHaveLength(3)
    expect(Object.keys(PERKS)).toHaveLength(42)
  })
})

describe('killer powers', () => {
  it('The Nurse blinks through a wall without breaking it', () => {
    const st = game('nurse')
    only(st)
    st.killer.room = 'mine-depths'
    killerInteracting(st)
    expect(powerOptions(st)).toContainEqual({ k: 'blink', path: 'p4' })
    const after = apply(st, { t: 'interact', i: { k: 'blink', path: 'p4' } })
    expect(after.killer.room).toBe('shack')
    expect(after.paths.p4.wall).toBe(true)
    expect(after.killer.powerUsed).toBe(true)
  })

  it("The Huntress's hatchet wounds on a danger-die failure", () => {
    const base = game('huntress')
    only(base)
    base.killer.room = 'shack'
    base.survivors.forEach((sv) => (sv.room = 'backlot'))
    base.survivors[0].room = 'scrapyard'
    killerInteracting(base)
    const hit = findOutcome(
      (rng) => apply({ ...structuredClone(base), rng }, { t: 'interact', i: { k: 'hatchet', target: 0 } }),
      (s) => s.survivors[0].wounded,
    )
    expect(isFailure(hit.log.findLast((e) => e.dice)!.dice![0])).toBe(true)
  })

  it("The Hillbilly's chainsaw discards the card and wounds who is in the room", () => {
    const st = game('hillbilly')
    only(st)
    st.killer.room = 'scrapyard'
    st.killer.hand = ['sprint', 'crouch', 'wait']
    st.survivors.forEach((sv) => (sv.room = 'backlot'))
    st.survivors[2].room = 'shack'
    killerInteracting(st)
    expect(killerInteractions(st)).toContainEqual({ k: 'chainsaw', card: 'sprint', path: 'p16' })
    let after = apply(st, { t: 'interact', i: { k: 'chainsaw', card: 'sprint', path: 'p16' } })
    while (after.step.t === 'revealProp') after = apply(after, legalActions(after)[0])
    expect(after.killer.room).toBe('shack')
    expect(after.killer.hand).toEqual(['crouch', 'wait'])
    expect(after.survivors[2].wounded).toBe(true)
  })
})

describe('The Doctor, The Hag, The Wraith', () => {
  it("Carter's Spark: pay 1 ▲ or take Madness; Madness makes skill checks use the danger die", () => {
    const st = game('doctor')
    only(st)
    st.killer.room = 'scrapyard'
    st.survivors.forEach((sv) => (sv.room = 'backlot'))
    Object.assign(st.survivors[1], { room: 'shack', bp: 2 })
    killerInteracting(st)
    let after = apply(st, { t: 'interact', i: { k: 'spark', room: 'shack' } })
    expect(after.step).toEqual({ t: 'sparkChoice', s: 1, rest: [] })
    after = apply(after, { t: 'spark', pay: false })
    expect(after.survivors[1].madness).toBe(true)
    // With Madness and no ▲, a second spark wounds.
    after.survivors[1].bp = 0
    after.killer.powerUsed = false
    killerInteracting(after)
    after = apply(after, { t: 'interact', i: { k: 'spark', room: 'shack' } })
    expect(after.survivors[1].wounded).toBe(true)
  })

  it('a Phantasm Trap makes the survivor roll, then The Hag may teleport', () => {
    const base = game('hag')
    only(base)
    base.killer.room = 'mine-depths'
    base.killer.bp = 8
    base.phantasm = ['scrapyard']
    base.survivors.forEach((sv) => (sv.room = 'backlot'))
    base.survivors[0].room = 'ancient-tree'
    base.phase = 'survivors'
    base.activeSurvivor = 0
    base.step = { t: 'survivorMove', s: 0, card: 'sneak' }
    base.queue = [{ k: 'survivorInteract', s: 0 }]
    let st = apply(base, { t: 'move', path: 'p14' })
    while (st.step.t === 'revealProp') st = apply(st, legalActions(st)[0])
    expect(st.step).toMatchObject({ t: 'phantasmChoice', s: 0, room: 'scrapyard' })
    expect(st.phantasm).toEqual([])
    const face = (st.step as Extract<GameState['step'], { t: 'phantasmChoice' }>).face
    // House rule: not teleporting gains ▲ equal to the die.
    expect(apply(st, { t: 'phantasm', teleport: false }).killer.bp).toBe(Math.min(12, st.killer.bp + face))
    let tp = apply(st, { t: 'phantasm', teleport: true, i: { k: 'attack', target: 0 } })
    while (tp.step.t === 'revealProp') tp = apply(tp, legalActions(tp)[0])
    expect(tp.killer.room).toBe('scrapyard')
    expect(tp.killer.bp).toBe(8 - face + (face === 0 ? 1 : 0))
    expect(tp.survivors[0].wounded).toBe(true)
  })

  it('Wailing Bell goes only to rooms not connected to the Wraith', () => {
    const st = game('wraith')
    only(st)
    st.killer.room = 'shack'
    killerInteracting(st)
    const rooms = killerInteractions(st).flatMap((i) => (i.k === 'bell' ? [i.room] : []))
    expect(rooms).not.toContain('shack')
    for (const near of ['mine-depths', 'ancient-tree', 'scrapyard', 'foundry-basement', 'backlot']) expect(rooms).not.toContain(near)
    expect(rooms).toContain('coal-tower-upper')
  })

  it('The Third Seal stops survivors using the sealed card', () => {
    const st = game('hag')
    only(st)
    st.sealedCard = 'sneak'
    st.survivors[0].room = 'ancient-tree'
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.step = { t: 'turnStart', s: 0 }
    st.queue = [{ k: 'cardMove', s: 0, card: 'sneak' }, { k: 'survivorInteract', s: 0 }]
    const after = apply(st, { t: 'continue' })
    expect(after.survivors[0].room).toBe('ancient-tree')
    expect(after.step).toEqual({ t: 'survivorInteract', s: 0, canInteract: false })
  })

  it('Streetwise keeps the chest', () => {
    const st = createGame({ board: 'macmillan', survivors: ['nea', 'meg', 'ace', 'feng'].map((id) => ({ id, name: id })), killer: { id: 'hag', name: 'hag' }, players: 5, seed: 3 })
    let g = st
    while (g.step.t === 'setupReveal') g = apply(g, legalActions(g)[0])
    g.killer.perks = []
    const chest = placeProp(g, 'chest', g.survivors[0].room)
    g.phase = 'survivors'
    g.activeSurvivor = 0
    g.canInteract = true
    g.step = { t: 'survivorInteract', s: 0, canInteract: true }
    g.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    g.survivors.forEach((sv) => Object.assign(sv, { planned: 'sneak', acted: true, item: null }))
    g.killer.planned = ['wait', 'wait']
    g = apply(g, { t: 'interact', i: { k: 'rummage', prop: chest.id } })
    expect(g.step).toMatchObject({ t: 'offer', perk: 'streetwise' })
    g = apply(g, { t: 'perk', perk: 'streetwise', use: true, choice: {} })
    expect(g.props.find((p) => p.id === chest.id)!.removed).toBe(false)
    expect(g.survivors[0].item).not.toBeNull()
  })
})

describe('perks', () => {
  it('Iron Will turns a trap failure into a success, but the killer still gains ▲', () => {
    const base = game()
    only(base, 'iron_will')
    base.survivors[3].room = 'ancient-tree'
    base.survivors[0].room = 'ancient-tree'
    base.paths.p14.trap = true
    base.phase = 'survivors'
    base.activeSurvivor = 0
    base.step = { t: 'survivorMove', s: 0, card: 'sneak' }
    base.queue = [{ k: 'survivorInteract', s: 0 }]
    const failed = findOutcome(
      (rng) => apply({ ...structuredClone(base), rng }, { t: 'move', path: 'p14' }),
      (s) => s.step.t === 'roll',
    )
    const bp = failed.killer.bp
    let after = apply(failed, { t: 'perk', perk: 'iron_will', use: true, choice: {} })
    while (after.step.t === 'revealProp') after = apply(after, legalActions(after)[0])
    expect(after.survivors[0].wounded).toBe(false)
    expect(after.paths.p14.trap).toBe(true)
    expect(after.killer.bp).toBe(bp + 1)
    expect(after.survivors[3].bp).toBe(5)
  })

  it('Huntress Lullaby stops a card move but keeps the interaction', () => {
    const st = game('huntress')
    only(st, 'huntress_lullaby')
    st.survivors[0].room = 'ancient-tree'
    st.killer.hand = ['sneak', 'wait', 'vault']
    st.phase = 'survivors'
    st.queue = [{ k: 'cardMove', s: 0, card: 'sneak' }, { k: 'survivorInteract', s: 0 }]
    st.step = { t: 'idle' }
    st.activeSurvivor = 0
    // Run the queue through a no-op: the offer comes first.
    const offered = apply({ ...st, step: { t: 'turnStart', s: 0 } }, { t: 'continue' })
    expect(offered.step).toMatchObject({ t: 'offer', perk: 'huntress_lullaby', owner: 'killer' })
    const after = apply(offered, { t: 'perk', perk: 'huntress_lullaby', use: true, choice: {} })
    expect(after.survivors[0].room).toBe('ancient-tree')
    expect(after.killer.hand).toEqual(['wait', 'vault'])
    expect(after.step).toEqual({ t: 'survivorInteract', s: 0, canInteract: true })
  })

  it('Bond rolls two dice and the survivor keeps one', () => {
    const st = game()
    only(st, 'bond')
    st.survivors.forEach((sv) => (sv.room = 'backlot'))
    st.survivors[1].room = 'scrapyard'
    st.survivors[0].room = 'scrapyard'
    const gen = placeProp(st, 'generator', 'scrapyard')
    st.phase = 'survivors'
    st.activeSurvivor = 1
    st.step = { t: 'survivorInteract', s: 1, canInteract: true }
    st.queue = [{ k: 'endSurvivorTurn', s: 1 }]
    st.survivors.forEach((sv) => Object.assign(sv, { planned: 'sneak', acted: true }))
    st.killer.planned = ['wait', 'wait']
    const offered = apply(st, { t: 'interact', i: { k: 'repair', prop: gen.id } })
    expect(offered.step).toMatchObject({ t: 'offer', perk: 'bond', owner: 0 })
    const rolled = apply(offered, { t: 'perk', perk: 'bond', use: true, choice: {} })
    expect(rolled.step).toMatchObject({ t: 'roll', keep: true })
    expect((rolled.step as Extract<GameState['step'], { t: 'roll' }>).dice).toHaveLength(2)
    expect(rolled.survivors[0].bp).toBe(5)
    const done = apply(rolled, { t: 'acceptRoll', die: 1 })
    expect(done.step.t).not.toBe('roll')
  })

  it('Tinkerer swaps an unplayed planned card for one in hand when a generator is done', () => {
    const offered = findOutcome(
      (rng) => {
        const st = game('hillbilly')
        only(st, 'tinkerer')
        st.survivors.forEach((sv) => Object.assign(sv, { room: 'scrapyard', planned: 'sneak', acted: true }))
        const gen = placeProp(st, 'generator', 'scrapyard')
        gen.progress = 2
        st.phase = 'survivors'
        st.activeSurvivor = 1
        st.step = { t: 'survivorInteract', s: 1, canInteract: true }
        st.queue = [{ k: 'endSurvivorTurn', s: 1 }]
        st.killer.planned = ['sprint', 'sneak']
        st.killer.revealedCount = 1
        st.killer.hand = ['crouch', 'vault', 'wait']
        st.rng = rng
        return apply(st, { t: 'interact', i: { k: 'repair', prop: gen.id } })
      },
      (st) => st.step.t === 'offer' && st.step.perk === 'tinkerer',
    )
    // only the card still to come can change, for any card in hand
    expect(perkChoices(offered, 'tinkerer', 'killer', { k: 'genDone' })).toEqual(['crouch', 'vault', 'wait'].map((card) => ({ index: 1, card })))
    const after = apply(offered, { t: 'perk', perk: 'tinkerer', use: true, choice: { index: 1, card: 'crouch' } })
    expect(after.killer.planned).toEqual(['sprint', 'crouch'])
    expect(after.killer.hand).toContain('sneak')
    expect(after.killer.hand).not.toContain('crouch')
  })

  it('a perk is used once per round', () => {
    const st = game()
    only(st, 'self_care')
    st.survivors[2].wounded = true
    expect(perkChoices(st, 'self_care', 2, { k: 'turnStart', s: 2 })).toEqual([{}])
    st.perksUsed.push('2:self_care')
    expect(perkChoices(st, 'self_care', 2, { k: 'turnStart', s: 2 })).toEqual([])
  })

  it('random games use every perk and power without breaking a rule', () => {
    const used = new Set<string>()
    for (let seed = 1; seed <= 84; seed++) {
      const killer = ALL_KILLERS[seed % 7]
      // 4 of the 7 survivors, rotating so everyone plays.
      const crew = [0, 1, 2, 3].map((i) => ALL_SURVIVORS[(seed + i * 2) % 7])
      let st = createGame({ board: 'macmillan', survivors: crew.map((id) => ({ id, name: id })), killer: { id: killer, name: killer }, players: 5, seed })
      let rng = seed * 7919
      for (let n = 0; n < 4000 && st.phase !== 'over'; n++) {
        const options = legalActions(st)
        expect(options.length).toBeGreaterThan(0)
        const eager = options.filter(
          (a: Action) =>
            (a.t === 'perk' && a.use) ||
            (a.t === 'interact' && ['power', 'blink', 'hatchet', 'chainsaw', 'calmSpirit', 'spark', 'phantasm', 'bell', 'rummage'].includes(a.i.k)) ||
            (a.t === 'useItem'),
        )
        rng = (rng * 1103515245 + 12345) >>> 0
        const pool = eager.length && rng % 3 === 0 ? eager : options
        const prev = st
        const act = pool[(rng >>> 8) % pool.length]
        st = apply(st, act)
        // A round ends once: nothing left over to run cleanup again later.
        if (st.phase === 'planning') expect(st.queue.some((t) => t.k === 'cleanup')).toBe(false)
        if (act.t === 'planKiller') expect(st.round).toBe(prev.round)
        expect(st.killer.bp).toBeGreaterThanOrEqual(0)
        for (const sv of st.survivors) expect(sv.bp).toBeGreaterThanOrEqual(0)
        expect(st.phantasm.length).toBeLessThanOrEqual(7)
        expect(new Set(st.phantasm).size).toBe(st.phantasm.length)
      }
      for (const e of st.log) if (e.ev?.k === 'perk') used.add(e.ev.perk)
    }
    expect([...Object.keys(PERKS)].filter((p) => !used.has(p))).toEqual([])
  }, 300_000)
})

describe('perks at the same moment (p.16, Timing)', () => {
  /** The Trapper attacks survivor 1 in his room: Brutal Strength and Agitation both trigger. */
  function attacked(): GameState {
    const st = game('trapper')
    only(st, 'brutal_strength', 'agitation')
    killerInteracting(st)
    st.survivors[1].room = st.killer.room
    st.survivors[1].wounded = false
    return apply(st, { t: 'interact', i: { k: 'attack', target: 1 } })
  }

  it("offers all of one owner's perks together", () => {
    const st = attacked()
    expect(st.step.t).toBe('offer')
    if (st.step.t !== 'offer') return
    expect([st.step.perk, ...(st.step.alt ?? [])].sort()).toEqual(['agitation', 'brutal_strength'])
  })

  it('lets the owner use them in any order, then asks for the rest', () => {
    let st = attacked()
    const second = st.step.t === 'offer' ? st.step.alt![0] : null
    expect(second).not.toBeNull()
    // use the perk that was NOT first in board order
    const choice = perkChoices(st, second!, 'killer', (st.step as Extract<GameState['step'], { t: 'offer' }>).w)[0]
    st = apply(st, { t: 'perk', perk: second!, use: true, choice })
    expect(st.log.some((e) => e.ev?.k === 'perk' && e.ev.perk === second)).toBe(true)
    // the other one is offered next, on its own
    expect(st.step.t).toBe('offer')
    if (st.step.t !== 'offer') return
    expect(st.step.perk).not.toBe(second)
    expect(st.step.alt ?? []).toEqual([])
  })

  it('passing passes on all of them at once', () => {
    let st = attacked()
    const offer = st.step as Extract<GameState['step'], { t: 'offer' }>
    st = apply(st, { t: 'perk', perk: offer.perk, use: false })
    expect(st.step.t).not.toBe('offer')
    expect(st.log.some((e) => e.ev?.k === 'perk')).toBe(false)
  })

  it('rejects a perk that is not on offer', () => {
    const st = attacked()
    expect(() => apply(st, { t: 'perk', perk: 'unnerving_presence', use: true })).toThrow()
  })
})
