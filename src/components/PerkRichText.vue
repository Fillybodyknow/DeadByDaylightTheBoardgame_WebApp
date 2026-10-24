<script setup lang="ts">
// A perk's text with its key words lit (perkHighlight.ts): the same in the game's panels, the
// companion's pages and on the Thai perk cards.
import { computed } from 'vue'
import { thaiName } from '../data/thaiNames'
import { asset } from '../i18n'
import { HIGHLIGHT_COLORS, highlightPerkText } from '../perkHighlight'
import { TOKEN_ICONS } from '../tokenIcons'
import BpIcon from './BpIcon.vue'

const props = defineProps<{ text: string }>()

// English names in the Thai text (another perk, a power, a token) by their Thai names
const parts = computed(() => highlightPerkText(props.text, thaiName))
const color = (kind: string) => HIGHLIGHT_COLORS[kind as keyof typeof HIGHLIGHT_COLORS]
</script>

<template>
  <span class="perk-rich">
    <template v-for="(p, i) in parts" :key="i">
      <BpIcon v-if="p.kind === 'bp'" />
      <img v-else-if="p.kind === 'token'" class="token" :src="asset(TOKEN_ICONS[p.t])" :alt="p.t" :title="p.t" />
      <b v-else-if="p.kind !== 'plain'" :style="{ color: color(p.kind) }">{{ p.t }}</b>
      <template v-else>{{ p.t }}</template>
    </template>
  </span>
</template>

<style scoped>
.perk-rich {
  white-space: pre-line;
}
/* a lit name or term never breaks in two (Thai has no spaces to break at) */
.token {
  height: 2em;
  vertical-align: middle;
  margin: 0 0.15em;
}
b {
  font-weight: 700;
  white-space: nowrap;
}
</style>
