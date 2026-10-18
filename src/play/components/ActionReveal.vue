<script setup lang="ts">
// A player's action, shown for a moment before the board plays it out: who did it, the movement
// card, prop or power it took, and whom it hit. It shares the perk cards' queue (fx.perks), so
// everything shows in the order it happened, and the screen waits for it like for a perk card.
// A tap skips ahead.
import { computed, onBeforeUnmount, watch } from 'vue'
import { sfx } from '../../sound'
import { asset } from '../../i18n'
import type { GameState } from '../engine/types'
import { fxSound } from '../fx/audio'
import { fx } from '../fx/bus'
import { VICTOR_MINI, killerMini, survivorMini } from '../labels'
import Mini from './Mini.vue'
import BpText from '../../components/BpText.vue'

const props = defineProps<{ st: GameState }>()

/** The action at the head of the queue, once the dice before it have been shown. */
const current = computed(() => {
  const head = fx.perks[0]
  const dice = fx.dice[0]
  return head?.action && (!dice || head.id < dice.id) ? head.action : null
})
const killer = computed(() => current.value?.owner === 'killer')

const LABEL = { move: 'เคลื่อนที่', action: 'แอ็กชัน', power: 'ใช้พลัง', passive: 'Passive' } as const

const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

let timer: number | undefined
watch(
  () => current.value?.id,
  (id) => {
    clearTimeout(timer)
    const a = current.value
    if (id === undefined || !a) return
    if (a.kind === 'power') fxSound.perk(true)
    else if (a.kind === 'move') sfx.drop()
    else sfx.select()
    timer = window.setTimeout(next, a.kind === 'move' ? 1000 : reduceMotion ? 1200 : 1400)
  },
  { immediate: true },
)

function next() {
  clearTimeout(timer)
  fx.perks.shift()
}
onBeforeUnmount(() => clearTimeout(timer))

const face = (o: number | 'killer') => (o === 'killer' ? killerMini(props.st) : survivorMini(props.st, o))
/** The picture's shape: a portrait card, the wide power card (cropped to its icon), or a token. */
const shape = computed(() => {
  const a = current.value
  if (!a?.image) return null
  if (a.kind === 'power' && a.image.includes('/power-')) return 'power'
  if (a.image.includes('/movement/')) return 'card'
  return 'token'
})
</script>

<template>
  <transition name="cast">
    <div v-if="current" :key="current.id" class="cast" :class="[current.kind, { killer }]" role="status" aria-live="polite" @click="next">
      <div class="panel">
        <span class="label">{{ LABEL[current.kind] }}</span>
        <div class="row">
          <Mini class="face" :class="killer ? 'aura-killer' : 'aura-survivor'" :src="asset(current.victor ? VICTOR_MINI : face(current.owner))" />
          <template v-if="current.image">
            <span class="arrow" aria-hidden="true">›</span>
            <span v-if="shape === 'power'" class="pic power" :style="{ backgroundImage: `url(${asset(current.image)})` }" />
            <img v-else class="pic" :class="shape" :src="asset(current.image)" alt="" />
          </template>
          <!-- a whole room hit at once -->
          <template v-if="current.targets?.length">
            <span class="arrow" aria-hidden="true">›</span>
            <span class="targets">
              <Mini v-for="t in current.targets" :key="t" class="face target" :src="asset(face(t))" />
            </span>
          </template>
          <template v-else-if="current.target !== undefined">
            <span class="arrow" aria-hidden="true">›</span>
            <Mini class="face target" :src="asset(face(current.target))" />
          </template>
        </div>
        <h2><BpText :text="current.title" /></h2>
        <p v-if="current.sub" class="sub"><BpText :text="current.sub" /></p>
      </div>
    </div>
  </transition>
</template>

<style scoped>
/* A lighter stage than a perk's: the board stays dimly in sight behind it. */
.cast {
  --glow: 120 170 255;
  position: fixed;
  inset: 0;
  z-index: 37;
  display: grid;
  place-items: center;
  cursor: pointer;
  background: radial-gradient(circle at 50% 45%, rgb(8 10 16 / 0.55), rgb(4 5 7 / 0.72) 70%);
}
.cast.killer {
  --glow: 255 60 60;
}
.cast.power {
  --glow: 255 110 40;
}
.cast.passive {
  --glow: 190 120 255;
}
.panel {
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  min-width: min(26rem, 90vw);
  max-width: 34rem;
  padding: 1rem 1.6rem 1.1rem;
  border: 1px solid rgb(var(--glow) / 0.7);
  border-radius: 14px;
  background: linear-gradient(180deg, rgb(14 15 19 / 0.97), rgb(8 9 12 / 0.97));
  box-shadow:
    0 0 0 1px rgb(0 0 0 / 0.6),
    0 0 40px rgb(var(--glow) / 0.35),
    0 20px 50px rgb(0 0 0 / 0.8);
  text-align: center;
  animation: slam 0.42s cubic-bezier(0.2, 1.35, 0.4, 1) both;
}
.label {
  padding: 0.1rem 0.7rem;
  border-radius: 99px;
  background: rgb(var(--glow) / 0.2);
  border: 1px solid rgb(var(--glow) / 0.75);
  color: rgb(var(--glow));
  font-family: var(--font-display);
  font-size: 0.74rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0.2rem 0;
}
.face {
  width: 64px;
  height: 64px;
}
.targets {
  display: flex;
  gap: 0.3rem;
}
.targets .face {
  width: 52px;
  height: 52px;
}
.face.target {
  box-shadow: 0 0 0 3px var(--blood-bright);
  animation: hit 0.5s ease-out 0.35s both;
}
.arrow {
  font-size: 2rem;
  line-height: 1;
  color: rgb(var(--glow));
  animation: nudge 0.8s ease-in-out infinite;
}
.pic {
  display: block;
  filter: drop-shadow(0 0 12px rgb(var(--glow) / 0.6));
  animation: pop 0.45s cubic-bezier(0.2, 1.4, 0.4, 1) 0.12s both;
}
.pic.card {
  height: 120px;
  aspect-ratio: 0.72;
  object-fit: cover;
  border-radius: 8px;
}
.pic.token {
  width: 76px;
  height: 76px;
  object-fit: contain;
}
.pic.power {
  width: 88px;
  height: 88px;
  border-radius: 10px;
  border: 2px solid rgb(var(--glow) / 0.8);
  background-size: 413% auto;
  background-position: 3% 62%;
  background-repeat: no-repeat;
}
h2 {
  margin: 0;
  font-size: clamp(1.15rem, 2.6vw, 1.5rem);
  color: #fff;
  text-shadow: 0 0 18px rgb(var(--glow) / 0.7);
}
.sub {
  margin: 0;
  color: var(--text);
  font-size: 0.92rem;
}
@keyframes slam {
  from {
    transform: scale(0.7) translateY(20px);
    opacity: 0;
  }
}
@keyframes pop {
  from {
    transform: scale(0.3) rotate(-12deg);
    opacity: 0;
  }
}
@keyframes hit {
  0% {
    transform: none;
  }
  30% {
    transform: translateX(-6px) scale(1.08);
    filter: brightness(1.8) saturate(0.4);
  }
  60% {
    transform: translateX(5px);
  }
}
@keyframes nudge {
  50% {
    transform: translateX(4px);
  }
}
.cast-enter-active {
  transition: opacity 0.15s;
}
.cast-leave-active {
  transition: opacity 0.2s;
}
.cast-enter-from,
.cast-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .panel,
  .pic,
  .face.target,
  .arrow {
    animation: none;
  }
}
</style>
