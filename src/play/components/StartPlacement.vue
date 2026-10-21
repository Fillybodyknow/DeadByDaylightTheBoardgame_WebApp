<script setup lang="ts">
// The start-room rolls (p.6 step 11), played on the game's own map: one mini at a time, a skill
// check die tumbles beside the map and lands on the face the engine already rolled, and the mini
// drops into its start room. The board hides the minis not placed yet (`fx.starts.shown`), and
// the side panel waits for the whole thing. A tap on "ข้าม" places everyone at once.
import { computed, onBeforeUnmount, watch } from 'vue'
import { skillFaceImage } from '../../data'
import { asset } from '../../i18n'
import { loading } from '../../loading'
import { sfx, startHeartbeat, stopHeartbeat } from '../../sound'
import { fx } from '../fx/bus'

const TUMBLE_MS = 1000
const LANDED_MS = 800
const FRAME_MS = 85

const starts = computed(() => fx.starts)
/** Waits for the loading screen, so the heartbeat and dice don't play behind it. */
const running = computed(() => !!fx.starts && !loading.active)
const current = computed(() => (fx.starts ? fx.starts.minis[fx.starts.shown] : undefined))

const shownFace = computed(() => (fx.starts ? fx.starts.face : 0))
const landed = computed(() => !!fx.starts?.landed)

const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
let timers: number[] = []
const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms))
function clearTimers() {
  timers.forEach((t) => clearTimeout(t))
  timers = []
}

function playMini() {
  const s = fx.starts
  const mini = s?.minis[s.shown]
  if (!s || !mini) return finish()
  s.landed = false
  startHeartbeat(mini.killer ? 130 : 70)
  const land = () => {
    s.face = mini.face
    s.landed = true
    sfx.land()
    later(220, sfx.drop)
    // the mini drops onto the map at the same moment the die settles
    s.shown++
    later(LANDED_MS, next)
  }
  if (reduceMotion) return land()
  const frames = Math.floor(TUMBLE_MS / FRAME_MS)
  for (let f = 0; f < frames; f++)
    later(f * FRAME_MS, () => {
      s.face = Math.floor(Math.random() * 6)
      if (f % 3 === 0) sfx.rattle()
    })
  later(TUMBLE_MS, land)
}

function next() {
  const s = fx.starts
  if (!s) return
  if (s.shown < s.minis.length) playMini()
  else finish()
}

/** Everyone is placed: a beat to look at the map, then the game goes on. */
function finish() {
  clearTimers()
  stopHeartbeat()
  const s = fx.starts
  if (!s) return
  s.shown = s.minis.length
  s.landed = true
  sfx.entity()
  later(700, () => (fx.starts = null))
}

watch(
  () => [running.value, fx.starts?.id] as const,
  ([on]) => {
    clearTimers()
    stopHeartbeat()
    if (on) playMini()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  clearTimers()
  stopHeartbeat()
})
</script>

<template>
  <transition name="start">
    <div v-if="running && starts && starts.shown <= starts.minis.length" class="start" role="status" aria-live="polite" aria-label="ทอยหาห้องเริ่มต้น">
      <header>
        <b>ทอยหาห้องเริ่มต้น</b>
        <button v-if="starts.shown < starts.minis.length" type="button" class="skip" @click="finish">ข้าม ⏭</button>
      </header>
      <div v-if="current && !landed" class="roller" :class="{ killer: current.killer }">
        <img class="who" :src="asset(current.image)" :alt="current.name" />
        <div class="who-text">
          <b>{{ current.name }}</b>
          <small>{{ current.player }}</small>
        </div>
        <img class="die" :src="asset(skillFaceImage(shownFace))" alt="" />
      </div>
      <div v-else-if="landed && starts.shown > 0" class="roller landed" :class="{ killer: starts.minis[starts.shown - 1].killer }">
        <img class="who" :src="asset(starts.minis[starts.shown - 1].image)" :alt="starts.minis[starts.shown - 1].name" />
        <div class="who-text">
          <b>{{ starts.minis[starts.shown - 1].name }}</b>
          <small>→ {{ starts.minis[starts.shown - 1].room }}</small>
        </div>
        <img class="die" :src="asset(skillFaceImage(starts.minis[starts.shown - 1].face))" alt="" />
      </div>
    </div>
  </transition>
</template>

<style scoped>
/* Where the side panel will be (it is empty meanwhile): the map stays in full view and takes the minis. */
.start {
  position: fixed;
  top: 0.9rem;
  right: 0.9rem;
  z-index: 36;
  display: grid;
  gap: 0.5rem;
  width: min(19rem, 92vw);
  padding: 0.6rem 0.9rem 0.7rem;
  border: 1px solid rgb(255 214 120 / 0.7);
  border-radius: 12px;
  background: linear-gradient(180deg, rgb(14 15 19 / 0.96), rgb(8 9 12 / 0.96));
  box-shadow: 0 0 30px rgb(255 214 120 / 0.25), 0 12px 30px rgb(0 0 0 / 0.7);
}
header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-family: var(--font-display);
  color: var(--warn);
}
.skip {
  margin-left: auto;
  padding: 0.1rem 0.6rem;
  font-size: 0.8rem;
}
.roller {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.who {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 0 0 2px rgb(255 255 255 / 0.8);
}
.roller.killer .who {
  box-shadow: 0 0 0 2px var(--blood-bright);
}
.who-text {
  display: grid;
  line-height: 1.25;
  min-width: 0;
  flex: 1;
}
.who-text small {
  color: var(--muted);
}
.roller.landed .who-text small {
  color: #fff;
  font-weight: 700;
}
.die {
  width: 56px;
  height: 56px;
  object-fit: contain;
}
.roller.landed .die {
  animation: land 0.35s cubic-bezier(0.2, 1.5, 0.4, 1) both;
}
@keyframes land {
  from {
    transform: scale(1.5);
  }
}
.start-enter-active,
.start-leave-active {
  transition: opacity 0.25s;
}
.start-enter-from,
.start-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .roller.landed .die {
    animation: none;
  }
}
</style>
