<script setup lang="ts">
// A small menu at the click, when one spot on the board offers several actions
// (a crow: chase it or Calm Spirit; a survivor: heal or Botany Knowledge…).
import { computed, onBeforeUnmount, onMounted } from 'vue'
import type { BoardAction } from '../boardActions'
import type { GameState } from '../engine/types'
import FaceLabel from './FaceLabel.vue'

const props = defineProps<{ st: GameState; actions: BoardAction[]; x: number; y: number }>()
const emit = defineEmits<{ close: [] }>()

// Keep the menu on screen.
const style = computed(() => ({
  left: `${Math.min(props.x, window.innerWidth - 300)}px`,
  top: `${Math.min(props.y, window.innerHeight - 60 - props.actions.length * 46)}px`,
}))

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
  <div class="catcher" @click="emit('close')" @contextmenu.prevent="emit('close')" />
  <div class="menu card" :style="style" role="menu">
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
