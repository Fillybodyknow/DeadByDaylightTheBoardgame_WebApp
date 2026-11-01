<script setup lang="ts">
// The game's opening, before the minis come in: the offerings burnt for it (p.19), as the PC game
// burns them at the start of a trial. The cards are dealt into a row one at a time, stay a moment
// to be read, then all burn together like paper, each from one of its corners (`burnPaper`), embers
// rising, and the screen opens
// on the map. A click (or "ข้าม") ends it at once. Played once per game (`OFFERINGS_SEEN`).
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { offerings as OFFERING_CARDS } from '../../data'
import { asset, lang } from '../../i18n'
import { anim, reducedMotion } from '../../settings'
import { fxSound } from '../fx/audio'
import { fx } from '../fx/bus'
import { burnPaper } from '../fx/paperBurn'
import { OFFERING_SIDE, offeringName } from '../engine/offerings'

const DEAL_MS = 450
const HOLD_MS = 1900
/** As `.oc.burning`'s animation. */
const BURN_MS = 2400
/** The corner each card catches fire at, in turn ([x, y] fractions: bottom-left first). */
const CORNERS: [number, number][] = [
  [0, 1],
  [1, 1],
  [1, 0],
  [0, 0],
]
const END_MS = 600

const cards = computed(() =>
  (fx.offerings?.list ?? []).map((id) => {
    const c = OFFERING_CARDS.find((x) => x.id === id)!
    return { id, side: OFFERING_SIDE[id], name: offeringName(id), image: (lang.value === 'th' ? c.image.th : c.image.en) ?? c.image.en }
  }),
)
/** Cards dealt so far, the cards alight, and the whole thing fading out. */
const dealt = ref(0)
const burning = ref(false)
const leaving = ref(false)
/** Each card's picture and the canvas it burns on; cards whose picture can't be read just fade. */
const pictures: HTMLImageElement[] = []
const papers: HTMLCanvasElement[] = []
const faded = ref<number[]>([])
let stops: (() => void)[] = []

function ignite() {
  const ms = anim(BURN_MS)
  cards.value.forEach((_, i) => {
    const img = pictures[i]
    const paper = papers[i]
    const stop = img && paper ? burnPaper(img, paper, CORNERS[i % CORNERS.length], ms, i + 1) : false
    if (stop) stops.push(stop)
    else faded.value = [...faded.value, i]
  })
}

/** Embers per card: where they rise from, when, how far they drift. */
const EMBERS = Array.from({ length: 18 }, (_, i) => ({
  left: `${6 + ((i * 37) % 88)}%`,
  bottom: `${10 + ((i * 53) % 70)}%`,
  delay: `${(i * 0.11) % 1.6}s`,
  drift: `${((i * 23) % 40) - 20}px`,
}))

let timers: number[] = []
const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, anim(ms)))
function clearTimers() {
  timers.forEach((t) => clearTimeout(t))
  timers = []
  stops.forEach((stop) => stop())
  stops = []
}

function play() {
  const n = cards.value.length
  dealt.value = 0
  burning.value = false
  faded.value = []
  leaving.value = false
  if (reducedMotion.value) {
    dealt.value = n
    return later(HOLD_MS + 600, finish)
  }
  for (let i = 0; i < n; i++)
    later(250 + i * DEAL_MS, () => {
      dealt.value = i + 1
      fxSound.equip()
    })
  const burnAt = 250 + n * DEAL_MS + HOLD_MS
  later(burnAt, () => {
    burning.value = true
    ignite()
    fxSound.cleanse()
  })
  later(burnAt + BURN_MS, finish)
}

function finish() {
  if (leaving.value || !fx.offerings) return
  timers.forEach((t) => clearTimeout(t))
  timers = []
  leaving.value = true
  later(END_MS, () => {
    clearTimers()
    fx.offerings = null
    leaving.value = false
  })
}

watch(
  () => fx.offerings?.id,
  (id) => {
    clearTimers()
    if (id) play()
  },
  { immediate: true },
)
onBeforeUnmount(clearTimers)
</script>

