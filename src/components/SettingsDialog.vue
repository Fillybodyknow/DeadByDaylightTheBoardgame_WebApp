<script setup lang="ts">
// The settings, as the PC game's settings menu: a ⚙ button (the app's top bar and the game's
// rail) opens a window with tabs — sound, display, online, data. Everything is remembered on this
// device (settings.ts, and sound.ts / i18n.ts for the volumes and the card language).
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { lang } from '../i18n'
import { settings, resetSettings, type AnimSpeed } from '../settings'
import { muted, sfx, volumes, type Volumes } from '../sound'
import { game, online, quitGame } from '../play/game'
import { TAKEN_KEYS, keyLabel, micList, startMicTest, stopMicTest, voice } from '../play/voice'

// the window is teleported: a class given to this component goes on the ⚙ button
defineOptions({ inheritAttrs: false })

const open = ref(false)
type Tab = 'sound' | 'display' | 'online' | 'data'
const tab = ref<Tab>('sound')
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'sound', label: 'เสียง', icon: '🔊' },
  { id: 'display', label: 'การแสดงผล', icon: '🖥️' },
  { id: 'online', label: 'ออนไลน์', icon: '🌐' },
  { id: 'data', label: 'ข้อมูล', icon: '🗂️' },
]

function toggle() {
  open.value = !open.value
  if (open.value) sfx.click()
}
function close() {
  open.value = false
}
function onKey(e: KeyboardEvent) {
  if (capturing.value) return onCapture(e)
  if (e.key === 'Escape' && open.value) {
    e.stopPropagation()
    close()
  }
}
watch(open, (o) => (o ? window.addEventListener('keydown', onKey, true) : window.removeEventListener('keydown', onKey, true)))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))

// ---------- sound ----------
const SLIDERS: { key: keyof Volumes; label: string; icon: string }[] = [
  { key: 'master', label: 'เสียงรวม', icon: '🔊' },
  { key: 'music', label: 'เพลง', icon: '🎵' },
  { key: 'sfx', label: 'เอฟเฟกต์', icon: '💥' },
]
const icon = computed(() => (muted.value || volumes.master === 0 ? '🔇' : '⚙️'))
function setVolume(key: keyof Volumes, e: Event) {
  volumes[key] = Number((e.target as HTMLInputElement).value) / 100
}
// ---------- voice (online) ----------
// The push-to-talk key: press the button, then the key wanted (Escape: as it was).
const capturing = ref(false)
const keyRefused = ref('')
function onCapture(e: KeyboardEvent) {
  e.preventDefault()
  e.stopPropagation()
  if (e.code === 'Escape') {
    capturing.value = false
    return
  }
  if (TAKEN_KEYS.includes(e.code)) {
    keyRefused.value = `${keyLabel(e.code)} ใช้ทำอย่างอื่นอยู่ เลือกปุ่มอื่น`
    return
  }
  settings.pttKey = e.code
  keyRefused.value = ''
  capturing.value = false
}
watch(open, (o) => {
  if (!o) capturing.value = false
})

// The mic's sensitivity: a gate on the level bar. Out of the channel the bar needs the mic test.
watch([open, tab], ([o, t]) => {
  if (!o || t !== 'sound') stopMicTest()
})
onBeforeUnmount(stopMicTest)
const gatePct = computed(() => Math.round(settings.voiceGate * 100))
/** The level is over the gate: this would be sent. */
const overGate = computed(() => voice.level > settings.voiceGate)
const mics = ref<{ id: string; label: string }[]>([])
async function loadMics() {
  try {
    mics.value = await micList()
  } catch {
    mics.value = []
  }
}
watch([open, tab], ([o, t]) => {
  if (o && t === 'sound') void loadMics()
})

/** A short tap at the new level, so the effects slider can be judged by ear. */
function preview(key: keyof Volumes) {
  if (key !== 'music') sfx.select()
}

// ---------- display ----------
const SPEEDS: { id: AnimSpeed; label: string; sub: string }[] = [
  { id: 'normal', label: 'ปกติ', sub: 'แอนิเมชันเต็ม' },
  { id: 'fast', label: 'เร็ว', sub: 'เร็วขึ้นเท่าตัว' },
  { id: 'skip', label: 'ข้าม', sub: 'เห็นผลแทบทันที' },
]

