<script setup lang="ts">
// The voice channel's button (online: the room's bar, the game's controls) and its panel: join
// (a player talks, a spectator listens), the microphone on or off, who is in and who is speaking,
// each one's volume on this device, leaving. In push to talk, holding the button talks (on a
// tablet that is the way to); a short tap still opens the panel.
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { settings } from '../../settings'
import { muted, sfx } from '../../sound'
import { canSpeak, canVoice, joinVoice, keyLabel, leaveVoice, micLive, pttDown, pttUp, toggleMic, unblock, voice, voiceMembers } from '../voice'

const open = ref(false)
const btn = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const pos = ref<Record<string, string>>({})

/** Beside the button, on screen: above it in the lower half of the screen, below it otherwise. */
async function place() {
  await nextTick()
  const r = btn.value?.getBoundingClientRect()
  if (!r) return
  const w = Math.min(320, window.innerWidth - 16)
  const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8))
  pos.value = r.top > window.innerHeight / 2 ? { left: `${left}px`, bottom: `${window.innerHeight - r.top + 8}px`, width: `${w}px` } : { left: `${left}px`, top: `${r.bottom + 8}px`, width: `${w}px` }
}

/** Push to talk is on for this device (a player in the channel). */
const ptt = computed(() => voice.joined && canSpeak.value && settings.micMode === 'ptt')

// Holding the button talks; let go within a moment and it was a tap, which opens the panel.
const TAP_MS = 250
let downAt = 0
let held = false
function onDown(e: PointerEvent) {
  if (!ptt.value || e.button !== 0) return
  downAt = performance.now()
  ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  pttDown()
}
function onUp() {
  if (!downAt) return
  held = performance.now() - downAt >= TAP_MS
  downAt = 0
  pttUp()
}
function onClick() {
  if (held) {
    held = false
    return
  }
  toggle()
}

function toggle() {
  sfx.click()
  open.value = !open.value
  if (open.value) void place()
}

function onOutside(e: PointerEvent) {
  const t = e.target as Node
  if (open.value && !panel.value?.contains(t) && !btn.value?.contains(t)) open.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}
