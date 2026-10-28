<script setup lang="ts">
// A perk's moment in a line: the mini of whom it is about, what is happening, and a picture of
// what they are doing it to (the prop interacted with, or the survivor healed). The Perk panel and
// the side panel both show it, so whoever decides and whoever waits read the same.
import { computed } from 'vue'
import { asset } from '../../i18n'
import type { GameState, PerkOwner, PerkWindow } from '../engine/types'
import { windowLabel, windowWhat, windowWho } from '../labels'
import FaceLabel from './FaceLabel.vue'
import Mini from './Mini.vue'

/** `deciding`: who decides (their own mini is left out). */
const props = defineProps<{ st: GameState; w: PerkWindow; deciding?: PerkOwner }>()

const who = computed(() => {
  const w = windowWho(props.w)
  return w === props.deciding ? null : w
})
const what = computed(() => windowWhat(props.st, props.w))
</script>

<template>
  <span class="moment">
    <FaceLabel :st="st" :who="who" :text="windowLabel(st, w)" />
    <span v-if="what" class="what" :title="what.label">
      <Mini v-if="what.mini" class="what-mini" :src="asset(what.icon)" :alt="what.label" />
      <img v-else class="what-icon" :src="asset(what.icon)" :alt="what.label" />
    </span>
  </span>
</template>

<style scoped>
.moment {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
}
.what {
  flex: none;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  background: rgb(255 255 255 / 0.06);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 0.18);
}
.what-icon {
  width: 38px;
  height: 38px;
  object-fit: contain;
}
.what-mini {
  width: 36px;
  height: 36px;
}
</style>
