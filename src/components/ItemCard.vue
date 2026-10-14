<script setup lang="ts">
import { asset, tr } from '../i18n'
import type { Item } from '../types'
import RichText from './RichText.vue'

defineProps<{ item: Item; compact?: boolean }>()
</script>

<template>
  <article class="item" :class="{ compact }">
    <img :src="asset(item.images.th ?? item.images.pt)" :alt="tr(item.name)" loading="lazy" />
    <div>
      <h3>{{ tr(item.name) }} <small class="muted">×{{ item.count }}</small></h3>
      <RichText :text="tr(item.text)" />
    </div>
  </article>
</template>

<style scoped>
.item {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 300px) 1fr;
  align-items: start;
}
.item img {
  width: 100%;
  border-radius: var(--radius);
}
.compact {
  grid-template-columns: 72px 1fr;
  gap: 0.75rem;
  align-items: center;
}
.compact img {
  border-radius: 6px;
}
.compact h3 {
  margin-bottom: 0.2rem;
}
@media (max-width: 600px) {
  .item:not(.compact) {
    grid-template-columns: 1fr;
  }
}
</style>
