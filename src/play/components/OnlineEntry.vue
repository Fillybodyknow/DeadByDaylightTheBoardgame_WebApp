<script setup lang="ts">
// Online play, laid out as a PC game's server browser: the player's card on top, the open rooms
// as a table on the left (filter, search, a dot per player), and on the right creating a room (a
// name, a random one on offer, and an optional password, in a dialog of its own) or joining one
// with its 4-letter code. A room with a password asks for it in a dialog too.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { cssUrl } from '../../i18n'
import { sfx } from '../../sound'
import ModalShell from './ModalShell.vue'
import { BOARD_STALE_MS, backend, createRoom, joinRoom, lastRoom, randomRoomName, savedName, session, sweepRooms } from '../online/session'
import type { RoomListing } from '../online/transport'

const name = ref(savedName())
const code = ref('')
const last = lastRoom()

/** The player's initial, on their card. */
const initial = computed(() => name.value.trim().charAt(0).toUpperCase() || '?')

// ---------- creating a room ----------

const creating = ref(false)
const roomName = ref(randomRoomName())
const password = ref('')
function openCreate() {
  sfx.click()
  session.error = ''
  roomName.value = randomRoomName()
  password.value = ''
  creating.value = true
}
/** The dice spin a moment when rolled. */
const rolling = ref(false)
function reroll() {
  sfx.click()
  roomName.value = randomRoomName()
  rolling.value = false
  requestAnimationFrame(() => (rolling.value = true))
}

async function create() {
  sfx.select()
  await createRoom(name.value.trim(), roomName.value, password.value)
  // in the room the page is replaced; if it failed the dialog stays, with the error
  if (!session.room) return
  creating.value = false
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
  if (session.room) askFor.value = null
}

function joinListed(r: RoomListing) {
  if (r.locked) return void askPassword(r.code)
  void join(r.code)
}

function askPassword(c: string) {
  sfx.click()
  session.error = ''
  joinPassword.value = ''
  askFor.value = c
}

// In a room, whichever way: the dialogs go at once, not when the last write of joining is done
watch(
  () => session.room,
  (room) => {
    if (!room) return
    askFor.value = null
    creating.value = false
  },
)

function closePassword() {
  askFor.value = null
  joinPassword.value = ''
  session.needPassword = null
  session.error = ''
}

function joinWithPassword() {
  if (!askFor.value || !joinPassword.value.trim()) return
  void join(askFor.value, joinPassword.value)
}

/** The room being asked about, as it is on the board (for its name in the dialog). */
const askedRoom = computed(() => rooms.value.find((r) => r.code === askFor.value))

/** The code as four boxes: one letter each, the next one to type lit. */
const codeBoxes = computed(() => Array.from({ length: 4 }, (_, i) => code.value.toUpperCase()[i] ?? ''))
const codeFocused = ref(false)
function onCode(e: Event) {
  const v = (e.target as HTMLInputElement).value.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase()
  code.value = v
  ;(e.target as HTMLInputElement).value = v
}

// ---------- the board ----------

const rooms = ref<RoomListing[]>([])
let unlist: (() => void) | null = null
const clock = ref(Date.now())
let tick: number | null = null
onMounted(() => {
  unlist = backend.listRooms((list) => {
    rooms.value = list
    sweepRooms(list)
  })
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

/** The table's filter and search. */
type Filter = 'all' | 'lobby' | 'playing'
const filter = ref<Filter>('all')
const query = ref('')
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'lobby', label: 'รอผู้เล่น' },
  { id: 'playing', label: 'กำลังเล่น' },
]
const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return board.value.filter(
    (r) =>
      (filter.value === 'all' || (filter.value === 'lobby' ? r.phase === 'lobby' : r.phase !== 'lobby')) &&
      (!q || [r.name, r.code, r.host].some((t) => (t ?? '').toLowerCase().includes(q))),
  )
})
const countOf = (f: Filter) => (f === 'all' ? board.value.length : board.value.filter((r) => (f === 'lobby' ? r.phase === 'lobby' : r.phase !== 'lobby')).length)
/** Everyone in a room on the board, for the header. */
const playersOnline = computed(() => board.value.reduce((n, r) => n + (r.members || 0), 0))
/** A room seats 5: the killer and four survivors. */
const SEATS = 5

