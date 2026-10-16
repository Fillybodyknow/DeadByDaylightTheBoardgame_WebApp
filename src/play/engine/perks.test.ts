import { describe, expect, it } from 'vitest'
import { apply, charlotteRoom, createGame, isFailure, itemUses, killerInteractions, perkChoices, powerOptions, survivorInteractions, touchingPaths, tryApply, victorRoom } from './engine'
import { legalActions } from './legal'
import { actorsOf } from './seats'
import { PERKS, PRINTED_PERKS, type PerkId } from './perks'
import type { Action, GameState, PropKind } from './types'

const SURVIVORS = ['dwight', 'meg', 'claudette', 'jake']
const ALL_SURVIVORS = ['dwight', 'meg', 'claudette', 'jake', 'feng', 'ace', 'nea', 'yui', 'zarina', 'elodie', 'felix', 'adam']
const ALL_KILLERS = ['trapper', 'nurse', 'huntress', 'hillbilly', 'doctor', 'hag', 'wraith', 'oni', 'deathslinger', 'twins', 'blight', 'spirit']

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
    expect(Object.keys(PERKS)).toHaveLength(72)
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

  it('Stridor: the chosen survivor plays face up on their own, before anyone else plans', () => {
    let st = game('nurse')
    only(st, 'stridor')
    st.survivors[1].wounded = true
    st.step = { t: 'idle' }
    // the start of a planning phase: the offer comes before any card is chosen
    st = apply({ ...st, step: { t: 'turnStart', s: 0 }, queue: [{ k: 'trigger', w: { k: 'planningStart' }, done: [] }, { k: 'plan' }] }, { t: 'continue' })
    expect(st.step).toMatchObject({ t: 'offer', perk: 'stridor', owner: 'killer' })
    // only wounded survivors on the board can be chosen (a locker is off the board, p.12)
    expect(perkChoices(st, 'stridor', 'killer', { k: 'planningStart' })).toEqual([{ target: 1 }])
    expect(perkChoices({ ...st, survivors: st.survivors.map((sv, i) => (i === 1 ? { ...sv, status: 'locker' as const } : sv)) }, 'stridor', 'killer', { k: 'planningStart' })).toEqual([])
    st = apply(st, { t: 'perk', perk: 'stridor', use: true, choice: { target: 1 } })
    expect(st.stridor).toBe(1)
    expect(st.step).toEqual({ t: 'planStridor', s: 1 })
    expect(actorsOf(st)).toEqual([3]) // 5 players: survivor 1 is player 3's

    const card = st.survivorHands[st.survivors[1].hand][1]
    st = apply(st, { t: 'planStridor', card })
    expect(st.survivors[1].planned).toBe(card)
    expect(st.survivors[1].plannedRevealed).toBe(true) // face up for everyone still to plan
    expect(st.survivorHands[st.survivors[1].hand]).not.toContain(card)
    expect(st.step).toEqual({ t: 'planSurvivors' })
    expect(st.survivors.filter((sv) => sv.planned)).toHaveLength(1)

    // the others plan without a card for that survivor; setting one again is illegal
    expect(tryApply(st, { t: 'planSurvivors', cards: ['sneak', 'sneak', 'sneak', 'sneak'] })).toBeNull()
    st = apply(st, { t: 'planSurvivors', cards: ['sneak', null, 'sneak', 'sneak'] })
    expect(st.step.t).toBe('planKiller')
    expect(st.survivors[1].planned).toBe(card)
    expect(st.survivors[1].plannedRevealed).toBe(true)
    expect(st.survivors.every((sv) => sv.planned)).toBe(true)
  })

  it('a locker is no space: the roll from inside one is out of reach of perks that need one', () => {
    const st = game('trapper')
    only(st)
    const room = st.survivors[0].room
    st.survivors[0].status = 'locker' // the one being searched, and rolling
    Object.assign(st.survivors[1], { room, perks: ['off_the_record', 'bond'], bp: 6 })
    Object.assign(st.killer, { perks: ['unnerving_presence', 'thanatophobia'], bp: 6, room })
    st.survivors[0].wounded = true
    const preRoll = { k: 'preRoll', ctx: { k: 'search' as const, s: 0, prop: 'p' } } as const
    const failed = { k: 'rollFail', s: 0, fails: 1 } as const
    expect(perkChoices(st, 'bond', 1, preRoll)).toEqual([])
    expect(perkChoices(st, 'unnerving_presence', 'killer', preRoll)).toEqual([])
    expect(perkChoices(st, 'off_the_record', 1, failed)).toEqual([])
    // no perk reaches in there, not even one that names no space
    expect(perkChoices(st, 'thanatophobia', 'killer', preRoll)).toEqual([])
    // and out of the locker every one of them reaches
    st.survivors[0].status = 'board'
    expect(perkChoices(st, 'bond', 1, preRoll)).toEqual([{}])
    expect(perkChoices(st, 'unnerving_presence', 'killer', preRoll)).toEqual([{}])
    expect(perkChoices(st, 'off_the_record', 1, failed)).toEqual([{}])
    expect(perkChoices(st, 'thanatophobia', 'killer', preRoll)).toEqual([{}])
  })

  it('Lucky Break does not answer a great success rolled from inside a locker', () => {
    const st = game('trapper')
    only(st)
    Object.assign(st.survivors[2], { perks: ['lucky_break'], bp: 6, wounded: true, status: 'board' })
    st.survivors[0].status = 'locker'
    expect(perkChoices(st, 'lucky_break', 2, { k: 'greatRoll', s: 0 })).toEqual([])
    st.survivors[0].status = 'board'
    expect(perkChoices(st, 'lucky_break', 2, { k: 'greatRoll', s: 0 })).toEqual([{}])
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
    for (let seed = 1; seed <= 198; seed++) {
      const killer = ALL_KILLERS[seed % ALL_KILLERS.length]
      // 4 of the survivors, rotating so everyone plays.
      const crew = [0, 1, 2, 3].map((i) => ALL_SURVIVORS[(seed + i * 2) % ALL_SURVIVORS.length])
      let st = createGame({ board: 'macmillan', survivors: crew.map((id) => ({ id, name: id })), killer: { id: killer, name: killer }, players: 5, seed })
      let rng = seed * 7919
      for (let n = 0; n < 4000 && st.phase !== 'over'; n++) {
        const options = legalActions(st)
        expect(options.length).toBeGreaterThan(0)
        const eager = options.filter(
          (a: Action) =>
            (a.t === 'perk' && a.use) ||
            (a.t === 'interact' && ['power', 'blink', 'hatchet', 'chainsaw', 'calmSpirit', 'spark', 'phantasm', 'bell', 'wrath', 'redeemer', 'victor', 'rush', 'haunt', 'hoard', 'undying', 'powerStruggle', 'diversion', 'removeVictor', 'rummage'].includes(a.i.k)) ||
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
        // The Redeemer card is only held while its guess is pending.
        expect(!!st.redeemer).toBe(st.step.t === 'redeemerGuess')
      }
      for (const e of st.log) if (e.ev?.k === 'perk') used.add(e.ev.perk)
    }
    expect([...Object.keys(PERKS)].filter((p) => !used.has(p))).toEqual([])
  }, 600_000)
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

describe('The Oni, The Deathslinger, Yui and Zarina', () => {
  /** A room joined to the killer's by a path with no wall. */
  function neighbour(st: GameState) {
    const p = touchingPaths(st, st.killer.room).find((x) => !st.paths[x.id].wall)!
    return { path: p.id, room: p.a === st.killer.room ? p.b : p.a }
  }

  it("Yamaoka's Wrath gains a ▲ per wounded survivor and Hex Totem nearby", () => {
    const st = game('oni')
    only(st)
    killerInteracting(st)
    const near = neighbour(st).room
    st.survivors.forEach((sv) => Object.assign(sv, { room: 'far', wounded: false }))
    Object.assign(st.survivors[0], { room: st.killer.room, wounded: true })
    Object.assign(st.survivors[1], { room: near, wounded: true })
    st.props.filter((p) => p.kind === 'totem').forEach((p) => (p.removed = true))
    const totem = st.props.find((p) => p.kind === 'totem')!
    Object.assign(totem, { room: near, revealed: true, removed: false })
    const bp = st.killer.bp
    const after = apply(st, { t: 'interact', i: { k: 'wrath' } })
    expect(after.killer.bp).toBe(bp + 3)
  })

  function reeled(guessRight: boolean) {
    const st = game('deathslinger')
    only(st)
    killerInteracting(st)
    st.killer.hand = ['sneak', 'vault', 'wait']
    const { room } = neighbour(st)
    st.survivors.forEach((sv) => (sv.room = 'far'))
    Object.assign(st.survivors[2], { room, wounded: true, woundedThisRound: false })
    expect(powerOptions(st)).toContainEqual({ k: 'redeemer', target: 2, card: 'vault' })
    let next = apply(st, { t: 'interact', i: { k: 'redeemer', target: 2, card: 'vault' } })
    expect(next.step).toEqual({ t: 'redeemerGuess', s: 2 })
    expect(next.killer.hand).toEqual(['sneak', 'wait'])
    next = apply(next, { t: 'guess', card: guessRight ? 'vault' : 'sneak' })
    return { next, killerRoom: st.killer.room }
  }

  it('Redeemer: a wrong guess reels the survivor in and he picks them up', () => {
    const { next, killerRoom } = reeled(false)
    expect(next.survivors[2].status).toBe('carried')
    expect(next.survivors[2].room).toBe(killerRoom)
    expect(next.redeemer).toBeNull()
  })

  it('Redeemer cannot target a survivor wounded this round (p.15)', () => {
    const st = game('deathslinger')
    only(st)
    killerInteracting(st)
    const { room } = neighbour(st)
    st.survivors.forEach((sv) => (sv.room = 'far'))
    Object.assign(st.survivors[2], { room, wounded: true, woundedThisRound: true })
    expect(powerOptions(st).filter((i) => i.k === 'redeemer')).toEqual([])
  })

  it('Redeemer: a right guess frees the survivor', () => {
    const { next } = reeled(true)
    expect(next.survivors[2].status).toBe('board')
    expect(next.step.t).not.toBe('carryDice')
  })

  it('Red Herring turns an attack into damaging a generator (2 progress: +1 ▲)', () => {
    let st = game('trapper')
    only(st, 'red_herring')
    killerInteracting(st)
    st.survivors[0].perks = ['red_herring']
    Object.assign(st.survivors[0], { room: st.killer.room, wounded: false, status: 'board' })
    Object.assign(st.survivors[1], { room: st.killer.room, wounded: false })
    const gen = placeProp(st, 'generator', st.killer.room)
    gen.progress = 2
    st = apply(st, { t: 'interact', i: { k: 'attack', target: 1 } })
    expect(st.step).toMatchObject({ t: 'offer', perk: 'red_herring', owner: 0 })
    st = apply(st, { t: 'perk', perk: 'red_herring', use: true, choice: { prop: gen.id } })
    expect(st.survivors[1].wounded).toBe(false)
    expect(st.props.find((p) => p.id === gen.id)!.progress).toBe(0)
    expect(st.survivors[0].bp).toBe(6 - 2 + 1)
  })

  it('Off the Record takes the ▲ of a failure from the killer, after the dice are shown', () => {
    const make = (rng: number) => {
      const st = game('trapper', 1)
      only(st, 'off_the_record')
      st.survivors[3].perks = ['off_the_record']
      st.rng = rng
      st.phase = 'survivors'
      st.activeSurvivor = 0
      st.survivors[3].room = st.survivors[0].room
      st.survivors[3].bp = 3
      const gen = placeProp(st, 'generator', st.survivors[0].room)
      st.step = { t: 'survivorInteract', s: 0, canInteract: true }
      st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
      return apply(st, { t: 'interact', i: { k: 'repair', prop: gen.id } })
    }
    const st = findOutcome(make, (s) => s.step.t === 'offer' && s.step.perk === 'off_the_record')
    // the failed roll is already in the log; the killer hasn't gained yet
    expect(st.log.at(-1)!.dice?.some(isFailure)).toBe(true)
    const killerBp = st.killer.bp
    const after = apply(st, { t: 'perk', perk: 'off_the_record', use: true, choice: {} })
    expect(after.survivors[3].bp).toBe(4)
    expect(after.killer.bp).toBe(killerBp)
  })

  it('Retribution: the cleanse rolls the danger die, and a success pays the killer 2 ▲', () => {
    const make = (rng: number) => {
      let st = game('deathslinger', 1)
      only(st, 'retribution')
      st.rng = rng
      st.phase = 'survivors'
      st.activeSurvivor = 0
      const totem = placeProp(st, 'totem', st.survivors[0].room)
      st.step = { t: 'survivorInteract', s: 0, canInteract: true }
      st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
      st = apply(st, { t: 'interact', i: { k: 'cleanse', prop: totem.id } })
      return apply(st, { t: 'perk', perk: 'retribution', use: true, choice: {} })
    }
    const st = findOutcome(make, (s) => s.log.some((e) => e.ev?.k === 'cleanse'))
    expect(st.log.find((e) => e.ev?.k === 'roll')!.dice![0].kind).toBe('danger')
    expect(st.log.some((e) => e.text.includes('Retribution') && e.text.includes('+2'))).toBe(true)
  })

  it('Zanshin Tactics swaps a planned card for a new one before it is revealed', () => {
    let st = game('oni')
    only(st, 'zanshin_tactics')
    st.phase = 'killer'
    st.killer.planned = ['sneak', 'sprint']
    st.killer.hand = ['crouch', 'vault', 'wait']
    st.step = { t: 'idle' }
    st.queue = [{ k: 'killerTurn', turn: 0 }, { k: 'cleanup' }]
    st = apply({ ...st, step: { t: 'turnStart', s: 0 }, queue: [...st.queue] }, { t: 'continue' })
    expect(st.step).toMatchObject({ t: 'offer', perk: 'zanshin_tactics' })
    st = apply(st, { t: 'perk', perk: 'zanshin_tactics', use: true, choice: { index: 0, card: 'wait' } })
    expect(st.killer.planned[0]).toBe('wait')
    expect(st.killer.hand).toEqual(['crouch', 'vault'])
  })

  it('For the People: Zarina wounds herself to heal someone in her room', () => {
    let st = game('trapper')
    only(st, 'for_the_people')
    st.survivors[0].perks = ['for_the_people']
    st.survivors[0].wounded = false
    Object.assign(st.survivors[1], { room: st.survivors[0].room, wounded: true })
    const w = { k: 'entered' as const, s: 0 }
    expect(perkChoices(st, 'for_the_people', 0, w)).toContainEqual({ target: 1 })
    st.step = { t: 'offer', perk: 'for_the_people', owner: 0, w, done: [] }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    st = apply(st, { t: 'perk', perk: 'for_the_people', use: true, choice: { target: 1 } })
    expect(st.survivors[0].wounded).toBe(true)
    expect(st.survivors[1].wounded).toBe(false)
    expect(perkChoices(st, 'for_the_people', 0, w)).toEqual([])
  })

  it('Blood Echo wounds a survivor in a connected room after a hang', () => {
    const st = game('oni')
    only(st, 'blood_echo')
    const { room } = neighbour(st)
    st.survivors.forEach((sv) => (sv.room = 'far'))
    Object.assign(st.survivors[1], { room, wounded: false })
    expect(perkChoices(st, 'blood_echo', 'killer', { k: 'afterHang', s: 0 })).toEqual([{ target: 1 }])
  })
})

describe('house rules', () => {
  it('after a rescue, both survivors may stay in the room', () => {
    let st = game('trapper')
    only(st)
    st.phase = 'survivors'
    st.activeSurvivor = 0
    const room = st.survivors[0].room
    const hook = placeProp(st, 'hook', room)
    Object.assign(st.survivors[1], { status: 'hooked', room })
    hook.occupant = 1
    st.step = { t: 'survivorInteract', s: 0, canInteract: true }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    st = apply(st, { t: 'interact', i: { k: 'sabotage', prop: hook.id } })
    expect(st.step).toEqual({ t: 'anyMove', s: 0 })
    st = apply(st, { t: 'stop' })
    expect(st.step).toEqual({ t: 'anyMove', s: 1 })
    st = apply(st, { t: 'stop' })
    expect(st.survivors[0].room).toBe(room)
    expect(st.survivors[1].room).toBe(room)
    expect(st.survivors[1].status).toBe('board')
  })
})

describe('The Twins, The Blight, Élodie and Felix', () => {
  function neighbour(st: GameState, room = st.killer.room) {
    const p = touchingPaths(st, room).find((x) => !st.paths[x.id].wall)!
    return { path: p.id, room: p.a === room ? p.b : p.a, kind: p.kind }
  }

  it('Blood Bond places Victor; a turn taken with him makes him the killer, and back after', () => {
    let st = game('twins')
    only(st)
    killerInteracting(st)
    const home = st.killer.room
    st = apply(st, { t: 'interact', i: { k: 'victor' } })
    expect(st.killer.victorRoom).toBe(home)
    // next turn: the choice, then Victor plays it from his room
    st.killer.room = neighbour(st).room
    st.killer.powerUsed = false
    st.phase = 'killer'
    st.killer.planned = ['wait', 'wait']
    st.step = { t: 'idle' }
    st.queue = [{ k: 'killerTurn', turn: 1, begun: true }]
    st = apply({ ...st, step: { t: 'turnStart', s: 0 }, queue: [{ k: 'killerTurn', turn: 1, begun: true }] }, { t: 'continue' })
    expect(st.step).toEqual({ t: 'twinChoice', turn: 1 })
    const charlotte = st.killer.room
    st = apply(st, { t: 'twin', victor: true })
    expect(st.killer.asVictor).toBe(true)
    expect(st.killer.room).toBe(home)
    expect(charlotteRoom(st)).toBe(charlotte)
    // a survivor in Victor's room: "pick up" gives a ▲ instead
    Object.assign(st.survivors[1], { room: home, wounded: true, woundedThisRound: false, status: 'board' })
    const bp = st.killer.bp
    st = apply(st, { t: 'interact', i: { k: 'pickUp', target: 1 } })
    expect(st.survivors[1].status).toBe('board')
    expect(st.killer.bp).toBe(bp + 1)
    expect(st.killer.asVictor).toBeFalsy()
    expect(st.killer.room).toBe(charlotte)
    expect(victorRoom(st)).toBe(home)
  })

  it('a survivor in his room can remove Victor', () => {
    const st = game('twins')
    only(st)
    st.killer.victorRoom = st.survivors[0].room
    expect(survivorInteractions(st, 0)).toContainEqual({ k: 'removeVictor' })
  })

  it("The Blight's hand has two of each path card and no Wait; two copies can be planned", () => {
    let st = game('blight')
    expect([...st.killer.hand].sort()).toEqual(['crouch', 'crouch', 'sneak', 'sneak', 'sprint', 'sprint', 'vault', 'vault'])
    while (st.step.t !== 'planKiller') st = apply(st, legalActions(st).find((a) => a.t === 'planSurvivors' || (a.t === 'perk' && !a.use) || a.t === 'continue') ?? legalActions(st)[0])
    st = apply(st, { t: 'planKiller', cards: ['sprint', 'sprint'] })
    expect(st.killer.planned).toEqual(['sprint', 'sprint'])
    expect(st.killer.hand.filter((c) => c === 'sprint')).toHaveLength(0)
    expect(st.killer.hand).toHaveLength(6)
  })

  it('Blighted Corruption discards a random card and moves along it; then he may go again', () => {
    let st = game('blight')
    only(st)
    killerInteracting(st)
    const { kind } = neighbour(st)
    st.killer.hand = [kind]
    st = apply(st, { t: 'interact', i: { k: 'rush' } })
    expect(st.killer.hand).toEqual([])
    expect(st.step).toMatchObject({ t: 'killerMove', card: kind, rush: true })
    const path = (legalActions(st).find((a) => a.t === 'move') as { path: string }).path
    const from = st.killer.room
    st = apply(st, { t: 'move', path })
    while (st.step.t === 'revealProp' || st.step.t === 'offer') st = apply(st, legalActions(st)[0])
    expect(st.killer.room).not.toBe(from)
    expect(st.step).toMatchObject({ t: 'killerInteract', rush: true, canInteract: true })
  })

  it('Coup de Grâce plays the card just used again, right after the turn', () => {
    let st = game('twins')
    only(st, 'coup_de_grace')
    st.phase = 'killer'
    st.killer.planned = ['wait', 'sneak']
    st.killer.revealedCount = 1
    st.step = { t: 'idle' }
    st = apply({ ...st, step: { t: 'turnStart', s: 0 }, queue: [{ k: 'endKillerTurn', turn: 0 }] }, { t: 'continue' })
    expect(st.step).toMatchObject({ t: 'offer', perk: 'coup_de_grace' })
    st = apply(st, { t: 'perk', perk: 'coup_de_grace', use: true, choice: {} })
    expect(st.killer.planned).toEqual(['wait', 'wait', 'sneak'])
    expect(st.killer.bonusUsed).toBe(true)
  })

  it('Built to Last keeps the item used; Appraisal takes one someone else discards', () => {
    // Felix (survivor 0) uses a key for ▲ with Built to Last
    let st = game('trapper')
    only(st, 'built_to_last', 'appraisal')
    st.survivors[0].perks = ['built_to_last']
    st.survivors[1].perks = ['appraisal']
    st.survivors[0].item = 'broken_key'
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.step = { t: 'survivorInteract', s: 0, canInteract: true }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    st = apply(st, { t: 'useItem', s: 0, use: { k: 'bp' } })
    expect(st.step).toMatchObject({ t: 'offer', perk: 'built_to_last', owner: 0 })
    st = apply(st, { t: 'perk', perk: 'built_to_last', use: true, choice: {} })
    expect(st.survivors[0].item).toBe('broken_key')
    expect(itemUses(st, 0)).toEqual([]) // not again this turn
    // Appraisal isn't offered for an item that was kept
    expect(st.step.t === 'offer' && st.step.perk === 'appraisal').toBe(false)

    // without Built to Last, Élodie (survivor 1) takes the discarded key
    let st2 = game('trapper')
    only(st2, 'appraisal')
    st2.survivors[1].perks = ['appraisal']
    st2.survivors[0].item = 'broken_key'
    st2.phase = 'survivors'
    st2.activeSurvivor = 0
    st2.step = { t: 'survivorInteract', s: 0, canInteract: true }
    st2.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    st2 = apply(st2, { t: 'useItem', s: 0, use: { k: 'bp' } })
    expect(st2.step).toMatchObject({ t: 'offer', perk: 'appraisal', owner: 1 })
    st2 = apply(st2, { t: 'perk', perk: 'appraisal', use: true, choice: {} })
    expect(st2.survivors[1].item).toBe('broken_key')
    expect(st2.survivors[0].item).toBeNull()
  })

  it('Deception: Élodie stays put, cannot interact, and gains a ▲', () => {
    let st = game('trapper')
    only(st, 'deception')
    st.survivors[0].perks = ['deception']
    st.survivors[0].bp = 3
    const room = st.survivors[0].room
    st.phase = 'survivors'
    st.survivors[0].planned = 'sneak'
    st.activeSurvivor = 0
    st.step = { t: 'idle' }
    st = apply({ ...st, step: { t: 'turnStart', s: 0 }, queue: [{ k: 'cardMove', s: 0, card: 'sneak' }, { k: 'survivorInteract', s: 0 }, { k: 'endSurvivorTurn', s: 0 }] }, { t: 'continue' })
    expect(st.step).toMatchObject({ t: 'offer', perk: 'deception' })
    st = apply(st, { t: 'perk', perk: 'deception', use: true, choice: {} })
    expect(st.survivors[0].room).toBe(room)
    expect(st.survivors[0].bp).toBe(4)
    expect(st.step).toMatchObject({ t: 'survivorInteract', s: 0, canInteract: false })
  })

  it('Power Struggle shows the first card, pays the killer 2 ▲, and stops their first interaction', () => {
    let st = game('trapper')
    only(st, 'power_struggle')
    st.survivors[0].perks = ['power_struggle']
    st.survivors[0].room = st.killer.room
    st.killer.planned = ['wait', 'sneak']
    st.killer.revealedCount = 0
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.step = { t: 'survivorInteract', s: 0, canInteract: true }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    const bp = st.killer.bp
    st = apply(st, { t: 'interact', i: { k: 'powerStruggle' } })
    expect(st.killer.shown).toContain(0)
    expect(st.killer.bp).toBe(bp + 2)
    expect(st.struggle).toBe(true)
  })

  it('Desperate Measures: a second interaction, with a chest or a locker only', () => {
    let st = game('trapper')
    only(st, 'desperate_measures')
    st.survivors[0].perks = ['desperate_measures']
    const room = st.survivors[0].room
    const chest = placeProp(st, 'chest', room)
    const gen = placeProp(st, 'generator', room)
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.step = { t: 'survivorInteract', s: 0, canInteract: true }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    st = apply(st, { t: 'interact', i: { k: 'hide', prop: placeProp(st, 'locker', room).id } })
    // hidden in a locker: not on the board, so no perk
    expect(st.step.t === 'offer' && st.step.perk === 'desperate_measures').toBe(false)
    let st2 = game('trapper')
    only(st2, 'desperate_measures')
    st2.survivors[0].perks = ['desperate_measures']
    placeProp(st2, 'chest', st2.survivors[0].room)
    const crow = placeProp(st2, 'crow', st2.survivors[0].room)
    st2.phase = 'survivors'
    st2.activeSurvivor = 0
    st2.survivorHands[st2.survivors[0].hand] = []
    st2.step = { t: 'survivorInteract', s: 0, canInteract: true }
    st2.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    st2 = apply(st2, { t: 'interact', i: { k: 'crow', prop: crow.id } })
    expect(st2.step).toMatchObject({ t: 'offer', perk: 'desperate_measures' })
    st2 = apply(st2, { t: 'perk', perk: 'desperate_measures', use: true, choice: {} })
    expect(st2.step).toMatchObject({ t: 'survivorInteract', survivalOnly: true })
    expect(survivorInteractions(st2, 0).every((i) => i.k === 'rummage' || i.k === 'hide')).toBe(true)
    void chest
    void gen
  })

  it('Blood Favour: everyone wounded and nobody hooked at cleanup is a sacrifice progress', () => {
    let st = game('blight')
    only(st, 'blood_favour')
    st.survivors.forEach((sv) => Object.assign(sv, { wounded: true, status: 'board' }))
    st.step = { t: 'idle' }
    st = apply({ ...st, step: { t: 'turnStart', s: 0 }, queue: [{ k: 'cleanup' }] }, { t: 'continue' })
    expect(st.sacrifice).toBe(1)
  })

  it("Dragon's Grip: survivors next to the damaged generator by those paths pay a ▲ or are wounded", () => {
    const st = game('blight')
    only(st, 'dragons_grip')
    killerInteracting(st)
    const gen = placeProp(st, 'generator', st.killer.room)
    const n = neighbour(st)
    st.survivors.forEach((sv) => Object.assign(sv, { room: 'far', wounded: false }))
    Object.assign(st.survivors[2], { room: n.room, bp: 0 })
    st.killer.hand = [n.kind]
    const choices = perkChoices(st, 'dragons_grip', 'killer', { k: 'killerBreak', what: 'damage', prop: gen.id })
    expect(choices).toEqual([{ card: n.kind }])
  })

  it("Undying damaging a generator still sets off Dragon's Grip", () => {
    const st = game('blight')
    only(st, 'undying', 'dragons_grip')
    killerInteracting(st)
    const n = neighbour(st)
    const gen = placeProp(st, 'generator', n.room)
    // the card Undying discards, and one of the same colour left for Dragon's Grip
    st.killer.hand = [n.kind, n.kind]
    st.survivors.forEach((sv) => Object.assign(sv, { room: 'far', wounded: false }))
    // a healthy survivor in the killer's room: a path of that colour joins it to the generator's
    Object.assign(st.survivors[1], { room: st.killer.room, bp: 0 })
    const after = apply(st, { t: 'interact', i: { k: 'undying', card: n.kind, i: { k: 'damage', prop: gen.id } } })
    expect(after.step).toMatchObject({ t: 'offer', perk: 'dragons_grip', w: { k: 'killerBreak', what: 'damage', prop: gen.id } })
    // with no ▲ to pay, the survivor takes the wound
    const hit = apply(after, { t: 'perk', perk: 'dragons_grip', use: true, choice: { card: n.kind } })
    expect(hit.survivors[1].wounded).toBe(true)
  })

  it("Dragon's Grip after an Undying damage reaches out from the generator, not from the killer", () => {
    const st = game('blight')
    only(st, 'undying', 'dragons_grip')
    killerInteracting(st)
    // Ancient Tree —sneak→ Scrapyard (the generator) —crouch→ Foundry Ground.
    // Shack is a crouch away from the killer's own room, so it tells the two origins apart.
    st.killer.room = 'ancient-tree'
    st.killer.hand = ['sneak', 'crouch']
    const gen = placeProp(st, 'generator', 'scrapyard')
    st.survivors.forEach((sv) => Object.assign(sv, { room: 'backlot', wounded: false, bp: 0 }))
    st.survivors[0].room = 'foundry-ground' // a crouch path from the generator
    st.survivors[1].room = 'shack' // a crouch path from the killer
    st.survivors[2].room = 'scrapyard' // in the generator's own room
    const after = apply(st, { t: 'interact', i: { k: 'undying', card: 'sneak', i: { k: 'damage', prop: gen.id } } })
    expect(after.step).toMatchObject({ t: 'offer', perk: 'dragons_grip' })
    const hit = apply(after, { t: 'perk', perk: 'dragons_grip', use: true, choice: { card: 'crouch' } })
    expect(hit.survivors.map((sv) => sv.wounded)).toEqual([true, false, false, false])
  })
})

describe('The Spirit', () => {
  /** The Spirit at `room` with only `perks`, about to interact; her hand holds every card. */
  function spirit(...perks: PerkId[]) {
    const st = game('spirit')
    only(st, ...perks)
    killerInteracting(st)
    st.killer.hand = ['sneak', 'sprint', 'crouch', 'vault', 'wait']
    st.survivors.forEach((sv) => Object.assign(sv, { room: 'shack', wounded: false, status: 'board' }))
    const room = st.killer.room
    const path = touchingPaths(st, room)[0]
    const other = path.a === room ? path.b : path.a
    return { st, room, path, other }
  }

  it("Yamaoka's Haunting: discard a card to attack a healthy survivor over a path of its colour", () => {
    const { st, path, other } = spirit()
    st.survivors[0].room = other
    st.survivors[1].room = other
    st.survivors[1].wounded = true
    const options = killerInteractions(st).filter((i) => i.k === 'haunt')
    // the healthy one only, and only with the card of that path's colour (never Wait)
    expect(options.some((i) => i.k === 'haunt' && i.i.k === 'attack' && i.i.target === 0 && i.card === path.kind)).toBe(true)
    expect(options.some((i) => i.k === 'haunt' && i.i.k === 'attack' && i.i.target === 1)).toBe(false)
    expect(options.some((i) => i.k === 'haunt' && i.card === 'wait')).toBe(false)
    const i = options.find((x) => x.k === 'haunt' && x.i.k === 'attack' && x.i.target === 0)!
    const after = apply(st, { t: 'interact', i })
    expect(after.survivors[0].wounded).toBe(true)
    expect(after.killer.room).toBe(st.killer.room)
    expect(after.killer.powerUsed).toBe(true)
    expect(after.killer.hand).not.toContain(path.kind)
  })

  it("Yamaoka's Haunting reaches props over there, and a Flashlight there can't stop it", () => {
    const { st, other } = spirit()
    const gen = placeProp(st, 'generator', other)
    gen.progress = 2
    st.survivors[2].room = other
    st.survivors[2].item = 'flashlight'
    const i = killerInteractions(st).find((x) => x.k === 'haunt' && x.i.k === 'damage' && x.i.prop === gen.id)!
    const done = apply(st, { t: 'interact', i })
    expect(done.step.t).not.toBe('reaction')
    expect(done.props.find((p) => p.id === gen.id)!.progress).toBe(0)
    expect(done.survivors[2].item).toBe('flashlight')
  })

  it('Rancor while carrying: the wounded survivor comes along and reveals a prop there', () => {
    const { st, room, path, other } = spirit('rancor')
    Object.assign(st.survivors[0], { room, wounded: true, status: 'carried' })
    Object.assign(st.survivors[1], { room, wounded: true })
    st.props.forEach((p) => p.room === other && (p.revealed = false))
    st.step = { t: 'carryMove', s: 0, steps: 3 }
    st.queue = [{ k: 'endKillerTurn', turn: 0 }]
    let s2 = apply(st, { t: 'move', path: path.id })
    while (s2.step.t === 'revealProp') s2 = apply(s2, legalActions(s2)[0])
    expect(s2.step).toMatchObject({ t: 'offer', perk: 'rancor' })
    const before = s2.props.filter((p) => p.room === other && p.revealed).length
    let used = apply(s2, { t: 'perk', perk: 'rancor', use: true, choice: { target: 1 } })
    while (used.step.t === 'revealProp') used = apply(used, legalActions(used)[0])
    expect(used.survivors[1].room).toBe(other)
    const hidden = st.props.filter((p) => p.room === other && !p.removed).length
    expect(hidden).toBeGreaterThan(1)
    expect(used.props.filter((p) => p.room === other && p.revealed).length).toBe(before + 1)
  })

  it('Rancor: a wounded survivor in the room she leaves comes along', () => {
    const { st, room, path, other } = spirit('rancor')
    st.survivors[0].room = room
    st.survivors[0].wounded = true
    st.step = { t: 'killerMove', turn: 0, card: path.kind as never }
    st.queue = [{ k: 'killerInteract', turn: 0 }, { k: 'endKillerTurn', turn: 0 }]
    let s2 = apply(st, { t: 'move', path: path.id })
    while (s2.step.t === 'revealProp') s2 = apply(s2, legalActions(s2)[0])
    expect(s2.step).toMatchObject({ t: 'offer', perk: 'rancor' })
    const used = apply(s2, { t: 'perk', perk: 'rancor', use: true, choice: { target: 0 } })
    expect(used.survivors[0].room).toBe(other)
    expect(used.killer.room).toBe(other)
  })

  it('Haunted Ground: after a survivor reveals a prop, swap it with a revealed one of its colour', () => {
    const { st } = spirit('haunted_ground')
    // a face-down chest, and a revealed locker (the same colour: survival) in another room
    const hidden = st.props.find((p) => p.kind === 'chest' && p.room && !p.removed)!
    hidden.revealed = false
    const other = placeProp(st, 'locker', touchingPaths(st, hidden.room!)[0].a === hidden.room ? touchingPaths(st, hidden.room!)[0].b : touchingPaths(st, hidden.room!)[0].a)
    const [from, to] = [hidden.room, other.room]
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.survivors[0].room = hidden.room!
    st.step = { t: 'revealProp', room: hidden.room!, who: 0 } as never
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    const offered = apply(st, { t: 'reveal', prop: hidden.id })
    expect(offered.step).toMatchObject({ t: 'offer', perk: 'haunted_ground' })
    const swapped = apply(offered, { t: 'perk', perk: 'haunted_ground', use: true, choice: { prop: other.id } })
    expect(swapped.props.find((p) => p.id === hidden.id)!.room).toBe(to)
    expect(swapped.props.find((p) => p.id === other.id)!.room).toBe(from)
  })

  it('Spirit Fury: breaking a pallet pays 2 ▲', () => {
    const { st, path } = spirit('spirit_fury')
    const pallet = st.props.find((p) => p.kind === 'pallet')!
    Object.assign(pallet, { room: null, path: path.id, revealed: true })
    st.step = { t: 'killerMove', turn: 0, card: path.kind as never }
    st.queue = [{ k: 'endKillerTurn', turn: 0 }]
    const bp = st.killer.bp
    const broke = apply(st, { t: 'move', path: path.id })
    expect(broke.step).toMatchObject({ t: 'offer', perk: 'spirit_fury' })
    const paid = apply(broke, { t: 'perk', perk: 'spirit_fury', use: true, choice: {} })
    expect(paid.killer.bp).toBe(bp + 2)
  })
})

describe('Adam Francis', () => {
  /** Adam as survivor 0, with only these perks. */
  function adam(...perks: PerkId[]) {
    const st = createGame({ board: 'macmillan', survivors: ['adam', 'meg', 'claudette', 'jake'].map((id) => ({ id, name: id })), killer: { id: 'trapper', name: 'trapper' }, players: 5, seed: 1 })
    let g = st
    while (g.step.t === 'setupReveal') g = apply(g, legalActions(g)[0])
    only(g, ...perks)
    return g
  }

  it('Diversion: an interaction with the killer in his room sends him along a free path; he gains 1 ▲', () => {
    const st = adam('diversion')
    const room = st.killer.room
    st.survivors.forEach((sv) => Object.assign(sv, { room: 'shack', status: 'board', planned: 'sneak', plannedRevealed: true }))
    st.survivors[0].room = room
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.canInteract = true
    st.step = { t: 'survivorInteract', s: 0, canInteract: true }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    const i = survivorInteractions(st, 0).find((x) => x.k === 'diversion')!
    expect(i).toBeDefined()
    const p = touchingPaths(st, room).find((x) => x.id === (i as { path: string }).path)!
    const bp = st.killer.bp
    let after = apply(st, { t: 'interact', i })
    while (after.step.t === 'revealProp') after = apply(after, legalActions(after)[0])
    expect(after.killer.room).toBe(p.a === room ? p.b : p.a)
    expect(after.killer.bp).toBe(bp + 1)
    expect(after.survivors[0].bp).toBe(6 - 2)
  })

  it('Diversion through a wall: the killer breaks it on the way', () => {
    const st = adam('diversion')
    const room = st.killer.room
    st.survivors.forEach((sv) => Object.assign(sv, { room: 'shack', status: 'board', planned: 'sneak', plannedRevealed: true }))
    st.survivors[0].room = room
    const p = touchingPaths(st, room)[0]
    st.paths[p.token ?? p.id].wall = true
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.canInteract = true
    st.step = { t: 'survivorInteract', s: 0, canInteract: true }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    let after = apply(st, { t: 'interact', i: { k: 'diversion', path: p.id } })
    while (after.step.t === 'revealProp') after = apply(after, legalActions(after)[0])
    expect(after.killer.room).toBe(p.a === room ? p.b : p.a)
    expect(after.paths[p.token ?? p.id].wall).toBe(false)
  })

  it('Autodidact: a success in range becomes a great success', () => {
    const st = adam('autodidact')
    const room = st.survivors[0].room
    const gen = placeProp(st, 'generator', room)
    st.survivors[1].room = room
    st.phase = 'survivors'
    st.activeSurvivor = 1
    st.step = { t: 'roll', ctx: { k: 'repair', s: 1, prop: gen.id }, dice: [{ kind: 'skill', face: 3, rerolled: false }] }
    st.queue = [{ k: 'endSurvivorTurn', s: 1 }]
    expect(perkChoices(st, 'autodidact', 0, { k: 'roll' })).toEqual([{ index: 0 }])
    const after = apply(st, { t: 'perk', perk: 'autodidact', use: true, choice: { index: 0 } })
    // a great success repairs 2
    expect(after.props.find((p) => p.id === gen.id)!.progress).toBe(gen.progress + 2)
    // a failure or a great success already: nothing to change
    st.step = { t: 'roll', ctx: { k: 'repair', s: 1, prop: gen.id }, dice: [{ kind: 'skill', face: 0, rerolled: false }] }
    expect(perkChoices(st, 'autodidact', 0, { k: 'roll' })).toEqual([])
  })

  it('Deliverance: after Adam takes someone off a hook, one of the two is healed', () => {
    const st = adam('deliverance')
    const room = st.survivors[0].room
    const hook = placeProp(st, 'hook', room)
    hook.occupant = 1
    Object.assign(st.survivors[1], { status: 'hooked', room, wounded: true })
    st.survivors[0].wounded = true
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.canInteract = true
    st.step = { t: 'survivorInteract', s: 0, canInteract: true }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    let g = apply(st, { t: 'interact', i: { k: 'sabotage', prop: hook.id } })
    // both may move after a rescue, or stay
    while (g.step.t === 'anyMove') g = apply(g, { t: 'stop' })
    expect(g.step).toMatchObject({ t: 'offer', perk: 'deliverance' })
    expect(perkChoices(g, 'deliverance', 0, (g.step as Extract<GameState['step'], { t: 'offer' }>).w).map((c) => c.target).sort()).toEqual([0, 1])
    const healed = apply(g, { t: 'perk', perk: 'deliverance', use: true, choice: { target: 1 } })
    expect(healed.survivors[1].wounded).toBe(false)
    expect(healed.survivors[0].wounded).toBe(true)
  })
})
