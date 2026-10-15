<script setup lang="ts">
// Details of a survivor, the killer, a prop or an item: the printed card plus its state now.
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { items, killerById, survivorById } from '../../data'
import { asset, tr } from '../../i18n'
import { ITEM_NAMES, PROP_NAMES, SURVIVOR_BP, KILLER_BP, roomName } from '../engine/engine'
import type { GameState, PerkOwner } from '../engine/types'
import { CATEGORY_TH, PROP_RULES, type InspectTarget } from '../inspect'
import { PERKS } from '../engine/perks'
import { BEAR_TRAP_IMAGE, PROP_IMAGE, itemImage, ownerLabel, perkImage, perkText, playerOf } from '../labels'
import { perkUsed } from '../engine/engine'
import { itemsHidden } from '../game'
import Mini from './Mini.vue'

const props = defineProps<{ st: GameState; target: InspectTarget }>()
const emit = defineEmits<{ close: [] }>()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const STATUS_TH = { board: 'อยู่บนกระดาน', locker: 'ซ่อนใน Locker', carried: 'ถูกแบก', hooked: 'อยู่บน Hook' }

const survivor = computed(() => {
  const t = props.target
  if (t.k !== 'survivor') return null
  const sv = props.st.survivors[t.s]
  return { s: t.s, sv, data: survivorById.get(sv.characterId) }
})

const killer = computed(() => (props.target.k === 'killer' ? killerById.get(props.st.killer.characterId) : null))

const prop = computed(() => {
  const t = props.target
  return t.k === 'prop' ? (props.st.props.find((p) => p.id === t.id) ?? null) : null
})

const perk = computed(() => (props.target.k === 'perk' ? props.target : null))

/** A character's perks with this round's state (the player tiles don't list them). */
const perkList = computed(() => {
  const t = props.target
  const owner: PerkOwner | null = t.k === 'survivor' ? t.s : t.k === 'killer' ? 'killer' : null
  if (owner === null) return []
  const perks = owner === 'killer' ? props.st.killer.perks : props.st.survivors[owner].perks
  return perks.map((p) => ({ p, used: perkUsed(props.st, owner, p) }))
})

