<script setup lang="ts">
// A button label that names a character: their mini in front of the text, so the choice reads
// at a glance ("heal Meg", "take 1 ▲ from Jake", "attack Dwight").
import { computed } from 'vue'
import { asset } from '../../i18n'
import type { GameState, PerkOwner } from '../engine/types'
import { killerMini, survivorMini } from '../labels'
import Mini from './Mini.vue'
import BpText from '../../components/BpText.vue'

/** `icon`: a picture in place of the face (a token: The Clown's Afterpiece). */
const props = defineProps<{ st: GameState; who: PerkOwner | null | undefined; text: string; icon?: string }>()

const face = computed(() => {
  const w = props.who
  if (w === null || w === undefined) return null
  return w === 'killer' ? killerMini(props.st) : survivorMini(props.st, w)
})
</script>

<template>
  <span class="face-label">
    <img v-if="icon" class="chip token" :src="asset(icon)" alt="" />
    <Mini v-else-if="face" class="chip" :class="{ wounded: typeof who === 'number' && st.survivors[who].wounded }" :src="asset(face)" />
    <span><BpText :text="text" /></span>
  </span>
</template>

<style scoped>
.face-label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  text-align: left;
}
.chip {
  width: 30px;
  height: 30px;
  flex: none;
  box-shadow: 0 0 0 1px rgb(255 255 255 / 0.25);
}
.chip.token {
  border-radius: 6px;
  object-fit: cover;
}
.chip.wounded {
  box-shadow: 0 0 0 2px var(--blood-bright);
}
</style>
