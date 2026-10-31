// The bot: a move for a seat the computer plays (online, the host's device sends it; offline, the
// shared one). It knows what that player would know at the table: where everyone stands, the
// props face up, the tracks. Never the face-down cards, the hidden props or the dice to come.
//
// Planning: each card is scored by where it can take its survivor (for the killer, where his cards
// in a row can take him). Every other decision: each legal choice is tried on a copy of the game
// with a fresh dice seed, so the real dice stay unknown, played on through what follows by itself
// (rolls, reveals, perk offers) to the next real decision, and the position scored. That serves
// every killer's power without code of its own. Perks are left alone for now; items are used when
// trying one shows it helps.

import { SACRIFICE_TO_WIN, apply, boardOf, directRoom, generatorsDone, gatesPowered, isDirect, killerMoves, nextToPlan, pathState, survivorMoves, twoPlayer, unknownRooms } from './engine'
import { legalActions } from './legal'
import { KILLER_PLAYER, actorsOf, handsToPlan, mayAct } from './seats'
import type { Action, GameState, MoveCard, PathState } from './types'

// ---------- distances ----------

const distCache = new Map<string, Map<string, Map<string, number>>>()

/**
 * Moves from one room to another (`all.get(from).get(to)`), walls aside: a vault path only along
 * its arrow. Taken both ways, a pallet on a vault path looked like it stopped a killer coming
 * against the arrow, who can't come that way at all.
 */
function distances(st: GameState): Map<string, Map<string, number>> {
  const board = boardOf(st)
  const hit = distCache.get(board.id)
  if (hit) return hit
  const next = new Map<string, string[]>()
  for (const r of board.rooms) next.set(r.id, [])
  for (const p of board.paths) {
    next.get(p.a)?.push(p.b)
    if (p.kind !== 'vault') next.get(p.b)?.push(p.a)
  }
  const all = new Map<string, Map<string, number>>()
  for (const r of board.rooms) {
    const d = new Map<string, number>([[r.id, 0]])
    const queue = [r.id]
    while (queue.length) {
      const at = queue.shift()!
      for (const n of next.get(at) ?? []) if (!d.has(n)) d.set(n, d.get(at)! + 1), queue.push(n)
    }
    all.set(r.id, d)
  }
  distCache.set(board.id, all)
  return all
}

const FAR = 8
const dist = (st: GameState, a: string, b: string) => distances(st).get(a)?.get(b) ?? FAR

function nearest(st: GameState, from: string, rooms: string[]): number {
  let best = FAR
  for (const r of rooms) best = Math.min(best, dist(st, from, r))
  return best
}

/** The nearest of `rooms` the other way: how soon someone there can come to `to`. */
function nearestTo(st: GameState, rooms: string[], to: string): number {
  let best = FAR
  for (const r of rooms) best = Math.min(best, dist(st, r, to))
  return best
}

/** Rooms with a killer mini in them: his own, and Victor's or the other Unknowns'. */
function killerRooms(st: GameState): string[] {
  const k = st.killer
  if (k.unknowns) return [...new Set(unknownRooms(st).filter((r): r is string => r !== null))]
  return k.victorRoom && k.victorRoom !== k.room ? [k.room, k.victorRoom] : [k.room]
}

/**
 * What an Unknown more on the board is worth to him, beyond where it stands: a card of its own
 * every round. (Victor is worth only where he stands: a worth of his own had the Twins place him
 * instead of attacking, and lose more: 32 games, 15 won at 0, 12 at 20, 11 at 40.)
 */
const UNKNOWN_WORTH = 40

/**
 * How far the killer is from each room, in his moves: a pallet on a path costs him one more (he
 * removes it and stays, p.14), so a pallet between him and a survivor buys them a move.
 */
function threat(st: GameState): Map<string, number> {
  const board = boardOf(st)
  // from each of his minis (Victor, the Unknowns)
  const d = new Map<string, number>(killerRooms(st).map((r) => [r, 0]))
  const pallet = new Set(st.props.flatMap((p) => (p.kind === 'pallet' && p.path && !p.removed ? [p.path] : [])))
  // a few rooms: settle the shortest distances by relaxing the paths until nothing changes
  for (let changed = true, round = 0; changed && round < board.rooms.length; round++) {
    changed = false
    for (const p of board.paths) {
      const cost = pallet.has(p.id) || pallet.has(p.token ?? '') ? 2 : 1
      // a vault path only along its arrow
      for (const [a, b] of p.kind === 'vault' ? [[p.a, p.b]] : [
        [p.a, p.b],
        [p.b, p.a],
      ]) {
        const via = (d.get(a) ?? Infinity) + cost
        if (via < (d.get(b) ?? Infinity)) d.set(b, via), (changed = true)
      }
    }
  }
  return d
}

// ---------- the position, scored ----------

/**
 * How good the game looks for the killer: the tracks and who is hurt. Props count only if the
 * bot knew them face up (`known`): a prop a tried move would reveal stays unknown to it.
 */
function tracks(st: GameState, known: Set<string>): number {
  if (st.step.t === 'gameOver') return st.step.winner === 'killer' ? 1e6 : -1e6
  let v = 140 * st.sacrifice - 150 * generatorsDone(st)
  for (const sv of st.survivors) {
    // a survivor left on the hook is a sacrifice progress every round: worth more than one
    if (sv.status === 'hooked') v += 170
    else if (sv.status === 'carried') v += 60
    // wounded is one hit from the hook
    if (sv.wounded && sv.status !== 'hooked') v += 36
    // The Doctor's Madness: their skill checks use the danger die, and his bonus turn costs less
    if (sv.madness && sv.status !== 'hooked') v += MADNESS
    // The Plague's Vile Purges and the Trickster's Knives, carried: each one nearer the third, which wounds
    v += CARRIED[(sv.purged ?? []).length] ?? 0
    v += CARRIED[sv.knives ?? 0] ?? CARRIED[3]
    v -= 2 * sv.bp
    // an item in hand is a repair, a heal or a way out to come: what a chest is worth
    if (sv.item) v -= 8
  }
  const powered = gatesPowered(st)
  for (const p of st.props) {
    if (!known.has(p.id) || p.removed) continue
    // once the gates have power, more generators are worth nothing
    if (p.kind === 'generator' && !p.done && !powered) v -= 30 * p.progress
    // a gate is worth more the nearer it is to open: one gate opened beats two half done
    if (p.kind === 'exitGate') v -= GATE_WORTH[p.progress] ?? GATE_WORTH[3]
  }
  if (powered) v -= 150
  return v + bpWorth(st.killer.bp)
}

