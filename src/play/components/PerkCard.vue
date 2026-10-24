<script setup lang="ts">
// A perk as the side panels show it: its card picture, name, cost and text, the same everywhere
// (an offer, the start of a turn, the interact step, a roll). One that can be used now glows and
// is pressed to use ("ready"), pressed again to put back ("picked"); the others step back
// ("dim"); a perk only explained, with its uses as buttons under it, is "static". What a press
// then asks for (buttons, a card) goes in the slot, under the card. A click on its picture opens
// the card big (a click anywhere or Esc puts it back), wherever the card is.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { asset } from '../../i18n'
import { PERKS, type PerkId } from '../engine/perks'
import { perkImage, perkText } from '../labels'
import { PICKED_HINT, READY_HINT } from '../perkHints'
import BpText from '../../components/BpText.vue'
import PerkRichText from '../../components/PerkRichText.vue'

const props = defineProps<{
  perk: PerkId
  state: 'ready' | 'picked' | 'dim' | 'static'
  /** The name shown (default: the perk's), e.g. with whose perk it is. */
  title?: string
  /** The text shown (default: the perk's own). */
  text?: string
  /** What pressing it does, when not the usual. */
  hint?: string
}>()
const emit = defineEmits<{ pick: [] }>()

const image = computed(() => perkImage(props.perk))
const cost = computed(() => (PERKS[props.perk].cost ? `${PERKS[props.perk].cost} ▲` : 'ฟรี'))
const pressable = computed(() => props.state !== 'static')
const hint = computed(() => props.hint ?? (props.state === 'picked' ? PICKED_HINT : props.state === 'static' ? '' : READY_HINT))

const zoomed = ref(false)
// Esc closes the picture, not the decision behind it (caught before anything else hears the key).
function onZoomKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  e.stopImmediatePropagation()
  zoomed.value = false
}
watch(zoomed, (z) => (z ? window.addEventListener('keydown', onZoomKey, true) : window.removeEventListener('keydown', onZoomKey, true)))
onBeforeUnmount(() => window.removeEventListener('keydown', onZoomKey, true))
</script>

<template>
  <div class="perk-card" :class="state">
    <component
      :is="pressable ? 'button' : 'div'"
      :type="pressable ? 'button' : undefined"
      class="face"
      :aria-pressed="pressable ? state === 'picked' : undefined"
      @click="pressable && emit('pick')"
    >
      <img
        v-if="image"
        class="pic"
        :src="asset(image)"
        :alt="PERKS[perk].name"
        title="คลิกเพื่อขยาย"
        @click.stop="zoomed = true"
      />
      <span class="body">
        <span class="title">
          <slot name="title">{{ title ?? PERKS[perk].name }}<small v-if="!title && PERKS[perk].en !== PERKS[perk].name" class="en">{{ PERKS[perk].en }}</small></slot>
          <span class="cost"><BpText :text="cost" /></span>
        </span>
        <span class="text"><BpText v-if="text" :text="text" /><PerkRichText v-else :text="perkText(perk)" /></span>
        <span v-if="hint" class="hint">{{ hint }}</span>
      </span>
    </component>
    <div v-if="$slots.default" class="more" @click.stop>
      <slot />
    </div>
    <Teleport to="body">
      <div v-if="zoomed && image" class="perk-zoom" role="dialog" aria-modal="true" @click="zoomed = false">
        <img :src="asset(image)" alt="" />
        <p>คลิกที่ไหนก็ได้เพื่อย่อกลับ</p>
      </div>
    </Teleport>
    </div>
</template>

<style scoped>
/* the English name beside the Thai one, as on the English cards */
.en {
  margin-left: 0.4em;
  font-size: 0.72em;
  font-weight: 500;
  color: var(--muted);
  letter-spacing: 0.02em;
}
.perk-card {
  display: grid;
  gap: 0.4rem;
  transition: opacity 0.15s;
}
.face {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 0.6rem;
  align-items: start;
  width: 100%;
  padding: 0.5rem;
  border: 1px solid rgb(155 107 214 / 0.55);
  border-radius: 8px;
  background: linear-gradient(rgb(120 70 200 / 0.1), rgb(120 70 200 / 0.1)), #121018;
  color: inherit;
  font: inherit;
  font-weight: 400;
  letter-spacing: 0;
  text-align: left;
  text-transform: none;
}
button.face {
  cursor: pointer;
}
.pic {
  width: 64px;
  border-radius: 5px;
  box-shadow: 0 0 0 1px rgb(155 107 214 / 0.7);
  cursor: zoom-in;
}
.body {
  display: grid;
  gap: 0.2rem;
}
.title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  font-family: var(--font-display);
  font-size: 0.98rem;
  color: #e8dbff;
}
.cost {
  font-family: inherit;
  font-size: 0.78rem;
  padding: 0 0.35rem;
  border-radius: 4px;
  background: rgb(155 107 214 / 0.35);
  color: #fff;
}
.text {
  font-size: 0.8rem;
  line-height: 1.45;
  color: var(--text);
}
.hint {
  margin-top: 0.1rem;
  font-size: 0.82rem;
  color: #d8c2ff;
}
.more {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
  padding-left: 0.4rem;
}
/* usable now: it glows and pulses until pressed */
.ready .face {
  border-color: #c9a2ff;
  background: linear-gradient(rgb(120 70 200 / 0.2), rgb(120 70 200 / 0.2)), #121018;
  animation: perk-ready 1.8s ease-in-out infinite;
}
.ready .hint {
  font-weight: 700;
  color: #fff;
}
.ready .face:hover {
  border-color: #ffe9b0;
}
/* pressed: its targets are out (the board, or the buttons under it) */
.picked .face {
  border-color: #ffe9b0;
  background: linear-gradient(rgb(255 214 140 / 0.12), rgb(255 214 140 / 0.12)), #121018;
  box-shadow: 0 0 14px rgb(255 214 140 / 0.45);
}
.picked .hint {
  color: #ffe9b0;
}
.dim {
  opacity: 0.5;
}
@keyframes perk-ready {
  50% {
    box-shadow: 0 0 16px rgb(190 140 255 / 0.75);
    border-color: #ffe9b0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ready .face {
    animation: none;
  }
}
/* the picture opened big */
.perk-zoom {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 0.6rem;
  padding: 1.5rem;
  background: rgb(4 5 7 / 0.92);
  cursor: zoom-out;
}
.perk-zoom img {
  max-width: min(92vw, 520px);
  max-height: 84vh;
  object-fit: contain;
  border-radius: 12px;
  box-shadow:
    0 0 0 2px rgb(255 233 176 / 0.6),
    0 24px 60px rgb(0 0 0 / 0.85);
}
.perk-zoom p {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted);
}
</style>
