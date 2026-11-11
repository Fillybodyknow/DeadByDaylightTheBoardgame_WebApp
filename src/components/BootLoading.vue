<script setup lang="ts">
// The screen a visit opens on, as a PC game's launcher: the mark over the campfire's realm, a
// quote or a rules tip, and a bar that really fills — it counts the menu's own pictures in
// (`bootAssets`), and the app appears once they are all there and the screen has been up long
// enough to be read, or at a tap. It leaves by fading into the app behind it.
//
// It is the first thing on a visit, before The Entity greets a new player (App.vue waits for
// `booting`). Once it is gone, the shared pictures of a trial are warmed in the background
// (`warmShared`), which nothing waits for.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { bootAssets, bootLoaded, bootTotal, preloadImage } from '../boot'
import { asset } from '../i18n'
import { quoteOrTip } from '../loading'
import { APP_VERSION } from '../version'

const emit = defineEmits<{ done: [] }>()

/** Up at least this long (to be read), and waiting at most this long for a slow connection. */
const MIN_MS = 1100
const MAX_MS = 8000
/** How long it takes to fade out. */
const LEAVE_MS = 450

const slide = quoteOrTip([...Array(4)].map(() => null))
const assets = bootAssets()
bootTotal.value = assets.length
const progress = ref(0)

let timers: number[] = []
let finished = false
const leaving = ref(false)
function finish() {
  if (finished) return
  finished = true
  timers.forEach((t) => clearTimeout(t))
  leaving.value = true
  timers.push(window.setTimeout(() => emit('done'), LEAVE_MS))
}
onMounted(() => {
  const shown = new Promise<void>((r) => timers.push(window.setTimeout(r, MIN_MS)))
  const pictures = Promise.all(
    assets.map((a) =>
      preloadImage(a).then(() => {
        bootLoaded.value++
        progress.value = bootLoaded.value / Math.max(1, bootTotal.value)
      }),
    ),
  )
  // the text is drawn with Kanit; waiting for it keeps the menu from flashing in another face
  const fonts = document.fonts?.ready ?? Promise.resolve()
  void Promise.all([shown, pictures, fonts]).then(finish)
  timers.push(window.setTimeout(finish, MAX_MS))
})
onBeforeUnmount(() => timers.forEach((t) => clearTimeout(t)))
</script>

<template>
  <div class="boot" :class="{ leaving }" role="status" :style="{ '--leave': `${LEAVE_MS}ms` }" @click="finish">
    <div class="back" aria-hidden="true" :style="{ backgroundImage: `url(${asset('assets/app/background-img/background_lobby.webp')})` }" />
    <div class="shade" aria-hidden="true" />

    <header>
      <img class="mark" :src="asset('icon.svg')" alt="" draggable="false" />
      <h1>ดบดล</h1>
      <p class="eyebrow">Dead by Daylight: The Board Game</p>
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
      <small class="foot">กำลังเข้าสู่หมอก · v{{ APP_VERSION }}</small>
    </footer>
  </div>
</template>

<style scoped>
.boot {
  cursor: pointer;
  position: fixed;
  inset: 0;
  z-index: 95;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4vh;
  text-align: center;
  background: #06070a;
  transition: opacity var(--leave) ease;
}
.boot.leaving {
  opacity: 0;
  pointer-events: none;
}
.back {
  position: absolute;
  inset: -2%;
  background-size: cover;
  background-position: center;
  filter: saturate(0.7) brightness(0.45) blur(2px);
  animation: boot-drift 24s ease-in-out infinite alternate;
}
@keyframes boot-drift {
  to {
    transform: scale(1.07);
  }
}
.shade {
  position: absolute;
  inset: 0;
  background:
    var(--grain),
    radial-gradient(ellipse 90% 45% at 50% 112%, var(--entity), transparent 70%),
    radial-gradient(ellipse at center, transparent 35%, rgb(0 0 0 / 0.85) 100%);
  background-size: 160px 160px, auto, auto;
}

header,
footer {
  position: relative;
  z-index: 1;
}
header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  animation: boot-in 900ms ease both;
}
.mark {
  width: clamp(72px, 10vw, 128px);
  filter: drop-shadow(0 6px 26px rgb(0 0 0 / 0.8));
  animation: boot-breathe 6s ease-in-out infinite;
}
h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(2.2rem, 6vw, 3.6rem);
  letter-spacing: 0.06em;
  text-shadow: 0 2px 24px rgb(0 0 0 / 0.9);
}
.eyebrow {
  margin: 0;
  font-size: 0.78rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgb(255 255 255 / 0.45);
}
@keyframes boot-in {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
}
@keyframes boot-breathe {
  50% {
    transform: scale(1.04);
  }
}

footer {
  position: absolute;
  left: 50%;
  bottom: clamp(24px, 6vh, 64px);
  translate: -50% 0;
  width: min(620px, 86vw);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.slide {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  color: rgb(255 255 255 / 0.78);
  font-size: 0.92rem;
  line-height: 1.5;
  min-height: 3em;
}
.slide img {
  width: 44px;
  flex: none;
  filter: drop-shadow(0 3px 10px rgb(0 0 0 / 0.8));
}
.slide small {
  display: block;
  font-size: 0.68rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgb(255 255 255 / 0.38);
}
.slide cite {
  display: block;
  font-style: normal;
  color: rgb(245 197 66 / 0.8);
}
.bar {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: rgb(255 255 255 / 0.1);
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, rgb(179 38 46 / 0.9), rgb(245 197 66 / 0.9));
  transform-origin: left;
  transform: scaleX(0);
  transition: transform 260ms ease;
}
.foot {
  color: rgb(255 255 255 / 0.4);
  font-size: 0.72rem;
  letter-spacing: 0.1em;
}
</style>
