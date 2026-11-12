<script setup lang="ts">
// The map with everything on it: prop tiles in each room, minis, and the tokens on paths
// (walls, pallets, bear traps, the Entity). Clickable paths, tiles and minis are passed in by
// the parent, which decides what a click means for the current step. Right-click (long-press
// on touch) asks the parent to show details.
//
// The board also animates what the engine reports in the log: minis walk through the path
// they took, tiles flip, and hits, hooks, repairs and breaks get an effect where they happen.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { components } from '../../data'
import { asset } from '../../i18n'
import { CARD_NAMES, GUARD_NAMES, boardOf, charlotteRoom, palletOn, pathDef, propsIn, tokenOf, unknownRooms, victorRoom } from '../engine/engine'
import type { GameEvent, GameState, Guard, PathKind, Prop } from '../engine/types'
import { ROUTES } from '../boardRoutes'
import { fxSound } from '../fx/audio'
import { boardHooks, holdBoard } from '../fx/bus'
import type { InspectTarget } from '../inspect'
import { preview, type Focus } from '../focus'
import { ANTIDOTE_IMAGE, BEAR_TRAP_IMAGE, GUARD_IMAGE, GUARD_SYMBOL, KNIFE_IMAGE, MADNESS_IMAGE, TONIC_IMAGE, VILE_PURGE_IMAGE, PROP_IMAGE, VICTOR_MINI, DOG_MINI, cardImage, killerMini, propPicture, survivorMini, unknownMini, roundEffects } from '../labels'
import Mini from './Mini.vue'
import PingLayer from './PingLayer.vue'
import { canPing, pingArmed, sendPing, shownPings } from '../pings'
import WoundRing from './WoundRing.vue'
import BpText from '../../components/BpText.vue'

const props = defineProps<{
  st: GameState
  /** Path id → tooltip, for paths that can be clicked now. */
  pathTargets: Record<string, string>
  /** Face-down prop tiles that can be clicked (flipped) now. */
  propTargets: string[]
  /** Things to interact with now, key → tooltip: a prop id, "s:<survivor>" or "killer" (power). */
  interactTargets: Record<string, string>
  /** Rooms that can be clicked now (a power or perk aimed at a room), room id → tooltip. */
  roomTargets?: Record<string, string>
  picked?: string[]
  /** A perk / power decision is open: what to point at. */
  focus?: Focus | null
  /** The start-room rolls are playing: the minis ("s0", "k"…) not on the map yet. */
  hideMinis?: string[]
  /** The mini that has just dropped onto the map. */
  arrive?: string
}>()
const emit = defineEmits<{ path: [id: string]; prop: [id: string]; interact: [key: string]; room: [id: string]; inspect: [target: InspectTarget] }>()

const roomTarget = (room: string) => !!props.roomTargets && room in props.roomTargets
/** The word after a room's name when clicking it means staying there. */
const stayTag = (label?: string) =>
  label?.includes('Wait') ? ' · WAIT' : label?.includes('อยู่ห้องเดิม') ? ' · อยู่ห้องเดิม' : label?.includes('The Dog มาที่') ? ' · วาง The Dog' : ''

/** A locker or hook with someone on it says who, and what has happened to them. */
function occupantTitle(p: Prop): string | null {
  if (p.occupant === null) return null
  const sv = props.st.survivors[p.occupant]
  return `${sv.name} — ${p.kind === 'hook' ? 'ถูกแขวนบน Hook' : 'ซ่อนใน Locker'}${sv.wounded ? ' · บาดเจ็บ' : ''}`
}

/** A piece with nothing of its own to do passes the click to its room, when the room is a target. */
function clickPiece(key: string, room: string) {
  if (canAct(key)) emit('interact', key)
  else if (roomTarget(room)) emit('room', room)
}

const canAct = (key: string) => key in props.interactTargets

function clickTile(id: string, room: string) {
  if (props.propTargets.includes(id)) emit('prop', id)
  else clickPiece(id, room)
}

const CATEGORY_TH = { objective: 'เหลือง · Objective', survival: 'น้ำเงิน · Survival', altruism: 'เขียว · Altruism', boldness: 'แดง · Boldness' }

const board = computed(() => boardOf(props.st))

const pct = (n: number) => `${(n * 100).toFixed(3)}%`

// ---------- layout (fractions of the board) ----------

/** Top-left and width of a square piece, as fractions of the board's width / height. */
interface Rect {
  x: number
  y: number
  w: number
}

// Within a room box: minis under the title, prop tiles along the bottom (four fit across).
const TILE = 0.205
const TILE_GAP = 0.018
const MINI = 0.18

/** Tile `i` of `n` in a room: full size up to four, smaller so five still fit inside the room. */
function tileRect(box: number[], i: number, n: number): Rect {
  const [x, y, w, h] = box
  const size = Math.min(TILE, (0.94 - TILE_GAP * (n - 1)) / n)
  // a smaller tile sits as low as a full-size one
  return { x: x + w * (0.03 + i * (size + TILE_GAP)), y: y + h * 0.575 + w * (TILE - size) * board.value.aspect, w: w * size }
}

/** Victor (The Twins): in the killer's corner, or beside Charlotte when she is there too. */
function victorRect(box: number[], withCharlotte: boolean): Rect {
  const [x, y, w, h] = box
  return { x: x + w * (withCharlotte ? 0.6 : 0.8), y: y + h * 0.24, w: w * MINI * 0.95 }
}

/**
 * The minis' row of a room with The Knight's Guards in it (minis of their own): survivors from
 * the left as usual, the Guards right to left from the killer's corner (left of him and Victor).
 * When they can't all stand apart, everyone closes up evenly along the row, so no one is hidden.
 */
function rowWithGuards(box: number[], ns: number, ng: number, killer: boolean, victor: boolean): { survivors: Rect[]; guards: Rect[] } {
  const [x, y, w, h] = box
  const gs = MINI * 0.95
  const right = killer && victor ? 0.6 : killer ? 0.78 : victor ? 0.8 : 0.97
  let sx = Array.from({ length: ns }, (_, i) => 0.03 + i * (MINI + 0.02))
  let gx = Array.from({ length: ng }, (_, i) => right - 0.02 - gs - i * (gs + 0.02))
  const survivorsEnd = ns ? sx[ns - 1] + MINI : 0.03
  if (ng && survivorsEnd + 0.01 > gx[ng - 1]) {
    const step = (right - 0.02 - gs - 0.03) / (ns + ng - 1)
    sx = sx.map((_, i) => 0.03 + i * step)
    gx = gx.map((_, i) => 0.03 + (ns + ng - 1 - i) * step)
  }
  return {
    survivors: sx.map((at) => ({ x: x + w * at, y: y + h * 0.2, w: w * MINI })),
    guards: gx.map((at) => ({ x: x + w * at, y: y + h * 0.22, w: w * gs })),
  }
}

function miniRect(box: number[], i: number, killer = false): Rect {
  const [x, y, w, h] = box
  return { x: x + w * (killer ? 0.78 : 0.03 + i * (MINI + 0.02)), y: y + h * 0.2, w: w * (killer ? MINI * 1.25 : MINI) }
}

/**
 * A survivor being carried: slung over the killer's shoulder — touching the top-left of his mini,
 * smaller, so the two read as one piece and move together while his face stays in sight.
 */
function carryRect(box: number[]): Rect {
  const k = miniRect(box, 0, true)
  // smaller than him and mostly off to his upper left: only the shoulder is covered
  const w = k.w * 0.62
  return { x: k.x - w * 0.62, y: k.y - w * board.value.aspect * 0.62, w }
}

const rectStyle = (r: Rect) => ({ left: pct(r.x), top: pct(r.y), width: pct(r.w) })

/** Centre of a rect as board fractions (a square: its height is w × aspect of the height). */
function centre(r: Rect): [number, number] {
  return [r.x + r.w / 2, r.y + (r.w * board.value.aspect) / 2]
}

function propImage(p: Prop): string {
  return p.revealed ? propPicture(p) : `assets/props/back-${p.category}.webp`
}

/**
 * Props just taken out of a room (a totem cleansed, a chest opened, a pallet thrown down, a
 * generator finished): each keeps its place in the room's row, empty, while its effect plays
 * there, instead of the next tile sliding straight in under it. By id: the room and the place.
 * Let go once the board's animations of that batch are over (the log watcher), and the others
 * then close up (the tiles' `left` is eased).
 */
const lingering = ref(new Map<string, { room: string; index: number }>())
/** The ones this batch added, to let go when its animations end. */
let lingerAdded: string[] = []

watch(
  () => props.st,
  (st, prev) => {
    // (an undo, or a game swapped in: nothing to keep)
    if (!prev || st.log.length <= prev.log.length) {
      if (lingering.value.size) lingering.value = new Map()
      return
    }
    const shown = new Set(st.props.filter((p) => p.room && !p.removed && !p.done).map((p) => p.id))
    const next = new Map(lingering.value)
    lingerAdded = []
    for (const r of board.value.rooms)
      propsIn(prev, r.id).forEach((p, index) => {
        // gone from every room now (a crow moved to another room shows there instead)
        if (shown.has(p.id) || next.has(p.id)) return
        next.set(p.id, { room: r.id, index })
        lingerAdded.push(p.id)
      })
    if (lingerAdded.length) lingering.value = next
  },
)

/** Let this batch's empty places go after `ms` (at the animation speed). */
function releaseLinger(ms: number) {
  const ids = lingerAdded
  lingerAdded = []
  if (!ids.length) return
  window.setTimeout(() => {
    const next = new Map(lingering.value)
    for (const id of ids) next.delete(id)
    lingering.value = next
  }, ms)
}

/** A room's props as shown: those in it, and those just taken out of it still holding their places. */
function shownProps(room: string): Prop[] {
  const list = propsIn(props.st, room)
  for (const [id, l] of [...lingering.value].sort((a, b) => a[1].index - b[1].index)) {
    if (l.room !== room) continue
    const p = props.st.props.find((q) => q.id === id)
    if (p) list.splice(Math.min(l.index, list.length), 0, p)
  }
  return list
}

// During setup's reveals the minis aren't on the board yet: their start rooms are rolled after.
const rooms = computed(() => {
  const hidden = new Set(props.hideMinis)
  return board.value.rooms.map((r) => ({
    ...r,
    props: shownProps(r.id),
    survivors: props.st.startPending ? [] : props.st.survivors.flatMap((sv, i) => (sv.room === r.id && (sv.status === 'board' || sv.status === 'carried') && !hidden.has(`s${i}`) ? [i] : [])),
    // The Twins: Charlotte is the killer's mini; Victor is a second, smaller one
    killer: !props.st.startPending && !hidden.has('k') && charlotteRoom(props.st) === r.id,
    victor: !props.st.startPending && !hidden.has('k') && victorRoom(props.st) === r.id,
    guards: (Object.entries(props.st.guards ?? {}) as [Guard, string | undefined][]).flatMap(([g, room]) => (room === r.id ? [g] : [])),
    // The Unknown: its other minis (the one standing for the killer is the killer's mini)
    unknowns: props.st.startPending ? [] : unknownRooms(props.st).flatMap((room, i) => (room === r.id && i !== (props.st.killer.unknownAt ?? 0) ? [i] : [])),
    // The Houndmaster's Dog: in the row with the Guards (one of the killer's pieces)
    dog: !props.st.startPending && props.st.killer.dogRoom === r.id,
  }))
})

/** Where every piece is now: minis by key ("k", "s0"…) and prop tiles by id. */
const rects = computed(() => {
  const minis = new Map<string, Rect>()
  const tiles = new Map<string, Rect>()
  const tokens = new Map<string, Rect>()
  for (const r of rooms.value) {
    // killer tokens lying here sit in the props' row after them, the same size (the row shrinks to fit)
    const here = roomTokens.value.filter((t) => t.room === r.id)
    const n = r.props.length + here.length
    r.props.forEach((p, i) => tiles.set(p.id, tileRect(r.box, i, n)))
    here.forEach((t, i) => tokens.set(t.key, tileRect(r.box, r.props.length + i, n)))
    // the survivors standing take the slots in turn; one being carried rides on the killer
    let slot = 0
    const standing = r.survivors.filter((s) => props.st.survivors[s].status !== 'carried').length
    const row = rowWithGuards(r.box, standing, r.guards.length + r.unknowns.length + (r.dog ? 1 : 0), r.killer, r.victor)
    for (const s of r.survivors) minis.set(`s${s}`, props.st.survivors[s].status === 'carried' ? carryRect(r.box) : row.survivors[slot++])
    if (r.killer) minis.set('k', miniRect(r.box, 0, true))
    if (r.victor) minis.set('v', victorRect(r.box, r.killer))
    r.guards.forEach((g, i) => minis.set(`g-${g}`, row.guards[i]))
    r.unknowns.forEach((u, i) => minis.set(`u${u}`, row.guards[r.guards.length + i]))
    if (r.dog) minis.set('d', row.guards[r.guards.length + r.unknowns.length])
  }
  return { minis, tiles, tokens }
})

// One per path icon: a fork's other pairs share the first one's icon (and its state).
/** Dissolution's ▲ on a path (the Bloodpoint token). */
const DISSOLUTION_IMAGE = 'assets/tokens/bloodpoint.webp'

const paths = computed(() =>
  board.value.paths.filter((p) => tokenOf(board.value, p.id) === p.id).map((p) => {
    const ps = props.st.paths[p.id]
    const e = props.st.entity
    const token = ps.wall
      ? components.breakableWall.image
      : palletOn(props.st, p.id)
        ? PROP_IMAGE.pallet
        : ps.trap
          ? BEAR_TRAP_IMAGE
          : e && 'path' in e && e.path === p.id
            ? components.entity.image
            : props.st.dissolution === p.id
              ? DISSOLUTION_IMAGE
              : null
    // the Entity on a path that already shows another token (Shadow Step over a pallet): drawn faint on top of it
    const entity = !!e && 'path' in e && e.path === p.id && token !== components.entity.image
    return { ...p, token, entity, target: p.id in props.pathTargets }
  }),
)

const PHANTASM_IMAGE = 'assets/killers/tokens/hag-phantasm-trap.webp'

/**
 * Killer tokens lying in a room (a Phantasm Trap, a Vile Purge, the Afterpiece Tonic / Antidote):
 * placed with the prop tiles (`rects`), after them in their row and the same size.
 */
interface RoomToken {
  key: string
  room: string
  image: string
  kind: 'phantasm' | 'purge' | 'tonic' | 'antidote'
  title: string
}
const roomTokens = computed(() => {
  const st = props.st
  const out: RoomToken[] = []
  for (const room of st.phantasm) out.push({ key: `ph-${room}`, room, image: PHANTASM_IMAGE, kind: 'phantasm', title: 'Phantasm Trap' })
  for (const room of st.purge ?? []) out.push({ key: `vp-${room}`, room, image: VILE_PURGE_IMAGE, kind: 'purge', title: 'การชำระมลทินต่ำช้า — ผู้รอดชีวิตที่เดินเข้ามาต้องเก็บไปปิด Perk 1 อัน' })
  const a = st.afterpiece ?? {}
  if (a.tonic) out.push({ key: 'ap-tonic', room: a.tonic, image: TONIC_IMAGE, kind: 'tonic', title: 'ยาบำรุงส่งท้าย — ผู้รอดชีวิตในห้องนี้วางการ์ดหงาย' })
  if (a.antidote) out.push({ key: 'ap-antidote', room: a.antidote, image: ANTIDOTE_IMAGE, kind: 'antidote', title: 'ยาแก้พิษส่งท้าย — ใครเข้าห้องนี้เดินต่อได้อีก 1 ทาง' })
  return out
})

/** What each of The Knight's Guards does, on its mini. */
const GUARD_TITLE: Record<Guard, string> = {
  carnifex: 'เพชฌฆาต — เริ่มเก็บกวาด: นำ prop เขียว/น้ำเงินออก แล้วย้ายไปห้องข้าง ๆ',
  assassin: 'มือลอบสังหาร — เดินเข้าห้องนี้ต้องทอย Danger Die (พลาด = บาดเจ็บ)',
  jailer: 'ผู้คุม — Skill Check ในห้องนี้ใช้ Danger Die (พลาด = บาดเจ็บ)',
}

const entityProp = computed(() => {
  const e = props.st.entity
  return e && 'prop' in e ? e.prop : null
})

const active = computed(() => props.st.activeSurvivor)

// ---------- decision focus ----------

/** Rooms that stay lit while deciding: where the people involved are and where they could go. */
const litRooms = computed(() => {
  const f = props.focus
  if (!f) return null
  const lit = new Set([...f.rooms, ...f.dests])
  for (const s of f.survivors) lit.add(props.st.survivors[s].room)
  if (f.killer) lit.add(props.st.killer.room)
  for (const r of preview.value?.dests ?? []) lit.add(r)
  return lit
})

const isFocused = (s: number) => props.focus?.survivors.includes(s) ?? false
const isHot = (s: number) => preview.value?.survivors?.includes(s) ?? false
const hotPaths = computed(() => new Set((preview.value?.paths ?? []).map((p) => tokenOf(board.value, p))))
/** The decision's highlighted paths, by icon. */
const focusPaths = computed(() => new Set((props.focus?.paths ?? []).map((p) => tokenOf(board.value, p))))
const hotDests = computed(() => new Set(preview.value?.dests ?? []))

// ---------- effects ----------

type FxKind = 'blood' | 'spikes' | 'burst' | 'debris' | 'snap' | 'float' | 'heal' | 'scratch' | 'drip' | 'dust' | 'crowFly' | 'palletSmash' | 'wallSmash' | 'slamDust' | 'blocked' | 'slash' | 'vignette' | 'sparks' | 'smoke' | 'ripple' | 'chestOpen' | 'totemOut' | 'embers'
interface Fx {
  id: number
  kind: FxKind
  x: number
  y: number
  /** Which way it lies (deg): a scratch mark. */
  angle?: number
  /** How big against its kind's own size: scratch marks and drops of blood vary. */
  size?: number
  /** A pallet breaking with no one kicking it: it splits at once. */
  quick?: boolean
  /** How long it waits before its animation starts (ms, full length). */
  wait?: number
  /** How long it stays (ms, full length), when not its kind's. */
  life?: number
  text?: string
  tone?: 'gold' | 'red' | 'green' | 'white'
}

