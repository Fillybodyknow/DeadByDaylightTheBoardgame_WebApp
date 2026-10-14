<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { components, killerById, mapById, perkOption, printedPerks, survivorById } from '../data'
import { asset } from '../i18n'
import { SURVIVOR_COUNT, useLobbyStore } from '../stores/lobby'

const lobby = useLobbyStore()
const router = useRouter()
const s = computed(() => lobby.state)

const killer = computed(() => (s.value.killerPick ? killerById.get(s.value.killerPick) : undefined))
const team = computed(() => s.value.survivorPicks.map((id) => (id ? survivorById.get(id) : undefined)))
const map = computed(() => (s.value.mapId ? mapById.get(s.value.mapId) : undefined))
const playerCount = computed(() => s.value.players.length)

// Extra components some killers bring (setup step 7). Token folders come from the
// transcribed boards; the rest are props/minis named in the killer's own passive.
const killerExtras = computed(() => {
  const k = killer.value
  if (!k) return []
  const list = k.tokens.map((t) => ({ name: t.name, count: t.count, image: t.image }))
  if (k.id === 'knight')
    for (const g of ['carnifex', 'assassin', 'jailer'])
      list.push({ name: `Guard: The ${g[0].toUpperCase()}${g.slice(1)}`, count: 1, image: `assets/killers/tokens/knight-${g}.webp` })
  if (k.id === 'singularity') list.push({ name: 'EMP', count: components.singularityEmp.count, image: components.singularityEmp.image })
  if (k.id === 'skullmerchant') list.push({ name: 'Drone', count: components.skullmerchantDrone.count, image: components.skullmerchantDrone.image })
  return list
})

const movementNote = computed(() => {
  const n = playerCount.value
  if (n === 5) return 'Survivor ทุกคนได้คนละ 1 ชุด'
  if (n === 2) return 'ผู้เล่นฝั่ง Survivor ใช้การ์ด 2 ชุด (8 ใบ) สับเป็นกอง แต่ละรอบจั่ว 3 ใบ กำหนดให้ Survivor ทีละตัวตามลำดับ แล้วจั่วเพิ่ม 1 ใบ (หน้า 19)'
  return 'ผู้เล่นที่คุม Survivor 2 ตัวได้การ์ดชุดเดียว ใช้ร่วมกันทั้งสองตัว (หน้า 19)'
})

// Devout: perk cards to take from the perk decks, i.e. picks that aren't printed on the board.
const perkSwaps = computed(() =>
  (['s0', 's1', 's2', 's3', 'killer'] as const)
    .map((key) => {
      const id = lobby.characterOf(key)
      const printed = id ? printedPerks(key === 'killer' ? 'killer' : 'survivor', id) : []
      const picks = (s.value.perkPicks[key] ?? []).filter((r) => !printed.includes(r))
      const c = id ? (key === 'killer' ? killerById.get(id) : survivorById.get(id)) : undefined
      return { who: c?.name ?? '?', perks: picks.map((r) => perkOption(r)?.perk.name ?? r) }
    })
    .filter((w) => w.perks.length),
)

// Rulebook p.6 setup steps 1–10, in order; step 11 (start rooms) runs when the game starts.
// Checkbox state is kept in the lobby store.
const STEP_COUNT = 10
const doneCount = computed(() => Array.from({ length: STEP_COUNT }, (_, i) => !!s.value.setupChecked[i]).filter(Boolean).length)

function start() {
  lobby.rollStartRooms()
  router.push({ path: '/table', query: { intro: '1' } })
}
</script>

