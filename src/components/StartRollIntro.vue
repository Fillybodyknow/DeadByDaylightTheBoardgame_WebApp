<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { skillFaceImage } from '../data'
import type { GameMap } from '../data/maps'
import { asset } from '../i18n'
import { sfx, startHeartbeat, stopHeartbeat } from '../sound'
import StartMap, { type PlacedMini } from './StartMap.vue'

// Game-start sequence (rulebook p.6 step 11): one mini at a time, a skill check die tumbles,
// lands on the face already rolled in the store, and the mini drops into that start room.
const props = defineProps<{
  map: GameMap
  minis: (PlacedMini & { player: string; room: string | undefined })[]
}>()
const emit = defineEmits<{ done: [] }>()

const TUMBLE_MS = 1000
const LANDED_MS = 650
const FRAME_MS = 85

const index = ref(0)
const phase = ref<'tumble' | 'landed' | 'finished'>('tumble')
const shownFace = ref(0)
const spin = ref(0)

const current = computed(() => props.minis[index.value])
const placed = computed(() =>
  phase.value === 'finished' ? props.minis : props.minis.slice(0, index.value + (phase.value === 'landed' ? 1 : 0)),
)

// Absolute URL: a relative url() inside a CSS variable resolves against the stylesheet
// (assets/), not the page, which breaks when the app is served from a sub-path.
const realm = computed(
  () => `url(${new URL(asset(`assets/app/background-img/background_${props.map.id}.webp`), document.baseURI).href})`,
)

const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
let timers: number[] = []
const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms))
function clearTimers() {
  timers.forEach((t) => clearTimeout(t))
  timers = []
}

function playMini() {
  const mini = current.value
  if (!mini) return finish()
  phase.value = 'tumble'
  // terror radius: the heart races while the Killer rolls
  startHeartbeat(mini.killer ? 130 : 70)
  if (reduceMotion) {
    shownFace.value = mini.face ?? 0
    phase.value = 'landed'
    return later(LANDED_MS, next)
  }
  // Flip through random faces, then settle on the rolled one.
  const frames = Math.floor(TUMBLE_MS / FRAME_MS)
  for (let f = 0; f < frames; f++)
    later(f * FRAME_MS, () => {
      shownFace.value = Math.floor(Math.random() * 6)
      spin.value += 70 + Math.random() * 60
      if (f % 3 === 0) sfx.rattle()
    })
  later(TUMBLE_MS, () => {
    shownFace.value = mini.face ?? 0
    spin.value = Math.round(spin.value / 360) * 360
    phase.value = 'landed'
    sfx.land()
    later(220, sfx.drop)
    later(LANDED_MS, next)
  })
}

function next() {
  if (index.value < props.minis.length - 1) {
    index.value++
    playMini()
  } else finish()
}

function finish() {
  clearTimers()
  stopHeartbeat()
  if (phase.value !== 'finished') sfx.entity()
  phase.value = 'finished'
}

onMounted(playMini)
onBeforeUnmount(() => {
  clearTimers()
  stopHeartbeat()
})
</script>

<template>
  <!-- The map is the stage: it takes most of the screen, the roll and results sit beside it. -->
  <div
    class="intro"
    role="dialog"
    aria-label="ทอยหาห้องเริ่มต้น"
    :style="{ '--realm': realm }"
  >
    <div class="panel">
      <header class="head">
        <h2>ทอยหาห้องเริ่มต้น</h2>
        <span class="mapname">{{ map.name }}</span>
        <button v-if="phase !== 'finished'" type="button" class="skip" @click="finish">ข้าม ⏭</button>
      </header>

      <div class="board">
        <StartMap :map="map" :minis="placed" :highlight-face="phase === 'landed' ? current?.face : undefined" animate />
      </div>

      <aside class="side">
        <div v-if="phase !== 'finished' && current" class="roller" :class="{ killer: current.killer }">
          <div class="who-row">
            <img class="who" :src="asset(current.image)" :alt="current.name" />
            <div class="who-text">
              <b>{{ current.name }}</b>
              <small class="muted">{{ current.player }}</small>
            </div>
          </div>
          <img
            class="die"
            :class="{ landed: phase === 'landed' }"
            :src="asset(skillFaceImage(shownFace))"
            :style="{ transform: `rotate(${spin}deg)` }"
            alt=""
          />
          <div class="result" :class="{ show: phase === 'landed' }">→ {{ current.room }}</div>
        </div>
        <div v-else class="roller done">
          <b>วางมินิครบทุกตัวแล้ว</b>
        </div>

        <ol class="summary">
          <li v-for="m in placed" :key="m.key" :class="{ killer: m.killer }">
            <img :src="asset(m.image)" alt="" />
            <span class="sname">{{ m.name }}</span>
            <img class="mini-die" :src="asset(skillFaceImage(m.face ?? 0))" alt="" />
            <b>{{ m.room }}</b>
          </li>
        </ol>

        <button type="button" class="primary go" :disabled="phase !== 'finished'" @click="emit('done')">เริ่มเล่น →</button>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.intro {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  justify-content: center;
  padding: 0.75rem;
  /* the realm of the chosen map, darkened; opaque so the page behind doesn't compete */
  background:
    radial-gradient(ellipse at center, rgb(5 5 5 / 0.55), rgb(5 5 5 / 0.92) 75%),
    var(--realm) center / cover no-repeat,
    #050505;
  overflow-y: auto;
}
.panel {
  /* centred when it fits, top-aligned and scrollable when it doesn't */
  margin: auto 0;
  width: 100%;
  max-width: 1600px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 290px;
  grid-template-areas:
    'head head'
    'board side';
  gap: 0.75rem 1rem;
  align-items: start;
}
.head {
  grid-area: head;
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
}
.head h2 {
  margin: 0;
}
.mapname {
  color: var(--warn);
  font-weight: 700;
  font-size: 1.1rem;
}
.skip {
  margin-left: auto;
}

