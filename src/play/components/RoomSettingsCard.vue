<script setup lang="ts">
// The room's settings, in the lobby: the host changes them, everyone else sees them (and what
// differs from the defaults, at a glance). Only the host changes them, so for everyone else the
// card starts folded to its summary chips, and a change shows on it for a moment (what changed);
// nobody's ready is reset by it.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { sfx } from '../../sound'
import { isHost, roomSettings, session, setSettings } from '../online/session'
import { BAN_COUNT_RANGE, DEFAULT_SETTINGS, KILLER_BP_RANGE, SURVIVOR_BP_RANGE, TIMER_CHOICES, ASK_TIMER_CHOICES, sameSettings, settingsChips, type RoomSettings } from '../online/settings'
import BpIcon from '../../components/BpIcon.vue'
import OfferingSettings from './OfferingSettings.vue'

const s = computed(() => roomSettings.value)
const chips = computed(() => settingsChips(s.value))
const busy = computed(() => session.busy || !isHost.value)
const open = ref(isHost.value)

function set(patch: Partial<RoomSettings>) {
  if (!isHost.value) return
  sfx.click()
  void setSettings(patch)
}

const MAP_CHOICES: { id: RoomSettings['map']; label: string }[] = [
  { id: 'killer', label: 'Killer เลือก' },
  { id: 'host', label: 'หัวห้องเลือก' },
  { id: 'random', label: 'สุ่ม' },
]

function step(key: 'survivorBp' | 'killerBp', by: number) {
  const [lo, hi] = key === 'survivorBp' ? SURVIVOR_BP_RANGE : KILLER_BP_RANGE
  const v = Math.min(hi, Math.max(lo, s.value[key] + by))
  if (v !== s.value[key]) set({ [key]: v })
}

function toggleDupes() {
  set({ dupes: !s.value.dupes })
}

// ---------- what differs from the rulebook ----------
// Every setting shows at once, in three groups (no tabs: a host changing a few things across
// groups should not have to switch back and forth).

/** These settings differ from the rulebook's (a gold dot on their row). */
const differs = (...keys: (keyof RoomSettings)[]) => !sameSettings(s.value, DEFAULT_SETTINGS, keys)
const isDefault = computed(() => sameSettings(s.value, DEFAULT_SETTINGS))

// ---------- telling the others what the host changed ----------

/** A setting as words, for the notice. */
function describe(key: keyof RoomSettings, v: RoomSettings): string {
  switch (key) {
    case 'mode':
      return `โหมดเกม → ${{ adept: 'Adept', bloodweb: 'Bloodweb', devout: 'Devout' }[v.mode]}`
    case 'timer':
      return `เวลาต่อตา → ${v.timer ? `${v.timer} วิ` : 'ไม่จำกัด'}`
    case 'askTimer':
      return `เวลาตอบคำถาม → ${v.askTimer ? `${v.askTimer} วิ` : 'เท่าเวลาต่อตา'}`
    case 'map':
      return `แผนที่ → ${MAP_CHOICES.find((m) => m.id === v.map)?.label ?? v.map}`
    case 'random':
      return v.random ? 'ตัวละคร → สุ่มให้ทุกคน' : 'ตัวละคร → เลือกเอง'
    case 'dupes':
      return v.dupes ? 'Survivor ซ้ำกับเพื่อนได้' : 'Survivor ห้ามซ้ำกัน'
    case 'showKiller':
      return v.showKiller ? 'Survivor เห็นฆาตกรที่เลือก' : 'Survivor ไม่เห็นฆาตกรที่เลือก'
    case 'banlist':
      return v.banlist ? `Banlist เปิด (ฝั่งละ ${v.banCount} ตัว)` : 'Banlist ปิด'
    case 'banCount':
      return `Banlist → ฝั่งละ ${v.banCount} ตัว`
    case 'survivorBp':
      return `BP เริ่มต้น Survivor → ${v.survivorBp}`
    case 'killerBp':
      return `BP เริ่มต้น Killer → ${v.killerBp}`
    case 'offerings':
    case 'offeringCount':
    case 'offeringRandom':
      return v.offerings === 'none' ? 'Offering → ไม่ใช้' : (settingsChips(v).find((c) => c.startsWith('🔥')) ?? '')
  }
}

