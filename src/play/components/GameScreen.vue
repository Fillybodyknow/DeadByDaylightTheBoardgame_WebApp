<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { muted, sfx, startHeartbeat, stopHeartbeat } from '../../sound'
import { isGreat, PROGRESS_MAX, succeeded, touchingPaths } from '../engine/engine'
import type { Die, GameState, ItemUse, LogEntry, MoveCard, RollContext } from '../engine/types'
import { clearFx, flash, fx, showBanner, showDice, showPerk, type DiceShow, type SkillVerdict } from '../fx/bus'
import { canUndo, dispatch, myTurn, online, quitGame, undo } from '../game'
import { actorsOf } from '../engine/seats'
import { closeOnlineGame, isHost, leaveRoom, session } from '../online/session'
import type { InspectTarget } from '../inspect'
import { decisionFocus } from '../focus'
import { boardActions, boardTargets, powerMode as isPowerMode, type BoardAction, type BoardModes } from '../boardActions'
import { BEAR_TRAP_IMAGE, PHASE_TH, PROP_IMAGE, ROLL_TITLE, killerMini, playerOf, survivorMini } from '../labels'
import ActionPanel from './ActionPanel.vue'
import BannerHost from './BannerHost.vue'
import Board from './Board.vue'
import ChoiceMenu from './ChoiceMenu.vue'
import DetailModal from './DetailModal.vue'
import DiceModal from './DiceModal.vue'
import EndSummary from './EndSummary.vue'
import GameLog from './GameLog.vue'
import PerkPrompt from './PerkPrompt.vue'
import PerkReveal from './PerkReveal.vue'
import Planning from './Planning.vue'
import RoundSummary from './RoundSummary.vue'
import StatusPanel from './StatusPanel.vue'
import SyncBadge from './SyncBadge.vue'

const props = defineProps<{ st: GameState }>()

// ---------- what the screen shows ----------
// The engine resolves an action at once. While that action's perk cards and dice play, the
// screen keeps showing the state from before it, so a result never shows before its roll; then
// it shows the new state and the board animates what happened.

const view = shallowRef<GameState>(props.st)

/** The dice of a roll that waited for a decision, already shown on screen. */
let pendingShown: string | null = null

watch(
  () => props.st,
  (st, prev) => {
    if (!prev || st.log.length < prev.log.length) {
      // Undo: show it straight away.
      clearFx()
      view.value = st
      return
    }
    const fresh = st.log.slice(prev.log.length)
    for (const [n, e] of fresh.entries()) {
      const ev = e.ev
      if (ev?.k === 'item') {
        const said = fresh.slice(n + 1).find((x) => x.text && x.who === ev.s)
        showPerk({ item: ev.item, owner: ev.s, detail: said?.text.replace(`${st.survivors[ev.s].name} `, '') ?? '' })
      }
      // The perk's card, big: the log line after "—" says what it did.
      if (ev?.k === 'perk') showPerk({ perk: ev.perk, owner: ev.who, detail: e.text.split(' — ').slice(1).join(' — ') })
      // A roll already shown while it waited for a decision, and kept as it was, isn't shown twice.
      if (e.dice && ev?.k === 'roll' && JSON.stringify(e.dice) !== pendingShown)
        showDice({
          dice: e.dice,
          title: st.survivors[ev.s].name,
          ...diceResult(ev.ctx, e.dice),
          ...skillCheck(ev.ctx, e.dice, rollProgress(prev, ev.ctx, ev.prop, fresh.slice(n + 1))),
          icon: rollIcon(st, ev.ctx, ev.s, ev.target),
        })
    }
    // A roll waiting on a decision (Iron Will, a key, Bond): roll it on screen first, then ask.
    const step = st.step
    if (step.t === 'roll') {
      const sig = JSON.stringify(step.dice)
      if (sig !== pendingShown) {
        pendingShown = sig
        const res = step.keep ? { outcome: 'Bond — เลือกเก็บ 1 ลูก', tone: 'good' as const } : diceResult(step.ctx.k, step.dice)
        showDice({
          dice: step.dice,
          title: st.survivors[step.ctx.s].name,
          outcome: `${res.outcome} — รอการตัดสินใจ`,
          tone: res.tone,
          ...skillCheck(step.ctx.k, step.dice, rollProgress(st, step.ctx.k, 'prop' in step.ctx ? step.ctx.prop : undefined, [])),
          icon: rollIcon(st, step.ctx.k, step.ctx.s, 'target' in step.ctx ? step.ctx.target : undefined),
        })
      }
    } else if (prev.step.t !== 'roll') pendingShown = null
    if (!fx.perks.length && !fx.dice.length) view.value = st
  },
)

