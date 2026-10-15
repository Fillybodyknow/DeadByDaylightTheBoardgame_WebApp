<script setup lang="ts">
// Rolls shown as the video game's skill check: a ring with a good zone and a small great zone,
// and a red needle sweeping round. The dice decide where it stops (the board game's rules
// don't change, and online everyone sees the same): a skull misses the zone, 1–4 lands in the
// good zone, a 5 in the great one. In the middle, what the survivor is working on; under it, the
// action's progress bar and the real dice. One roll at a time from the queue; a tap skips ahead.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { asset } from '../../i18n'
import { isFailure, isGreat, succeeded } from '../engine/engine'
import type { Die } from '../engine/types'
import { fxSound } from '../fx/audio'
import { fx, type SkillVerdict } from '../fx/bus'
import DiceRow from './DiceRow.vue'

// Waits while a perk card is showing: the perk usually explains the roll that follows.
const current = computed(() => (fx.perks.length ? null : (fx.dice[0] ?? null)))
const phase = ref<'warn' | 'sweep' | 'landed'>('warn')

const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const WARN_MS = reduceMotion ? 0 : 350
/** Needle speed, degrees per second (a full turn in ~1.1 s, like the game). */
const SPEED = 330
const HOLD_MS = 1600

const GOOD_DEG = 58
const GREAT_DEG = 11

interface Check {
  verdict: SkillVerdict
  /** Where the zone starts (degrees clockwise from the top). */
  zone: number
  /** Where the needle stops. */
  stop: number
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)

function verdictOf(d: Die, greatOnly: boolean): SkillVerdict {
  return isGreat(d) ? 'great' : succeeded(d) && (!greatOnly || d.asSuccess) ? 'good' : 'fail'
}

/** Lay out one ring: the zone somewhere in the lower half, the needle's stop from the die. */
function check(verdict: SkillVerdict, greatOnly: boolean): Check {
  const zone = rand(110, 250)
  const width = greatOnly ? GREAT_DEG : GOOD_DEG
  const stop =
    verdict === 'great'
      ? zone + rand(2, GREAT_DEG - 2)
      : verdict === 'good'
        ? zone + GREAT_DEG + rand(4, GOOD_DEG - GREAT_DEG - 4)
        : // a miss overshoots the zone, or stops short of it
          Math.random() < 0.7
          ? zone + width + rand(8, 40)
          : zone - rand(10, 45)
  return { verdict, zone, stop }
}

const checks = ref<Check[]>([])
const angle = ref<number[]>([])
const sweepMs = computed(() => (reduceMotion ? 0 : Math.max(...checks.value.map((c) => (c.stop / SPEED) * 1000), 0)))

let timers: number[] = []
function clear() {
  timers.forEach(clearTimeout)
  timers = []
}

watch(
  () => current.value?.id,
  () => {
    clear()
    const c = current.value
    if (!c) return
    const greatOnly = c.greatOnly ?? c.dice.every((d) => d.kind === 'danger')
    const verdicts = c.verdicts ?? c.dice.map((d) => verdictOf(d, greatOnly))
    checks.value = verdicts.map((v) => check(v, greatOnly))
    angle.value = checks.value.map(() => 0)
    phase.value = 'warn'
    fxSound.skillWarn()
    timers.push(
      window.setTimeout(() => {
        phase.value = 'sweep'
        angle.value = checks.value.map((k) => k.stop)
      }, WARN_MS),
      window.setTimeout(() => {
        phase.value = 'landed'
        if (c.tone === 'bad') fxSound.skillFail()
        else if (c.tone === 'great') fxSound.skillGreat()
        else fxSound.skillGood()
      }, WARN_MS + sweepMs.value),
      window.setTimeout(next, WARN_MS + sweepMs.value + HOLD_MS),
    )
  },
  { immediate: true },
)

function next() {
  clear()
  fx.dice.shift()
}

onBeforeUnmount(clear)

// ---------- ring geometry (viewBox centred on 0,0) ----------

const R = 70
function point(r: number, deg: number) {
  const a = (deg * Math.PI) / 180
  return `${(r * Math.sin(a)).toFixed(2)} ${(-r * Math.cos(a)).toFixed(2)}`
}
function arc(r: number, from: number, to: number) {
  return `M ${point(r, from)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${point(r, to)}`
}

const greatOnly = computed(() => current.value?.greatOnly ?? current.value?.dice.every((d) => d.kind === 'danger') ?? false)

/** Overall result of the roll, for the ring's colour after landing. */
const result = computed<SkillVerdict>(() => {
  const t = current.value?.tone
  return t === 'bad' ? 'fail' : t === 'great' ? 'great' : 'good'
})

