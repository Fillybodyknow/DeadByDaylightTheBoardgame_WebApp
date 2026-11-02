<script setup lang="ts">
// A game from the history played back on the board (#/replay?id=…): GameScreen as a spectator sees
// it, fed one state after another from the game's replay (replay.ts). A step forward plays its
// animations as the game did; a step back, the start or a round jumps there at once (GameScreen
// is mounted afresh on that state). Playing steps on by itself whenever everything has shown.
//
// While it runs, `online` holds a room that takes no moves (seat 0: nothing on screen acts) and
// `replaying` tells the game's screens; leaving puts the hot-seat game back. Not while this device
// is in an online room: that room owns `online`.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GameScreen from '../components/GameScreen.vue'
import { clearFx } from '../fx/bus'
import { online, receive, replaying, restoreLocal } from '../game'
import { getHistory, type HistoryGame } from '../history'
import { session } from '../online/session'
import type { Room } from '../online/transport'
import { Playback, endsAt } from '../replay'
import type { GameState } from '../engine/types'
import { anim, playbackRate } from '../../settings'

const route = useRoute()
const router = useRouter()

const id = computed(() => (typeof route.query.id === 'string' ? route.query.id : ''))
const record = shallowRef<HistoryGame | null>(null)
const playback = shallowRef<Playback | null>(null)
const status = ref<'loading' | 'ready' | 'none' | 'inRoom'>('loading')

/** Where the replay is: the state after `at` of its moves. */
const at = ref(0)
const last = computed(() => Math.max(0, (playback.value?.length ?? 1) - 1))
const current = computed<GameState | null>(() => playback.value?.at(at.value) ?? null)
/** GameScreen's key: a jump shows its state at once, without playing what lies between. */
const screen = ref(0)
const playing = ref(false)
/** GameScreen has shown everything up to `current`. */
const settled = ref(false)
const reveal = ref(false)

/** Moves played before the replay's first state (a device that joined late records from there). */
const from = computed(() => record.value?.replay?.from ?? 0)

/** The first state of each round, to jump to. */
const rounds = computed(() => playback.value?.rounds ?? [])
const round = computed(() => current.value?.round ?? 1)

// ---------- entering and leaving ----------

/** The room a replay sits in: it takes no moves (a spectator never sends any). */
const NO_ROOM = { code: '', sendMove: async () => false } as unknown as Room

function exit() {
  void router.push(id.value ? { path: '/history', query: { id: id.value } } : '/history')
}

onMounted(async () => {
  if (session.room) {
    status.value = 'inRoom'
    return
  }
  const g = id.value ? await getHistory(id.value).catch(() => null) : null
  record.value = g
  // played through once (its rounds, a few states kept): it must end where the game did
  const p = g?.replay ? new Playback(g.replay) : null
  if (!g || !p || (g.state && !endsAt(p.end, JSON.parse(g.state) as GameState))) {
    status.value = 'none'
    return
  }
  playback.value = p
  replaying.value = { reveal: false, exit }
  online.value = { room: NO_ROOM, seat: 0, latest: () => current.value }
  receive(p.at(0))
  status.value = 'ready'
})

onBeforeUnmount(() => {
  stopTimer()
  playbackRate.value = 1
  if (!replaying.value) return
  replaying.value = null
  clearFx()
  restoreLocal()
})

watch(current, (st) => st && status.value === 'ready' && receive(st))
watch(reveal, (on) => replaying.value && (replaying.value = { ...replaying.value, reveal: on }))

// ---------- stepping ----------

function jump(i: number) {
  const to = Math.max(0, Math.min(last.value, i))
  if (to === at.value) return
  clearFx()
  settled.value = false
  at.value = to
  screen.value++
}

function next() {
  if (at.value < last.value) at.value++
}

function back() {
  playing.value = false
  jump(at.value - 1)
}

/** A round picked from the list: there at once, and the keys work again (the list lets go of them). */
function pickRound(el: HTMLSelectElement) {
  playing.value = false
  jump(rounds.value.find((r) => r.round === Number(el.value))?.at ?? 0)
  el.blur()
}

function toggle() {
  if (at.value >= last.value) jump(0)
  playing.value = !playing.value
}

/** A breath between moves while playing (an animation: it follows the speed). */
const PAUSE_MS = 700
let timer: number | undefined
function stopTimer() {
  clearTimeout(timer)
  timer = undefined
}
watch([playing, settled, at], () => {
  stopTimer()
  if (!playing.value || !settled.value) return
  if (at.value >= last.value) return void (playing.value = false)
  timer = window.setTimeout(next, anim(PAUSE_MS))
})

const SPEEDS = [1, 2, 4]

