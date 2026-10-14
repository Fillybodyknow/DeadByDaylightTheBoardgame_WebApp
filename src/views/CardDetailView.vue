<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import CharacterSheet from '../components/CharacterSheet.vue'
import ItemCard from '../components/ItemCard.vue'
import { items, killerById, survivorById } from '../data'
import { lang } from '../i18n'

const route = useRoute()
const kind = computed(() => route.params.kind as 'survivor' | 'killer' | 'item')
const id = computed(() => route.params.id as string)

const character = computed(() =>
  kind.value === 'survivor' ? survivorById.get(id.value) : kind.value === 'killer' ? killerById.get(id.value) : undefined,
)
const item = computed(() => (kind.value === 'item' ? items.find((i) => i.id === id.value) : undefined))
</script>

<template>
  <RouterLink to="/cards" class="muted back">{{ lang === 'th' ? '← กลับ' : '← Back' }}</RouterLink>
  <CharacterSheet v-if="character && kind !== 'item'" :character="character" :kind="kind" />
  <ItemCard v-else-if="item" :item="item" />
  <p v-else>{{ lang === 'th' ? 'ไม่พบการ์ดนี้' : 'Card not found' }}</p>
</template>

<style scoped>
.back {
  display: inline-block;
  margin-bottom: 0.75rem;
  text-decoration: none;
}
</style>
