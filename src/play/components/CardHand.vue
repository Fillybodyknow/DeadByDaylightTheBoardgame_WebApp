<script setup lang="ts">
// Movement cards held in a fan floating in the bottom-right corner. Pointing at a card draws it
// up to look at; clicking picks it — it stays drawn up, glowing, until the choice
// is confirmed in the panel (or clicked again to put it back).
//
// Each card is a button that never moves (its rotation in the fan aside); only the card face
// inside it slides up. So the pointer stays on the button while the card rises, and the card
// doesn't bounce up and down under it.
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { asset } from '../../i18n'
import type { MoveCard } from '../engine/types'
import { cardImage, cardLabel } from '../labels'

export interface HandCard {
  card: MoveCard
  /** Picked by whoever this hand is being played for. */
  picked: boolean
  /** A word on a picked card ("ซ้าย", "ขวา"). */
  badge?: string
  /** Picked by someone else sharing the hand: their portrait. */
  takenBy?: string
  /** Copies of this card still to pick, when the hand holds several (The Blight's). */
  count?: number
}

/**
 * `label`: whose hand, for screen readers (the side panel shows it on screen).
 * `prompt`: a perk, power or passive is waiting for a card from here — the hand lights up and
 * says which one, so the choice isn't missed in the corner of the screen.
 */
const props = defineProps<{ cards: HandCard[]; label: string; prompt?: string }>()
/** `pick`: the card, and its place in `cards` (The Blight's hand holds two of each). */
const emit = defineEmits<{ pick: [card: MoveCard, index: number]; hover: [card: MoveCard | null] }>()

/** Each card's place in the fan: a little turned and lower towards the ends. */
const fan = computed(() => {
  const mid = (props.cards.length - 1) / 2
  return props.cards.map((_, i) => {
    const off = i - mid
    // up to 4 cards at full size; 5 (the killer's hand) smaller; 8 (The Blight's) smaller still
    const w = props.cards.length > 6 ? 74 : props.cards.length > 4 ? 98 : 112
    return { '--w': `${w}px`, '--rot': `${off * 5}deg`, '--arc': `${Math.abs(off) * Math.abs(off) * 3}px`, zIndex: String(i + 1) }
  })
})

// While a hand is out, the side panel stops above it (GameScreen). Counted on the body, as one
// hand can mount before the previous one unmounts.
function hands(delta: number) {
  const b = document.body
  const n = Math.max(0, Number(b.dataset.hands ?? 0) + delta)
  b.dataset.hands = String(n)
  b.classList.toggle('hand-open', n > 0)
}
onMounted(() => hands(1))
onBeforeUnmount(() => hands(-1))
</script>

