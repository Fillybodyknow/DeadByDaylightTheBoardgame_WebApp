<script setup lang="ts">
// Movement cards held in a fan floating at the foot of the screen: where they cover neither the
// map nor the panel's buttons nor the players (GameScreen measures the stretch: under the side
// panel in its own column, or under the map; settings: handPlace 'auto'), always under the map
// ('map'), or in the bottom-right corner over the panel's foot ('corner', as it was first). At rest the hand is sunk
// with only the names showing, so the map stays in sight; pointing at a card raises the hand and
// draws that card up to look at; clicking picks it — it stays drawn up, glowing, until the choice
// is confirmed in the panel (or clicked again to put it back).
//
// On a tablet (no pointer to hover with) a hand to pick from comes up by itself, so one tap picks;
// a tap anywhere else puts it down, and a tap on it raises it again. A hand only to look at rests
// sunk: a tap raises it.
//
// Each card is a button that never moves (its rotation in the fan aside); only the card face
// inside it slides up. So the pointer stays on the button while the card rises, and the card
// doesn't bounce up and down under it.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { asset } from '../../i18n'
import type { MoveCard } from '../engine/types'
import { CARD_NAMES } from '../engine/engine'
import { CARD_TH, cardImage, cardLabel } from '../labels'
import { handZone, openHands } from '../hands'
import { settings } from '../../settings'
import BpText from '../../components/BpText.vue'

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
/**
 * `passive`: only to look at (online, your own hand while nothing asks for a card) — the cards
 * can't be picked, and it doesn't count as a hand out.
 */
const props = defineProps<{ cards: HandCard[]; label: string; prompt?: string; passive?: boolean }>()
/** `pick`: the card, and its place in `cards` (The Blight's hand holds two of each). */
const emit = defineEmits<{ pick: [card: MoveCard, index: number]; hover: [card: MoveCard | null] }>()

/**
 * How the cards are laid (settings: handLayout): each one's margin on either side (negative: they
 * overlap), as a share of the card's width plus a few pixels, and whether they fan out.
 */
const LAYOUTS = {
  fan: { share: 0, px: -6, turn: true },
  row: { share: 0, px: 4, turn: false },
  // each card's left half shows, its name moved there
  stack: { share: -0.25, px: 0, turn: false },
} as const
const layout = computed(() => LAYOUTS[settings.handLayout] ?? LAYOUTS.fan)

/** The cards' width: up to 4 at full size; 5 (the killer's hand) smaller; 8 (The Blight's) smaller still. */
const cardW = computed(() => {
  const n = props.cards.length
  let w = n > 6 ? 84 : n > 4 ? 114 : 134
  if (handZone.value !== null) {
    // placed in a measured stretch: narrowed to it. Each card takes its width and both margins
    // (the last one its whole width), and the fan's ends need room for their tilt.
    const { share, px, turn } = layout.value
    const step = 1 + 2 * share
    const fits = (handZone.value - (turn ? 56 : 16) - 2 * px * n) / (step * n + (1 - step))
    w = Math.max(64, Math.min(w, Math.floor(fits)))
  }
  return w
})
/** Narrow cards show the English name only: the Thai one under it no longer fits. */
const narrow = computed(() => cardW.value < 96)

/** Each card's place in the hand: in a fan, a little turned and lower towards the ends. */
const fan = computed(() => {
  const mid = (props.cards.length - 1) / 2
  const { share, px, turn } = layout.value
  return props.cards.map((_, i) => {
    const off = turn ? i - mid : 0
    return {
      '--w': `${cardW.value}px`,
      '--gap': `${Math.round(cardW.value * share + px)}px`,
      '--rot': `${off * 3}deg`,
      '--arc': `${Math.abs(off) * Math.abs(off) * 2}px`,
      zIndex: String(i + 1),
    }
  })
})

/** The player's settings for the hand, as classes the CSS reads. */
const looks = computed(() => [`lay-${settings.handLayout}`, `hover-${settings.handHover}`, { 'pick-sink': settings.handPicked === 'sink' }])

// While a hand is out, the side panel stops above it (GameScreen). Counted on the body, as one
// hand can mount before the previous one unmounts.
function hands(delta: number) {
  if (props.passive) return
  openHands.value = Math.max(0, openHands.value + delta)
  const b = document.body
  const n = Math.max(0, Number(b.dataset.hands ?? 0) + delta)
  b.dataset.hands = String(n)
  b.classList.toggle('hand-open', n > 0)
}
onMounted(() => hands(1))
onBeforeUnmount(() => hands(-1))

// ---------- a tablet: tap to raise ----------

