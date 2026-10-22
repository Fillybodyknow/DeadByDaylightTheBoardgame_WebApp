<script setup lang="ts">
// The pings on the map (pings.ts): a ring in the player's colour pulsing out from the spot, a
// steady dot and their name, gone after PING_MS. Over everything on the board, never in the way
// of a click.
import { PING_MS, pingFailed, pingWait, shownPings } from '../pings'
</script>

<template>
  <div class="ping-layer" aria-live="polite">
    <div
      v-for="p in shownPings"
      :key="`${p.from}-${p.key}`"
      class="ping"
      :style="{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, '--c': p.hex, '--ms': `${PING_MS}ms` }"
      role="status"
      :aria-label="`${p.name} ปิงตรงนี้`"
    >
      <i class="wave" />
      <i class="wave late" />
      <i class="ring" />
      <i class="dot" />
      <span class="who">{{ p.name }}</span>
    </div>
    <p v-if="pingWait" class="ping-wait" role="status">📍 ปิงถี่เกินไป — รออีก {{ pingWait }} วินาที</p>
    <p v-else-if="pingFailed" class="ping-wait" role="status">📍 ปิงไม่ถึงเพื่อน — ห้องยังไม่รองรับ Ping (ต้องอัปเดต database rules)</p>
  </div>
</template>

<style scoped>
.ping-layer {
  position: absolute;
  inset: 0;
  z-index: 8;
  pointer-events: none;
}
.ping {
  position: absolute;
  width: 0;
  height: 0;
  animation: ping-life var(--ms) linear both;
}
.ping i {
  position: absolute;
  left: 0;
  top: 0;
  border-radius: 50%;
  translate: -50% -50%;
}
/* the steady mark: a ring that blinks, and a dot in the middle */
.ring {
  width: 4.6cqi;
  height: 4.6cqi;
  border: 0.55cqi solid var(--c);
  box-shadow:
    0 0 1.2cqi var(--c),
    inset 0 0 0.8cqi var(--c);
  animation: ping-blink 0.5s ease-in-out infinite alternate;
}
.dot {
  width: 1.1cqi;
  height: 1.1cqi;
  background: var(--c);
  box-shadow: 0 0 0.8cqi var(--c);
}
/* waves pulsing out from the spot */
.wave {
  width: 4.6cqi;
  height: 4.6cqi;
  border: 0.4cqi solid var(--c);
  animation: ping-wave 1.1s ease-out infinite;
}
.wave.late {
  animation-delay: 0.55s;
}
.who {
  position: absolute;
  left: 0;
  top: 2.9cqi;
  translate: -50% 0;
  white-space: nowrap;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: clamp(0.65rem, 1.1cqi, 0.85rem);
  font-weight: 700;
  color: #111;
  background: var(--c);
  box-shadow: 0 1px 4px rgb(0 0 0 / 0.6);
}
.ping-wait {
  position: absolute;
  left: 50%;
  bottom: 1rem;
  translate: -50% 0;
  margin: 0;
  padding: 0.35rem 0.8rem;
  border-radius: 999px;
  font-size: 0.85rem;
  color: #ffe9b0;
  background: rgb(20 10 10 / 0.85);
  border: 1px solid rgb(255 214 140 / 0.5);
}
@keyframes ping-life {
  0% {
    opacity: 0;
    scale: 1.6;
  }
  6% {
    opacity: 1;
    scale: 1;
  }
  85% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
@keyframes ping-blink {
  to {
    opacity: 0.35;
  }
}
@keyframes ping-wave {
  from {
    scale: 0.6;
    opacity: 0.9;
  }
  to {
    scale: 3.2;
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .wave {
    display: none;
  }
  .ring {
    animation: none;
  }
}
</style>
