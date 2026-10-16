import { describe, expect, it } from 'vitest'
import { apply, createGame, tryApply, type GameConfig } from './engine'
import { legalActions } from './legal'
import { actorsOf, handsToPlan, mayAct, playerOfSurvivor } from './seats'
import type { Action, GameState, MoveCard } from './types'
import { archivedRounds, roundKey, roundsToArchive, trimLog, withFullLog } from '../online/logArchive'

const config = (seed = 1, players: GameConfig['players'] = 5): GameConfig => ({
  board: 'macmillan',
  survivors: ['dwight', 'meg', 'claudette', 'jake'].map((id) => ({ id, name: id })),
  killer: { id: 'trapper', name: 'trapper' },
  players,
  seed,
})

function toPlanning(players: GameConfig['players'], seed = 1): GameState {
  let st = createGame(config(seed, players))
  while (st.step.t === 'setupReveal') st = apply(st, legalActions(st)[0])
  expect(st.step.t).toBe('planSurvivors')
  return st
}

/** Cards for one hand: the first free cards of that hand for each of its unhooked survivors. */
function handCards(st: GameState, hand: number): (MoveCard | null)[] {
  const pool = [...st.survivorHands[hand]]
  return st.survivors.map((sv) => (sv.hand === hand && sv.status !== 'hooked' ? pool.shift()! : null))
}

describe('online planning (planHand)', () => {
  it('waits for every hand, then plans all survivors at once (5 players)', () => {
    let st = toPlanning(5)
    // everyone plans at the same time: the four survivor players and the killer
    expect(actorsOf(st)).toEqual([1, 2, 3, 4, 5])
    for (const hand of [2, 0, 3]) {
      st = apply(st, { t: 'planHand', hand, cards: handCards(st, hand) })
      expect(st.step.t).toBe('planSurvivors')
      expect(st.survivors.every((sv) => sv.planned === null)).toBe(true) // still face down, not placed
    }
    expect(handsToPlan(st)).toEqual([1])
    expect(actorsOf(st)).toEqual([1, 3])
    st = apply(st, { t: 'planHand', hand: 1, cards: handCards(st, 1) })
    expect(st.step.t).toBe('planKiller')
    expect(st.survivors.every((sv) => sv.planned !== null)).toBe(true)
    expect(st.planDraft).toBeUndefined()
    expect(actorsOf(st)).toEqual([1])
  })

  it('lets the killer plan while the survivors do; the last one in starts the round', () => {
    let st = toPlanning(5)
    const [a, b] = st.killer.hand
    st = apply(st, { t: 'planKiller', cards: [a, b] })
    // held, not played: the killer is done, the survivors are still being waited on
    expect(st.step.t).toBe('planSurvivors')
    expect(st.killerDraft).toEqual([a, b])
    expect(st.killer.planned).toEqual([])
    expect(actorsOf(st)).toEqual([2, 3, 4, 5])
    expect(mayAct(st, 1, { t: 'planKiller', cards: [a, b] })).toBe(false) // only once
    for (const hand of [0, 1, 2]) st = apply(st, { t: 'planHand', hand, cards: handCards(st, hand) })
    expect(st.step.t).toBe('planSurvivors')
    st = apply(st, { t: 'planHand', hand: 3, cards: handCards(st, 3) })
    // the last hand starts the round straight away, with the killer's cards in place
    expect(st.killer.planned).toEqual([a, b])
    expect(st.killerDraft).toBeUndefined()
    expect(st.phase).toBe('survivors')
    expect(st.step.t).not.toBe('planKiller')
  })

  it('only the killer may send the killer plan, and only with cards in hand', () => {
    const st = toPlanning(5)
    const [a, b] = st.killer.hand
    expect(mayAct(st, 1, { t: 'planKiller', cards: [a, b] })).toBe(true)
    expect(mayAct(st, 2, { t: 'planKiller', cards: [a, b] })).toBe(false)
    expect(tryApply(st, { t: 'planKiller', cards: [a] as unknown as MoveCard[] })).toBeNull()
    const none = st.killer.hand.includes('wait') ? [] : (['wait', 'wait'] as MoveCard[])
    if (none.length) expect(tryApply(st, { t: 'planKiller', cards: none })).toBeNull()
  })

  it('makes a two-survivor hand pick two different cards (p.19)', () => {
    const st = toPlanning(3)
    const [a] = st.survivorHands[0]
    expect(tryApply(st, { t: 'planHand', hand: 0, cards: [a, a, null, null] })).toBeNull()
    const ok = tryApply(st, { t: 'planHand', hand: 0, cards: handCards(st, 0) })
    expect(ok?.step.t).toBe('planSurvivors')
    expect(actorsOf(ok!)).toEqual([1, 3]) // the other hand, and the killer still planning
  })

  it('skips hooked survivors', () => {
    let st = toPlanning(5)
    st.survivors[3].status = 'hooked'
    st = apply(st, { t: 'planHand', hand: 0, cards: handCards(st, 0) })
    st = apply(st, { t: 'planHand', hand: 1, cards: handCards(st, 1) })
    st = apply(st, { t: 'planHand', hand: 2, cards: handCards(st, 2) })
    expect(st.step.t).toBe('planKiller')
    expect(st.survivors[3].planned).toBeNull()
  })

  it('rejects a hand with no survivor left to plan, and wrong cards', () => {
    const st = toPlanning(5)
    st.survivors[0].status = 'hooked'
    expect(tryApply(st, { t: 'planHand', hand: 0, cards: ['sneak', null, null, null] })).toBeNull()
    expect(tryApply(st, { t: 'planHand', hand: 1, cards: [null, 'wait', null, null] })).toBeNull()
  })
})

