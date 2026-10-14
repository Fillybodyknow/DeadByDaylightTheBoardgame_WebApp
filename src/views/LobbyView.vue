<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import CharacterSheet from '../components/CharacterSheet.vue'
import DevoutPicker from '../components/DevoutPicker.vue'
import RouletteReel, { type ReelItem } from '../components/RouletteReel.vue'
import { sfx } from '../sound'
import { killerById, killers, maps, survivorById, survivors } from '../data'
import type { GameMap } from '../data/maps'
import { asset } from '../i18n'
import { MAX_PLAYERS, MIN_PLAYERS, SURVIVOR_COUNT, useLobbyStore, type LobbyStep } from '../stores/lobby'
import type { Killer, Survivor } from '../types'

const lobby = useLobbyStore()
const router = useRouter()
const s = computed(() => lobby.state)

const STEPS = computed<{ id: LobbyStep; label: string }[]>(() => [
  { id: 'players', label: 'ผู้เล่น' },
  { id: 'survivors', label: 'Survivor เลือกตัว' },
  { id: 'killer', label: 'Killer เลือกตัว' },
  { id: 'map', label: 'Killer เลือกแผนที่' },
  ...(s.value.mode === 'devout' ? [{ id: 'perks' as const, label: 'เลือก Perk' }] : []),
])
const stepIndex = computed(() => STEPS.value.findIndex((x) => x.id === lobby.step))

const MODES = [
  { id: 'adept', label: 'Adept', note: 'ใช้ Perk ที่พิมพ์บนกระดานตัวละคร (เกมมาตรฐาน)' },
  { id: 'devout', label: 'Devout', note: 'แต่ละคนเลือก Perk เอง 3 ใบ จาก Perk บนกระดานตัวเองหรือ Perk ที่แชร์ได้ของฝั่งตัวเอง ห้ามซ้ำ แล้วเปิดพร้อมกัน (หน้า 19)' },
] as const

// Rulebook p.4 recommends easy characters for a first game.
const onlyEasy = ref(false)

const survivorPlayers = computed(() =>
  s.value.players.map((_, i) => i).filter((i) => i !== s.value.killerPlayer),
)

const seatingNote = computed(() => {
  const n = s.value.players.length
  if (n === 5) return 'ผู้รอดชีวิตคนละ 1 ตัว'
  if (n === 4) return 'มีผู้เล่น 1 คนคุม Survivor 2 ตัว ใช้การ์ดเคลื่อนที่ชุดเดียวร่วมกัน (หน้า 19)'
  if (n === 3) return 'ผู้เล่นฝั่ง Survivor คุมคนละ 2 ตัว ใช้การ์ดเคลื่อนที่ชุดเดียวต่อคน (หน้า 19)'
  return 'ผู้เล่นคนเดียวคุม Survivor ทั้ง 4 ตัว ใช้การ์ด 2 ชุดสับเป็นกอง จั่ว 3 ใบ (หน้า 19)'
})

// ---------- preview modal: look at a character, then pick it ----------

type Preview = { kind: 'survivor'; c: Survivor } | { kind: 'killer'; c: Killer }
const preview = ref<Preview | null>(null)

// ---------- map viewer ----------

const zoomMap = ref<GameMap | null>(null)
const fullSize = ref(false)

function openMap(m: GameMap) {
  fullSize.value = false
  zoomMap.value = m
}

function pickZoomed() {
  if (zoomMap.value) lobby.pickMap(zoomMap.value.id)
  zoomMap.value = null
}

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  zoomMap.value = null
  preview.value = null
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// ---------- random picks, shown on a slot-machine reel ----------

interface Reel {
  key: number
  items: ReelItem[]
  target: string
  title: string
  wide?: boolean
  then: (id: string) => void
}
const reel = ref<Reel | null>(null)
let reelKey = 0
const pickRandom = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]