<template>
  <Teleport to="body">
    <div v-if="fx.offerings" class="burn" :class="{ leaving, still: reducedMotion }" role="status" aria-live="polite" aria-label="เผา Offering" @click="finish">
      <header>
        <small>ก่อนเริ่ม Trial</small>
        <h2>เผา Offering</h2>
      </header>
      <div class="row">
        <div
          v-for="(c, i) in cards"
          :key="c.id"
          class="oc"
          :class="[c.side, { dealt: i < dealt, burning, faded: faded.includes(i) }]"
        >
          <div class="face">
            <img :ref="(el) => (pictures[i] = el as HTMLImageElement)" :src="asset(c.image)" :alt="c.name" />
            <canvas :ref="(el) => (papers[i] = el as HTMLCanvasElement)" class="paper" />
          </div>
          <span v-if="burning" class="embers" aria-hidden="true">
            <i v-for="(e, k) in EMBERS" :key="k" :style="{ left: e.left, bottom: e.bottom, animationDelay: e.delay, '--drift': e.drift }" />
          </span>
          <b>{{ c.name }}</b>
          <small>{{ c.side === 'killer' ? 'Killer' : 'Survivor' }}</small>
        </div>
      </div>
      <button type="button" class="skip" @click.stop="finish">ข้าม ⏭</button>
    </div>
  </Teleport>
</template>

<style scoped>
.burn {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.6rem;
  padding: 1rem;
  background: radial-gradient(ellipse at center, rgb(40 6 6 / 0.82), rgb(0 0 0 / 0.94) 70%);
  animation: burn-in 0.5s ease-out both;
  cursor: pointer;
}
.burn.leaving {
  animation: burn-out 0.6s ease-in forwards;
}
@keyframes burn-in {
  from {
    opacity: 0;
  }
}
@keyframes burn-out {
  to {
    opacity: 0;
  }
}
header {
  text-align: center;
}
header small {
  color: var(--muted);
  letter-spacing: 0.2em;
}
header h2 {
  margin: 0.1rem 0 0;
  font-family: var(--font-display);
  font-size: clamp(1.6rem, 3vw, 2.4rem);
  color: #ffd27a;
  text-shadow: 0 0 18px rgb(255 140 40 / 0.6);
}
.row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: clamp(1rem, 2.5vw, 2.2rem);
}
.oc {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  /* as big as the screen allows: at most two cards (one side's two, or one each); a card is ~2:3 */
  width: min(340px, 34vw, calc((100vh - 250px) * 0.66));
  opacity: 0;
  transform: translateY(40px) scale(0.85);
}
.oc.dealt {
  animation: deal 0.5s cubic-bezier(0.2, 1.3, 0.4, 1) forwards;
}
@keyframes deal {
  to {
    opacity: 1;
    transform: none;
  }
}
.face {
  position: relative;
  width: 100%;
  border-radius: 8px;
  box-shadow: 0 0 26px rgb(170 90 255 / 0.35), 0 12px 26px rgb(0 0 0 / 0.7);
}
.oc.killer .face {
  box-shadow: 0 0 26px rgb(255 50 50 / 0.35), 0 12px 26px rgb(0 0 0 / 0.7);
}
.face img {
  display: block;
  width: 100%;
  border-radius: 8px;
}
/* Burning: the picture gives way to its canvas, where the fire eats it (paperBurn.ts); the glow
   follows the burnt edge. A card whose picture can't be read fades instead. */
.paper {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: 8px;
  visibility: hidden;
  pointer-events: none;
}
.oc.burning:not(.faded) .paper {
  visibility: visible;
  filter: drop-shadow(0 0 5px rgb(255 120 30 / 0.75));
}
.oc.burning:not(.faded) .face {
  box-shadow: none;
}
.oc.burning:not(.faded) img {
  visibility: hidden;
}
.oc.faded .face {
  transition: opacity 2s;
  opacity: 0;
}
.oc b {
  font-size: 1.3rem;
  color: #f2efe6;
  text-align: center;
  transition: opacity 0.6s 1s;
}
.oc small {
  color: var(--muted);
  transition: opacity 0.6s 1s;
}
.oc.burning b,
.oc.burning small {
  opacity: 0.25;
}
.embers {
  position: absolute;
  inset: 0 0 auto;
  height: 100%;
  pointer-events: none;
}
.embers i {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #ffb347;
  box-shadow: 0 0 6px 2px rgb(255 120 30 / 0.8);
  opacity: 0;
  animation: ember 1.6s ease-out infinite;
}
@keyframes ember {
  0% {
    opacity: 0;
    transform: translate(0, 0) scale(1);
  }
  15% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(var(--drift), -160px) scale(0.3);
  }
}
.skip {
  position: absolute;
  right: 1.2rem;
  bottom: 1.2rem;
  padding: 0.3rem 0.9rem;
  font-size: 0.85rem;
}
/* reduced motion (the device's or the setting, `reducedMotion`): the cards just show, none burn */
.still .oc {
  opacity: 1;
  transform: none;
  animation: none;
}
</style>