const notice = ref('')
let noticeTimer: number | null = null
watch(s, (now, before) => {
  if (isHost.value || !before) return
  const changed = (Object.keys(now) as (keyof RoomSettings)[]).filter((k) => JSON.stringify(now[k]) !== JSON.stringify(before[k]))
  if (!changed.length) return
  notice.value = changed.map((k) => describe(k, now)).join(' · ')
  if (noticeTimer !== null) clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => (notice.value = ''), 5000)
})
onBeforeUnmount(() => noticeTimer !== null && clearTimeout(noticeTimer))

</script>

<template>
  <section class="card settings" :class="{ changed: notice }">
    <header>
      <h2>⚙ ตั้งค่าห้อง</h2>
      <span v-if="!isHost" class="muted small">หัวห้องเป็นคนตั้ง</span>
      <button v-if="isHost && open && !isDefault" type="button" class="reset" :disabled="busy" @click="set({ ...DEFAULT_SETTINGS })">↺ คืนค่าตามเล่ม</button>
      <button type="button" class="fold" :aria-expanded="open" @click="open = !open">{{ open ? 'ซ่อน ▴' : 'ดูทั้งหมด ▾' }}</button>
    </header>
    <Transition name="notice">
      <p v-if="notice" :key="notice" class="notice" role="status">⚙ หัวห้องเพิ่งเปลี่ยน: {{ notice }}</p>
    </Transition>
    <p class="chips">
      <span v-for="c in chips" :key="c" class="chip">{{ c }}</span>
      <span v-if="!chips.length" class="muted small">ค่าเริ่มต้นตามเล่มทั้งหมด</span>
    </p>

    <div v-show="open" class="body">
      <!-- every setting, in three groups; a gold dot: differs from the rulebook -->
      <h3 class="group">🃏 กติกา</h3>
      <div class="rows">
        <div class="row">
          <span class="label">โหมดเกม<i v-if="differs('mode')" class="dot" /></span>
          <div class="seg">
            <button type="button" :class="{ on: s.mode === 'adept' }" :disabled="busy" @click="set({ mode: 'adept' })">Adept</button>
            <button type="button" :class="{ on: s.mode === 'bloodweb' }" :disabled="busy" @click="set({ mode: 'bloodweb' })">Bloodweb</button>
            <button type="button" :class="{ on: s.mode === 'devout' }" :disabled="busy" @click="set({ mode: 'devout' })">Devout</button>
          </div>
          <small class="muted hint">{{
            s.mode === 'adept'
              ? 'ใช้ Perk ที่พิมพ์บนกระดานตัวละคร'
              : s.mode === 'bloodweb'
                ? 'จั่วการ์ด Perk คนละ 5 ใบ วางทับ Perk บนกระดานได้สูงสุด 3 ใบ — แต่งหลังทุกคนเลือกตัวละคร'
                : 'เลือก Perk เองสูงสุด 3 ใบ เปิดพร้อมกันตอนเริ่มเกม — แต่งหลังทุกคนเลือกตัวละคร'
          }}</small>
        </div>
        <div class="row">
          <span class="label">🔥 Offering<i v-if="differs('offerings', 'offeringCount', 'offeringRandom')" class="dot" /></span>
          <OfferingSettings
            :plan="s.offerings"
            :count="s.offeringCount"
            :random="s.offeringRandom"
            :disabled="busy"
            @update:plan="set({ offerings: $event })"
            @update:count="set({ offeringCount: $event })"
            @update:random="set({ offeringRandom: $event })"
          />
        </div>
      </div>

      <h3 class="group">🎭 ตัวละคร & แผนที่</h3>
      <div class="rows">
        <div class="row">
          <span class="label">🗺 แผนที่<i v-if="differs('map')" class="dot" /></span>
          <div class="seg">
            <button v-for="m in MAP_CHOICES" :key="m.id" type="button" :class="{ on: s.map === m.id }" :disabled="busy" @click="set({ map: m.id })">{{ m.label }}</button>
          </div>
        </div>
        <div class="row">
          <span class="label">🎭 ตัวละคร<i v-if="differs('random')" class="dot" /></span>
          <div class="seg">
            <button type="button" :class="{ on: !s.random }" :disabled="busy" @click="set({ random: false })">เลือกเอง</button>
            <button type="button" :class="{ on: s.random }" :disabled="busy" @click="set({ random: true })">🎲 สุ่มให้ทุกคน</button>
          </div>
        </div>
        <div class="row">
          <span class="label" />
          <label class="toggle">
            <input type="checkbox" :checked="s.dupes" :disabled="busy" @change="toggleDupes" />
            Survivor ซ้ำกับเพื่อนได้<i v-if="differs('dupes')" class="dot" />
          </label>
          <label class="toggle">
            <input type="checkbox" :checked="s.showKiller" :disabled="busy" @change="set({ showKiller: !s.showKiller })" />
            Survivor เห็นฆาตกรที่เลือก<i v-if="differs('showKiller')" class="dot" />
          </label>
        </div>
        <div class="row">
          <span class="label">🚫 Banlist<i v-if="differs('banlist', 'banCount')" class="dot" /></span>
          <label class="toggle">
            <input type="checkbox" :checked="s.banlist" :disabled="busy" @change="set({ banlist: !s.banlist })" />
            แบนตัวละครของอีกฝั่งก่อนเลือก
          </label>
          <span v-if="s.banlist" class="stepper">
            ฝั่งละไม่เกิน
            <button type="button" :disabled="busy || s.banCount <= BAN_COUNT_RANGE[0]" @click="set({ banCount: s.banCount - 1 })">−</button>
            <b>{{ s.banCount }}</b>
            <button type="button" :disabled="busy || s.banCount >= BAN_COUNT_RANGE[1]" @click="set({ banCount: s.banCount + 1 })">+</button>
            ตัว
          </span>
          <small v-if="s.banlist" class="muted hint">Survivor ช่วยกันแบน Killer และ Killer แบน Survivor — อีกฝั่งไม่เห็นจนกว่าทั้งสองฝั่งยืนยัน</small>
        </div>
      </div>

      <h3 class="group">⏱ เวลา & สมดุล</h3>
      <div class="rows">
        <div class="row">
          <span class="label">⏱ เวลาต่อตา<i v-if="differs('timer')" class="dot" /></span>
          <div class="seg">
            <button v-for="t in TIMER_CHOICES" :key="t" type="button" :class="{ on: s.timer === t }" :disabled="busy" @click="set({ timer: t })">
              {{ t ? `${t} วิ` : 'ไม่จำกัด' }}
            </button>
          </div>
          <small v-if="s.timer" class="muted hint">ตาเดินและวางแผน: หมดเวลาแล้วขึ้นเตือนทั้งห้อง</small>
        </div>
        <div class="row">
          <span class="label">❔ เวลาตอบคำถาม<i v-if="differs('askTimer')" class="dot" /></span>
          <div class="seg">
            <button v-for="t in ASK_TIMER_CHOICES" :key="t" type="button" :class="{ on: s.askTimer === t }" :disabled="busy" @click="set({ askTimer: t })">
              {{ t ? `${t} วิ` : 'เท่าเวลาต่อตา' }}
            </button>
          </div>
          <small v-if="s.askTimer || s.timer" class="muted hint">คำถามที่ข้ามได้ (ใช้ Perk, Item, Bonus Turn, ลงขัน <BpIcon />, เก็บผลทอย) — หมดเวลาแล้วตอบ "ไม่ใช้" ให้เอง</small>
        </div>
        <div class="row">
          <span class="label"><BpIcon /> BP เริ่มต้น<i v-if="differs('survivorBp', 'killerBp')" class="dot" /></span>
          <span class="stepper">
            Survivor
            <button type="button" :disabled="busy || s.survivorBp <= SURVIVOR_BP_RANGE[0]" @click="step('survivorBp', -1)">−</button>
            <b>{{ s.survivorBp }}</b>
            <button type="button" :disabled="busy || s.survivorBp >= SURVIVOR_BP_RANGE[1]" @click="step('survivorBp', 1)">+</button>
          </span>
          <span class="stepper">
            Killer
            <button type="button" :disabled="busy || s.killerBp <= KILLER_BP_RANGE[0]" @click="step('killerBp', -1)">−</button>
            <b>{{ s.killerBp }}</b>
            <button type="button" :disabled="busy || s.killerBp >= KILLER_BP_RANGE[1]" @click="step('killerBp', 1)">+</button>
          </span>
          <small v-if="differs('survivorBp', 'killerBp')" class="muted hint">ตามเล่ม: Survivor {{ DEFAULT_SETTINGS.survivorBp }} · Killer {{ DEFAULT_SETTINGS.killerBp }} (หน้า 6)</small>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.settings header {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
}
.settings h2 {
  margin: 0;
}
/* the host just changed something: the card glows and says what */
.settings.changed {
  border-color: #ffd56a;
  box-shadow: 0 0 22px rgb(255 214 106 / 0.3);
  transition:
    border-color 0.3s,
    box-shadow 0.3s;
}
.notice {
  margin: 0.5rem 0 0;
  padding: 0.4rem 0.7rem;
  border-left: 3px solid #ffd56a;
  background: rgb(255 214 106 / 0.12);
  color: #ffe7a6;
  font-weight: 600;
}
.notice-enter-active {
  transition:
    opacity 0.25s,
    transform 0.25s;
}
.notice-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}
.fold {
  margin-left: auto;
  padding: 0.2rem 0.7rem;
  font-size: 0.85rem;
  background: none;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0.4rem 0 0.8rem;
}
.chip {
  padding: 0.1rem 0.55rem;
  border-radius: 99px;
  border: 1px solid rgb(255 214 106 / 0.5);
  background: rgb(255 214 106 / 0.1);
  color: #ffd56a;
  font-size: 0.8rem;
}
.rows {
  display: grid;
  gap: 0.75rem;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.8rem;
}
.label {
  min-width: 10rem;
  font-weight: 600;
}
.hint {
  flex-basis: 100%;
  padding-left: 10.8rem;
}
.seg {
  display: inline-flex;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  overflow: hidden;
}
.seg button {
  border: 0;
  border-radius: 0;
  padding: 0.4rem 0.8rem;
  background: none;
}
.seg button + button {
  border-left: 1px solid var(--line-strong);
}
.seg button.on {
  background: var(--blood);
  color: #fff;
  opacity: 1;
}
.reset {
  margin-left: auto;
  padding: 0.2rem 0.7rem;
  font-size: 0.85rem;
  background: none;
  border-color: rgb(255 214 106 / 0.5);
  color: #ffd56a;
}
.reset + .fold {
  margin-left: 0;
}
/* a group of settings: a small heading over its rows */
.group {
  margin: 1rem 0 0.6rem;
  padding-bottom: 0.3rem;
  border-bottom: 1px solid var(--line-strong);
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.03em;
}
/* differs from the rulebook */
.dot {
  display: inline-block;
  width: 0.45rem;
  height: 0.45rem;
  margin-left: 0.35rem;
  border-radius: 50%;
  background: #ffd56a;
  box-shadow: 0 0 6px rgb(255 214 106 / 0.8);
  vertical-align: middle;
}
/* a switch: the checkbox drawn as a sliding pill (the offering's "drawn" one too) */
.toggle,
.rows :deep(.check) {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  cursor: pointer;
}
.toggle input,
.rows :deep(.check input) {
  appearance: none;
  flex: none;
  position: relative;
  width: 2.2rem;
  height: 1.2rem;
  margin: 0;
  border: 1px solid var(--line-strong);
  border-radius: 99px;
  background: rgb(255 255 255 / 0.08);
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
}
.toggle input::after,
.rows :deep(.check input)::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 0.15rem;
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 50%;
  background: #c9c9c9;
  translate: 0 -50%;
  transition: left 0.15s;
}
.toggle input:checked,
.rows :deep(.check input:checked) {
  border-color: var(--blood-bright, #e01d26);
  background: var(--blood, #a5121a);
}
.toggle input:checked::after,
.rows :deep(.check input:checked)::after {
  left: calc(100% - 1rem);
  background: #fff;
}
.toggle input:disabled,
.rows :deep(.check input:disabled) {
  cursor: default;
  opacity: 0.6;
}
.stepper {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.stepper button {
  width: 1.9rem;
  padding: 0.15rem 0;
}
.stepper b {
  min-width: 1.2rem;
  text-align: center;
}
@media (max-width: 700px) {
  .hint {
    padding-left: 0;
  }
}
</style>
