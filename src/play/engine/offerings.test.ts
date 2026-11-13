import { describe, expect, it } from 'vitest'
import { apply, createGame, cutCoinTargets, hasOffering, turnOrder, type GameConfig } from './engine'
import { botMove } from './bot'
import { legalActions } from './legal'
import { offeringProblem, offeringSlots, offeringsOf, READY_OFFERINGS, type OfferingId } from './offerings'
import type { GameState, Prop, PropKind } from './types'

const config = (offerings: OfferingId[] = [], seed = 1): GameConfig => ({
  board: 'macmillan',
  survivors: ['dwight', 'meg', 'claudette', 'jake'].map((id) => ({ id, name: id })),
  killer: { id: 'trapper', name: 'trapper' },
  players: 5,
  seed,
  offerings,
})

/** A game past the setup reveals, without perks (core rules). */
function planned(offerings: OfferingId[] = [], seed = 1): GameState {
  let st = createGame(config(offerings, seed))
  st.survivors.forEach((sv) => (sv.perks = []))
  st.killer.perks = []
  while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
  return st
}

function placeProp(st: GameState, kind: PropKind, room: string): Prop {
  const p = st.props.find((x) => x.kind === kind && !x.removed && !x.done && x.occupant === null && x.room !== room)!
  Object.assign(p, { room, path: null, revealed: true })
  return p
}

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

describe('offerings: choosing (p.19)', () => {
  it('one side burns 1–2, both sides one each', () => {
    expect(offeringSlots('none', 2)).toEqual({ survivor: 0, killer: 0 })
    expect(offeringSlots('killer', 2)).toEqual({ survivor: 0, killer: 2 })
    expect(offeringSlots('survivors', 5)).toEqual({ survivor: 2, killer: 0 })
    expect(offeringSlots('both', 2)).toEqual({ survivor: 1, killer: 1 })
  })

  it('a pick needs the full count, of its own side, no card twice', () => {
    expect(offeringProblem('killer', ['murky-reagent'], 1)).toBe('')
    expect(offeringProblem('killer', [], 1)).not.toBe('')
    expect(offeringProblem('killer', ['chalk-pouch'], 1)).not.toBe('')
    expect(offeringProblem('killer', ['murky-reagent', 'murky-reagent'], 2)).not.toBe('')
  })

  it('drawn offerings come from that side, the same for the same seed', () => {
    const a = createGame({ ...config([], 7), drawOfferings: { killer: 2, survivor: 1 } })
    const b = createGame({ ...config([], 7), drawOfferings: { killer: 2, survivor: 1 } })
    expect(a.offerings).toEqual(b.offerings)
    expect(a.offerings).toHaveLength(3)
    expect(a.offerings!.filter((o) => offeringsOf('killer').includes(o))).toHaveLength(2)
    expect(a.offerings!.every((o) => READY_OFFERINGS.includes(o))).toBe(true)
  })

  it('a game without offerings has none', () => {
    const st = createGame(config())
    expect(st.offerings).toBeUndefined()
    expect(hasOffering(st, 'murky-reagent')).toBe(false)
  })
})

