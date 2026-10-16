<script setup lang="ts">
// Planning phase (p.8). The movement cards are held in a fan along the bottom of the screen
// (CardHand): point at one to draw it up and see where it goes on the map, click to pick it —
// it stays drawn up until the choice is confirmed here. A player with several survivors
// switches between them with the tabs. On one shared device the survivors pick together, then
// the device goes to the killer behind a hand-off curtain.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { asset } from '../../i18n'
import { sfx } from '../../sound'
import { CARD_NAMES, roomName, turnOrder } from '../engine/engine'
import { KILLER_PLAYER, handsToPlan } from '../engine/seats'
import type { GameState, MoveCard } from '../engine/types'
import { choicePreview, preview } from '../focus'
import { dispatch, online } from '../game'
import { KILLER_CARD_BACK, SURVIVOR_CARD_BACK, cardImage, cardLabel, killerMini, playerOf, survivorMini } from '../labels'
import CardHand, { type HandCard } from './CardHand.vue'
import Mini from './Mini.vue'

const props = defineProps<{ st: GameState }>()

/**
 * Online, planning runs for everyone at once: the killer picks his two cards while the survivors
 * pick theirs, and the round starts once the last player confirms. On one shared device the
 * survivors still plan first and the device then goes to the killer.
 */
const killerSeat = computed(() => online.value?.seat === KILLER_PLAYER)
const planningKiller = computed(() => props.st.step.t === 'planKiller' || killerSeat.value)

/** Stridor: that survivor sets their card first, face up, before anyone else plans. */
const stridorStep = computed(() => (props.st.step.t === 'planStridor' ? props.st.step.s : null))
/** The card Stridor has already turned face up, for everyone who plans after it. */
const stridorCard = computed(() => {
  const s = props.st.stridor
  if (s === null || props.st.step.t === 'planStridor') return null
  const sv = props.st.survivors[s]
  return sv.plannedRevealed && sv.planned ? { name: sv.name, card: sv.planned } : null
})

const stridorPick = ref<MoveCard | null>(null)
watch(
  () => props.st.step,
  () => (stridorPick.value = null),
)
const stridorHand = computed<HandCard[]>(() =>
  stridorStep.value === null ? [] : [...new Set(props.st.survivorHands[props.st.survivors[stridorStep.value].hand])].map((card) => ({ card, picked: stridorPick.value === card })),
)

function pickStridor(card: MoveCard) {
  sfx.click()
  stridorPick.value = stridorPick.value === card ? null : card
}

function confirmStridor() {
  if (!stridorPick.value) return
  if (dispatch({ t: 'planStridor', card: stridorPick.value })) {
    sfx.select()
    stridorPick.value = null
    preview.value = null
  }
}

// Online every player has their own screen, so there is no curtain to pass behind.
const curtainOpen = ref(!!online.value)
watch(
  () => props.st.step.t,
  () => (curtainOpen.value = !!online.value),
)

function hover(card: MoveCard | null, owner: number | 'killer') {
  if (!card) return (preview.value = null)
  const room = owner === 'killer' ? props.st.killer.room : props.st.survivors[owner].room
  preview.value = choicePreview(props.st, { card }, room, owner)
}
onBeforeUnmount(() => (preview.value = null))

// ---------- survivors ----------

const picks = ref<(MoveCard | null)[]>([null, null, null, null])
watch(
  () => props.st.round,
  () => (picks.value = [null, null, null, null]),
)

/** Online: the hand this player still has to plan (each player holds one survivor hand). */
const myHand = computed(() => {
  const o = online.value
  return o ? (handsToPlan(props.st).find((h) => props.st.handPlayers[h] === o.seat) ?? null) : null
})

const planners = computed(() =>
  turnOrder(props.st).filter(
    (i) => props.st.survivors[i].status !== 'hooked' && props.st.survivors[i].planned === null && (!online.value || props.st.survivors[i].hand === myHand.value),
  ),
)

/** The survivor the hand is being played for (a tab per survivor when there are several). */
const current = ref<number | null>(null)
watch(
  planners,
  (list) => {
    if (current.value === null || !list.includes(current.value)) current.value = list[0] ?? null
  },
  { immediate: true },
)

/** The current survivor's hand: what they picked, and what a hand-mate already took. */
const survivorHand = computed<HandCard[]>(() => {
  const s = current.value
  if (s === null) return []
  const sv = props.st.survivors[s]
  return [...new Set(props.st.survivorHands[sv.hand])].map((card) => {
    const mate = props.st.survivors.findIndex((o, j) => j !== s && o.hand === sv.hand && picks.value[j] === card)
    return { card, picked: picks.value[s] === card, ...(mate >= 0 ? { takenBy: survivorMini(props.st, mate) } : {}) }
  })
})