watch(
  () => fx.perks.length + fx.dice.length,
  (n) => {
    if (n === 0) view.value = props.st
  },
)

// ---------- board targets ----------

/** The killer chose "use power": the power's targets are now on the board. */
const powerOn = ref(false)
/** Bear trap placement when the supply is empty: the path picked, waiting for which trap to move. */
const trapPath = ref<string | null>(null)
/** The Hillbilly picked the card to discard for the chainsaw (in the panel). */
const powerCard = ref<MoveCard | null>(null)
/** A survivor clicked a pallet: the paths to drop it on are now the board targets. */
const palletMode = ref<string | null>(null)
/** Map / Rainbow Map: survivor picking up to 3 face-down tiles. */
const revealing = ref<{ s: number; props: string[] } | null>(null)
/** Calm Spirit: the crow to send to another room. */
const calmCrow = ref<string | null>(null)
/** Ace in the Hole: the prop in Ace's room, waiting for the one to swap with. */
const aceFirst = ref<string | null>(null)
/** A survivor's item whose target is being picked on the board. */
const itemPick = ref<number | null>(null)

const modes: BoardModes = { powerOn, trapPath, palletMode, revealing, calmCrow, aceFirst, itemPick }

watch(
  () => view.value.step,
  () => {
    powerOn.value = false
    trapPath.value = null
    powerCard.value = null
    palletMode.value = null
    calmCrow.value = null
    aceFirst.value = null
    itemPick.value = null
  },
)

/** Choosing where the power goes: after "use power", or Territorial Imperative's extra use. */
const powerMode = computed(() => isPowerMode(view.value, modes))

/** While a perk or power is being decided, the board points at who and where. */
const boardFocus = computed(() => decisionFocus(view.value, powerMode.value)?.focus ?? null)

/** Everything clickable on the board now, and the shapes the board takes them in. */
const actions = computed(() => boardActions(view.value, modes))
// Online, only the player the game waits on gets clickable targets.
const targets = computed(() => (myTurn.value ? boardTargets(actions.value) : boardTargets([])))

/** Online: who the game is waiting on, for the side panel. */
const waitingOn = computed(() => {
  const o = online.value
  if (!o || myTurn.value) return null
  const st = view.value
  const names = actorsOf(st).map((p) => {
    const seat = session.data?.seats[String(p)]
    const chars = p === 1 ? [st.killer.name] : st.survivors.filter((_, i) => st.handPlayers[st.survivors[i].hand] === p).map((sv) => sv.name)
    return `ผู้เล่น ${p}${seat ? ` (${seat.name})` : ''} — ${chars.join(' + ')}`
  })
  return names
})

/** Several actions on one spot: a small menu at the click. */
const menu = ref<{ actions: BoardAction[]; x: number; y: number } | null>(null)
let pointer = { x: 0, y: 0 }

function onSpot(key: string) {
  const found = actions.value.filter((a) => a.key === key)
  if (found.length === 1) found[0].run()
  else if (found.length > 1) menu.value = { actions: found, x: pointer.x + 8, y: pointer.y + 8 }
}

const onPath = (id: string) => onSpot(`path:${id}`)
const onProp = (id: string) => onSpot(`prop:${id}`)
const onRoom = (id: string) => onSpot(`room:${id}`)
const onInteract = (key: string) => onSpot(key.startsWith('s:') || key === 'killer' ? key : `prop:${key}`)

