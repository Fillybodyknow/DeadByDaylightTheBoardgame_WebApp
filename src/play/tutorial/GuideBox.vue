<script setup lang="ts">
// The tutorial's guide: The Entity speaks, a step at a time, over the board. A step with something
// to do on the board says what (and the board is open); a step that only explains dims everything
// but what it talks about, and waits for "next". The box moves to the foot of the screen when the
// spot is under it.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { components } from '../../data'
import { asset } from '../../i18n'
import { fx } from '../fx/bus'
import { game } from '../game'
import { CHAPTERS } from './chapters'
import { answerQuiz, currentStep, exitChapter, nextStep, run, startChapter } from './runner'
import type { Spot } from './types'

const emit = defineEmits<{ list: [] }>()

const step = computed(() => currentStep())
/** The chapters of the side being learnt: numbered, and "next", within it. */
const side = computed(() => CHAPTERS.filter((c) => c.side === run.chapter?.side))
const chapterNo = computed(() => side.value.findIndex((c) => c.id === run.chapter?.id) + 1)
const nextChapter = computed(() => side.value[chapterNo.value] ?? null)

/** `**words**` lit, the rest plain. */
const parts = computed(() => (step.value?.say ?? '').split(/(\*\*[^*]+\*\*)/).map((t) => (t.startsWith('**') ? { b: true, t: t.slice(2, -2) } : { b: false, t })))

// ---------- the spot ----------

function selector(s: Spot): string | null {
  if (s.room) return `[data-room="${s.room}"]`
  if (s.prop) return `[data-prop="${s.prop}"]`
  if (s.path) return `[data-path="${s.path}"]`
  return s.el ?? null
}

const rect = ref<{ x: number; y: number; w: number; h: number } | null>(null)
const atFoot = ref(false)
const box = ref<HTMLElement | null>(null)

function measure() {
  const st = game.value
  const s = step.value?.spot
  const spot = s && st ? (typeof s === 'function' ? s(st) : s) : null
  const sel = spot ? selector(spot) : null
  const el = sel ? document.querySelector(sel) : null
  const r = el?.getBoundingClientRect()
  const next = r && r.width ? { x: Math.round(r.left - 6), y: Math.round(r.top - 6), w: Math.round(r.width + 12), h: Math.round(r.height + 12) } : null
  // only a real move redraws the spot
  if (JSON.stringify(next) !== JSON.stringify(rect.value)) rect.value = next
  // under the box: the box goes to the foot of the screen
  const b = box.value?.getBoundingClientRect()
  if (rect.value && b) atFoot.value = rect.value.y < (atFoot.value ? window.innerHeight * 0.35 : b.bottom + 8)
  else atFoot.value = false
}

let timer: number | undefined
onMounted(() => {
  measure()
  timer = window.setInterval(measure, 200)
})
onBeforeUnmount(() => clearInterval(timer))

/**
 * Dice, perk cards or the board still playing what just happened: the guide waits, so it never
 * talks about a result the screen hasn't shown yet.
 */
const busy = computed(() => fx.dice.length > 0 || fx.perks.length > 0 || fx.boardBusy || !!fx.finale)

/** Explaining (nothing to do on the board): the rest of the screen is dimmed. */
const dim = computed(() => !!step.value && !step.value.task && !run.finished && !busy.value)
const folded = ref(false)

function again() {
  if (run.chapter) startChapter(run.chapter.id)
}
function goNext() {
  if (nextChapter.value) startChapter(nextChapter.value.id)
}
function toList() {
  exitChapter()
  emit('list')
}
</script>

<template>
  <Teleport to="body">
    <!-- the spot: a ring round what is being talked about, the rest dimmed while explaining -->
    <template v-if="rect && !run.finished && !busy">
      <div class="spot" :style="{ left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` }" aria-hidden="true" />
      <!-- explaining: four dark panels round the spot (cheap to draw, unlike a screen-wide shadow) -->
      <template v-if="dim">
        <div class="veil" :style="{ top: 0, left: 0, right: 0, height: `${Math.max(0, rect.y)}px` }" aria-hidden="true" />
        <div class="veil" :style="{ top: `${rect.y + rect.h}px`, left: 0, right: 0, bottom: 0 }" aria-hidden="true" />
        <div class="veil" :style="{ top: `${rect.y}px`, left: 0, width: `${Math.max(0, rect.x)}px`, height: `${rect.h}px` }" aria-hidden="true" />
        <div class="veil" :style="{ top: `${rect.y}px`, left: `${rect.x + rect.w}px`, right: 0, height: `${rect.h}px` }" aria-hidden="true" />
      </template>
    </template>
    <div v-else-if="dim" class="veil whole" aria-hidden="true" />

    <section ref="box" class="guide" :class="{ foot: atFoot, folded, task: !!step?.task, finished: run.finished, busy }" aria-live="polite">
      <img class="entity" :src="asset(components.entity.image)" alt="" />
      <div class="body">
        <header class="head">
          <span class="who">THE ENTITY</span>
          <span class="where">บทที่ {{ chapterNo }} · {{ run.chapter?.title }}</span>
          <span v-if="!run.finished" class="count">{{ run.index + 1 }}/{{ run.chapter?.steps.length }}</span>
          <button type="button" class="fold" :title="folded ? 'ขยาย' : 'ย่อ'" @click="folded = !folded">{{ folded ? '▾' : '▴' }}</button>
        </header>

        <template v-if="!folded">
          <template v-if="run.finished">
            <p class="say">
              ✓ จบ<b>บทที่ {{ chapterNo }}</b> แล้ว — {{ nextChapter ? `บทต่อไปคือ "${nextChapter.title}"` : 'เจ้าเรียนครบทุกบทที่มีในตอนนี้แล้ว' }}
            </p>
            <div class="buttons">
              <button v-if="nextChapter" type="button" class="primary" @click="goNext">บทถัดไป ▸</button>
              <button type="button" @click="again">เล่นบทนี้อีกครั้ง</button>
              <button type="button" @click="toList">เลือกบท</button>
            </div>
          </template>
          <template v-else-if="step">
            <p class="say">
              <template v-for="(p, i) in parts" :key="i"
                ><b v-if="p.b">{{ p.t }}</b
                ><template v-else>{{ p.t }}</template></template
              >
            </p>
            <div v-if="step.pics?.length" class="pics">
              <img v-for="(src, i) in step.pics" :key="i" :src="asset(src)" alt="" />
            </div>
            <p v-if="step.task" class="todo">🎯 {{ step.task.hint }}</p>
            <!-- a question: one button per answer -->
            <div v-if="step.quiz" class="quiz">
              <button v-for="(o, i) in step.quiz.options" :key="i" type="button" @click="answerQuiz(i)">{{ o }}</button>
            </div>
            <p v-if="run.nudge" class="nudge">{{ run.nudge }}</p>
            <div class="buttons">
              <button v-if="!step.task && !step.quiz" type="button" class="primary" @click="nextStep">{{ run.index + 1 === run.chapter?.steps.length ? 'จบบท ✓' : 'ถัดไป ▸' }}</button>
              <button type="button" class="quiet" @click="toList">ออกจาก Tutorial</button>
            </div>
          </template>
        </template>
      </div>
    </section>
  </Teleport>
