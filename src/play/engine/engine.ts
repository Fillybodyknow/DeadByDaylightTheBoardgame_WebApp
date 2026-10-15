// Rules engine for the full game (Adept mode: the printed perks). A pure reducer:
// `apply(state, action)` returns a new state and never mutates its input.
//
// Flow: `state.step` is the input the game is waiting for. Handling an action may queue
// tasks (`state.queue`); they run in order until one of them needs input again. Page
// numbers refer to the rulebook (see docs/rules-th.md). Rulings for unclear rules are
// listed in play/README.md.

import { boards } from './boards'
import { PERKS, PRINTED_PERKS, type PerkId } from './perks'
import type {
  Action,
  BoardDef,
  Die,
  EntityPlace,
  GameEvent,
  GameState,
  ItemUse,
  KillerInteraction,
  MoveCard,
  PathDef,
  PathKind,
  PerkChoice,
  PerkOwner,
  PerkWindow,
  Prop,
  PropCategory,
  PropKind,
  RollContext,
  Step,
  SurvivorInteraction,
  SurvivorState,
  Task,
} from './types'

// ---------- constants (p.3–16) ----------

export const SURVIVOR_BP = { start: 2, max: 6 }
export const KILLER_BP = { start: 4, max: 12 }
export const SACRIFICE_TO_WIN = 8
export const GENERATORS_TO_POWER = 4
export const PROGRESS_MAX = 3
export const KILLER_BONUS_COST = 4
export const PHANTASM_TRAPS = 7

/** The killer's bonus turn costs 4 ▲; The Doctor's passive takes 1 off per survivor with Madness. */
export function bonusCost(st: GameState): number {
  if (st.killer.characterId !== 'doctor') return KILLER_BONUS_COST
  return Math.max(0, KILLER_BONUS_COST - st.survivors.filter((sv) => sv.madness).length)
}
export const BEAR_TRAPS = 4
export const SURVIVOR_CARDS: PathKind[] = ['sneak', 'sprint', 'crouch', 'vault']
export const KILLER_CARDS: MoveCard[] = ['sneak', 'sprint', 'crouch', 'vault', 'wait']

const PROPS_BY_CATEGORY: Record<PropCategory, [PropKind, number][]> = {
  objective: [['generator', 8], ['exitGate', 2]],
  survival: [['chest', 6], ['locker', 6]],
  altruism: [['crow', 6], ['pallet', 6]],
  boldness: [['hook', 5], ['totem', 5]],
}

/** Item deck (16 cards, counts from the asset pack). */
export const ITEM_COUNTS: Record<string, number> = {
  broken_key: 1,
  commodious_toolbox: 1,
  dull_key: 1,
  firecracker: 2,
  first_aid_kit: 3,
  flashlight: 3,
  map: 1,
  rainbow_map: 1,
  skeleton_key: 1,
  toolbox: 2,
}
export const KEY_BP: Record<string, number> = { broken_key: 1, dull_key: 2, skeleton_key: 3 }

/** Danger die image indexes that are a great success (the other 4 faces are failures, p.16). */
const DANGER_GREAT = [0, 2]

export const PROP_NAMES: Record<PropKind, string> = {
  generator: 'Generator',
  exitGate: 'Exit Gate',
  chest: 'Chest',
  locker: 'Locker',
  crow: 'Crow',
  pallet: 'Pallet',
  hook: 'Hook',
  totem: 'Hex Totem',
}

export const ITEM_NAMES: Record<string, string> = {
  broken_key: 'Broken Key',
  commodious_toolbox: 'Commodious Toolbox',
  dull_key: 'Dull Key',
  firecracker: 'Firecracker',
  first_aid_kit: 'First-Aid Kit',
  flashlight: 'Flashlight',
  map: 'Map',
  rainbow_map: 'Rainbow Map',
  skeleton_key: 'Skeleton Key',
  toolbox: 'Toolbox',
}

export const CARD_NAMES: Record<MoveCard, string> = {
  sneak: 'Sneak',
  sprint: 'Sprint',
  crouch: 'Crouch',
  vault: 'Vault',
  wait: 'Wait',
}

// ---------- setup ----------

export interface GameConfig {
  board: string
  survivors: { id: string; name: string }[]
  killer: { id: string; name: string }
  /** 3–5 players: with fewer than 5, one player controls two survivors sharing a hand (p.19). */
  players: 3 | 4 | 5
  seed: number
}

/** Survivor hand index for each of the 4 survivors, by player count (p.6, p.19). */
export function handLayout(players: 3 | 4 | 5): number[] {
  if (players === 5) return [0, 1, 2, 3]
  if (players === 4) return [0, 0, 1, 2]
  return [0, 0, 1, 1]
}

export function createGame(config: GameConfig): GameState {
  const board = boards[config.board]
  if (!board) throw new Error(`unknown board ${config.board}`)
  if (config.survivors.length !== 4) throw new Error('the game always has 4 survivors')
  const hands = handLayout(config.players)
  const handCount = Math.max(...hands) + 1

  const st: GameState = {
    version: 3,
    board: board.id,
    round: 1,
    phase: 'setup',
    step: { t: 'idle' },
    queue: [],
    survivors: config.survivors.map(
      (c, i): SurvivorState => ({
        characterId: c.id,
        name: c.name,
        room: board.rooms[0].id,
        wounded: false,
        woundedThisRound: false,
        status: 'board',
        bp: SURVIVOR_BP.start,
        item: null,
        sacrificeToken: true,
        hand: hands[i],
        planned: null,
        plannedRevealed: false,
        acted: false,
        madness: false,
        perks: [...(PRINTED_PERKS[c.id] ?? [])],
      }),
    ),
    survivorHands: Array.from({ length: handCount }, () => [...SURVIVOR_CARDS]),
    handPlayers: Array.from({ length: handCount }, (_, h) => h + 2),
    killer: {
      characterId: config.killer.id,
      name: config.killer.name,
      room: board.rooms[0].id,
      bp: KILLER_BP.start,
      hand: [...KILLER_CARDS],
      planned: [],
      revealedCount: 0,
      plannedShown: false,
      powerUsed: false,
      bonusUsed: false,
      trapsInSupply: BEAR_TRAPS,
      shown: [],
      perks: [...(PRINTED_PERKS[config.killer.id] ?? [])],
    },
    props: [],
    paths: Object.fromEntries(board.paths.map((p) => [p.id, { wall: p.wall, trap: false }])),
    entity: null,
    sacrifice: 0,
    firstPlayer: 0,
    itemDeck: [],
    activeSurvivor: null,
    canInteract: true,
    perksUsed: [],
    perksMuted: [],
    moveBlocked: false,
    rollMods: { danger: false, keep: false },
    stridor: null,
    phantasm: [],
    sealedCard: null,
    evadedWall: null,
    itemBlocked: false,
    redeemer: null,
    rng: config.seed >>> 0 || 1,
    log: [],
  }

  // Step 5: shuffle the props of each category face down into the rooms' slots.
  const pools = Object.fromEntries(
    (Object.keys(PROPS_BY_CATEGORY) as PropCategory[]).map((cat) => [
      cat,
      shuffle(st, PROPS_BY_CATEGORY[cat].flatMap(([kind, n]) => Array<PropKind>(n).fill(kind))),
    ]),
  ) as Record<PropCategory, PropKind[]>
  let n = 0
  for (const room of board.rooms)
    for (const cat of room.props) {
      const kind = pools[cat].pop()
      if (!kind) throw new Error(`not enough ${cat} props`)
      st.props.push({ id: `pr${++n}`, kind, category: cat, room: room.id, path: null, revealed: false, removed: false, progress: 0, done: false, occupant: null })
    }

  // Step 9: item deck.
  st.itemDeck = shuffle(st, Object.entries(ITEM_COUNTS).flatMap(([id, c]) => Array<string>(c).fill(id)))

  // Step 2: first player marker.
  st.firstPlayer = Math.floor(random(st) * 4)

  // Step 11: every mini rolls a skill check die for its start room.
  const startRoom = (face: number) => board.rooms.find((r) => r.startFace === face)!.id
  st.survivors.forEach((sv) => {
    const face = rollFace(st)
    sv.room = startRoom(face)
    log(st, `${sv.name} ทอยได้ ${face} เริ่มที่ ${roomName(st, sv.room)}`, st.survivors.indexOf(sv))
  })
  const kf = rollFace(st)
  st.killer.room = startRoom(kf)
  log(st, `${st.killer.name} ทอยได้ ${kf} เริ่มที่ ${roomName(st, st.killer.room)}`, 'killer')

  // Step 5 (cont.): each survivor, in turn order, reveals one prop anywhere.
  st.step = { t: 'setupReveal', s: st.firstPlayer }
  return st
}

// ---------- RNG (mulberry32, kept in the state so games replay exactly) ----------

