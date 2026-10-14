<script setup lang="ts">
import { computed, ref } from 'vue'
import { killerById, mapById, survivorById } from '../data'
import { asset } from '../i18n'
import { sfx } from '../sound'
import { useHistoryStore, type Winner } from '../stores/history'
import { useLobbyStore } from '../stores/lobby'

// End of a trial: say which side won, then a result screen in the style of the game's
// post-match screen. The game is recorded in the history once, on choosing the winner.
const emit = defineEmits<{ close: []; rematch: []; history: [] }>()
const lobby = useLobbyStore()
const history = useHistoryStore()
const s = computed(() => lobby.state)

const winner = ref<Winner | null>(null)

const killer = computed(() => killerById.get(s.value.killerPick ?? ''))
const team = computed(() => s.value.survivorPicks.map((id) => survivorById.get(id ?? '')).filter((c) => !!c))
const map = computed(() => mapById.get(s.value.mapId ?? ''))

function decide(w: Winner) {
  winner.value = w
  if (w === 'survivors') sfx.escape()
  else sfx.sacrifice()
  history.add({
    mode: s.value.mode,
    mapId: s.value.mapId ?? '',
    killerId: s.value.killerPick ?? '',
    survivorIds: s.value.survivorPicks.filter((x): x is string => !!x),
    winner: w,
  })
}

const headline = computed(() =>
  winner.value === 'survivors'
    ? { big: 'หนีรอด', sub: 'ประตูทางออกเปิดแล้ว — Survivor ทุกคนชนะ', killer: 'The Entity ไม่พอใจ' }
    : { big: 'ถูกสังเวย', sub: 'Sacrifice Progress ครบ 8 — The Entity ได้รับเครื่องสังเวย', killer: 'ฆาตกรไร้ความปรานี' },
)
</script>

<template>
  <div class="endgame" role="dialog" aria-label="จบเกม">
    <!-- 1. who won -->
    <div v-if="!winner" class="ask">
      <h2>จบเกมแล้ว — ฝ่ายไหนชนะ?</h2>
      <div class="choices">
        <button type="button" class="choice survivors" @click="decide('survivors')">
          <span class="icon">🚪</span>
          <b>Survivor ชนะ</b>
          <small>เปิดประตูทางออกได้</small>
        </button>
        <button type="button" class="choice killer" @click="decide('killer')">
          <span class="icon">🪝</span>
          <b>Killer ชนะ</b>
          <small>Sacrifice Progress ครบ 8</small>
        </button>
      </div>
      <button type="button" class="cancel" @click="emit('close')">ยกเลิก — ยังเล่นต่อ</button>
    </div>

    <!-- 2. result screen -->
    <div v-else class="result" :class="winner">
      <p class="map muted">{{ map?.name }} · {{ s.mode === 'devout' ? 'Devout' : 'Adept' }}</p>
      <h1 class="big">{{ headline.big }}</h1>
      <p class="sub">{{ headline.sub }}</p>

      <div class="cast">
        <figure v-for="c in team" :key="c!.id" class="who survivor">
          <div class="ring"><img :src="asset(c!.images.mini)" :alt="c!.name" /></div>
          <figcaption>
            <b>{{ c!.name }}</b>
            <span class="status">{{ winner === 'survivors' ? 'หนีรอด' : 'ถูกสังเวย' }}</span>
          </figcaption>
        </figure>
        <figure v-if="killer" class="who killer-fig">
          <div class="ring"><img :src="asset(killer.images.mini)" :alt="killer.name" /></div>
          <figcaption>
            <b>{{ killer.name }}</b>
            <span class="status">{{ headline.killer }}</span>
          </figcaption>
        </figure>
      </div>

      <p class="saved muted">บันทึกลงประวัติการเล่นแล้ว</p>
      <div class="actions">
        <button type="button" @click="emit('history')">📜 ดูประวัติ</button>
        <button type="button" class="primary" @click="emit('rematch')">เล่นอีกตา (ผู้เล่นเดิม) →</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.endgame {
  position: fixed;
  inset: 0;
  z-index: 65;
  display: grid;
  place-items: center;
  padding: 1rem;
  overflow-y: auto;
  background: radial-gradient(ellipse at center, rgb(20 6 8 / 0.94), rgb(0 0 0 / 0.97) 75%);
}
.ask {
  width: min(680px, 100%);
  text-align: center;
}
.choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin: 1.5rem 0;
}
.choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 1.6rem 1rem;
  font-size: 1.2rem;
}
.choice .icon {
  font-size: 2.6rem;
}
.choice small {
  color: var(--muted);
  font-family: 'Sarabun', sans-serif;
  font-size: 0.9rem;
}
.choice.survivors:hover:not(:disabled) {
  border-color: var(--warn);
  box-shadow: 0 0 24px rgb(217 162 39 / 0.35);
}
.choice.killer:hover:not(:disabled) {
  box-shadow: 0 0 24px rgb(255 40 40 / 0.4);
}
.cancel {
  background: none;
  border: none;
  color: var(--muted);
}

