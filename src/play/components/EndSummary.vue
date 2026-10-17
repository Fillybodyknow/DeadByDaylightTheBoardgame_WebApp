<script setup lang="ts">
// End of the trial: who won, everyone's stats and the timeline of the game.
import { computed } from 'vue'
import { asset } from '../../i18n'
import type { GameState } from '../engine/types'
import { killerMini, playerOf, survivorMini } from '../labels'
import { gameStats, timeline } from '../stats'
import Mini from './Mini.vue'

/** `online`: "play again" takes the room back to its lobby rather than to a new game here. */
const props = defineProps<{ st: GameState; winner: 'survivors' | 'killer'; online?: boolean }>()
const emit = defineEmits<{ close: []; again: [] }>()

const stats = computed(() => gameStats(props.st))
const events = computed(() => timeline(props.st))

const survivorCols = [
  { key: 'repair', label: 'ซ่อม' },
  { key: 'gensDone', label: 'Gen เสร็จ' },
  { key: 'rescues', label: 'ช่วย' },
  { key: 'heals', label: 'รักษา' },
  { key: 'wounded', label: 'บาดเจ็บ' },
  { key: 'hooked', label: 'โดนแขวน' },
  { key: 'bp', label: '▲ ที่ได้' },
] as const

/** The survivor with the best contribution, for the "MVP" mark. */
const mvp = computed(() => {
  const score = (i: number) => {
    const s = stats.value.survivors[i]
    return s.repair * 2 + s.rescues * 4 + s.heals * 2 + s.totems * 2 + s.gate * 3 + s.escapes * 2
  }
  return [0, 1, 2, 3].reduce((best, i) => (score(i) > score(best) ? i : best), 0)
})
</script>