/* ---- the map: as big as the screen allows, lit up ---- */
.board {
  grid-area: board;
  display: flex;
  justify-content: center;
}
.board :deep(.startmap) {
  /* maps are ~1.37:1; leave room for the heading above */
  max-width: calc((100dvh - 5.5rem) * 1.37);
  border-radius: 10px;
  box-shadow:
    0 0 0 2px rgb(217 162 39 / 0.85),
    0 0 40px rgb(217 162 39 / 0.35),
    0 20px 60px rgb(0 0 0 / 0.8);
}
.board :deep(.startmap .board) {
  border-radius: 10px;
}

/* ---- side column: current roll, results, start ---- */
.side {
  grid-area: side;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  position: sticky;
  top: 0;
}
.roller {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 0.9rem;
  border-radius: var(--radius);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  text-align: center;
}
.roller.killer {
  border-color: var(--blood-dim);
  background: linear-gradient(160deg, #2a1012, var(--bg-raised));
}
.roller.done {
  font-size: 1.1rem;
  padding: 1.2rem 0.9rem;
}
.who-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  align-self: stretch;
}
.who {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  object-fit: cover;
}
.who-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  font-size: 1.1rem;
  min-width: 0;
}
.die {
  width: 92px;
  height: 92px;
  border-radius: 12px;
  transition: transform 0.08s linear;
}
.die.landed {
  transition: transform 0.35s cubic-bezier(0.2, 1.6, 0.4, 1);
  box-shadow: 0 0 0 3px var(--warn), 0 0 22px rgb(217 162 39 / 0.7);
}
.result {
  min-height: 2rem;
  font-size: 1.35rem;
  font-weight: 800;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 0.25s, transform 0.25s;
}
.result.show {
  opacity: 1;
  transform: none;
}
.summary {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.summary li {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas: 'img name die' 'img room die';
  align-items: center;
  column-gap: 0.5rem;
  padding: 0.3rem 0.5rem 0.3rem 0.3rem;
  border-radius: 10px;
  background: var(--bg-raised);
  border: 1px solid var(--line);
  font-size: 0.9rem;
  line-height: 1.25;
}
.summary li.killer {
  border-color: var(--blood-dim);
}
.summary img:first-child {
  grid-area: img;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 50%;
  object-fit: cover;
}
.summary .sname {
  grid-area: name;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.summary b {
  grid-area: room;
  color: var(--warn);
}
.summary .mini-die {
  grid-area: die;
  width: 1.8rem;
  height: 1.8rem;
  border-radius: 4px;
}
.go {
  padding: 0.85rem;
  font-size: 1.15rem;
}

/* ---- narrow screens: map on top at full width, the rest below ---- */
@media (max-width: 900px) {
  .panel {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'head' 'board' 'side';
  }
  .board :deep(.startmap) {
    max-width: none;
  }
  .side {
    position: static;
  }
  .roller {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: space-between;
    text-align: left;
  }
  .who-row {
    align-self: center;
  }
  .die {
    width: 60px;
    height: 60px;
  }
  .result {
    flex-basis: 100%;
    font-size: 1.2rem;
  }
  .summary {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  }
}
</style>