/**
 * The killer's ▲: 3 each up to 8. Above that they are worth little: the track stops at 12, and what
 * he earns past it spills over unused (a bot spends them only on bonus turns and powers).
 */
const bpWorth = (bp: number) => 3 * Math.min(bp, 8) + Math.max(0, bp - 8)

/** An exit gate with 0–3 progress (was 90 a step: 1 and 1 on two gates scored as 2 on one). */
const GATE_WORTH = [0, 80, 190, 330]

/** A survivor with The Doctor's Madness. */
const MADNESS = 14

/**
 * A survivor carrying 0–3 of The Plague's Vile Purges or the Trickster's Knives: the third wounds
 * (counted as a wound), and three Knives also stop every heal.
 */
const CARRIED = [0, 8, 18, 18]

/**
 * What his power has left on the board, for the killer: a bear trap on a path (The Trapper), a
 * Phantasm Trap in a room (The Hag), a Vile Purge in a room (The Plague), a Guard (The Knight), a
 * Drone face up (The Skull Merchant). Each is worth more where the survivors are, or will come (a
 * generator to repair): one far from everyone waits for nobody. The Jailer and a Drone act on the
 * skill checks rolled in their room: the work there counts double.
 */
function trapsLeft(st: GameState, known: Set<string>): number {
  const drones = st.killer.characterId === 'skullmerchant' ? st.props.filter((p) => p.kind === 'drone' && p.revealed && !p.removed && p.room) : []
  const guards = st.guards ?? {}
  const tonic = st.afterpiece?.tonic
  if (st.killer.characterId !== 'trapper' && !st.phantasm.length && !st.purge?.length && !drones.length && !guards.assassin && !guards.jailer && !guards.carnifex && !tonic) return 0
  const free = st.survivors.flatMap((sv) => (sv.status === 'board' ? [sv.room] : []))
  const work = goals(st, known)
  const at = (room: string, workWorth = TRAP.work) => TRAP.base + TRAP.near * free.filter((r) => dist(st, r, room) <= 1).length + (work.includes(room) ? workWorth : 0)
  let v = 0
  for (const room of st.purge ?? []) v += at(room)
  for (const p of drones) v += at(p.room!, 2 * TRAP.work)
  if (guards.assassin) v += at(guards.assassin)
  if (guards.jailer) v += at(guards.jailer, 2 * TRAP.work)
  // the Carnifex clears the pallets and lockers where it stands: worth having out
  if (guards.carnifex) v += TRAP.base
  // the Clown's Tonic: whoever plans in its room sets their card face up, for him to read
  if (tonic) v += TRAP.near * free.filter((r) => r === tonic).length
  if (st.killer.characterId === 'trapper') {
    // forks share one icon: a trap on it counts once
    const seen = new Set<PathState>()
    for (const p of boardOf(st).paths) {
      const ps = pathState(st, p.id)
      if (!ps?.trap || seen.has(ps)) continue
      seen.add(ps)
      v += (at(p.a) + at(p.b)) / 2
    }
  }
  for (const room of st.phantasm) v += at(room)
  return v
}

/** A trap's worth: its own, each survivor in or next to it, and work there. */
const TRAP = { base: 4, near: 5, work: 4 }

/** Rooms of the generators still to repair (or, powered, the exit gates) that the bot knows of. */
function goals(st: GameState, known: Set<string>): string[] {
  const powered = gatesPowered(st)
  return st.props.flatMap((p) => {
    if (!known.has(p.id) || p.removed || p.room === null) return []
    if (powered) return p.kind === 'exitGate' ? [p.room] : []
    return p.kind === 'generator' && !p.done ? [p.room] : []
  })
}

/**
 * Where everyone stands, for the killer: close to a survivor, closer still to a wounded one, and
 * near the generator the survivors are furthest on (where they will come back to).
 */
function killerPlace(st: GameState, known: Set<string>): number {
  const k = st.killer.room
  // every mini of his counts where he stands (Victor, each Unknown): the nearest one to a survivor
  const minis = killerRooms(st)
  const near = (rooms: string[]) => Math.min(...minis.map((m) => nearest(st, m, rooms)))
  const free = st.survivors.filter((sv) => sv.status === 'board')
  let v = 0
  if (free.length) {
    v -= 10 * near(free.map((sv) => sv.room))
    const hurt = free.filter((sv) => sv.wounded)
    if (hurt.length) v -= 6 * near(hurt.map((sv) => sv.room))
    for (const sv of free) if (minis.includes(sv.room)) v += 8
  }
  const gens = st.props.filter((p) => p.kind === 'generator' && known.has(p.id) && !p.done && !p.removed && p.progress > 0 && p.room)
  if (gens.length) {
    const top = Math.max(...gens.map((p) => p.progress))
    v -= 3 * top * near(gens.filter((p) => p.progress === top).map((p) => p.room!))
  }
  // an Unknown more on the board: a card and a turn more every round
  if (st.killer.unknowns) v += UNKNOWN_WORTH * (minis.length - 1)
  // mid-round, a room his next card can't leave costs that card's turn: he moves elsewhere (The
  // Unknown: the next card is played from the next Unknown's room)
  const next = st.phase === 'killer' ? st.killer.planned[st.killer.revealedCount] : undefined
  const from = st.killer.unknowns ? unknownRooms(st)[st.killer.revealedCount] : k
  if (next && from && killerDests(st, from, next).failed) v -= FAILED_MOVE
  return v + trapsLeft(st, known)
}

