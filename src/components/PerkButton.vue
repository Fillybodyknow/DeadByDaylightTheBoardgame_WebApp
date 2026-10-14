<script setup lang="ts">
import { ref } from 'vue'
import { tr } from '../i18n'
import type { Perk } from '../types'
import RichText from './RichText.vue'

defineProps<{ perk: Perk; used: boolean; affordable: boolean }>()
defineEmits<{ activate: [] }>()

const open = ref(false)
</script>

<template>
  <div class="perk" :class="{ used }">
    <button type="button" class="use" :disabled="used || !affordable" @click="$emit('activate')">
      <span class="cost">{{ perk.cost }}</span>
      {{ perk.name }}
      <span v-if="used" class="check">✓</span>
    </button>
    <button type="button" class="info" :aria-expanded="open" @click="open = !open">{{ open ? '▴' : 'ℹ' }}</button>
    <p v-if="open" class="text"><RichText :text="tr(perk.text)" /></p>
  </div>
</template>

<style scoped>
.perk {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.25rem;
}
.use {
  text-align: left;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  padding: 0.3rem 0.5rem;
}
.cost {
  display: inline-grid;
  place-items: center;
  min-width: 1.4em;
  height: 1.4em;
  border-radius: 4px;
  background: var(--blood);
  color: #fff;
  font-size: 0.8em;
}
.used .use {
  text-decoration: line-through;
}
.check {
  margin-left: auto;
  color: var(--ok);
}
.info {
  padding: 0.3rem 0.6rem;
}
.text {
  grid-column: 1 / -1;
  margin: 0;
  padding: 0.5rem;
  font-size: 0.9rem;
  background: var(--bg);
  border-radius: 6px;
}
</style>
