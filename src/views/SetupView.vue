<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { killers, maps, survivors } from '../data'
import { asset, lang } from '../i18n'
import { SURVIVOR_COUNT } from '../rules'
import { useGameStore } from '../stores/game'

const game = useGameStore()
const router = useRouter()

const killerId = ref<string>(killers.find((k) => k.id === 'trapper')?.id ?? killers[0]?.id ?? '')
const picked = ref<string[]>([])
const mapId = ref(maps[0].id)
const firstPlayer = ref(0)

function toggleSurvivor(id: string) {
  const i = picked.value.indexOf(id)
  if (i >= 0) picked.value.splice(i, 1)
  else if (picked.value.length < SURVIVOR_COUNT) picked.value.push(id)
}

function randomize() {
  const pool = [...survivors].sort(() => Math.random() - 0.5)
  picked.value = pool.slice(0, SURVIVOR_COUNT).map((s) => s.id)
  killerId.value = killers[Math.floor(Math.random() * killers.length)].id
  firstPlayer.value = Math.floor(Math.random() * SURVIVOR_COUNT)
}

const ready = computed(() => picked.value.length === SURVIVOR_COUNT && !!killerId.value)

function start() {
  if (game.started && !confirm(lang.value === 'th' ? 'มีเกมที่เล่นค้างอยู่ เริ่มเกมใหม่ทับเลยไหม?' : 'Replace the game in progress?')) return
  game.start({ killerId: killerId.value, survivorIds: picked.value, mapId: mapId.value, firstPlayer: firstPlayer.value })
  router.push('/game')
}

const t = computed(() =>
  lang.value === 'th'
    ? { title: 'ตั้งค่าเกม', resume: 'เล่นเกมที่ค้างไว้ต่อ', killer: 'ฆาตกร', survivors: `ผู้รอดชีวิต (เลือก ${SURVIVOR_COUNT})`, map: 'แผนที่', first: 'ผู้เล่นคนแรก (First Player)', random: 'สุ่ม', start: 'เริ่มเกม', easy: 'ง่าย', hard: 'ยาก', hint: 'เกมมีผู้รอดชีวิต 4 ตัวเสมอ ถ้าผู้เล่นน้อยกว่า 5 คน ให้ผู้เล่นบางคนคุมหลายตัว (หน้า 19)' }
    : { title: 'Game setup', resume: 'Resume game in progress', killer: 'Killer', survivors: `Survivors (pick ${SURVIVOR_COUNT})`, map: 'Map', first: 'First player', random: 'Randomize', start: 'Start game', easy: 'Easy', hard: 'Hard', hint: 'There are always 4 survivors; with fewer than 5 players some players control several (p.19).' },
)
</script>

<template>
  <div class="head">
    <h1>{{ t.title }}</h1>
    <button type="button" @click="randomize">🎲 {{ t.random }}</button>
    <RouterLink v-if="game.started" to="/game"><button type="button">{{ t.resume }}</button></RouterLink>
  </div>

  <h2>{{ t.killer }}</h2>
  <div class="grid pick">
    <button
      v-for="k in killers"
      :key="k.id"
      type="button"
      class="option"
      :class="{ selected: killerId === k.id }"
      @click="killerId = k.id"
    >
      <img :src="asset(k.images.mini)" :alt="k.name" loading="lazy" />
      <span>{{ k.name }}</span>
      <small :class="k.difficulty">{{ t[k.difficulty] }}</small>
    </button>
  </div>

  <h2>{{ t.survivors }} — {{ picked.length }}/{{ SURVIVOR_COUNT }}</h2>
  <p class="muted">{{ t.hint }}</p>
  <div class="grid pick">
    <button
      v-for="s in survivors"
      :key="s.id"
      type="button"
      class="option"
      :class="{ selected: picked.includes(s.id) }"
      :disabled="!picked.includes(s.id) && picked.length >= SURVIVOR_COUNT"
      @click="toggleSurvivor(s.id)"
    >
      <span v-if="picked.includes(s.id)" class="seat">{{ picked.indexOf(s.id) + 1 }}</span>
      <img :src="asset(s.images.mini)" :alt="s.name" loading="lazy" />
      <span>{{ s.name }}</span>
      <small :class="s.difficulty">{{ t[s.difficulty] }}</small>
    </button>
  </div>

  <div class="row">
    <label>
      {{ t.map }}
      <select v-model="mapId">
        <option v-for="m in maps" :key="m.id" :value="m.id">{{ m.name }}</option>
      </select>
    </label>
    <label>
      {{ t.first }}
      <select v-model.number="firstPlayer" :disabled="picked.length < SURVIVOR_COUNT">
        <option v-for="(id, i) in picked" :key="id" :value="i">{{ survivors.find((s) => s.id === id)?.name }}</option>
      </select>
    </label>
  </div>

  <img class="map" :src="asset(maps.find((m) => m.id === mapId)?.image)" alt="" />

  <div class="actions">
    <button type="button" class="primary" :disabled="!ready" @click="start">{{ t.start }}</button>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}
.head h1 {
  flex: 1;
  margin: 0;
}
h2 {
  margin-top: 1.5rem;
}
.pick {
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
}
.option {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  padding: 0.5rem;
  background: var(--bg-raised);
}
.option img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
}
.option.selected {
  border-color: var(--blood);
  box-shadow: 0 0 0 2px var(--blood) inset;
}
.seat {
  position: absolute;
  top: 0.3rem;
  left: 0.3rem;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background: var(--blood);
  display: grid;
  place-items: center;
  font-weight: 800;
}
.easy {
  color: var(--ok);
}
.hard {
  color: var(--blood);
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 1.5rem;
}
.row label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.map {
  width: 100%;
  max-width: 640px;
  margin-top: 1rem;
  border-radius: var(--radius);
}
.actions {
  position: sticky;
  bottom: 0;
  padding: 1rem 0;
  background: linear-gradient(transparent, var(--bg) 40%);
}
.actions button {
  width: 100%;
  padding: 0.8rem;
  font-size: 1.1rem;
}
</style>