const effects = ref<Fx[]>([])
const flipping = ref<string[]>([])
const shaking = ref(false)
const boardEl = ref<HTMLElement>()
let fxId = 0

import { anim, reducedMotion } from '../../settings'

const FX_MS: Record<FxKind, number> = { blood: 1100, spikes: 1600, burst: 1100, debris: 800, snap: 500, float: 1300, heal: 1100, scratch: 2600, drip: 2800, dust: 650, crowFly: 1700, palletSmash: 1400, wallSmash: 1400, slamDust: 750, blocked: 1700, slash: 400, vignette: 600, sparks: 600, smoke: 1600, ripple: 900, chestOpen: 1400, totemOut: 1100, embers: 2100 }

function addFx(kind: FxKind, at: [number, number], extra: Partial<Fx> = {}, delay = 0) {
  const show = () => {
    const fx: Fx = { id: ++fxId, kind, x: at[0], y: at[1], ...extra }
    effects.value = [...effects.value, fx]
    window.setTimeout(() => (effects.value = effects.value.filter((f) => f.id !== fx.id)), anim(extra.life ?? FX_MS[kind]))
  }
  if (delay) window.setTimeout(show, anim(delay))
  else show()
}

function shake() {
  if (reducedMotion.value) return
  shaking.value = false
  void nextTick(() => {
    shaking.value = true
    window.setTimeout(() => (shaking.value = false), anim(450))
  })
}

/** Centre of a survivor (mini, or the hook / locker tile they are on) or the killer. */
function whereIs(who: number | 'killer'): [number, number] | null {
  const m = rects.value.minis.get(who === 'killer' ? 'k' : `s${who}`)
  if (m) return centre(m)
  const tile = props.st.props.find((p) => p.occupant === who)
  const t = tile && rects.value.tiles.get(tile.id)
  return t ? centre(t) : null
}

function roomCentre(room: string): [number, number] {
  const [x, y, w, h] = board.value.rooms.find((r) => r.id === room)!.box
  return [x + w / 2, y + h / 2]
}

/**
 * Keeps a looping CSS animation on the page's clock: started at the timeline's zero, every
 * element with it is at the same point in the loop, whenever it was put on the board (the
 * Guards' faces and symbols change all at once, a Guard placed or moved later too).
 */
const vInStep = {
  mounted(el: HTMLElement) {
    for (const a of el.getAnimations()) a.startTime = 0
  },
}

const pathAt = (path: string) => pathDef(props.st, path).at as [number, number]

/** Mini positions at the last render, to animate from, and which Unknown was the killer's mini. */
let prevMinis = new Map<string, Rect>()
let prevUnknownAt = 0
onMounted(() => {
  prevMinis = new Map(rects.value.minis)
  prevUnknownAt = props.st.killer.unknownAt ?? 0
})

/**
 * The Unknown's minis as they were, keyed as they are now. The killer's mini ('k') is whichever
 * Unknown plays now, so when the turn passes to another, 'k' starts from where that one stood
 * (not from the last one's place), and the last one, now 'u<n>', from where 'k' was.
 */
function unknownSwap(from: Map<string, Rect>, was: number): Map<string, Rect> {
  const now = props.st.killer.unknownAt ?? 0
  if (!props.st.killer.unknowns || now === was) return from
  const out = new Map(from)
  const k = from.get('k')
  const next = from.get(`u${now}`)
  if (next) out.set('k', next)
  else out.delete('k')
  if (k) out.set(`u${was}`, k)
  out.delete(`u${now}`)
  return out
}

watch(
  () => props.st.log.length,
  (len, old) => {
    const from = unknownSwap(prevMinis, prevUnknownAt)
    lastMinis = from
    batch = fresh0(len, old)
    lastTiles = prevTiles
    prevTiles = new Map(rects.value.tiles)
    prevMinis = new Map(rects.value.minis)
    prevUnknownAt = props.st.killer.unknownAt ?? 0
    if (old === undefined || len <= old) return
    const fresh = props.st.log.slice(old).flatMap((e) => (e.ev ? [e.ev] : []))
    const walking = walk(fresh, from)
    walkEnds = walking
    killerWalks = fresh.some((e) => e.k === 'move' && e.who === 'killer')
    fxEnds = 0
    let delay = 0
    for (const ev of fresh) delay = play(ev, delay)
    // Hits, hooks and repairs need a moment to be seen before the next question pops up.
    const big = fresh.some((e) => ['wound', 'hook', 'genDone', 'gatesPowered', 'rescue', 'trapSprung', 'palletBreak', 'wallBreak', 'palletDrop'].includes(e.k))
    holdBoard(Math.max(walking, fxEnds, big ? anim(delay + 900) : 0))
    // the places of props taken out stay until the effects on them are done
    releaseLinger(Math.max(walking, fxEnds, anim(delay + 900)) + anim(150))
  },
  // once the minis are in their new rooms on the page but before it is painted: waiting a tick
  // let a frame or two show them there already, and the walk jumped back to start (a player saw
  // the minis twitch)
  { flush: 'post' },
)

/**
 * Element.animate, started at once: a new animation waits a frame or two for its start time, and
 * the page meanwhile showed the mini where it was going (it flicked there and back before its
 * walk, which players saw as a twitch).
 */
function animateNow(el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions): Animation {
  const a = el.animate(frames, opts)
  a.startTime = document.timeline.currentTime
  return a
}

/** When this batch's walk is over (ms, at the animation speed): a drop starts after it. */
let walkEnds = 0
/** When the last longer effect of this batch ends (a pallet pulled down): the board waits for it. */
let fxEnds = 0
/** The killer walks in this batch: a pallet he breaks on the way breaks where it is, with no run to it. */
let killerWalks = false

/**
 * Where this batch's minis and tiles stood before it (the board shows the new state already):
 * for a mini lifted onto the killer's shoulder, dropped off a hook or wriggling free, and for a
 * chest or a totem gone from the room as it is opened or cleansed.
 */
let lastMinis = new Map<string, Rect>()
/** This batch's events, for one of them to know what else came with it. */
let batch: GameEvent[] = []
const fresh0 = (len: number, old: number | undefined) => (old === undefined || len <= old ? [] : props.st.log.slice(old).flatMap((e) => (e.ev ? [e.ev] : [])))
let lastTiles = new Map<string, Rect>()
let prevTiles = new Map<string, Rect>()
onMounted(() => {
  prevTiles = new Map(rects.value.tiles)
})

/** Survivors this batch carries, hangs, frees or drops: they fly or fall (`flyMini`), never walk. */
function flown(events: GameEvent[]): Set<string> {
  return new Set(
    events.flatMap((e) => (e.k === 'pickUp' || e.k === 'hook' || e.k === 'carryEscape' || (e.k === 'rescue' && e.by !== e.s) ? [`s${e.s}`] : [])),
  )
}

/**
 * A mini thrown from where it was to where it is now, on an arc (`lift`, board heights up at the
 * top) that ends in a bounce: swept onto the killer's shoulder, hung, dropped off a hook. From
 * `start` (ms, at the animation speed); `ms` at full length.
 */
function flyMini(key: string, start: number, lift = 0.05, ms = 420) {
  const el = boardEl.value?.querySelector<HTMLElement>(`[data-mini="${key}"]`)
  const was = lastMinis.get(key)
  const now = rects.value.minis.get(key)
  if (!el || !was || !now || reducedMotion.value || (was.x === now.x && was.y === now.y)) return
  const mid = { x: (was.x + now.x) / 2, y: Math.min(was.y, now.y) - lift }
  animateNow(
    el,
    [
      { left: pct(was.x), top: pct(was.y), scale: '1', offset: 0, easing: 'ease-out' },
      { left: pct(mid.x), top: pct(mid.y), scale: '1.18', offset: 0.45, easing: 'ease-in' },
      { left: pct(now.x), top: pct(now.y), scale: '0.9', offset: 0.8, easing: 'ease-out' },
      { left: pct(now.x), top: pct(now.y), scale: '1', offset: 1 },
    ],
    // (held where it was until it goes: it is drawn in its new place already)
    { duration: anim(ms), delay: start, fill: 'backwards', easing: 'linear' },
  )
  fxEnds = Math.max(fxEnds, start + anim(ms))
}

/** The prop of `kind` this batch took out of `room` (a chest opened, a totem cleansed), where it stood. */
function goneFrom(kind: string, room: string): { id: string; at: [number, number] } | null {
  const p = props.st.props.find((q) => q.kind === kind && q.room === room && lastTiles.has(q.id) && (lingering.value.has(q.id) || !rects.value.tiles.has(q.id)))
  return p ? { id: p.id, at: centre(lastTiles.get(p.id)!) } : null
}

/** A mini reaching for what it handles (ms, full length): out to it, a moment there, back. */
const REACH = { out: 150, stay: 110, back: 190 }

/**
 * A mini reaching out to what it handles — a generator, a locker, a friend it heals, the survivor
 * the killer strikes: it moves part of the way there and back (a lunge, `far` of the way, never
 * more than a step), so every interaction shows who did it. From `start` (ms, at the animation
 * speed); returns when it gets there, for the effect to land on (`start` itself when there is no
 * mini to move, or motion is reduced).
 */