<template>
  <div class="backdrop" :class="winner">
    <div class="card modal" role="dialog" aria-modal="true">
      <header class="hero">
        <p class="eyebrow">จบการทดสอบ · {{ st.round }} รอบ</p>
        <h1>{{ winner === 'survivors' ? 'หนีรอด' : 'ถูกสังเวย' }}</h1>
        <p>{{ winner === 'survivors' ? 'ผู้รอดชีวิตเปิดประตูทางออกได้ — ผู้รอดชีวิตชนะ!' : `${st.killer.name} สังเวยครบ 8 — ฆาตกรชนะ!` }}</p>
      </header>

      <section class="figures">
        <div v-for="(sv, s) in st.survivors" :key="s" class="fig" :class="{ lost: winner === 'killer', mvp: winner === 'survivors' && s === mvp }">
          <Mini class="face" :class="winner === 'survivors' ? 'aura-survivor' : ''" :src="asset(survivorMini(st, s))" />
          <strong>{{ sv.name }}</strong>
          <span class="muted small">ผู้เล่น {{ playerOf(st, s) }}</span>
          <span v-if="winner === 'survivors' && s === mvp" class="badge">MVP</span>
        </div>
        <div class="fig killer" :class="{ lost: winner === 'survivors' }">
          <Mini class="face" :class="winner === 'killer' ? 'aura-killer' : ''" :src="asset(killerMini(st))" />
          <strong>{{ st.killer.name }}</strong>
          <span class="muted small">ผู้เล่น 1</span>
        </div>
      </section>

      <section>
        <h3>สถิติผู้รอดชีวิต</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th />
                <th v-for="c in survivorCols" :key="c.key">{{ c.label }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(sv, s) in st.survivors" :key="s">
                <th>{{ sv.name }}</th>
                <td v-for="c in survivorCols" :key="c.key" :class="{ zero: stats.survivors[s][c.key] === 0 }">{{ stats.survivors[s][c.key] }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3>สถิติ {{ st.killer.name }}</h3>
        <ul class="kstats">
          <li><b>{{ stats.killer.hits }}</b> โจมตี</li>
          <li><b>{{ stats.killer.pickUps }}</b> อุ้ม</li>
          <li><b>{{ stats.killer.hooks }}</b> แขวน</li>
          <li><b>{{ stats.killer.trapsSprung }}</b>/{{ stats.killer.trapsSet }} Trap ทำงาน</li>
          <li><b>{{ stats.killer.damaged }}</b> ทำลาย Gen</li>
          <li><b>{{ stats.killer.breaks }}</b> ทุบ Pallet/กำแพง</li>
          <li><b>{{ stats.killer.bp }}</b> ▲ ที่ได้</li>
        </ul>
      </section>

      <section>
        <h3>ไทม์ไลน์</h3>
        <ol class="timeline">
          <li v-for="(e, i) in events" :key="i" :class="e.tone">
            <span class="round">รอบ {{ e.round }}</span>
            {{ e.text }}
          </li>
        </ol>
      </section>

      <div class="actions">
        <button class="primary" @click="emit('again')">{{ online ? 'กลับ Lobby' : 'เล่นใหม่' }}</button>
        <button @click="emit('close')">ดูกระดาน</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 45;
  display: grid;
  place-items: center;
  padding: 1rem;
  overflow-y: auto;
  background: radial-gradient(circle at 50% 30%, rgb(60 50 12 / 0.55), rgb(4 5 7 / 0.92) 70%);
  animation: fade 0.5s ease-out;
}
.backdrop.killer {
  background: radial-gradient(circle at 50% 30%, rgb(92 11 16 / 0.65), rgb(4 5 7 / 0.94) 70%);
}
.modal {
  width: min(52rem, 100%);
  display: grid;
  gap: 1.2rem;
  animation: rise 0.6s cubic-bezier(0.2, 1.2, 0.4, 1);
}
.hero {
  text-align: center;
}
.hero h1 {
  font-size: clamp(2.6rem, 8vw, 4.5rem);
  margin: 0.2rem 0;
  animation: slam 0.7s cubic-bezier(0.2, 1.6, 0.4, 1) 0.2s backwards;
}
.survivors .hero h1 {
  color: #f5c542;
  text-shadow: 0 0 30px rgb(245 197 66 / 0.6);
}
.killer .hero h1 {
  color: var(--blood-bright);
  text-shadow: 0 0 30px rgb(255 30 30 / 0.7);
}
.hero p {
  margin: 0;
}
.eyebrow {
  color: var(--muted);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-family: var(--font-display);
}
.figures {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1rem;
}
.fig {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 0.2rem;
  width: 7.5rem;
  text-align: center;
  animation: rise 0.5s ease-out backwards;
}
.fig:nth-child(2) {
  animation-delay: 0.1s;
}
.fig:nth-child(3) {
  animation-delay: 0.2s;
}
.fig:nth-child(4) {
  animation-delay: 0.3s;
}
.fig:nth-child(5) {
  animation-delay: 0.45s;
}
.face {
  width: 76px;
  height: 76px;
}
.fig.lost .face {
  filter: grayscale(1) brightness(0.5);
}
.fig.mvp .face {
  box-shadow:
    0 0 0 3px #f5c542,
    0 0 24px 6px rgb(245 197 66 / 0.6);
}
.badge {
  position: absolute;
  top: -6px;
  right: 10px;
  background: #f5c542;
  color: #000;
  font-weight: 800;
  font-size: 0.75rem;
  padding: 0 0.4rem;
  border-radius: 3px;
}
.small {
  font-size: 0.8rem;
}
h3 {
  font-size: 1rem;
  color: var(--muted);
}
.table-wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.92rem;
}
th,
td {
  padding: 0.35rem 0.5rem;
  text-align: center;
  border-bottom: 1px solid var(--line);
}
tbody th {
  text-align: left;
  white-space: nowrap;
}
thead th {
  font-family: var(--font-display);
  font-weight: 500;
  color: var(--muted);
  font-size: 0.8rem;
}
td {
  font-weight: 700;
}
td.zero {
  color: var(--line-strong);
  font-weight: 400;
}
.kstats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  list-style: none;
  margin: 0;
  padding: 0;
}
.kstats li {
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--blood-dim);
  border-radius: 99px;
}
.kstats b {
  color: #ff8a80;
}
.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.25rem;
  max-height: 14rem;
  overflow-y: auto;
}
.timeline li {
  padding: 0.25rem 0.6rem;
  border-left: 3px solid var(--line-strong);
}
.timeline li.killer {
  border-left-color: var(--blood);
}
.timeline li.survivor {
  border-left-color: #c9b98a;
}
.timeline li.game {
  border-left-color: #f5c542;
  color: #f5c542;
}
.round {
  display: inline-block;
  min-width: 3.6rem;
  color: var(--muted);
  font-size: 0.8rem;
}
.actions {
  display: flex;
  gap: 0.6rem;
  justify-content: center;
}
@keyframes fade {
  from {
    opacity: 0;
  }
}
@keyframes rise {
  from {
    transform: translateY(30px);
    opacity: 0;
  }
}
@keyframes slam {
  from {
    transform: scale(2.2);
    opacity: 0;
    letter-spacing: 0.4em;
  }
}
@media (prefers-reduced-motion: reduce) {
  .backdrop,
  .modal,
  .hero h1,
  .fig {
    animation: none;
  }
}
</style>