function pickSurvivorCard(card: MoveCard) {
  const s = current.value
  if (s === null) return
  sfx.click()
  if (picks.value[s] === card) {
    picks.value[s] = null
    return
  }
  // a card a hand-mate holds moves over to this survivor
  const sv = props.st.survivors[s]
  props.st.survivors.forEach((o, j) => {
    if (j !== s && o.hand === sv.hand && picks.value[j] === card) picks.value[j] = null
  })
  picks.value[s] = card
}

const survivorsLeft = computed(() => planners.value.filter((s) => !picks.value[s]).length)

function confirmSurvivors() {
  // on a hook, or already face up from Stridor: no card from here
  const cards = props.st.survivors.map((sv, i) => (sv.status === 'hooked' || sv.planned !== null ? null : picks.value[i]))
  const action = online.value && myHand.value !== null ? { t: 'planHand' as const, hand: myHand.value, cards } : { t: 'planSurvivors' as const, cards }
  if (dispatch(action)) {
    sfx.select()
    picks.value = [null, null, null, null]
    preview.value = null
  }
}

// ---------- killer ----------

/**
 * The two slots (left, right): the place in the hand of the card set there, or null. By place,
 * as The Blight's hand holds two of each card.
 */
const killerSlots = ref<(number | null)[]>([null, null])
const killerPicks = computed(() => killerSlots.value.map((h) => (h === null ? null : props.st.killer.hand[h])))
const killerReady = computed(() => killerSlots.value.every((h) => h !== null))
const SIDE = ['ซ้าย', 'ขวา']

/** Places in the hand holding `card` (two for each card in The Blight's hand). */
const copiesOf = (card: MoveCard) => props.st.killer.hand.flatMap((c, h) => (c === card ? [h] : []))

/** One card per kind, with how many copies there are: The Blight's 8 cards show as 4. */
const killerHand = computed<HandCard[]>(() =>
  [...new Set(props.st.killer.hand)].map((card) => {
    const copies = copiesOf(card)
    const sides = killerSlots.value.flatMap((h, i) => (h !== null && copies.includes(h) ? [SIDE[i]] : []))
    return { card, picked: sides.length > 0, ...(sides.length ? { badge: sides.join(' + ') } : {}), ...(copies.length > 1 ? { count: copies.length - sides.length } : {}) }
  }),
)

/**
 * Click a kind in the hand: one more copy of it into the first empty slot while there is a copy
 * and a slot; otherwise its right-most pick comes back. With both slots taken by other cards, it
 * replaces the right-hand one. A slot's own card is taken back by clicking it in the panel.
 */
function pickKiller(card: MoveCard) {
  sfx.click()
  const slots = killerSlots.value
  const copies = copiesOf(card)
  const mine = slots.flatMap((h, i) => (h !== null && copies.includes(h) ? [i] : []))
  const free = copies.filter((h) => !slots.includes(h))
  const empty = slots.indexOf(null)
  if (mine.length && (!free.length || empty < 0)) slots[mine[mine.length - 1]] = null
  else if (empty >= 0) slots[empty] = free[0]
  else slots[1] = free[0]
}

/** Take back the card in one slot (left or right); the slot stays empty for the next pick. */
function clearSlot(i: number) {
  if (killerSlots.value[i] === null) return
  sfx.click()
  killerSlots.value[i] = null
}

function swapKiller() {
  sfx.click()
  killerSlots.value.reverse()
}

function confirmKiller() {
  if (!killerReady.value) return
  if (dispatch({ t: 'planKiller', cards: killerPicks.value as MoveCard[] })) {
    sfx.entity()
    killerSlots.value = [null, null]
    preview.value = null
  }
}
</script>

