<script setup lang="ts">
// The box shown when pointing at a perk or an offering, as the PC game's: a little see-through, a
// head in the thing's colour (a character's own perk purple, a board's green, a card's gold, an
// offering's purple) holding its name over a thin line, and under the line whose it is and what it
// costs; the text below. Fixed on the page at (x, y); the pointer passes through it.
defineProps<{
  x: number
  y: number
  title: string
  /** The English name, small beside the Thai one. */
  en?: string
  tone: 'own' | 'shared' | 'card' | 'offering'
}>()
</script>

<template>
  <Teleport to="body">
    <div class="pc-tip" :class="tone" :style="{ left: `${x}px`, top: `${y}px` }" role="tooltip">
      <div class="tip-head">
        <div class="tip-title">{{ title }}<small v-if="en && en !== title" class="en">{{ en }}</small></div>
        <div class="tip-line" aria-hidden="true" />
        <div class="tip-band">
          <span><slot name="left" /></span>
          <span><slot name="right" /></span>
        </div>
      </div>
      <slot />
    </div>
  </Teleport>
</template>

<style scoped>
.pc-tip {
  position: fixed;
  z-index: 80;
  width: 440px;
  max-width: calc(100vw - 16px);
  pointer-events: none;
  background: rgb(6 5 7 / 0.86);
  box-shadow: 0 18px 44px rgb(0 0 0 / 0.75);
}
/* the head: the thing's colour, darker to the right */
.tip-head {
  --c0: 56 28 68;
  --c1: 68 34 84;
  --c2: 46 22 56;
  --hi: 126 70 150;
  background:
    radial-gradient(ellipse 60% 120% at 72% 30%, rgb(var(--hi) / 0.35), transparent 70%),
    linear-gradient(90deg, rgb(var(--c0) / 0.82), rgb(var(--c1) / 0.8) 55%, rgb(var(--c2) / 0.8));
  backdrop-filter: blur(1px);
}
.shared .tip-head {
  --c0: 28 58 34;
  --c1: 34 72 42;
  --c2: 22 48 28;
  --hi: 74 138 84;
}
.card .tip-head {
  --c0: 92 68 18;
  --c1: 110 82 22;
  --c2: 70 50 12;
  --hi: 196 150 52;
}
.tip-title {
  padding: 0.55rem 1rem 0.3rem;
  font-size: 1.32rem;
  font-weight: 300;
  color: #f4f0f4;
}
.en {
  margin-left: 0.4em;
  font-size: 0.72em;
  font-weight: 500;
  color: rgb(240 236 242 / 0.6);
  letter-spacing: 0.02em;
}
.tip-line {
  height: 1px;
  margin: 0 0.6rem 0 0.85rem;
  background: rgb(235 230 240 / 0.55);
}
.tip-band {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.25rem 1rem 0.45rem;
  font-size: 0.9rem;
  color: rgb(240 236 242 / 0.8);
}
/* the text under the head, from whoever uses the box */
:slotted(.tip-text) {
  margin: 0;
  padding: 0.75rem 1rem 0.4rem;
  font-size: 1.08rem;
  line-height: 1.6;
  color: #eee;
}
:slotted(.tip-when),
:slotted(.tip-flavor) {
  margin: 0;
  padding: 0 1rem 0.75rem;
  font-size: 0.9rem;
  color: var(--muted);
}
:slotted(.tip-flavor) {
  color: #c7ab78;
}
:slotted(.tip-taken),
:slotted(.tip-laid) {
  margin: 0;
  padding: 0.4rem 1rem 0.65rem;
  font-size: 0.92rem;
}
:slotted(.tip-taken) {
  color: var(--blood-bright);
}
:slotted(.tip-laid) {
  color: #ffe7a6;
}
</style>
