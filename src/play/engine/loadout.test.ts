import { describe, expect, it } from 'vitest'
import { createGame } from './engine'
import { BLOODWEB_DRAW, bloodwebHands, devoutPool, layLoadout, loadoutProblem, ownPerk, packLoadout, printedOf, takenBy, unpackLoadout, type LoadoutCharacter } from './loadout'
import { PERKS, type PerkId } from './perks'

const chars: LoadoutCharacter[] = [
  { key: '0', side: 'survivor', id: 'dwight' },
  { key: '1', side: 'survivor', id: 'meg' },
  { key: '2', side: 'survivor', id: 'claudette' },
  { key: '3', side: 'survivor', id: 'jake' },
  { key: 'killer', side: 'killer', id: 'trapper' },
]

describe('perk loadouts (p.19)', () => {
  it("Devout's pool: the side's perk cards — green perks and cards on no board, never a purple one, nor the character's own", () => {
    const pool = devoutPool('survivor', 'dwight')
    expect(new Set(pool).size).toBe(pool.length)
    for (const p of pool) {
      expect(PERKS[p].side).toBe('survivor')
      expect(ownPerk(p)).toBe(false)
      expect(printedOf('dwight')).not.toContain(p)
    }
    // a card on no board, Meg's green perk: yes; Meg's purple one (no card): no
    expect(pool).toContain('hope')
    expect(pool).toContain(printedOf('meg')[1])
    expect(pool).not.toContain(printedOf('meg')[0])
    expect(devoutPool('killer', 'trapper').every((p) => PERKS[p].side === 'killer')).toBe(true)
  })

  it("Bloodweb: 5 cards each, the same on every device, none of the drawer's own, no card twice", () => {
    const a = bloodwebHands(42, chars)
    expect(bloodwebHands(42, chars)).toEqual(a)
    expect(bloodwebHands(43, chars)).not.toEqual(a)
    const all = Object.values(a).flat()
    expect(new Set(all).size).toBe(all.length)
    for (const c of chars) {
      expect(a[c.key]).toHaveLength(BLOODWEB_DRAW)
      for (const p of a[c.key]) {
        expect(PERKS[p].side).toBe(c.side)
        expect(printedOf(c.id)).not.toContain(p)
        expect(ownPerk(p)).toBe(false)
      }
    }
  })

  it('one card of each: a card someone holds is taken, a perk printed on a board takes nothing', () => {
    // Zarina keeps Off the Record on her board; Meg may still take its card
    const crew: LoadoutCharacter[] = [{ key: '0', side: 'survivor', id: 'zarina' }, { key: '1', side: 'survivor', id: 'meg' }]
    expect(printedOf('zarina')).toContain('off_the_record')
    expect(takenBy(crew, {}, '1').has('off_the_record')).toBe(false)
    const meg: PerkId[] = [...printedOf('meg').slice(0, 2), 'off_the_record']
    expect(loadoutProblem('devout', crew[1], meg, undefined, takenBy(crew, {}, '1'))).toBe('')
    // once Meg holds that card, nobody else can take it
    const dwight: LoadoutCharacter = { key: '2', side: 'survivor', id: 'dwight' }
    const all = [...crew, dwight]
    expect(takenBy(all, { 1: meg }, '2').has('off_the_record')).toBe(true)
    expect(loadoutProblem('devout', dwight, [...printedOf('dwight').slice(0, 2), 'off_the_record'], undefined, takenBy(all, { 1: meg }, '2'))).toMatch(/มีคนใช้แล้ว/)
    // Zarina's own Off the Record stays hers either way
    expect(loadoutProblem('devout', crew[0], printedOf('zarina'), undefined, takenBy(all, { 1: meg }, '0'))).toBe('')
  })

  it('a loadout needs 3 different perks from what the mode allows', () => {
    const c = chars[0]
    const printed = printedOf('dwight')
    expect(loadoutProblem('devout', c, printed, undefined, new Set())).toBe('')
    expect(loadoutProblem('devout', c, printed.slice(0, 2), undefined, new Set())).not.toBe('')
    expect(loadoutProblem('devout', c, [printed[0], printed[0], printed[1]], undefined, new Set())).not.toBe('')
    // another survivor's own perk, a killer perk: not in the pool
    expect(loadoutProblem('devout', c, [...printed.slice(0, 2), printedOf('meg')[0]], undefined, new Set())).not.toBe('')
    expect(loadoutProblem('devout', c, [...printed.slice(0, 2), 'jolt'], undefined, new Set())).not.toBe('')
    // Bloodweb: only the cards drawn
    const hand = bloodwebHands(1, chars)['0']
    expect(loadoutProblem('bloodweb', c, [printed[0], hand[0], hand[1]], hand, new Set())).toBe('')
    expect(loadoutProblem('bloodweb', c, [printed[0], printed[1], 'hope'], hand.filter((p) => p !== 'hope'), new Set())).not.toBe('')
  })

  it('cards go over the printed perks dropped, which they free again when discarded', () => {
    const printed = printedOf('dwight')
    const laid = layLoadout('dwight', [printed[0], 'inner_healing', printed[2]])
    expect(laid.perks).toEqual([printed[0], 'inner_healing', printed[2]])
    expect(laid.covered).toEqual({ inner_healing: printed[1] })
    expect(layLoadout('dwight', undefined)).toEqual({ perks: printed })
    // the game starts with them
    const st = createGame({
      board: 'macmillan',
      survivors: chars.slice(0, 4).map((c, i) => ({ id: c.id, name: c.id, perks: i === 0 ? [printed[0], 'inner_healing', printed[2]] : undefined })),
      killer: { id: 'trapper', name: 'trapper', perks: [...printedOf('trapper').slice(1), 'jolt'] },
      players: 5,
      seed: 1,
    })
    expect(st.survivors[0].perks).toEqual([printed[0], 'inner_healing', printed[2]])
    expect(st.survivors[0].covered).toEqual({ inner_healing: printed[1] })
    expect(st.survivors[1].perks).toEqual(printedOf('meg'))
    expect(st.killer.perks).toEqual(['jolt', ...printedOf('trapper').slice(1)])
  })

  it('a loadout is stored as text in a room', () => {
    expect(unpackLoadout(packLoadout(['hope', 'kindred', 'jolt']))).toEqual(['hope', 'kindred', 'jolt'])
    expect(unpackLoadout(undefined)).toBeUndefined()
  })
})