/**
 * A survivor standing at the work (a generator to repair, or a powered exit gate): what the turn's
 * interaction there is worth, beyond being a room closer. Without it a card that ends at the work
 * looked barely better than one ending next to it, and the bots spent their turns elsewhere.
 */
const WORK_HERE = 24
/** Each room between a survivor and the nearest work. */
const WORK_PULL = 8
/**
 * Each step of progress already on an exit gate: the further along, the stronger the pull (finish
 * one gate, not two halves). Not on a generator: the killer guards the one furthest on, and
 * flocking to it cost the survivors games (88 games: 34 won, against 43 without).
 */
const WORK_STEP = { generator: 0, exitGate: 10 }

/** The work the bot knows of (generators to repair, or with power the exit gates), each with what its progress adds. */
function workSites(st: GameState, known: Set<string>): { room: string; worth: number }[] {
  const powered = gatesPowered(st)
  return st.props.flatMap((p) => {
    if (!known.has(p.id) || p.removed || p.room === null) return []
    if (powered ? p.kind !== 'exitGate' : p.kind !== 'generator' || p.done) return []
    return [{ room: p.room, worth: WORK_STEP[p.kind as 'generator' | 'exitGate'] * p.progress }]
  })
}

/**
 * A survivor 0, 1 or 2 of the killer's moves away (he moves twice after them), wounded or not.
 * Someone wounded within his reach is picked up and hooked: at 50/30/12 a repair (30) beat a pallet
 * dropped between them, and two wounded walked next to him to heal and were both hooked that round.
 */
const FEAR = { wounded: [100, 70, 25], healthy: [30, 16, 6] }

/**
 * Each room between someone hooked and the nearest survivor free to get them down; much more when
 * the hooks' progress at the end of this round would fill the track (it ends the game). At 22
 * always, a survivor next door opened an exit gate at 0 instead, and the killer won at the cleanup.
 */
const RESCUE = 22
const LAST_RESCUE = 300

/** Where everyone stands, for the survivors: away from the killer, at the work, near who needs them. */
function survivorPlace(st: GameState, known: Set<string>): number {
  const reach = threat(st)
  const work = goals(st, known)
  const sites = workSites(st, known)
  // rooms with props still face down may hide the generators (or exit gates) not found yet: the
  // pull is stronger with nothing known to work on
  const unseen = [...new Set(st.props.flatMap((p) => (!known.has(p.id) && !p.removed && p.room ? [p.room] : [])))]
  const explore = work.length ? 1.5 : 5
  const free = st.survivors.flatMap((sv, i) => (sv.status === 'board' ? [i] : []))
  let v = 0
  st.survivors.forEach((sv, i) => {
    // a locker is safe from the killer but gets nothing done: worth it with him close, not to sit out
    // the game (the work still waits: it is scored from the locker's room)
    const hidden = sv.status === 'locker'
    if (sv.status !== 'board' && !hidden) return
    if (hidden) v -= 12
    // the killer moves twice after the survivors: two moves away is still within his reach
    const d = Math.round(reach.get(sv.room) ?? FAR)
    v -= (sv.wounded ? FEAR.wounded[d] ?? 0 : FEAR.healthy[d] ?? 0) * (hidden ? 0.35 : 1)
    if (sites.length) {
      // the best work for them: at it, the turn's interaction is a repair (or the gate), worth more
      // than a room closer; and work already well on pulls harder (finish one gate, not two halves)
      let best = -Infinity
      for (const w of sites) {
        const d = dist(st, sv.room, w.room)
        best = Math.max(best, w.worth - WORK_PULL * d + (d === 0 && !hidden ? WORK_HERE : 0))
      }
      v += best
    }
    if (unseen.length) v -= explore * nearest(st, sv.room, unseen)
    // a wounded survivor wants someone to heal them: the killer can't pick them up the round they
    // were hurt (p.15), so a teammate has a round to get there
    if (sv.wounded) v -= 16 * nearestTo(st, free.filter((j) => j !== i).map((j) => st.survivors[j].room), sv.room)
  })
  // someone on a hook wants a rescuer: every round there is a sacrifice progress. When the round's
  // progress would fill the track, the game ends with this round unless someone gets them down:
  // nothing else matters then
  const hooked = st.survivors.filter((sv) => sv.status === 'hooked').length
  const rescue = st.sacrifice + hooked >= SACRIFICE_TO_WIN ? LAST_RESCUE : RESCUE
  for (const sv of st.survivors)
    if (sv.status === 'hooked') v -= rescue * nearestTo(st, free.map((j) => st.survivors[j].room), sv.room)
  // spread out: more than two in a room is one killer's visit for all of them
  const crowd = new Map<string, number>()
  for (const i of free) crowd.set(st.survivors[i].room, (crowd.get(st.survivors[i].room) ?? 0) + 1)
  for (const n of crowd.values()) if (n > 2) v -= 7 * (n - 2)
  return v
}

function score(st: GameState, killer: boolean, known: Set<string>): number {
  const t = tracks(st, known)
  return killer ? t + killerPlace(st, known) : -t + survivorPlace(st, known)
}

const knownProps = (st: GameState) => new Set(st.props.filter((p) => p.revealed).map((p) => p.id))

// ---------- trying a choice ----------

/** The steps a tried choice is played on through by itself; the rest are someone's real decision. */
const FORCED = new Set(['roll', 'revealProp', 'setupReveal', 'offer', 'turnStart', 'reaction', 'keepItem', 'pickItem', 'carryDice', 'carryMove', 'sparkChoice', 'redeemerGuess'])

/**
 * A guess at the card behind the Redeemer, blind: one of the five, by a draw of the bot's own (the
 * copy's dice while trying, so the tries average to 1 right in 5). Never the card itself: trying
 * each guess on the real game read it, and the bots guessed right every time.
 */