.result {
  width: min(1000px, 100%);
  text-align: center;
  animation: rise 0.7s ease-out both;
}
.map {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.85rem;
}
.big {
  margin: 0.2rem 0 0;
  font-size: clamp(3rem, 11vw, 6.5rem);
  letter-spacing: 0.08em;
  line-height: 1.05;
}
.survivors .big {
  color: #f4e6c4;
  text-shadow: 0 0 30px rgb(217 162 39 / 0.6);
}
.killer .big {
  color: var(--blood-bright);
  text-shadow: 0 0 34px rgb(255 30 30 / 0.7);
}
.sub {
  margin: 0.4rem 0 2rem;
  color: #cfc9be;
  font-size: 1.1rem;
}
.cast {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1rem;
}
.who {
  margin: 0;
  animation: rise 0.6s ease-out both;
}
.who:nth-child(2) {
  animation-delay: 0.1s;
}
.who:nth-child(3) {
  animation-delay: 0.2s;
}
.who:nth-child(4) {
  animation-delay: 0.3s;
}
.who:nth-child(5) {
  animation-delay: 0.45s;
}
.ring {
  width: min(140px, 100%);
  aspect-ratio: 1;
  margin: 0 auto;
  border-radius: 50%;
  padding: 4px;
  background: var(--line-strong);
}
.ring img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}
/* winners glow, losers fade to grey */
.survivors .survivor .ring,
.killer .killer-fig .ring {
  background: linear-gradient(180deg, var(--warn), #7a5a12);
  box-shadow: 0 0 26px rgb(217 162 39 / 0.45);
}
.killer .survivor .ring img {
  filter: grayscale(1) brightness(0.55) sepia(0.4) hue-rotate(-30deg);
}
.killer .survivor .ring {
  background: var(--blood-dim);
}
.survivors .killer-fig .ring img {
  filter: grayscale(1) brightness(0.55);
}
figcaption {
  display: flex;
  flex-direction: column;
  margin-top: 0.5rem;
  line-height: 1.3;
}
.status {
  font-family: var(--font-display);
  text-transform: uppercase;
  font-size: 0.85rem;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.survivors .survivor .status,
.killer .killer-fig .status {
  color: var(--warn);
}
.killer .survivor .status {
  color: var(--blood-bright);
}
.saved {
  margin: 2rem 0 0.75rem;
  font-size: 0.85rem;
}
.actions {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.actions .primary {
  padding: 0.7rem 1.4rem;
  font-size: 1.05rem;
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
}
@media (max-width: 600px) {
  .choices {
    grid-template-columns: 1fr;
  }
  .cast {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (prefers-reduced-motion: reduce) {
  .result,
  .who {
    animation: none;
  }
}
</style>
