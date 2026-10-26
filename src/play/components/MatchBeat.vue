<script setup lang="ts">
// Everyone is ready and the killer started: the page stays as it is while the lobby alarm sounds
// with a heartbeat under it (`fxSound.heartbeat`), and the screen throbs red on every beat, the
// sound and the flash together. Clicks are held off meanwhile. When the clip is over (`done`) the loading page comes.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { fxSound } from '../fx/audio'

/**
 * `since`: when the beat began (the view's clock). If this is rebuilt in the middle of it — the
 * room's game mirror was replaced — it carries on from there instead of starting over.
 */
const props = defineProps<{ since: number }>()
const emit = defineEmits<{ done: [] }>()

/** The length of the alarm clip (match-ready.ogg). */
const MS = 4600
/** The heartbeat's pace: a racing one, as the killer's terror radius. */
const BPM = 96

const pulse = ref<HTMLElement | null>(null)
import { reducedMotion } from '../../settings'

let timer: number | undefined
let beatTimers: number[] = []
let beatLoop: number | undefined
/** One heartbeat: "lub" (a thump and the red flash from the edges), then a softer "dub" 0.2 s later. */
function thump() {
  const half = (strong: boolean) => {
    fxSound.heartbeat(strong)
    if (!reducedMotion.value) pulse.value?.animate([{ opacity: 0 }, { opacity: strong ? 1 : 0.6, offset: 0.2 }, { opacity: 0 }], { duration: 360, easing: 'ease-out' })
  }
  half(true)
  beatTimers.push(window.setTimeout(() => half(false), 200))
}

onMounted(() => {
  const elapsed = Math.max(0, Date.now() - props.since)
  // the alarm only if the beat is just beginning (a rebuild halfway through stays quiet)
  if (elapsed < 600) fxSound.matchReady()
  // the heartbeat, heard and seen
  thump()
  beatLoop = window.setInterval(thump, 60000 / BPM)
  timer = window.setTimeout(() => emit('done'), Math.max(0, MS - elapsed))
})
onBeforeUnmount(() => {
  clearInterval(beatLoop)
  clearTimeout(timer)
  beatTimers.forEach((t) => clearTimeout(t))
  beatTimers = []
})
</script>

<template>
  <Teleport to="body">
    <div class="beat" role="alert" aria-live="assertive">
      <div ref="pulse" class="pulse" aria-hidden="true" />
    </div>
  </Teleport>
</template>

<style scoped>
/* over the page as it is: a dark veil that keeps it in sight, and takes the clicks */
.beat {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  background: radial-gradient(ellipse at 50% 50%, rgb(10 2 3 / 0.25), rgb(10 2 3 / 0.7));
  animation: appear 0.3s ease-out both;
}
.pulse {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  background: radial-gradient(ellipse at 50% 50%, transparent 30%, rgb(255 30 20 / 0.45) 72%, rgb(255 20 10 / 0.85));
}
@keyframes appear {
  from {
    opacity: 0;
  }
}
</style>