function spin(items: ReelItem[], title: string, then: (id: string) => void, wide = false) {
  if (!items.length || reel.value) return
  reel.value = { key: ++reelKey, items, target: pickRandom(items).id, title, wide, then }
}

function onReelDone(id: string) {
  const r = reel.value
  reel.value = null
  r?.then(id)
}

function spinSurvivor(after?: () => void) {
  const seat = lobby.currentSurvivorSeat
  if (seat === null) return
  const taken = new Set(s.value.survivorPicks)
  const pool = survivorList.value.filter((c) => !taken.has(c.id))
  spin(
    pool.map((c) => ({ id: c.id, name: c.name, image: c.images.mini ?? '' })),
    `สุ่ม Survivor ตัวที่ ${seat + 1} ให้ ${lobby.seatPlayerName(seat)}`,
    (id) => {
      lobby.pickSurvivor(id)
      after?.()
    },
  )
}

function spinRemaining() {
  spinSurvivor(() => {
    if (lobby.currentSurvivorSeat !== null) window.setTimeout(spinRemaining, 150)
  })
}

function spinKiller() {
  spin(
    killerList.value.map((c) => ({ id: c.id, name: c.name, image: c.images.mini ?? '' })),
    'สุ่มฆาตกร',
    (id) => lobby.pickKiller(id),
  )
}

function spinMap() {
  spin(
    maps.map((m) => ({ id: m.id, name: m.name, image: m.image })),
    'สุ่มแผนที่',
    (id) => lobby.pickMap(id),
    true,
  )
}

function choose() {
  sfx.select()
  const p = preview.value
  if (!p) return
  if (p.kind === 'survivor') lobby.pickSurvivor(p.c.id)
  else lobby.pickKiller(p.c.id)
  preview.value = null
}

const survivorList = computed(() => survivors.filter((c) => !onlyEasy.value || c.difficulty === 'easy'))
const killerList = computed(() => killers.filter((c) => !onlyEasy.value || c.difficulty === 'easy'))

const currentChooser = computed(() => {
  if (lobby.step === 'survivors' && lobby.currentSurvivorSeat !== null)
    return `${lobby.seatPlayerName(lobby.currentSurvivorSeat)} เลือก Survivor ตัวที่ ${lobby.currentSurvivorSeat + 1}`
  if (lobby.step === 'killer') return 'Killer เลือกฆาตกร'
  if (lobby.step === 'map') return 'Killer เลือกแผนที่'
  return ''
})

// Only jumping back is allowed; moving forward happens by making the choices.
// Going back to the players step keeps the picks (names don't change characters).
function goToStep(i: number) {
  if (i >= stepIndex.value) return
  if (i === 0) lobby.editPlayers()
  else if (confirm(`ย้อนไปขั้น "${STEPS.value[i].label}"? ตัวเลือกหลังจากขั้นนี้จะถูกล้าง`)) lobby.backTo(STEPS.value[i].id)
}

function toSetup() {
  if (lobby.ready) router.push('/setup')
}
</script>

