<script setup lang="ts">
// The looking-for-players chat (#/lfg, online/lfg.ts): one public channel for finding people to
// play with. The chat on the left, a message with a room as a card that joins it; on the right who
// is here and the rooms waiting for players. A room (the one this device is in, or its last one
// while it still gathers) can be attached to a message, with the side it lacks.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { settings } from '../../settings'
import { sfx } from '../../sound'
import { LFG_HERE_FRESH_MS, LFG_HERE_REFRESH_MS, LFG_NEEDS, LFG_TEXT_MAX, lfgId, lfgWait, lobbyLacks, mutedSenders, needLabel, sendLfg, setMuted, sweepLfg, type LfgNeed } from '../online/lfg'
import { backend, lastRoom, session, BOARD_STALE_MS } from '../online/session'
import type { LfgHere, LfgMessage, RoomListing } from '../online/transport'
import { nameOrDefault, playerName, withName } from '../../profile'

const router = useRouter()
const me = lfgId()
/** The player's name is their profile's (the top bar). */
const myName = nameOrDefault

// ---------- the feed, who is here, the rooms ----------

const messages = ref<LfgMessage[]>([])
const here = ref<Record<string, LfgHere>>({})
const rooms = ref<RoomListing[]>([])
const clock = ref(Date.now())
const offs: (() => void)[] = []
let loaded = false
let refresh: number | undefined
let tick: number | undefined

onMounted(() => {
  if (backend.onLfgChat)
    offs.push(
      backend.onLfgChat((list) => {
        // a soft blip for someone else's message (not the ones there on opening, nor a hidden sender's)
        if (loaded && list.some((m) => !known.has(m.id) && m.from !== me && !muted.value.has(m.from))) sfx.chat()
        known = new Set(list.map((m) => m.id))
        loaded = true
        messages.value = list
      }),
    )
  if (backend.onLfgHere) offs.push(backend.onLfgHere((h) => (here.value = h)))
  offs.push(backend.listRooms((list) => (rooms.value = list)))
  sweepLfg()
  beHere()
  refresh = window.setInterval(beHere, LFG_HERE_REFRESH_MS)
  tick = window.setInterval(() => (clock.value = Date.now()), 30_000)
  window.addEventListener('pagehide', leave)
  // rooms announced here are told on other pages too, in the background as a system notice: the
  // browser asks for the permission only after a tap, so on the first one
  window.addEventListener('pointerdown', askNotify, { once: true })
})
const askNotify = () => {
  if (settings.lfgNotify && 'Notification' in window && Notification.permission === 'default') void Notification.requestPermission()
}
onBeforeUnmount(() => {
  offs.forEach((off) => off())
  clearInterval(refresh)
  clearInterval(tick)
  window.removeEventListener('pagehide', leave)
  window.removeEventListener('pointerdown', askNotify)
  leave()
})
let known = new Set<string>()

const beHere = () => void backend.lfgHere?.(me, myName()).catch(() => {})
const leave = () => void backend.lfgHere?.(me, null).catch(() => {})
// renamed in the profile: the list shows the new name
watch(playerName, beHere)

/** Who is on the page now (an entry not refreshed for a while is a closed tab). */
const people = computed(() =>
  Object.entries(here.value)
    .filter(([, h]) => h && clock.value - h.at < LFG_HERE_FRESH_MS)
    .map(([id, h]) => ({ id, name: h.name }))
    .sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : a.name.localeCompare(b.name, 'th'))),
)

/** Rooms on the board still gathering, newest first. */
const waiting = computed(() =>
  rooms.value.filter((r) => r?.code && r.phase === 'lobby' && clock.value - r.updatedAt < BOARD_STALE_MS).sort((a, b) => b.updatedAt - a.updatedAt),
)
const roomOf = (code: string) => rooms.value.find((r) => r.code === code && clock.value - r.updatedAt < BOARD_STALE_MS)

// ---------- hiding a sender ----------