function reach(key: string, at: [number, number], start: number, far = 0.45): number {
  const got = reachTo(key, at, far)
  if (!got) return start
  const { el, to } = got
  const T = REACH.out + REACH.stay + REACH.back
  animateNow(
    el,
    [
      { translate: '0 0', offset: 0, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
      { translate: to, offset: REACH.out / T },
      { translate: to, offset: (REACH.out + REACH.stay) / T, easing: 'ease-in-out' },
      { translate: '0 0', offset: 1 },
    ],
    { duration: anim(T), delay: start, easing: 'linear' },
  )
  fxEnds = Math.max(fxEnds, start + anim(T))
  return start + anim(REACH.out)
}

/**
 * Where a mini's reach for `at` takes it: `far` of the way there, never more than a step, as a
 * translate in the mini's own size (its height on the board is its width times the aspect).
 * Null when there is no mini to move, or motion is reduced.
 */
function reachTo(key: string, at: [number, number], far: number): { el: HTMLElement; to: string } | null {
  const el = boardEl.value?.querySelector<HTMLElement>(`[data-mini="${key}"]`)
  const r = rects.value.minis.get(key)
  if (!el || !r || reducedMotion.value) return null
  const aspect = board.value.aspect
  let dx = (at[0] - (r.x + r.w / 2)) * far
  let dy = (at[1] - (r.y + (r.w * aspect) / 2)) * far
  const len = Math.hypot(dx, dy / aspect)
  if (len > 0.035) {
    dx *= 0.035 / len
    dy *= 0.035 / len
  }
  return { el, to: `${(dx / r.w) * 100}% ${(dy / (r.w * aspect)) * 100}%` }
}

/** Minis held out at what they work on while its skill check plays (a repair): to bring back. */
const reachHolds = new Map<string, { el: HTMLElement; to: string; a: Animation }>()

// The screen asks for a survivor's reach as a repair's skill check comes up (DiceModal): the board
// still shows the state before the roll, so the mini and the generator are where they were. They
// stay there, hands on it, until the check is over (`release`), then come back.
onMounted(() => {
  boardHooks.reach = (key, prop) => {
    const t = rects.value.tiles.get(prop)
    const got = t && reachTo(key, centre(t), 0.45)
    if (!got) return
    reachHolds.get(key)?.a.cancel()
    const a = animateNow(got.el, [{ translate: '0 0' }, { translate: got.to }], { duration: anim(REACH.out), easing: 'cubic-bezier(0.3, 0, 0.2, 1)', fill: 'forwards' })
    reachHolds.set(key, { ...got, a })
    holdBoard(anim(REACH.out + REACH.stay))
  }
  boardHooks.release = (key) => {
    const held = reachHolds.get(key)
    if (!held) return
    reachHolds.delete(key)
    const back = animateNow(held.el, [{ translate: held.to }, { translate: '0 0' }], { duration: anim(REACH.back), easing: 'ease-in-out' })
    held.a.cancel()
    void back.finished.catch(() => {})
  }
})
onBeforeUnmount(() => {
  boardHooks.reach = undefined
  boardHooks.release = undefined
  for (const h of reachHolds.values()) h.a.cancel()
  reachHolds.clear()
})

/** A tile taking a blow or a hand: a jolt and a shudder; `hard` for the killer's kick. */
function jolt(prop: string, at: number, hard = false) {
  const el = boardEl.value?.querySelector<HTMLElement>(`[data-prop="${prop}"]`)
  if (!el || reducedMotion.value) return
  const a = hard ? 9 : 4
  animateNow(
    el,
    [
      { rotate: '0deg', scale: '1' },
      { rotate: `${-a}deg`, scale: hard ? '1.12' : '1.06', offset: 0.18 },
      { rotate: `${a * 0.6}deg`, offset: 0.42 },
      { rotate: `${-a * 0.3}deg`, offset: 0.68 },
      { rotate: '0deg', scale: '1' },
    ],
    { duration: anim(hard ? 420 : 320), delay: at, easing: 'ease-out' },
  )
}

/** A locker's door swinging open and shut (`rattle`: shaken in its frame, the killer searching). */
function lockerDoor(prop: string, at: number, rattle = false) {
  const el = boardEl.value?.querySelector<HTMLElement>(`[data-prop="${prop}"]`)
  if (!el || reducedMotion.value) return
  const frames: Keyframe[] = rattle
    ? [
        { transform: 'none' },
        { transform: 'translateX(-6%) rotate(-3deg)', offset: 0.15 },
        { transform: 'translateX(6%) rotate(3deg)', offset: 0.3 },
        { transform: 'perspective(120px) rotateY(-55deg)', offset: 0.55 },
        { transform: 'perspective(120px) rotateY(-55deg)', offset: 0.75 },
        { transform: 'none' },
      ]
    : [
        { transform: 'none' },
        { transform: 'perspective(120px) rotateY(-62deg)', offset: 0.35 },
        { transform: 'perspective(120px) rotateY(-62deg)', offset: 0.55 },
        { transform: 'perspective(120px) rotateY(8deg)', offset: 0.85 },
        { transform: 'none' },
      ]
  animateNow(el, frames.map((f) => ({ ...f, transformOrigin: '0% 50%' })), { duration: anim(rattle ? 620 : 520), delay: at, easing: 'ease-in-out' })
}

/** Lines of light between two minis (a survivor healing another), each drawn a moment and gone. */
const beams = ref<{ id: number; x1: number; y1: number; x2: number; y2: number }[]>([])

function beam(from: [number, number], to: [number, number], at: number) {
  window.setTimeout(() => {
    const b = { id: ++fxId, x1: from[0], y1: from[1], x2: to[0], y2: to[1] }
    beams.value = [...beams.value, b]
    window.setTimeout(() => (beams.value = beams.value.filter((x) => x.id !== b.id)), anim(900))
  }, at)
}

/** The locker a survivor is in, or, when they came out, the one in their room. */
function lockerOf(s: number): string | undefined {
  const lockers = props.st.props.filter((p) => p.kind === 'locker' && !p.removed && p.room)
  return (lockers.find((p) => p.occupant === s) ?? lockers.find((p) => p.room === props.st.survivors[s]?.room))?.id
}

/** A pallet pulled down, at full length (ms): the run out, the pull, the fall, the settle. */
const DROP = { pull: 220, hold: 110, fall: 170, settle: 260, stay: 280 }

/**
 * A mini's run out of its room along a path's line (`leg`, as ROUTES has it: from the icon out)
 * to stand just short of the icon, a moment there (`busy`, ms at the animation speed), and back
 * the same way; from `start`. `dir`: the way to the icon over its last stretch (unit, in board
 * widths). `lunges`: times into the moment (ms, full length) it lunges at the icon, a kick each.
 * Returns how long the run out takes (ms, at the animation speed); 0 when there is no mini.
 */
function runToIcon(key: string, leg: [number, number][], icon: [number, number], [dx, dy]: [number, number], start: number, busy: number, lunges: number[] = []): number {
  const el = boardEl.value?.querySelector<HTMLElement>(`[data-mini="${key}"]`)
  const home = rects.value.minis.get(key)
  if (!el || !home) return 0
  const aspect = board.value.aspect
  const at = ([x, y]: [number, number]) => ({ x: x - home.w / 2, y: y - (home.w * aspect) / 2 })
  // they stand on their side of the icon, a pallet's length short of it
  const near = (by: number): [number, number] => [icon[0] - dx * by, icon[1] - dy * by * aspect]
  const stand = at(near(0.045))
  const pts = smoothRun([home, ...[...leg].reverse().map(at), stand], aspect)
  let run = 0
  const dist = [0]
  for (let i = 1; i < pts.length; i++) dist.push((run += Math.hypot(pts[i].x - pts[i - 1].x, (pts[i].y - pts[i - 1].y) / aspect)))
  const out = anim(Math.min(650, Math.max(260, (run / GAIT.sprint.speed) * 1000)))
  const total = out + busy + out
  const f = (t: number) => t / total
  const frames: Keyframe[] = pts.map((p, i) => ({ left: pct(p.x), top: pct(p.y), offset: f(run ? (out * dist[i]) / run : 0) }))
  // a kick: a lunge at the icon and back
  const lunge = at(near(0.03))
  for (const t of lunges) {
    frames.push({ left: pct(stand.x), top: pct(stand.y), offset: f(out + anim(t) - anim(90)) })
    frames.push({ left: pct(lunge.x), top: pct(lunge.y), offset: f(out + anim(t)) })
    frames.push({ left: pct(stand.x), top: pct(stand.y), offset: f(out + anim(t) + anim(110)) })
  }
  ;[...pts].reverse().forEach((p, i, back) => frames.push({ left: pct(p.x), top: pct(p.y), offset: f(out + busy + (run ? (out * (run - dist[back.length - 1 - i])) / run : 0)) }))
  // (from `start`: a walk before it plays first)
  animateNow(el, frames, { duration: total, delay: start, easing: 'linear' })
  return out
}

/** Walls the killer kicks down on his walk in this batch: the path's icon → when he starts kicking (ms, at the animation speed). */
const wallKicks = new Map<string, number>()
/** How long he stays at a wall (ms, full length): his kicks, then a breath before he goes through. */
const WALL_REST = 220

/**
 * A breakable wall broken, as the PC game's: the killer walking through it stops short of it (his
 * walk holds there: `walk`), kicks it twice, it shudders and splinters, and the third kick bursts
 * it into pieces with the crack and the board shaking; then he walks on through. Broken with no
 * kicks (a survivor's item, a push through it) it bursts at once. `start`: when (ms, at the
 * animation speed), for one with no kicks.
 */
function smashWall(path: string, start: number) {
  const id = tokenOf(board.value, path)
  const icon = pathAt(path)
  const kicked = wallKicks.get(id)
  const smash = () => {
    addFx('debris', icon)
    fxSound.palletBreak()
    shake()
  }
  if (reducedMotion.value) {
    window.setTimeout(smash, start)
    return
  }
  const t0 = kicked ?? start
  const kicks = kicked === undefined ? [0] : KICKS
  // the wall itself, from now (the state has it gone already) until it bursts; its CSS is timed
  // to KICKS, and plays its delay at the animation speed, so the wait is given at full length
  const rate = anim(1000) / 1000 || 1
  addFx('wallSmash', icon, { quick: kicked === undefined, wait: t0 / rate, life: t0 / rate + 1400 })
  kicks.forEach((t, i) => {
    window.setTimeout(() => {
      if (i === kicks.length - 1) return smash()
      fxSound.palletKick()
      addFx('debris', icon)
    }, t0 + anim(t))
  })
  fxEnds = Math.max(fxEnds, t0 + anim(kicks[kicks.length - 1] + 400))
}

/** The killer at a pallet (ms, full length): his kicks, the last one breaking it, then a breath. */
const KICKS = [140, 430, 720]
const KICK_REST = 380

/**
 * A pallet broken, as the PC game's: the killer runs out of his room along the path's line to the
 * pallet, kicks it (it shudders and splinters), and the third kick breaks it in two, the halves
 * flying apart with the crack, the splinters and the board shaking; then he goes back into his
 * room (he stays: p.14). When he walks on through it (Enduring), or nobody of his is at its line
 * (a survivor pushed through it), the pallet breaks where it lies with no run to it.
 */
function breakPallet(path: string, start: number) {
  const id = tokenOf(board.value, path)
  const icon = pathAt(path)
  const aspect = board.value.aspect
  const leg = killerWalks ? undefined : ROUTES[board.value.id]?.[id]?.[props.st.killer.room]
  const smash = () => {
    addFx('debris', icon)
    fxSound.palletBreak()
    shake()
  }
  if (reducedMotion.value) {
    window.setTimeout(smash, start)
    fxEnds = Math.max(fxEnds, start + anim(300))
    return
  }
  let out = 0
  if (leg) {
    const [nx, ny] = leg[0]
    let dx = icon[0] - nx
    let dy = (icon[1] - ny) / aspect
    const len = Math.hypot(dx, dy) || 1
    dx /= len
    dy /= len
    out = runToIcon('k', leg, icon, [dx, dy], start, anim(KICKS[KICKS.length - 1] + KICK_REST), KICKS)
  }
  // with no one kicking it, it breaks at once
  const kicks = leg ? KICKS : [0]
  const t0 = start + out
  // the pallet itself, on the path from now (the state has it gone already) until it splits:
  // shuddering at each kick, then in two (its CSS keyframes are timed to KICKS). CSS plays its
  // delay at the animation speed, so the wait is given at full length.
  const rate = anim(1000) / 1000 || 1
  addFx('palletSmash', icon, { quick: !leg, wait: t0 / rate, life: t0 / rate + 1400 })
  kicks.forEach((t, i) => {
    const last = i === kicks.length - 1
    window.setTimeout(() => {
      if (last) smash()
      else {
        fxSound.palletKick()
        addFx('debris', icon)
      }
    }, t0 + anim(t))
  })
  fxEnds = Math.max(fxEnds, t0 + anim(kicks[kicks.length - 1] + KICK_REST) + out)
}

/**
 * A pallet thrown down, as the PC game's: the survivor runs out of the room along the path's line
 * to the pallet standing beside the icon and yanks it — leaning back, the pallet tipping their
 * way, a beat — and it slams flat across the path, its shadow closing in under it as it comes
 * down. On the ground it flattens a little and springs back, dust bursts out to both sides of the
 * path, splinters fly, the board shakes, and the path's line flashes and its icon keeps a glow a
 * while: this way is shut now. Then they run back into the room. `start`: when to begin (ms, at
 * the animation speed). Without its line to the room (Windows of Opportunity's pallet in the next
 * room) the pallet falls by itself, from the side of the path's first room.
 */
function dropPallet(s: number, path: string, start: number) {
  const id = tokenOf(board.value, path)
  const icon = pathAt(path)
  const lines = ROUTES[board.value.id]?.[id]
  const room = props.st.survivors[s].room
  const leg = lines?.[room]
  const side = leg ?? lines?.[pathDef(props.st, path).a]
  // the way it falls: from the line's last stretch before the icon, across the path
  const aspect = board.value.aspect
  const [nx, ny] = side?.[0] ?? [icon[0], icon[1] - 0.1]
  let dx = icon[0] - nx
  let dy = (icon[1] - ny) / aspect
  const len = Math.hypot(dx, dy) || 1
  dx /= len
  dy /= len
  const way = (Math.atan2(dy, dx) * 180) / Math.PI
  const hit = () => {
    addFx('debris', icon)
    addFx('slamDust', icon, { angle: way })
    addFx('blocked', icon)
    flashPath(id, icon)
    fxSound.palletDrop()
    shake()
  }
  const token = boardEl.value?.querySelector<HTMLElement>(`[data-token="${id}"]`)
  if (reducedMotion.value || !token) {
    window.setTimeout(hit, start)
    fxEnds = Math.max(fxEnds, start + anim(300))
    return
  }
  // the survivor's run out to the pallet and back (not when the pallet is in another room)
  const fall = DROP.pull + DROP.hold + DROP.fall
  const out = leg ? runToIcon(`s${s}`, leg, icon, [dx, dy], start, anim(fall + DROP.stay)) : 0
  const t0 = start + out
  // the yank: leaning back from it as they pull, a beat, then thrown forward as it goes down
  const mini = leg && boardEl.value?.querySelector<HTMLElement>(`[data-mini="s${s}"]`)
  if (mini) {
    const T = fall + DROP.stay
    const back = { translate: `${-dx * 18}% ${-dy * 18}%`, rotate: `${-dx * 14}deg` }
    animateNow(
      mini,
      [
        { translate: '0 0', rotate: '0deg', offset: 0, easing: 'ease-out' },
        { ...back, offset: DROP.pull / T },
        { ...back, offset: (DROP.pull + DROP.hold) / T, easing: 'ease-in' },
        { translate: `${dx * 12}% ${dy * 12}%`, rotate: `${dx * 6}deg`, offset: fall / T, easing: 'ease-out' },
        { translate: '0 0', rotate: '0deg', offset: 1 },
      ],
      { duration: anim(T), delay: t0, easing: 'linear' },
    )
  }
  // the pallet: hidden until they reach it, then standing up on its edge on their left, pulled a
  // little more upright, and folded over from their left to their right down onto the path like a
  // page turning (the user's choice: left and right as the one pulling it sees them, facing the
  // icon): hinged on that left edge, it rises out of the map towards the eye while it stands and
  // opens out flat to their right as it falls. Its shadow tightens as it nears the ground, and it
  // squashes there and springs back.
  // Their right, facing (dx, dy) on a screen whose y runs down, is (-dy, dx): the fold is drawn
  // turned that way (`right`), hinged half the pallet's width to the other side of its middle.
  const right = (Math.atan2(dx, -dy) * 180) / Math.PI
  const fold = (deg: number, k = 1) =>
    `perspective(160px) rotate(${right}deg) translateX(-50%) rotateY(${deg}deg) translateX(50%) rotate(${-right}deg) scale(${k})`
  const high = 'drop-shadow(12px 10px 8px rgb(0 0 0 / 0.3))'
  const low = 'drop-shadow(0 3px 4px rgb(0 0 0 / 0.95))'
  const g = (t: number) => t / (fall + DROP.settle)
  const hinge = '50% 50%'
  // (hidden while it waits: the first frame fills the delay)
  animateNow(
    token,
    [
      { opacity: 0, transform: fold(-66), transformOrigin: hinge, filter: high, offset: 0 },
      { opacity: 1, transform: fold(-66), transformOrigin: hinge, filter: high, offset: g(40), easing: 'ease-out' },
      { opacity: 1, transform: fold(-76), transformOrigin: hinge, filter: high, offset: g(DROP.pull) },
      { opacity: 1, transform: fold(-78), transformOrigin: hinge, filter: high, offset: g(DROP.pull + DROP.hold), easing: 'cubic-bezier(0.6, 0, 1, 0.5)' },
      { opacity: 1, transform: fold(0, 1.12), transformOrigin: hinge, filter: low, offset: g(fall), easing: 'ease-out' },
      { opacity: 1, transform: fold(-7, 0.96), transformOrigin: hinge, filter: low, offset: g(fall + DROP.settle * 0.35), easing: 'ease-in-out' },
      { opacity: 1, transform: fold(0, 1.03), transformOrigin: hinge, filter: low, offset: g(fall + DROP.settle * 0.7), easing: 'ease-in-out' },
      { opacity: 1, transform: fold(0), transformOrigin: hinge, filter: low, offset: 1 },
    ],
    { duration: anim(fall + DROP.settle), delay: t0, fill: 'backwards', easing: 'linear' },
  )
  window.setTimeout(hit, t0 + anim(fall))
  fxEnds = Math.max(fxEnds, t0 + anim(fall + DROP.stay) + out)
}

/** Paths flashing along their whole line (a pallet just thrown down on them): each as its lines from the icon out. */
const flashes = ref<{ id: number; lines: string[] }[]>([])

/** The path's line on the map lights up from its icon out to both rooms, and fades. */
function flashPath(token: string, icon: [number, number]) {
  const legs = Object.values(ROUTES[board.value.id]?.[token] ?? {})
  if (!legs.length) return
  const f = { id: ++fxId, lines: legs.map((leg) => [icon, ...leg].map(([x, y]) => `${x},${y}`).join(' ')) }
  flashes.value = [...flashes.value, f]
  window.setTimeout(() => (flashes.value = flashes.value.filter((x) => x.id !== f.id)), anim(1000))
}

/** How fast a mini goes along each kind of path (board widths a second) and how it moves. */
const GAIT: Record<PathKind, { speed: number; stride: number; bob: number; lean: number; low: number }> = {
  sprint: { speed: 0.62, stride: 320, bob: 0.07, lean: 12, low: 1 },
  vault: { speed: 0.52, stride: 340, bob: 0.06, lean: 10, low: 1 },
  sneak: { speed: 0.55, stride: 440, bob: 0.035, lean: 5, low: 1 },
  crouch: { speed: 0.5, stride: 480, bob: 0.025, lean: 5, low: 0.88 },
}

/** A point a mini runs through (its top-left), with the kind of path it is on. */
interface WalkPoint {
  x: number
  y: number
  kind?: PathKind
  /** The path whose icon this is. */
  icon?: string
  /** The room this point is the edge of, where a path's line comes into it. */
  enters?: string
  /** The path whose breakable wall the killer kicks down standing here. */
  wall?: string
}

/**
 * What a run leaves on the map, as in the PC game: a survivor's red scratch marks on a sprint or
 * a vault (a sneak or a crouch leaves none), a wounded one's blood. The mini leans into its run (a sprint most), stretches running up or down the map, crouches
 * low, and sways upright when it stops; dust where it lands off a vault and where it stops; crows
 * fly up from a room a survivor sprints into. It only shows what everyone sees anyway.
 */
function walkFx(k: string, el: HTMLElement, pts: WalkPoint[], times: number[], w: number) {
  const aspect = board.value.aspect
  const total = times[times.length - 1]
  const mid = (p: { x: number; y: number }): [number, number] => [p.x + w / 2, p.y + (w * aspect) / 2]
  const later = (t: number, f: () => void) => window.setTimeout(f, t)
  const survivor = k.startsWith('s') ? props.st.survivors[+k.slice(1)] : null
  const killer = k === 'k'
  // along the run: every \`every\` board widths of the kinds wanted, when the mini is there
  const along = (every: number, on: (kind: PathKind | undefined) => boolean, f: (at: [number, number], dir: number) => void) => {
    let next = every * 0.5
    let run = 0
    for (let i = 1; i < pts.length; i++) {
      const a = mid(pts[i - 1])
      const b = mid(pts[i])
      const d = Math.hypot(b[0] - a[0], (b[1] - a[1]) / aspect)
      const dir = (Math.atan2((b[1] - a[1]) / aspect, b[0] - a[0]) * 180) / Math.PI
      while (next <= run + d) {
        const u = d ? (next - run) / d : 0
        const at: [number, number] = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]
        if (on(pts[i].kind)) later(times[i - 1] + (times[i] - times[i - 1]) * u, () => f(at, dir))
        next += every
      }
      run += d
    }
  }
  if (survivor && survivor.status !== 'carried') {
    // (on the paths between the rooms: in a room they would scrawl over its tiles)
    const inRoom = (at: [number, number]) => board.value.rooms.some(({ box: [x, y, bw, bh] }) => at[0] > x && at[0] < x + bw && at[1] > y && at[1] < y + bh)
    // Scattered, as the PC game's are: a few at a time, off to either side of the path and a
    // little ahead or behind, each its own size, turned every way, and not all at once.
    // `spread` and `ahead` in board widths, round the point the mini is at.
    const scatter = (at: [number, number], dir: number, spread: number, ahead: number): [number, number] => {
      const r = (dir * Math.PI) / 180
      const side = (Math.random() - 0.5) * 2 * spread
      const fwd = (Math.random() - 0.5) * 2 * ahead
      return [at[0] + Math.cos(r) * fwd - Math.sin(r) * side, at[1] + (Math.sin(r) * fwd + Math.cos(r) * side) * aspect]
    }
    const soon = (f: () => void) => later(Math.random() * anim(120), f)
    along(0.016, (kind) => kind === 'sprint' || kind === 'vault', (at, dir) => {
      const n = 1 + Math.floor(Math.random() * 3)
      for (let i = 0; i < n; i++) {
        const p = scatter(at, dir, 0.022, 0.01)
        if (inRoom(p)) continue
        soon(() => addFx('scratch', p, { angle: dir + (Math.random() - 0.5) * 120, size: 0.6 + Math.random() * 0.8 }))
      }
    })
    if (survivor.wounded)
      along(0.022, () => true, (at, dir) => {
        const n = 1 + Math.floor(Math.random() * 3)
        for (let i = 0; i < n; i++) {
          const p = scatter(at, dir, 0.014, 0.008)
          soon(() => addFx('drip', p, { size: 0.5 + Math.random() * 1.1 }))
        }
      })
    // crows take off from a room a survivor sprints into
    pts.forEach((p, i) => {
      if (!p.enters || p.kind !== 'sprint') return
      const crows = props.st.props.filter((q) => q.kind === 'crow' && q.room === p.enters && q.revealed && !q.removed)
      crows.forEach((c, n) => {
        const t = rects.value.tiles.get(c.id)
        if (t) later(times[i] + n * anim(120), () => addFx('crowFly', centre(t)))
      })
      if (crows.length) later(times[i], () => fxSound.crow())
    })
  }
  pts.forEach((p, i) => {
    if (p.icon && p.kind === 'vault') later(times[i] + anim(80), () => addFx('dust', mid(p)))
  })
  if (survivor || killer) later(total, () => addFx('dust', mid(pts[pts.length - 1])))
  // the lean and how the body is held: into each stretch, a little past it at a turn, upright
  // with a sway at the end (\`rotate\` and \`scale\`, apart from the bob's \`translate\`)
  if (el.classList.contains('carried')) return
  const settle = anim(300)
  const end = total + settle
  // (one lean per piece of the run, at its middle: round a corner's curve it swings over)
  const lean: Keyframe[] = [{ rotate: '0deg', scale: '1 1', offset: 0 }]
  let tilt = 0
  for (let i = 1; i < pts.length; i++) {
    const g = GAIT[pts[i].kind ?? 'sprint']
    const dx = pts[i].x - pts[i - 1].x
    const dy = (pts[i].y - pts[i - 1].y) / aspect
    const d = Math.hypot(dx, dy)
    if (!d) continue
    const uy = Math.abs(dy / d)
    tilt = (g.lean * dx) / d
    const body = `${(1 - 0.06 * uy) * g.low} ${(1 + 0.09 * uy) * g.low}`
    lean.push({ rotate: `${tilt}deg`, scale: body, offset: (times[i - 1] + times[i]) / 2 / end, easing: 'ease-in-out' })
    // up over a vault's icon: bigger, nearer the eye
    if (pts[i].icon && pts[i].kind === 'vault') lean.push({ scale: '1.15 1.15', offset: times[i] / end })
  }
  lean.push({ rotate: `${tilt}deg`, offset: total / end })
  lean.push({ rotate: `${-tilt * 0.4}deg`, scale: '1 1', offset: (total + settle * 0.4) / end })
  lean.push({ rotate: `${tilt * 0.15}deg`, offset: (total + settle * 0.75) / end })
  lean.push({ rotate: '0deg', scale: '1 1', offset: 1 })
  // Over a dropped pallet a survivor slides, as the PC game's: down low and flat, thrown well
  // forward into it, then up again on the far side; the pallet jolts under them, and dust kicks
  // up where they go down and where they come up
  for (const i of slidesOf(k, pts)) {
    const [a, b] = [times[i] - anim(SLIDE.before), times[i] + anim(SLIDE.after)]
    const prev = pts[Math.max(0, i - 1)]
    const dx = pts[i].x - prev.x
    const dy = (pts[i].y - prev.y) / aspect
    const d = Math.hypot(dx, dy) || 1
    const dive = (26 * dx) / d
    const flat = `${1.18 + 0.1 * Math.abs(dy / d)} 0.72`
    for (let j = lean.length - 1; j >= 0; j--) if ((lean[j].offset as number) * end > a && (lean[j].offset as number) * end < b) lean.splice(j, 1)
    lean.push(
      { offset: Math.max(0, a) / end },
      { rotate: `${dive}deg`, scale: flat, offset: (times[i] - anim(SLIDE.before) * 0.35) / end, easing: 'ease-out' },
      { rotate: `${dive * 0.8}deg`, scale: flat, offset: (times[i] + anim(SLIDE.after) * 0.45) / end, easing: 'ease-in-out' },
      { offset: Math.min(end, b) / end },
    )
    later(Math.max(0, a), () => addFx('dust', mid(prev)))
    later(times[i] + anim(SLIDE.after * 0.6), () => addFx('dust', mid(pts[i + 1] ?? pts[i])))
    const token = boardEl.value?.querySelector<HTMLElement>(`[data-token="${tokenOf(board.value, pts[i].icon!)}"]`)
    if (token)
      animateNow(
        token,
        [
          { translate: '-50% -50%', rotate: '0deg' },
          { translate: `calc(-50% + ${dx / d * 6}%) calc(-50% + ${dy / d * 6}%)`, rotate: '-4deg' },
          { translate: '-50% -50%', rotate: '2deg' },
          { translate: '-50% -50%', rotate: '0deg' },
        ],
        { duration: anim(260), delay: Math.max(0, times[i] - anim(40)), easing: 'ease-out' },
      )
  }
  // (keyframes whose properties it leaves out are filled in from their neighbours)
  lean.sort((p, q) => (p.offset as number) - (q.offset as number))
  animateNow(el, lean, { duration: end, easing: 'linear' })
}

