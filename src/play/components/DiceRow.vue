<script setup lang="ts">
import { components, skillFaceImage } from '../../data'
import { asset } from '../../i18n'
import { isFailure, isGreat } from '../engine/engine'
import type { Die } from '../engine/types'

/**
 * `pickable`: dice that can be clicked now (Bond's die to keep, a die to re-roll with a key), with
 * `pickHint` as their tooltip.
 */
defineProps<{ dice: Die[]; big?: boolean; pickable?: boolean[]; pickHint?: string }>()
const emit = defineEmits<{ pick: [index: number] }>()

const image = (d: Die) => (d.kind === 'skill' ? skillFaceImage(d.face) : components.dangerDieFaces[d.face])
const label = (d: Die) => (d.asSuccess ? 'ล้มเหลว → สำเร็จ (Iron Will)' : isFailure(d) ? 'ล้มเหลว' : isGreat(d) ? 'สำเร็จยอดเยี่ยม' : 'สำเร็จ')
</script>

<template>
  <span class="dice" :class="{ big }">
    <component
      :is="pickable?.[i] ? 'button' : 'span'"
      v-for="(d, i) in dice"
      :key="i"
      :type="pickable?.[i] ? 'button' : undefined"
      class="die"
      :class="{ fail: isFailure(d) && !d.asSuccess, great: isGreat(d), rerolled: d.rerolled, willed: d.asSuccess, pick: pickable?.[i] }"
      :title="pickable?.[i] && pickHint ? `${label(d)} — ${pickHint}` : label(d)"
      @click="pickable?.[i] && emit('pick', i)"
    >
      <img :src="asset(image(d))" :alt="label(d)" />
    </component>
  </span>
</template>

<style scoped>
.dice {
  display: inline-flex;
  gap: 0.25rem;
  vertical-align: middle;
}
.die {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 0 0 1px var(--line-strong);
}
.big .die {
  width: 52px;
  height: 52px;
  border-radius: 7px;
  animation: land 0.35s ease-out;
}
/* a die to click: it pulses, and lifts under the pointer */
button.die {
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  outline: 2px solid #ffe9b0;
  outline-offset: 2px;
  animation: pick 1.2s ease-in-out infinite;
  transition: transform 0.12s;
}
button.die:hover,
button.die:focus-visible {
  transform: translateY(-4px) scale(1.08);
  animation: none;
}
@keyframes pick {
  50% {
    outline-color: rgb(255 233 176 / 0.3);
  }
}
.die img {
  width: 100%;
  height: 100%;
  display: block;
}
.die.fail {
  box-shadow: 0 0 0 2px var(--blood-bright);
}
.die.great {
  box-shadow: 0 0 0 2px #f5c542, 0 0 10px rgb(245 197 66 / 0.6);
}
.die.willed {
  box-shadow: 0 0 0 2px var(--ok), 0 0 10px rgb(79 179 106 / 0.6);
}
.die.rerolled {
  outline: 2px dashed var(--muted);
  outline-offset: 1px;
}
@keyframes land {
  from {
    transform: rotate(-200deg) scale(0.4);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .big .die {
    animation: none;
  }
}
</style>
