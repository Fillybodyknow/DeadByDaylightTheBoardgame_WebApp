<script setup lang="ts">
// The wounded ring round a survivor's portrait: a band of blood with an uneven, pooled edge, a wet
// shine, drops running off its lower rim, and a slow pulse like a heartbeat. Laid over the
// portrait (its parent must be positioned); it takes no clicks.
import { useId } from 'vue'

/** Unique per ring: the filter and gradient are looked up by id. */
const id = useId()

/** Drops hanging off the lower rim: where (degrees from the top, clockwise), how long, how slow. */
const DROPS = [
  { angle: 152, len: 1, dur: 3.4, delay: 0 },
  { angle: 196, len: 0.75, dur: 4.6, delay: 1.3 },
  { angle: 228, len: 0.55, dur: 3.9, delay: 2.4 },
]
/** A point on the band (r 46 round the centre of a 100 box). */
const at = (deg: number) => ({ x: 50 + 46 * Math.sin((deg * Math.PI) / 180), y: 50 - 46 * Math.cos((deg * Math.PI) / 180) })
</script>

<template>
  <svg class="wound-ring" viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <!-- Blood, not paint: the band's edge pooled and uneven (large, slow noise), then lit from the
           top left so it shines wet (a specular highlight on its blurred relief). -->
      <filter :id="`${id}-soak`" x="-25%" y="-25%" width="150%" height="150%">
        <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" seed="3" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="7" xChannelSelector="R" yChannelSelector="G" result="shape" />
        <feGaussianBlur in="shape" stdDeviation="1.1" result="relief" />
        <feSpecularLighting in="relief" surfaceScale="5" specularConstant="0.85" specularExponent="30" lighting-color="#ffe0d8" result="shine">
          <fePointLight x="18" y="8" z="38" />
        </feSpecularLighting>
        <feComposite in="shine" in2="shape" operator="in" result="wet" />
        <feComposite in="shape" in2="wet" operator="arithmetic" k1="0" k2="1" k3="0.55" k4="0" />
      </filter>
      <!-- light from the top left: bright fresh red to clotted dark -->
      <linearGradient :id="`${id}-blood`" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#e8261c" />
        <stop offset="0.45" stop-color="#a80a12" />
        <stop offset="1" stop-color="#4a0005" />
      </linearGradient>
    </defs>
    <g :filter="`url(#${id}-soak)`">
      <!-- the band, its dark inner edge, and the drops -->
      <circle cx="50" cy="50" r="44" fill="none" :stroke="`url(#${id}-blood)`" stroke-width="7.5" />
      <circle cx="50" cy="50" r="40.2" fill="none" stroke="#2a0003" stroke-width="1.6" opacity="0.7" />
      <g v-for="(d, i) in DROPS" :key="i" :transform="`translate(${at(d.angle).x} ${at(d.angle).y})`">
        <path
          class="drop"
          :style="{ '--dur': `${d.dur}s`, '--delay': `${d.delay}s`, '--len': d.len }"
          d="M0 0 C2.4 5 3.6 9 3.6 12 A3.6 3.6 0 1 1 -3.6 12 C-3.6 9 -2.4 5 0 0 Z"
          :fill="`url(#${id}-blood)`"
        />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.wound-ring {
  position: absolute;
  inset: -9%;
  width: 118%;
  height: 118%;
  pointer-events: none;
  overflow: visible;
  animation: pulse 1.5s ease-in-out infinite;
}
/* a heartbeat: the blood glows on the beat */
@keyframes pulse {
  0%,
  45%,
  100% {
    filter: drop-shadow(0 0 2px rgb(120 0 0 / 0.9));
  }
  12% {
    filter: drop-shadow(0 0 6px rgb(255 30 30 / 0.85));
  }
  26% {
    filter: drop-shadow(0 0 4px rgb(255 30 30 / 0.6));
  }
}
/* a drop slowly runs, then gathers again */
.drop {
  transform-box: fill-box;
  transform-origin: 50% 0;
  transform: scaleY(calc(var(--len) * 0.55));
  animation: run var(--dur) ease-in var(--delay) infinite;
}
@keyframes run {
  0% {
    transform: scaleY(calc(var(--len) * 0.4));
  }
  70% {
    transform: scaleY(calc(var(--len) * 1.25));
  }
  100% {
    transform: scaleY(calc(var(--len) * 0.4));
  }
}
@media (prefers-reduced-motion: reduce) {
  .wound-ring,
  .drop {
    animation: none;
  }
}
</style>