<template>
  <!-- teleported: the sidebar is sticky, which would trap the curtain under the board -->
  <Teleport v-if="!curtainOpen" to="body">
    <div class="overlay">
      <!-- hand-off curtain -->
      <button class="curtain" @click="(curtainOpen = true), sfx.click()">
        <template v-if="stridorStep !== null">
          <span class="eyebrow">รอบ {{ st.round }} · Stridor</span>
          <strong>ส่งเครื่องให้ {{ st.survivors[stridorStep].name }}</strong>
          <span class="muted">ต้องเปิดการ์ดหงายก่อนใคร — แตะเพื่อเริ่ม</span>
        </template>
        <template v-else-if="st.step.t === 'planSurvivors'">
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

  <!-- Stridor: this survivor commits first, face up (the card: "before you or any other Survivor") -->
  <section v-else-if="stridorStep !== null" class="card panel">
    <h2>Stridor: {{ st.survivors[stridorStep].name }} ต้องเปิดการ์ดก่อน</h2>
    <p class="muted">
      ฆาตกรใช้ Stridor กับ {{ st.survivors[stridorStep].name }} — เลือกการ์ด 1 ใบแล้ว<b>หงายหน้า</b>ให้ทุกคนเห็น ก่อนที่ผู้รอดชีวิตคนอื่นและฆาตกรจะวางแผน
    </p>
    <p class="hint">👇 ชี้ไพ่บนมือด้านล่างเพื่อดูเส้นทางบนแผนที่ · คลิกเพื่อเลือก</p>
    <button class="primary" :disabled="!stridorPick" @click="confirmStridor">
      {{ stridorPick ? `ยืนยัน: ${CARD_NAMES[stridorPick]} (หงายหน้า)` : 'เลือกการ์ดก่อน' }}
    </button>
    <CardHand
      :cards="stridorHand"
      :label="`มือของ ${st.survivors[stridorStep].name}`"
      prompt="Stridor — เปิดการ์ดหงายก่อนใคร"
      @pick="pickStridor"
      @hover="hover($event, stridorStep)"
    />
  </section>

  <!-- survivors -->
  <section v-else-if="!planningKiller" class="card panel">
    <h2>วางแผน: เลือกการ์ดเคลื่อนที่คนละ 1 ใบ</h2>
    <p class="muted">คุยกันได้ แต่ต้องพูดให้ฆาตกรได้ยิน (หน้า 8) — การ์ดจะคว่ำไว้จนถึงเทิร์นของแต่ละคน</p>
    <p v-if="stridorCard" class="stridor-note">👁 Stridor: {{ stridorCard.name }} เปิดไว้แล้ว — <b>{{ CARD_NAMES[stridorCard.card] }}</b></p>

    <!-- whose card is being picked: a tab per survivor -->
    <div class="tabs" role="tablist">
      <button
        v-for="s in planners"
        :key="s"
        type="button"
        role="tab"
        class="tab"
        :class="{ on: current === s, done: !!picks[s] }"
        :aria-selected="current === s"
        @click="(current = s), sfx.click()"
      >
        <Mini class="mini" :src="asset(survivorMini(st, s))" alt="" />
        <span class="tab-text">
          <strong>{{ st.survivors[s].name }}</strong>
          <small class="muted">ผู้เล่น {{ playerOf(st, s) }} · {{ roomName(st, st.survivors[s].room) }}</small>
        </span>
        <img class="tab-card" :class="{ empty: !picks[s] }" :src="asset(picks[s] ? cardImage(picks[s]!) : SURVIVOR_CARD_BACK)" :alt="picks[s] ? cardLabel(picks[s]!) : 'ยังไม่เลือก'" />
      </button>
    </div>
    <p v-for="(sv, i) in st.survivors" v-show="sv.status === 'hooked'" :key="i" class="muted small">{{ sv.name }} อยู่บน Hook — ไม่วางการ์ด</p>

    <p class="hint">👇 ชี้ไพ่บนมือด้านล่างเพื่อดึงขึ้นมาดูเส้นทางบนแผนที่ · คลิกเพื่อเลือก (คลิกซ้ำเพื่อเก็บคืน)</p>
    <button class="primary" :disabled="survivorsLeft > 0" @click="confirmSurvivors">
      {{ survivorsLeft > 0 ? `เลือกอีก ${survivorsLeft} ตัว` : online ? 'ยืนยัน (คว่ำการ์ดไว้)' : 'ยืนยัน แล้วส่งให้ฆาตกร' }}
    </button>

    <CardHand
      v-if="current !== null"
      :cards="survivorHand"
      :label="`มือของ ${st.survivors[current].name}${picks[current] ? ` — เลือก ${CARD_NAMES[picks[current]!]}` : ''}`"
      @pick="pickSurvivorCard"
      @hover="hover($event, current)"
    />
  </section>

  <!-- killer -->
  <section v-else class="card panel">
    <h2>{{ st.killer.name }}: เลือกการ์ด 2 ใบ</h2>
    <p class="muted">ใบซ้ายเล่นเทิร์นแรก แล้วใบขวา · Wait = อยู่กับที่แต่ยัง Interact ได้</p>
    <p v-if="st.step.t === 'planSurvivors'" class="muted small">วางแผนพร้อมกับผู้รอดชีวิต — การ์ดของพวกเขาคว่ำอยู่ รอบจะเริ่มเมื่อทุกคนยืนยันครบ</p>
    <p v-if="stridorCard" class="stridor-note">👁 Stridor: {{ stridorCard.name }} เปิดไว้แล้ว — <b>{{ CARD_NAMES[stridorCard.card] }}</b></p>
    <div class="slots">
      <button v-for="i in [0, 1]" :key="i" type="button" class="slot" :class="{ filled: killerPicks[i] }" :disabled="!killerPicks[i]" :title="killerPicks[i] ? 'คลิกเพื่อเอาใบนี้ออก' : ''" @click="clearSlot(i)">
        <span class="muted small">{{ i === 0 ? 'เทิร์น 1 (ซ้าย)' : 'เทิร์น 2 (ขวา)' }}</span>
        <img v-if="killerPicks[i]" :src="asset(cardImage(killerPicks[i]!))" :alt="cardLabel(killerPicks[i]!)" />
        <img v-else class="empty" :src="asset(KILLER_CARD_BACK)" alt="" />
        <span v-if="killerPicks[i]" class="remove" aria-hidden="true">✕</span>
      </button>
      <button type="button" class="swap" :disabled="!killerReady" title="สลับซ้าย / ขวา" @click="swapKiller">⇄ สลับ</button>
    </div>
    <p class="hint">👇 ชี้ไพ่บนมือด้านล่างเพื่อดึงขึ้นมาดู · คลิกเพื่อเลือก (ใบแรก = ซ้าย)</p>
    <p class="muted small">คลิกการ์ดในช่องเพื่อเอาใบนั้นออก</p>
    <button class="primary" :disabled="!killerReady" @click="confirmKiller">
      {{ st.step.t === 'planSurvivors' ? 'ยืนยัน (คว่ำการ์ดไว้)' : 'ยืนยัน — เริ่มรอบ' }}
    </button>

    <CardHand
      :cards="killerHand"
      :label="`มือของ ${st.killer.name} — เลือกแล้ว ${killerPicks.filter(Boolean).length}/2`"
      @pick="pickKiller"
      @hover="hover($event, 'killer')"
    />
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
.hint {
  padding: 0.4rem 0.6rem;
  border: 1px dashed var(--line-strong);
  border-radius: 6px;
  color: var(--muted);
}
/* the card Stridor turned face up: everyone plans knowing it */
.stridor-note {
  padding: 0.4rem 0.6rem;
  border: 1px solid #8a5cff;
  border-radius: 6px;
  background: rgb(138 92 255 / 0.12);
  color: #e0d0ff;
}
.tabs {
  display: grid;
  gap: 0.4rem;
}
.tab {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.6rem;
  align-items: center;
  padding: 0.35rem 0.5rem;
  text-align: left;
  border: 1px solid var(--line);
  background: rgb(0 0 0 / 0.2);
}
.tab.on {
  border-color: #ffe9b0;
  background: rgb(255 214 140 / 0.1);
  box-shadow: 0 0 10px rgb(255 214 140 / 0.25);
}
.tab-text {
  display: grid;
  min-width: 0;
}
.tab-text small {
  font-size: 0.78rem;
}
.tab-card {
  width: 34px;
  aspect-ratio: 0.72;
  object-fit: cover;
  border-radius: 4px;
}
.tab-card.empty {
  opacity: 0.35;
}
.mini {
  width: 40px;
  height: 40px;
  object-fit: contain;
}
.small {
  font-size: 0.85rem;
}
.slots {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 0.5rem;
}
.slot {
  display: grid;
  gap: 0.25rem;
  width: 84px;
  text-align: center;
}
.slot img {
  display: block;
  width: 100%;
  aspect-ratio: 0.72;
  object-fit: cover;
  border-radius: 6px;
}
.slot img.empty {
  opacity: 0.3;
}
button.slot {
  position: relative;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
}
button.slot:disabled {
  opacity: 1;
  cursor: default;
}
button.slot.filled:hover img {
  outline: 2px solid #ff8a80;
  filter: brightness(0.7);
}
.remove {
  position: absolute;
  right: -6px;
  top: 1.1rem;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--blood);
  color: #fff;
  font-size: 0.75rem;
}
.swap {
  align-self: center;
  padding: 0.35rem 0.7rem;
}
</style>
