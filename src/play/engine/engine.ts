// Rules engine for the full game (Adept mode: the printed perks). A pure reducer:
// `apply(state, action)` returns a new state and never mutates its input.
//
// Flow: `state.step` is the input the game is waiting for. Handling an action may queue
// tasks (`state.queue`); they run in order until one of them needs input again. Page
// numbers refer to the rulebook (see docs/rules-th.md). Rulings for unclear rules are
// listed in play/README.md.

import { boards } from './boards'
import { deckOf, layLoadout } from './loadout'
import { PERKS, type PerkId } from './perks'
import type {
  Action,
  Guard,
  BoardDef,
  Die,
  EntityPlace,
  GameEvent,
  GameState,
  ItemUse,
  KillerInteraction,
  DirectCard,
  MoveCard,
  PathDef,
  PathKind,
  PathState,
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

/** A survivor's ▲ maximum: The Trickster's passive takes 2 off for each Knife they hold. */
export function survivorMax(st: GameState, s: number): number {
  return Math.max(0, SURVIVOR_BP.max - 2 * (st.survivors[s].knives ?? 0))
}

/** Can be made healthy: wounded, and not holding three Knives (The Trickster's passive). */
export function healable(st: GameState, s: number): boolean {
  const sv = st.survivors[s]
  // Leverage: not this round
  return sv.wounded && (sv.knives ?? 0) < 3 && st.leverage !== s
}
export const KILLER_BP = { start: 4, max: 12 }
export const SACRIFICE_TO_WIN = 8
export const GENERATORS_TO_POWER = 4
export const PROGRESS_MAX = 3
export const KILLER_BONUS_COST = 4
export const PHANTASM_TRAPS = 7
export const VILE_PURGES = 10

/** The killer's bonus turn costs 4 ▲; The Doctor's passive takes 1 off per survivor with Madness. */
export function bonusCost(st: GameState): number {
  if (st.killer.characterId !== 'doctor') return KILLER_BONUS_COST
  return Math.max(0, KILLER_BONUS_COST - st.survivors.filter((sv) => sv.madness).length)
}
export const BEAR_TRAPS = 4
export const SURVIVOR_CARDS: PathKind[] = ['sneak', 'sprint', 'crouch', 'vault']
export const KILLER_CARDS: MoveCard[] = ['sneak', 'sprint', 'crouch', 'vault', 'wait']

/** The Dredge's passive: six direct movement cards, one per start room's face (skull = 0). */
export const DIRECT_CARDS: DirectCard[] = ['skull', 'one', 'two', 'three', 'four', 'five']
export const isDirect = (c: MoveCard): c is DirectCard => (DIRECT_CARDS as MoveCard[]).includes(c)
export const isPathCard = (c: MoveCard): c is PathKind => c !== 'wait' && !isDirect(c)
/** The start room a direct card goes to. */
export function directRoom(st: GameState, c: DirectCard): string {
  return boardOf(st).rooms.find((r) => r.startFace === DIRECT_CARDS.indexOf(c))!.id
}

/**
 * The killer's hand each round: The Blight's passive gives two of each path card and no Wait; the
 * Dredge's, his six direct cards (no Wait either).
 */
export function killerDeck(killerId: string): MoveCard[] {
  if (killerId === 'dredge') return [...DIRECT_CARDS]
  return killerId === 'blight' ? [...SURVIVOR_CARDS, ...SURVIVOR_CARDS] : [...KILLER_CARDS]
}

/** Take one copy of each card from `hand`; null when a card isn't there (enough times). */
function takeCards(hand: MoveCard[], cards: MoveCard[]): MoveCard[] | null {
  const left = [...hand]
  for (const c of cards) {
    const i = left.indexOf(c)
    if (i < 0) return null
    left.splice(i, 1)
  }
  return left
}

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
  drone: 'Drone',
  emp: 'EMP',
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
  skull: 'การ์ดตรง 💀',
  one: 'การ์ดตรง 1',
  two: 'การ์ดตรง 2',
  three: 'การ์ดตรง 3',
  four: 'การ์ดตรง 4',
  five: 'การ์ดตรง 5',
}

// ---------- setup ----------

export interface GameConfig {
  board: string
  /** `perks`: the 3 perks played (Bloodweb, Devout, p.19); missing: the printed ones (Adept). */
  survivors: { id: string; name: string; perks?: PerkId[] }[]
  killer: { id: string; name: string; perks?: PerkId[] }
  /** 3–5 players: with fewer than 5, one player controls two survivors sharing a hand (p.19). */
  players: 3 | 4 | 5
  seed: number
  /** Starting ▲ when the table changes them (online room settings); else the rulebook's (p.6). */
  startBp?: { survivor: number; killer: number }
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
        bp: config.startBp?.survivor ?? SURVIVOR_BP.start,
        item: null,
        sacrificeToken: true,
        hand: hands[i],
        planned: null,
        plannedRevealed: false,
        acted: false,
        madness: false,
        ...layLoadout(c.id, c.perks),
      }),
    ),
    survivorHands: Array.from({ length: handCount }, () => [...SURVIVOR_CARDS]),
    handPlayers: Array.from({ length: handCount }, (_, h) => h + 2),
    killer: {
      characterId: config.killer.id,
      name: config.killer.name,
      room: board.rooms[0].id,
      bp: config.startBp?.killer ?? KILLER_BP.start,
      hand: killerDeck(config.killer.id),
      planned: [],
      revealedCount: 0,
      plannedShown: false,
      powerUsed: false,
      bonusUsed: false,
      trapsInSupply: BEAR_TRAPS,
      shown: [],
      perks: layLoadout(config.killer.id, config.killer.perks).perks,
    },
    props: [],
    // one state per path icon (a fork's pairs share theirs)
    paths: Object.fromEntries(board.paths.filter((p) => tokenOf(board, p.id) === p.id).map((p) => [p.id, { wall: p.wall, trap: false }])),
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

  // The Artist's passive: three Dire Crows on his board.
  if (config.killer.id === 'artist')
    for (let d = 1; d <= 3; d++)
      st.props.push({ id: `dire${d}`, kind: 'crow', category: 'altruism', room: null, path: null, revealed: true, removed: true, progress: 0, done: false, occupant: null, dire: true, artist: true })

  // Step 9: item deck.
  st.itemDeck = shuffle(st, Object.entries(ITEM_COUNTS).flatMap(([id, c]) => Array<string>(c).fill(id)))

  // Step 2: first player marker.
  st.firstPlayer = Math.floor(random(st) * 4)

  // Step 5 (cont.): each survivor, in turn order, reveals one prop anywhere. The minis come onto
  // the board after that (step 11), so nobody reveals knowing where anyone starts.
  st.startPending = true
  st.step = { t: 'setupReveal', s: st.firstPlayer }
  return st
}

/**
 * The Skull Merchant's passive: after setup, a face-down Drone into each room, shuffled in with the
 * room's face-down objective props (the tiles of a colour look alike face down: the kinds are dealt
 * among them again).
 */
function placeDrones(st: GameState) {
  if (st.killer.characterId !== 'skullmerchant' || st.props.some((p) => p.kind === 'drone')) return
  for (const room of boardOf(st).rooms) {
    st.props.push({ id: `drone-${room.id}`, kind: 'drone', category: 'objective', room: room.id, path: null, revealed: false, removed: false, progress: 0, done: false, occupant: null })
    const hidden = st.props.filter((p) => p.room === room.id && p.category === 'objective' && !p.revealed && !p.removed)
    const kinds = shuffle(st, hidden.map((p) => p.kind))
    hidden.forEach((p, i) => (p.kind = kinds[i]))
  }
}

/**
 * The Singularity's passive: after setup, a face-down EMP into each room, shuffled in with the room's
 * face-down survival props (as Drones are with the objective ones).
 */
function placeEmps(st: GameState) {
  if (st.killer.characterId !== 'singularity' || st.props.some((p) => p.kind === 'emp')) return
  for (const room of boardOf(st).rooms) {
    st.props.push({ id: `emp-${room.id}`, kind: 'emp', category: 'survival', room: room.id, path: null, revealed: false, removed: false, progress: 0, done: false, occupant: null })
    const hidden = st.props.filter((p) => p.room === room.id && p.category === 'survival' && !p.revealed && !p.removed)
    const kinds = shuffle(st, hidden.map((p) => p.kind))
    hidden.forEach((p, i) => (p.kind = kinds[i]))
  }
}

/** A face-up EMP in this room (The Singularity's passive). */
export const empIn = (st: GameState, room: string) => propsIn(st, room).find((p) => p.kind === 'emp' && p.revealed)

// ---------- The Unknown: four minis, one of them "the killer" at a time ----------

/** The Unknowns on the board, by number - 1 (each one's room; the acting one stands in `room`). */
export function unknownRooms(st: GameState): (string | null)[] {
  const k = st.killer
  if (!k.unknowns) return []
  return k.unknowns.map((r, i) => (i === (k.unknownAt ?? 0) ? k.room : r))
}

/** How many Unknowns stand on the board (they are placed lowest number first: 1..n). */
export function unknownCount(st: GameState): number {
  return unknownRooms(st).filter((r) => r !== null).length
}

/**
 * The killer stands in `room`: his mini (Charlotte for The Twins), or any Unknown — all of them
 * are "the Killer" (The Unknown's passive). For what survivors ask of the killer's room.
 */
export function killerIn(st: GameState, room: string): boolean {
  return room === charlotteRoom(st) || unknownRooms(st).includes(room)
}

/** The Unknown numbered `i + 1` becomes "the killer" (stands in `room`). */
function actAs(st: GameState, i: number) {
  const k = st.killer
  if (!k.unknowns || (k.unknownAt ?? 0) === i || !k.unknowns[i]) return
  k.unknowns[k.unknownAt ?? 0] = k.room
  k.room = k.unknowns[i]!
  k.unknownAt = i
}

/** Something a survivor does sends "the killer" in `room` somewhere: the Unknown standing there. */
function actAtRoom(st: GameState, room: string) {
  const i = unknownRooms(st).indexOf(room)
  if (i >= 0) actAs(st, i)
}

/** Cards the killer plans: one per Unknown on the board for The Unknown, two for anyone else. */
export function killerCardCount(st: GameState): number {
  // The Singularity's passive: 3 cards, 3 turns
  if (st.killer.characterId === 'singularity') return 3
  return st.killer.unknowns ? unknownCount(st) : 2
}

/** Drones on The Skull Merchant's board. */
export function merchantDrones(st: GameState): Prop[] {
  return st.props.filter((p) => p.kind === 'drone' && p.merchant)
}

/** Setup step 11 (p.6): every mini rolls a skill check die for its start room. */
function rollStartRooms(st: GameState) {
  // a game saved mid-setup before this order came in has its minis placed already
  if (!st.startPending) return
  delete st.startPending
  const board = boardOf(st)
  const startRoom = (face: number) => board.rooms.find((r) => r.startFace === face)!.id
  st.survivors.forEach((sv, i) => {
    const face = rollFace(st)
    sv.room = startRoom(face)
    log(st, `${sv.name} ทอยได้ ${face} เริ่มที่ ${roomName(st, sv.room)}`, i)
  })
  const kf = rollFace(st)
  st.killer.room = startRoom(kf)
  placeDrones(st)
  placeEmps(st)
  // The Unknown's passive: setup is made with The Unknown labelled 1; the others wait off the board
  if (st.killer.characterId === 'unknown' && !st.killer.unknowns)
    Object.assign(st.killer, { unknowns: [st.killer.room, null, null, null], unknownAt: 0, bonusUsed: true })
  log(st, `${st.killer.name} ทอยได้ ${kf} เริ่มที่ ${roomName(st, st.killer.room)}`, 'killer')
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
  // Shadow Step's Entity: "players cannot move along that path" — the killer neither
  const e = st.entity
  const shut = e && 'path' in e && e.shadow ? e.path : null
  for (const p of boardOf(st).paths) {
    if (kind !== 'any' && p.kind !== kind) continue
    if (shut && tokenOf(boardOf(st), p.id) === shut) continue
    if (p.a === room) out.push({ path: p, to: p.b })
    else if (p.b === room && p.kind !== 'vault') out.push({ path: p, to: p.a })
  }
  return out
}

/** Paths touching `room` in either direction ("connected", p.16). */
export function touchingPaths(st: GameState, room: string): PathDef[] {
  return boardOf(st).paths.filter((p) => p.a === room || p.b === room)
}

/** The icon a path belongs to (itself, or the first pair of a fork). */
export function tokenOf(board: BoardDef, path: string): string {
  return board.paths.find((p) => p.id === path)?.token ?? path
}

/** Wall and bear trap on a path's icon (shared by a fork's pairs). */
export function pathState(st: GameState, path: string): PathState {
  return st.paths[tokenOf(boardOf(st), path)]
}

/** Path icons touching `room`, once each (a fork has one icon for several pairs). */
function touchingTokens(st: GameState, room: string): string[] {
  return [...new Set(touchingPaths(st, room).map((p) => tokenOf(boardOf(st), p.id)))]
}

export function palletOn(st: GameState, path: string): Prop | undefined {
  const t = tokenOf(boardOf(st), path)
  return st.props.find((p) => p.path !== null && tokenOf(boardOf(st), p.path) === t && !p.removed)
}

/** Props standing in a room (not removed, not on a path, not a repaired generator). */
export function propsIn(st: GameState, room: string): Prop[] {
  return st.props.filter((p) => p.room === room && !p.removed && !p.done)
}

function entityOn(st: GameState, place: { prop: string } | { path: string }): boolean {
  const e = st.entity
  if (!e) return false
  // on a path, the Entity covers its icon: every pair of a fork
  return 'prop' in place ? 'prop' in e && e.prop === place.prop : 'path' in e && e.path === tokenOf(boardOf(st), place.path)
}

/** A survivor can't pass: a wall, or the Entity on it (Bamboozle: a wall to them, open to the killer). */
function blocked(st: GameState, path: string): boolean {
  return pathState(st, path).wall || entityOn(st, { path })
}

/** A path with nothing on it: no wall, pallet, bear trap or entity token. */
function pathFree(st: GameState, path: string): boolean {
  const ps = pathState(st, path)
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
  return d.kind === 'skill' ? d.face === 0 || d.asFailure === true : !DANGER_GREAT.includes(d.face)
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
  return exits(st, st.survivors[s].room, card).filter((e) => !blocked(st, e.path.id))
}

/** "Move along any path" (rescue, p.13): any colour, vault still one-way, walls block. */
export function anyMoves(st: GameState, s: number): { path: PathDef; to: string }[] {
  return exits(st, st.survivors[s].room, 'any').filter((e) => !blocked(st, e.path.id))
}

/** The killer breaks walls and pallets (p.14), so every path of the colour is open. */
export function killerMoves(st: GameState, card: PathKind): { path: PathDef; to: string }[] {
  return exits(st, st.killer.room, card)
}

/** While carrying: any path, but not over pallets or through walls (p.15). */
export function carryMoves(st: GameState): { path: PathDef; to: string }[] {
  return exits(st, st.killer.room, 'any').filter((e) => !pathState(st, e.path.id).wall && !palletOn(st, e.path.id))
}

export function survivorInteractions(st: GameState, s: number): SurvivorInteraction[] {
  const sv = st.survivors[s]
  if (sv.status !== 'board') return []
  const step = st.step
  const mine = step.t === 'survivorInteract' && step.s === s ? step : null
  const exclude = mine?.exclude
  return allSurvivorInteractions(st, s).filter((i) => {
    if (exclude && 'prop' in i && i.prop === exclude) return false
    // Desperate Measures: the second interaction targets a survival prop (chest, locker)
    if (mine?.survivalOnly) return 'prop' in i && st.props.find((p) => p.id === i.prop)!.category === 'survival'
    return true
  })
}

