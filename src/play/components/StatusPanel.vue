<script setup lang="ts">
// The players, in a row under the board: the killer, then the survivors in turn order — health,
// ▲, item and planned card. Perks, power and passive are in the details (click a tile).
import { ref } from 'vue'
import { components } from '../../data'
import { asset } from '../../i18n'
import { ITEM_NAMES, KILLER_BP, SURVIVOR_BP, itemUses, turnOrder } from '../engine/engine'
import type { GameState, ItemUse } from '../engine/types'
import { online } from '../game'
import type { InspectTarget } from '../inspect'
import { KILLER_CARD_BACK, SURVIVOR_CARD_BACK, BEAR_TRAP_IMAGE, cardImage, cardLabel, itemImage, itemUseLabel, killerMini, playerOf, survivorMini } from '../labels'
import Mini from './Mini.vue'

const props = defineProps<{ st: GameState }>()
const emit = defineEmits<{ use: [s: number, use: ItemUse]; inspect: [target: InspectTarget]; pick: [s: number] }>()

/** The item's uses aim at something on the board (a generator, a survivor, a wall). */
const boardItem = (s: number) => itemUses(props.st, s).some((u) => u.k === 'generator' || u.k === 'heal' || u.k === 'wall')

const openItem = ref<number | null>(null)

const STATUS_TH = { board: '', locker: 'ซ่อนใน Locker', carried: 'ถูกแบก', hooked: 'บน Hook' }

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
// Press and hold a face-down card to see it (released, it's face down again). Online only the
// owner can; on one shared device anyone can, so players look away as at a real table.

const peeking = ref<string | null>(null)

/** Survivor index, or 'killer', for a face-down card on the tiles. */
function canPeek(owner: number | 'killer'): boolean {
  const o = online.value
  if (!o) return true
  return o.seat === (owner === 'killer' ? 1 : playerOf(props.st, owner))
}

function peek(key: string | null) {
  peeking.value = key
}
</script>

<template>
  <section class="players">
    <!-- killer -->
    <div class="tile killer" role="button" tabindex="0" title="ดูรายละเอียดตัวละคร" @click="emit('inspect', { k: 'killer' })" @keydown.enter="emit('inspect', { k: 'killer' })">
      <div class="head">
        <Mini class="mini aura-killer" :src="asset(killerMini(st))" alt="" />
        <div class="names">
          <strong>{{ st.killer.name }}</strong>
          <span class="muted small">ผู้เล่น 1</span>
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
            :title="`กดค้างเพื่อดูการ์ดใบที่ ${i + 1} ของคุณ`"
            @pointerdown.stop="peek(`k${i}`)"
            @pointerup="peek(null)"
            @pointerleave="peek(null)"
            @pointercancel="peek(null)"
            @click.stop
            @contextmenu.prevent
          >
            <img class="pcard" :src="asset(peeking === `k${i}` ? cardImage(c) : KILLER_CARD_BACK)" :alt="peeking === `k${i}` ? cardLabel(c) : 'คว่ำ — กดค้างเพื่อดู'" />
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
      :class="{ active: st.activeSurvivor === s, hooked: st.survivors[s].status === 'hooked' }"
      role="button"
      tabindex="0"
      title="ดูรายละเอียดตัวละคร"
      @click="emit('inspect', { k: 'survivor', s })"
      @keydown.enter="emit('inspect', { k: 'survivor', s })"
    >
      <div class="head">
        <div class="mini-wrap">
          <Mini class="mini" :class="{ wounded: st.survivors[s].wounded }" :src="asset(survivorMini(st, s))" alt="" />
          <img v-if="st.firstPlayer === s" class="first" :src="asset(components.firstPlayer.image)" alt="First player" title="First Player" />
        </div>
        <div class="names">
          <strong>{{ order(s) }}. {{ st.survivors[s].name }}</strong>
          <span class="muted small">ผู้เล่น {{ playerOf(st, s) }}</span>
        </div>
      </div>
      <div class="line small">
        <span :class="st.survivors[s].wounded ? 'hurt' : 'ok'">{{ st.survivors[s].wounded ? 'บาดเจ็บ' : 'ปกติ' }}</span>
        <span v-if="STATUS_TH[st.survivors[s].status]" class="warn">{{ STATUS_TH[st.survivors[s].status] }}</span>
        <span v-if="st.survivors[s].madness" class="madness" title="Madness: ทอย Danger Die แทน Skill Check">🌀 Madness</span>
        <span class="bp">{{ st.survivors[s].bp }}/{{ SURVIVOR_BP.max }} ▲</span>
        <img v-if="st.survivors[s].sacrificeToken" class="token" :src="asset(components.sacrificeProgress.image)" alt="" title="ยังมี sacrifice token บนกระดาน" />
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
            title="กดค้างเพื่อดูการ์ดที่คุณคว่ำไว้"
            @pointerdown.stop="peek(`s${s}`)"
            @pointerup="peek(null)"
            @pointerleave="peek(null)"
            @pointercancel="peek(null)"
            @click.stop
            @contextmenu.prevent
          >
            <img
              class="pcard"
              :src="asset(peeking === `s${s}` ? cardImage(st.survivors[s].planned!) : SURVIVOR_CARD_BACK)"
              :alt="peeking === `s${s}` ? cardLabel(st.survivors[s].planned!) : 'คว่ำ — กดค้างเพื่อดู'"
            />
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
      <div v-if="openItem === s && st.survivors[s].item" class="item-menu" @click.stop>
        <img :src="asset(itemImage(st.survivors[s].item!))" alt="" />
        <div class="buttons">
          <button v-for="(u, i) in itemUses(st, s)" :key="i" @click="use(s, u)">{{ itemUseLabel(st, s, st.survivors[s].item!, u) }}</button>
          <span v-if="!itemUses(st, s).length" class="muted small">ใช้ตอนนี้ไม่ได้</span>
          <button v-if="boardItem(s)" @click="emit('pick', s), (openItem = null)">🗺 เลือกเป้าหมายบนแผนที่</button>
          <button @click="emit('inspect', { k: 'item', id: st.survivors[s].item! }), (openItem = null)">ดูการ์ด</button>
          <button class="ghost" @click="openItem = null">ปิด</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.players {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.5rem;
}
.tile {
  position: relative;
  display: grid;
  align-content: start;
  gap: 0.35rem;
  padding: 0.5rem 0.6rem;
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
.head {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  min-width: 0;
}
.names {
  display: grid;
  min-width: 0;
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
  width: 40px;
  height: 40px;
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
  font-size: 0.8rem;
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
.token {
  width: 16px;
}
.traps img {
  width: 18px;
  vertical-align: middle;
}
.cards {
  display: flex;
  gap: 0.3rem;
  align-items: center;
  min-height: 34px;
}
.pcard {
  width: 28px;
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
.peek:active .pcard {
  transform: scale(2.4) translateY(-30%);
  position: relative;
  z-index: 30;
  box-shadow: 0 8px 20px rgb(0 0 0 / 0.8);
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
  width: 32px;
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
/* the item's uses open above its tile */
.item-menu {
  position: absolute;
  z-index: 20;
  left: 0;
  bottom: calc(100% + 6px);
  width: max(100%, 300px);
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 0.6rem;
  padding: 0.5rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: rgb(12 13 16 / 0.97);
  box-shadow: 0 12px 30px rgb(0 0 0 / 0.6);
  cursor: default;
}
.item-menu > img {
  width: 100%;
  border-radius: 4px;
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
</style>