<template>
  <div class="lobby">
    <!-- stepper -->
    <ol class="stepper">
      <li
        v-for="(st, i) in STEPS"
        :key="st.id"
        :class="{ done: i < stepIndex, now: i === stepIndex }"
        @click="goToStep(i)"
      >
        <span class="num">{{ i < stepIndex ? '✓' : i + 1 }}</span>
        {{ st.label }}
      </li>
    </ol>

    <!-- team summary: who controls what, and what has been picked -->
    <section v-if="lobby.step !== 'players' && lobby.step !== 'perks'" class="team card">
      <div class="seat killer" :class="{ active: lobby.step === 'killer' || lobby.step === 'map' }">
        <img v-if="s.killerPick" class="aura-killer" :src="asset(killerById.get(s.killerPick)?.images.mini)" alt="" />
        <span v-else class="empty">🔪</span>
        <div>
          <small class="muted">Killer · {{ lobby.playerName(s.killerPlayer) }}</small>
          <strong>{{ s.killerPick ? killerById.get(s.killerPick)?.name : '—' }}</strong>
        </div>
      </div>
      <div
        v-for="seat in SURVIVOR_COUNT"
        :key="seat"
        class="seat"
        :class="{ active: lobby.currentSurvivorSeat === seat - 1 }"
      >
        <img v-if="s.survivorPicks[seat - 1]" class="aura-survivor" :src="asset(survivorById.get(s.survivorPicks[seat - 1]!)?.images.mini)" alt="" />
        <span v-else class="empty">{{ seat }}</span>
        <div>
          <small class="muted">Survivor {{ seat }} · {{ lobby.seatPlayerName(seat - 1) }}</small>
          <strong>{{ s.survivorPicks[seat - 1] ? survivorById.get(s.survivorPicks[seat - 1]!)?.name : '—' }}</strong>
        </div>
        <button
          v-if="s.survivorPicks[seat - 1] && lobby.step === 'survivors'"
          type="button"
          class="x"
          title="เลือกใหม่"
          @click="lobby.clearSurvivorSeat(seat - 1)"
        >
          ✕
        </button>
      </div>
    </section>

    <h2 v-if="currentChooser" class="chooser">ตาของ {{ currentChooser }}</h2>

    <!-- 1. players -->
    <section v-if="lobby.step === 'players'" class="hero" :style="{ backgroundImage: `url(${asset('assets/app/background-img/background_dbd.webp')})` }">
      <div class="hero-text">
        <h1>เตรียมเข้าสู่ Trial</h1>
        <p>Survivor 4 คน · Killer 1 ตัว · หนีให้รอด หรือสังเวยให้ The Entity</p>
      </div>
    </section>

    <section v-if="lobby.step === 'players'" class="card">
      <h2>ผู้เล่นกี่คน?</h2>
      <div class="counts">
        <button
          v-for="n in MAX_PLAYERS - MIN_PLAYERS + 1"
          :key="n"
          type="button"
          :class="{ active: s.players.length === n + MIN_PLAYERS - 1 }"
          @click="lobby.setPlayerCount(n + MIN_PLAYERS - 1)"
        >
          {{ n + MIN_PLAYERS - 1 }} คน
        </button>
      </div>

      <h3>โหมดเกม</h3>
      <div class="modes">
        <button
          v-for="m in MODES"
          :key="m.id"
          type="button"
          class="mode"
          :class="{ active: s.mode === m.id }"
          @click="lobby.setMode(m.id)"
        >
          <b>{{ m.label }}</b>
          <small>{{ m.note }}</small>
        </button>
      </div>

      <h3>ใครคุม Survivor ตัวไหน</h3>
      <p class="muted">{{ seatingNote }}</p>
      <div class="seats">
        <label v-for="seat in SURVIVOR_COUNT" :key="seat">
          Survivor {{ seat }}
          <select :value="s.seats[seat - 1]" @change="lobby.setSeat(seat - 1, Number(($event.target as HTMLSelectElement).value))">
            <option v-for="p in survivorPlayers" :key="p" :value="p">{{ lobby.playerName(p) }}</option>
          </select>
        </label>
      </div>

      <div class="actions">
        <button type="button" class="primary big" @click="lobby.confirmPlayers()">เริ่มเลือกตัวละคร →</button>
      </div>
    </section>

    <!-- 2 + 3. character picking -->
    <template v-else-if="lobby.step === 'survivors' || lobby.step === 'killer'">
      <div class="toolbar">
        <label class="filter"><input v-model="onlyEasy" type="checkbox" /> เฉพาะตัวง่าย (แนะนำเกมแรก)</label>
        <template v-if="lobby.step === 'survivors'">
          <button type="button" @click="spinSurvivor()">🎲 สุ่มให้ตัวนี้</button>
          <button type="button" @click="spinRemaining()">🎲 สุ่มที่เหลือทั้งหมด</button>
        </template>
        <button v-else type="button" @click="spinKiller()">🎲 สุ่มฆาตกร</button>
      </div>

      <div v-if="lobby.step === 'survivors'" class="grid pick">
        <button
          v-for="c in survivorList"
          :key="c.id"
          type="button"
          class="option surv"
          :disabled="s.survivorPicks.includes(c.id)"
          @click="preview = { kind: 'survivor', c }"
        >
          <img :src="asset(c.images.mini)" :alt="c.name" loading="lazy" />
          <span>{{ c.name }}</span>
          <small :class="c.difficulty">{{ c.difficulty === 'easy' ? 'ง่าย' : 'ยาก' }}</small>
        </button>
      </div>
      <div v-else class="grid pick">
        <button v-for="c in killerList" :key="c.id" type="button" class="option kill" @click="preview = { kind: 'killer', c }">
          <img :src="asset(c.images.mini)" :alt="c.name" loading="lazy" />
          <span>{{ c.name }}</span>
          <small :class="c.difficulty">{{ c.difficulty === 'easy' ? 'ง่าย' : 'ยาก' }}</small>
        </button>
      </div>
    </template>

    <!-- 5. Devout perks -->
    <template v-else-if="lobby.step === 'perks'">
      <DevoutPicker />
      <div v-if="lobby.ready" class="actions">
        <button type="button" class="primary big" @click="toSetup">ไปจัดโต๊ะ →</button>
      </div>
    </template>

    <!-- 4. map -->
    <template v-else>
      <div class="toolbar">
        <span class="filter" />
        <button type="button" @click="spinMap()">🎲 สุ่มแผนที่</button>
      </div>
      <div class="maps">
        <div v-for="m in maps" :key="m.id" class="map" :class="{ selected: s.mapId === m.id }">
          <!-- Tapping a map opens it large; it is picked from the viewer. -->
          <button type="button" class="map-pick" @click="openMap(m)">
            <img :src="asset(m.image)" :alt="m.name" loading="lazy" />
            <span>
              {{ m.name }}
              <small v-if="m.inBox" class="muted"> · กระดานในกล่อง</small>
              <b v-if="s.mapId === m.id" class="picked">✓ เลือกแล้ว</b>
            </span>
          </button>
        </div>
      </div>
      <div class="actions">
        <button v-if="s.mode === 'devout'" type="button" class="primary big" :disabled="!s.mapId" @click="lobby.startPerks()">
          ไปเลือก Perk →
        </button>
        <button v-else type="button" class="primary big" :disabled="!lobby.ready" @click="toSetup">ไปจัดโต๊ะ →</button>
      </div>
    </template>
  </div>

  <RouletteReel
    v-if="reel"
    :key="reel.key"
    :items="reel.items"
    :target="reel.target"
    :title="reel.title"
    :wide="reel.wide"
    @done="onReelDone"
  />

  <!-- map viewer: fit to screen, tap the image to see it at full size and pan around -->
  <div v-if="zoomMap" class="overlay map-viewer" @click.self="zoomMap = null">
    <div class="viewer">
      <header class="viewer-head">
        <b>{{ zoomMap.name }}</b>
        <small class="muted">แตะที่ภาพเพื่อ{{ fullSize ? 'ย่อให้พอดีจอ' : 'ซูมเต็มขนาด' }}</small>
        <button type="button" class="close" title="ปิด" @click="zoomMap = null">✕</button>
      </header>
      <div class="viewer-body" :class="{ full: fullSize }">
        <img :src="asset(zoomMap.image)" :alt="zoomMap.name" @click="fullSize = !fullSize" />
      </div>
      <div class="modal-actions">
        <button type="button" @click="zoomMap = null">ปิด</button>
        <button type="button" class="primary" @click="pickZoomed">
          {{ s.mapId === zoomMap.id ? '✓ เลือกแผนที่นี้แล้ว' : 'เลือกแผนที่นี้' }}
        </button>
      </div>
    </div>
  </div>

  <!-- character preview -->
  <div v-if="preview" class="overlay" @click.self="preview = null">
    <div class="modal">
      <CharacterSheet :character="preview.c" :kind="preview.kind" />
      <div class="modal-actions">
        <button type="button" @click="preview = null">ปิด</button>
        <button type="button" class="primary" @click="choose">เลือก {{ preview.c.name }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lobby {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.hero {
  position: relative;
  display: flex;
  align-items: flex-end;
  min-height: 220px;
  padding: 1.25rem 1.5rem;
  border-radius: var(--radius);
  border: 1px solid var(--line-strong);
  background-size: cover;
  background-position: center 30%;
  overflow: hidden;
  box-shadow: 0 10px 40px rgb(0 0 0 / 0.6);
}
.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgb(5 6 8 / 0.92) 0%, rgb(5 6 8 / 0.55) 45%, transparent 75%),
    linear-gradient(0deg, rgb(5 6 8 / 0.8), transparent 60%);
}
.hero-text {
  position: relative;
  max-width: 34rem;
}
.hero h1 {
  margin: 0;
  font-size: 2.3rem;
  text-shadow: 0 2px 12px rgb(0 0 0 / 0.8);
}
.hero h1::after {
  content: '';
  display: block;
  width: 4rem;
  height: 3px;
  margin-top: 0.35rem;
  background: var(--blood-bright);
  box-shadow: 0 0 10px var(--blood-bright);
}
.hero p {
  margin: 0.5rem 0 0;
  color: #cfcac0;
}
@media (max-width: 560px) {
  .hero {
    min-height: 170px;
    padding: 1rem;
  }
  .hero h1 {
    font-size: 1.6rem;
  }
}
.stepper {
  display: flex;
  gap: 0.4rem;
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-x: auto;
}
.stepper li {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.7rem;
  border-radius: 8px;
  background: var(--bg-raised);
  color: var(--muted);
  white-space: nowrap;
  font-size: 0.95rem;
}
.stepper li.done {
  cursor: pointer;
  color: var(--text);
}
.stepper li.now {
  background: var(--blood);
  color: #fff;
  font-weight: 700;
}
.num {
  display: inline-grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background: rgb(0 0 0 / 0.3);
  font-size: 0.85rem;
}
.team {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
}
.seat {
  position: relative;
  display: flex;
  gap: 0.6rem;
  align-items: center;
  padding: 0.4rem;
  border-radius: 8px;
  border: 1px solid transparent;
}
.seat.active {
  border-color: var(--blood);
  background: var(--bg-hover);
}
.seat.killer {
  background: linear-gradient(120deg, #2a1012, transparent);
}
.seat img,
.seat .empty {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  flex: none;
  object-fit: cover;
}
.seat .empty {
  display: grid;
  place-items: center;
  background: var(--bg-hover);
  color: var(--muted);
}
.seat div {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.seat strong {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.seat .x {
  margin-left: auto;
  padding: 0.1rem 0.45rem;
}
.chooser {
  margin: 0;
  font-size: 1.5rem;
}
.counts,
.seats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.counts button {
  min-width: 4.5rem;
  font-size: 1.1rem;
}
.counts .active {
  background: var(--blood);
  border-color: var(--blood);
  color: #fff;
}
.modes {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  margin-bottom: 0.75rem;
}
.mode {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.7rem 0.9rem;
  text-align: left;
}
.mode b {
  font-size: 1.1rem;
}
.mode small {
  color: var(--muted);
}
.mode.active {
  border-color: var(--blood);
  box-shadow: 0 0 0 2px var(--blood) inset;
}
.seats label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.9rem;
}
h3 {
  margin-top: 1.25rem;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.filter {
  margin-right: auto;
}
.pick {
  grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
}
.option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  padding: 0.6rem 0.4rem;
  background: var(--bg-raised);
}
.option {
  transition:
    transform 0.18s ease,
    border-color 0.18s,
    box-shadow 0.18s;
}
.option img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  border-radius: 50%;
  transition: box-shadow 0.25s;
}
.option:disabled {
  opacity: 0.25;
}
/* hovering a character reads its aura: gold-white for survivors, red for killers */
.option:hover:not(:disabled),
.option:focus-visible {
  transform: translateY(-3px);
}
.option.surv:hover:not(:disabled) {
  border-color: rgb(255 214 140 / 0.7);
  box-shadow: 0 8px 22px rgb(0 0 0 / 0.5), 0 0 18px rgb(255 200 110 / 0.25);
}
.option.surv:hover:not(:disabled) img {
  box-shadow:
    0 0 0 2px rgb(255 240 200 / 0.9),
    0 0 18px 4px rgb(255 205 120 / 0.6);
}
.option.kill:hover img {
  box-shadow:
    0 0 0 2px rgb(255 50 50 / 0.95),
    0 0 20px 5px rgb(255 30 30 / 0.65);
}
.option.kill:hover {
  border-color: var(--blood);
  box-shadow: 0 8px 22px rgb(0 0 0 / 0.5), 0 0 22px rgb(255 30 30 / 0.3);
}
@media (prefers-reduced-motion: reduce) {
  .option:hover:not(:disabled) {
    transform: none;
  }
}
.easy {
  color: var(--ok);
}
.hard {
  color: var(--blood);
}
.maps {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}
.map {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg-raised);
}
.map-pick {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  width: 100%;
  padding: 0.5rem;
  border: none;
  background: transparent;
  text-align: left;
}
.map-pick img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 6px;
}
.map.selected {
  border-color: var(--blood);
  box-shadow: 0 0 0 2px var(--blood);
}
.map-pick img {
  cursor: zoom-in;
}
.picked {
  margin-left: 0.4rem;
  color: var(--blood);
}
.viewer {
  display: flex;
  flex-direction: column;
  width: min(1400px, 100%);
  max-height: 100%;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
}
.viewer-head {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.6rem 0.9rem;
  border-bottom: 1px solid var(--line);
}
.viewer-head .close {
  margin-left: auto;
  padding: 0.2rem 0.6rem;
}
.viewer-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  place-items: center;
}
.viewer-body img {
  display: block;
  max-width: 100%;
  max-height: calc(100dvh - 9.5rem);
  cursor: zoom-in;
}
/* full size: the image keeps its own pixels and the box scrolls. Start-aligned, because a
   centred image wider than the box would overflow to the left where it can't be scrolled to. */
.viewer-body.full {
  display: block;
  place-items: start;
}
.viewer-body.full img {
  max-width: none;
  max-height: none;
  cursor: zoom-out;
}
.map-viewer .modal-actions {
  position: static;
  margin: 0;
}
.actions {
  position: sticky;
  bottom: 0;
  padding: 1rem 0;
  background: none;
}
.big {
  width: 100%;
  padding: 0.85rem;
  font-size: 1.15rem;
}
.overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(0 0 0 / 0.75);
}
.modal {
  width: min(900px, 100%);
  max-height: 100%;
  overflow-y: auto;
  padding: 1.25rem;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.modal-actions {
  position: sticky;
  bottom: -1.25rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin: 1rem -1.25rem -1.25rem;
  padding: 0.75rem 1.25rem;
  background: var(--bg-raised);
  border-top: 1px solid var(--line);
}
.modal-actions .primary {
  font-size: 1.05rem;
  padding: 0.6rem 1.2rem;
}
@media (max-width: 600px) {
  .stepper li {
    flex: none;
    font-size: 0.85rem;
  }
  .chooser {
    font-size: 1.2rem;
  }
}
</style>
