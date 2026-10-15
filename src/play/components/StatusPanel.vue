<script setup lang="ts">
// The players, in a row under the board: the killer, then the survivors in turn order — health,
// ▲, item and planned card. Perks, power and passive are in the details (click a tile).
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { components, items } from '../../data'
import { asset } from '../../i18n'
import { ITEM_NAMES, KILLER_BP, SURVIVOR_BP, itemUses, turnOrder } from '../engine/engine'
import type { GameState, ItemUse } from '../engine/types'
import { online } from '../game'
import type { InspectTarget } from '../inspect'
import { KILLER_CARD_BACK, SURVIVOR_CARD_BACK, BEAR_TRAP_IMAGE, cardImage, cardLabel, itemImage, itemUseLabel, killerMini, playerOf, survivorMini } from '../labels'
import Mini from './Mini.vue'

const props = defineProps<{ st: GameState; collapsed: boolean }>()
const emit = defineEmits<{ use: [s: number, use: ItemUse]; inspect: [target: InspectTarget]; pick: [s: number]; collapse: [collapsed: boolean] }>()

/** The item's uses aim at something on the board (a generator, a survivor, a wall). */
const boardItem = (s: number) => itemUses(props.st, s).some((u) => u.k === 'generator' || u.k === 'heal' || u.k === 'wall')

const openItem = ref<number | null>(null)

/** The item being looked at (a modal in the middle of the screen); gone once it is used up. */
const itemOpen = computed(() => {
  const s = openItem.value
  const id = s === null ? null : props.st.survivors[s].item
  if (s === null || !id) return null
  return { s, id, name: ITEM_NAMES[id], text: (items.find((i) => i.id === id)?.text.th ?? '').replaceAll('{BP}', '▲'), uses: itemUses(props.st, s) }
})
watch(itemOpen, (o) => {
  if (!o) openItem.value = null
})
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    openItem.value = null
    peeking.value = null
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const STATUS_TH = { board: '', locker: 'ใน Locker', carried: 'ถูกแบก', hooked: 'บน Hook' }

function showKillerCard(i: number): boolean {
  const k = props.st.killer
  return i < k.revealedCount || k.plannedShown || k.shown.includes(i)
}

function use(s: number, u: ItemUse) {
  openItem.value = null
  emit('use', s, u)
}

const order = (s: number) => turnOrder(props.st).indexOf(s) + 1

// ---------- peeking at your own face-down cards ----------
// Click a face-down card to see your cards big in the middle of the screen; click anywhere to
// put them face down again. Online only the owner can; on one shared device anyone can, so
// players look away as at a real table.

/** Whose cards are being looked at: a survivor index or 'killer'. */
const peeking = ref<number | 'killer' | null>(null)

/** The cards shown while peeking, each with a caption. */
const peekCards = computed(() => {
  const o = peeking.value
  if (o === null) return []
  if (o !== 'killer') {
    const c = props.st.survivors[o].planned
    return c ? [{ card: c, caption: 'การ์ดที่คุณคว่ำไว้', played: false }] : []
  }
  const k = props.st.killer
  return k.planned.map((card, i) => ({
    card,
    caption: `ใบที่ ${i + 1}${i === 0 ? ' (ซ้าย)' : i === 1 ? ' (ขวา)' : ' (โบนัส)'}`,
    played: i < k.revealedCount,
  }))
})
const peekName = computed(() => (peeking.value === null ? '' : peeking.value === 'killer' ? props.st.killer.name : props.st.survivors[peeking.value].name))
watch(
  () => props.st.step,
  () => (peeking.value = null),
)

/** Survivor index, or 'killer', for a face-down card on the tiles. */
function canPeek(owner: number | 'killer'): boolean {
  const o = online.value
  if (!o) return true
  return o.seat === (owner === 'killer' ? 1 : playerOf(props.st, owner))
}

function peek(owner: number | 'killer' | null) {
  peeking.value = owner
}
</script>