describe('offerings: effects', () => {
  it('Murky Reagent: no props are revealed in setup; the minis roll their rooms and planning starts', () => {
    const st = createGame(config(['murky-reagent']))
    expect(st.phase).toBe('planning')
    expect(st.startPending).toBeUndefined()
    expect(st.props.some((p) => p.revealed && p.room)).toBe(false)
    expect(st.log.some((e) => /เริ่มที่/.test(e.text))).toBe(true)
  })

  it('Torn Blueprint: the first generator revealed is removed, the next one stays', () => {
    let st = createGame(config(['torn-blueprint']))
    st.survivors.forEach((sv) => (sv.perks = []))
    st.killer.perks = []
    const gens = st.props.filter((p) => p.kind === 'generator' && p.room)
    st = apply(st, { t: 'setupReveal', prop: gens[0].id })
    expect(st.props.find((p) => p.id === gens[0].id)!.removed).toBe(true)
    st = apply(st, { t: 'setupReveal', prop: gens[1].id })
    const second = st.props.find((p) => p.id === gens[1].id)!
    expect(second.revealed && !second.removed).toBe(true)
  })

  it('Ebony Memento Mori: a paid bonus turn gives the killer a ▲ back', () => {
    for (const offerings of [[], ['ebony-memento-mori']] as OfferingId[][]) {
      const st = planned(offerings)
      st.phase = 'killer'
      st.killer.bp = 6
      st.step = { t: 'killerBonusOffer' }
      st.queue = []
      const card = st.killer.hand.find((c) => c !== 'wait')!
      const after = apply(st, { t: 'bonus', card })
      expect(after.killer.bp).toBe(offerings.length ? 3 : 2)
      // the screen shows the offering's card from this event
      expect(after.log.some((e) => e.ev?.k === 'offering' && e.ev.id === 'ebony-memento-mori')).toBe(offerings.length > 0)
    }
  })

  it('Chalk Pouch: a "4" on the carry roll gets the survivor free', () => {
    let tried = 0
    for (let rng = 1; rng < 400 && tried < 3; rng++) {
      const make = (offerings: OfferingId[]) => {
        const st = planned(offerings)
        st.killer.room = 'mine-depths'
        st.survivors.forEach((sv) => Object.assign(sv, { item: null, room: 'backlot' }))
        Object.assign(st.survivors[2], { room: 'mine-depths', wounded: true })
        for (const p of st.props) if (p.kind === 'hook') Object.assign(p, { room: 'mine-entrance', revealed: true })
        killerInteracting(st)
        const up = apply(st, { t: 'interact', i: { k: 'pickUp', target: 2 } })
        return apply({ ...up, rng }, { t: 'carryDice', n: 1 })
      }
      const plain = make([])
      const roll = [...plain.log].reverse().find((e) => e.dice?.length)
      if (plain.step.t !== 'carryMove' || roll?.dice?.[0].face !== 4) continue
      tried++
      const chalk = make(['chalk-pouch'])
      expect(chalk.step.t).not.toBe('carryMove')
      expect(chalk.survivors[2].status).toBe('board')
    }
    expect(tried).toBeGreaterThan(0)
  })

  it('Sweet William Sachet: the first survivor at a boldness prop each round gains a ▲', () => {
    let st = planned(['sweet-william-sachet'])
    st.survivors.forEach((sv) => Object.assign(sv, { item: null, room: 'backlot', bp: 2 }))
    const hook = placeProp(st, 'hook', 'shack')
    st.survivors[0].room = 'shack'
    survivorInteracting(st, 0)
    st = apply(st, { t: 'interact', i: { k: 'sabotage', prop: hook.id } })
    expect(st.survivors[0].bp).toBe(3)
    expect(st.offeringsUsed).toContain('sweet-william-sachet')
    // a second one this round gains nothing
    const hook2 = placeProp(st, 'hook', 'scrapyard')
    st.entity = null
    st.survivors[1].room = 'scrapyard'
    survivorInteracting(st, 1)
    st = apply(st, { t: 'interact', i: { k: 'sabotage', prop: hook2.id } })
    expect(st.survivors[1].bp).toBe(2)
  })

  it('a whole game plays with every offering', () => {
    let st = createGame({ ...config(READY_OFFERINGS, 3) })
    for (let n = 0; n < 4000 && st.phase !== 'over'; n++) {
      const acts = legalActions(st)
      st = apply(st, acts[(n * 7919) % acts.length])
    }
    expect(st.offerings).toEqual(READY_OFFERINGS)
    // a whole random game: longer than the 5 s a test is given by default, on a busy machine
  }, 60_000)
})

/** Through the setup reveals, perks off. */
function revealed(offerings: OfferingId[], seed = 1): GameState {
  let st = createGame(config(offerings, seed))
  st.survivors.forEach((sv) => (sv.perks = []))
  st.killer.perks = []
  while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
  return st
}