<template>
  <div v-if="!lobby.ready" class="card">
    <p>ยังเลือกตัวละครและแผนที่ไม่ครบ</p>
    <RouterLink to="/"><button type="button" class="primary">กลับไป Lobby</button></RouterLink>
  </div>

  <div v-else class="setup">
    <header class="head">
      <div>
        <h1>จัดโต๊ะ</h1>
        <p class="muted">ทำตามทีละข้อ แล้วติ๊กเมื่อเสร็จ (Rulebook หน้า 6)</p>
      </div>
      <span class="progress">{{ doneCount }}/{{ STEP_COUNT }}</span>
    </header>

    <ol class="steps">
      <!-- 1 -->
      <li :class="{ done: s.setupChecked[0] }">
        <label class="check"><input type="checkbox" :checked="s.setupChecked[0]" @change="lobby.toggleSetup(0)" /></label>
        <div>
          <h3>แจก Identity Board ให้ทุกคน</h3>
          <div class="who">
            <span class="chip killer"><img :src="asset(killer?.images.mini)" alt="" /> {{ killer?.name }} — {{ lobby.playerName(s.killerPlayer) }}</span>
            <span v-for="(c, i) in team" :key="i" class="chip"><img :src="asset(c?.images.mini)" alt="" /> {{ c?.name }} — {{ lobby.seatPlayerName(i) }}</span>
          </div>
          <template v-if="s.mode === 'devout'">
            <p class="devout-note">
              <b>Devout:</b> หยิบการ์ด Perk ต่อไปนี้จากกอง Perk แล้ววางทับ Perk บนกระดาน
            </p>
            <ul v-if="perkSwaps.length" class="swaps">
              <li v-for="w in perkSwaps" :key="w.who">
                <b>{{ w.who }}:</b> {{ w.perks.join(', ') }}
              </li>
            </ul>
            <p v-else class="muted">ไม่มีใครเปลี่ยน Perk — ใช้ Perk บนกระดานตามเดิม</p>
          </template>
        </div>
      </li>

      <!-- 2 -->
      <li :class="{ done: s.setupChecked[1] }">
        <label class="check"><input type="checkbox" :checked="s.setupChecked[1]" @change="lobby.toggleSetup(1)" /></label>
        <div>
          <h3>ให้ First Player Marker แก่ Survivor 1 ตัว</h3>
          <div class="who">
            <button
              v-for="(c, i) in team"
              :key="i"
              type="button"
              class="chip"
              :class="{ active: s.firstPlayerSeat === i }"
              @click="lobby.setFirstPlayer(i)"
            >
              <img :src="asset(c?.images.mini)" alt="" /> {{ c?.name }}
            </button>
            <button type="button" @click="lobby.randomFirstPlayer()">🎲 สุ่ม</button>
          </div>
        </div>
      </li>

      <!-- 3 -->
      <li :class="{ done: s.setupChecked[2] }">
        <label class="check"><input type="checkbox" :checked="s.setupChecked[2]" @change="lobby.toggleSetup(2)" /></label>
        <div>
          <h3><img class="tok" :src="asset(components.sacrificeProgress.image)" alt="" /> วาง Sacrifice Progress บนกระดาน Survivor ตัวละ 1 อัน (รวม {{ SURVIVOR_COUNT }})</h3>
        </div>
      </li>

      <!-- 4 -->
      <li :class="{ done: s.setupChecked[3] }">
        <label class="check"><input type="checkbox" :checked="s.setupChecked[3]" @change="lobby.toggleSetup(3)" /></label>
        <div>
          <h3>วางกระดานเกม: {{ map?.name }}</h3>
          <img class="mapimg" :src="asset(map?.image)" :alt="map?.name" />
        </div>
      </li>

      <!-- 5 -->
      <li :class="{ done: s.setupChecked[4] }">
        <label class="check"><input type="checkbox" :checked="s.setupChecked[4]" @change="lobby.toggleSetup(4)" /></label>
        <div>
          <h3>วาง Prop คว่ำตามที่แต่ละห้องระบุ</h3>
          <ul>
            <li>สับไทล์ Prop แล้ววางคว่ำในห้องตามสีและจำนวนที่พิมพ์ไว้ (Room Setup)</li>
            <li>Survivor แต่ละคน <b>ตามลำดับเทิร์น</b> เปิด Prop 1 อันที่ไหนก็ได้บนกระดาน</li>
            <li>
              <img class="tok" :src="asset(components.breakableWall.image)" alt="" />
              วางกำแพงทำลายได้ ({{ components.breakableWall.count }} อัน) บนเส้นทางที่มีขอบแตกร้าว
            </li>
          </ul>
        </div>
      </li>

      <!-- 6 -->
      <li :class="{ done: s.setupChecked[5] }">
        <label class="check"><input type="checkbox" :checked="s.setupChecked[5]" @change="lobby.toggleSetup(5)" /></label>
        <div>
          <h3>แจกการ์ดเคลื่อนที่</h3>
          <div class="cards">
            <img v-for="m in ['sneak', 'sprint', 'crouch', 'vault']" :key="m" :src="asset(`assets/movement/${m}.webp`)" :alt="m" />
            <span class="plus">+</span>
            <img :src="asset('assets/movement/wait.webp')" alt="wait" />
          </div>
          <ul>
            <li>ทุกคนได้ Sneak, Sprint, Crouch, Vault ชุดละ 4 ใบ</li>
            <li>Killer ได้ <b>Wait</b> เพิ่ม รวม 5 ใบ</li>
            <li>{{ movementNote }}</li>
          </ul>
        </div>
      </li>

      <!-- 7 -->
      <li :class="{ done: s.setupChecked[6] }">
        <label class="check"><input type="checkbox" :checked="s.setupChecked[6]" @change="lobby.toggleSetup(6)" /></label>
        <div>
          <h3>อุปกรณ์เสริมของ {{ killer?.name }}</h3>
          <div v-if="killerExtras.length" class="who">
            <span v-for="x in killerExtras" :key="x.name" class="chip"><img :src="asset(x.image)" alt="" /> {{ x.name }} ×{{ x.count }}</span>
          </div>
          <p v-else class="muted">ไม่มีอุปกรณ์เสริม — ถ้า Power/Passive พูดถึงชิ้นส่วนอื่น ให้วางไว้ใกล้ๆ</p>
        </div>
      </li>

      <!-- 8 -->
      <li :class="{ done: s.setupChecked[7] }">
        <label class="check"><input type="checkbox" :checked="s.setupChecked[7]" @change="lobby.toggleSetup(7)" /></label>
        <div>
          <h3><img class="tok" :src="asset(components.bloodpoint.image)" alt="" /> แจก Bloodpoint เริ่มต้น</h3>
          <ul>
            <li>{{ killer?.name }}: <b>{{ killer?.bloodpoints.start }} ▲</b> (สูงสุด {{ killer?.bloodpoints.max }})</li>
            <li>Survivor ตัวละ <b>{{ team[0]?.bloodpoints.start }} ▲</b> (สูงสุด {{ team[0]?.bloodpoints.max }})</li>
          </ul>
        </div>
      </li>

      <!-- 9 -->
      <li :class="{ done: s.setupChecked[8] }">
        <label class="check"><input type="checkbox" :checked="s.setupChecked[8]" @change="lobby.toggleSetup(8)" /></label>
        <div>
          <h3><img class="tok card-back" :src="asset('assets/items/back.webp')" alt="" /> สับการ์ด Item เป็นกอง</h3>
        </div>
      </li>

      <!-- 10 -->
      <li :class="{ done: s.setupChecked[9] }">
        <label class="check"><input type="checkbox" :checked="s.setupChecked[9]" @change="lobby.toggleSetup(9)" /></label>
        <div>
          <h3>วางโทเคนและลูกเต๋าที่เหลือไว้ใกล้มือ</h3>
          <p class="muted">Generator Progress, Bloodpoint, Wound Ring, Entity, ลูกเต๋า Skill Check 4 ลูก, Danger Die 1 ลูก</p>
        </div>
      </li>

    </ol>

    <div class="actions">
      <!-- Step 11 (roll for start rooms) happens here, animated, as the game starts. -->
      <button type="button" class="primary big" @click="start">🎲 เริ่มเกม — ทอยหาห้องเริ่มต้น</button>
    </div>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}