/** How long ago a room last changed, roughly. */
function ago(t: number): string {
  const m = Math.max(0, Math.round((clock.value - t) / 60000))
  return m < 1 ? 'เมื่อกี้' : m < 60 ? `${m} นาทีก่อน` : `${Math.round(m / 60)} ชม.ก่อน`
}

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
  <div class="hub">
    <!-- the title strip, and the player's own card -->
    <header class="hub-head" :style="{ '--art': cssUrl('assets/app/background-img/background_dbd.webp') }">
      <div class="title">
        <p class="eyebrow">Online · Trials</p>
        <h1>เล่นออนไลน์</h1>
        <p class="sub">แต่ละคนเล่นบนเครื่องตัวเอง — เลือกห้องจากรายการ สร้างห้องใหม่ หรือเข้าด้วยรหัสห้อง</p>
      </div>
      <div class="stats" aria-label="สถานะ">
        <span class="stat"><b>{{ board.length }}</b> ห้องที่เปิด</span>
        <span class="stat"><b>{{ playersOnline }}</b> ผู้เล่นในห้อง</span>
        <span class="net" :class="backend.name"><i />{{ backend.name === 'local' ? 'โหมดทดสอบ' : 'ออนไลน์' }}</span>
      </div>
      <label class="player">
        <span class="avatar" aria-hidden="true">{{ initial }}</span>
        <span class="player-text">
          <small>ชื่อของคุณ</small>
          <input v-model="name" maxlength="16" placeholder="เช่น บิว" />
        </span>
        <span class="pen" aria-hidden="true">✎</span>
      </label>
    </header>

    <p v-if="backend.name === 'local'" class="notice warn">
      ยังไม่ได้ตั้งค่า Firebase: ห้องจะใช้ได้เฉพาะแท็บในเบราว์เซอร์นี้ (ไว้ทดสอบ — เปิดหลายแท็บแทนผู้เล่นแต่ละคน)
    </p>
    <!-- the host kicked this device out of a room -->
    <p v-if="session.kicked" class="notice error kicked">
      🚫 หัวห้องเตะคุณออกจากห้อง <b>{{ session.kicked }}</b> — เข้าห้องนั้นไม่ได้อีก
      <button type="button" @click="session.kicked = null">ปิด</button>
    </p>
    <!-- an error that is not about a dialog open now (no such room, a full one) -->
    <p v-if="session.error && !askFor && !creating" class="notice error">{{ session.error }}</p>

    <div class="hub-grid">
      <!-- the room browser -->
      <section class="panel browser">
        <header class="panel-head">
          <h2>ห้องที่เปิดอยู่</h2>
          <div class="filters" role="tablist">
            <button v-for="f in FILTERS" :key="f.id" type="button" role="tab" class="filter" :class="{ on: filter === f.id }" :aria-selected="filter === f.id" @click="filter = f.id">
              {{ f.label }} <small>{{ countOf(f.id) }}</small>
            </button>
          </div>
          <input v-model="query" class="search" type="search" placeholder="🔍 ค้นหาห้อง / รหัส / หัวห้อง" />
        </header>

        <div class="table" role="table">
          <div class="thead" role="row">
            <span role="columnheader">ห้อง</span>
            <span role="columnheader">หัวห้อง</span>
            <span role="columnheader">ผู้เล่น</span>
            <span role="columnheader">สถานะ</span>
            <span role="columnheader" />
          </div>

          <!-- nobody yet: a radar sweeping for rooms -->
          <div v-if="!shown.length" class="empty">
            <span class="radar" aria-hidden="true"><i /></span>
            <p v-if="board.length">ไม่มีห้องที่ตรงกับที่ค้นหา</p>
            <template v-else>
              <p>ยังไม่มีห้องเปิดอยู่</p>
              <small class="muted">สร้างห้องแรกได้เลย แล้วส่งรหัสให้เพื่อน</small>
            </template>
          </div>

          <TransitionGroup v-else name="row" tag="ul" class="rows">
            <li
              v-for="(r, i) in shown"
              :key="r.code"
              class="row"
              :class="[r.phase, { asking: askFor === r.code }]"
              :style="{ '--i': i }"
              role="row"
              @dblclick="joinListed(r)"
            >
              <span class="cell room" role="cell">
                <strong class="room-name"><span v-if="r.locked" class="lock" title="ต้องใช้รหัสผ่าน">🔒</span>{{ r.name }}</strong>
                <small class="muted">รหัส {{ r.code }} · {{ ago(r.updatedAt) }}</small>
              </span>
              <span class="cell host" role="cell">{{ r.host || '—' }}</span>
              <span class="cell seats" role="cell" :title="`${r.members}/${SEATS} คน`">
                <i v-for="n in SEATS" :key="n" :class="{ on: n <= r.members }" />
                <small>{{ r.members }}/{{ SEATS }}</small>
              </span>
              <span class="cell" role="cell"><span class="phase" :class="r.phase">{{ PHASE_TH[r.phase] }}</span></span>
              <span class="cell go" role="cell">
                <button :class="{ primary: r.phase === 'lobby' }" :disabled="session.busy" @click="joinListed(r)">
                  {{ r.phase === 'game' ? 'เข้าไปดู' : 'เข้าร่วม' }}
                </button>
              </span>
            </li>
          </TransitionGroup>
        </div>
        <p class="tip muted">ดับเบิลคลิกแถวเพื่อเข้าห้อง · ห้องที่เงียบนานจะหายจากรายการเอง</p>
      </section>

      <div class="side-col">
        <!-- a new room: the form is a dialog -->
        <section class="panel create">
          <header class="panel-head"><h2>สร้างห้องใหม่</h2></header>
          <p class="muted small">ตั้งชื่อห้อง ใส่รหัสผ่านถ้าต้องการ แล้วส่งรหัสห้องให้เพื่อน</p>
          <button class="primary cta" :disabled="session.busy" @click="openCreate"><span>＋ สร้างห้อง</span></button>
        </section>

        <!-- by code: four boxes over one input -->
        <section class="panel bycode">
          <header class="panel-head"><h2>เข้าด้วยรหัสห้อง</h2></header>
          <label class="code-boxes" :class="{ focus: codeFocused }">
            <span v-for="(ch, i) in codeBoxes" :key="i" class="box" :class="{ filled: ch, next: codeFocused && i === Math.min(code.length, 3) }">{{ ch }}</span>
            <input
              class="code-input"
              :value="code"
              maxlength="4"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              aria-label="รหัสห้อง 4 ตัว"
              @input="onCode"
              @focus="codeFocused = true"
              @blur="codeFocused = false"
              @keyup.enter="join()"
            />
          </label>
          <button class="cta-2" :class="{ primary: code.length === 4 }" :disabled="session.busy || code.length !== 4" @click="join()">เข้าห้อง</button>
          <button v-if="last" class="link" :disabled="session.busy" @click="join(last)">↩ กลับเข้าห้องล่าสุด ({{ last }})</button>
        </section>
      </div>
    </div>

    <!-- creating a room -->
    <ModalShell :open="creating" title="สร้างห้องใหม่" @close="creating = false">
      <label class="field">
        <small>ชื่อห้อง</small>
        <span class="with-roll">
          <input v-model="roomName" maxlength="40" placeholder="ชื่อห้อง" @keyup.enter="create" />
          <button type="button" class="roll" :class="{ spin: rolling }" title="สุ่มชื่อห้อง" @click="reroll" @animationend="rolling = false">🎲</button>
        </span>
      </label>
      <label class="field">
        <small>รหัสผ่าน (ไม่บังคับ)</small>
        <input v-model="password" type="password" maxlength="20" placeholder="ว่างไว้ = ใครก็เข้าได้" autocomplete="new-password" @keyup.enter="create" />
      </label>
      <p v-if="session.error" class="notice error">{{ session.error }}</p>
      <template #footer>
        <button type="button" @click="creating = false">ยกเลิก</button>
        <button type="button" class="primary" :disabled="session.busy" @click="create">{{ password ? '🔒 ' : '' }}สร้างห้อง</button>
      </template>
    </ModalShell>

    <!-- a room with a password: from the table, a code or an invite link -->
    <ModalShell :open="!!askFor" title="🔒 ห้องนี้ต้องใช้รหัสผ่าน" width="400px" @close="closePassword">
      <p class="ask-room">
        <b>{{ askedRoom?.name || 'ห้อง' }}</b>
        <small class="muted">รหัสห้อง {{ askFor }}</small>
      </p>
      <input v-model="joinPassword" type="password" maxlength="20" placeholder="รหัสผ่านห้อง" autocomplete="off" @keyup.enter="joinWithPassword" />
      <p v-if="session.error" class="notice error">{{ session.error }}</p>
      <template #footer>
        <button type="button" @click="closePassword">ยกเลิก</button>
        <button type="button" class="primary" :disabled="session.busy || !joinPassword.trim()" @click="joinWithPassword">เข้าห้อง</button>
      </template>
    </ModalShell>
  </div>
