<script setup lang="ts">
// The room's settings, in the lobby: the host changes them, everyone else sees them (and what
// differs from the defaults, at a glance). A change makes everyone say "ready" again.
import { computed, ref } from 'vue'
import { asset } from '../../i18n'
import { sfx } from '../../sound'
import { isHost, roomSettings, session, setSettings } from '../online/session'
import { KILLER_BP_RANGE, SURVIVOR_BP_RANGE, TIMER_CHOICES, playableKillers, playableSurvivors, settingsChips, type RoomSettings } from '../online/settings'
import BpIcon from '../../components/BpIcon.vue'

const s = computed(() => roomSettings.value)
const chips = computed(() => settingsChips(s.value))
const busy = computed(() => session.busy || !isHost.value)

function set(patch: Partial<RoomSettings>) {
  if (!isHost.value) return
  sfx.click()
  void setSettings(patch)
}

const MAP_CHOICES: { id: RoomSettings['map']; label: string }[] = [
  { id: 'killer', label: 'Killer เลือก' },
  { id: 'secret', label: 'Killer เลือก (ลับ)' },
  { id: 'host', label: 'หัวห้องเลือก' },
  { id: 'random', label: 'สุ่ม' },
]

function step(key: 'survivorBp' | 'killerBp', by: number) {
  const [lo, hi] = key === 'survivorBp' ? SURVIVOR_BP_RANGE : KILLER_BP_RANGE
  const v = Math.min(hi, Math.max(lo, s.value[key] + by))
  if (v !== s.value[key]) set({ [key]: v })
}

/** Repeats off needs four survivors left unbanned. */
function toggleDupes() {
  if (s.value.dupes && survivorsList.filter((c) => !s.value.bans.includes(c.id)).length < 4) return
  set({ dupes: !s.value.dupes })
}

// ---------- bans ----------

const showBans = ref(false)
const survivorsList = playableSurvivors()
const killersList = playableKillers()

/** A ban that would leave too few to play is refused: 4 survivors (or 1 with repeats) and 1 killer. */
function toggleBan(id: string, kind: 'survivor' | 'killer') {
  const bans = s.value.bans.includes(id) ? s.value.bans.filter((b) => b !== id) : [...s.value.bans, id]
  const left = (kind === 'survivor' ? survivorsList : killersList).filter((c) => !bans.includes(c.id)).length
  if (left < (kind === 'killer' ? 1 : s.value.dupes ? 1 : 4)) return
  set({ bans })
}
</script>

<template>
  <section class="card settings">
    <header>
      <h2>⚙ ตั้งค่าห้อง</h2>
      <span v-if="!isHost" class="muted small">หัวห้องเป็นคนตั้ง</span>
    </header>
    <p class="chips">
      <span v-for="c in chips" :key="c" class="chip">{{ c }}</span>
      <span v-if="!chips.length" class="muted small">ค่าเริ่มต้นตามเล่มทั้งหมด</span>
    </p>

    <div class="rows">
      <div class="row">
        <span class="label">⏱ เวลาต่อตา</span>
        <div class="seg">
          <button v-for="t in TIMER_CHOICES" :key="t" type="button" :class="{ on: s.timer === t }" :disabled="busy" @click="set({ timer: t })">
            {{ t ? `${t} วิ` : 'ไม่จำกัด' }}
          </button>
        </div>
        <small class="muted hint">หมดเวลา: คำถามที่ข้ามได้ (Perk, Item, Bonus Turn, ลงขัน <BpIcon />) ตอบ "ไม่ใช้" ให้เอง — ตาเดินและวางแผนขึ้นเตือนทั้งห้อง</small>
      </div>

      <div class="row">
        <span class="label">🗺 แผนที่</span>
        <div class="seg">
          <button v-for="m in MAP_CHOICES" :key="m.id" type="button" :class="{ on: s.map === m.id }" :disabled="busy" @click="set({ map: m.id })">{{ m.label }}</button>
        </div>
        <small v-if="s.map === 'secret'" class="muted hint">Survivor ไม่รู้แผนที่จนกว่าเกมจะเริ่ม</small>
      </div>

      <div class="row">
        <span class="label">🎭 ตัวละคร</span>
        <div class="seg">
          <button type="button" :class="{ on: !s.random }" :disabled="busy" @click="set({ random: false })">เลือกเอง</button>
          <button type="button" :class="{ on: s.random }" :disabled="busy" @click="set({ random: true })">🎲 สุ่มให้ทุกคน</button>
        </div>
        <label class="check">
          <input type="checkbox" :checked="s.dupes" :disabled="busy" @change="toggleDupes" />
          Survivor ซ้ำกับเพื่อนได้
        </label>
        <label class="check">
          <input type="checkbox" :checked="s.showKiller" :disabled="busy" @change="set({ showKiller: !s.showKiller })" />
          Survivor เห็นฆาตกรที่เลือก
        </label>
        <button type="button" class="ban-toggle" @click="showBans = !showBans">
          🚫 แบนตัวละคร{{ s.bans.length ? ` (${s.bans.length})` : '' }} {{ showBans ? '▴' : '▾' }}
        </button>
      </div>

      <div v-if="showBans" class="bans">
        <p class="muted small">{{ isHost ? 'แตะเพื่อแบน / ยกเลิก — ตัวที่แบนจะเลือกและสุ่มไม่ได้' : 'ตัวที่หัวห้องแบน' }}</p>
        <div class="ban-grid">
          <button
            v-for="c in survivorsList"
            :key="c.id"
            type="button"
            class="ban surv"
            :class="{ on: s.bans.includes(c.id) }"
            :disabled="busy"
            :title="c.name"
            @click="toggleBan(c.id, 'survivor')"
          >
            <img :src="asset(c.images.mini)" :alt="c.name" loading="lazy" />
          </button>
        </div>
        <div class="ban-grid">
          <button
            v-for="c in killersList"
            :key="c.id"
            type="button"
            class="ban kill"
            :class="{ on: s.bans.includes(c.id) }"
            :disabled="busy"
            :title="c.name"
            @click="toggleBan(c.id, 'killer')"
          >
            <img :src="asset(c.images.mini)" :alt="c.name" loading="lazy" />
          </button>
        </div>
      </div>

      <div class="row">
        <span class="label"><BpIcon /> BP เริ่มต้น</span>
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
        <small class="muted hint">ตามเล่ม: Survivor 2 · Killer 4 (หน้า 6)</small>
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
  min-width: 8rem;
  font-weight: 600;
}
.hint {
  flex-basis: 100%;
  padding-left: 8.8rem;
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
.check {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.9rem;
}
.ban-toggle {
  padding: 0.3rem 0.7rem;
  font-size: 0.85rem;
}
.bans {
  padding: 0.6rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgb(0 0 0 / 0.25);
}
.ban-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.4rem;
}
.ban {
  position: relative;
  padding: 0;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  overflow: hidden;
}
.ban img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ban.kill {
  box-shadow: 0 0 0 1px var(--blood-dim);
}
.ban.on img {
  filter: grayscale(1) brightness(0.45);
}
.ban.on::after {
  content: '🚫';
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 1.3rem;
}
.ban:disabled {
  opacity: 1;
  cursor: default;
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
