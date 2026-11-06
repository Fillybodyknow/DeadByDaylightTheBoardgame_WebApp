import { describe, expect, it } from 'vitest'
import { botMove, nextActor } from './engine/bot'
import { apply, createGame, type GameConfig } from './engine/engine'
import { legalActions } from './engine/legal'
import type { GameState } from './engine/types'
import { epithets, tallies } from './epithets'

const config = (seed: number, killer = 'trapper'): GameConfig => ({
  board: 'macmillan',
  survivors: ['dwight', 'meg', 'claudette', 'jake'].map((id) => ({ id, name: id })),
  killer: { id: killer, name: killer },
  players: 5,
  seed,
  bots: [1, 2, 3, 4, 5],
})

/** A whole game the bots play out, so the epithets are read from a real log. */
function played(seed: number, killer?: string): GameState {
  let st = createGame(config(seed, killer))
  for (let n = 0; n < 8000 && st.phase !== 'over'; n++) {
    const player = nextActor(st)
    const act = player === null ? legalActions(st)[0] : botMove(st, player)
    if (!act) throw new Error(`no move for player ${player} at ${st.step.t}`)
    st = apply(st, act)
  }
  expect(st.phase).toBe('over')
  return st
}

/** The state right after setup: nobody has done anything yet. */
function fresh(): GameState {
  let st = createGame(config(5))
  while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
  return st
}

describe('epithets', () => {
  it('give every player one, and no two the same', () => {
    for (const seed of [11, 12, 13]) {
      const e = epithets(played(seed))
      const all = [...e.survivors.map((x) => x.id), e.killer.id]
      expect(e.survivors, `seed ${seed}`).toHaveLength(4)
      expect(new Set(e.survivors.map((x) => x.id)).size, `seed ${seed}: the survivors' are all different`).toBe(4)
      expect(all.every((id) => id !== 'none'), `seed ${seed}: nobody is left without one`).toBe(true)
      for (const x of [...e.survivors, e.killer]) expect(x.name.length, `seed ${seed}: ${x.id} is named`).toBeGreaterThan(0)
    }
  }, 300_000)

  it('are the same every time: every device must agree on them', () => {
    const st = played(14)
    expect(epithets(st)).toEqual(epithets(st))
    // the same game played again from the same seed reads the same
    expect(epithets(played(14))).toEqual(epithets(st))
  }, 300_000)

  it('a game where nobody did anything still hands out four, all different', () => {
    const e = epithets(fresh())
    expect(new Set(e.survivors.map((x) => x.id)).size).toBe(4)
    expect(e.killer.id).toBe('empty')
  })

  it('go to whoever did most of the thing they are named for', () => {
    const st = fresh()
    // Meg (1) is the only one hurt, and the only one to throw a pallet down
    st.log.push(
      { round: 1, text: '', who: 'game', ev: { k: 'wound', s: 1, by: 'attack' } },
      { round: 1, text: '', who: 'game', ev: { k: 'wound', s: 1, by: 'attack' } },
      { round: 1, text: '', who: 'game', ev: { k: 'palletDrop', s: 1, path: 'p1' } },
      // Jake (3) cleanses two hex totems
      { round: 1, text: '', who: 'game', ev: { k: 'cleanse', s: 3 } },
      { round: 1, text: '', who: 'game', ev: { k: 'cleanse', s: 3 } },
    )
    const t = tallies(st)
    expect([t.survivors[1].wounded, t.survivors[1].pallets, t.survivors[3].totems]).toEqual([2, 1, 2])
    const e = epithets(st)
    // Meg is the only one who can be called wounded or a pallet-thrower, Jake the only cleanser
    expect(['sandbag', 'pallet']).toContain(e.survivors[1].id)
    expect(e.survivors[3].id).toBe('cleanser')
    // the two who did nothing are left with being unhurt, or with a spare — one each all the same
    for (const s of [0, 2]) expect(['ghost', 'decor', 'audience', 'breeze', 'extra'], `survivor ${s}`).toContain(e.survivors[s].id)
    expect(e.survivors[0].id).not.toBe(e.survivors[2].id)
    // "ผีไร้ร่าง" is for one of the three never hurt, never for Meg
    expect(e.survivors[1].id).not.toBe('ghost')
  })

  it("the killer's is weighed over everything he did", () => {
    const st = fresh()
    st.log.push(
      { round: 1, text: '', who: 'game', ev: { k: 'trapSet', path: 'p1' } },
      { round: 1, text: '', who: 'game', ev: { k: 'trapSprung', s: 0, path: 'p1' } },
      { round: 1, text: '', who: 'game', ev: { k: 'trapSprung', s: 2, path: 'p1' } },
      { round: 1, text: '', who: 'game', ev: { k: 'wound', s: 0, by: 'attack' } },
    )
    const e = epithets(st)
    expect(e.killer.id).toBe('trapper')
    expect(e.killer.note).toContain('2')
    // the trap took the survivors who stepped in it, not the killer's epithet
    expect(e.survivors[0].id === 'heavyfoot' || e.survivors[2].id === 'heavyfoot').toBe(true)
  })
})