/** The mode the board is in, for the bar above it (with a way out). */
const modeBar = computed(() => {
  if (palletMode.value) return { text: 'เลือกเส้นทางที่เชื่อมกับห้องเพื่อทิ้ง Pallet (คลิกวงบนแผนที่)', cancel: () => (palletMode.value = null) }
  if (calmCrow.value) return { text: 'Calm Spirit: คลิกห้องที่จะส่ง Crow ไป', cancel: () => (calmCrow.value = null) }
  if (aceFirst.value) return { text: 'Ace in the Hole: คลิก prop ในห้องติดกันที่จะสลับด้วย', cancel: () => (aceFirst.value = null) }
  if (trapPath.value) return { text: 'Bear Trap หมดมือ: คลิก Bear Trap บนแผนที่ที่จะย้ายมา', cancel: () => (trapPath.value = null) }
  if (itemPick.value !== null) return { text: 'เลือกเป้าหมายของ item บนแผนที่', cancel: () => (itemPick.value = null) }
  return null
})

function trackPointer(e: PointerEvent) {
  pointer = { x: e.clientX, y: e.clientY }
}

function onUse(s: number, use: ItemUse) {
  if (use.k === 'reveal') {
    revealing.value = { s, props: [] }
    return
  }
  if (dispatch({ t: 'useItem', s, use })) sfx.select()
}

function confirmReveal() {
  const r = revealing.value
  if (r && dispatch({ t: 'useItem', s: r.s, use: { k: 'reveal', props: r.props } })) sfx.entity()
  revealing.value = null
}

// ---------- dice, flashes and summaries from the log ----------


/** Where each die's skill-check needle lands. Struggling free and danger dice count only a great. */
function skillCheck(ctx: RollContext['k'], dice: Die[], progress?: DiceShow['progress']): Pick<DiceShow, 'verdicts' | 'greatOnly' | 'action' | 'progress'> {
  const greatOnly = ctx === 'carry' || dice.every((d) => d.kind === 'danger')
  const verdicts = dice.map((d): SkillVerdict => (isGreat(d) ? 'great' : succeeded(d) && (!greatOnly || d.asSuccess) ? 'good' : 'fail'))
  return { verdicts, greatOnly, action: ROLL_TITLE[ctx], progress }
}

/** The icon in the middle of the skill check: what the survivor is working on, or up against. */
function rollIcon(st: GameState, ctx: RollContext['k'], s: number, target: number | undefined): DiceShow['icon'] {
  switch (ctx) {
    case 'repair':
      return { src: PROP_IMAGE.generator, round: false }
    case 'openGate':
      return { src: PROP_IMAGE.exitGate, round: false }
    case 'cleanse':
      return { src: PROP_IMAGE.totem, round: false }
    case 'search':
      return { src: PROP_IMAGE.locker, round: false }
    case 'trap':
      return { src: BEAR_TRAP_IMAGE, round: false }
    case 'heal':
    case 'botany':
      return { src: survivorMini(st, target ?? s), round: true }
    case 'selfCare':
      return { src: survivorMini(st, s), round: true }
    default:
      // struggling, a hatchet, a phantasm trap, Overwhelming Presence: the killer
      return { src: killerMini(st), round: true }
  }
}

/**
 * The progress bar under a roll on a generator or an exit gate: from the event right after the
 * roll when it moved, otherwise as it stood before.
 */
function rollProgress(before: GameState, ctx: RollContext['k'], prop: string | undefined, after: LogEntry[]): DiceShow['progress'] {
  if (ctx !== 'repair' && ctx !== 'openGate') return undefined
  const nextRoll = after.findIndex((e) => e.ev?.k === 'roll')
  const next = nextRoll === -1 ? after : after.slice(0, nextRoll)
  const ev = next.find((e) => e.ev?.k === 'repair' || e.ev?.k === 'gate')?.ev
  if (ev?.k === 'repair') return { before: ev.progress - ev.add, after: ev.progress, max: PROGRESS_MAX }
  if (ev?.k === 'gate') return { before: ev.progress - 1, after: ev.progress, max: PROGRESS_MAX }
  const p = prop ? before.props.find((x) => x.id === prop) : undefined
  return p ? { before: p.progress, after: p.progress, max: PROGRESS_MAX } : undefined
}

