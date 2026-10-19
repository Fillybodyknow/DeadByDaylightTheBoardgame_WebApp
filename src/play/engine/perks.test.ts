import { describe, expect, it } from 'vitest'
import { apply, anyMoves, antidoteKillerMoves, perkButtons, perkReady, survivorMoves, charlotteRoom, createGame, isFailure, itemUses, killerInteractions, perkChoices, powerOptions, survivorInteractions, touchingPaths, tryApply, victorRoom } from './engine'
import { legalActions } from './legal'
import { boards } from './boards'
import { actorsOf } from './seats'
import { DECK_PERKS, PERKS, PRINTED_PERKS, type PerkId } from './perks'
import { perkCard, perkImage, perkText } from '../labels'
import type { Action, GameState, PropKind } from './types'

const SURVIVORS = ['dwight', 'meg', 'claudette', 'jake']
const ALL_SURVIVORS = ['dwight', 'meg', 'claudette', 'jake', 'feng', 'ace', 'nea', 'yui', 'zarina', 'elodie', 'felix', 'adam', 'yunjin', 'jane', 'kate', 'david', 'jeff']
const ALL_KILLERS = ['trapper', 'nurse', 'huntress', 'hillbilly', 'doctor', 'hag', 'wraith', 'oni', 'deathslinger', 'twins', 'blight', 'spirit', 'legion', 'trickster', 'plague', 'clown', 'knight']

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
    expect(Object.keys(PERKS)).toHaveLength(129)
    // the cards that are on no board: their name, cost and text come from the deck data instead
    for (const p of DECK_PERKS) {
      expect(PERKS[p].character, p).toBe('')
      expect(perkCard(p)?.name, p).toBe(PERKS[p].name)
      expect(perkCard(p)?.cost, p).toBe(PERKS[p].cost)
      expect(perkText(p), p).not.toBe('')
      expect(perkImage(p), p).not.toBe('')
    }
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
    // not teleporting: 1 ▲, whatever the die shows
    expect(apply(st, { t: 'phantasm', teleport: false }).killer.bp).toBe(Math.min(12, st.killer.bp + 1))
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
    /**
     * One random game, its rules checked as it goes; the perks it used go into `used`. `only`: its
     * character plays with that one perk (the others spend the ▲ it needs before its moment comes).
     */
    function play(seed: number, killer: string, crew: string[], only?: PerkId) {
      let st = createGame({ board: 'macmillan', survivors: crew.map((id) => ({ id, name: id })), killer: { id: killer, name: killer }, players: 5, seed })
      if (only) {
        // a card-only perk (the edit-perks mode) is on no board: deal it to the right side
        if (PERKS[only].card) {
          if (PERKS[only].side === 'killer') st.killer.perks = [only]
          else st.survivors.forEach((sv) => (sv.perks = [only]))
        } else {
          const keep = (list: PerkId[]) => (list.includes(only) ? [only] : list)
          st.killer.perks = keep(st.killer.perks)
          st.survivors.forEach((sv) => (sv.perks = keep(sv.perks)))
        }
      }
      let rng = seed * 7919
      for (let n = 0; n < 4000 && st.phase !== 'over'; n++) {
        const options = legalActions(st)
        expect(options.length).toBeGreaterThan(0)
        const eager = options.filter(
          (a: Action) =>
            (a.t === 'perk' && a.use) ||
            (a.t === 'interact' && ['power', 'blink', 'hatchet', 'chainsaw', 'calmSpirit', 'spark', 'phantasm', 'bell', 'wrath', 'redeemer', 'victor', 'rush', 'haunt', 'frenzy', 'showstopper', 'purge', 'afterpiece', 'guard', 'hoard', 'undying', 'powerStruggle', 'diversion', 'removeVictor', 'rummage', 'pickUp', 'search'].includes(a.i.k)) ||
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
    for (let seed = 1; seed <= 240; seed++)
      // every killer in turn, and 4 of the survivors, rotating so everyone plays
      play(seed, ALL_KILLERS[seed % ALL_KILLERS.length], [0, 1, 2, 3].map((i) => ALL_SURVIVORS[(seed + i * 2) % ALL_SURVIVORS.length]))
    // A perk whose moment didn't come: more games with its character, until it does (or 60 more).
    for (const p of Object.keys(PERKS) as PerkId[]) {
      // a card-only perk goes to whoever is playing; `play` deals it out
      const who = PERKS[p].character || (PERKS[p].side === 'killer' ? ALL_KILLERS[0] : ALL_SURVIVORS[0])
      for (let n = 0; n < 60 && !used.has(p); n++) {
        const seed = 1000 + n * 7 + Object.keys(PERKS).indexOf(p) * 101
        const crew = [0, 1, 2, 3].map((i) => ALL_SURVIVORS[(seed + i * 2) % ALL_SURVIVORS.length])
        if (PERKS[p].side === 'killer') play(seed, who, crew, p)
        else play(seed, ALL_KILLERS[seed % ALL_KILLERS.length], crew.includes(who) ? crew : [who, ...crew.filter((c) => c !== who).slice(0, 3)], p)
      }
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

  it("Built to Last: a Flashlight kept on the killer's first turn is offered again on his second", () => {
    let st = game('trapper')
    only(st, 'built_to_last')
    st.survivors[0].perks = ['built_to_last']
    st.survivors[0].item = 'flashlight'
    killerInteracting(st)
    st.survivors[0].room = st.killer.room
    st.survivors[0].wounded = false
    st = apply(st, { t: 'interact', i: { k: 'attack', target: 0 } })
    expect(st.step).toMatchObject({ t: 'reaction', item: 'flashlight', holders: [0] })
    st = apply(st, { t: 'react', s: 0 })
    expect(st.step).toMatchObject({ t: 'offer', perk: 'built_to_last', owner: 0 })
    st = apply(st, { t: 'perk', perk: 'built_to_last', use: true, choice: {} })
    expect(st.survivors[0]).toMatchObject({ item: 'flashlight', wounded: false })
    expect(st.kept).toEqual([{ s: 0, item: 'flashlight' }])
    // the second killer turn (his Wait card): a new turn, so the Flashlight works again (the card
    // forbids only the turn it was used in)
    let guard = 0
    while (!(st.step.t === 'killerInteract' && st.step.turn === 1) && guard++ < 20) st = apply(st, legalActions(st).find((x) => x.t !== 'interact') ?? legalActions(st)[0])
    expect(st.step).toMatchObject({ t: 'killerInteract', turn: 1 })
    expect(st.itemLock).toBeNull()
    st.survivors[0].room = st.killer.room
    st = apply(st, { t: 'interact', i: { k: 'attack', target: 0 } })
    expect(st.step).toMatchObject({ t: 'reaction', item: 'flashlight', holders: [0] })
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

describe('Yun-Jin Lee', () => {
  /** Yun-Jin as survivor 0 with only these perks; the killer about to interact in `room`. */
  function yunjin(...perks: PerkId[]) {
    let st = createGame({ board: 'macmillan', survivors: ['yunjin', 'meg', 'claudette', 'jake'].map((id) => ({ id, name: id })), killer: { id: 'trapper', name: 'trapper' }, players: 5, seed: 1 })
    while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
    only(st, ...perks)
    killerInteracting(st)
    st.survivors.forEach((sv) => Object.assign(sv, { room: 'shack', status: 'board', wounded: false, planned: 'sneak', plannedRevealed: true }))
    return st
  }

  it('Smash Hit: the killer damaging a generator pays her 1 ▲', () => {
    const st = yunjin('smash_hit')
    const gen = placeProp(st, 'generator', st.killer.room)
    gen.progress = 1
    st.survivors[0].bp = 2 // room to gain (6 is her most)
    const bp = st.survivors[0].bp
    const offered = apply(st, { t: 'interact', i: { k: 'damage', prop: gen.id } })
    expect(offered.step).toMatchObject({ t: 'offer', perk: 'smash_hit' })
    const paid = apply(offered, { t: 'perk', perk: 'smash_hit', use: true, choice: {} })
    expect(paid.survivors[0].bp).toBe(bp + 1)
  })

  it('Fast Track: after the turn someone else is wounded, she repairs a generator in her room', () => {
    const st = yunjin('fast_track', 'self_preservation')
    const room = st.killer.room
    st.survivors[1].room = room
    const gen = placeProp(st, 'generator', 'shack')
    const locker = placeProp(st, 'locker', 'shack')
    let g = apply(st, { t: 'interact', i: { k: 'attack', target: 1 } })
    // nothing until the killer's turn ends; then both her perks are offered together
    for (let n = 0; n < 10 && !(g.step.t === 'offer' && ['fast_track', 'self_preservation'].includes(g.step.perk)); n++) {
      const opts = legalActions(g)
      g = apply(g, opts.find((a) => a.t === 'endTurn' || (a.t === 'perk' && !a.use)) ?? opts[0])
    }
    expect(g.step).toMatchObject({ t: 'offer', w: { k: 'killerTurnEnd' } })
    expect(perkChoices(g, 'fast_track', 0, (g.step as Extract<GameState['step'], { t: 'offer' }>).w)).toEqual([{ prop: gen.id }])
    expect(perkChoices(g, 'self_preservation', 0, (g.step as Extract<GameState['step'], { t: 'offer' }>).w)).toEqual([{ prop: locker.id }])
    const rolled = apply(g, { t: 'perk', perk: 'fast_track', use: true, choice: { prop: gen.id } })
    expect(rolled.log.some((e) => e.ev?.k === 'roll' && e.ev.s === 0 && e.ev.ctx === 'repair')).toBe(true)
  })

  it('Fast Track: not when only she was hurt', () => {
    const st = yunjin('fast_track')
    st.turnHurt = [0]
    expect(perkChoices(st, 'fast_track', 0, { k: 'killerTurnEnd', turn: 0 })).toEqual([])
  })
})

describe('The Legion', () => {
  /** The Legion with only these perks, about to interact; everyone else in the shack. */
  function legion(...perks: PerkId[]) {
    const st = game('legion')
    only(st, ...perks)
    killerInteracting(st)
    st.survivors.forEach((sv) => Object.assign(sv, { room: 'shack', status: 'board', wounded: false, planned: 'sneak', plannedRevealed: true }))
    return st
  }

  it('Feral Frenzy: everyone in his room is wounded; ▲ when one already was', () => {
    const st = legion()
    st.killer.room = 'scrapyard'
    Object.assign(st.survivors[0], { room: 'scrapyard', wounded: true })
    st.survivors[1].room = 'scrapyard'
    const bp = st.killer.bp
    const after = apply(st, { t: 'interact', i: { k: 'frenzy' } })
    expect(after.survivors[1].wounded).toBe(true)
    expect(after.survivors[2].wounded).toBe(false)
    expect(after.killer.bp).toBe(bp + 1)
    expect(after.killer.powerUsed).toBe(true)
  })

  it('Mad Grit: carrying someone into a room with another survivor wounds them', () => {
    const st = legion('mad_grit')
    const room = st.killer.room
    const path = touchingPaths(st, room)[0]
    const next = path.a === room ? path.b : path.a
    Object.assign(st.survivors[0], { status: 'carried', room, wounded: true })
    st.survivors[1].room = next
    st.props.forEach((p) => p.room === next && (p.revealed = true))
    st.step = { t: 'carryMove', s: 0, steps: 3 }
    let g = apply(st, { t: 'move', path: path.id })
    while (g.step.t === 'revealProp') g = apply(g, legalActions(g)[0])
    expect(g.step).toMatchObject({ t: 'offer', perk: 'mad_grit' })
    const hit = apply(g, { t: 'perk', perk: 'mad_grit', use: true, choice: { target: 1 } })
    expect(hit.survivors[1].wounded).toBe(true)
  })

  it('Discordance: a survivor joining another pays ▲ for each survivor and the killer there', () => {
    const st = legion('discordance')
    st.phase = 'survivors'
    st.activeSurvivor = 0
    // a move the card in hand can make from the shack
    const m = (['sneak', 'sprint', 'crouch', 'vault'] as const).flatMap((card) => survivorMoves(st, 0, card).map((x) => ({ ...x, card })))[0]
    const path = m.path
    const next = m.to
    st.survivors[1].room = next
    st.survivors[2].room = next
    st.killer.room = next
    st.props.forEach((p) => p.room === next && (p.revealed = true))
    st.step = { t: 'survivorMove', s: 0, card: m.card }
    st.queue = [{ k: 'survivorInteract', s: 0 }, { k: 'endSurvivorTurn', s: 0 }]
    const bp = st.killer.bp
    let g = apply(st, { t: 'move', path: path.id })
    for (let n = 0; n < 5 && !(g.step.t === 'offer' && g.step.perk === 'discordance'); n++) g = apply(g, legalActions(g)[0])
    expect(g.step).toMatchObject({ t: 'offer', perk: 'discordance' })
    const paid = apply(g, { t: 'perk', perk: 'discordance', use: true, choice: {} })
    expect(paid.killer.bp).toBe(Math.min(12, bp + 4)) // three survivors and the killer
  })

  it('Iron Maiden: before interacting, an empty locker and an empty hook swap places; he still interacts', () => {
    const st = legion('iron_maiden')
    const locker = placeProp(st, 'locker', 'shack')
    const hook = placeProp(st, 'hook', 'backlot')
    const opts = perkButtons(st).find((b) => b.perk === 'iron_maiden')!.choices
    expect(opts).toContainEqual({ prop: locker.id, prop2: hook.id })
    const after = apply(st, { t: 'perk', perk: 'iron_maiden', use: true, choice: { prop: locker.id, prop2: hook.id } })
    expect(after.props.find((p) => p.id === locker.id)!.room).toBe('backlot')
    expect(after.props.find((p) => p.id === hook.id)!.room).toBe('shack')
    expect(after.step).toMatchObject({ t: 'killerInteract', canInteract: true })
  })
})

describe('Jane Romero', () => {
  /** Jane as survivor 0 with only these perks; everyone in the scrapyard, on the board. */
  function jane(...perks: PerkId[]) {
    let st = createGame({ board: 'macmillan', survivors: ['jane', 'meg', 'claudette', 'jake'].map((id) => ({ id, name: id })), killer: { id: 'trapper', name: 'trapper' }, players: 5, seed: 1 })
    while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
    only(st, ...perks)
    st.survivors.forEach((sv) => Object.assign(sv, { room: 'scrapyard', status: 'board', wounded: false, planned: 'sneak', plannedRevealed: true, acted: true }))
    return st
  }

  it("Poised: a great success on someone's repair gives them a bonus turn, after their interaction", () => {
    const offered = findOutcome(
      (rng) => {
        const st = jane('poised')
        const gen = placeProp(st, 'generator', 'scrapyard')
        gen.progress = 0
        st.phase = 'survivors'
        st.activeSurvivor = 1
        st.step = { t: 'survivorInteract', s: 1, canInteract: true }
        st.queue = [{ k: 'trigger', w: { k: 'turnEnd', s: 1 }, done: [] }, { k: 'endSurvivorTurn', s: 1 }]
        st.rng = rng
        return apply(st, { t: 'interact', i: { k: 'repair', prop: gen.id } })
      },
      (st) => st.step.t === 'offer' && st.step.perk === 'poised',
    )
    expect(perkChoices(offered, 'poised', 0, { k: 'greatRoll', s: 1, ctx: 'repair' })).toEqual([{ target: 1 }])
    const bp = offered.survivors[0].bp
    const after = apply(offered, { t: 'perk', perk: 'poised', use: true, choice: { target: 1 } })
    expect(after.survivors[0].bp).toBe(bp - 1)
    expect(after.step).toEqual({ t: 'bonusOffer', s: 1 })
  })

  it('Poised: not for a struggle, nor outside a survivor turn', () => {
    const st = jane('poised')
    st.phase = 'survivors'
    st.activeSurvivor = 1
    expect(perkChoices(st, 'poised', 0, { k: 'greatRoll', s: 1, ctx: 'carry' })).toEqual([])
    st.phase = 'killer'
    st.activeSurvivor = null
    expect(perkChoices(st, 'poised', 0, { k: 'greatRoll', s: 1, ctx: 'search' })).toEqual([])
  })

  it("Poised: someone else's bonus turn hands the turn back after it", () => {
    const st = jane()
    st.phase = 'survivors'
    st.activeSurvivor = 1
    st.step = { t: 'idle' }
    st.queue = [{ k: 'poisedTurn', s: 2 }, { k: 'survivorInteract', s: 1 }, { k: 'endSurvivorTurn', s: 1 }]
    const g = apply({ ...st, step: { t: 'turnStart', s: 1 } }, { t: 'continue' })
    expect(g.step).toEqual({ t: 'bonusOffer', s: 2 })
    expect(g.activeSurvivor).toBe(2)
    const back = apply(g, { t: 'declineBonus' })
    expect(back.step).toMatchObject({ t: 'survivorInteract', s: 1 })
    expect(back.activeSurvivor).toBe(1)
  })

  it('Solidarity: heal a wounded survivor in a connected room, in place of her interaction', () => {
    const st = jane('solidarity')
    const path = touchingPaths(st, 'scrapyard')[0]
    const next = path.a === 'scrapyard' ? path.b : path.a
    Object.assign(st.survivors[1], { room: next, wounded: true })
    st.survivors[2].wounded = true // in her room: the ordinary heal
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.step = { t: 'survivorInteract', s: 0, canInteract: true }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    // a perk card in her interact step, picked first; its targets are only in connected rooms
    expect(perkButtons(st).find((b) => b.perk === 'solidarity')!.choices).toEqual([{ target: 1 }])
    expect(survivorInteractions(st, 0)).toContainEqual({ k: 'heal', target: 2 })
    const g = apply(st, { t: 'perk', perk: 'solidarity', use: true, choice: { target: 1 } })
    expect(g.survivors[0].bp).toBe(5)
    expect(g.log.some((e) => e.ev?.k === 'roll' && e.ev.ctx === 'heal' && e.ev.target === 1)).toBe(true)
  })

  it('Head On: the killer walks in, a locker goes and he cannot interact this turn', () => {
    const st = jane('head_on')
    const card = 'sneak'
    st.phase = 'killer'
    st.canInteract = true
    st.killer.room = 'scrapyard'
    st.killer.planned = [card, 'wait']
    st.killer.revealedCount = 1
    st.step = { t: 'killerMove', turn: 0, card }
    st.queue = [{ k: 'killerInteract', turn: 0 }, { k: 'endKillerTurn', turn: 0 }]
    const move = legalActions(st).find((a) => a.t === 'move')
    if (!move || move.t !== 'move') throw new Error('no sneak path from the scrapyard')
    const p = touchingPaths(st, 'scrapyard').find((x) => x.id === move.path)!
    const to = p.a === 'scrapyard' ? p.b : p.a
    st.survivors[0].room = to
    st.props.forEach((x) => x.room === to && (x.revealed = true))
    const locker = placeProp(st, 'locker', to)
    let g = apply(st, move)
    for (let n = 0; n < 5 && !(g.step.t === 'offer' && g.step.perk === 'head_on'); n++) g = apply(g, legalActions(g)[0])
    expect(g.step).toMatchObject({ t: 'offer', perk: 'head_on' })
    const after = apply(g, { t: 'perk', perk: 'head_on', use: true, choice: { prop: locker.id } })
    expect(after.props.find((x) => x.id === locker.id)!.removed).toBe(true)
    expect(after.step).toMatchObject({ t: 'killerInteract', canInteract: false })
  })
})

describe('The Trickster', () => {
  /** The Trickster with only these perks, about to interact; everyone else in the shack. */
  function trickster(...perks: PerkId[]) {
    const st = game('trickster')
    only(st, ...perks)
    killerInteracting(st)
    st.survivors.forEach((sv) => Object.assign(sv, { room: 'shack', status: 'board', wounded: false, planned: 'sneak', plannedRevealed: true }))
    return st
  }
  const next = (st: GameState, room: string) => {
    const p = touchingPaths(st, room)[0]
    return p.a === room ? p.b : p.a
  }

  it('Showstopper: a Knife for everyone in his room and the connected ones; the ▲ maximum drops', () => {
    const st = trickster()
    st.killer.room = 'shack'
    // survivor 3 two rooms away: out of reach
    const near = new Set(['shack', ...touchingPaths(st, 'shack').map((p) => (p.a === 'shack' ? p.b : p.a))])
    const beyond = touchingPaths(st, next(st, 'shack')).map((p) => (p.a === next(st, 'shack') ? p.b : p.a))
    st.survivors[3].room = beyond.find((r) => !near.has(r))!
    st.survivors[1].room = next(st, 'shack')
    st.survivors[0].bp = 6
    const after = apply(st, { t: 'interact', i: { k: 'showstopper' } })
    expect(after.survivors.map((sv) => sv.knives ?? 0)).toEqual([1, 1, 1, 0])
    expect(after.survivors[0].bp).toBe(4) // 6, less 2 for the Knife
    expect(after.killer.powerUsed).toBe(true)
  })

  it('the third Knife wounds; a fourth is a sacrifice progress instead; three cannot be healed', () => {
    const st = trickster()
    st.killer.room = 'shack'
    st.survivors[0].knives = 2
    st.survivors[1].knives = 3
    st.survivors[1].wounded = true
    const sac = st.sacrifice
    const after = apply(st, { t: 'interact', i: { k: 'showstopper' } })
    expect(after.survivors[0]).toMatchObject({ knives: 3, wounded: true, bp: 0 })
    expect(after.survivors[1].knives).toBe(3)
    expect(after.sacrifice).toBe(sac + 1)
    // nobody can make them healthy now
    const h = structuredClone(after)
    h.phase = 'survivors'
    h.activeSurvivor = 2
    h.step = { t: 'survivorInteract', s: 2, canInteract: true }
    expect(survivorInteractions(h, 2)).not.toContainEqual({ k: 'heal', target: 0 })
  })

  it('a locker sheds every Knife', () => {
    const st = trickster()
    const locker = placeProp(st, 'locker', 'shack')
    st.survivors[0].knives = 2
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.step = { t: 'survivorInteract', s: 0, canInteract: true }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    const after = apply(st, { t: 'interact', i: { k: 'hide', prop: locker.id } })
    expect(after.survivors[0].knives).toBe(0)
  })

  it('No Way Out: a survivor with fewer ▲ than him cannot repair', () => {
    const st = trickster('no_way_out')
    const gen = placeProp(st, 'generator', 'shack')
    gen.progress = 0
    st.survivors[0].bp = 1
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.step = { t: 'survivorInteract', s: 0, canInteract: true }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    const offered = apply(st, { t: 'interact', i: { k: 'repair', prop: gen.id } })
    expect(offered.step).toMatchObject({ t: 'offer', perk: 'no_way_out', w: { k: 'genInteract', s: 0 } })
    const stopped = apply(offered, { t: 'perk', perk: 'no_way_out', use: true, choice: {} })
    expect(stopped.log.some((e) => e.ev?.k === 'roll' && e.ev.ctx === 'repair')).toBe(false)
    // passing lets the repair go on
    const passed = apply(offered, { t: 'perk', perk: 'no_way_out', use: false })
    expect(passed.log.some((e) => e.ev?.k === 'roll' && e.ev.ctx === 'repair')).toBe(true)
  })

  it('No Way Out: not on a survivor with as many ▲ as him', () => {
    const st = trickster('no_way_out')
    st.survivors[0].bp = st.killer.bp
    expect(perkChoices(st, 'no_way_out', 'killer', { k: 'genInteract', s: 0, prop: 'x' })).toEqual([])
  })

  it('Crowd Control: the survivors pay 2 ▲ between them, or he sets the card face up', () => {
    let st = createGame({ board: 'macmillan', survivors: SURVIVORS.map((id) => ({ id, name: id })), killer: { id: 'trickster', name: 'trickster' }, players: 5, seed: 1 })
    while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
    expect(st.step).toMatchObject({ t: 'offer', perk: 'crowd_control' })
    const asked = apply(st, { t: 'perk', perk: 'crowd_control', use: true, choice: { target: 1 } })
    expect(asked.step).toEqual({ t: 'crowdPay', s: 1 })
    // paid: one ▲ each from two survivors, and survivor 1 plans as usual
    const paid = apply(asked, { t: 'crowdPay', pay: [0, 2] })
    expect(paid.survivors[0].bp).toBe(asked.survivors[0].bp - 1)
    expect(paid.survivors[2].bp).toBe(asked.survivors[2].bp - 1)
    expect(paid.survivors[1].planned).toBeNull()
    // refused: he picks from survivor 1's hand
    const pick = apply(asked, { t: 'crowdPay', pay: [] })
    expect(pick.step).toEqual({ t: 'crowdPick', s: 1 })
    const set = apply(pick, { t: 'crowdPick', card: 'vault' })
    expect(set.survivors[1]).toMatchObject({ planned: 'vault', plannedRevealed: true })
    expect(set.survivorHands[set.survivors[1].hand]).not.toContain('vault')
    expect(set.step.t).toBe('planSurvivors')
  })

  it('Starstruck: instead of picking someone up, he moves and picks up another, healthy or not', () => {
    const st = trickster('starstruck')
    st.killer.room = 'shack'
    const to = next(st, 'shack')
    Object.assign(st.survivors[0], { wounded: true })
    st.survivors[2].room = to
    st.props.forEach((p) => p.room === to && (p.revealed = true))
    const offered = apply(st, { t: 'interact', i: { k: 'pickUp', target: 0 } })
    expect(offered.step).toMatchObject({ t: 'offer', perk: 'starstruck' })
    const w = (offered.step as Extract<GameState['step'], { t: 'offer' }>).w
    const c = perkChoices(offered, 'starstruck', 'killer', w).find((x) => x.target === 2)!
    let g = apply(offered, { t: 'perk', perk: 'starstruck', use: true, choice: c })
    for (let n = 0; n < 5 && g.step.t !== 'carryDice'; n++) g = apply(g, legalActions(g)[0])
    expect(g.killer.room).toBe(to)
    expect(g.survivors[2].status).toBe('carried')
    expect(g.survivors[0].status).toBe('board')
  })
})

describe('The Plague', () => {
  /** The Plague with only these perks, about to interact; everyone else in the shack. */
  function plague(...perks: PerkId[]) {
    const st = game('plague')
    only(st, ...perks)
    killerInteracting(st)
    st.survivors.forEach((sv) => Object.assign(sv, { room: 'shack', status: 'board', wounded: false, planned: 'sneak', plannedRevealed: true }))
    // perks for a Vile Purge to cover: ones used by button, never asked about on a move
    st.survivors[0].perks = ['empathy', 'self_care', 'botany_knowledge']
    return st
  }
  /** A move survivor 0 can make from the shack with a card: where it leads. */
  const next = (st: GameState) => {
    const m = (['sneak', 'sprint', 'crouch', 'vault'] as const).flatMap((card) => survivorMoves(st, 0, card).map((x) => ({ ...x, card })))[0]
    return { path: { id: m.path.id, kind: m.card }, to: m.to }
  }
  /** Survivor 0 walks from the shack into `to` along `path` on their turn. */
  function walkIn(st: GameState, path: { id: string; kind: string }, to: string) {
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.props.forEach((p) => p.room === to && (p.revealed = true))
    st.step = { t: 'survivorMove', s: 0, card: path.kind as 'sneak' }
    st.queue = [{ k: 'survivorInteract', s: 0 }, { k: 'endSurvivorTurn', s: 0 }]
    let g = apply(st, { t: 'move', path: path.id })
    for (let n = 0; n < 4 && g.step.t !== 'purgeChoice' && g.step.t !== 'survivorInteract'; n++) g = apply(g, legalActions(g)[0])
    return g
  }

  it('Vile Purge: one in his room and one in a connected room', () => {
    const st = plague()
    st.killer.room = 'shack'
    const { to } = next(st)
    const after = apply(st, { t: 'interact', i: { k: 'purge', room: to } })
    expect([...after.purge!].sort()).toEqual(['shack', to].sort())
    expect(after.killer.powerUsed).toBe(true)
  })

  it('walking into a Vile Purge covers a perk of their choice, which can then not be used', () => {
    const st = plague()
    const { path, to } = next(st)
    st.purge = [to]
    const g = walkIn(st, path, to)
    expect(g.step).toEqual({ t: 'purgeChoice', s: 0, mode: 'cover' })
    expect(g.purge).toEqual([])
    const perk = g.survivors[0].perks[0]
    const covered = apply(g, { t: 'purgeChoice', perk })
    expect(covered.survivors[0].purged).toEqual([perk])
    expect(perkChoices({ ...covered, survivors: covered.survivors.map((sv) => ({ ...sv, bp: 6 })) }, perk, 0, { k: 'turnStart', s: 0 })).toEqual([])
  })

  it('the third Vile Purge clears them and wounds; already wounded, a sacrifice progress', () => {
    const st = plague()
    const { path, to } = next(st)
    st.purge = [to]
    st.survivors[0].purged = st.survivors[0].perks.slice(0, 2)
    const g = walkIn(st, path, to)
    expect(g.survivors[0]).toMatchObject({ purged: [], wounded: true })
    const st2 = plague()
    st2.purge = [to]
    st2.survivors[0].purged = st2.survivors[0].perks.slice(0, 2)
    st2.survivors[0].wounded = true
    const sac = st2.sacrifice
    expect(walkIn(st2, path, to).sacrifice).toBe(sac + 1)
  })

  it('a locker takes one off: back in the room, or to the box when the room has one', () => {
    const st = plague()
    const locker = placeProp(st, 'locker', 'shack')
    st.survivors[0].purged = [st.survivors[0].perks[1]]
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.step = { t: 'survivorInteract', s: 0, canInteract: true }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    const after = apply(st, { t: 'interact', i: { k: 'hide', prop: locker.id } })
    expect(after.survivors[0].purged).toEqual([])
    expect(after.purge).toEqual(['shack'])
    // two: they choose which perk to free
    st.survivors[0].purged = st.survivors[0].perks.slice(0, 2)
    const ask = apply(st, { t: 'interact', i: { k: 'hide', prop: locker.id } })
    expect(ask.step).toEqual({ t: 'purgeChoice', s: 0, mode: 'uncover' })
    const freed = apply(ask, { t: 'purgeChoice', perk: st.survivors[0].perks[1] })
    expect(freed.survivors[0].purged).toEqual([st.survivors[0].perks[0]])
  })

  it('Corrupt Intervention: the Entity on a generator nobody can interact with', () => {
    const st = plague('corrupt_intervention')
    const gen = placeProp(st, 'generator', 'shack')
    const used = apply({ ...st, step: { t: 'offer', perk: 'corrupt_intervention', owner: 'killer', w: { k: 'planningStart' }, done: [] }, queue: [{ k: 'plan' }] }, { t: 'perk', perk: 'corrupt_intervention', use: true, choice: { prop: gen.id } })
    expect(used.entity).toEqual({ prop: gen.id })
    expect(survivorInteractions({ ...used, step: { t: 'survivorInteract', s: 0, canInteract: true } }, 0)).not.toContainEqual({ k: 'repair', prop: gen.id })
    expect(killerInteractions({ ...used, step: { t: 'killerInteract', turn: 0, canInteract: true } })).not.toContainEqual({ k: 'damage', prop: gen.id })
  })

  it('Infectious Fright: after attacking a healthy survivor, one in a connected room moves', () => {
    const st = plague('infectious_fright')
    st.killer.room = 'shack'
    const { to } = next(st)
    st.survivors[2].room = to
    const offered = apply(st, { t: 'interact', i: { k: 'attack', target: 0 } })
    expect(offered.step).toMatchObject({ t: 'offer', perk: 'infectious_fright' })
    const c = perkChoices(offered, 'infectious_fright', 'killer', { k: 'afterAttack', target: 0 })[0]
    expect(c.target).toBe(2)
    let g = apply(offered, { t: 'perk', perk: 'infectious_fright', use: true, choice: c })
    while (g.step.t === 'revealProp') g = apply(g, legalActions(g)[0])
    expect(g.survivors[2].room).not.toBe(to)
  })

  it('Dark Devotion: at the start of cleanup, a survivor near him moves', () => {
    const st = plague('dark_devotion')
    st.killer.room = 'shack'
    const choices = perkChoices(st, 'dark_devotion', 'killer', { k: 'cleanupStart' })
    expect(new Set(choices.map((c) => c.target))).toEqual(new Set([0, 1, 2, 3]))
  })
})

describe('Kate Denson', () => {
  /** Kate as survivor 0 with only these perks; everyone in the shack. */
  function kate(...perks: PerkId[]) {
    let st = createGame({ board: 'macmillan', survivors: ['kate', 'meg', 'claudette', 'jake'].map((id) => ({ id, name: id })), killer: { id: 'trapper', name: 'trapper' }, players: 5, seed: 1 })
    while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
    only(st, ...perks)
    st.survivors.forEach((sv) => Object.assign(sv, { room: 'shack', status: 'board', wounded: false, planned: 'sneak', plannedRevealed: true, acted: true }))
    return st
  }
  const next = (st: GameState) => {
    const p = touchingPaths(st, 'shack')[0]
    return p.a === 'shack' ? p.b : p.a
  }
  function interacting(st: GameState) {
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.canInteract = true
    st.step = { t: 'survivorInteract', s: 0, canInteract: true }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
  }

  it('Windows of Opportunity: a chest in a connected room, in place of her interaction', () => {
    const st = kate('windows_of_opportunity')
    const chest = placeProp(st, 'chest', next(st))
    interacting(st)
    expect(perkButtons(st).find((b) => b.perk === 'windows_of_opportunity')!.choices).toContainEqual({ prop: chest.id })
    const g = apply(st, { t: 'perk', perk: 'windows_of_opportunity', use: true, choice: { prop: chest.id } })
    expect(g.props.find((p) => p.id === chest.id)!.removed).toBe(true)
    expect(g.survivors[0].room).toBe('shack')
    expect(g.survivors[0].bp).toBe(5)
  })

  it('Windows of Opportunity: a locker, and she moves into that room to hide in it', () => {
    const st = kate('windows_of_opportunity')
    const to = next(st)
    const locker = placeProp(st, 'locker', to)
    st.props.forEach((p) => p.room === to && (p.revealed = true))
    interacting(st)
    let g = apply(st, { t: 'perk', perk: 'windows_of_opportunity', use: true, choice: { prop: locker.id } })
    while (g.step.t === 'revealProp') g = apply(g, legalActions(g)[0])
    expect(g.survivors[0]).toMatchObject({ room: to, status: 'locker' })
    expect(g.props.find((p) => p.id === locker.id)!.occupant).toBe(0)
  })

  it('Boil Over: whoever is picked up in her room rolls 4 dice to struggle', () => {
    const st = kate('boil_over')
    killerInteracting(st)
    st.killer.room = 'shack'
    Object.assign(st.survivors[1], { wounded: true, woundedThisRound: false })
    let g = apply(st, { t: 'interact', i: { k: 'pickUp', target: 1 } })
    expect(g.step.t).toBe('carryDice')
    g = apply(g, { t: 'carryDice', n: 1 })
    expect(g.step).toMatchObject({ t: 'offer', perk: 'boil_over', w: { k: 'carryRoll', s: 1, n: 1 } })
    const used = apply(g, { t: 'perk', perk: 'boil_over', use: true, choice: {} })
    const roll = used.log.findLast((e) => e.dice)
    expect(roll?.dice).toHaveLength(4)
  })

  it('Dance With Me: begun in a locker, she moves again after her card move', () => {
    const st = kate('dance_with_me')
    const locker = placeProp(st, 'locker', 'shack')
    locker.occupant = 0
    st.survivors[0].status = 'locker'
    const m = (['sneak', 'sprint', 'crouch', 'vault'] as const).flatMap((card) => survivorMoves({ ...st, survivors: st.survivors.map((sv, i) => (i ? sv : { ...sv, status: 'board' })) }, 0, card).map((x) => ({ ...x, card })))[0]
    st.props.forEach((p) => (p.revealed = true))
    st.survivors[0].planned = m.card
    st.phase = 'survivors'
    st.step = { t: 'idle' }
    st.queue = [{ k: 'survivorTurn', s: 0 }]
    let g = apply({ ...st, step: { t: 'turnStart', s: 0 } }, { t: 'continue' })
    for (let n = 0; n < 6 && g.step.t !== 'survivorMove'; n++) g = apply(g, legalActions(g)[0])
    expect(g.lockerTurn).toBe(0)
    g = apply(g, { t: 'move', path: m.path.id })
    for (let n = 0; n < 4 && !(g.step.t === 'offer' && g.step.perk === 'dance_with_me'); n++) g = apply(g, legalActions(g)[0])
    expect(g.step).toMatchObject({ t: 'offer', perk: 'dance_with_me' })
    const c = perkChoices(g, 'dance_with_me', 0, (g.step as Extract<GameState['step'], { t: 'offer' }>).w)[0]
    expect(c.path).not.toBe(m.path.id)
  })
})

describe('The Clown', () => {
  /** The Clown with only these perks, about to interact; everyone else in the shack. */
  function clown(...perks: PerkId[]) {
    const st = game('clown')
    only(st, ...perks)
    killerInteracting(st)
    st.survivors.forEach((sv) => Object.assign(sv, { room: 'shack', status: 'board', wounded: false, planned: 'sneak', plannedRevealed: true, acted: true }))
    return st
  }
  /** A card move survivor 0 can make from the shack. */
  const walk = (st: GameState) => (['sneak', 'sprint', 'crouch', 'vault'] as const).flatMap((card) => survivorMoves(st, 0, card).map((x) => ({ ...x, card })))[0]
  function moving(st: GameState, card: 'sneak' | 'sprint' | 'crouch' | 'vault') {
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.canInteract = true
    st.step = { t: 'survivorMove', s: 0, card }
    st.queue = [{ k: 'survivorInteract', s: 0 }, { k: 'endSurvivorTurn', s: 0 }]
  }

  it('Afterpiece: a token into his room or a connected one, moved when it is out already', () => {
    const st = clown()
    st.killer.room = 'shack'
    const m = walk(st)
    let g = apply(st, { t: 'interact', i: { k: 'afterpiece', which: 'tonic', room: m.to } })
    expect(g.afterpiece).toEqual({ tonic: m.to })
    g = { ...g, killer: { ...g.killer, powerUsed: false } }
    killerInteracting(g)
    expect(killerInteractions(g)).not.toContainEqual({ k: 'afterpiece', which: 'tonic', room: m.to })
    g = apply(g, { t: 'interact', i: { k: 'afterpiece', which: 'tonic', room: 'shack' } })
    expect(g.afterpiece).toEqual({ tonic: 'shack' })
  })

  it('Afterpiece Tonic: survivors in its room set their card face up', () => {
    let st = game('clown')
    // Bamboozle's offer at the start of planning: passed
    while (st.step.t === 'offer') st = apply(st, { t: 'perk', perk: st.step.perk, use: false })
    st.afterpiece = { tonic: st.survivors[1].room }
    st = apply(st, { t: 'planSurvivors', cards: ['sneak', 'sprint', 'crouch', 'vault'] })
    const room = st.afterpiece!.tonic
    st.survivors.forEach((sv) => expect(sv.plannedRevealed).toBe(sv.room === room && sv.status === 'board'))
  })

  it('Afterpiece Antidote: walking in, a survivor may move on along any path', () => {
    const st = clown()
    st.killer.room = 'backlot'
    const m = walk(st)
    st.afterpiece = { antidote: m.to }
    st.props.forEach((p) => p.room === m.to && (p.revealed = true))
    moving(st, m.card)
    let g = apply(st, { t: 'move', path: m.path.id })
    for (let n = 0; n < 4 && g.step.t !== 'anyMove'; n++) g = apply(g, legalActions(g)[0])
    expect(g.step).toEqual({ t: 'anyMove', s: 0, why: 'antidote' })
    const stay = apply(g, { t: 'stop' })
    expect(stay.survivors[0].room).toBe(m.to)
  })

  it('Afterpiece Antidote: the killer walking in may move on too', () => {
    const st = clown()
    st.killer.room = 'shack'
    const p = touchingPaths(st, 'shack').find((x) => (x.a === 'shack' || x.kind !== 'vault') && !st.paths[x.id]?.wall)!
    const to = p.a === 'shack' ? p.b : p.a
    st.afterpiece = { antidote: to }
    st.props.forEach((x) => x.room === to && (x.revealed = true))
    st.killer.planned = [p.kind, 'wait']
    st.killer.revealedCount = 1
    st.step = { t: 'killerMove', turn: 0, card: p.kind }
    st.queue = [{ k: 'killerInteract', turn: 0 }, { k: 'endKillerTurn', turn: 0 }]
    let g = apply(st, { t: 'move', path: p.id })
    for (let n = 0; n < 4 && g.step.t !== 'killerAnyMove'; n++) g = apply(g, legalActions(g)[0])
    expect(g.step).toEqual({ t: 'killerAnyMove' })
  })

  it("a Firecracker stops the killer's Antidote move into its holder's room", () => {
    const st = clown()
    st.killer.room = 'shack'
    st.afterpiece = { antidote: 'shack' }
    const m = antidoteKillerMoves(st)[0]
    Object.assign(st.survivors[1], { room: m.to, item: 'firecracker' })
    st.step = { t: 'killerAnyMove' }
    const asked = apply(st, { t: 'move', path: m.path.id })
    expect(asked.step).toMatchObject({ t: 'reaction', item: 'firecracker', holders: [1], antidote: true })
    const stopped = apply(asked, { t: 'react', s: 1 })
    expect(stopped.killer.room).toBe('shack')
    expect(stopped.survivors[1].item).toBeNull()
    // nobody reacts: he goes on
    let on = apply(asked, { t: 'react', s: null })
    while (on.step.t === 'revealProp') on = apply(on, legalActions(on)[0])
    expect(on.killer.room).toBe(m.to)
  })

  it('Coulrophobia: a survivor moving into his room is stopped and cannot interact', () => {
    const st = clown('coulrophobia')
    const m = walk(st)
    st.killer.room = m.to
    moving(st, m.card)
    const offered = apply(st, { t: 'move', path: m.path.id })
    expect(offered.step).toMatchObject({ t: 'offer', perk: 'coulrophobia' })
    const g = apply(offered, { t: 'perk', perk: 'coulrophobia', use: true, choice: {} })
    expect(g.survivors[0].room).toBe('shack')
    expect(g.step).toMatchObject({ t: 'survivorInteract', s: 0, canInteract: false })
    // passing: the move goes on
    let pass = apply(offered, { t: 'perk', perk: 'coulrophobia', use: false })
    while (pass.step.t === 'revealProp') pass = apply(pass, legalActions(pass)[0])
    expect(pass.survivors[0].room).toBe(m.to)
  })

  it('Bamboozle: the Entity on a path is a wall to the survivors, open to him', () => {
    const st = clown('bamboozle')
    const m = walk(st)
    const used = apply({ ...st, step: { t: 'offer', perk: 'bamboozle', owner: 'killer', w: { k: 'planningStart' }, done: [] }, queue: [{ k: 'plan' }] }, { t: 'perk', perk: 'bamboozle', use: true, choice: { path: m.path.id } })
    expect(survivorMoves(used, 0, m.card).map((x) => x.path.id)).not.toContain(m.path.id)
    expect(anyMoves(used, 0).map((x) => x.path.id)).not.toContain(m.path.id)
  })

  it('Pop Goes the Weasel: after an attack, a crow, chest or empty locker next door is removed', () => {
    const st = clown('pop_goes_the_weasel')
    st.killer.room = 'shack'
    const next = walk(st).to
    const chest = placeProp(st, 'chest', next)
    const offered = apply(st, { t: 'interact', i: { k: 'attack', target: 0 } })
    expect(offered.step).toMatchObject({ t: 'offer', perk: 'pop_goes_the_weasel' })
    const g = apply(offered, { t: 'perk', perk: 'pop_goes_the_weasel', use: true, choice: { prop: chest.id } })
    expect(g.props.find((p) => p.id === chest.id)!.removed).toBe(true)
  })
})

describe("a Firecracker stops any move of the killer into its holder's room", () => {
  it("The Hillbilly's chainsaw: stopped before it runs, the card kept, his interaction lost", () => {
    const st = game('hillbilly')
    only(st)
    st.killer.room = 'scrapyard'
    st.killer.hand = ['sprint', 'crouch', 'wait']
    st.survivors.forEach((sv) => (sv.room = 'backlot'))
    Object.assign(st.survivors[2], { room: 'shack', item: 'firecracker' })
    killerInteracting(st)
    const asked = apply(st, { t: 'interact', i: { k: 'chainsaw', card: 'sprint', path: 'p16' } })
    expect(asked.step).toMatchObject({ t: 'reaction', item: 'firecracker', holders: [2] })
    const stopped = apply(asked, { t: 'react', s: 2 })
    expect(stopped.killer.room).toBe('scrapyard')
    expect(stopped.survivors[2].wounded).toBe(false)
    let on = apply(asked, { t: 'react', s: null })
    while (on.step.t === 'revealProp') on = apply(on, legalActions(on)[0])
    expect(on.killer.room).toBe('shack')
  })

  it('Diversion: the killer sent along a path is kept out by a Firecracker there', () => {
    let st = createGame({ board: 'macmillan', survivors: ['adam', 'meg', 'claudette', 'jake'].map((id) => ({ id, name: id })), killer: { id: 'trapper', name: 'trapper' }, players: 5, seed: 1 })
    while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
    only(st, 'diversion')
    const room = st.killer.room
    st.survivors.forEach((sv) => Object.assign(sv, { room: 'shack', status: 'board', planned: 'sneak', plannedRevealed: true }))
    st.survivors[0].room = room
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.canInteract = true
    st.step = { t: 'survivorInteract', s: 0, canInteract: true }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    const i = survivorInteractions(st, 0).find((x) => x.k === 'diversion') as { k: 'diversion'; path: string }
    const p = touchingPaths(st, room).find((x) => x.id === i.path)!
    const to = p.a === room ? p.b : p.a
    Object.assign(st.survivors[1], { room: to, item: 'firecracker' })
    const asked = apply(st, { t: 'interact', i })
    expect(asked.step).toMatchObject({ t: 'reaction', holders: [1] })
    expect(apply(asked, { t: 'react', s: 1 }).killer.room).toBe(room)
    let on = apply(asked, { t: 'react', s: null })
    while (on.step.t === 'revealProp') on = apply(on, legalActions(on)[0])
    expect(on.killer.room).toBe(to)
  })

  it('Starstruck: stopped on the way, and nobody is picked up', () => {
    const st = game('trickster')
    only(st, 'starstruck')
    killerInteracting(st)
    st.survivors.forEach((sv) => Object.assign(sv, { room: 'shack', status: 'board', wounded: false, planned: 'sneak', plannedRevealed: true }))
    st.killer.room = 'shack'
    st.survivors[0].wounded = true
    const p = touchingPaths(st, 'shack')[0]
    const to = p.a === 'shack' ? p.b : p.a
    Object.assign(st.survivors[2], { room: to, item: 'firecracker' })
    st.props.forEach((x) => x.room === to && (x.revealed = true))
    const offered = apply(st, { t: 'interact', i: { k: 'pickUp', target: 0 } })
    const w = (offered.step as Extract<GameState['step'], { t: 'offer' }>).w
    const c = perkChoices(offered, 'starstruck', 'killer', w).find((x) => x.target === 2 && x.path === p.id)!
    const asked = apply(offered, { t: 'perk', perk: 'starstruck', use: true, choice: c })
    expect(asked.step).toMatchObject({ t: 'reaction', holders: [2] })
    const stopped = apply(asked, { t: 'react', s: 2 })
    expect(stopped.killer.room).toBe('shack')
    expect(stopped.survivors.some((sv) => sv.status === 'carried')).toBe(false)
  })
})

describe('David King', () => {
  /** David as survivor 0 with only these perks; everyone in the shack, the killer about to interact there. */
  function david(...perks: PerkId[]) {
    let st = createGame({ board: 'macmillan', survivors: ['david', 'meg', 'claudette', 'jake'].map((id) => ({ id, name: id })), killer: { id: 'trapper', name: 'trapper' }, players: 5, seed: 1 })
    while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
    only(st, ...perks)
    killerInteracting(st)
    st.killer.room = 'shack'
    st.survivors.forEach((sv) => Object.assign(sv, { room: 'shack', status: 'board', wounded: false, planned: 'sneak', plannedRevealed: true }))
    return st
  }

  it('No Mither: a success keeps the survivor attacked healthy, and the killer gains 1 ▲', () => {
    const base = david('no_mither')
    const offered = apply(base, { t: 'interact', i: { k: 'attack', target: 1 } })
    expect(offered.step).toMatchObject({ t: 'offer', perk: 'no_mither' })
    const used = (rng: number) => apply({ ...structuredClone(offered), rng }, { t: 'perk', perk: 'no_mither', use: true, choice: {} })
    const kept = findOutcome(used, (g) => g.log.some((e) => e.text.includes('(No Mither)')))
    expect(kept.survivors[1].wounded).toBe(false)
    const hit = findOutcome(used, (g) => g.survivors[1].wounded)
    expect(hit.log.some((e) => e.text.includes('(No Mither)'))).toBe(false)
  })

  it('Dead Hard: a success takes the survivor off his shoulder, and they must move', () => {
    const base = david('dead_hard')
    const hook = placeProp(base, 'hook', 'shack')
    Object.assign(base.survivors[1], { status: 'carried', wounded: true })
    base.step = { t: 'carryDice', s: 1 }
    const offered = apply(base, { t: 'hang' })
    expect(offered.step).toMatchObject({ t: 'offer', perk: 'dead_hard', w: { k: 'preHang', s: 1 } })
    const used = (rng: number) => apply({ ...structuredClone(offered), rng }, { t: 'perk', perk: 'dead_hard', use: true, choice: {} })
    const away = findOutcome(used, (g) => g.step.t === 'anyMove')
    expect(away.step).toEqual({ t: 'anyMove', s: 1, why: 'deadHard' })
    expect(away.survivors[1].status).toBe('board')
    expect(legalActions(away)).not.toContainEqual({ t: 'stop' })
    const hung = findOutcome(used, (g) => g.survivors[1].status === 'hooked')
    expect(hung.props.find((p) => p.id === hook.id)!.occupant).toBe(1)
  })

  it("We're Gonna Live Forever: the killer can't leave David's room, but still interacts there", () => {
    const st = david('wgl_forever')
    const p = touchingPaths(st, 'shack').find((x) => x.a === 'shack' || x.kind !== 'vault')!
    st.killer.planned = [p.kind, 'wait']
    st.step = { t: 'killerMove', turn: 0, card: p.kind }
    st.queue = [{ k: 'killerInteract', turn: 0 }, { k: 'endKillerTurn', turn: 0 }]
    const offered = apply(st, { t: 'move', path: p.id })
    expect(offered.step).toMatchObject({ t: 'offer', perk: 'wgl_forever' })
    const kept = apply(offered, { t: 'perk', perk: 'wgl_forever', use: true, choice: {} })
    expect(kept.killer.room).toBe('shack')
    expect(kept.step).toMatchObject({ t: 'killerInteract', canInteract: true })
  })

  it("We're Gonna Live Forever: carrying out of David's room, the step is lost", () => {
    const st = david('wgl_forever')
    Object.assign(st.survivors[1], { status: 'carried', wounded: true })
    st.step = { t: 'carryMove', s: 1, steps: 3 }
    const m = legalActions(st).find((a) => a.t === 'move') as { t: 'move'; path: string }
    const offered = apply(st, m)
    expect(offered.step).toMatchObject({ t: 'offer', perk: 'wgl_forever' })
    const kept = apply(offered, { t: 'perk', perk: 'wgl_forever', use: true, choice: {} })
    expect(kept.killer.room).toBe('shack')
    expect(kept.step).toMatchObject({ t: 'carryMove', s: 1, steps: 2 })
    // not used: he carries on
    let on = apply(offered, { t: 'perk', perk: 'wgl_forever', use: false })
    while (on.step.t === 'revealProp') on = apply(on, legalActions(on)[0])
    expect(on.killer.room).not.toBe('shack')
  })

  it("We're Gonna Live Forever: a power that moves him (the Wailing Bell) is kept from it, and he may still interact", () => {
    let st = createGame({ board: 'macmillan', survivors: ['david', 'meg', 'claudette', 'jake'].map((id) => ({ id, name: id })), killer: { id: 'wraith', name: 'wraith' }, players: 5, seed: 1 })
    while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
    only(st, 'wgl_forever')
    killerInteracting(st)
    st.killer.room = 'shack'
    st.survivors.forEach((sv) => Object.assign(sv, { room: 'shack', status: 'board', wounded: false, planned: 'sneak', plannedRevealed: true }))
    const bell = killerInteractions(st).find((i) => i.k === 'bell')!
    const offered = apply(st, { t: 'interact', i: bell })
    expect(offered.step).toMatchObject({ t: 'offer', perk: 'wgl_forever' })
    const kept = apply(offered, { t: 'perk', perk: 'wgl_forever', use: true, choice: {} })
    expect(kept.killer.room).toBe('shack')
    expect(kept.killer.powerUsed).toBe(false)
    expect(kept.step).toMatchObject({ t: 'killerInteract', canInteract: true })
  })
})

describe('Jeff Johansen', () => {
  /** Jeff as survivor 0 with only these perks; everyone in the shack, on Jeff's turn. */
  function jeff(...perks: PerkId[]) {
    let st = createGame({ board: 'macmillan', survivors: ['jeff', 'meg', 'claudette', 'jake'].map((id) => ({ id, name: id })), killer: { id: 'trapper', name: 'trapper' }, players: 5, seed: 1 })
    while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
    only(st, ...perks)
    st.survivors.forEach((sv) => Object.assign(sv, { room: 'shack', status: 'board', wounded: false, planned: 'sneak', plannedRevealed: true, acted: true }))
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.canInteract = true
    st.step = { t: 'survivorInteract', s: 0, canInteract: true }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    return st
  }

  it('Breakdown: after a rescue, a success takes a sacrifice progress from the killer', () => {
    const base = jeff('breakdown')
    const hook = placeProp(base, 'hook', 'shack')
    Object.assign(base.survivors[1], { status: 'hooked' })
    hook.occupant = 1
    base.sacrifice = 3
    let g = apply(base, { t: 'interact', i: { k: 'sabotage', prop: hook.id } })
    for (let n = 0; n < 6 && !(g.step.t === 'offer' && g.step.perk === 'breakdown'); n++) g = apply(g, legalActions(g).find((a) => a.t === 'stop') ?? legalActions(g)[0])
    expect(g.step).toMatchObject({ t: 'offer', perk: 'breakdown' })
    const used = (rng: number) => apply({ ...structuredClone(g), rng }, { t: 'perk', perk: 'breakdown', use: true, choice: {} })
    expect(findOutcome(used, (x) => x.sacrifice === 2).sacrifice).toBe(2)
    expect(findOutcome(used, (x) => x.sacrifice === 3).sacrifice).toBe(3)
  })

  it('Breakdown: not with no sacrifice progress to take, nor on an empty hook', () => {
    const st = jeff('breakdown')
    st.sacrifice = 0
    expect(perkChoices(st, 'breakdown', 0, { k: 'afterSabotage', s: 0, rescued: 1 })).toEqual([])
    st.sacrifice = 2
    expect(perkChoices(st, 'breakdown', 0, { k: 'afterSabotage', s: 0 })).toEqual([])
    expect(perkChoices(st, 'breakdown', 0, { k: 'afterSabotage', s: 2, rescued: 0 })).toEqual([{}])
  })

  it('Aftercare: someone healthy again, the Entity goes onto an empty hook anywhere', () => {
    const st = jeff('aftercare')
    const hook = placeProp(st, 'hook', 'backlot')
    st.survivors[1].wounded = true
    const healed = findOutcome(
      (rng) => apply({ ...structuredClone(st), rng }, { t: 'interact', i: { k: 'heal', target: 1 } }),
      (x) => x.step.t === 'offer' && x.step.perk === 'aftercare',
    )
    expect(perkChoices(healed, 'aftercare', 0, { k: 'healed', s: 1 })).toContainEqual({ prop: hook.id })
    const used = apply(healed, { t: 'perk', perk: 'aftercare', use: true, choice: { prop: hook.id } })
    expect(used.entity).toEqual({ prop: hook.id })
  })

  it("Distortion: after his card move into the killer's room, he moves on along another path", () => {
    const st = jeff('distortion')
    const m = (['sneak', 'sprint', 'crouch', 'vault'] as const).flatMap((card) => survivorMoves(st, 0, card).map((x) => ({ ...x, card })))[0]
    st.killer.room = m.to
    st.props.forEach((p) => p.room === m.to && (p.revealed = true))
    st.step = { t: 'survivorMove', s: 0, card: m.card }
    st.queue = [{ k: 'survivorInteract', s: 0 }, { k: 'endSurvivorTurn', s: 0 }]
    let g = apply(st, { t: 'move', path: m.path.id })
    for (let n = 0; n < 4 && !(g.step.t === 'offer' && g.step.perk === 'distortion'); n++) g = apply(g, legalActions(g)[0])
    expect(g.step).toMatchObject({ t: 'offer', perk: 'distortion' })
    const c = perkChoices(g, 'distortion', 0, (g.step as Extract<GameState['step'], { t: 'offer' }>).w)[0]
    expect(c.path).not.toBe(m.path.id)
    let on = apply(g, { t: 'perk', perk: 'distortion', use: true, choice: c })
    while (on.step.t === 'revealProp') on = apply(on, legalActions(on)[0])
    expect(on.survivors[0].room).not.toBe(m.to)
  })

  it('Distortion: a move without a card counts too (the rescue move into his room)', () => {
    const st = jeff('distortion')
    const m = anyMoves(st, 0)[0]
    st.killer.room = m.to
    st.props.forEach((p) => p.room === m.to && (p.revealed = true))
    st.step = { t: 'anyMove', s: 0 }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    let g = apply(st, { t: 'move', path: m.path.id })
    for (let n = 0; n < 4 && !(g.step.t === 'offer' && g.step.perk === 'distortion'); n++) g = apply(g, legalActions(g)[0])
    expect(g.step).toMatchObject({ t: 'offer', perk: 'distortion', w: { k: 'entered', s: 0, path: m.path.id } })
  })
})

describe('The Knight', () => {
  /** The Knight with only these perks, about to interact in the shack; everyone there too. */
  function knight(...perks: PerkId[]) {
    const st = game('knight')
    only(st, ...perks)
    killerInteracting(st)
    st.killer.room = 'shack'
    st.survivors.forEach((sv) => Object.assign(sv, { room: 'shack', status: 'board', wounded: false, planned: 'sneak', plannedRevealed: true, acted: true }))
    return st
  }
  const walk = (st: GameState) => (['sneak', 'sprint', 'crouch', 'vault'] as const).flatMap((card) => survivorMoves(st, 0, card).map((x) => ({ ...x, card })))[0]

  it('Guard: into his room or a connected one, moved when it is out already', () => {
    const st = knight()
    const to = walk(st).to
    const g = apply(st, { t: 'interact', i: { k: 'guard', guard: 'assassin', room: to } })
    expect(g.guards).toEqual({ assassin: to })
    expect(g.killer.powerUsed).toBe(true)
  })

  it('Assassin: walking into its room, a danger die; a failure wounds', () => {
    const base = knight()
    const m = walk(base)
    base.guards = { assassin: m.to }
    base.props.forEach((p) => p.room === m.to && (p.revealed = true))
    base.phase = 'survivors'
    base.activeSurvivor = 0
    base.step = { t: 'survivorMove', s: 0, card: m.card }
    base.queue = [{ k: 'survivorInteract', s: 0 }, { k: 'endSurvivorTurn', s: 0 }]
    const walked = (rng: number) => {
      let g = apply({ ...structuredClone(base), rng }, { t: 'move', path: m.path.id })
      for (let n = 0; n < 4 && g.step.t !== 'survivorInteract'; n++) g = apply(g, legalActions(g).find((a) => a.t === 'acceptRoll') ?? legalActions(g)[0])
      return g
    }
    const hit = findOutcome(walked, (g) => g.survivors[0].wounded)
    expect(hit.log.some((e) => e.dice && e.ev?.k === 'roll' && e.ev.ctx === 'assassin')).toBe(true)
    expect(findOutcome(walked, (g) => !g.survivors[0].wounded).survivors[0].room).toBe(m.to)
  })

  it('Jailer: a skill check in its room is a danger die; a failure wounds and the Jailer leaves play', () => {
    const base = knight()
    base.guards = { jailer: 'shack' }
    const gen = placeProp(base, 'generator', 'shack')
    base.phase = 'survivors'
    base.activeSurvivor = 0
    base.step = { t: 'survivorInteract', s: 0, canInteract: true }
    base.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    const rolled = (rng: number) => apply({ ...structuredClone(base), rng }, { t: 'interact', i: { k: 'repair', prop: gen.id } })
    const fail = findOutcome(rolled, (g) => g.survivors[0].wounded)
    expect(fail.log.findLast((e) => e.dice)!.dice![0].kind).toBe('danger')
    expect(fail.guards?.jailer).toBeUndefined()
    expect(fail.jailerGone).toBe(true)
    const ok = findOutcome(rolled, (g) => !g.survivors[0].wounded && g.log.some((e) => e.dice))
    expect(ok.guards?.jailer).toBe('shack')
  })

  it('Jailer: not on someone searched in a locker (off the board)', () => {
    const st = knight()
    st.guards = { jailer: 'shack' }
    const locker = placeProp(st, 'locker', 'shack')
    locker.occupant = 1
    st.survivors[1].status = 'locker'
    const g = apply(st, { t: 'interact', i: { k: 'search', prop: locker.id } })
    expect(g.log.findLast((e) => e.dice)!.dice![0].kind).toBe('skill')
    expect(g.guards?.jailer).toBe('shack')
  })

  it('Carnifex: at the start of cleanup it removes a survival / altruism prop in its room, then moves on', () => {
    const st = knight()
    st.guards = { carnifex: 'shack' }
    const chest = placeProp(st, 'chest', 'shack')
    const crow = placeProp(st, 'crow', 'shack')
    st.phase = 'killer'
    st.step = { t: 'idle' }
    st.queue = [{ k: 'carnifex' }, { k: 'cleanup' }]
    let g = apply({ ...st, step: { t: 'turnStart', s: 0 } }, { t: 'continue' })
    expect(g.step).toEqual({ t: 'carnifexProp' })
    g = apply(g, { t: 'guardProp', prop: chest.id })
    expect(g.props.find((p) => p.id === chest.id)!.removed).toBe(true)
    expect(g.props.find((p) => p.id === crow.id)!.removed).toBe(false)
    expect(g.step).toEqual({ t: 'carnifexMove' })
    const room = (legalActions(g)[0] as { room: string }).room
    g = apply(g, { t: 'guardRoom', room })
    expect(g.guards?.carnifex).toBe(room)
  })

  it('Face the Darkness: a Guard at the start of his turn', () => {
    const st = knight('face_the_darkness')
    expect(perkChoices(st, 'face_the_darkness', 'killer', { k: 'killerTurnBegin', turn: 0 })).toContainEqual({ guard: 'jailer', room: 'shack' })
    const g = apply({ ...st, step: { t: 'offer', perk: 'face_the_darkness', owner: 'killer', w: { k: 'killerTurnBegin', turn: 0 }, done: [] } }, { t: 'perk', perk: 'face_the_darkness', use: true, choice: { guard: 'jailer', room: 'shack' } })
    expect(g.guards?.jailer).toBe('shack')
  })

  it('Nowhere to Hide: the survivor in the locker rolls the danger die', () => {
    const st = knight('nowhere_to_hide')
    const locker = placeProp(st, 'locker', 'shack')
    locker.occupant = 1
    st.survivors[1].status = 'locker'
    const offered = apply(st, { t: 'interact', i: { k: 'search', prop: locker.id } })
    expect(offered.step).toMatchObject({ t: 'offer', perk: 'nowhere_to_hide' })
    const g = apply(offered, { t: 'perk', perk: 'nowhere_to_hide', use: true, choice: {} })
    expect(g.log.findLast((e) => e.dice)!.dice![0].kind).toBe('danger')
  })

  it('Hubris: a survivor walking into his room pays 1 ▲, or cannot interact', () => {
    const st = knight('hubris')
    const m = walk(st)
    st.killer.room = m.to
    st.props.forEach((p) => p.room === m.to && (p.revealed = true))
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.step = { t: 'survivorMove', s: 0, card: m.card }
    st.queue = [{ k: 'survivorInteract', s: 0 }, { k: 'endSurvivorTurn', s: 0 }]
    const go = (bp: number) => {
      let g = apply({ ...structuredClone(st), survivors: st.survivors.map((sv, i) => (i ? sv : { ...sv, bp })) }, { t: 'move', path: m.path.id })
      for (let n = 0; n < 4 && !(g.step.t === 'offer' && g.step.perk === 'hubris'); n++) g = apply(g, legalActions(g)[0])
      expect(g.step).toMatchObject({ t: 'offer', perk: 'hubris' })
      return apply(g, { t: 'perk', perk: 'hubris', use: true, choice: {} })
    }
    expect(go(2).survivors[0].bp).toBe(1)
    expect(go(0).step).toMatchObject({ t: 'survivorInteract', canInteract: false })
  })
})

describe('perk cards that are on no board (the edit-perks mode)', () => {
  /** Deal a card-only perk to a survivor or to the killer, as the edit-perks mode will. */
  function deal(st: GameState, who: number | 'killer', perk: PerkId) {
    only(st)
    if (who === 'killer') st.killer.perks = [perk]
    else st.survivors[who].perks = [perk]
  }

  it('Hope: a bloodpoint every time a generator is finished', () => {
    const st = game()
    deal(st, 1, 'hope')
    const gen = placeProp(st, 'generator', st.survivors[0].room)
    gen.progress = 2
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.step = { t: 'survivorInteract', s: 0, canInteract: true }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    st.survivors[1].bp = 3
    const done = findOutcome(
      (rng) => {
        let after = apply({ ...structuredClone(st), rng }, { t: 'interact', i: { k: 'repair', prop: gen.id } })
        while (after.step.t === 'roll') after = apply(after, { t: 'acceptRoll' })
        return after
      },
      (s) => s.props.find((p) => p.id === gen.id)!.done,
    )
    expect(done.survivors[1].bp).toBe(4)
    expect(done.perksUsed).toContain('1:hope')
  })

  it('Kindred: a sabotage pays the rescuer and the rescued', () => {
    let st = game()
    deal(st, 0, 'kindred')
    const hook = placeProp(st, 'hook', st.survivors[0].room)
    hook.occupant = 2
    Object.assign(st.survivors[2], { status: 'hooked', room: st.survivors[0].room })
    st.survivors[0].bp = 2
    st.survivors[2].bp = 2
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.step = { t: 'survivorInteract', s: 0, canInteract: true }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    st = apply(st, { t: 'interact', i: { k: 'sabotage', prop: hook.id } })
    // +1 for the rescue itself, then +1 each from Kindred
    expect(st.survivors[0].bp).toBe(4)
    expect(st.survivors[2].bp).toBe(3)
    expect(st.perksUsed).toContain('0:kindred')
  })

  it('Small Game: cleansing a Hex Totem takes 2 BP off the killer', () => {
    const st = game()
    deal(st, 0, 'small_game')
    const totem = placeProp(st, 'totem', st.survivors[0].room)
    st.killer.bp = 5
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.step = { t: 'survivorInteract', s: 0, canInteract: true }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    const cleansed = findOutcome(
      (rng) => {
        let after = apply({ ...structuredClone(st), rng }, { t: 'interact', i: { k: 'cleanse', prop: totem.id } })
        while (after.step.t === 'roll') after = apply(after, { t: 'acceptRoll' })
        return after
      },
      (s) => s.step.t === 'offer' && s.step.perk === 'small_game',
    )
    const after = apply(cleansed, { t: 'perk', perk: 'small_game', use: true, choice: {} })
    expect(after.killer.bp).toBe(3)
  })

  it('Monstrous Shrine: 2 BP for a hook with nobody else in the room', () => {
    const st = game()
    deal(st, 'killer', 'monstrous_shrine')
    placeProp(st, 'hook', st.killer.room)
    st.survivors.forEach((sv) => Object.assign(sv, { room: 'backlot', status: 'board' }))
    Object.assign(st.survivors[0], { room: st.killer.room, status: 'carried', wounded: true })
    st.killer.bp = 4
    st.phase = 'killer'
    st.step = { t: 'carryMove', s: 0, steps: 1 }
    st.queue = [{ k: 'endKillerTurn', turn: 0 }]
    const after = apply(st, { t: 'hang' })
    expect(after.survivors[0].status).toBe('hooked')
    expect(after.killer.bp).toBe(6)
    expect(after.perksUsed).toContain('k:monstrous_shrine')
  })

  it('Spies from the Shadows: a revealed crow pays the killer', () => {
    const st = game()
    deal(st, 'killer', 'spies_from_the_shadows')
    const crow = placeProp(st, 'crow', st.survivors[0].room)
    crow.revealed = false
    st.killer.bp = 4
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.step = { t: 'revealProp', who: 0, room: st.survivors[0].room }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    const after = apply(st, { t: 'reveal', prop: crow.id })
    expect(after.killer.bp).toBe(5)
    expect(after.perksUsed).toContain('k:spies_from_the_shadows')
  })

  it('Sloppy Butcher and This Is Not Happening turn a heal into the danger die', () => {
    for (const [perk, who] of [['sloppy_butcher', 'killer'], ['this_is_not_happening', 0]] as const) {
      const st = game()
      deal(st, who, perk)
      Object.assign(st.survivors[1], { room: st.survivors[0].room, wounded: true })
      st.killer.room = st.survivors[0].room
      st.phase = 'survivors'
      st.activeSurvivor = 0
      st.step = { t: 'survivorInteract', s: 0, canInteract: true }
      st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
      const asked = apply(st, { t: 'interact', i: { k: 'heal', target: 1 } })
      expect(asked.step, perk).toMatchObject({ t: 'offer', perk })
      const rolled = apply(asked, { t: 'perk', perk, use: true, choice: {} })
      // the roll may settle on its own, so read the die out of the log
      expect(rolled.log.findLast((e) => e.ev?.k === 'roll')!.dice![0].kind, perk).toBe('danger')
    }
  })

  it('Resilience: a bonus turn at cleanup for being wounded this round', () => {
    const st = game()
    deal(st, 0, 'resilience')
    st.survivors[0].woundedThisRound = true
    st.survivors[0].bp = 6
    st.phase = 'survivors'
    st.queue = [{ k: 'trigger', w: { k: 'cleanupStart' }, done: [] }]
    st.step = { t: 'idle' }
    expect(perkChoices(st, 'resilience', 0, { k: 'cleanupStart' }).length).toBeGreaterThan(0)
    // nothing to offer when the round left them unhurt
    expect(perkChoices({ ...st, survivors: st.survivors.map((sv, i) => (i ? sv : { ...sv, woundedThisRound: false })) }, 'resilience', 0, { k: 'cleanupStart' })).toEqual([])
    st.step = { t: 'offer', perk: 'resilience', owner: 0, w: { k: 'cleanupStart' } }
    const hand = st.survivors[0].hand
    const card = st.survivorHands[hand][0]
    const after = apply(st, { t: 'perk', perk: 'resilience', use: true, choice: { card } })
    expect(after.survivors[0].bp).toBe(4)
    expect(after.survivorHands[hand].length).toBe(st.survivorHands[hand].length - 1)
  })

  it('We will Make It: the survivor you healed takes the bonus turn', () => {
    const st = game()
    deal(st, 0, 'well_make_it')
    Object.assign(st.survivors[1], { room: st.survivors[0].room, wounded: true })
    st.survivors[0].bp = 6
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.step = { t: 'survivorInteract', s: 0, canInteract: true }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    const healed = findOutcome(
      (rng) => {
        let after = apply({ ...structuredClone(st), rng }, { t: 'interact', i: { k: 'heal', target: 1 } })
        while (after.step.t === 'roll') after = apply(after, { t: 'acceptRoll' })
        return after
      },
      (s) => s.step.t === 'offer' && s.step.perk === 'well_make_it',
    )
    expect(healed.survivors[1].wounded).toBe(false)
    const card = healed.survivorHands[healed.survivors[1].hand][0]
    const after = apply(healed, { t: 'perk', perk: 'well_make_it', use: true, choice: { card } })
    expect(after.activeSurvivor).toBe(1)
    expect(after.survivors[0].bp).toBe(4)
  })

  it('Renewal: a bonus turn at the end of a turn after healing or being healed', () => {
    const st = game()
    deal(st, 0, 'renewal')
    st.survivors[0].bp = 6
    st.healedWith = [0, 1]
    expect(perkChoices(st, 'renewal', 0, { k: 'turnEnd', s: 0 }).length).toBeGreaterThan(0)
    // nobody healed this round: nothing to offer
    expect(perkChoices({ ...st, healedWith: [] }, 'renewal', 0, { k: 'turnEnd', s: 0 })).toEqual([])
  })

  it('No One Escapes Death: a killer bonus turn once the gates are powered', () => {
    const st = game()
    deal(st, 'killer', 'no_one_escapes_death')
    st.props
      .filter((p) => p.kind === 'generator')
      .slice(0, 4)
      .forEach((p) => Object.assign(p, { done: true, progress: 3 }))
    st.killer.planned = ['sneak', 'sprint']
    st.killer.hand = ['crouch', 'vault', 'wait']
    const offered = perkChoices(st, 'no_one_escapes_death', 'killer', { k: 'killerTurnEnd', turn: 1 })
    expect(offered.map((c) => c.card)).toEqual(['crouch', 'vault', 'wait'])
    // without the gates powered it offers nothing
    const dark = { ...st, props: st.props.map((p) => (p.kind === 'generator' ? { ...p, done: false, progress: 0 } : p)) }
    expect(perkChoices(dark, 'no_one_escapes_death', 'killer', { k: 'killerTurnEnd', turn: 1 })).toEqual([])
  })
})

describe('perk cards laid over a printed perk (the edit-perks mode)', () => {
  /** A card over one of the survivor's printed perks, as the edit-perks mode lays it. */
  function lay(st: GameState, s: number, card: PerkId, over: PerkId) {
    only(st)
    const sv = st.survivors[s]
    sv.perks = [card]
    sv.covered = { [card]: over }
  }

  it('Inner Healing: healthy at the start of the turn, and the perk under it is free', () => {
    const st = game()
    lay(st, 0, 'inner_healing', 'self_care')
    Object.assign(st.survivors[0], { wounded: true, bp: 6 })
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.step = { t: 'turnStart', s: 0 }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    expect(perkButtons(st).map((b) => b.perk)).toContain('inner_healing')
    const after = apply(st, { t: 'perk', perk: 'inner_healing', use: true, choice: {} })
    expect(after.survivors[0].wounded).toBe(false)
    expect(after.survivors[0].bp).toBe(4)
    // the card is out of the game and Self-Care, which it covered, can be used now
    expect(after.survivors[0].perks).toEqual(['self_care'])
    expect(after.survivors[0].covered).toEqual({})
    expect(perkReady(after, 0, 'inner_healing')).toBe(false)
    // the turn goes on: the start-of-turn step comes back only while a button is left
    expect(perkButtons(after).length).toBe(0)
  })

  it('Inner Healing: nothing to heal, nothing offered', () => {
    const st = game()
    lay(st, 0, 'inner_healing', 'self_care')
    st.survivors[0].wounded = false
    expect(perkChoices(st, 'inner_healing', 0, { k: 'turnStart', s: 0 })).toEqual([])
    st.survivors[0].wounded = true
    expect(perkChoices(st, 'inner_healing', 0, { k: 'turnStart', s: 0 })).toEqual([{}])
    // three Knives: no heal of any kind
    st.survivors[0].knives = 3
    expect(perkChoices(st, 'inner_healing', 0, { k: 'turnStart', s: 0 })).toEqual([])
  })

  it('Situational Awareness: a bonus turn at the end of the turn, then the card goes', () => {
    const st = game()
    lay(st, 0, 'situational_awareness', 'adrenaline')
    st.survivors[0].bp = 6
    st.phase = 'survivors'
    st.activeSurvivor = 0
    const hand = st.survivors[0].hand
    const card = st.survivorHands[hand].find((c) => c !== 'wait')!
    expect(perkChoices(st, 'situational_awareness', 0, { k: 'turnEnd', s: 0 }).map((c) => c.card)).toContain(card)
    st.step = { t: 'offer', perk: 'situational_awareness', owner: 0, w: { k: 'turnEnd', s: 0 } }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    const after = apply(st, { t: 'perk', perk: 'situational_awareness', use: true, choice: { card } })
    expect(after.survivors[0].bp).toBe(5)
    expect(after.survivorHands[hand].length).toBe(st.survivorHands[hand].length - 1)
    expect(after.survivors[0].perks).toEqual(['adrenaline'])
  })

  it('Kinship: another survivor takes the bonus turn at the end of this turn', () => {
    const st = game()
    lay(st, 0, 'kinship', 'prove_thyself')
    st.survivors[0].bp = 6
    Object.assign(st.survivors[1], { room: st.survivors[0].room, status: 'board' })
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.canInteract = true
    st.step = { t: 'survivorInteract', s: 0, canInteract: true }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    const button = perkButtons(st).find((b) => b.perk === 'kinship')!
    expect(button.choices.map((c) => c.target)).toContain(1)
    expect(button.choices.map((c) => c.target)).not.toContain(0)
    const after = apply(st, { t: 'perk', perk: 'kinship', use: true, choice: { target: 1 } })
    // the interaction is spent on the perk; the friend's bonus turn comes before the turn ends
    expect(after.step).toEqual({ t: 'bonusOffer', s: 1 })
    expect(after.survivors[0].bp).toBe(5)
    expect(after.survivors[0].perks).toEqual(['prove_thyself'])
    // declining it hands the turn back, and this turn ends after it
    const back = apply(after, { t: 'declineBonus' })
    expect(back.phase).toBe('killer')
  })

  it('Kinship: nobody in reach with a card in hand', () => {
    const st = game()
    lay(st, 0, 'kinship', 'prove_thyself')
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.canInteract = true
    st.survivors.forEach((sv, i) => i && Object.assign(sv, { status: 'hooked' }))
    expect(perkChoices(st, 'kinship', 0, { k: 'interact', s: 0 })).toEqual([])
  })

  it('Guardian: the killer may only interact with that survivor this turn', () => {
    const st = game()
    lay(st, 0, 'guardian', 'empathy')
    st.survivors[0].bp = 6
    st.killer.room = st.survivors[0].room
    placeProp(st, 'generator', st.killer.room)
    st.survivors.forEach((sv, i) => i && Object.assign(sv, { room: st.killer.room, status: 'board' }))
    st.phase = 'killer'
    st.canInteract = true
    st.step = { t: 'offer', perk: 'guardian', owner: 0, w: { k: 'killerEntered', room: st.killer.room } }
    st.queue = [{ k: 'killerInteract', turn: 0 }, { k: 'endKillerTurn', turn: 0 }]
    const after = apply(st, { t: 'perk', perk: 'guardian', use: true, choice: {} })
    expect(after.guardian).toBe(0)
    expect(after.survivors[0].perks).toEqual(['empathy'])
    expect(after.step).toMatchObject({ t: 'killerInteract', canInteract: true })
    // only he is on the killer's list: no generator, no other survivor, no power
    expect(killerInteractions(after)).toEqual([{ k: 'attack', target: 0 }])
    expect(legalActions(after).filter((a) => a.t === 'interact')).toEqual([{ t: 'interact', i: { k: 'attack', target: 0 } }])
    // and it is over when the turn is
    const ended = apply(after, { t: 'endTurn' })
    expect(ended.guardian).toBeFalsy()
  })

  it('Guardian: wounded this round, the killer is left with nothing to do', () => {
    const st = game()
    lay(st, 0, 'guardian', 'empathy')
    Object.assign(st.survivors[0], { wounded: true, woundedThisRound: true, bp: 6 })
    st.killer.room = st.survivors[0].room
    st.phase = 'killer'
    st.canInteract = true
    st.step = { t: 'offer', perk: 'guardian', owner: 0, w: { k: 'killerEntered', room: st.killer.room } }
    st.queue = [{ k: 'killerInteract', turn: 0 }, { k: 'endKillerTurn', turn: 0 }]
    const after = apply(st, { t: 'perk', perk: 'guardian', use: true, choice: {} })
    expect(killerInteractions(after)).toEqual([])
    expect(legalActions(after)).toEqual([{ t: 'endTurn' }])
  })

  it('Guardian: not while he carries someone, and not twice in a turn', () => {
    const st = game()
    lay(st, 0, 'guardian', 'empathy')
    st.killer.room = st.survivors[0].room
    st.phase = 'killer'
    st.canInteract = true
    const w = { k: 'killerEntered', room: st.killer.room } as const
    expect(perkChoices(st, 'guardian', 0, w)).toEqual([{}])
    expect(perkChoices(st, 'guardian', 0, { ...w, carrying: true })).toEqual([])
    expect(perkChoices({ ...st, canInteract: false }, 'guardian', 0, w)).toEqual([])
    expect(perkChoices({ ...st, guardian: 1 }, 'guardian', 0, w)).toEqual([])
  })

  it('a card over nothing just goes when it is used', () => {
    const st = game()
    only(st)
    Object.assign(st.survivors[0], { perks: ['inner_healing'], wounded: true, bp: 6 })
    st.phase = 'survivors'
    st.activeSurvivor = 0
    st.step = { t: 'turnStart', s: 0 }
    st.queue = [{ k: 'endSurvivorTurn', s: 0 }]
    const after = apply(st, { t: 'perk', perk: 'inner_healing', use: true, choice: {} })
    expect(after.survivors[0].perks).toEqual([])
    expect(after.survivors[0].wounded).toBe(false)
  })
})

describe('perk cards: the rest of the deck (the edit-perks mode)', () => {
  /** Deal a card-only perk to a survivor or to the killer. */
  function deal(st: GameState, who: number | 'killer', perk: PerkId) {
    only(st)
    if (who === 'killer') st.killer.perks = [perk]
    else st.survivors[who].perks = [perk]
  }

  /** The killer in the room next door, about to walk in on survivor 0. */
  function walkIn(st: GameState) {
    st.phase = 'killer'
    st.canInteract = true
    st.killer.room = st.survivors[0].room
    st.step = { t: 'killerInteract', turn: 0, canInteract: true }
    st.queue = [{ k: 'endKillerTurn', turn: 0 }]
  }

  it('Dark Sense: a room with nothing left in it sends them on along another path', () => {
    const st = game()
    deal(st, 0, 'dark_sense')
    st.phase = 'survivors'
    st.activeSurvivor = 0
    const room = st.survivors[0].room
    const w = { k: 'entered', s: 0, path: anyMoves(st, 0)[0].path.id } as const
    // props still standing there: nothing to offer
    expect(perkChoices(st, 'dark_sense', 0, w)).toEqual([])
    st.props.forEach((p) => p.room === room && (p.removed = true))
    const choices = perkChoices(st, 'dark_sense', 0, w)
    expect(choices.length).toBeGreaterThan(0)
    expect(choices.map((c) => c.path)).not.toContain(w.path)
    st.step = { t: 'offer', perk: 'dark_sense', owner: 0, w }
    st.queue = [{ k: 'survivorInteract', s: 0 }, { k: 'endSurvivorTurn', s: 0 }]
    const after = apply(st, { t: 'perk', perk: 'dark_sense', use: true, choice: choices[0] })
    expect(after.survivors[0].room).not.toBe(room)
  })

  it('Déjà Vu: a generator damaged elsewhere lets her repair one in her room', () => {
    const st = game()
    deal(st, 0, 'deja_vu')
    st.survivors[0].bp = 6
    // two different generators: one where she is, one in another room
    const [here, there] = st.props.filter((p) => p.kind === 'generator' && !p.done)
    const far = boards.macmillan.rooms.find((r) => r.id !== st.survivors[0].room)!.id
    Object.assign(here, { room: st.survivors[0].room, path: null, revealed: true })
    Object.assign(there, { room: far, path: null, revealed: true })
    st.phase = 'killer'
    const w = { k: 'killerBreak', what: 'damage', prop: there.id } as const
    expect(perkChoices(st, 'deja_vu', 0, w)).toEqual([{ prop: here.id }])
    // his damage in her own room is not "another space"
    expect(perkChoices(st, 'deja_vu', 0, { k: 'killerBreak', what: 'damage', prop: here.id })).toEqual([])
    st.step = { t: 'offer', perk: 'deja_vu', owner: 0, w }
    st.queue = [{ k: 'resume', step: { t: 'turnStart', s: 0 } }]
    const after = apply(st, { t: 'perk', perk: 'deja_vu', use: true, choice: { prop: here.id } })
    expect(after.survivors[0].bp).toBe(4)
    // the skill check happened (it settles on its own when nothing can change it)
    expect(after.log.findLast((e) => e.ev?.k === 'roll')!.ev).toMatchObject({ k: 'roll', s: 0, ctx: 'repair' })
  })

  it('Premonition: a crow is chased before he interacts', () => {
    const st = game()
    deal(st, 0, 'premonition')
    st.survivors[0].bp = 6
    const crow = placeProp(st, 'crow', st.survivors[0].room)
    walkIn(st)
    const w = { k: 'killerEntered', room: st.killer.room } as const
    expect(perkChoices(st, 'premonition', 0, w)).toEqual([{ prop: crow.id }])
    st.step = { t: 'offer', perk: 'premonition', owner: 0, w }
    const after = apply(st, { t: 'perk', perk: 'premonition', use: true, choice: { prop: crow.id } })
    // chasing a crow pays the killer and gives the survivor a bonus turn
    expect(after.killer.bp).toBe(st.killer.bp + 1)
    expect(after.step).toMatchObject({ t: 'bonusOffer', s: 0 })
  })

  it('Spine Chill: the danger die, and a success is a move they must make', () => {
    const st = game()
    deal(st, 0, 'spine_chill')
    st.survivors[0].bp = 6
    walkIn(st)
    const w = { k: 'killerEntered', room: st.killer.room } as const
    expect(perkChoices(st, 'spine_chill', 0, w)).toEqual([{}])
    st.step = { t: 'offer', perk: 'spine_chill', owner: 0, w }
    const rolled = findOutcome(
      (rng) => {
        let after = apply({ ...structuredClone(st), rng }, { t: 'perk', perk: 'spine_chill', use: true, choice: {} })
        while (after.step.t === 'roll') after = apply(after, { t: 'acceptRoll' })
        return after
      },
      (s) => s.step.t === 'anyMove',
    )
    expect(rolled.step).toMatchObject({ t: 'anyMove', s: 0, why: 'spineChill' })
    // no staying put
    expect(legalActions(rolled).some((a) => a.t === 'stop')).toBe(false)
    expect(tryApply(rolled, { t: 'stop' })).toBeNull()
  })

  it('Lightweight: a card is discarded for a move when planning ends', () => {
    const st = game()
    deal(st, 0, 'lightweight')
    st.survivors[0].bp = 6
    const hand = st.survivors[0].hand
    const card = st.survivorHands[hand].find((c) => c !== 'wait')!
    expect(perkChoices(st, 'lightweight', 0, { k: 'planningEnd' }).map((c) => c.card)).not.toContain('wait')
    st.step = { t: 'offer', perk: 'lightweight', owner: 0, w: { k: 'planningEnd' } }
    st.queue = [{ k: 'survivorTurn', s: 0 }]
    const after = apply(st, { t: 'perk', perk: 'lightweight', use: true, choice: { card } })
    expect(after.survivorHands[hand].length).toBe(st.survivorHands[hand].length - 1)
    expect(after.survivors[0].bp).toBe(5)
    expect(after.step.t).toBe('survivorMove')
  })

  it('Bitter Murmur: a vault path or a broken wall sends him on', () => {
    const st = game()
    deal(st, 'killer', 'bitter_murmur')
    const vault = boards.macmillan.paths.find((p) => p.kind === 'vault')!
    st.killer.room = vault.b
    const w = { k: 'killerEntered', room: vault.b, from: vault.a, path: vault.id } as const
    st.phase = 'killer'
    st.canInteract = true
    expect(perkChoices(st, 'bitter_murmur', 'killer', w).length).toBeGreaterThan(0)
    // an ordinary path: only when the wall on it broke
    const plain = boards.macmillan.paths.find((p) => p.kind !== 'vault' && (p.a === vault.b || p.b === vault.b))!
    const plainW = { k: 'killerEntered', room: vault.b, from: plain.a === vault.b ? plain.b : plain.a, path: plain.id } as const
    expect(perkChoices(st, 'bitter_murmur', 'killer', plainW)).toEqual([])
    expect(perkChoices(st, 'bitter_murmur', 'killer', { ...plainW, broke: true }).length).toBeGreaterThan(0)
    st.step = { t: 'offer', perk: 'bitter_murmur', owner: 'killer', w }
    st.queue = [{ k: 'killerInteract', turn: 0 }, { k: 'endKillerTurn', turn: 0 }]
    const c = perkChoices(st, 'bitter_murmur', 'killer', w)[0]
    const after = apply(st, { t: 'perk', perk: 'bitter_murmur', use: true, choice: c })
    expect(after.killer.room).not.toBe(vault.b)
  })

  it('Claustrophobia: the Entity on a path after a repair, and survivors cannot pass', () => {
    const st = game()
    deal(st, 'killer', 'claustrophobia')
    const gen = placeProp(st, 'generator', st.survivors[0].room)
    const w = { k: 'repaired', s: 0, prop: gen.id } as const
    const choices = perkChoices(st, 'claustrophobia', 'killer', w)
    expect(choices.length).toBeGreaterThan(0)
    const path = anyMoves(st, 0)[0].path.id
    expect(choices.map((c) => c.path)).toContain(path)
    st.step = { t: 'offer', perk: 'claustrophobia', owner: 'killer', w }
    st.queue = [{ k: 'resume', step: { t: 'turnStart', s: 0 } }]
    const after = apply(st, { t: 'perk', perk: 'claustrophobia', use: true, choice: { path } })
    expect(after.entity).toMatchObject({ path })
    expect(anyMoves(after, 0).map((m) => m.path.id)).not.toContain(path)
  })

  it('Distressing: a survivor who walks into a room with a locker hides in it', () => {
    const st = game()
    deal(st, 'killer', 'distressing')
    const locker = placeProp(st, 'locker', st.survivors[0].room)
    const w = { k: 'entered', s: 0 } as const
    expect(perkChoices(st, 'distressing', 'killer', w)).toEqual([{ target: 0, prop: locker.id }])
    st.step = { t: 'offer', perk: 'distressing', owner: 'killer', w }
    st.queue = [{ k: 'resume', step: { t: 'turnStart', s: 0 } }]
    const after = apply(st, { t: 'perk', perk: 'distressing', use: true, choice: { target: 0, prop: locker.id } })
    expect(after.survivors[0].status).toBe('locker')
    expect(after.props.find((p) => p.id === locker.id)!.occupant).toBe(0)
  })

  it('Unrelenting: a second survivor in his room takes the same again', () => {
    const st = game()
    deal(st, 'killer', 'unrelenting')
    st.killer.room = st.survivors[0].room
    Object.assign(st.survivors[1], { room: st.killer.room, status: 'board', wounded: false })
    st.survivors.slice(2).forEach((sv) => Object.assign(sv, { room: 'backlot' }))
    st.phase = 'killer'
    const w = { k: 'afterKillerInteract', turn: 0, target: 0 } as const
    expect(perkChoices(st, 'unrelenting', 'killer', w)).toEqual([{ target: 1 }])
    // with nobody else there it has nothing to offer
    expect(perkChoices(st, 'unrelenting', 'killer', { k: 'afterKillerInteract', turn: 0 })).toEqual([])
    st.step = { t: 'offer', perk: 'unrelenting', owner: 'killer', w }
    st.queue = [{ k: 'endKillerTurn', turn: 0 }]
    const after = apply(st, { t: 'perk', perk: 'unrelenting', use: true, choice: { target: 1 } })
    expect(after.survivors[1].wounded).toBe(true)
  })

  it('Iron Grasp: the struggle dice are all rolled again', () => {
    const st = game()
    deal(st, 'killer', 'iron_grasp')
    Object.assign(st.survivors[0], { status: 'carried', wounded: true, room: st.killer.room })
    st.phase = 'killer'
    st.step = { t: 'roll', ctx: { k: 'carry', s: 0 }, dice: [{ kind: 'skill', face: 1, rerolled: false }, { kind: 'skill', face: 2, rerolled: false }] }
    st.queue = [{ k: 'endKillerTurn', turn: 0 }]
    expect(perkButtons(st).map((b) => b.perk)).toContain('iron_grasp')
    const after = apply(st, { t: 'perk', perk: 'iron_grasp', use: true, choice: {} })
    // the roll settles on its own once nothing else can change it, so read the dice from the log
    expect(after.log.findLast((e) => e.dice)!.dice!.every((d) => d.rerolled)).toBe(true)
  })

  it('Insidious: standing still, he picks up a healthy survivor instead of attacking', () => {
    const st = game()
    deal(st, 'killer', 'insidious')
    st.killer.room = st.survivors[0].room
    st.phase = 'killer'
    st.killerMoved = false
    const w = { k: 'preKillerInteract', target: 0 } as const
    st.queue = [{ k: 'killerDo', i: { k: 'attack', target: 0 }, turn: 0 }, { k: 'endKillerTurn', turn: 0 }]
    expect(perkChoices(st, 'insidious', 'killer', w)).toEqual([{}])
    // once he has moved this turn, nothing
    expect(perkChoices({ ...st, killerMoved: true }, 'insidious', 'killer', w)).toEqual([])
    st.step = { t: 'offer', perk: 'insidious', owner: 'killer', w }
    const after = apply(st, { t: 'perk', perk: 'insidious', use: true, choice: {} })
    expect(after.survivors[0].status).toBe('carried')
    expect(after.survivors[0].wounded).toBe(false)
  })

  it('Whispers: the chosen survivor pays 1 ▲ or sets their card face up', () => {
    const st = game()
    deal(st, 'killer', 'whispers')
    st.phase = 'planning'
    st.survivors.forEach((sv) => Object.assign(sv, { planned: null, bp: 2 }))
    const w = { k: 'planningStart' } as const
    expect(perkChoices(st, 'whispers', 'killer', w).map((c) => c.target)).toContain(0)
    st.step = { t: 'offer', perk: 'whispers', owner: 'killer', w }
    st.queue = [{ k: 'plan' }]
    const asked = apply(st, { t: 'perk', perk: 'whispers', use: true, choice: { target: 0 } })
    expect(asked.step).toMatchObject({ t: 'sparkChoice', s: 0, whispers: true })
    const paid = apply(asked, { t: 'spark', pay: true })
    expect(paid.survivors[0].bp).toBe(1)
    expect(paid.stridor).toBe(null)
    const refused = apply(asked, { t: 'spark', pay: false })
    expect(refused.stridor).toBe(0)
    expect(refused.step).toMatchObject({ t: 'planStridor', s: 0 })
    // with no ▲ there is nothing to decide
    const broke = { ...st, survivors: st.survivors.map((sv, i) => (i ? sv : { ...sv, bp: 0 })) }
    expect(apply(broke, { t: 'perk', perk: 'whispers', use: true, choice: { target: 0 } }).stridor).toBe(0)
  })
})
