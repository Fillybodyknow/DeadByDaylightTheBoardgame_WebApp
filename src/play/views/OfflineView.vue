<script setup lang="ts">
// Offline: the full game on one device passed around the table (hot-seat). Before a game, the
// companion's lobby flow — players and game mode, survivors pick first, then the killer, then
// (Bloodweb, Devout) each player's perks in turn behind a hand-off curtain, then the map.
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { killerById, survivorById } from '../../data'
import { asset } from '../../i18n'
import { sfx } from '../../sound'
import CharacterPicker from '../components/CharacterPicker.vue'
import MapPicker from '../components/MapPicker.vue'
import GameScreen from '../components/GameScreen.vue'
import TrialIntro from '../components/TrialIntro.vue'
import { macmillan } from '../engine/boards'
import { handLayout } from '../engine/engine'
import { bloodwebHands, cardChoices, loadoutProblem, printedOf, takenBy, type GameMode, type LoadoutCharacter } from '../engine/loadout'
import { PERKS, type PerkId } from '../engine/perks'
import PerkLoadout from '../components/PerkLoadout.vue'
import { game, newGame } from '../game'
import { leaveRoom, session } from '../online/session'

const router = useRouter()

type Step = 'players' | 'survivors' | 'killer' | 'perks' | 'start'
const STEPS = computed<{ id: Step; label: string }[]>(() => [
  { id: 'players', label: 'ผู้เล่น' },
  { id: 'survivors', label: 'Survivor เลือกตัว' },
  { id: 'killer', label: 'Killer เลือกตัว' },
  ...(mode.value === 'adept' ? [] : [{ id: 'perks' as const, label: 'แต่ง Perk' }]),
  { id: 'start', label: 'เข้าสู่ Trial' },
])

/** p.19: Adept plays the printed perks; Bloodweb and Devout lay perk cards over them. */
const MODES: { id: GameMode; label: string; note: string }[] = [
  { id: 'adept', label: 'Adept', note: 'ใช้ Perk ที่พิมพ์บนกระดานตัวละคร (เกมมาตรฐาน)' },
  { id: 'bloodweb', label: 'Bloodweb', note: 'จั่วการ์ด Perk ฝ่ายตัวเองคนละ 5 ใบ เลือกวางทับ Perk บนกระดานได้สูงสุด 3 ใบ' },
  { id: 'devout', label: 'Devout', note: 'เลือก Perk เองได้สูงสุด 3 ใบ แล้วเปิดพร้อมกัน — 1 Perk อยู่ในเกมได้ครั้งเดียว' },
]
const mode = ref<GameMode>('adept')

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
  if (mode.value !== 'adept' && perkTurn.value < perkChars.value.length) return 'perks'
  return 'start'
})
const stepIndex = computed(() => STEPS.value.findIndex((x) => x.id === step.value))

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

function setMode(m: GameMode) {
  sfx.click()
  mode.value = m
}

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
  if (!confirm(`ย้อนไปขั้น "${STEPS.value[i].label}"? ตัวเลือกหลังจากขั้นนี้จะถูกล้าง`)) return
  clearPerks()
  if (STEPS.value[i].id === 'perks') return
  if (i <= 1) picks.value = [null, null, null, null]
  killer.value = null
}

// ---------- perks (Bloodweb, Devout): each player in turn, the device handed over ----------