function onKey(e: KeyboardEvent) {
  // (not while typing, nor in the round list, which takes the arrows; a checkbox doesn't)
  const t = e.target as HTMLElement | null
  const typing = !!t && (t.isContentEditable || /^(TEXTAREA|SELECT)$/.test(t.tagName) || (t instanceof HTMLInputElement && t.type !== 'checkbox'))
  if (status.value !== 'ready' || typing) return
  if (e.code === 'Space') toggle()
  else if (e.code === 'ArrowRight') {
    playing.value = false
    next()
  } else if (e.code === 'ArrowLeft') back()
  else if (e.code === 'Home') jump(0)
  else if (e.code === 'End') jump(last.value)
  else return
  e.preventDefault()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="status === 'ready' && current" class="replay">
    <GameScreen :key="screen" :st="current" @settled="settled = $event" />

    <div class="bar card" role="toolbar" aria-label="ควบคุมการดูย้อนหลัง">
      <button type="button" title="กลับไปต้นเกม (Home)" :disabled="at === 0" @click="playing = false; jump(0)">⏮</button>
      <button type="button" title="ย้อนทีละตา (←)" :disabled="at === 0" @click="back">◀</button>
      <button type="button" class="primary play" :title="playing ? 'หยุด (Space)' : 'เล่น (Space)'" @click="toggle">{{ playing ? '⏸' : '▶' }}</button>
      <button type="button" title="ไปทีละตา (→)" :disabled="at >= last" @click="playing = false; next()">▶|</button>
      <span class="where">
        ตา <b>{{ from + at }}</b> / {{ from + last }}
        <small v-if="from" title="เครื่องนี้เข้ามาระหว่างเกม: บันทึกได้ตั้งแต่ตานี้">(เริ่มกลางเกม)</small>
      </span>
      <label class="rounds">
        <span class="sr">รอบ</span>
        <select :value="round" @change="pickRound($event.target as HTMLSelectElement)">
          <option v-for="r in rounds" :key="r.round" :value="r.round">รอบ {{ r.round }}</option>
        </select>
      </label>
      <div class="speeds" role="radiogroup" aria-label="ความเร็ว">
        <button v-for="s in SPEEDS" :key="s" type="button" role="radio" :aria-checked="playbackRate === s" :class="{ on: playbackRate === s }" @click="playbackRate = s">×{{ s }}</button>
      </div>
      <label class="reveal" title="เปิด item ของทุกคน และกดดูการ์ดที่คว่ำอยู่ของใครก็ได้">
        <input v-model="reveal" type="checkbox" />
        เปิดทุกอย่าง
      </label>
      <button type="button" title="กลับไปหน้าประวัติ" @click="exit">✕</button>
    </div>
  </div>

  <div v-else class="replay-note">
    <section class="card">
      <template v-if="status === 'loading'">
        <p class="muted">กำลังโหลด…</p>
      </template>
      <template v-else-if="status === 'inRoom'">
        <h2>ดูย้อนหลังไม่ได้ตอนอยู่ในห้องออนไลน์</h2>
        <p class="muted">ออกจากห้อง {{ session.room?.code }} ก่อน แล้วค่อยเปิดเกมนี้จากหน้าประวัติอีกครั้ง</p>
      </template>
      <template v-else>
        <h2>เกมนี้ดูย้อนหลังไม่ได้</h2>
        <p class="muted">{{ record ? 'เกมที่จบก่อนเวอร์ชัน 1.28.0 หรือเครื่องนี้บันทึกการเดินได้ไม่ครบ มีแค่บันทึกเป็นข้อความ' : 'ไม่พบเกมนี้ในเครื่อง' }}</p>
      </template>
      <button v-if="status !== 'loading'" type="button" @click="exit">กลับไปหน้าประวัติ</button>
    </section>
  </div>
</template>

<style scoped>
/* The controls float at the foot of the screen, over the map's lower edge: a spectator has no hand
   of cards there. Under the game's modals and reveals, over the board. */
.bar {
  position: fixed;
  z-index: 13;
  left: 50%;
  bottom: 0.6rem;
  translate: -50% 0;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.55rem;
  max-width: calc(100vw - 1rem);
  flex-wrap: wrap;
  justify-content: center;
}
.bar button {
  min-width: 2.2rem;
  padding: 0.3rem 0.55rem;
}
.bar .play {
  min-width: 3rem;
}
.where {
  margin: 0 0.3rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.where small {
  color: var(--muted);
}
.rounds select {
  padding: 0.25rem 0.4rem;
}
.speeds {
  display: flex;
}
.speeds button {
  border-radius: 0;
  min-width: 2.4rem;
}
.speeds button:first-child {
  border-radius: 6px 0 0 6px;
}
.speeds button:last-child {
  border-radius: 0 6px 6px 0;
}
.speeds button.on {
  border-color: var(--gold, #d8b25a);
  color: #ffe9b0;
  background: rgb(80 64 30 / 0.6);
}
.reveal {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  white-space: nowrap;
  font-size: 0.9rem;
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.replay-note {
  display: grid;
  place-items: center;
  min-height: 50vh;
  padding: 1rem;
}
.replay-note .card {
  display: grid;
  gap: 0.75rem;
  max-width: 34rem;
}
.replay-note h2 {
  margin: 0;
  font-size: 1.15rem;
}
</style>
