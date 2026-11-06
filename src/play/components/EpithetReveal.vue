<script setup lang="ts">
// The epithets turned over one at a time, before the summary itself (epithets.ts). A click
// anywhere skips the rest. With motion reduced they are all simply there, for a moment's read.
import { onBeforeUnmount, ref } from 'vue'
import { asset } from '../../i18n'
import { anim, reducedMotion } from '../../settings'
import type { EpithetCard } from '../epithets'
import { fxSound } from '../fx/audio'
import Mini from './Mini.vue'

const props = defineProps<{ cards: EpithetCard[] }>()
const emit = defineEmits<{ done: [] }>()

/** How many are face up. */
const shown = ref(reducedMotion.value ? props.cards.length : 0)
let timer: number | null = null

function done() {
  timer = null
  emit('done')
}

function turn() {
  shown.value++
  fxSound.flip()
  timer = shown.value < props.cards.length ? window.setTimeout(turn, anim(1500)) : window.setTimeout(done, anim(1400))
}

timer = window.setTimeout(reducedMotion.value ? done : turn, anim(reducedMotion.value ? 2200 : 500))

/** A click anywhere: the rest at once, and on to the summary. */
function skip() {
  if (timer !== null) clearTimeout(timer)
  if (shown.value < props.cards.length) {
    shown.value = props.cards.length
    timer = window.setTimeout(done, anim(900))
  } else done()
}

onBeforeUnmount(() => timer !== null && clearTimeout(timer))
</script>

<template>
  <Teleport to="body">
    <div class="epi-stage" role="dialog" aria-modal="true" @click="skip">
      <p class="eyebrow">ฉายาประจำการทดสอบ</p>
      <ul class="cards">
        <li v-for="(c, i) in cards" :key="i" class="card-slot" :class="{ up: i < shown, killer: c.killer }">
          <Mini class="face" :src="asset(c.mini)" />
          <strong class="epithet">{{ c.epithet.name }}</strong>
          <span class="who">{{ c.name }}</span>
          <span v-if="c.epithet.note" class="note">{{ c.epithet.note }}</span>
        </li>
      </ul>
      <p class="hint">แตะเพื่อข้าม</p>
    </div>
  </Teleport>
</template>

<style scoped>
.epi-stage {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 1.4rem;
  padding: 1rem;
  overflow-y: auto;
  background: radial-gradient(circle at 50% 35%, rgb(60 50 12 / 0.5), rgb(3 4 6 / 0.96) 70%);
  animation: epi-fade 0.6s ease-out;
}
.eyebrow {
  margin: 0;
  color: var(--muted);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-family: var(--font-display);
}
.cards {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.9rem;
  list-style: none;
  margin: 0;
  padding: 0;
}
.card-slot {
  display: grid;
  justify-items: center;
  gap: 0.25rem;
  width: 11rem;
  padding: 0.9rem 0.6rem;
  text-align: center;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgb(14 14 18 / 0.85);
  /* face down until its turn: nothing of the epithet shows through */
  opacity: 0;
  transform: rotateY(90deg) scale(0.9);
  transition:
    opacity 0.45s ease-out,
    transform 0.45s cubic-bezier(0.2, 1.3, 0.4, 1);
}
.card-slot.up {
  opacity: 1;
  transform: none;
  border-color: #f5c542;
  box-shadow: 0 0 22px rgb(245 197 66 / 0.25);
}
.card-slot.killer.up {
  border-color: var(--blood);
  box-shadow: 0 0 22px rgb(255 30 30 / 0.3);
}
.face {
  width: 64px;
  height: 64px;
}
.epithet {
  font-family: var(--font-display);
  font-size: 1.15rem;
  color: #f5c542;
  line-height: 1.3;
}
.card-slot.killer .epithet {
  color: #ff8a80;
}
.who {
  font-size: 0.85rem;
}
.note {
  font-size: 0.78rem;
  color: var(--muted);
}
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.8rem;
}
@keyframes epi-fade {
  from {
    opacity: 0;
  }
}
</style>