/** Every character, survivors in seat order then the killer: the order the perks are set in. */
const perkChars = computed<(LoadoutCharacter & { who: string })[]>(() => [
  ...picks.value.map((id, seat) => ({ key: String(seat), side: 'survivor' as const, id: id ?? '', who: `ผู้เล่น ${seatPlayer.value[seat]}` })),
  { key: 'killer', side: 'killer' as const, id: killer.value ?? '', who: 'ผู้เล่น 1 (Killer)' },
])
const perkTurn = ref(0)
/** The curtain is up between two players. */
const handedOver = ref(false)
const loadouts = ref<Record<string, PerkId[]>>({})
/** Bloodweb's shuffle, drawn once the characters are known. */
const perkSeed = ref((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0)
const hands = computed(() => (mode.value === 'bloodweb' && killer.value ? bloodwebHands(perkSeed.value, perkChars.value) : {}))

const perkChar = computed(() => perkChars.value[perkTurn.value])
const draft = ref<PerkId[]>([])
const perkTaken = computed(() => (perkChar.value ? [...takenBy(perkChars.value, loadouts.value, perkChar.value.key)] : []))
const perkProblem = computed(() =>
  perkChar.value ? loadoutProblem(mode.value, perkChar.value, draft.value, hands.value[perkChar.value.key], new Set(perkTaken.value)) : '',
)

function beginPerks() {
  sfx.select()
  draft.value = [...(loadouts.value[perkChar.value.key] ?? printedOf(perkChar.value.id))]
  handedOver.value = true
}

function confirmPerks(on: boolean) {
  if (!on || perkProblem.value) return
  sfx.select()
  loadouts.value = { ...loadouts.value, [perkChar.value.key]: [...draft.value] }
  handedOver.value = false
  perkTurn.value++
}

/** The perks a character plays, by name. */
const perkNames = (c: LoadoutCharacter) => (loadouts.value[c.key] ?? printedOf(c.id)).map((p) => PERKS[p].name).join(' · ')

function clearPerks() {
  loadouts.value = {}
  perkTurn.value = 0
  handedOver.value = false
  perkSeed.value = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0
}

const board = ref(macmillan.id)

function start() {
  const ids = picks.value
  if (ids.some((id) => !id) || !killer.value) return
  sfx.entity()
  newGame({
    board: board.value,
    survivors: ids.map((id, seat) => ({ id: id!, name: survivorById.get(id!)!.name, perks: mode.value === 'adept' ? undefined : loadouts.value[String(seat)] })),
    killer: { id: killer.value, name: killerById.get(killer.value)!.name, perks: mode.value === 'adept' ? undefined : loadouts.value.killer },
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
        <h2>โหมดเกม</h2>
        <div class="modes">
          <button v-for="m in MODES" :key="m.id" type="button" class="mode" :class="{ active: mode === m.id }" @click="setMode(m.id)">
            <b>{{ m.label }}</b>
            <small>{{ m.note }}</small>
          </button>
        </div>
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

    <!-- 4. perks: each player in turn, the device handed over first -->
    <template v-else-if="step === 'perks' && perkChar">
      <section v-if="!handedOver" class="card handoff">
        <img :src="asset((perkChar.side === 'killer' ? killerById.get(perkChar.id) : survivorById.get(perkChar.id))?.images.mini)" alt="" />
        <h2>ส่งเครื่องให้{{ perkChar.who }}</h2>
        <p class="muted">แต่ง Perk ของ {{ (perkChar.side === 'killer' ? killerById.get(perkChar.id) : survivorById.get(perkChar.id))?.name }} — คนอื่นห้ามดูจอ ({{ perkTurn + 1 }}/{{ perkChars.length }})</p>
        <button type="button" class="primary big" @click="beginPerks">👁 ฉันคือ{{ perkChar.who }} — เริ่มแต่ง Perk</button>
      </section>
      <PerkLoadout
        v-else
        v-model="draft"
        :side="perkChar.side"
        :character-id="perkChar.id"
        :mode="mode"
        :who="perkChar.who"
        :choices="cardChoices(mode, perkChar, hands[perkChar.key])"
        :taken="perkTaken"
        :problem="perkProblem"
        :confirmed="false"
        @confirm="confirmPerks"
      />
    </template>

    <!-- 5. the map, and in -->
    <template v-else>
      <!-- the perks set, revealed together (p.19) -->
      <section v-if="mode !== 'adept'" class="card reveal">
        <h2>Perk ของทุกคน</h2>
        <div class="reveal-grid">
          <div v-for="c in perkChars" :key="c.key" class="reveal-row">
            <strong>{{ (c.side === 'killer' ? killerById.get(c.id) : survivorById.get(c.id))?.name }}</strong>
            <span class="muted">{{ perkNames(c) }}</span>
          </div>
        </div>
      </section>
      <MapPicker v-model="board" />
      <div class="actions">
        <button type="button" class="primary big" @click="start">เข้าสู่ Trial →</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.modes {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
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
.handoff {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 2rem 1rem;
  text-align: center;
}
.handoff img {
  width: 120px;
  height: 120px;
  border-radius: 50%;
}
.handoff h2 {
  margin: 0;
}
.reveal-grid {
  display: grid;
  gap: 0.4rem;
}
.reveal-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: baseline;
}
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
