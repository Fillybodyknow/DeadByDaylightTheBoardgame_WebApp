<script setup lang="ts">
// Offline: the full game on one device passed around the table (hot-seat). Before a game, the
// companion's lobby flow — players, survivors pick first, then the killer — on MacMillan Estate.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { killerById, mapById, survivorById } from '../../data'
import { asset } from '../../i18n'
import { sfx } from '../../sound'
import CharacterPicker from '../components/CharacterPicker.vue'
import GameScreen from '../components/GameScreen.vue'
import TrialIntro from '../components/TrialIntro.vue'
import { macmillan } from '../engine/boards'
import { handLayout } from '../engine/engine'
import { game, newGame } from '../game'
import { leaveRoom, session } from '../online/session'

const router = useRouter()

type Step = 'players' | 'survivors' | 'killer' | 'start'
const STEPS: { id: Step; label: string }[] = [
  { id: 'players', label: 'ผู้เล่น' },
  { id: 'survivors', label: 'Survivor เลือกตัว' },
  { id: 'killer', label: 'Killer เลือกตัว' },
  { id: 'start', label: 'เข้าสู่ Trial' },
]

const players = ref<3 | 4 | 5>(5)
const confirmed = ref(false)
const picks = ref<(string | null)[]>([null, null, null, null])
const killer = ref<string | null>(null)

const currentSeat = computed(() => {
  const i = picks.value.indexOf(null)
  return i === -1 ? null : i
})
const step = computed<Step>(() => {
  if (!confirmed.value) return 'players'
  if (currentSeat.value !== null) return 'survivors'
  if (!killer.value) return 'killer'
  return 'start'
})
const stepIndex = computed(() => STEPS.findIndex((x) => x.id === step.value))

/** Player (2..) controlling each survivor seat, for the chosen player count (p.19). */
const seatPlayer = computed(() => handLayout(players.value).map((hand) => hand + 2))

const seatingNote = computed(() => {
  if (players.value === 5) return 'ผู้รอดชีวิตคนละ 1 ตัว'
  if (players.value === 4) return 'ผู้เล่น 2 คุม Survivor 2 ตัว ใช้การ์ดเคลื่อนที่ชุดเดียวร่วมกัน (หน้า 19)'
  return 'ผู้เล่นฝั่ง Survivor คุมคนละ 2 ตัว ใช้การ์ดเคลื่อนที่ชุดเดียวต่อคน (หน้า 19)'
})

const chooser = computed(() => {
  if (step.value === 'survivors' && currentSeat.value !== null)
    return `ผู้เล่น ${seatPlayer.value[currentSeat.value]} เลือก Survivor ตัวที่ ${currentSeat.value + 1}`
  if (step.value === 'killer') return 'ผู้เล่น 1 (Killer) เลือกฆาตกร'
  return ''
})

function setPlayers(n: 3 | 4 | 5) {
  sfx.click()
  players.value = n
}

function confirmPlayers() {
  sfx.select()
  confirmed.value = true
}

function pickSurvivor(id: string) {
  if (currentSeat.value === null || picks.value.includes(id)) return
  picks.value[currentSeat.value] = id
}

function unpickSurvivor(id: string) {
  const i = picks.value.indexOf(id)
  if (i >= 0) picks.value[i] = null
}

function clearSeat(seat: number) {
  sfx.click()
  picks.value[seat] = null
}

// Only jumping back is allowed; moving forward happens by making the choices.
function goToStep(i: number) {
  if (i >= stepIndex.value) return
  if (i === 0) {
    confirmed.value = false
    return
  }
  if (!confirm(`ย้อนไปขั้น "${STEPS[i].label}"? ตัวเลือกหลังจากขั้นนี้จะถูกล้าง`)) return
  if (i <= 1) picks.value = [null, null, null, null]
  killer.value = null
}

const map = mapById.get(macmillan.id)

