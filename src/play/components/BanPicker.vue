<script setup lang="ts">
// The Banlist page: the characters of the other side, to ban up to `max` of them. A tap bans or
// takes back; the count says how many are left. Locked once this player confirmed.
import { computed } from 'vue'
import { asset } from '../../i18n'
import { playableKillers, playableSurvivors } from '../online/settings'

const props = defineProps<{
  /** What is banned here: survivors (by the killer) or killers (by the survivors). */
  kind: 'survivor' | 'killer'
  banned: string[]
  max: number
  locked?: boolean
}>()
const emit = defineEmits<{ toggle: [id: string] }>()

const list = computed(() => (props.kind === 'killer' ? playableKillers() : playableSurvivors()))
const full = computed(() => props.banned.length >= props.max)
</script>

<template>
  <div class="ban-picker">
    <p class="count" :class="{ full }">
      🚫 แบนแล้ว <b>{{ banned.length }}</b>/{{ max }}
      <small class="muted">{{ locked ? '— ล็อกแล้ว' : full ? '— ครบแล้ว แตะที่ถูกแบนเพื่อยกเลิก' : '— แตะเพื่อแบน' }}</small>
    </p>
    <div class="grid">
      <button
        v-for="c in list"
        :key="c.id"
        type="button"
        class="ban"
        :class="{ on: banned.includes(c.id), kill: kind === 'killer' }"
        :disabled="locked || (full && !banned.includes(c.id))"
        :aria-pressed="banned.includes(c.id)"
        @click="emit('toggle', c.id)"
      >
        <img :src="asset(c.images.mini)" :alt="c.name" loading="lazy" draggable="false" />
        <span class="name">{{ c.name }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.count {
  margin: 0 0 0.6rem;
  font-size: 1.05rem;
}
.count.full b {
  color: var(--blood-bright);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 0.5rem;
}
.ban {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.3rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgb(10 11 14 / 0.7);
}
.ban.kill {
  border-color: var(--blood-dim);
}
.ban img {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
}
.name {
  font-size: 0.78rem;
  line-height: 1.15;
  text-align: center;
}
.ban:not(:disabled):hover {
  border-color: var(--blood-bright);
}
.ban.on {
  border-color: var(--blood-bright);
  background: rgb(70 8 12 / 0.55);
}
.ban.on img {
  filter: grayscale(1) brightness(0.45);
}
.ban.on::after {
  content: '🚫';
  position: absolute;
  top: 0.5rem;
  left: 50%;
  translate: -50% 0;
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  font-size: 2rem;
}
.ban:disabled:not(.on) {
  opacity: 0.4;
}
.ban:disabled {
  cursor: default;
}
</style>