const touch = typeof matchMedia === 'function' && matchMedia('(hover: none)').matches
const raised = ref(false)
/** A hand to pick from, put down by a tap elsewhere (it comes up by itself otherwise). */
const lowered = ref(false)
/**
 * Up, on a tablet: a hand to pick from, unless a tap put it down (or the player turned that off:
 * settings handTouchRaise); a hand to look at, raised by a tap; any hand a perk is asking a card
 * of. On a desktop: a hand being asked for a card, which used to lie sunk with only the names
 * showing until the pointer found it — the game asked and nothing on screen came to meet the
 * player (a player's report). A click on the map still puts it down to see what is underneath,
 * and the pointer raises any hand by hovering (in CSS).
 */
const up = computed(() =>
  touch
    ? !!props.prompt || raised.value || (!props.passive && settings.handTouchRaise && !lowered.value)
    : !!props.prompt && !lowered.value,
)
// a new choice from the hand (other cards, or the same cards for someone else or something else): it comes up again
watch(
  () => [props.cards.map((c) => c.card).join(), props.label, props.prompt].join('|'),
  () => (lowered.value = false),
)

function onSlot(card: MoveCard, index: number) {
  // a tap on a hand that is down only brings it up, so a card isn't picked blind by that tap
  if (touch && !up.value) {
    raised.value = true
    lowered.value = false
    return
  }
  if (props.passive) return
  emit('pick', card, index)
}

/**
 * A tap on the map puts the hand down, to see what is under it. Not one on the side panel, its fold
 * tab or the bars: folding and opening the panel left the hand down for good (a player's report).
 */
function lowerOnOutside(e: MouseEvent) {
  const at = e.target as Element | null
  if (!up.value || at?.closest('.hand') || !at?.closest('.board')) return
  raised.value = false
  lowered.value = true
}
onMounted(() => document.addEventListener('click', lowerOnOutside, true))
onBeforeUnmount(() => {
  document.removeEventListener('click', lowerOnOutside, true)
  document.body.classList.remove('hand-raised')
})
// the side panel stops above a raised hand (GameScreen)
watch(up, (on) => document.body.classList.toggle('hand-raised', on))
</script>

<template>
  <Teleport to="body">
    <!-- The hand rests sunk, names showing, and rises while the pointer is on it — also when a
         perk asks for a card (it glows, and its prompt sits just above the names). -->
    <div class="hand card-hand" :class="[{ ask: !!prompt, passive, up }, looks]" role="group" :aria-label="label">
      <p v-if="prompt" class="prompt">⚡ <BpText :text="prompt" /></p>
      <div class="fan">
        <button
          v-for="(c, i) in cards"
          :key="`${c.card}-${i}`"
          type="button"
          class="slot"
          :class="{ picked: c.picked, taken: !!c.takenBy, narrow }"
          :style="fan[i]"
          :title="cardLabel(c.card)"
          :aria-pressed="c.picked"
          @mouseenter="emit('hover', c.card)"
          @mouseleave="emit('hover', null)"
          @focus="emit('hover', c.card)"
          @blur="emit('hover', null)"
          :aria-disabled="passive || undefined"
          @click="onSlot(c.card, i)"
        >
          <span class="face">
            <img :src="asset(cardImage(c.card))" :alt="cardLabel(c.card)" draggable="false" />
            <!-- the card's name in its colour, on the part of a resting card that shows -->
            <span class="tag" :class="c.card"><b>{{ CARD_NAMES[c.card] }}</b><small>{{ CARD_TH[c.card] }}</small></span>
            <span v-if="c.picked && c.badge" class="badge"><BpText :text="c.badge" /></span>
            <img v-if="c.takenBy" class="taken-by" :src="asset(c.takenBy)" alt="" />
            <span v-if="c.count !== undefined" class="count" :class="{ none: !c.count }">×{{ c.count }}</span>
          </span>
        </button>
      </div>
    </div>
    <!-- a soft shadow under the hand, so it reads over the map (after it: it follows its state) -->
    <div class="tray card-hand-tray" :class="{ ask: !!prompt, up }" aria-hidden="true" />
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
  width: min(760px, 100vw);
  height: 120px;
  transition: height 0.2s ease-out;
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
/* Placed by GameScreen (settings: handPlace 'auto' or 'map'): in the stretch it measured (under the side
   panel in its column, or under the map), its foot at the screen's or above what is below it.
   Below that foot nothing of it shows. Written whole as :global (Vue drops what follows a
   :global() in a scoped selector), on the hand's own class names; they outweigh the corner's. */
