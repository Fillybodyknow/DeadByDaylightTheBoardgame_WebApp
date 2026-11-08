<script setup lang="ts">
// A small menu at the click, when one spot on the board offers several actions
// (a survivor: heal or Botany Knowledge…). When some of them use a perk (a crow: chase it, Calm
// Spirit or Treacherous Crows), it is a window in the middle instead: each perk as its card, to
// use it — several at once, to pick which — and the plain action under them, not using one.
import { computed, onBeforeUnmount, onMounted } from 'vue'
import type { BoardAction } from '../boardActions'
import type { GameState } from '../engine/types'
import FaceLabel from './FaceLabel.vue'
import PerkCard from './PerkCard.vue'

const props = defineProps<{ st: GameState; actions: BoardAction[]; x: number; y: number }>()
const emit = defineEmits<{ close: [] }>()

// Keep the menu on screen.
const style = computed(() => ({
  left: `${Math.min(props.x, window.innerWidth - 300)}px`,
  top: `${Math.min(props.y, window.innerHeight - 60 - props.actions.length * 46)}px`,
}))

const perks = computed(() => props.actions.filter((a) => a.perk))
const plain = computed(() => props.actions.filter((a) => !a.perk))
/** A perk choice's words without the perk's name in front (its card says it). */
const what = (a: BoardAction) => a.label.replace(/^[^:]+:\s*/, '')

function pick(a: BoardAction) {
  emit('close')
  a.run()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="catcher" :class="{ dim: perks.length }" @click="emit('close')" @contextmenu.prevent="emit('close')" />
  <div v-if="perks.length" class="menu card perk-menu" role="dialog" aria-modal="true">
    <p class="ask">{{ perks.length > 1 ? 'ใช้ Perk ไหน?' : 'ใช้ Perk นี้ไหม?' }}</p>
    <PerkCard v-for="(a, i) in perks" :key="i" :perk="a.perk!" state="ready" :hint="`👆 กดการ์ดเพื่อใช้: ${what(a)}`" @pick="pick(a)" />
    <button v-for="(a, i) in plain" :key="`p${i}`" class="plain" @click="pick(a)">
      <FaceLabel :st="st" :who="a.who" :text="`ไม่ใช้ Perk — ${a.label}`" :icon="a.icon" />
    </button>
    <button class="cancel" @click="emit('close')">ยกเลิก</button>
  </div>
  <div v-else class="menu card" :style="style" role="menu">
    <p class="title">เลือกสิ่งที่จะทำ</p>
    <button v-for="(a, i) in actions" :key="i" role="menuitem" @click="pick(a)">
      <FaceLabel :st="st" :who="a.who" :text="a.label" :icon="a.icon" />
    </button>
    <button class="cancel" @click="emit('close')">ยกเลิก</button>
  </div>
</template>

<style scoped>
.catcher {
  position: fixed;
  inset: 0;
  z-index: 41;
}
.catcher.dim {
  background: rgb(0 0 0 / 0.55);
}
/* a perk to use or not: a window in the middle, the cards at their size */
.perk-menu {
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(440px, calc(100vw - 32px));
  max-height: calc(var(--vh, 100vh) - 48px);
  overflow-y: auto;
  gap: 0.55rem;
  padding: 0.9rem;
  animation: pop-mid 0.16s ease-out;
}
@keyframes pop-mid {
  from {
    transform: translate(-50%, -50%) scale(0.92);
    opacity: 0;
  }
}
.ask {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  color: #ffe9b0;
}
.plain {
  margin-top: 0.15rem;
}
.menu {
  position: fixed;
  z-index: 42;
  width: 290px;
  display: grid;
  gap: 0.35rem;
  padding: 0.6rem;
  border-color: #ff8a3d;
  box-shadow:
    0 0 0 2px rgb(255 138 61 / 0.35),
    0 16px 40px rgb(0 0 0 / 0.75);
  animation: pop 0.16s ease-out;
}
.title {
  margin: 0 0 0.1rem;
  font-size: 0.78rem;
  color: var(--muted);
  letter-spacing: 0.06em;
}
button {
  text-align: left;
  padding: 0.5rem 0.7rem;
}
.cancel {
  background: none;
  border-color: transparent;
  color: var(--muted);
  font-size: 0.85rem;
}
@keyframes pop {
  from {
    transform: scale(0.92);
    opacity: 0;
  }
}
</style>
