<script setup lang="ts">
// Both sides' goals in one corner, as in the PC game's HUD: the killer's sacrifices (the hook,
// counting up to 8) and the generators the survivors still need (counting down to 0, then the
// exit gate). A ring round each icon fills with the track.
import { computed, ref, watch } from 'vue'
import { asset } from '../../i18n'
import { GENERATORS_TO_POWER, PROGRESS_MAX, SACRIFICE_TO_WIN, gatesPowered, generatorsDone } from '../engine/engine'
import type { GameState } from '../engine/types'
import { PROP_IMAGE } from '../labels'

const props = defineProps<{ st: GameState }>()

const sacrifice = computed(() => props.st.sacrifice)
const gensLeft = computed(() => Math.max(0, GENERATORS_TO_POWER - generatorsDone(props.st)))
const powered = computed(() => gatesPowered(props.st))
/** The exit gate furthest along: its progress fills the ring once the gates have power. */
const gate = computed(() => {
  const gates = props.st.props.filter((p) => p.kind === 'exitGate')
  return { open: gates.some((g) => g.done), progress: Math.max(0, ...gates.map((g) => g.progress)) }
})

const sacFrac = computed(() => Math.min(1, sacrifice.value / SACRIFICE_TO_WIN))
const survFrac = computed(() => (powered.value ? (gate.value.open ? 1 : gate.value.progress / PROGRESS_MAX) : generatorsDone(props.st) / GENERATORS_TO_POWER))

// A count that changes pulses once, so the table sees who just scored.
const sacBump = ref(0)
const survBump = ref(0)
watch(sacrifice, (n, o) => n > o && sacBump.value++)
watch([gensLeft, () => gate.value.progress, () => gate.value.open], () => survBump.value++)

/** The ring's length (r = 21 in a 48 box). */
const RING = 2 * Math.PI * 21
</script>

<template>
  <div class="hud">
    <div class="goal killer" :title="`Sacrifice ${sacrifice}/${SACRIFICE_TO_WIN} — ฆาตกรชนะเมื่อครบ ${SACRIFICE_TO_WIN}`">
      <span :key="sacBump" class="icon" :class="{ bump: sacBump }">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <circle class="track" cx="24" cy="24" r="21" />
          <circle class="fill" cx="24" cy="24" r="21" :stroke-dasharray="`${RING * sacFrac} ${RING}`" />
        </svg>
        <img :src="asset(PROP_IMAGE.hook)" alt="" />
      </span>
      <span class="count"><b>{{ sacrifice }}</b><small>/{{ SACRIFICE_TO_WIN }}</small></span>
    </div>
    <div
      class="goal survivors"
      :class="{ powered, open: gate.open }"
      :title="
        !powered
          ? `ต้องซ่อม Generator อีก ${gensLeft} เครื่อง ประตูจึงจะมีไฟ`
          : gate.open
            ? 'Exit Gate เปิดแล้ว — หนีออกไปได้'
            : `Exit Gate มีไฟแล้ว — เปิดประตู ${gate.progress}/${PROGRESS_MAX}`
      "
    >
      <span class="count"><b>{{ powered ? (gate.open ? '✓' : `${gate.progress}/${PROGRESS_MAX}`) : gensLeft }}</b></span>
      <span :key="survBump" class="icon" :class="{ bump: survBump }">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <circle class="track" cx="24" cy="24" r="21" />
          <circle class="fill" cx="24" cy="24" r="21" :stroke-dasharray="`${RING * survFrac} ${RING}`" />
        </svg>
        <img :src="asset(powered ? PROP_IMAGE.exitGate : PROP_IMAGE.generator)" alt="" />
      </span>
    </div>
  </div>
</template>

<style scoped>
/* hook 3/8 over generator 4 — a plate like the PC game's, dark and edged in red */
.hud {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.3rem;
  padding: 0.35rem 0.3rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: linear-gradient(180deg, rgb(10 11 14 / 0.94), rgb(30 6 9 / 0.94));
  box-shadow: 0 6px 18px rgb(0 0 0 / 0.55);
}
.goal {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  cursor: help;
}
/* the icon first on both rows (the count comes first in the markup, as the PC game reads) */
.survivors .count {
  order: 1;
}
.icon {
  position: relative;
  flex: none;
  width: 40px;
  height: 40px;
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
.track {
  fill: rgb(0 0 0 / 0.55);
  stroke: rgb(255 255 255 / 0.12);
  stroke-width: 3;
}
.fill {
  fill: none;
  stroke-width: 3.5;
  stroke-linecap: round;
  transition: stroke-dasharray 0.6s ease-out;
}
.killer .fill {
  stroke: var(--blood-bright);
  filter: drop-shadow(0 0 3px rgb(255 40 40 / 0.8));
}
.survivors .fill {
  stroke: #f5c542;
  filter: drop-shadow(0 0 3px rgb(245 197 66 / 0.7));
}
.survivors.open .fill {
  stroke: var(--ok);
}
/* the gates have power: the icon glows, as the PC game lights the gate icon */
.survivors.powered .icon img {
  filter: drop-shadow(0 0 6px rgb(245 197 66 / 0.9));
}
.count {
  display: flex;
  align-items: baseline;
  font-family: var(--font-display);
  line-height: 1;
  white-space: nowrap;
}
.count b {
  font-size: 1.5rem;
  font-weight: 700;
  color: #f2efe6;
  text-shadow: 0 0 6px rgb(0 0 0 / 0.9);
}
.count small {
  font-size: 0.68rem;
  color: var(--muted);
}
.survivors.powered .count b {
  font-size: 0.95rem;
  color: #ffe08a;
}
.bump {
  animation: bump 0.7s ease-out;
}
@keyframes bump {
  30% {
    transform: scale(1.3);
    filter: brightness(1.8);
  }
}
@media (prefers-reduced-motion: reduce) {
  .bump {
    animation: none;
  }
}
</style>