function allSurvivorInteractions(st: GameState, s: number): SurvivorInteraction[] {
  const sv = st.survivors[s]
  const out: SurvivorInteraction[] = []
  for (const p of propsIn(st, sv.room)) {
    // the Entity on it (Corrupt Intervention): nobody interacts with it (a hook's own case below)
    if (!p.revealed || (p.kind !== 'hook' && entityOn(st, { prop: p.id }))) continue
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
        for (const path of touchingTokens(st, sv.room)) if (pathFree(st, path)) out.push({ k: 'dropPallet', prop: p.id, path })
        break
      case 'drone':
        out.push({ k: 'drone', prop: p.id })
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
  for (const t of onBoardIn(st, sv.room)) if (t !== s && healable(st, t)) out.push({ k: 'heal', target: t })
  // Collective Stealth (Renato), Power of Two (Thalita): someone else here may interact with them instead
  for (const t of onBoardIn(st, sv.room))
    for (const perk of ['collective_stealth', 'power_of_two'] as const) if (t !== s && perkReady(st, t, perk)) out.push({ k: 'partner', target: t, perk })
  // The Twins: Victor can be removed by a survivor in his room.
  if (victorRoom(st) === sv.room) out.push({ k: 'removeVictor' })
  // Power Struggle (Élodie): with the killer (Charlotte for The Twins), before their first card.
  if (killerIn(st, sv.room) && st.killer.revealedCount === 0 && st.killer.planned.length && perkReady(st, s, 'power_struggle')) out.push({ k: 'powerStruggle' })
  // Diversion (Adam): send the killer in this room along any path but one with a pallet (a wall
  // he breaks on the way, as on any move of his).
  if (killerIn(st, sv.room) && victorRoom(st) !== sv.room && perkReady(st, s, 'diversion'))
    for (const p of touchingPaths(st, sv.room)) if (!palletOn(st, p.id)) out.push({ k: 'diversion', path: p.id })
  return out
}

/** The killer's interactions with the props standing in `room`. */
function propInteractions(st: GameState, room: string): KillerInteraction[] {
  const out: KillerInteraction[] = []
  for (const p of propsIn(st, room)) {
    if (!p.revealed || entityOn(st, { prop: p.id })) continue
    if (p.kind === 'locker' && p.occupant !== null) out.push({ k: 'search', prop: p.id })
    if (p.kind === 'crow') out.push({ k: 'scout', prop: p.id })
    // Damage needs no progress to remove (p.14); with none it still counts (Overcharge, Alert).
    if (p.kind === 'generator') out.push({ k: 'damage', prop: p.id })
    if (p.kind === 'totem') out.push({ k: 'venerate', prop: p.id })
  }
  return out
}

/** `step`: the step being answered (handle() has already set the state's step to idle). */
export function killerInteractions(st: GameState, step: Step = st.step): KillerInteraction[] {
  const k = st.killer
  const out: KillerInteraction[] = propInteractions(st, k.room)
  // Hoarder (The Twins): a chest here, removed for 2 ▲.
  if (perkReady(st, 'killer', 'hoarder'))
    for (const p of propsIn(st, k.room)) if (p.kind === 'chest' && p.revealed) out.push({ k: 'hoard', prop: p.id })
  for (const t of onBoardIn(st, k.room)) {
    const sv = st.survivors[t]
    if (!sv.wounded) out.push({ k: 'attack', target: t })
    else if (!sv.woundedThisRound) out.push({ k: 'pickUp', target: t })
  }
  // Pain Resonance (The Artist): an empty hook here, and a healthy survivor next door is wounded.
  if (perkReady(st, 'killer', 'pain_resonance') && k.bp >= PERKS.pain_resonance.cost && usableHook(st, k.room))
    for (const r of connectedRooms(st, k.room)) for (const t of onBoardIn(st, r)) if (!st.survivors[t].wounded) out.push({ k: 'painResonance', target: t })
  // Undying (The Blight): discard a card (not Wait) to interact with a prop in a room joined to
  // this one by a path of that card's colour.
  if (perkReady(st, 'killer', 'undying'))
    for (const card of new Set(k.hand))
      if (card !== 'wait')
        for (const p of touchingPaths(st, k.room))
          if (p.kind === card) for (const i of propInteractions(st, p.a === k.room ? p.b : p.a)) out.push({ k: 'undying', card, i })
  out.push(...powerOptions(st))
  // Blighted Corruption: after entering a room with it, the power can go again.
  if (step.t === 'killerInteract' && step.rush && k.hand.length) out.push({ k: 'rush' })
  // Guardian: he walked in on them, so this turn he may only attack or pick up that survivor —
  // no power, no prop, no walking on. With neither open to him, he does nothing this turn.
  if (step.t === 'killerInteract' && step.only !== undefined) return out.filter((i) => (i.k === 'attack' || i.k === 'pickUp') && i.target === step.only)
  const guarded = st.guardian
  if (guarded !== null && guarded !== undefined) return out.filter((i) => (i.k === 'attack' || i.k === 'pickUp') && i.target === guarded)
  return out
}

/** The Trapper's Bear Trap: a connected path without pallet, wall or other component. */
export function trapPlacements(st: GameState): KillerInteraction[] {
  const k = st.killer
  if (k.characterId !== 'trapper') return []
  const out: KillerInteraction[] = []
  const placed = Object.keys(st.paths).filter((id) => pathState(st, id).trap)
  for (const path of touchingTokens(st, k.room)) {
    if (!pathFree(st, path)) continue
    if (k.trapsInSupply > 0) out.push({ k: 'power', path })
    for (const r of placed) out.push({ k: 'power', path, remove: r })
  }
  return out
}

/** Moves along any path that the survivor must make, with no staying put: Dead Hard, Spine Chill. */
export function mustMove(why?: 'antidote' | 'deadHard' | 'spineChill' | 'collective'): boolean {
  return why === 'deadHard' || why === 'spineChill'
}

/** Survivor can act with items: not hidden, hooked or carried (p.12, p.15). */
function canUseItems(st: GameState, s: number): boolean {
  return st.survivors[s].status === 'board' && !['gameOver', 'reaction', 'keepItem', 'pickItem', 'selfAware', 'setupReveal', 'revealProp', 'offer', 'pickSurvivor', 'idle'].includes(st.step.t)
}

export function itemUses(st: GameState, s: number): ItemUse[] {
  const sv = st.survivors[s]
  // Built to Last: a kept item rests until the turn ends
  if (!sv.item || !canUseItems(st, s) || st.itemLock === s) return []
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
      if (survivorTurn) for (const t of onBoardIn(st, sv.room)) if (healable(st, t)) out.push({ k: 'heal', target: t })
      break
    case 'firecracker':
      for (const path of touchingTokens(st, sv.room)) if (pathState(st, path).wall) out.push({ k: 'wall', path })
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
  const step = st.step
  if (step.t !== 'roll' || step.dice.every((d) => d.rerolled)) return []
  // on the board — or the survivor being carried, on their own roll to struggle free (house rule)
  const ownCarry = (i: number) => step.ctx.k === 'carry' && step.ctx.s === i && st.survivors[i].status === 'carried'
  return st.survivors.flatMap((sv, i) =>
    (sv.status === 'board' || ownCarry(i)) && sv.item && sv.item in KEY_BP && st.itemLock !== i && !step.passed?.includes(i) ? [i] : [],
  )
}

// ---------- apply ----------

class IllegalAction extends Error {}

export function apply(prev: GameState, action: Action): GameState {
  const st: GameState = structuredClone(prev)
  if (st.phase === 'over') throw new IllegalAction('game over')
  // The state never keeps a reference to the caller's action: one may hold a Vue proxy (the props
  // picked on the map), which a queued task would carry into the state, and the next structuredClone
  // of it would throw — every later action refused.
  handle(st, JSON.parse(JSON.stringify(action)) as Action)
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
  if (a.t === 'passRoll') return passRoll(st, a.s)
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
      else {
        rollStartRooms(st)
        startPlanning(st)
      }
      return
    }
    case 'planStridor': {
      if (a.t !== 'planStridor') break
      const sv = st.survivors[step.s]
      const pool = st.survivorHands[sv.hand]
      if (a.card === 'wait' || !pool.includes(a.card)) fail('card not in hand')
      st.survivorHands = st.survivorHands.map((h, i) => (i === sv.hand ? h.filter((_, j) => j !== h.indexOf(a.card)) : h))
      sv.planned = a.card
      sv.plannedRevealed = true
      sv.acted = false
      log(st, `${step.s === st.stridor ? 'เสียงแหบดัง' : 'Dire Crow'}: ${sv.name} ต้องเปิดการ์ดก่อนใคร — ${CARD_NAMES[a.card]}`, step.s)
      // the next one who must, or everyone else
      st.queue.unshift({ k: 'plan' })
      return
    }
    case 'planSurvivors': {
      // Online the killer plans alongside the survivors: their cards are face down to him either
      // way, so nobody learns anything new, and nobody waits for a turn to plan. His choice is
      // held until the survivors are in, and whoever confirms last starts the round.
      if (a.t === 'planKiller') {
        if (a.cards.length !== killerCardCount(st) || !takeCards(st.killer.hand, a.cards)) fail(`pick ${killerCardCount(st)} cards from the hand`)
        // the survivors were all in already (their plans still drafts): the round starts now
        const drafted = st.planDraft
        if (drafted && survivorsPlanned(st, drafted)) {
          delete st.planDraft
          planSurvivors(st, drafted)
          return finishKillerPlan(st, a.cards)
        }
        st.killerDraft = a.cards
        return wait(st, { t: 'planSurvivors' })
      }
      // Until the last one is in, a confirmed plan can be taken back and made again.
      if (a.t === 'unplanKiller') {
        if (!st.killerDraft) fail('no plan to take back')
        delete st.killerDraft
        return wait(st, { t: 'planSurvivors' })
      }
      if (a.t === 'unplanHand') {
        const draft = st.planDraft ?? []
        const mine = st.survivors.flatMap((sv, i) => (sv.hand === a.hand && draft[i] ? [i] : []))
        if (!mine.length) fail('no plan to take back')
        for (const i of mine) draft[i] = null
        st.planDraft = draft
        return wait(st, { t: 'planSurvivors' })
      }
      if (a.t === 'planHand') {
        // collect this hand's cards; the planning ends with the last hand
        const draft = st.planDraft ?? [null, null, null, null]
        // a survivor already placed (Stridor's, face up) plans no second card
        const mine = st.survivors.map((sv, i) => (sv.hand === a.hand && sv.status !== 'hooked' && sv.planned === null ? i : -1)).filter((i) => i >= 0)
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
        // Every plan stays a draft until the last of everyone's is in, the killer's too: until
        // then each survivor can still take theirs back (the killer confirming starts the round).
        if (!survivorsPlanned(st, draft) || !st.killerDraft) return wait(st, { t: 'planSurvivors' })
        delete st.planDraft
        planSurvivors(st, draft)
      } else {
        if (a.t !== 'planSurvivors') break
        planSurvivors(st, a.cards)
      }
      const draft = st.killerDraft
      delete st.killerDraft
      // the killer planned first (online): the round starts now
      if (draft && takeCards(st.killer.hand, draft)) return finishKillerPlan(st, draft)
      wait(st, { t: 'planKiller' })
      return
    }
    case 'planKiller': {
      if (a.t !== 'planKiller') break
      return finishKillerPlan(st, a.cards)
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
      const leave: PerkWindow = { k: 'survivorLeave', s: step.s, to: m.to, path: m.path.id }
      if (killerIn(st, st.survivors[step.s].room) && perkCandidates(st, leave, []).length) {
        st.queue.unshift({ k: 'trigger', w: leave, done: [] }, { k: 'survivorGo', s: step.s, path: m.path.id, to: m.to })
        return
      }
      if (killerIn(st, m.to) && perkCandidates(st, { k: 'preEnter', s: step.s, to: m.to, path: m.path.id }, []).length) {
        st.queue.unshift({ k: 'trigger', w: { k: 'preEnter', s: step.s, to: m.to, path: m.path.id }, done: [] }, { k: 'survivorGo', s: step.s, path: m.path.id, to: m.to })
        return
      }
      return cardMoveTo(st, step.s, m.path, m.to)
    }
    case 'killerAnyMove': {
      if (a.t === 'stop') return log(st, `${actorName(st)} อยู่ห้องเดิม`, 'killer')
      if (a.t !== 'move') break
      const m = antidoteKillerMoves(st).find((e) => e.path.id === a.path) ?? fail('cannot move there')
      if (askLeave(st, m.to, step, a)) return
      // a Firecracker in the room ahead may stop him, as on his card moves
      const holders = onBoardIn(st, m.to).filter((i) => st.survivors[i].item === 'firecracker' && st.itemLock !== i)
      if (holders.length > 0 && !a.reacted) return wait(st, { t: 'reaction', item: 'firecracker', holders, pending: { t: 'move', path: m.path.id }, antidote: true, ...(step.why ? { why: step.why } : {}) })
      log(st, `${actorName(st)} เดินต่อด้วย ${step.why === 'darkness' ? 'เผยความมืดมิด' : 'ยาแก้พิษส่งท้าย'}`, 'killer')
      return finishKillerMove(st, m.path, m.to)
    }
    case 'anyMove': {
      // House rule: after a rescue, staying in the room is allowed (see src/play/README.md).
      // (The Afterpiece Antidote's move is a "may": staying is the other answer.)
      if (a.t === 'stop') {
        if (mustMove(step.why)) fail('this move cannot be passed up')
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
      // Desperate Measures comes after the interaction and everything it sets off.
      const before = st.queue.length
      survivorInteract(st, step.s, i)
      if (!step.survivalOnly) trigger(st, { k: 'afterSurvivorInteract', s: step.s }, st.queue.length - before)
      return
    }
    case 'crowdPay': {
      if (a.t === 'crowdPledge') {
        const sv = st.survivors[a.s] ?? fail('no such survivor')
        if (sv.status !== 'board') fail('only a survivor on the board pays')
        if (!Number.isInteger(a.n) || a.n < 0 || a.n > Math.min(2, sv.bp)) fail('cannot put in that much')
        const pledge = [...(step.pledge ?? crowdPledges(st))]
        pledge[a.s] = a.n
        const total = pledge.reduce<number>((t, p) => t + (p ?? 0), 0)
        if (total > 2) fail('2 ▲ at most')
        // nothing happens by itself: paying or refusing waits for a confirm (crowdPay)
        return wait(st, { ...step, pledge })
      }
      if (a.t !== 'crowdPay') break
      if (!crowdPayments(st).some((p) => same(p, a.pay))) fail('not a way to pay 2 ▲')
      if (!a.pay.length) {
        log(st, `ผู้รอดชีวิตไม่จ่าย — ${st.killer.name} เลือกการ์ดให้ ${st.survivors[step.s].name}`, 'game')
        return wait(st, { t: 'crowdPick', s: step.s })
      }
      for (const p of a.pay) st.survivors[p].bp--
      const who = [...new Set(a.pay)].map((p) => `${st.survivors[p].name} ${a.pay.filter((x) => x === p).length} ▲`)
      log(st, `ควบคุมฝูงชน: ผู้รอดชีวิตจ่าย 2 ▲ (${who.join(', ')}) — ${st.survivors[step.s].name} เลือกการ์ดเอง`, 'game')
      return
    }
    case 'weavePay': {
      if (a.t === 'weavePledge') {
        const sv = st.survivors[a.s] ?? fail('no such survivor')
        if (!weavers(st, step.s).includes(a.s)) fail('not in her room')
        if (!Number.isInteger(a.n) || a.n < 0 || a.n > sv.bp) fail('cannot put in that much')
        const pledge = [...(step.pledge ?? weavePledges(st, step.s))]
        pledge[a.s] = a.n
        if (pledge.reduce<number>((t, p) => t + (p ?? 0), 0) > WEAVING_COST) fail(`${WEAVING_COST} ▲ at most`)
        // each may still change theirs: paying or calling it off waits for her confirm
        return wait(st, { ...step, pledge })
      }
      if (a.t !== 'weavePay') break
      if (!a.pay.length) {
        // called off: the perk is not used, and her interaction is still to come
        log(st, `${st.survivors[step.s].name} ไม่ใช้ แมงมุมทอใย`, step.s)
        return wait(st, { t: 'survivorInteract', s: step.s, canInteract: true })
      }
      const pay = pledgedPay(step.pledge ?? weavePledges(st, step.s))
      if (pay.length !== WEAVING_COST || JSON.stringify(pay) !== JSON.stringify(a.pay)) fail(`pay the ${WEAVING_COST} ▲ put in`)
      return weavingPaid(st, step.s, step.prop, pay)
    }
    case 'carnifexProp': {
      if (a.t !== 'guardProp') break
      if (!carnifexProps(st).some((p) => p.id === a.prop)) fail('not a prop the Carnifex removes')
      return carnifexTake(st, a.prop)
    }
    case 'carnifexMove': {
      if (a.t !== 'guardRoom') break
      if (!st.guards?.carnifex || !connectedRooms(st, st.guards.carnifex).has(a.room)) fail('not a room next to the Carnifex')
      return placeGuard(st, 'carnifex', a.room)
    }
    case 'purgeChoice': {
      if (a.t !== 'purgeChoice') break
      const sv = st.survivors[step.s]
      if (!purgeOptions(st, step.s, step.mode).includes(a.perk)) fail('not a perk to choose')
      if (step.mode === 'cover') return coverPerk(st, step.s, a.perk)
      sv.purged = (sv.purged ?? []).filter((p) => p !== a.perk)
      return dropPurge(st, step.s, a.perk)
    }
    case 'empathyAsk': {
      if (a.t !== 'empathyAnswer') break
      const me = st.survivors[step.from]
      const other = st.survivors[step.s]
      if (!a.yes) {
        st.empathyNo = [...(st.empathyNo ?? []), `${step.from}:${step.s}`]
        return log(st, `${other.name} ไม่ยอม (เห็นใจ)`, step.s)
      }
      // still possible? (nothing else moves ▲ in between, but a cap or an empty pool would stop it)
      const ok = step.mode === 'take' ? other.bp >= 1 && me.bp < survivorMax(st, step.from) : me.bp >= 1 && other.bp < survivorMax(st, step.s)
      if (!ok) return
      payPerk(st, step.from, 'empathy', step.mode === 'take' ? `รับ 1 ▲ จาก ${other.name}` : `ให้ 1 ▲ แก่ ${other.name}`)
      if (step.mode === 'take') {
        other.bp--
        me.bp++
      } else {
        me.bp--
        other.bp++
      }
      return
    }
    case 'innerFocus': {
      if (a.t !== 'innerFocus') break
      if (!step.faces.includes(a.face)) fail('not a face rolled')
      return innerFocusTo(st, step.s, a.face)
    }
    case 'reignCard': {
      if (a.t !== 'reignCard') break
      const hand = st.survivorHands[st.survivors[step.s].hand]
      if (!isPathCard(a.card) || !hand.includes(a.card) || !reignCards(st, step.s).includes(a.card)) fail('not a card to move them with')
      hand.splice(hand.indexOf(a.card), 1)
      log(st, `${st.killer.name} ทิ้ง ${CARD_NAMES[a.card]} จากมือของ ${st.survivors[step.s].name}`, 'killer')
      const moves = survivorMoves(st, step.s, a.card)
      if (moves.length === 1) return reignMove(st, step.s, moves[0].path, moves[0].to)
      return wait(st, { t: 'reignPath', s: step.s, card: a.card })
    }
    case 'reignPath': {
      if (a.t !== 'move') break
      const m = survivorMoves(st, step.s, step.card).find((e) => e.path.id === a.path) ?? fail('cannot move them there')
      return reignMove(st, step.s, m.path, m.to)
    }
    case 'crowdPick': {
      if (a.t !== 'crowdPick') break
      const sv = st.survivors[step.s]
      const hand = st.survivorHands[sv.hand]
      if (a.card === 'wait' || !hand.includes(a.card)) fail('card not in hand')
      hand.splice(hand.indexOf(a.card), 1)
      // set face up, as Stridor's is: the killer chose it, and his choice is no secret
      sv.planned = a.card
      sv.plannedRevealed = true
      sv.acted = false
      log(st, `ควบคุมฝูงชน: ${st.killer.name} ให้ ${sv.name} วาง ${CARD_NAMES[a.card]}`, 'killer')
      return
    }
    case 'bonusOffer': {
      if (a.t === 'declineBonus') return
      if (a.t !== 'bonus') break
      const hand = st.survivorHands[st.survivors[step.s].hand]
      if (!isPathCard(a.card) || !hand.includes(a.card)) fail('card not in hand')
      startBonusMove(st, step.s, a.card)
      return
    }
    case 'pickItem': {
      if (a.t !== 'pickItem') break
      const kept = step.drawn[a.item] ?? fail('no such item')
      const sv = st.survivors[step.s]
      const rest = step.drawn.filter((_, i) => i !== a.item)
      log(st, `${sv.name} เลือก ${ITEM_NAMES[kept]} ทิ้ง ${rest.map((x) => ITEM_NAMES[x]).join(', ')} (สัญชาตญาณขโมย)`, step.s)
      return gotItem(st, step.s, kept, 'pick')
    }
    case 'machineLearning': {
      if (a.t !== 'selfAware') break
      if (!step.cards.includes(a.perk)) fail('not one of the cards drawn')
      st.killer.perks.push(a.perk)
      log(st, `${st.killer.name} ได้ ${PERKS[a.perk].name} — ใช้ได้ตั้งแต่ตอนนี้ (การเรียนรู้ของเครื่องจักร)`, 'killer')
      return
    }
    case 'selfAware': {
      if (a.t !== 'selfAware') break
      if (!step.cards.includes(a.perk)) fail('not one of the cards drawn')
      const sv = st.survivors[step.s]
      // the card drawn takes Self-Aware's place, over the same printed perk if it was laid over one
      sv.perks = sv.perks.map((p) => (p === 'self_aware' ? a.perk : p))
      const under = sv.covered?.self_aware
      if (sv.covered) {
        delete sv.covered.self_aware
        if (under) sv.covered[a.perk] = under
      }
      log(st, `${sv.name} ได้ ${PERKS[a.perk].name} แทน ยึดมั่น — ทิ้ง ยึดมั่น และอีก ${step.cards.length - 1} ใบ`, step.s)
      return
    }
    case 'keepItem': {
      if (a.t !== 'keepItem') break
      const sv = st.survivors[step.s]
      const dropped = a.keep === 'new' ? sv.item! : step.drawn
      if (a.keep === 'new') sv.item = step.drawn
      log(st, `${sv.name} เก็บ ${ITEM_NAMES[sv.item!]}`, step.s, { ev: { k: 'itemGot', s: step.s } })
      discardItem(st, step.s, dropped, false)
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
      if (askLeave(st, m.to, step, a)) return
      killerMove(st, a, m.path, m.to)
      return
    }
    case 'twinChoice': {
      if (a.t !== 'twin') break
      if (a.victor) {
        twinSwap(st)
        log(st, `${st.killer.name} เล่นเทิร์นนี้ด้วย Victor`, 'killer')
      } else log(st, `${st.killer.name} เล่นเทิร์นนี้ด้วย Charlotte`, 'killer')
      return
    }
    case 'killerInteract': {
      if (a.t === 'endTurn') return
      if (a.t !== 'interact' || !step.canInteract) break
      const i = a.i as KillerInteraction
      const legal = killerInteractions(st, step).filter((o) => !step.powerOnly || isPower(o))
      if (!legal.some((o) => same(o, i))) fail('not a legal interaction')
      const to = powerDest(st, i)
      if (to && askLeave(st, to, step, a, [{ k: 'resume', step }])) return
      killerInteract(st, i, a.reacted === true, step.turn, false, a.emp === true)
      return
    }
    case 'killerBonusOffer': {
      if (a.t === 'declineBonus') {
        if (step.free) fail('Slipstream: the bonus turn is taken')
        return queueCleanup(st)
      }
      if (a.t !== 'bonus') break
      const k = st.killer
      if (!k.hand.includes(a.card)) fail('card not in hand')
      k.hand.splice(k.hand.indexOf(a.card), 1)
      k.planned.push(a.card)
      const cost = step.free ? 0 : bonusCost(st)
      k.bp -= cost
      k.bonusUsed = true
      k.bonusAt = k.planned.length - 1
      log(st, step.free ? `${k.name} เล่น Bonus Turn (สลิปสตรีม) ด้วย ${CARD_NAMES[a.card]}` : `${k.name} จ่าย ${cost} ▲ เล่น Bonus Turn`, 'killer')
      st.queue.push({ k: 'killerTurn', turn: k.planned.length - 1 })
      return
    }
    case 'carryDice': {
      if (a.t === 'hang') return hang(st, step.s, usableHook(st, st.killer.room) ?? fail('no free hook here'))
      if (a.t !== 'carryDice') break
      if (!(a.n >= 1 && a.n <= 4)) fail('choose 1–4 dice')
      log(st, `${st.killer.name} เลือกทอย ${a.n} ลูก`, 'killer')
      // Boil Over: the survivor may roll 4 instead, asked once the killer has chosen
      if (perkCandidates(st, { k: 'carryRoll', s: step.s, n: a.n }, []).length) {
        st.queue.unshift({ k: 'trigger', w: { k: 'carryRoll', s: step.s, n: a.n }, done: [] }, { k: 'roll', ctx: { k: 'carry', s: step.s }, n: a.n, kind: 'skill' })
        return
      }
      startRoll(st, { k: 'carry', s: step.s }, a.n, 'skill')
      return
    }
    case 'carryMove': {
      if (a.t === 'stop') return carryEscape(st, step.s)
      if (a.t === 'hang') return hang(st, step.s, usableHook(st, st.killer.room) ?? fail('no free hook here'))
      if (a.t !== 'move') break
      const m = carryMoves(st).find((e) => e.path.id === a.path) ?? fail('cannot carry there')
      if (askLeave(st, m.to, step, a, [{ k: 'carryArrive', s: step.s, steps: step.steps - 1 }])) return
      // A Firecracker in the room ahead may stop him, carrying or not (house rule): asked first.
      const holders = onBoardIn(st, m.to).filter((i) => st.survivors[i].item === 'firecracker' && st.itemLock !== i)
      if (holders.length > 0 && !a.reacted)
        return wait(st, { t: 'reaction', item: 'firecracker', holders, pending: { t: 'move', path: m.path.id }, carry: { s: step.s, steps: step.steps } })
      carryStep(st, step.s, step.steps, m.path.id, m.to)
      return
    }
    case 'reaction': {
      if (a.t !== 'react') break
      if (a.s === null) {
        // a perk's move (Starstruck, Diversion): it goes on
        if (step.then) return void st.queue.unshift(...step.then)
        // Nobody reacts: replay the killer's action without asking again (an EMP kept: a
        // Flashlight may still be asked)
        st.step = reactedStep(st, step)
        handle(st, (step.item === 'emp' ? step.pending : { ...step.pending, reacted: true }) as Action)
        return
      }
      if (!step.holders.includes(a.s)) fail('cannot react')
      const sv = st.survivors[a.s]
      // Overwhelming Presence: a Flashlight or Firecracker used is an item used (the user's call)
      if (step.item !== 'emp' && !step.overwhelmed && perkCandidates(st, { k: 'preItem', s: a.s }, []).length) {
        st.queue.unshift({ k: 'trigger', w: { k: 'preItem', s: a.s }, done: [] }, { k: 'reactItem', s: a.s, step })
        return
      }
      if (step.item === 'emp') {
        empIn(st, st.killer.room)!.removed = true
        st.canInteract = false
        log(st, `${sv.name} ทิ้ง EMP — ${st.killer.name} Interact ไม่ได้เทิร์นนี้`, a.s)
        return
      }
      const used = sv.item!
      emit(st, { k: 'item', s: a.s, item: used }, a.s)
      discardItem(st, a.s, used, true)
      // a perk's move stopped (Diversion) on a survivor's turn: nothing of his to lose
      if (step.then && st.phase !== 'killer') {
        log(st, `${sv.name} ใช้ Firecracker — ${st.killer.name} เข้าห้องไม่ได้`, a.s)
        return
      }
      st.canInteract = false
      if (step.carry) {
        // Carrying: the step is lost, he stays where he is, and carries on with what is left.
        log(st, `${sv.name} ใช้ Firecracker — ${st.killer.name} แบกเข้าห้องไม่ได้ เสีย 1 ก้าว`, a.s)
        st.queue.unshift({ k: 'carryArrive', s: step.carry.s, steps: step.carry.steps - 1 })
        return
      }
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
      const what = step.whispers ? 'Whispers' : step.grip ? "Dragon's Grip" : "Carter's Spark"
      if (a.pay) {
        if (sv.bp < 1) fail('no ▲ to pay')
        sv.bp--
        log(st, `${sv.name} จ่าย 1 ▲ กัน ${what}`, step.s)
      } else if (step.whispers) whispersFaceUp(st, step.s)
      else if (step.grip) wound(st, step.s, 'power', `${sv.name} โดน อุ้งมือมังกร — บาดเจ็บ`)
      else sparkHit(st, step.s)
      if (step.whispers) return
      return sparkNext(st, step.rest, step.grip)
    }
    case 'phantasmChoice': {
      if (a.t !== 'phantasm') break
      const k = st.killer
      if (!a.teleport) {
        // "gain a ▲": one, whatever the die shows; the die is only the teleport's price
        gainKiller(st, 1)
        log(st, `${k.name} รับ +1 ▲ จาก กับดักหลอก`, 'killer')
        return
      }
      if (k.bp < step.face) fail('not enough ▲ to teleport')
      const i = a.i ?? null
      if (i && !phantasmInteractions(st, step.room).some((o) => same(o, i))) fail('not a legal interaction there')
      if (askLeave(st, step.room, step, a)) return
      // a Firecracker in the trap's room may stop the teleport, before he pays for it
      const holders = step.room === k.room ? [] : fireHolders(st, step.room)
      const go: Task = { k: 'phantasmGo', room: step.room, face: step.face, i }
      if (holders.length) return wait(st, { t: 'reaction', item: 'firecracker', holders, pending: { t: 'move', path: '' }, then: [go] })
      st.queue.unshift(go)
      return
    }
    case 'replaceCard': {
      if (a.t !== 'replace') break
      const sv = st.survivors[step.s]
      const hand = st.survivorHands[sv.hand]
      if (a.card === 'wait' || !hand.includes(a.card)) fail('card not in hand')
      hand.splice(hand.indexOf(a.card), 1)
      sv.planned = a.card
      // the Afterpiece Tonic's room: face up
      const tonic = st.afterpiece?.tonic === sv.room && sv.status === 'board'
      if (tonic) sv.plannedRevealed = true
      log(st, tonic ? `${sv.name} วาง ${CARD_NAMES[a.card]} (หงาย — ยาบำรุงส่งท้าย)` : `${sv.name} วางการ์ดใบใหม่ (คว่ำ)`, step.s)
      return
    }
    case 'pickSurvivor': {
      if (a.t !== 'pick' || !step.options.includes(a.s)) break
      wound(st, a.s, 'power', `${st.survivors[a.s].name} โดน เลื่อยไฟฟ้า — บาดเจ็บ`)
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
  if (step.carry) return { t: 'carryMove', s: step.carry.s, steps: step.carry.steps }
  if (step.antidote) return { t: 'killerAnyMove', ...(step.why ? { why: step.why } : {}) }
  const turn = st.killer.revealedCount - 1
  // The Blight's power moves with the card it drew, not the planned one.
  if (step.pending.t === 'move') return { t: 'killerMove', turn, card: st.rushCard ?? (st.killer.planned[turn] as PathKind), ...(st.rushCard ? { rush: true } : {}) }
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
      // Forced Hesitation took their card: no turn of their own, on to the next one's
      if (!sv.planned) {
        const order = turnOrder(st)
        const next = order.slice(order.indexOf(task.s) + 1).find((i) => st.survivors[i].planned && !st.survivors[i].acted)
        if (next !== undefined) st.queue.unshift({ k: 'survivorTurn', s: next })
        else {
          st.phase = 'killer'
          st.queue.unshift({ k: 'killerTurn', turn: 0 })
        }
        return
      }
      st.activeSurvivor = task.s
      st.lockerTurn = sv.status === 'locker' ? task.s : null
      st.turnHurt = []
      sv.plannedRevealed = true
      sv.acted = true
      st.canInteract = true
      st.queue.unshift(
        { k: 'trigger', w: { k: 'turnBegin', s: task.s }, done: [] },
        { k: 'turnStart', s: task.s },
        { k: 'cardMove', s: task.s, card: sv.planned as PathKind, planned: true },
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
      st.queue.unshift({ k: 'trigger', w: { k: 'cardMove', s: task.s, card: task.card, ...(task.planned ? { planned: true } : {}) }, done: [] }, { k: 'doMove', s: task.s, card: task.card })
      return
    case 'doMove':
      // Deception (Élodie): she stays, gives up the interaction, and gains a ▲.
      if (st.deception) {
        st.deception = false
        st.canInteract = false
        log(st, `${st.survivors[task.s].name} อยู่ห้องเดิม (การหลอกลวง) — Interact ไม่ได้เทิร์นนี้`, task.s)
        return
      }
      if (st.moveBlocked) {
        st.moveBlocked = false
        st.canInteract = true
        log(st, `${st.survivors[task.s].name} เดินไม่ได้ (เพลงขับกล่อมแห่งนักล่าสาว)`, task.s)
        return
      }
      if (st.sealedCard === task.card) {
        st.canInteract = false
        log(st, `${st.survivors[task.s].name} เปิด ${CARD_NAMES[task.card]} แต่เดินไม่ได้ (สัญลักษณ์ที่สาม) — เสียการ Interact`, task.s)
        return
      }
      startSurvivorMove(st, task.s, task.card)
      return
    case 'reactItem': {
      const sv = st.survivors[task.s]
      if (st.itemBlocked) {
        // wasted: it stops nothing; anyone else holding one may still use theirs
        st.itemBlocked = false
        log(st, `${sv.name} ทำ ${ITEM_NAMES[sv.item!]} เสียเปล่า (การปรากฏกายครอบงำใจ)`, task.s)
        discardItem(st, task.s, sv.item!, false)
        const rest = task.step.holders.filter((h) => h !== task.s)
        if (rest.length) return wait(st, { ...task.step, holders: rest })
        st.step = task.step
        return handle(st, { t: 'react', s: null })
      }
      // passed: the item does what it does
      st.step = { ...task.step, overwhelmed: true }
      return handle(st, { t: 'react', s: task.s })
    }
    case 'itemUse':
      if (st.itemBlocked) {
        st.itemBlocked = false
        const sv = st.survivors[task.s]
        log(st, `${sv.name} ทำ ${ITEM_NAMES[sv.item!]} เสียเปล่า (การปรากฏกายครอบงำใจ)`, task.s)
        discardItem(st, task.s, sv.item!, false)
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
    case 'settleRoll':
      resolveRoll(st, task.ctx, task.dice, task.failBp, true)
      return
    case 'drawItem':
      takeItems(st, task.s, task.from)
      return
    case 'survivorStep':
      return moveSurvivor(st, task.s, pathDef(st, task.path), task.to, true)
    case 'phantasmGo': {
      const k = st.killer
      k.bp -= task.face
      log(st, `${k.name} จ่าย ${task.face} ▲ วาร์ปไป กับดักหลอก`, 'killer')
      killerEnter(st, '', task.room)
      // After the reveal and Quick & Quiet, interact with a survivor there.
      st.queue.splice(2, 0, { k: 'phantasmHit', i: task.i })
      return
    }
    case 'addGen':
      addGenerator(st, st.props.find((p) => p.id === task.prop)!, task.add, task.s, true)
      return
    case 'killerFollow': {
      // Deerstalker may have kept them in the room: then there is no one to follow
      if (st.survivors[task.s].room !== task.to) return
      // a pallet on the path: he breaks it and stays, as on any move of his (p.14); his
      // interaction is lost only on his own turn
      if (palletOn(st, task.path)) {
        palletOn(st, task.path)!.removed = true
        trigger(st, { k: 'killerBreak', what: 'pallet' })
        if (st.phase === 'killer') st.canInteract = false
        log(st, `${st.killer.name} ตามไปไม่ได้ — ทำลาย Pallet แล้วอยู่ที่เดิม (ความตื่นเต้นในการไล่ล่า)`, 'killer', { ev: { k: 'palletBreak', path: task.path } })
        return
      }
      log(st, `${st.killer.name} เดินตาม ${st.survivors[task.s].name} ไป ${roomName(st, task.to)} (ความตื่นเต้นในการไล่ล่า)`, 'killer')
      return killerMovedBy(st, pathDef(st, task.path), task.to)
    }
    case 'trigger':
      runTrigger(st, task.w, task.done)
      return
    case 'plan': {
      // Stridor: the chosen survivor plays face up "before you or any other Survivor", so their
      // card is set on its own first and everyone else plans knowing it.
      // The Artist's Dire Crows do the same for the survivors in their rooms, one after another.
      const first = [...(st.stridor !== null ? [st.stridor] : []), ...direCrowed(st)].find((i) => st.survivors[i].planned === null && st.survivors[i].status !== 'hooked')
      if (first !== undefined) wait(st, { t: 'planStridor', s: first })
      else wait(st, { t: 'planSurvivors' })
      return
    }
    case 'roll': {
      // Perks may have changed this skill check (danger die instead, two dice keep one).
      const mods = st.rollMods
      st.rollMods = { danger: false, keep: false }
      // The Doctor's passive: survivors with Madness roll the danger die for skill checks.
      const mad = MADNESS_CHECKS.includes(task.ctx.k) && st.survivors[task.ctx.s].madness
      // The Knight's Jailer: a skill check in its room is a danger-die roll — not for someone in a
      // locker, who is off the board (p.12): being searched stays a skill check
      const jailed = st.survivors[task.ctx.s]
      const jail = SKILL_CHECKS.includes(task.ctx.k) && !!st.guards?.jailer && jailed.status === 'board' && jailed.room === st.guards.jailer
      st.jailerRoll = jail ? task.ctx.s : null
      const ctx: RollContext = mods.retribution && task.ctx.k === 'cleanse' ? { ...task.ctx, retribution: true } : task.ctx
      startRoll(st, ctx, mods.keep ? 2 : task.n, mods.danger || mad || jail ? 'danger' : task.kind, mods.keep)
      return
    }
    case 'resume':
      wait(st, task.step)
      return
    case 'poisedTurn': {
      // The bonus turn is theirs: they pick the card (or let it go); the turn it interrupted
      // carries on after it.
      const sv = st.survivors[task.s]
      if (sv.status !== 'board' || st.survivorHands[sv.hand].length === 0) return
      st.queue.unshift({ k: 'activeBack', s: st.activeSurvivor })
      st.activeSurvivor = task.s
      wait(st, { t: 'bonusOffer', s: task.s })
      return
    }
    case 'activeBack':
      st.activeSurvivor = task.s
      return
    case 'carnifex': {
      const room = st.guards?.carnifex
      if (!room) return
      st.queue.unshift({ k: 'carnifexMove' })
      const props = carnifexProps(st)
      if (props.length > 1) return wait(st, { t: 'carnifexProp' })
      if (props.length) carnifexTake(st, props[0].id)
      return
    }
    case 'carnifexMove': {
      const rooms = st.guards?.carnifex ? [...connectedRooms(st, st.guards.carnifex)] : []
      if (rooms.length > 1) return wait(st, { t: 'carnifexMove' })
      if (rooms.length) placeGuard(st, 'carnifex', rooms[0])
      return
    }
    case 'survivorDo':
      return survivorInteract(st, task.s, task.i, true)
    case 'hangDo': {
      // still on his shoulder (Dead Hard didn't take them off)
      if (st.survivors[task.s].status !== 'carried') return
      return hang(st, task.s, st.props.find((p) => p.id === task.hook)!, true)
    }
    case 'leave':
      return void st.queue.unshift(task.go)
    case 'replay':
      st.step = task.step
      return handle(st, task.action)
    case 'killerMoved':
      return killerMovedBy(st, pathDef(st, task.path), task.to, true)
    case 'killerDirect': {
      // We're Gonna Live Forever, then a Firecracker in the room ahead, as on his other moves
      if (!task.asked && perkCandidates(st, { k: 'preLeave', to: task.to }, []).length) {
        st.queue.unshift({ k: 'trigger', w: { k: 'preLeave', to: task.to }, done: [] }, { k: 'leave', go: { k: 'killerDirect', to: task.to, asked: true } })
        return
      }
      const holders = fireHolders(st, task.to)
      if (holders.length) return wait(st, { t: 'reaction', item: 'firecracker', holders, pending: { t: 'move', path: '' }, then: [{ k: 'killerArrive', to: task.to }] })
      return killerEnter(st, '', task.to)
    }
    case 'killerAct':
      if (task.over) return killerActs(st, task.i, null)
      return killerInteract(st, task.i, false, task.turn, true)
    case 'killerArrive':
      return killerEnter(st, '', task.to)
    case 'darkMove':
      if (darkMoves(st).length) wait(st, { t: 'killerAnyMove', why: 'darkness' })
      return
    case 'reignHit': {
      // moved into his room by Reign of Darkness: he may interact with them
      const sv = st.survivors[task.s]
      if (sv.status !== 'board' || sv.room !== st.killer.room) return
      const turn = Math.max(0, st.killer.revealedCount - 1)
      const step: Step = { t: 'killerInteract', turn, canInteract: true, only: task.s }
      if (killerInteractions(st, step).length) wait(st, step)
      return
    }
    case 'killerGo':
      return finishKillerMove(st, pathDef(st, task.path), task.to)
    case 'purgeTake': {
      // still there, and still on the board (a perk may have moved them on)
      const sv = st.survivors[task.s]
      if (!(st.purge ?? []).includes(task.room) || sv.room !== task.room || sv.status !== 'board') return
      st.purge = st.purge!.filter((r) => r !== task.room)
      return takePurge(st, task.s)
    }
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
      // the Antidote: only while it still stands where they are
      if (task.why === 'antidote' && st.afterpiece?.antidote !== sv.room) return
      wait(st, { t: 'anyMove', s: task.s, ...(task.why ? { why: task.why } : {}) })
      return
    }
    case 'killerAntidote':
      if (st.afterpiece?.antidote !== st.killer.room || !antidoteKillerMoves(st).length) return
      wait(st, { t: 'killerAnyMove' })
      return
    case 'survivorGo': {
      const p = pathDef(st, task.path)
      return cardMoveTo(st, task.s, p, task.to, true)
    }
    case 'endSurvivorTurn': {
      // Overcome pays its owner by itself, wounded at the end of their turn
      if (st.survivors[task.s].wounded && perkReady(st, task.s, 'overcome')) {
        payPerk(st, task.s, 'overcome', '+1 ▲')
        gainSurvivor(st, task.s, 1)
      }
      st.activeSurvivor = null
      st.itemLock = null
      st.deception = false
      if (st.evadedWall) {
        pathState(st, st.evadedWall).wall = true
        log(st, 'กำแพงกลับเข้าที่ (การหลบหลีกกลางกรุง)', 'game')
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
        st.turnHurt = []
        st.killerMoved = false
        st.queue.unshift({ k: 'trigger', w: { k: 'killerTurnBegin', turn: task.turn }, done: [] }, { ...task, begun: true })
        return
      }
      // The Twins' passive: with Victor on the board, the turn may be taken with him.
      if (!task.chosen && k.characterId === 'twins' && k.victorRoom) {
        st.queue.unshift({ ...task, chosen: true })
        wait(st, { t: 'twinChoice', turn: task.turn })
        return
      }
      // The Unknown: the card is played by the Unknown it was set for (card 1 by Unknown 1…)
      if (k.unknowns) actAs(st, task.turn)
      const card = k.planned[task.turn]
      k.revealedCount = task.turn + 1
      st.canInteract = true
      st.queue.unshift({ k: 'killerInteract', turn: task.turn }, { k: 'endKillerTurn', turn: task.turn, extra: task.extra })
      if (card === 'wait') {
        log(st, `${actorName(st)} เปิด Wait — อยู่กับที่`, 'killer')
        return
      }
      // The Dredge: straight to the start room of the card's face. Already there, he can't move: as
      // any card but Wait that can't move, the interaction is lost (p.10).
      if (isDirect(card)) {
        const to = directRoom(st, card)
        if (to === k.room) {
          log(st, `${actorName(st)} เปิด ${CARD_NAMES[card]} — อยู่ที่ ${roomName(st, to)} แล้ว เคลื่อนที่ไม่ได้ เสียการ Interact`, 'killer')
          st.canInteract = false
          return
        }
        log(st, `${actorName(st)} เปิด ${CARD_NAMES[card]} — ตรงไป ${roomName(st, to)}`, 'killer')
        st.queue.unshift({ k: 'killerDirect', to })
        return
      }
      if (killerMoves(st, card).length === 0) {
        log(st, `${actorName(st)} เปิด ${CARD_NAMES[card]} แต่ไม่มีเส้นทาง — เสียการ Interact`, 'killer')
        st.canInteract = false
        return
      }
      wait(st, { t: 'killerMove', turn: task.turn, card })
      return
    }
    case 'killerInteract': {
      // Power Struggle: no interaction after moving with the first card.
      const struggled = task.turn === 0 && st.struggle === true
      if (struggled && st.canInteract) log(st, `${actorName(st)} Interact ไม่ได้เทิร์นนี้ (ดิ้นรนสุดพลัง)`, 'killer')
      wait(st, { t: 'killerInteract', turn: task.turn, canInteract: st.canInteract && !struggled })
      return
    }
    case 'rushArrive':
      // Blighted Corruption: entered a new room — interact there, or use the power again.
      st.rushCard = null
      if (st.killer.room !== task.from && st.canInteract) wait(st, { t: 'killerInteract', turn: task.turn, canInteract: true, rush: true })
      return
    case 'endKillerTurn': {
      const k = st.killer
      // A turn taken with Victor ends: Charlotte is "the Killer" again.
      if (k.asVictor) twinSwap(st)
      st.itemLock = null
      // Guardian held him to one survivor for this turn only.
      st.guardian = null
      // Coup de Grâce comes at the end of the turn, before the next one.
      if (!task.ended) {
        st.queue.unshift({ k: 'trigger', w: { k: 'killerTurnEnd', turn: task.turn }, done: [] }, { ...task, ended: true })
        return
      }
      if (task.extra) return // Devour Hope's turn: cleanup is already queued
      // Slipstream: his cards are back in his hand; the bonus turn it gives comes now
      if (k.slipstream) {
        k.slipstream = false
        return wait(st, { t: 'killerBonusOffer', free: true })
      }
      // the next card (The Unknown may have only one; Shadowborn or Coup de Grâce may have added a third)
      if (task.turn + 1 < k.planned.length) st.queue.unshift({ k: 'killerTurn', turn: task.turn + 1 })
      // (The Singularity can't pay for one: its only bonus turn is Slipstream's)
      else if (task.turn === 1 && !k.bonusUsed && k.characterId !== 'singularity' && k.bp >= bonusCost(st) && k.hand.length > 0) wait(st, { t: 'killerBonusOffer' })
      else {
        // his turns over: Unknown 1 stands for him again
        if (k.unknowns) actAs(st, 0)
        queueCleanup(st)
      }
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
  st.queue.push({ k: 'trigger', w: { k: 'cleanupStart' }, done: [] }, { k: 'carnifex' }, { k: 'cleanup' })
}

/** Every survivor who sets a card this planning has one in `draft` (not those hooked or face up from Stridor). */
function survivorsPlanned(st: GameState, draft: (MoveCard | null)[]): boolean {
  return st.survivors.every((sv, i) => sv.status === 'hooked' || sv.planned !== null || !!draft[i])
}

function planSurvivors(st: GameState, cards: (MoveCard | null)[]) {
  if (cards.length !== 4) fail('one card per survivor')
  const hands = st.survivorHands.map((h) => [...h])
  st.survivors.forEach((sv, i) => {
    const c = cards[i]
    // on a hook, or already face up from Stridor: no card to set here
    if (sv.status === 'hooked' || sv.planned !== null) {
      if (c !== null) fail('this survivor does not plan a card')
      return
    }
    if (!c || c === 'wait') fail(`${sv.name} needs a card`)
    const h = hands[sv.hand]
    if (!h.includes(c)) fail(`${CARD_NAMES[c]} is not in ${sv.name}'s hand`)
    h.splice(h.indexOf(c), 1)
  })
  st.survivorHands = hands
  st.survivors.forEach((sv, i) => {
    if (sv.planned !== null) return // Stridor's card, already played face up
    sv.planned = cards[i]
    sv.plannedRevealed = false
    sv.acted = false
  })
  // The Clown's Afterpiece Tonic: a survivor in its room set their card face up
  const tonic = st.afterpiece?.tonic
  const shown = st.survivors.filter((sv) => tonic && sv.room === tonic && sv.status === 'board' && sv.planned && !sv.plannedRevealed)
  for (const sv of shown) sv.plannedRevealed = true
  if (shown.length) log(st, `ยาบำรุงส่งท้าย: ${shown.map((sv) => `${sv.name} วาง ${CARD_NAMES[sv.planned!]}`).join(', ')} (หงาย)`, 'killer')
}

/** The killer's two cards are set (in either planning order): the round can start. */
function finishKillerPlan(st: GameState, cards: MoveCard[]) {
  // two cards (The Unknown: one per Unknown on the board, Unknown 1 first); two copies of one card
  // only from a hand that holds two (The Blight's doubled hand, Unbound)
  const left = cards.length === killerCardCount(st) ? takeCards(st.killer.hand, cards) : null
  if (!left) fail(`pick ${killerCardCount(st)} cards from the hand`)
  st.killer.planned = [...cards]
  st.killer.hand = left
  log(st, 'วางแผนเสร็จ ทุกคนวางการ์ดคว่ำแล้ว', 'game')
  const first = turnOrder(st).find((i) => st.survivors[i].planned)
  st.queue.push({ k: 'trigger', w: { k: 'planningEnd' }, done: [] })
  st.phase = first === undefined ? 'killer' : 'survivors'
  st.queue.push(first === undefined ? { k: 'killerTurn', turn: 0 } : { k: 'survivorTurn', s: first })
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
  emit(st, { k: 'touch', who: s, what: 'lockerOut' }, s)
}

/** `asked`: the move out of the killer's room was already held for Deerstalker and Thrill of the Hunt. */
function moveSurvivor(st: GameState, s: number, path: PathDef, to: string, asked = false) {
  const sv = st.survivors[s]
  const from = sv.room
  if (!asked && from !== to && killerIn(st, from)) {
    const w: PerkWindow = { k: 'survivorLeave', s, to, path: path.id }
    if (perkCandidates(st, w, []).length) {
      st.queue.unshift({ k: 'trigger', w, done: [] }, { k: 'survivorStep', s, path: path.id, to })
      return
    }
  }
  survivorArrives(st, s, from, to, path.id)
}

/**
 * A survivor arrives in `to`: along `path`, or straight there with `path` empty (Inner Focus), when
 * nothing on a path applies (Dissolution, a Bear Trap).
 */
function survivorArrives(st: GameState, s: number, from: string, to: string, path: string) {
  const sv = st.survivors[s]
  sv.room = to
  log(st, `${sv.name} → ${roomName(st, to)}`, s, { ev: { k: 'move', who: s, from, to, path } })
  // Dissolution: the ▲ on this path wounds whoever moves along it
  if (path && st.dissolution && tokenOf(boardOf(st), path) === st.dissolution && !sv.wounded) wound(st, s, 'perk', `${sv.name} เดินผ่าน การสลายตัว — บาดเจ็บ`)
  // Overzealous pays its owner by itself, walking into the killer's room
  if (killerIn(st, to) && sv.status === 'board' && perkReady(st, s, 'overzealous')) {
    payPerk(st, s, 'overzealous', '+1 ▲')
    gainSurvivor(st, s, 1)
  }
  // The trap springs on the path, then the survivor reveals a prop in the new room.
  st.queue.unshift({ k: 'reveal', room: to, who: s })
  let after = 1
  if (st.phantasm.includes(to) && sv.status === 'board') {
    st.phantasm = st.phantasm.filter((r) => r !== to)
    log(st, `${sv.name} เดินเข้า กับดักหลอก — ทอยลูกเต๋า`, s)
    st.queue.splice(1, 0, { k: 'roll', ctx: { k: 'phantasm', s, room: to }, n: 1, kind: 'skill' })
    after = 2
  }
  // The Plague's passive: a Vile Purge here is taken, once the room is revealed.
  if ((st.purge ?? []).includes(to) && sv.status === 'board') st.queue.splice(after++, 0, { k: 'purgeTake', s, room: to })
  // The Knight's Assassin: walking into its room, a danger-die roll (after the reveal)
  if (st.guards?.assassin === to && sv.status === 'board') st.queue.splice(after++, 0, { k: 'roll', ctx: { k: 'assassin', s }, n: 1, kind: 'danger' })
  // The Clown's Afterpiece Antidote: they may move on along any path, before interacting.
  if (st.afterpiece?.antidote === to && sv.status === 'board') st.queue.splice(after++, 0, { k: 'anyMove', s, why: 'antidote' })
  // For the People, once the room is revealed.
  if (sv.status === 'board') trigger(st, { k: 'entered', s, path }, after)
  if (path && pathState(st, path).trap) {
    log(st, `${sv.name} เดินผ่าน กับดักหมี — ทอย Danger Die`, s)
    startRoll(st, { k: 'trap', s, path }, 1, 'danger')
  }
}

/** Entering a space reveals one face-down prop (p.8); the player picks which tile. */
/** `asked`: Visionary was offered already (and passed). */
function revealOnEnter(st: GameState, room: string, who: number | 'killer', asked = false) {
  const hidden = propsIn(st, room).filter((p) => !p.revealed)
  if (hidden.length === 0) return
  // Visionary (Felix): reveal a prop in a connected room instead.
  if (!asked && who !== 'killer' && perkChoices(st, 'visionary', who, { k: 'beforeReveal', s: who, room }).length && !st.perksMuted.includes(`${who}:visionary`))
    return wait(st, { t: 'offer', perk: 'visionary', owner: who, w: { k: 'beforeReveal', s: who, room } })
  // Tiles of one colour are indistinguishable face down, so only a choice of colour matters.
  if (new Set(hidden.map((p) => p.category)).size === 1) return revealProp(st, hidden[0], who)
  wait(st, { t: 'revealProp', who, room })
}

function revealProp(st: GameState, p: Prop, who: LogWho) {
  p.revealed = true
  log(st, `เปิด ${PROP_NAMES[p.kind]} ที่ ${roomName(st, p.room!)}`, who, { ev: { k: 'reveal', prop: p.id, kind: p.kind, room: p.room! } })
  // Spies from the Shadows: the crows tell the killer, whoever turned the tile over.
  if (p.kind === 'crow' && st.phase !== 'setup' && perkReady(st, 'killer', 'spies_from_the_shadows')) {
    payPerk(st, 'killer', 'spies_from_the_shadows', '+1 ▲')
    gainKiller(st, 1)
  }
  // THWACK!: his own reveal of a survival or altruism prop
  if (who === 'killer' && st.phase !== 'setup' && (p.category === 'survival' || p.category === 'altruism')) trigger(st, { k: 'killerRevealed', prop: p.id })
  // Haunted Ground answers a survivor's reveal (not the setup, where perks aren't in play yet)
  if (typeof who === 'number' && st.phase !== 'setup') trigger(st, { k: 'afterReveal', s: who, prop: p.id })
}

/** `asked`: No Way Out has had its chance at this interaction. */
function survivorInteract(st: GameState, s: number, i: SurvivorInteraction, asked = false) {
  const sv = st.survivors[s]
  if (!asked && (i.k === 'repair' || i.k === 'openGate') && perkCandidates(st, { k: 'genInteract', s, prop: i.prop }, []).length) {
    st.queue.unshift({ k: 'trigger', w: { k: 'genInteract', s, prop: i.prop }, done: [] }, { k: 'survivorDo', s, i })
    return
  }
  const prop = 'prop' in i ? st.props.find((p) => p.id === i.prop)! : null
  switch (i.k) {
    case 'removeVictor':
      st.killer.victorRoom = null
      log(st, `${sv.name} ไล่ Victor ออกจากกระดาน`, s)
      return
    case 'diversion': {
      // the Unknown in this room is the one sent off
      actAtRoom(st, sv.room)
      const p = pathDef(st, i.path)
      const to = p.a === st.killer.room ? p.b : p.a
      payPerk(st, s, 'diversion', `ส่ง ${st.killer.name} ไป ${roomName(st, to)} (ฆาตกร +1 ▲)`)
      gainKiller(st, 1)
      return killerMovedBy(st, p, to)
    }
    case 'powerStruggle': {
      const k = st.killer
      payPerk(st, s, 'power_struggle', `เปิดการ์ดใบแรกของ ${k.name}: ${CARD_NAMES[k.planned[0]]} — Interact ไม่ได้หลังเดินใบนี้`)
      if (!k.shown.includes(0)) k.shown.push(0)
      st.struggle = true
      gainKiller(st, 2)
      return
    }
    case 'rummage': {
      prop!.removed = true
      trigger(st, { k: 'afterRummage', s, prop: prop!.id })
      return drawItems(st, s, 'chest')
    }
    case 'hide':
      prop!.occupant = s
      sv.status = 'locker'
      log(st, `${sv.name} ซ่อนใน Locker`, s)
      emit(st, { k: 'touch', who: s, what: 'lockerIn' }, s)
      dropKnives(st, s)
      shedPurge(st, s)
      trigger(st, { k: 'afterPalletLocker', s, prop: prop!.id })
      return
    case 'crow':
      gainKiller(st, 1)
      log(st, `${sv.name} ไล่ Crow — ${st.killer.name} +1 ▲`, s)
      emit(st, { k: 'touch', who: s, what: 'crow' }, s)
      if (st.survivorHands[sv.hand].length > 0) wait(st, { t: 'bonusOffer', s })
      return
    case 'drone':
      Object.assign(prop!, { removed: true, merchant: true, room: null })
      log(st, `${sv.name} ส่ง Drone กลับไปบนบอร์ดของ ${st.killer.name}`, s)
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
      // Friendly Competition looks back at who worked on a generator this round
      st.genBy = { ...st.genBy, [i.prop]: [...new Set([...(st.genBy?.[i.prop] ?? []), s])] }
      return startCheck(st, { k: 'repair', s, prop: i.prop })
    case 'partner': {
      const t = i.target
      if (i.perk === 'collective_stealth') {
        payPerk(st, t, i.perk, `${sv.name} Interact กับ ${st.survivors[t].name} — ทั้งคู่เดินตามเส้นทางใดก็ได้`)
        // Renato moves first, then the survivor who interacted with him
        st.queue.unshift({ k: 'anyMove', s: t, why: 'collective' }, { k: 'anyMove', s, why: 'collective' })
        return
      }
      payPerk(st, t, i.perk, `${sv.name} Interact กับ ${st.survivors[t].name} — ${st.killer.name} +1 ▲, ${sv.name} ได้ Bonus Turn`)
      gainKiller(st, 1)
      if (st.survivorHands[sv.hand].length > 0) wait(st, { t: 'bonusOffer', s, why: 'power_of_two' })
      return
    }
    case 'openGate':
      return startCheck(st, { k: 'openGate', s, prop: i.prop })
    case 'cleanse':
      return startCheck(st, { k: 'cleanse', s, prop: i.prop })
    case 'heal':
      return startCheck(st, { k: 'heal', s, target: i.target })
    case 'sabotage': {
      emit(st, { k: 'touch', who: s, what: 'sabotage' }, s)
      placeEntity(st, { prop: prop!.id })
      const hooked = prop!.occupant
      if (hooked === null) {
        log(st, `${sv.name} วาง Entity บน Hook`, s)
        kindred(st, s, null)
        trigger(st, { k: 'afterSabotage', s })
        return
      }
      const r = st.survivors[hooked]
      prop!.occupant = null
      r.status = 'board'
      r.room = sv.room
      gainSurvivor(st, s, 1)
      log(st, `${sv.name} ช่วย ${r.name} ลงจาก Hook (+1 ▲)`, s, { ev: { k: 'rescue', s: hooked, by: s } })
      kindred(st, s, hooked)
      // The rescuer moves along any path, then the rescued survivor does (p.13).
      st.queue.unshift({ k: 'anyMove', s }, { k: 'anyMove', s: hooked })
      trigger(st, { k: 'afterSabotage', s, rescued: hooked }, 2)
      return
    }
  }
}

function placeEntity(st: GameState, place: EntityPlace) {
  st.entity = place
}

// ---------- killer ----------

/**
 * We're Gonna Live Forever: before any move of the killer out of David's room, the move is held
 * and the perk asked; with no use, `a` is answered again in `step` (marked `left`). `stop`: what
 * follows when the perk keeps him there. True when it asked (the caller stops there).
 */
function askLeave(st: GameState, to: string, step: Step, a: Action, stop: Task[] = []): boolean {
  if (('left' in a && a.left) || ('reacted' in a && a.reacted) || to === st.killer.room) return false
  if (!perkCandidates(st, { k: 'preLeave', to }, []).length) return false
  st.queue.unshift({ k: 'trigger', w: { k: 'preLeave', to }, done: [] }, { k: 'leave', go: { k: 'replay', step, action: { ...a, left: true } as Action }, stop })
  return true
}

function killerMove(st: GameState, a: Extract<Action, { t: 'move' }>, path: PathDef, to: string) {
  if (palletOn(st, path.id)) {
    // Enduring may break it and keep going.
    if (perkChoices(st, 'enduring', 'killer', { k: 'palletBlock', path: path.id, to }).length)
      return wait(st, { t: 'offer', perk: 'enduring', owner: 'killer', w: { k: 'palletBlock', path: path.id, to } })
    return palletStop(st, path.id)
  }
  const holders = onBoardIn(st, to).filter((i) => st.survivors[i].item === 'firecracker' && st.itemLock !== i)
  if (holders.length > 0 && !a.reacted) {
    wait(st, { t: 'reaction', item: 'firecracker', holders, pending: { t: 'move', path: path.id } })
    return
  }
  finishKillerMove(st, path, to)
}

/** Where a power that moves the killer takes him (chainsaw, blink, Wailing Bell); else undefined. */
function powerDest(st: GameState, i: KillerInteraction): string | undefined {
  const room = st.killer.room
  if (i.k === 'chainsaw') return exits(st, room, i.card as PathKind).find((e) => e.path.id === i.path)?.to
  if (i.k === 'blink') {
    const p = pathDef(st, i.path)
    return p.a === room ? p.b : p.a
  }
  if (i.k === 'bell') return i.room
  return undefined
}

/** A survivor's card move is still to be made (Inner Focus hasn't replaced it). */
function movePending(st: GameState, s: number): boolean {
  return st.queue.some((t) => t.k === 'doMove' && t.s === s)
}

/** Inner Focus: straight to the start room of `face`, then the turn goes on (interact as normal). */
function innerFocusTo(st: GameState, s: number, face: number) {
  const sv = st.survivors[s]
  const to = boardOf(st).rooms.find((r) => r.startFace === face)!.id
  if (sv.status === 'locker') leaveLocker(st, s)
  st.canInteract = true
  if (to === sv.room) return log(st, `${sv.name} เลือก ${face} — อยู่ห้องนั้นแล้ว`, s)
  survivorArrives(st, s, sv.room, to, '')
}

/** Reign of Darkness: the cards of survivor `s`'s hand that move them somewhere. */
export function reignCards(st: GameState, s: number): PathKind[] {
  return [...new Set(st.survivorHands[st.survivors[s].hand])].filter(isPathCard).filter((c) => survivorMoves(st, s, c).length > 0)
}

/** Reign of Darkness moves them; brought into his room, he may then interact with them. */
function reignMove(st: GameState, s: number, path: PathDef, to: string) {
  log(st, `รัชสมัยแห่งความมืดมิด: ${st.survivors[s].name} ถูกพาไป ${roomName(st, to)}`, 'killer')
  moveSurvivor(st, s, path, to)
  // after the move and all it sets off (the reveal there), before his turn ends
  const at = st.queue.findIndex((t) => t.k === 'endKillerTurn')
  st.queue.splice(at < 0 ? st.queue.length : at, 0, { k: 'reignHit', s })
}

/** Darkness Revealed: an empty, revealed locker in `room` to turn face down. */
function darkLocker(st: GameState, room: string): Prop | undefined {
  return propsIn(st, room).find((p) => p.kind === 'locker' && p.revealed && p.occupant === null)
}

/** Darkness Revealed's move: any path, as the Antidote's (a pallet would stop him: not offered). */
export function darkMoves(st: GameState): { path: PathDef; to: string }[] {
  return antidoteKillerMoves(st)
}

/** The Artist's passive: a crow (or Dire Crow) he removes from play goes onto his board. */
function toArtist(st: GameState, p: Prop) {
  if (st.killer.characterId !== 'artist' || p.kind !== 'crow') return
  p.artist = true
  p.room = null
}

/** The crows on The Artist's board, Dire Crows apart. */
export function artistCrows(st: GameState): { crows: number; dire: number } {
  const on = st.props.filter((p) => p.artist)
  return { crows: on.filter((p) => !p.dire).length, dire: on.filter((p) => p.dire).length }
}

/** Survivors on the board in a room with a Dire Crow: they plan face up, first (The Artist's passive). */
export function direCrowed(st: GameState): number[] {
  const rooms = new Set(st.props.filter((p) => p.dire && !p.removed && p.room).map((p) => p.room))
  return st.survivors.flatMap((sv, i) => (sv.status === 'board' && rooms.has(sv.room) ? [i] : []))
}

/** Survivors in `room` who can throw a Firecracker to keep the killer out. */
function fireHolders(st: GameState, room: string): number[] {
  return onBoardIn(st, room).filter((i) => st.survivors[i].item === 'firecracker' && st.itemLock !== i)
}

/**
 * The killer moved by a perk (Starstruck, Diversion, Beast of Prey, Agitation): We're Gonna Live
 * Forever and a Firecracker in the room may stop it. `asked`: the former was asked already.
 */
function killerMovedBy(st: GameState, path: PathDef, to: string, asked = false) {
  if (!asked && to !== st.killer.room && perkCandidates(st, { k: 'preLeave', to }, []).length) {
    st.queue.unshift({ k: 'trigger', w: { k: 'preLeave', to }, done: [] }, { k: 'leave', go: { k: 'killerMoved', path: path.id, to } })
    return
  }
  const holders = fireHolders(st, to)
  if (holders.length) return wait(st, { t: 'reaction', item: 'firecracker', holders, pending: { t: 'move', path: path.id }, then: [{ k: 'killerGo', path: path.id, to }] })
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
  const wall = pathState(st, path.id).wall
  if (wall) {
    pathState(st, path.id).wall = false
    log(st, `${st.killer.name} ทุบกำแพง`, 'killer', { ev: { k: 'wallBreak', path: path.id } })
  }
  killerEnter(st, path.id, to, wall)
  if (wall) trigger(st, { k: 'killerBreak', what: 'wall' }, 2)
}

/** The killer arrives in a room: reveal a prop there, then Quick & Quiet may hide someone. */
/** `path` is empty for a teleport (Wailing Bell, a Phantasm Trap). */
function killerEnter(st: GameState, path: string, to: string, broke = false) {
  const k = st.killer
  const from = k.room
  k.room = to
  // Insidious asks whether he has stayed put this turn; every move of his comes through here.
  st.killerMoved = true
  log(st, `${actorName(st)} → ${roomName(st, to)}`, 'killer', { ev: { k: 'move', who: k.asVictor ? 'victor' : 'killer', from, to, path } })
  st.queue.unshift({ k: 'reveal', room: to, who: 'killer' }, { k: 'trigger', w: { k: 'killerEntered', room: to, from, path, ...(broke ? { broke } : {}) }, done: [] })
  // Darkness Revealed: an empty locker here may be turned face down instead of revealing a prop
  if (!k.asVictor && perkReady(st, 'killer', 'darkness_revealed') && darkLocker(st, to)) st.queue.unshift({ k: 'trigger', w: { k: 'killerArrived', room: to }, done: [] })
  // The Clown's Afterpiece Antidote: he may move on — not in the middle of an interaction (Starstruck)
  if (st.afterpiece?.antidote === to && !k.asVictor && !st.queue.some((t) => t.k === 'killerDo')) st.queue.splice(2, 0, { k: 'killerAntidote' })
}

/** `asked`: Residual Manifest has had its chance at this interaction. */
/** `emped`: the survivor he'd interact with has had their chance to discard an EMP. */
function killerInteract(st: GameState, i: KillerInteraction, reacted: boolean, turn: number, asked = false, emped = false) {
  const k = st.killer
  // A power that takes him into a room (chainsaw, Blink, Wailing Bell): a Firecracker there may
  // stop it, as any move of his. It is stopped before it is spent.
  if (!reacted) {
    const to = powerDest(st, i)
    const holders = to && to !== k.room ? fireHolders(st, to) : []
    if (holders.length) return wait(st, { t: 'reaction', item: 'firecracker', holders, pending: { t: 'interact', i } })
  }
  if (isPower(i)) return usePower(st, i)
  if (!reacted && !asked && perkCandidates(st, { k: 'killerWouldInteract', room: k.room }, []).length) {
    st.queue.unshift({ k: 'trigger', w: { k: 'killerWouldInteract', room: k.room }, done: [] }, { k: 'killerAct', i, turn })
    return
  }
  // The Singularity's passive: a face-up EMP in the room of the survivor he'd interact with; they may
  // discard it to stop his interaction this turn
  if (!reacted && !emped && (i.k === 'attack' || i.k === 'pickUp') && empIn(st, k.room))
    return wait(st, { t: 'reaction', item: 'emp', holders: [i.target], pending: { t: 'interact', i, emp: true } })
  {
    const holders = onBoardIn(st, k.room).filter((s) => st.survivors[s].item === 'flashlight' && st.itemLock !== s)
    if (holders.length > 0 && !reacted) {
      wait(st, { t: 'reaction', item: 'flashlight', holders, pending: { t: 'interact', i } })
      return
    }
  }
  killerActs(st, i, turn)
}

/** Interact; Red Herring may first turn an attack or pick-up into damaging a generator. */
function killerActs(st: GameState, i: KillerInteraction, turn: number | null) {
  if (i.k === 'attack' || i.k === 'pickUp') {
    const w: PerkWindow = { k: 'preKillerInteract', target: i.target, pickUp: i.k === 'pickUp', turn }
    // queued before the perks are asked: they look at it (and may find it gone, stopped by one asked first)
    st.queue.unshift({ k: 'killerDo', i, turn })
    if (!perkCandidates(st, w, []).length) {
      st.queue.shift()
      return killerDo(st, i, turn)
    }
    st.queue.unshift({ k: 'trigger', w, done: [] })
    return
  }
  killerDo(st, i, turn)
}

/** `turn` null: an interaction outside the turn's own (a Phantasm Trap teleport). */
function killerDo(st: GameState, i: KillerInteraction, turn: number | null) {
  // Territorial Imperative comes after the interaction and everything it sets off.
  const before = st.queue.length
  doKillerInteraction(st, i)
  // Unrelenting wants to know which survivor it was.
  const target = i.k === 'attack' || i.k === 'pickUp' ? { target: i.target } : {}
  if (turn !== null) trigger(st, { k: 'afterKillerInteract', turn, ...target }, st.queue.length - before)
}

function doKillerInteraction(st: GameState, i: KillerInteraction) {
  const k = st.killer
  const prop = 'prop' in i ? st.props.find((p) => p.id === i.prop)! : null
  switch (i.k) {
    case 'search': {
      const s = prop!.occupant!
      log(st, `${actorName(st)} ค้น Locker — ${st.survivors[s].name} ทอย Skill Check`, 'killer')
      emit(st, { k: 'touch', who: 'killer', what: 'lockerSearch' }, 'killer')
      return startCheck(st, { k: 'search', s, prop: prop!.id })
    }
    case 'scout':
      prop!.removed = true
      toArtist(st, prop!)
      gainKiller(st, 1)
      log(st, `${k.name} ไล่ Crow (+1 ▲)`, 'killer')
      emit(st, { k: 'touch', who: 'killer', what: 'crowDestroy' }, 'killer')
      return
    case 'damage':
      trigger(st, { k: 'killerBreak', what: 'damage', prop: prop!.id })
      prop!.progress = 0
      log(st, `${actorName(st)} ทำลายความคืบหน้า Generator`, 'killer', { ev: { k: 'damage', prop: prop!.id } })
      return
    case 'venerate':
      gainKiller(st, 2)
      log(st, `${k.name} บูชา Hex Totem (+2 ▲)`, 'killer')
      emit(st, { k: 'touch', who: 'killer', what: 'totem' }, 'killer')
      return
    case 'attack':
      wound(st, i.target, 'attack', `${actorName(st)} โจมตี ${st.survivors[i.target].name} — บาดเจ็บ`)
      // Brutal Strength, Agitation.
      trigger(st, { k: 'afterAttack', target: i.target })
      return
    case 'pickUp':
      // Starstruck's new target may have slipped into a locker as he came in (Quick & Quiet)
      if (st.survivors[i.target].status !== 'board' || (st.survivors[i.target].room !== k.room && !i.over)) {
        log(st, `${actorName(st)} อุ้ม ${st.survivors[i.target].name} ไม่ได้ — ไม่อยู่ให้อุ้มแล้ว`, 'killer')
        return
      }
      // The Twins: Victor can't carry — a pick-up by him is worth a ▲ instead.
      if (k.asVictor) {
        gainKiller(st, 1)
        log(st, `Victor จะอุ้ม ${st.survivors[i.target].name} — ได้ +1 ▲ แทน`, 'killer')
        return
      }
      log(st, `${k.name} อุ้ม ${st.survivors[i.target].name}`, 'killer', { ev: { k: 'pickUp', s: i.target } })
      return pickUp(st, i.target)
    case 'painResonance': {
      const hook = usableHook(st, k.room)!
      payPerk(st, 'killer', 'pain_resonance', `Interact กับ Hook ที่ ${roomName(st, hook.room!)}`)
      return wound(st, i.target, 'perk', `${st.survivors[i.target].name} บาดเจ็บ (เสียงประสานของความเจ็บปวด)`)
    }
    case 'hoard':
      payPerk(st, 'killer', 'hoarder', 'นำ Chest ออก +2 ▲')
      prop!.removed = true
      gainKiller(st, 2)
      return
    case 'undying': {
      payPerk(st, 'killer', 'undying', `ทิ้ง ${CARD_NAMES[i.card]}`)
      k.hand.splice(k.hand.indexOf(i.card), 1)
      return doKillerInteraction(st, i.i)
    }
    default:
      return
  }
}

function pickUp(st: GameState, s: number) {
  const sv = st.survivors[s]
  if (sv.status === 'locker') leaveLocker(st, s)
  sv.status = 'carried'
  sv.room = st.killer.room
  // A free hook in this room: the survivor is hung on it at once, as the rulebook has it
  // (p.18) — no choosing to carry them away, no struggle dice. (Dead Hard still gets its
  // chance, in `hang`.) Otherwise they are carried.
  const hook = usableHook(st, st.killer.room)
  if (hook) return hang(st, s, hook)
  wait(st, { t: 'carryDice', s })
}

/** A free hook in the killer's room, to hang the carried survivor on now. */
export function hookHere(st: GameState): Prop | undefined {
  return usableHook(st, st.killer.room)
}

/** `asked`: Dead Hard has had its chance at this hanging. */
function hang(st: GameState, s: number, hook: Prop, asked = false) {
  if (!asked && perkCandidates(st, { k: 'preHang', s }, []).length) {
    st.queue.unshift({ k: 'trigger', w: { k: 'preHang', s }, done: [] }, { k: 'hangDo', s, hook: hook.id })
    return
  }
  const sv = st.survivors[s]
  sv.status = 'hooked'
  sv.room = hook.room!
  hook.occupant = s
  hurt(st, s)
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
  // Grim Embrace: the ▲ on their board, each a sacrifice progress
  if (sv.embrace && st.phase !== 'over') {
    const n = sv.embrace
    sv.embrace = 0
    log(st, `อ้อมกอดของความกลัว: เก็บ ${n} ▲ จากบอร์ดของ ${sv.name} — Sacrifice Progress +${n}`, 'killer')
    addSacrifice(st, n)
  }
  // Monstrous Shrine: nobody else left standing in the room he hung them in.
  if (perkReady(st, 'killer', 'monstrous_shrine') && !onBoardIn(st, st.killer.room).length) {
    payPerk(st, 'killer', 'monstrous_shrine', '+2 ▲')
    gainKiller(st, 2)
  }
  // Hung on a hook = sacrificed (p.15): Blood Echo, Dead Man's Switch.
  if (st.phase !== 'over') trigger(st, { k: 'afterHang', s })
}

/**
 * Kindred: a sabotage pays the survivor who did it and the one taken off the hook, whichever of
 * the two owns it (p.13 wording: "both of you and the other Survivor").
 */
function kindred(st: GameState, s: number, rescued: number | null) {
  const pair = rescued === null ? [s] : [s, rescued]
  const owner = pair.find((i) => perkReady(st, i, 'kindred'))
  if (owner === undefined) return
  payPerk(st, owner, 'kindred', pair.map((i) => st.survivors[i].name).join(' + ') + ' +1 ▲')
  for (const i of pair) gainSurvivor(st, i, 1)
}

function carryStep(st: GameState, s: number, steps: number, path: string, to: string) {
  const k = st.killer
  const from = k.room
  k.room = to
  st.survivors[s].room = to
  log(st, `${k.name} แบก ${st.survivors[s].name} → ${roomName(st, to)}`, 'killer', { ev: { k: 'move', who: 'killer', from, to, path } })
  emit(st, { k: 'move', who: s, from, to, path }, s)
  // Reveal first: the flipped tile may be the hook (p.15). Rancor may bring someone along.
  st.queue.unshift(
    { k: 'reveal', room: to, who: 'killer' },
    { k: 'trigger', w: { k: 'killerEntered', room: to, from, path, carrying: true }, done: [] },
    { k: 'carryArrive', s, steps: steps - 1 },
  )
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

/** `n` can be negative (Small Game takes ▲ away); the track stops at both ends. */
function gainKiller(st: GameState, n: number) {
  const before = st.killer.bp
  st.killer.bp = Math.max(0, Math.min(KILLER_BP.max, st.killer.bp + n))
  if (st.killer.bp > before) emit(st, { k: 'bp', who: 'killer', n: st.killer.bp - before }, 'killer')
}

function gainSurvivor(st: GameState, s: number, n: number) {
  const sv = st.survivors[s]
  const before = sv.bp
  sv.bp = Math.min(survivorMax(st, s), sv.bp + n)
  if (sv.bp > before) emit(st, { k: 'bp', who: s, n: sv.bp - before }, s)
}

function cleanup(st: GameState) {
  st.phase = 'cleanup'
  const hooked = st.survivors.filter((s) => s.status === 'hooked').length
  // Blood Favour (The Blight), at the start of cleanup: everyone wounded, nobody on a hook.
  if (hooked === 0 && st.survivors.every((s) => s.wounded) && perkReady(st, 'killer', 'blood_favour')) {
    payPerk(st, 'killer', 'blood_favour', 'ทุกคนบาดเจ็บ ไม่มีใครบน Hook — Sacrifice +1')
    addSacrifice(st, 1)
    if (st.step.t === 'gameOver') return
  }
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
  // (The Unknown can't take killer bonus turns: its round starts with the bonus spent)
  Object.assign(st.killer, {
    hand: [...killerDeck(st.killer.characterId), ...(st.killer.extraCards ?? [])],
    planned: [],
    revealedCount: 0,
    plannedShown: false,
    powerUsed: false,
    bonusUsed: !!st.killer.unknowns,
    bonusAt: null,
    shown: [],
  })
  Object.assign(st, { perksUsed: [], perksMuted: [], healedWith: [], genBy: {}, empathyNo: [], leverage: null, guardian: null, dissolution: null, fearmonger: null, geneticLimits: null, plunder: null, moveBlocked: false, stridor: null, rollMods: { danger: false, keep: false }, sealedCard: null, itemBlocked: false, redeemer: null, struggle: false, deception: false, itemLock: null, kept: [], rushCard: null })
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
  discardItem(st, s, sv.item!, true)
  step.dice[die] = { ...rollDie(st, d.kind), rerolled: true }
  if (rollSettled(st)) {
    st.step = { t: 'idle' }
    resolveRoll(st, step.ctx, step.dice)
  }
}

/**
 * Survivors who can still change this roll: a key to re-roll a die, or Iron Will. Online each of
 * them answers on their own device, and the roller waits for them.
 */
export function rollHelpers(st: GameState): number[] {
  if (st.step.t !== 'roll') return []
  const perks = perkButtons(st).flatMap((b) => (b.owner === 'killer' ? [] : [b.owner]))
  return [...new Set([...rerollers(st), ...perks])].sort((a, b) => a - b)
}

/** A survivor passes on someone else's roll; once nobody is left to decide, it settles by itself. */
function passRoll(st: GameState, s: number) {
  const step = st.step
  if (step.t !== 'roll' || s === step.ctx.s || !rollHelpers(st).includes(s)) fail('nothing to pass on')
  step.passed = [...(step.passed ?? []), s]
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
  noMither: 'No Mither',
  breakdown: 'Breakdown',
  assassin: 'หลบ มือลอบสังหาร',
  deadHard: 'Dead Hard',
  spineChill: 'Spine Chill',
  deerstalker: 'Deerstalker',
  innerFocus: 'Inner Focus',
}

/** Jolt's dice: a skill die on a skill check showing 1 or 2 (danger dice number their faces otherwise). */
function joltDie(ctx: RollContext, d: Die): boolean {
  return SKILL_CHECKS.includes(ctx.k) && d.kind === 'skill' && (d.face === 1 || d.face === 2) && !d.asSuccess && !d.asFailure
}

/** `jolted`: the killer has already been asked about Jolt for this roll. */
function resolveRoll(st: GameState, ctx: RollContext, dice: Die[], failBp?: number, jolted = false) {
  if (!jolted && dice.some((d) => joltDie(ctx, d))) {
    const w: PerkWindow = { k: 'rolled', s: ctx.s, ctx: ctx.k, dice }
    if (perkCandidates(st, w, []).length) {
      st.queue.unshift({ k: 'trigger', w, done: [] }, { k: 'settleRoll', ctx, dice, failBp })
      return
    }
  }
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
  // The Jailer's roll failed: the survivor is wounded, and the Jailer leaves the board — back onto
  // The Knight's, to be placed again (a house rule: the rulebook removes it from play)
  if (st.jailerRoll === s) {
    st.jailerRoll = null
    if (!ok) {
      st.guards = { ...st.guards, jailer: undefined }
      log(st, `ผู้คุม กลับไปบนบอร์ดของ ${st.killer.name} — วางใหม่ได้`, 'killer')
      wound(st, s, 'power', `${sv.name} ทอยพลาดต่อหน้า ผู้คุม — บาดเจ็บ`)
    }
  }
  // The Skull Merchant's Drones: a skill check in a room with one face up pays him a ▲ (success)
  // or wounds (failure), and one of them turns face down; not for someone in a locker (off the board)
  if (SKILL_CHECKS.includes(ctx.k) && sv.status === 'board') {
    const drone = propsIn(st, sv.room).find((p) => p.kind === 'drone' && p.revealed)
    if (drone) {
      if (ok) {
        gainKiller(st, 1)
        log(st, `Drone เห็น ${sv.name} — ${st.killer.name} +1 ▲`, 'killer')
      } else wound(st, s, 'power', `${sv.name} ทอยพลาดใต้ Drone — บาดเจ็บ`)
      drone.revealed = false
    }
  }
  // Lucky Break: after a great success (the die kept; any die of the carry roll).
  if (isGreat(dice[0]) || (ctx.k === 'carry' && dice.some(isGreat))) trigger(st, { k: 'greatRoll', s, ctx: ctx.k })
  // Madness lasts until a failed (danger-die) skill check.
  if (MADNESS_CHECKS.includes(ctx.k) && sv.madness && dice[0].kind === 'danger' && !ok) {
    sv.madness = false
    log(st, `${sv.name} หาย บ้าคลั่ง`, s, { ev: { k: 'madness', s, on: false } })
  }

  switch (ctx.k) {
    case 'repair': {
      const gen = st.props.find((p) => p.id === ctx.prop)!
      const add = isGreat(dice[0]) ? 2 : ok ? 1 : 0
      // (held for Undone: the windows of the repair come after the progress, as they would)
      const at = addGenerator(st, gen, add, s) ? 2 : 0
      if (!ok) trigger(st, { k: 'repairFail', s, prop: gen.id }, at)
      else trigger(st, { k: 'repaired', s, prop: gen.id }, at)
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
      const before = sv.bp
      gainSurvivor(st, s, 2)
      log(st, `${sv.name} ชำระ Hex Totem สำเร็จ (+2 ▲)`, s, { ev: { k: 'cleanse', s } })
      if (ctx.retribution) {
        gainKiller(st, 2)
        log(st, `${st.killer.name} +2 ▲ (Retribution)`, 'killer')
      }
      if (perkReady(st, 'killer', 'pentimento')) {
        payPerk(st, 'killer', 'pentimento', '+2 ▲')
        gainKiller(st, 2)
      }
      trigger(st, { k: 'cleansed', s, gained: sv.bp - before })
      return
    }
    case 'heal': {
      if (!ok) return
      makeHealthy(st, ctx.target, `${st.survivors[ctx.target].name} หายบาดเจ็บ`, s)
      return
    }
    case 'botany':
      if (ok) makeHealthy(st, ctx.target, `${st.survivors[ctx.target].name} หายบาดเจ็บ (ความรู้พฤกษศาสตร์)`, s)
      return
    case 'selfCare':
      if (ok) makeHealthy(st, s, `${sv.name} หายบาดเจ็บ (ดูแลตัวเอง)`, s)
      return
    case 'hatchet':
      if (!ok) wound(st, s, 'power', `${sv.name} โดน Hatchet — บาดเจ็บ`)
      return
    case 'noMither': {
      if (!ok) return
      // the attack doesn't land; the killer gains a ▲ for it
      const at = st.queue.findIndex((t) => t.k === 'killerDo' && t.i.k === 'attack' && t.i.target === ctx.target)
      if (at >= 0) st.queue.splice(at, 1)
      log(st, `${st.survivors[ctx.target].name} ยังไม่บาดเจ็บ (ไม่โอดครวญ) — ${st.killer.name} +1 ▲`, s)
      gainKiller(st, 1)
      return
    }
    case 'assassin':
      if (!ok) wound(st, s, 'power', `${sv.name} โดน มือลอบสังหาร — บาดเจ็บ`)
      return
    case 'deerstalker': {
      // a failure: they stay in his room, and can't interact this turn
      if (ok) return
      const at = st.queue.findIndex((t) => (t.k === 'survivorGo' || t.k === 'survivorStep') && t.s === s)
      if (at >= 0) st.queue.splice(at, 1)
      // "can't interact this turn": on their own turn; on someone else's there is nothing to lose
      const own = st.phase !== 'killer' && st.activeSurvivor === s
      if (own) st.canInteract = false
      log(st, `${sv.name} ออกจากห้องไม่ได้ (นักสะกดรอยกวาง) — อยู่ที่เดิม${own ? ' Interact ไม่ได้เทิร์นนี้' : ''}`, s)
      return
    }
    case 'spineChill':
      // a success: away along any path, before he interacts (no staying put)
      if (!ok) return
      log(st, `${sv.name} รู้ตัวทัน (เสียวสันหลัง) — เดินไปตามเส้นทางใดก็ได้`, s)
      st.queue.unshift({ k: 'anyMove', s, why: 'spineChill' })
      return
    case 'breakdown':
      if (!ok || st.sacrifice <= 0) return
      st.sacrifice--
      log(st, `สติแตก สำเร็จ — ${st.killer.name} เสีย Sacrifice Progress (${st.sacrifice}/${SACRIFICE_TO_WIN})`, s, { ev: { k: 'sacrifice', total: st.sacrifice } })
      return
    case 'deadHard': {
      if (!ok) return
      // off the killer's shoulder and away along a path, instead of onto the hook
      const at = st.queue.findIndex((t) => t.k === 'hangDo' && t.s === ctx.target)
      if (at >= 0) st.queue.splice(at, 1)
      const t = st.survivors[ctx.target]
      t.status = 'board'
      t.room = st.killer.room
      log(st, `${t.name} หลุดจากการแบก (ตายยาก) — เดินไปตามเส้นทางใดก็ได้`, ctx.target, { ev: { k: 'carryEscape', s: ctx.target } })
      st.queue.unshift({ k: 'anyMove', s: ctx.target, why: 'deadHard' })
      return
    }
    case 'trap': {
      if (ok) return
      pathState(st, ctx.path).trap = false
      st.killer.trapsInSupply++
      if (sv.wounded) {
        log(st, `${sv.name} ติด กับดักหมี ขณะบาดเจ็บ — Sacrifice +1`, 'killer', { ev: { k: 'trapSprung', s, path: ctx.path } })
        addSacrifice(st, 1)
      } else {
        sv.wounded = true
        sv.woundedThisRound = true
        hurt(st, s)
        log(st, `${sv.name} ติด กับดักหมี — บาดเจ็บ`, 'killer', { ev: { k: 'trapSprung', s, path: ctx.path } })
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
      // The Twins: Victor can't pick up — the survivor stays hidden and he gains a ▲.
      if (st.killer.asVictor) {
        gainKiller(st, 1)
        log(st, `Victor เจอ ${sv.name} ใน Locker แต่อุ้มไม่ได้ — +1 ▲`, 'killer')
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

/**
 * Progress onto a generator. Undone may take one off first: the progress is then held (an `addGen`
 * task after the perk is asked) and the function says so (true).
 */
function addGenerator(st: GameState, gen: Prop, add: number, s: number, asked = false): boolean {
  const w: PerkWindow = { k: 'genProgress', prop: gen.id, add, s }
  if (!asked && add > 0 && perkCandidates(st, w, []).length) {
    st.queue.unshift({ k: 'trigger', w, done: [] }, { k: 'addGen', prop: gen.id, add, s })
    return true
  }
  const before = gen.progress
  gen.progress = Math.min(PROGRESS_MAX, gen.progress + add)
  log(st, `Generator ${gen.progress}/${PROGRESS_MAX}`, 'game', { ev: { k: 'repair', s, prop: gen.id, add: gen.progress - before, progress: gen.progress } })
  if (gen.progress >= PROGRESS_MAX && !gen.done) {
    gen.done = true
    log(st, `ซ่อม Generator เสร็จ (${generatorsDone(st)}/${GENERATORS_TO_POWER})`, 'game', { ev: { k: 'genDone', prop: gen.id, room: gen.room! } })
    if (generatorsDone(st) === GENERATORS_TO_POWER) log(st, 'Exit Gate มีไฟแล้ว!', 'game', { ev: { k: 'gatesPowered' } })
    // Hope pays its owner by itself, a generator at a time.
    st.survivors.forEach((_, i) => {
      if (!perkReady(st, i, 'hope')) return
      payPerk(st, i, 'hope', '+1 ▲')
      gainSurvivor(st, i, 1)
    })
    // Tinkerer.
    trigger(st, { k: 'genDone', prop: gen.id })
  }
  return false
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

/**
 * A survivor's item goes to the discard. `used`: discarded after using it, so Built to Last may
 * keep it (asked first); then Appraisal may take it. Items whose use draws a new one (Map's draw,
 * Commodious Toolbox) can't be kept.
 */
function discardItem(st: GameState, s: number, item: string, used: boolean) {
  if (st.survivors[s].item === item) st.survivors[s].item = null
  trigger(st, { k: 'itemDiscard', s, item })
  if (used) trigger(st, { k: 'itemUsed', s, item })
}

function applyItem(st: GameState, s: number, use: ItemUse) {
  const sv = st.survivors[s]
  const item = sv.item!
  discardItem(st, s, item, use.k !== 'draw' && item !== 'commodious_toolbox')
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
      pathState(st, use.path).wall = false
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
  drawItems(st, s, 'draw')
}

/** Survivor `s` draws an item (from a chest, or an item's own draw); Plunderer's Instinct is asked first. */
function drawItems(st: GameState, s: number, from: 'chest' | 'draw') {
  if (perkCandidates(st, { k: 'preDraw', s }, []).length) {
    st.queue.unshift({ k: 'trigger', w: { k: 'preDraw', s }, done: [] }, { k: 'drawItem', s, from })
    return
  }
  takeItems(st, s, from)
}

/** One item, or three to choose from after Plunderer's Instinct (as many as the deck still has). */
function takeItems(st: GameState, s: number, from: 'chest' | 'draw') {
  const sv = st.survivors[s]
  const drawn = st.itemDeck.splice(0, st.plunder === s ? 3 : 1)
  st.plunder = null
  if (!drawn.length) return log(st, `${sv.name} ${from === 'chest' ? 'ค้น Chest' : 'จั่ว item'} แต่ไม่มี item เหลือ`, s)
  if (drawn.length > 1) {
    log(st, `${sv.name} จั่ว ${drawn.length} ใบ: ${drawn.map((x) => ITEM_NAMES[x]).join(', ')} — เลือกเก็บ 1 ใบ`, s)
    return wait(st, { t: 'pickItem', s, drawn })
  }
  gotItem(st, s, drawn[0], from)
}

/** The item drawn (or picked) goes to the survivor; holding one already, they keep one of the two (p.12). */
function gotItem(st: GameState, s: number, item: string, from: 'chest' | 'draw' | 'pick') {
  const sv = st.survivors[s]
  const text = from === 'chest' ? `${sv.name} ค้น Chest ได้ ${ITEM_NAMES[item]}` : `${sv.name} ${from === 'pick' ? 'เก็บ' : 'จั่วได้'} ${ITEM_NAMES[item]}`
  log(st, text, s, { ev: { k: 'itemGot', s } })
  if (sv.item) wait(st, { t: 'keepItem', s, drawn: item })
  else sv.item = item
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
  // The Plague's passive: a perk under a Vile Purge can't be used
  if (o !== 'killer' && (st.survivors[o].purged ?? []).includes(perk)) return false
  // Fearmonger: this survivor can't use perks for the rest of the round
  if (o !== 'killer' && st.fearmonger === o) return false
  // Genetic Limits: nor this one
  if (o !== 'killer' && st.geneticLimits === o) return false
  // Boil Over is about being picked up: Kate answers it for herself while carried; Slippery Meat
  // is used on the hook
  const status = o === 'killer' ? 'board' : st.survivors[o].status
  return status === 'board' || (perk === 'boil_over' && status === 'carried') || (perk === 'slippery_meat' && status === 'hooked')
}

/** Machine Learning's draw: the killer perk cards (the deck: p.19) he doesn't have. */
function machinePool(st: GameState): PerkId[] {
  const k = st.killer
  const held = new Set(k.perks)
  return deckOf('killer').filter((p) => p !== 'machine_learning' && !held.has(p))
}

/**
 * Self-Aware's draw: the survivor perk cards (every survivor perk has a card in the edit-perks
 * box) that no survivor has in this game, on their board or laid over it.
 */
function selfAwarePool(st: GameState): PerkId[] {
  const held = new Set(st.survivors.flatMap((sv) => [...sv.perks, ...Object.values(sv.covered ?? {})]))
  return (Object.keys(PERKS) as PerkId[]).filter((p) => PERKS[p].side === 'survivor' && p !== 'self_aware' && !held.has(p))
}

/**
 * The edit-perks mode: a card that says "discard this perk from play" goes out of the game, and
 * the printed perk it was laid over can be used from now on (it has not been used this round).
 */
function discardPerkCard(st: GameState, s: number, perk: PerkId) {
  const sv = st.survivors[s]
  const under = sv.covered?.[perk]
  sv.perks = sv.perks.flatMap((p) => (p === perk ? (under ? [under] : []) : [p]))
  if (sv.covered) delete sv.covered[perk]
  log(st, `ทิ้ง ${PERKS[perk].name} ออกจากเกม${under ? ` — ${sv.name} ใช้ ${PERKS[under].name} ที่อยู่ใต้การ์ดได้แล้ว` : ''}`, s)
}

/**
 * Whether a perk reaches this survivor: in a locker they are off the board for interactions,
 * perks and killer powers (p.12), so no perk finds them there — not even one worded without a
 * space (Thanatophobia, Lucky Break). The killer's Search of the locker is the way to them.
 */
function inSpace(st: GameState, s: number): boolean {
  return st.survivors[s].status === 'board'
}

/** Rooms connected to `room`, as a list (for the screens and legal actions). */
export function connectedRoomsOf(st: GameState, room: string): string[] {
  return [...connectedRooms(st, room)]
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
/**
 * The skill checks Madness turns into the danger die: not the roll of a survivor searched in a
 * locker (Level 99's answer: Madness "only affects skill checks, not all rolls").
 */
const MADNESS_CHECKS: RollContext['k'][] = SKILL_CHECKS.filter((k) => k !== 'search')

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
      return inSpace(st, w.ctx.s) && inRange(st, k.room, st.survivors[w.ctx.s].room) ? NONE : []
    }
    // ----- The Nurse -----
    case 'stridor':
      // a survivor in a locker is off the board for perks (p.12), so they can't be chosen
      if (w.k !== 'planningStart') return []
      return st.survivors.flatMap((sv, i) => (sv.wounded && sv.status === 'board' ? [{ target: i }] : []))
    case 'thanatophobia':
      if (w.k !== 'preRoll' || !SKILL_CHECKS.includes(w.ctx.k) || st.rollMods.danger) return []
      return inSpace(st, w.ctx.s) && st.survivors[w.ctx.s].wounded ? NONE : []
    case 'nurses_calling':
      return [] // automatic, see makeHealthy

    // ----- cards only, on no character's board (the edit-perks mode) -----
    case 'hope':
      return [] // automatic, see addGenerator
    case 'kindred':
      return [] // automatic, see the sabotage interaction
    case 'monstrous_shrine':
      return [] // automatic, see hang
    case 'spies_from_the_shadows':
      return [] // automatic, see revealProp
    case 'small_game':
      return w.k === 'cleansed' && w.s === o ? NONE : []
    case 'this_is_not_happening':
      if (w.k !== 'preRoll' || !SKILL_CHECKS.includes(w.ctx.k) || st.rollMods.danger) return []
      return w.ctx.s === o ? NONE : []
    case 'sloppy_butcher':
      if (w.k !== 'preRoll' || w.ctx.k !== 'heal' || st.rollMods.danger) return []
      return inSpace(st, w.ctx.s) ? NONE : []
    case 'resilience':
      // the bonus turn is taken with a card from the hand, as Adrenaline's is
      if (w.k !== 'cleanupStart' || !me!.woundedThisRound || me!.status !== 'board') return []
      return [...new Set(st.survivorHands[me!.hand])].map((card) => ({ card }))
    case 'well_make_it': {
      // the one you just healed takes the bonus turn, with a card from their own hand
      if (w.k !== 'healed' || w.by !== o || w.s === o) return []
      const them = st.survivors[w.s]
      if (them.status !== 'board') return []
      return [...new Set(st.survivorHands[them.hand])].map((card) => ({ card }))
    }
    case 'renewal':
      // the end of any survivor's turn, a bonus turn's too (a house rule)
      if ((w.k !== 'turnEnd' && w.k !== 'bonusEnd') || !(st.healedWith ?? []).includes(o as number) || me!.status !== 'board') return []
      return [...new Set(st.survivorHands[me!.hand])].map((card) => ({ card }))
    case 'no_one_escapes_death':
      if (w.k !== 'killerTurnEnd' || !gatesPowered(st) || k.bonusUsed) return []
      return [...new Set(k.hand)].map((card) => ({ card }))
    case 'inner_healing':
      // a button at the start of the turn, as Self-Care is, but no roll: the card is spent instead
      return w.k === 'turnStart' && w.s === o && healable(st, o as number) ? NONE : []
    case 'situational_awareness':
      // the end of any turn of the owner's, a bonus turn's too (a house rule)
      if ((w.k !== 'turnEnd' && w.k !== 'bonusEnd') || w.s !== o || me!.status !== 'board') return []
      return [...new Set(st.survivorHands[me!.hand])].map((card) => ({ card }))
    case 'kinship':
      // her interaction for the turn: another survivor takes a bonus turn at the end of it
      if (w.k !== 'interact' || w.s !== o || st.activeSurvivor !== o || !st.canInteract) return []
      return [me!.room, ...connectedRooms(st, me!.room)].flatMap((r) =>
        onBoardIn(st, r).filter((t) => t !== o && st.survivorHands[st.survivors[t].hand].length > 0).map((target) => ({ target })),
      )
    case 'guardian':
      // the killer walked in: his interaction for the turn can only be with this survivor
      if (w.k !== 'killerEntered' || w.carrying || st.phase !== 'killer' || me!.room !== w.room || !st.canInteract) return []
      if (st.guardian !== null && st.guardian !== undefined) return []
      return st.queue.some((t) => t.k === 'killerDo') ? [] : NONE
    case 'dark_sense':
      // a room with nothing left to interact with, entered on their own turn: on along another path
      if (w.k !== 'entered' || w.s !== o || st.activeSurvivor !== o || propsIn(st, me!.room).length) return []
      return anyMoves(st, o as number)
        .filter((m) => m.path.id !== w.path)
        .map((m) => ({ path: m.path.id }))
    case 'deja_vu': {
      // he damaged a generator somewhere else: repair one here, out of her own turn
      if (w.k !== 'killerBreak' || w.what !== 'damage' || !w.prop) return []
      if (st.props.find((p) => p.id === w.prop)!.room === me!.room) return []
      return allSurvivorInteractions(st, o as number).flatMap((i) => (i.k === 'repair' ? [{ prop: i.prop }] : []))
    }
    case 'premonition':
      // he walked in, before he interacts: chase a crow here (he gains 1 ▲, they get a bonus turn)
      if (w.k !== 'killerEntered' || w.carrying || st.phase !== 'killer' || me!.room !== w.room) return []
      return propsIn(st, me!.room).flatMap((p) => (p.kind === 'crow' && p.revealed ? [{ prop: p.id }] : []))
    case 'spine_chill':
      // he walked in: the danger die, and a success sends them away along any path
      if (w.k !== 'killerEntered' || me!.room !== w.room || st.phase !== 'killer') return []
      return anyMoves(st, o as number).length ? NONE : []
    case 'lightweight':
      // the planning phase is over: discard a card and move with it, before the turns begin
      if (w.k !== 'planningEnd' || me!.status !== 'board') return []
      return [...new Set(st.survivorHands[me!.hand])].filter((card) => card !== 'wait').map((card) => ({ card }))
    case 'bitter_murmur':
      // after a one-way path (a vault) or a wall he broke: on along any path, before interacting
      if (w.k !== 'killerEntered' || w.carrying || !w.path) return []
      if (!w.broke && pathDef(st, w.path).kind !== 'vault') return []
      if (!st.canInteract || st.queue.some((t) => t.k === 'killerDo')) return []
      return exits(st, k.room, 'any')
        .filter((e) => !palletOn(st, e.path.id))
        .map((e) => ({ path: e.path.id }))
    case 'claustrophobia': {
      // a repair succeeded: the Entity onto any path's icon, as Bamboozle's (but for survivors only)
      if (w.k !== 'repaired') return []
      const tokens = new Set(boardOf(st).paths.map((p) => tokenOf(boardOf(st), p.id)))
      return [...tokens].filter((t) => !pathState(st, t).wall && !palletOn(st, t)).map((path) => ({ path }))
    }
    case 'distressing':
      // a survivor walked into a room with a locker: into the locker they go
      if (w.k !== 'entered' || st.survivors[w.s].status !== 'board') return []
      return propsIn(st, st.survivors[w.s].room).flatMap((p) => (p.kind === 'locker' && p.revealed && p.occupant === null ? [{ target: w.s, prop: p.id }] : []))
    case 'unrelenting':
      // after attacking or picking someone up: the same again on another survivor in his room
      if (w.k !== 'afterKillerInteract' || w.target === undefined) return []
      return onBoardIn(st, k.room)
        .filter((t) => t !== w.target)
        .flatMap((t) => (st.survivors[t].wounded ? (st.survivors[t].woundedThisRound ? [] : [{ target: t }]) : [{ target: t }]))
    case 'iron_grasp': {
      // a button on the struggle roll: every skill-check die is rolled again
      const step = st.step
      if (w.k !== 'roll' || step.t !== 'roll' || step.ctx.k !== 'carry') return []
      return step.dice.some((d) => d.kind === 'skill' && !d.rerolled) ? NONE : []
    }
    case 'insidious': {
      // about to attack someone healthy without having moved this turn: pick them up instead.
      // Yamaoka's Haunting's attack over a path counts: she doesn't go there (she hasn't moved),
      // the survivor is brought into her room, as every pick-up does
      const task = st.queue.find((t): t is Extract<Task, { k: 'killerDo' }> => t.k === 'killerDo')
      // (gone: a survivor's perk asked first has stopped it)
      if (w.k !== 'preKillerInteract' || w.pickUp || !task || task.i.k !== 'attack' || st.killerMoved) return []
      const sv = st.survivors[w.target]
      return !sv.wounded && sv.status === 'board' && (sv.room === st.killer.room || connectedRooms(st, st.killer.room).has(sv.room)) ? NONE : []
    }
    case 'jolt':
      // the dice are shown in the offer; the 1s and 2s become failures
      return w.k === 'rolled' ? NONE : []
    case 'plunderers_instinct':
      return w.k === 'preDraw' && w.s === o && st.itemDeck.length > 1 ? NONE : []
    case 'fearmonger':
      // at the start of planning: a survivor in his room or a room joined to it
      if (w.k !== 'planningStart' || (st.fearmonger !== null && st.fearmonger !== undefined)) return []
      return st.survivors.flatMap((sv, i) => (sv.status === 'board' && inRange(st, k.room, sv.room) ? [{ target: i }] : []))
    case 'slippery_meat':
      return w.k === 'planningStart' && me!.status === 'hooked' ? NONE : []
    case 'self_aware':
      return w.k === 'turnStart' && w.s === o && selfAwarePool(st).length ? NONE : []
    case 'deerstalker':
      return w.k === 'survivorLeave' && st.survivors[w.s].wounded ? NONE : []
    case 'thrill_of_the_hunt':
      // he follows along the same path (a pallet there: he breaks it and stays); not while carrying someone
      if (w.k !== 'survivorLeave' || st.survivors.some((sv) => sv.status === 'carried')) return []
      return st.queue.some((t) => t.k === 'killerFollow' && t.s === w.s) ? [] : NONE
    case 'no_one_left_behind': {
      // their interaction, with an exit gate in the room (powered or not): someone moves
      if (w.k !== 'interact' || w.s !== o || st.activeSurvivor !== o || !st.canInteract) return []
      if (!propsIn(st, me!.room).some((p) => p.kind === 'exitGate' && p.revealed)) return []
      return st.survivors.flatMap((sv, i) => (sv.status === 'board' ? anyMoves(st, i).map((m) => ({ target: i, path: m.path.id })) : []))
    }
    case 'whispers':
      // at the start of planning: one survivor pays 1 ▲ or sets their card face up (one slot)
      if (w.k !== 'planningStart' || st.stridor !== null) return []
      return st.survivors.flatMap((sv, i) => (sv.status === 'board' && sv.planned === null && st.survivorHands[sv.hand].length ? [{ target: i }] : []))
    // ----- The Huntress -----
    case 'huntress_lullaby':
      if (w.k !== 'cardMove' || !k.hand.includes(w.card) || st.deception || !movePending(st, w.s)) return []
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
      return k.planned.map((_, i) => i).filter((i) => !k.shown.includes(i)).map((index) => ({ index }))
    case 'enduring':
      return w.k === 'palletBlock' ? NONE : []
    // ----- The Singularity -----
    case 'machine_learning':
      return w.k === 'genDone' && machinePool(st).length ? NONE : []
    case 'genetic_limits':
      // a survivor with their sacrifice progress still on their board
      if (w.k !== 'planningEnd') return []
      return st.survivors.flatMap((sv, i) => (sv.sacrificeToken && st.geneticLimits !== i ? [{ target: i }] : []))
    case 'forced_hesitation':
      // Wait still in his hand (not set): a survivor on the board with a card set
      if (w.k !== 'planningEnd' || !k.hand.includes('wait')) return []
      return st.survivors.flatMap((sv, i) => (sv.status === 'board' && sv.planned ? [{ target: i }] : []))
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
      return inSpace(st, w.ctx.s) && inRange(st, me!.room, st.survivors[w.ctx.s].room) ? NONE : []
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
      if (w.k !== 'killerEntered' || w.carrying || me!.room !== w.room) return []
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
      return onBoardIn(st, me!.room).flatMap((i) => (i !== o && healable(st, i) ? [{ target: i }] : []))
    }
    case 'empathy': {
      if (w.k !== 'turnStart' || w.s !== o) return []
      const out: PerkChoice[] = []
      st.survivors.forEach((sv, i) => {
        if (i === o || sv.status === 'hooked') return
        // someone who said no this round isn't asked again
        if ((st.empathyNo ?? []).includes(`${o}:${i}`)) return
        if (sv.bp >= 1 && me!.bp < survivorMax(st, o as number)) out.push({ target: i, mode: 'take' })
        if (me!.bp >= 1 && sv.bp < survivorMax(st, i)) out.push({ target: i, mode: 'give' })
      })
      return out
    }
    case 'self_care':
      return w.k === 'turnStart' && w.s === o && healable(st, o as number) ? NONE : []
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
        .filter((p) => !pathState(st, p.id).wall)
        .map((p) => ({ path: p.id }))
    }
    case 'urban_evasion':
      if (w.k !== 'turnBegin' || st.evadedWall) return []
      return Object.keys(st.paths)
        .filter((id) => pathState(st, id).wall)
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
      return w.k === 'greatRoll' && inSpace(st, w.s) && healable(st, o as number) ? NONE : []
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
      const heal = onBoardIn(st, me!.room).flatMap((i) => (i !== o && healable(st, i) ? [{ target: i }] : []))
      const gens = propsIn(st, me!.room).flatMap((p) => (p.kind === 'generator' && p.revealed ? [{ prop: p.id }] : []))
      return [...heal, ...gens]
    }
    case 'off_the_record':
      return w.k === 'rollFail' && w.fails > 0 && inSpace(st, w.s) && inRange(st, me!.room, st.survivors[w.s].room) ? NONE : []
    // ----- The Twins -----
    case 'coup_de_grace':
      return w.k === 'killerTurnEnd' && !k.bonusUsed ? NONE : []
    case 'hoarder':
      return [] // an interaction, see killerInteractions
    case 'oppression': {
      if (w.k !== 'killerBreak' || w.what !== 'damage') return []
      const gens = st.props.filter((p) => p.kind === 'generator' && p.revealed && !p.done && !p.removed && p.progress > 0 && p.id !== w.prop)
      const out: PerkChoice[] = gens.map((g) => ({ prop: g.id }))
      gens.forEach((a2, i) => gens.slice(i + 1).forEach((b) => out.push({ prop: a2.id, prop2: b.id })))
      return out
    }
    // ----- The Blight -----
    case 'blood_favour':
      return [] // automatic, see cleanup
    case 'dragons_grip': {
      if (w.k !== 'killerBreak' || w.what !== 'damage' || !w.prop) return []
      const room = st.props.find((p) => p.id === w.prop)!.room!
      const cards = k.hand.filter((c) => c !== 'wait')
      const sets: MoveCard[][] = [...new Set(cards)].map((c) => [c])
      ;[...new Set(cards)].forEach((a2, i, all) =>
        all.slice(i).forEach((b) => (a2 !== b || cards.filter((c) => c === a2).length > 1) && sets.push([a2, b])),
      )
      return sets.filter((set) => gripTargets(st, room, set).length).map(([card, card2]) => ({ card, ...(card2 ? { card2 } : {}) }))
    }
    case 'undying':
      return [] // an interaction, see killerInteractions
    // ----- The Legion -----
    case 'mad_grit':
      // carrying someone into a room with another survivor: that one is wounded
      if (w.k !== 'killerEntered' || !w.carrying) return []
      return onBoardIn(st, w.room).flatMap((t) => (!st.survivors[t].wounded ? [{ target: t }] : []))
    case 'discordance': {
      // a survivor entered a room where another survivor is: ▲ for each survivor and killer there
      if (w.k !== 'entered') return []
      const room = st.survivors[w.s].room
      return onBoardIn(st, room).length > 1 ? NONE : []
    }
    case 'iron_maiden': {
      if (w.k !== 'killerInteract') return []
      const free = (p: Prop) => p.revealed && !p.removed && p.room !== null && p.occupant === null
      const lockers = st.props.filter((p) => p.kind === 'locker' && free(p))
      const hooks = st.props.filter((p) => p.kind === 'hook' && free(p))
      return lockers.flatMap((l) => hooks.filter((h) => h.room !== l.room).map((h) => ({ prop: l.id, prop2: h.id })))
    }
    // ----- The Spirit -----
    case 'rancor': {
      // a wounded survivor in the room she just left comes along (carrying someone too)
      if (w.k !== 'killerEntered' || !w.from || w.from === w.room || k.asVictor) return []
      return onBoardIn(st, w.from).flatMap((t) => (st.survivors[t].wounded ? [{ target: t }] : []))
    }
    case 'haunted_ground': {
      if (w.k !== 'afterReveal') return []
      const p = st.props.find((x) => x.id === w.prop)!
      // generators (and gates) with progress, pallets on a path, occupied lockers and hooks stay
      const swappable = (x: Prop) => !x.removed && !x.done && x.room !== null && x.revealed && x.occupant === null && !((x.kind === 'generator' || x.kind === 'exitGate') && x.progress > 0)
      if (!swappable(p)) return []
      return st.props.filter((x) => x.id !== p.id && x.category === p.category && x.kind !== p.kind && x.room !== p.room && swappable(x)).map((x) => ({ prop: x.id }))
    }
    case 'spirit_fury':
      return w.k === 'killerBreak' && w.what === 'pallet' ? NONE : []
    // ----- The Unknown -----
    case 'unbound': {
      // a movement card he holds only one of: a second one, for good
      if (w.k !== 'planningStart') return []
      const single = [...new Set(k.hand)].filter((c) => k.hand.filter((x) => x === c).length === 1)
      return single.map((card) => ({ card }))
    }
    case 'undone': {
      // progress about to go onto a generator in his room (any Unknown's)
      if (w.k !== 'genProgress') return []
      const gen = st.props.find((p) => p.id === w.prop)
      return gen?.room && killerIn(st, gen.room) ? NONE : []
    }
    case 'unforeseen': {
      // a generator completed: straight to its room (The Unknown: one of them, of his choice)
      if (w.k !== 'genDone' || !w.prop) return []
      const room = st.props.find((p) => p.id === w.prop)?.room
      if (!room) return []
      if (!k.unknowns) return k.room === room ? [] : NONE
      return unknownRooms(st).flatMap((r, index) => (r && r !== room ? [{ index }] : []))
    }
    // ----- The Skull Merchant -----
    case 'game_afoot': {
      // an attack on someone healthy in his room on his bonus turn: a pick-up instead
      if (w.k !== 'preKillerInteract' || w.pickUp || w.turn === null || w.turn === undefined || w.turn !== k.bonusAt) return []
      const sv = st.survivors[w.target]
      return !sv.wounded && sv.status === 'board' && sv.room === st.killer.room ? NONE : []
    }
    case 'leverage':
      // a survivor who can't become healthy this round
      if (w.k !== 'planningStart' || (st.leverage !== null && st.leverage !== undefined)) return []
      return st.survivors.map((_, i) => ({ target: i }))
    case 'thwack': {
      if (w.k !== 'killerRevealed') return []
      const p = st.props.find((x) => x.id === w.prop)
      return p && !p.removed && p.occupant === null ? NONE : []
    }
    // ----- The Artist -----
    case 'grim_embrace':
      // a rescue: a ▲ from the supply on the rescuer's board
      return w.k === 'afterSabotage' && w.rescued !== undefined ? NONE : []
    case 'pain_resonance':
      return [] // an interaction, see killerInteractions
    case 'pentimento':
      return [] // automatic, see the cleanse
    // ----- The Dredge -----
    case 'darkness_revealed':
      // entering a room with an empty locker: that, face down, instead of a reveal, and on
      return w.k === 'killerArrived' && darkLocker(st, w.room) && darkMoves(st).length ? NONE : []
    case 'dissolution': {
      // a ▲ on a path's icon with nothing else on it
      if (w.k !== 'planningStart') return []
      const tokens = new Set(boardOf(st).paths.map((p) => tokenOf(boardOf(st), p.id)))
      return [...tokens].filter((t) => pathFree(st, t)).map((path) => ({ path }))
    }
    case 'septic_touch': {
      // a survivor's reveal of a prop that isn't yellow, in his room or a connected one
      if (w.k !== 'afterReveal') return []
      const p = st.props.find((x) => x.id === w.prop)
      return p && !p.removed && p.room && p.category !== 'objective' && p.occupant === null && inRange(st, k.room, p.room) ? NONE : []
    }
    // ----- The Knight -----
    case 'face_the_darkness':
      return w.k === 'killerTurnBegin' ? guardOptions(st) : []
    case 'nowhere_to_hide':
      return w.k === 'preRoll' && w.ctx.k === 'search' && !st.rollMods.danger ? NONE : []
    case 'hubris': {
      // a survivor walking into his room, by any move
      if (w.k !== 'entered') return []
      const sv = st.survivors[w.s]
      return sv.status === 'board' && killerIn(st, sv.room) ? NONE : []
    }
    // ----- The Clown -----
    case 'coulrophobia':
      return w.k === 'preEnter' ? NONE : []
    case 'bamboozle': {
      // the Entity on a path's icon (a fork is one), not on a wall already or under a pallet
      if (w.k !== 'planningStart') return []
      const tokens = new Set(boardOf(st).paths.map((p) => tokenOf(boardOf(st), p.id)))
      return [...tokens].filter((t) => !pathState(st, t).wall && !palletOn(st, t)).map((path) => ({ path }))
    }
    case 'pop_goes_the_weasel': {
      // after a wound (an attack) or a hanging: a crow, a chest or an empty locker next door
      if (w.k !== 'afterAttack' && w.k !== 'afterHang') return []
      return [...connectedRooms(st, k.room)].flatMap((r) =>
        propsIn(st, r).flatMap((p) => (p.revealed && (p.kind === 'crow' || p.kind === 'chest' || (p.kind === 'locker' && p.occupant === null)) ? [{ prop: p.id }] : [])),
      )
    }
    // ----- The Plague -----
    case 'dark_devotion':
      // at the start of cleanup: a survivor in his room or a connected one, along any path
      if (w.k !== 'cleanupStart') return []
      return st.survivors.flatMap((sv, i) => (sv.status === 'board' && inRange(st, k.room, sv.room) ? anyMoves(st, i).map((m) => ({ target: i, path: m.path.id })) : []))
    case 'corrupt_intervention':
      // the Entity on a revealed generator anywhere, until cleanup
      if (w.k !== 'planningStart') return []
      return st.props.flatMap((p) => (p.kind === 'generator' && p.revealed && p.room && !p.removed && !p.done ? [{ prop: p.id }] : []))
    case 'infectious_fright':
      // after attacking a healthy survivor (afterAttack): a survivor in a connected room moves
      if (w.k !== 'afterAttack') return []
      return [...connectedRooms(st, k.room)].flatMap((r) => onBoardIn(st, r).flatMap((i) => anyMoves(st, i).map((m) => ({ target: i, path: m.path.id }))))
    // ----- The Trickster -----
    case 'no_way_out':
      return w.k === 'genInteract' && st.survivors[w.s].bp < k.bp ? NONE : []
    case 'crowd_control':
      // a survivor who will set a card this planning (not hooked, not in a locker: p.12)
      if (w.k !== 'planningStart') return []
      return st.survivors.flatMap((sv, i) => (sv.status === 'board' && sv.planned === null && st.survivorHands[sv.hand].length ? [{ target: i }] : []))
    case 'starstruck': {
      // about to pick someone up: along any path (not through a pallet; a wall he breaks), and
      // another survivor there is picked up instead, wounded or not
      const task = st.queue.find((t): t is Extract<Task, { k: 'killerDo' }> => t.k === 'killerDo')
      // (Red Herring, asked first, may have turned it into damaging a generator)
      if (w.k !== 'preKillerInteract' || !w.pickUp || !task || task.i.k !== 'pickUp' || k.asVictor) return []
      const out: PerkChoice[] = []
      for (const p of touchingPaths(st, k.room)) {
        if (palletOn(st, p.id)) continue
        const to = p.a === k.room ? p.b : p.a
        for (const t of onBoardIn(st, to)) if (t !== w.target) out.push({ path: p.id, target: t })
      }
      return out
    }
    // ----- Yun-Jin -----
    case 'smash_hit':
      return w.k === 'killerBreak' ? NONE : []
    case 'fast_track':
    case 'self_preservation': {
      // at the end of a turn (a survivor's or the killer's) in which someone else was wounded or
      // hung: an interaction with a generator / locker in her room, out of her own turn
      if (w.k !== 'turnEnd' && w.k !== 'killerTurnEnd') return []
      if (!(st.turnHurt ?? []).some((t) => t !== o)) return []
      const want = perk === 'fast_track' ? 'repair' : 'hide'
      return allSurvivorInteractions(st, o as number).flatMap((i) => (i.k === want ? [{ prop: i.prop }] : []))
    }
    // ----- Élodie -----
    case 'power_struggle':
    case 'diversion':
      return [] // an interaction, see survivorInteractions
    // ----- Vittorio -----
    case 'potential_energy': {
      // a progress from a generator next door to one in his room (not a repaired one either side)
      if (w.k !== 'turnStart' || w.s !== o || me!.status !== 'board') return []
      const gen = (p: Prop) => p.kind === 'generator' && p.revealed && !p.done && !p.removed
      const to = propsIn(st, me!.room).filter((p) => gen(p) && p.progress < PROGRESS_MAX && !entityOn(st, { prop: p.id }))
      const from = [...connectedRooms(st, me!.room)].flatMap((r) => propsIn(st, r).filter((p) => gen(p) && p.progress > 0))
      return from.flatMap((a) => to.map((b) => ({ prop: a.id, prop2: b.id })))
    }
    case 'fogwise': {
      // a wall or a pallet on a path of his room, to another path of his room with nothing on it
      if (w.k !== 'turnStart' || w.s !== o || me!.status !== 'board') return []
      const tokens = [...new Set(touchingPaths(st, me!.room).map((p) => tokenOf(boardOf(st), p.id)))]
      const from = tokens.filter((t) => pathState(st, t).wall || palletOn(st, t))
      const to = tokens.filter((t) => pathFree(st, t))
      return from.flatMap((a) => to.filter((b) => b !== a).map((b) => ({ path: a, path2: b })))
    }
    // ----- Renato -----
    case 'collective_stealth':
    case 'power_of_two':
      return [] // an interaction of the others, see allSurvivorInteractions
    case 'background_player':
      // the end of any turn of his (a bonus turn's too: a house rule), with someone on a hook
      if ((w.k !== 'turnEnd' && w.k !== 'bonusEnd') || w.s !== o || me!.status !== 'board' || !st.survivors.some((sv) => sv.status === 'hooked')) return []
      return [...new Set(st.survivorHands[me!.hand])].map((card) => ({ card }))
    case 'blood_rush':
      // the end of any turn of his (a bonus turn's too: a house rule), with no sacrifice progress on his board
      if ((w.k !== 'turnEnd' && w.k !== 'bonusEnd') || w.s !== o || me!.status !== 'board' || me!.sacrificeToken) return []
      return [...new Set(st.survivorHands[me!.hand])].map((card) => ({ card }))
    // ----- Gabriel -----
    case 'scavenger':
      // at the start of his turn, holding an item: a face-up generator in his room
      if (w.k !== 'turnStart' || w.s !== o || !me!.item) return []
      return propsIn(st, me!.room).flatMap((p) => (p.kind === 'generator' && p.revealed ? [{ prop: p.id }] : []))
    case 'troubleshooter':
      // after a move of his into a room: on along another path, into a room with a face-up generator
      if (w.k !== 'entered' || w.s !== o) return []
      return anyMoves(st, o as number)
        .filter((m) => m.path.id !== w.path && propsIn(st, m.to).some((p) => p.kind === 'generator' && p.revealed))
        .map((m) => ({ path: m.path.id }))
    case 'made_for_this': {
      // the killer about to pick him up (before any dice): the pick-up still to come
      const task = st.queue.find((t): t is Extract<Task, { k: 'killerDo' }> => t.k === 'killerDo')
      if (w.k !== 'preKillerInteract' || !w.pickUp || w.target !== o || !task || task.i.k !== 'pickUp' || task.i.target !== o) return []
      return NONE
    }
    // ----- Sable -----
    case 'wicked':
      // her interaction for the turn
      return w.k === 'interact' && w.s === o && st.activeSurvivor === o && st.canInteract ? NONE : []
    case 'strength_in_shadows':
      // at the start of her turn: a wounded survivor on the board (anywhere) with no sacrifice
      // progress left on their board
      if (w.k !== 'turnStart' || w.s !== o) return []
      return st.survivors.flatMap((sv, i) => (sv.status === 'board' && !sv.sacrificeToken && healable(st, i) ? [{ target: i }] : []))
    case 'weaving_spiders': {
      // her interaction for the turn: 6 ▲ from the survivors in her room, for a face-up generator
      if (w.k !== 'interact' || w.s !== o || st.activeSurvivor !== o || !st.canInteract) return []
      const gens = st.props.filter((p) => p.kind === 'generator' && p.room && p.revealed && !p.done && !p.removed)
      // enough ▲ between them; who puts in what is asked next (weavePay)
      if (onBoardIn(st, me!.room).reduce((t, i) => t + st.survivors[i].bp, 0) < WEAVING_COST) return []
      return gens.map((g) => ({ prop: g.id }))
    }
    // ----- Thalita -----
    case 'friendly_competition': {
      // after her own repair (success or not) of a generator someone else worked on this round
      if ((w.k !== 'repaired' && w.k !== 'repairFail') || w.s !== o) return []
      const gen = st.props.find((p) => p.id === w.prop)
      if (!gen || gen.done || gen.removed) return []
      return (st.genBy?.[gen.id] ?? []).some((x) => x !== o) ? NONE : []
    }
    case 'cut_loose':
      // her planned card turns out to be Vault: play it as another colour
      if (w.k !== 'cardMove' || !w.planned || w.s !== o || w.card !== 'vault' || st.activeSurvivor !== o || !movePending(st, o as number)) return []
      // only the colours that go somewhere (one that can't would only lose her the interaction)
      return (['sneak', 'crouch', 'sprint'] as const).filter((card) => survivorMoves(st, o as number, card).length).map((card) => ({ card }))
    case 'quick_gambit':
      // he leaves the killer's room: the killer comes along (not while carrying, not twice)
      if (w.k !== 'survivorLeave' || w.s !== o || st.survivors.some((sv) => sv.status === 'carried')) return []
      return st.queue.some((t) => t.k === 'killerFollow' && t.s === w.s) ? [] : NONE
    // ----- Mikaela -----
    case 'circle_of_healing':
      // after her own cleanse: a wounded survivor on the board healthy, for its ▲ (in a locker, hung
      // or carried they are off the board, p.12)
      if (w.k !== 'cleansed' || w.s !== o) return []
      return st.survivors.flatMap((sv, i) => (sv.status === 'board' && healable(st, i) ? [{ target: i }] : []))
    case 'shadow_step':
      // after a move of hers along a path: the Entity onto it (its icon), not where it is already
      if (w.k !== 'entered' || w.s !== o || !w.path) return []
      return entityOn(st, { path: w.path }) ? [] : NONE
    case 'clairvoyance':
      // a face-down prop anywhere
      if (w.k !== 'planningStart') return []
      return st.props.flatMap((p) => (p.room && !p.removed && !p.revealed ? [{ prop: p.id }] : []))
    // ----- Jonah -----
    case 'exponential': {
      // after his own cleanse: a sacrificed survivor off the hook along any path, for its ▲
      if (w.k !== 'cleansed' || w.s !== o) return []
      return st.survivors.flatMap((sv, i) => (sv.status === 'hooked' ? anyMoves(st, i).map((m) => ({ target: i, path: m.path.id })) : []))
    }
    case 'overcome':
      return [] // automatic, see endSurvivorTurn
    case 'corrective_action': {
      // a skill die showing "4" becomes a great success, for a survivor in Jonah's room or a
      // connected one (as Autodidact, which turns any success)
      const step = st.step
      if (w.k !== 'roll' || step.t !== 'roll' || step.ctx.k === 'phantasm') return []
      if (!inRange(st, me!.room, st.survivors[step.ctx.s].room)) return []
      return step.dice.flatMap((d, index) => (d.kind === 'skill' && d.face === 4 && !d.asFailure ? [{ index }] : []))
    }
    // ----- Adam -----
    case 'autodidact': {
      // a success (not a great one, not a failure Iron Will turned) becomes a great success, for
      // a survivor in Adam's room or a connected one — any roll of theirs, struggling free too
      const step = st.step
      if (w.k !== 'roll' || step.t !== 'roll' || step.ctx.k === 'phantasm') return []
      if (!inRange(st, me!.room, st.survivors[step.ctx.s].room)) return []
      return step.dice.flatMap((d, index) => (!isFailure(d) && !isGreat(d) ? [{ index }] : []))
    }
    case 'deliverance': {
      // after a rescue Adam made, or one that took him off the hook: one of the two is healed
      if (w.k !== 'afterSabotage' || w.rescued === undefined) return []
      const other = w.s === o ? w.rescued : w.rescued === o ? w.s : null
      if (other === null) return []
      return [o as number, other].filter((t) => healable(st, t)).map((target) => ({ target }))
    }
    case 'appraisal':
      return w.k === 'itemDiscard' && w.s !== o && st.survivors[w.s].item !== w.item ? NONE : []
    case 'deception':
      return w.k === 'cardMove' && w.s === o && st.activeSurvivor === o && movePending(st, o as number) ? NONE : []
    // ----- Haddie -----
    case 'overzealous':
      return [] // automatic, see survivorArrives
    case 'residual_manifest':
      // the killer about to interact in her room: her item, discarded, stops it
      return w.k === 'killerWouldInteract' && me!.status === 'board' && me!.room === w.room && me!.item ? NONE : []
    case 'inner_focus':
      // her card move about to be made (not one a perk has already changed)
      return w.k === 'cardMove' && w.s === o && movePending(st, o as number) ? NONE : []
    // ----- Felix -----
    case 'desperate_measures':
      if (w.k !== 'afterSurvivorInteract' || w.s !== o || st.activeSurvivor !== o || me!.status !== 'board') return []
      return allSurvivorInteractions(st, o).some((i) => 'prop' in i && st.props.find((p) => p.id === i.prop)!.category === 'survival') ? NONE : []
    case 'visionary': {
      if (w.k !== 'beforeReveal' || w.s !== o) return []
      // one face-down tile per colour and room: which tile of a colour is flipped doesn't matter
      const seen = new Set<string>()
      const out: PerkChoice[] = []
      for (const r of connectedRooms(st, w.room))
        for (const p of propsIn(st, r))
          if (!p.revealed && !seen.has(`${r}:${p.category}`)) {
            seen.add(`${r}:${p.category}`)
            out.push({ prop: p.id })
          }
      return out
    }
    // ----- Jeff -----
    case 'breakdown':
      // a rescue Jeff made, or one that took him off the hook; a sacrifice progress to take
      if (w.k !== 'afterSabotage' || w.rescued === undefined || st.sacrifice <= 0) return []
      return w.s === o || w.rescued === o ? NONE : []
    case 'aftercare':
      // anyone healthy again: the Entity onto an empty hook anywhere
      if (w.k !== 'healed') return []
      return st.props.flatMap((p) => (p.kind === 'hook' && p.revealed && p.room && !p.removed && p.occupant === null && !entityOn(st, { prop: p.id }) ? [{ prop: p.id }] : []))
    case 'distortion':
      // any move of his on his turn into the killer's room: again, along another path
      if (w.k !== 'entered' || w.s !== o || st.activeSurvivor !== o || !killerIn(st, me!.room)) return []
      return anyMoves(st, o as number)
        .filter((m) => m.path.id !== w.path)
        .map((m) => ({ path: m.path.id }))
    // ----- David -----
    case 'no_mither': {
      // the killer about to attack a healthy survivor in David's room (himself too)
      const task = st.queue.find((t): t is Extract<Task, { k: 'killerDo' }> => t.k === 'killerDo')
      if (w.k !== 'preKillerInteract' || w.pickUp || !task || task.i.k !== 'attack') return []
      const t = st.survivors[w.target]
      return !t.wounded && t.room === me!.room ? NONE : []
    }
    case 'dead_hard':
      // another survivor about to be hung in David's room
      return w.k === 'preHang' && w.s !== o && st.survivors[w.s].room === me!.room ? NONE : []
    case 'wgl_forever':
      // the killer about to leave David's room with a card
      return w.k === 'preLeave' && st.killer.room === me!.room ? NONE : []
    // ----- Kate -----
    case 'windows_of_opportunity':
      // her interaction for the turn, with a survival or altruism prop in a connected room
      if (w.k !== 'interact' || w.s !== o || st.activeSurvivor !== o || !st.canInteract) return []
      return [...connectedRooms(st, me!.room)].flatMap((r) => windowProps(st, r))
    case 'boil_over': {
      // the survivor picked up is Kate, or one who was in her room
      if (w.k !== 'carryRoll' || w.n >= 4) return []
      return w.s === o || me!.room === st.survivors[w.s].room ? NONE : []
    }
    case 'dance_with_me':
      // after her card move, when her turn began in a locker: again, along another path
      if (w.k !== 'afterCardMove' || w.s !== o || st.lockerTurn !== o) return []
      return anyMoves(st, o as number)
        .filter((m) => m.path.id !== w.path)
        .map((m) => ({ path: m.path.id }))
    // ----- Jane -----
    case 'poised': {
      // a skill check's great success on a survivor turn: that survivor takes a bonus turn
      if (w.k !== 'greatRoll' || !w.ctx || !SKILL_CHECKS.includes(w.ctx) || st.phase !== 'survivors' || st.activeSurvivor === null) return []
      const sv = st.survivors[w.s]
      return inSpace(st, w.s) && st.survivorHands[sv.hand].length > 0 ? [{ target: w.s }] : []
    }
    case 'solidarity':
      // her interaction for the turn: the ordinary heal, on a survivor in a connected room
      if (w.k !== 'interact' || w.s !== o || st.activeSurvivor !== o || !st.canInteract) return []
      return [...connectedRooms(st, me!.room)].flatMap((r) => onBoardIn(st, r).filter((t) => healable(st, t)).map((target) => ({ target })))
    case 'head_on':
      // the killer walked in on her during his turn: an empty locker here goes, and with it his
      // interaction (carrying, he has interacted already)
      if (w.k !== 'killerEntered' || w.carrying || st.phase !== 'killer' || me!.room !== w.room || !st.canInteract) return []
      if (st.queue.some((t) => t.k === 'killerDo')) return []
      return propsIn(st, w.room).flatMap((p) => (p.kind === 'locker' && p.revealed && p.occupant === null ? [{ prop: p.id }] : []))
    case 'built_to_last':
      return w.k === 'itemUsed' && w.s === o && me!.item === null ? NONE : []
  }
}

/** Dragon's Grip: healthy survivors in rooms joined to `room` by a path of one of `cards`' colours. */
export function gripTargets(st: GameState, room: string, cards: MoveCard[]): number[] {
  const rooms = new Set(touchingPaths(st, room).filter((p) => cards.includes(p.kind)).map((p) => (p.a === room ? p.b : p.a)))
  return st.survivors.flatMap((sv, i) => (sv.status === 'board' && !sv.wounded && rooms.has(sv.room) ? [i] : []))
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
  if (step.t === 'turnStart') add(step.s, { k: 'turnStart', s: step.s }, ['self_care', 'empathy', 'botany_knowledge', 'breakout', 'inner_healing', 'self_aware', 'potential_energy', 'fogwise', 'strength_in_shadows', 'scavenger'])
  if (step.t === 'survivorInteract')
    add(step.s, { k: 'interact', s: step.s }, ['prove_thyself', 'botany_knowledge', 'ace_in_the_hole', 'balanced_landing', 'solidarity', 'windows_of_opportunity', 'kinship', 'no_one_left_behind', 'wicked', 'weaving_spiders'])
  if (step.t === 'roll') st.survivors.forEach((_, i) => !step.passed?.includes(i) && add(i, { k: 'roll' }, ['iron_will', 'autodidact', 'corrective_action']))
  // Iron Grasp: his own button on the struggle roll, before it is settled
  if (step.t === 'roll' && step.ctx.k === 'carry') add('killer', { k: 'roll' }, ['iron_grasp'])
  if (step.t === 'killerInteract' && step.canInteract && !step.powerOnly) add('killer', { k: 'killerInteract' }, ['iron_maiden'])
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
  // Iron Maiden comes before interacting: the killer is back in the same step after it
  if (step.t === 'killerInteract') wait(st, step)
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
      if (pathState(st, e.path.id).wall) {
        pathState(st, e.path.id).wall = false
        log(st, 'กำแพงพัง', 'killer', { ev: { k: 'wallBreak', path: e.path.id } })
      }
      return moveSurvivor(st, t, e.path, e.to)
    }
    case 'agitation':
    case 'beast_of_prey': {
      const e = exits(st, k.room, 'any').find((x) => x.path.id === c.path)!
      payPerk(st, o, perk)
      return killerMovedBy(st, e.path, e.to)
    }
    case 'unnerving_presence':
    case 'thanatophobia':
      payPerk(st, o, perk, 'ทอย Danger Die แทน')
      st.rollMods.danger = true
      return

    // ----- cards only, on no character's board (the edit-perks mode) -----
    case 'this_is_not_happening':
    case 'sloppy_butcher':
      payPerk(st, o, perk, 'ทอย Danger Die แทน')
      st.rollMods.danger = true
      return
    case 'small_game':
      payPerk(st, o, perk, `${k.name} −2 ▲`)
      gainKiller(st, -2)
      return
    case 'resilience':
    case 'renewal':
      payPerk(st, o, perk, 'Bonus Turn')
      return startBonusMove(st, o as number, c.card as PathKind)
    case 'well_make_it': {
      const target = (w as Extract<PerkWindow, { k: 'healed' }>).s
      payPerk(st, o, perk, `${name(target)} เล่น Bonus Turn`)
      return startBonusMove(st, target, c.card as PathKind)
    }
    case 'no_one_escapes_death': {
      // "at the end of your turn, take a bonus turn": right after this one, before his next card
      const turn = (w as Extract<PerkWindow, { k: 'killerTurnEnd' }>).turn
      payPerk(st, o, perk, 'Bonus Turn')
      k.hand.splice(k.hand.indexOf(c.card!), 1)
      k.planned.splice(turn + 1, 0, c.card!)
      k.shown = k.shown.map((i) => (i > turn ? i + 1 : i))
      k.bonusUsed = true
      k.bonusAt = turn + 1
      return
    }
    case 'inner_healing':
      payPerk(st, o, perk, 'หายบาดเจ็บ')
      discardPerkCard(st, o as number, perk)
      return makeHealthy(st, o as number, `${name(o as number)} หายบาดเจ็บเอง (พละกำลังในจิตใจ)`, o as number)
    case 'situational_awareness':
      payPerk(st, o, perk, 'Bonus Turn')
      discardPerkCard(st, o as number, perk)
      return startBonusMove(st, o as number, c.card as PathKind)
    case 'kinship': {
      payPerk(st, o, perk, `${name(c.target!)} เล่น Bonus Turn ท้ายเทิร์นนี้`)
      discardPerkCard(st, o as number, perk)
      // "after this one": at the end of this turn, after its end-of-turn perks
      const at = st.queue.findIndex((t) => t.k === 'endSurvivorTurn')
      st.queue.splice(at < 0 ? st.queue.length : at, 0, { k: 'poisedTurn', s: c.target! })
      return
    }
    case 'guardian':
      payPerk(st, o, perk, `${k.name} Interact ได้แค่กับ ${name(o as number)} เทิร์นนี้`)
      discardPerkCard(st, o as number, perk)
      st.guardian = o as number
      return
    case 'dark_sense': {
      const m = anyMoves(st, o as number).find((x) => x.path.id === c.path)!
      payPerk(st, o, perk, `เดินต่อไป ${roomName(st, m.to)}`)
      return moveSurvivor(st, o as number, m.path, m.to)
    }
    case 'deja_vu': {
      payPerk(st, o, perk, 'ซ่อม Generator ในห้องของตัวเอง')
      return survivorInteract(st, o as number, { k: 'repair', prop: c.prop! })
    }
    case 'premonition':
      payPerk(st, o, perk, 'ไล่ Crow ก่อนฆาตกร Interact')
      return survivorInteract(st, o as number, { k: 'crow', prop: c.prop! })
    case 'spine_chill':
      payPerk(st, o, perk, 'ทอย Danger Die — สำเร็จ = เดินหนีไปตามเส้นทางใดก็ได้')
      return startRoll(st, { k: 'spineChill', s: o as number }, 1, 'danger')
    case 'lightweight': {
      const s = o as number
      const hand = st.survivorHands[st.survivors[s].hand]
      payPerk(st, o, perk, `ทิ้ง ${CARD_NAMES[c.card!]} แล้วเดินก่อนเริ่มเทิร์น`)
      hand.splice(hand.indexOf(c.card!), 1)
      // a card move outside a turn: the active survivor goes back to whoever it was after it
      st.queue.unshift({ k: 'cardMove', s, card: c.card as PathKind }, { k: 'activeBack', s: st.activeSurvivor })
      st.activeSurvivor = s
      return
    }
    case 'bitter_murmur': {
      const e = exits(st, k.room, 'any').find((x) => x.path.id === c.path)!
      payPerk(st, o, perk, `เดินต่อไป ${roomName(st, e.to)}`)
      return killerMovedBy(st, e.path, e.to)
    }
    case 'claustrophobia':
      payPerk(st, o, perk, `วาง Entity บนเส้นทาง ${roomName(st, pathDef(st, c.path!).a)} ↔ ${roomName(st, pathDef(st, c.path!).b)} — ผู้รอดชีวิตผ่านไม่ได้`)
      return placeEntity(st, { path: c.path! })
    case 'distressing':
      payPerk(st, o, perk, `${name(c.target!)} ต้องซ่อนใน Locker`)
      return survivorInteract(st, c.target!, { k: 'hide', prop: c.prop! })
    case 'unrelenting': {
      const { turn } = w as Extract<PerkWindow, { k: 'afterKillerInteract' }>
      const i: KillerInteraction = st.survivors[c.target!].wounded ? { k: 'pickUp', target: c.target! } : { k: 'attack', target: c.target! }
      payPerk(st, o, perk, `${i.k === 'attack' ? 'โจมตี' : 'อุ้ม'} ${name(c.target!)} ต่ออีกคน`)
      return killerActs(st, i, turn)
    }
    case 'iron_grasp': {
      payPerk(st, o, perk, 'ทอยเต๋า Skill Check ใหม่ทั้งหมด')
      const step = st.step as Extract<Step, { t: 'roll' }>
      step.dice = step.dice.map((d) => (d.kind === 'skill' ? { ...rollDie(st, 'skill'), rerolled: true } : d))
      return
    }
    case 'insidious': {
      const { target } = w as Extract<PerkWindow, { k: 'preKillerInteract' }>
      const task = st.queue.find((t): t is Extract<Task, { k: 'killerDo' }> => t.k === 'killerDo')!
      payPerk(st, o, perk, `อุ้ม ${name(target)} แทนการโจมตี`)
      // over a path (Haunting): the survivor is in another room, and comes in with the pick-up
      task.i = { k: 'pickUp', target, ...(st.survivors[target].room !== st.killer.room ? { over: true } : {}) }
      return
    }
    case 'jolt': {
      const { dice } = w as Extract<PerkWindow, { k: 'rolled' }>
      const task = st.queue.find((t): t is Extract<Task, { k: 'settleRoll' }> => t.k === 'settleRoll')!
      const n = dice.filter((d) => joltDie(task.ctx, d)).length
      payPerk(st, o, perk, `ผล 1–2 นับเป็นล้มเหลว (${n} ลูก)`)
      // the die still shows what was rolled; it counts as a failure
      task.dice = task.dice.map((d) => (joltDie(task.ctx, d) ? { ...d, asFailure: true } : d))
      // a Bond roll already counted its failure ▲: these add theirs
      if (task.failBp !== undefined) task.failBp += n
      return
    }
    case 'plunderers_instinct':
      payPerk(st, o, perk, 'จั่ว 3 ใบ เลือกเก็บ 1')
      st.plunder = o as number
      return
    case 'fearmonger':
      payPerk(st, o, perk, `${name(c.target!)} ใช้ Perk ไม่ได้รอบนี้`)
      st.fearmonger = c.target!
      return
    case 'slippery_meat': {
      const s = o as number
      const hook = st.props.find((p) => p.kind === 'hook' && p.occupant === s)!
      payPerk(st, o, perk, 'ทำลาย Hook ที่แขวนอยู่ — ลงจาก Hook')
      // a sabotage of their own hook: the Entity goes on it, and they stay in the room
      placeEntity(st, { prop: hook.id })
      hook.occupant = null
      st.survivors[s].status = 'board'
      log(st, `${name(s)} ลงจาก Hook เอง — อยู่ที่เดิม (เนื้อลื่น ๆ)`, s, { ev: { k: 'rescue', s, by: s } })
      return
    }
    case 'self_aware':
      payPerk(st, o, perk, 'จั่ว Perk 4 ใบ')
      return wait(st, { t: 'selfAware', s: o as number, cards: shuffle(st, selfAwarePool(st)).slice(0, 4) })
    case 'deerstalker': {
      const { s } = w as Extract<PerkWindow, { k: 'survivorLeave' }>
      payPerk(st, o, perk, `${name(s)} ต้องทอย Danger Die ก่อนออกจากห้อง`)
      return startRoll(st, { k: 'deerstalker', s }, 1, 'danger')
    }
    case 'thrill_of_the_hunt': {
      const { s, path, to } = w as Extract<PerkWindow, { k: 'survivorLeave' }>
      payPerk(st, o, perk, `เดินตาม ${name(s)} ไป ${roomName(st, to)}`)
      // after their move (if Deerstalker doesn't keep them in the room)
      const at = st.queue.findIndex((t) => (t.k === 'survivorGo' || t.k === 'survivorStep') && t.s === s)
      st.queue.splice(at < 0 ? 0 : at + 1, 0, { k: 'killerFollow', s, path, to })
      return
    }
    case 'no_one_left_behind': {
      const m = anyMoves(st, c.target!).find((x) => x.path.id === c.path)!
      payPerk(st, o, perk, `${name(c.target!)} เดินไป ${roomName(st, m.to)}`)
      // their interaction for the turn: Desperate Measures may follow it
      const before = st.queue.length
      moveSurvivor(st, c.target!, m.path, m.to)
      trigger(st, { k: 'afterSurvivorInteract', s: o as number }, st.queue.length - before)
      return
    }
    case 'whispers': {
      const target = c.target!
      payPerk(st, o, perk, `เลือก ${name(target)} — จ่าย 1 ▲ หรือวางการ์ดหงายหน้า`)
      if (st.survivors[target].bp < 1) return whispersFaceUp(st, target)
      return wait(st, { t: 'sparkChoice', s: target, rest: [], whispers: true })
    }
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
    case 'machine_learning':
      payPerk(st, o, perk, 'จั่ว Perk ฆาตกร 2 ใบ')
      return wait(st, { t: 'machineLearning', cards: shuffle(st, machinePool(st)).slice(0, 2) })
    case 'genetic_limits':
      payPerk(st, o, perk, `${name(c.target!)} ใช้ Perk ไม่ได้จนจบรอบ`)
      st.geneticLimits = c.target!
      return
    case 'forced_hesitation': {
      const t = c.target!
      const sv = st.survivors[t]
      payPerk(st, o, perk, `ทิ้ง Wait — ${sv.name} เสียการ์ด ${CARD_NAMES[sv.planned!]} แล้ว Interact ได้ทันที`)
      k.hand.splice(k.hand.indexOf('wait'), 1)
      // their card discarded: no turn of their own this round (survivorTurn passes them by)
      Object.assign(sv, { planned: null, plannedRevealed: false, acted: true })
      // "immediately": an interaction in their room, before the round goes on
      st.canInteract = true
      st.queue.unshift({ k: 'survivorInteract', s: t })
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
      // walking on into the room: a Firecracker there may stop him (We're Gonna Live Forever was asked)
      killerMovedBy(st, pathDef(st, path), to, true)
      trigger(st, { k: 'killerBreak', what: 'pallet' })
      return
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
      dropKnives(st, o as number)
      shedPurge(st, o as number)
      return
    }
    case 'iron_will': {
      payPerk(st, o, perk, 'นับผลล้มเหลวเป็นสำเร็จ')
      const step = st.step as Extract<Step, { t: 'roll' }>
      step.dice = step.dice.map((d) => (isFailure(d) ? { ...d, asSuccess: true } : d))
      return
    }
    case 'potential_energy': {
      const a = st.props.find((p) => p.id === c.prop)!
      const b = st.props.find((p) => p.id === c.prop2)!
      payPerk(st, o, perk, `Generator ที่ ${roomName(st, a.room!)} −1 → ห้องนี้ +1`)
      a.progress--
      log(st, `Generator ที่ ${roomName(st, a.room!)} ${a.progress}/${PROGRESS_MAX}`, 'game', { ev: { k: 'damage', prop: a.id } })
      return addGenerator(st, b, 1, o as number)
    }
    case 'fogwise': {
      const pallet = palletOn(st, c.path!)
      const to = pathDef(st, c.path2!)
      payPerk(st, o, perk, `ย้าย${pallet ? ' Pallet' : 'กำแพง'} ไปทาง ${roomName(st, to.a)} ↔ ${roomName(st, to.b)}`)
      if (pallet) {
        pallet.path = c.path2!
        return
      }
      pathState(st, c.path!).wall = false
      pathState(st, c.path2!).wall = true
      return
    }
    case 'background_player':
      payPerk(st, o, perk, 'Bonus Turn')
      return startBonusMove(st, o as number, c.card as PathKind)
    case 'blood_rush':
      payPerk(st, o, perk, 'Bonus Turn + Sacrifice Progress บนบอร์ด')
      st.survivors[o as number].sacrificeToken = true
      return startBonusMove(st, o as number, c.card as PathKind)
    case 'scavenger': {
      const sv = st.survivors[o as number]
      const gen = st.props.find((p) => p.id === c.prop)!
      payPerk(st, o, perk, `ทิ้ง ${ITEM_NAMES[sv.item!]} — Generator ที่ ${roomName(st, gen.room!)} +1`)
      discardItem(st, o as number, sv.item!, false)
      return void addGenerator(st, gen, 1, o as number)
    }
    case 'troubleshooter': {
      const m = anyMoves(st, o as number).find((x) => x.path.id === c.path)!
      payPerk(st, o, perk, `เดินต่อไป ${roomName(st, m.to)}`)
      return moveSurvivor(st, o as number, m.path, m.to)
    }
    case 'made_for_this': {
      payPerk(st, o, perk, `${name(o as number)} ไม่ถูกอุ้ม — Sacrifice Progress +1 แทน`)
      const at = st.queue.findIndex((t) => t.k === 'killerDo' && t.i.k === 'pickUp' && t.i.target === o)
      if (at >= 0) st.queue.splice(at, 1)
      return addSacrifice(st, 1)
    }
    case 'wicked': {
      payPerk(st, o, perk, 'ผู้รอดชีวิตทุกคน +1 ▲ — ฆาตกรได้ Sacrifice Progress +1')
      // the survivors on the board (not hooked, carried or in a locker): a house rule
      st.survivors.forEach((sv, i) => sv.status === 'board' && gainSurvivor(st, i, 1))
      // the interaction for the turn: Desperate Measures may follow it (unless the track is full)
      const before = st.queue.length
      addSacrifice(st, 1)
      if (st.phase !== 'over') trigger(st, { k: 'afterSurvivorInteract', s: o as number }, st.queue.length - before)
      return
    }
    case 'strength_in_shadows': {
      const t = st.survivors[c.target!]
      payPerk(st, o, perk, `${t.name} รับ Sacrifice Progress บนบอร์ด แล้วหายบาดเจ็บ`)
      t.sacrificeToken = true
      return makeHealthy(st, c.target!, `${t.name} หายบาดเจ็บ (ความแข็งแกร่งในเงามืด)`, o as number)
    }
    case 'weaving_spiders':
      // each survivor in her room says what they put in; nothing is spent until she confirms
      log(st, `${name(o as number)} จะใช้ แมงมุมทอใย — ผู้รอดชีวิตในห้องร่วมกันลง ${WEAVING_COST} ▲`, o)
      return wait(st, { t: 'weavePay', s: o as number, prop: c.prop! })
    case 'friendly_competition': {
      const gen = st.props.find((p) => p.id === (w as { prop: string }).prop)!
      payPerk(st, o, perk, `Generator ที่ ${roomName(st, gen.room!)} +1`)
      return addGenerator(st, gen, 1, o as number)
    }
    case 'cut_loose': {
      payPerk(st, o, perk, `ใช้ Vault เป็น ${CARD_NAMES[c.card!]}`)
      const move = st.queue.find((t): t is Extract<Task, { k: 'doMove' }> => t.k === 'doMove' && t.s === o)!
      move.card = c.card as PathKind
      // the perks asked after this one see the new colour too
      ;(w as Extract<PerkWindow, { k: 'cardMove' }>).card = c.card as PathKind
      return
    }
    case 'quick_gambit': {
      const { s, path, to } = w as Extract<PerkWindow, { k: 'survivorLeave' }>
      // The Unknown: the one in the room they leave is the one that follows
      actAtRoom(st, st.survivors[s].room)
      payPerk(st, o, perk, `${st.killer.name} เดินตามไป ${roomName(st, to)}`)
      // after their move (if Deerstalker doesn't keep them in the room), as Thrill of the Hunt
      const at = st.queue.findIndex((t) => (t.k === 'survivorGo' || t.k === 'survivorStep') && t.s === s)
      st.queue.splice(at < 0 ? 0 : at + 1, 0, { k: 'killerFollow', s, path, to })
      return
    }
    case 'circle_of_healing': {
      const { s, gained } = w as Extract<PerkWindow, { k: 'cleansed' }>
      const t = st.survivors[c.target!]
      payPerk(st, o, perk, `${t.name} หายบาดเจ็บ แทน ▲ ที่ได้`)
      // instead of the cleanse's ▲
      if (gained) st.survivors[s].bp -= gained
      return makeHealthy(st, c.target!, `${t.name} หายบาดเจ็บ (วงแหวนการรักษา)`, o as number)
    }
    case 'shadow_step': {
      const { path } = w as Extract<PerkWindow, { k: 'entered' }>
      const token = tokenOf(boardOf(st), path!)
      const p = pathDef(st, token)
      payPerk(st, o, perk, `วาง Entity บนเส้นทาง ${roomName(st, p.a)} ↔ ${roomName(st, p.b)} — ไม่มีใครเดินผ่านได้`)
      return placeEntity(st, { path: token, shadow: true })
    }
    case 'clairvoyance': {
      const p = st.props.find((x) => x.id === c.prop)!
      payPerk(st, o, perk, `เปิด prop ที่ ${roomName(st, p.room!)}`)
      return revealProp(st, p, o)
    }
    case 'exponential': {
      const { s, gained } = w as Extract<PerkWindow, { k: 'cleansed' }>
      const t = st.survivors[c.target!]
      const m = anyMoves(st, c.target!).find((x) => x.path.id === c.path)!
      payPerk(st, o, perk, `${t.name} ลงจาก Hook แทน ▲ ที่ได้`)
      // instead of the cleanse's ▲
      if (gained) st.survivors[s].bp -= gained
      // off the hook, not a sabotage: the hook stays free, no Entity on it, no rescue perks
      st.props.find((p) => p.kind === 'hook' && p.occupant === c.target)!.occupant = null
      t.status = 'board'
      log(st, `${t.name} ลงจาก Hook (เอ็กซ์โพเนนเชียล)`, o, { ev: { k: 'rescue', s: c.target!, by: o as number } })
      return moveSurvivor(st, c.target!, m.path, m.to)
    }
    case 'corrective_action': {
      const step = st.step as Extract<Step, { t: 'roll' }>
      payPerk(st, o, perk, `ลูกที่ ${c.index! + 1} ได้ "4" → สำเร็จอย่างยิ่ง`)
      step.dice[c.index!] = { ...step.dice[c.index!], face: 5 }
      return
    }
    case 'autodidact': {
      const step = st.step as Extract<Step, { t: 'roll' }>
      const d = step.dice[c.index!]
      payPerk(st, o, perk, `ลูกที่ ${c.index! + 1} สำเร็จ → สำเร็จอย่างยิ่ง`)
      step.dice[c.index!] = { ...d, face: d.kind === 'skill' ? 5 : 0 }
      return
    }
    case 'deliverance': {
      const t = st.survivors[c.target!]
      payPerk(st, o, perk, `${t.name} หายบาดเจ็บ`)
      return makeHealthy(st, c.target!, `${t.name} หายบาดเจ็บ`, o as number)
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
    case 'empathy':
      // "a willing Survivor": the other one is asked first; the perk is used only on a yes
      log(st, `${st.survivors[o as number].name} ขอ${c.mode === 'take' ? 'รับ' : 'ให้'} 1 ▲ ${c.mode === 'take' ? 'จาก' : 'แก่'} ${st.survivors[c.target!].name} (เห็นใจ)`, o)
      return wait(st, { t: 'empathyAsk', s: c.target!, from: o as number, mode: c.mode as 'take' | 'give' })
    case 'self_care':
      payPerk(st, o, perk, 'ทอย Danger Die')
      return startRoll(st, { k: 'selfCare', s: o as number }, 1, 'danger')
    case 'overcharge':
      payPerk(st, o, perk)
      return wound(st, c.target!, 'power', `${name(c.target!)} โดน ชาร์จเกินขีด — บาดเจ็บ`)
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
      k.bonusAt = k.planned.length - 1
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
      k.bonusAt = k.planned.length - 1
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
    case 'mad_grit':
      payPerk(st, o, perk)
      return wound(st, c.target!, 'perk', `${name(c.target!)} โดน ทรหดสุดขีด — บาดเจ็บ`)
    case 'discordance': {
      const room = st.survivors[(w as Extract<PerkWindow, { k: 'entered' }>).s].room
      const n = onBoardIn(st, room).length + (k.room === room ? 1 : 0)
      payPerk(st, o, perk, `+${n} ▲`)
      return gainKiller(st, n)
    }
    case 'iron_maiden': {
      const l = st.props.find((p) => p.id === c.prop)!
      const h = st.props.find((p) => p.id === c.prop2)!
      payPerk(st, o, perk, `สลับ Locker (${roomName(st, l.room!)}) กับ Hook (${roomName(st, h.room!)})`)
      ;[l.room, h.room] = [h.room, l.room]
      return
    }
    case 'rancor': {
      const w2 = w as Extract<PerkWindow, { k: 'killerEntered' }>
      const sv = st.survivors[c.target!]
      payPerk(st, o, perk, `ลาก ${sv.name} มาด้วย`)
      sv.room = w2.room
      log(st, `${sv.name} ถูกลากไป ${roomName(st, w2.room)}`, c.target!, { ev: { k: 'move', who: c.target!, from: w2.from!, to: w2.room, path: w2.path ?? '' } })
      // they entered the room: a prop there is revealed for them, as for any move
      st.queue.unshift({ k: 'reveal', room: w2.room, who: c.target! })
      return
    }
    case 'haunted_ground': {
      const a2 = st.props.find((p) => p.id === (w as Extract<PerkWindow, { k: 'afterReveal' }>).prop)!
      const b = st.props.find((p) => p.id === c.prop)!
      payPerk(st, o, perk, `สลับ ${PROP_NAMES[a2.kind]} (${roomName(st, a2.room!)}) กับ ${PROP_NAMES[b.kind]} (${roomName(st, b.room!)})`)
      ;[a2.room, b.room] = [b.room, a2.room]
      return
    }
    case 'smash_hit':
      payPerk(st, o, perk, '+1 ▲')
      gainSurvivor(st, o as number, 1)
      return
    case 'fast_track':
      payPerk(st, o, perk, 'ซ่อม Generator')
      return survivorInteract(st, o as number, { k: 'repair', prop: c.prop! })
    case 'self_preservation':
      payPerk(st, o, perk, 'ซ่อนใน Locker')
      return survivorInteract(st, o as number, { k: 'hide', prop: c.prop! })
    case 'spirit_fury':
      payPerk(st, o, perk, '+2 ▲')
      gainKiller(st, 2)
      return
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
      pathState(st, c.path!).wall = false
      st.evadedWall = c.path!
      return
    case 'streetwise': {
      payPerk(st, o, perk, 'Chest ยังอยู่')
      st.props.find((p) => p.id === (w as Extract<PerkWindow, { k: 'afterRummage' }>).prop)!.removed = false
      return
    }
    case 'blood_echo':
      payPerk(st, o, perk)
      return wound(st, c.target!, 'perk', `${name(c.target!)} บาดเจ็บ (โลหิตกังวาน)`)
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
      return makeHealthy(st, o as number, `${name(o as number)} หายบาดเจ็บ (เบรกนำโชค)`, o as number)
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
      return makeHealthy(st, c.target!, `${name(c.target!)} หายบาดเจ็บ (เพื่อผู้คน)`, o as number)
    case 'off_the_record': {
      const task = st.queue.find((t): t is Extract<Task, { k: 'resolveRoll' }> => t.k === 'resolveRoll')!
      payPerk(st, o, perk, `รับ 1 ▲ แทน ${k.name}`)
      task.fails--
      gainSurvivor(st, o as number, 1)
      return
    }
    case 'coup_de_grace': {
      // a bonus turn with the card just played, right after this turn
      const turn = (w as Extract<PerkWindow, { k: 'killerTurnEnd' }>).turn
      const card = k.planned[turn]
      payPerk(st, o, perk, `Bonus Turn ด้วย ${CARD_NAMES[card]} อีกครั้ง`)
      k.planned.splice(turn + 1, 0, card)
      k.shown = k.shown.map((i) => (i > turn ? i + 1 : i))
      k.bonusUsed = true
      k.bonusAt = turn + 1
      return
    }
    case 'oppression': {
      const gens = [c.prop!, c.prop2].filter((x): x is string => !!x).map((id) => st.props.find((p) => p.id === id)!)
      payPerk(st, o, perk, gens.map((g) => `Generator ที่ ${roomName(st, g.room!)} −1`).join(', '))
      for (const g of gens) g.progress--
      return
    }
    case 'dragons_grip': {
      const room = st.props.find((p) => p.id === (w as Extract<PerkWindow, { k: 'killerBreak' }>).prop)!.room!
      const cards = [c.card!, ...(c.card2 ? [c.card2] : [])] as PathKind[]
      payPerk(st, o, perk, `ทิ้ง ${cards.map((x) => CARD_NAMES[x]).join(' + ')}`)
      for (const x of cards) k.hand.splice(k.hand.indexOf(x), 1)
      const order = turnOrder(st)
      return sparkNext(st, gripTargets(st, room, cards).sort((a2, b) => order.indexOf(a2) - order.indexOf(b)), true)
    }
    case 'appraisal': {
      const { s, item } = w as Extract<PerkWindow, { k: 'itemDiscard' }>
      const me = st.survivors[o as number]
      const old = me.item
      payPerk(st, o, perk, `รับ ${ITEM_NAMES[item]} ที่ ${name(s)} ทิ้ง${old ? ` แล้วทิ้ง ${ITEM_NAMES[old]} ของตัวเอง` : ''}`)
      me.item = item
      return
    }
    case 'residual_manifest': {
      const sv = st.survivors[o as number]
      const item = sv.item!
      payPerk(st, o, perk, `ทิ้ง ${ITEM_NAMES[item]} — กัน Interaction ของ ${st.killer.name}`)
      const at = st.queue.findIndex((t) => t.k === 'killerAct')
      if (at >= 0) st.queue.splice(at, 1)
      st.canInteract = false
      emit(st, { k: 'item', s: o as number, item }, o as number)
      discardItem(st, o as number, item, false)
      return
    }
    case 'inner_focus': {
      const s = o as number
      payPerk(st, o, perk, 'ทอยเต๋า 2 ลูก แทนการเดินด้วยการ์ด')
      const at = st.queue.findIndex((t) => t.k === 'doMove' && t.s === s)
      if (at >= 0) st.queue.splice(at, 1)
      // two skill dice, read as start rooms: not a skill check (no ▲ for a skull, no perks on it)
      const dice = [rollDie(st, 'skill'), rollDie(st, 'skill')]
      logRoll(st, { k: 'innerFocus', s }, dice, 0)
      const faces = [...new Set(dice.map((d) => d.face))]
      if (faces.length === 1) return innerFocusTo(st, s, faces[0])
      return wait(st, { t: 'innerFocus', s, faces })
    }
    case 'deception':
      payPerk(st, o, perk, 'อยู่ห้องเดิม +1 ▲')
      st.deception = true
      gainSurvivor(st, o as number, 1)
      return
    case 'desperate_measures':
      payPerk(st, o, perk, 'Interact อีกครั้ง (Chest / Locker)')
      wait(st, { t: 'survivorInteract', s: o as number, canInteract: true, survivalOnly: true })
      return
    case 'visionary': {
      const p = st.props.find((x) => x.id === c.prop)!
      payPerk(st, o, perk, `เปิด prop ที่ ${roomName(st, p.room!)} แทน`)
      return revealProp(st, p, o)
    }
    case 'built_to_last': {
      const { s, item } = w as Extract<PerkWindow, { k: 'itemUsed' }>
      payPerk(st, o, perk, `เก็บ ${ITEM_NAMES[item]} ไว้ — ใช้อีกไม่ได้ในเทิร์นนี้`)
      st.survivors[s].item = item
      st.itemLock = s
      st.kept = [...(st.kept ?? []), { s, item }]
      return
    }
    case 'breakdown':
      payPerk(st, o, perk, 'ทอย Danger Die — สำเร็จ = ฆาตกรเสีย Sacrifice Progress')
      return startRoll(st, { k: 'breakdown', s: o as number }, 1, 'danger')
    case 'aftercare': {
      const p = st.props.find((x) => x.id === c.prop)!
      payPerk(st, o, perk, `วาง Entity บน Hook ที่ ${roomName(st, p.room!)}`)
      return placeEntity(st, { prop: p.id })
    }
    case 'distortion': {
      const m = anyMoves(st, o as number).find((x) => x.path.id === c.path)!
      payPerk(st, o, perk, `เดินต่อไป ${roomName(st, m.to)}`)
      return moveSurvivor(st, o as number, m.path, m.to)
    }
    case 'no_mither': {
      const { target } = w as Extract<PerkWindow, { k: 'preKillerInteract' }>
      payPerk(st, o, perk, `ทอย Danger Die — สำเร็จ = ${name(target)} ไม่บาดเจ็บ`)
      return startRoll(st, { k: 'noMither', s: o as number, target }, 1, 'danger')
    }
    case 'dead_hard': {
      const { s } = w as Extract<PerkWindow, { k: 'preHang' }>
      payPerk(st, o, perk, `ทอย Danger Die — สำเร็จ = ${name(s)} หนีแทนถูกแขวน`)
      return startRoll(st, { k: 'deadHard', s: o as number, target: s }, 1, 'danger')
    }
    case 'wgl_forever': {
      payPerk(st, o, perk, `${k.name} ออกจากห้องไม่ได้ — ยัง Interact ในห้องนี้ได้`)
      const at = st.queue.findIndex((t) => t.k === 'leave')
      if (at >= 0) st.queue.splice(at, 1, ...((st.queue[at] as Extract<Task, { k: 'leave' }>).stop ?? []))
      return
    }
    case 'windows_of_opportunity': {
      const p = st.props.find((x) => x.id === c.prop)!
      const i = windowInteraction(p, c.path)
      payPerk(st, o, perk, `${PROP_NAMES[p.kind]} ที่ ${roomName(st, p.room!)}`)
      const s = o as number
      // a locker: she moves into that room (revealing it as any move does), then hides
      if (p.kind === 'locker') {
        const path = touchingPaths(st, st.survivors[s].room).find((x) => x.a === p.room || x.b === p.room)!
        const before = st.queue.length
        moveSurvivor(st, s, path, p.room!)
        st.queue.splice(st.queue.length - before, 0, { k: 'survivorDo', s, i })
        trigger(st, { k: 'afterSurvivorInteract', s }, st.queue.length - before)
        return
      }
      const before = st.queue.length
      survivorInteract(st, s, i, true)
      trigger(st, { k: 'afterSurvivorInteract', s }, st.queue.length - before)
      return
    }
    case 'boil_over': {
      const { s, n } = w as Extract<PerkWindow, { k: 'carryRoll' }>
      payPerk(st, o, perk, `${name(s)} ทอย 4 ลูกแทน ${n} ลูก`)
      const roll = st.queue.find((t): t is Extract<Task, { k: 'roll' }> => t.k === 'roll' && t.ctx.k === 'carry')
      if (roll) roll.n = 4
      return
    }
    case 'dance_with_me': {
      const m = anyMoves(st, o as number).find((x) => x.path.id === c.path)!
      payPerk(st, o, perk, `เดินต่อไป ${roomName(st, m.to)}`)
      return moveSurvivor(st, o as number, m.path, m.to)
    }
    case 'solidarity': {
      payPerk(st, o, perk, `รักษา ${name(c.target!)} ในห้องติดกัน`)
      // an interaction like any other: Desperate Measures may follow it
      const before = st.queue.length
      startCheck(st, { k: 'heal', s: o as number, target: c.target! })
      trigger(st, { k: 'afterSurvivorInteract', s: o as number }, st.queue.length - before)
      return
    }
    case 'face_the_darkness':
      payPerk(st, o, perk, `${GUARD_NAMES[c.guard!]} → ${roomName(st, c.room!)}`)
      return placeGuard(st, c.guard!, c.room!)
    case 'nowhere_to_hide':
      payPerk(st, o, perk, 'ผู้รอดชีวิตใน Locker ทอย Danger Die แทน')
      st.rollMods.danger = true
      return
    case 'hubris': {
      const s = (w as Extract<PerkWindow, { k: 'entered' }>).s
      const sv = st.survivors[s]
      if (sv.bp > 0) {
        payPerk(st, o, perk, `${sv.name} จ่าย 1 ▲`)
        sv.bp--
        return
      }
      payPerk(st, o, perk, `${sv.name} ไม่มี ▲ จ่าย — Interact ไม่ได้เทิร์นนี้`)
      // only their own turn has an interaction to lose
      if (st.activeSurvivor === s) st.canInteract = false
      return
    }
    case 'coulrophobia': {
      const { s } = w as Extract<PerkWindow, { k: 'preEnter' }>
      payPerk(st, o, perk, `${name(s)} เข้าห้องไม่ได้ — Interact ไม่ได้เทิร์นนี้`)
      const at = st.queue.findIndex((t) => t.k === 'survivorGo' && t.s === s)
      if (at >= 0) st.queue.splice(at, 1)
      st.canInteract = false
      return
    }
    case 'unbound':
      payPerk(st, o, perk, `เพิ่ม ${CARD_NAMES[c.card!]} อีก 1 ใบเข้ามือ`)
      k.hand.push(c.card!)
      k.extraCards = [...(k.extraCards ?? []), c.card!]
      return
    case 'undone': {
      const { prop } = w as Extract<PerkWindow, { k: 'genProgress' }>
      const task = st.queue.find((t): t is Extract<Task, { k: 'addGen' }> => t.k === 'addGen' && t.prop === prop)!
      payPerk(st, o, perk, `Generator ได้ความคืบหน้าน้อยลง 1 (${task.add} → ${task.add - 1})`)
      task.add--
      return
    }
    case 'unforeseen': {
      const room = st.props.find((p) => p.id === (w as { prop: string }).prop)!.room!
      if (k.unknowns) actAs(st, c.index!)
      payPerk(st, o, perk, `ตรงไปที่ ${roomName(st, room)}`)
      return killerEnter(st, '', room)
    }
    case 'game_afoot': {
      const { target } = w as Extract<PerkWindow, { k: 'preKillerInteract' }>
      const task = st.queue.find((t): t is Extract<Task, { k: 'killerDo' }> => t.k === 'killerDo')!
      payPerk(st, o, perk, `อุ้ม ${st.survivors[target].name} แทนการโจมตี`)
      task.i = { k: 'pickUp', target }
      return
    }
    case 'leverage':
      payPerk(st, o, perk, `${st.survivors[c.target!].name} หายบาดเจ็บไม่ได้รอบนี้`)
      st.leverage = c.target!
      return
    case 'thwack': {
      const p = st.props.find((x) => x.id === (w as Extract<PerkWindow, { k: 'killerRevealed' }>).prop)!
      payPerk(st, o, perk, `นำ ${PROP_NAMES[p.kind]} ที่ ${roomName(st, p.room!)} ออก`)
      p.removed = true
      toArtist(st, p)
      return
    }
    case 'grim_embrace': {
      const { s } = w as Extract<PerkWindow, { k: 'afterSabotage' }>
      const sv = st.survivors[s]
      sv.embrace = (sv.embrace ?? 0) + 1
      payPerk(st, o, perk, `วาง ▲ บนบอร์ดของ ${sv.name} (${sv.embrace})`)
      return
    }
    case 'darkness_revealed': {
      const { room } = w as Extract<PerkWindow, { k: 'killerArrived' }>
      const locker = darkLocker(st, room)!
      payPerk(st, o, perk, `คว่ำ Locker ที่ ${roomName(st, room)} แทนการเปิด prop แล้วเดินต่อ`)
      locker.revealed = false
      // no reveal there; the move comes once the room has answered his entering
      const reveal = st.queue.findIndex((t) => t.k === 'reveal' && t.room === room && t.who === 'killer')
      if (reveal >= 0) st.queue.splice(reveal, 1)
      const entered = st.queue.findIndex((t) => t.k === 'trigger' && t.w.k === 'killerEntered')
      st.queue.splice(entered + 1, 0, { k: 'darkMove' })
      return
    }
    case 'dissolution': {
      const p = pathDef(st, c.path!)
      payPerk(st, o, perk, `วาง ▲ บนเส้นทาง ${roomName(st, p.a)} ↔ ${roomName(st, p.b)} — ใครเดินผ่านจะบาดเจ็บ`)
      st.dissolution = c.path!
      return
    }
    case 'septic_touch': {
      const p = st.props.find((x) => x.id === (w as Extract<PerkWindow, { k: 'afterReveal' }>).prop)!
      payPerk(st, o, perk, `นำ ${PROP_NAMES[p.kind]} ที่ ${roomName(st, p.room!)} ออกจากกระดาน`)
      p.removed = true
      toArtist(st, p)
      return
    }
    case 'bamboozle':
      payPerk(st, o, perk, `วาง Entity บนเส้นทาง ${roomName(st, pathDef(st, c.path!).a)} ↔ ${roomName(st, pathDef(st, c.path!).b)} — เป็นกำแพงสำหรับผู้รอดชีวิต`)
      return placeEntity(st, { path: c.path! })
    case 'pop_goes_the_weasel': {
      const p = st.props.find((x) => x.id === c.prop)!
      payPerk(st, o, perk, `นำ ${PROP_NAMES[p.kind]} ที่ ${roomName(st, p.room!)} ออก`)
      p.removed = true
      toArtist(st, p)
      return
    }
    case 'dark_devotion':
    case 'infectious_fright': {
      const m = anyMoves(st, c.target!).find((x) => x.path.id === c.path)!
      payPerk(st, o, perk, `ย้าย ${name(c.target!)} ไป ${roomName(st, m.to)}`)
      return moveSurvivor(st, c.target!, m.path, m.to)
    }
    case 'corrupt_intervention': {
      const p = st.props.find((x) => x.id === c.prop)!
      payPerk(st, o, perk, `วาง Entity บน Generator ที่ ${roomName(st, p.room!)} — Interact ไม่ได้จนจบรอบ`)
      return placeEntity(st, { prop: p.id })
    }
    case 'no_way_out': {
      const { s } = w as Extract<PerkWindow, { k: 'genInteract' }>
      payPerk(st, o, perk, `${name(s)} Interact ไม่ได้`)
      const at = st.queue.findIndex((t) => t.k === 'survivorDo' && t.s === s)
      if (at >= 0) st.queue.splice(at, 1)
      return
    }
    case 'crowd_control': {
      payPerk(st, o, perk, `เลือก ${name(c.target!)}`)
      // the survivors may buy it off together; with too few ▲ the killer picks at once
      if (crowdPayments(st).length > 1) return wait(st, { t: 'crowdPay', s: c.target! })
      return wait(st, { t: 'crowdPick', s: c.target! })
    }
    case 'starstruck': {
      const p = pathDef(st, c.path!)
      const to = p.a === k.room ? p.b : p.a
      const task = st.queue.find((t): t is Extract<Task, { k: 'killerDo' }> => t.k === 'killerDo')!
      payPerk(st, o, perk, `ไป ${roomName(st, to)} แล้วอุ้ม ${name(c.target!)} แทน`)
      task.i = { k: 'pickUp', target: c.target! }
      return killerMovedBy(st, p, to)
    }
    case 'poised': {
      // after the turn's interaction, before its end-of-turn perks
      payPerk(st, o, perk, `${name(c.target!)} เล่น Bonus Turn`)
      const at = st.queue.findIndex((t) => (t.k === 'trigger' && t.w.k === 'turnEnd') || t.k === 'endSurvivorTurn')
      st.queue.splice(at < 0 ? 0 : at, 0, { k: 'poisedTurn', s: c.target! })
      return
    }
    case 'head_on': {
      payPerk(st, o, perk, `นำ Locker ออก — ${k.name} Interact ไม่ได้เทิร์นนี้`)
      st.props.find((p) => p.id === c.prop)!.removed = true
      st.canInteract = false
      return
    }
    case 'monitor_and_abuse':
    case 'bloodhound':
    case 'nurses_calling':
    case 'calm_spirit':
    case 'hoarder':
    case 'blood_favour':
    case 'undying':
    case 'power_struggle':
    case 'diversion':
      return
  }
}

/** Yui and Zarina wound themselves for a perk (it counts as wounded this round, p.15). */
/** Someone was wounded or hung this turn: Fast Track and Self-Preservation answer at its end. */
function hurt(st: GameState, s: number) {
  st.turnHurt = [...new Set([...(st.turnHurt ?? []), s])]
}

function selfWound(st: GameState, s: number) {
  const sv = st.survivors[s]
  sv.wounded = true
  sv.woundedThisRound = true
  hurt(st, s)
  log(st, `${sv.name} ยอมบาดเจ็บ`, s, { ev: { k: 'wound', s, by: 'perk' } })
}

/** Saying no to a perk that interrupted something: carry on as without it. */
function declinePerk(st: GameState, perk: PerkId, w: PerkWindow) {
  if (perk === 'enduring' && w.k === 'palletBlock') palletStop(st, w.path)
  // Visionary passed: reveal in the room entered, as usual
  if (perk === 'visionary' && w.k === 'beforeReveal') revealOnEnter(st, w.room, w.s, true)
}

/** Wounded → healthy, from any source; A Nurse's Calling pays the killer (once per round). */
function makeHealthy(st: GameState, s: number, text: string, by: number) {
  const sv = st.survivors[s]
  if (!sv.wounded) return
  if (!healable(st, s)) {
    log(st, st.leverage === s ? `${sv.name} หายบาดเจ็บไม่ได้รอบนี้ (ใช้ประโยชน์)` : `${sv.name} มี Knife 3 เล่ม — หายบาดเจ็บไม่ได้`, s)
    return
  }
  sv.wounded = false
  log(st, text, by, { ev: { k: 'heal', s, by } })
  if (perkReady(st, 'killer', 'nurses_calling')) {
    payPerk(st, 'killer', 'nurses_calling', '+2 ▲')
    gainKiller(st, 2)
  }
  // Renewal looks back at the end of the turn: remember who healed whom this round.
  if (by !== s) st.healedWith = [...new Set([...(st.healedWith ?? []), s, by])]
  trigger(st, { k: 'healed', s, by })
}

/** A bonus turn from a perk or a crow: the card goes through the usual card-move checks. */
function startBonusMove(st: GameState, s: number, card: PathKind) {
  const hand = st.survivorHands[st.survivors[s].hand]
  hand.splice(hand.indexOf(card), 1)
  st.activeSurvivor = s
  // a bonus turn is a turn of its own (Dance With Me)
  st.lockerTurn = st.survivors[s].status === 'locker' ? s : null
  log(st, `${st.survivors[s].name} ทิ้ง ${CARD_NAMES[card]} เล่น Bonus Turn`, s)
  st.queue.unshift({ k: 'cardMove', s, card }, { k: 'survivorInteract', s }, { k: 'trigger', w: { k: 'bonusEnd', s }, done: [] })
}

// ---------- killer powers ----------

export function isPower(i: KillerInteraction): boolean {
  return ['power', 'blink', 'hatchet', 'chainsaw', 'spark', 'phantasm', 'bell', 'wrath', 'redeemer', 'victor', 'rush', 'haunt', 'frenzy', 'showstopper', 'purge', 'afterpiece', 'guard', 'reign', 'birds', 'droneTake', 'droneDrop', 'hallucinate', 'slipstream'].includes(i.k)
}

// ---------- The Twins ----------

/** Where Charlotte (the killer's mini) stands, also during a turn taken with Victor. */
export function charlotteRoom(st: GameState): string {
  const k = st.killer
  return k.asVictor ? k.victorRoom! : k.room
}

/** Where Victor stands, or null when he isn't on the board. */
export function victorRoom(st: GameState): string | null {
  const k = st.killer
  return k.asVictor ? k.room : (k.victorRoom ?? null)
}

/** Hand "the Killer" over between Charlotte and Victor (their rooms swap places in the state). */
function twinSwap(st: GameState) {
  const k = st.killer
  const other = k.victorRoom!
  k.victorRoom = k.room
  k.room = other
  k.asVictor = !k.asVictor
}

/** Who acts as the killer now, for the log. */
function actorName(st: GameState): string {
  return st.killer.asVictor ? 'Victor' : st.killer.name
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
    const clear = touchingPaths(st, k.room).some((p) => (p.a === sv.room || p.b === sv.room) && !pathState(st, p.id).wall && !palletOn(st, p.id))
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
    case 'twins':
      // Blood Bond: Victor into Charlotte's room (not on a turn taken with Victor).
      return k.asVictor || k.victorRoom === k.room ? [] : [{ k: 'victor' }]
    case 'spirit': {
      // Yamaoka's Haunting: a card (not Wait), and over a path of its colour a healthy survivor to
      // attack or a prop to interact with. Nothing on the path matters: she doesn't go there.
      const out: KillerInteraction[] = []
      for (const card of new Set(k.hand)) {
        if (card === 'wait') continue
        const rooms = new Set(touchingPaths(st, k.room).flatMap((p) => (p.kind === card ? [p.a === k.room ? p.b : p.a] : [])))
        for (const room of rooms) {
          for (const t of onBoardIn(st, room)) if (!st.survivors[t].wounded) out.push({ k: 'haunt', card, room, i: { k: 'attack', target: t } })
          for (const i of propInteractions(st, room)) out.push({ k: 'haunt', card, room, i })
        }
      }
      return out
    }
    case 'blight':
      // Blighted Corruption: needs a card to discard.
      return k.hand.length ? [{ k: 'rush' }] : []
    case 'singularity':
      // Slipstream: not with a bonus turn already taken this round (one at most, p.10)
      return k.bonusUsed ? [] : [{ k: 'slipstream' }]
    case 'unknown': {
      // Hallucination: the lowest-numbered Unknown not on the board, into a connected room
      if (!k.unknowns || !k.unknowns.includes(null)) return []
      return [...connectedRooms(st, k.room)].map((room) => ({ k: 'hallucinate' as const, room }))
    }
    case 'skullmerchant':
      // Eyes in the Sky: a face-up Drone anywhere back to his board, or one of his face up into his room
      return [
        ...st.props.filter((p) => p.kind === 'drone' && p.revealed && !p.removed && p.room).map((p) => ({ k: 'droneTake' as const, prop: p.id })),
        ...(merchantDrones(st).length ? [{ k: 'droneDrop' as const }] : []),
      ]
    case 'artist': {
      // Birds of Torment: a crow or a Dire Crow from his board into any room
      const on = artistCrows(st)
      const rooms = boardOf(st).rooms.map((r) => r.id)
      return [...(on.crows ? rooms.map((room) => ({ k: 'birds' as const, dire: false, room })) : []), ...(on.dire ? rooms.map((room) => ({ k: 'birds' as const, dire: true, room })) : [])]
    }
    case 'dredge':
      // Reign of Darkness: a survivor on the board here or next door, with a card that moves them
      return st.survivors.flatMap((sv, i) =>
        sv.status === 'board' && (sv.room === k.room || connectedRooms(st, k.room).has(sv.room)) && reignCards(st, i).length ? [{ k: 'reign' as const, target: i }] : [],
      )
    case 'knight':
      return guardOptions(st).map(({ guard, room }) => ({ k: 'guard' as const, guard, room }))
    case 'clown': {
      // either token, into his room or a connected one (moved from where it stands)
      const rooms = [k.room, ...connectedRooms(st, k.room)]
      return (['tonic', 'antidote'] as const).flatMap((which) => rooms.filter((r) => st.afterpiece?.[which] !== r).map((room) => ({ k: 'afterpiece' as const, which, room })))
    }
    case 'plague': {
      // Vile Purge: his room and a connected one, while a room of the two lacks one and tokens last
      const here = st.purge ?? []
      if (purgeSupply(st) === 0) return []
      return [...connectedRooms(st, k.room)].filter((r) => !here.includes(k.room) || !here.includes(r)).map((room) => ({ k: 'purge' as const, room }))
    }
    case 'trickster':
      // Showstopper: worth using only with someone to hand a Knife to
      return showstopperTargets(st).length ? [{ k: 'showstopper' }] : []
    case 'legion':
      // Feral Frenzy: worth using only with someone in the room to wound or to pay for
      return onBoardIn(st, k.room).length ? [{ k: 'frenzy' }] : []
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
        if (!isPathCard(card)) continue
        for (const e of exits(st, k.room, card)) if (pathFree(st, e.path.id)) out.push({ k: 'chainsaw', card, path: e.path.id })
      }
      return out
    }
  }
  return []
}

/**
 * Blighted Corruption: a card from the shuffled hand, at random, is discarded and the Blight
 * moves along its path; entering a room, he may interact there or go again (rushArrive).
 */
function blightRush(st: GameState) {
  const k = st.killer
  const card = k.hand.splice(Math.floor(random(st) * k.hand.length), 1)[0] as PathKind
  const moves = killerMoves(st, card)
  if (!moves.length) {
    log(st, `${k.name} ใช้ ความเสื่อมทรามที่พังทลาย สุ่มได้ ${CARD_NAMES[card]} — ไม่มีเส้นทาง จบพลัง`, 'killer')
    return
  }
  log(st, `${k.name} ใช้ ความเสื่อมทรามที่พังทลาย สุ่มได้ ${CARD_NAMES[card]}`, 'killer')
  st.rushCard = card
  st.queue.unshift({ k: 'rushArrive', turn: k.revealedCount - 1, from: k.room })
  wait(st, { t: 'killerMove', turn: k.revealedCount - 1, card, rush: true })
}

function usePower(st: GameState, i: KillerInteraction) {
  const k = st.killer
  k.powerUsed = true
  switch (i.k) {
    case 'haunt': {
      k.hand.splice(k.hand.indexOf(i.card), 1)
      log(st, `${k.name} ใช้ ความหลอกหลอนของยามาโอกะ — ทิ้ง ${CARD_NAMES[i.card]} แล้ว Interact ที่ ${roomName(st, i.room)}`, 'killer')
      // an ordinary interaction over there: Red Herring, Brutal Strength… still answer it, and so does
      // Residual Manifest, from someone in that room (the interaction is in their space)
      if (perkCandidates(st, { k: 'killerWouldInteract', room: i.room }, []).length) {
        st.queue.unshift({ k: 'trigger', w: { k: 'killerWouldInteract', room: i.room }, done: [] }, { k: 'killerAct', i: i.i, turn: 0, over: true })
        return
      }
      return killerActs(st, i.i, null)
    }
    case 'power': {
      if (i.remove) pathState(st, i.remove).trap = false
      else k.trapsInSupply--
      pathState(st, i.path).trap = true
      log(st, `${k.name} วาง กับดักหมี${i.remove ? ' (ย้ายจากเส้นทางเดิม)' : ''}`, 'killer', { ev: { k: 'trapSet', path: i.path } })
      return
    }
    case 'blink': {
      const p = pathDef(st, i.path)
      log(st, `${k.name} ใช้ ลมหายใจเฮือกสุดท้ายของสเปนเซอร์`, 'killer')
      return killerEnter(st, p.id, p.a === k.room ? p.b : p.a)
    }
    case 'hatchet':
      log(st, `${k.name} ขว้าง Hatchet ใส่ ${st.survivors[i.target].name} — ทอย Danger Die`, 'killer')
      return startRoll(st, { k: 'hatchet', s: i.target }, 1, 'danger')
    case 'spark': {
      log(st, `${k.name} ใช้ ประกายไฟคาร์เตอร์ ที่ ${roomName(st, i.room)}`, 'killer')
      const order = turnOrder(st)
      return sparkNext(st, onBoardIn(st, i.room).sort((a2, b) => order.indexOf(a2) - order.indexOf(b)))
    }
    case 'phantasm': {
      st.phantasm.push(k.room)
      log(st, `${k.name} วาง กับดักหลอก ที่ ${roomName(st, k.room)}`, 'killer', { ev: { k: 'phantasmSet', room: k.room } })
      if (propsIn(st, k.room).some((p) => p.kind === 'totem' && p.revealed)) gainKiller(st, 1)
      return
    }
    case 'bell':
      log(st, `${k.name} ตี กระดิ่งครวญ`, 'killer')
      return killerEnter(st, '', i.room)
    case 'victor':
      log(st, `${k.name} ${k.victorRoom ? 'ย้าย' : 'วาง'} Victor ไปที่ ${roomName(st, k.room)}`, 'killer')
      k.victorRoom = k.room
      return
    case 'rush':
      return blightRush(st)
    case 'slipstream': {
      // every card he has set, revealed or not, back to his hand; the bonus turn comes as this turn ends
      k.hand.push(...k.planned)
      Object.assign(k, { planned: [], revealedCount: 0, shown: [], slipstream: true })
      log(st, `${k.name} ใช้ สลิปสตรีม — เก็บการ์ดทั้งหมดกลับเข้ามือ แล้วเล่น Bonus Turn`, 'killer')
      return
    }
    case 'hallucinate': {
      const n = k.unknowns!.indexOf(null)
      k.unknowns![n] = i.room
      log(st, `${k.name} ใช้ ภาพหลอน — The Unknown ${n + 1} ปรากฏที่ ${roomName(st, i.room)}`, 'killer')
      return
    }
    case 'droneTake': {
      const p = st.props.find((x) => x.id === i.prop)!
      log(st, `${k.name} ใช้ ดวงตาบนท้องฟ้า — เก็บ Drone ที่ ${roomName(st, p.room!)} กลับขึ้นบอร์ด`, 'killer')
      return void Object.assign(p, { removed: true, merchant: true, room: null })
    }
    case 'droneDrop': {
      const p = merchantDrones(st)[0]
      Object.assign(p, { removed: false, merchant: false, room: k.room, revealed: true })
      log(st, `${k.name} ใช้ ดวงตาบนท้องฟ้า — วาง Drone หงายหน้าที่ ${roomName(st, k.room)}`, 'killer', { ev: { k: 'reveal', prop: p.id, kind: p.kind, room: k.room } })
      return
    }
    case 'birds': {
      const p = st.props.find((x) => x.artist && !!x.dire === i.dire)!
      Object.assign(p, { artist: false, removed: false, room: i.room, path: null, revealed: true })
      log(st, `${k.name} ใช้ ปักษาทรมาน — วาง ${i.dire ? 'Dire Crow' : 'Crow'} ที่ ${roomName(st, i.room)}`, 'killer', { ev: { k: 'reveal', prop: p.id, kind: p.kind, room: i.room } })
      // a crow (any) in his room now: 1 ▲
      if (propsIn(st, k.room).some((x) => x.kind === 'crow' && x.revealed)) {
        gainKiller(st, 1)
        log(st, `${k.name} +1 ▲ (มี Crow อยู่ในห้อง)`, 'killer')
      }
      return
    }
    case 'reign':
      log(st, `${k.name} ใช้ รัชสมัยแห่งความมืดมิด กับ ${st.survivors[i.target].name} — ดูการ์ดในมือ`, 'killer')
      return wait(st, { t: 'reignCard', s: i.target })
    case 'guard':
      log(st, `${k.name} ใช้ Guard`, 'killer')
      return placeGuard(st, i.guard, i.room)
    case 'afterpiece': {
      const name = i.which === 'tonic' ? 'Afterpiece Tonic' : 'Afterpiece Antidote'
      const was = st.afterpiece?.[i.which]
      st.afterpiece = { ...st.afterpiece, [i.which]: i.room }
      log(st, `${k.name} ${was ? 'ย้าย' : 'วาง'} ${name} ไปที่ ${roomName(st, i.room)}`, 'killer')
      return
    }
    case 'purge': {
      const placed: string[] = []
      for (const room of [k.room, i.room]) {
        if ((st.purge ?? []).includes(room) || purgeSupply(st) === 0) continue
        st.purge = [...(st.purge ?? []), room]
        placed.push(roomName(st, room))
      }
      log(st, `${k.name} ใช้ การชำระมลทินต่ำช้า — วางที่ ${placed.join(' และ ')}`, 'killer')
      return
    }
    case 'showstopper': {
      log(st, `${k.name} ใช้ ผู้ยับยั้งการแสดง`, 'killer')
      for (const s of showstopperTargets(st)) if (st.phase !== 'over') giveKnife(st, s)
      return
    }
    case 'frenzy': {
      const here = onBoardIn(st, k.room)
      const already = here.some((s) => st.survivors[s].wounded)
      log(st, `${k.name} ใช้ บ้าดีเดือด ที่ ${roomName(st, k.room)}${already ? ' (+1 ▲)' : ''}`, 'killer')
      for (const s of here) wound(st, s, 'power', `${st.survivors[s].name} โดน บ้าดีเดือด — บาดเจ็บ`)
      if (already) gainKiller(st, 1)
      return
    }
    case 'wrath': {
      const n = wrathGain(st)
      log(st, `${k.name} ใช้ โทสะแห่งยามาโอกะ (+${n} ▲)`, 'killer')
      return gainKiller(st, n)
    }
    case 'redeemer':
      k.hand.splice(k.hand.indexOf(i.card), 1)
      st.redeemer = i.card
      log(st, `${k.name} ทิ้งการ์ด 1 ใบแบบคว่ำ ยิง พระผู้ไถ่ ใส่ ${st.survivors[i.target].name} — ให้ทายการ์ด`, 'killer')
      return wait(st, { t: 'redeemerGuess', s: i.target })
    case 'chainsaw': {
      const to = exits(st, k.room, i.card as PathKind).find((e) => e.path.id === i.path)!.to
      k.hand.splice(k.hand.indexOf(i.card), 1)
      log(st, `${k.name} ทิ้ง ${CARD_NAMES[i.card]} ใช้ เลื่อยไฟฟ้า`, 'killer')
      killerEnter(st, i.path, to)
      // After the reveal and Quick & Quiet: who is still standing there gets cut.
      st.queue.splice(2, 0, { k: 'chainsawHit', room: to })
      return
    }
  }
}

/** Carter's Spark, one survivor at a time: those with ▲ choose, the others take it. */
/** `grip`: Dragon's Grip — the same choice, but refusing to pay wounds. */
function sparkNext(st: GameState, list: number[], grip = false) {
  const rest = [...list]
  while (rest.length) {
    const s = rest.shift()!
    if (st.survivors[s].bp >= 1) return wait(st, { t: 'sparkChoice', s, rest, ...(grip ? { grip } : {}) })
    if (grip) wound(st, s, 'power', `${st.survivors[s].name} โดน อุ้งมือมังกร — บาดเจ็บ`)
    else sparkHit(st, s)
  }
}

/** Whispers: refusing to pay sets that survivor's card face up, as Stridor's is (one slot). */
function whispersFaceUp(st: GameState, s: number) {
  st.stridor = s
  log(st, `${st.survivors[s].name} ไม่จ่าย — ต้องวางการ์ดเคลื่อนที่หงายหน้า (เสียงกระซิบ)`, s)
}

function sparkHit(st: GameState, s: number) {
  const sv = st.survivors[s]
  if (!sv.madness) {
    sv.madness = true
    log(st, `${sv.name} ติด บ้าคลั่ง`, 'killer', { ev: { k: 'madness', s, on: true } })
  } else wound(st, s, 'power', `${sv.name} โดน ประกายไฟคาร์เตอร์ — บาดเจ็บ`)
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
  if (healthy.length === 1) return wound(st, healthy[0], 'power', `${st.survivors[healthy[0]].name} โดน เลื่อยไฟฟ้า — บาดเจ็บ`)
  if (healthy.length > 1) wait(st, { t: 'pickSurvivor', why: 'chainsaw', options: healthy })
}

/** The survivor names a card; a wrong guess reels them into The Deathslinger's room and he picks them up. */
function redeemerGuess(st: GameState, s: number, guess: MoveCard) {
  const k = st.killer
  const sv = st.survivors[s]
  const card = st.redeemer ?? fail('no Redeemer card')
  st.redeemer = null
  if (guess === card) {
    log(st, `${sv.name} ทาย ${CARD_NAMES[guess]} — ถูก! การ์ดคือ ${CARD_NAMES[card]} หลุดจาก พระผู้ไถ่`, s)
    return
  }
  log(st, `${sv.name} ทาย ${CARD_NAMES[guess]} — ผิด การ์ดคือ ${CARD_NAMES[card]}`, s)
  const path = touchingPaths(st, k.room).find((p) => (p.a === sv.room || p.b === sv.room) && !pathState(st, p.id).wall && !palletOn(st, p.id))
  const from = sv.room
  sv.room = k.room
  emit(st, { k: 'move', who: s, from, to: k.room, path: path?.id ?? '' }, s)
  log(st, `${k.name} ดึง ${sv.name} เข้ามาแล้วอุ้ม`, 'killer', { ev: { k: 'pickUp', s } })
  pickUp(st, s)
}

/**
 * Windows of Opportunity: what Kate may do with the survival and altruism props of a connected
 * room (chest, empty locker, crow, pallet — a pallet on each free path of that room).
 */
function windowProps(st: GameState, room: string): PerkChoice[] {
  const out: PerkChoice[] = []
  for (const p of propsIn(st, room)) {
    if (!p.revealed || entityOn(st, { prop: p.id })) continue
    if (p.kind === 'chest' || p.kind === 'crow' || (p.kind === 'locker' && p.occupant === null)) out.push({ prop: p.id })
    if (p.kind === 'pallet') for (const path of touchingTokens(st, room)) if (pathFree(st, path)) out.push({ prop: p.id, path })
  }
  return out
}

/** The interaction a Windows of Opportunity choice makes with its prop. */
function windowInteraction(p: Prop, path?: string): SurvivorInteraction {
  if (p.kind === 'chest') return { k: 'rummage', prop: p.id }
  if (p.kind === 'locker') return { k: 'hide', prop: p.id }
  if (p.kind === 'crow') return { k: 'crow', prop: p.id }
  return { k: 'dropPallet', prop: p.id, path: path! }
}

/** The Knight's Guards by their Thai names (the PC game's: The Carnifex, The Assassin, The Jailer). */
export const GUARD_NAMES: Record<Guard, string> = { carnifex: 'เพชฌฆาต', assassin: 'มือลอบสังหาร', jailer: 'ผู้คุม' }

/** Where the Knight's Guards can go now: his room or a connected one, wherever it isn't already. */
export function guardOptions(st: GameState): { guard: Guard; room: string }[] {
  const k = st.killer
  const rooms = [k.room, ...connectedRooms(st, k.room)]
  return (['carnifex', 'assassin', 'jailer'] as const)
    .flatMap((guard) => rooms.filter((r) => st.guards?.[guard] !== r).map((room) => ({ guard, room })))
}

function placeGuard(st: GameState, guard: Guard, room: string) {
  const was = st.guards?.[guard]
  st.guards = { ...st.guards, [guard]: room }
  log(st, `${GUARD_NAMES[guard]} ${was ? 'ย้าย' : 'ลง'}ไปที่ ${roomName(st, room)}`, 'killer')
}

/** The Carnifex's choice: revealed altruism and survival props in its room (an occupied locker stays). */
export function carnifexProps(st: GameState): Prop[] {
  const room = st.guards?.carnifex
  if (!room) return []
  return propsIn(st, room).filter((p) => p.revealed && (p.category === 'altruism' || p.category === 'survival') && p.occupant === null)
}

function carnifexTake(st: GameState, id: string) {
  const p = st.props.find((x) => x.id === id)!
  p.removed = true
  log(st, `เพชฌฆาต นำ ${PROP_NAMES[p.kind]} ที่ ${roomName(st, p.room!)} ออก`, 'killer')
}

/** The Afterpiece Antidote's extra move for the killer: any path but one with a pallet (a wall he breaks). */
export function antidoteKillerMoves(st: GameState): { path: PathDef; to: string }[] {
  return exits(st, st.killer.room, 'any').filter((e) => !palletOn(st, e.path.id))
}

/** A survivor's card move is made: the move, then (after the new room's reveal) Sprint Burst, Leader. */
function cardMoveTo(st: GameState, s: number, path: PathDef, to: string, asked = false) {
  const from = st.survivors[s].room
  moveSurvivor(st, s, path, to, asked)
  // After the new room's reveal, its Phantasm Trap, Vile Purge and Antidote: Sprint Burst, Leader.
  let at = 1
  for (const k of ['roll', 'purgeTake', 'anyMove'] as const) if (st.queue[at]?.k === k) at++
  trigger(st, { k: 'afterCardMove', s, from, to, path: path.id }, at)
}

/** Vile Purges not on the board or on a survivor (10 in the box). */
export function purgeSupply(st: GameState): number {
  return VILE_PURGES - (st.purge ?? []).length - st.survivors.reduce((n, sv) => n + (sv.purged ?? []).length, 0)
}

/** The perks a survivor may cover with a Vile Purge (`cover`) or take one off (`uncover`). */
export function purgeOptions(st: GameState, s: number, mode: 'cover' | 'uncover'): PerkId[] {
  const sv = st.survivors[s]
  const covered = sv.purged ?? []
  return mode === 'cover' ? sv.perks.filter((p) => !covered.includes(p)) : covered
}

/**
 * The Plague's passive: a survivor takes a Vile Purge and covers one of their perks with it (they
 * choose which). The third clears them all and wounds; already wounded, it is a sacrifice
 * progress instead.
 */
function takePurge(st: GameState, s: number) {
  const sv = st.survivors[s]
  if ((sv.purged ?? []).length >= 2) {
    sv.purged = []
    log(st, `${sv.name} ได้ การชำระมลทินต่ำช้า อันที่ 3 — ทิ้งทั้งหมด`, 'killer', { ev: { k: 'purge', s, n: 3 } })
    if (sv.wounded) {
      log(st, `${sv.name} บาดเจ็บอยู่แล้ว — ${st.killer.name} ได้ Sacrifice Progress`, 'killer')
      return addSacrifice(st, 1)
    }
    return wound(st, s, 'power', `${sv.name} ได้ การชำระมลทินต่ำช้า อันที่ 3 — บาดเจ็บ`)
  }
  const options = purgeOptions(st, s, 'cover')
  if (options.length > 1) return wait(st, { t: 'purgeChoice', s, mode: 'cover' })
  if (options.length) coverPerk(st, s, options[0])
}

function coverPerk(st: GameState, s: number, perk: PerkId) {
  const sv = st.survivors[s]
  sv.purged = [...(sv.purged ?? []), perk]
  log(st, `${sv.name} ได้ การชำระมลทินต่ำช้า (${sv.purged.length}/3) — ปิด ${PERKS[perk].name}`, 'killer', { ev: { k: 'purge', s, n: sv.purged.length } })
}

/** In a locker: one Vile Purge comes off (they choose which perk it frees). */
function shedPurge(st: GameState, s: number) {
  const covered = st.survivors[s].purged ?? []
  if (covered.length > 1) return wait(st, { t: 'purgeChoice', s, mode: 'uncover' })
  if (covered.length) {
    st.survivors[s].purged = []
    dropPurge(st, s, covered[0])
  }
}

/** The Vile Purge that came off goes to the survivor's room, or back to the box if one is there. */
function dropPurge(st: GameState, s: number, perk: PerkId) {
  const sv = st.survivors[s]
  const room = sv.room
  const here = (st.purge ?? []).includes(room)
  if (!here) st.purge = [...(st.purge ?? []), room]
  log(st, `${sv.name} เอา การชำระมลทินต่ำช้า ออกจาก ${PERKS[perk].name} — ${here ? 'ห้องนี้มีอยู่แล้ว เก็บเข้ากอง' : `วางไว้ที่ ${roomName(st, room)}`}`, s, { ev: { k: 'purge', s, n: (sv.purged ?? []).length } })
}

/** Showstopper: survivors on the board in The Trickster's room and the rooms connected to it. */
export function showstopperTargets(st: GameState): number[] {
  const rooms = new Set([st.killer.room, ...connectedRooms(st, st.killer.room)])
  const order = turnOrder(st)
  return st.survivors.flatMap((sv, i) => (sv.status === 'board' && rooms.has(sv.room) ? [i] : [])).sort((a, b) => order.indexOf(a) - order.indexOf(b))
}

/**
 * The Trickster's passive: a Knife lowers the ▲ maximum by 2 (anything above it is lost), the
 * third wounds, and a fourth would be a sacrifice progress for him instead.
 */
function giveKnife(st: GameState, s: number) {
  const sv = st.survivors[s]
  const n = sv.knives ?? 0
  if (n >= 3) {
    log(st, `${sv.name} มี Knife ครบ 3 เล่มแล้ว — ${st.killer.name} ได้ Sacrifice Progress แทน`, 'killer', { ev: { k: 'knife', s, n: 4 } })
    return addSacrifice(st, 1)
  }
  sv.knives = n + 1
  const max = survivorMax(st, s)
  const lost = Math.max(0, sv.bp - max)
  sv.bp -= lost
  log(st, `${sv.name} ได้ Knife (${n + 1}/3) — ▲ สูงสุด ${max}${lost ? `, ทิ้ง ${lost} ▲` : ''}`, 'killer', { ev: { k: 'knife', s, n: n + 1 } })
  if (n + 1 === 3) wound(st, s, 'power', `${sv.name} ได้ Knife เล่มที่ 3 — บาดเจ็บ`)
}

/** After interacting with a locker, a survivor discards all their Knives. */
function dropKnives(st: GameState, s: number) {
  const sv = st.survivors[s]
  if (!sv.knives) return
  log(st, `${sv.name} ทิ้ง Knife ทั้ง ${sv.knives} เล่ม (Locker)`, s, { ev: { k: 'knife', s, n: 0 } })
  sv.knives = 0
}

/** Weaving Spiders: what the survivors pay between them, and the progress it buys. */
export const WEAVING_COST = 6
export const WEAVING_PROGRESS = 3

/** Weaving Spiders: who may put in ▲, the survivors on the board in Sable's room (her too). */
export function weavers(st: GameState, s: number): number[] {
  return onBoardIn(st, st.survivors[s].room)
}

/** Weaving Spiders, before anyone has said: those in her room with ▲ are still to; the rest put in 0. */
export function weavePledges(st: GameState, s: number): (number | null)[] {
  const here = weavers(st, s)
  return st.survivors.map((sv, i) => (here.includes(i) && sv.bp > 0 ? null : 0))
}

/** Weaving Spiders paid: a face-up generator +3, then the killer a sacrifice progress. */
function weavingPaid(st: GameState, s: number, prop: string, pay: number[]) {
  const gen = st.props.find((p) => p.id === prop)!
  const who = [...new Set(pay)].map((p) => `${st.survivors[p].name} ${pay.filter((x) => x === p).length} ▲`)
  payPerk(st, s, 'weaving_spiders', `จ่าย ${WEAVING_COST} ▲ (${who.join(', ')}) — Generator ที่ ${roomName(st, gen.room!)}`)
  for (const p of pay) st.survivors[p].bp--
  const before = st.queue.length
  // "up to 3": what the generator still needs, at most 3
  addGenerator(st, gen, Math.min(WEAVING_PROGRESS, PROGRESS_MAX - gen.progress), s)
  addSacrifice(st, 1)
  if (st.phase !== 'over') trigger(st, { k: 'afterSurvivorInteract', s }, st.queue.length - before)
}

/**
 * Crowd Control online, before anyone has said: survivors without ▲, or not on the board (in a
 * locker, on a hook, carried), have nothing to put in.
 */
export function crowdPledges(st: GameState): (number | null)[] {
  return st.survivors.map((sv) => (sv.status === 'board' && sv.bp > 0 ? null : 0))
}

/** The pledges as a payment (each entry 1 ▲), once they come to 2. */
export function pledgedPay(pledge: (number | null)[]): number[] {
  return pledge.flatMap((n, s) => Array.from({ length: n ?? 0 }, () => s))
}

/** Crowd Control: the ways the survivors can pay 2 ▲ between them (each entry pays 1); [] refuses. */
export function crowdPayments(st: GameState): number[][] {
  const out: number[][] = [[]]
  // only those on the board pay (the user's call)
  const live = st.survivors.flatMap((sv, i) => (sv.status === 'board' ? [i] : []))
  for (const a of live) if (st.survivors[a].bp >= 2) out.push([a, a])
  for (const a of live) for (const b of live) if (a < b && st.survivors[a].bp >= 1 && st.survivors[b].bp >= 1) out.push([a, b])
  return out
}

function wound(st: GameState, s: number, by: 'attack' | 'trap' | 'power' | 'perk', text: string) {
  const sv = st.survivors[s]
  if (sv.wounded) return
  sv.wounded = true
  sv.woundedThisRound = true
  hurt(st, s)
  log(st, text, 'killer', { ev: { k: 'wound', s, by } })
}