/** How long a slide over a pallet takes either side of its icon (ms, full length). */
const SLIDE = { before: 170, after: 210 }

/** The points of a survivor's run at the icon of a path a pallet lies on: they slide over it there. */
function slidesOf(k: string, pts: WalkPoint[]): number[] {
  if (!k.startsWith('s') || props.st.survivors[+k.slice(1)]?.status === 'carried') return []
  return pts.flatMap((p, i) => (p.icon && palletOn(props.st, p.icon) ? [i] : []))
}

/**
 * A run's points with its corners rounded (the map's lines turn square; a runner doesn't): each
 * turn becomes a short curve `r` board widths out from the corner, and long stretches are cut in
 * pieces so the run can ease in and out along them (`easeTimes`). A corner's marks (`icon`,
 * `enters`) go on the middle of its curve.
 */
function smoothRun(pts: WalkPoint[], aspect: number, r = 0.028): WalkPoint[] {
  const len = (a: WalkPoint, b: WalkPoint) => Math.hypot(b.x - a.x, (b.y - a.y) / aspect)
  const out: WalkPoint[] = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, p, b] = [pts[i - 1], pts[i], pts[i + 1]]
    const la = len(a, p)
    const lb = len(p, b)
    const cos = la && lb ? ((p.x - a.x) * (b.x - p.x) + ((p.y - a.y) * (b.y - p.y)) / aspect ** 2) / (la * lb) : 1
    // straight on (an icon on a straight line), or no room to turn: the point as it is
    if (cos > 0.985 || la < 1e-4 || lb < 1e-4) {
      out.push(p)
      continue
    }
    const rr = Math.min(r, la / 2, lb / 2)
    const q0 = { x: p.x + ((a.x - p.x) * rr) / la, y: p.y + ((a.y - p.y) * rr) / la }
    const q2 = { x: p.x + ((b.x - p.x) * rr) / lb, y: p.y + ((b.y - p.y) * rr) / lb }
    for (const s of [0, 0.25, 0.5, 0.75, 1]) {
      const x = (1 - s) ** 2 * q0.x + 2 * (1 - s) * s * p.x + s ** 2 * q2.x
      const y = (1 - s) ** 2 * q0.y + 2 * (1 - s) * s * p.y + s ** 2 * q2.y
      // (into the corner on the way in's kind of path, out of it on the way out's)
      out.push({ x, y, kind: s <= 0.5 ? p.kind : b.kind, icon: s === 0.5 ? p.icon : undefined, enters: s === 0.5 ? p.enters : undefined })
    }
  }
  out.push(pts[pts.length - 1])
  // long stretches in pieces of about 0.05 board widths
  const cut: WalkPoint[] = [out[0]]
  for (let i = 1; i < out.length; i++) {
    const [a, b] = [out[i - 1], out[i]]
    const n = Math.floor(len(a, b) / 0.05)
    for (let j = 1; j <= n; j++) cut.push({ x: a.x + ((b.x - a.x) * j) / (n + 1), y: a.y + ((b.y - a.y) * j) / (n + 1), kind: b.kind })
    cut.push(b)
  }
  return cut
}

/**
 * A run's times eased at both ends: it gets going out of the room and slows into the next
 * instead of starting and stopping dead. Every effect reads these times, so they stay with the
 * mini. Same total; half the speed at the very start and the very end.
 */
function easeTimes(times: number[]): number[] {
  const total = times[times.length - 1]
  if (!total) return times
  // E: how far along the run (as its time at a steady pace) at a moment of the eased run
  const E = (s: number) => 0.5 * s + 0.5 * s * s * (3 - 2 * s)
  const inv = (u: number) => {
    let lo = 0
    let hi = 1
    for (let k = 0; k < 24; k++) {
      const m = (lo + hi) / 2
      if (E(m) < u) lo = m
      else hi = m
    }
    return (lo + hi) / 2
  }
  return times.map((t) => total * inv(t / total))
}

/** The longest one path's run may take (ms): a long way round goes quicker, not slower. */
const MAX_LEG = 2200

/**
 * The points a mini runs through along one path, from one room to the other: out of the room to
 * the line drawn on the map, along it (round its corners) to the icon, and on along the other
 * line to the next room (ROUTES, traced from the map art). Without a traced line, the icon alone.
 */
function routeOf(path: string, from: string | null, to: string): { pts: [number, number][]; icon: number } {
  const lines = ROUTES[board.value.id]?.[tokenOf(board.value, path)]
  const out = (from && lines?.[from]) || []
  const into = lines?.[to] ?? []
  return { pts: [...[...out].reverse(), pathAt(path), ...into], icon: out.length }
}

/**
 * Minis run from where they were along each path they took, as drawn on the map, at the pace of
 * its kind (a sprint quick, a crouch low and slow) and with a hop over a vault; returns how long
 * it takes.
 */
function walk(events: GameEvent[], from: Map<string, Rect>): number {
  let longest = 0
  const moved = new Map<string, { path: string; from: string | null; to: string }[]>()
  const add = (k: string, m: { path: string; from: string | null; to: string }) => moved.set(k, [...(moved.get(k) ?? []), m])
  for (const ev of events) {
    if (ev.k === 'move' && ev.path) add(key(ev.who), ev)
    if (ev.k === 'dog' && ev.path) add('d', ev)
  }
  const aspect = board.value.aspect
  // the walls the killer breaks on his way (finishKillerMove): he stops at each to kick it down
  const walls = new Set(events.flatMap((e) => (e.k === 'wallBreak' ? [tokenOf(board.value, e.path)] : [])))
  wallKicks.clear()
  const flying = flown(events)
  for (const [k, now] of rects.value.minis) {
    const was = from.get(k)
    if (!was || (was.x === now.x && was.y === now.y) || reducedMotion.value || flying.has(k)) continue
    const el = boardEl.value?.querySelector<HTMLElement>(`[data-mini="${k}"]`)
    if (!el) continue
    // the mini's top-left when its middle is on a point of the map
    const at = ([x, y]: [number, number]) => ({ x: x - now.w / 2, y: y - (now.w * aspect) / 2 })
    // A teleport has no path: straight there.
    const legs = moved.get(k) ?? []
    // `icon`: the path whose icon the point is
    // `enters`: the room the point is the edge of, at the end of a path's line
    const line: WalkPoint[] = [was]
    for (const m of legs) {
      const kind = pathDef(props.st, m.path).kind
      const route = routeOf(m.path, m.from, m.to)
      route.pts.forEach((p, i) => {
        if (i === route.icon && k === 'k' && walls.has(tokenOf(board.value, m.path))) {
          // where he stands to kick it: a wall's length short of the icon, on his way in
          const last = line[line.length - 1]
          const [px, py] = i > 0 ? route.pts[i - 1] : [last.x + now.w / 2, last.y + (now.w * aspect) / 2]
          const len = Math.hypot(p[0] - px, (p[1] - py) / aspect) || 1
          const by = Math.min(0.035, len / 2) / len
          line.push({ ...at([p[0] - (p[0] - px) * by, p[1] - (p[1] - py) * by]), kind, wall: m.path })
        }
        line.push({ ...at(p), kind, icon: i === route.icon ? m.path : undefined, enters: i === route.pts.length - 1 ? m.to : undefined })
      })
    }
    line.push({ ...now, kind: legs.length ? pathDef(props.st, legs[legs.length - 1].path).kind : undefined })
    const pts = smoothRun(line, aspect)
    // time to each point at its path's pace (distances in board widths)
    const times = [0]
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - pts[i - 1].x, (pts[i].y - pts[i - 1].y) / aspect)
      const gait = GAIT[pts[i].kind ?? 'sprint']
      times.push(times[i - 1] + anim((d / gait.speed) * 1000))
    }
    // a long line is run faster, so a turn never waits long on the board
    const cap = anim(MAX_LEG) * Math.max(1, legs.length)
    if (times[times.length - 1] > cap) {
      const k = cap / times[times.length - 1]
      for (let i = 0; i < times.length; i++) times[i] *= k
    }
    times.splice(0, times.length, ...easeTimes(times))
    // at a wall: he holds there while he kicks it, the rest of the walk later by as much
    const w = pts.findIndex((p) => p.wall)
    const hold = w < 0 ? 0 : anim(KICKS[KICKS.length - 1] + WALL_REST)
    if (w >= 0) {
      for (let i = w + 1; i < times.length; i++) times[i] += hold
      wallKicks.set(tokenOf(board.value, pts[w].wall!), times[w])
    }
    const total = times[times.length - 1]
    if (!total) continue
    const frames: Keyframe[] = []
    pts.forEach((p, i) => {
      frames.push({ left: pct(p.x), top: pct(p.y), offset: times[i] / total })
      if (i !== w || !pts[i + 1]) return
      // each kick a lunge at the wall and back
      const next = pts[i + 1]
      const lunge = { left: pct(p.x + (next.x - p.x) * 0.45), top: pct(p.y + (next.y - p.y) * 0.45) }
      for (const t of KICKS) {
        frames.push({ left: pct(p.x), top: pct(p.y), offset: (times[i] + anim(t) - anim(90)) / total })
        frames.push({ ...lunge, offset: (times[i] + anim(t)) / total })
        frames.push({ left: pct(p.x), top: pct(p.y), offset: (times[i] + anim(t) + anim(110)) / total })
      }
      frames.push({ left: pct(p.x), top: pct(p.y), offset: (times[i] + hold) / total })
    })
    animateNow(el, frames, { duration: total, easing: 'linear' })
    // the stride: a bob at each step, lower for a sneak or a crouch, and a hop over a vault's icon
    // (one step after another over the whole run, at the pace of the path it is on)
    const bobs: Keyframe[] = []
    const kindAt = (t: number) => pts[Math.max(1, times.findIndex((x) => x >= t))]?.kind ?? 'sprint'
    for (let t = 0, up = false; t < total; up = !up) {
      const gait = GAIT[kindAt(t)]
      bobs.push({ translate: up ? `0 ${-gait.bob * 100}%` : '0 0', offset: t / total, easing: 'ease-in-out' })
      t += anim(gait.stride) / 2
    }
    // (no hop over a vault a pallet lies on: they slide over the pallet instead, flat on the ground)
    const slides = slidesOf(k, pts)
    pts.forEach((p, i) => p.icon && p.kind === 'vault' && !slides.includes(i) && bobs.push({ translate: '0 -55%', offset: times[i] / total }))
    for (const i of slides) {
      const [a, b] = [times[i] - anim(SLIDE.before), times[i] + anim(SLIDE.after)]
      for (let j = bobs.length - 1; j >= 0; j--) if ((bobs[j].offset as number) * total > a && (bobs[j].offset as number) * total < b) bobs.splice(j, 1)
      bobs.push({ translate: '0 0', offset: Math.max(0, a) / total }, { translate: '0 0', offset: Math.min(total, b) / total })
    }
    bobs.push({ translate: '0 0', offset: 1 })
    bobs.sort((p, q) => (p.offset as number) - (q.offset as number))
    animateNow(el, bobs, { duration: total, easing: 'linear' })
    // a footstep as it reaches each icon — or the vault's, or going over a pallet
    pts.forEach((p, i) => p.icon && window.setTimeout(() => pathSound(p.icon!), times[i]))
    walkFx(k, el, pts, times, now.w)
    // (the sway upright at the end)
    longest = Math.max(longest, total + anim(300))
  }
  return longest
}

/** The sound of going along a path: over a pallet, over a vault, or a plain step. */
function pathSound(path: string) {
  if (palletOn(props.st, path)) fxSound.palletRun()
  else if (pathDef(props.st, path).kind === 'vault') fxSound.vault()
  else fxSound.step()
}

const key = (who: number | 'killer' | 'victor') => (who === 'killer' ? 'k' : who === 'victor' ? 'v' : `s${who}`)