</template>

<style scoped>
.hub {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  max-width: 1320px;
  margin: 0 auto;
  animation: hub-in 0.45s ease-out both;
}
@keyframes hub-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

/* ---------- the title strip ---------- */
.hub-head {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas:
    'title player'
    'stats player';
  align-items: end;
  gap: 0.6rem 1.5rem;
  padding: 1.4rem 1.6rem;
  border: 1px solid var(--line-strong);
  border-left: 3px solid var(--blood);
  background:
    linear-gradient(90deg, rgb(5 6 8 / 0.95) 0%, rgb(5 6 8 / 0.6) 50%, rgb(5 6 8 / 0.3) 100%),
    var(--art) center 30% / cover;
  box-shadow: 0 12px 40px rgb(0 0 0 / 0.6);
  overflow: hidden;
}
/* a slow red sweep across the strip, The Entity passing by */
.hub-head::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, transparent 40%, rgb(255 40 40 / 0.1) 50%, transparent 60%);
  transform: translateX(-100%);
  animation: sweep 7s ease-in-out infinite;
  pointer-events: none;
}
@keyframes sweep {
  60%,
  100% {
    transform: translateX(100%);
  }
}
.title {
  grid-area: title;
}
.eyebrow {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.8rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--blood-bright);
}
.title h1 {
  margin: 0.1rem 0 0;
  font-size: 2.6rem;
  line-height: 1.1;
  text-shadow: 0 2px 14px rgb(0 0 0 / 0.9);
}
.sub {
  margin: 0.35rem 0 0;
  color: #cfcac0;
}
.stats {
  grid-area: stats;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1.2rem;
  font-size: 0.9rem;
  color: var(--muted);
}
.stat b {
  font-family: var(--font-display);
  font-size: 1.25rem;
  color: var(--text);
  margin-right: 0.2rem;
}
.net {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.1rem 0.6rem;
  border: 1px solid rgb(79 179 106 / 0.5);
  color: var(--ok);
  font-family: var(--font-display);
  font-size: 0.8rem;
  letter-spacing: 0.05em;
}
.net.local {
  border-color: rgb(217 162 39 / 0.5);
  color: var(--warn);
}
.net i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 8px currentColor;
  animation: blink 1.6s ease-in-out infinite;
}
@keyframes blink {
  50% {
    opacity: 0.35;
  }
}