.head h1 {
  margin: 0;
}
.progress {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--blood);
}
.steps {
  list-style: none;
  counter-reset: step;
  margin: 1rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.steps > li {
  counter-increment: step;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.9rem;
  padding: 0.9rem 1rem;
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.steps > li.done {
  opacity: 0.55;
}
.steps h3 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.2rem 0 0.4rem;
}
.steps h3::before {
  content: counter(step) '.';
  color: var(--muted);
}
.check input {
  width: 1.6rem;
  height: 1.6rem;
  accent-color: var(--blood);
  cursor: pointer;
}
ul {
  margin: 0.25rem 0 0;
  padding-left: 1.2rem;
}
ul li {
  margin: 0.15rem 0;
}
ul img.tok {
  height: 1.4em;
  vertical-align: middle;
}
.tok {
  height: 1.8rem;
}
.tok.card-back {
  height: 2.2rem;
  border-radius: 3px;
}
.who {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.6rem 0.25rem 0.25rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--bg-hover);
  font-size: 0.95rem;
}
.chip img {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  object-fit: cover;
}
.chip.killer {
  border-color: var(--blood-dim);
}
button.chip.active {
  border-color: var(--blood);
  background: var(--blood);
  color: #fff;
}
.mapimg {
  width: 100%;
  max-width: 520px;
  border-radius: 8px;
}
.cards {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.25rem;
}
.cards img {
  height: 70px;
  border-radius: 4px;
}
.plus {
  font-size: 1.4rem;
  color: var(--muted);
}
.devout-note {
  margin: 0.6rem 0 0.2rem;
  color: var(--warn);
}
.swaps {
  margin: 0;
}
@media (max-width: 560px) {
  .steps > li {
    gap: 0.6rem;
    padding: 0.75rem;
  }
  .cards img {
    height: 56px;
  }
}
.actions {
  position: sticky;
  bottom: 0;
  padding: 1rem 0;
  background: none;
}
.big {
  width: 100%;
  padding: 0.85rem;
  font-size: 1.15rem;
}
</style>