function start() {
  const ids = picks.value
  if (ids.some((id) => !id) || !killer.value) return
  sfx.entity()
  newGame({
    board: macmillan.id,
    survivors: ids.map((id) => ({ id: id!, name: survivorById.get(id!)!.name })),
    killer: { id: killer.value, name: killerById.get(killer.value)!.name },
    players: players.value,
    seed: (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0,
  })
}

</script>

<template>
  <!-- in an online room the game in memory is the room's: leave it before playing offline -->
  <section v-if="session.room" class="card notice">
    <h2>คุณยังอยู่ในห้องออนไลน์ {{ session.room.code }}</h2>
    <p class="muted">ออกจากห้องก่อนเพื่อเล่นแบบเครื่องเดียว หรือกลับเข้าห้อง</p>
    <div class="row">
      <button type="button" class="primary" @click="router.push('/online')">กลับเข้าห้อง</button>
      <button type="button" @click="leaveRoom">ออกจากห้อง</button>
    </div>
  </section>

  <template v-else-if="game">
    <GameScreen :st="game" />
    <TrialIntro :st="game" />
  </template>

  <div v-else class="lobby">
    <ol class="stepper">
      <li v-for="(st, i) in STEPS" :key="st.id" :class="{ done: i < stepIndex, now: i === stepIndex }" @click="goToStep(i)">
        <span class="num">{{ i < stepIndex ? '✓' : i + 1 }}</span>
        {{ st.label }}
      </li>
    </ol>

    <!-- team summary: who controls what, and what has been picked -->
    <section v-if="step !== 'players'" class="team card">
      <div class="seat killer" :class="{ active: step === 'killer' }">
        <img v-if="killer" class="aura-killer" :src="asset(killerById.get(killer)?.images.mini)" alt="" />
        <span v-else class="empty">🔪</span>
        <div>
          <small class="muted">Killer · ผู้เล่น 1</small>
          <strong>{{ killer ? killerById.get(killer)?.name : '—' }}</strong>
        </div>
      </div>
      <div v-for="(id, seat) in picks" :key="seat" class="seat" :class="{ active: currentSeat === seat }">
        <img v-if="id" class="aura-survivor" :src="asset(survivorById.get(id)?.images.mini)" alt="" />
        <span v-else class="empty">{{ seat + 1 }}</span>
        <div>
          <small class="muted">Survivor {{ seat + 1 }} · ผู้เล่น {{ seatPlayer[seat] }}</small>
          <strong>{{ id ? survivorById.get(id)?.name : '—' }}</strong>
        </div>
        <button v-if="id && step === 'survivors'" type="button" class="x" title="เลือกใหม่" @click="clearSeat(seat)">✕</button>
      </div>
    </section>

    <h2 v-if="chooser" class="chooser">ตาของ {{ chooser }}</h2>

    <!-- 1. players -->
    <template v-if="step === 'players'">
      <section class="hero" :style="{ backgroundImage: `url(${asset('assets/app/background-img/background_dbd.webp')})` }">
        <div class="hero-text">
          <h1>เล่นแบบเครื่องเดียว</h1>
          <p>ส่งเครื่องต่อกันทั้งโต๊ะ (hot-seat) · ระบบคุมกติกา ทอยเต๋า และ Perk ให้ทั้งหมด</p>
        </div>
      </section>

      <section class="card">
        <h2>ผู้เล่นกี่คน?</h2>
        <div class="counts">
          <button v-for="n in [3, 4, 5] as const" :key="n" type="button" :class="{ active: players === n }" @click="setPlayers(n)">{{ n }} คน</button>
        </div>
        <p class="muted">ผู้เล่น 1 = Killer · {{ seatingNote }}</p>
        <p class="muted small">โหมด Adept (Perk บนกระดานตัวละคร) · แผนที่ MacMillan Estate</p>
        <div class="actions">
          <button type="button" class="primary big" @click="confirmPlayers">เริ่มเลือกตัวละคร →</button>
        </div>
      </section>
    </template>

    <!-- 2. survivors pick first, in seat order -->
    <CharacterPicker
      v-else-if="step === 'survivors'"
      kind="survivor"
      :taken="picks.filter((p): p is string => !!p)"
      :remaining="picks.filter((p) => !p).length"
      taken-label="เลือกแล้ว"
      :roll-title="currentSeat !== null ? `สุ่ม Survivor ตัวที่ ${currentSeat + 1} ให้ผู้เล่น ${seatPlayer[currentSeat]}` : ''"
      @pick="pickSurvivor"
      @unpick="unpickSurvivor"
    />

    <!-- 3. then the killer -->
    <CharacterPicker v-else-if="step === 'killer'" kind="killer" :selected="killer ? [killer] : []" @pick="killer = $event" @unpick="killer = null" />

    <!-- 4. the map, and in -->
    <template v-else>
      <section v-if="map" class="card map-card">
        <img :src="asset(map.image)" :alt="map.name" />
        <div>
          <small class="muted">แผนที่</small>
          <h2>{{ map.name }}</h2>
          <p class="muted">แผนที่ที่ระบบรองรับในตอนนี้ — ทุกตัวจะทอยหาห้องเริ่มต้นตอนเข้า Trial (หน้า 6)</p>
        </div>
      </section>
      <div class="actions">
        <button type="button" class="primary big" @click="start">เข้าสู่ Trial →</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.lobby {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.notice .row {
  display: flex;
  gap: 0.5rem;
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
.counts {
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
.small {
  font-size: 0.85rem;
}
.map-card {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
}
.map-card img {
  width: min(420px, 100%);
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 6px;
}
.map-card h2 {
  margin: 0.1rem 0 0.4rem;
}
.actions {
  position: sticky;
  bottom: 0;
  padding: 1rem 0;
}
.big {
  width: 100%;
  padding: 0.85rem;
  font-size: 1.15rem;
}
@media (max-width: 600px) {
  .stepper li {
    flex: none;
    font-size: 0.85rem;
  }
  .chooser {
    font-size: 1.2rem;
  }
  .hero {
    min-height: 170px;
    padding: 1rem;
  }
  .hero h1 {
    font-size: 1.6rem;
  }
}
</style>
