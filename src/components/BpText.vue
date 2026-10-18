<script setup lang="ts">
// Text that may name Bloodpoints: each "▲" in it shows as the token. The game's texts (labels,
// the log, perk choices) keep "▲" as a plain character; only the screen draws the token.
import { computed } from 'vue'
import BpIcon from './BpIcon.vue'

const props = defineProps<{ text: string | number | null | undefined }>()
const parts = computed(() => String(props.text ?? '').split('▲'))
</script>

<template>
  <template v-for="(part, i) in parts" :key="i"><BpIcon v-if="i > 0" />{{ part }}</template>
</template>
