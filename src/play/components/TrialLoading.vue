<script setup lang="ts">
// The loading page between the match-ready beat and the trial: the two sides fill the screen as
// its background — the killer, a gap with VS in it, then the four survivors, each the portrait
// strip cut from their character board and scaled to cover its share of the width — with a
// survivor's quote or a rules tip and a loading bar. The bar is real: it fills as the pictures the
// game will show are fetched (`gameAssets`), and the game opens once they all are and the page has
// been up a moment (`done`), or at a tap. The Bloodweb's refresh sounds as it opens.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { killerById, survivorById } from '../../data'
import { asset, cssUrl } from '../../i18n'
import { quoteOrTip } from '../../loading'
import { boards } from '../engine/boards'
import type { GameState } from '../engine/types'
import { fxSound } from '../fx/audio'
import { gameAssets, preload } from '../intro'

const props = defineProps<{ st: GameState }>()
const emit = defineEmits<{ done: [] }>()

/** The page shows at least this long (to be read), and waits at most this long for slow pictures. */
const MIN_MS = 2600
const MAX_MS = 20000

const slide = quoteOrTip(props.st.survivors.map((s) => s.characterId))

/** A side's portrait: the character's board (its left strip is shown), and the name for its foot. */
interface Fighter {
  key: string
  name: string
  /** CSS url() of the board. */
  board: string
  killer: boolean
}
/** The boards' shapes (width / height): a killer's is 2400×1833, a survivor's 2400×1615. */
const RATIO = { killer: '2400 / 1833', survivor: '2400 / 1615' }
const fighters = computed<Fighter[]>(() => {
  const k = killerById.get(props.st.killer.characterId)
  const list: Fighter[] = [
    { key: 'k', name: props.st.killer.name, board: cssUrl(k?.images.boardTh ?? k?.images.boardEn ?? ''), killer: true },
  ]
  props.st.survivors.forEach((sv, i) => {
    const c = survivorById.get(sv.characterId)
    list.push({ key: `s${i}`, name: sv.name, board: cssUrl(c?.images.boardTh ?? c?.images.boardEn ?? ''), killer: false })
  })
  return list
})

const assets = gameAssets(props.st)
const loaded = ref(0)
const progress = computed(() => (assets.length ? loaded.value / assets.length : 1))

let timers: number[] = []
let finished = false
/** How long the page takes to leave: the portraits rush in and go dark, then the game opens. */
const LEAVE_MS = 650
const leaving = ref(false)
function finish() {
  if (finished) return
  finished = true
  timers.forEach((t) => clearTimeout(t))
  leaving.value = true
  fxSound.whoosh()
  timers.push(window.setTimeout(() => emit('done'), LEAVE_MS))
}
onMounted(() => {
  fxSound.bwRefresh()
  const shown = new Promise<void>((r) => timers.push(window.setTimeout(r, MIN_MS)))
  const all = Promise.all(assets.map((a) => preload(a).then(() => void loaded.value++)))
  void Promise.all([shown, all]).then(finish)
  timers.push(window.setTimeout(finish, MAX_MS))
})
onBeforeUnmount(() => timers.forEach((t) => clearTimeout(t)))
</script>

<template>
  <div class="ready" :class="{ leaving }" role="status" :style="{ '--leave': `${LEAVE_MS}ms` }" @click="finish">
    <!-- the two sides, edge to edge -->
    <div class="lineup">
      <template v-for="(f, i) in fighters" :key="f.key">
        <span v-if="i === 1" class="vs" aria-hidden="true">VS</span>
        <figure class="fighter" :class="f.killer ? 'killer' : 'survivor'" :style="{ '--i': i, '--img': f.board, '--ar': f.killer ? RATIO.killer : RATIO.survivor }">
          <span class="art" />
          <figcaption>{{ f.name }}</figcaption>
        </figure>
      </template>
    </div>
    <div class="shade" aria-hidden="true" />

    <header>
      <p class="eyebrow">กำลังเข้าสู่ Trial</p>
      <h1>{{ boards[props.st.board]?.name }}</h1>
    </header>

    <footer>
      <blockquote class="slide" :class="slide.kind">
        <img v-if="slide.image" :src="asset(slide.image)" alt="" draggable="false" />
        <span>
          <small>{{ slide.kind === 'quote' ? 'คำพูดจากในหมอก' : 'เคล็ดลับ' }}</small>
          {{ slide.text }}
          <cite v-if="slide.by">— {{ slide.by }}</cite>
        </span>
      </blockquote>
      <div class="bar" role="progressbar" :aria-valuenow="Math.round(progress * 100)" aria-valuemin="0" aria-valuemax="100">
        <i :style="{ transform: `scaleX(${progress})` }" />
      </div>
      <small class="skip">โหลด {{ loaded }}/{{ assets.length }} · แตะเพื่อข้าม</small>
    </footer>
  </div>
</template>

<style scoped>
.ready {
  cursor: pointer;
  position: fixed;
  inset: 0;
  z-index: 90;
  overflow: hidden;
  text-align: center;
  background: #050304;
  animation: appear 0.35s ease-out both;
}
/* the sides share the width as their portraits do (a killer's strip is 0.334 of its height wide, a
   survivor's 0.421), and each is scaled to cover its share: more of the portrait shows on a
   screen that is nearer to their shape */
.lineup {
  position: absolute;
  inset: 0;
  display: flex;
}
.fighter {
  position: relative;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  animation: rise 0.8s cubic-bezier(0.2, 1.05, 0.4, 1) both;
  animation-delay: calc(0.1s + var(--i) * 0.12s);
}
/* the killer a little wider than a survivor: the side of one against four */
.fighter.killer {
  flex: 0.5 1 0;
}
.fighter.survivor {
  flex: 0.421 1 0;
}
/* the board's left strip, scaled to cover the box: a box in the board's own shape (aspect-ratio)
   that is at least as wide as the box needs to show 25.5% of the board, and at least as tall as
   the box (the min sizes pass through the ratio, so the larger of the two wins); a survivor's lower
   tenth — the "ITEM CARD" label — is left below the box */
