<script setup lang="ts">
// The tutorial: the chapters to choose from (PC game style cards), or the chapter in play — the
// real game screen with The Entity's guide over it.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { asset } from '../../i18n'
import { sfx } from '../../sound'
import GameScreen from '../components/GameScreen.vue'
import { game, tutorial } from '../game'
import { CHAPTERS } from './chapters'
import GuideBox from './GuideBox.vue'
import { doneChapters, exitChapter, run, startChapter } from './runner'

const done = ref(doneChapters())

/** The side whose chapters are listed (remembered on this device). */
type Side = 'survivor' | 'killer'
const SIDE_KEY = 'dbdl-tutorial-side'
function storedSide(): Side {
  try {
    return localStorage.getItem(SIDE_KEY) === 'killer' ? 'killer' : 'survivor'
  } catch {
    return 'survivor'
  }
}
const side = ref<Side>(storedSide())
function pickSide(s: Side) {
  if (side.value === s) return
  sfx.click()
  side.value = s
  try {
    localStorage.setItem(SIDE_KEY, s)
  } catch {
    // storage blocked: the side just isn't remembered
  }
}
const chapters = computed(() => CHAPTERS.filter((c) => (c.side ?? 'survivor') === side.value))

function start(id: string) {
  sfx.select()
  startChapter(id)
}

function backToList() {
  done.value = doneChapters()
}

onBeforeUnmount(exitChapter)

// `?start=<chapter>` (The Entity's greeting): that chapter at once, its side's list behind it
const route = useRoute()
const router = useRouter()
onMounted(() => {
  const id = route.query.start
  const c = typeof id === 'string' ? CHAPTERS.find((x) => x.id === id) : undefined
  if (!c) return
  side.value = c.side ?? 'survivor'
  void router.replace({ query: {} })
  startChapter(c.id)
})
</script>

<template>
  <!-- one root element: the route transition animates it (it lays nothing out itself) -->
  <div class="tutorial-view" style="display: contents">
    <template v-if="run.chapter && tutorial && game">
      <GameScreen :key="run.scene" :st="game" />
      <GuideBox @list="backToList" />
    </template>

    <div v-else class="tutorial">
      <header class="head">
        <img :src="asset('assets/tokens/entity.webp')" alt="" />
        <div>
          <p class="eyebrow">Tutorial · {{ side === 'killer' ? 'ฝั่งฆาตกร' : 'ฝั่งผู้รอดชีวิต' }}</p>
          <h1>เรียนรู้ Trial</h1>
          <p class="muted">The Entity จะพาเล่นบนกระดานจริงทีละบท ตามกติกาใน Rulebook — เหมาะกับคนที่ไม่เคยเล่นบอร์ดเกมนี้มาก่อน</p>
        </div>
      </header>

      <div class="sides" role="tablist">
        <button type="button" role="tab" :aria-selected="side === 'survivor'" :class="{ on: side === 'survivor' }" @click="pickSide('survivor')">
          ผู้รอดชีวิต <small>{{ CHAPTERS.filter((c) => !c.side && done.includes(c.id)).length }}/{{ CHAPTERS.filter((c) => !c.side).length }}</small>
        </button>
        <button type="button" role="tab" :aria-selected="side === 'killer'" :class="{ on: side === 'killer' }" @click="pickSide('killer')">
          ฆาตกร <small>{{ CHAPTERS.filter((c) => c.side === 'killer' && done.includes(c.id)).length }}/{{ CHAPTERS.filter((c) => c.side === 'killer').length }}</small>
        </button>
      </div>

      <ol class="chapters">
        <li v-for="(c, i) in chapters" :key="c.id">
          <button type="button" class="chapter" :class="{ done: done.includes(c.id) }" @click="start(c.id)">
            <span class="art" :style="{ backgroundImage: `url(${asset(c.image)})` }" aria-hidden="true" />
            <span class="num">{{ i + 1 }}</span>
            <span class="text">
              <b>{{ c.title }}</b>
              <small>{{ c.blurb }}</small>
            </span>
            <span class="state">{{ done.includes(c.id) ? '✓ เรียนแล้ว' : 'เริ่มเรียน ▸' }}</span>
          </button>
        </li>
      </ol>
    </div>
  </div>
</template>

<style scoped>
.tutorial {
  display: grid;
  gap: 1.25rem;
  padding: 1rem 0 2rem;
}
.head {
  display: flex;
  gap: 1rem;
  align-items: center;
}
.head img {
  width: 72px;
  height: 72px;
  object-fit: contain;
  filter: drop-shadow(0 0 16px rgb(255 40 40 / 0.7));
}
.eyebrow {
  margin: 0;
  color: var(--blood-bright);
  letter-spacing: 0.14em;
  font-size: 0.8rem;
  text-transform: uppercase;
}
.head h1 {
  margin: 0.1rem 0 0.25rem;
  font-size: 2.2rem;
}
.head p {
  margin: 0;
}
.sides {
  display: flex;
  gap: 0.5rem;
}
.sides button {
  padding: 0.5rem 1.1rem;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  background: rgb(14 15 19 / 0.9);
  font-weight: 700;
}
.sides button small {
  margin-left: 0.3rem;
  color: var(--muted);
  font-weight: 400;
}
.sides button.on {
  border-color: var(--blood-bright);
  background: rgb(140 20 20 / 0.45);
}
.chapters {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.9rem;
}
.chapter {
  position: relative;
  width: 100%;
  min-height: 150px;
  display: grid;
  grid-template-rows: auto 1fr auto;
  align-items: end;
  gap: 0.35rem;
  padding: 0.9rem 1rem;
  overflow: hidden;
  text-align: left;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background: rgb(14 15 19 / 0.9);
}
.chapter .art {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  opacity: 0.22;
  transition:
    opacity 0.2s,
    scale 0.3s;
}
button.chapter:hover .art {
  opacity: 0.38;
  scale: 1.04;
}
button.chapter:hover {
  border-color: var(--blood-bright);
}
.num {
  position: relative;
  font-family: var(--font-display);
  font-size: 1.6rem;
  color: var(--blood-bright);
  line-height: 1;
}
.text {
  position: relative;
  display: grid;
  gap: 0.2rem;
}
.text b {
  font-size: 1.1rem;
}
.text small {
  color: var(--muted);
}
.state {
  position: relative;
  font-size: 0.82rem;
  color: #ffd56a;
}
.chapter.done {
  border-color: rgb(79 179 106 / 0.6);
}
.chapter.done .state {
  color: var(--ok);
}
</style>