describe('offerings: the ones asked at setup', () => {
  it('Shroud of Union: the first player picks one room for every survivor; the killer still rolls', () => {
    let st = revealed(['shroud-of-union'])
    expect(st.step).toEqual({ t: 'shroudRoom', s: turnOrder(st)[0] })
    expect(st.startPending).toBe(true)
    st = apply(st, { t: 'shroudRoom', room: 'shack' })
    expect(st.survivors.every((sv) => sv.room === 'shack')).toBe(true)
    expect(st.startPending).toBeUndefined()
    expect(st.phase).toBe('planning')
    expect(() => apply({ ...st, step: { t: 'shroudRoom', s: 0 } }, { t: 'shroudRoom', room: 'nowhere' })).toThrow()
  })

  it('Shroud of Union with Murky Reagent: asked straight away, no reveals', () => {
    const st = createGame(config(['murky-reagent', 'shroud-of-union']))
    expect(st.step.t).toBe('shroudRoom')
  })

  it('Cut Coin: the killer takes 2 face-down survival props out, then planning', () => {
    let st = revealed(['cut-coin'])
    expect(st.step).toEqual({ t: 'cutCoin', left: 2 })
    const before = cutCoinTargets(st).length
    const [a, b] = cutCoinTargets(st)
    expect(() => apply(st, { t: 'cutCoin', prop: st.props.find((p) => p.category !== 'survival')!.id })).toThrow()
    st = apply(st, { t: 'cutCoin', prop: a.id })
    expect(st.step).toEqual({ t: 'cutCoin', left: 1 })
    st = apply(st, { t: 'cutCoin', prop: b.id })
    expect(cutCoinTargets(st)).toHaveLength(before - 2)
    expect(st.props.find((p) => p.id === a.id)!.removed).toBe(true)
    expect(st.phase).toBe('planning')
  })

  it('Shrike Wreath: two different survivors, whose extra progress goes to the track at their first hanging', () => {
    let st = revealed(['shrike-wreath'])
    expect(st.step).toEqual({ t: 'shrikeWreath', chosen: [] })
    st = apply(st, { t: 'shrike', s: 1 })
    expect(() => apply(st, { t: 'shrike', s: 1 })).toThrow()
    st = apply(st, { t: 'shrike', s: 2 })
    expect(st.survivors.map((sv) => sv.extraSacrifice ?? 0)).toEqual([0, 1, 1, 0])
    expect(st.phase).toBe('planning')
    // hang survivor 1: their own token and the wreath's
    st.killer.room = 'shack'
    st.survivors.forEach((sv) => Object.assign(sv, { item: null, room: 'backlot' }))
    Object.assign(st.survivors[1], { room: 'shack', wounded: true })
    placeProp(st, 'hook', 'shack')
    killerInteracting(st)
    const hung = apply(st, { t: 'interact', i: { k: 'pickUp', target: 1 } })
    expect(hung.survivors[1].status).toBe('hooked')
    expect(hung.sacrifice).toBe(st.sacrifice + 2)
    expect(hung.survivors[1].extraSacrifice).toBe(0)
  })

  it('Cut Coin before Shrike Wreath, each once', () => {
    let st = revealed(['cut-coin', 'shrike-wreath'])
    for (const a of cutCoinTargets(st).slice(0, 2)) st = apply(st, { t: 'cutCoin', prop: a.id })
    expect(st.step.t).toBe('shrikeWreath')
  })

  it('bots answer every setup offering', () => {
    let st = createGame({ ...config(['murky-reagent', 'shroud-of-union', 'cut-coin', 'shrike-wreath']), bots: [1, 2, 3, 4, 5] })
    for (let n = 0; n < 8 && st.phase === 'setup'; n++) {
      const player = [1, 2, 3, 4, 5].find((p) => botMove(st, p))!
      st = apply(st, botMove(st, player)!)
    }
    expect(st.phase).toBe('planning')
    expect(st.survivors.filter((sv) => sv.extraSacrifice).length).toBe(2)
  })
})

