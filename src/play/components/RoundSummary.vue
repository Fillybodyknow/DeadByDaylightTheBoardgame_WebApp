<script setup lang="ts">
// End-of-round summary, shown after cleanup and before the next round's planning. For someone only
// watching (`auto`, ms) it closes by itself, a bar under the button showing the time left.
import { computed, onBeforeUnmount, ref } from 'vue'
import { GENERATORS_TO_POWER, SACRIFICE_TO_WIN, generatorsDone } from '../engine/engine'
import type { GameState } from '../engine/types'
import { roundSummary } from '../stats'
import BpText from '../../components/BpText.vue'

const props = defineProps<{ st: GameState; round: number; auto?: number; read?: number }>()
const emit = defineEmits<{ close: []; read: [ms: number] }>()

/** What is left of the time to read it (1 → 0), while closing by itself. */
const left = ref(1)
let timer: number | null = null
if (props.auto) {
  // shown again after stepping aside for an animation: the time already read stays read
  const start = Date.now() - (props.read ?? 0)
  left.value = Math.max(0, 1 - (props.read ?? 0) / props.auto)
  // a timer, not a CSS animation: reading time isn't scaled with the animation speed setting
  timer = window.setInterval(() => {
    const read = Date.now() - start
    emit('read', read)
    left.value = Math.max(0, 1 - read / props.auto!)
    if (left.value === 0) emit('close')
  }, 100)
}
onBeforeUnmount(() => timer !== null && clearInterval(timer))

const sum = computed(() => roundSummary(props.st, props.round))
const gained = computed(() => sum.value.sacrificeAfter - sum.value.sacrificeBefore)
</script>

<template>
  <div class="backdrop">
    <div class="card modal" role="dialog" aria-modal="true">
      <p class="eyebrow">เก็บกวาด</p>
      <h2>สรุปรอบ {{ round }}</h2>

      <div class="tiles">
        <div class="tile killer">
          <span class="label">Sacrifice</span>
          <div class="pips">
            <i v-for="i in SACRIFICE_TO_WIN" :key="i" :class="{ on: i <= sum.sacrificeAfter, new: i > sum.sacrificeBefore && i <= sum.sacrificeAfter }" />
          </div>
          <strong>{{ gained > 0 ? `+${gained}` : '±0' }}</strong>
        </div>
        <div class="tile survivor">
          <span class="label">Generator</span>
          <div class="pips">
            <i v-for="i in GENERATORS_TO_POWER" :key="i" class="gen" :class="{ on: i <= generatorsDone(st), new: i > generatorsDone(st) - sum.gensDone && i <= generatorsDone(st) }" />
          </div>
          <strong>{{ sum.repairs > 0 ? `ซ่อม +${sum.repairs}` : 'ไม่ได้ซ่อม' }}</strong>
        </div>
      </div>

      <ul v-if="sum.lines.length" class="lines">
        <li v-for="(l, i) in sum.lines" :key="i" :class="l.tone" :style="{ animationDelay: `${120 + i * 70}ms` }"><BpText :text="l.text" /></li>
      </ul>
      <p v-else class="muted">รอบนี้เงียบ… ไม่มีใครบาดเจ็บหรือถูกแขวน</p>

      <button class="primary" @click="emit('close')">ไปรอบ {{ round + 1 }}</button>
      <div v-if="auto" class="autoclose" aria-hidden="true"><i :style="{ transform: `scaleX(${left})` }" /></div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 38;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(4 5 7 / 0.8);
  backdrop-filter: blur(5px);
  animation: fade 0.25s ease-out;
}
.modal {
  width: min(30rem, 100%);
  display: grid;
  gap: 0.9rem;
  animation: rise 0.35s cubic-bezier(0.2, 1.3, 0.4, 1);
}
.eyebrow {
  margin: 0;
  color: var(--blood-bright);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-family: var(--font-display);
  font-size: 0.85rem;
}
h2 {
  margin: 0;
}
.tiles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}
/* watching: the time left before it closes by itself */
.autoclose {
  height: 3px;
  margin-top: -0.5rem;
  border-radius: 2px;
  background: rgb(255 255 255 / 0.08);
  overflow: hidden;
}
.autoclose i {
  display: block;
  height: 100%;
  background: var(--blood-bright);
  transform-origin: left;
  transition: transform 0.1s linear;
}
.tile {
  display: grid;
  gap: 0.4rem;
  padding: 0.7rem;
  border-radius: var(--radius);
  border: 1px solid var(--line-strong);
  background: rgb(0 0 0 / 0.3);
}
.tile.killer {
  border-color: var(--blood-dim);
}
.label {
  font-family: var(--font-display);
  font-size: 0.8rem;
  text-transform: uppercase;
  color: var(--muted);
}
.pips {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
}
.pips i {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid var(--blood-dim);
}
.pips i.on {
  background: var(--blood);
}
.pips i.gen {
  border-radius: 3px;
  border-color: #6b5a1c;
}
.pips i.gen.on {
  background: #f5c542;
}
.pips i.new {
  animation: glow 0.9s ease-in-out 3;
}
@keyframes glow {
  50% {
    transform: scale(1.4);
    box-shadow: 0 0 12px currentColor;
  }
}
.tile.killer .pips i.new {
  color: #ff3b30;
}
.tile.survivor .pips i.new {
  color: #f5c542;
}
strong {
  font-family: var(--font-display);
  font-size: 1.2rem;
}
.tile.killer strong {
  color: #ff8a80;
}
.lines {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.3rem;
}
.lines li {
  padding: 0.3rem 0.6rem;
  border-left: 3px solid var(--line-strong);
  background: rgb(0 0 0 / 0.25);
  animation: slide 0.35s ease-out backwards;
}
.lines li.killer {
  border-left-color: var(--blood);
}
.lines li.survivor {
  border-left-color: #c9b98a;
}
.lines li.game {
  border-left-color: #f5c542;
  color: #f5c542;
}
@keyframes slide {
  from {
    transform: translateX(-12px);
    opacity: 0;
  }
}
@keyframes fade {
  from {
    opacity: 0;
  }
}
@keyframes rise {
  from {
    transform: translateY(24px) scale(0.96);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .backdrop,
  .modal,
  .lines li,
  .pips i.new {
    animation: none;
  }
}
</style>
