<script setup lang="ts">
// Planning phase on one shared device (p.8): survivors pick their cards together, then the
// device goes to the killer behind a hand-off curtain so the survivors don't see the picks.
import { computed, ref, watch } from 'vue'
import { asset } from '../../../src/i18n'
import { sfx } from '../../../src/sound'
import { turnOrder } from '../engine/engine'
import { dispatch } from '../game'
import type { GameState, MoveCard } from '../engine/types'
import { KILLER_CARD_BACK, cardImage, cardLabel, killerMini, playerOf, survivorMini } from '../labels'
import Mini from './Mini.vue'

const props = defineProps<{ st: GameState }>()

const curtainOpen = ref(false)
watch(
  () => props.st.step.t,
  () => (curtainOpen.value = false),
)

// ---------- survivors ----------

const picks = ref<(MoveCard | null)[]>([null, null, null, null])
watch(
  () => props.st.round,
  () => (picks.value = [null, null, null, null]),
)

const planners = computed(() => turnOrder(props.st).filter((i) => props.st.survivors[i].status !== 'hooked'))

/** Cards survivor `s` may still pick: their hand minus what a hand-mate already took. */
function available(s: number): MoveCard[] {
  const sv = props.st.survivors[s]
  const hand = [...props.st.survivorHands[sv.hand]]
  props.st.survivors.forEach((o, j) => {
    const c = picks.value[j]
    if (j !== s && o.hand === sv.hand && c) hand.splice(hand.indexOf(c), 1)
  })
  return hand
}

function pick(s: number, c: MoveCard) {
  sfx.click()
  picks.value[s] = picks.value[s] === c ? null : c
}

const survivorsReady = computed(() => planners.value.every((s) => picks.value[s]))

function confirmSurvivors() {
  const cards = props.st.survivors.map((sv, i) => (sv.status === 'hooked' ? null : picks.value[i]))
  if (dispatch({ t: 'planSurvivors', cards })) {
    sfx.select()
    picks.value = [null, null, null, null]
  }
}

// ---------- killer ----------

const killerPicks = ref<MoveCard[]>([])

function pickKiller(c: MoveCard) {
  sfx.click()
  const i = killerPicks.value.indexOf(c)
  if (i >= 0) killerPicks.value.splice(i, 1)
  else if (killerPicks.value.length < 2) killerPicks.value.push(c)
}

function confirmKiller() {
  if (dispatch({ t: 'planKiller', cards: [...killerPicks.value] })) {
    sfx.entity()
    killerPicks.value = []
  }
}
</script>