/** One event's effect; returns the delay for the next so a burst of events reads in order. */
function play(ev: GameEvent, delay: number): number {
  switch (ev.k) {
    case 'reveal':
      flipping.value = [...flipping.value, ev.prop]
      window.setTimeout(() => (flipping.value = flipping.value.filter((p) => p !== ev.prop)), anim(800))
      fxSound.flip()
      if (ev.kind === 'crow') fxSound.crow()
      return delay
    case 'wound': {
      const at = whereIs(ev.s)
      if (ev.by !== 'attack' || !at) {
        if (at) addFx('blood', at, {}, delay)
        return delay + 150
      }
      // he lunges at them, and the blow lands as he gets there
      const hit = reach('k', at, Math.max(walkEnds, anim(delay)), 0.6)
      window.setTimeout(() => {
        addFx('slash', at, { angle: -35 - Math.random() * 25 })
        addFx('vignette', [0.5, 0.5])
        addFx('blood', at)
        shake()
        fxSound.hit()
      }, hit)
      return delay + 150
    }
    case 'trapSprung':
      addFx('snap', pathAt(ev.path), {}, delay)
      fxSound.snap()
      return delay + 150
    case 'hook': {
      const t = rects.value.tiles.get(ev.prop)
      const start = Math.max(walkEnds, anim(delay))
      const at = t ? reach('k', centre(t), start, 0.6) : start
      flyMini(`s${ev.s}`, at, 0.04, 360)
      window.setTimeout(() => {
        if (t) addFx('spikes', centre(t))
        fxSound.hook()
        shake()
      }, at + anim(200))
      return delay + 300
    }
    case 'rescue': {
      const was = lastMinis.get(`s${ev.s}`)
      const hook = props.st.props.find((p) => p.kind === 'hook' && p.room === props.st.survivors[ev.s].room && rects.value.tiles.has(p.id))
      const t = hook ? rects.value.tiles.get(hook.id)! : null
      const start = Math.max(walkEnds, anim(delay))
      const freed = ev.by !== ev.s && t ? reach(`s${ev.by}`, centre(t), start, 0.6) : start
      if (hook) jolt(hook.id, freed, true)
      if (ev.by !== ev.s) flyMini(`s${ev.s}`, freed, 0.03, 380)
      window.setTimeout(() => {
        const at = was ? centre(was) : whereIs(ev.s)
        if (at) addFx('burst', at, { tone: 'white' })
        fxSound.whoosh()
      }, freed)
      return delay
    }
    case 'heal': {
      const at = whereIs(ev.s)
      if (!at) return delay
      const from = ev.by !== ev.s ? whereIs(ev.by) : null
      const t = from ? reach(`s${ev.by}`, at, Math.max(walkEnds, anim(delay)), 0.35) : Math.max(walkEnds, anim(delay))
      if (from) beam(from, at, t)
      window.setTimeout(() => {
        addFx('ripple', at)
        addFx('heal', at, { text: '✚' })
        fxSound.heal()
      }, t)
      return delay
    }
    case 'repair': {
      const t = rects.value.tiles.get(ev.prop)
      const room = props.st.props.find((p) => p.id === ev.prop)!.room!
      // (they reached for it before the skill check: `boardHooks.reach`)
      const at = Math.max(walkEnds, anim(delay))
      window.setTimeout(() => {
        if (t) addFx('sparks', centre(t))
        if (ev.add > 0) addFx('float', roomCentre(room), { text: `⚡ +${ev.add}`, tone: 'gold' })
      }, at)
      jolt(ev.prop, at)
      return delay + 100
    }
    case 'genDone':
      addFx('burst', roomCentre(ev.room), { tone: 'gold' }, delay + 200)
      fxSound.generator()
      return delay + 300
    case 'gatesPowered':
      for (const p of props.st.props) {
        const t = p.kind === 'exitGate' && p.revealed && rects.value.tiles.get(p.id)
        if (t) addFx('burst', centre(t), { tone: 'gold' }, delay + 400)
      }
      fxSound.powered()
      return delay
    case 'gate': {
      const gate = props.st.props.find((p) => p.kind === 'exitGate' && p.revealed && p.progress === ev.progress)
      const t = gate && rects.value.tiles.get(gate.id)
      if (t) addFx('float', centre(t), { text: `🚪 ${ev.progress}/3`, tone: 'gold' }, delay)
      // (the lever giving under their hands, as a generator does: they reached for it before the check)
      if (gate) jolt(gate.id, Math.max(walkEnds, anim(delay)))
      if (ev.progress >= 3) fxSound.gateOpen()
      else fxSound.lever()
      return delay
    }
    case 'palletBreak':
      // he kicks it apart (after any walk of this batch, unless he walks on through it)
      breakPallet(ev.path, killerWalks ? anim(delay) : Math.max(walkEnds, anim(delay)))
      return delay
    case 'wallBreak':
      // kicked down on the killer's walk (timed by it), or burst at once
      smashWall(ev.path, anim(delay))
      return delay
    case 'palletDrop':
      // after any walk of this batch: they pull it down where they stand
      dropPallet(ev.s, ev.path, Math.max(walkEnds, anim(delay)))
      return delay
    case 'itemGot': {
      const sv = props.st.survivors[ev.s]
      const gone = goneFrom('chest', sv.room)
      if (!gone) return delay
      const at = reach(`s${ev.s}`, gone.at, Math.max(walkEnds, anim(delay)), 0.6)
      window.setTimeout(() => {
        addFx('chestOpen', gone.at)
        fxSound.flip()
      }, at)
      // (its place stays empty until the card has risen out of it)
      fxEnds = Math.max(fxEnds, at + anim(FX_MS.chestOpen))
      return delay
    }
    case 'pickUp': {
      const was = lastMinis.get(`s${ev.s}`)
      const start = Math.max(walkEnds, anim(delay))
      const at = was ? reach('k', centre(was), start, 0.6) : start
      flyMini(`s${ev.s}`, at, 0.06)
      window.setTimeout(() => {
        fxSound.pickUp()
        fxSound.whoosh()
      }, at)
      return delay
    }
    case 'touch':
      switch (ev.what) {
        case 'lockerIn':
        case 'lockerOut': {
          // the door swings open and shut on them going in or coming out
          const locker = typeof ev.who === 'number' ? lockerOf(ev.who) : undefined
          const t = locker ? rects.value.tiles.get(locker) : undefined
          const start = Math.max(walkEnds, anim(delay))
          const at = locker && t && ev.what === 'lockerIn' ? reach(`s${ev.who}`, centre(t), start, 0.7) : start
          if (locker) lockerDoor(locker, at)
          window.setTimeout(() => (ev.what === 'lockerIn' ? fxSound.lockerIn() : fxSound.lockerOut()), at)
          break
        }
        case 'lockerSearch': {
          // he goes to a locker in his room and wrenches it open
          const locker = props.st.props.find((p) => p.kind === 'locker' && !p.removed && p.room === props.st.killer.room)
          const t = locker ? rects.value.tiles.get(locker.id) : undefined
          const at = locker && t ? reach('k', centre(t), Math.max(walkEnds, anim(delay)), 0.6) : Math.max(walkEnds, anim(delay))
          if (locker) lockerDoor(locker.id, at, true)
          window.setTimeout(() => fxSound.lockerSearch(), at)
          break
        }
        case 'crow': {
          fxSound.crowTouch()
          // the crow nearest where they stood (their bonus turn may have taken them on already)
          const was = typeof ev.who === 'number' ? lastMinis.get(`s${ev.who}`) : undefined
          const near = (r: Rect) => (was ? Math.hypot(r.x - was.x, r.y - was.y) : Infinity)
          const crows = props.st.props.flatMap((p) => (p.kind === 'crow' && lastTiles.has(p.id) ? [lastTiles.get(p.id)!] : []))
          const t = was ? crows.sort((a, b) => near(a) - near(b))[0] : undefined
          if (t) {
            addFx('crowFly', centre(t), {}, delay)
            window.setTimeout(() => fxSound.crow(), anim(delay + 80))
          }
          break
        }
        case 'crowDestroy':
          fxSound.crowDestroy()
          break
        case 'sabotage': {
          const s = typeof ev.who === 'number' ? ev.who : null
          // a hook with someone on it: that is a rescue, shown as one ('rescue')
          if (batch.some((e) => e.k === 'rescue' && e.by === s)) {
            fxSound.sabotage()
            break
          }
          const hook = s !== null ? props.st.props.find((p) => p.kind === 'hook' && p.room === props.st.survivors[s].room && rects.value.tiles.has(p.id)) : undefined
          const t = hook && rects.value.tiles.get(hook.id)
          const start = Math.max(walkEnds, anim(delay))
          const at = t && s !== null ? reach(`s${s}`, centre(t), start, 0.6) : start
          if (hook) jolt(hook.id, at, true)
          window.setTimeout(() => {
            if (t) addFx('sparks', centre(t), { tone: 'white' })
            fxSound.sabotage()
          }, at)
          break
        }
        case 'totem':
          fxSound.totemTouch()
          break
      }
      return delay
    case 'cleanse': {
      const gone = goneFrom('totem', props.st.survivors[ev.s].room)
      const at = Math.max(walkEnds, anim(delay))
      if (gone) fxEnds = Math.max(fxEnds, at + anim(FX_MS.totemOut))
      window.setTimeout(() => {
        if (gone) {
          addFx('totemOut', gone.at)
          addFx('embers', gone.at)
        }
        fxSound.cleanse()
      }, at)
      return delay
    }
    case 'phantasmSet':
      addFx('float', roomCentre(ev.room), { text: '👻', tone: 'white' }, delay)
      fxSound.snap()
      return delay
    case 'madness': {
      const at = whereIs(ev.s)
      if (at) addFx('float', at, { text: ev.on ? 'บ้าคลั่ง!' : 'หาย บ้าคลั่ง', tone: ev.on ? 'red' : 'green' }, delay)
      return delay + 100
    }
    case 'trapSet':
      addFx('snap', pathAt(ev.path), {}, delay)
      fxSound.snap()
      return delay
    case 'damage': {
      const t = rects.value.tiles.get(ev.prop)
      if (!t) {
        fxSound.damage()
        return delay
      }
      const at = reach('k', centre(t), Math.max(walkEnds, anim(delay)), 0.6)
      window.setTimeout(() => {
        addFx('sparks', centre(t), { tone: 'red' })
        addFx('smoke', centre(t))
        addFx('float', centre(t), { text: '⚡ 0', tone: 'red' })
        fxSound.damage()
        shake()
      }, at)
      jolt(ev.prop, at, true)
      return delay
    }
    case 'bp': {
      const at = whereIs(ev.who)
      if (at) addFx('float', [at[0], at[1] - 0.03], { text: `+${ev.n} ▲`, tone: ev.who === 'killer' ? 'red' : 'white' }, delay)
      window.setTimeout(() => fxSound.bp(), anim(delay))
      return delay + 120
    }
    case 'carryEscape': {
      const start = Math.max(walkEnds, anim(delay))
      flyMini(`s${ev.s}`, start, 0.05, 380)
      const k = boardEl.value?.querySelector<HTMLElement>('[data-mini="k"]')
      if (k && !reducedMotion.value)
        animateNow(k, [{ rotate: '0deg' }, { rotate: '-14deg', offset: 0.25 }, { rotate: '9deg', offset: 0.55 }, { rotate: '0deg' }], { duration: anim(520), delay: start, easing: 'ease-out' })
      window.setTimeout(() => {
        const at = whereIs(ev.s)
        if (at) {
          addFx('float', at, { text: 'หลุด!', tone: 'green' })
          addFx('dust', at)
        }
        fxSound.whoosh()
      }, start + anim(380))
      return delay
    }
    default:
      return delay
  }
}

// ---------- details on right-click / long-press ----------

let pressTimer: number | undefined
let pressed = false
/** The pointerdown a prop or a mini took for its own long-press (the board then leaves it). */
let pressEvent: Event | null = null

function pressStart(e: PointerEvent, target: InspectTarget) {
  if (e.pointerType !== 'touch') return
  pressEvent = e
  pressed = false
  clearTimeout(pressTimer)
  pressTimer = window.setTimeout(() => {
    pressed = true
    emit('inspect', target)
  }, 550)
}

function pressEnd() {
  clearTimeout(pressTimer)
  pressAt = null
}

// ---------- pings (online): many ways in, so marking a spot never takes a detour ----------

/** Ping the spot under these page coordinates. */
function pingAt(x: number, y: number) {
  const r = boardEl.value?.getBoundingClientRect()
  if (r) sendPing((x - r.left) / r.width, (y - r.top) / r.height)
}

/** Right-click on the map pings (a prop or a mini keeps its own right-click: its details). */
function onContext(e: MouseEvent) {
  if (e.defaultPrevented || !canPing.value) return
  e.preventDefault()
  pingAt(e.clientX, e.clientY)
}

/** The middle button pings anywhere on the map (and doesn't start the browser's autoscroll). */
function onMiddle(e: MouseEvent) {
  if (e.button !== 1 || !canPing.value) return
  e.preventDefault()
  if (e.type === 'mousedown') pingAt(e.clientX, e.clientY)
}

/** Where the pointer is over the map (null: not over it), for the Q key. */
let pointer: { x: number; y: number } | null = null
let pressAt: { x: number; y: number } | null = null

function onPointerMove(e: PointerEvent) {
  pointer = { x: e.clientX, y: e.clientY }
  // a finger that moves is scrolling or dragging, not holding still to ping
  if (pressAt && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 12) {
    pressAt = null
    clearTimeout(pressTimer)
  }
}

function onPointerLeave() {
  pressEnd()
  pointer = null
}

/** Touch: holding a finger still on the map pings there (on a prop or a mini it shows details). */
function onPointerDown(e: PointerEvent) {
  if (e.pointerType !== 'touch' || pressEvent === e || !canPing.value) return
  pressed = false
  pressAt = { x: e.clientX, y: e.clientY }
  clearTimeout(pressTimer)
  pressTimer = window.setTimeout(() => {
    pressed = true
    pressAt = null
    pingAt(e.clientX, e.clientY)
  }, 550)
}

