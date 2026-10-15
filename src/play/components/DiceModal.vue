<script setup lang="ts">
// Dice rolled in the middle of the screen: they tumble, land, then the result pops.
// One roll at a time from the queue; a click skips ahead.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { sfx } from '../../sound'
import type { Die } from '../engine/types'
import { fx } from '../fx/bus'
import DiceRow from './DiceRow.vue'

// Waits while a perk card is showing: the perk usually explains the roll that follows.
const current = computed(() => (fx.perks.length ? null : (fx.dice[0] ?? null)))
const phase = ref<'tumble' | 'landed'>('tumble')
const shown = ref<Die[]>([])

const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const TUMBLE_MS = reduceMotion ? 0 : 750
const HOLD_MS = 1500

let tick: number | undefined
let timers: number[] = []

function clear() {
  clearInterval(tick)
  timers.forEach(clearTimeout)
  timers = []
}

watch(
  () => current.value?.id,
  () => {
    clear()
    const c = current.value
    if (!c) return
    phase.value = 'tumble'
    sfx.rattle()
    // Flick through random faces while tumbling.
    shown.value = c.dice.map((d) => ({ ...d, face: Math.floor(Math.random() * 6) }))
    tick = window.setInterval(() => (shown.value = c.dice.map((d) => ({ ...d, face: Math.floor(Math.random() * 6) }))), 70)
    timers.push(
      window.setTimeout(() => {
        clearInterval(tick)
        shown.value = c.dice
        phase.value = 'landed'
        sfx.land()
      }, TUMBLE_MS),
      window.setTimeout(next, TUMBLE_MS + HOLD_MS),
    )
  },
  { immediate: true },
)

function next() {
  clear()
  fx.dice.shift()
}

onBeforeUnmount(clear)
</script>

<template>
  <transition name="dice">
    <div v-if="current" class="dice-modal" role="status" @click="next">
      <div class="panel" :class="[phase, current.tone]">
        <p class="title">{{ current.title }}</p>
        <div class="dice" :class="{ tumbling: phase === 'tumble' }">
          <DiceRow :dice="shown" big />
        </div>
        <p class="outcome">{{ phase === 'landed' ? current.outcome : '…' }}</p>
        <p class="hint">แตะเพื่อข้าม</p>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.dice-modal {
  position: fixed;
  inset: 0;
  z-index: 35;
  display: grid;
  place-items: center;
  background: radial-gradient(circle, rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.15) 60%);
  cursor: pointer;
}
.panel {
  display: grid;
  justify-items: center;
  gap: 0.6rem;
  padding: 1.4rem 2.2rem;
  min-width: 18rem;
  background: rgb(14 15 19 / 0.94);
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  box-shadow: 0 20px 60px rgb(0 0 0 / 0.7);
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.panel.landed.good {
  border-color: #c9b98a;
}
.panel.landed.great {
  border-color: #f5c542;
  box-shadow:
    0 20px 60px rgb(0 0 0 / 0.7),
    0 0 40px rgb(245 197 66 / 0.45);
}
.panel.landed.bad {
  border-color: var(--blood);
  box-shadow:
    0 20px 60px rgb(0 0 0 / 0.7),
    0 0 40px rgb(200 20 29 / 0.5);
}
.title {
  margin: 0;
  font-family: var(--font-display);
  letter-spacing: 0.04em;
  color: var(--muted);
}
.dice :deep(.die) {
  width: 84px;
  height: 84px;
  border-radius: 12px;
}
.dice.tumbling :deep(.die) {
  animation: tumble 0.28s linear infinite;
}
.dice.tumbling :deep(.die:nth-child(2)) {
  animation-duration: 0.33s;
  animation-direction: reverse;
}
.dice.tumbling :deep(.die:nth-child(3)) {
  animation-duration: 0.25s;
}
@keyframes tumble {
  0% {
    transform: rotate(0) translateY(0) scale(0.9);
  }
  25% {
    transform: rotate(90deg) translateY(-14px) scale(1);
  }
  50% {
    transform: rotate(180deg) translateY(0) scale(0.92);
  }
  75% {
    transform: rotate(270deg) translateY(-8px) scale(1);
  }
  100% {
    transform: rotate(360deg) translateY(0) scale(0.9);
  }
}
.panel.landed :deep(.die) {
  animation: slam 0.35s cubic-bezier(0.2, 1.8, 0.4, 1);
}
@keyframes slam {
  from {
    transform: scale(1.5);
  }
}
.outcome {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 700;
  text-transform: uppercase;
  min-height: 2.2rem;
}
.landed .outcome {
  animation: pop 0.4s cubic-bezier(0.2, 1.8, 0.4, 1);
}
.great .outcome {
  color: #f5c542;
  text-shadow: 0 0 18px rgb(245 197 66 / 0.7);
}
.good .outcome {
  color: #e9e6df;
}
.bad .outcome {
  color: var(--blood-bright);
  text-shadow: 0 0 18px rgb(255 40 40 / 0.6);
}
@keyframes pop {
  from {
    transform: scale(0.4);
    opacity: 0;
  }
}
.hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--muted);
}
.dice-enter-active,
.dice-leave-active {
  transition: opacity 0.2s;
}
.dice-enter-from,
.dice-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .dice.tumbling :deep(.die),
  .panel.landed :deep(.die),
  .landed .outcome {
    animation: none;
  }
}
</style>