function blindGuess(st: GameState, acts: Action[]): Action | null {
  return acts.length ? acts[(Math.imul(st.rng ^ 0x2545f491, 0x9e3779b1) >>> 0) % acts.length] : null
}

/** The plain answer to a forced step, while trying a choice (no thinking ahead of its own). */
function forced(st: GameState): Action | null {
  const acts = legalActions(st)
  const s = st.step
  switch (s.t) {
    case 'redeemerGuess':
      return blindGuess(st, acts)
    // Carter's Spark (and Dragon's Grip, Whispers): a survivor with ▲ pays it off, as they mostly do
    case 'sparkChoice':
      return acts.find((a) => a.t === 'spark' && a.pay) ?? acts[0] ?? null
    case 'roll':
      return acts.find((a) => a.t === 'acceptRoll') ?? acts.find((a) => a.t === 'passRoll') ?? null
    case 'offer':
      return acts.find((a) => a.t === 'perk' && !a.use && a.quiet) ?? null
    case 'reaction':
      return { t: 'react', s: null }
    case 'carryDice':
      return acts.find((a) => a.t === 'hang') ?? { t: 'carryDice', n: 3 }
    case 'carryMove':
      return carryOn(st, acts)
    default:
      return acts.find((a) => a.t !== 'useItem' && a.t !== 'perk' && a.t !== 'reroll') ?? null
  }
}

/** Carrying: hang if he can, else a step toward the nearest free hook he knows of, else let go. */
function carryOn(st: GameState, acts: Action[]): Action | null {
  const hang = acts.find((a) => a.t === 'hang')
  if (hang) return hang
  const hooks = st.props.filter((p) => p.kind === 'hook' && p.revealed && !p.removed && p.occupant === null && p.room).map((p) => p.room!)
  const here = nearest(st, st.killer.room, hooks)
  const board = boardOf(st)
  let best: Action | null = null
  let bestD = here
  for (const a of acts) {
    if (a.t !== 'move') continue
    const p = board.paths.find((x) => x.id === a.path)
    if (!p) continue
    const to = p.a === st.killer.room ? p.b : p.a
    const d = nearest(st, to, hooks)
    if (d < bestD) (best = a), (bestD = d)
  }
  return best ?? acts.find((a) => a.t === 'stop') ?? acts[0] ?? null
}

/** A dice seed for the copy: the real one stays unknown to the bot. */
const reseed = (st: GameState, n: number) => (Math.imul(st.rng ^ 0x5bd1e995, 2654435761) + n * 0x9e3779b9) >>> 0

/** The steps of one survivor's own turn, played on through when a choice of theirs is tried. */
const OWN_TURN = new Set(['survivorMove', 'survivorInteract', 'bonusOffer', 'anyMove'])

/**
 * Play `a` on a copy and on through what follows by itself; null if it can't be played. For a
 * survivor (`own`), the rest of their own turn is played too, plainly (`plainTurn`): a move is
 * worth what can be done where it leads, a crow the bonus turn it gives.
 */
function tryOut(st: GameState, a: Action, n: number, own: number | null, known: Set<string>): GameState | null {
  let s: GameState
  try {
    s = apply({ ...st, rng: reseed(st, n) }, a)
    for (let i = 0; i < 40 && s.phase !== 'over'; i++) {
      const step = s.step
      const f = FORCED.has(step.t) ? forced(s) : own !== null && OWN_TURN.has(step.t) && 's' in step && step.s === own ? plainTurn(s, own, known) : null
      if (!f) break
      s = apply(s, f)
    }
  } catch {
    return null
  }
  return s
}

/** The room a path leads to from `room`. */
function across(st: GameState, path: string, room: string): string | null {
  const p = boardOf(st).paths.find((x) => x.id === path)
  return p ? (p.a === room ? p.b : p.a) : null
}

/** Whether someone across `path` can come along it into `room` (a vault path only along its arrow). */
function comesAlong(st: GameState, path: string, room: string): boolean {
  const p = boardOf(st).paths.find((x) => x.id === path)
  return !!p && (p.kind !== 'vault' || p.b === room)
}

/**
 * A survivor's turn played plainly, while a choice is tried (no thinking ahead of its own): the
 * best room to move to, a bonus turn when a card leads to work, then the most useful thing there.
 */
function plainTurn(st: GameState, s: number, known: Set<string>): Action | null {
  const acts = legalActions(st)
  const step = st.step
  const sv = st.survivors[s]
  if (step.t === 'survivorMove' || step.t === 'anyMove') {
    let best: Action | null = acts.find((a) => a.t === 'stop') ?? null
    let bestV = best ? survivorPlace(st, known) : -Infinity
    for (const a of acts) {
      if (a.t !== 'move') continue
      const to = across(st, a.path, sv.room)
      if (!to) continue
      const v = survivorPlace(withSurvivorAt(st, s, to), known)
      if (v > bestV) (bestV = v), (best = a)
    }
    return best ?? acts[0] ?? null
  }
  if (step.t === 'bonusOffer') return bonusPick(st, s, known) ?? { t: 'declineBonus' }
  if (step.t === 'survivorInteract') return usefulHere(st, s, acts) ?? { t: 'endTurn' }
  return null
}

