<script setup lang="ts">
// Online status in the top bar: shown only when something is off — the connection is down, or
// this device's moves are taking a while to reach the room. A normal write takes ~0.1 s, so a
// short delay keeps the badge from flickering on every move.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { pendingWrites } from '../game'
import { session } from '../online/session'

const SLOW_MS = 700

const slow = ref(false)
let timer: number | null = null

watch(
  () => pendingWrites.value > 0,
  (busy) => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    if (!busy) slow.value = false
    else timer = window.setTimeout(() => (slow.value = true), SLOW_MS)
  },
  { immediate: true },
)
onBeforeUnmount(() => timer !== null && clearTimeout(timer))

const state = computed(() => (!session.connected ? 'offline' : slow.value ? 'syncing' : null))
</script>

<template>
  <span v-if="state" class="sync" :class="state" role="status" aria-live="polite">
    <template v-if="state === 'offline'">⚠ การเชื่อมต่อหลุด — กำลังเชื่อมใหม่…</template>
    <template v-else><span class="spin" aria-hidden="true">⟳</span> กำลังซิงก์…</template>
  </span>
</template>

<style scoped>
.sync {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.85rem;
  white-space: nowrap;
}
.syncing {
  color: var(--warn);
  border: 1px solid rgb(217 162 39 / 0.5);
}
.offline {
  color: #fff;
  background: var(--blood);
  border: 1px solid var(--blood-bright);
  animation: pulse 1.4s ease-in-out infinite;
}
.spin {
  display: inline-block;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes pulse {
  50% {
    opacity: 0.7;
  }
}
@media (prefers-reduced-motion: reduce) {
  .spin,
  .offline {
    animation: none;
  }
}
</style>
