<script setup lang="ts">
// Choosing the board for a game: the maps the engine has a graph for (engine/boards.ts).
// `readonly`: shows the choice without letting this player change it (online survivors).
import { asset } from '../../i18n'
import { sfx } from '../../sound'
import { boards } from '../engine/boards'

const props = defineProps<{ modelValue: string; readonly?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [id: string] }>()

const list = Object.values(boards)

function pick(id: string) {
  if (props.readonly || id === props.modelValue) return
  sfx.click()
  emit('update:modelValue', id)
}

function random() {
  const others = list.filter((b) => b.id !== props.modelValue)
  pick(others[Math.floor(Math.random() * others.length)].id)
}
</script>

<template>
  <section class="card map-picker">
    <header>
      <div>
        <small class="muted">แผนที่</small>
        <h2>{{ list.find((b) => b.id === modelValue)?.name }}</h2>
      </div>
      <button v-if="!readonly" type="button" class="roll" @click="random">🎲 สุ่มแผนที่</button>
    </header>
    <div class="maps" role="radiogroup" aria-label="แผนที่">
      <button
        v-for="b in list"
        :key="b.id"
        type="button"
        role="radio"
        class="map"
        :class="{ on: b.id === modelValue }"
        :aria-checked="b.id === modelValue"
        :disabled="readonly && b.id !== modelValue"
        @click="pick(b.id)"
      >
        <img :src="asset(b.image)" :alt="b.name" loading="lazy" />
        <span>{{ b.name }}</span>
      </button>
    </div>
    <p class="muted small">ทุกตัวจะทอยหาห้องเริ่มต้นตอนเข้า Trial (หน้า 6)</p>
  </section>
</template>

<style scoped>
.map-picker {
  display: grid;
  gap: 0.75rem;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
h2 {
  margin: 0.1rem 0 0;
}
.maps {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 0.6rem;
}
.map {
  display: grid;
  gap: 0.35rem;
  padding: 0.35rem;
  text-align: left;
  border: 2px solid var(--line);
  background: rgb(0 0 0 / 0.25);
}
.map img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 4px;
}
.map span {
  font-weight: 700;
  font-size: 0.9rem;
}
.map.on {
  border-color: #ffd56a;
  box-shadow: 0 0 14px rgb(255 214 106 / 0.45);
}
.map:disabled {
  opacity: 0.35;
}
.small {
  margin: 0;
  font-size: 0.85rem;
}
</style>
