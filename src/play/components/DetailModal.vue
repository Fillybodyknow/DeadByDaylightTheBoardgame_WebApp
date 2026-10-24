<script setup lang="ts">
// Details of a survivor, the killer, a prop or an item: the printed card plus its state now.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { items, killerById, survivorById } from '../../data'
import { asset, tr } from '../../i18n'
import { ITEM_NAMES, PROP_NAMES, KILLER_BP, roomName, survivorMax } from '../engine/engine'
import type { GameState, PerkOwner } from '../engine/types'
import { CATEGORY_TH, PROP_RULES, type InspectTarget } from '../inspect'
import { PERKS } from '../engine/perks'
import { BEAR_TRAP_IMAGE, itemImage, propPicture, ownerLabel, perkImage, perkText, playerOf, powerName } from '../labels'
import { perkUsed } from '../engine/engine'
import { itemHidden } from '../game'
import Mini from './Mini.vue'
import BpIcon from '../../components/BpIcon.vue'
import BpText from '../../components/BpText.vue'
import PerkRichText from '../../components/PerkRichText.vue'

const props = defineProps<{ st: GameState; target: InspectTarget }>()
const emit = defineEmits<{ close: [] }>()

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  // the enlarged card goes first, then the modal
  if (zoomed.value) zoomed.value = null
  else emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

/** A card picture opened big over the modal (a click on a card); a click anywhere closes it. */
const zoomed = ref<string | null>(null)
function zoom(e: MouseEvent) {
  zoomed.value = (e.currentTarget as HTMLImageElement).src
}

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
  const covered = owner === 'killer' ? [] : (props.st.survivors[owner].purged ?? [])
  return perks.map((p) => ({ p, used: perkUsed(props.st, owner, p), covered: covered.includes(p) }))
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
            <p class="muted"><BpText :text="tr(survivor.data?.title)" /> · ผู้เล่น {{ playerOf(st, survivor.s) }}</p>
          </div>
        </header>
        <ul class="facts">
          <li :class="survivor.sv.wounded ? 'bad' : 'good'">{{ survivor.sv.wounded ? 'บาดเจ็บ' : 'ไม่บาดเจ็บ' }}</li>
          <li>{{ STATUS_TH[survivor.sv.status] }} · {{ roomName(st, survivor.sv.room) }}</li>
          <li>{{ survivor.sv.bp }}/{{ survivorMax(st, survivor.s) }} <BpIcon /></li>
          <li v-if="survivor.sv.knives" :class="{ bad: survivor.sv.knives === 3 }">Knife {{ survivor.sv.knives }}/3 — <BpIcon /> สูงสุด −{{ 2 * survivor.sv.knives }}{{ survivor.sv.knives === 3 ? ' · หายบาดเจ็บไม่ได้' : '' }} (เข้า Locker เพื่อทิ้ง)</li>
          <li>{{ survivor.sv.item ? (itemHidden(st, survivor.s) ? 'ถือ item อยู่ (ไม่เปิดเผย)' : `ถือ ${ITEM_NAMES[survivor.sv.item]}`) : 'ไม่มี item' }}</li>
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
          <li>{{ st.killer.bp }}/{{ KILLER_BP.max }} <BpIcon /></li>
          <li v-if="st.killer.characterId === 'trapper'"><img class="inline" :src="asset(BEAR_TRAP_IMAGE)" alt="" /> เหลือ {{ st.killer.trapsInSupply }} อัน</li>
          <li :class="st.killer.powerUsed ? 'bad' : 'good'">{{ st.killer.powerUsed ? 'ใช้พลังแล้วรอบนี้' : 'ใช้พลังได้' }}</li>
        </ul>
        <div class="powers">
          <img v-if="killer.power.image?.th" class="zoomable" title="คลิกเพื่อขยาย" @click="zoom" :src="asset(killer.power.image.th)" :alt="killer.power.name" />
          <img v-if="killer.passiveImage?.th" class="zoomable" title="คลิกเพื่อขยาย" @click="zoom" :src="asset(killer.passiveImage.th)" alt="Passive" />
        </div>
        <p class="rule"><b>พลัง — {{ powerName(st) }}<small v-if="powerName(st) !== killer.power.name" class="en">{{ killer.power.name }}</small>:</b> <PerkRichText :text="tr(killer.power.text)" /></p>
        <p v-if="killer.passive" class="rule"><b>Passive:</b> <PerkRichText :text="tr(killer.passive)" /></p>
      </template>

      <!-- a character's perks, used or not this round -->
      <section v-if="perkList.length" class="perk-list">
        <h3>Perks</h3>
        <div v-for="{ p, used, covered } in perkList" :key="p" class="perk-row" :class="{ used: used || covered }">
          <img v-if="perkImage(p)" class="zoomable" title="คลิกเพื่อขยาย" @click="zoom" :src="asset(perkImage(p))" :alt="PERKS[p].name" />
          <div>
            <div class="perk-head">
              <strong>{{ PERKS[p].name }}<small v-if="PERKS[p].en !== PERKS[p].name" class="en">{{ PERKS[p].en }}</small></strong>
              <span class="cost"><BpText :text="PERKS[p].cost ? `${PERKS[p].cost} ▲` : 'ฟรี'" /></span>
              <span class="state" :class="used || covered ? 'bad' : 'good'">{{ covered ? 'ถูก การชำระมลทินต่ำช้า ปิด (ซ่อนใน Locker เพื่อเอาออก)' : used ? 'ใช้แล้วรอบนี้' : 'ยังใช้ได้รอบนี้' }}</span>
            </div>
            <p class="rule small"><PerkRichText :text="perkText(p)" /></p>
            <p class="muted small"><BpText :text="PERKS[p].when" /></p>
          </div>
        </div>
      </section>

      <!-- prop -->
      <template v-if="prop">
        <header>
          <img class="prop-img" :src="asset(propPicture(prop))" alt="" />
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
            <h2>{{ PERKS[perk.perk].name }}<small v-if="PERKS[perk.perk].en !== PERKS[perk.perk].name" class="en">{{ PERKS[perk.perk].en }}</small></h2>
            <p class="muted">perk ของ {{ ownerLabel(st, perk.owner) }} · <BpText :text="PERKS[perk.perk].cost ? `${PERKS[perk.perk].cost} ▲` : 'ฟรี'" /> · ใช้ได้ 1 ครั้ง/รอบ</p>
          </div>
        </header>
        <ul class="facts">
          <li :class="perkUsed(st, perk.owner, perk.perk) ? 'bad' : 'good'">{{ perkUsed(st, perk.owner, perk.perk) ? 'ใช้แล้วรอบนี้' : 'ยังใช้ได้รอบนี้' }}</li>
          <li><BpText :text="PERKS[perk.perk].when" /></li>
        </ul>
        <div class="item-wrap">
          <img v-if="perkImage(perk.perk)" class="item-img zoomable" title="คลิกเพื่อขยาย" @click="zoom" :src="asset(perkImage(perk.perk))" :alt="PERKS[perk.perk].name" />
          <p class="rule"><PerkRichText :text="perkText(perk.perk)" /></p>
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
          <img class="item-img zoomable" title="คลิกเพื่อขยาย" @click="zoom" :src="asset(itemImage(item.id))" :alt="ITEM_NAMES[item.id]" />
          <p class="rule"><BpText :text="item.text.th.replaceAll('{BP}', '▲')" /></p>
        </div>
      </template>
    </div>

    <!-- a card, big enough to read; a click anywhere puts it back -->
    <div v-if="zoomed" class="zoom" role="dialog" aria-modal="true" @click="zoomed = null">
      <img :src="zoomed" alt="" />
      <p class="muted small">คลิกที่ไหนก็ได้เพื่อย่อกลับ</p>
    </div>
  </div>
