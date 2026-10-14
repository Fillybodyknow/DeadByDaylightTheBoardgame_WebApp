<script setup lang="ts">
import { computed } from 'vue'
import { asset } from '../i18n'

// Card text marks inline icons as {NAME}; {BP} is the bloodpoint triangle.
const props = defineProps<{ text: string }>()

const ICONS: Record<string, string> = {
  BP: 'assets/tokens/bloodpoint.webp',
  AFTERPIECE_TONIC: 'assets/killers/tokens/clown-afterpiece-tonic.webp',
  AFTERPIECE_ANTIDOTE: 'assets/killers/tokens/clown-afterpiece-antidote.webp',
  EMP: 'assets/props/singularity-emp.webp',
  DRONE: 'assets/props/skullmerchant-drone.webp',
  CARNIFEX: 'assets/killers/tokens/knight-carnifex.webp',
  ASSASSIN: 'assets/killers/tokens/knight-assassin.webp',
  JAILER: 'assets/killers/tokens/knight-jailer.webp',
}

const parts = computed(() =>
  props.text.split(/(\{[A-Z_]+\})/).map((chunk) => {
    const m = /^\{([A-Z_]+)\}$/.exec(chunk)
    if (!m) return { kind: 'text' as const, value: chunk }
    const icon = ICONS[m[1]]
    return icon ? { kind: 'icon' as const, value: asset(icon), name: m[1] } : { kind: 'tag' as const, value: m[1] }
  }),
)
</script>

<template>
  <span class="rich">
    <template v-for="(p, i) in parts" :key="i">
      <img v-if="p.kind === 'icon'" class="icon" :class="{ token: p.name !== 'BP' }" :src="p.value" :alt="p.name" :title="p.name" />
      <span v-else-if="p.kind === 'tag'" class="tag">{{ p.value }}</span>
      <template v-else>{{ p.value }}</template>
    </template>
  </span>
</template>

<style scoped>
.rich {
  white-space: pre-line;
}
.icon {
  height: 1.1em;
  vertical-align: -0.2em;
}
.icon.token {
  height: 2em;
  vertical-align: middle;
  margin: 0 0.15em;
}
.tag {
  font-size: 0.75em;
  padding: 0 0.3em;
  border: 1px solid currentColor;
  border-radius: 3px;
  opacity: 0.8;
}
</style>