const RESULT_TEXT: Record<SkillVerdict, string> = { great: 'GREAT SKILL CHECK', good: 'GOOD SKILL CHECK', fail: 'SKILL CHECK FAILED' }

const bar = computed(() => {
  const p = current.value?.progress
  if (!p) return null
  const v = phase.value === 'landed' ? p.after : p.before
  return { pct: (v / p.max) * 100, text: `${v}/${p.max}`, gained: phase.value === 'landed' && p.after > p.before }
})

const shownDice = computed(() => current.value?.dice ?? [])
const anyFail = computed(() => shownDice.value.some((d) => isFailure(d) && !d.asSuccess))
</script>

<template>
  <transition name="dice">
    <div v-if="current" class="skill-modal" :class="[phase, phase === 'landed' ? result : '']" role="status" @click="next">
      <p class="who">{{ current.title }}</p>

      <div class="rings" :class="{ many: checks.length > 2 }">
        <div v-for="(k, i) in checks" :key="`${current.id}-${i}`" class="ring" :class="[phase, phase === 'landed' ? k.verdict : '']">
          <svg viewBox="-100 -100 200 200" aria-hidden="true">
            <circle class="track" r="70" />
            <!-- good zone: hollow; great zone: solid, at the start of it -->
            <template v-if="!greatOnly">
              <path class="good-zone" :d="arc(R, k.zone + GREAT_DEG, k.zone + GOOD_DEG)" />
              <path class="good-zone-inner" :d="arc(R, k.zone + GREAT_DEG + 0.8, k.zone + GOOD_DEG - 0.8)" />
            </template>
            <path class="great-zone" :d="arc(R, k.zone, k.zone + GREAT_DEG)" />
            <g
              class="needle"
              :style="{
                transform: `rotate(${angle[i]}deg)`,
                transitionDuration: phase === 'sweep' ? `${(k.stop / SPEED) * 1000 * (reduceMotion ? 0 : 1)}ms` : '0ms',
              }"
            >
              <line x1="0" y1="-44" x2="0" y2="-84" />
            </g>
          </svg>
          <img v-if="current.icon" class="icon" :class="{ round: current.icon.round }" :src="asset(current.icon.src)" alt="" />
        </div>
      </div>

      <p class="result-text" :class="result">{{ phase === 'landed' ? RESULT_TEXT[result] : '' }}</p>

      <!-- the action, as in the game's HUD -->
      <div class="action">
        <span class="hand" aria-hidden="true">✋</span>
        <div class="action-body">
          <span class="action-label">{{ current.action ?? '' }}</span>
          <div v-if="bar" class="bar" :class="{ gained: bar.gained }">
            <span class="fill" :style="{ width: `${bar.pct}%` }" />
          </div>
        </div>
        <span v-if="bar" class="bar-text">{{ bar.text }}</span>
      </div>

      <div class="dice-line" :class="{ show: phase === 'landed' }">
        <DiceRow :dice="shownDice" />
        <span class="outcome" :class="[current.tone, { fail: anyFail }]">{{ current.outcome }}</span>
      </div>
      <p class="hint">แตะเพื่อข้าม</p>
    </div>
  </transition>
</template>

<style scoped>
.skill-modal {
  position: fixed;
  inset: 0;
  z-index: 35;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  /* the scene darkens around the check, a cold blue as in the game */
  background: radial-gradient(circle at 50% 42%, rgb(8 14 30 / 0.62), rgb(3 5 12 / 0.9) 60%);
  cursor: pointer;
  user-select: none;
}
.skill-modal.landed.fail {
  animation: red-flash 0.5s ease-out;
}
@keyframes red-flash {
  from {
    box-shadow: inset 0 0 160px 40px rgb(200 20 29 / 0.55);
  }
}
.who {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.85rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgb(255 255 255 / 0.6);
}

