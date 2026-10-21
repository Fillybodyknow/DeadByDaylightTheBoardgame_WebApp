<script setup lang="ts">
// The killer's Sacrifice Progress going up: the track of hooks lights its new pip. It shares the
// perk cards' queue (fx.perks), so it shows after the hook that caused it and the screen waits for
// it like for a card. A tap skips ahead. The last one has FinaleReveal instead.
import { computed, onBeforeUnmount, watch } from 'vue'
import { asset } from '../../i18n'
import { fxSound } from '../fx/audio'
import { fx } from '../fx/bus'
import { SACRIFICE_TO_WIN } from '../engine/engine'
import type { GameState } from '../engine/types'
import { killerMini } from '../labels'
import Mini from './Mini.vue'

const props = defineProps<{ st: GameState }>()

/** The entry at the head of the queue, once the dice before it have been shown. */
const current = computed(() => {
  const head = fx.perks[0]
  const dice = fx.dice[0]
  return head?.sacrifice && (!dice || head.id < dice.id) ? head : null
})
const total = computed(() => current.value?.sacrifice?.total ?? 0)
const gained = computed(() => current.value?.sacrifice?.gained ?? 1)
const pips = Array.from({ length: SACRIFICE_TO_WIN }, (_, i) => i)

const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

let timer: number | undefined
watch(
  () => current.value?.id,
  (id) => {
    clearTimeout(timer)
    if (id === undefined) return
    fxSound.perk(true)
    timer = window.setTimeout(next, reduceMotion ? 1500 : 2000)
  },
  { immediate: true },
)

function next() {
  clearTimeout(timer)
  fx.perks.shift()
}
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <transition name="sac">
    <div v-if="current" :key="current.id" class="sac" role="status" aria-live="polite" @click="next">
      <div class="panel">
        <span class="label">Sacrifice Progress</span>
        <div class="row">
          <Mini class="face aura-killer" :src="asset(killerMini(props.st))" />
          <div class="pips" aria-hidden="true">
            <span v-for="i in pips" :key="i" class="pip" :class="{ on: i < total, fresh: i >= total - gained && i < total }" />
          </div>
        </div>
        <h2>{{ total }}<small>/{{ SACRIFICE_TO_WIN }}</small></h2>
        <p>{{ props.st.killer.name }} ได้ Sacrifice{{ gained > 1 ? ` +${gained}` : '' }}</p>
      </div>
    </div>
  </transition>
</template>

<style scoped>
/* A lighter stage than the finale's: the board stays dimly in sight behind it. */
.sac {
  --glow: 255 60 60;
  position: fixed;
  inset: 0;
  z-index: 38;
  display: grid;
  place-items: center;
  cursor: pointer;
  background: radial-gradient(circle at 50% 45%, rgb(10 4 4 / 0.55), rgb(3 2 3 / 0.78) 70%);
}
.panel {
  display: grid;
  justify-items: center;
  gap: 0.4rem;
  min-width: min(24rem, 90vw);
  padding: 1rem 1.6rem 1.1rem;
  border: 1px solid rgb(var(--glow) / 0.75);
  border-radius: 14px;
  background: linear-gradient(180deg, rgb(14 15 19 / 0.97), rgb(8 9 12 / 0.97));
  box-shadow:
    0 0 0 1px rgb(0 0 0 / 0.6),
    0 0 50px rgb(var(--glow) / 0.4),
    0 20px 50px rgb(0 0 0 / 0.8);
  text-align: center;
  animation: slam 0.42s cubic-bezier(0.2, 1.35, 0.4, 1) both;
}
.label {
  padding: 0.1rem 0.8rem;
  border-radius: 99px;
  background: rgb(var(--glow) / 0.2);
  border: 1px solid rgb(var(--glow) / 0.75);
  color: rgb(var(--glow));
  font-family: var(--font-display);
  font-size: 0.74rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin: 0.2rem 0;
}
.face {
  width: 56px;
  height: 56px;
}
.pips {
  display: flex;
  gap: 0.35rem;
}
.pip {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid rgb(var(--glow) / 0.45);
  background: rgb(0 0 0 / 0.5);
}
.pip.on {
  border-color: rgb(var(--glow));
  background: rgb(var(--glow));
  box-shadow: 0 0 8px rgb(var(--glow) / 0.7);
}
/* the new pip lights up after the card has landed */
.pip.fresh {
  animation: light 0.5s ease-out 0.4s both;
}
h2 {
  margin: 0;
  font-size: clamp(1.6rem, 4vw, 2.2rem);
  color: #fff;
  text-shadow: 0 0 18px rgb(var(--glow) / 0.8);
}
h2 small {
  font-size: 0.6em;
  color: var(--muted);
}
p {
  margin: 0;
  color: var(--text);
}
@keyframes slam {
  from {
    transform: scale(0.7) translateY(20px);
    opacity: 0;
  }
}
@keyframes light {
  from {
    background: rgb(0 0 0 / 0.5);
    box-shadow: none;
    transform: scale(0.6);
  }
  60% {
    transform: scale(1.6);
    box-shadow: 0 0 22px rgb(var(--glow));
  }
}
.sac-enter-active {
  transition: opacity 0.15s;
}
.sac-leave-active {
  transition: opacity 0.2s;
}
.sac-enter-from,
.sac-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .panel,
  .pip.fresh {
    animation: none;
  }
}
</style>
