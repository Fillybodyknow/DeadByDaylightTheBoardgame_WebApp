<script setup lang="ts">
// The game coming in after the loading page: the screen starts black (where the loading page
// left it) and opens up onto the board, a red haze at the edges going last. Over in `MS`, then
// it removes itself (`done`); it never takes a click.
import { onBeforeUnmount, onMounted } from 'vue'

const emit = defineEmits<{ done: [] }>()
const MS = 1100

let timer: number | undefined
onMounted(() => (timer = window.setTimeout(() => emit('done'), MS)))
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <Teleport to="body">
    <div class="trial-fade" :style="{ '--ms': `${MS}ms` }" aria-hidden="true" />
  </Teleport>
</template>

<style scoped>
.trial-fade {
  position: fixed;
  inset: 0;
  z-index: 95;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 50% 50%, transparent 0%, rgb(120 8 6 / 0.5) 80%, rgb(60 4 3 / 0.9)),
    #050304;
  animation: open var(--ms) cubic-bezier(0.5, 0, 0.3, 1) both;
}
/* the black clears from the middle out, the red edges last */
@keyframes open {
  0% {
    opacity: 1;
    -webkit-mask-image: radial-gradient(circle at 50% 50%, transparent 0%, #000 0%);
    mask-image: radial-gradient(circle at 50% 50%, transparent 0%, #000 0%);
  }
  60% {
    opacity: 0.9;
    -webkit-mask-image: radial-gradient(circle at 50% 50%, transparent 55%, #000 90%);
    mask-image: radial-gradient(circle at 50% 50%, transparent 55%, #000 90%);
  }
  100% {
    opacity: 0;
    -webkit-mask-image: radial-gradient(circle at 50% 50%, transparent 80%, #000 120%);
    mask-image: radial-gradient(circle at 50% 50%, transparent 80%, #000 120%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .trial-fade {
    animation-name: plain;
  }
  @keyframes plain {
    to {
      opacity: 0;
    }
  }
}
</style>