<template>
  <section class="players" :class="{ collapsed }">
    <button type="button" class="fold" :title="collapsed ? 'แสดงสถานะผู้เล่น' : 'พับสถานะผู้เล่น — ขยายแผนที่'" :aria-expanded="!collapsed" @click="emit('collapse', !collapsed)">
      {{ collapsed ? '▴' : '▾' }}
    </button>

    <!-- folded: just the portraits, ringed by state; a click still opens the details -->
    <div v-if="collapsed" class="strip">
      <button type="button" class="dot killer" :title="st.killer.name" @click="emit('inspect', { k: 'killer' })">
        <Mini class="dot-mini" :src="asset(killerMini(st))" alt="" />
      </button>
      <button
        v-for="s in turnOrder(st)"
        :key="s"
        type="button"
        class="dot"
        :class="{ wounded: st.survivors[s].wounded, active: st.activeSurvivor === s, away: st.survivors[s].status !== 'board' }"
        :title="`${st.survivors[s].name}${STATUS_TH[st.survivors[s].status] ? ` — ${STATUS_TH[st.survivors[s].status]}` : ''}`"
        @click="emit('inspect', { k: 'survivor', s })"
      >
        <Mini class="dot-mini" :src="asset(survivorMini(st, s))" alt="" />
      </button>
      <span class="muted small">กด ▴ เพื่อดูสถานะผู้เล่น</span>
    </div>

    <div v-else class="tiles">
    <!-- killer -->
    <div class="tile killer" role="button" tabindex="0" :title="`${st.killer.name} — ดูรายละเอียดตัวละคร`" @click="emit('inspect', { k: 'killer' })" @keydown.enter="emit('inspect', { k: 'killer' })">
      <div class="head">
        <Mini class="mini aura-killer" :src="asset(killerMini(st))" :alt="st.killer.name" />
        <div class="names">
          <span class="ptag" title="ผู้เล่น 1">P1</span>
        </div>
      </div>
      <div class="line small">
        <span class="bp">{{ st.killer.bp }}/{{ KILLER_BP.max }} ▲</span>
        <span v-if="st.killer.characterId === 'trapper'" class="traps"><img :src="asset(BEAR_TRAP_IMAGE)" alt="" /> ×{{ st.killer.trapsInSupply }}</span>
        <span v-if="st.killer.characterId === 'hag'" class="traps" title="Phantasm Trap ที่ยังวางได้"
          ><img :src="asset('assets/killers/tokens/hag-phantasm-trap.webp')" alt="" /> ×{{ 7 - st.phantasm.length }}</span
        >
        <span v-if="st.sealedCard" class="warn" title="The Third Seal">ห้ามใช้ {{ st.sealedCard }}</span>
        <span v-if="st.killer.powerUsed" class="muted">ใช้พลังแล้ว</span>
      </div>
      <div class="cards">
        <template v-for="(c, i) in st.killer.planned" :key="i">
          <img
            v-if="showKillerCard(i) || !canPeek('killer')"
            class="pcard"
            :src="asset(showKillerCard(i) ? cardImage(c) : KILLER_CARD_BACK)"
            :alt="showKillerCard(i) ? cardLabel(c) : 'คว่ำ'"
            :class="{ done: i < st.killer.revealedCount - 1 }"
          />
          <button
            v-else
            type="button"
            class="peek"
            title="คลิกเพื่อดูการ์ดที่คุณคว่ำไว้"
            @click.stop="peek('killer')"
          >
            <img class="pcard" :src="asset(KILLER_CARD_BACK)" alt="คว่ำ — คลิกเพื่อดู" />
            <span class="eye" aria-hidden="true">👁</span>
          </button>
        </template>
      </div>
    </div>

    <!-- survivors in turn order -->
    <div
      v-for="s in turnOrder(st)"
      :key="s"
      class="tile"
      :class="{ active: st.activeSurvivor === s, hooked: st.survivors[s].status === 'hooked', wounded: st.survivors[s].wounded }"
      role="button"
      tabindex="0"
      :title="`${order(s)}. ${st.survivors[s].name}${st.survivors[s].wounded ? ' (บาดเจ็บ)' : ''} — ดูรายละเอียดตัวละคร`"
      @click="emit('inspect', { k: 'survivor', s })"
      @keydown.enter="emit('inspect', { k: 'survivor', s })"
    >
      <div class="head">
        <div class="mini-wrap">
          <Mini class="mini" :class="{ wounded: st.survivors[s].wounded }" :src="asset(survivorMini(st, s))" :alt="st.survivors[s].name" />
          <span class="order" :title="`ลำดับเทิร์นที่ ${order(s)}`">{{ order(s) }}</span>
          <img v-if="st.survivors[s].sacrificeToken" class="token" :src="asset(components.sacrificeProgress.image)" alt="" title="ยังมี sacrifice token บนกระดาน" />
          <img v-if="st.firstPlayer === s" class="first" :src="asset(components.firstPlayer.image)" alt="First player" title="First Player" />
        </div>
        <div class="names">
          <span class="ptag" :title="`ผู้เล่น ${playerOf(st, s)}`">P{{ playerOf(st, s) }}</span>
          <span v-if="STATUS_TH[st.survivors[s].status]" class="warn small">{{ STATUS_TH[st.survivors[s].status] }}</span>
        </div>
      </div>
      <div class="line small">
        <span v-if="st.survivors[s].madness" class="madness" title="Madness: ทอย Danger Die แทน Skill Check">🌀</span>
        <span class="bp">{{ st.survivors[s].bp }}/{{ SURVIVOR_BP.max }} ▲</span>
      </div>
      <div class="cards">
        <template v-if="st.survivors[s].planned">
          <img
            v-if="st.survivors[s].plannedRevealed || !canPeek(s)"
            class="pcard"
            :src="asset(st.survivors[s].plannedRevealed ? cardImage(st.survivors[s].planned!) : SURVIVOR_CARD_BACK)"
            :alt="st.survivors[s].plannedRevealed ? cardLabel(st.survivors[s].planned!) : 'คว่ำ'"
          />
          <button
            v-else
            type="button"
            class="peek"
            title="คลิกเพื่อดูการ์ดที่คุณคว่ำไว้"
            @click.stop="peek(s)"
          >
            <img class="pcard" :src="asset(SURVIVOR_CARD_BACK)" alt="คว่ำ — คลิกเพื่อดู" />
            <span class="eye" aria-hidden="true">👁</span>
          </button>
        </template>
        <button
          v-if="st.survivors[s].item"
          class="item"
          :class="{ usable: itemUses(st, s).length > 0 }"
          :title="ITEM_NAMES[st.survivors[s].item!]"
          @click.stop="openItem = openItem === s ? null : s"
        >
          <img :src="asset(itemImage(st.survivors[s].item!))" :alt="ITEM_NAMES[st.survivors[s].item!]" />
        </button>
      </div>
    </div>
    </div>

    <!-- your own face-down cards, big; a click anywhere puts them face down again -->
    <Teleport to="body">
      <div v-if="peeking !== null && peekCards.length" class="peek-backdrop" role="dialog" aria-modal="true" @click="peek(null)">
        <p class="peek-title">การ์ดของ {{ peekName }} <span class="muted">— อย่าให้คนอื่นเห็น</span></p>
        <div class="peek-cards">
          <figure v-for="(c, i) in peekCards" :key="i" class="peek-card" :class="{ played: c.played }">
            <img :src="asset(cardImage(c.card))" :alt="cardLabel(c.card)" />
            <figcaption>
              <b>{{ cardLabel(c.card) }}</b>
              <span class="muted">{{ c.caption }}{{ c.played ? ' · เปิดแล้ว' : '' }}</span>
            </figcaption>
          </figure>
        </div>
        <p class="muted small">คลิกที่ไหนก็ได้เพื่อคว่ำการ์ดกลับ</p>
      </div>
    </Teleport>

    <!-- an item, opened: the card big in the middle of the screen, with what it can do now -->
    <Teleport to="body">
      <div v-if="itemOpen" class="item-backdrop" @click.self="openItem = null">
        <div class="card item-modal" role="dialog" aria-modal="true" :aria-label="itemOpen.name">
          <button class="close" aria-label="ปิด" @click="openItem = null">✕</button>
          <header>
            <Mini class="owner aura-survivor" :src="asset(survivorMini(st, itemOpen.s))" alt="" />
            <div>
              <p class="muted small">{{ st.survivors[itemOpen.s].name }} ถือ</p>
              <h2>{{ itemOpen.name }}</h2>
            </div>
          </header>
          <div class="item-body">
            <img class="item-card" :src="asset(itemImage(itemOpen.id))" :alt="itemOpen.name" />
            <div class="item-side">
              <p class="item-text">{{ itemOpen.text }}</p>
              <div class="buttons">
                <button v-for="(u, i) in itemOpen.uses" :key="i" class="primary" @click="use(itemOpen.s, u)">{{ itemUseLabel(st, itemOpen.s, itemOpen.id, u) }}</button>
                <p v-if="!itemOpen.uses.length" class="muted small">ตอนนี้ยังใช้ไม่ได้</p>
                <button v-if="boardItem(itemOpen.s)" @click="emit('pick', itemOpen.s), (openItem = null)">🗺 เลือกเป้าหมายบนแผนที่</button>
                <button class="ghost" @click="openItem = null">ปิด</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