const muted = ref(mutedSenders())
function mute(from: string) {
  sfx.click()
  muted.value = new Set([...muted.value, from])
  setMuted(muted.value)
}
function unmuteAll() {
  sfx.click()
  muted.value = new Set()
  setMuted(muted.value)
}
const shown = computed(() => messages.value.filter((m) => !muted.value.has(m.from)))
const hiddenSenders = computed(() => new Set(messages.value.filter((m) => muted.value.has(m.from)).map((m) => m.from)).size)

// ---------- joining a room ----------

/** This device's room now, if any. */
const inRoom = computed(() => session.room?.code ?? null)
function joinLabel(code: string): string {
  const r = roomOf(code)
  if (!r) return 'ห้องปิดแล้ว'
  if (code === inRoom.value) return 'กลับห้องคุณ'
  if (inRoom.value) return 'คุณอยู่ในห้องอื่น'
  if (r.phase !== 'lobby') return 'กำลังเล่นแล้ว'
  return r.locked ? '🔒 เข้าห้อง' : 'เข้าห้อง'
}
function canJoin(code: string): boolean {
  const r = roomOf(code)
  return !!r && (code === inRoom.value || (!inRoom.value && r.phase === 'lobby'))
}
function join(code: string) {
  if (!canJoin(code)) return
  sfx.select()
  // the online page joins a room from an invite link: a password is asked there
  void router.push(code === inRoom.value ? '/online' : { path: '/online', query: { room: code } })
}

// ---------- writing ----------

const draft = ref('')
const error = ref('')
const wait = ref(0)
let waitTimer: number | undefined
let errorTimer: number | undefined
const busy = ref(false)

/** The room that can go with a message: the one this device is in, while gathering; else its last one, if still gathering. */
const attachable = computed<RoomListing | null>(() => {
  const code = inRoom.value ?? lastRoom()
  const r = code ? roomOf(code) : undefined
  return r && r.phase === 'lobby' ? r : null
})
const attach = ref(false)
const need = ref<LfgNeed>('any')
watch(attach, (on) => {
  if (!on) return
  // in the room: start from what it lacks
  need.value = inRoom.value && session.data ? lobbyLacks(session.data.members) : 'any'
})
watch(attachable, (r) => {
  if (!r) attach.value = false
})

function countDown() {
  clearInterval(waitTimer)
  const step = () => {
    wait.value = Math.ceil(lfgWait() / 1000)
    if (!wait.value) clearInterval(waitTimer)
  }
  step()
  waitTimer = window.setInterval(step, 250)
}

/** Everyone sees who wrote: the profile asks for a name first. */
function send() {
  const room = attach.value ? attachable.value?.code : undefined
  if (!draft.value.trim() && !room) return
  withName(() => void post(room))
}

async function post(room: string | undefined) {
  busy.value = true
  try {
    await sendLfg({ name: myName(), text: draft.value, room, need: need.value })
    draft.value = ''
    attach.value = false
    error.value = ''
  } catch (e) {
    error.value = (e as Error).message
    clearTimeout(errorTimer)
    errorTimer = window.setTimeout(() => (error.value = ''), 5000)
  } finally {
    busy.value = false
    countDown()
  }
}
onBeforeUnmount(() => {
  clearInterval(waitTimer)
  clearTimeout(errorTimer)
})

// ---------- the list's scroll ----------

const list = ref<HTMLElement | null>(null)
/** Stay at the newest message, unless the reader scrolled up to read older ones. */
let atBottom = true
const onScroll = () => {
  const el = list.value
  if (el) atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
}
watch(
  () => shown.value.length,
  async () => {
    if (!atBottom) return
    await nextTick()
    list.value?.scrollTo({ top: list.value.scrollHeight })
  },
)

// ---------- how things look ----------

/** A sender's colour, from their chat id. */
function hue(from: string): number {
  let h = 0
  for (const c of from) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}