function diceResult(ctx: RollContext['k'], dice: Die[]): Pick<DiceShow, 'outcome' | 'tone'> {
  const fail = !succeeded(dice[0])
  const great = isGreat(dice[0])
  switch (ctx) {
    case 'repair':
      return fail ? { outcome: 'พลาด! +0', tone: 'bad' } : great ? { outcome: 'ซ่อม +2!', tone: 'great' } : { outcome: 'ซ่อม +1', tone: 'good' }
    case 'openGate':
      return fail ? { outcome: 'พลาด!', tone: 'bad' } : { outcome: 'ประตู +1', tone: great ? 'great' : 'good' }
    case 'cleanse':
      return fail ? { outcome: 'ชำระไม่สำเร็จ', tone: 'bad' } : { outcome: 'ชำระสำเร็จ! +2 ▲', tone: great ? 'great' : 'good' }
    case 'heal':
      return fail ? { outcome: 'รักษาไม่สำเร็จ', tone: 'bad' } : { outcome: 'หายบาดเจ็บ!', tone: great ? 'great' : 'good' }
    case 'trap':
      return fail ? { outcome: 'ติดกับดัก!', tone: 'bad' } : { outcome: 'รอดจากกับดัก', tone: 'great' }
    case 'search':
      return fail ? { outcome: 'ถูกลากออกมา!', tone: 'bad' } : { outcome: 'รอด! Locker พัง', tone: great ? 'great' : 'good' }
    case 'carry':
      return dice.some(isGreat) ? { outcome: 'ดิ้นหลุด!', tone: 'great' } : { outcome: `หลุดไม่ได้ — แบกได้ ${dice.length} ช่อง`, tone: 'bad' }
    case 'hatchet':
      return fail ? { outcome: 'โดน Hatchet!', tone: 'bad' } : { outcome: 'หลบได้!', tone: 'great' }
    case 'botany':
    case 'selfCare':
      return fail ? { outcome: 'ไม่สำเร็จ', tone: 'bad' } : { outcome: 'หายบาดเจ็บ!', tone: 'great' }
    case 'phantasm': {
      const face = dice[0].face
      return face === 0 ? { outcome: 'ได้ 0 — Hag วาร์ปมาฟรี!', tone: 'bad' } : { outcome: `ได้ ${face} — Hag รับ ${face} ▲ หรือจ่าย ${face} ▲ เพื่อวาร์ป`, tone: face >= 4 ? 'great' : 'good' }
    }
    case 'overwhelm':
      return fail ? { outcome: 'item เสียเปล่า!', tone: 'bad' } : { outcome: 'ใช้ item ได้', tone: 'great' }
  }
}

/** The round whose summary is open (shown after cleanup). */
const summaryRound = ref<number | null>(null)

watch(
  () => view.value.log.length,
  (len, old) => {
    if (old === undefined || len <= old) return
    for (const e of view.value.log.slice(old)) {
      const ev = e.ev
      if (ev?.k === 'hook') flash('red')
      if (ev?.k === 'gatesPowered') {
        flash('gold')
        showBanner({ title: 'Exit Gate มีไฟแล้ว!', sub: 'ซ่อม Generator ครบ 4 เครื่อง — ไปเปิดประตู', tone: 'game' })
      }
      if (ev?.k === 'round' && ev.round > 1) summaryRound.value = ev.round - 1
    }
  },
)

// ---------- phase / turn banners ----------

const turnSignature = computed(() => `${view.value.phase}|${view.value.activeSurvivor}|${view.value.killer.revealedCount}|${view.value.round}`)