/* a column on the left of the map (a row under it on narrow screens) */
.players {
  flex: none;
  width: 96px;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.players.collapsed {
  width: 40px;
}
/* the fold handle, on top of the column */
.fold {
  flex: none;
  height: 1.4rem;
  padding: 0;
  font-size: 0.9rem;
  border: 1px solid var(--line);
  background: rgb(17 19 23 / 0.92);
}
.strip {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: center;
  padding: 0.4rem 0;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgb(17 19 23 / 0.92);
}
.dot {
  padding: 0;
  border: none;
  background: none;
  border-radius: 50%;
  line-height: 0;
  box-shadow:
    0 0 0 2px #f2efe6,
    0 0 0 3px rgb(0 0 0 / 0.6);
}
.dot.killer {
  box-shadow: 0 0 0 2px #ff4a3d;
}
.dot.wounded {
  box-shadow: 0 0 0 2px var(--blood-bright);
}
.dot.active {
  box-shadow:
    0 0 0 2px #ffd56a,
    0 0 10px 2px rgb(255 200 90 / 0.8);
}
.dot.away {
  opacity: 0.6;
}
.dot-mini {
  width: 26px;
  height: 26px;
}
.strip .small {
  display: none;
}
.tiles {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
/* one compact row per player: portrait | name, then state | cards — so the board gets the height */
.tile {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 0.05rem 0.3rem;
  padding: 0.3rem 0.35rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgb(17 19 23 / 0.92);
  cursor: pointer;
  transition:
    border-color 0.15s,
    transform 0.15s;
}
.tile:hover,
.tile:focus-visible {
  border-color: var(--line-strong);
  transform: translateY(-2px);
}
.tile.killer {
  border-color: var(--blood-dim);
  background: rgb(92 11 16 / 0.22);
}
.tile.active {
  border-color: rgb(255 214 140 / 0.7);
  background: rgb(255 214 140 / 0.08);
  box-shadow: 0 0 12px rgb(255 214 140 / 0.2);
}
.tile.hooked {
  opacity: 0.75;
}
/* wounded: the whole tile says so, no words needed */
.tile.wounded {
  border-color: var(--blood-bright);
  background: rgb(120 12 18 / 0.35);
  box-shadow:
    inset 0 0 14px rgb(255 40 40 / 0.35),
    0 0 10px rgb(255 30 30 / 0.35);
}
.tile.wounded.active {
  border-color: #ffd56a;
  box-shadow:
    inset 0 0 14px rgb(255 40 40 / 0.45),
    0 0 12px rgb(255 214 140 / 0.35);
}
/* turn order, on the portrait's corner */
.order {
  position: absolute;
  left: -5px;
  top: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  border-radius: 99px;
  background: #0b0c0f;
  border: 1px solid var(--line-strong);
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
}
.head {
  display: contents;
}
.head > .mini,
.head > .mini-wrap {
  grid-row: 1 / 3;
  grid-column: 1;
}
/* portrait | player and state, ▲ ; the cards along the bottom */
.names {
  grid-column: 2;
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  min-width: 0;
}
.ptag {
  flex: none;
  padding: 0 0.3rem;
  border: 1px solid var(--line-strong);
  border-radius: 4px;
  font-size: 0.68rem;
  line-height: 1.35;
  color: var(--muted);
}
.tile .line {
  grid-column: 2;
  flex-wrap: nowrap;
  overflow: hidden;
  white-space: nowrap;
}
.cards {
  grid-column: 1 / -1;
  grid-row: 3;
  margin-top: 0.15rem;
}
.names strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini-wrap {
  position: relative;
  flex: none;
}
.mini {
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: 50%;
  object-fit: contain;
}
.mini.wounded {
  box-shadow: 0 0 0 2px var(--blood-bright);
}
.first {
  position: absolute;
  right: -6px;
  bottom: -4px;
  width: 18px;
}
.line {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 0.5rem;
  align-items: center;
}
.small {
  font-size: 0.76rem;
}
.madness {
  color: #9cff6b;
  font-weight: 700;
}
.ok {
  color: var(--ok);
}
.hurt {
  color: var(--blood-bright);
  font-weight: 700;
}
.warn {
  color: var(--warn);
}
.bp {
  color: #ff8a80;
}
/* the sacrifice token, on the portrait's top-right corner */
.token {
  position: absolute;
  right: -6px;
  top: -5px;
  width: 15px;
}
.traps img {
  width: 18px;
  vertical-align: middle;
}
.cards {
  display: flex;
  gap: 0.25rem;
  align-items: center;
}
.pcard {
  width: 24px;
  border-radius: 3px;
}
.pcard.done {
  opacity: 0.45;
}
/* your own face-down card: press and hold to look */
.peek {
  position: relative;
  padding: 0;
  border: none;
  background: none;
  line-height: 0;
  cursor: zoom-in;
  touch-action: none;
  user-select: none;
}
.peek:hover .pcard {
  outline: 2px solid #ffe9b0;
}
.peek-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 1rem;
  padding: 1rem;
  background: rgb(4 5 7 / 0.88);
  backdrop-filter: blur(5px);
  cursor: pointer;
  animation: fade 0.15s ease-out;
}
.peek-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
}
.peek-cards {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1.5rem;
}
.peek-card {
  margin: 0;
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  animation: rise 0.25s cubic-bezier(0.2, 1.3, 0.4, 1);
}
.peek-card img {
  width: min(220px, 38vw);
  aspect-ratio: 0.72;
  object-fit: cover;
  border-radius: 14px;
  box-shadow:
    0 0 0 3px #ffe9b0,
    0 0 30px rgb(255 214 140 / 0.5),
    0 20px 40px rgb(0 0 0 / 0.8);
}
.peek-card.played img {
  opacity: 0.5;
  box-shadow: 0 0 0 2px var(--line-strong);
}
.peek-card figcaption {
  display: grid;
  justify-items: center;
  font-size: 0.95rem;
}
.eye {
  position: absolute;
  right: -5px;
  bottom: -4px;
  font-size: 0.7rem;
  line-height: 1;
  filter: drop-shadow(0 0 2px #000);
}
.item {
  padding: 0;
  width: 28px;
  border: 1px solid var(--line-strong);
}
.item img {
  display: block;
  width: 100%;
}
.item.usable {
  border-color: #ffe9b0;
  box-shadow: 0 0 10px rgb(255 214 140 / 0.55);
}
/* the item modal */
.item-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(4 5 7 / 0.78);
  backdrop-filter: blur(4px);
  animation: fade 0.18s ease-out;
}
.item-modal {
  position: relative;
  width: min(40rem, 100%);
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  display: grid;
  gap: 0.9rem;
  border-color: #f5c542;
  box-shadow:
    0 0 0 1px rgb(245 197 66 / 0.4),
    0 0 40px rgb(245 197 66 / 0.25),
    0 20px 50px rgb(0 0 0 / 0.8);
  animation: rise 0.25s cubic-bezier(0.2, 1.3, 0.4, 1);
}
.item-modal header {
  display: flex;
  gap: 0.8rem;
  align-items: center;
  padding-right: 2.5rem;
}
.item-modal h2 {
  margin: 0;
}
.item-modal header p {
  margin: 0;
}
.owner {
  width: 52px;
  height: 52px;
}
.close {
  position: absolute;
  right: 0.6rem;
  top: 0.6rem;
  padding: 0.2rem 0.6rem;
}
.item-body {
  display: grid;
  grid-template-columns: minmax(10rem, 15rem) 1fr;
  gap: 1rem;
  align-items: start;
}
.item-card {
  width: 100%;
  border-radius: 10px;
  box-shadow: 0 0 24px rgb(245 197 66 / 0.35);
}
.item-side {
  display: grid;
  gap: 0.8rem;
}
.item-text {
  margin: 0;
  line-height: 1.6;
}
@keyframes fade {
  from {
    opacity: 0;
  }
}
@keyframes rise {
  from {
    transform: translateY(20px) scale(0.96);
    opacity: 0;
  }
}
@media (max-width: 560px) {
  .item-body {
    grid-template-columns: 1fr;
  }
}
.buttons {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  align-items: stretch;
}
.ghost {
  background: none;
}
.names {
  flex-wrap: wrap;
  row-gap: 0;
}
/* narrow screens: the map takes the width, the tiles go back to a row under it */
@media (max-width: 980px) {
  .players,
  .players.collapsed {
    width: auto;
    flex-direction: row;
  }
  .fold {
    height: auto;
    width: 1.6rem;
  }
  .strip {
    flex: 1;
    flex-direction: row;
    padding: 0.2rem 0.4rem;
  }
  .tiles {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  }
}
</style>
