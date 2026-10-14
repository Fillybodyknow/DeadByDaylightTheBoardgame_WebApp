<script setup lang="ts">
// New game: player count, the 4 survivors and the killer, on MacMillan Estate. Characters
// with implemented perks (the rulebook's automated-mode cast) play with their printed perks.
import { computed, ref } from 'vue'
import { killerById, survivors } from '../../../src/data'
import { asset, tr } from '../../../src/i18n'
import { sfx } from '../../../src/sound'
import { macmillan } from '../engine/boards'
import { handLayout } from '../engine/engine'
import { PERKS, PLAYABLE_KILLERS, PRINTED_PERKS } from '../engine/perks'
import { newGame } from '../game'
import Mini from './Mini.vue'

const players = ref<3 | 4 | 5>(5)
const picks = ref<string[]>([])

const killerId = ref('trapper')
const killer = computed(() => killerById.get(killerId.value)!)
const killerChoices = PLAYABLE_KILLERS.map((id) => killerById.get(id)!)

const hasPerks = (id: string) => (PRINTED_PERKS[id]?.length ?? 0) > 0

/** Survivors whose perks are implemented come first; the rest can't be picked yet. */
const playable = survivors.filter((s) => hasPerks(s.id)).map((s) => s.id)
const survivorList = [...survivors].sort((a, b) => Number(hasPerks(b.id)) - Number(hasPerks(a.id)))

const killerPerks = computed(() =>
  (PRINTED_PERKS[killerId.value] ?? []).map((p) => `${PERKS[p].name} (${PERKS[p].cost} ▲)`).join(' · '),
)

function toggle(id: string) {
  if (!hasPerks(id)) return
  sfx.click()
  const i = picks.value.indexOf(id)
  if (i >= 0) picks.value.splice(i, 1)
  else if (picks.value.length < 4) picks.value.push(id)
}

function randomFill() {
  sfx.tick()
  const pool = playable.filter((id) => !picks.value.includes(id))
  while (picks.value.length < 4) picks.value.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
}

/** "ผู้เล่น 2: Dwight + Meg" for the chosen player count. */
const controllers = computed(() => {
  const hands = handLayout(players.value)
  return Array.from({ length: Math.max(...hands) + 1 }, (_, h) => ({
    player: h + 2,
    names: hands.flatMap((x, i) => (x === h ? [picks.value[i] ? survivors.find((s) => s.id === picks.value[i])!.name : `ที่นั่ง ${i + 1}`] : [])),
  }))
})