watch(turnSignature, (now, before) => {
  const st = view.value
  const [phase, active, revealed] = now.split('|')
  const [prevPhase, prevActive, prevRevealed] = (before ?? '').split('|')
  if (phase === 'planning' && prevPhase !== 'planning') showBanner({ title: `รอบ ${st.round}`, sub: 'วางแผน — เลือกการ์ดเคลื่อนที่', tone: 'game' }, { replace: true })
  if (phase === 'survivors' && active !== 'null' && active !== prevActive) {
    const s = Number(active)
    showBanner({
      title: `ตาของ ${st.survivors[s].name}`,
      sub: `${prevPhase !== 'survivors' ? 'ผู้รอดชีวิตเล่น · ' : ''}ผู้เล่น ${playerOf(st, s)}`,
      tone: 'survivor',
      image: survivorMini(st, s),
    }, { replace: true })
  }
  if (phase === 'killer' && revealed !== prevRevealed && Number(revealed) > 0) {
    const turn = Number(revealed)
    showBanner({
      title: turn === 1 ? `${st.killer.name} ออกล่า` : turn === 3 ? 'Bonus Turn' : `เทิร์นที่ ${turn}`,
      sub: turn === 1 ? 'ฆาตกรเล่น · ผู้เล่น 1' : `${st.killer.name} · ผู้เล่น 1`,
      tone: 'killer',
      image: killerMini(st),
    }, { replace: true })
  }
})

// ---------- terror radius ----------

/** 2 = the killer is in the room, 1 = in a connected room, 0 = out of range. */
const terror = computed(() => {
  const st = view.value
  if (st.phase === 'over') return 0
  const k = st.killer.room
  const near = new Set(touchingPaths(st, k).flatMap((p) => [p.a, p.b]))
  const level = (room: string) => (room === k ? 2 : near.has(room) ? 1 : 0)
  const subjects =
    st.phase === 'survivors' && st.activeSurvivor !== null
      ? [st.activeSurvivor]
      : st.phase === 'killer'
        ? st.survivors.flatMap((sv, i) => (sv.status === 'board' || sv.status === 'locker' ? [i] : []))
        : []
  return Math.max(0, ...subjects.map((s) => level(st.survivors[s].room)))
})

const terrorBpm = computed(() => (terror.value === 2 ? 118 : 76))

watch(
  [terror, muted],
  ([level]) => {
    if (level && !muted.value) startHeartbeat(terrorBpm.value)
    else stopHeartbeat()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  stopHeartbeat()
  clearFx()
})

// ---------- details ----------

const inspecting = ref<InspectTarget | null>(null)

// ---------- secret choices (Tinkerer swaps a face-down card) ----------

const secretSeen = ref(false)
/** Who must hold the device alone: the killer swapping a hidden card, survivors picking one. */
const secretFor = computed<'killer' | 'survivors' | null>(() => {
  const s = view.value.step
  if (s.t === 'offer' && s.perk === 'tinkerer') return 'killer'
  if (s.t === 'replaceCard') return 'survivors'
  return null
})
// Online every player has their own screen: no hand-off curtain needed.
const secret = computed(() => !online.value && secretFor.value !== null && !secretSeen.value)
watch(
  () => view.value.step,
  () => (secretSeen.value = false),
)

// ---------- game over ----------

const over = computed(() => (view.value.step.t === 'gameOver' ? view.value.step.winner : null))
const showOver = ref(true)
watch(over, (w) => {
  showOver.value = true
  summaryRound.value = null
  if (w === 'survivors') sfx.escape()
  if (w === 'killer') sfx.sacrifice()
})

function leave() {
  if (online.value) {
    // the host can end the game for everyone; others just leave the room (and can rejoin)
    if (isHost.value && confirm('จบเกมนี้สำหรับทุกคนแล้วกลับไปที่ห้อง?')) void closeOnlineGame()
    else if (!isHost.value && confirm('ออกจากห้อง? (กลับเข้ามาได้ด้วยรหัสห้องเดิม)')) leaveRoom()
    return
  }
  if (over.value || confirm('ออกจากเกมนี้? (เกมจะหายไป)')) quitGame()
}

