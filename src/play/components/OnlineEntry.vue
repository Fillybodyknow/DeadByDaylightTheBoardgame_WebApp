<script setup lang="ts">
// Online play: the room board (open rooms to join), creating a room (a name, a random one on
// offer, and an optional password), or joining one with its 4-letter code.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { asset } from '../../i18n'
import { sfx } from '../../sound'
import { BOARD_STALE_MS, backend, createRoom, joinRoom, lastRoom, randomRoomName, savedName, session } from '../online/session'
import type { RoomListing } from '../online/transport'

const name = ref(savedName())
const code = ref('')
const last = lastRoom()

// ---------- creating a room ----------

const roomName = ref(randomRoomName())
const password = ref('')
function reroll() {
  sfx.click()
  roomName.value = randomRoomName()
}

async function create() {
  sfx.select()
  await createRoom(name.value.trim(), roomName.value, password.value)
}

// ---------- joining ----------

/** The room whose password is being typed (from the board, a code or an invite link). */
const askFor = ref<string | null>(null)
const joinPassword = ref('')
watch(
  () => session.needPassword,
  (c) => {
    if (c) askFor.value = c
  },
)

async function join(c = code.value, pw = '') {
  if (!c.trim()) return
  sfx.select()
  await joinRoom(c, name.value.trim(), pw)
}

function joinListed(r: RoomListing) {
  if (r.locked) {
    sfx.click()
    session.error = ''
    askFor.value = askFor.value === r.code ? null : r.code
    joinPassword.value = ''
    return
  }
  void join(r.code)
}

function joinWithPassword() {
  if (!askFor.value || !joinPassword.value.trim()) return
  void join(askFor.value, joinPassword.value)
}

// ---------- the board ----------

const rooms = ref<RoomListing[]>([])
let unlist: (() => void) | null = null
const clock = ref(Date.now())
let tick: number | null = null
onMounted(() => {
  unlist = backend.listRooms((list) => (rooms.value = list))
  tick = window.setInterval(() => (clock.value = Date.now()), 30000)
})
onBeforeUnmount(() => {
  unlist?.()
  if (tick !== null) clearInterval(tick)
})

const PHASE_ORDER = { lobby: 0, pick: 1, game: 2 } as const
/** Open rooms: the ones still gathering first, newest first; long-quiet ones left out. */
const board = computed(() =>
  rooms.value
    .filter((r) => r && r.code && clock.value - r.updatedAt < BOARD_STALE_MS)
    .sort((a, b) => PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] || b.updatedAt - a.updatedAt),
)
const PHASE_TH = { lobby: 'รอผู้เล่น', pick: 'เลือกตัวละคร', game: 'กำลังเล่น' } as const

// #/online?room=ABCD in an invite link joins straight away
const route = useRoute()
const router = useRouter()
onMounted(() => {
  const fromLink = route.query.room
  if (typeof fromLink !== 'string' || !fromLink) return
  void router.replace({ query: {} })
  void join(fromLink)
})
</script>

