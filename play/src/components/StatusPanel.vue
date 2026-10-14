<script setup lang="ts">
// Tracks, the killer and the four survivors: health, ▲, item and planned card.
import { ref } from 'vue'
import { components } from '../../../src/data'
import { asset } from '../../../src/i18n'
import { GENERATORS_TO_POWER, ITEM_NAMES, KILLER_BP, SACRIFICE_TO_WIN, SURVIVOR_BP, gatesPowered, generatorsDone, itemUses, perkUsed, turnOrder } from '../engine/engine'
import { PERKS } from '../engine/perks'
import type { GameState, ItemUse, PerkOwner } from '../engine/types'
import type { InspectTarget } from '../inspect'
import {
  KILLER_CARD_BACK,
  SURVIVOR_CARD_BACK,
  BEAR_TRAP_IMAGE,
  cardImage,
  cardLabel,
  itemImage,
  itemUseLabel,
  killerMini,
  playerOf,
  survivorMini,
} from '../labels'
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

const perksOf = (o: PerkOwner) => (o === 'killer' ? props.st.killer.perks : props.st.survivors[o].perks)

function use(s: number, u: ItemUse) {
  openItem.value = null
  emit('use', s, u)
}

const order = (s: number) => turnOrder(props.st).indexOf(s) + 1
</script>