/** What a survivor plainly does in their room, most useful first (no crow: it would go on and on). */
function usefulHere(st: GameState, s: number, acts: Action[]): Action | null {
  const reach = threat(st)
  const sv = st.survivors[s]
  const near = (reach.get(sv.room) ?? FAR) <= 2
  const kind = (a: Action) => (a.t === 'interact' ? a.i.k : '')
  const prop = (a: Action) => (a.t === 'interact' && 'prop' in a.i ? st.props.find((p) => p.id === (a.i as { prop: string }).prop) : undefined)
  const order: ((a: Action) => boolean)[] = [
    (a) => kind(a) === 'openGate',
    // a rescue: the hook with someone on it
    (a) => kind(a) === 'sabotage' && prop(a)?.occupant !== null && prop(a)?.occupant !== undefined,
    (a) => kind(a) === 'heal',
    // (with the gates powered, more generators do nothing)
    (a) => kind(a) === 'repair' && !gatesPowered(st),
    // a pallet toward the killer, while he is close, on a path he could come along (not a vault
    // path pointing away from here)
    (a) => near && a.t === 'interact' && a.i.k === 'dropPallet' && comesAlong(st, a.i.path, sv.room) && (reach.get(across(st, a.i.path, sv.room) ?? '') ?? FAR) < (reach.get(sv.room) ?? FAR),
    (a) => kind(a) === 'cleanse',
    (a) => kind(a) === 'rummage' && !sv.item,
    (a) => (reach.get(sv.room) ?? FAR) <= 1 && kind(a) === 'hide',
  ]
  for (const ok of order) {
    const a = acts.find(ok)
    if (a) return a
  }
  return null
}

/**
 * A survivor's bonus turn: a card whose room is better than where they are by enough to give up
 * the card for the round (work, a teammate to help, away from the killer); null to decline.
 */
function bonusPick(st: GameState, s: number, known: Set<string>): Action | null {
  const here = survivorPlace(st, known)
  let best: Action | null = null
  let bestV = here + 8
  for (const card of new Set(st.survivorHands[st.survivors[s].hand] ?? [])) {
    for (const to of survivorDests(st, s, card)) {
      const v = survivorPlace(withSurvivorAt(st, s, to), known)
      if (v > bestV) (bestV = v), (best = { t: 'bonus', card })
    }
  }
  return best
}

/** Each of `acts` scored for this side, tried on copies of the game (null: it can't be played). */
function tried(st: GameState, acts: Action[], killer: boolean): { a: Action; v: number | null; samples: { v: number; step: string }[] }[] {
  const known = knownProps(st)
  // a survivor's own turn is played on through (plainTurn): which survivor's it is
  const step = st.step
  const own = !killer && OWN_TURN.has(step.t) && 's' in step ? step.s : null
  // the killer's choice is played on to the end of that turn of his (a power that leads to a move
  // or a pick is worth what comes of it), with fewer tries inside, and no deeper
  const turn = killer && !playingOn && 'turn' in step ? step.turn : null
  // Slipstream trades the turns still set for a bonus turn with any card: only the rest of his
  // round, both ways, shows which is better (to the end of this turn it looked free)
  const round = turn !== null && acts.some((a) => a.t === 'interact' && a.i.k === 'slipstream')
  return acts.map((a, i) => {
    const samples: { v: number; step: string }[] = []
    // an interaction mostly rolls dice (a move may lead to one): enough tries that a run of bad
    // luck doesn't hide its worth
    const n = playingOn ? (a.t === 'interact' ? 2 : 1) : a.t === 'interact' || (own !== null && a.t === 'move') ? 6 : 2
    for (let k = 0; k < n; k++) {
      let s = tryOut(st, a, k, own, known)
      if (s && turn !== null) s = killerTurnOn(s, round ? undefined : turn)
      if (s) samples.push({ v: score(s, killer, known), step: s.step.t })
    }
    // a tiny nudge so equal choices aren't always the first one
    const v = samples.length ? samples.reduce((t, x) => t + x.v, 0) / samples.length + ((st.rng >>> (i % 24)) & 7) * 0.01 : null
    return { a, v, samples }
  })
}

/** The best of `acts` for this side. */
function bestTried(st: GameState, acts: Action[], killer: boolean): Action {
  let best = acts[0]
  let bestV = -Infinity
  for (const { a, v } of tried(st, acts, killer)) if (v !== null && v > bestV) (bestV = v), (best = a)
  return best
}

// ---------- planning ----------

/** Rooms a card takes someone to from `room` (Wait: nowhere; none: the move fails). */
function survivorDests(st: GameState, s: number, card: MoveCard): string[] {
  if (card === 'wait' || isDirect(card)) return []
  return survivorMoves(st, s, card).map((m) => m.to)
}

function withSurvivorAt(st: GameState, s: number, room: string): GameState {
  return { ...st, survivors: st.survivors.map((sv, i) => (i === s ? { ...sv, room } : sv)) }
}

/** How good a card looks for survivor `s`: the best room it takes them to (a failed move costs the turn's interaction). */
function survivorCard(st: GameState, s: number, card: MoveCard, known: Set<string>): number {
  const dests = survivorDests(st, s, card)
  if (!dests.length) return survivorPlace(st, known) - FAILED_MOVE
  return Math.max(...dests.map((r) => survivorPlace(withSurvivorAt(st, s, r), known)))
}

/**
 * One of the near-best: a choice the killer can't read off. Choices within `slack` of the best
 * are equally likely, by a draw of the bot's own (not the game's dice).
 */
function nearBest<T>(st: GameState, scored: { v: number; x: T }[], slack: number, salt: number): T {
  const top = Math.max(...scored.map((c) => c.v))
  const close = scored.filter((c) => c.v >= top - slack)
  const draw = (Math.imul(st.rng ^ (salt * 0x27d4eb2d), 0x165667b1) >>> 0) % close.length
  return close[draw].x
}

/** How far below the best a survivor's plan may be and still be chosen. */
const PLAN_SLACK = 5

/** A survivor's card and the room it would take them to (`failed`: no path: they stay, and lose the turn's interaction). */
interface PlanOption {
  card: MoveCard
  room: string
  failed: boolean
}

