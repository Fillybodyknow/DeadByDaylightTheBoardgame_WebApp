<script setup lang="ts">
// The killer's Sacrifice Progress going up, as the HUD's own token (ObjectiveHud) blown up in
// the middle of the screen: a ring of 8 cells, the ones already won gold, and the new ones
// filling with gold one after another while the number counts up. It shares the perk cards' queue (fx.perks), so it shows after the hook that caused
// it and the screen waits for it like for a card. A tap skips ahead. The last one has
// FinaleReveal instead.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { asset } from '../../i18n'
import { fxSound } from '../fx/audio'
import { fx } from '../fx/bus'
import { SACRIFICE_TO_WIN } from '../engine/engine'
import type { GameState } from '../engine/types'
import { SACRIFICE_IMAGE } from '../labels'

const props = defineProps<{ st: GameState }>()

/** The entry at the head of the queue, once the dice before it have been shown. */
const current = computed(() => {
  const head = fx.perks[0]
  const dice = fx.dice[0]
  return head?.sacrifice && (!dice || head.id < dice.id) ? head : null
})
const gained = computed(() => current.value?.sacrifice?.gained ?? 1)
const total = computed(() => current.value?.sacrifice?.total ?? 0)

/** The ring (r = 21 in a 48 box) is cut in one cell per sacrifice, with a gap between them. */
const RING = 2 * Math.PI * 21
const GAP = 5
const CELL = RING / SACRIFICE_TO_WIN - GAP
const cells = Array.from({ length: SACRIFICE_TO_WIN }, (_, i) => ({
  // the cell's start, turned round the centre (the ring itself starts at the top, going clockwise)
  turn: (i * 360) / SACRIFICE_TO_WIN + (GAP / RING) * 180,
  i,
}))
/** The number shows the old count first, the new one as the first new cell fills. */
const shown = ref(0)
const bump = ref(0)

import { anim, reducedMotion } from '../../settings'

let timers: number[] = []
// timed with the CSS fill: both run at the player's animation speed
const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, anim(ms)))
function clearTimers() {
  timers.forEach((t) => clearTimeout(t))
  timers = []
}

watch(
  () => current.value?.id,
  (id) => {
    clearTimers()
    const s = current.value?.sacrifice
    if (id === undefined || !s) return
    shown.value = reducedMotion.value ? s.total : s.total - s.gained
    fxSound.perk(true)
    if (!reducedMotion.value)
      later(550, () => {
        shown.value = s.total
        bump.value++
      })
    // each new cell takes 350 ms to fill, one after the other
    later(reducedMotion.value ? 1500 : 2400 + (s.gained - 1) * 350, next)
  },
  { immediate: true },
)

function next() {
  clearTimers()
  fx.perks.shift()
}
onBeforeUnmount(clearTimers)
</script>

<template>
  <transition name="sac">
    <div v-if="current" :key="current.id" class="sac" role="status" aria-live="polite" @click="next">
      <div class="panel">
        <span class="label">Sacrifice Progress</span>
        <span class="icon">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <circle class="track" cx="24" cy="24" r="21" />
            <g v-for="c in cells" :key="c.i" :style="{ transform: `rotate(${c.turn}deg)`, transformOrigin: '24px 24px' }">
              <circle class="cell" cx="24" cy="24" r="21" :stroke-dasharray="`${CELL} ${RING}`" />
              <circle
                v-if="c.i < total"
                class="cell gold"
                :class="{ fresh: c.i >= total - gained }"
                cx="24"
                cy="24"
                r="21"
                :stroke-dasharray="`${CELL} ${RING}`"
                :style="{ '--n': c.i - (total - gained), '--cell': CELL, '--ring': RING }"
              />
            </g>
          </svg>
          <img class="token" :src="asset(SACRIFICE_IMAGE)" alt="" />
        </span>
        <span :key="bump" class="count" :class="{ bump }"><b>{{ shown }}</b><small>/{{ SACRIFICE_TO_WIN }}</small></span>
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
  gap: 0.5rem;
  min-width: min(20rem, 90vw);
  padding: 1rem 1.8rem 1.1rem;
  border: 1px solid rgb(var(--glow) / 0.75);
  border-radius: 14px;
  background: linear-gradient(180deg, rgb(10 11 14 / 0.97), rgb(30 6 9 / 0.97));
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
/* the HUD's icon, five times the size */
.icon {
  position: relative;
  width: 160px;
  height: 160px;
}
.icon svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* the ring starts at the top and fills clockwise */
  transform: rotate(-90deg);
}
.icon img {
  position: absolute;
  inset: 17%;
  width: 66%;
  height: 66%;
}
/* the token is a disc already: it fills the ring */
.icon img.token {
  inset: 11%;
  width: 78%;
  height: 78%;
  border-radius: 50%;
}
.track {
  fill: rgb(0 0 0 / 0.55);
  stroke: rgb(255 255 255 / 0.12);
  stroke-width: 3;
}
/* the ring's cells: a dim slot each, gold once won */
.cell {
  fill: none;
  stroke: rgb(255 255 255 / 0.14);
  stroke-width: 3.5;
}
.cell.gold {
  stroke: #f5c542;
  filter: drop-shadow(0 0 3px rgb(245 197 66 / 0.8));
}
/* a new cell draws itself along its slot, with a flash of light, in turn */
.cell.gold.fresh {
  animation: fill 0.45s ease-out calc(0.55s + var(--n) * 0.35s) both;
}
@keyframes fill {
  from {
    stroke-dasharray: 0 var(--ring);
    stroke: #fff6c8;
    filter: drop-shadow(0 0 10px rgb(255 224 120 / 1));
  }
}
.count {
  display: flex;
  align-items: baseline;
  font-family: var(--font-display);
  line-height: 1;
}
.count b {
  font-size: 2.6rem;
  font-weight: 700;
  color: #f2efe6;
  text-shadow: 0 0 12px rgb(var(--glow) / 0.8);
}
.count small {
  font-size: 1.1rem;
  color: var(--muted);
}
.count.bump {
  animation: bump 0.7s ease-out;
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
@keyframes bump {
  30% {
    transform: scale(1.5);
    filter: brightness(1.6);
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
  .count.bump {
    animation: none;
  }
  .cell.gold.fresh {
    animation: none;
  }
}
</style>