watch(open, (o) => {
  if (o) {
    window.addEventListener('pointerdown', onOutside, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', place)
  } else {
    window.removeEventListener('pointerdown', onOutside, true)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('resize', place)
  }
})
onBeforeUnmount(() => {
  pttUp()
  window.removeEventListener('pointerdown', onOutside, true)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', place)
})

const listening = computed(() => voice.joined && !canSpeak.value)
const icon = computed(() => (!voice.joined ? '🎙️' : listening.value ? '🎧' : ptt.value ? '🎙️' : voice.micOff ? '🔇' : '🎙️'))
const title = computed(() =>
  !voice.joined
    ? 'เสียงพูด — เข้าห้องเสียง'
    : listening.value
      ? 'เสียงพูด — กำลังฟัง (ผู้ชม)'
      : ptt.value
        ? `เสียงพูด — กดค้าง ${keyLabel(settings.pttKey)} หรือกดค้างปุ่มนี้เพื่อพูด`
        : voice.micOff
          ? 'เสียงพูด — ไมค์ปิดอยู่ (M เปิดไมค์)'
          : 'เสียงพูด — ไมค์เปิดอยู่ (M ปิดไมค์)',
)
/** Others in the channel, counted on the button. */
const others = computed(() => voiceMembers.value.filter((m) => !m.me).length)
const meSpeaking = computed(() => !!voice.speaking[voiceMembers.value.find((m) => m.me)?.id ?? ''])

const LINK_TH = { connecting: 'กำลังเชื่อมต่อ…', connected: '', failed: 'เชื่อมต่อไม่ได้' } as const

async function join() {
  await joinVoice()
  if (voice.joined) sfx.select()
}
function leave() {
  sfx.click()
  void leaveVoice()
}
function setGain(id: string, e: Event) {
  voice.gain[id] = Number((e.target as HTMLInputElement).value) / 100
}
</script>

<template>
  <button
    v-if="canVoice"
    ref="btn"
    type="button"
    class="voice-btn"
    :class="{ joined: voice.joined, off: voice.joined && !ptt && voice.micOff && !listening, listening, ptt, live: ptt && micLive, speaking: meSpeaking, blocked: voice.blocked }"
    :title="title"
    :aria-label="title"
    :aria-expanded="open"
    @click="onClick"
    @pointerdown="onDown"
    @pointerup="onUp"
    @pointercancel="onUp"
    @contextmenu="ptt && $event.preventDefault()"
  >
    {{ icon }}<b v-if="others" class="count">{{ others }}</b>
  </button>
  <Teleport to="body">
    <section v-if="open && canVoice" ref="panel" class="voice-panel" :style="pos" role="dialog" aria-label="เสียงพูด">
      <header>
        <h2>เสียงพูด</h2>
        <small>{{ voiceMembers.length ? `${voiceMembers.length} คนในห้องเสียง` : 'ยังไม่มีใครในห้องเสียง' }}</small>
      </header>

      <template v-if="!voice.joined">
        <button type="button" class="primary wide" :disabled="voice.busy" @click="join">
          {{ voice.busy ? 'กำลังเปิดไมค์…' : canSpeak ? '🎙️ เข้าห้องเสียง' : '🎧 ฟังเสียง' }}
        </button>
        <p v-if="!canSpeak" class="hint">ผู้ชมฟังได้อย่างเดียว พูดได้เฉพาะผู้เล่นที่มีที่นั่ง</p>
      </template>
      <template v-else>
        <button v-if="voice.blocked" type="button" class="primary wide" @click="unblock">🔊 แตะเพื่อเปิดเสียงเพื่อน</button>
        <div class="row">
          <button
            v-if="ptt"
            type="button"
            class="wide hold"
            :class="{ live: micLive }"
            @pointerdown.prevent="($event.currentTarget as Element).setPointerCapture?.($event.pointerId), pttDown()"
            @pointerup="pttUp"
            @pointercancel="pttUp"
            @contextmenu.prevent
          >
            {{ micLive ? '🎙️ กำลังพูด…' : `🎙️ กดค้างเพื่อพูด (${keyLabel(settings.pttKey)})` }}
          </button>
          <button v-else-if="!listening" type="button" class="wide" :class="{ danger: voice.micOff }" :title="voice.micOff ? 'เปิดไมค์ (M)' : 'ปิดไมค์ (M)'" @click="toggleMic">
            {{ voice.micOff ? '🔇 เปิดไมค์' : '🎙️ ปิดไมค์' }} <small>(M)</small>
          </button>
          <span v-else class="hint grow">🎧 กำลังฟัง — ผู้ชมพูดไม่ได้</span>
          <button type="button" @click="leave">ออก</button>
        </div>
      </template>
      <p v-if="voice.error" class="error">{{ voice.error }}</p>
      <p v-if="muted" class="hint">เสียงทั้งหมดปิดอยู่ (ตั้งค่า ⚙️ → เสียง) จึงไม่ได้ยินเพื่อน</p>

      <ul v-if="voiceMembers.length" class="members">
        <li v-for="m in voiceMembers" :key="m.id" :class="{ speaking: m.speaking }">
          <span class="dot" aria-hidden="true">{{ m.listener ? '🎧' : m.micOff ? '🔇' : '🎙️' }}</span>
          <span class="name">
            {{ m.name }}<small v-if="m.me"> (คุณ)</small><small v-else-if="m.listener"> · ผู้ชม</small>
            <small v-if="voice.joined && !m.me && LINK_TH[m.link]" class="link" :class="m.link">{{ LINK_TH[m.link] }}</small>
          </span>
          <input
            v-if="voice.joined && !m.me && !m.listener"
            type="range"
            min="0"
            max="100"
            step="5"
            :value="Math.round((voice.gain[m.id] ?? 1) * 100)"
            :aria-label="`ความดังของ ${m.name}`"
            :title="`ความดังของ ${m.name} บนเครื่องนี้`"
            @input="setGain(m.id, $event)"
          />
        </li>
      </ul>
      <p class="hint">ทุกคนในห้องได้ยินกันหมด รวมถึงฆาตกร — ห้ามคุยลับ (หน้า 8)</p>
    </section>
  </Teleport>
</template>

<style scoped>
.voice-btn {
  position: relative;
}
.voice-btn.joined {
  border-color: #3fae6a;
}
.voice-btn.off {
  border-color: #e04a3f;
}
.voice-btn.listening {
  border-color: #7fd0ff;
}
/* push to talk: the button is held, so it mustn't scroll, select or pop a menu */
.voice-btn.ptt,
.hold {
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
.voice-btn.live,
.hold.live {
  border-color: #3fae6a;
  background: rgb(63 174 106 / 0.25);
  box-shadow:
    0 0 0 2px #3fae6a,
    0 0 16px rgb(63 174 106 / 0.8);
}
.voice-btn.speaking {
  box-shadow:
    0 0 0 2px #3fae6a,
    0 0 14px rgb(63 174 106 / 0.7);
}
.voice-btn.blocked {
  animation: voice-ask 1.2s ease-in-out infinite;
}
@keyframes voice-ask {
  50% {
    box-shadow: 0 0 0 2px #d9a227;
  }
}
.count {
  position: absolute;
  top: -0.35rem;
  right: -0.35rem;
  min-width: 1.1rem;
  padding: 0 0.25rem;
  border-radius: 999px;
  background: #3fae6a;
  color: #fff;
  font-size: 0.68rem;
  line-height: 1.1rem;
  text-align: center;
}
.voice-panel {
  position: fixed;
  z-index: 70;
  display: grid;
  gap: 0.6rem;
  max-height: min(70vh, 520px);
  overflow-y: auto;
  padding: 0.85rem;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background: rgb(14 15 19 / 0.97);
  box-shadow: 0 10px 34px rgb(0 0 0 / 0.7);
}
header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}
h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.95rem;
  letter-spacing: 0.04em;
}
small,
.hint {
  color: var(--muted);
  font-size: 0.78rem;
}
.hint {
  margin: 0;
}
.error {
  margin: 0;
  color: #ff8a80;
  font-size: 0.82rem;
}
.wide {
  width: 100%;
}
.row {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}
.row .wide {
  flex: 1;
}
.grow {
  flex: 1;
}
.danger {
  border-color: #e04a3f;
  color: #ffb3ab;
}
.members {
  display: grid;
  gap: 0.3rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.members li {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.45rem;
  padding: 0.3rem 0.45rem;
  border-radius: 8px;
  border: 1px solid transparent;
}
.members li.speaking {
  border-color: #3fae6a;
  background: rgb(63 174 106 / 0.12);
}
.name {
  min-width: 0;
  overflow-wrap: anywhere;
}
.link {
  display: block;
}
.link.failed {
  color: #ff8a80;
}
.members input {
  width: 6rem;
}
</style>