const item = computed(() => {
  const t = props.target
  return t.k === 'item' ? (items.find((i) => i.id === t.id) ?? null) : null
})
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="card modal" role="dialog" aria-modal="true">
      <button class="close" aria-label="ปิด" @click="emit('close')">✕</button>

      <!-- survivor -->
      <template v-if="survivor">
        <header>
          <Mini class="face aura-survivor" :src="asset(survivor.data?.images.mini ?? '')" />
          <div>
            <h2>{{ survivor.sv.name }}</h2>
            <p class="muted">{{ tr(survivor.data?.title) }} · ผู้เล่น {{ playerOf(st, survivor.s) }}</p>
          </div>
        </header>
        <ul class="facts">
          <li :class="survivor.sv.wounded ? 'bad' : 'good'">{{ survivor.sv.wounded ? 'บาดเจ็บ' : 'ไม่บาดเจ็บ' }}</li>
          <li>{{ STATUS_TH[survivor.sv.status] }} · {{ roomName(st, survivor.sv.room) }}</li>
          <li>{{ survivor.sv.bp }}/{{ SURVIVOR_BP.max }} ▲</li>
          <li>{{ survivor.sv.item ? (itemsHidden ? 'ถือ item อยู่ (ไม่เปิดเผย)' : `ถือ ${ITEM_NAMES[survivor.sv.item]}`) : 'ไม่มี item' }}</li>
          <li>{{ survivor.sv.sacrificeToken ? 'ยังไม่เคยถูกแขวน' : 'เคยถูกแขวนแล้ว' }}</li>
        </ul>
        <p v-if="!perkList.length" class="muted small">ตัวละครนี้ยังไม่มี Perk ในโหมดนี้</p>
      </template>

      <!-- killer -->
      <template v-else-if="killer">
        <header>
          <Mini class="face aura-killer" :src="asset(killer.images.mini ?? '')" />
          <div>
            <h2>{{ killer.name }}</h2>
            <p class="muted">ผู้เล่น 1 · {{ roomName(st, st.killer.room) }}</p>
          </div>
        </header>
        <ul class="facts">
          <li>{{ st.killer.bp }}/{{ KILLER_BP.max }} ▲</li>
          <li v-if="st.killer.characterId === 'trapper'"><img class="inline" :src="asset(BEAR_TRAP_IMAGE)" alt="" /> เหลือ {{ st.killer.trapsInSupply }} อัน</li>
          <li :class="st.killer.powerUsed ? 'bad' : 'good'">{{ st.killer.powerUsed ? 'ใช้พลังแล้วรอบนี้' : 'ใช้พลังได้' }}</li>
        </ul>
        <div class="powers">
          <img v-if="killer.power.image?.th" :src="asset(killer.power.image.th)" :alt="killer.power.name" />
          <img v-if="killer.passiveImage?.th" :src="asset(killer.passiveImage.th)" alt="Passive" />
        </div>
        <p class="rule"><b>Power — {{ killer.power.name }}:</b> {{ tr(killer.power.text) }}</p>
        <p v-if="killer.passive" class="rule"><b>Passive:</b> {{ tr(killer.passive) }}</p>
      </template>

      <!-- a character's perks, used or not this round -->
      <section v-if="perkList.length" class="perk-list">
        <h3>Perks</h3>
        <div v-for="{ p, used } in perkList" :key="p" class="perk-row" :class="{ used }">
          <img v-if="perkImage(p)" :src="asset(perkImage(p))" :alt="PERKS[p].name" />
          <div>
            <div class="perk-head">
              <strong>{{ PERKS[p].name }}</strong>
              <span class="cost">{{ PERKS[p].cost ? `${PERKS[p].cost} ▲` : 'ฟรี' }}</span>
              <span class="state" :class="used ? 'bad' : 'good'">{{ used ? 'ใช้แล้วรอบนี้' : 'ยังใช้ได้รอบนี้' }}</span>
            </div>
            <p class="rule small">{{ perkText(p) }}</p>
            <p class="muted small">{{ PERKS[p].when }}</p>
          </div>
        </div>
      </section>

      <!-- prop -->
      <template v-if="prop">
        <header>
          <img class="prop-img" :src="asset(PROP_IMAGE[prop.kind])" alt="" />
          <div>
            <h2>{{ PROP_NAMES[prop.kind] }}</h2>
            <p class="muted">{{ CATEGORY_TH[prop.category] }}{{ prop.room ? ` · ${roomName(st, prop.room)}` : '' }}</p>
          </div>
        </header>
        <ul class="facts">
          <li v-if="prop.kind === 'generator' || prop.kind === 'exitGate'">ความคืบหน้า {{ prop.progress }}/3</li>
          <li v-if="prop.occupant !== null" class="bad">{{ st.survivors[prop.occupant].name }} {{ prop.kind === 'hook' ? 'ถูกแขวนอยู่' : 'ซ่อนอยู่' }}</li>
          <li v-if="st.entity && 'prop' in st.entity && st.entity.prop === prop.id" class="bad">มี Entity — Interact ไม่ได้รอบนี้</li>
        </ul>
        <p class="rule"><b>ผู้รอดชีวิต:</b> {{ PROP_RULES[prop.kind].survivor }}</p>
        <p class="rule"><b>ฆาตกร:</b> {{ PROP_RULES[prop.kind].killer }}</p>
      </template>

      <!-- perk -->
      <template v-else-if="perk">
        <header>
          <div>
            <h2>{{ PERKS[perk.perk].name }}</h2>
            <p class="muted">perk ของ {{ ownerLabel(st, perk.owner) }} · {{ PERKS[perk.perk].cost ? `${PERKS[perk.perk].cost} ▲` : 'ฟรี' }} · ใช้ได้ 1 ครั้ง/รอบ</p>
          </div>
        </header>
        <ul class="facts">
          <li :class="perkUsed(st, perk.owner, perk.perk) ? 'bad' : 'good'">{{ perkUsed(st, perk.owner, perk.perk) ? 'ใช้แล้วรอบนี้' : 'ยังใช้ได้รอบนี้' }}</li>
          <li>{{ PERKS[perk.perk].when }}</li>
        </ul>
        <div class="item-wrap">
          <img v-if="perkImage(perk.perk)" class="item-img" :src="asset(perkImage(perk.perk))" :alt="PERKS[perk.perk].name" />
          <p class="rule">{{ perkText(perk.perk) }}</p>
        </div>
      </template>

      <!-- item -->
      <template v-else-if="item">
        <header>
          <div>
            <h2>{{ ITEM_NAMES[item.id] }}</h2>
            <p class="muted">Item · มี {{ item.count }} ใบในกอง</p>
          </div>
        </header>
        <div class="item-wrap">
          <img class="item-img" :src="asset(itemImage(item.id))" :alt="ITEM_NAMES[item.id]" />
          <p class="rule">{{ item.text.th.replaceAll('{BP}', '▲') }}</p>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
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
.modal {
  position: relative;
  width: min(44rem, 100%);
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  display: grid;
  gap: 0.8rem;
  animation: rise 0.28s cubic-bezier(0.2, 1.3, 0.4, 1);
}
@keyframes fade {
  from {
    opacity: 0;
  }
}
@keyframes rise {
  from {
    transform: translateY(24px) scale(0.96);
    opacity: 0;
  }
}
.close {
  position: absolute;
  right: 0.6rem;
  top: 0.6rem;
  padding: 0.2rem 0.6rem;
}
header {
  display: flex;
  gap: 0.9rem;
  align-items: center;
  padding-right: 2.5rem;
}
h2 {
  margin: 0;
}
header p {
  margin: 0;
}
.face {
  width: 72px;
  height: 72px;
}
.prop-img {
  width: 64px;
  height: 64px;
}
.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  list-style: none;
  margin: 0;
  padding: 0;
}
.facts li {
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--line-strong);
  border-radius: 99px;
  font-size: 0.9rem;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.facts .good {
  border-color: var(--ok);
  color: var(--ok);
}
.facts .bad {
  border-color: var(--blood);
  color: #ff8a80;
}
.inline {
  width: 18px;
}
.perk-list {
  display: grid;
  gap: 0.5rem;
}
.perk-list h3 {
  margin: 0;
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #d8c2ff;
}
.perk-row {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 0.7rem;
  align-items: start;
  padding: 0.5rem;
  border: 1px solid #6b4ca3;
  border-radius: 8px;
  background: rgb(120 70 200 / 0.08);
}
.perk-row.used {
  opacity: 0.6;
}
.perk-row img {
  width: 100%;
  border-radius: 4px;
}
.perk-head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 0.6rem;
  align-items: center;
}
.cost {
  padding: 0 0.4rem;
  border-radius: 4px;
  background: rgb(255 138 128 / 0.15);
  color: #ffd1cc;
  font-size: 0.85rem;
}
.state {
  font-size: 0.8rem;
}
.state.good {
  color: var(--ok);
}
.state.bad {
  color: #ff8a80;
}
.small {
  font-size: 0.86rem;
  margin: 0.2rem 0 0;
}
.powers {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 0.5rem;
}
.powers img {
  width: 100%;
  border-radius: 6px;
}
.rule {
  margin: 0;
  line-height: 1.6;
}
.item-wrap {
  display: grid;
  grid-template-columns: minmax(8rem, 14rem) 1fr;
  gap: 1rem;
  align-items: start;
}
.item-img {
  width: 100%;
  border-radius: 8px;
}
@media (max-width: 560px) {
  .item-wrap {
    grid-template-columns: 1fr;
  }
}
@media (prefers-reduced-motion: reduce) {
  .backdrop,
  .modal {
    animation: none;
  }
}
</style>
