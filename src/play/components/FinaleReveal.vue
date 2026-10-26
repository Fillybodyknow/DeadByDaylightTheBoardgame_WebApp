<script setup lang="ts">
// The game's last beat, shown before the summary: the killer's Sacrifice track filling up, or the
// exit gate swinging open. It waits for every card, roll and board animation queued before it
// (the hook or the gate's last roll), and the screen holds the old state until it is done.
// A tap skips ahead.
import { computed, onBeforeUnmount, watch } from 'vue'
import { sfx } from '../../sound'
import { asset } from '../../i18n'
import { SACRIFICE_TO_WIN } from '../engine/engine'
import type { GameState } from '../engine/types'
import { fx } from '../fx/bus'
import { PROP_IMAGE } from '../labels'

const props = defineProps<{ st: GameState }>()

/** Only once everything queued before it has been shown. */
const current = computed(() => (fx.finale && !fx.perks.length && !fx.dice.length && !fx.boardBusy ? fx.finale : null))
const killerWon = computed(() => current.value?.winner === 'killer')
const pips = computed(() => Array.from({ length: SACRIFICE_TO_WIN }, (_, i) => i))
const gateImage = PROP_IMAGE.exitGate

import { anim, reducedMotion } from '../../settings'

let timer: number | undefined
watch(
  () => current.value?.id,
  (id) => {
    clearTimeout(timer)
    const f = current.value
    if (id === undefined || !f) return
    if (f.winner === 'survivors') sfx.escape()
    else sfx.sacrifice()
    timer = window.setTimeout(done, anim(reducedMotion.value ? 2200 : 3600))
  },
  { immediate: true },
)

function done() {
  clearTimeout(timer)
  fx.finale = null
}
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <transition name="finale">
    <div v-if="current" :key="current.id" class="finale" :class="killerWon ? 'killer' : 'survivors'" role="status" aria-live="assertive" @click="done">
      <div class="panel">
        <span class="label">{{ killerWon ? 'Sacrifice' : 'Exit Gate' }}</span>
        <template v-if="killerWon">
          <div class="pips" aria-hidden="true">
            <span v-for="i in pips" :key="i" class="pip" :style="{ animationDelay: `${0.25 + i * 0.22}s` }" />
          </div>
          <h2>Sacrifice ครบ {{ SACRIFICE_TO_WIN }}</h2>
          <p>{{ props.st.killer.name }} สังเวยผู้รอดชีวิตครบแล้ว — ฆาตกรชนะ</p>
        </template>
        <template v-else>
          <div class="gate" aria-hidden="true">
            <img v-if="gateImage" :src="asset(gateImage)" alt="" />
            <span class="leaf l" />
            <span class="leaf r" />
          </div>
          <h2>ประตูทางออกเปิดแล้ว</h2>
          <p>ผู้รอดชีวิตหนีรอด — ผู้รอดชีวิตชนะ</p>
        </template>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.finale {
  --glow: 255 60 60;
  position: fixed;
  inset: 0;
  z-index: 39;
  display: grid;
  place-items: center;
  cursor: pointer;
  background: radial-gradient(circle at 50% 45%, rgb(8 4 4 / 0.7), rgb(2 2 3 / 0.9) 72%);
}
.finale.survivors {
  --glow: 255 214 120;
}
.panel {
  display: grid;
  justify-items: center;
  gap: 0.8rem;
  min-width: min(28rem, 90vw);
  padding: 1.6rem 2.2rem 1.7rem;
  border: 1px solid rgb(var(--glow) / 0.75);
  border-radius: 16px;
  background: linear-gradient(180deg, rgb(14 15 19 / 0.97), rgb(8 9 12 / 0.97));
  box-shadow:
    0 0 0 1px rgb(0 0 0 / 0.6),
    0 0 70px rgb(var(--glow) / 0.45),
    0 24px 60px rgb(0 0 0 / 0.85);
  text-align: center;
  animation: slam 0.5s cubic-bezier(0.2, 1.35, 0.4, 1) both;
}
.label {
  padding: 0.1rem 0.8rem;
  border-radius: 99px;
  background: rgb(var(--glow) / 0.2);
  border: 1px solid rgb(var(--glow) / 0.75);
  color: rgb(var(--glow));
  font-family: var(--font-display);
  font-size: 0.78rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
h2 {
  margin: 0;
  font-size: clamp(1.4rem, 3.4vw, 2rem);
  color: #fff;
  text-shadow: 0 0 22px rgb(var(--glow) / 0.8);
}
p {
  margin: 0;
  color: var(--text);
}
/* eight hooks lighting one after another */
.pips {
  display: flex;
  gap: 0.45rem;
  margin: 0.3rem 0;
}
.pip {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid rgb(var(--glow) / 0.5);
  background: rgb(0 0 0 / 0.5);
  animation: light 0.35s ease-out both;
}
/* the gate: its two leaves slide apart over a bright gap */
.gate {
  position: relative;
  width: 150px;
  height: 120px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 10px;
  background: radial-gradient(circle, rgb(255 244 200), rgb(var(--glow) / 0.6) 60%, rgb(0 0 0 / 0.6));
}
.gate img {
  position: absolute;
  height: 100%;
  object-fit: contain;
  opacity: 0.35;
}
.gate .leaf {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 50%;
  background: #15171c;
  animation: open-l 1.3s cubic-bezier(0.6, 0, 0.3, 1) 0.45s both;
}
.gate .leaf.l {
  left: 0;
}
.gate .leaf.r {
  right: 0;
  animation-name: open-r;
}
@keyframes slam {
  from {
    transform: scale(0.7) translateY(24px);
    opacity: 0;
  }
}
@keyframes light {
  from {
    background: rgb(var(--glow));
    box-shadow: 0 0 0 rgb(var(--glow) / 0);
    transform: scale(0.4);
    opacity: 0;
  }
  60% {
    transform: scale(1.35);
  }
  to {
    background: rgb(var(--glow));
    box-shadow: 0 0 14px rgb(var(--glow) / 0.9);
  }
}
@keyframes open-l {
  to {
    transform: translateX(-100%);
  }
}
@keyframes open-r {
  to {
    transform: translateX(100%);
  }
}
.finale-enter-active {
  transition: opacity 0.2s;
}
.finale-leave-active {
  transition: opacity 0.35s;
}
.finale-enter-from,
.finale-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .panel,
  .pip,
  .gate .leaf {
    animation: none;
  }
  .pip {
    background: rgb(var(--glow));
  }
  .gate .leaf {
    opacity: 0;
  }
}
</style>
