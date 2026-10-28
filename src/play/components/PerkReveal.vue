<script setup lang="ts">
// A perk or an item being used: its card flips into the middle of the screen with light rays
// behind it — purple for a survivor's perk, red for the killer's, gold for an item. One at a
// time; a tap skips ahead.
import { computed, onBeforeUnmount, watch } from 'vue'
import { asset } from '../../i18n'
import { PERKS } from '../engine/perks'
import type { GameState } from '../engine/types'
import { fxSound } from '../fx/audio'
import { fx } from '../fx/bus'
import { ITEM_NAMES } from '../engine/engine'
import { itemImage, killerMini, ownerLabel, perkImage, perkText, survivorMini } from '../labels'
import Mini from './Mini.vue'
import BpText from '../../components/BpText.vue'
import PerkRichText from '../../components/PerkRichText.vue'

const props = defineProps<{ st: GameState }>()

// In the order they happened, the same way round as DiceModal: a perk that answers a roll waits
// for that roll's dice to be shown first.
const current = computed(() => {
  const perk = fx.perks[0]
  const dice = fx.dice[0]
  // a player's action in the same queue is ActionReveal's, the Sacrifice track SacrificeReveal's,
  // Blighted Corruption's draw RushReveal's
  return perk && !perk.action && !perk.sacrifice && !perk.rush && (!dice || perk.id < dice.id) ? perk : null
})
const killer = computed(() => current.value?.owner === 'killer')
const isItem = computed(() => !!current.value?.item)

/** Image, name, label and price of what is shown. */
const card = computed(() => {
  const c = current.value
  if (!c) return null
  if (c.item) return { image: itemImage(c.item), name: ITEM_NAMES[c.item] ?? c.item, label: 'Item', price: 'ทิ้งหลังใช้', text: '' }
  const p = PERKS[c.perk!]
  return { image: perkImage(c.perk!), name: p.name, label: killer.value ? 'Killer perk' : 'Survivor perk', price: p.cost ? `−${p.cost} ▲` : 'ฟรี', text: perkText(c.perk!) }
})

import { anim, reducedMotion } from '../../settings'
const showMs = () => anim(reducedMotion.value ? 1600 : 2100)

let timer: number | undefined
watch(
  () => current.value?.id,
  (id) => {
    clearTimeout(timer)
    if (id === undefined) return
    if (isItem.value) fxSound.item()
    else fxSound.perk(killer.value)
    timer = window.setTimeout(next, showMs())
  },
  { immediate: true },
)

function next() {
  clearTimeout(timer)
  fx.perks.shift()
}

onBeforeUnmount(() => clearTimeout(timer))

const face = computed(() => {
  const c = current.value
  if (!c) return ''
  return c.owner === 'killer' ? killerMini(props.st) : survivorMini(props.st, c.owner)
})
</script>

<template>
  <transition name="reveal">
    <div v-if="current && card" :key="current.id" class="perk-reveal" :class="{ killer, item: isItem }" role="status" aria-live="polite" @click="next">
      <div class="rays" aria-hidden="true" />
      <div class="stage">
        <div class="who">
          <Mini class="face" :class="killer ? 'aura-killer' : 'aura-survivor'" :src="asset(face)" />
          <div>
            <span class="label">{{ card.label }}</span>
            <strong>{{ ownerLabel(st, current.owner) }}</strong>
          </div>
        </div>

        <div class="card-wrap">
          <img v-if="card.image" class="card" :class="{ 'item-card': isItem }" :src="asset(card.image)" :alt="card.name" />
          <div v-else class="card text-card">
            <strong>{{ card.name }}</strong>
            <p><PerkRichText :text="card.text" /></p>
          </div>
          <span class="shine" aria-hidden="true" />
        </div>

        <div class="caption">
          <h2>{{ card.name }}</h2>
          <span class="cost"><BpText :text="card.price" /></span>
          <p v-if="current.detail" class="detail"><BpText :text="current.detail" /></p>
        </div>
        <p class="hint">แตะเพื่อไปต่อ</p>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.perk-reveal {
  --glow: 170 110 255;
  --deep: 40 14 80;
  position: fixed;
  inset: 0;
  z-index: 37;
  display: grid;
  place-items: center;
  overflow: hidden;
  cursor: pointer;
  background: radial-gradient(circle at 50% 45%, rgb(var(--deep) / 0.82), rgb(4 5 7 / 0.9) 65%);
}
.perk-reveal.item {
  --glow: 245 197 66;
  --deep: 60 44 8;
}
.perk-reveal.killer {
  --glow: 255 50 50;
  --deep: 80 6 12;
}

