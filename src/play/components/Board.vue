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
import { boardOf, palletOn, pathDef, propsIn } from '../engine/engine'
import type { GameEvent, GameState, Prop } from '../engine/types'
import { fxSound } from '../fx/audio'
import { holdBoard } from '../fx/bus'
import type { InspectTarget } from '../inspect'
import { preview, type Focus } from '../focus'
import { BEAR_TRAP_IMAGE, PROP_IMAGE, killerMini, survivorMini } from '../labels'
import Mini from './Mini.vue'

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
}>()
const emit = defineEmits<{ path: [id: string]; prop: [id: string]; interact: [key: string]; room: [id: string]; inspect: [target: InspectTarget] }>()

const roomTarget = (room: string) => !!props.roomTargets && room in props.roomTargets

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

function miniRect(box: number[], i: number, killer = false): Rect {
  const [x, y, w, h] = box
  return { x: x + w * (killer ? 0.78 : 0.03 + i * (MINI + 0.02)), y: y + h * 0.2, w: w * (killer ? MINI * 1.25 : MINI) }
}

const rectStyle = (r: Rect) => ({ left: pct(r.x), top: pct(r.y), width: pct(r.w) })

/** Centre of a rect as board fractions (a square: its height is w × aspect of the height). */
function centre(r: Rect): [number, number] {
  return [r.x + r.w / 2, r.y + (r.w * board.value.aspect) / 2]
}

function propImage(p: Prop): string {
  return p.revealed ? PROP_IMAGE[p.kind] : `assets/props/back-${p.category}.webp`
}

const rooms = computed(() =>
  board.value.rooms.map((r) => ({
    ...r,
    props: propsIn(props.st, r.id),
    survivors: props.st.survivors.flatMap((sv, i) => (sv.room === r.id && (sv.status === 'board' || sv.status === 'carried') ? [i] : [])),
    killer: props.st.killer.room === r.id,
  })),
)

/** Where every piece is now: minis by key ("k", "s0"…) and prop tiles by id. */
const rects = computed(() => {
  const minis = new Map<string, Rect>()
  const tiles = new Map<string, Rect>()
  for (const r of rooms.value) {
    r.props.forEach((p, i) => tiles.set(p.id, tileRect(r.box, i, r.props.length)))
    r.survivors.forEach((s, i) => minis.set(`s${s}`, miniRect(r.box, i)))
    if (r.killer) minis.set('k', miniRect(r.box, 0, true))
  }
  return { minis, tiles }
})

const paths = computed(() =>
  board.value.paths.map((p) => {
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
            : null
    return { ...p, token, target: p.id in props.pathTargets }
  }),
)

const PHANTASM_IMAGE = 'assets/killers/tokens/hag-phantasm-trap.webp'

function phantasmStyle(room: string) {
  const [x, y, w, h] = board.value.rooms.find((r) => r.id === room)!.box
  return { left: pct(x + w * 0.8), top: pct(y + h * 0.58), width: pct(w * 0.17) }
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
const hotPaths = computed(() => new Set(preview.value?.paths ?? []))
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
    via.forEach((_, i) => window.setTimeout(() => fxSound.step(), 380 * (i + 1)))
    longest = Math.max(longest, 380 * (frames.length - 1))
  }
  return longest
}

const key = (who: number | 'killer') => (who === 'killer' ? 'k' : `s${who}`)

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
  }
}
</script>

