<script setup lang="ts">
defineProps<{ value: number; max: number; color: string }>()
</script>

<template>
  <span class="pips" :aria-label="`${value} / ${max}`">
    <span v-for="n in max" :key="n" class="pip" :style="n <= value ? { background: color, borderColor: color } : undefined" />
    <span class="num">{{ value }}/{{ max }}</span>
  </span>
</template>

<style scoped>
.pips {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.pip {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid var(--line);
  background: var(--bg);
}
.num {
  margin-left: 0.35rem;
  font-size: 0.8rem;
  color: var(--muted);
}
</style>