const time = (at: number) => new Date(at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
const day = (at: number) => new Date(at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
/** A date line before the first message of each day. */
const newDay = (i: number) => i === 0 || day(shown.value[i - 1].at) !== day(shown.value[i].at)
</script>

<template>
  <div class="lfg-page">
    <header class="head">
      <div class="title">
        <p class="eyebrow">Online · หาเพื่อนเล่น</p>
        <h1>ห้องหาผู้เล่น</h1>
        <p class="sub">แชตสาธารณะ ทุกคนเห็นทุกข้อความ — คุยหาเพื่อนเล่น แล้วแนบห้องให้คนกดเข้าได้ทันที</p>
      </div>
    </header>

    <p v-if="backend.name === 'local'" class="notice warn">ยังไม่ได้ตั้งค่า Firebase: แชตนี้ใช้ได้เฉพาะแท็บในเบราว์เซอร์นี้ (ไว้ทดสอบ)</p>

    <div class="grid">
      <!-- the chat -->
      <section class="panel chat" aria-label="แชตหาผู้เล่น">
        <ol ref="list" class="msgs" @scroll="onScroll">
          <li v-if="!shown.length" class="empty muted">ยังไม่มีข้อความ — ทักทายก่อนเลย หรือแนบห้องของคุณเพื่อหาคนเข้า</li>
          <template v-for="(m, i) in shown" :key="m.id">
            <li v-if="newDay(i)" class="day"><span>{{ day(m.at) }}</span></li>
            <li class="msg" :class="{ mine: m.from === me }" :style="{ '--hue': hue(m.from) }">
              <div class="meta">
                <b class="who">{{ m.from === me ? `${m.name} (คุณ)` : m.name }}</b>
                <time>{{ time(m.at) }}</time>
                <button v-if="m.from !== me" type="button" class="hide" title="ซ่อนข้อความของคนนี้ (บนเครื่องนี้)" @click="mute(m.from)">ซ่อน</button>
              </div>
              <p v-if="m.text" class="text">{{ m.text }}</p>
              <!-- a room with the message: joined from here while it gathers -->
              <div v-if="m.room" class="room-card" :class="{ gone: !canJoin(m.room) }">
                <span class="room-ico" aria-hidden="true">🏠</span>
                <span class="room-text">
                  <b>{{ roomOf(m.room)?.name ?? `ห้อง ${m.room}` }}</b>
                  <small class="muted">
                    รหัส {{ m.room }}<template v-if="roomOf(m.room)"> · {{ roomOf(m.room)!.members }} คน</template>
                    <template v-if="m.need"> · <span class="need" :class="m.need">{{ needLabel(m.need) }}</span></template>
                  </small>
                </span>
                <button type="button" :class="{ primary: canJoin(m.room) }" :disabled="!canJoin(m.room)" @click="join(m.room)">{{ joinLabel(m.room) }}</button>
              </div>
            </li>
          </template>
        </ol>

        <p v-if="hiddenSenders" class="hidden-note muted">
          ซ่อนข้อความจาก {{ hiddenSenders }} คนไว้ <button type="button" class="link" @click="unmuteAll">แสดงทั้งหมด</button>
        </p>

        <!-- a room going with the next message -->
        <div v-if="attach && attachable" class="attach">
          <span>🏠 แนบ <b>{{ attachable.name }}</b> <small class="muted">({{ attachable.code }})</small></span>
          <div class="needs" role="radiogroup" aria-label="ห้องนี้ขาด">
            <button v-for="n in LFG_NEEDS" :key="n" type="button" role="radio" :aria-checked="need === n" :class="[n, { on: need === n }]" @click="need = n">{{ needLabel(n) }}</button>
          </div>
          <button type="button" class="x" aria-label="ไม่แนบห้อง" @click="attach = false">✕</button>
        </div>

        <div class="composer">
          <button
            type="button"
            class="attach-btn"
            :class="{ on: attach }"
            :disabled="!attachable"
            :title="attachable ? 'แนบห้องของคุณไปกับข้อความ' : 'ต้องมีห้องที่รอผู้เล่นอยู่ก่อน (สร้างห้องที่หน้าเล่นออนไลน์)'"
            @click="attach = !attach"
          >
            🏠
          </button>
          <input v-model="draft" :maxlength="LFG_TEXT_MAX" :placeholder="attach ? 'ข้อความ (ไม่บังคับ) เช่น มือใหม่ก็มาได้' : 'พิมพ์หาเพื่อนเล่น… (Enter ส่ง)'" @keydown.enter="send" />
          <button type="button" class="primary send" :disabled="busy || wait > 0 || (!draft.trim() && !attach)" @click="send">{{ wait > 0 ? `รอ ${wait}` : 'ส่ง' }}</button>
        </div>
        <p v-if="error" class="error">{{ error }}</p>
        <p class="tip muted">ทุกคนที่เปิดหน้านี้เห็นข้อความของคุณ · ข้อความเก่ากว่า 1 วันหายเอง · ส่งได้ทุก 3 วินาที</p>
      </section>

      <div class="side">
        <section class="panel">
          <header class="panel-head">
            <h2>อยู่ที่นี่</h2>
            <span class="count"><i />{{ people.length }} คน</span>
          </header>
          <ul class="people">
            <li v-for="p in people" :key="p.id" :style="{ '--hue': hue(p.id) }">
              <span class="dot" />{{ p.name }}<small v-if="p.id === me" class="muted"> (คุณ)</small>
            </li>
          </ul>
        </section>

        <section class="panel">
          <header class="panel-head">
            <h2>ห้องที่รอผู้เล่น</h2>
            <span class="count">{{ waiting.length }}</span>
          </header>
          <p v-if="!waiting.length" class="muted small">ยังไม่มีห้องรอผู้เล่น</p>
          <ul v-else class="rooms">
            <li v-for="r in waiting" :key="r.code">
              <span class="room-text">
                <b>{{ r.locked ? '🔒 ' : '' }}{{ r.name }}</b>
                <small class="muted">{{ r.host }} · {{ r.members }} คน</small>
              </span>
              <button type="button" :class="{ primary: canJoin(r.code) }" :disabled="!canJoin(r.code)" @click="join(r.code)">{{ joinLabel(r.code) }}</button>
            </li>
          </ul>
          <RouterLink to="/online" class="to-online">＋ สร้างห้องที่หน้าเล่นออนไลน์</RouterLink>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lfg-page {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  max-width: 1320px;
  margin: 0 auto;
  animation: page-in 0.45s ease-out both;
}
@keyframes page-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 1rem 1.5rem;
  padding: 1.2rem 1.5rem;
  border: 1px solid var(--line-strong);
  border-left: 3px solid var(--blood);
  background: linear-gradient(90deg, rgb(5 6 8 / 0.95), rgb(5 6 8 / 0.6));
  box-shadow: 0 12px 40px rgb(0 0 0 / 0.6);
}
.title {
  flex: 1;
  min-width: 260px;
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
  font-size: 2.2rem;
  line-height: 1.1;
}
.sub {
  margin: 0.35rem 0 0;
  color: #cfcac0;
}
input {
  font: inherit;
  color: var(--text);
  background: rgb(0 0 0 / 0.5);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  padding: 0.55rem 0.7rem;
  outline: none;
}
input:focus {
  border-color: var(--blood);
}
.notice {
  margin: 0;
  padding: 0.55rem 0.8rem;
  border: 1px solid rgb(217 162 39 / 0.5);
  color: var(--warn);
  font-size: 0.9rem;
  background: rgb(8 9 12 / 0.8);
}
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 0.9rem;
  align-items: start;
}
.side {
  display: grid;
  gap: 0.9rem;
}
.panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1rem 1.1rem;
  background: rgb(10 11 14 / 0.9);
  border: 1px solid var(--line-strong);
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.5);
}
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
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}
.panel-head h2 {
  margin: 0;
  font-size: 1.1rem;
  letter-spacing: 0.04em;
}
.count {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--muted);
  font-size: 0.85rem;
}
.count i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ok);
  box-shadow: 0 0 8px var(--ok);
}

