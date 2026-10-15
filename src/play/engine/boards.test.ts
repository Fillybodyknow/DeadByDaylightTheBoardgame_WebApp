import { describe, expect, it } from 'vitest'
import { boards } from './boards'
import { apply, createGame, killerMoves, survivorMoves, tokenOf } from './engine'
import { legalActions } from './legal'
import type { PropCategory } from './types'

// Prop tiles per category (p.3): every board's printed slots must use them exactly.
const TILES: Record<PropCategory, number> = { objective: 10, survival: 12, altruism: 12, boldness: 10 }

describe.each(Object.values(boards))('board $name', (board) => {
  it('has a slot for every prop tile, one room per start face 0–5, and paths between real rooms', () => {
    const slots = { objective: 0, survival: 0, altruism: 0, boldness: 0 }
    for (const r of board.rooms) for (const c of r.props) slots[c]++
    expect(slots).toEqual(TILES)
    expect(board.rooms.map((r) => r.startFace).filter((f) => f !== null).sort()).toEqual([0, 1, 2, 3, 4, 5])
    const ids = new Set(board.rooms.map((r) => r.id))
    for (const p of board.paths) {
      expect(ids.has(p.a) && ids.has(p.b), p.id).toBe(true)
      expect(p.a).not.toBe(p.b)
      // a fork's pairs share an icon that exists
      if (p.token) expect(board.paths.find((q) => q.id === p.token)).toBeTruthy()
    }
  })

  it('joins every room to every other (ignoring walls and vault direction)', () => {
    const seen = new Set([board.rooms[0].id])
    for (let grew = true; grew; ) {
      grew = false
      for (const p of board.paths)
        if (seen.has(p.a) !== seen.has(p.b)) {
          seen.add(p.a)
          seen.add(p.b)
          grew = true
        }
    }
    expect(seen.size).toBe(board.rooms.length)
  })

  it('plays random games to the end without breaking a rule', () => {
    for (let seed = 1; seed <= 6; seed++) {
      let st = createGame({
        board: board.id,
        survivors: ['dwight', 'meg', 'claudette', 'jake'].map((id) => ({ id, name: id })),
        killer: { id: ['trapper', 'hillbilly', 'nurse'][seed % 3], name: 'k' },
        players: 5,
        seed,
      })
      let rng = seed * 7919
      for (let n = 0; n < 3000 && st.phase !== 'over'; n++) {
        const options = legalActions(st)
        expect(options.length).toBeGreaterThan(0)
        rng = (rng * 1103515245 + 12345) >>> 0
        st = apply(st, options[(rng >>> 8) % options.length])
      }
    }
  }, 120_000)
})

describe('forks: one path icon joining three rooms', () => {
  it('moves along any pair, and shares the wall of the icon', () => {
    const board = boards['crotus-prenn']
    let st = createGame({ board: board.id, survivors: ['dwight', 'meg', 'claudette', 'jake'].map((id) => ({ id, name: id })), killer: { id: 'trapper', name: 'k' }, players: 5, seed: 1 })
    while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
    // p16 joins Receiving Desk, Carnival Entrance and Outer Garden, behind one wall
    st.survivors[0].room = 'receiving-desk'
    st.killer.room = 'receiving-desk'
    const viaFork = (moves: { path: { id: string } }[]) => moves.filter((m) => tokenOf(board, m.path.id) === 'p16').map((m) => m.path.id)
    expect(viaFork(survivorMoves(st, 0, 'sprint'))).toEqual([]) // the wall stops survivors
    expect(viaFork(killerMoves(st, 'sprint')).sort()).toEqual(['p16', 'p16b'])
    st.paths.p16.wall = false
    expect(viaFork(survivorMoves(st, 0, 'sprint')).sort()).toEqual(['p16', 'p16b'])
  })
})