// ---------- online: the system notification's permission ----------
const permission = ref(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
async function askPermission() {
  if (typeof Notification === 'undefined') return
  permission.value = await Notification.requestPermission()
}
const PERMISSION_TH: Record<string, string> = {
  granted: 'อนุญาตแล้ว',
  denied: 'ถูกบล็อก — เปิดได้จากการตั้งค่าเว็บไซต์ของเบราว์เซอร์',
  default: 'ยังไม่ได้ขอ',
  unsupported: 'เบราว์เซอร์นี้ไม่รองรับ',
}

// ---------- data: each wipe asks once, inside the window ----------
type Wipe = 'game' | 'tutorial' | 'settings'
const confirming = ref<Wipe | null>(null)
const done = ref<Wipe | null>(null)
let doneTimer: number | undefined
const savedGame = computed(() => !online.value && !!game.value)
function wipe(w: Wipe) {
  if (confirming.value !== w) {
    confirming.value = w
    return
  }
  confirming.value = null
  try {
    if (w === 'game') quitGame()
    if (w === 'tutorial') ['dbdl-tutorial-done', 'dbdl-tutorial-side'].forEach((k) => localStorage.removeItem(k))
  } catch {
    // storage blocked: nothing was kept there anyway
  }
  if (w === 'settings') {
    resetSettings()
    Object.assign(volumes, { master: 1, music: 1, sfx: 1 })
    muted.value = false
    lang.value = 'th'
  }
  sfx.select()
  done.value = w
  clearTimeout(doneTimer)
  doneTimer = window.setTimeout(() => (done.value = null), 2500)
}
watch(tab, () => (confirming.value = null))
</script>

<template>
  <button v-bind="$attrs" type="button" class="settings-btn" title="ตั้งค่า" aria-label="ตั้งค่า" :aria-expanded="open" @click="toggle">{{ icon }}</button>
  <Teleport to="body">
    <div v-if="open" class="backdrop" @click.self="close">
      <section class="settings" role="dialog" aria-modal="true" aria-label="ตั้งค่า">
        <header>
          <h2>ตั้งค่า</h2>
          <button type="button" class="x" aria-label="ปิด" @click="close">✕</button>
        </header>
        <nav class="tabs" role="tablist">
          <button v-for="t in TABS" :key="t.id" type="button" role="tab" :aria-selected="tab === t.id" :class="{ on: tab === t.id }" @click="tab = t.id">
            <span aria-hidden="true">{{ t.icon }}</span> {{ t.label }}
          </button>
        </nav>

        <div class="body">
          <!-- sound -->
          <template v-if="tab === 'sound'">
            <label class="switch">
              <input v-model="muted" type="checkbox" />
              <span><b>ปิดเสียงทั้งหมด</b></span>
            </label>
            <label v-for="s in SLIDERS" :key="s.key" class="slider" :class="{ off: muted }">
              <span class="name"><span aria-hidden="true">{{ s.icon }}</span> {{ s.label }}</span>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                :value="Math.round(volumes[s.key] * 100)"
                :disabled="muted"
                :aria-label="s.label"
                @input="setVolume(s.key, $event)"
                @change="preview(s.key)"
              />
              <span class="pct">{{ Math.round(volumes[s.key] * 100) }}</span>
            </label>
            <label class="switch">
              <input v-model="settings.chaseMusic" type="checkbox" />
              <span><b>เพลงไล่ล่า</b><small>เพลงของฆาตกรเมื่อเขาอยู่ห้องเดียวกับผู้รอดชีวิต</small></span>
            </label>
            <h3 class="sub">เสียงพูด (ออนไลน์)</h3>
            <label class="slider" :class="{ off: muted }">
              <span class="name"><span aria-hidden="true">🗣️</span> เสียงเพื่อน</span>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                :value="Math.round(settings.voiceVolume * 100)"
                :disabled="muted"
                aria-label="เสียงเพื่อน"
                @input="settings.voiceVolume = Number(($event.target as HTMLInputElement).value) / 100"
              />
              <span class="pct">{{ Math.round(settings.voiceVolume * 100) }}</span>
            </label>
            <label class="field">
              <b>ไมโครโฟน</b>
              <select v-model="settings.micId">
                <option value="">ค่าเริ่มต้นของเครื่อง</option>
                <option v-for="m in mics" :key="m.id" :value="m.id">{{ m.label }}</option>
              </select>
              <small v-if="mics.length && mics.every((m) => m.label.startsWith('ไมโครโฟน '))">ชื่อไมค์จะขึ้นหลังจากอนุญาตให้ใช้ไมค์ครั้งแรก</small>
            </label>
            <label class="switch">
              <input v-model="settings.noiseFilter" type="checkbox" />
              <span><b>ลดเสียงรบกวน</b><small>ตัวกรองของเบราว์เซอร์: ตัดเสียงพัดลม แอร์ และปรับระดับเสียงพูดให้สม่ำเสมอ — ปิดได้ถ้าใช้ไมค์ดีและอยากได้เสียงธรรมชาติ (ตัดเสียงสะท้อนเปิดไว้เสมอ)</small></span>
            </label>
            <div class="field">
              <b>โหมดไมค์</b>
              <div class="choice two" role="radiogroup" aria-label="โหมดไมค์">
                <button type="button" role="radio" :aria-checked="settings.micMode === 'open'" :class="{ on: settings.micMode === 'open' }" @click="settings.micMode = 'open'">
                  <b>เปิดตลอด</b>
                  <small>กด M เพื่อปิด/เปิดไมค์</small>
                </button>
                <button type="button" role="radio" :aria-checked="settings.micMode === 'ptt'" :class="{ on: settings.micMode === 'ptt' }" @click="settings.micMode = 'ptt'">
                  <b>กดค้างเพื่อพูด</b>
                  <small>พูดเฉพาะตอนกดค้าง</small>
                </button>
              </div>
            </div>
            <div v-if="settings.micMode === 'open'" class="field">
              <div class="keyrow">
                <span><b>ความไวไมค์</b><small>เสียงที่เบากว่าเส้นจะไม่ถูกส่ง — ตั้งเส้นให้อยู่เหนือเสียงพื้นหลัง แต่ต่ำกว่าเสียงพูด</small></span>
                <span class="pct">{{ gatePct ? gatePct : 'ปิด' }}</span>
              </div>
              <div class="gate" :class="{ live: voice.joined || voice.testing }">
                <div class="gate-level" :class="{ over: overGate }" :style="{ width: `${voice.level * 100}%` }" />
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  :value="gatePct"
                  aria-label="ความไวไมค์"
                  @input="settings.voiceGate = Number(($event.target as HTMLInputElement).value) / 100"
                />
              </div>
              <div class="keyrow">
                <small>{{ voice.joined ? (overGate ? 'กำลังส่งเสียง' : 'เงียบ — ไม่ส่งเสียง') : voice.testing ? (overGate ? 'เสียงนี้จะถูกส่ง' : 'เสียงนี้จะไม่ถูกส่ง') : 'กดทดสอบไมค์เพื่อดูระดับเสียง' }}</small>
                <button v-if="!voice.joined" type="button" class="test" :class="{ on: voice.testing }" @click="voice.testing ? stopMicTest() : startMicTest()">
                  {{ voice.testing ? 'หยุดทดสอบ' : '🎙️ ทดสอบไมค์' }}
                </button>
              </div>
            </div>
            <div v-if="settings.micMode === 'ptt'" class="field">
              <div class="keyrow">
                <span><b>ปุ่มกดค้างเพื่อพูด</b><small>แท็บเล็ต: กดค้างปุ่ม 🎙️ บนจอ</small></span>
                <button type="button" class="keycap" :class="{ capturing }" @click="(capturing = !capturing), (keyRefused = '')">
                  {{ capturing ? 'กดปุ่มที่ต้องการ… (Esc ยกเลิก)' : keyLabel(settings.pttKey) }}
                </button>
              </div>
              <small v-if="keyRefused" class="refused">{{ keyRefused }}</small>
            </div>
            <label class="switch">
              <input v-model="settings.voiceAuto" type="checkbox" />
              <span><b>เข้าห้องเสียงอัตโนมัติ</b><small>เมื่อเข้าห้องออนไลน์ (ผู้เล่นพูดได้ ผู้ชมฟังอย่างเดียว)</small></span>
            </label>
          </template>

          <!-- display -->
          <template v-else-if="tab === 'display'">
            <div class="field">
              <b>ความเร็วแอนิเมชัน</b>
              <small>การ์ดแอ็กชัน ลูกเต๋า การเดินของมินิ Perk และ Sacrifice</small>
              <div class="choice" role="radiogroup" aria-label="ความเร็วแอนิเมชัน">
                <button
                  v-for="s in SPEEDS"
                  :key="s.id"
                  type="button"
                  role="radio"
                  :aria-checked="settings.animSpeed === s.id"
                  :class="{ on: settings.animSpeed === s.id }"
                  @click="settings.animSpeed = s.id"
                >
                  <b>{{ s.label }}</b>
                  <small>{{ s.sub }}</small>
                </button>
              </div>
            </div>
            <label class="switch">
              <input v-model="settings.reduceMotion" type="checkbox" />
              <span><b>ลดการเคลื่อนไหว</b><small>ปิดการกะพริบ จอสั่น และแสงเต้น (เปิดให้อัตโนมัติถ้าเครื่องตั้งไว้)</small></span>
            </label>
            <label class="switch">
              <input :checked="lang === 'en'" type="checkbox" @change="lang = lang === 'en' ? 'th' : 'en'" />
              <span><b>ข้อความการ์ดภาษาอังกฤษ</b><small>ข้อความบนการ์ดและบอร์ดตัวละคร — หน้าจอเกมยังเป็นภาษาไทย</small></span>
            </label>
          </template>

          <!-- online -->
          <template v-else-if="tab === 'online'">
            <label class="switch">
              <input v-model="settings.turnSound" type="checkbox" />
              <span><b>เสียงเตือนถึงตาคุณ</b><small>เสียงเตือนและเสียงระฆังเมื่อเกมรอคุณ</small></span>
            </label>
            <label class="switch">
              <input v-model="settings.turnRemind" type="checkbox" />
              <span><b>เตือนซ้ำทุก 20 วินาที</b><small>เมื่อยังเป็นตาคุณและยังไม่ได้เล่น</small></span>
            </label>
            <label class="switch">
              <input v-model="settings.turnNotify" type="checkbox" />
              <span><b>แจ้งเตือนเมื่ออยู่แท็บอื่น</b><small>การแจ้งเตือนของระบบ และชื่อแท็บกะพริบ</small></span>
            </label>
            <div class="field" :class="{ off: !settings.turnNotify }">
              <small>สิทธิ์แจ้งเตือนของเบราว์เซอร์: <b>{{ PERMISSION_TH[permission] }}</b></small>
              <button v-if="permission === 'default'" type="button" :disabled="!settings.turnNotify" @click="askPermission">ขอสิทธิ์แจ้งเตือน</button>
            </div>
          </template>

          <!-- data -->
          <template v-else>
            <div class="wipe">
              <span><b>ล้างเกมออฟไลน์ที่บันทึกไว้</b><small>{{ savedGame ? `มีเกมค้างอยู่ — รอบ ${game?.round}` : 'ไม่มีเกมค้าง' }}</small></span>
              <button type="button" :class="{ danger: confirming === 'game' }" :disabled="!savedGame" @click="wipe('game')">{{ confirming === 'game' ? 'ยืนยัน ล้างเลย' : done === 'game' ? '✓ ล้างแล้ว' : 'ล้าง' }}</button>
            </div>
            <div class="wipe">
              <span><b>รีเซ็ตความคืบหน้า Tutorial</b><small>บทที่ผ่านแล้วกลับเป็นยังไม่ผ่าน</small></span>
              <button type="button" :class="{ danger: confirming === 'tutorial' }" @click="wipe('tutorial')">{{ confirming === 'tutorial' ? 'ยืนยัน รีเซ็ต' : done === 'tutorial' ? '✓ รีเซ็ตแล้ว' : 'รีเซ็ต' }}</button>
            </div>
            <div class="wipe">
              <span><b>คืนค่าการตั้งค่าทั้งหมด</b><small>เสียง เสียงพูด การแสดงผล และการแจ้งเตือน กลับเป็นค่าเริ่มต้น</small></span>
              <button type="button" :class="{ danger: confirming === 'settings' }" @click="wipe('settings')">{{ confirming === 'settings' ? 'ยืนยัน คืนค่า' : done === 'settings' ? '✓ คืนค่าแล้ว' : 'คืนค่า' }}</button>
            </div>
          </template>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(0 0 0 / 0.6);
}
.settings {
  width: min(560px, 100%);
  max-height: min(640px, calc(100vh - 2rem));
  display: grid;
  grid-template-rows: auto auto 1fr;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: rgb(12 13 16 / 0.98);
  box-shadow: 0 20px 60px rgb(0 0 0 / 0.8);
  overflow: hidden;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.9rem 1.1rem 0.5rem;
}
h2 {
  margin: 0;
  font-family: var(--font-display);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.x {
  min-height: 0;
  padding: 0.25rem 0.6rem;
}
.tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0 1.1rem;
  border-bottom: 1px solid var(--line-strong);
  overflow-x: auto;
}
.tabs button {
  min-height: 0;
  padding: 0.55rem 0.8rem;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: none;
  color: var(--muted);
  white-space: nowrap;
}
.tabs button.on {
  color: var(--text);
  border-bottom-color: var(--accent, #d0322b);
}
.body {
  display: grid;
  gap: 0.9rem;
  align-content: start;
  padding: 1rem 1.1rem 1.2rem;
  overflow-y: auto;
}
small {
  display: block;
  color: var(--muted);
  font-size: 0.8rem;
}
.switch {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.6rem;
  align-items: start;
  cursor: pointer;
}
.switch input {
  margin-top: 0.25rem;
  width: 1.05rem;
  height: 1.05rem;
}
/* the gate: the level bar behind the slider, green once over the line */
.gate {
  position: relative;
  height: 1.6rem;
  border-radius: 6px;
  background: rgb(255 255 255 / 0.06);
  overflow: hidden;
}
.gate-level {
  position: absolute;
  inset: 0 auto 0 0;
  background: rgb(255 255 255 / 0.22);
  transition: width 0.05s linear;
}
.gate-level.over {
  background: rgb(63 174 106 / 0.6);
}
/* the slider is only its line: the bar behind it is the track */
.gate input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  background: transparent;
  -webkit-appearance: none;
  appearance: none;
  cursor: ew-resize;
}
.gate input::-webkit-slider-runnable-track {
  height: 100%;
  background: transparent;
}
.gate input::-moz-range-track {
  height: 100%;
  background: transparent;
}
.gate input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 4px;
  height: 1.6rem;
  border-radius: 2px;
  background: #fff;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.7);
}
.gate input::-moz-range-thumb {
  width: 4px;
  height: 1.6rem;
  border: none;
  border-radius: 2px;
  background: #fff;
}
.gate input:focus-visible {
  outline: 2px solid var(--warn, #d9a227);
  outline-offset: 2px;
}
.test.on {
  border-color: #3fae6a;
}
.choice.two {
  grid-template-columns: repeat(2, 1fr);
}
.keyrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
}
.keycap {
  flex: none;
  min-width: 4.5rem;
  font-family: var(--font-display);
  letter-spacing: 0.04em;
}
.keycap.capturing {
  border-color: var(--warn, #d9a227);
  color: var(--warn, #d9a227);
}
.refused {
  color: #ff8a80;
}
.sub {
  margin: 0.4rem 0 0;
  padding-top: 0.7rem;
  border-top: 1px solid var(--line);
  font-size: 0.9rem;
}
select {
  width: 100%;
}
.slider {
  display: grid;
  grid-template-columns: 6.5rem 1fr 2.2rem;
  align-items: center;
  gap: 0.5rem;
}
.slider input {
  width: 100%;
}
.slider .pct {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}
.off {
  opacity: 0.45;
}
.field {
  display: grid;
  gap: 0.35rem;
}
.choice {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.4rem;
}
.choice button {
  display: grid;
  gap: 0.1rem;
  padding: 0.5rem;
  text-align: center;
}
.choice button.on {
  border-color: var(--warn, #d9a227);
  background: rgb(217 162 39 / 0.12);
}
.wipe {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--line);
}
.wipe button {
  flex: none;
}
.wipe button.danger {
  border-color: #e04a3f;
  color: #ffb3ab;
}
@media (max-width: 480px) {
  .choice {
    grid-template-columns: 1fr;
  }
}
</style>
