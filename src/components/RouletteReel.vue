<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { asset } from '../i18n'
import { sfx } from '../sound'

export interface ReelItem {
  id: string
  name: string
  image: string
}

// Slot-machine reel: a strip of tiles slides under a centre marker, slows down and stops on
// `target`. The result is decided before the spin; the reel only shows it.
const props = defineProps<{ items: ReelItem[]; target: string; title: string; wide?: boolean }>()
const emit = defineEmits<{ done: [id: string] }>()

const TILE = computed(() => (props.wide ? 220 : 120)) // px, incl. gap
const LOOPS = 4
const DURATION = 2600

// Shuffled strip, repeated, ending with the target near the end.
const strip = computed(() => {
  const pool = [...props.items].sort(() => Math.random() - 0.5)
  const out: ReelItem[] = []
  for (let i = 0; i < LOOPS; i++) out.push(...pool)
  const target = props.items.find((x) => x.id === props.target)!
  out.push(...pool.slice(0, 3), target, ...pool.slice(3, 6))
  return out
})
const stopIndex = computed(() => strip.value.length - 4)

const offset = ref(0)
const finished = ref(false)
let raf = 0
let start = 0
let lastTile = -1
import { reducedMotion } from '../settings'

// easeOutQuart: fast start, long slow finish
const ease = (t: number) => 1 - Math.pow(1 - t, 4)

function frame(now: number) {
  if (!start) start = now
  const t = Math.min(1, (now - start) / DURATION)
  offset.value = ease(t) * stopIndex.value * TILE.value
  const tile = Math.floor(offset.value / TILE.value + 0.5)
  if (tile !== lastTile) {
    lastTile = tile
    sfx.tick()
  }
  if (t < 1) raf = requestAnimationFrame(frame)
  else land()
}

function land() {
  finished.value = true
  sfx.land()
  window.setTimeout(() => emit('done', props.target), 700)
}

onMounted(() => {
  if (reducedMotion.value) {
    offset.value = stopIndex.value * TILE.value
    land()
  } else raf = requestAnimationFrame(frame)
})
onBeforeUnmount(() => cancelAnimationFrame(raf))

const winner = computed(() => props.items.find((x) => x.id === props.target))
</script>

<template>
  <div class="reel-overlay" role="dialog" :aria-label="title">
    <div class="reel-box" :class="{ wide }">
      <h2>{{ title }}</h2>
      <div class="window" :style="{ '--tile': `${TILE}px` }">
        <div class="strip" :style="{ transform: `translateX(calc(-${offset}px - var(--tile) / 2))` }">
          <div
            v-for="(it, i) in strip"
            :key="i"
            class="tile"
            :class="{ hit: finished && i === stopIndex }"
          >
            <img :src="asset(it.image)" :alt="it.name" />
          </div>
        </div>
        <div class="marker" />
      </div>
      <p class="name" :class="{ show: finished }">{{ winner?.name }}</p>
    </div>
  </div>
</template>

<style scoped>
.reel-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  /* minmax(0, 1fr): the very long strip must not widen the column and push the box off screen */
  grid-template-columns: minmax(0, 1fr);
  place-items: center;
  padding: 1rem;
  background: radial-gradient(ellipse at center, rgb(30 4 6 / 0.85), rgb(0 0 0 / 0.95) 70%);
}
.reel-box {
  width: min(760px, 100%);
  min-width: 0;
  text-align: center;
}
.reel-box.wide {
  width: min(1000px, 100%);
}
.window {
  position: relative;
  overflow: hidden;
  padding: 14px 0;
  border-top: 1px solid var(--line-strong);
  border-bottom: 1px solid var(--line-strong);
  background: rgb(0 0 0 / 0.5);
  mask-image: linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent);
}
.strip {
  display: flex;
  width: max-content;
  /* start the strip at the window's centre (margin % is of the window, unlike translate %) */
  margin-left: 50%;
  will-change: transform;
}
.tile {
  width: var(--tile);
  padding: 0 6px;
  flex: none;
}
.tile img {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 6px;
  border: 2px solid var(--line-strong);
  background: #000;
}
.wide .tile img {
  aspect-ratio: 4 / 3;
}
.tile.hit img {
  border-color: var(--blood-bright);
  box-shadow: 0 0 22px rgb(255 40 40 / 0.7);
  animation: pulse 0.6s ease-out;
}
.marker {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 3px;
  transform: translateX(-50%);
  background: var(--blood-bright);
  box-shadow: 0 0 12px var(--blood-bright);
  opacity: 0.8;
}
.name {
  min-height: 2.4rem;
  margin: 0.9rem 0 0;
  font-family: var(--font-display);
  font-size: 1.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0;
  transform: scale(0.9);
  transition:
    opacity 0.25s,
    transform 0.25s;
}
.name.show {
  opacity: 1;
  transform: none;
  text-shadow: 0 0 18px rgb(255 40 40 / 0.6);
}
@keyframes pulse {
  from {
    transform: scale(1.12);
  }
}
</style>