<template>
  <div ref="boardEl" class="board" :class="{ shake: shaking }" :style="{ aspectRatio: String(board.aspect) }" @click.capture="guard">
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
    />

    <template v-if="litRooms">
      <div
        v-for="r in rooms"
        :key="`f-${r.id}`"
        class="room-focus"
        :class="{ dim: !litRooms.has(r.id), dest: focus!.dests.includes(r.id), hot: hotDests.has(r.id) }"
        :style="{ left: pct(r.box[0]), top: pct(r.box[1]), width: pct(r.box[2]), height: pct(r.box[3]) }"
      />
    </template>

    <template v-for="r in rooms" :key="`c-${r.id}`">
      <component
        :is="propTargets.includes(p.id) || canAct(p.id) || roomTarget(r.id) ? 'button' : 'div'"
        v-for="(p, i) in r.props"
        :key="p.id"
        class="tile"
        :data-prop="p.id"
        :class="[p.category, { down: !p.revealed, target: propTargets.includes(p.id), act: canAct(p.id), picked: picked?.includes(p.id), flip: flipping.includes(p.id) }]"
        :style="rectStyle(tileRect(r.box, i, r.props.length))"
        :title="p.revealed ? (interactTargets[p.id] ?? 'คลิกขวาดูรายละเอียด') : `เปิด prop สี${CATEGORY_TH[p.category]}`"
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
        />
        <span v-if="p.occupant !== null && p.kind === 'locker'" class="occupant-tag">ซ่อน</span>
      </component>
      <component
        :is="canAct(`s:${s}`) || roomTarget(r.id) ? 'button' : 'div'"
        v-for="(s, i) in r.survivors"
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
        }"
        :style="rectStyle(miniRect(r.box, i))"
        :title="interactTargets[`s:${s}`] ?? st.survivors[s].name"
        @click="clickPiece(`s:${s}`, r.id)"
        @contextmenu.prevent="emit('inspect', { k: 'survivor', s })"
        @pointerdown="pressStart($event, { k: 'survivor', s })"
        @pointerup="pressEnd"
        @pointerleave="pressEnd"
      >
        <img :src="asset(survivorMini(st, s))" :alt="st.survivors[s].name" draggable="false" />
      </component>
      <component
        :is="canAct('killer') || roomTarget(r.id) ? 'button' : 'div'"
        v-if="r.killer"
        data-mini="k"
        class="mini killer"
        :class="{ act: canAct('killer'), focus: focus?.killer }"
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
    </template>

    <img
      v-for="room in st.phantasm"
      :key="`ph-${room}`"
      class="phantasm"
      :style="phantasmStyle(room)"
      :src="asset(PHANTASM_IMAGE)"
      alt="Phantasm Trap"
      title="Phantasm Trap"
    />

    <template v-for="p in paths" :key="p.id">
      <img v-if="p.token" class="path-token" :style="{ left: pct(p.at[0]), top: pct(p.at[1]) }" :src="asset(p.token)" alt="" />
      <span
        v-if="focus?.paths.includes(p.id) || hotPaths.has(p.id)"
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
      <span v-if="f.text">{{ f.text }}</span>
      <template v-if="f.kind === 'spikes'"><i v-for="n in 7" :key="n" :style="{ '--n': n }" /></template>
      <template v-if="f.kind === 'debris'"><i v-for="n in 8" :key="n" :style="{ '--n': n }" /></template>
    </div>
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
/* a room to click: a power or perk aimed at it */
button.room-hit.pick {
  pointer-events: auto;
  cursor: pointer;
  border: 3px solid #ff8a3d;
  background: rgb(255 138 61 / 0.1);
  box-shadow:
    0 0 0 2px rgb(0 0 0 / 0.6),
    0 0 26px 4px rgb(255 120 40 / 0.6);
  animation: pulse 1.4s ease-in-out infinite;
}
button.room-hit.pick:hover:not(:disabled) {
  background: rgb(255 138 61 / 0.25);
  border-color: #fff;
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
.tile.picked {
  box-shadow:
    0 0 0 3px var(--ok),
    0 0 18px 4px rgb(79 179 106 / 0.8);
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
/* someone on the tile: their mini, big and ringed, over the hook or locker */
.occupant {
  inset: -8%;
  width: 116%;
  height: 116%;
  border-radius: 50%;
  box-shadow:
    0 0 0 2px #f2efe6,
    0 0 0 4px rgb(0 0 0 / 0.65);
}
.occupant.hiding {
  box-shadow:
    0 0 0 3px #7fc8ff,
    0 0 0 5px rgb(0 0 0 / 0.65),
    0 0 14px 4px rgb(90 170 255 / 0.7);
}
.occupant.hiding.wounded {
  box-shadow:
    0 0 0 3px var(--blood-bright),
    0 0 0 5px rgb(0 0 0 / 0.65),
    0 0 14px 4px rgb(90 170 255 / 0.7);
}
.occupant.hooked {
  box-shadow:
    0 0 0 3px var(--blood-bright),
    0 0 0 5px rgb(0 0 0 / 0.65),
    0 0 16px 5px rgb(255 30 30 / 0.85);
}
.occupant-tag {
  position: absolute;
  left: 50%;
  bottom: -22%;
  translate: -50% 0;
  padding: 0.05em 0.4em;
  border-radius: 99px;
  background: #1b4d77;
  color: #e6f4ff;
  font-size: 0.95cqw;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
  pointer-events: none;
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
/* every survivor wears a light ring (red when wounded), so minis stand out from the room art */
.mini.survivor {
  box-shadow:
    0 0 0 2px #f2efe6,
    0 0 0 4px rgb(0 0 0 / 0.65);
}
.mini.survivor.wounded {
  box-shadow:
    0 0 0 3px var(--blood-bright),
    0 0 0 5px rgb(0 0 0 / 0.65);
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
    0 0 0 3px var(--blood-bright),
    0 0 0 5px rgb(0 0 0 / 0.7),
    0 0 22px 6px rgb(255 200 90 / 0.9);
}
@keyframes turn-glow {
  50% {
    filter: drop-shadow(0 0 10px rgb(255 214 140 / 0.9)) brightness(1.12);
  }
}
.mini.survivor.carried {
  transform: translate(25%, -25%) rotate(-25deg);
}
.mini.killer {
  box-shadow:
    0 0 0 3px #ff4a3d,
    0 0 0 5px rgb(0 0 0 / 0.7),
    0 0 18px 5px rgb(255 30 30 / 0.7);
  filter: drop-shadow(0 0 8px rgb(255 30 30 / 0.85));
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
  animation: pulse 1.2s ease-in-out infinite;
}
.path-target:hover:not(:disabled) {
  background: rgb(255 214 140 / 0.35);
  border-color: #fff;
}

.phantasm {
  position: absolute;
  z-index: 2;
  pointer-events: none;
  filter: drop-shadow(0 0 8px rgb(160 255 200 / 0.8));
  animation: haunt 2.4s ease-in-out infinite;
}
@keyframes haunt {
  50% {
    transform: translateY(-6%);
    opacity: 0.75;
  }
}
/* Madness: a crackling purple-green ring */
.mini.survivor[data-madness] {
  outline: 3px dotted #9cff6b;
  outline-offset: 2px;
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
@media (prefers-reduced-motion: reduce) {
  .room-hit.target,
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