<template>
  <section class="hero" :style="{ backgroundImage: `url(${asset('assets/app/background-img/background_dbd.webp')})` }">
    <div class="hero-text">
      <h1>เล่นออนไลน์</h1>
      <p>แต่ละคนเล่นบนเครื่องตัวเอง — เลือกห้องจากบอร์ด สร้างห้องใหม่ หรือเข้าด้วยรหัสห้อง</p>
    </div>
  </section>

  <section class="card online">
    <p v-if="backend.name === 'local'" class="warn">
      ยังไม่ได้ตั้งค่า Firebase: ห้องจะใช้ได้เฉพาะแท็บในเบราว์เซอร์นี้ (ไว้ทดสอบ — เปิดหลายแท็บแทนผู้เล่นแต่ละคน)
    </p>
    <label class="field">
      ชื่อของคุณ
      <input v-model="name" maxlength="16" placeholder="เช่น บิว" />
    </label>
    <p v-if="session.error" class="error">{{ session.error }}</p>
    <!-- a password asked for a room joined by its code or an invite link (the board asks in its row) -->
    <div v-if="askFor && !board.some((r) => r.code === askFor)" class="pw-ask">
      <span>🔒 ห้อง <b>{{ askFor }}</b> ต้องใช้รหัสผ่าน</span>
      <input v-model="joinPassword" type="password" maxlength="20" placeholder="รหัสผ่านห้อง" @keyup.enter="joinWithPassword" />
      <button class="primary" :disabled="session.busy || !joinPassword.trim()" @click="joinWithPassword">เข้าห้อง</button>
    </div>
  </section>

  <div class="columns">
    <!-- the room board -->
    <section class="card board">
      <header>
        <h2>ห้องที่เปิดอยู่</h2>
        <span class="muted small">{{ board.length ? `${board.length} ห้อง` : '' }}</span>
      </header>
      <p v-if="!board.length" class="muted empty">ยังไม่มีห้องเปิดอยู่ — สร้างห้องใหม่ได้เลย</p>
      <ul v-else class="rooms">
        <li v-for="r in board" :key="r.code" :class="[r.phase, { asking: askFor === r.code }]">
          <div class="room-main">
            <strong class="room-name">{{ r.locked ? '🔒 ' : '' }}{{ r.name }}</strong>
            <span class="muted small">รหัส {{ r.code }} · หัวห้อง {{ r.host || '—' }} · {{ r.members }} คน</span>
          </div>
          <span class="phase" :class="r.phase">{{ PHASE_TH[r.phase] }}</span>
          <button :class="{ primary: r.phase === 'lobby' }" :disabled="session.busy" @click="joinListed(r)">
            {{ r.phase === 'game' ? 'เข้าไปดู' : 'เข้าร่วม' }}
          </button>
          <div v-if="askFor === r.code" class="pw-row">
            <input v-model="joinPassword" type="password" maxlength="20" placeholder="รหัสผ่านห้อง" @keyup.enter="joinWithPassword" />
            <button class="primary" :disabled="session.busy || !joinPassword.trim()" @click="joinWithPassword">ยืนยัน</button>
          </div>
        </li>
      </ul>
    </section>

    <div class="side-col">
      <!-- a new room -->
      <section class="card create">
        <h2>สร้างห้องใหม่</h2>
        <label class="field wide">
          ชื่อห้อง
          <span class="with-roll">
            <input v-model="roomName" maxlength="40" placeholder="ชื่อห้อง" />
            <button type="button" class="roll" title="สุ่มชื่อห้อง" @click="reroll">🎲</button>
          </span>
        </label>
        <label class="field wide">
          รหัสผ่าน (ไม่บังคับ)
          <input v-model="password" type="password" maxlength="20" placeholder="ว่างไว้ = ใครก็เข้าได้" />
        </label>
        <button class="primary" :disabled="session.busy" @click="create">สร้างห้อง</button>
      </section>

      <!-- by code -->
      <section class="card bycode">
        <h2>เข้าด้วยรหัสห้อง</h2>
        <div class="row">
          <input v-model="code" class="code" maxlength="4" placeholder="รหัส" @keyup.enter="join()" />
          <button :disabled="session.busy || code.trim().length !== 4" @click="join()">เข้าห้อง</button>
        </div>
        <button v-if="last" class="link" :disabled="session.busy" @click="join(last)">กลับเข้าห้องล่าสุด ({{ last }})</button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.hero {
  position: relative;
  display: flex;
  align-items: flex-end;
  min-height: 200px;
  margin-bottom: 1rem;
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
    min-height: 160px;
    padding: 1rem;
  }
  .hero h1 {
    font-size: 1.6rem;
  }
}
.online {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.online h2 {
  margin: 0;
}
.online p {
  margin: 0;
}
.warn {
  color: var(--warn);
  font-size: 0.9rem;
}
.error {
  color: var(--blood-bright);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-width: 260px;
}
input {
  font: inherit;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  padding: 0.45rem 0.7rem;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.code {
  width: 7.5rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-family: var(--font-display);
}
.link {
  align-self: flex-start;
  background: none;
  border: none;
  color: var(--muted);
  text-decoration: underline;
  padding: 0;
}
.columns {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  gap: 1rem;
  margin-top: 1rem;
  align-items: start;
}
@media (max-width: 860px) {
  .columns {
    grid-template-columns: 1fr;
  }
}
.side-col {
  display: grid;
  gap: 1rem;
}
.board header {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
}
.board h2,
.create h2,
.bycode h2 {
  margin: 0 0 0.6rem;
}
.empty {
  margin: 0.4rem 0;
}
.rooms {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
  max-height: 60vh;
  overflow-y: auto;
}
.rooms li {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgb(0 0 0 / 0.25);
}
.rooms li.lobby {
  border-color: rgb(217 162 39 / 0.45);
}
.rooms li.asking {
  box-shadow: 0 0 0 1px var(--warn) inset;
}
.room-main {
  display: grid;
  min-width: 0;
}
.room-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.phase {
  padding: 0.05rem 0.55rem;
  border-radius: 99px;
  font-size: 0.78rem;
  border: 1px solid var(--line-strong);
  color: var(--muted);
  white-space: nowrap;
}
.phase.lobby {
  border-color: var(--ok);
  color: var(--ok);
}
.phase.game {
  border-color: var(--blood);
  color: #ff9a9a;
}
.pw-row {
  grid-column: 1 / -1;
  display: flex;
  gap: 0.5rem;
}
.pw-row input {
  flex: 1;
}
.pw-ask {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--warn);
  border-radius: var(--radius);
}
.create,
.bycode {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.field.wide {
  max-width: none;
}
.with-roll {
  display: flex;
  gap: 0.4rem;
}
.with-roll input {
  flex: 1;
  min-width: 0;
}
.roll {
  padding: 0.35rem 0.6rem;
}
</style>
