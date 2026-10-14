<script setup lang="ts">
import { computed } from 'vue'
import type { GameState } from '../engine/types'
import DiceRow from './DiceRow.vue'

const props = defineProps<{ st: GameState }>()

const entries = computed(() =>
  props.st.log
    .filter((e) => e.text)
    .slice(-80)
    .reverse(),
)
</script>

<template>
  <section class="card log">
    <h3>บันทึกเกม</h3>
    <ol>
      <li v-for="(e, i) in entries" :key="st.log.length - i" :class="e.who === 'killer' ? 'killer' : e.who === 'game' ? 'game' : 'survivor'">
        <DiceRow v-if="e.dice" :dice="e.dice" />
        {{ e.text }}
      </li>
    </ol>
  </section>
</template>

<style scoped>
.log {
  padding: 0.75rem;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
h3 {
  font-size: 0.95rem;
  color: var(--muted);
}
ol {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  max-height: 16rem;
  font-size: 0.86rem;
  display: grid;
  gap: 0.2rem;
}
li {
  padding-left: 0.5rem;
  border-left: 2px solid var(--line-strong);
}
li.killer {
  border-left-color: var(--blood);
}
li.survivor {
  border-left-color: #c9b98a;
}
li.game {
  color: #f5c542;
  border-left-color: #f5c542;
}
</style>