function random(st: GameState): number {
  let t = (st.rng = (st.rng + 0x6d2b79f5) >>> 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function shuffle<T>(st: GameState, list: T[]): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(st) * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function rollFace(st: GameState): number {
  return Math.floor(random(st) * 6)
}

// ---------- queries ----------

export function boardOf(st: GameState): BoardDef {
  return boards[st.board]
}

export function roomName(st: GameState, room: string): string {
  return boardOf(st).rooms.find((r) => r.id === room)?.name ?? room
}

export function pathDef(st: GameState, id: string): PathDef {
  const p = boardOf(st).paths.find((x) => x.id === id)
  if (!p) throw new Error(`unknown path ${id}`)
  return p
}

/** Paths leaving `room` that can be travelled (vault paths only along the arrow). */
function exits(st: GameState, room: string, kind: PathKind | 'any'): { path: PathDef; to: string }[] {
  const out: { path: PathDef; to: string }[] = []
  for (const p of boardOf(st).paths) {
    if (kind !== 'any' && p.kind !== kind) continue
    if (p.a === room) out.push({ path: p, to: p.b })
    else if (p.b === room && p.kind !== 'vault') out.push({ path: p, to: p.a })
  }
  return out
}

/** Paths touching `room` in either direction ("connected", p.16). */
export function touchingPaths(st: GameState, room: string): PathDef[] {
  return boardOf(st).paths.filter((p) => p.a === room || p.b === room)
}

export function palletOn(st: GameState, path: string): Prop | undefined {
  return st.props.find((p) => p.path === path && !p.removed)
}

/** Props standing in a room (not removed, not on a path, not a repaired generator). */
export function propsIn(st: GameState, room: string): Prop[] {
  return st.props.filter((p) => p.room === room && !p.removed && !p.done)
}

function entityOn(st: GameState, place: { prop: string } | { path: string }): boolean {
  const e = st.entity
  if (!e) return false
  return 'prop' in place ? 'prop' in e && e.prop === place.prop : 'path' in e && e.path === place.path
}

/** A path with nothing on it: no wall, pallet, bear trap or entity token. */
function pathFree(st: GameState, path: string): boolean {
  const ps = st.paths[path]
  return !ps.wall && !ps.trap && !palletOn(st, path) && !entityOn(st, { path }) && st.evadedWall !== path
}

export function gatesPowered(st: GameState): boolean {
  return st.props.filter((p) => p.kind === 'generator' && p.done).length >= GENERATORS_TO_POWER
}

export function generatorsDone(st: GameState): number {
  return st.props.filter((p) => p.kind === 'generator' && p.done).length
}

/** Survivor order for this round: from the first player marker, clockwise (p.8). */
export function turnOrder(st: GameState): number[] {
  return [0, 1, 2, 3].map((i) => (st.firstPlayer + i) % 4)
}

function onBoardIn(st: GameState, room: string): number[] {
  return st.survivors.flatMap((sv, i) => (sv.status === 'board' && sv.room === room ? [i] : []))
}

function usableHook(st: GameState, room: string): Prop | undefined {
  return propsIn(st, room).find((p) => p.kind === 'hook' && p.revealed && p.occupant === null && !entityOn(st, { prop: p.id }))
}

export function isFailure(d: Die): boolean {
  return d.kind === 'skill' ? d.face === 0 : !DANGER_GREAT.includes(d.face)
}

export function isGreat(d: Die): boolean {
  return d.kind === 'skill' ? d.face === 5 : DANGER_GREAT.includes(d.face)
}

/** Counts as a success: not a failure, or a failure Iron Will turned around. */
export function succeeded(d: Die): boolean {
  return !isFailure(d) || d.asSuccess === true
}

// ---------- legal options (used by the UI and validated in apply) ----------

/** Where a survivor can go with a movement card: walls block survivors (p.13). */
export function survivorMoves(st: GameState, s: number, card: PathKind): { path: PathDef; to: string }[] {
  return exits(st, st.survivors[s].room, card).filter((e) => !st.paths[e.path.id].wall)
}

/** "Move along any path" (rescue, p.13): any colour, vault still one-way, walls block. */
export function anyMoves(st: GameState, s: number): { path: PathDef; to: string }[] {
  return exits(st, st.survivors[s].room, 'any').filter((e) => !st.paths[e.path.id].wall)
}

/** The killer breaks walls and pallets (p.14), so every path of the colour is open. */
export function killerMoves(st: GameState, card: PathKind): { path: PathDef; to: string }[] {
  return exits(st, st.killer.room, card)
}

/** While carrying: any path, but not over pallets or through walls (p.15). */
export function carryMoves(st: GameState): { path: PathDef; to: string }[] {
  return exits(st, st.killer.room, 'any').filter((e) => !st.paths[e.path.id].wall && !palletOn(st, e.path.id))
}

export function survivorInteractions(st: GameState, s: number): SurvivorInteraction[] {
  const sv = st.survivors[s]
  if (sv.status !== 'board') return []
  const step = st.step
  const exclude = step.t === 'survivorInteract' && step.s === s ? step.exclude : undefined
  return allSurvivorInteractions(st, s).filter((i) => !exclude || !('prop' in i) || i.prop !== exclude)
}

function allSurvivorInteractions(st: GameState, s: number): SurvivorInteraction[] {
  const sv = st.survivors[s]
  const out: SurvivorInteraction[] = []
  for (const p of propsIn(st, sv.room)) {
    if (!p.revealed) continue
    switch (p.kind) {
      case 'chest':
        out.push({ k: 'rummage', prop: p.id })
        break
      case 'locker':
        if (p.occupant === null) out.push({ k: 'hide', prop: p.id })
        break
      case 'crow':
        out.push({ k: 'crow', prop: p.id })
        // Calm Spirit (Jake): as an interaction, move the crow to any room.
        if (perkReady(st, s, 'calm_spirit')) for (const r of boardOf(st).rooms) if (r.id !== sv.room) out.push({ k: 'calmSpirit', prop: p.id, room: r.id })
        break
      case 'pallet':
        for (const path of touchingPaths(st, sv.room)) if (pathFree(st, path.id)) out.push({ k: 'dropPallet', prop: p.id, path: path.id })
        break
      case 'generator':
        out.push({ k: 'repair', prop: p.id })
        break
      case 'exitGate':
        if (gatesPowered(st)) out.push({ k: 'openGate', prop: p.id })
        break
      case 'hook':
        if (!entityOn(st, { prop: p.id })) out.push({ k: 'sabotage', prop: p.id })
        break
      case 'totem':
        out.push({ k: 'cleanse', prop: p.id })
        break
    }
  }
  for (const t of onBoardIn(st, sv.room)) if (t !== s && st.survivors[t].wounded) out.push({ k: 'heal', target: t })
  return out
}

export function killerInteractions(st: GameState): KillerInteraction[] {
  const k = st.killer
  const out: KillerInteraction[] = []
  for (const p of propsIn(st, k.room)) {
    if (!p.revealed) continue
    if (p.kind === 'locker' && p.occupant !== null) out.push({ k: 'search', prop: p.id })
    if (p.kind === 'crow') out.push({ k: 'scout', prop: p.id })
    // Damage needs no progress to remove (p.14); with none it still counts (Overcharge, Alert).
    if (p.kind === 'generator') out.push({ k: 'damage', prop: p.id })
    if (p.kind === 'totem') out.push({ k: 'venerate', prop: p.id })
  }
  for (const t of onBoardIn(st, k.room)) {
    const sv = st.survivors[t]
    if (!sv.wounded) out.push({ k: 'attack', target: t })
    else if (!sv.woundedThisRound) out.push({ k: 'pickUp', target: t })
  }
  out.push(...powerOptions(st))
  return out
}

/** The Trapper's Bear Trap: a connected path without pallet, wall or other component. */
export function trapPlacements(st: GameState): KillerInteraction[] {
  const k = st.killer
  if (k.characterId !== 'trapper') return []
  const out: KillerInteraction[] = []
  const placed = Object.keys(st.paths).filter((id) => st.paths[id].trap)
  for (const path of touchingPaths(st, k.room)) {
    if (!pathFree(st, path.id)) continue
    if (k.trapsInSupply > 0) out.push({ k: 'power', path: path.id })
    for (const r of placed) out.push({ k: 'power', path: path.id, remove: r })
  }
  return out
}

/** Survivor can act with items: not hidden, hooked or carried (p.12, p.15). */
function canUseItems(st: GameState, s: number): boolean {
  return st.survivors[s].status === 'board' && !['gameOver', 'reaction', 'keepItem', 'setupReveal', 'revealProp', 'offer', 'pickSurvivor', 'idle'].includes(st.step.t)
}

export function itemUses(st: GameState, s: number): ItemUse[] {
  const sv = st.survivors[s]
  if (!sv.item || !canUseItems(st, s)) return []
  const survivorTurn = st.phase === 'survivors' && st.activeSurvivor !== null
  const ownTurn = survivorTurn && st.activeSurvivor === s
  const gens = propsIn(st, sv.room).filter((p) => p.kind === 'generator' && p.revealed)
  const out: ItemUse[] = []
  switch (sv.item) {
    case 'broken_key':
    case 'dull_key':
    case 'skeleton_key':
      out.push({ k: 'bp' })
      break
    case 'toolbox':
      if (ownTurn) for (const g of gens) out.push({ k: 'generator', prop: g.id })
      break
    case 'commodious_toolbox':
      if (survivorTurn) for (const g of gens) out.push({ k: 'generator', prop: g.id })
      break
    case 'first_aid_kit':
      if (survivorTurn) for (const t of onBoardIn(st, sv.room)) if (st.survivors[t].wounded) out.push({ k: 'heal', target: t })
      break
    case 'firecracker':
      for (const p of touchingPaths(st, sv.room)) if (st.paths[p.id].wall) out.push({ k: 'wall', path: p.id })
      break
    case 'map':
      if (survivorTurn) out.push({ k: 'reveal', props: [] }, { k: 'draw' })
      break
    case 'rainbow_map':
      if (survivorTurn) out.push({ k: 'reveal', props: [] })
      if (survivorTurn && !st.killer.plannedShown) out.push({ k: 'showKiller' })
      break
  }
  return out
}

/** Survivors who may re-roll a die with a key (p.16; keys are "any time"). */
export function rerollers(st: GameState): number[] {
  if (st.step.t !== 'roll' || st.step.dice.every((d) => d.rerolled)) return []
  return st.survivors.flatMap((sv, i) => (sv.status === 'board' && sv.item && sv.item in KEY_BP ? [i] : []))
}

// ---------- apply ----------

class IllegalAction extends Error {}

export function apply(prev: GameState, action: Action): GameState {
  const st: GameState = structuredClone(prev)
  if (st.phase === 'over') throw new IllegalAction('game over')
  handle(st, action)
  run(st)
  return st
}

/** Like apply, but returns null instead of throwing for an illegal action. */
export function tryApply(prev: GameState, action: Action): GameState | null {
  try {
    return apply(prev, action)
  } catch (e) {
    if (e instanceof IllegalAction) return null
    throw e
  }
}

function fail(msg: string): never {
  throw new IllegalAction(msg)
}

function wait(st: GameState, step: Step) {
  if (st.phase !== 'over') st.step = step
}

function run(st: GameState) {
  while (st.step.t === 'idle') {
    const task = st.queue.shift()
    if (!task) fail('nothing to do')
    runTask(st, task)
  }
}

function log(st: GameState, text: string, who: LogWho, extra: { dice?: Die[]; ev?: GameEvent } = {}) {
  st.log.push({ round: st.round, text, who, ...extra })
}

/** An event with no log line (the log hides entries with empty text). */
function emit(st: GameState, ev: GameEvent, who: LogWho = 'game') {
  log(st, '', who, { ev })
}
type LogWho = number | 'killer' | 'game'

function handle(st: GameState, a: Action) {
  const step = st.step
  if (a.t === 'useItem') {
    // Work an item queues (a generator finishing) runs now; then the step it interrupted resumes.
    const before = st.queue.length
    useItem(st, a.s, a.use)
    if (st.queue.length > before && st.step === step) {
      st.queue.splice(st.queue.length - before, 0, { k: 'resume', step })
      st.step = { t: 'idle' }
    }
    return
  }
  if (a.t === 'reroll') return reroll(st, a.s, a.die)
  if (a.t === 'perk') return handlePerk(st, a)
  st.step = { t: 'idle' }

  switch (step.t) {
    case 'setupReveal': {
      if (a.t !== 'setupReveal') break
      const p = st.props.find((x) => x.id === a.prop)
      if (!p || p.revealed || p.room === null || !propsIn(st, p.room).includes(p)) fail('not a face-down prop')
      revealProp(st, p, step.s)
      const next = turnOrder(st).indexOf(step.s) + 1
      if (next < 4) wait(st, { t: 'setupReveal', s: turnOrder(st)[next] })
      else startPlanning(st)
      return
    }
    case 'planSurvivors': {
      if (a.t === 'planHand') {
        // collect this hand's cards; the planning ends with the last hand
        const draft = st.planDraft ?? [null, null, null, null]
        const mine = st.survivors.map((sv, i) => (sv.hand === a.hand && sv.status !== 'hooked' ? i : -1)).filter((i) => i >= 0)
        if (!mine.length) fail('no survivor of this hand plans')
        const pool = [...(st.survivorHands[a.hand] ?? [])]
        for (const i of mine) {
          const c = a.cards[i]
          if (!c || c === 'wait') fail(`${st.survivors[i].name} needs a card`)
          if (!pool.includes(c)) fail(`${CARD_NAMES[c]} is not in this hand`)
          pool.splice(pool.indexOf(c), 1)
          draft[i] = c
        }
        st.planDraft = draft
        if (st.survivors.some((sv, i) => sv.status !== 'hooked' && !draft[i])) return wait(st, { t: 'planSurvivors' })
        delete st.planDraft
        planSurvivors(st, draft)
      } else {
        if (a.t !== 'planSurvivors') break
        planSurvivors(st, a.cards)
      }
      // Stridor: that survivor's card is played face up.
      if (st.stridor !== null && st.survivors[st.stridor].planned) st.survivors[st.stridor].plannedRevealed = true
      wait(st, { t: 'planKiller' })
      return
    }
    case 'planKiller': {
      if (a.t !== 'planKiller') break
      const [l, r] = a.cards
      if (a.cards.length !== 2 || l === r || !st.killer.hand.includes(l) || !st.killer.hand.includes(r)) fail('pick 2 different cards')
      st.killer.planned = [l, r]
      st.killer.hand = st.killer.hand.filter((c) => c !== l && c !== r)
      log(st, 'วางแผนเสร็จ ทุกคนวางการ์ดคว่ำแล้ว', 'game')
      const first = turnOrder(st).find((i) => st.survivors[i].planned)
      st.queue.push({ k: 'trigger', w: { k: 'planningEnd' }, done: [] })
      st.phase = first === undefined ? 'killer' : 'survivors'
      st.queue.push(first === undefined ? { k: 'killerTurn', turn: 0 } : { k: 'survivorTurn', s: first })
      return
    }
    case 'revealProp': {
      if (a.t !== 'reveal') break
      const p = propsIn(st, step.room).find((x) => x.id === a.prop && !x.revealed) ?? fail('not a face-down prop in this room')
      revealProp(st, p, step.who)
      return
    }
    case 'survivorMove': {
      if (a.t !== 'move') break
      const m = survivorMoves(st, step.s, step.card).find((e) => e.path.id === a.path) ?? fail('cannot move there')
      const from = st.survivors[step.s].room
      moveSurvivor(st, step.s, m.path, m.to)
      // After the new room's reveal: Sprint Burst, Leader.
      trigger(st, { k: 'afterCardMove', s: step.s, from, to: m.to, path: m.path.id }, st.queue[1]?.k === 'roll' ? 2 : 1)
      return
    }
    case 'anyMove': {
      // House rule: after a rescue, staying in the room is allowed (see src/play/README.md).
      if (a.t === 'stop') {
        log(st, `${st.survivors[step.s].name} อยู่ห้องเดิม`, step.s)
        return
      }
      if (a.t !== 'move') break
      const m = anyMoves(st, step.s).find((e) => e.path.id === a.path) ?? fail('cannot move there')
      moveSurvivor(st, step.s, m.path, m.to)
      return
    }
    case 'survivorInteract': {
      if (a.t === 'endTurn') return
      if (a.t !== 'interact' || !step.canInteract) break
      const i = a.i as SurvivorInteraction
      if (!survivorInteractions(st, step.s).some((o) => same(o, i))) fail('not a legal interaction')
      survivorInteract(st, step.s, i)
      return
    }
    case 'bonusOffer': {
      if (a.t === 'declineBonus') return
      if (a.t !== 'bonus') break
      const hand = st.survivorHands[st.survivors[step.s].hand]
      if (a.card === 'wait' || !hand.includes(a.card)) fail('card not in hand')
      startBonusMove(st, step.s, a.card)
      return
    }
    case 'keepItem': {
      if (a.t !== 'keepItem') break
      const sv = st.survivors[step.s]
      if (a.keep === 'new') sv.item = step.drawn
      log(st, `${sv.name} เก็บ ${ITEM_NAMES[sv.item!]}`, step.s)
      return
    }
    case 'roll': {
      if (a.t !== 'acceptRoll') break
      if (!step.keep) return resolveRoll(st, step.ctx, step.dice)
      // Bond: keep one of the two dice; the killer gains ▲ if either failed (p.18).
      const kept = step.dice[a.die ?? -1] ?? fail('choose the die to keep')
      resolveRoll(st, step.ctx, [kept, ...step.dice.filter((d) => d !== kept)], step.dice.some((d) => !succeeded(d)) ? 1 : 0)
      return
    }
    case 'killerMove': {
      if (a.t !== 'move') break
      const m = killerMoves(st, step.card).find((e) => e.path.id === a.path) ?? fail('cannot move there')
      killerMove(st, a, m.path, m.to)
      return
    }
    case 'killerInteract': {
      if (a.t === 'endTurn') return
      if (a.t !== 'interact' || !step.canInteract) break
      const i = a.i as KillerInteraction
      const legal = killerInteractions(st).filter((o) => !step.powerOnly || isPower(o))
      if (!legal.some((o) => same(o, i))) fail('not a legal interaction')
      killerInteract(st, i, a.reacted === true, step.turn)
      return
    }
    case 'killerBonusOffer': {
      if (a.t === 'declineBonus') return queueCleanup(st)
      if (a.t !== 'bonus') break
      const k = st.killer
      if (!k.hand.includes(a.card)) fail('card not in hand')
      k.hand.splice(k.hand.indexOf(a.card), 1)
      k.planned.push(a.card)
      const cost = bonusCost(st)
      k.bp -= cost
      k.bonusUsed = true
      log(st, `${k.name} จ่าย ${cost} ▲ เล่น Bonus Turn`, 'killer')
      st.queue.push({ k: 'killerTurn', turn: 2 })
      return
    }
    case 'carryDice': {
      if (a.t === 'hang') return hang(st, step.s, usableHook(st, st.killer.room) ?? fail('no free hook here'))
      if (a.t !== 'carryDice') break
      if (!(a.n >= 1 && a.n <= 4)) fail('choose 1–4 dice')
      log(st, `${st.killer.name} เลือกทอย ${a.n} ลูก`, 'killer')
      startRoll(st, { k: 'carry', s: step.s }, a.n, 'skill')
      return
    }
    case 'carryMove': {
      if (a.t === 'stop') return carryEscape(st, step.s)
      if (a.t === 'hang') return hang(st, step.s, usableHook(st, st.killer.room) ?? fail('no free hook here'))
      if (a.t !== 'move') break
      const m = carryMoves(st).find((e) => e.path.id === a.path) ?? fail('cannot carry there')
      carryStep(st, step.s, step.steps, m.path.id, m.to)
      return
    }
    case 'reaction': {
      if (a.t !== 'react') break
      if (a.s === null) {
        // Nobody reacts: replay the killer's action without asking again.
        st.step = reactedStep(st, step)
        handle(st, { ...step.pending, reacted: true } as Action)
        return
      }
      if (!step.holders.includes(a.s)) fail('cannot react')
      const sv = st.survivors[a.s]
      emit(st, { k: 'item', s: a.s, item: sv.item! }, a.s)
      sv.item = null
      st.canInteract = false
      if (step.item === 'firecracker') log(st, `${sv.name} ใช้ Firecracker — ${st.killer.name} เข้าห้องไม่ได้ และเสียการ Interact`, a.s)
      else log(st, `${sv.name} ใช้ Flashlight — กัน Interaction ของ ${st.killer.name}`, a.s)
      return
    }
    case 'turnStart':
      if (a.t === 'continue') return
      break
    case 'sparkChoice': {
      if (a.t !== 'spark') break
      const sv = st.survivors[step.s]
      if (a.pay) {
        if (sv.bp < 1) fail('no ▲ to pay')
        sv.bp--
        log(st, `${sv.name} จ่าย 1 ▲ กัน Carter's Spark`, step.s)
      } else sparkHit(st, step.s)
      return sparkNext(st, step.rest)
    }
    case 'phantasmChoice': {
      if (a.t !== 'phantasm') break
      const k = st.killer
      if (!a.teleport) {
        // House rule: ▲ equal to the die (the card says "gain a ▲"); see play/README.md.
        gainKiller(st, step.face)
        log(st, `${k.name} รับ +${step.face} ▲ จาก Phantasm Trap`, 'killer')
        return
      }
      if (k.bp < step.face) fail('not enough ▲ to teleport')
      const i = a.i ?? null
      if (i && !phantasmInteractions(st, step.room).some((o) => same(o, i))) fail('not a legal interaction there')
      k.bp -= step.face
      log(st, `${k.name} จ่าย ${step.face} ▲ วาร์ปไป Phantasm Trap`, 'killer')
      killerEnter(st, '', step.room)
      // After the reveal and Quick & Quiet, interact with a survivor there.
      st.queue.splice(2, 0, { k: 'phantasmHit', i })
      return
    }
    case 'replaceCard': {
      if (a.t !== 'replace') break
      const sv = st.survivors[step.s]
      const hand = st.survivorHands[sv.hand]
      if (a.card === 'wait' || !hand.includes(a.card)) fail('card not in hand')
      hand.splice(hand.indexOf(a.card), 1)
      sv.planned = a.card
      log(st, `${sv.name} วางการ์ดใบใหม่ (คว่ำ)`, step.s)
      return
    }
    case 'pickSurvivor': {
      if (a.t !== 'pick' || !step.options.includes(a.s)) break
      wound(st, a.s, 'power', `${st.survivors[a.s].name} โดน Chainsaw — บาดเจ็บ`)
      return
    }
    case 'redeemerGuess': {
      if (a.t !== 'guess' || !KILLER_CARDS.includes(a.card)) break
      return redeemerGuess(st, step.s, a.card)
    }
    case 'offer':
    case 'gameOver':
    case 'idle':
      break
  }
  fail(`${a.t} is not allowed now (${step.t})`)
}

/** The step a reaction interrupted, so the pending action can be replayed. */
function reactedStep(st: GameState, step: Extract<Step, { t: 'reaction' }>): Step {
  const turn = st.killer.revealedCount - 1
  if (step.pending.t === 'move') return { t: 'killerMove', turn, card: st.killer.planned[turn] as PathKind }
  return { t: 'killerInteract', turn, canInteract: true, powerOnly: false }
}

function same(a: object, b: object): boolean {
  return JSON.stringify(a, Object.keys(a).sort()) === JSON.stringify(b, Object.keys(b).sort())
}

// ---------- tasks ----------

function runTask(st: GameState, task: Task) {
  switch (task.k) {
    case 'survivorTurn': {
      const sv = st.survivors[task.s]
      st.activeSurvivor = task.s
      sv.plannedRevealed = true
      sv.acted = true
      st.canInteract = true
      st.queue.unshift(
        { k: 'trigger', w: { k: 'turnBegin', s: task.s }, done: [] },
        { k: 'turnStart', s: task.s },
        { k: 'cardMove', s: task.s, card: sv.planned as PathKind },
        { k: 'survivorInteract', s: task.s },
        { k: 'trigger', w: { k: 'turnEnd', s: task.s }, done: [] },
        { k: 'endSurvivorTurn', s: task.s },
      )
      return
    }
    case 'turnStart':
      if (perkButtons({ ...st, step: { t: 'turnStart', s: task.s } }).length) wait(st, { t: 'turnStart', s: task.s })
      return
    case 'cardMove':
      st.queue.unshift({ k: 'trigger', w: { k: 'cardMove', s: task.s, card: task.card }, done: [] }, { k: 'doMove', s: task.s, card: task.card })
      return
    case 'doMove':
      if (st.moveBlocked) {
        st.moveBlocked = false
        st.canInteract = true
        log(st, `${st.survivors[task.s].name} เดินไม่ได้ (Huntress Lullaby)`, task.s)
        return
      }
      if (st.sealedCard === task.card) {
        st.canInteract = false
        log(st, `${st.survivors[task.s].name} เปิด ${CARD_NAMES[task.card]} แต่เดินไม่ได้ (The Third Seal) — เสียการ Interact`, task.s)
        return
      }
      startSurvivorMove(st, task.s, task.card)
      return
    case 'itemUse':
      if (st.itemBlocked) {
        st.itemBlocked = false
        const sv = st.survivors[task.s]
        log(st, `${sv.name} ทำ ${ITEM_NAMES[sv.item!]} เสียเปล่า (Overwhelming Presence)`, task.s)
        sv.item = null
        return
      }
      if (st.survivors[task.s].item) applyItem(st, task.s, task.use)
      return
    case 'phantasmHit':
      if (task.i) killerActs(st, task.i, null)
      return
    case 'killerDo':
      killerDo(st, task.i, task.turn)
      return
    case 'resolveRoll':
      finishRoll(st, task.ctx, task.dice, task.fails, true)
      return
    case 'trigger':
      runTrigger(st, task.w, task.done)
      return
    case 'plan':
      wait(st, { t: 'planSurvivors' })
      return
    case 'roll': {
      // Perks may have changed this skill check (danger die instead, two dice keep one).
      const mods = st.rollMods
      st.rollMods = { danger: false, keep: false }
      // The Doctor's passive: survivors with Madness roll the danger die for skill checks.
      const mad = SKILL_CHECKS.includes(task.ctx.k) && st.survivors[task.ctx.s].madness
      const ctx: RollContext = mods.retribution && task.ctx.k === 'cleanse' ? { ...task.ctx, retribution: true } : task.ctx
      startRoll(st, ctx, mods.keep ? 2 : task.n, mods.danger || mad ? 'danger' : task.kind, mods.keep)
      return
    }
    case 'resume':
      wait(st, task.step)
      return
    case 'chainsawHit':
      chainsawHit(st, task.room)
      return
    case 'survivorInteract': {
      const sv = st.survivors[task.s]
      if (sv.status !== 'board') return
      wait(st, { t: 'survivorInteract', s: task.s, canInteract: st.canInteract })
      return
    }
    case 'anyMove': {
      const sv = st.survivors[task.s]
      if (sv.status !== 'board' || anyMoves(st, task.s).length === 0) return
      wait(st, { t: 'anyMove', s: task.s })
      return
    }
    case 'endSurvivorTurn': {
      st.activeSurvivor = null
      if (st.evadedWall) {
        st.paths[st.evadedWall].wall = true
        log(st, 'กำแพงกลับเข้าที่ (Urban Evasion)', 'game')
        st.evadedWall = null
      }
      const order = turnOrder(st)
      const next = order.slice(order.indexOf(task.s) + 1).find((i) => st.survivors[i].planned && !st.survivors[i].acted)
      if (next !== undefined) st.queue.unshift({ k: 'survivorTurn', s: next })
      else {
        st.phase = 'killer'
        st.queue.unshift({ k: 'killerTurn', turn: 0 })
      }
      return
    }
    case 'killerTurn': {
      const k = st.killer
      // Zanshin Tactics comes at the start of the turn, before the card is revealed.
      if (!task.begun) {
        st.queue.unshift({ k: 'trigger', w: { k: 'killerTurnBegin', turn: task.turn }, done: [] }, { ...task, begun: true })
        return
      }
      const card = k.planned[task.turn]
      k.revealedCount = task.turn + 1
      st.canInteract = true
      st.queue.unshift({ k: 'killerInteract', turn: task.turn }, { k: 'endKillerTurn', turn: task.turn, extra: task.extra })
      if (card === 'wait') {
        log(st, `${k.name} เปิด Wait — อยู่กับที่`, 'killer')
        return
      }
      if (killerMoves(st, card).length === 0) {
        log(st, `${k.name} เปิด ${CARD_NAMES[card]} แต่ไม่มีเส้นทาง — เสียการ Interact`, 'killer')
        st.canInteract = false
        return
      }
      wait(st, { t: 'killerMove', turn: task.turn, card })
      return
    }
    case 'killerInteract': {
      wait(st, { t: 'killerInteract', turn: task.turn, canInteract: st.canInteract })
      return
    }
    case 'endKillerTurn': {
      const k = st.killer
      if (task.extra) return // Devour Hope's turn: cleanup is already queued
      if (task.turn === 0) st.queue.unshift({ k: 'killerTurn', turn: 1 })
      // Shadowborn placed a third card at the end of planning.
      else if (task.turn === 1 && k.planned.length > 2) st.queue.unshift({ k: 'killerTurn', turn: 2 })
      else if (task.turn === 1 && !k.bonusUsed && k.bp >= bonusCost(st) && k.hand.length > 0) wait(st, { t: 'killerBonusOffer' })
      else queueCleanup(st)
      return
    }
    case 'cleanup':
      cleanup(st)
      return
    case 'reveal':
      revealOnEnter(st, task.room, task.who)
      return
    case 'carryArrive':
      carryArrive(st, task.s, task.steps)
      return
  }
}

function startPlanning(st: GameState) {
  st.phase = 'planning'
  st.activeSurvivor = null
  // Stridor, Beast of Prey come before the cards are chosen.
  st.queue.unshift({ k: 'trigger', w: { k: 'planningStart' }, done: [] }, { k: 'plan' })
}

/** Cleanup, after Adrenaline's chance at its start. */
function queueCleanup(st: GameState) {
  st.queue.push({ k: 'trigger', w: { k: 'cleanupStart' }, done: [] }, { k: 'cleanup' })
}

function planSurvivors(st: GameState, cards: (MoveCard | null)[]) {
  if (cards.length !== 4) fail('one card per survivor')
  const hands = st.survivorHands.map((h) => [...h])
  st.survivors.forEach((sv, i) => {
    const c = cards[i]
    if (sv.status === 'hooked') {
      if (c !== null) fail('hooked survivors do not plan')
      return
    }
    if (!c || c === 'wait') fail(`${sv.name} needs a card`)
    const h = hands[sv.hand]
    if (!h.includes(c)) fail(`${CARD_NAMES[c]} is not in ${sv.name}'s hand`)
    h.splice(h.indexOf(c), 1)
  })
  st.survivorHands = hands
  st.survivors.forEach((sv, i) => {
    sv.planned = cards[i]
    sv.plannedRevealed = false
    sv.acted = false
  })
}

function startSurvivorMove(st: GameState, s: number, card: PathKind) {
  const sv = st.survivors[s]
  st.canInteract = true
  if (sv.status === 'locker') leaveLocker(st, s)
  if (survivorMoves(st, s, card).length === 0) {
    log(st, `${sv.name} เปิด ${CARD_NAMES[card]} แต่ไปไม่ได้ — เสียการ Interact`, s)
    st.canInteract = false
    return
  }
  log(st, `${sv.name} เปิด ${CARD_NAMES[card]}`, s)
  wait(st, { t: 'survivorMove', s, card })
}

function leaveLocker(st: GameState, s: number) {
  const locker = st.props.find((p) => p.kind === 'locker' && p.occupant === s)
  if (locker) locker.occupant = null
  st.survivors[s].status = 'board'
}

function moveSurvivor(st: GameState, s: number, path: PathDef, to: string) {
  const sv = st.survivors[s]
  const from = sv.room
  sv.room = to
  log(st, `${sv.name} → ${roomName(st, to)}`, s, { ev: { k: 'move', who: s, from, to, path: path.id } })
  // The trap springs on the path, then the survivor reveals a prop in the new room.
  st.queue.unshift({ k: 'reveal', room: to, who: s })
  let after = 1
  if (st.phantasm.includes(to) && sv.status === 'board') {
    st.phantasm = st.phantasm.filter((r) => r !== to)
    log(st, `${sv.name} เดินเข้า Phantasm Trap — ทอยลูกเต๋า`, s)
    st.queue.splice(1, 0, { k: 'roll', ctx: { k: 'phantasm', s, room: to }, n: 1, kind: 'skill' })
    after = 2
  }
  // For the People, once the room is revealed.
  if (sv.status === 'board') trigger(st, { k: 'entered', s }, after)
  if (st.paths[path.id].trap) {
    log(st, `${sv.name} เดินผ่าน Bear Trap — ทอย Danger Die`, s)
    startRoll(st, { k: 'trap', s, path: path.id }, 1, 'danger')
  }
}

/** Entering a space reveals one face-down prop (p.8); the player picks which tile. */
function revealOnEnter(st: GameState, room: string, who: number | 'killer') {
  const hidden = propsIn(st, room).filter((p) => !p.revealed)
  if (hidden.length === 0) return
  // Tiles of one colour are indistinguishable face down, so only a choice of colour matters.
  if (new Set(hidden.map((p) => p.category)).size === 1) return revealProp(st, hidden[0], who)
  wait(st, { t: 'revealProp', who, room })
}

function revealProp(st: GameState, p: Prop, who: LogWho) {
  p.revealed = true
  log(st, `เปิด ${PROP_NAMES[p.kind]} ที่ ${roomName(st, p.room!)}`, who, { ev: { k: 'reveal', prop: p.id, kind: p.kind, room: p.room! } })
}

function survivorInteract(st: GameState, s: number, i: SurvivorInteraction) {
  const sv = st.survivors[s]
  const prop = 'prop' in i ? st.props.find((p) => p.id === i.prop)! : null
  switch (i.k) {
    case 'rummage': {
      prop!.removed = true
      trigger(st, { k: 'afterRummage', s, prop: prop!.id })
      const drawn = st.itemDeck.shift()
      if (!drawn) {
        log(st, `${sv.name} ค้น Chest แต่ไม่มี item เหลือ`, s)
        return
      }
      log(st, `${sv.name} ค้น Chest ได้ ${ITEM_NAMES[drawn]}`, s)
      if (sv.item) wait(st, { t: 'keepItem', s, drawn })
      else sv.item = drawn
      return
    }
    case 'hide':
      prop!.occupant = s
      sv.status = 'locker'
      log(st, `${sv.name} ซ่อนใน Locker`, s)
      trigger(st, { k: 'afterPalletLocker', s, prop: prop!.id })
      return
    case 'crow':
      gainKiller(st, 1)
      log(st, `${sv.name} ไล่ Crow — ${st.killer.name} +1 ▲`, s)
      if (st.survivorHands[sv.hand].length > 0) wait(st, { t: 'bonusOffer', s })
      return
    case 'calmSpirit':
      payPerk(st, s, 'calm_spirit', `ย้าย Crow ไป ${roomName(st, i.room)}`)
      prop!.room = i.room
      return
    case 'dropPallet':
      prop!.room = null
      prop!.path = i.path
      log(st, `${sv.name} ทิ้ง Pallet บนเส้นทาง`, s, { ev: { k: 'palletDrop', s, path: i.path } })
      trigger(st, { k: 'afterPalletLocker', s, prop: prop!.id })
      return
    case 'repair':
      return startCheck(st, { k: 'repair', s, prop: i.prop })
    case 'openGate':
      return startCheck(st, { k: 'openGate', s, prop: i.prop })
    case 'cleanse':
      return startCheck(st, { k: 'cleanse', s, prop: i.prop })
    case 'heal':
      return startCheck(st, { k: 'heal', s, target: i.target })
    case 'sabotage': {
      placeEntity(st, { prop: prop!.id })
      const hooked = prop!.occupant
      if (hooked === null) {
        log(st, `${sv.name} วาง Entity บน Hook`, s)
        trigger(st, { k: 'afterSabotage', s })
        return
      }
      const r = st.survivors[hooked]
      prop!.occupant = null
      r.status = 'board'
      r.room = sv.room
      gainSurvivor(st, s, 1)
      log(st, `${sv.name} ช่วย ${r.name} ลงจาก Hook (+1 ▲)`, s, { ev: { k: 'rescue', s: hooked, by: s } })
      // The rescuer moves along any path, then the rescued survivor does (p.13).
      st.queue.unshift({ k: 'anyMove', s }, { k: 'anyMove', s: hooked })
      trigger(st, { k: 'afterSabotage', s }, 2)
      return
    }
  }
}

function placeEntity(st: GameState, place: EntityPlace) {
  st.entity = place
}

// ---------- killer ----------

function killerMove(st: GameState, a: Extract<Action, { t: 'move' }>, path: PathDef, to: string) {
  if (palletOn(st, path.id)) {
    // Enduring may break it and keep going.
    if (perkChoices(st, 'enduring', 'killer', { k: 'palletBlock', path: path.id, to }).length)
      return wait(st, { t: 'offer', perk: 'enduring', owner: 'killer', w: { k: 'palletBlock', path: path.id, to } })
    return palletStop(st, path.id)
  }
  const holders = onBoardIn(st, to).filter((i) => st.survivors[i].item === 'firecracker')
  if (holders.length > 0 && !a.reacted) {
    wait(st, { t: 'reaction', item: 'firecracker', holders, pending: { t: 'move', path: path.id } })
    return
  }
  finishKillerMove(st, path, to)
}

/** A pallet stops the killer: it breaks, they stay, and lose the interaction (p.14). */
function palletStop(st: GameState, path: string) {
  palletOn(st, path)!.removed = true
  trigger(st, { k: 'killerBreak', what: 'pallet' })
  st.canInteract = false
  log(st, `${st.killer.name} ทำลาย Pallet — อยู่ที่เดิม และไม่ได้ Interact`, 'killer', { ev: { k: 'palletBreak', path } })
}

function finishKillerMove(st: GameState, path: PathDef, to: string) {
  const wall = st.paths[path.id].wall
  if (wall) {
    st.paths[path.id].wall = false
    log(st, `${st.killer.name} ทุบกำแพง`, 'killer', { ev: { k: 'wallBreak', path: path.id } })
  }
  killerEnter(st, path.id, to)
  if (wall) trigger(st, { k: 'killerBreak', what: 'wall' }, 2)
}

/** The killer arrives in a room: reveal a prop there, then Quick & Quiet may hide someone. */
/** `path` is empty for a teleport (Wailing Bell, a Phantasm Trap). */
function killerEnter(st: GameState, path: string, to: string) {
  const k = st.killer
  const from = k.room
  k.room = to
  log(st, `${k.name} → ${roomName(st, to)}`, 'killer', { ev: { k: 'move', who: 'killer', from, to, path } })
  st.queue.unshift({ k: 'reveal', room: to, who: 'killer' }, { k: 'trigger', w: { k: 'killerEntered', room: to }, done: [] })
}

function killerInteract(st: GameState, i: KillerInteraction, reacted: boolean, turn: number) {
  const k = st.killer
  if (isPower(i)) return usePower(st, i)
  {
    const holders = onBoardIn(st, k.room).filter((s) => st.survivors[s].item === 'flashlight')
    if (holders.length > 0 && !reacted) {
      wait(st, { t: 'reaction', item: 'flashlight', holders, pending: { t: 'interact', i } })
      return
    }
  }
  killerActs(st, i, turn)
}

/** Interact; Red Herring may first turn an attack or pick-up into damaging a generator. */
function killerActs(st: GameState, i: KillerInteraction, turn: number | null) {
  if ((i.k === 'attack' || i.k === 'pickUp') && perkCandidates(st, { k: 'preKillerInteract', target: i.target }, []).length) {
    st.queue.unshift({ k: 'trigger', w: { k: 'preKillerInteract', target: i.target }, done: [] }, { k: 'killerDo', i, turn })
    return
  }
  killerDo(st, i, turn)
}

/** `turn` null: an interaction outside the turn's own (a Phantasm Trap teleport). */
function killerDo(st: GameState, i: KillerInteraction, turn: number | null) {
  // Territorial Imperative comes after the interaction and everything it sets off.
  const before = st.queue.length
  doKillerInteraction(st, i)
  if (turn !== null) trigger(st, { k: 'afterKillerInteract', turn }, st.queue.length - before)
}

function doKillerInteraction(st: GameState, i: KillerInteraction) {
  const k = st.killer
  const prop = 'prop' in i ? st.props.find((p) => p.id === i.prop)! : null
  switch (i.k) {
    case 'search': {
      const s = prop!.occupant!
      log(st, `${k.name} ค้น Locker — ${st.survivors[s].name} ทอย Skill Check`, 'killer')
      return startCheck(st, { k: 'search', s, prop: prop!.id })
    }
    case 'scout':
      prop!.removed = true
      gainKiller(st, 1)
      log(st, `${k.name} ไล่ Crow (+1 ▲)`, 'killer')
      return
    case 'damage':
      trigger(st, { k: 'killerBreak', what: 'damage' })
      prop!.progress = 0
      log(st, `${k.name} ทำลายความคืบหน้า Generator`, 'killer', { ev: { k: 'damage', prop: prop!.id } })
      return
    case 'venerate':
      gainKiller(st, 2)
      log(st, `${k.name} บูชา Hex Totem (+2 ▲)`, 'killer')
      return
    case 'attack':
      wound(st, i.target, 'attack', `${k.name} โจมตี ${st.survivors[i.target].name} — บาดเจ็บ`)
      // Brutal Strength, Agitation.
      trigger(st, { k: 'afterAttack', target: i.target })
      return
    case 'pickUp':
      log(st, `${k.name} อุ้ม ${st.survivors[i.target].name}`, 'killer', { ev: { k: 'pickUp', s: i.target } })
      return pickUp(st, i.target)
    default:
      return
  }
}

function pickUp(st: GameState, s: number) {
  const sv = st.survivors[s]
  if (sv.status === 'locker') leaveLocker(st, s)
  sv.status = 'carried'
  sv.room = st.killer.room
  // House rule (the rulebook, p.18, hangs at once): with a free hook here the killer may still
  // choose to carry the survivor elsewhere; `hang` in the carry steps hangs them here.
  wait(st, { t: 'carryDice', s })
}

/** A free hook in the killer's room, to hang the carried survivor on now. */
export function hookHere(st: GameState): Prop | undefined {
  return usableHook(st, st.killer.room)
}

function hang(st: GameState, s: number, hook: Prop) {
  const sv = st.survivors[s]
  sv.status = 'hooked'
  sv.room = hook.room!
  hook.occupant = s
  log(st, `${sv.name} ถูกแขวนบน Hook`, 'killer', { ev: { k: 'hook', s, prop: hook.id } })
  if (perkReady(st, 'killer', 'bloodhound')) {
    payPerk(st, 'killer', 'bloodhound', `${sv.name} −1 ▲, +1 ▲`)
    if (sv.bp > 0) sv.bp--
    gainKiller(st, 1)
  }
  if (sv.sacrificeToken) {
    sv.sacrificeToken = false
    addSacrifice(st, 1)
  }
  // Hung on a hook = sacrificed (p.15): Blood Echo, Dead Man's Switch.
  if (st.phase !== 'over') trigger(st, { k: 'afterHang', s })
}

function carryStep(st: GameState, s: number, steps: number, path: string, to: string) {
  const k = st.killer
  const from = k.room
  k.room = to
  st.survivors[s].room = to
  log(st, `${k.name} แบก ${st.survivors[s].name} → ${roomName(st, to)}`, 'killer', { ev: { k: 'move', who: 'killer', from, to, path } })
  emit(st, { k: 'move', who: s, from, to, path }, s)
  // Reveal first: the flipped tile may be the hook (p.15).
  st.queue.unshift({ k: 'reveal', room: to, who: 'killer' }, { k: 'carryArrive', s, steps: steps - 1 })
}

function carryArrive(st: GameState, s: number, steps: number) {
  const hook = usableHook(st, st.killer.room)
  // Out of steps (or nowhere to go) on a free hook: hang. With steps left the killer chooses.
  if (hook && (steps <= 0 || carryMoves(st).length === 0)) return hang(st, s, hook)
  if (!hook && (steps <= 0 || carryMoves(st).length === 0)) return carryEscape(st, s)
  wait(st, { t: 'carryMove', s, steps })
}

function carryEscape(st: GameState, s: number) {
  const sv = st.survivors[s]
  sv.status = 'board'
  sv.room = st.killer.room
  log(st, `${sv.name} หลุดจากการแบก ที่ ${roomName(st, sv.room)}`, s, { ev: { k: 'carryEscape', s } })
}

function addSacrifice(st: GameState, n: number) {
  st.sacrifice = Math.min(SACRIFICE_TO_WIN, st.sacrifice + n)
  log(st, `Sacrifice Progress ${st.sacrifice}/${SACRIFICE_TO_WIN}`, 'killer', { ev: { k: 'sacrifice', total: st.sacrifice } })
  if (st.sacrifice >= SACRIFICE_TO_WIN) gameOver(st, 'killer')
}

function gameOver(st: GameState, winner: 'survivors' | 'killer') {
  st.phase = 'over'
  st.queue = []
  st.activeSurvivor = null
  st.step = { t: 'gameOver', winner }
  log(st, winner === 'survivors' ? 'ประตูเปิด — ผู้รอดชีวิตหนีรอด!' : 'Sacrifice ครบ — ฆาตกรชนะ!', 'game', { ev: { k: 'gameOver', winner } })
}

function gainKiller(st: GameState, n: number) {
  const before = st.killer.bp
  st.killer.bp = Math.min(KILLER_BP.max, st.killer.bp + n)
  if (st.killer.bp > before) emit(st, { k: 'bp', who: 'killer', n: st.killer.bp - before }, 'killer')
}

function gainSurvivor(st: GameState, s: number, n: number) {
  const sv = st.survivors[s]
  const before = sv.bp
  sv.bp = Math.min(SURVIVOR_BP.max, sv.bp + n)
  if (sv.bp > before) emit(st, { k: 'bp', who: s, n: sv.bp - before }, s)
}

function cleanup(st: GameState) {
  st.phase = 'cleanup'
  const hooked = st.survivors.filter((s) => s.status === 'hooked').length
  if (hooked > 0) addSacrifice(st, hooked)
  if (st.step.t === 'gameOver') return
  if (hooked === 0 && perkReady(st, 'killer', 'monitor_and_abuse')) {
    payPerk(st, 'killer', 'monitor_and_abuse', 'ไม่มีใครบน Hook +1 ▲')
    gainKiller(st, 1)
  }
  st.entity = null
  st.firstPlayer = (st.firstPlayer + 1) % 4
  st.survivorHands = st.survivorHands.map(() => [...SURVIVOR_CARDS])
  for (const sv of st.survivors) {
    sv.planned = null
    sv.plannedRevealed = false
    sv.acted = false
    sv.woundedThisRound = false
  }
  Object.assign(st.killer, { hand: [...KILLER_CARDS], planned: [], revealedCount: 0, plannedShown: false, powerUsed: false, bonusUsed: false, shown: [] })
  Object.assign(st, { perksUsed: [], perksMuted: [], moveBlocked: false, stridor: null, rollMods: { danger: false, keep: false }, sealedCard: null, itemBlocked: false, redeemer: null })
  st.round++
  log(st, `— รอบ ${st.round} —`, 'game', { ev: { k: 'round', round: st.round } })
  startPlanning(st)
}

// ---------- dice ----------

function rollDie(st: GameState, kind: Die['kind']): Die {
  return { kind, face: rollFace(st), rerolled: false }
}

/** A survivor's skill check: perks may change it first (Unnerving Presence, Thanatophobia, Bond). */
function startCheck(st: GameState, ctx: RollContext) {
  st.queue.unshift({ k: 'trigger', w: { k: 'preRoll', ctx }, done: [] }, { k: 'roll', ctx, n: 1, kind: 'skill' })
}

function startRoll(st: GameState, ctx: RollContext, n: number, kind: Die['kind'], keep = false) {
  const dice = Array.from({ length: n }, () => rollDie(st, kind))
  wait(st, { t: 'roll', ctx, dice, ...(keep ? { keep } : {}) })
  if (rollSettled(st)) {
    st.step = { t: 'idle' }
    resolveRoll(st, ctx, dice)
  }
}

/** Nothing more can change this roll: no key re-roll, no Iron Will, no die to choose. */
function rollSettled(st: GameState): boolean {
  const step = st.step
  return step.t === 'roll' && !step.keep && rerollers(st).length === 0 && perkButtons(st).length === 0
}

function reroll(st: GameState, s: number, die: number) {
  const step = st.step
  if (step.t !== 'roll' || !rerollers(st).includes(s)) fail('cannot re-roll')
  const d = step.dice[die] ?? fail('no such die')
  if (d.rerolled) fail('a die is re-rolled only once (p.16)')
  const sv = st.survivors[s]
  emit(st, { k: 'item', s, item: sv.item! }, s)
  log(st, `${sv.name} ทิ้ง ${ITEM_NAMES[sv.item!]} ทอยใหม่`, s)
  sv.item = null
  step.dice[die] = { ...rollDie(st, d.kind), rerolled: true }
  if (rollSettled(st)) {
    st.step = { t: 'idle' }
    resolveRoll(st, step.ctx, step.dice)
  }
}

const ROLL_LABEL: Record<RollContext['k'], string> = {
  repair: 'ซ่อม Generator',
  openGate: 'เปิดประตู',
  cleanse: 'ชำระ Hex Totem',
  heal: 'รักษา',
  trap: 'Bear Trap',
  search: 'ค้น Locker',
  carry: 'ดิ้นหลุดจากการแบก',
  hatchet: 'หลบ Hatchet',
  botany: 'Botany Knowledge',
  selfCare: 'Self-Care',
  phantasm: 'Phantasm Trap',
  overwhelm: 'Overwhelming Presence',
}

function resolveRoll(st: GameState, ctx: RollContext, dice: Die[], failBp?: number) {
  // Failures give the killer ▲ once re-rolls are done (p.16, p.18), one per die (p.15 example),
  // even when Iron Will counts them as successes.
  const fails = failBp ?? dice.filter(isFailure).length
  if (fails && perkCandidates(st, { k: 'rollFail', s: ctx.s, fails }, []).length) {
    // The dice are shown (logged) first; Off the Record may then take a ▲ from the killer.
    logRoll(st, ctx, dice, 0)
    st.queue.unshift({ k: 'trigger', w: { k: 'rollFail', s: ctx.s, fails }, done: [] }, { k: 'resolveRoll', ctx, dice, fails })
    return
  }
  finishRoll(st, ctx, dice, fails, false)
}

function logRoll(st: GameState, ctx: RollContext, dice: Die[], fails: number) {
  const s = ctx.s
  log(st, `${st.survivors[s].name} ทอย ${ROLL_LABEL[ctx.k]}${fails ? ` — ${st.killer.name} +${fails} ▲` : ''}`, s, { dice, ev: { k: 'roll', s, ctx: ctx.k, ...('prop' in ctx ? { prop: ctx.prop } : {}), ...('target' in ctx ? { target: ctx.target } : {}) } })
}

/** `logged`: the roll is already in the log (it waited for Off the Record). */
function finishRoll(st: GameState, ctx: RollContext, dice: Die[], fails: number, logged: boolean) {
  const s = ctx.s
  const sv = st.survivors[s]
  const ok = succeeded(dice[0])
  if (!logged) logRoll(st, ctx, dice, fails)
  else if (fails) log(st, `${st.killer.name} +${fails} ▲ จากผลล้มเหลว`, 'killer')
  if (fails) gainKiller(st, fails)
  // Lucky Break: after a great success (the die kept; any die of the carry roll).
  if (isGreat(dice[0]) || (ctx.k === 'carry' && dice.some(isGreat))) trigger(st, { k: 'greatRoll', s })
  // Madness lasts until a failed (danger-die) skill check.
  if (SKILL_CHECKS.includes(ctx.k) && sv.madness && dice[0].kind === 'danger' && !ok) {
    sv.madness = false
    log(st, `${sv.name} หาย Madness`, s, { ev: { k: 'madness', s, on: false } })
  }

  switch (ctx.k) {
    case 'repair': {
      const gen = st.props.find((p) => p.id === ctx.prop)!
      const add = isGreat(dice[0]) ? 2 : ok ? 1 : 0
      addGenerator(st, gen, add, s)
      if (!ok) trigger(st, { k: 'repairFail', s, prop: gen.id })
      return
    }
    case 'phantasm':
      wait(st, { t: 'phantasmChoice', s, room: ctx.room, face: dice[0].face })
      return
    case 'overwhelm':
      if (!ok) st.itemBlocked = true
      return
    case 'openGate': {
      const gate = st.props.find((p) => p.id === ctx.prop)!
      if (!ok) return
      gate.progress = Math.min(PROGRESS_MAX, gate.progress + 1)
      log(st, `Exit Gate ${gate.progress}/${PROGRESS_MAX}`, s, { ev: { k: 'gate', s, progress: gate.progress } })
      if (gate.progress >= PROGRESS_MAX) gameOver(st, 'survivors')
      return
    }
    case 'cleanse': {
      if (!ok) return
      st.props.find((p) => p.id === ctx.prop)!.removed = true
      gainSurvivor(st, s, 2)
      log(st, `${sv.name} ชำระ Hex Totem สำเร็จ (+2 ▲)`, s, { ev: { k: 'cleanse', s } })
      if (ctx.retribution) {
        gainKiller(st, 2)
        log(st, `${st.killer.name} +2 ▲ (Retribution)`, 'killer')
      }
      return
    }
    case 'heal': {
      if (!ok) return
      makeHealthy(st, ctx.target, `${st.survivors[ctx.target].name} หายบาดเจ็บ`, s)
      return
    }
    case 'botany':
      if (ok) makeHealthy(st, ctx.target, `${st.survivors[ctx.target].name} หายบาดเจ็บ (Botany Knowledge)`, s)
      return
    case 'selfCare':
      if (ok) makeHealthy(st, s, `${sv.name} หายบาดเจ็บ (Self-Care)`, s)
      return
    case 'hatchet':
      if (!ok) wound(st, s, 'power', `${sv.name} โดน Hatchet — บาดเจ็บ`)
      return
    case 'trap': {
      if (ok) return
      st.paths[ctx.path].trap = false
      st.killer.trapsInSupply++
      if (sv.wounded) {
        log(st, `${sv.name} ติด Bear Trap ขณะบาดเจ็บ — Sacrifice +1`, 'killer', { ev: { k: 'trapSprung', s, path: ctx.path } })
        addSacrifice(st, 1)
      } else {
        sv.wounded = true
        sv.woundedThisRound = true
        log(st, `${sv.name} ติด Bear Trap — บาดเจ็บ`, 'killer', { ev: { k: 'trapSprung', s, path: ctx.path } })
        emit(st, { k: 'wound', s, by: 'trap' }, 'killer')
      }
      return
    }
    case 'search': {
      const locker = st.props.find((p) => p.id === ctx.prop)!
      if (ok) {
        locker.removed = true
        locker.occupant = null
        sv.status = 'board'
        log(st, `${sv.name} รอด — Locker ถูกนำออก`, s)
        return
      }
      log(st, `${st.killer.name} ลาก ${sv.name} ออกจาก Locker`, 'killer', { ev: { k: 'pickUp', s } })
      return pickUp(st, s)
    }
    case 'carry': {
      if (dice.some(isGreat)) {
        log(st, `${sv.name} ดิ้นหลุด!`, s)
        return carryEscape(st, s)
      }
      if (carryMoves(st).length === 0) return carryEscape(st, s)
      wait(st, { t: 'carryMove', s, steps: dice.length })
      return
    }
  }
}

function addGenerator(st: GameState, gen: Prop, add: number, s: number) {
  const before = gen.progress
  gen.progress = Math.min(PROGRESS_MAX, gen.progress + add)
  log(st, `Generator ${gen.progress}/${PROGRESS_MAX}`, 'game', { ev: { k: 'repair', s, prop: gen.id, add: gen.progress - before, progress: gen.progress } })
  if (gen.progress >= PROGRESS_MAX && !gen.done) {
    gen.done = true
    log(st, `ซ่อม Generator เสร็จ (${generatorsDone(st)}/${GENERATORS_TO_POWER})`, 'game', { ev: { k: 'genDone', prop: gen.id, room: gen.room! } })
    if (generatorsDone(st) === GENERATORS_TO_POWER) log(st, 'Exit Gate มีไฟแล้ว!', 'game', { ev: { k: 'gatesPowered' } })
    // Tinkerer.
    trigger(st, { k: 'genDone' })
  }
}

// ---------- items ----------

function useItem(st: GameState, s: number, use: ItemUse) {
  const legal = itemUses(st, s)
  const ok = legal.some((u) => u.k === use.k && (use.k === 'reveal' || same(u, use)))
  if (!ok) fail('item cannot be used now')
  if (use.k === 'reveal') {
    const picked = use.props.map((id) => st.props.find((p) => p.id === id && !p.revealed && p.room !== null && propsIn(st, p.room).includes(p)))
    if (picked.length < 1 || picked.length > 3 || new Set(use.props).size !== use.props.length || picked.some((p) => !p)) fail('choose 1–3 face-down props')
  }
  // The Doctor may make it roll first; the use waits in the queue.
  if (perkCandidates(st, { k: 'preItem', s }, []).length) {
    st.queue.unshift({ k: 'trigger', w: { k: 'preItem', s }, done: [] }, { k: 'itemUse', s, use })
    return
  }
  applyItem(st, s, use)
}

function applyItem(st: GameState, s: number, use: ItemUse) {
  const sv = st.survivors[s]
  const item = sv.item!
  sv.item = null
  const name = ITEM_NAMES[item]
  emit(st, { k: 'item', s, item }, s)
  switch (use.k) {
    case 'bp':
      gainSurvivor(st, s, KEY_BP[item])
      log(st, `${sv.name} ทิ้ง ${name} (+${KEY_BP[item]} ▲)`, s)
      return
    case 'generator': {
      log(st, `${sv.name} ใช้ ${name}`, s)
      addGenerator(st, st.props.find((p) => p.id === use.prop)!, 1, s)
      if (item === 'commodious_toolbox') drawItem(st, s)
      return
    }
    case 'heal':
      makeHealthy(st, use.target, `${sv.name} ใช้ ${name} — ${st.survivors[use.target].name} หายบาดเจ็บ`, s)
      return
    case 'wall':
      st.paths[use.path].wall = false
      log(st, `${sv.name} ใช้ ${name} ทำลายกำแพง`, s, { ev: { k: 'wallBreak', path: use.path } })
      return
    case 'reveal': {
      log(st, `${sv.name} ใช้ ${name}`, s)
      for (const id of use.props) {
        const p = st.props.find((x) => x.id === id)!
        if (!p.revealed && !p.removed) revealProp(st, p, s)
      }
      return
    }
    case 'draw':
      log(st, `${sv.name} ทิ้ง ${name}`, s)
      drawItem(st, s)
      return
    case 'showKiller':
      st.killer.plannedShown = true
      log(st, `${sv.name} ใช้ ${name} — เปิดการ์ดเคลื่อนที่ของฆาตกร: ${st.killer.planned.map((c) => CARD_NAMES[c]).join(', ')}`, s)
      return
  }
}

function drawItem(st: GameState, s: number) {
  const drawn = st.itemDeck.shift()
  if (!drawn) return
  st.survivors[s].item = drawn
  log(st, `${st.survivors[s].name} จั่วได้ ${ITEM_NAMES[drawn]}`, s)
}

// ---------- perks (Adept mode: printed perks, p.16, p.19) ----------
//
// A perk is used at most once per round and costs its ▲ (p.16). Most perks are offered when
// their moment comes (a `trigger` task asks each owner in turn: survivors in turn order, then
// the killer, p.16); a few are buttons the owner presses during their own step.

const ownerKey = (o: PerkOwner) => (o === 'killer' ? 'k' : String(o))
const perkKey = (o: PerkOwner, perk: PerkId) => `${ownerKey(o)}:${perk}`

export function ownerName(st: GameState, o: PerkOwner): string {
  return o === 'killer' ? st.killer.name : st.survivors[o].name
}

function ownerBp(st: GameState, o: PerkOwner): number {
  return o === 'killer' ? st.killer.bp : st.survivors[o].bp
}

function perksOf(st: GameState, o: PerkOwner): PerkId[] {
  return o === 'killer' ? st.killer.perks : st.survivors[o].perks
}

export function perkUsed(st: GameState, o: PerkOwner, perk: PerkId): boolean {
  return st.perksUsed.includes(perkKey(o, perk))
}

/** Owns the perk, hasn't used it this round, can pay, and is on the board (p.12, p.15). */
export function perkReady(st: GameState, o: PerkOwner, perk: PerkId): boolean {
  if (!perksOf(st, o).includes(perk) || perkUsed(st, o, perk)) return false
  if (ownerBp(st, o) < PERKS[perk].cost) return false
  return o === 'killer' || st.survivors[o].status === 'board'
}

/** Rooms joined to `room` by a path (either direction, p.16), not counting `room` itself. */
function connectedRooms(st: GameState, room: string): Set<string> {
  return new Set(touchingPaths(st, room).map((p) => (p.a === room ? p.b : p.a)))
}

function inRange(st: GameState, a: string, b: string): boolean {
  return a === b || connectedRooms(st, a).has(b)
}

/** Single-die skill checks a perk may change (not the carry roll, not danger-die rolls). */
const SKILL_CHECKS: RollContext['k'][] = ['repair', 'openGate', 'cleanse', 'heal', 'search']

function generatorDoneThisRound(st: GameState): boolean {
  return st.log.some((e) => e.round === st.round && e.ev?.k === 'genDone')
}

/** Every legal way to use `perk` in this window; empty when it can't be used. `{}` = no choice. */
export function perkChoices(st: GameState, perk: PerkId, o: PerkOwner, w: PerkWindow): PerkChoice[] {
  if (!perkReady(st, o, perk)) return []
  const k = st.killer
  const me = o === 'killer' ? null : st.survivors[o]
  const NONE: PerkChoice[] = [{}]
  switch (perk) {
    // ----- The Trapper -----
    case 'brutal_strength': {
      if (w.k !== 'afterAttack' || st.survivors[w.target].status !== 'board') return []
      return exits(st, st.survivors[w.target].room, 'any').map((e) => ({ path: e.path.id }))
    }
    case 'agitation':
      if (w.k !== 'afterAttack') return []
      return exits(st, k.room, 'any')
        .filter((e) => !palletOn(st, e.path.id))
        .map((e) => ({ path: e.path.id }))
    case 'unnerving_presence': {
      if (w.k !== 'preRoll' || !SKILL_CHECKS.includes(w.ctx.k) || st.rollMods.danger) return []
      return inRange(st, k.room, st.survivors[w.ctx.s].room) ? NONE : []
    }
    // ----- The Nurse -----
    case 'stridor':
      if (w.k !== 'planningStart') return []
      return st.survivors.flatMap((sv, i) => (sv.wounded && sv.status !== 'hooked' && sv.status !== 'carried' ? [{ target: i }] : []))
    case 'thanatophobia':
      if (w.k !== 'preRoll' || !SKILL_CHECKS.includes(w.ctx.k) || st.rollMods.danger) return []
      return st.survivors[w.ctx.s].wounded ? NONE : []
    case 'nurses_calling':
      return [] // automatic, see makeHealthy
    // ----- The Huntress -----
    case 'huntress_lullaby':
      if (w.k !== 'cardMove' || !k.hand.includes(w.card)) return []
      return survivorMoves(st, w.s, w.card).length ? NONE : []
    case 'beast_of_prey':
      if (w.k !== 'planningStart') return []
      return exits(st, k.room, 'any')
        .filter((e) => !palletOn(st, e.path.id))
        .map((e) => ({ path: e.path.id }))
    case 'territorial_imperative':
      return w.k === 'afterKillerInteract' && powerOptions(st).length ? NONE : []
    // ----- The Hillbilly -----
    case 'lightborn':
      if (w.k !== 'planningEnd') return []
      return [0, 1].filter((i) => !k.shown.includes(i)).map((index) => ({ index }))
    case 'enduring':
      return w.k === 'palletBlock' ? NONE : []
    case 'tinkerer': {
      if (w.k !== 'genDone') return []
      const out: PerkChoice[] = []
      for (let i = k.revealedCount; i < k.planned.length; i++)
        for (const card of new Set(k.hand)) if (card !== k.planned[i]) out.push({ index: i, card })
      return out
    }
    // ----- Dwight -----
    case 'prove_thyself': {
      if (w.k !== 'interact' || w.s !== o || st.activeSurvivor !== o || !st.canInteract) return []
      return st.survivors.flatMap((sv, i) =>
        i !== o && sv.status === 'board' && inRange(st, me!.room, sv.room) && survivorInteractions(st, i).length ? [{ target: i }] : [],
      )
    }
    case 'leader': {
      if (w.k !== 'afterCardMove') return []
      if (w.s === o) return onBoardIn(st, w.from).flatMap((i) => (i !== o ? [{ target: i }] : []))
      return me!.room === w.from ? NONE : []
    }
    case 'bond': {
      if (w.k !== 'preRoll' || !SKILL_CHECKS.includes(w.ctx.k) || w.ctx.s === o || st.rollMods.keep) return []
      return inRange(st, me!.room, st.survivors[w.ctx.s].room) ? NONE : []
    }
    // ----- Meg -----
    case 'sprint_burst':
      if (w.k !== 'afterCardMove' || w.s !== o) return []
      return anyMoves(st, o as number)
        .filter((m) => m.path.id !== w.path)
        .map((m) => ({ path: m.path.id }))
    case 'adrenaline':
      if (w.k !== 'cleanupStart' || !generatorDoneThisRound(st)) return []
      return [...new Set(st.survivorHands[me!.hand])].map((card) => ({ card }))
    case 'quick_and_quiet': {
      if (w.k !== 'killerEntered' || me!.room !== w.room) return []
      return propsIn(st, w.room).flatMap((p) => (p.kind === 'locker' && p.revealed && p.occupant === null ? [{ prop: p.id }] : []))
    }
    // ----- Jake -----
    case 'iron_will': {
      const step = st.step
      if (w.k !== 'roll' || step.t !== 'roll' || step.ctx.k === 'carry' || step.ctx.k === 'phantasm') return []
      if (!step.dice.some((d) => isFailure(d) && !d.asSuccess)) return []
      return inRange(st, me!.room, st.survivors[step.ctx.s].room) ? NONE : []
    }
    case 'calm_spirit':
      return [] // an interaction, see survivorInteractions
    case 'saboteur': {
      if (w.k !== 'afterSabotage' || w.s !== o) return []
      const out: PerkChoice[] = [{ mode: 'bp' }]
      if (me!.bp >= 2) for (const card of new Set(st.survivorHands[me!.hand])) out.push({ mode: 'bonus', card })
      return out
    }
    // ----- Claudette -----
    case 'botany_knowledge': {
      if ((w.k !== 'turnStart' && w.k !== 'interact') || w.s !== o || st.activeSurvivor !== o) return []
      return onBoardIn(st, me!.room).flatMap((i) => (i !== o && st.survivors[i].wounded ? [{ target: i }] : []))
    }
    case 'empathy': {
      if (w.k !== 'turnStart' || w.s !== o) return []
      const out: PerkChoice[] = []
      st.survivors.forEach((sv, i) => {
        if (i === o || sv.status === 'hooked') return
        if (sv.bp >= 1 && me!.bp < SURVIVOR_BP.max) out.push({ target: i, mode: 'take' })
        if (me!.bp >= 1 && sv.bp < SURVIVOR_BP.max) out.push({ target: i, mode: 'give' })
      })
      return out
    }
    case 'self_care':
      return w.k === 'turnStart' && w.s === o && me!.wounded ? NONE : []
    // ----- The Doctor -----
    case 'monitor_and_abuse':
      return [] // automatic, see cleanup
    case 'overcharge':
      if (w.k !== 'killerBreak' || w.what !== 'damage') return []
      return st.survivors.flatMap((sv, i) => (sv.status === 'board' && !sv.wounded && inRange(st, k.room, sv.room) ? [{ target: i }] : []))
    case 'overwhelming_presence':
      return w.k === 'preItem' && inRange(st, k.room, st.survivors[w.s].room) ? NONE : []
    // ----- The Hag -----
    case 'the_third_seal':
      if (w.k !== 'planningStart' || st.sealedCard) return []
      return [...new Set(k.hand)].filter((c) => c !== 'wait').map((card) => ({ card }))
    case 'devour_hope':
      if (w.k !== 'cleanupStart' || !generatorDoneThisRound(st) || k.bonusUsed) return []
      return [...new Set(k.hand)].map((card) => ({ card }))
    case 'ruin':
      if (w.k !== 'planningStart') return []
      return st.props
        .filter((p) => p.kind === 'generator' && p.revealed && !p.done && !p.removed && p.progress > 0 && onBoardIn(st, p.room!).length === 0)
        .map((p) => ({ prop: p.id }))
    // ----- The Wraith -----
    case 'shadowborn':
      if (w.k !== 'planningEnd' || k.bonusUsed || k.planned.length > 2) return []
      return [...new Set(k.hand)].map((card) => ({ card }))
    case 'bloodhound':
      return [] // automatic, see hang
    case 'predator':
      if (w.k !== 'planningEnd') return []
      return st.survivors.flatMap((sv, i) => (sv.planned && !sv.acted && st.survivorHands[sv.hand].length ? [{ target: i }] : []))
    // ----- Feng Min -----
    case 'lithe': {
      if (w.k !== 'afterCardMove' || w.s !== o) return []
      const pallet = !!palletOn(st, w.path) || propsIn(st, w.from).some((p) => p.kind === 'pallet' && p.revealed)
      if (!pallet) return []
      return anyMoves(st, o as number)
        .filter((m) => m.path.id !== w.path)
        .map((m) => ({ path: m.path.id }))
    }
    case 'alert':
      return w.k === 'killerBreak' ? anyMoves(st, o as number).map((m) => ({ path: m.path.id })) : []
    case 'technician':
      return w.k === 'repairFail' && w.s === o && survivorInteractions(st, o).some((i) => !('prop' in i) || i.prop !== w.prop) ? NONE : []
    // ----- Ace -----
    case 'open_handed':
      if (w.k !== 'turnBegin' || k.plannedShown) return []
      return k.planned.flatMap((_, i) => (i >= k.revealedCount && !k.shown.includes(i) ? [{ index: i }] : []))
    case 'ace_in_the_hole': {
      if (w.k !== 'interact' || w.s !== o || st.activeSurvivor !== o || !st.canInteract) return []
      const swappable = (p: Prop) => !(p.kind === 'generator' && p.progress > 0) && p.occupant === null
      const out: PerkChoice[] = []
      const mine = propsIn(st, me!.room).filter(swappable)
      for (const r of connectedRooms(st, me!.room))
        for (const b of propsIn(st, r).filter(swappable))
          for (const a2 of mine) if (a2.category === b.category && (a2.revealed || b.revealed) && a2.kind !== b.kind) out.push({ prop: a2.id, prop2: b.id })
      return out
    }
    case 'up_the_ante':
      if (w.k !== 'turnEnd' || w.s !== o) return []
      return [...new Set(st.survivorHands[me!.hand])].map((card) => ({ card }))
    // ----- Nea -----
    case 'balanced_landing': {
      if (w.k !== 'interact' || w.s !== o || st.activeSurvivor !== o || !st.canInteract) return []
      return touchingPaths(st, me!.room)
        .filter((p) => !st.paths[p.id].wall)
        .map((p) => ({ path: p.id }))
    }
    case 'urban_evasion':
      if (w.k !== 'turnBegin' || st.evadedWall) return []
      return Object.keys(st.paths)
        .filter((id) => st.paths[id].wall)
        .map((path) => ({ path }))
    case 'streetwise':
      return w.k === 'afterRummage' && w.s === o ? NONE : []
    // ----- The Oni -----
    case 'blood_echo':
      if (w.k !== 'afterHang') return []
      return [...connectedRooms(st, k.room)].flatMap((r) => onBoardIn(st, r).filter((i) => !st.survivors[i].wounded).map((target) => ({ target })))
    case 'zanshin_tactics': {
      if (w.k !== 'killerTurnBegin') return []
      const out: PerkChoice[] = []
      for (let i = w.turn; i < k.planned.length; i++) for (const card of new Set(k.hand)) if (card !== k.planned[i]) out.push({ index: i, card })
      return out
    }
    case 'nemesis':
      return w.k === 'afterPalletLocker' && inRange(st, k.room, st.survivors[w.s].room) && !st.props.find((p) => p.id === w.prop)!.removed ? NONE : []
    // ----- The Deathslinger -----
    case 'gearhead':
      return w.k === 'killerBreak' && w.what === 'damage' && st.phase === 'killer' && k.revealedCount > 0 ? NONE : []
    case 'retribution':
      return w.k === 'preRoll' && w.ctx.k === 'cleanse' && !st.rollMods.retribution ? NONE : []
    case 'dead_mans_switch':
      if (w.k !== 'afterHang') return []
      return st.props
        .filter((p) => (p.kind === 'generator' || p.kind === 'exitGate') && p.revealed && !p.done && !p.removed && p.progress > 0)
        .map((p) => ({ prop: p.id }))
    // ----- Yui -----
    case 'breakout': {
      if (w.k !== 'turnStart' || w.s !== o) return []
      return st.survivors.flatMap((sv, i) => (sv.status === 'board' && sv.wounded ? anyMoves(st, i).map((m) => ({ target: i, path: m.path.id })) : []))
    }
    case 'lucky_break':
      return w.k === 'greatRoll' && me!.wounded ? NONE : []
    case 'any_means_necessary':
      if (w.k !== 'turnEnd' || w.s !== o || me!.wounded) return []
      return [...new Set(st.survivorHands[me!.hand])].map((card) => ({ card }))
    // ----- Zarina -----
    case 'red_herring': {
      if (w.k !== 'preKillerInteract' || st.survivors[w.target].room !== me!.room) return []
      return propsIn(st, me!.room).flatMap((p) => (p.kind === 'generator' && p.revealed ? [{ prop: p.id }] : []))
    }
    case 'for_the_people': {
      if (w.k !== 'entered' || w.s !== o || me!.wounded) return []
      const heal = onBoardIn(st, me!.room).flatMap((i) => (i !== o && st.survivors[i].wounded ? [{ target: i }] : []))
      const gens = propsIn(st, me!.room).flatMap((p) => (p.kind === 'generator' && p.revealed ? [{ prop: p.id }] : []))
      return [...heal, ...gens]
    }
    case 'off_the_record':
      return w.k === 'rollFail' && w.fails > 0 && inRange(st, me!.room, st.survivors[w.s].room) ? NONE : []
  }
}

/** Owners asked in a window: survivors in turn order, then the killer (p.16). */
function perkCandidates(st: GameState, w: PerkWindow, done: string[]): { perk: PerkId; owner: PerkOwner }[] {
  const owners: PerkOwner[] = [...turnOrder(st), 'killer']
  const out: { perk: PerkId; owner: PerkOwner }[] = []
  for (const o of owners)
    for (const perk of perksOf(st, o)) {
      const key = perkKey(o, perk)
      if (done.includes(key) || st.perksMuted.includes(key)) continue
      if (perkChoices(st, perk, o, w).length) out.push({ perk, owner: o })
    }
  return out
}

/** Queue a window's offers to run before anything else. */
function trigger(st: GameState, w: PerkWindow, at = 0) {
  st.queue.splice(at, 0, { k: 'trigger', w, done: [] })
}

function runTrigger(st: GameState, w: PerkWindow, done: string[]) {
  // Owners in order (survivors by turn order, then the killer, p.16). An owner with several
  // perks for this moment chooses among all of them, in any order.
  const all = perkCandidates(st, w, done)
  const next = all[0]
  if (!next) return
  const alt = all.filter((c) => c.owner === next.owner && c.perk !== next.perk).map((c) => c.perk)
  wait(st, { t: 'offer', perk: next.perk, owner: next.owner, w, done, ...(alt.length ? { alt } : {}) })
}

/** Every perk an offer step lets its owner use now. */
export function offeredPerks(step: Extract<Step, { t: 'offer' }>): PerkId[] {
  return [step.perk, ...(step.alt ?? [])]
}

/** Perks that are buttons in the current step (not questions). */
export function perkButtons(st: GameState): { perk: PerkId; owner: PerkOwner; w: PerkWindow; choices: PerkChoice[] }[] {
  const step = st.step
  const out: { perk: PerkId; owner: PerkOwner; w: PerkWindow; choices: PerkChoice[] }[] = []
  const add = (owner: PerkOwner, w: PerkWindow, perks: PerkId[]) => {
    for (const perk of perks) {
      const choices = perkChoices(st, perk, owner, w)
      if (choices.length) out.push({ perk, owner, w, choices })
    }
  }
  if (step.t === 'turnStart') add(step.s, { k: 'turnStart', s: step.s }, ['self_care', 'empathy', 'botany_knowledge', 'breakout'])
  if (step.t === 'survivorInteract') add(step.s, { k: 'interact', s: step.s }, ['prove_thyself', 'botany_knowledge', 'ace_in_the_hole', 'balanced_landing'])
  if (step.t === 'roll') st.survivors.forEach((_, i) => add(i, { k: 'roll' }, ['iron_will']))
  return out
}

function payPerk(st: GameState, o: PerkOwner, perk: PerkId, detail = '') {
  const cost = PERKS[perk].cost
  if (o === 'killer') st.killer.bp -= cost
  else st.survivors[o].bp -= cost
  st.perksUsed.push(perkKey(o, perk))
  log(st, `${ownerName(st, o)} ใช้ ${PERKS[perk].name}${cost ? ` (−${cost} ▲)` : ''}${detail ? ` — ${detail}` : ''}`, o, { ev: { k: 'perk', who: o, perk } })
}

function handlePerk(st: GameState, a: Extract<Action, { t: 'perk' }>) {
  const step = st.step
  if (step.t === 'offer') {
    const offered = offeredPerks(step)
    if (!offered.includes(a.perk)) fail('a different perk is being offered')
    st.step = { t: 'idle' }
    const before = st.queue.length
    let answered: PerkId[]
    if (a.use) {
      const choice = a.choice ?? {}
      if (!perkChoices(st, a.perk, step.owner, step.w).some((c) => same(c, choice))) fail('not a legal choice for this perk')
      usePerk(st, a.perk, step.owner, step.w, choice)
      // the owner's other perks for this moment are asked again (if still usable)
      answered = [a.perk]
    } else {
      // passing passes on every perk offered together
      for (const p of offered) {
        if (a.quiet) st.perksMuted.push(perkKey(step.owner, p))
        declinePerk(st, p, step.w)
      }
      answered = offered
    }
    // Ask again (this owner's remaining perks, then the next owner) once the perk's own work is done.
    if (step.done) st.queue.splice(st.queue.length - before, 0, { k: 'trigger', w: step.w, done: [...step.done, ...answered.map((p) => perkKey(step.owner, p))] })
    return
  }
  const button = perkButtons(st).find((b) => b.perk === a.perk) ?? fail('perk not usable now')
  const choice = a.choice ?? {}
  if (!a.use || !button.choices.some((c) => same(c, choice))) fail('not a legal choice for this perk')
  if (step.t === 'roll') {
    usePerk(st, a.perk, button.owner, button.w, choice)
    if (rollSettled(st)) {
      st.step = { t: 'idle' }
      resolveRoll(st, step.ctx, step.dice)
    }
    return
  }
  st.step = { t: 'idle' }
  // Come back to the same step afterwards (start-of-turn perks, Botany before interacting).
  if (step.t === 'turnStart') st.queue.unshift({ k: 'turnStart', s: step.s })
  // Botany Knowledge and Ace in the Hole come before interacting: back to the same step after.
  if (step.t === 'survivorInteract' && (a.perk === 'botany_knowledge' || a.perk === 'ace_in_the_hole')) st.queue.unshift({ k: 'survivorInteract', s: step.s })
  usePerk(st, a.perk, button.owner, button.w, choice)
}

function usePerk(st: GameState, perk: PerkId, o: PerkOwner, w: PerkWindow, c: PerkChoice) {
  const k = st.killer
  const name = (s: number) => st.survivors[s].name
  switch (perk) {
    case 'brutal_strength': {
      const t = (w as Extract<PerkWindow, { k: 'afterAttack' }>).target
      const e = exits(st, st.survivors[t].room, 'any').find((x) => x.path.id === c.path)!
      payPerk(st, o, perk, `ผลัก ${name(t)}`)
      const pallet = palletOn(st, e.path.id)
      if (pallet) {
        pallet.removed = true
        log(st, 'Pallet พัง', 'killer', { ev: { k: 'palletBreak', path: e.path.id } })
      }
      if (st.paths[e.path.id].wall) {
        st.paths[e.path.id].wall = false
        log(st, 'กำแพงพัง', 'killer', { ev: { k: 'wallBreak', path: e.path.id } })
      }
      return moveSurvivor(st, t, e.path, e.to)
    }
    case 'agitation':
    case 'beast_of_prey': {
      const e = exits(st, k.room, 'any').find((x) => x.path.id === c.path)!
      payPerk(st, o, perk)
      if (st.paths[e.path.id].wall) {
        st.paths[e.path.id].wall = false
        log(st, `${k.name} ทุบกำแพง`, 'killer', { ev: { k: 'wallBreak', path: e.path.id } })
      }
      return killerEnter(st, e.path.id, e.to)
    }
    case 'unnerving_presence':
    case 'thanatophobia':
      payPerk(st, o, perk, 'ทอย Danger Die แทน')
      st.rollMods.danger = true
      return
    case 'stridor':
      payPerk(st, o, perk, `${name(c.target!)} ต้องเปิดการ์ดเคลื่อนที่`)
      st.stridor = c.target!
      return
    case 'huntress_lullaby': {
      const { s, card } = w as Extract<PerkWindow, { k: 'cardMove' }>
      payPerk(st, o, perk, `ทิ้ง ${CARD_NAMES[card]} — ${name(s)} เดินไม่ได้ แต่ยัง Interact ได้`)
      k.hand.splice(k.hand.indexOf(card), 1)
      st.moveBlocked = true
      return
    }
    case 'territorial_imperative': {
      payPerk(st, o, perk, 'ใช้พลังเพิ่ม')
      const turn = (w as Extract<PerkWindow, { k: 'afterKillerInteract' }>).turn
      wait(st, { t: 'killerInteract', turn, canInteract: true, powerOnly: true })
      return
    }
    case 'lightborn': {
      const card = k.planned[c.index!]
      payPerk(st, o, perk, `เปิดการ์ดใบที่ ${c.index! + 1}: ${CARD_NAMES[card]}`)
      k.shown.push(c.index!)
      gainKiller(st, 1)
      return
    }
    case 'enduring': {
      const { path, to } = w as Extract<PerkWindow, { k: 'palletBlock' }>
      payPerk(st, o, perk, 'ทำลาย Pallet แล้วเดินต่อ')
      palletOn(st, path)!.removed = true
      log(st, 'Pallet พัง', 'killer', { ev: { k: 'palletBreak', path } })
      return finishKillerMove(st, pathDef(st, path), to)
    }
    case 'tinkerer': {
      payPerk(st, o, perk, `เปลี่ยนการ์ดใบที่ ${c.index! + 1}`)
      const old = k.planned[c.index!]
      k.hand.splice(k.hand.indexOf(c.card!), 1, old)
      k.planned[c.index!] = c.card!
      k.shown = k.shown.filter((i) => i !== c.index)
      return
    }
    case 'prove_thyself':
      payPerk(st, o, perk, `${name(c.target!)} Interact แทน`)
      wait(st, { t: 'survivorInteract', s: c.target!, canInteract: true })
      return
    case 'leader': {
      const { s, path, to } = w as Extract<PerkWindow, { k: 'afterCardMove' }>
      const mover = s === o ? c.target! : (o as number)
      payPerk(st, o, perk, `${name(mover)} เดินตามไปด้วย`)
      return moveSurvivor(st, mover, pathDef(st, path), to)
    }
    case 'bond':
      payPerk(st, o, perk, 'ทอย 2 ลูก เลือกเก็บ 1')
      st.rollMods.keep = true
      return
    case 'sprint_burst': {
      const m = anyMoves(st, o as number).find((x) => x.path.id === c.path)!
      payPerk(st, o, perk)
      return moveSurvivor(st, o as number, m.path, m.to)
    }
    case 'adrenaline':
      payPerk(st, o, perk, 'Bonus Turn')
      return startBonusMove(st, o as number, c.card as PathKind)
    case 'quick_and_quiet': {
      payPerk(st, o, perk, 'ซ่อนใน Locker')
      st.props.find((p) => p.id === c.prop)!.occupant = o as number
      st.survivors[o as number].status = 'locker'
      return
    }
    case 'iron_will': {
      payPerk(st, o, perk, 'นับผลล้มเหลวเป็นสำเร็จ')
      const step = st.step as Extract<Step, { t: 'roll' }>
      step.dice = step.dice.map((d) => (isFailure(d) ? { ...d, asSuccess: true } : d))
      return
    }
    case 'saboteur': {
      if (c.mode === 'bp') {
        payPerk(st, o, perk, '+1 ▲')
        gainSurvivor(st, o as number, 1)
        return
      }
      payPerk(st, o, perk, 'จ่าย 2 ▲ เล่น Bonus Turn')
      st.survivors[o as number].bp -= 2
      return startBonusMove(st, o as number, c.card as PathKind)
    }
    case 'botany_knowledge':
      payPerk(st, o, perk, `รักษา ${name(c.target!)} — ทอย Danger Die`)
      return startRoll(st, { k: 'botany', s: o as number, target: c.target! }, 1, 'danger')
    case 'empathy': {
      const me = st.survivors[o as number]
      const other = st.survivors[c.target!]
      payPerk(st, o, perk, c.mode === 'take' ? `รับ 1 ▲ จาก ${other.name}` : `ให้ 1 ▲ แก่ ${other.name}`)
      if (c.mode === 'take') {
        other.bp--
        me.bp++
      } else {
        me.bp--
        other.bp++
      }
      return
    }
    case 'self_care':
      payPerk(st, o, perk, 'ทอย Danger Die')
      return startRoll(st, { k: 'selfCare', s: o as number }, 1, 'danger')
    case 'overcharge':
      payPerk(st, o, perk)
      return wound(st, c.target!, 'power', `${name(c.target!)} โดน Overcharge — บาดเจ็บ`)
    case 'overwhelming_presence': {
      const s = (w as Extract<PerkWindow, { k: 'preItem' }>).s
      payPerk(st, o, perk, `${name(s)} ทอย Danger Die`)
      return startRoll(st, { k: 'overwhelm', s }, 1, 'danger')
    }
    case 'the_third_seal':
      payPerk(st, o, perk, `ทิ้ง ${CARD_NAMES[c.card!]} — ผู้รอดชีวิตที่ใช้ ${CARD_NAMES[c.card!]} รอบนี้เดินไม่ได้`)
      k.hand.splice(k.hand.indexOf(c.card!), 1)
      st.sealedCard = c.card as PathKind
      return
    case 'devour_hope':
      payPerk(st, o, perk, 'Bonus Turn')
      k.hand.splice(k.hand.indexOf(c.card!), 1)
      k.planned.push(c.card!)
      k.bonusUsed = true
      st.phase = 'killer'
      st.queue.unshift({ k: 'killerTurn', turn: k.planned.length - 1, extra: true })
      return
    case 'ruin': {
      const gen = st.props.find((p) => p.id === c.prop)!
      payPerk(st, o, perk, `Generator ที่ ${roomName(st, gen.room!)} −1`)
      gen.progress--
      return
    }
    case 'shadowborn':
      payPerk(st, o, perk, 'วางการ์ดใบที่ 3')
      k.hand.splice(k.hand.indexOf(c.card!), 1)
      k.planned.push(c.card!)
      k.bonusUsed = true
      return
    case 'predator': {
      const sv = st.survivors[c.target!]
      payPerk(st, o, perk, `${sv.name} ต้องเปลี่ยนการ์ด`)
      sv.planned = null
      sv.plannedRevealed = false
      wait(st, { t: 'replaceCard', s: c.target! })
      return
    }
    case 'lithe':
    case 'alert': {
      const m = anyMoves(st, o as number).find((x) => x.path.id === c.path)!
      payPerk(st, o, perk)
      return moveSurvivor(st, o as number, m.path, m.to)
    }
    case 'technician': {
      payPerk(st, o, perk, 'Interact อีกครั้ง')
      wait(st, { t: 'survivorInteract', s: o as number, canInteract: true, exclude: (w as Extract<PerkWindow, { k: 'repairFail' }>).prop })
      return
    }
    case 'open_handed':
      payPerk(st, o, perk, `เปิดการ์ดฆาตกรใบที่ ${c.index! + 1}: ${CARD_NAMES[k.planned[c.index!]]}`)
      k.shown.push(c.index!)
      return
    case 'ace_in_the_hole': {
      const a2 = st.props.find((p) => p.id === c.prop)!
      const b = st.props.find((p) => p.id === c.prop2)!
      payPerk(st, o, perk, `สลับ ${a2.revealed ? PROP_NAMES[a2.kind] : 'prop'} กับ ${b.revealed ? PROP_NAMES[b.kind] : 'prop'} ที่ ${roomName(st, b.room!)}`)
      ;[a2.room, b.room] = [b.room, a2.room]
      return
    }
    case 'up_the_ante':
      payPerk(st, o, perk, `${k.name} +2 ▲`)
      gainKiller(st, 2)
      return startBonusMove(st, o as number, c.card as PathKind)
    case 'balanced_landing': {
      const p = pathDef(st, c.path!)
      const from = st.survivors[o as number].room
      payPerk(st, o, perk, 'เดินแทนการ Interact +1 ▲')
      moveSurvivor(st, o as number, p, p.a === from ? p.b : p.a)
      gainSurvivor(st, o as number, 1)
      return
    }
    case 'urban_evasion':
      payPerk(st, o, perk, 'เอากำแพงออกชั่วคราว')
      st.paths[c.path!].wall = false
      st.evadedWall = c.path!
      return
    case 'streetwise': {
      payPerk(st, o, perk, 'Chest ยังอยู่')
      st.props.find((p) => p.id === (w as Extract<PerkWindow, { k: 'afterRummage' }>).prop)!.removed = false
      return
    }
    case 'blood_echo':
      payPerk(st, o, perk)
      return wound(st, c.target!, 'perk', `${name(c.target!)} บาดเจ็บ (Blood Echo)`)
    case 'zanshin_tactics':
      // Both cards stay secret: the old one is discarded unseen, the new one set face down.
      payPerk(st, o, perk, `ทิ้งการ์ดใบที่ ${c.index! + 1} วางใบใหม่`)
      k.hand.splice(k.hand.indexOf(c.card!), 1)
      k.planned[c.index!] = c.card!
      k.shown = k.shown.filter((i) => i !== c.index)
      return
    case 'nemesis': {
      const p = st.props.find((x) => x.id === (w as Extract<PerkWindow, { k: 'afterPalletLocker' }>).prop)!
      payPerk(st, o, perk, `นำ ${PROP_NAMES[p.kind]} ออก`)
      p.removed = true
      if (p.occupant !== null) {
        st.survivors[p.occupant].status = 'board'
        log(st, `${name(p.occupant)} ออกจาก Locker`, p.occupant)
        p.occupant = null
      }
      return
    }
    case 'gearhead':
      payPerk(st, o, perk, 'Interact อีกครั้ง')
      wait(st, { t: 'killerInteract', turn: k.revealedCount - 1, canInteract: true })
      return
    case 'retribution':
      payPerk(st, o, perk, 'ทอย Danger Die แทน — ถ้าสำเร็จ ฆาตกร +2 ▲')
      st.rollMods.danger = true
      st.rollMods.retribution = true
      return
    case 'dead_mans_switch': {
      const p = st.props.find((x) => x.id === c.prop)!
      payPerk(st, o, perk, `${PROP_NAMES[p.kind]} ที่ ${roomName(st, p.room!)} −1`)
      p.progress--
      return
    }
    case 'breakout': {
      const m = anyMoves(st, c.target!).find((x) => x.path.id === c.path)!
      payPerk(st, o, perk, `ย้าย ${name(c.target!)}`)
      return moveSurvivor(st, c.target!, m.path, m.to)
    }
    case 'lucky_break':
      payPerk(st, o, perk)
      return makeHealthy(st, o as number, `${name(o as number)} หายบาดเจ็บ (Lucky Break)`, o as number)
    case 'any_means_necessary':
      payPerk(st, o, perk, 'ยอมบาดเจ็บ เล่น Bonus Turn')
      selfWound(st, o as number)
      return startBonusMove(st, o as number, c.card as PathKind)
    case 'red_herring': {
      const gen = st.props.find((p) => p.id === c.prop)!
      const task = st.queue.find((t): t is Extract<Task, { k: 'killerDo' }> => t.k === 'killerDo')!
      payPerk(st, o, perk, `${k.name} ต้องทำลาย Generator แทน`)
      task.i = { k: 'damage', prop: gen.id }
      if (gen.progress === 2) gainSurvivor(st, o as number, 1)
      return
    }
    case 'for_the_people':
      payPerk(st, o, perk, c.prop ? 'ยอมบาดเจ็บ ซ่อม Generator +1' : `ยอมบาดเจ็บ รักษา ${name(c.target!)}`)
      selfWound(st, o as number)
      if (c.prop) return addGenerator(st, st.props.find((p) => p.id === c.prop)!, 1, o as number)
      return makeHealthy(st, c.target!, `${name(c.target!)} หายบาดเจ็บ (For the People)`, o as number)
    case 'off_the_record': {
      const task = st.queue.find((t): t is Extract<Task, { k: 'resolveRoll' }> => t.k === 'resolveRoll')!
      payPerk(st, o, perk, `รับ 1 ▲ แทน ${k.name}`)
      task.fails--
      gainSurvivor(st, o as number, 1)
      return
    }
    case 'monitor_and_abuse':
    case 'bloodhound':
    case 'nurses_calling':
    case 'calm_spirit':
      return
  }
}

/** Yui and Zarina wound themselves for a perk (it counts as wounded this round, p.15). */
function selfWound(st: GameState, s: number) {
  const sv = st.survivors[s]
  sv.wounded = true
  sv.woundedThisRound = true
  log(st, `${sv.name} ยอมบาดเจ็บ`, s, { ev: { k: 'wound', s, by: 'perk' } })
}

/** Saying no to a perk that interrupted something: carry on as without it. */
function declinePerk(st: GameState, perk: PerkId, w: PerkWindow) {
  if (perk === 'enduring' && w.k === 'palletBlock') palletStop(st, w.path)
}

/** Wounded → healthy, from any source; A Nurse's Calling pays the killer (once per round). */
function makeHealthy(st: GameState, s: number, text: string, by: number) {
  const sv = st.survivors[s]
  if (!sv.wounded) return
  sv.wounded = false
  log(st, text, by, { ev: { k: 'heal', s, by } })
  if (perkReady(st, 'killer', 'nurses_calling')) {
    payPerk(st, 'killer', 'nurses_calling', '+2 ▲')
    gainKiller(st, 2)
  }
}

/** A bonus turn from a perk or a crow: the card goes through the usual card-move checks. */
function startBonusMove(st: GameState, s: number, card: PathKind) {
  const hand = st.survivorHands[st.survivors[s].hand]
  hand.splice(hand.indexOf(card), 1)
  st.activeSurvivor = s
  log(st, `${st.survivors[s].name} ทิ้ง ${CARD_NAMES[card]} เล่น Bonus Turn`, s)
  st.queue.unshift({ k: 'cardMove', s, card }, { k: 'survivorInteract', s })
}

// ---------- killer powers ----------

export function isPower(i: KillerInteraction): boolean {
  return ['power', 'blink', 'hatchet', 'chainsaw', 'spark', 'phantasm', 'bell', 'wrath', 'redeemer'].includes(i.k)
}

/** Yamaoka's Wrath: wounded survivors and Hex Totems in The Oni's room and connected rooms. */
export function wrathGain(st: GameState): number {
  const rooms = [st.killer.room, ...connectedRooms(st, st.killer.room)]
  const wounded = st.survivors.filter((sv) => sv.status === 'board' && sv.wounded && rooms.includes(sv.room)).length
  const totems = st.props.filter((p) => p.kind === 'totem' && p.revealed && !p.removed && rooms.includes(p.room!)).length
  return wounded + totems
}

/**
 * Redeemer targets: wounded survivors in a connected room, with no pallet or wall on a path
 * between. Not one wounded this round: he picks them up, and that can't be done yet (p.15).
 */
export function redeemerTargets(st: GameState): number[] {
  const k = st.killer
  return st.survivors.flatMap((sv, i) => {
    if (sv.status !== 'board' || !sv.wounded || sv.woundedThisRound || sv.room === k.room) return []
    const clear = touchingPaths(st, k.room).some((p) => (p.a === sv.room || p.b === sv.room) && !st.paths[p.id].wall && !palletOn(st, p.id))
    return clear ? [i] : []
  })
}

/** The killer's power uses available now (once per round, instead of interacting, p.14). */
export function powerOptions(st: GameState): KillerInteraction[] {
  const k = st.killer
  if (k.powerUsed) return []
  switch (k.characterId) {
    case 'trapper':
      return trapPlacements(st)
    case 'nurse':
      // Spencer's Last Breath: any connected room, through pallets and walls, even against a vault.
      return touchingPaths(st, k.room).map((p) => ({ k: 'blink', path: p.id }))
    case 'huntress': {
      // Hunting Hatchets: a survivor in a connected room (not this one).
      const rooms = connectedRooms(st, k.room)
      return st.survivors.flatMap((sv, i) => (sv.status === 'board' && rooms.has(sv.room) ? [{ k: 'hatchet' as const, target: i }] : []))
    }
    case 'doctor': {
      // Carter's Spark: this room or a connected one, with survivors in it.
      const rooms = [k.room, ...connectedRooms(st, k.room)]
      return rooms.filter((r) => onBoardIn(st, r).length).map((room) => ({ k: 'spark' as const, room }))
    }
    case 'oni':
      // Yamaoka's Wrath: worth using only when it gains something.
      return wrathGain(st) > 0 ? [{ k: 'wrath' }] : []
    case 'deathslinger': {
      // Redeemer: a target, and the card discarded face down for them to guess.
      const out: KillerInteraction[] = []
      for (const target of redeemerTargets(st)) for (const card of new Set(k.hand)) out.push({ k: 'redeemer', target, card })
      return out
    }
    case 'hag':
      // Phantasm Trap: one per room, 7 in all.
      return st.phantasm.length < PHANTASM_TRAPS && !st.phantasm.includes(k.room) ? [{ k: 'phantasm' }] : []
    case 'wraith': {
      // Wailing Bell: any room not connected to this one.
      const near = connectedRooms(st, k.room)
      return boardOf(st)
        .rooms.filter((r) => r.id !== k.room && !near.has(r.id))
        .map((r) => ({ k: 'bell' as const, room: r.id }))
    }
    case 'hillbilly': {
      // Chainsaw: discard a card (not Wait) to move along a free path of its colour.
      const out: KillerInteraction[] = []
      for (const card of new Set(k.hand)) {
        if (card === 'wait') continue
        for (const e of exits(st, k.room, card)) if (pathFree(st, e.path.id)) out.push({ k: 'chainsaw', card, path: e.path.id })
      }
      return out
    }
  }
  return []
}

function usePower(st: GameState, i: KillerInteraction) {
  const k = st.killer
  k.powerUsed = true
  switch (i.k) {
    case 'power': {
      if (i.remove) st.paths[i.remove].trap = false
      else k.trapsInSupply--
      st.paths[i.path].trap = true
      log(st, `${k.name} วาง Bear Trap${i.remove ? ' (ย้ายจากเส้นทางเดิม)' : ''}`, 'killer', { ev: { k: 'trapSet', path: i.path } })
      return
    }
    case 'blink': {
      const p = pathDef(st, i.path)
      log(st, `${k.name} ใช้ Spencer's Last Breath`, 'killer')
      return killerEnter(st, p.id, p.a === k.room ? p.b : p.a)
    }
    case 'hatchet':
      log(st, `${k.name} ขว้าง Hatchet ใส่ ${st.survivors[i.target].name} — ทอย Danger Die`, 'killer')
      return startRoll(st, { k: 'hatchet', s: i.target }, 1, 'danger')
    case 'spark': {
      log(st, `${k.name} ใช้ Carter's Spark ที่ ${roomName(st, i.room)}`, 'killer')
      const order = turnOrder(st)
      return sparkNext(st, onBoardIn(st, i.room).sort((a2, b) => order.indexOf(a2) - order.indexOf(b)))
    }
    case 'phantasm': {
      st.phantasm.push(k.room)
      log(st, `${k.name} วาง Phantasm Trap ที่ ${roomName(st, k.room)}`, 'killer', { ev: { k: 'phantasmSet', room: k.room } })
      if (propsIn(st, k.room).some((p) => p.kind === 'totem' && p.revealed)) gainKiller(st, 1)
      return
    }
    case 'bell':
      log(st, `${k.name} ตี Wailing Bell`, 'killer')
      return killerEnter(st, '', i.room)
    case 'wrath': {
      const n = wrathGain(st)
      log(st, `${k.name} ใช้ Yamaoka's Wrath (+${n} ▲)`, 'killer')
      return gainKiller(st, n)
    }
    case 'redeemer':
      k.hand.splice(k.hand.indexOf(i.card), 1)
      st.redeemer = i.card
      log(st, `${k.name} ทิ้งการ์ด 1 ใบแบบคว่ำ ยิง Redeemer ใส่ ${st.survivors[i.target].name} — ให้ทายการ์ด`, 'killer')
      return wait(st, { t: 'redeemerGuess', s: i.target })
    case 'chainsaw': {
      const to = exits(st, k.room, i.card as PathKind).find((e) => e.path.id === i.path)!.to
      k.hand.splice(k.hand.indexOf(i.card), 1)
      log(st, `${k.name} ทิ้ง ${CARD_NAMES[i.card]} ใช้ Chainsaw`, 'killer')
      killerEnter(st, i.path, to)
      // After the reveal and Quick & Quiet: who is still standing there gets cut.
      st.queue.splice(2, 0, { k: 'chainsawHit', room: to })
      return
    }
  }
}

/** Carter's Spark, one survivor at a time: those with ▲ choose, the others take it. */
function sparkNext(st: GameState, list: number[]) {
  const rest = [...list]
  while (rest.length) {
    const s = rest.shift()!
    if (st.survivors[s].bp >= 1) return wait(st, { t: 'sparkChoice', s, rest })
    sparkHit(st, s)
  }
}

function sparkHit(st: GameState, s: number) {
  const sv = st.survivors[s]
  if (!sv.madness) {
    sv.madness = true
    log(st, `${sv.name} ติด Madness`, 'killer', { ev: { k: 'madness', s, on: true } })
  } else wound(st, s, 'power', `${sv.name} โดน Carter's Spark — บาดเจ็บ`)
}

/** What The Hag may do after teleporting to a Phantasm Trap: attack or pick up someone there. */
export function phantasmInteractions(st: GameState, room: string): KillerInteraction[] {
  return onBoardIn(st, room).flatMap((t): KillerInteraction[] => {
    const sv = st.survivors[t]
    if (!sv.wounded) return [{ k: 'attack', target: t }]
    return sv.woundedThisRound ? [] : [{ k: 'pickUp', target: t }]
  })
}

function chainsawHit(st: GameState, room: string) {
  const healthy = onBoardIn(st, room).filter((s) => !st.survivors[s].wounded)
  if (healthy.length === 1) return wound(st, healthy[0], 'power', `${st.survivors[healthy[0]].name} โดน Chainsaw — บาดเจ็บ`)
  if (healthy.length > 1) wait(st, { t: 'pickSurvivor', why: 'chainsaw', options: healthy })
}

/** The survivor names a card; a wrong guess reels them into The Deathslinger's room and he picks them up. */
function redeemerGuess(st: GameState, s: number, guess: MoveCard) {
  const k = st.killer
  const sv = st.survivors[s]
  const card = st.redeemer ?? fail('no Redeemer card')
  st.redeemer = null
  if (guess === card) {
    log(st, `${sv.name} ทาย ${CARD_NAMES[guess]} — ถูก! การ์ดคือ ${CARD_NAMES[card]} หลุดจาก Redeemer`, s)
    return
  }
  log(st, `${sv.name} ทาย ${CARD_NAMES[guess]} — ผิด การ์ดคือ ${CARD_NAMES[card]}`, s)
  const path = touchingPaths(st, k.room).find((p) => (p.a === sv.room || p.b === sv.room) && !st.paths[p.id].wall && !palletOn(st, p.id))
  const from = sv.room
  sv.room = k.room
  emit(st, { k: 'move', who: s, from, to: k.room, path: path?.id ?? '' }, s)
  log(st, `${k.name} ดึง ${sv.name} เข้ามาแล้วอุ้ม`, 'killer', { ev: { k: 'pickUp', s } })
  pickUp(st, s)
}

function wound(st: GameState, s: number, by: 'attack' | 'trap' | 'power' | 'perk', text: string) {
  const sv = st.survivors[s]
  if (sv.wounded) return
  sv.wounded = true
  sv.woundedThisRound = true
  log(st, text, 'killer', { ev: { k: 'wound', s, by } })
}
