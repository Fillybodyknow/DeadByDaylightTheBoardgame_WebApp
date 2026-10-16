<script setup lang="ts">
// The sound button: a click opens a small panel with the mute switch and three sliders — master,
// music (ambient and chase) and effects. Used in the app's top bar and the game's rail.
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { muted, sfx, volumes, type Volumes } from '../sound'

const open = ref(false)
const btn = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
/** Where the panel sits: beside a button on the left edge (the game's rail), else under it. */
const place = ref<Record<string, string>>({})

const SLIDERS: { key: keyof Volumes; label: string; icon: string }[] = [
  { key: 'master', label: 'เสียงรวม', icon: '🔊' },
  { key: 'music', label: 'เพลง', icon: '🎵' },
  { key: 'sfx', label: 'เอฟเฟกต์', icon: '💥' },
]

const icon = computed(() => (muted.value || volumes.master === 0 ? '🔇' : volumes.master < 0.5 ? '🔉' : '🔊'))

function position() {
  const r = btn.value?.getBoundingClientRect()
  if (!r) return
  if (r.left < 160) place.value = { left: `${r.right + 8}px`, bottom: `${Math.max(8, innerHeight - r.bottom)}px` }
  else place.value = { top: `${r.bottom + 6}px`, right: `${Math.max(8, innerWidth - r.right)}px` }
}

function toggle() {
  open.value = !open.value
  if (open.value) {
    position()
    void nextTick(() => {
      document.addEventListener('pointerdown', outside, true)
      document.addEventListener('keydown', onKey)
    })
  } else close()
}

function close() {
  open.value = false
  document.removeEventListener('pointerdown', outside, true)
  document.removeEventListener('keydown', onKey)
}

function outside(e: PointerEvent) {
  const t = e.target as Node
  if (!panel.value?.contains(t) && !btn.value?.contains(t)) close()
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}
onBeforeUnmount(close)

function set(key: keyof Volumes, e: Event) {
  volumes[key] = Number((e.target as HTMLInputElement).value) / 100
}
/** A short tap at the new level, so the effects slider can be judged by ear. */
function preview(key: keyof Volumes) {
  if (key !== 'music') sfx.select()
}
</script>

<template>
  <!-- one root, so the parent's class and scoped styles land on the button; the panel is
       teleported out of it -->
  <button ref="btn" type="button" title="ตั้งค่าเสียง" :aria-expanded="open" @click.self="toggle">
    {{ icon }}
  <Teleport to="body">
    <div v-if="open" ref="panel" class="sound-panel" role="dialog" aria-label="ตั้งค่าเสียง" :style="place">
      <div class="head">
        <b>เสียง</b>
        <label class="mute">
          <input v-model="muted" type="checkbox" />
          ปิดเสียงทั้งหมด
        </label>
      </div>
      <label v-for="s in SLIDERS" :key="s.key" class="row" :class="{ off: muted }">
        <span class="name"><span aria-hidden="true">{{ s.icon }}</span> {{ s.label }}</span>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          :value="Math.round(volumes[s.key] * 100)"
          :disabled="muted"
          :aria-label="s.label"
          @input="set(s.key, $event)"
          @change="preview(s.key)"
        />
        <span class="pct">{{ Math.round(volumes[s.key] * 100) }}</span>
      </label>
    </div>
  </Teleport>
  </button>
</template>

<style scoped>
.sound-panel {
  position: fixed;
  z-index: 60;
  width: 260px;
  display: grid;
  gap: 0.55rem;
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: rgb(12 13 16 / 0.97);
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.75);
  animation: pop 0.14s ease-out;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.head b {
  font-family: var(--font-display);
  letter-spacing: 0.05em;
}
.mute {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.78rem;
  color: var(--muted);
  cursor: pointer;
}
.row {
  display: grid;
  grid-template-columns: 5.2rem 1fr 2rem;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
}
.row.off {
  opacity: 0.45;
}
.row input {
  width: 100%;
  accent-color: var(--blood-bright);
}
.pct {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}
@keyframes pop {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}
</style>