describe('seats', () => {
  it('lets only the right player act', () => {
    const st = toPlanning(4)
    const action: Action = { t: 'planHand', hand: 0, cards: handCards(st, 0) }
    expect(mayAct(st, 2, action)).toBe(true)
    expect(mayAct(st, 3, action)).toBe(false)
    expect(mayAct(st, 1, action)).toBe(false)
    expect(mayAct(st, 2, { t: 'planSurvivors', cards: [null, null, null, null] })).toBe(false)
    expect(playerOfSurvivor(st, 1)).toBe(2) // 4 players: survivors 0 and 1 share player 2's hand
  })
})

/**
 * Play whole games the way the online version does: every action must come from a player that
 * `mayAct` allows. A step that nobody may answer would freeze an online game.
 */
function playOnline(seed: number, players: GameConfig['players']): GameState {
  let st = createGame(config(seed, players))
  let rnd = seed
  const rand = (n: number) => {
    rnd = (rnd * 1103515245 + 12345) >>> 0
    return rnd % n
  }
  for (let i = 0; i < 4000 && st.phase !== 'over'; i++) {
    const actors = actorsOf(st)
    expect(actors.length, `nobody may act at step ${st.step.t}`).toBeGreaterThan(0)
    if (st.step.t === 'planSurvivors') {
      // half the time the killer gets his plan in first, as he may online
      if (!st.killerDraft && rand(2) === 0) {
        const [l, r] = st.killer.hand
        const killer = tryApply(st, { t: 'planKiller', cards: [l, r] })
        expect(killer, 'planKiller during planning rejected').not.toBeNull()
        st = killer!
        continue
      }
      const hand = handsToPlan(st)[0]
      const next = tryApply(st, { t: 'planHand', hand, cards: handCards(st, hand) })
      expect(next, 'planHand rejected').not.toBeNull()
      st = next!
      continue
    }
    const options = legalActions(st)
    const allowed = options.filter((a) => actors.some((p) => mayAct(st, p, a)))
    expect(allowed.length, `no permitted legal action at ${st.step.t} (actors ${actors})`).toBeGreaterThan(0)
    st = apply(st, allowed[rand(allowed.length)])
  }
  return st
}

describe('online playthroughs', () => {
  it('always has a permitted player and action, to the end of the game', () => {
    let finished = 0
    for (let seed = 1; seed <= 24; seed++) {
      const st = playOnline(seed, ([5, 4, 3] as const)[seed % 3])
      if (st.phase === 'over') finished++
    }
    expect(finished).toBeGreaterThan(18)
  }, 120_000)
})

/**
 * The move protocol: the room keeps a checkpoint and the moves after it, and every device
 * replays them. A device that joined at the start and one that joined at the last checkpoint
 * must end up with exactly the same game.
 */