:global(body.hand-at-map .card-hand),
:global(body.hand-at-map .card-hand-tray) {
  left: var(--hand-left, 0px);
  right: var(--hand-right, 0px);
  bottom: var(--hand-bottom, 0px);
  width: auto;
  translate: none;
  clip-path: inset(-100vh -100vw 0 -100vw);
}
:global(body.hand-at-map .card-hand .fan) {
  padding-right: 0;
}
:global(body.hand-at-map .card-hand-tray) {
  background: radial-gradient(ellipse 50% 70% at 50% 100%, rgb(4 5 7 / 0.92), rgb(4 5 7 / 0.6) 55%, transparent 75%);
}
:global(body.hand-at-map .card-hand-tray.ask) {
  background: radial-gradient(ellipse 50% 70% at 50% 100%, rgb(60 20 90 / 0.95), rgb(20 8 34 / 0.7) 55%, transparent 75%);
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
/* sunk: the prompt comes down to sit just above the card names, and goes up with the hand */
.prompt {
  transform: translateY(186px);
  transition: transform 0.2s cubic-bezier(0.2, 1.2, 0.4, 1);
}
.hand:is(.open, .up, :has(.slot:focus-visible)) .prompt {
  transform: none;
}
@media (hover: hover) {
  .hand:has(.face:hover) .prompt {
    transform: none;
  }
}
.hand.ask .face {
  filter: drop-shadow(0 6px 10px rgb(0 0 0 / 0.7)) drop-shadow(0 0 8px rgb(170 110 255 / 0.65));
}
.fan {
  display: flex;
  justify-content: center;
  height: 252px;
}
/* The button: the card's place, a bit taller than the card so the risen card is still on it. */
/* your own hand, only to look at: no pointer cue to pick, a little dimmer */
.hand.passive .slot {
  cursor: default;
}
.hand.passive .face {
  filter: drop-shadow(0 6px 10px rgb(0 0 0 / 0.7)) saturate(0.8);
}
.slot {
  position: relative;
  flex: none;
  width: var(--w, 134px);
  height: 246px;
  margin: 0 var(--gap, -6px);
  padding: 0;
  border: none;
  background: none;
  /* only the card takes the pointer: the empty space above a sunk card leaves the map clickable */
  pointer-events: none;
  cursor: pointer;
  transform-origin: 50% 140%;
  transform: translateY(var(--arc)) rotate(var(--rot));
}
.slot:hover,
.slot:focus-visible {
  z-index: 50 !important;
}
/* The card itself: resting sunk, only its name showing over the screen's edge, so the map
   stays in sight; it slides up inside its button when the hand rises. Sunk by its height less the
   strip that shows (54 px), so a card narrowed to fit still shows its name. */
.face {
  --lift: calc(var(--w, 134px) / 0.72 - 54px);
  pointer-events: auto;
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  aspect-ratio: 0.72;
  border-radius: 9px;
  transform: translateY(var(--lift));
  /* rising and sinking go a little past their place and settle back */
  transition:
    transform 0.3s cubic-bezier(0.34, 1.5, 0.64, 1),
    filter 0.25s;
  filter: drop-shadow(0 6px 10px rgb(0 0 0 / 0.7));
}
/* An unseen reach below the card: drawn up, its foot leaves the screen's edge, and a pointer held
   there would fall off it, sink it back under the pointer, and so on — a card bouncing for good.
   This keeps the pointer on it down to the edge. */
.face::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  height: 48px;
}
.face img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 9px;
  pointer-events: none;
}
/* drawn up to look at (a touch screen's sticky :hover would raise a card on the tap that picks it) */
.slot:focus-visible .face {
  transform: translateY(-14px) scale(1.12);
  filter: drop-shadow(0 14px 18px rgb(0 0 0 / 0.8)) brightness(1.08);
}
@media (hover: hover) {
  .slot:hover .face {
    transform: translateY(-14px) scale(1.12);
    filter: drop-shadow(0 14px 18px rgb(0 0 0 / 0.8)) brightness(1.08);
  }
}
/* The pointer on any card (or a perk asking for one): the whole hand rises to full size. */
.hand:is(.open, .up, :has(.slot:focus-visible)) .face {
  --lift: 14px;
}
.hand:is(.open, .up, :has(.slot:focus-visible)) + .tray,
.tray.up {
  height: 270px;
}
@media (hover: hover) {
  .hand:has(.face:hover) .face {
    --lift: 14px;
  }
  .hand:has(.face:hover) + .tray {
    height: 270px;
  }
}
/* The pointer on a card (settings: handHover): the hand rises halfway (between sunk and full, so
   a narrow card still rises), or stays sunk while only that card draws up. */