describe('offerings: the ones asked in the game', () => {
  it("Vigo's Blueprint: a survivor's exit gate may swap with a face-up generator without progress", () => {
    let st = createGame(config(['vigos-blueprint']))
    st.survivors.forEach((sv) => (sv.perks = []))
    st.killer.perks = []
    const first = st.step.t === 'setupReveal' ? st.step.s : -1
    const gate = st.props.find((p) => p.kind === 'exitGate' && p.room)!
    const gen = st.props.find((p) => p.kind === 'generator' && p.room && p.room !== gate.room)!
    gen.revealed = true
    const [gateRoom, genRoom] = [gate.room, gen.room]
    const asked = apply(st, { t: 'setupReveal', prop: gate.id })
    expect(asked.step).toMatchObject({ t: 'vigo', s: first, gate: gate.id, resume: { t: 'setupReveal' } })
    // swap: the two tiles change rooms, and setup goes on where it was
    st = apply(asked, { t: 'vigo', gen: gen.id })
    expect(st.props.find((p) => p.id === gate.id)!.room).toBe(genRoom)
    expect(st.props.find((p) => p.id === gen.id)!.room).toBe(gateRoom)
    expect(st.step.t).toBe('setupReveal')
    expect(st.log.some((e) => e.ev?.k === 'offering' && e.ev.id === 'vigos-blueprint')).toBe(true)
    // or no swap
    const kept = apply(asked, { t: 'vigo', gen: null })
    expect(kept.props.find((p) => p.id === gate.id)!.room).toBe(gateRoom)
    expect(kept.step.t).toBe('setupReveal')
    // a generator with progress can't be swapped
    gen.progress = 1
    expect(() => apply({ ...asked, props: asked.props.map((p) => (p.id === gen.id ? { ...p, progress: 1 } : p)) }, { t: 'vigo', gen: gen.id })).toThrow()
  })

  it("Vigo's Blueprint: no face-up generator without progress, no question", () => {
    const st = createGame(config(['vigos-blueprint']))
    const gate = st.props.find((p) => p.kind === 'exitGate' && p.room)!
    expect(apply(st, { t: 'setupReveal', prop: gate.id }).step.t).toBe('setupReveal')
  })

  /** Survivor 0 uses a key for its ▲ (the item discarded), survivors 1–3 with `bp` ▲. */
  function keyUsed(offerings: OfferingId[], bp: number[]): GameState {
    const st = planned(offerings)
    st.survivors.forEach((sv, i) => Object.assign(sv, { bp: bp[i], item: null }))
    st.survivors[0].item = 'broken_key'
    survivorInteracting(st, 0)
    return apply(st, { t: 'useItem', s: 0, use: { k: 'bp' } })
  }

  it('White Ward: a survivor may pay 2 ▲ to put the discarded item on top of the item deck', () => {
    let st = keyUsed(['white-ward'], [2, 0, 3, 3])
    // asked in turn order, those with 2 ▲ (survivor 0 has 2 + the key's)
    const order = turnOrder(st).filter((i) => st.survivors[i].bp >= 2)
    expect(st.step).toMatchObject({ t: 'whiteWard', s: order[0], item: 'broken_key' })
    st = apply(st, { t: 'ward', pay: false })
    expect(st.step).toMatchObject({ t: 'whiteWard', s: order[1] })
    const bp = st.survivors[order[1]].bp
    st = apply(st, { t: 'ward', pay: true })
    expect(st.survivors[order[1]].bp).toBe(bp - 2)
    expect(st.itemDeck[0]).toBe('broken_key')
    expect(st.step.t).toBe('survivorInteract')
  })

  it("White Ward: nobody with 2 ▲, nothing asked; muting holds", () => {
    expect(keyUsed(['white-ward'], [0, 1, 1, 1]).step.t).toBe('survivorInteract')
    let st = keyUsed(['white-ward'], [0, 1, 3, 1])
    expect(st.step).toMatchObject({ t: 'whiteWard', s: 2 })
    st = apply(st, { t: 'ward', pay: false, mute: true })
    expect(st.wardMuted).toEqual([2])
    expect(st.step.t).toBe('survivorInteract')
  })

  it('every offering is played', () => {
    expect(READY_OFFERINGS).toHaveLength(10)
  })
})