describe('move protocol', () => {
  const CHECKPOINT_EVERY = 25

  function playWithMoves(seed: number, players: GameConfig['players']) {
    let host = createGame(config(seed, players)) // the device that has been here all along
    let checkpoint = host
    let moves: Action[] = []
    const archive: Record<string, string> = {}
    let rnd = seed
    const rand = (n: number) => {
      rnd = (rnd * 1103515245 + 12345) >>> 0
      return rnd % n
    }
    let sent = 0
    let moveBytes = 0
    let checkpointBytes = 0

    for (let i = 0; i < 4000 && host.phase !== 'over'; i++) {
      const actors = actorsOf(host)
      if (!actors.length) break
      const action: Action =
        host.step.t === 'planSurvivors'
          ? { t: 'planHand', hand: handsToPlan(host)[0], cards: handCards(host, handsToPlan(host)[0]) }
          : (() => {
              const options = legalActions(host).filter((a) => actors.some((p) => mayAct(host, p, a)))
              return options[rand(options.length)]
            })()
      if (!action) break
      const next = tryApply(host, action)
      if (!next) break
      host = next
      moves = [...moves, action]
      sent++
      moveBytes += JSON.stringify(action).length
      // finished rounds are archived once, as the room does
      for (const [round, entries] of roundsToArchive(host, archivedRounds(archive))) archive[roundKey(round)] = JSON.stringify(entries)
      if (moves.length === CHECKPOINT_EVERY) {
        checkpoint = trimLog(host, archivedRounds(archive))
        moves = []
        checkpointBytes += JSON.stringify(checkpoint).length
      }
    }
    // a device joining now: the checkpoint, the moves on top of it, and the archived log
    let replayed: GameState | null = checkpoint
    for (const a of moves) replayed = replayed && tryApply(replayed, a)
    const joiner = replayed && withFullLog(replayed, archive)
    return { host, joiner, sent, moveBytes, checkpointBytes }
  }

  it('a device replaying from the checkpoint lands on the same game, to the end', () => {
    let finished = 0
    let moveBytes = 0
    let checkpointBytes = 0
    let sent = 0
    for (let seed = 1; seed <= 12; seed++) {
      const r = playWithMoves(seed, ([5, 4, 3] as const)[seed % 3])
      expect(r.joiner, `seed ${seed}: a move did not replay`).not.toBeNull()
      expect(JSON.stringify(r.joiner)).toBe(JSON.stringify(r.host))
      if (r.host.phase === 'over') finished++
      sent += r.sent
      moveBytes += r.moveBytes
      checkpointBytes += r.checkpointBytes
    }
    expect(finished).toBeGreaterThan(8)
    // the point of it all: a move is far smaller than the state it would have replaced
    expect(moveBytes / sent).toBeLessThan(200)
    expect((moveBytes + checkpointBytes) / sent).toBeLessThan(2000)
  }, 120_000)
})

describe('log archive (small online writes)', () => {
  // Play a game twice in step: one keeps the whole state, the other only what an online write
  // carries (trimmed log) plus the archives, losing some archive writes on the way.
  function check(seed: number, players: GameConfig['players']) {
    let full = createGame(config(seed, players))
    let core = full
    const archive: Record<string, string> = {}
    const parsed = new Map<string, GameState['log']>()
    const parse = (t: string) => parsed.get(t) ?? (parsed.set(t, JSON.parse(t)), parsed.get(t)!)
    let rnd = seed
    let maxCore = 0
    for (let i = 0; i < 3000 && full.step.t !== 'gameOver'; i++) {
      rnd = (rnd * 1103515245 + 12345) % 2147483648
      const opts = legalActions(full)
      const action = opts[rnd % opts.length]
      const nextFull = tryApply(full, action)
      const nextCore = tryApply(core, action)
      expect(!!nextCore).toBe(!!nextFull)
      if (!nextFull || !nextCore) continue
      // the engine plays the same on the trimmed state: everything but the log is equal
      expect(JSON.stringify({ ...nextCore, log: [] })).toBe(JSON.stringify({ ...nextFull, log: [] }))
      full = nextFull
      // the write: trimmed by what is archived; then the archives (a fifth of them get lost)
      core = trimLog(nextCore, archivedRounds(archive))
      for (const [round, entries] of roundsToArchive(core, archivedRounds(archive)))
        if (rnd % 5 !== 0) archive[roundKey(round)] = JSON.stringify(entries)
      // every device puts the same full log back together
      expect(JSON.stringify(withFullLog(core, archive, parse).log)).toBe(JSON.stringify(full.log))
      maxCore = Math.max(maxCore, JSON.stringify(core).length)
    }
    return { full, maxCore }
  }

  it('plays the same game and rebuilds the same log, even when archive writes are lost', () => {
    for (const [seed, players] of [[3, 5], [8, 4], [21, 3], [34, 5]] as const) {
      const { full, maxCore } = check(seed, players)
      expect(full.step.t).toBe('gameOver')
      // the written state stays a fraction of the full one
      expect(maxCore).toBeLessThan(JSON.stringify(full).length / 2)
    }
  }, 120_000)

  it('never drops a round the room has not archived', () => {
    const st = { round: 3, log: [1, 1, 2, 3].map((round) => ({ round, text: '', who: 'game' })) } as unknown as GameState
    expect(trimLog(st, new Set([2])).log.map((e) => e.round)).toEqual([1, 1, 3])
    expect([...roundsToArchive(st, new Set([2])).keys()]).toEqual([1])
    // the current round is never archived, even if listed
    expect(trimLog(st, new Set([3])).log.length).toBe(4)
  })
})