/** Q pings where the pointer is (the key, not the letter: a Thai layout types ๆ there). */
function onKey(e: KeyboardEvent) {
  if (e.code !== 'KeyQ' || e.repeat || e.ctrlKey || e.metaKey || !pointer || !canPing.value) return
  const t = e.target as HTMLElement | null
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
  pingAt(pointer.x, pointer.y)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

/** Swallow the click that ends a long-press. */
function guard(e: MouseEvent) {
  if (pressed) {
    e.stopImmediatePropagation()
    e.preventDefault()
    pressed = false
    return
  }
  // a ping (the 📍 button, or Alt+click): it marks the spot and does nothing else
  if (canPing.value && (pingArmed.value || e.altKey) && boardEl.value) {
    e.stopImmediatePropagation()
    e.preventDefault()
    pingAt(e.clientX, e.clientY)
  }
}
</script>

<template>
  <div ref="boardEl" class="board" :class="{ shake: shaking, pinging: pingArmed && canPing }" :style="{ aspectRatio: String(board.aspect) }" @click.capture="guard"
    @contextmenu="onContext"
    @mousedown="onMiddle"
    @auxclick="onMiddle"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="pressEnd"
    @pointercancel="pressEnd"
    @pointerleave="onPointerLeave"
  >
    <img class="map" :src="asset(board.image)" :alt="board.name" draggable="false" />

    <component
      :is="roomTarget(r.id) ? 'button' : 'div'"
      v-for="r in rooms"
      :key="r.id"
      class="room-hit"
      :data-room="r.id"
      :class="{ target: r.props.some((p) => propTargets.includes(p.id)), pick: roomTarget(r.id) }"
      :style="{ left: pct(r.box[0]), top: pct(r.box[1]), width: pct(r.box[2]), height: pct(r.box[3]) }"
      :title="roomTargets?.[r.id]"
      :aria-label="roomTargets?.[r.id]"
      @click="roomTarget(r.id) && emit('room', r.id)"
    >
      <!-- a room to click is named on it: with several (a fork's rooms) the choice reads at a glance -->
      <!-- a room that means staying put says so: a killer's Wait in planning, staying after a rescue -->
      <span v-if="roomTarget(r.id)" class="pick-tag">{{ r.name }}{{ stayTag(roomTargets?.[r.id]) }}</span>
    </component>

    <!-- a decision lights its rooms; outside one (planning), a card pointed at that goes straight to a
         room (the Dredge's) lights that room alone -->
    <template v-if="litRooms || hotDests.size">
      <div
        v-for="r in rooms"
        :key="`f-${r.id}`"
        class="room-focus"
        :class="{ dim: !!litRooms && !litRooms.has(r.id), dest: !!focus && focus.dests.includes(r.id), hot: hotDests.has(r.id) }"
        :style="{ left: pct(r.box[0]), top: pct(r.box[1]), width: pct(r.box[2]), height: pct(r.box[3]) }"
      />
    </template>

    <template v-for="r in rooms" :key="`c-${r.id}`">
      <component
        :is="propTargets.includes(p.id) || canAct(p.id) || roomTarget(r.id) ? 'button' : 'div'"
        v-for="p in r.props"
        :key="p.id"
        class="tile"
        :data-prop="p.id"
        :class="[
          p.category,
          {
            down: !p.revealed,
            target: propTargets.includes(p.id),
            act: canAct(p.id),
            picked: picked?.includes(p.id),
            flip: flipping.includes(p.id),
            hiding: p.occupant !== null && p.kind === 'locker',
            hooked: p.occupant !== null && p.kind === 'hook',
            gone: lingering.has(p.id),
          },
        ]"
        :style="rectStyle(rects.tiles.get(p.id)!)"
        :title="p.revealed ? (occupantTitle(p) ?? interactTargets[p.id] ?? 'คลิกขวาดูรายละเอียด') : `เปิด prop สี${CATEGORY_TH[p.category]}`"
        @click="clickTile(p.id, r.id)"
        @contextmenu.prevent="p.revealed && emit('inspect', { k: 'prop', id: p.id })"
        @pointerdown="p.revealed && pressStart($event, { k: 'prop', id: p.id })"
        @pointerup="pressEnd"
        @pointerleave="pressEnd"
      >
        <img :src="asset(propImage(p))" alt="" draggable="false" />
        <!-- pointed at: a bigger copy above it, to look at (the tile itself keeps its place) -->
        <img v-if="p.revealed" class="peek" :src="asset(propImage(p))" alt="" draggable="false" />
        <span v-if="p.revealed && (p.kind === 'generator' || p.kind === 'exitGate')" class="progress">{{ p.progress }}/3</span>
        <img v-if="entityProp === p.id" class="entity" :src="asset(components.entity.image)" alt="Entity" />
        <Mini
          v-if="p.occupant !== null"
          class="occupant"
          :class="{ hooked: p.kind === 'hook', hiding: p.kind === 'locker', wounded: st.survivors[p.occupant].wounded }"
          :src="asset(survivorMini(st, p.occupant))"
          :alt="st.survivors[p.occupant].name"
        >
          <WoundRing v-if="st.survivors[p.occupant].wounded" />
        </Mini>
      </component>
      <component
        :is="canAct(`s:${s}`) || roomTarget(r.id) ? 'button' : 'div'"
        v-for="s in r.survivors"
        :key="`s-${s}`"
        :data-mini="`s${s}`"
        :data-madness="st.survivors[s].madness || undefined"
        class="mini survivor"
        :class="{
          wounded: st.survivors[s].wounded,
          active: active === s,
          carried: st.survivors[s].status === 'carried',
          act: canAct(`s:${s}`),
          focus: isFocused(s),
          hot: isHot(s),
          arrive: arrive === `s${s}`,
        }"
        :style="rectStyle(rects.minis.get(`s${s}`)!)"
        :title="st.survivors[s].status === 'carried' ? `${st.survivors[s].name} — ถูก${st.killer.name}แบก` : (interactTargets[`s:${s}`] ?? st.survivors[s].name)"
        @click="clickPiece(`s:${s}`, r.id)"
        @contextmenu.prevent="emit('inspect', { k: 'survivor', s })"
        @pointerdown="pressStart($event, { k: 'survivor', s })"
        @pointerup="pressEnd"
        @pointerleave="pressEnd"
      >
        <img :src="asset(survivorMini(st, s))" :alt="st.survivors[s].name" draggable="false" />
        <WoundRing v-if="st.survivors[s].wounded" />
        <!-- Madness is a badge, not a ring: the ring says healthy (white) or wounded (red) -->
        <img v-if="st.survivors[s].madness" class="madness-tag" :src="asset(MADNESS_IMAGE)" alt="บ้าคลั่ง" title="บ้าคลั่ง: ทอย Danger Die แทน Skill Check" draggable="false" />
        <!-- a killer perk on them for the round (Leverage, Genetic Limits, Fearmonger), on the lower left -->
        <span v-if="roundEffects(st, s).length" class="effect-tag" :title="roundEffects(st, s).map((e) => e.text).join(' · ')">⛔</span>
        <!-- The Trickster's Knives: the token and how many, on the top-left -->
        <span v-if="st.survivors[s].knives" class="knife-tag" :class="{ full: st.survivors[s].knives === 3 }" :title="`Knife ${st.survivors[s].knives}/3`">
          <img :src="asset(KNIFE_IMAGE)" alt="Knife" draggable="false" /><b>{{ st.survivors[s].knives }}</b>
        </span>
      </component>
      <component
        :is="canAct('killer') || roomTarget(r.id) ? 'button' : 'div'"
        v-if="r.killer"
        data-mini="k"
        class="mini killer"
        :class="{ act: canAct('killer'), focus: focus?.killer, arrive: arrive === 'k', carrying: r.survivors.some((s) => st.survivors[s].status === 'carried') }"
        :style="rectStyle(miniRect(r.box, 0, true))"
        :title="interactTargets.killer ?? st.killer.name"
        @click="clickPiece('killer', r.id)"
        @contextmenu.prevent="emit('inspect', { k: 'killer' })"
        @pointerdown="pressStart($event, { k: 'killer' })"
        @pointerup="pressEnd"
        @pointerleave="pressEnd"
      >
        <img :src="asset(killerMini(st))" :alt="st.killer.name" draggable="false" />
        <b v-if="st.killer.unknowns" class="unknown-no">{{ (st.killer.unknownAt ?? 0) + 1 }}</b>
      </component>
      <component
        :is="canAct('victor') || roomTarget(r.id) ? 'button' : 'div'"
        v-if="r.victor"
        data-mini="v"
        class="mini killer victor"
        :class="{ act: canAct('victor') }"
        :style="rectStyle(victorRect(r.box, r.killer))"
        :title="interactTargets.victor ?? 'Victor'"
        @click="clickPiece('victor', r.id)"
      >
        <img :src="asset(VICTOR_MINI)" alt="Victor" draggable="false" />
      </component>
      <!-- The Unknown's other minis, numbered (each plays the card set for its number) -->
      <!-- (clickable when a survivor in its room does something to it: Diversion, Power Struggle) -->
      <component
        :is="canAct(`u${u}`) ? 'button' : 'div'"
        v-for="u in r.unknowns"
        :key="`u${u}`"
        :data-mini="`u${u}`"
        class="mini guard unknown"
        :class="{ act: canAct(`u${u}`) }"
        :style="rectStyle(rects.minis.get(`u${u}`)!)"
        :title="interactTargets[`u${u}`] ?? `The Unknown ${u + 1}`"
        @click="clickPiece(`u${u}`, r.id)"
      >
        <img :src="asset(unknownMini(u))" :alt="`The Unknown ${u + 1}`" draggable="false" />
        <b class="unknown-no">{{ u + 1 }}</b>
      </component>
      <!-- The Houndmaster's Dog, the card it runs with face up on it. Clicked: the killer's
           details (or the power's choice on it, when it is one) -->
      <component
        :is="canAct('dog') || roomTarget(r.id) ? 'button' : 'div'"
        v-if="r.dog"
        type="button"
        data-mini="d"
        class="mini guard dog"
        :class="{ act: canAct('dog') }"
        :style="rectStyle(rects.minis.get('d')!)"
        :title="interactTargets.dog ?? (st.killer.dogCard ? `The Dog — ${CARD_NAMES[st.killer.dogCard]}` : 'The Dog — ยังไม่มีการ์ด')"
        @click="canAct('dog') || roomTarget(r.id) ? clickPiece('dog', r.id) : emit('inspect', { k: 'killer' })"
        @contextmenu.prevent="emit('inspect', { k: 'killer' })"
      >
        <img :src="asset(DOG_MINI)" alt="The Dog" draggable="false" />
        <img v-if="st.killer.dogCard" class="dog-card" :src="asset(cardImage(st.killer.dogCard))" :alt="CARD_NAMES[st.killer.dogCard]" draggable="false" />
        <!-- Scent of Blood: a click on The Dog leaves it where it stands; said under it, as a tablet has no tooltip -->
        <b v-if="canAct('dog')" class="guard-name dog-tag">อยู่ที่เดิม</b>
      </component>
      <!-- The Knight's Guards: minis of their own, beside the killer's corner. Their three
           pictures are too alike to tell apart at this size, so each carries its own colour, its
           short name and its full one: a tooltip is no use on a tablet, and the survivors, who
           never see the killer's power panel, had nothing else to read. -->
      <button
        v-for="g in r.guards"
        :key="g"
        type="button"
        :data-mini="`g-${g}`"
        class="mini guard"
        :class="`guard-${g}`"
        :style="rectStyle(rects.minis.get(`g-${g}`)!)"
        :title="GUARD_TITLE[g]"
        @click="emit('inspect', { k: 'guard', g })"
        @contextmenu.prevent="emit('inspect', { k: 'guard', g })"
        @pointerdown="pressStart($event, { k: 'guard', g })"
        @pointerup="pressEnd"
        @pointerleave="pressEnd"
      >
        <img :src="asset(GUARD_IMAGE[g])" :alt="GUARD_NAMES[g]" draggable="false" />
        <img v-in-step class="guard-symbol" :src="asset(GUARD_SYMBOL[g])" alt="" draggable="false" />
        <b v-if="r.guards.length === 1" class="guard-name">{{ GUARD_NAMES[g] }}</b>
      </button>
      <!-- Two or three Guards in one room: their names on one line under them, not one each,
           which would stack down over the props. Right to left, as the minis are laid out. -->
      <div v-if="r.guards.length > 1" class="guard-names" :style="rectStyle(rects.minis.get(`g-${r.guards[0]}`)!)">
        <span class="names-row">
          <b v-for="g in r.guards" :key="g" :class="`guard-${g}`">{{ GUARD_NAMES[g] }}</b>
        </span>
      </div>
    </template>

    <!-- killer tokens in a room: tiles after the props, the same size -->
    <img v-for="t in roomTokens" :key="t.key" class="room-token" :class="t.kind" :style="rectStyle(rects.tokens.get(t.key)!)" :src="asset(t.image)" :alt="t.title" :title="t.title" />

    <template v-for="p in paths" :key="p.id">
      <!-- where the path's icon is on the map art, for the tutorial's guide to point at -->
      <span class="path-anchor" :data-path="p.id" :style="{ left: pct(p.at[0]), top: pct(p.at[1]) }" aria-hidden="true" />
      <img
        v-if="p.token"
        class="path-token"
        :data-token="p.id"
        :style="{ left: pct(p.at[0]), top: pct(p.at[1]) }"
        :src="asset(p.token)"
        alt=""
      />
      <img v-if="p.entity" class="path-token path-entity" :style="{ left: pct(p.at[0]), top: pct(p.at[1]) }" :src="asset(components.entity.image)" alt="Entity" title="Entity — ไม่มีใครเดินผ่านเส้นทางนี้ได้" />
      <span
        v-if="focusPaths.has(p.id) || hotPaths.has(p.id)"
        class="path-preview"
        :class="{ hot: hotPaths.has(p.id) }"
        :style="{ left: pct(p.at[0]), top: pct(p.at[1]) }"
      />
      <button
        v-if="p.target"
        class="path-target"
        :style="{ left: pct(p.at[0]), top: pct(p.at[1]) }"
        :title="pathTargets[p.id]"
        :aria-label="pathTargets[p.id]"
        @click="emit('path', p.id)"
      />
    </template>

    <div v-for="f in effects" :key="f.id" class="fx" :class="[f.kind, f.tone, { quick: f.quick }]" :style="{ left: pct(f.x), top: pct(f.y), '--angle': `${f.angle ?? 0}deg`, '--wait': `${f.wait ?? 0}ms`, '--size': f.size ?? 1 }">
      <span v-if="f.text"><BpText :text="f.text" /></span>
      <template v-if="f.kind === 'spikes'"><i v-for="n in 7" :key="n" :style="{ '--n': n }" /></template>
      <template v-if="f.kind === 'debris'"><i v-for="n in 8" :key="n" :style="{ '--n': n }" /></template>
      <template v-if="f.kind === 'chestOpen'">
        <img class="box" :src="asset(PROP_IMAGE.chest)" alt="" />
        <img class="item" :src="asset('assets/items/back.webp')" alt="" />
      </template>
      <template v-if="f.kind === 'totemOut'">
        <img :src="asset(PROP_IMAGE.totem)" alt="" />
        <img :src="asset(PROP_IMAGE.totem)" alt="" />
      </template>
      <template v-if="f.kind === 'embers'"><i v-for="n in 10" :key="n" :style="{ '--n': n }" /></template>
      <template v-if="f.kind === 'sparks'"><i v-for="n in 8" :key="n" :style="{ '--n': n }" /></template>
      <template v-if="f.kind === 'smoke'"><i v-for="n in 4" :key="n" :style="{ '--n': n }" /></template>
      <template v-if="f.kind === 'slamDust'"><i v-for="n in 8" :key="n" :style="{ '--n': n, '--s': n % 2 ? 1 : -1 }" /></template>
      <template v-if="f.kind === 'wallSmash'">
        <img v-for="q in 4" :key="q" class="chunk" :class="`q${q}`" :src="asset(components.breakableWall.image)" alt="" />
      </template>
      <template v-if="f.kind === 'palletSmash'">
        <img class="half left" :src="asset(PROP_IMAGE.pallet)" alt="" />
        <img class="half right" :src="asset(PROP_IMAGE.pallet)" alt="" />
      </template>
      <template v-if="f.kind === 'dust'"><i v-for="n in 6" :key="n" :style="{ '--n': n }" /></template>
      <template v-if="f.kind === 'crowFly'">
        <svg v-for="n in 4" :key="n" class="crow-bird" :style="{ '--n': n }" viewBox="0 0 40 20" aria-hidden="true"><path d="M0 9 Q10 0 20 10 Q30 0 40 9 Q30 5 20 14 Q10 5 0 9Z" /></svg>
      </template>
    </div>
    <svg v-if="beams.length" class="beam-layer" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
      <line v-for="b in beams" :key="b.id" :x1="b.x1" :y1="b.y1" :x2="b.x2" :y2="b.y2" />
    </svg>
    <svg v-if="flashes.length" class="path-flash" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
      <template v-for="fl in flashes" :key="fl.id">
        <polyline v-for="(l, i) in fl.lines" :key="i" :points="l" />
      </template>
    </svg>
    <PingLayer v-if="canPing || shownPings.length" />
  </div>
</template>

<style scoped>
.board {
  position: relative;
  /* keep the pieces' z-indexes inside the board, under overlays elsewhere on the page */
  isolation: isolate;
  width: 100%;
  container-type: inline-size;
  user-select: none;
  -webkit-touch-callout: none;
}
/* the 📍 button is on: any click on the map is a ping */
.board.pinging,
.board.pinging * {
  cursor: crosshair !important;
}
.board.shake {
  animation: shake 0.42s ease-in-out;
}
@keyframes shake {
  10%,
  90% {
    transform: translate(-2px, 1px);
  }
  20%,
  80% {
    transform: translate(4px, -2px);
  }
  30%,
  50%,
  70% {
    transform: translate(-6px, 2px);
  }
  40%,
  60% {
    transform: translate(6px, -1px);
  }
}
.map {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: var(--radius);
  box-shadow: 0 12px 40px rgb(0 0 0 / 0.6);
}

.room-hit {
  position: absolute;
  padding: 0;
  background: none;
  border: 2px solid transparent;
  border-radius: 3px;
  pointer-events: none;
}
/* a room to click: a power or perk aimed at it, or one end of a fork's path */
button.room-hit.pick {
  pointer-events: auto;
  cursor: pointer;
  /* above the focus dimming, so the ring and the name stay readable */
  z-index: 1;
  border: 4px solid #ff8a3d;
  background: rgb(255 138 61 / 0.18);
  box-shadow:
    0 0 0 2px rgb(0 0 0 / 0.65),
    0 0 30px 6px rgb(255 120 40 / 0.65),
    inset 0 0 3cqw rgb(255 138 61 / 0.35);
  /* the glow breathes, not the whole ring: the room's name stays fully readable */
  animation: room-pick 1.6s ease-in-out infinite;
}
@keyframes room-pick {
  50% {
    box-shadow:
      0 0 0 2px rgb(0 0 0 / 0.65),
      0 0 14px 2px rgb(255 120 40 / 0.35),
      inset 0 0 3cqw rgb(255 138 61 / 0.15);
  }
}
button.room-hit.pick:hover:not(:disabled) {
  background: rgb(255 138 61 / 0.32);
  border-color: #fff;
  animation: none;
}
/* the room's name on the ring, so a choice between rooms reads without hovering */
.pick-tag {
  position: absolute;
  left: 50%;
  top: 0;
  translate: -50% -55%;
  max-width: 112%;
  padding: 0.1em 0.5em;
  border-radius: 2px;
  background: #ff8a3d;
  color: #140a03;
  font-family: var(--font-display);
  font-size: 1.5cqw;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.35;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 2px 10px rgb(0 0 0 / 0.85);
  pointer-events: none;
}
button.room-hit.pick:hover:not(:disabled) .pick-tag {
  background: #fff;
}
.room-hit.target {
  border: 3px solid #ffd27a;
  background: rgb(255 214 140 / 0.1);
  box-shadow:
    0 0 0 2px rgb(0 0 0 / 0.6),
    0 0 26px 4px rgb(255 190 90 / 0.75);
  animation: pulse 1.4s ease-in-out infinite;
}

.tile {
  position: absolute;
  aspect-ratio: 1;
  padding: 0;
  border: none;
  background: none;
  border-radius: 50%;
  /* (the row closing up after a prop has gone: `lingering`) */
  transition:
    transform 0.15s ease,
    left 0.35s ease,
    width 0.35s ease;
}
/* a prop just taken out: its place kept, empty, while its effect plays */
.tile.gone {
  visibility: hidden;
  pointer-events: none;
}
/* Pointing at a revealed prop shows a bigger copy of it just above, to look at. The tile itself
   stays as it is: grown in place it covered the props beside it, and lifted it would leave the
   pointer and drop back. The copy takes no pointer, so what is under it can still be pointed at. */
.tile:not(.down):hover {
  z-index: 6;
}
.peek {
  position: absolute;
  left: 50%;
  bottom: 108%;
  width: 190%;
  height: 190%;
  translate: -50% 0;
  object-fit: contain;
  pointer-events: none;
  opacity: 0;
  scale: 0.6;
  transform-origin: 50% 100%;
  filter: drop-shadow(0 6px 10px rgb(0 0 0 / 0.85));
  transition:
    opacity 0.12s ease,
    scale 0.12s ease;
}
.tile:not(.down):hover > .peek {
  opacity: 1;
  scale: 1;
}
button.tile {
  cursor: pointer;
  z-index: 2;
  filter: none;
}
.tile.target {
  box-shadow:
    0 0 0 3px #ffe9b0,
    0 0 18px 4px rgb(255 214 140 / 0.8);
  animation: pulse 1.2s ease-in-out infinite;
}
.tile.target:hover {
  transform: scale(1.15);
  animation: none;
}
.tile.target.down > img:first-child {
  filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.8));
}
/* Picked, waiting for a confirm (Map's tiles, Oppression's generators): green, and it beats the
   orange "you may click this" ring, which these tiles still carry. */
.tile.picked,
button.tile.picked {
  box-shadow:
    0 0 0 3px var(--ok),
    0 0 20px 5px rgb(79 179 106 / 0.85);
  animation: none;
}
button.tile.picked::after {
  content: '✓';
  position: absolute;
  right: -18%;
  top: -18%;
  width: 1.4em;
  height: 1.4em;
  border-radius: 50%;
  background: var(--ok);
  color: #06140a;
  font-size: 1.1cqw;
  font-weight: 800;
  line-height: 1.4em;
  text-align: center;
  box-shadow: 0 1px 6px rgb(0 0 0 / 0.8);
}
.tile.flip {
  z-index: 4;
  animation: flip 0.75s cubic-bezier(0.3, 1.4, 0.5, 1);
}
@keyframes flip {
  0% {
    transform: perspective(300px) rotateY(180deg) scale(1.5);
    filter: brightness(2.2);
  }
  55% {
    transform: perspective(300px) rotateY(0) scale(1.45);
    filter: brightness(1.6) drop-shadow(0 0 10px #fff);
  }
  100% {
    transform: none;
  }
}
.tile > img:first-child {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.8));
}
.tile.down > img:first-child {
  filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.8)) brightness(0.8);
}
.progress {
  position: absolute;
  right: -8%;
  bottom: -8%;
  background: #f5c542;
  color: #000;
  font-weight: 800;
  font-size: 1.05cqw;
  line-height: 1;
  padding: 0.15em 0.3em;
  border-radius: 3px;
}
.entity,
.occupant {
  position: absolute;
  inset: 10%;
  width: 80%;
  height: 80%;
  object-fit: contain;
}
/*
 * Someone on a locker or a hook: the prop stays in full view and says what happened to them —
 * a blue ring for a locker, a red one for a hook — while their portrait tucks into the corner,
 * small and ringed to match. (It used to cover the whole tile, so the prop was lost and the two
 * states looked alike.)
 */
.tile.hiding {
  box-shadow:
    0 0 0 2px #7fc8ff,
    0 0 12px 3px rgb(90 170 255 / 0.5);
}
.tile.hooked {
  box-shadow:
    0 0 0 2px var(--blood-bright),
    0 0 14px 4px rgb(255 30 30 / 0.55);
}
.occupant {
  inset: auto -14% -14% auto;
  width: 62%;
  height: 62%;
  border-radius: 50%;
  z-index: 1;
  box-shadow:
    0 0 0 2px #f2efe6,
    0 0 0 3px rgb(0 0 0 / 0.85);
}
/* hidden: out of sight, so the portrait sits back a little */
.occupant.hiding {
  filter: grayscale(0.35) brightness(0.85);
}
/* the tile's ring says where they are, the portrait's says how they are (as on the board) */
/* wounded: the blood ring (WoundRing) goes over the light one */
.occupant.wounded {
  box-shadow: 0 0 0 2px rgb(0 0 0 / 0.85);
}
/* pointed at: the portrait shows clearly too */
.tile:not(.down):hover .occupant {
  filter: none;
}

.mini {
  position: absolute;
  aspect-ratio: 1;
  padding: 0;
  border: none;
  background: none;
  border-radius: 50%;
  z-index: 1;
  transition:
    left 0.45s ease,
    top 0.45s ease;
  filter: drop-shadow(0 3px 4px rgb(0 0 0 / 0.9));
}
/* a mini placed by its start-room roll drops onto the map from above */
.mini.arrive {
  animation: arrive 0.6s cubic-bezier(0.2, 1.4, 0.4, 1) both;
}
@keyframes arrive {
  from {
    scale: 2.4;
    opacity: 0;
  }
}
/* every survivor wears a light ring (red when wounded), so minis stand out from the room art */
.mini.survivor {
  box-shadow:
    0 0 0 2px #f2efe6,
    0 0 0 4px rgb(0 0 0 / 0.65);
}
/* wounded: the blood ring (WoundRing) takes the light ring's place */
.mini.survivor.wounded {
  box-shadow: 0 0 0 2px rgb(0 0 0 / 0.75);
}
/* whose turn it is: gold, a little bigger, breathing */
.mini.survivor.active {
  z-index: 4;
  transform: scale(1.15);
  box-shadow:
    0 0 0 3px #ffd56a,
    0 0 0 5px rgb(0 0 0 / 0.7),
    0 0 22px 6px rgb(255 200 90 / 0.85);
  animation: turn-glow 1.6s ease-in-out infinite;
}
.mini.survivor.wounded.active {
  box-shadow:
    0 0 0 2px rgb(0 0 0 / 0.75),
    0 0 26px 8px rgb(255 200 90 / 0.9);
}
@keyframes turn-glow {
  50% {
    filter: drop-shadow(0 0 10px rgb(255 214 140 / 0.9)) brightness(1.12);
  }
}
/* Carried: slung over the killer's shoulder, head down, kicking to get free. 'rotate' (not
   transform) so the walk along a path, which moves the mini with a transform, carries it along. */
.mini.survivor.carried {
  z-index: 6;
  rotate: -72deg;
  filter: drop-shadow(0 4px 6px rgb(0 0 0 / 0.95)) saturate(0.85);
  animation: struggle 1.1s ease-in-out infinite;
}
@keyframes struggle {
  0%,
  100% {
    rotate: -72deg;
  }
  20% {
    rotate: -60deg;
  }
  35% {
    rotate: -80deg;
  }
  50% {
    rotate: -66deg;
  }
}
/* the killer bears the weight: leaning into the carry */
.mini.killer.carrying {
  rotate: 8deg;
}
@media (prefers-reduced-motion: reduce) {
  .mini.survivor.carried {
    animation: none;
  }
}
.mini.killer {
  box-shadow:
    0 0 0 3px #ff4a3d,
    0 0 0 5px rgb(0 0 0 / 0.7),
    0 0 18px 5px rgb(255 30 30 / 0.7);
  filter: drop-shadow(0 0 8px rgb(255 30 30 / 0.85));
}
/* The Knight's Guards: his pieces, in a duller red than his own ring */
/* The Unknown's number on each of its minis */
.unknown-no {
  position: absolute;
  right: -6%;
  bottom: -6%;
  min-width: 38%;
  padding: 0 0.15em;
  border-radius: 999px;
  background: #b8332b;
  color: #fff;
  font-size: clamp(0.55rem, 0.9vw, 0.8rem);
  line-height: 1.4;
  text-align: center;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.8);
  pointer-events: none;
}
/* The Dog's card: a small card leaning on its ring, the colour of the path it will take */
.mini.dog > img.dog-card {
  position: absolute;
  right: -30%;
  bottom: -18%;
  width: 68%;
  height: auto;
  clip-path: none;
  transform: rotate(10deg);
  border-radius: 6%;
  box-shadow: 0 2px 5px rgb(0 0 0 / 0.85);
  pointer-events: none;
}
.mini.guard {
  box-shadow:
    0 0 0 2px #b8332b,
    0 0 0 4px rgb(0 0 0 / 0.7),
    0 0 10px 3px rgb(200 40 30 / 0.55);
}
/* Each Guard's own colour on the inside of the ring, the killer's red still on the outside, so
   they read as his pieces. The colour tells them apart at any size; the badge says which. */
