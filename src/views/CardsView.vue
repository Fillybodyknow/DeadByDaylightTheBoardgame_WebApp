<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { items, killers, survivors } from '../data'
import { asset, lang, tr } from '../i18n'

type Tab = 'survivor' | 'killer' | 'item'
const tab = ref<Tab>('survivor')
const query = ref('')

// Searches names and perk names so "sprint burst" finds Meg.
const list = computed(() => {
  const q = query.value.trim().toLowerCase()
  const match = (...texts: string[]) => !q || texts.some((t) => t.toLowerCase().includes(q))
  if (tab.value === 'survivor')
    return survivors
      .filter((s) => match(s.name, ...s.perks.map((p) => p.name)))
      .map((s) => ({ id: s.id, name: s.name, sub: s.perks.map((p) => p.name).join(' · '), img: s.images.mini }))
  if (tab.value === 'killer')
    return killers
      .filter((k) => match(k.name, k.power.name, ...k.perks.map((p) => p.name)))
      .map((k) => ({ id: k.id, name: k.name, sub: k.power.name, img: k.images.mini }))
  return items
    .filter((i) => match(i.name.en, i.name.th))
    .map((i) => ({ id: i.id, name: tr(i.name), sub: `×${i.count}`, img: i.images.th ?? i.images.pt }))
})

const labels = computed(() =>
  lang.value === 'th'
    ? { survivor: 'ผู้รอดชีวิต', killer: 'ฆาตกร', item: 'ไอเทม', search: 'ค้นหาชื่อ / perk' }
    : { survivor: 'Survivors', killer: 'Killers', item: 'Items', search: 'Search name / perk' },
)
</script>

<template>
  <div class="toolbar">
    <div class="tabs">
      <button
        v-for="t in ['survivor', 'killer', 'item'] as Tab[]"
        :key="t"
        type="button"
        :class="{ active: tab === t }"
        @click="tab = t"
      >
        {{ labels[t] }}
      </button>
    </div>
    <input v-model="query" class="search" type="search" :placeholder="labels.search" />
  </div>

  <div class="grid">
    <RouterLink v-for="c in list" :key="c.id" :to="`/cards/${tab}/${c.id}`" class="tile card">
      <img :src="asset(c.img)" :alt="c.name" loading="lazy" />
      <strong>{{ c.name }}</strong>
      <small class="muted">{{ c.sub }}</small>
    </RouterLink>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.tabs {
  display: flex;
  gap: 0.25rem;
}
.tabs .active {
  background: var(--blood);
  border-color: var(--blood);
}
.search {
  flex: 1;
  min-width: 180px;
  font: inherit;
  color: var(--text);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.45rem 0.8rem;
}
.tile {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  text-decoration: none;
  padding: 0.6rem;
}
.tile:hover {
  border-color: var(--muted);
}
.tile img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  background: #000;
  border-radius: 6px;
}
.tile small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