</template>

<style scoped>
.guide {
  position: fixed;
  z-index: 46;
  left: 50%;
  top: 12px;
  translate: -50% 0;
  width: min(640px, calc(100vw - 2rem));
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.8rem;
  padding: 0.85rem 1rem;
  border: 1px solid rgb(200 20 29 / 0.7);
  border-radius: 12px;
  background: radial-gradient(circle at 0 0, rgb(120 10 18 / 0.45), transparent 60%), rgb(10 8 10 / 0.95);
  box-shadow:
    0 12px 40px rgb(0 0 0 / 0.7),
    0 0 26px rgb(200 20 29 / 0.25);
  transition:
    top 0.25s ease,
    bottom 0.25s ease;
}
/* waiting for the screen to catch up: out of the way */
.guide.busy {
  opacity: 0;
  pointer-events: none;
}
.guide {
  transition:
    opacity 0.25s ease,
    top 0.25s ease,
    bottom 0.25s ease;
}
/* the chapter's end card: over the game's own end-of-game summary too */
.guide.finished {
  z-index: 90;
}
.quiz {
  display: grid;
  gap: 0.4rem;
}
.quiz button {
  text-align: left;
  padding: 0.5rem 0.75rem;
}
.quiz button:hover {
  border-color: #ffd56a;
}
.guide.foot {
  top: auto;
  bottom: 12px;
}
.guide.task {
  border-color: #ffd56a;
  box-shadow:
    0 12px 40px rgb(0 0 0 / 0.7),
    0 0 26px rgb(255 200 90 / 0.25);
}
.entity {
  width: 56px;
  height: 56px;
  object-fit: contain;
  filter: drop-shadow(0 0 12px rgb(255 40 40 / 0.6));
  animation: breathe 3s ease-in-out infinite;
}
@keyframes breathe {
  50% {
    filter: drop-shadow(0 0 20px rgb(255 40 40 / 0.9));
    scale: 1.05;
  }
}
.body {
  display: grid;
  gap: 0.5rem;
  min-width: 0;
}
.head {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  font-size: 0.78rem;
}
.who {
  color: var(--blood-bright);
  font-family: var(--font-display);
  letter-spacing: 0.18em;
  font-weight: 700;
}
.where {
  color: var(--muted);
  flex: 1;
}
.count {
  color: var(--muted);
}
.fold {
  padding: 0 0.45rem;
  font-size: 0.8rem;
}
.say {
  margin: 0;
  font-size: 1.02rem;
  line-height: 1.6;
}
.say b {
  color: #ffd56a;
  font-weight: 700;
}
.pics {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.pics img {
  height: 54px;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.6);
}
.todo {
  margin: 0;
  padding: 0.4rem 0.6rem;
  border-radius: 8px;
  background: rgb(255 213 106 / 0.12);
  color: #ffe9b0;
  font-weight: 700;
}
.nudge {
  margin: 0;
  color: #ff8a80;
  font-size: 0.85rem;
  animation: shake 0.35s;
}
@keyframes shake {
  25% {
    translate: -4px 0;
  }
  75% {
    translate: 4px 0;
  }
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.quiet {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--muted);
  font-size: 0.8rem;
  text-decoration: underline;
}
/* the spot: a ring that breathes; explaining, the rest of the screen dimmed round it */
.spot {
  position: fixed;
  z-index: 44;
  border: 3px solid #ffd56a;
  border-radius: 12px;
  box-shadow: 0 0 22px rgb(255 200 90 / 0.8);
  pointer-events: none;
  transition:
    left 0.2s,
    top 0.2s,
    width 0.2s,
    height 0.2s;
  animation: ring 1.4s ease-in-out infinite;
}
@keyframes ring {
  50% {
    border-color: #fff4cc;
  }
}
.veil {
  position: fixed;
}
.veil.whole {
  inset: 0;
}
.veil {
  z-index: 44;
  background: rgb(0 0 0 / 0.45);
  pointer-events: none;
}
</style>