/* ---------- the ring ---------- */
.rings {
  display: flex;
  gap: 1.5rem;
}
.ring {
  position: relative;
  width: min(42vw, 210px);
  height: min(42vw, 210px);
  animation: ring-in 0.25s cubic-bezier(0.2, 1.6, 0.4, 1);
}
.ring svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}
/* what is being worked on, in the middle of the ring */
.icon {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 34%;
  height: 34%;
  transform: translate(-50%, -50%);
  object-fit: contain;
  border-radius: 6px;
  filter: drop-shadow(0 0 8px rgb(0 0 0 / 0.9));
  pointer-events: none;
}
.icon.round {
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 0 0 2px rgb(255 255 255 / 0.75);
}
.ring.landed.fail .icon {
  filter: drop-shadow(0 0 10px rgb(255 30 30 / 0.9)) saturate(0.6);
}
.ring.landed.great .icon {
  filter: drop-shadow(0 0 12px rgb(245 197 66 / 0.9));
}
.rings.many .ring {
  width: min(28vw, 150px);
  height: min(28vw, 150px);
}
@keyframes ring-in {
  from {
    transform: scale(0.6);
    opacity: 0;
  }
}
.track {
  fill: none;
  stroke: rgb(255 255 255 / 0.55);
  stroke-width: 1.6;
}
.good-zone {
  fill: none;
  stroke: rgb(255 255 255 / 0.95);
  stroke-width: 9;
}
.good-zone-inner {
  fill: none;
  stroke: rgb(6 9 18);
  stroke-width: 5.5;
}
.great-zone {
  fill: none;
  stroke: #fff;
  stroke-width: 9;
}
.needle {
  transition-property: transform;
  transition-timing-function: linear;
}
.needle line {
  stroke: #ff1e1e;
  stroke-width: 3.2;
  stroke-linecap: round;
  filter: drop-shadow(0 0 4px rgb(255 0 0 / 0.9));
}
/* landed: the zone lights up — gold for great, white for good, the ring burns red on a miss */
.ring.landed.great .great-zone {
  stroke: #f5c542;
  filter: drop-shadow(0 0 8px rgb(245 197 66 / 0.95));
}
.ring.landed.good .good-zone {
  filter: drop-shadow(0 0 6px rgb(255 255 255 / 0.9));
}
.ring.landed.fail .track,
.ring.landed.fail .good-zone,
.ring.landed.fail .great-zone {
  stroke: var(--blood-bright);
}
.ring.landed.fail {
  animation: shake 0.4s;
}
@keyframes shake {
  20% {
    transform: translateX(-7px);
  }
  40% {
    transform: translateX(6px);
  }
  60% {
    transform: translateX(-4px);
  }
  80% {
    transform: translateX(2px);
  }
}

.result-text {
  margin: 0;
  min-height: 1.4rem;
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.1em;
}
.result-text.great {
  color: #f5c542;
  text-shadow: 0 0 14px rgb(245 197 66 / 0.7);
}
.result-text.good {
  color: #f1efe9;
}
.result-text.fail {
  color: var(--blood-bright);
  text-shadow: 0 0 14px rgb(255 40 40 / 0.6);
}
.landed .result-text {
  animation: pop 0.35s cubic-bezier(0.2, 1.8, 0.4, 1);
}
@keyframes pop {
  from {
    transform: scale(0.5);
    opacity: 0;
  }
}

/* ---------- the action bar, like the game's HUD ---------- */
.action {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  margin-top: 0.75rem;
  min-width: min(320px, 86vw);
}
.hand {
  font-size: 2rem;
  line-height: 1;
  filter: grayscale(1) brightness(1.6) drop-shadow(0 0 4px rgb(0 0 0 / 0.8));
}
.action-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.action-label {
  font-family: var(--font-display);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgb(255 255 255 / 0.75);
}
.bar {
  position: relative;
  height: 13px;
  background: rgb(0 0 0 / 0.75);
  border: 1px solid rgb(255 255 255 / 0.12);
  clip-path: polygon(0 15%, 100% 0, 99% 100%, 1% 88%);
  overflow: hidden;
}
/* a worn, brushed fill */
.fill {
  position: absolute;
  inset: 0 auto 0 0;
  background:
    repeating-linear-gradient(90deg, rgb(0 0 0 / 0.18) 0 2px, transparent 2px 7px),
    linear-gradient(180deg, #d9d9d9, #8f8f8f 55%, #b4b4b4);
  transition: width 0.9s cubic-bezier(0.3, 0.8, 0.3, 1);
}
.bar.gained .fill {
  box-shadow: 0 0 12px rgb(255 255 255 / 0.7);
}
.bar-text {
  font-family: var(--font-display);
  font-size: 0.85rem;
  color: rgb(255 255 255 / 0.75);
}

/* ---------- the dice behind it ---------- */
.dice-line {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 2rem;
  opacity: 0;
  transition: opacity 0.25s;
}
.dice-line.show {
  opacity: 1;
}
.dice-line :deep(.die) {
  width: 30px;
  height: 30px;
}
.outcome {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
}
.outcome.great {
  color: #f5c542;
}
.outcome.good {
  color: #e9e6df;
}
.outcome.bad {
  color: var(--blood-bright);
}
.hint {
  margin: 0.25rem 0 0;
  font-size: 0.72rem;
  color: rgb(255 255 255 / 0.4);
}
.dice-enter-active,
.dice-leave-active {
  transition: opacity 0.2s;
}
.dice-enter-from,
.dice-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .ring,
  .ring.landed.fail,
  .skill-modal.landed.fail,
  .landed .result-text {
    animation: none;
  }
  .fill {
    transition: none;
  }
}
</style>