</template>

<style scoped>
/* the English name beside the Thai one, as on the English cards */
.en {
  margin-left: 0.4em;
  font-size: 0.72em;
  font-weight: 500;
  color: var(--muted);
  letter-spacing: 0.02em;
}
.zoomable {
  cursor: zoom-in;
  transition: transform 0.15s, box-shadow 0.15s;
}
.zoomable:hover {
  transform: scale(1.03);
  box-shadow: 0 0 0 2px #ffe9b0;
}
/* the enlarged card, over the modal: as big as the screen allows */
.zoom {
  position: fixed;
  inset: 0;
  z-index: 1;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 0.6rem;
  padding: 1.5rem;
  background: rgb(4 5 7 / 0.9);
  cursor: zoom-out;
  animation: fade 0.15s ease-out;
}
.zoom img {
  max-width: min(92vw, 1100px);
  max-height: 84vh;
  object-fit: contain;
  border-radius: 12px;
  box-shadow: 0 0 0 2px rgb(255 233 176 / 0.6), 0 24px 60px rgb(0 0 0 / 0.85);
}
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
/* big enough to read across the table: the text a size up, the cards wider */
.modal {
  position: relative;
  width: min(60rem, 100%);
  font-size: 1.12rem;
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
  font-size: 1.9rem;
}
header p {
  margin: 0;
}
.face {
  width: 92px;
  height: 92px;
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
  font-size: 1rem;
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
  gap: 0.7rem;
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
  grid-template-columns: 110px 1fr;
  gap: 1rem;
  align-items: start;
  padding: 0.75rem;
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
.perk-head strong {
  font-size: 1.2rem;
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
  font-size: 0.95rem;
}
.state {
  font-size: 0.92rem;
}
.state.good {
  color: var(--ok);
}
.state.bad {
  color: #ff8a80;
}
.small {
  font-size: 0.98rem;
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
  line-height: 1.7;
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
