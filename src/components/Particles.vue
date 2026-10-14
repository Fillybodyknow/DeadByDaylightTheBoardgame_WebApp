<script setup lang="ts">
// Drifting particles behind the page. "embers" rise from the campfire (lobby);
// "spores" are slow dark-red motes of The Entity (during play). Pure CSS, no canvas.
const props = defineProps<{ variant: 'embers' | 'spores' }>()

const COUNT = props.variant === 'embers' ? 28 : 22
const rand = (a: number, b: number) => a + Math.random() * (b - a)

const particles = Array.from({ length: COUNT }, () =>
  props.variant === 'embers'
    ? { left: rand(5, 95), size: rand(2, 5), dur: rand(6, 13), delay: -rand(0, 13), drift: rand(-60, 60), hue: rand(10, 38) }
    : { left: rand(0, 100), size: rand(2, 6), dur: rand(16, 30), delay: -rand(0, 30), drift: rand(-90, 90), hue: rand(350, 365) },
)
</script>

<template>
  <div class="particles" :class="variant" aria-hidden="true">
    <span
      v-for="(p, i) in particles"
      :key="i"
      :style="{
        left: `${p.left}%`,
        width: `${p.size}px`,
        height: `${p.size}px`,
        animationDuration: `${p.dur}s`,
        animationDelay: `${p.delay}s`,
        '--drift': `${p.drift}px`,
        '--hue': p.hue,
      }"
    />
  </div>
</template>

<style scoped>
.particles {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  /* inside App's .scene: above the backdrop's darkening layer (z 2), below the page */
  z-index: 3;
}
span {
  position: absolute;
  bottom: -10px;
  border-radius: 50%;
  animation-name: rise;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
.embers span {
  background: hsl(var(--hue) 100% 60%);
  box-shadow:
    0 0 6px hsl(var(--hue) 100% 55%),
    0 0 14px hsl(var(--hue) 100% 45% / 0.6);
  mix-blend-mode: screen;
}
.spores span {
  background: hsl(var(--hue) 80% 45% / 0.7);
  box-shadow: 0 0 10px hsl(var(--hue) 90% 40% / 0.6);
  filter: blur(0.5px);
}
@keyframes rise {
  0% {
    transform: translate3d(0, 0, 0) scale(1);
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  70% {
    opacity: 0.8;
  }
  100% {
    transform: translate3d(var(--drift), -105vh, 0) scale(0.3);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .particles {
    display: none;
  }
}
</style>
