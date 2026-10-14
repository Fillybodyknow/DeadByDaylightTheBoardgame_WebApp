<script setup lang="ts">
import { components, skillFaceImage } from '../../../src/data'
import { asset } from '../../../src/i18n'
import { isFailure, isGreat } from '../engine/engine'
import type { Die } from '../engine/types'

defineProps<{ dice: Die[]; big?: boolean }>()

const image = (d: Die) => (d.kind === 'skill' ? skillFaceImage(d.face) : components.dangerDieFaces[d.face])
const label = (d: Die) => (d.asSuccess ? 'ล้มเหลว → สำเร็จ (Iron Will)' : isFailure(d) ? 'ล้มเหลว' : isGreat(d) ? 'สำเร็จยอดเยี่ยม' : 'สำเร็จ')
</script>

<template>
  <span class="dice" :class="{ big }">
    <span v-for="(d, i) in dice" :key="i" class="die" :class="{ fail: isFailure(d) && !d.asSuccess, great: isGreat(d), rerolled: d.rerolled, willed: d.asSuccess }" :title="label(d)">
      <img :src="asset(image(d))" :alt="label(d)" />
    </span>
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
