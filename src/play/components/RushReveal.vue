<script setup lang="ts">
// The Blight's Blighted Corruption: a card is drawn at random from his hand. His hand shows face
// down in a row, a glow hops from card to card, slowing like a roulette, and stops on the one drawn;
// it turns face up with its name. It shares the perk cards' queue (fx.perks), so the board waits
// for it. A tap skips ahead.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { asset } from '../../i18n'
import { anim, reducedMotion } from '../../settings'
import { fxSound } from '../fx/audio'
import { fx } from '../fx/bus'
import { CARD_NAMES } from '../engine/engine'
import type { GameState } from '../engine/types'
import { KILLER_CARD_BACK, cardImage, powerName } from '../labels'

const props = defineProps<{ st: GameState }>()

/** The entry at the head of the queue, once the dice before it have been shown. */
const current = computed(() => {
  const head = fx.perks[0]
  const dice = fx.dice[0]
  return head?.rush && (!dice || head.id < dice.id) ? head : null
})
const rush = computed(() => current.value?.rush ?? null)
/** Where the drawn card sits in the row (the first of its kind: two of a kind look alike). */
const landing = computed(() => (rush.value ? Math.max(0, rush.value.hand.indexOf(rush.value.card)) : 0))

/** The card the glow is on, whether the drawn one is turning over, and whether its face shows yet. */
const at = ref(-1)
const shown = ref(false)
const faced = ref(false)

let timers: number[] = []
function clearTimers() {
  timers.forEach((t) => clearTimeout(t))
  timers = []
}

watch(
  () => current.value?.id,
  (id) => {
    clearTimers()
    shown.value = false
    faced.value = false
    at.value = -1
    const r = rush.value
    if (id === undefined || !r) return
    const n = r.hand.length
    if (reducedMotion.value || n < 2) {
      at.value = landing.value
      shown.value = faced.value = true
      fxSound.flip()
      timers.push(window.setTimeout(next, 2200))
      return
    }
    // two laps and a bit, each hop a little slower, ending on the card drawn
    const hops = 2 * n + landing.value + 1
    let t = 0
    for (let h = 0; h < hops; h++) {
      const i = h % n
      t += anim(55 + 260 * Math.pow(h / hops, 2.2))
      timers.push(
        window.setTimeout(() => {
          at.value = i
          fxSound.flip()
        }, t),
      )
    }
    // turned over flat (a squash, then the face): a 3D turn shows the back in some browsers
    timers.push(window.setTimeout(() => (shown.value = true), t + anim(300)))
    timers.push(window.setTimeout(() => (faced.value = true), t + anim(300) + 220))
    timers.push(window.setTimeout(next, t + anim(2600)))
  },
  { immediate: true },
)

function next() {
  clearTimers()
  if (current.value) fx.perks.shift()
}
onBeforeUnmount(clearTimers)
</script>

<template>
  <transition name="rush">
    <div v-if="current && rush" :key="current.id" class="rush" role="status" aria-live="polite" @click="next">
      <div class="panel">
        <span class="label">{{ powerName(props.st) }}</span>
        <p class="lead">สุ่มการ์ดเคลื่อนที่ 1 ใบจากมือ</p>
        <div class="row" :style="{ '--n': rush.hand.length }">
          <span v-for="(c, i) in rush.hand" :key="i" class="slot" :class="{ on: at === i, picked: shown && i === landing, out: shown && i !== landing }">
            <span class="card" :class="{ flipping: shown && i === landing }">
              <img v-if="faced && i === landing" :src="asset(cardImage(c))" :alt="CARD_NAMES[c]" />
              <img v-else :src="asset(KILLER_CARD_BACK)" alt="" />
            </span>
          </span>
        </div>
        <p class="result" :class="{ on: shown, stuck: rush.stuck }">
          <template v-if="shown">
            สุ่มได้ <b>{{ CARD_NAMES[rush.card] }}</b>{{ rush.stuck ? ' — ไม่มีเส้นทาง จบพลัง' : '' }}
          </template>
          <template v-else>&nbsp;</template>
        </p>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.rush {
  --glow: 255 70 40;
  position: fixed;
  inset: 0;
  z-index: 38;
  display: grid;
  place-items: center;
  cursor: pointer;
  background: radial-gradient(circle at 50% 45%, rgb(14 6 2 / 0.55), rgb(3 2 3 / 0.8) 70%);
}
.panel {
  display: grid;
  justify-items: center;
  gap: 0.7rem;
  max-width: min(56rem, 94vw);
  padding: 1rem 1.6rem 1.2rem;
  border: 1px solid rgb(var(--glow) / 0.75);
  border-radius: 14px;
  background: linear-gradient(180deg, rgb(10 11 14 / 0.97), rgb(34 12 4 / 0.97));
  box-shadow:
    0 0 0 1px rgb(0 0 0 / 0.6),
    0 0 50px rgb(var(--glow) / 0.35),
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
  font-size: 0.78rem;
  letter-spacing: 0.08em;
}
.lead {
  margin: 0;
  color: var(--muted);
}
/* the hand in a row, sized to fit up to eight cards */
.row {
  display: grid;
  grid-template-columns: repeat(var(--n), minmax(0, 92px));
  gap: 0.5rem;
  margin-top: 0.9rem;
}
.slot {
  aspect-ratio: 548 / 780;
  border-radius: 8px;
  transition:
    transform 0.12s ease,
    opacity 0.3s ease,
    box-shadow 0.12s ease;
}
.slot.on {
  transform: translateY(-10px) scale(1.06);
  box-shadow:
    0 0 0 2px rgb(255 200 120),
    0 0 26px rgb(var(--glow) / 0.85);
}
.slot.out {
  opacity: 0.25;
}
.slot.picked {
  transform: translateY(-14px) scale(1.18);
}
.card {
  display: block;
  width: 100%;
  height: 100%;
}
/* flat to the side by 220 ms (when the face swaps in), then open again */
.card.flipping {
  animation: turn 0.44s ease-in-out;
}
.card img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
}
.result {
  min-height: 1.6em;
  margin: 0.2rem 0 0;
  font-size: 1.25rem;
  opacity: 0;
  transform: translateY(6px);
  transition:
    opacity 0.3s,
    transform 0.3s;
}
.result.on {
  opacity: 1;
  transform: none;
}
.result b {
  color: #ffd56a;
  font-family: var(--font-display);
  letter-spacing: 0.04em;
}
.result.stuck b {
  color: #ff8a7a;
}
@keyframes turn {
  50% {
    transform: scaleX(0);
  }
}
@keyframes slam {
  from {
    transform: scale(0.85);
    opacity: 0;
  }
}
.rush-enter-active,
.rush-leave-active {
  transition: opacity 0.2s;
}
.rush-enter-from,
.rush-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .panel {
    animation: none;
  }
}
</style>
