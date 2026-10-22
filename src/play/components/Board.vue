<script setup lang="ts">
// The map with everything on it: prop tiles in each room, minis, and the tokens on paths
// (walls, pallets, bear traps, the Entity). Clickable paths, tiles and minis are passed in by
// the parent, which decides what a click means for the current step. Right-click (long-press
// on touch) asks the parent to show details.
//
// The board also animates what the engine reports in the log: minis walk through the path
// they took, tiles flip, and hits, hooks, repairs and breaks get an effect where they happen.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { components } from '../../data'
import { asset } from '../../i18n'
import { boardOf, charlotteRoom, palletOn, pathDef, propsIn, tokenOf, victorRoom } from '../engine/engine'
import type { GameEvent, GameState, Guard, Prop } from '../engine/types'
import { fxSound } from '../fx/audio'
import { holdBoard } from '../fx/bus'
import type { InspectTarget } from '../inspect'
import { preview, type Focus } from '../focus'
import { ANTIDOTE_IMAGE, BEAR_TRAP_IMAGE, GUARD_IMAGE, KNIFE_IMAGE, MADNESS_IMAGE, TONIC_IMAGE, VILE_PURGE_IMAGE, PROP_IMAGE, VICTOR_MINI, killerMini, propPicture, survivorMini } from '../labels'
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
const stayTag = (label?: string) => (label?.includes('Wait') ? ' · WAIT' : label?.includes('อยู่ห้องเดิม') ? ' · อยู่ห้องเดิม' : '')

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

