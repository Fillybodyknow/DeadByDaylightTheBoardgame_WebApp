<script setup lang="ts">
// An online room before the game.
//   Lobby: pick a side, say ready; the host goes on when everyone is.
//   Picks: survivor players pick their survivors (they see each other's, no duplicates, and
//   nothing of the killer's side); the killer picks and sees the survivors' picks; when
//   everyone has locked in, the killer starts the game.
import { computed, ref, watch } from 'vue'
import { survivorById } from '../../data'
import { asset } from '../../i18n'
import { sfx } from '../../sound'
import { KILLER_PLAYER } from '../engine/seats'
import {
  allLocked,
  backToLobby,
  doubleId,
  isHost,
  leaveRoom,
  lobbyBlocker,
  lockPicks,
  me,
  memberList,
  mySeat,
  pickCharacter,
  pickWaiting,
  proceedToPick,
  session,
  setBoard,
  setDouble,
  setName,
  setReady,
  setSide,
  slotsOf,
  startOnlineGame,
} from '../online/session'
import CharacterPicker from './CharacterPicker.vue'
import MapPicker from './MapPicker.vue'
import Mini from './Mini.vue'
import SyncBadge from './SyncBadge.vue'

const data = computed(() => session.data!)
const code = computed(() => session.room?.code ?? '')

// ---------- invite ----------