.guard-carnifex {
  --guard: #e0a32e;
}
.guard-assassin {
  --guard: #a855c7;
}
.guard-jailer {
  --guard: #3f8fd8;
}
.mini.guard-carnifex,
.mini.guard-assassin,
.mini.guard-jailer {
  box-shadow:
    0 0 0 2px var(--guard),
    0 0 0 3.5px #7d241e,
    0 0 0 5px rgb(0 0 0 / 0.7),
    0 0 10px 3px rgb(200 40 30 / 0.45);
}
/* The Guard's face and its symbol take turns: the symbol fades in over the face and out again. */
.mini > img.guard-symbol {
  position: absolute;
  inset: 0;
  opacity: 0;
  animation: guard-symbol 8s ease-in-out infinite;
  pointer-events: none;
}
@keyframes guard-symbol {
  0%,
  40% {
    opacity: 0;
  }
  50%,
  90% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
/* with motion reduced, the face stays */
:global(html.reduce-motion) .mini > img.guard-symbol {
  animation: none;
}
/* the name under the mini, for anyone who doesn't know the colours yet */
.guard-name {
  position: absolute;
  left: 50%;
  /* tucked onto the mini's lower edge, so the name reads as part of the piece */
  top: 93%;
  transform: translateX(-50%);
  white-space: nowrap;
  /* the box only as big as the word: the name is the point, not the frame round it */
  padding: 0 0.25em;
  border-radius: 2px;
  background: rgb(10 10 12 / 0.92);
  color: var(--guard);
  font-family: var(--font-display);
  font-size: clamp(0.52rem, 0.78vw, 0.7rem);
  font-weight: 500;
  line-height: 1.15;
  text-align: center;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.8);
  pointer-events: none;
}
.dog-tag {
  color: #ffd27a;
}
/* several Guards in one room: one line of names under them, laid out as the minis are (the row
   is built right to left from the killer's corner), so it stays a single row over the props */
.guard-names {
  position: absolute;
  aspect-ratio: 1;
  z-index: 3;
  pointer-events: none;
}
.names-row {
  position: absolute;
  right: 0;
  top: 93%;
  display: flex;
  /* the minis run right to left, so the names do too: each sits under its own */
  flex-direction: row-reverse;
  gap: 0.45em;
  white-space: nowrap;
  padding: 0 0.25em;
  border-radius: 2px;
  background: rgb(10 10 12 / 0.92);
  font-family: var(--font-display);
  font-size: clamp(0.52rem, 0.78vw, 0.7rem);
  font-weight: 500;
  line-height: 1.15;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.8);
}
.names-row b {
  color: var(--guard);
  font-weight: 500;
}
/* crop the square art to its printed ring (same as Mini.vue) */
.mini > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  clip-path: circle(48.5% at 50% 50%);
  transform: scale(1.031);
}
/* Clickable to interact: survivors to heal / attack / pick up, the killer to use the power. */
button.mini,
button.tile.act {
  cursor: pointer;
  z-index: 3;
}


.mini.act:hover {
  transform: scale(1.15);
  animation: none;
}
.tile.act:hover {
  z-index: 6;
}

/* ---------- a piece to click, or one a decision is about ----------
   A ring at a little distance round the piece (a clear gap, so the piece itself stays as it is and
   two lit pieces side by side stay two), following its shape: a circle round a mini, a hexagon
   round a prop. A piece asking for a click also sends out a ripple, the same shape, again and
   again: easy to see at a glance, and nothing on the piece blinks. Colours as before: orange =
   click it, purple = what the decision is about (red for the killer), gold = a prop to flip,
   green = picked, blue = someone in this locker, red = someone on this hook. */

/* minis: the ring is an outline (it keeps a real gap and follows the round frame), past the
   survivor's own light ring or the blood ring of a wounded one */
.mini:is(.act, .focus) {
  outline: 0.3cqi solid var(--hl);
  outline-offset: 0.42cqi;
}
.mini.focus {
  --hl: #c9a6ff;
}
.mini.killer.focus {
  --hl: #ff5a52;
}
.mini.act {
  --hl: #ff8a3d;
}
.mini:is(.act, .focus)::after {
  content: '';
  position: absolute;
  inset: calc(-0.42cqi - 0.3cqi);
  border-radius: 50%;
  border: 0.3cqi solid var(--hl);
  pointer-events: none;
  animation: hl-ripple 1.4s ease-out infinite;
}
/* (only a piece to click sends out ripples; the purple one just wears its ring) */
.mini.focus:not(.act)::after {
  display: none;
}

/* props: every prop picture is the same hexagon (points left and right, flat edges at 7% and 93%
   of its height). The ring is that hexagon drawn as a line 7% outside it, through a mask; the
   ripple is the hexagon itself, coming out from under the picture. */
.tile {
  isolation: isolate;
}
.tile.hiding,
.tile.hooked,
.tile.target,
.tile.act,
.tile.picked,
button.tile.picked {
  box-shadow: none;
}
/* (the old fade of the whole tile goes; a tile flipping over keeps its flip) */
.tile:is(.target, .act):not(.flip) {
  animation: none;
}
.tile::before {
  content: '';
  position: absolute;
  inset: -14%;
  z-index: -1;
  display: none;
  background: var(--ring);
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'%3E%3Cpolygon points='5.1,50 27.5,11.5 72.5,11.5 94.9,50 72.5,88.5 27.5,88.5' fill='none' stroke='black' stroke-width='3.9' stroke-linejoin='round'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'%3E%3Cpolygon points='5.1,50 27.5,11.5 72.5,11.5 94.9,50 72.5,88.5 27.5,88.5' fill='none' stroke='black' stroke-width='3.9' stroke-linejoin='round'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
}
.tile:is(.hiding, .hooked, .target, .act, .picked)::before {
  display: block;
}
.tile:is(.target, .act):not(.picked)::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  clip-path: polygon(0 50%, 25% 7.1%, 75% 7.1%, 100% 50%, 75% 92.9%, 25% 92.9%);
  background: var(--ring);
  pointer-events: none;
  animation: hl-ripple 1.4s ease-out infinite;
}
.tile.hiding {
  --ring: #7fc8ff;
}
.tile.hooked {
  --ring: var(--blood-bright);
}
.tile.target {
  --ring: #ffe9b0;
}
.tile.act {
  --ring: #ff8a3d;
}
.tile.picked {
  --ring: var(--ok);
}
/* the ripple: out from the piece, fading as it goes */
@keyframes hl-ripple {
  0% {
    scale: 1;
    opacity: 0.85;
  }
  100% {
    scale: 1.75;
    opacity: 0;
  }
}

.path-token {
  position: absolute;
  width: 4.2%;
  translate: -50% -50%;
  pointer-events: none;
  filter: drop-shadow(0 3px 5px rgb(0 0 0 / 0.95));
}
/* over another token on the same path: the same size and faint, so the token under it still shows */
.path-entity {
  opacity: 0.5;
}
.path-anchor {
  position: absolute;
  width: 6%;
  aspect-ratio: 1;
  translate: -50% -50%;
  pointer-events: none;
}
.path-target {
  position: absolute;
  width: 6%;
  aspect-ratio: 1;
  translate: -50% -50%;
  padding: 0;
  border-radius: 50%;
  border: 3px solid #ffe9b0;
  background: rgb(255 214 140 / 0.15);
  box-shadow: 0 0 20px rgb(255 190 90 / 0.7);
  /* beating as well as fading: a path to take stays easy to see on a busy map */
  animation:
    pulse 1.2s ease-in-out infinite,
    beat 1.2s ease-in-out infinite;
}
.path-target:hover:not(:disabled) {
  background: rgb(255 214 140 / 0.35);
  border-color: #fff;
}

/* a killer token in a room's title bar, ringed in its own colour */
.room-token {
  position: absolute;
  z-index: 2;
  pointer-events: none;
  border-radius: 7px;
  object-fit: cover;
  /* a tile's cell, drawn as big as the prop hexagons in it (they leave a margin) */
  transform: scale(0.8);
}
.room-token.phantasm {
  box-shadow: 0 0 0 2px #a0ffc8, 0 0 10px rgb(160 255 200 / 0.8);
  animation: haunt 2.4s ease-in-out infinite;
}
.room-token.purge {
  box-shadow: 0 0 0 2px #b6e36a, 0 0 10px rgb(182 227 106 / 0.8);
}
.room-token.tonic {
  box-shadow: 0 0 0 2px #ff9ad5, 0 0 10px rgb(255 154 213 / 0.8);
}
.room-token.antidote {
  box-shadow: 0 0 0 2px #8fd8ff, 0 0 10px rgb(143 216 255 / 0.8);
}
@keyframes haunt {
  50% {
    opacity: 0.7;
  }
}
/* Madness: a green glow and the badge below — never a ring, which would hide the health ring. */
.mini.survivor[data-madness] {
  filter: drop-shadow(0 3px 4px rgb(0 0 0 / 0.9)) drop-shadow(0 0 7px rgb(156 255 107 / 0.9));
}
/* above the mini rather than beside it: minis stand side by side, so the room's top is free */
/* the Madness token on the mini's top-right: the Doctor's brain, ringed in his green */
.mini .effect-tag {
  position: absolute;
  left: -12%;
  bottom: -12%;
  display: grid;
  place-items: center;
  width: 42%;
  height: 42%;
  border-radius: 50%;
  background: #7a0b10;
  box-shadow:
    0 0 0 2px #ff4d4d,
    0 1px 6px rgb(0 0 0 / 0.85);
  font-size: 0.7em;
  line-height: 1;
  pointer-events: none;
}
.mini .madness-tag {
  position: absolute;
  right: -14%;
  top: -18%;
  width: 46%;
  height: 46%;
  border-radius: 6px;
  object-fit: cover;
  box-shadow:
    0 0 0 2px #9cff6b,
    0 1px 6px rgb(0 0 0 / 0.85);
  pointer-events: none;
}

/* the Knife token on the mini's top-left (Madness has the right), with the count on it */
.mini .knife-tag {
  position: absolute;
  left: -14%;
  top: -18%;
  width: 46%;
  height: 46%;
  pointer-events: none;
}
.mini .knife-tag img {
  width: 100%;
  height: 100%;
  border-radius: 6px;
  object-fit: cover;
  box-shadow:
    0 0 0 2px #c98a4b,
    0 1px 6px rgb(0 0 0 / 0.85);
}
.mini .knife-tag.full img {
  box-shadow:
    0 0 0 2px var(--blood-bright),
    0 0 8px var(--blood-bright);
}
.mini .knife-tag b {
  position: absolute;
  right: -18%;
  bottom: -18%;
  min-width: 1.15em;
  padding: 0 0.15em;
  border-radius: 99px;
  background: #111;
  color: #fff;
  font-size: 0.7em;
  line-height: 1.15em;
  text-align: center;
  box-shadow: 0 0 0 1px #c98a4b;
}

/* ---------- decision focus ---------- */

.room-focus {
  position: absolute;
  z-index: 0;
  pointer-events: none;
  border-radius: 3px;
  transition: background 0.25s;
}
.room-focus.dim {
  background: rgb(0 0 0 / 0.62);
}
.room-focus.dest {
  outline: 3px dashed rgb(200 160 255 / 0.85);
  outline-offset: -3px;
}
.room-focus.hot {
  outline: 4px solid #e3cbff;
  box-shadow: 0 0 28px 4px rgb(190 140 255 / 0.7) inset;
}

.mini.hot {
  transform: scale(1.25);
  z-index: 5;
}
.path-preview {
  position: absolute;
  width: 6.4%;
  aspect-ratio: 1;
  translate: -50% -50%;
  border-radius: 50%;
  border: 3px dashed rgb(200 160 255 / 0.9);
  pointer-events: none;
  animation: spin-slow 6s linear infinite;
}
.path-preview.hot {
  border: 4px solid #e3cbff;
  box-shadow: 0 0 24px 6px rgb(190 140 255 / 0.8);
}
@keyframes spin-slow {
  to {
    rotate: 360deg;
  }
}

/* ---------- effects ---------- */