/** What each card in hand can do for survivor `s`: their best few, by where it leaves them alone. */
function planOptions(st: GameState, s: number, pool: MoveCard[], known: Set<string>): PlanOption[] {
  const sv = st.survivors[s]
  // a card that goes nowhere keeps them where they are, with nothing to do there: only for someone
  // wounded waiting for a healer, and never with the killer two moves away (standing still there
  // is how they get caught)
  const mayStay = sv.wounded && (threat(st).get(sv.room) ?? FAR) > 2
  const out: PlanOption[] = []
  const stuck: PlanOption[] = []
  for (const card of new Set(pool)) {
    if (card === 'wait') continue
    const dests = survivorDests(st, s, card)
    if (!dests.length) (mayStay ? out : stuck).push({ card, room: sv.room, failed: true })
    for (const room of dests) out.push({ card, room, failed: false })
  }
  // every card goes nowhere: one of them it is
  if (!out.length) out.push(...stuck)
  // a few per survivor keep the team's combinations few
  const v = (o: PlanOption) => survivorPlace(withSurvivorAt(st, s, o.room), known) - (o.failed ? FAILED_MOVE : 0)
  return out.sort((a, b) => v(b) - v(a)).slice(0, 4)
}

/** What a card that goes nowhere costs: the turn's interaction, and a sitting target. */
const FAILED_MOVE = 25

/**
 * The team's plan: every bot survivor's card at once, so they meet where it helps. Each way of
 * sharing the cards is scored by where it leaves the whole team: someone wounded meets someone who
 * can heal them (a teammate still able to act there), nobody walks past the other on the way. A
 * wounded survivor may even play a card that goes nowhere, to stay put for the healer to come.
 * `hands`: the survivor hands the bots plan (the people's survivors stay where they are).
 */
function teamPlan(st: GameState, hands: number[], salt: number): (MoveCard | null)[] {
  const plans = teamPlans(st, hands, true)
  if (!plans.length) return [null, null, null, null]
  return nearBest(st, plans, PLAN_SLACK * plans[0].n, salt)
}

/**
 * Every way the survivors of `hands` could share their cards, each scored for the team, with
 * where it leaves them (`at`) and how many it plans for (`n`). `drafts`: the survivors' own
 * planning, where the cards already set count. Otherwise it is the killer's view: a card set face
 * up (the Clown's Tonic, Stridor) is known, and one set face down is one of the cards its hand
 * held (the ones left, and those set face down from it): as if still to choose.
 */
function teamPlans(st: GameState, hands: number[], drafts: boolean): { v: number; x: (MoveCard | null)[]; at: GameState; n: number }[] {
  const known = knownProps(st)
  const set: (MoveCard | null)[] = drafts ? (st.planDraft ?? []) : st.survivors.map((sv) => (sv.planned !== null && sv.plannedRevealed && sv.status !== 'hooked' ? sv.planned : null))
  // the cards known to be set (online drafts, a hand at a time; to the killer, those face up):
  // those survivors counted where theirs take them
  let base = st
  set.forEach((c, i) => {
    if (!c) return
    const dests = survivorDests(st, i, c)
    if (dests.length) base = withSurvivorAt(base, i, dests.reduce((a, b) => (survivorPlace(withSurvivorAt(st, i, b), known) > survivorPlace(withSurvivorAt(st, i, a), known) ? b : a)))
  })
  const facedown = (i: number) => !drafts && st.survivors[i].planned !== null && !st.survivors[i].plannedRevealed
  const who = st.survivors.flatMap((sv, i) => (hands.includes(sv.hand) && sv.status !== 'hooked' && (sv.planned === null || facedown(i)) && !set[i] ? [i] : []))
  const pools = new Map<number, MoveCard[]>(
    hands.map((h) => [
      h,
      [...st.survivorHands[h], ...st.survivors.flatMap((sv, i) => (sv.hand === h && facedown(i) ? [sv.planned!] : []))].filter((c) => c !== 'wait'),
    ]),
  )
  const opts = new Map(who.map((s) => [s, planOptions(st, s, pools.get(st.survivors[s].hand) ?? [], known)]))
  const plans: { v: number; x: (MoveCard | null)[]; at: GameState; n: number }[] = []
  const chosen: PlanOption[] = []
  const pick = (k: number) => {
    if (k === who.length) {
      let at = base
      who.forEach((s, j) => (at = withSurvivorAt(at, s, chosen[j].room)))
      let v = survivorPlace(at, known) - FAILED_MOVE * chosen.filter((o) => o.failed).length
      // a wounded survivor with a teammate who can act in the same room: a heal this round
      const acts = (i: number) => {
        const j = who.indexOf(i)
        return j < 0 || !chosen[j].failed
      }
      at.survivors.forEach((sv, i) => {
        if (sv.status !== 'board' || !sv.wounded) return
        if (at.survivors.some((o, h) => h !== i && o.status === 'board' && o.room === sv.room && acts(h))) v += 22
      })
      const cards: (MoveCard | null)[] = [null, null, null, null]
      who.forEach((s, j) => (cards[s] = chosen[j].card))
      return void plans.push({ v, x: cards, at, n: who.length })
    }
    const s = who[k]
    const pool = pools.get(st.survivors[s].hand)!
    for (const o of opts.get(s) ?? []) {
      // a hand shared between survivors: a card goes to one of them
      const i = pool.indexOf(o.card)
      if (i < 0) continue
      pool.splice(i, 1)
      chosen.push(o)
      pick(k + 1)
      chosen.pop()
      pool.splice(i, 0, o.card)
    }
  }
  pick(0)
  return plans
}

/**
 * The cards for one hand's survivors still to plan. With other hands played by bots too, the plan
 * is the team's (`teamPlan`): the same for each, as every bot hand works it out alike.
 */
function planHand(st: GameState, hand: number): (MoveCard | null)[] {
  const bots = st.bots ?? []
  const hands = [...new Set(st.survivors.map((sv) => sv.hand))].filter((h) => h === hand || bots.includes(st.handPlayers[h]))
  const plan = teamPlan(st, hands, hands.length > 1 ? 1 : hand + 1)
  return plan.map((c, i) => (st.survivors[i].hand === hand ? c : null))
}

