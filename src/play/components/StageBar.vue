<script setup lang="ts">
// The foot of a picks stage, always in view however long the page above it is: how many are done
// (dots), a line of words, and the player's button — so "confirm" is never lost under a long grid.
defineProps<{ done?: number; total?: number }>()
</script>

<template>
  <div class="stage-bar" role="region" aria-label="สถานะและปุ่มยืนยัน">
    <div class="status">
      <span v-if="total" class="dots" aria-hidden="true">
        <i v-for="n in total" :key="n" :class="{ on: n <= (done ?? 0) }" />
      </span>
      <span class="text"><slot /></span>
    </div>
    <div class="acts"><slot name="actions" /></div>
  </div>
</template>

<style scoped>
.stage-bar {
  position: sticky;
  bottom: 0.6rem;
  z-index: 6;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem 1.2rem;
  padding: 0.7rem 1rem;
  border: 1px solid var(--line-strong);
  border-top: 2px solid var(--blood);
  border-radius: var(--radius);
  background: linear-gradient(180deg, rgb(14 15 19 / 0.96), rgb(8 9 12 / 0.98));
  box-shadow: 0 -10px 30px rgb(0 0 0 / 0.55);
  backdrop-filter: blur(6px);
}
.status {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-width: 0;
  color: var(--text);
}
.dots {
  display: inline-flex;
  gap: 0.3rem;
}
.dots i {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  border: 2px solid rgb(255 255 255 / 0.25);
  transition: background 0.2s, border-color 0.2s;
}
.dots i.on {
  background: var(--ok);
  border-color: var(--ok);
  box-shadow: 0 0 8px rgb(80 200 120 / 0.7);
}
.acts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.6rem 1rem;
  flex: 1 1 auto;
}
.acts :deep(.primary),
.acts :deep(.lockbtn) {
  min-width: min(18rem, 100%);
  padding: 0.65rem 1.4rem;
  font-size: 1.05rem;
}
@media (max-width: 640px) {
  .acts {
    justify-content: stretch;
  }
  .acts :deep(button) {
    flex: 1 1 100%;
  }
}
</style>