@media (hover: hover) {
  .hand.hover-half:has(.face:hover) .face {
    --lift: calc((var(--w, 134px) / 0.72 - 40px) / 2);
  }
  .hand.hover-one:has(.face:hover) .face {
    --lift: calc(var(--w, 134px) / 0.72 - 54px);
  }
  .hand.hover-half:has(.face:hover) + .tray {
    height: 190px;
  }
}
/* picked, not confirmed: stays drawn up, glowing (settings handPicked 'sink': glowing only, in
   the hand with the others) */
.hand .slot.picked .face {
  filter: drop-shadow(0 0 14px rgb(255 214 140 / 0.85)) drop-shadow(0 8px 12px rgb(0 0 0 / 0.7));
}
.hand:not(.pick-sink) .slot.picked .face {
  --lift: -6px;
}
/* overlapping cards: a picked one comes before its neighbours */
.hand.lay-stack .slot.picked {
  z-index: 40 !important;
}
/* The gold edge of a picked card: on every card, shown when picked, so putting a card back fades
   it out. Picking pops the card (pressed in, then a little past its size: `scale`, apart from the
   transform that raises it) and flashes its edge. */
.face::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 3px solid #ffe9b0;
  border-radius: 9px;
  opacity: 0;
  transition: opacity 0.25s;
}
.slot.picked .face {
  animation: pick-pop 0.38s ease-out;
}
.slot.picked .face::after {
  opacity: 1;
  animation: pick-flash 0.6s ease-out;
}
@keyframes pick-pop {
  /* not pressed in far: a pointer near the card's edge stays on it */
  30% {
    scale: 0.94;
  }
  65% {
    scale: 1.06;
  }
}
@keyframes pick-flash {
  0% {
    box-shadow:
      0 0 0 0 rgb(255 233 176 / 0.95),
      inset 0 0 28px rgb(255 214 140 / 0.9);
  }
  100% {
    box-shadow:
      0 0 0 16px rgb(255 233 176 / 0),
      inset 0 0 0 rgb(255 214 140 / 0);
  }
}
.slot.taken .face {
  filter: grayscale(0.7) brightness(0.6) drop-shadow(0 6px 10px rgb(0 0 0 / 0.7));
}
.slot.taken:hover .face {
  filter: grayscale(0.2) brightness(0.9) drop-shadow(0 14px 18px rgb(0 0 0 / 0.8));
}
/* the name tag across the top of the card, in the colour of its paths */
.tag {
  position: absolute;
  left: 6%;
  right: 6%;
  top: 7%;
  display: grid;
  justify-items: center;
  padding: 0.12rem 0.2rem 0.15rem;
  border-radius: 6px;
  border: 1px solid rgb(255 255 255 / 0.35);
  background: var(--tag, #444);
  color: #fff;
  line-height: 1.05;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.8);
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.6);
  pointer-events: none;
}
.tag b {
  font-family: var(--font-display);
  font-size: 1rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.tag small {
  font-size: 0.78rem;
  opacity: 0.92;
}
.tag.sneak {
  --tag: #1f7fc4;
}
.tag.sprint {
  --tag: #2e9a46;
}
.tag.crouch {
  --tag: #c4262c;
}
.tag.vault {
  --tag: #b8901a;
}
.tag.wait {
  --tag: #55585f;
}
/* The Blight's small cards, and cards narrowed to fit: the English name only */
.slot[style*="--w: 84px"] .tag small,
.slot.narrow .tag small {
  display: none;
}
/* a narrow card's name shrinks with it, so CROUCH stays on its own card */
.slot.narrow .tag b {
  font-size: max(0.62rem, calc(var(--w, 134px) * 0.15));
  letter-spacing: 0.01em;
}
/* Overlapping cards show only their left half: the name, the badge and whose card it is go there. */
.hand.lay-stack .tag {
  left: 4%;
  right: auto;
  max-width: 44%;
  justify-items: start;
  padding-inline: 0.2rem;
}
.hand.lay-stack .tag b {
  font-size: min(0.85rem, calc(var(--w, 134px) * 0.105));
  letter-spacing: 0;
}
.hand.lay-stack .tag small {
  display: none;
}
.hand.lay-stack .badge {
  left: 25%;
}
.hand.lay-stack .face .taken-by {
  right: auto;
  left: calc(50% - 34px);
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
  animation: badge-in 0.3s 0.12s ease-out backwards;
}
@keyframes badge-in {
  from {
    opacity: 0;
    translate: 0 6px;
    scale: 0.7;
  }
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
  .face,
  .face::after {
    transition: none;
  }
  .tray.ask,
  .slot.picked .face,
  .slot.picked .face::after,
  .badge {
    animation: none;
  }
}
</style>