const copied = ref(false)
async function copyLink() {
  try {
    await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/online?room=${code.value}`)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // clipboard blocked: the code is on screen anyway
  }
}

// ---------- lobby ----------

const name = ref(me.value?.name ?? '')
watch(
  () => me.value?.name,
  (n) => {
    if (n && !nameFocused.value) name.value = n
  },
)
const nameFocused = ref(false)
function saveName() {
  nameFocused.value = false
  const n = name.value.trim()
  if (n && n !== me.value?.name) void setName(n)
}

const killerTaken = computed(() => memberList.value.some((m) => m.side === 'killer' && m.id !== session.me))
const survivorCount = computed(() => memberList.value.filter((m) => m.side === 'survivor').length)

function side(s: 'killer' | 'survivor') {
  sfx.click()
  void setSide(me.value?.side === s ? null : s)
}

function toggleReady() {
  sfx.select()
  void setReady(!me.value?.ready)
}

/** How the survivors will be split, for the current number of survivor players (p.19). */
const splitNote = computed(() => {
  const n = survivorCount.value
  if (n === 4) return 'ผู้เล่นฝั่ง Survivor คุมคนละ 1 ตัว'
  if (n === 3) return 'ผู้เล่นที่มีป้าย 👥 คุม 2 ตัว อีก 2 คนคุมคนละ 1 ตัว — หัวห้องเลือกให้ใครก็ได้ หรือกดรับเองก็ได้'
  if (n === 2) return 'ผู้เล่นฝั่ง Survivor คุมคนละ 2 ตัว'
  return 'เกมมี Survivor 4 ตัวเสมอ — ต้องมีผู้เล่นฝั่งนี้ 2–4 คน'
})

function proceed() {
  sfx.entity()
  void proceedToPick()
}

// ---------- character picks ----------

const amKiller = computed(() => mySeat.value === KILLER_PLAYER)
const mySlots = computed(() => (mySeat.value ? slotsOf(mySeat.value) : []))
const locked = computed(() => !!mySeat.value && !!data.value.locked[String(mySeat.value)])


/** The slot this player is filling now: the first of theirs still empty, or the one tapped. */
const activeSlot = ref<number | null>(null)
watch(
  [mySlots, () => data.value.picks],
  () => {
    if (activeSlot.value !== null && mySlots.value.includes(activeSlot.value)) return
    activeSlot.value = mySlots.value.find((s) => !data.value.picks[String(s)]) ?? mySlots.value[0] ?? null
  },
  { immediate: true },
)

/** Survivor slots: who plays each, and what they picked. */
const survivorSlots = computed(() =>
  [0, 1, 2, 3].map((slot) => {
    const player = Number(Object.keys(data.value.seats).find((p) => slotsOf(Number(p)).includes(slot)) ?? 0)
    const id = data.value.picks[String(slot)]
    return {
      slot,
      player,
      who: data.value.seats[String(player)]?.name ?? '',
      mine: player === mySeat.value,
      character: id ? survivorById.get(id) : undefined,
      locked: !!data.value.locked[String(player)],
    }
  }),
)

/** Survivors a teammate already took (not counting this player's own slots). */
const takenByOthers = computed(
  () => new Set(survivorSlots.value.filter((s) => !s.mine && s.character).map((s) => s.character!.id)),
)

/** Put a survivor in the slot being filled, then move on to the next empty one. */
function pickSurvivor(id: string) {
  if (locked.value || takenByOthers.value.has(id) || activeSlot.value === null) return
  const slot = activeSlot.value
  void pickCharacter(slot, id)
  activeSlot.value = mySlots.value.find((s) => s !== slot && !data.value.picks[String(s)]) ?? slot
}

function unpickSurvivor(id: string) {
  const slot = mySlots.value.find((s) => data.value.picks[String(s)] === id)
  if (slot === undefined || locked.value) return
  void pickCharacter(slot, null)
  activeSlot.value = slot
}

const myPicks = computed(() => mySlots.value.map((s) => data.value.picks[String(s)]).filter((id): id is string => !!id))

const myPicksComplete = computed(() =>
  amKiller.value ? !!data.value.picks.killer : mySlots.value.length > 0 && mySlots.value.every((s) => data.value.picks[String(s)]),
)

function toggleLock() {
  sfx.select()
  void lockPicks(!locked.value)
}

/** Survivor players still choosing (shown to everyone; the killer's status only to the killer). */
const survivorsWaiting = computed(() => pickWaiting.value.filter((p) => p !== KILLER_PLAYER))

function start() {
  sfx.entity()
  void startOnlineGame()
}

</script>

<template>
  <div class="room">
    <header class="card head">
      <div>
        <p class="muted small">รหัสห้อง</p>
        <strong class="code">{{ code }}</strong>
      </div>
      <button @click="copyLink">{{ copied ? '✓ คัดลอกแล้ว' : '🔗 คัดลอกลิงก์เชิญ' }}</button>
      <span class="spacer" />
      <SyncBadge />
      <span class="phase-tag">{{ data.phase === 'lobby' ? 'Lobby' : 'เลือกตัวละคร' }}</span>
      <button @click="leaveRoom">ออกจากห้อง</button>
    </header>

    <!-- ================= lobby ================= -->
    <template v-if="data.phase === 'lobby'">
      <section class="card">
        <div class="me-row">
          <label class="field">
            ชื่อของคุณ
            <input v-model="name" maxlength="16" placeholder="ชื่อที่เพื่อนจะเห็น" @focus="nameFocused = true" @blur="saveName" @keyup.enter="saveName" />
          </label>
          <div class="sides">
            <button class="side killer" :class="{ on: me?.side === 'killer' }" :disabled="session.busy || (killerTaken && me?.side !== 'killer')" @click="side('killer')">
              🔪 Killer
              <small>{{ killerTaken && me?.side !== 'killer' ? 'มีคนเลือกแล้ว' : '1 คน' }}</small>
            </button>
            <button class="side survivor" :class="{ on: me?.side === 'survivor' }" :disabled="session.busy || (survivorCount >= 4 && me?.side !== 'survivor')" @click="side('survivor')">
              🏃 Survivor
              <small>{{ survivorCount }}/4 คน</small>
            </button>
          </div>
          <button class="ready" :class="{ primary: !me?.ready, done: me?.ready }" :disabled="session.busy || !me?.side" @click="toggleReady">
            {{ me?.ready ? '✓ พร้อมแล้ว (กดเพื่อยกเลิก)' : me?.side ? 'พร้อม' : 'เลือกฝั่งก่อน' }}
          </button>
        </div>
      </section>

      <section class="card">
        <h2>ผู้เล่นในห้อง ({{ memberList.length }})</h2>
        <ul class="members">
          <li v-for="m in memberList" :key="m.id" :class="[m.side ?? 'none', { me: m.id === session.me }]">
            <span class="icon">{{ m.side === 'killer' ? '🔪' : m.side === 'survivor' ? '🏃' : '·' }}</span>
            <strong>{{ m.name }}</strong>
            <span v-if="m.id === data.host" class="badge">หัวห้อง</span>
            <span class="muted small">{{ m.side === 'killer' ? 'Killer' : m.side === 'survivor' ? 'Survivor' : 'ยังไม่เลือกฝั่ง' }}</span>
            <!-- 3 survivor players: one of them plays two survivors -->
            <button
              v-if="m.side === 'survivor' && doubleId"
              type="button"
              class="double"
              :class="{ on: doubleId === m.id }"
              :disabled="session.busy || doubleId === m.id || (!isHost && m.id !== session.me)"
              :title="doubleId === m.id ? 'คนนี้คุม Survivor 2 ตัว' : 'ให้คนนี้คุม Survivor 2 ตัว'"
              @click="setDouble(m.id)"
            >
              {{ doubleId === m.id ? '👥 คุม 2 ตัว' : 'ให้คุม 2 ตัว' }}
            </button>
            <span class="status" :class="{ ok: m.ready }">{{ m.ready ? '✓ พร้อม' : 'ยังไม่พร้อม' }}</span>
          </li>
        </ul>
        <p class="muted small">{{ splitNote }}</p>
        <button v-if="isHost" class="primary big" :disabled="!!lobbyBlocker || session.busy" @click="proceed">
          {{ lobbyBlocker || 'ดำเนินเกม — ไปเลือกตัวละคร' }}
        </button>
        <p v-else class="muted center">{{ lobbyBlocker ? lobbyBlocker : 'ทุกคนพร้อมแล้ว — รอหัวห้องดำเนินเกม' }}</p>
      </section>
    </template>

    <!-- ================= character picks ================= -->
    <template v-else>
      <!-- the survivor team (everyone sees it, the killer included) -->
      <section class="card">
        <h2>ทีม Survivor</h2>
        <div class="slots">
          <button
            v-for="s in survivorSlots"
            :key="s.slot"
            class="slot"
            :class="{ mine: s.mine, active: s.mine && activeSlot === s.slot && !locked, locked: s.locked }"
            :disabled="!s.mine || locked"
            @click="activeSlot = s.slot"
          >
            <Mini v-if="s.character" class="mini aura-survivor" :src="asset(s.character.images.mini)" />
            <span v-else class="empty">?</span>
            <span class="slot-text">
              <strong>{{ s.character?.name ?? (s.mine ? 'เลือกตัวละคร' : 'กำลังเลือก…') }}</strong>
              <small class="muted">ผู้เล่น {{ s.player }} · {{ s.who }}{{ s.mine ? ' (คุณ)' : '' }}</small>
            </span>
            <span v-if="s.locked" class="lock">🔒</span>
          </button>
        </div>
      </section>

      <!-- survivor players pick survivors -->
      <section v-if="mySlots.length" class="card">
        <h2>เลือก Survivor {{ mySlots.length > 1 ? `(คุณคุม ${mySlots.length} ตัว — แตะช่องด้านบนเพื่อสลับ)` : '' }}</h2>
        <CharacterPicker
          kind="survivor"
          :taken="[...takenByOthers]"
          :selected="myPicks"
          :remaining="mySlots.length - myPicks.length"
          :locked="locked"
          taken-label="เพื่อนเลือกแล้ว"
          :roll-title="activeSlot !== null ? `สุ่ม Survivor ตัวที่ ${activeSlot + 1}` : ''"
          @pick="pickSurvivor"
          @unpick="unpickSurvivor"
        />
      </section>

      <!-- the killer picks a killer; survivors never see this part -->
      <section v-if="amKiller" class="card killer-card">
        <h2>🔪 เลือกฆาตกร</h2>
        <CharacterPicker
          kind="killer"
          :selected="data.picks.killer ? [data.picks.killer] : []"
          :remaining="data.picks.killer ? 0 : 1"
          :locked="locked"
          @pick="pickCharacter('killer', $event)"
          @unpick="pickCharacter('killer', null)"
        />
      </section>

      <!-- the killer picks the board; everyone else sees it -->
      <MapPicker :model-value="data.board ?? 'macmillan'" :readonly="!amKiller" @update:model-value="setBoard" />

      <section v-if="mySeat" class="card actions">
        <button class="lockbtn" :class="{ primary: !locked }" :disabled="session.busy || !myPicksComplete" @click="toggleLock">
          {{ locked ? '🔒 ล็อกแล้ว (กดเพื่อแก้)' : myPicksComplete ? 'ยืนยันตัวละคร' : 'เลือกตัวละครให้ครบ' }}
        </button>
        <template v-if="amKiller">
          <button class="primary big" :disabled="!allLocked || session.busy" @click="start">
            {{ allLocked ? 'ดำเนินเกม — เริ่ม Trial' : `รอผู้เล่นยืนยัน (${pickWaiting.length} คน)` }}
          </button>
        </template>
        <p v-else class="muted center">
          {{ survivorsWaiting.length ? `รอ Survivor ยืนยัน (${survivorsWaiting.length} คน)` : 'ทีม Survivor พร้อมแล้ว — รอ Killer ดำเนินเกม' }}
        </p>
      </section>
      <section v-else class="card">
        <p class="muted">คุณไม่ได้อยู่ในเกมนี้ — รอดูได้เมื่อเกมเริ่ม</p>
      </section>

      <button v-if="isHost" class="back" @click="backToLobby">← กลับ Lobby</button>
    </template>

    <p v-if="session.error" class="error">{{ session.error }}</p>
  </div>
</template>

<style scoped>
.room {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 1100px;
  margin: 0 auto;
  padding: 1rem;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
}
.head p {
  margin: 0;
}
.code {
  font-family: var(--font-display);
  font-size: 2.2rem;
  letter-spacing: 0.25em;
  color: var(--blood-bright);
  text-shadow: 0 0 14px rgb(255 40 40 / 0.45);
}
.spacer {
  flex: 1;
}
.phase-tag {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--warn);
}
.small {
  font-size: 0.85rem;
}
.center {
  text-align: center;
}
h2 {
  margin-top: 0;
}
.me-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 1rem;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
input {
  font: inherit;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  padding: 0.5rem 0.7rem;
}
.sides {
  display: flex;
  gap: 0.5rem;
}
.side {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 8.5rem;
  padding: 0.6rem 0.9rem;
  font-size: 1.05rem;
}
.side small {
  font-size: 0.75rem;
  color: var(--muted);
}
.side.killer.on {
  border-color: var(--blood);
  box-shadow: 0 0 0 2px var(--blood) inset, 0 0 16px rgb(255 30 30 / 0.3);
}
.side.survivor.on {
  border-color: var(--warn);
  box-shadow: 0 0 0 2px var(--warn) inset, 0 0 16px rgb(217 162 39 / 0.3);
}
.ready {
  min-width: 11rem;
  padding: 0.7rem 1rem;
}
.ready.done {
  border-color: var(--ok);
  color: var(--ok);
}
.members {
  list-style: none;
  margin: 0 0 0.75rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.members li {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgb(0 0 0 / 0.25);
}
.members li.killer {
  border-color: var(--blood-dim);
}
.members li.survivor {
  border-color: rgb(217 162 39 / 0.4);
}
.members li.me {
  box-shadow: 0 0 0 1px var(--text) inset;
}
.badge {
  font-size: 0.7rem;
  padding: 0.05rem 0.4rem;
  border-radius: 3px;
  background: var(--blood);
  color: #fff;
}
.status {
  margin-left: auto;
  font-size: 0.85rem;
  color: var(--muted);
}
.double {
  padding: 0.15rem 0.55rem;
  font-size: 0.8rem;
  background: none;
}
.double.on {
  border-color: #ffd56a;
  color: #ffd56a;
  background: rgb(255 214 106 / 0.1);
  opacity: 1;
}
.status.ok {
  color: var(--ok);
}
.big {
  width: 100%;
  padding: 0.8rem;
  font-size: 1.1rem;
}
.slots {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}
.slot {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem;
  text-align: left;
  background: rgb(0 0 0 / 0.3);
}
.slot:disabled {
  opacity: 1;
  cursor: default;
}
.slot.mine {
  border-color: rgb(217 162 39 / 0.6);
}
.slot.active {
  border-color: var(--warn);
  box-shadow: 0 0 0 2px var(--warn) inset;
}
.slot .mini,
.slot .empty {
  width: 48px;
  height: 48px;
  flex: none;
}
.slot .empty {
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px dashed var(--line-strong);
  color: var(--muted);
}
.slot-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.lock {
  margin-left: auto;
}
.grid {
  display: grid;
  gap: 0.6rem;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
}
.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.6rem 0.4rem;
  text-align: center;
}
.tile .mini {
  width: 80px;
  height: 80px;
}
.tile small {
  font-size: 0.72rem;
  line-height: 1.3;
}
.tile:disabled {
  opacity: 0.3;
}
.tile.surv.on,
.tile.surv.mine {
  border-color: var(--warn);
  box-shadow: 0 0 0 2px var(--warn) inset, 0 0 18px rgb(217 162 39 / 0.3);
}
.tile.kill.on {
  border-color: var(--blood);
  box-shadow: 0 0 0 2px var(--blood) inset, 0 0 18px rgb(255 30 30 / 0.35);
}
.killer-card {
  border-color: var(--blood-dim);
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.lockbtn {
  padding: 0.7rem;
  font-size: 1.05rem;
}
.back {
  align-self: flex-start;
  background: none;
  border: none;
  color: var(--muted);
}
.error {
  color: var(--blood-bright);
}
</style>
