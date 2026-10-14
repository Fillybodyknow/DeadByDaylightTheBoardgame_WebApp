<script setup lang="ts">
import { computed } from 'vue'
import { killerById, mapById, survivorById } from '../data'
import { asset } from '../i18n'
import { useHistoryStore } from '../stores/history'

const history = useHistoryStore()
const total = computed(() => history.records.length)
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0)

const killers = computed(() => history.byKiller.map((t) => ({ ...t, c: killerById.get(t.id) })))
const survivorsTop = computed(() => history.bySurvivor.slice(0, 8).map((t) => ({ ...t, c: survivorById.get(t.id) })))
const mapsPlayed = computed(() => history.byMap.map((t) => ({ ...t, m: mapById.get(t.id) })))

const fmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' })

function remove(id: string) {
  if (confirm('ลบเกมนี้ออกจากประวัติ?')) history.remove(id)
}
function clearAll() {
  if (confirm('ล้างประวัติทั้งหมด? ย้อนกลับไม่ได้')) history.clear()
}
</script>

<template>
  <div class="history">
    <h1>ประวัติการเล่น</h1>

    <p v-if="!total" class="card empty">
      ยังไม่มีเกมที่บันทึกไว้ — กด <b>🏁 จบเกม</b> ในหน้า "ระหว่างเล่น" เมื่อเล่นจบ
    </p>

    <template v-else>
      <!-- headline: survivors vs killer -->
      <section class="card score">
        <div class="side surv">
          <b>{{ history.survivorWins }}</b>
          <span>Survivor ชนะ · {{ pct(history.survivorWins, total) }}%</span>
        </div>
        <div class="meter" :aria-label="`Survivor ${pct(history.survivorWins, total)}%`">
          <span :style="{ width: `${pct(history.survivorWins, total)}%` }" />
        </div>
        <div class="side kill">
          <b>{{ history.killerWins }}</b>
          <span>Killer ชนะ · {{ pct(history.killerWins, total) }}%</span>
        </div>
        <p class="muted total">ทั้งหมด {{ total }} เกม</p>
      </section>

      <div class="stats">
        <section class="card">
          <h2>ฆาตกร</h2>
          <ul class="rank">
            <li v-for="k in killers" :key="k.id">
              <img :src="asset(k.c?.images.mini)" alt="" />
              <span class="name">{{ k.c?.name ?? k.id }}</span>
              <span class="rec">{{ k.wins }}/{{ k.games }} ชนะ</span>
            </li>
          </ul>
        </section>
        <section class="card">
          <h2>Survivor ที่เล่นบ่อย</h2>
          <ul class="rank">
            <li v-for="x in survivorsTop" :key="x.id">
              <img :src="asset(x.c?.images.mini)" alt="" />
              <span class="name">{{ x.c?.name ?? x.id }}</span>
              <span class="rec">หนีรอด {{ x.wins }}/{{ x.games }}</span>
            </li>
          </ul>
        </section>
        <section class="card">
          <h2>แผนที่</h2>
          <ul class="rank">
            <li v-for="m in mapsPlayed" :key="m.id">
              <span class="name">{{ m.m?.name ?? m.id }}</span>
              <span class="rec">{{ m.games }} เกม · Survivor ชนะ {{ pct(m.wins, m.games) }}%</span>
            </li>
          </ul>
        </section>
      </div>

      <h2>เกมที่ผ่านมา</h2>
      <ol class="games">
        <li v-for="r in history.records" :key="r.id" class="card game" :class="r.winner">
          <div class="when">
            <b class="badge">{{ r.winner === 'survivors' ? 'Survivor ชนะ' : 'Killer ชนะ' }}</b>
            <small class="muted">{{ fmt.format(new Date(r.at)) }} · {{ mapById.get(r.mapId)?.name ?? r.mapId }} · {{ r.mode === 'devout' ? 'Devout' : 'Adept' }}</small>
          </div>
          <div class="faces">
            <img class="k" :src="asset(killerById.get(r.killerId)?.images.mini)" :title="killerById.get(r.killerId)?.name" alt="" />
            <span class="vs">vs</span>
            <img v-for="id in r.survivorIds" :key="id" :src="asset(survivorById.get(id)?.images.mini)" :title="survivorById.get(id)?.name" alt="" />
          </div>
          <button type="button" class="del" title="ลบเกมนี้" @click="remove(r.id)">✕</button>
        </li>
      </ol>
      <button type="button" class="clear" @click="clearAll">ล้างประวัติทั้งหมด</button>
    </template>
  </div>
</template>

<style scoped>
.history {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.history h1 {
  margin: 0;
}
.empty {
  margin: 0;
}
.score {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 1rem;
}
.side {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.side b {
  font-family: var(--font-display);
  font-size: 2.6rem;
  line-height: 1;
}
.surv b {
  color: var(--warn);
}
.kill b {
  color: var(--blood-bright);
}
.side span {
  font-size: 0.85rem;
  color: var(--muted);
}
.meter {
  height: 12px;
  border-radius: 6px;
  overflow: hidden;
  background: linear-gradient(90deg, var(--blood-dim), var(--blood));
}
.meter span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #7a5a12, var(--warn));
  transition: width 0.4s;
}
.total {
  grid-column: 1 / -1;
  margin: 0;
  text-align: center;
  font-size: 0.85rem;
}
.stats {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}
.rank {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.rank li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.rank img {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}
.rank .name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rec {
  color: var(--muted);
  font-size: 0.85rem;
  white-space: nowrap;
}
.games {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.game {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 0.8rem;
  border-left: 3px solid var(--blood);
}
.game.survivors {
  border-left-color: var(--warn);
}
.when {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.badge {
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.survivors .badge {
  color: var(--warn);
}
.killer .badge {
  color: var(--blood-bright);
}
.faces {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.faces img {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--line-strong);
}
.faces .k {
  border-color: var(--blood);
}
.vs {
  margin: 0 0.25rem;
  color: var(--muted);
  font-size: 0.8rem;
}
.del {
  padding: 0.2rem 0.5rem;
}
.clear {
  align-self: flex-start;
  color: var(--muted);
}
@media (max-width: 600px) {
  .game {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .faces {
    grid-column: 1 / -1;
    grid-row: 2;
  }
  .faces img {
    width: 30px;
    height: 30px;
  }
  .side b {
    font-size: 2rem;
  }
}
</style>