.fx {
  position: absolute;
  translate: -50% -50%;
  pointer-events: none;
  z-index: 6;
}
/* blood: a splatter that bursts out and soaks away */
.fx.blood {
  width: 8%;
  aspect-ratio: 1;
  background:
    radial-gradient(circle at 50% 50%, rgb(190 0 10 / 0.95) 0 22%, transparent 23%),
    radial-gradient(circle at 22% 30%, rgb(160 0 8 / 0.9) 0 9%, transparent 10%),
    radial-gradient(circle at 78% 26%, rgb(170 0 8 / 0.9) 0 7%, transparent 8%),
    radial-gradient(circle at 70% 78%, rgb(150 0 6 / 0.9) 0 10%, transparent 11%),
    radial-gradient(circle at 25% 75%, rgb(180 0 10 / 0.9) 0 6%, transparent 7%),
    radial-gradient(circle at 50% 8%, rgb(140 0 6 / 0.85) 0 5%, transparent 6%),
    radial-gradient(circle at 92% 55%, rgb(140 0 6 / 0.85) 0 5%, transparent 6%);
  filter: drop-shadow(0 0 6px rgb(255 0 0 / 0.6));
  animation: splat 1.1s ease-out forwards;
}
@keyframes splat {
  0% {
    transform: scale(0.2) rotate(-20deg);
    opacity: 1;
  }
  25% {
    transform: scale(1.25) rotate(0);
  }
  70% {
    opacity: 0.9;
  }
  100% {
    transform: scale(1.35);
    opacity: 0;
  }
}
/* the Entity's spikes rising round the hook */
.fx.spikes {
  width: 9%;
  aspect-ratio: 1;
  animation: fade-late 1.6s ease-in forwards;
}
.fx.spikes i {
  position: absolute;
  left: 50%;
  bottom: 50%;
  width: 14%;
  height: 70%;
  background: linear-gradient(0deg, #3a0306, #c8141d 70%, #ff6b6b);
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
  transform-origin: 50% 100%;
  transform: translateX(-50%) rotate(calc((var(--n) - 4) * 24deg)) scaleY(0);
  filter: drop-shadow(0 0 6px rgb(255 30 30 / 0.9));
  animation: spike 0.5s cubic-bezier(0.2, 1.6, 0.4, 1) forwards;
  animation-delay: calc(var(--n) * 40ms);
}
@keyframes spike {
  to {
    transform: translateX(-50%) rotate(calc((var(--n) - 4) * 24deg)) scaleY(1);
  }
}
@keyframes fade-late {
  0%,
  70% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
/* a ring of light */
.fx.burst {
  width: 4%;
  aspect-ratio: 1;
  border-radius: 50%;
  border: 3px solid currentColor;
  box-shadow:
    0 0 24px 8px currentColor,
    inset 0 0 18px currentColor;
  color: #ffd75e;
  animation: burst 1.1s ease-out forwards;
}
.fx.burst.white {
  color: #fff;
}
@keyframes burst {
  0% {
    transform: scale(0.3);
    opacity: 1;
  }
  100% {
    transform: scale(4.5);
    opacity: 0;
  }
}
/* scratch marks (the PC game's): red streaks a run leaves behind, fading */
.fx.scratch {
  z-index: 2;
  width: calc(2.4% * var(--size, 1));
  height: calc(1.1% * var(--size, 1));
  rotate: var(--angle);
  background:
    linear-gradient(170deg, transparent 0 18%, rgb(230 20 30 / 0.95) 20% 27%, transparent 29%),
    linear-gradient(176deg, transparent 0 46%, rgb(255 45 45 / 0.9) 48% 54%, transparent 56%),
    linear-gradient(168deg, transparent 0 70%, rgb(210 10 20 / 0.9) 72% 78%, transparent 80%);
  filter: drop-shadow(0 0 3px rgb(255 0 0 / 0.75));
  animation: scratch 2.6s ease-in forwards;
}
@keyframes scratch {
  0% {
    opacity: 0;
    scale: 0.4 1;
  }
  8% {
    opacity: 1;
    scale: 1;
  }
  55% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
  }
}
/* a wounded survivor's blood on the way */
.fx.drip {
  z-index: 2;
  width: calc(0.9% * var(--size, 1));
  aspect-ratio: 1;
  border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
  background: radial-gradient(circle at 40% 35%, #c0101a, #5a0006 75%);
  box-shadow: 0 0 4px rgb(255 0 0 / 0.5);
  animation: drip 2.8s ease-in forwards;
}
@keyframes drip {
  0% {
    scale: 0;
  }
  10% {
    scale: 1.2;
  }
  20% {
    scale: 1;
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
/* a pallet kicked apart: it lies on the path, shudders at each kick (KICKS: 140, 430 and 720 ms
   of 1.4 s), and the last splits it in two, the halves flying off and fading */
.fx.palletSmash {
  z-index: 3;
  width: 4.2%;
  aspect-ratio: 1;
  animation: smash-shudder 1.4s linear var(--wait) both;
}
.fx.palletSmash .half {
  position: absolute;
  inset: 0;
  width: 100%;
  filter: drop-shadow(0 3px 5px rgb(0 0 0 / 0.95));
  animation: smash-left 1.4s linear var(--wait) both;
}
.fx.palletSmash .half.left {
  clip-path: polygon(0 0, 54% 0, 44% 100%, 0 100%);
}
.fx.palletSmash .half.right {
  clip-path: polygon(54% 0, 100% 0, 100% 100%, 44% 100%);
  animation-name: smash-right;
}
/* nobody kicking it (it breaks under a push, or as he walks on): it splits at once */
.fx.palletSmash.quick,
.fx.palletSmash.quick .half {
  animation-duration: 0.75s;
}
.fx.palletSmash.quick {
  animation-name: none;
}
.fx.palletSmash.quick .half.left {
  animation-name: smash-left-now;
}
.fx.palletSmash.quick .half.right {
  animation-name: smash-right-now;
}
@keyframes smash-shudder {
  0%,
  8% {
    transform: none;
  }
  10% {
    transform: rotate(-7deg) scale(1.08);
  }
  15% {
    transform: rotate(3deg);
  }
  20%,
  28% {
    transform: none;
  }
  30.7% {
    transform: rotate(8deg) scale(1.1);
  }
  36% {
    transform: rotate(-4deg);
  }
  42%,
  50% {
    transform: none;
  }
  51.4% {
    transform: scale(1.12);
  }
  100% {
    transform: none;
  }
}
@keyframes smash-left {
  0%,
  51.4% {
    transform: none;
    opacity: 1;
    animation-timing-function: cubic-bezier(0.2, 0.7, 0.4, 1);
  }
  100% {
    transform: translate(-75%, 25%) rotate(-50deg);
    opacity: 0;
  }
}
@keyframes smash-right {
  0%,
  51.4% {
    transform: none;
    opacity: 1;
    animation-timing-function: cubic-bezier(0.2, 0.7, 0.4, 1);
  }
  100% {
    transform: translate(75%, -20%) rotate(45deg);
    opacity: 0;
  }
}
@keyframes smash-left-now {
  from {
    transform: none;
  }
  to {
    transform: translate(-75%, 25%) rotate(-50deg);
    opacity: 0;
  }
}
@keyframes smash-right-now {
  from {
    transform: none;
  }
  to {
    transform: translate(75%, -20%) rotate(45deg);
    opacity: 0;
  }
}
/* a breakable wall kicked down: it shudders at his kicks (KICKS, as a pallet's) and the last one
   bursts it into four pieces flying off every way; with no kicks (an item, a push) at once */
.fx.wallSmash {
  z-index: 3;
  width: 4.2%;
  aspect-ratio: 1;
  animation: smash-shudder 1.4s linear var(--wait) both;
}
.fx.wallSmash .chunk {
  position: absolute;
  inset: 0;
  width: 100%;
  filter: drop-shadow(0 3px 5px rgb(0 0 0 / 0.95));
  animation: wall-chunk 1.4s linear var(--wait) both;
}
.fx.wallSmash .chunk.q1 {
  clip-path: polygon(0 0, 55% 0, 48% 45%, 0 52%);
  --dx: -80%;
  --dy: -70%;
  --rot: -40deg;
}
.fx.wallSmash .chunk.q2 {
  clip-path: polygon(55% 0, 100% 0, 100% 48%, 48% 45%);
  --dx: 85%;
  --dy: -60%;
  --rot: 35deg;
}
.fx.wallSmash .chunk.q3 {
  clip-path: polygon(0 52%, 48% 45%, 52% 100%, 0 100%);
  --dx: -75%;
  --dy: 75%;
  --rot: 30deg;
}
.fx.wallSmash .chunk.q4 {
  clip-path: polygon(48% 45%, 100% 48%, 100% 100%, 52% 100%);
  --dx: 80%;
  --dy: 70%;
  --rot: -45deg;
}
.fx.wallSmash.quick {
  animation-name: none;
}
.fx.wallSmash.quick .chunk {
  animation: wall-chunk-now 0.75s linear both;
}
@keyframes wall-chunk {
  0%,
  51.4% {
    transform: none;
    opacity: 1;
    animation-timing-function: cubic-bezier(0.2, 0.7, 0.4, 1);
  }
  100% {
    transform: translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(0.85);
    opacity: 0;
  }
}
@keyframes wall-chunk-now {
  from {
    transform: none;
    animation-timing-function: cubic-bezier(0.2, 0.7, 0.4, 1);
  }
  to {
    transform: translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(0.85);
    opacity: 0;
  }
}
/* a pallet slamming down: dust bursting out to both sides of the path (the container turned to
   the way it fell, the puffs thrown either way across it) */
.fx.slamDust {
  z-index: 3;
  width: 1px;
  height: 1px;
  rotate: var(--angle);
}
.fx.slamDust i {
  position: absolute;
  width: 1.7cqw;
  aspect-ratio: 1;
  translate: -50% -50%;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(215 200 175 / 0.85), transparent 70%);
  animation: slam-dust 0.75s ease-out forwards;
}
@keyframes slam-dust {
  from {
    transform: translate(calc((var(--n) - 4.5) * 0.45cqw), 0) scale(0.5);
    opacity: 0.95;
  }
  to {
    transform: translate(calc((var(--n) - 4.5) * 0.9cqw), calc(var(--s) * 3.2cqw)) scale(1.9);
    opacity: 0;
  }
}
/* the icon of a path a pallet now shuts: a glow that comes in and lingers, then goes */
.fx.blocked {
  z-index: 2;
  width: 5.6%;
  aspect-ratio: 1;
  border-radius: 22%;
  border: 2px solid rgb(255 222 130 / 0.95);
  box-shadow:
    0 0 16px rgb(255 200 90 / 0.85),
    inset 0 0 12px rgb(255 200 90 / 0.5);
  animation: blocked 1.7s ease-out forwards;
}
@keyframes blocked {
  0% {
    scale: 1.5;
    opacity: 0;
  }
  14% {
    scale: 1;
    opacity: 1;
  }
  60% {
    opacity: 0.85;
  }
  100% {
    opacity: 0;
  }
}
/* a path's line lighting up all along, at once, then fading (a dash drawn along it lagged: with
   the stroke kept one width however the map scales, its dash lengths no longer matched the line) */
.path-flash {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
  overflow: visible;
  pointer-events: none;
  /* the glow on the whole drawing: on a line itself, a level or upright one has no height or
     width for its filter's region, and the filter cut it away entirely */
  filter: drop-shadow(0 0 5px #ffc94d);
}
.path-flash polyline {
  fill: none;
  stroke: #ffe39a;
  stroke-width: 6px;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  opacity: 0;
  animation: path-flash 1s ease-out forwards;
}
@keyframes path-flash {
  0% {
    opacity: 0;
    stroke-width: 12px;
  }
  12% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    stroke-width: 5px;
  }
}
/* the killer's blow: a slash across the one struck */
.fx.slash {
  z-index: 7;
  width: 7%;
  height: 1.2%;
  rotate: var(--angle);
  border-radius: 50%;
  background: linear-gradient(90deg, transparent, rgb(255 235 235 / 0.95) 45%, rgb(255 40 40 / 0.95) 60%, transparent);
  filter: drop-shadow(0 0 6px rgb(255 0 0 / 0.9));
  animation: slash 0.38s ease-out forwards;
}
@keyframes slash {
  0% {
    clip-path: inset(0 100% 0 0);
    opacity: 1;
  }
  45% {
    clip-path: inset(0 0 0 0);
    opacity: 1;
  }
  100% {
    clip-path: inset(0 0 0 70%);
    opacity: 0;
  }
}
/* the screen's edge going red with the blow */
.fx.vignette {
  z-index: 8;
  width: 100%;
  height: 100%;
  background: radial-gradient(ellipse at center, transparent 50%, rgb(190 0 0 / 0.55) 100%);
  animation: vignette 0.6s ease-out forwards;
}
@keyframes vignette {
  0% {
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
/* sparks off a generator: gold as it is worked on, red as the killer kicks it */
.fx.sparks {
  z-index: 6;
  width: 1px;
  height: 1px;
}
.fx.sparks i {
  position: absolute;
  width: 0.35cqw;
  height: 0.35cqw;
  border-radius: 50%;
  background: #ffe28a;
  box-shadow: 0 0 6px 2px rgb(255 200 80 / 0.9);
  --a: calc(var(--n) * 37deg - 100deg);
  animation: sparks 0.55s cubic-bezier(0.2, 0.8, 0.4, 1) forwards;
}
.fx.sparks.red i {
  background: #ffb0a0;
  box-shadow: 0 0 6px 2px rgb(255 60 30 / 0.95);
}
@keyframes sparks {
  from {
    transform: rotate(var(--a)) translateX(0);
    opacity: 1;
  }
  to {
    transform: rotate(var(--a)) translateX(calc(1.2cqw + var(--n) * 0.25cqw)) translateY(0.8cqw);
    opacity: 0;
  }
}
/* smoke rising from a kicked generator */
.fx.smoke {
  z-index: 6;
  width: 1px;
  height: 1px;
}
.fx.smoke i {
  position: absolute;
  width: 1.8cqw;
  aspect-ratio: 1;
  translate: -50% -50%;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(70 70 70 / 0.7), transparent 70%);
  animation: smoke 1.2s ease-out forwards;
  animation-delay: calc(var(--n) * 90ms);
  opacity: 0;
}
@keyframes smoke {
  from {
    transform: translate(calc((var(--n) - 2.5) * 0.4cqw), 0) scale(0.5);
    opacity: 0.9;
  }
  to {
    transform: translate(calc((var(--n) - 2.5) * 0.9cqw), -3.5cqw) scale(2);
    opacity: 0;
  }
}
/* a friend healed: green rings going out from them */
.fx.ripple {
  z-index: 5;
  width: 5%;
  aspect-ratio: 1;
  border-radius: 50%;
  border: 2px solid rgb(120 255 150 / 0.9);
  box-shadow: 0 0 12px rgb(80 255 120 / 0.7);
  animation: ripple 0.9s ease-out forwards;
}
@keyframes ripple {
  from {
    scale: 0.5;
    opacity: 1;
  }
  to {
    scale: 2.4;
    opacity: 0;
  }
}
/* the light between a healer and the one healed */
.beam-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 5;
  overflow: visible;
  pointer-events: none;
  filter: drop-shadow(0 0 5px rgb(90 255 130 / 0.9));
}
.beam-layer line {
  stroke: #b8ffc8;
  stroke-width: 4px;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
  opacity: 0;
  animation: beam 0.9s ease-out forwards;
}
@keyframes beam {
  0% {
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
/* a chest opened: it heaves open where it stood, and an item's card (its back: what it is stays
   the holder's) rises out of it and fades */
.fx.chestOpen {
  z-index: 6;
  width: 4.6%;
  aspect-ratio: 1;
}
.fx.chestOpen .box {
  position: absolute;
  inset: 0;
  width: 100%;
  filter: drop-shadow(0 3px 5px rgb(0 0 0 / 0.9));
  animation: chest-heave 0.9s ease-out forwards;
}
.fx.chestOpen .item {
  position: absolute;
  left: 22%;
  top: 0;
  width: 56%;
  filter: drop-shadow(0 0 8px rgb(255 230 160 / 0.9));
  opacity: 0;
  animation: item-rise 1.1s cubic-bezier(0.2, 0.7, 0.3, 1) 0.18s forwards;
}
@keyframes chest-heave {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  18% {
    transform: scale(1.12, 0.86);
  }
  38% {
    transform: scale(0.94, 1.1);
  }
  60% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(0.9);
    opacity: 0;
  }
}
@keyframes item-rise {
  0% {
    transform: translateY(20%) scale(0.5) rotate(-8deg);
    opacity: 0;
  }
  25% {
    opacity: 1;
  }
  70% {
    transform: translateY(-120%) scale(1) rotate(4deg);
    opacity: 1;
  }
  100% {
    transform: translateY(-150%) scale(1.05) rotate(0deg);
    opacity: 0;
  }
}
/* a hex totem cleansed: it flares, its skull cracks apart and fades, and embers rise */
.fx.totemOut {
  z-index: 6;
  width: 4.6%;
  aspect-ratio: 1;
}
.fx.totemOut img {
  position: absolute;
  inset: 0;
  width: 100%;
  filter: drop-shadow(0 0 10px rgb(255 120 40 / 0.9));
  animation: totem-left 1s ease-in forwards;
}
.fx.totemOut img + img {
  animation-name: totem-right;
}
.fx.totemOut img:first-child {
  clip-path: polygon(0 0, 52% 0, 46% 40%, 55% 62%, 48% 100%, 0 100%);
}
.fx.totemOut img + img {
  clip-path: polygon(52% 0, 100% 0, 100% 100%, 48% 100%, 55% 62%, 46% 40%);
}
@keyframes totem-left {
  0% {
    transform: none;
    filter: brightness(2.2) drop-shadow(0 0 14px rgb(255 140 40));
  }
  30% {
    transform: none;
    filter: brightness(1.2) drop-shadow(0 0 10px rgb(255 120 40 / 0.9));
  }
  100% {
    transform: translate(-30%, 25%) rotate(-25deg) scale(0.85);
    opacity: 0;
  }
}
@keyframes totem-right {
  0% {
    transform: none;
    filter: brightness(2.2) drop-shadow(0 0 14px rgb(255 140 40));
  }
  30% {
    transform: none;
    filter: brightness(1.2) drop-shadow(0 0 10px rgb(255 120 40 / 0.9));
  }
  100% {
    transform: translate(30%, 25%) rotate(25deg) scale(0.85);
    opacity: 0;
  }
}
.fx.embers {
  z-index: 7;
  width: 1px;
  height: 1px;
}
.fx.embers i {
  position: absolute;
  width: 0.3cqw;
  height: 0.3cqw;
  border-radius: 50%;
  background: #ffcf7a;
  box-shadow: 0 0 6px 2px rgb(255 120 30 / 0.9);
  opacity: 0;
  animation: ember 1.4s ease-out forwards;
  animation-delay: calc(var(--n) * 60ms);
}
@keyframes ember {
  0% {
    transform: translate(calc((var(--n) - 5.5) * 0.35cqw), 0);
    opacity: 1;
  }
  100% {
    transform: translate(calc((var(--n) - 5.5) * 0.6cqw + 0.6cqw), -4.5cqw);
    opacity: 0;
  }
}
/* a hook sabotaged: cold metal sparks */
.fx.sparks.white i {
  background: #f2f6ff;
  box-shadow: 0 0 6px 2px rgb(170 200 255 / 0.9);
}
/* dust where a mini lands or stops */
.fx.dust {
  width: 1px;
  height: 1px;
}
.fx.dust i {
  position: absolute;
  width: 1.3cqw;
  aspect-ratio: 1;
  translate: -50% -50%;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(205 190 165 / 0.75), transparent 70%);
  --a: calc(var(--n) * 60deg);
  animation: dust 0.65s ease-out forwards;
}
@keyframes dust {
  from {
    transform: rotate(var(--a)) translateX(0) scale(0.4);
    opacity: 0.9;
  }
  to {
    transform: rotate(var(--a)) translateX(1.6cqw) scale(1.5);
    opacity: 0;
  }
}
/* crows taking off from their tile, flapping up and away */
.fx.crowFly {
  z-index: 7;
  width: 1px;
  height: 1px;
}
.crow-bird {
  position: absolute;
  width: 3.6cqw;
  translate: -50% -50%;
  fill: #0d0b0e;
  /* black birds on a dark map: a pale rim so they show */
  filter: drop-shadow(0 0 1px rgb(255 255 255 / 0.95)) drop-shadow(0 0 4px rgb(255 255 255 / 0.6));
  opacity: 0;
  animation:
    crow-away 1.4s cubic-bezier(0.3, 0.1, 0.7, 1) forwards,
    crow-flap 0.16s ease-in-out infinite alternate;
  animation-delay: calc(var(--n) * 70ms), 0s;
}
@keyframes crow-away {
  from {
    transform: translate(0, 0) scale(0.6);
    opacity: 1;
  }
  to {
    transform: translate(calc((var(--n) - 2.5) * 5cqw + 3cqw), calc(-9cqw - var(--n) * 1.5cqw)) scale(1.25);
    opacity: 0;
  }
}
@keyframes crow-flap {
  to {
    scale: 1 0.35;
  }
}
/* splinters flying out */
.fx.debris {
  width: 1px;
  height: 1px;
}
.fx.debris i {
  position: absolute;
  width: 0.7cqw;
  height: 0.25cqw;
  background: #8a5a2b;
  box-shadow: 0 0 2px #000;
  animation: debris 0.8s ease-out forwards;
  --a: calc(var(--n) * 45deg);
}
@keyframes debris {
  from {
    transform: rotate(var(--a)) translateX(0) rotate(0);
    opacity: 1;
  }
  to {
    transform: rotate(var(--a)) translateX(4cqw) rotate(220deg);
    opacity: 0;
  }
}
/* a shrinking ring: a trap snapping shut */
.fx.snap {
  width: 6%;
  aspect-ratio: 1;
  border-radius: 50%;
  border: 4px solid #d0d4da;
  box-shadow: 0 0 12px #fff;
  animation: snap 0.5s ease-in forwards;
}
@keyframes snap {
  from {
    transform: scale(1.6);
    opacity: 0.2;
  }
  60% {
    opacity: 1;
  }
  to {
    transform: scale(0.4);
    opacity: 0;
  }
}
/* floating numbers / words */
.fx.float,
.fx.heal {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.7cqw;
  white-space: nowrap;
  color: #fff;
  text-shadow:
    0 0 6px #000,
    0 2px 2px #000;
  animation: float 1.3s ease-out forwards;
}
.fx.gold {
  color: #ffd75e;
}
.fx.red {
  color: #ff5a52;
}
.fx.green,
.fx.heal {
  color: #7dff9b;
}
.fx.heal {
  font-size: 3cqw;
}
@keyframes float {
  0% {
    transform: translateY(20%) scale(0.6);
    opacity: 0;
  }
  15% {
    transform: translateY(0) scale(1.15);
    opacity: 1;
  }
  100% {
    transform: translateY(-160%) scale(1);
    opacity: 0;
  }
}

@keyframes pulse {
  50% {
    opacity: 0.55;
  }
}
@keyframes beat {
  50% {
    scale: 1.22;
  }
}
@media (prefers-reduced-motion: reduce) {
  .room-hit.target,
  button.room-hit.pick,
  .tile.target,
  .tile.act,
  .mini.act,
  .mini::after,
  .tile::after,
  .path-target,
  .tile.flip,
  .mini.focus,
  .path-preview {
    animation: none;
  }
  .fx {
    animation-duration: 0.01s !important;
  }
}
</style>