const planning = computed(() => view.value.step.t === 'planSurvivors' || view.value.step.t === 'planKiller')
</script>

<template>
  <div class="game">
    <header class="top">
      <strong class="title">ดบดล · เล่นเต็มเกม</strong>
      <span class="phase">รอบ {{ view.round }} · {{ PHASE_TH[view.phase] }}</span>
      <span class="spacer" />
      <button v-if="over && !showOver" class="primary" @click="showOver = true">สรุปเกม</button>
      <SyncBadge v-if="online" />
      <span v-if="online" class="room-tag">ห้อง {{ session.room?.code }} · {{ online.seat ? `ผู้เล่น ${online.seat}` : 'ผู้ชม' }}</span>
      <button v-else :disabled="!canUndo" title="ย้อนการกระทำล่าสุด" @click="undo">↶ ย้อน</button>
      <button :title="muted ? 'เปิดเสียง' : 'ปิดเสียง'" @click="muted = !muted">{{ muted ? '🔇' : '🔊' }}</button>
      <button @click="leave">ออก</button>
    </header>

    <main class="layout">
      <div class="board-col">
        <div v-if="modeBar" class="reveal-bar card">
          <span>{{ modeBar.text }}</span>
          <button @click="modeBar.cancel()">ยกเลิก</button>
        </div>
        <div v-if="revealing" class="reveal-bar card">
          <span>{{ view.survivors[revealing.s].name }}: คลิกไทล์คว่ำที่จะเปิด ({{ revealing.props.length }}/3)</span>
          <button class="primary" :disabled="!revealing.props.length" @click="confirmReveal">เปิด</button>
          <button @click="revealing = null">ยกเลิก</button>
        </div>
        <Board
          :st="view"
          :path-targets="targets.paths"
          :prop-targets="targets.flip"
          :interact-targets="targets.interact"
          :room-targets="targets.rooms"
          @room="onRoom"
          @pointerdown.capture="trackPointer"
          :picked="revealing?.props"
          :focus="boardFocus"
          @interact="onInteract"
          @path="onPath"
          @prop="onProp"
          @inspect="inspecting = $event"
        />
      </div>

      <aside class="side">
        <Planning v-if="planning && myTurn" :st="view" />
        <section v-else-if="waitingOn && !over" class="card waiting">
          <p class="muted small">กำลังรอ</p>
          <strong v-for="w in waitingOn" :key="w">{{ w }}</strong>
          <span class="dots" aria-hidden="true"><i /><i /><i /></span>
        </section>
        <ActionPanel
          v-else-if="!over"
          :st="view"
          :power-on="powerOn"
          :trap-path="trapPath"
          :power-card="powerCard"
          @power-on="powerOn = $event"
          @trap-path="trapPath = $event"
          @power-card="powerCard = $event"
        />
        <StatusPanel :st="view" @use="onUse" @inspect="inspecting = $event" @pick="itemPick = $event" />
        <GameLog :st="view" />
      </aside>
    </main>

    <!-- terror radius: the screen edge pulses with the heartbeat -->
    <div v-if="terror" class="terror" :class="{ close: terror === 2 }" :style="{ '--beat': `${60 / terrorBpm}s` }" />
    <div v-if="fx.flash" :key="fx.flash.id" class="flash" :class="fx.flash.tone" @animationend="fx.flash = null" />

    <Teleport to="body">
      <button v-if="secret" class="secret" @click="secretSeen = true">
        <template v-if="secretFor === 'killer'">
          <strong>ส่งเครื่องให้ฆาตกร ({{ view.killer.name }})</strong>
          <span>ผู้รอดชีวิตห้ามดูจอ — เลือกเปลี่ยนการ์ดที่คว่ำไว้ (Tinkerer) · แตะเพื่อเริ่ม</span>
        </template>
        <template v-else>
          <strong>ส่งเครื่องให้ฝ่ายผู้รอดชีวิต</strong>
          <span>ฆาตกรห้ามดูจอ — เลือกการ์ดใบใหม่ (Predator) · แตะเพื่อเริ่ม</span>
        </template>
      </button>
    </Teleport>

    <BannerHost :paused="summaryRound !== null || !!over || fx.dice.length > 0 || fx.perks.length > 0" />
    <ChoiceMenu v-if="menu" :st="view" :actions="menu.actions" :x="menu.x" :y="menu.y" @close="menu = null" />
    <PerkReveal :st="view" />
    <PerkPrompt :st="view" :hidden="secret || !!over || !myTurn" />
    <DiceModal />
    <RoundSummary v-if="summaryRound !== null && !over && !fx.boardBusy && !fx.dice.length && !fx.perks.length" :st="view" :round="summaryRound" @close="summaryRound = null" />
    <DetailModal v-if="inspecting" :st="view" :target="inspecting" @close="inspecting = null" />
    <EndSummary v-if="over && showOver" :st="view" :winner="over" @close="showOver = false" @again="quitGame" />
  </div>