/* the player's card: their initial in a ring, the name editable in place */
.player {
  grid-area: player;
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 270px;
  padding: 0.7rem 0.9rem;
  background: rgb(8 9 12 / 0.85);
  border: 1px solid var(--line-strong);
  cursor: text;
  transition: border-color 0.15s;
}
.player:hover,
.player:focus-within {
  border-color: var(--blood);
}
.avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  font-family: var(--font-display);
  font-size: 1.5rem;
  color: #fff;
  background: radial-gradient(circle at 35% 30%, #4a0d10, #12080a);
  box-shadow:
    0 0 0 2px var(--blood),
    0 0 16px rgb(255 30 30 / 0.45);
}
.player-text {
  display: grid;
  min-width: 0;
}
.player-text small {
  color: var(--muted);
  font-size: 0.75rem;
}
.player-text input {
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-display);
  font-size: 1.2rem;
  color: var(--text);
  outline: none;
}
.pen {
  color: var(--muted);
}

/* ---------- notices ---------- */
.notice {
  margin: 0;
  padding: 0.55rem 0.8rem;
  border: 1px solid var(--line-strong);
  background: rgb(8 9 12 / 0.8);
}
.notice.warn {
  border-color: rgb(217 162 39 / 0.5);
  color: var(--warn);
  font-size: 0.9rem;
}
.notice.error {
  border-color: var(--blood);
  color: var(--blood-bright);
}
.kicked {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.kicked button {
  margin-left: auto;
}
.ask-room {
  display: grid;
  margin: 0;
}
.ask-room b {
  font-size: 1.1rem;
}
.small {
  font-size: 0.85rem;
  margin: 0;
}

/* ---------- panels ---------- */
.hub-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 0.9rem;
  align-items: start;
}
.side-col {
  display: grid;
  gap: 0.9rem;
}
.panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 1rem 1.1rem 1.1rem;
  background: rgb(10 11 14 / 0.88);
  border: 1px solid var(--line-strong);
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.5);
}
/* a red notch on each panel's top-left, as the game's menus */
.panel::before {
  content: '';
  position: absolute;
  top: -1px;
  left: -1px;
  width: 42px;
  height: 3px;
  background: var(--blood);
  box-shadow: 0 0 10px var(--blood);
}
.panel-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem 1rem;
}
.panel-head h2 {
  margin: 0;
  font-size: 1.15rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
input {
  font: inherit;
  color: var(--text);
  background: rgb(0 0 0 / 0.5);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  padding: 0.5rem 0.7rem;
  transition: border-color 0.15s;
}
input:focus {
  border-color: var(--blood);
  outline: none;
}

/* ---------- the browser ---------- */
.filters {
  display: inline-flex;
  border: 1px solid var(--line-strong);
}
.filter {
  padding: 0.3rem 0.8rem;
  border: none;
  border-radius: 0;
  background: none;
  font-size: 0.9rem;
}
.filter + .filter {
  border-left: 1px solid var(--line-strong);
}
.filter small {
  margin-left: 0.2rem;
  color: var(--muted);
}
.filter.on {
  background: var(--blood);
  color: #fff;
}
.filter.on small {
  color: #ffd0d0;
}
.search {
  flex: 1;
  min-width: 12rem;
  font-size: 0.9rem;
  padding: 0.35rem 0.7rem;
}
.table {
  display: flex;
  flex-direction: column;
  min-height: 300px;
}
/* the columns: room, host, seats, state, button */
.thead,
.row {
  display: grid;
  grid-template-columns: minmax(0, 2.2fr) minmax(0, 1fr) 150px 120px 112px;
  align-items: center;
  gap: 0.75rem;
}
.thead {
  padding: 0 0.8rem 0.4rem;
  border-bottom: 1px solid var(--line-strong);
  font-family: var(--font-display);
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  max-height: 58vh;
  overflow-y: auto;
}
.row {
  position: relative;
  padding: 0.6rem 0.8rem;
  border-bottom: 1px solid var(--line);
  background: linear-gradient(90deg, rgb(255 255 255 / 0.02), transparent);
  transition: background 0.15s;
  cursor: default;
  animation: row-in 0.35s ease-out both;
  animation-delay: calc(var(--i) * 45ms);
}
@keyframes row-in {
  from {
    opacity: 0;
    transform: translateX(-14px);
  }
}
/* pointed at: a red bar on the left and the row lit */
.row::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--blood);
  transform: scaleY(0);
  transition: transform 0.15s;
}
.row:hover {
  background: linear-gradient(90deg, rgb(200 20 29 / 0.16), rgb(200 20 29 / 0.03));
}
.row:hover::before,
.row.asking::before {
  transform: scaleY(1);
}
.row.game {
  opacity: 0.75;
}
.row.asking {
  background: rgb(217 162 39 / 0.08);
}
.row-enter-from,
.row-leave-to {
  opacity: 0;
  transform: translateX(-14px);
}
.row-leave-active {
  transition: all 0.25s;
  position: absolute;
}
.cell {
  min-width: 0;
}
.room {
  display: grid;
}
.room-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1.02rem;
}
.lock {
  margin-right: 0.3rem;
}
.room small {
  font-size: 0.8rem;
}
.host {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #cfcac0;
}
/* a dot per seat: lit for each player in the room */
.seats {
  display: flex;
  align-items: center;
  gap: 4px;
}
.seats i {
  width: 12px;
  height: 12px;
  transform: rotate(45deg);
  border: 1px solid var(--line-strong);
  background: rgb(255 255 255 / 0.04);
}
.seats i.on {
  border-color: var(--blood-bright);
  background: var(--blood);
  box-shadow: 0 0 6px rgb(255 40 40 / 0.6);
}
.seats small {
  margin-left: 0.35rem;
  color: var(--muted);
  font-size: 0.8rem;
}
.phase {
  display: inline-block;
  padding: 0.05rem 0.55rem;
  border: 1px solid var(--line-strong);
  color: var(--muted);
  font-size: 0.78rem;
  white-space: nowrap;
}
.phase.lobby {
  border-color: var(--ok);
  color: var(--ok);
}
.phase.pick {
  border-color: var(--warn);
  color: var(--warn);
}
.phase.game {
  border-color: var(--blood);
  color: #ff9a9a;
}
.go button {
  width: 100%;
  padding: 0.4rem 0.6rem;
}
.tip {
  margin: 0;
  font-size: 0.8rem;
}