function start() {
  sfx.entity()
  newGame({
    board: macmillan.id,
    survivors: picks.value.map((id) => ({ id, name: survivors.find((s) => s.id === id)!.name })),
    killer: { id: killer.value.id, name: killer.value.name },
    players: players.value,
    seed: (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0,
  })
}
</script>

<template>
  <div class="setup">
    <header>
      <p class="eyebrow">Dead by Daylight: The Board Game</p>
      <h1>เล่นเต็มเกม</h1>
      <p class="muted">
        เล่นบนเครื่องเดียว ส่งเครื่องต่อกัน (hot-seat) บน MacMillan Estate โหมด Adept — ตัวละครที่มีป้าย <span class="badge">PERK</span> ใช้ perk บนกระดานได้
      </p>
    </header>

    <section class="card">
      <h2>จำนวนผู้เล่น</h2>
      <div class="row">
        <button v-for="n in [3, 4, 5] as const" :key="n" :class="{ primary: players === n }" @click="players = n">{{ n }} คน</button>
      </div>
      <ul class="muted small">
        <li>ผู้เล่น 1 = ฆาตกร ({{ killer.name }})</li>
        <li v-for="c in controllers" :key="c.player">
          ผู้เล่น {{ c.player }}: {{ c.names.join(' + ') }}<span v-if="c.names.length > 1"> (ใช้การ์ดเคลื่อนที่ชุดเดียวกัน, หน้า 19)</span>
        </li>
      </ul>
    </section>

    <section class="card">
      <div class="head">
        <h2>ผู้รอดชีวิต 4 ตัว ({{ picks.length }}/4)</h2>
        <button :disabled="picks.length === 4" @click="randomFill">🎲 สุ่มที่เหลือ</button>
      </div>
      <div class="pick-grid">
        <button
          v-for="s in survivorList"
          :key="s.id"
          class="who"
          :class="{ on: picks.includes(s.id), locked: !hasPerks(s.id) }"
          :disabled="!hasPerks(s.id)"
          :title="hasPerks(s.id) ? tr(s.title) : 'ยังไม่รองรับ perk ของตัวละครนี้'"
          @click="toggle(s.id)"
        >
          <Mini class="pick-mini" :src="asset(s.images.mini)" />
          <span>{{ s.name }}</span>
          <b v-if="picks.includes(s.id)" class="seat">{{ picks.indexOf(s.id) + 1 }}</b>
          <span v-if="hasPerks(s.id)" class="badge corner">PERK</span>
          <span v-else class="soon">เร็ว ๆ นี้</span>
        </button>
      </div>
    </section>

    <section class="card">
      <h2>ฆาตกร</h2>
      <div class="killers">
        <button v-for="k in killerChoices" :key="k.id" class="who" :class="{ on: killerId === k.id }" @click="(killerId = k.id), sfx.click()">
          <Mini class="pick-mini" :class="{ 'aura-killer': killerId === k.id }" :src="asset(k.images.mini)" />
          <span>{{ k.name }}</span>
          <span class="badge corner">PERK</span>
        </button>
      </div>
      <div class="versus">
        <Mini class="killer-mini aura-killer" :src="asset(killer.images.mini)" />
        <div>
          <h3>{{ killer.name }}</h3>
          <p class="small"><b>Power — {{ killer.power.name }}:</b> {{ tr(killer.power.text) }}</p>
          <p v-if="killer.passive" class="small"><b>Passive:</b> {{ tr(killer.passive) }}</p>
          <p class="small"><b>Perks:</b> {{ killerPerks }}</p>
          <p class="muted small">แผนที่: {{ macmillan.name }}</p>
        </div>
      </div>
    </section>

    <button class="primary big" :disabled="picks.length !== 4" @click="start">เริ่มการทดสอบ</button>
  </div>
</template>

<style scoped>
.setup {
  width: min(60rem, 100%);
  margin: 0 auto;
  padding: 1.5rem 1rem 3rem;
  display: grid;
  gap: 1rem;
}
.eyebrow {
  margin: 0;
  color: var(--blood-bright);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-family: var(--font-display);
}
h1 {
  font-size: 2.6rem;
}
.row,
.head {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}
.head {
  justify-content: space-between;
}
.small {
  font-size: 0.9rem;
}
.pick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 0.5rem;
}
.who.locked {
  opacity: 0.35;
  filter: grayscale(1);
  cursor: not-allowed;
}
.soon {
  font-size: 0.7rem;
  color: var(--muted);
}
.who {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 0.2rem;
  padding: 0.4rem;
  font-size: 0.85rem;
}
.who .pick-mini {
  width: 64px;
  height: 64px;
  object-fit: contain;
}
.who.on {
  border-color: #ffe9b0;
  box-shadow: 0 0 14px rgb(255 214 140 / 0.5);
}
.seat {
  position: absolute;
  top: 4px;
  left: 6px;
  color: #ffe9b0;
}
.killers {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.badge {
  display: inline-block;
  padding: 0 0.3rem;
  border-radius: 3px;
  background: #6b4ca3;
  color: #fff;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.06em;
}
.badge.corner {
  position: absolute;
  top: 4px;
  right: 4px;
}
.versus {
  display: flex;
  gap: 1rem;
  align-items: center;
}
.killer-mini {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  object-fit: contain;
  flex: none;
}
.big {
  font-size: 1.3rem;
  padding: 0.9rem;
}
</style>