/** One survivor's card from `cards`: one of the best. */
function survivorPick(st: GameState, s: number, cards: MoveCard[]): MoveCard {
  const known = knownProps(st)
  return nearBest(
    st,
    [...new Set(cards)].filter((c) => c !== 'wait').map((c) => ({ v: survivorCard(st, s, c, known), x: c })),
    PLAN_SLACK,
    s + 11,
  )
}

/** Rooms the killer reaches with `card` from `room` (Wait: stays; none: the move fails and he stays). */
function killerDests(st: GameState, room: string, card: MoveCard): { to: string[]; failed: boolean } {
  if (card === 'wait') return { to: [room], failed: false }
  if (isDirect(card)) return { to: [directRoom(st, card)], failed: false }
  const to = killerMoves({ ...st, killer: { ...st.killer, room } }, card).map((m) => m.to)
  return to.length ? { to, failed: false } : { to: [room], failed: true }
}

/** How many of the survivors' likely plans the killer weighs. */
const LIKELY_PLANS = 20

/**
 * Where the survivors are likely to be when he moves (they act first): the plans a team would
 * make with the cards left in their hands (no secret at the table; the cards they chose are), the
 * near-best few of them, as they pick among those. Not the one they'll play: he weighs them all.
 */
function likelyTeams(st: GameState): GameState[] {
  const hands = [...new Set(st.survivors.map((sv) => sv.hand))]
  const plans = teamPlans(st, hands, false)
  if (!plans.length) return [st]
  const top = Math.max(...plans.map((p) => p.v))
  return plans
    .filter((p) => p.v >= top - PLAN_SLACK * p.n)
    .sort((a, b) => b.v - a.v)
    .slice(0, LIKELY_PLANS)
    .map((p) => p.at)
}

/** The killer's cards: each order of them scored by the rooms it takes him through, against where the survivors will likely be. */
function planKiller(st: GameState): MoveCard[] {
  const plans = legalActions({ ...st, step: { t: 'planKiller' } }).flatMap((a) => (a.t === 'planKiller' ? [a.cards] : []))
  const known = knownProps(st)
  const teams = likelyTeams(st)
  // how good a room is for him, on average over where the survivors may go (where they stand now
  // is where they won't be: they move first)
  const memo = new Map<string, number>()
  const at = (room: string) => {
    let v = memo.get(room)
    if (v === undefined) {
      v = teams.reduce((t, team) => t + killerPlace({ ...team, killer: { ...team.killer, room } }, known), 0) / teams.length
      memo.set(room, v)
    }
    return v
  }
  const walk = (room: string, cards: MoveCard[]): number => {
    if (!cards.length) return 0
    // a card with nowhere to go is a Wait without the turn's interaction: at 6 the bots still
    // planned them, a room they liked to stay in outweighing it
    const { to, failed } = killerDests(st, room, cards[0])
    return Math.max(...to.map((r) => at(r) - (failed ? FAILED_MOVE : 0) + 0.8 * walk(r, cards.slice(1))))
  }
  // The Unknown: each card is played by its own Unknown, from where that one stands
  const unknowns = st.killer.unknowns ? unknownRooms(st) : null
  const each = (cards: MoveCard[]) => cards.reduce((t, c, i) => t + walk(unknowns![i] ?? st.killer.room, [c]), 0)
  let best = plans[0]
  let bestV = -Infinity
  plans.forEach((cards, i) => {
    const v = (unknowns ? each(cards) : walk(st.killer.room, cards)) + ((st.rng >>> (i % 24)) & 7) * 0.01
    if (v > bestV) (bestV = v), (best = cards)
  })
  return best
}

// ---------- the bot's move ----------

/**
 * The bot's move for `player` (1 = the killer), or null when the game waits on nobody it plays.
 * Online each player sends their own moves: planning a hand at a time (`planHand`), the killer's
 * cards alongside (`planKiller`).
 */
export function botMove(st: GameState, player: number): Action | null {
  if (st.phase === 'over' || !actorsOf(st).includes(player)) return null
  const killer = player === KILLER_PLAYER
  const step = st.step

  // planning: the killer's cards, or this player's hands
  if (step.t === 'planKiller' || (step.t === 'planSurvivors' && killer)) return killer ? { t: 'planKiller', cards: planKiller(st) } : null
  if (step.t === 'planSurvivors') {
    if (twoPlayer(st)) {
      const s = nextToPlan(st)
      return s === null ? null : { t: 'planNext', card: survivorPick(st, s, st.survivorHands[0]) }
    }
    const hand = handsToPlan(st).find((h) => st.handPlayers[h] === player)
    return hand === undefined ? null : { t: 'planHand', hand, cards: planHand(st, hand) }
  }
  if (step.t === 'planStridor') return { t: 'planStridor', card: survivorPick(st, step.s, st.survivorHands[st.survivors[step.s].hand]) }

  // Perks are left alone, and a key's re-roll. A perk offered is declined for the round. An item
  // is used when trying it shows it helps (a toolbox's repair, a medkit's heal). With the gates
  // powered, a generator isn't repaired: it does nothing.
  const powered = gatesPowered(st)
  const acts = legalActions(st).filter(
    (a) => mayAct(st, player, a) && a.t !== 'reroll' && !(a.t === 'perk' && a.use) && !(powered && a.t === 'interact' && a.i.k === 'repair'),
  )
  if (!acts.length) return legalActions(st).find((a) => mayAct(st, player, a)) ?? null
  if (step.t === 'offer') return acts.find((a) => a.t === 'perk' && a.quiet) ?? acts[0]
  // the Redeemer's card is face down: a blind guess
  if (step.t === 'redeemerGuess') return blindGuess(st, acts) ?? acts[0]
  // a roll another survivor could change: this one lets it be
  const pass = acts.find((a) => a.t === 'passRoll')
  if (pass && !acts.some((a) => a.t === 'acceptRoll')) return pass
  if (acts.length === 1) return acts[0]
  // a prop to turn face up: by its colour, in the order the rulebook gives each side
  if (step.t === 'revealProp' || step.t === 'setupReveal') return revealPick(st, acts, killer)
  // a survivor's bonus turn costs a card for the round: taken when a card leads to something better
  if (step.t === 'bonusOffer') return bonusPick(st, step.s, knownProps(st)) ?? acts.find((a) => a.t === 'declineBonus') ?? acts[0]
  if (step.t === 'killerBonusOffer') return killerBonusPick(st, acts)
  return bestTried(st, acts, killer)
}