<template>
  <!-- teleported: the sidebar is sticky, which would trap the curtain under the board -->
  <Teleport v-if="!curtainOpen" to="body">
  <div class="overlay">
    <!-- hand-off curtain -->
    <button class="curtain" @click="(curtainOpen = true), sfx.click()">
      <template v-if="st.step.t === 'planSurvivors'">
        <span class="eyebrow">รอบ {{ st.round }} · วางแผน</span>
        <strong>ส่งเครื่องให้ฝ่ายผู้รอดชีวิต</strong>
        <span class="muted">ฆาตกรห้ามดูจอ — แตะเพื่อเริ่ม</span>
      </template>
      <template v-else>
        <Mini class="curtain-mini aura-killer" :src="asset(killerMini(st))" alt="" />
        <strong>ส่งเครื่องให้ฆาตกร ({{ st.killer.name }})</strong>
        <span class="muted">ผู้รอดชีวิตห้ามดูจอ — แตะเพื่อเริ่ม</span>
      </template>
    </button>
  </div>
  </Teleport>

  <section v-else-if="st.step.t === 'planSurvivors'" class="card panel">
      <h2>ผู้รอดชีวิต: เลือกการ์ดเคลื่อนที่คนละ 1 ใบ</h2>
      <p class="muted">คุยกันได้ แต่ต้องพูดให้ฆาตกรได้ยิน (หน้า 8) การ์ดจะคว่ำไว้จนถึงเทิร์นของแต่ละคน</p>
      <div class="rows">
        <div v-for="s in planners" :key="s" class="row">
          <div class="who">
            <Mini class="mini" :src="asset(survivorMini(st, s))" alt="" />
            <div>
              <strong>{{ st.survivors[s].name }}</strong>
              <div class="muted small">ผู้เล่น {{ playerOf(st, s) }}</div>
            </div>
          </div>
          <div class="cards">
            <button
              v-for="c in [...new Set([...available(s), ...(picks[s] ? [picks[s]!] : [])])]"
              :key="c"
              class="mcard"
              :class="{ on: picks[s] === c }"
              :title="cardLabel(c)"
              @click="pick(s, c)"
            >
              <img :src="asset(cardImage(c))" :alt="cardLabel(c)" />
            </button>
          </div>
        </div>
      </div>
      <p v-for="(sv, i) in st.survivors" v-show="sv.status === 'hooked'" :key="i" class="muted small">{{ sv.name }} อยู่บน Hook — ไม่วางการ์ด</p>
      <button class="primary" :disabled="!survivorsReady" @click="confirmSurvivors">ยืนยัน แล้วส่งให้ฆาตกร</button>
    </section>

    <section v-else class="card panel">
      <h2>{{ st.killer.name }}: เลือกการ์ด 2 ใบ (ซ้าย → ขวา)</h2>
      <p class="muted">เล่นใบซ้ายก่อน แล้วใบขวา; Wait = อยู่กับที่แต่ยัง Interact ได้</p>
      <div class="slots">
        <div v-for="i in [0, 1]" :key="i" class="slot">
          <span class="muted small">{{ i === 0 ? 'เทิร์น 1 (ซ้าย)' : 'เทิร์น 2 (ขวา)' }}</span>
          <img v-if="killerPicks[i]" :src="asset(cardImage(killerPicks[i]))" :alt="cardLabel(killerPicks[i])" />
          <img v-else class="empty" :src="asset(KILLER_CARD_BACK)" alt="" />
        </div>
      </div>
      <div class="cards">
        <button v-for="c in st.killer.hand" :key="c" class="mcard" :class="{ on: killerPicks.includes(c) }" :title="cardLabel(c)" @click="pickKiller(c)">
          <img :src="asset(cardImage(c))" :alt="cardLabel(c)" />
        </button>
      </div>
      <button class="primary" :disabled="killerPicks.length !== 2" @click="confirmKiller">ยืนยัน — เริ่มรอบ</button>
    </section>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(4 5 7 / 0.97);
  backdrop-filter: blur(6px);
  overflow-y: auto;
}
.curtain {
  display: grid;
  gap: 0.6rem;
  justify-items: center;
  padding: 3rem 2.5rem;
  max-width: 34rem;
  width: 100%;
  background: rgb(17 19 23 / 0.95);
  border: 1px solid var(--blood-dim);
  font-size: 1.1rem;
}
.curtain strong {
  font-size: 1.6rem;
}
.curtain-mini {
  width: 96px;
  height: 96px;
  border-radius: 50%;
}
.eyebrow {
  color: var(--blood-bright);
  letter-spacing: 0.12em;
}
.panel {
  display: grid;
  gap: 0.75rem;
}
.panel h2 {
  font-size: 1.1rem;
}
.panel p {
  margin: 0;
  font-size: 0.88rem;
}
.rows {
  display: grid;
  gap: 0.75rem;
}
.row {
  display: grid;
  gap: 0.4rem;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid var(--line);
}
.who {
  display: flex;
  gap: 0.6rem;
  align-items: center;
}
.mini {
  width: 40px;
  height: 40px;
  object-fit: contain;
}
.small {
  font-size: 0.85rem;
}
.cards,
.slots {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.mcard {
  padding: 0;
  border: 2px solid transparent;
  background: none;
  border-radius: 6px;
  width: 58px;
}
.mcard img,
.slot img {
  display: block;
  width: 100%;
  border-radius: 4px;
}
.mcard.on {
  border-color: #ffe9b0;
  box-shadow: 0 0 14px rgb(255 214 140 / 0.7);
  transform: translateY(-4px);
}
.slot {
  display: grid;
  gap: 0.25rem;
  width: 84px;
  text-align: center;
}
.slot img.empty {
  opacity: 0.3;
}
</style>