/* ---------- the chat ---------- */
.msgs {
  list-style: none;
  margin: 0;
  padding: 0 0.2rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  /* the box to type in stays on screen under it */
  height: clamp(300px, calc(100vh - 420px), 640px);
  overflow-y: auto;
}
.empty {
  margin: auto;
  text-align: center;
  padding: 2rem 1rem;
}
.day {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  color: var(--muted);
  font-size: 0.75rem;
}
.day::before,
.day::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--line);
}
.msg {
  max-width: 82%;
  padding: 0.45rem 0.7rem 0.55rem;
  border: 1px solid var(--line);
  border-left: 3px solid hsl(var(--hue) 70% 55%);
  background: rgb(255 255 255 / 0.03);
}
.msg.mine {
  align-self: flex-end;
  border-left-color: var(--line);
  border-right: 3px solid #ffd56a;
  background: rgb(255 213 106 / 0.05);
}
.meta {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}
.who {
  color: hsl(var(--hue) 75% 72%);
  font-size: 0.9rem;
}
.mine .who {
  color: #ffd56a;
}
.meta time {
  color: var(--muted);
  font-size: 0.72rem;
}
.hide {
  margin-left: auto;
  padding: 0 0.4rem;
  border: none;
  background: none;
  color: var(--muted);
  font-size: 0.75rem;
  opacity: 0;
  transition: opacity 0.15s;
}
.msg:hover .hide,
.hide:focus-visible {
  opacity: 1;
}
/* a tablet can't point: always there */
@media (hover: none) {
  .hide {
    opacity: 0.7;
  }
}
.text {
  margin: 0.15rem 0 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.room-card {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 0.4rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid rgb(79 179 106 / 0.55);
  background: rgb(79 179 106 / 0.08);
}
.room-card.gone {
  border-color: var(--line);
  background: rgb(255 255 255 / 0.02);
  opacity: 0.7;
}
.room-ico {
  font-size: 1.3rem;
}
.room-text {
  display: grid;
  min-width: 0;
  flex: 1;
}
.room-text b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.room-text small {
  font-size: 0.78rem;
}
.room-card button,
.rooms button {
  padding: 0.35rem 0.75rem;
  font-size: 0.9rem;
  white-space: nowrap;
}
.need.killer {
  color: #ff9a9a;
}
.need.survivor {
  color: #9cc4ff;
}
.need.any {
  color: var(--ok);
}
.hidden-note {
  margin: 0;
  font-size: 0.8rem;
}
.link {
  padding: 0;
  border: none;
  background: none;
  color: var(--text);
  text-decoration: underline;
  font-size: inherit;
}
.attach {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid rgb(79 179 106 / 0.55);
  background: rgb(79 179 106 / 0.08);
}
.needs {
  display: flex;
  gap: 0.3rem;
  margin-left: auto;
}
.needs button {
  padding: 0.2rem 0.6rem;
  font-size: 0.82rem;
}
.needs button.on {
  border-color: var(--blood-bright);
  background: var(--blood);
  color: #fff;
}
.attach .x {
  padding: 0.2rem 0.5rem;
  background: none;
}
.composer {
  display: flex;
  gap: 0.45rem;
}
.composer input {
  flex: 1;
  min-width: 0;
}
.attach-btn {
  padding: 0.4rem 0.65rem;
  font-size: 1.05rem;
}
.attach-btn.on {
  border-color: var(--ok);
  box-shadow: 0 0 0 1px var(--ok) inset;
}
.send {
  min-width: 4.5rem;
}
.error {
  margin: 0;
  color: var(--blood-bright);
  font-size: 0.85rem;
}
.tip {
  margin: 0;
  font-size: 0.78rem;
}

/* ---------- the side ---------- */
.people,
.rooms {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
  max-height: 32vh;
  overflow-y: auto;
}
.people li {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dot {
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: hsl(var(--hue) 70% 55%);
}
.rooms li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0;
  border-bottom: 1px solid var(--line);
}
.small {
  margin: 0;
  font-size: 0.85rem;
}
.to-online {
  font-size: 0.85rem;
  color: var(--muted);
}
.to-online:hover {
  color: var(--text);
}

@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .msg {
    max-width: 92%;
  }
}
</style>