<template>
  <Teleport to="body">
    <!-- a soft shadow under the hand, so it reads over the map -->
    <div class="tray" :class="{ ask: !!prompt }" aria-hidden="true" />
    <div class="hand" :class="{ ask: !!prompt }" role="group" :aria-label="label">
      <p v-if="prompt" class="prompt">⚡ {{ prompt }}</p>
      <div class="fan">
        <button
          v-for="(c, i) in cards"
          :key="`${c.card}-${i}`"
          type="button"
          class="slot"
          :class="{ picked: c.picked, taken: !!c.takenBy }"
          :style="fan[i]"
          :title="cardLabel(c.card)"
          :aria-pressed="c.picked"
          @mouseenter="emit('hover', c.card)"
          @mouseleave="emit('hover', null)"
          @focus="emit('hover', c.card)"
          @blur="emit('hover', null)"
          @click="emit('pick', c.card, i)"
        >
          <span class="face">
            <img :src="asset(cardImage(c.card))" :alt="cardLabel(c.card)" draggable="false" />
            <span v-if="c.picked && c.badge" class="badge">{{ c.badge }}</span>
            <img v-if="c.takenBy" class="taken-by" :src="asset(c.takenBy)" alt="" />
            <span v-if="c.count !== undefined" class="count" :class="{ none: !c.count }">×{{ c.count }}</span>
          </span>
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tray,
.hand {
  position: fixed;
  bottom: 0;
  left: 50%;
  translate: -50% 0;
  pointer-events: none;
}
.tray {
  z-index: 14;
  width: min(720px, 100vw);
  height: 230px;
  background: radial-gradient(ellipse 50% 70% at 50% 100%, rgb(4 5 7 / 0.92), rgb(4 5 7 / 0.6) 55%, transparent 75%);
}
.hand {
  z-index: 15;
  display: grid;
  justify-items: center;
}
/* the bottom-right corner, floating over the foot of the side panel and the map */
@media (min-width: 981px) {
  .tray,
  .hand {
    left: auto;
    right: 0.5rem;
    translate: none;
  }
  /* room for the outer cards' tilt */
  .fan {
    padding-right: 2rem;
  }
  .tray {
    right: 0;
    background: radial-gradient(ellipse 60% 70% at 70% 100%, rgb(4 5 7 / 0.92), rgb(4 5 7 / 0.6) 55%, transparent 75%);
  }
}
/* A perk, power or passive is asking for a card: the hand glows and names what wants it. */
.tray.ask {
  background: radial-gradient(ellipse 50% 70% at 50% 100%, rgb(60 20 90 / 0.95), rgb(20 8 34 / 0.7) 55%, transparent 75%);
  animation: ask-glow 1.8s ease-in-out infinite;
}
@media (min-width: 981px) {
  .tray.ask {
    background: radial-gradient(ellipse 60% 70% at 70% 100%, rgb(60 20 90 / 0.95), rgb(20 8 34 / 0.7) 55%, transparent 75%);
  }
}
@keyframes ask-glow {
  50% {
    filter: brightness(1.45);
  }
}
.prompt {
  margin: 0 0 0.3rem;
  padding: 0.2rem 0.7rem;
  border: 1px solid #8a5cff;
  border-radius: 99px;
  background: rgb(18 10 30 / 0.92);
  color: #e0d0ff;
  font-family: var(--font-display);
  font-size: 0.8rem;
  letter-spacing: 0.03em;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 0 14px rgb(138 92 255 / 0.55);
}
.hand.ask .face {
  filter: drop-shadow(0 6px 10px rgb(0 0 0 / 0.7)) drop-shadow(0 0 8px rgb(170 110 255 / 0.65));
}
.fan {
  display: flex;
  justify-content: center;
  height: 216px;
}
/* The button: the card's place, a bit taller than the card so the risen card is still on it. */
.slot {
  position: relative;
  flex: none;
  width: var(--w, 112px);
  height: 210px;
  margin: 0 -6px;
  padding: 0;
  border: none;
  background: none;
  pointer-events: auto;
  cursor: pointer;
  transform-origin: 50% 140%;
  transform: translateY(var(--arc)) rotate(var(--rot));
}
.slot:hover,
.slot:focus-visible {
  z-index: 50 !important;
}
/* The card itself: resting low, sliding up inside its button. */
.face {
  --lift: 58px;
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  aspect-ratio: 0.72;
  border-radius: 9px;
  transform: translateY(var(--lift));
  transition:
    transform 0.2s cubic-bezier(0.2, 1.2, 0.4, 1),
    filter 0.2s;
  filter: drop-shadow(0 6px 10px rgb(0 0 0 / 0.7));
}
.face img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 9px;
  pointer-events: none;
}
/* drawn up to look at */
.slot:hover .face,
.slot:focus-visible .face {
  transform: translateY(-14px) scale(1.12);
  filter: drop-shadow(0 14px 18px rgb(0 0 0 / 0.8)) brightness(1.08);
}
/* picked, not confirmed: stays drawn up */
.slot.picked .face {
  --lift: -6px;
  filter: drop-shadow(0 0 14px rgb(255 214 140 / 0.85)) drop-shadow(0 8px 12px rgb(0 0 0 / 0.7));
}
.slot.picked .face::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 3px solid #ffe9b0;
  border-radius: 9px;
}
.slot.taken .face {
  filter: grayscale(0.7) brightness(0.6) drop-shadow(0 6px 10px rgb(0 0 0 / 0.7));
}
.slot.taken:hover .face {
  filter: grayscale(0.2) brightness(0.9) drop-shadow(0 14px 18px rgb(0 0 0 / 0.8));
}
.badge {
  position: absolute;
  top: -0.7rem;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.05rem 0.5rem;
  border-radius: 99px;
  background: #ffe9b0;
  color: #1a1206;
  font-family: var(--font-display);
  font-size: 0.72rem;
  white-space: nowrap;
}
.face .taken-by {
  position: absolute;
  top: -0.6rem;
  right: -0.5rem;
  width: 30px;
  height: 30px;
  object-fit: cover;
  border-radius: 50%;
  border: 2px solid var(--line-strong);
  background: #111;
}
/* copies left, on the top-left corner (the part of a resting card that shows) */
.count {
  position: absolute;
  left: -0.45rem;
  top: -0.45rem;
  min-width: 1.7rem;
  padding: 0.05rem 0.35rem;
  border-radius: 99px;
  border: 2px solid #f2efe6;
  background: #8a1218;
  color: #fff;
  font-weight: 800;
  font-size: 0.85rem;
  text-align: center;
}
.count.none {
  background: #333;
  color: var(--muted);
}
@media (prefers-reduced-motion: reduce) {
  .face {
    transition: none;
  }
  .tray.ask {
    animation: none;
  }
}
</style>
