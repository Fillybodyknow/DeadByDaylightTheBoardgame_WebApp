import { describe, expect, it } from 'vitest'
import { apply } from '../engine/engine'
import { legalActions } from '../engine/legal'
import type { GameState } from '../engine/types'
import { CHAPTERS } from './chapters'
import { learnersTurn, plainest } from './policy'

/** Play a chapter as a learner who does what each step asks (the tutorial playing the others). */
function playThrough(id: string): GameState {
  const ch = CHAPTERS.find((c) => c.id === id)!
  let st = ch.build()
  for (const [n, step] of ch.steps.entries()) {
    if (step.setup) st = step.setup(st)
    if (step.quiz) expect(step.quiz.options[step.quiz.answer], `${id} step ${n + 1}: no right answer`).toBeTruthy()
    // every spot names something that is there
    const spot = typeof step.spot === 'function' ? step.spot(st) : step.spot
    if (spot) expect(Object.values(spot).some(Boolean), `${id} step ${n + 1}: an empty spot`).toBe(true)
    const task = step.task
    if (!task) continue
    for (let guard = 0; !task.done(st); guard++) {
      expect(guard, `${id} step ${n + 1}: never done`).toBeLessThan(40)
      if (learnersTurn(st)) {
        const ok = legalActions(st).filter((a) => task.allow(st, a))
        expect(ok.length, `${id} step ${n + 1}: nothing the step allows (at ${st.step.t})`).toBeGreaterThan(0)
        st = apply(st, ok[0])
      } else {
        const a = ch.auto?.(st) ?? plainest(st)
        expect(a, `${id} step ${n + 1}: the tutorial is stuck (at ${st.step.t})`).not.toBeNull()
        st = apply(st, a!)
      }
    }
  }
  return st
}

describe('tutorial (survivors)', () => {
  it('every chapter builds and plays through', () => {
    for (const c of CHAPTERS) playThrough(c.id)
  })

  it('movement: the learner ends in Scrapyard, having planned Sneak', () => {
    const st = playThrough('movement')
    expect(st.survivors[0].room).toBe('scrapyard')
    expect(st.survivors[0].planned).toBe('sneak')
    // the room it reaches is the one laid out for it (a later room took nothing from it)
    expect(
      st.props
        .filter((p) => p.room === 'scrapyard' && !p.removed)
        .map((p) => p.kind)
        .sort(),
    ).toEqual(['chest', 'generator'])
  })

  it('reveal: one prop of the four is face up, a generator', () => {
    const st = playThrough('reveal')
    const shack = st.props.filter((p) => p.room === 'shack' && !p.removed)
    expect(shack.filter((p) => p.revealed).map((p) => p.kind)).toEqual(['generator'])
  })

  it('repair: the first roll is a plain success, the generator at 1', () => {
    const st = playThrough('repair')
    expect(st.props.find((p) => p.room === 'shack' && p.kind === 'generator')!.progress).toBe(1)
  })

  it('survival: an item from the chest, then into the locker', () => {
    const st = playThrough('survival')
    expect(st.survivors[0].item).not.toBeNull()
    expect(st.survivors[0].status).toBe('locker')
  })

  it('bonus: the crow pays the killer, the cleanse pays the learner 2', () => {
    const st = playThrough('bonus')
    expect(st.survivors[0].room).toBe('mine-depths')
    expect(st.survivors[0].bp).toBe(2 + 2)
  })

  it('killer: wounded by his attack, then carried to the hook and hung', () => {
    const st = playThrough('killer')
    expect(st.survivors[0].status).toBe('hooked')
    expect(st.sacrifice).toBeGreaterThanOrEqual(1)
  })

  it('help: Meg healed, then taken off the hook (+1 ▲ to the learner)', () => {
    const st = playThrough('help')
    expect(st.survivors[1].status).toBe('board')
  })

  it('escape: the fourth generator, then the gate opens and the survivors win', () => {
    const st = playThrough('escape')
    expect(st.phase).toBe('over')
  })
})
