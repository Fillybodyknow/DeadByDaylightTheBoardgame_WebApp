<script setup lang="ts">
// An online room before the game.
//   Lobby: pick a side, say ready; the host goes on when everyone is.
//   Picks: survivor players pick their survivors (they see each other's, no duplicates, and
//   nothing of the killer's side); the killer picks and sees the survivors' picks; when
//   everyone has locked in, the killer starts the game.
import { computed, ref, watch } from 'vue'
import { killerById, survivorById } from '../../data'
import { asset } from '../../i18n'
import { sfx } from '../../sound'
import { KILLER_PLAYER } from '../engine/seats'
import {
  allLocked,
  allReady,
  backToLobby,
  confirmPerks,
  myPerkKeys,
  perkChars,
  perkHands,
  perkProblem,
  perkStage,
  perksWaiting,
  roomLoadouts,
  setLoadout,
  doubleId,
  isHost,
  leaveRoom,
  lobbyBlocker,
  lockPicks,
  mayPickBoard,
  me,
  memberList,
  mySeat,
  pickCharacter,
  pickWaiting,
  proceedToPick,
  roomSettings,
  session,
  setBoard,
  setDouble,
  setName,
  setReady,
  setSide,
  slotsOf,
  startOnlineGame,
} from '../online/session'
import { cardChoices, printedOf, takenBy } from '../engine/loadout'
import type { PerkId } from '../engine/perks'
import CharacterPicker from './CharacterPicker.vue'
import PerkLoadout from './PerkLoadout.vue'
import MapPicker from './MapPicker.vue'
import Mini from './Mini.vue'
import RoomSettingsCard from './RoomSettingsCard.vue'
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

/** Names on a side, for its card. */
const sideNames = (s: 'killer' | 'survivor') => memberList.value.filter((m) => m.side === s).map((m) => m.name)

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

/** Survivors a teammate already took (not counting this player's own slots); none with repeats allowed. */
const takenByOthers = computed(
  () => new Set(roomSettings.value.dupes ? [] : survivorSlots.value.filter((s) => !s.mine && s.character).map((s) => s.character!.id)),
)

/** Who picks the board, for the read-only card. */
const boardChooser = computed(() => ({ killer: 'ฆาตกร', secret: 'ฆาตกร', host: 'หัวห้อง', random: 'สุ่ม' })[roomSettings.value.map])

/** The killer's pick, for the survivors when the room shows it. */
const shownKiller = computed(() => (roomSettings.value.showKiller && data.value.picks.killer ? killerById.get(data.value.picks.killer) : undefined))

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

// ---------- perks (Bloodweb, Devout): this device's characters, once everyone is locked in ----------

/** This player's characters with their loadouts (their own only: Devout's picks are revealed together). */
const myLoadouts = computed(() =>
  myPerkKeys.value.flatMap((key) => {
    const c = perkChars.value.find((x) => x.key === key)
    return c ? [{ ...c, perks: roomLoadouts.value[key] ?? printedOf(c.id) }] : []
  }),
)
const perkTaken = (key: string) => [...takenBy(perkChars.value, roomLoadouts.value, key)]
const perkDone = (key: string) => !!data.value.perksDone?.[key]
function confirmLoadout(key: string, on: boolean) {
  sfx.select()
  void confirmPerks(key, on)
}