<template>
  <section class="card status">
    <div class="tracks">
      <div class="track" :title="`Sacrifice Progress ${st.sacrifice}/${SACRIFICE_TO_WIN}`">
        <span class="label">Sacrifice</span>
        <span v-for="i in SACRIFICE_TO_WIN" :key="i" class="pip blood" :class="{ on: i <= st.sacrifice }" />
      </div>
      <div class="track" :title="`Generator ${generatorsDone(st)}/${GENERATORS_TO_POWER}`">
        <span class="label">Generator</span>
        <img v-for="i in GENERATORS_TO_POWER" :key="i" class="gen" :class="{ on: i <= generatorsDone(st) }" :src="asset(components.generator.image)" alt="" />
        <span class="gate" :class="{ on: gatesPowered(st) }">{{ gatesPowered(st) ? 'ประตูมีไฟ' : 'ประตูยังไม่มีไฟ' }}</span>
      </div>
    </div>

    <!-- killer -->
    <div class="char killer">
      <button class="face-btn" title="ดูรายละเอียด" @click="emit('inspect', { k: 'killer' })">
        <Mini class="mini aura-killer" :src="asset(killerMini(st))" alt="" />
      </button>
      <div class="info">
        <div class="line">
          <strong>{{ st.killer.name }}</strong>
          <span class="muted small">ผู้เล่น 1</span>
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
        <div v-if="st.killer.perks.length" class="perks">
          <button
            v-for="p in perksOf('killer')"
            :key="p"
            class="perk"
            :class="{ used: perkUsed(st, 'killer', p) }"
            :title="`${PERKS[p].name} (${PERKS[p].cost} ▲) — ${PERKS[p].when}`"
            @click="emit('inspect', { k: 'perk', perk: p, owner: 'killer' })"
          >
            {{ PERKS[p].name }}<b>{{ PERKS[p].cost }}</b>
          </button>
        </div>
      </div>
      <div class="planned">
        <img
          v-for="(c, i) in st.killer.planned"
          :key="i"
          :src="asset(showKillerCard(i) ? cardImage(c) : KILLER_CARD_BACK)"
          :alt="showKillerCard(i) ? cardLabel(c) : 'คว่ำ'"
          :class="{ done: i < st.killer.revealedCount - 1 }"
        />
      </div>
    </div>

    <!-- survivors in turn order -->
    <div
      v-for="s in turnOrder(st)"
      :key="s"
      class="char"
      :class="{ active: st.activeSurvivor === s, hooked: st.survivors[s].status === 'hooked' }"
    >
      <div class="mini-wrap">
        <button class="face-btn" title="ดูรายละเอียด" @click="emit('inspect', { k: 'survivor', s })">
          <Mini class="mini" :class="{ wounded: st.survivors[s].wounded }" :src="asset(survivorMini(st, s))" alt="" />
        </button>
        <img v-if="st.firstPlayer === s" class="first" :src="asset(components.firstPlayer.image)" alt="First player" title="First Player" />
      </div>
      <div class="info">
        <div class="line">
          <strong>{{ order(s) }}. {{ st.survivors[s].name }}</strong>
          <span class="muted small">ผู้เล่น {{ playerOf(st, s) }}</span>
        </div>
        <div class="line small">
          <span :class="st.survivors[s].wounded ? 'hurt' : 'ok'">{{ st.survivors[s].wounded ? 'บาดเจ็บ' : 'ปกติ' }}</span>
          <span v-if="STATUS_TH[st.survivors[s].status]" class="warn">{{ STATUS_TH[st.survivors[s].status] }}</span>
          <span v-if="st.survivors[s].madness" class="madness" title="Madness: ทอย Danger Die แทน Skill Check">🌀 Madness</span>
          <span class="bp">{{ st.survivors[s].bp }}/{{ SURVIVOR_BP.max }} ▲</span>
          <img v-if="st.survivors[s].sacrificeToken" class="token" :src="asset(components.sacrificeProgress.image)" alt="" title="ยังมี sacrifice token บนกระดาน" />
        </div>
        <div v-if="st.survivors[s].perks.length" class="perks">
          <button
            v-for="p in perksOf(s)"
            :key="p"
            class="perk"
            :class="{ used: perkUsed(st, s, p) }"
            :title="`${PERKS[p].name} (${PERKS[p].cost} ▲) — ${PERKS[p].when}`"
            @click="emit('inspect', { k: 'perk', perk: p, owner: s })"
          >
            {{ PERKS[p].name }}<b>{{ PERKS[p].cost }}</b>
          </button>
        </div>
      </div>
      <div class="side">
        <img
          v-if="st.survivors[s].planned"
          class="pcard"
          :src="asset(st.survivors[s].plannedRevealed ? cardImage(st.survivors[s].planned!) : SURVIVOR_CARD_BACK)"
          :alt="st.survivors[s].plannedRevealed ? cardLabel(st.survivors[s].planned!) : 'คว่ำ'"
        />
        <button
          v-if="st.survivors[s].item"
          class="item"
          :class="{ usable: itemUses(st, s).length > 0 }"
          :title="ITEM_NAMES[st.survivors[s].item!]"
          @click="openItem = openItem === s ? null : s"
        >
          <img :src="asset(itemImage(st.survivors[s].item!))" :alt="ITEM_NAMES[st.survivors[s].item!]" />
        </button>
      </div>
      <div v-if="openItem === s && st.survivors[s].item" class="item-menu">
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
.status {
  display: grid;
  gap: 0.55rem;
  padding: 0.75rem;
}
.tracks {
  display: grid;
  gap: 0.35rem;
}
.track {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-wrap: wrap;
}
.label {
  width: 5.5rem;
  font-family: var(--font-display);
  font-size: 0.8rem;
  text-transform: uppercase;
  color: var(--muted);
}
.pip {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid var(--blood-dim);
  background: rgb(0 0 0 / 0.4);
}
.pip.on {
  background: radial-gradient(circle at 35% 35%, #ff6b6b, var(--blood) 60%, #5c0b10);
  box-shadow: 0 0 8px rgb(255 30 30 / 0.6);
}
.gen {
  width: 22px;
  height: 22px;
  opacity: 0.25;
  filter: grayscale(1);
}
.gen.on {
  opacity: 1;
  filter: drop-shadow(0 0 6px rgb(245 197 66 / 0.8));
}
.gate {
  font-size: 0.8rem;
  color: var(--muted);
  margin-left: 0.3rem;
}
.gate.on {
  color: #f5c542;
  font-weight: 800;
}

.char {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.6rem;
  align-items: center;
  padding: 0.4rem;
  border-radius: var(--radius);
  border: 1px solid transparent;
}
.char.killer {
  border-color: var(--blood-dim);
  background: rgb(92 11 16 / 0.15);
}
.char.active {
  border-color: rgb(255 214 140 / 0.6);
  background: rgb(255 214 140 / 0.06);
}
.char.hooked {
  opacity: 0.75;
}
.perks {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 3px;
}
.perk {
  display: inline-flex;
  gap: 0.25rem;
  align-items: center;
  padding: 0.05rem 0.4rem;
  font-size: 0.68rem;
  font-family: var(--font-display);
  border-color: #6b4ca3;
  color: #d8c2ff;
  background: rgb(120 70 200 / 0.12);
}
.perk b {
  color: #ffd1cc;
  font-weight: 700;
}
.perk.used {
  opacity: 0.35;
  text-decoration: line-through;
}
.face-btn {
  padding: 0;
  border: none;
  background: none;
  border-radius: 50%;
  line-height: 0;
}
.face-btn:hover {
  transform: scale(1.08);
}
.mini-wrap {
  position: relative;
}
.mini {
  width: 44px;
  height: 44px;
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
  width: 20px;
}
.info {
  min-width: 0;
}
.line {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 0.5rem;
  align-items: center;
}
.small {
  font-size: 0.82rem;
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
.side,
.planned {
  display: flex;
  gap: 0.3rem;
  align-items: center;
}
.planned img,
.pcard {
  width: 30px;
  border-radius: 3px;
}
.planned img.done {
  opacity: 0.45;
}
.item {
  padding: 0;
  width: 34px;
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
.item-menu {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 0.6rem;
  padding: 0.5rem;
  background: rgb(0 0 0 / 0.35);
  border-radius: var(--radius);
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