// During setup's reveals the minis aren't on the board yet: their start rooms are rolled after.
const rooms = computed(() => {
  const hidden = new Set(props.hideMinis)
  return board.value.rooms.map((r) => ({
    ...r,
    props: propsIn(props.st, r.id),
    survivors: props.st.startPending ? [] : props.st.survivors.flatMap((sv, i) => (sv.room === r.id && (sv.status === 'board' || sv.status === 'carried') && !hidden.has(`s${i}`) ? [i] : [])),
    // The Twins: Charlotte is the killer's mini; Victor is a second, smaller one
    killer: !props.st.startPending && !hidden.has('k') && charlotteRoom(props.st) === r.id,
    victor: !props.st.startPending && !hidden.has('k') && victorRoom(props.st) === r.id,
    guards: (Object.entries(props.st.guards ?? {}) as [Guard, string | undefined][]).flatMap(([g, room]) => (room === r.id ? [g] : [])),
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
    const row = rowWithGuards(r.box, standing, r.guards.length, r.killer, r.victor)
    for (const s of r.survivors) minis.set(`s${s}`, props.st.survivors[s].status === 'carried' ? carryRect(r.box) : row.survivors[slot++])
    if (r.killer) minis.set('k', miniRect(r.box, 0, true))
    if (r.victor) minis.set('v', victorRect(r.box, r.killer))
    r.guards.forEach((g, i) => minis.set(`g-${g}`, row.guards[i]))
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
    return { ...p, token, target: p.id in props.pathTargets }
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
  for (const room of st.purge ?? []) out.push({ key: `vp-${room}`, room, image: VILE_PURGE_IMAGE, kind: 'purge', title: 'Vile Purge — ผู้รอดชีวิตที่เดินเข้ามาต้องเก็บไปปิด Perk 1 อัน' })
  const a = st.afterpiece ?? {}
  if (a.tonic) out.push({ key: 'ap-tonic', room: a.tonic, image: TONIC_IMAGE, kind: 'tonic', title: 'Afterpiece Tonic — ผู้รอดชีวิตในห้องนี้วางการ์ดหงาย' })
  if (a.antidote) out.push({ key: 'ap-antidote', room: a.antidote, image: ANTIDOTE_IMAGE, kind: 'antidote', title: 'Afterpiece Antidote — ใครเข้าห้องนี้เดินต่อได้อีก 1 ทาง' })
  return out
})

/** What each of The Knight's Guards does, on its mini. */
const GUARD_TITLE: Record<Guard, string> = {
  carnifex: 'Carnifex — เริ่มเก็บกวาด: นำ prop เขียว/น้ำเงินออก แล้วย้ายไปห้องข้าง ๆ',
  assassin: 'Assassin — เดินเข้าห้องนี้ต้องทอย Danger Die (พลาด = บาดเจ็บ)',
  jailer: 'Jailer — Skill Check ในห้องนี้ใช้ Danger Die (พลาด = บาดเจ็บ)',
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

type FxKind = 'blood' | 'spikes' | 'burst' | 'debris' | 'snap' | 'float' | 'heal'
interface Fx {
  id: number
  kind: FxKind
  x: number
  y: number
  text?: string
  tone?: 'gold' | 'red' | 'green' | 'white'
}

const effects = ref<Fx[]>([])
const flipping = ref<string[]>([])
const shaking = ref(false)
const boardEl = ref<HTMLElement>()
let fxId = 0

const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const FX_MS: Record<FxKind, number> = { blood: 1100, spikes: 1600, burst: 1100, debris: 800, snap: 500, float: 1300, heal: 1100 }

function addFx(kind: FxKind, at: [number, number], extra: Partial<Fx> = {}, delay = 0) {
  const show = () => {
    const fx: Fx = { id: ++fxId, kind, x: at[0], y: at[1], ...extra }
    effects.value = [...effects.value, fx]
    window.setTimeout(() => (effects.value = effects.value.filter((f) => f.id !== fx.id)), FX_MS[kind])
  }
  if (delay) window.setTimeout(show, delay)
  else show()
}

function shake() {
  if (reduceMotion) return
  shaking.value = false
  void nextTick(() => {
    shaking.value = true
    window.setTimeout(() => (shaking.value = false), 450)
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

const pathAt = (path: string) => pathDef(props.st, path).at as [number, number]

/** Mini positions at the last render, to animate from. */
let prevMinis = new Map<string, Rect>()
onMounted(() => (prevMinis = new Map(rects.value.minis)))

watch(
  () => props.st.log.length,
  async (len, old) => {
    const from = prevMinis
    prevMinis = new Map(rects.value.minis)
    if (old === undefined || len <= old) return
    const fresh = props.st.log.slice(old).flatMap((e) => (e.ev ? [e.ev] : []))
    await nextTick()
    const walking = walk(fresh, from)
    let delay = 0
    for (const ev of fresh) delay = play(ev, delay)
    // Hits, hooks and repairs need a moment to be seen before the next question pops up.
    const big = fresh.some((e) => ['wound', 'hook', 'genDone', 'gatesPowered', 'rescue', 'trapSprung', 'palletBreak', 'wallBreak'].includes(e.k))
    holdBoard(Math.max(walking, big ? delay + 900 : 0))
  },
)

/** Minis walk from where they were, through the middle of each path they took; returns how long it takes. */
function walk(events: GameEvent[], from: Map<string, Rect>): number {
  let longest = 0
  const moved = new Map<string, string[]>()
  for (const ev of events) if (ev.k === 'move') moved.set(key(ev.who), [...(moved.get(key(ev.who)) ?? []), ev.path])
  for (const [k, now] of rects.value.minis) {
    const was = from.get(k)
    if (!was || (was.x === now.x && was.y === now.y) || reduceMotion) continue
    const el = boardEl.value?.querySelector<HTMLElement>(`[data-mini="${k}"]`)
    if (!el) continue
    // A teleport has no path: straight there.
    const via = (moved.get(k) ?? []).filter(Boolean).map((p) => {
      const [cx, cy] = pathAt(p)
      return { x: cx - now.w / 2, y: cy - (now.w * board.value.aspect) / 2, w: now.w }
    })
    const frames = [was, ...via, now].map((r) => ({ left: pct(r.x), top: pct(r.y) }))
    el.animate(frames, { duration: 380 * (frames.length - 1), easing: 'ease-in-out' })
    // a footstep per path — or the vault's, or going over a pallet
    ;(moved.get(k) ?? []).filter(Boolean).forEach((p, i) => window.setTimeout(() => pathSound(p), 380 * (i + 1)))
    longest = Math.max(longest, 380 * (frames.length - 1))
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
      window.setTimeout(() => (flipping.value = flipping.value.filter((p) => p !== ev.prop)), 800)
      fxSound.flip()
      if (ev.kind === 'crow') fxSound.crow()
      return delay
    case 'wound': {
      const at = whereIs(ev.s)
      if (at) addFx('blood', at, {}, delay)
      if (ev.by === 'attack') {
        shake()
        fxSound.hit()
      }
      return delay + 150
    }
    case 'trapSprung':
      addFx('snap', pathAt(ev.path), {}, delay)
      fxSound.snap()
      return delay + 150
    case 'hook': {
      const t = rects.value.tiles.get(ev.prop)
      if (t) addFx('spikes', centre(t), {}, delay)
      fxSound.hook()
      shake()
      return delay + 300
    }
    case 'rescue': {
      const at = whereIs(ev.s)
      if (at) addFx('burst', at, { tone: 'white' }, delay)
      return delay
    }
    case 'heal': {
      const at = whereIs(ev.s)
      if (at) addFx('heal', at, { text: '✚' }, delay)
      return delay
    }
    case 'repair':
      if (ev.add > 0) addFx('float', roomCentre(props.st.props.find((p) => p.id === ev.prop)!.room!), { text: `⚡ +${ev.add}`, tone: 'gold' }, delay)
      return delay + 100
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
      if (ev.progress >= 3) fxSound.gateOpen()
      else fxSound.lever()
      return delay
    }
    case 'palletBreak':
    case 'wallBreak':
      addFx('debris', pathAt(ev.path), {}, delay)
      fxSound.palletBreak()
      shake()
      return delay
    case 'palletDrop':
      addFx('debris', pathAt(ev.path), {}, delay)
      fxSound.palletDrop()
      return delay
    case 'pickUp':
      fxSound.pickUp()
      return delay
    case 'touch':
      switch (ev.what) {
        case 'lockerIn':
          fxSound.lockerIn()
          break
        case 'lockerOut':
          fxSound.lockerOut()
          break
        case 'lockerSearch':
          fxSound.lockerSearch()
          break
        case 'crow':
          fxSound.crowTouch()
          break
        case 'crowDestroy':
          fxSound.crowDestroy()
          break
        case 'sabotage':
          fxSound.sabotage()
          break
        case 'totem':
          fxSound.totemTouch()
          break
      }
      return delay
    case 'cleanse':
      fxSound.cleanse()
      return delay
    case 'phantasmSet':
      addFx('float', roomCentre(ev.room), { text: '👻', tone: 'white' }, delay)
      fxSound.snap()
      return delay
    case 'madness': {
      const at = whereIs(ev.s)
      if (at) addFx('float', at, { text: ev.on ? 'Madness!' : 'หาย Madness', tone: ev.on ? 'red' : 'green' }, delay)
      return delay + 100
    }
    case 'trapSet':
      addFx('snap', pathAt(ev.path), {}, delay)
      fxSound.snap()
      return delay
    case 'damage': {
      const t = rects.value.tiles.get(ev.prop)
      if (t) addFx('float', centre(t), { text: '⚡ 0', tone: 'red' }, delay)
      fxSound.damage()
      return delay
    }
    case 'bp': {
      const at = whereIs(ev.who)
      if (at) addFx('float', [at[0], at[1] - 0.03], { text: `+${ev.n} ▲`, tone: ev.who === 'killer' ? 'red' : 'white' }, delay)
      window.setTimeout(() => fxSound.bp(), delay)
      return delay + 120
    }
    case 'carryEscape': {
      const at = whereIs(ev.s)
      if (at) addFx('float', at, { text: 'หลุด!', tone: 'green' }, delay)
      return delay
    }
    default:
      return delay
  }
}

// ---------- details on right-click / long-press ----------

let pressTimer: number | undefined
let pressed = false

function pressStart(e: PointerEvent, target: InspectTarget) {
  if (e.pointerType !== 'touch') return
  pressed = false
  clearTimeout(pressTimer)
  pressTimer = window.setTimeout(() => {
    pressed = true
    emit('inspect', target)
  }, 550)
}

function pressEnd() {
  clearTimeout(pressTimer)
}

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
    const r = boardEl.value.getBoundingClientRect()
    sendPing((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
  }
}
</script>

<template>
  <div ref="boardEl" class="board" :class="{ shake: shaking, pinging: pingArmed && canPing }" :style="{ aspectRatio: String(board.aspect) }" @click.capture="guard">
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
        <img v-if="st.survivors[s].madness" class="madness-tag" :src="asset(MADNESS_IMAGE)" alt="Madness" title="Madness: ทอย Danger Die แทน Skill Check" draggable="false" />
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
      <!-- The Knight's Guards: minis of their own, beside the killer's corner -->
      <div
        v-for="g in r.guards"
        :key="g"
        :data-mini="`g-${g}`"
        class="mini guard"
        :style="rectStyle(rects.minis.get(`g-${g}`)!)"
        :title="GUARD_TITLE[g]"
      >
        <img :src="asset(GUARD_IMAGE[g])" :alt="g" draggable="false" />
      </div>
    </template>

    <!-- killer tokens in a room: tiles after the props, the same size -->
    <img v-for="t in roomTokens" :key="t.key" class="room-token" :class="t.kind" :style="rectStyle(rects.tokens.get(t.key)!)" :src="asset(t.image)" :alt="t.title" :title="t.title" />

    <template v-for="p in paths" :key="p.id">
      <img v-if="p.token" class="path-token" :style="{ left: pct(p.at[0]), top: pct(p.at[1]) }" :src="asset(p.token)" alt="" />
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

    <div v-for="f in effects" :key="f.id" class="fx" :class="[f.kind, f.tone]" :style="{ left: pct(f.x), top: pct(f.y) }">
      <span v-if="f.text"><BpText :text="f.text" /></span>
      <template v-if="f.kind === 'spikes'"><i v-for="n in 7" :key="n" :style="{ '--n': n }" /></template>
      <template v-if="f.kind === 'debris'"><i v-for="n in 8" :key="n" :style="{ '--n': n }" /></template>
    </div>
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
  transition: transform 0.15s ease;
}
/* pointing at a revealed prop brings it up to look at (it grows from its centre, so the
   pointer stays on it) */
.tile:not(.down):hover {
  z-index: 6;
  transform: scale(1.6);
  animation: none;
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
/* the tile grows on hover: the portrait rides along, so it is still readable */
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
.mini.guard {
  box-shadow:
    0 0 0 2px #b8332b,
    0 0 0 4px rgb(0 0 0 / 0.7),
    0 0 10px 3px rgb(200 40 30 / 0.55);
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
.mini.act,
.tile.act {
  box-shadow:
    0 0 0 3px #ff8a3d,
    0 0 18px 5px rgb(255 120 40 / 0.75);
  animation: pulse 1.2s ease-in-out infinite;
}
.mini.act:hover {
  transform: scale(1.15);
  animation: none;
}
.tile.act:hover {
  z-index: 6;
  transform: scale(1.6);
  animation: none;
}

.path-token {
  position: absolute;
  width: 4.2%;
  translate: -50% -50%;
  pointer-events: none;
  filter: drop-shadow(0 3px 5px rgb(0 0 0 / 0.95));
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
.mini.focus {
  box-shadow:
    0 0 0 3px #c9a6ff,
    0 0 18px 6px rgb(170 110 255 / 0.75);
  animation: focus-pulse 1.1s ease-in-out infinite;
}
.mini.killer.focus {
  box-shadow:
    0 0 0 3px #ff5a52,
    0 0 20px 7px rgb(255 40 40 / 0.75);
}
.mini.hot {
  transform: scale(1.25);
  z-index: 5;
}
@keyframes focus-pulse {
  50% {
    filter: drop-shadow(0 0 10px rgb(200 160 255 / 0.9)) brightness(1.15);
  }
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