/* nothing on the board: a radar sweeping */
.empty {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 0.3rem;
  flex: 1;
  padding: 2.5rem 1rem;
  text-align: center;
}
.empty p {
  margin: 0.6rem 0 0;
  font-family: var(--font-display);
  font-size: 1.1rem;
}
.radar {
  position: relative;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  border: 1px solid rgb(255 59 48 / 0.4);
  background:
    radial-gradient(circle, transparent 30%, rgb(255 59 48 / 0.18) 31%, transparent 33%),
    radial-gradient(circle, transparent 62%, rgb(255 59 48 / 0.18) 63%, transparent 65%);
  overflow: hidden;
}
.radar i {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: conic-gradient(from 0deg, rgb(255 59 48 / 0.55), transparent 25%);
  animation: radar 2.4s linear infinite;
}
@keyframes radar {
  to {
    transform: rotate(360deg);
  }
}

/* ---------- create, and by code ---------- */
.field {
  display: grid;
  gap: 0.25rem;
}
.field small {
  color: var(--muted);
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
  font-size: 1.1rem;
}
.roll.spin {
  animation: dice 0.45s ease-out;
}
@keyframes dice {
  40% {
    transform: rotate(200deg) scale(1.2);
  }
  to {
    transform: rotate(360deg);
  }
}
/* the main call to action: a light sweeps across on hover */
.cta {
  overflow: hidden;
  padding: 0.85rem;
  font-size: 1.15rem;
}
.cta span {
  position: relative;
  z-index: 1;
}
.cta::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, transparent 30%, rgb(255 255 255 / 0.35) 50%, transparent 70%);
  transform: translateX(-120%);
}
.cta:hover:not(:disabled)::after {
  transition: transform 0.6s ease;
  transform: translateX(120%);
}
.code-boxes {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
  cursor: text;
}
.box {
  display: grid;
  place-items: center;
  height: 64px;
  border: 1px solid var(--line-strong);
  background: rgb(0 0 0 / 0.5);
  font-family: var(--font-display);
  font-size: 2rem;
  color: var(--blood-bright);
  text-shadow: 0 0 12px rgb(255 40 40 / 0.5);
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.box.filled {
  border-color: rgb(255 59 48 / 0.6);
  animation: pop 0.18s ease-out;
}
@keyframes pop {
  50% {
    transform: scale(1.08);
  }
}
.box.next {
  border-color: var(--blood-bright);
  box-shadow: 0 0 0 1px var(--blood-bright) inset;
  animation: caret 1s steps(1) infinite;
}
@keyframes caret {
  50% {
    box-shadow: none;
  }
}
/* the real input lies over the boxes, invisible: typing, pasting and the keyboard all work */
.code-input {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  border: none;
  text-transform: uppercase;
}
.cta-2 {
  padding: 0.65rem;
  font-size: 1.05rem;
}
.link {
  align-self: flex-start;
  background: none;
  border: none;
  color: var(--muted);
  padding: 0;
  font-family: inherit;
}
.link:hover:not(:disabled) {
  color: var(--text);
}

@media (max-width: 1100px) {
  .hub-grid {
    grid-template-columns: 1fr;
  }
  .side-col {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 760px) {
  .hub-head {
    grid-template-columns: 1fr;
    grid-template-areas: 'title' 'stats' 'player';
  }
  .side-col {
    grid-template-columns: 1fr;
  }
  .thead {
    display: none;
  }
  .row {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .host,
  .seats {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .hub,
  .row,
  .hub-head::after,
  .radar i,
  .net i,
  .box.filled,
  .box.next {
    animation: none;
  }
}
</style>