/* light rays turning slowly behind the card */
.rays {
  position: absolute;
  width: 160vmax;
  height: 160vmax;
  background: repeating-conic-gradient(from 0deg, rgb(var(--glow) / 0.16) 0deg 6deg, transparent 6deg 18deg);
  mask-image: radial-gradient(circle, #000 0, transparent 55%);
  animation: spin 14s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.stage {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 0.8rem;
  padding: 1rem;
}
.who {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  animation: drop 0.4s ease-out 0.15s backwards;
}
.face {
  width: 52px;
  height: 52px;
}
.label {
  display: block;
  font-family: var(--font-display);
  font-size: 0.75rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgb(var(--glow));
}
.who strong {
  font-family: var(--font-display);
  font-size: 1.15rem;
}

.card-wrap {
  position: relative;
  perspective: 900px;
}
.card {
  display: block;
  /* big enough to read the card's own text (its picture is 780 px high) */
  height: min(68vh, 640px);
  aspect-ratio: 548 / 780;
  border-radius: 12px;
  box-shadow:
    0 0 0 2px rgb(var(--glow) / 0.8),
    0 0 50px 10px rgb(var(--glow) / 0.45),
    0 24px 60px rgb(0 0 0 / 0.8);
  animation:
    flip-in 0.75s cubic-bezier(0.2, 1.25, 0.35, 1) both,
    glow 1.6s ease-in-out 0.75s infinite;
}
/* item cards are a touch wider than perk cards: keep the height, let the width follow */
.card.item-card {
  aspect-ratio: auto;
}
.text-card {
  display: grid;
  align-content: center;
  gap: 0.8rem;
  padding: 1.5rem;
  font-size: 1.15rem;
  background: #111317;
  text-align: center;
}
@keyframes flip-in {
  0% {
    transform: rotateY(-180deg) scale(0.3) translateY(40px);
    opacity: 0;
    filter: brightness(3);
  }
  60% {
    transform: rotateY(12deg) scale(1.06);
    opacity: 1;
    filter: brightness(1.4);
  }
  100% {
    transform: none;
    filter: none;
  }
}
@keyframes glow {
  50% {
    box-shadow:
      0 0 0 3px rgb(var(--glow) / 1),
      0 0 80px 18px rgb(var(--glow) / 0.6),
      0 24px 60px rgb(0 0 0 / 0.8);
  }
}
/* a glint sweeping across the card once it lands */
.shine {
  position: absolute;
  inset: 0;
  border-radius: 12px;
  pointer-events: none;
  background: linear-gradient(105deg, transparent 35%, rgb(255 255 255 / 0.45) 48%, transparent 60%);
  background-size: 250% 100%;
  background-position: 120% 0;
  mix-blend-mode: screen;
  animation: shine 0.9s ease-out 0.7s forwards;
}
@keyframes shine {
  to {
    background-position: -40% 0;
  }
}

.caption {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: baseline;
  gap: 0.3rem 0.7rem;
  max-width: 34rem;
  text-align: center;
  animation: rise 0.4s ease-out 0.45s backwards;
}
.caption h2 {
  margin: 0;
  font-size: clamp(1.6rem, 4vw, 2.3rem);
  color: #fff;
  text-shadow: 0 0 24px rgb(var(--glow) / 0.8);
}
.cost {
  padding: 0.05rem 0.5rem;
  border-radius: 4px;
  background: rgb(var(--glow) / 0.25);
  border: 1px solid rgb(var(--glow) / 0.7);
  font-weight: 800;
}
.detail {
  width: 100%;
  margin: 0;
  color: var(--text);
}
.hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--muted);
}
@keyframes drop {
  from {
    transform: translateY(-14px);
    opacity: 0;
  }
}
@keyframes rise {
  from {
    transform: translateY(14px);
    opacity: 0;
  }
}

.reveal-enter-active {
  transition: opacity 0.2s;
}
.reveal-leave-active {
  transition:
    opacity 0.3s,
    transform 0.3s;
}
.reveal-enter-from {
  opacity: 0;
}
.reveal-leave-to {
  opacity: 0;
  transform: scale(1.06);
}

@media (prefers-reduced-motion: reduce) {
  .rays,
  .card,
  .shine,
  .who,
  .caption {
    animation: none;
  }
}
</style>