.fighter .art {
  position: absolute;
  left: 0;
  top: 0;
  aspect-ratio: var(--ar);
  min-width: calc(100% / 0.255);
  min-height: 100%;
  background: var(--img) 0 0 / 100% 100% no-repeat;
}
.fighter.survivor .art {
  min-height: 111.11%;
}
/* a thin line between the portraits, and the side's own colour at the foot */
.fighter + .fighter {
  box-shadow: inset 2px 0 0 rgb(0 0 0 / 0.7);
}
.fighter.killer::after,
.fighter.survivor::after {
  content: '';
  position: absolute;
  inset: auto 0 0 0;
  height: 0.35rem;
  background: var(--blood-bright);
  box-shadow: 0 0 22px rgb(255 59 48 / 0.9);
}
.fighter.survivor::after {
  background: #ffe9b0;
  box-shadow: 0 0 22px rgb(255 214 120 / 0.8);
}
.fighter figcaption {
  z-index: 2;
  position: absolute;
  /* above the quote and the bar at the foot */
  inset: auto 0 9.5rem 0;
  color: #fff;
  font-family: var(--font-display);
  font-size: clamp(0.85rem, 1.6vw, 1.2rem);
  letter-spacing: 0.05em;
  text-shadow: 0 2px 8px #000;
}
/* the gap between the sides, with VS in it */
.vs {
  position: relative;
  z-index: 3;
  flex: none;
  align-self: center;
  width: clamp(4.5rem, 9vw, 10rem);
  text-align: center;
  white-space: nowrap;
  color: #fff;
  font-family: var(--font-display);
  font-size: clamp(2.4rem, 6vw, 5rem);
  text-shadow:
    0 0 12px rgb(255 59 48 / 1),
    0 0 40px rgb(255 59 48 / 0.9),
    0 4px 12px #000;
  animation: slam 0.6s cubic-bezier(0.2, 1.35, 0.4, 1) 0.3s both;
}
/* dark at the top (under the title) and round the edges; the foot's own is each portrait's ::before,
   under its name */
.shade {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(180deg, rgb(4 2 3 / 0.85), transparent 26%),
    radial-gradient(ellipse at 50% 50%, transparent 55%, rgb(4 2 3 / 0.55));
}
.fighter::before {
  content: '';
  position: absolute;
  inset: auto 0 0 0;
  height: 38%;
  z-index: 1;
  background: linear-gradient(180deg, transparent, rgb(4 2 3 / 0.92));
}
header {
  position: absolute;
  inset: 1.4rem 0 auto 0;
}
.eyebrow {
  margin: 0;
  color: var(--blood-bright);
  font-family: var(--font-display);
  letter-spacing: 0.3em;
  text-shadow: 0 2px 8px #000;
  text-transform: uppercase;
}
h1 {
  margin: 0;
  font-size: clamp(2rem, 5vw, 3.4rem);
  color: #fff;
  text-shadow:
    0 0 30px rgb(255 59 48 / 0.8),
    0 3px 10px #000;
  animation: slam 0.6s cubic-bezier(0.2, 1.35, 0.4, 1) both;
}
footer {
  position: absolute;
  inset: auto 0 1.1rem 0;
  display: grid;
  justify-items: center;
  gap: 0.35rem;
}
h1 {
  color: var(--warn);
}
.slide {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  max-width: min(36rem, 88vw);
  margin: 0;
  padding: 0.6rem 1rem;
  border-radius: 10px;
  background: rgb(6 3 4 / 0.7);
  text-align: left;
  color: var(--text);
  font-size: 0.98rem;
}
.slide img {
  flex: none;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  object-fit: cover;
}
.slide small {
  display: block;
  color: var(--blood-bright);
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.slide cite {
  display: block;
  margin-top: 0.15rem;
  color: var(--muted);
  font-style: normal;
}
/* the loading bar */
.bar {
  width: min(30rem, 80vw);
  height: 5px;
  border-radius: 3px;
  overflow: hidden;
  background: rgb(255 255 255 / 0.18);
}
.bar i {
  display: block;
  height: 100%;
  background: var(--blood-bright);
  box-shadow: 0 0 10px rgb(255 59 48 / 0.9);
  transform-origin: left;
  transition: transform 0.25s ease-out;
}
.skip {
  color: var(--muted);
  font-size: 0.75rem;
}
/* leaving: the portraits rush forward and darken, the words go, all into black */
.ready.leaving {
  cursor: default;
}
.ready.leaving .lineup {
  transition:
    transform var(--leave) cubic-bezier(0.6, 0, 0.8, 0.4),
    filter var(--leave) ease-in,
    opacity var(--leave) ease-in;
  transform: scale(1.18);
  filter: brightness(0.2) blur(2px);
  opacity: 0;
}
.ready.leaving header,
.ready.leaving footer,
.ready.leaving .vs {
  transition: opacity calc(var(--leave) * 0.5) ease-in;
  opacity: 0;
}
@media (max-height: 640px) {
  .slide {
    display: none;
  }
}
@keyframes appear {
  from {
    opacity: 0;
  }
}
@keyframes slam {
  from {
    transform: scale(1.6);
    opacity: 0;
  }
}
@keyframes rise {
  from {
    transform: translateY(2.5rem);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  h1,
  .fighter,
  .vs {
    animation: none;
  }
}
</style>