</template>

<style scoped>
.game {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.top {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 1rem;
  border-bottom: 1px solid var(--line);
  background: rgb(7 8 10 / 0.85);
  position: sticky;
  top: 0;
  z-index: 10;
}
.title {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.phase {
  color: var(--blood-bright);
  font-family: var(--font-display);
}
.spacer {
  flex: 1;
}
.layout {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 1rem;
  padding: 1rem;
  align-items: start;
}
.board-col {
  position: relative;
  display: grid;
  gap: 0.6rem;
}
.side {
  display: grid;
  gap: 0.75rem;
  position: sticky;
  top: 4rem;
  max-height: calc(100vh - 5rem);
  overflow-y: auto;
}
.reveal-bar {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  flex-wrap: wrap;
  padding: 0.6rem 0.8rem;
}
.room-tag {
  font-family: var(--font-display);
  color: var(--warn);
  letter-spacing: 0.05em;
}
.waiting {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.3rem;
}
.waiting p {
  margin: 0;
}
.dots {
  display: flex;
  gap: 0.3rem;
  margin-top: 0.3rem;
}
.dots i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--blood-bright);
  animation: blink 1.2s infinite;
}
.dots i:nth-child(2) {
  animation-delay: 0.2s;
}
.dots i:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes blink {
  0%,
  100% {
    opacity: 0.2;
  }
  40% {
    opacity: 1;
  }
}
.secret {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-content: center;
  gap: 0.6rem;
  text-align: center;
  background: rgb(4 5 7 / 0.97);
  border: none;
  font-size: 1.1rem;
}
.secret strong {
  font-size: 1.6rem;
  color: var(--blood-bright);
}
.terror {
  position: fixed;
  inset: 0;
  z-index: 15;
  pointer-events: none;
  box-shadow: inset 0 0 60px 10px rgb(200 10 20 / 0.45);
  animation: terror var(--beat) ease-in-out infinite;
}
.terror.close {
  box-shadow: inset 0 0 110px 30px rgb(220 10 20 / 0.6);
}
@keyframes terror {
  0%,
  45%,
  100% {
    opacity: 0.45;
  }
  12% {
    opacity: 1;
  }
  26% {
    opacity: 0.8;
  }
}
.flash {
  position: fixed;
  inset: 0;
  z-index: 30;
  pointer-events: none;
  animation: flash 0.9s ease-out forwards;
}
.flash.red {
  background: radial-gradient(circle, rgb(255 20 30 / 0.15), rgb(160 0 10 / 0.55));
}
.flash.gold {
  background: radial-gradient(circle, rgb(255 230 140 / 0.35), rgb(245 197 66 / 0.1));
}
.flash.white {
  background: rgb(255 255 255 / 0.4);
}
@keyframes flash {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .terror {
    animation: none;
  }
}
@media (max-width: 980px) {
  .layout {
    grid-template-columns: 1fr;
    padding: 0.5rem;
  }
  .side {
    position: static;
    max-height: none;
  }
}
</style>