function toggleLock() {
  // a character changing deals the perks again: everyone sets theirs anew
  if (locked.value && perkStage.value && !confirm('เปลี่ยนตัวละครจะล้าง Perk ที่ทุกคนแต่งไว้ ให้แต่งใหม่ทั้งหมด — ต่อไหม?')) return
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
        <p v-if="data.name" class="room-title">{{ data.passwordHash ? '🔒 ' : '' }}{{ data.name }}</p>
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
      <!-- the room's settings first: everyone reads them before choosing a side -->
      <RoomSettingsCard />

      <section class="card">
        <!-- name, then the side (the main choice, big), then ready -->
        <label class="field">
          ชื่อของคุณ
          <input v-model="name" maxlength="16" placeholder="ชื่อที่เพื่อนจะเห็น" @focus="nameFocused = true" @blur="saveName" @keyup.enter="saveName" />
        </label>
        <p class="pick-side">เลือกฝั่ง</p>
        <div class="sides">
          <button class="side killer" :class="{ on: me?.side === 'killer' }" :disabled="session.busy || (killerTaken && me?.side !== 'killer')" @click="side('killer')">
            <span class="side-icon" aria-hidden="true">🔪</span>
            <span class="side-name">Killer</span>
            <span class="side-count">{{ sideNames('killer').length }}/1 คน</span>
            <span class="side-who">{{ sideNames('killer').join(', ') || 'ว่าง' }}</span>
            <span v-if="me?.side === 'killer'" class="side-mine">✓ ฝั่งของคุณ</span>
            <span v-else-if="killerTaken" class="side-full">เต็มแล้ว</span>
          </button>
          <button class="side survivor" :class="{ on: me?.side === 'survivor' }" :disabled="session.busy || (survivorCount >= 4 && me?.side !== 'survivor')" @click="side('survivor')">
            <span class="side-icon" aria-hidden="true">🏃</span>
            <span class="side-name">Survivor</span>
            <span class="side-count">{{ survivorCount }}/4 คน</span>
            <span class="side-who">{{ sideNames('survivor').join(', ') || 'ว่าง' }}</span>
            <span v-if="me?.side === 'survivor'" class="side-mine">✓ ฝั่งของคุณ</span>
            <span v-else-if="survivorCount >= 4" class="side-full">เต็มแล้ว</span>
          </button>
        </div>
        <div class="me-row">
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

      <!-- the killer's map, on top: the character picker below is long, and this would be lost under it -->
      <!-- the killer, for the survivors when the room shows it -->
      <section v-if="roomSettings.showKiller && !amKiller" class="card drawn">
        <Mini v-if="shownKiller" class="mini aura-killer" :src="asset(shownKiller.images.mini)" />
        <span v-else class="empty">?</span>
        <span>
          <small class="muted">ฆาตกร{{ data.locked['1'] ? ' (ยืนยันแล้ว)' : '' }}</small>
          <strong class="killer-name">{{ shownKiller?.name ?? 'กำลังเลือก…' }}</strong>
        </span>
      </section>

      <!-- a secret map (room settings): the survivors learn it when the game starts -->
      <section v-if="!mayPickBoard && roomSettings.map === 'secret'" class="card">
        <h2>🗺 แผนที่ลับ</h2>
        <p class="muted">ฆาตกรเลือกแผนที่แบบลับ — จะรู้ตอนเริ่มเกม</p>
      </section>
      <MapPicker v-else-if="!mayPickBoard" :model-value="data.board ?? 'macmillan'" :chooser="boardChooser" readonly />

      <!-- characters drawn for everyone (room settings): nothing to pick, only to confirm -->
      <section v-if="roomSettings.random && mySeat" class="card">
        <h2>🎲 สุ่มตัวละครให้แล้ว</h2>
        <p class="muted">หัวห้องตั้งให้สุ่มตัวละครทุกคน — ตรวจดูแล้วกดยืนยันด้านล่าง</p>
        <div v-if="amKiller && data.picks.killer" class="drawn">
          <Mini class="mini aura-killer" :src="asset(killerById.get(data.picks.killer)?.images.mini ?? '')" />
          <strong>{{ killerById.get(data.picks.killer)?.name }}</strong>
        </div>
      </section>

      <!-- survivor players pick survivors -->
      <section v-if="mySlots.length && !roomSettings.random" class="card">
        <h2>เลือก Survivor {{ mySlots.length > 1 ? `(คุณคุม ${mySlots.length} ตัว — แตะช่องด้านบนเพื่อสลับ)` : '' }}</h2>
        <CharacterPicker
          kind="survivor"
          :taken="[...takenByOthers]"
          :banned="roomSettings.bans"
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
      <section v-if="amKiller && !roomSettings.random" class="card killer-card">
        <h2>🔪 เลือกฆาตกร</h2>
        <CharacterPicker
          kind="killer"
          :selected="data.picks.killer ? [data.picks.killer] : []"
          :banned="roomSettings.bans"
          :remaining="data.picks.killer ? 0 : 1"
          :locked="locked"
          @pick="pickCharacter('killer', $event)"
          @unpick="pickCharacter('killer', null)"
        />
      </section>

      <!-- perks: once every character is locked in, each player sets theirs (Bloodweb, Devout) -->
      <section v-if="perkStage && myLoadouts.length" class="perks-stage">
        <h2>🃏 แต่ง Perk — {{ roomSettings.mode === 'devout' ? 'Devout' : 'Bloodweb' }}</h2>
        <p class="muted small">
          {{ roomSettings.mode === 'devout' ? 'เลือก Perk ได้สูงสุด 3 ใบ — คนอื่นไม่เห็นจนกว่าเกมจะเริ่ม' : 'การ์ดที่จั่วได้ 5 ใบ เลือกวางทับ Perk บนกระดานได้สูงสุด 3 ใบ' }}
          · การ์ดมีใบเดียว: Perk ที่มีคนใช้แล้วจะมืดลง
        </p>
        <PerkLoadout
          v-for="c in myLoadouts"
          :key="c.key"
          :model-value="c.perks"
          :side="c.side"
          :character-id="c.id"
          :mode="roomSettings.mode"
          :who="c.side === 'killer' ? 'Killer' : `Survivor ${Number(c.key) + 1}`"
          :choices="cardChoices(roomSettings.mode, c, perkHands[c.key])"
          :taken="perkTaken(c.key)"
          :problem="perkProblem(c.key, c.perks)"
          :confirmed="perkDone(c.key)"
          @update:model-value="(p: PerkId[]) => setLoadout(c.key, p)"
          @confirm="(on: boolean) => confirmLoadout(c.key, on)"
        />
      </section>

      <!-- whoever picks the board (the killer, or the host); everyone else's copy of it is above -->
      <MapPicker v-if="mayPickBoard" :model-value="data.board ?? 'macmillan'" @update:model-value="setBoard" />

      <section v-if="mySeat" class="card actions">
        <button class="lockbtn" :class="{ primary: !locked }" :disabled="session.busy || !myPicksComplete" @click="toggleLock">
          {{ locked ? '🔒 ล็อกแล้ว (กดเพื่อแก้)' : myPicksComplete ? 'ยืนยันตัวละคร' : 'เลือกตัวละครให้ครบ' }}
        </button>
        <template v-if="amKiller">
          <button class="primary big" :disabled="!allReady || session.busy" @click="start">
            {{
              !allLocked
                ? `รอผู้เล่นยืนยัน (${pickWaiting.length} คน)`
                : perksWaiting.length
                  ? `รอแต่ง Perk (${perksWaiting.length} ตัว)`
                  : 'ดำเนินเกม — เริ่ม Trial'
            }}
          </button>
        </template>
        <p v-else class="muted center">
          {{
            survivorsWaiting.length
              ? `รอ Survivor ยืนยัน (${survivorsWaiting.length} คน)`
              : perkStage && perksWaiting.length
                ? `รอทุกคนแต่ง Perk (${perksWaiting.length} ตัว)`
                : 'ทีม Survivor พร้อมแล้ว — รอ Killer ดำเนินเกม'
          }}
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
.perks-stage {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.perks-stage h2 {
  margin: 0;
}
.room {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 1100px;
  margin: 0 auto;
  padding: 1rem;
}
.room-title {
  margin: 0 0 0.2rem;
  font-weight: 700;
  font-size: 1.05rem;
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
  margin-top: 0.9rem;
}
.me-row .ready {
  flex: 1;
}
.pick-side {
  margin: 0.9rem 0 0.4rem;
  font-weight: 600;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-width: 22rem;
}
input {
  font: inherit;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  padding: 0.5rem 0.7rem;
}
/* the two sides as big cards, side by side: the room's main choice */
.sides {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.side {
  display: grid;
  justify-items: center;
  gap: 0.15rem;
  padding: 1rem 0.8rem 0.9rem;
  border-radius: 12px;
  text-align: center;
}
.side.killer {
  background: linear-gradient(180deg, rgb(120 10 10 / 0.35), rgb(0 0 0 / 0.25));
}
.side.survivor {
  background: linear-gradient(180deg, rgb(140 100 20 / 0.3), rgb(0 0 0 / 0.25));
}
.side-icon {
  font-size: 2.2rem;
  line-height: 1;
}
.side-name {
  font-family: var(--font-display);
  font-size: 1.35rem;
  letter-spacing: 0.04em;
}
.side-count {
  font-size: 0.9rem;
  color: var(--muted);
}
.side-who {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.85rem;
}
.side-mine {
  margin-top: 0.2rem;
  padding: 0.05rem 0.6rem;
  border-radius: 99px;
  background: rgb(255 255 255 / 0.12);
  font-size: 0.8rem;
  font-weight: 600;
}
.side-full {
  margin-top: 0.2rem;
  font-size: 0.8rem;
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
.drawn {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.drawn .mini {
  width: 56px;
  height: 56px;
}
.killer-name {
  display: block;
  font-size: 1.15rem;
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
.slot .empty,
.drawn .empty {
  width: 48px;
  height: 48px;
  flex: none;
}
.slot .empty,
.drawn .empty {
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