/**
 * The killer's bonus turn (4 ▲ for a third card, or Slipstream's for free): each card played on
 * through the whole turn it gives — the move, then what he does there — against stopping now.
 * Tried only up to the bonus, it never looked worth it: 4 ▲ gone, nothing done yet.
 */
function killerBonusPick(st: GameState, acts: Action[]): Action {
  const known = knownProps(st)
  let best = acts[0]
  let bestV = -Infinity
  for (const [i, a] of acts.entries()) {
    let total = 0
    let n = 0
    for (let k = 0; k < BONUS_TRIES; k++) {
      // a copy with its own dice: the real ones stay unknown
      let s: GameState | null
      try {
        s = apply({ ...st, rng: reseed(st, 40 + k) }, a)
      } catch {
        continue
      }
      s = killerTurnOn(s)
      if (s) (total += score(s, true, known)), n++
    }
    const v = n ? total / n + ((st.rng >>> (i % 24)) & 7) * 0.01 : -Infinity
    if (v > bestV) (bestV = v), (best = a)
  }
  return best
}

/** How many times each bonus card is played out (its turn rolls dice). */
const BONUS_TRIES = 3

/** Set while a killer's turn is being played on: the choices inside it aren't played on again. */
let playingOn = false

/**
 * The killer's turn played on to its end (`turn`: only that card's turn; unset: all he has left):
 * his own decisions each his best tried one (no deeper), the rest plainly (rolls, reveals, offers,
 * reactions). Stops at anyone else's real decision.
 */
function killerTurnOn(s: GameState, turn?: number): GameState | null {
  const was = playingOn
  playingOn = true
  try {
    for (let i = 0; i < (turn === undefined ? 90 : 30) && s.phase !== 'over'; i++) {
      const step = s.step
      if (FORCED.has(step.t)) {
        const f = forced(s)
        if (!f) break
        s = apply(s, f)
        continue
      }
      // Slipstream's bonus turn is his to take: the card to the best room he knows of (each card
      // played out in full here took a decision up to 1.5 s), played on as well
      if (step.t === 'killerBonusOffer' && step.free && turn === undefined) {
        const known = knownProps(s)
        const room = (card: MoveCard) => {
          const { to, failed } = killerDests(s, s.killer.room, card)
          return Math.max(...to.map((r) => killerPlace({ ...s, killer: { ...s.killer, room: r } }, known))) - (failed ? FAILED_MOVE : 0)
        }
        const cards = legalActions(s).flatMap((a) => (a.t === 'bonus' ? [a] : []))
        if (!cards.length) break
        s = apply(s, cards.reduce((b, a) => (room(a.card) > room(b.card) ? a : b)))
        continue
      }
      // his turn is over: the next card's turn, the next round's planning, or someone else's move
      if (step.t === 'planKiller' || step.t === 'planSurvivors' || step.t === 'killerBonusOffer') break
      if (turn !== undefined && 'turn' in step && step.turn !== turn) break
      const who = actorsOf(s)
      if (who.length !== 1 || who[0] !== KILLER_PLAYER) break
      const acts = legalActions(s).filter((a) => mayAct(s, KILLER_PLAYER, a) && a.t !== 'reroll' && !(a.t === 'perk' && a.use))
      if (!acts.length) break
      s = apply(s, acts.length === 1 ? acts[0] : bestTried(s, acts, true))
    }
  } catch {
    return null
  } finally {
    playingOn = was
  }
  return s
}

/**
 * Which face-down prop to turn up: its colour shows, its kind doesn't. Survivors look for the
 * generators first, as the rulebook's reveal order has it: objective (yellow), survival (blue),
 * altruism (green), boldness (red); the killer for hooks: boldness, altruism, objective, survival.
 */
const REVEAL_ORDER = {
  survivor: ['objective', 'survival', 'altruism', 'boldness'],
  killer: ['boldness', 'altruism', 'objective', 'survival'],
} as const
/** A survivor's, with the killer close. */
const REVEAL_IN_DANGER = ['altruism', 'survival', 'objective', 'boldness'] as const

function revealPick(st: GameState, acts: Action[], killer: boolean): Action {
  // with the killer a move away (two, for someone wounded), a survivor looks for what saves them
  // first: altruism (a pallet to drop in his way, a crow's bonus turn to get away), then survival (a
  // locker, a chest's medkit). Two moves away was danger for everyone: nearly always so, and the
  // generators stayed face down while the bots turned up crows.
  const step = st.step
  const room = step.t === 'revealProp' ? step.room : null
  const who = step.t === 'revealProp' && typeof step.who === 'number' ? st.survivors[step.who] : null
  const danger = !killer && room !== null && (threat(st).get(room) ?? FAR) <= (who?.wounded ? 2 : 1)
  const order: readonly string[] = danger ? REVEAL_IN_DANGER : REVEAL_ORDER[killer ? 'killer' : 'survivor']
  const rank = (a: Action) => {
    const id = a.t === 'reveal' || a.t === 'setupReveal' ? a.prop : null
    const p = id ? st.props.find((x) => x.id === id) : undefined
    return p ? order.indexOf(p.category) : order.length
  }
  return acts.reduce((best, a) => (rank(a) < rank(best) ? a : best))
}

/** The player the game waits on first (for a game the bots play through on their own). */
export function nextActor(st: GameState): number | null {
  return actorsOf(st)[0] ?? null
}
