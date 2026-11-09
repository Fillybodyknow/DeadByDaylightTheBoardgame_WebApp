<script setup lang="ts">
// One character's perk loadout before a trial (Bloodweb, Devout — p.19), laid out like the PC
// game's: the 3 perk slots on top, the perks to choose from below as diamonds, and a details box
// when pointing at one. A click on a slot picks which slot changes; a click on a perk below puts it
// there. The icon is the diamond cut from the perk card beforehand (`perkIcon`, `perk-icons/`).
// A row on top as the PC game's: a killer's Power and Passive, and the offering slot (online, `offering`)
// — a click on it turns the store below into the side's offerings.
//   `bare`: inside the online room's panel, whose corner button confirms: no name on top, and no
//   confirm button below (only the way back, once confirmed). `readonly`: Adept, the printed perks
//   as they are (the store is the offerings' only).
import { computed, ref, watch } from 'vue'
import BpIcon from '../../components/BpIcon.vue'
import BpText from '../../components/BpText.vue'
import { killerById, survivorById } from '../../data'
import { thaiName } from '../../data/thaiNames'
import { asset } from '../../i18n'
import { sfx } from '../../sound'
import { fxSound } from '../fx/audio'
import { ownPerk, printedOf, type GameMode, type Side } from '../engine/loadout'
import { PERKS, type PerkId } from '../engine/perks'
import { offeringIcon, perkIcon, perkText, perkTone, powerIcon } from '../labels'
import Mini from './Mini.vue'
import PcTip from './PcTip.vue'
import PerkRichText from '../../components/PerkRichText.vue'
import { offerings as OFFERING_CARDS } from '../../data'
import { offeringName, offeringsOf, type OfferingId } from '../engine/offerings'

const props = defineProps<{
  side: Side
  characterId: string
  mode: GameMode
  /** What may be picked (Devout's pool, or the printed perks and the Bloodweb hand). */
  choices: PerkId[]
  /** Perks someone else plays: one card of each. */
  taken: PerkId[]
  /** Why the loadout can't be confirmed yet ('' when it can). */
  problem: string
  confirmed: boolean
  /** The player's own name, for whose loadout this is ("ผู้เล่น 2"). */
  who?: string
  bare?: boolean
  readonly?: boolean
  /**
   * The side's offerings, when the room burns any for it: picked here (`slots`, what is `picked`),
   * or only shown (`note`: drawn, or the other side's turn).
   */
  offering?: { side: Side; slots: number; picked: OfferingId[]; problem: string; confirmed: boolean; note?: string } | null
}>()
const loadout = defineModel<PerkId[]>({ required: true })
const emit = defineEmits<{ confirm: [on: boolean]; offerings: [list: OfferingId[]]; confirmOfferings: [on: boolean] }>()

// ---------- the store below: the perks, or (from the offering slot) the side's offerings ----------

const shelf = ref<'perks' | 'offerings'>(props.readonly && props.offering ? 'offerings' : 'perks')
function openOfferings() {
  if (!props.offering) return
  sfx.click()
  shelf.value = 'offerings'
}
const offeringCards = computed(() =>
  props.offering
    ? offeringsOf(props.offering.side).map((id) => {
        const c = OFFERING_CARDS.find((x) => x.id === id)!
        return { id, name: offeringName(id), en: c.name, icon: offeringIcon(c.image.en), text: c.text.th, flavor: c.flavor.th }
      })
    : [],
)
/** Burn this offering, or put it back (one slot: a click swaps it; more: the oldest goes when full). */
function toggleOffering(id: OfferingId) {
  const o = props.offering
  if (!o || o.confirmed || o.note) return
  sfx.select()
  emit('offerings', o.picked.includes(id) ? o.picked.filter((x) => x !== id) : [...o.picked, id].slice(-o.slots))
}
const offeringTip = ref<{ id: OfferingId; x: number; y: number } | null>(null)
const tipCard = computed(() => offeringCards.value.find((c) => c.id === offeringTip.value?.id) ?? null)
function pointOffering(id: OfferingId, e: MouseEvent | FocusEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = r.right + 460 > window.innerWidth ? r.left - 452 : r.right + 12
  offeringTip.value = { id, x: Math.max(8, x), y: Math.min(r.top, window.innerHeight - 300) }
}

const character = computed(() => (props.side === 'killer' ? killerById.get(props.characterId) : survivorById.get(props.characterId)))
const printed = computed(() => printedOf(props.characterId))

/** The slot a click below puts a perk into. */
const slot = ref(0)
watch(
  () => props.characterId,
  () => (slot.value = 0),
)

function pickSlot(i: number) {
  shelf.value = 'perks'
  if (props.confirmed || props.readonly) return
  sfx.click()
  slot.value = i
}

function put(p: PerkId) {
  if (props.confirmed || props.taken.includes(p)) return
  const at = loadout.value.indexOf(p)
  // already in the loadout: that slot is the one to change next
  if (at >= 0) return void (slot.value = at)
  fxSound.equip()
  const next = [...loadout.value]
  next[slot.value] = p
  loadout.value = next
  // on to the next slot still showing a printed perk, if any
  const free = next.findIndex((x, i) => i !== slot.value && printed.value.includes(x))
  if (free >= 0) slot.value = free
}

function reset() {
  if (props.confirmed) return
  fxSound.unequip()
  loadout.value = [...printed.value]
  slot.value = 0
}

// ---------- the perks below: search and pages ----------

const query = ref('')
const PAGE = 15
const page = ref(0)
const list = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.choices
  return props.choices.filter((p) => [PERKS[p].name, PERKS[p].en, ownerName(p), perkText(p)].some((t) => t.toLowerCase().includes(q)))
})
const pages = computed(() => Math.max(1, Math.ceil(list.value.length / PAGE)))
// back to the first page only when what may be picked really changes: online the list is built
// anew on every room update (someone else setting a perk), with the same perks in it
watch([query, () => props.choices.join(',')], () => (page.value = 0))
const shown = computed(() => list.value.slice(page.value * PAGE, page.value * PAGE + PAGE))
function go(n: number) {
  if (n === page.value || n < 0 || n >= pages.value) return
  sfx.click()
  tip.value = null
  page.value = n
}
const turn = (d: number) => go(page.value + d)
/** Three rows of five, every other row set half a diamond in (the PC game's grid). */
const rows = computed(() => [0, 1, 2].map((r) => shown.value.slice(r * 5, r * 5 + 5)).filter((r) => r.length))

// ---------- details ----------

/** The board a perk is printed on, if any (its card is still a card of its own). */
function boardName(p: PerkId): string {
  const c = PERKS[p].character
  return c ? ((PERKS[p].side === 'killer' ? killerById.get(c) : survivorById.get(c))?.name ?? c) : ''
}
function ownerName(p: PerkId): string {
  if (kind(p) !== 'card') return `บนกระดาน ${character.value?.name ?? ''}`
  const b = boardName(p)
  return b ? `บนกระดาน ${b} ด้วย` : 'ไม่อยู่บนกระดานใคร'
}

/**
 * Purple / green: a perk printed on this character's board, kept (their own / shareable); gold: a
 * card from the box laid over the board — everything to pick from below is a card.
 */
function kind(p: PerkId): 'own' | 'shared' | 'card' {
  if (!printed.value.includes(p)) return 'card'
  return ownPerk(p) ? 'own' : 'shared'
}
const KIND_TH = { own: 'Perk เฉพาะตัว', shared: 'Perk บนกระดาน', card: 'การ์ด Perk' }

const tip = ref<{ p: PerkId; x: number; y: number } | null>(null)
function point(p: PerkId, e: MouseEvent | FocusEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  // to the right of the diamond, or to its left near the screen's right edge
  const x = r.right + 440 > window.innerWidth ? r.left - 432 : r.right + 12
  tip.value = { p, x: Math.max(8, x), y: Math.min(r.top, window.innerHeight - 340) }
}
// ---------- the killer's Power and Passive ----------

/**
 * His Power and Passive cards (Thai, as in the game), to see while picking perks: the power as its
 * icon (the PC game's slot), the passive as a small card; pointing at either shows the whole card.
 */
const kit = computed(() => {
  if (props.side !== 'killer') return []
  const k = killerById.get(props.characterId)
  if (!k) return []
  return [
    { label: 'POWER', name: thaiName(k.power.name) ?? k.power.name, src: k.power.image?.th ?? k.power.image?.en, thumb: powerIcon(k.id), icon: true },
    { label: 'PASSIVE', name: 'Passive', src: k.passiveImage?.th ?? k.passiveImage?.en, thumb: k.passiveImage?.th ?? k.passiveImage?.en, icon: false },
  ].filter((c): c is { label: string; name: string; src: string; thumb: string; icon: boolean } => !!c.src && !!c.thumb)
})
/** The card pointed at, shown big under it (the cards are kept small to leave room for the perks). */
const kitTip = ref<{ src: string; x: number; y: number } | null>(null)
function pointKit(src: string, e: MouseEvent | FocusEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const w = Math.min(760, window.innerWidth - 16)
  kitTip.value = { src, x: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), y: r.bottom + 8 }
}
/** A click (a tap on a tablet) shows the card full size; a click anywhere closes it. */
const zoomed = ref<string | null>(null)
function zoomKit(src: string) {
  sfx.click()
  kitTip.value = null
  zoomed.value = src
}

const face = (p: PerkId) => {
  const img = perkIcon(p)
  return img ? { backgroundImage: `url(${asset(img)})` } : {}
}
</script>

<template>
  <div class="loadout" :class="[side, { done: confirmed }]">
    <header v-if="!bare" class="head">
      <Mini v-if="character" class="mini" :class="side === 'killer' ? 'aura-killer' : 'aura-survivor'" :src="asset(character.images.mini)" />
      <div>
        <strong>{{ character?.name }}</strong>
        <small class="muted">{{ who }}{{ who ? ' · ' : '' }}{{ mode === 'devout' ? 'Devout — เลือก Perk ได้ 3 ใบ' : 'Bloodweb — การ์ดที่จั่วได้ 5 ใบ' }}</small>
      </div>
    </header>

    <!-- the row on top, as the PC game's: the killer's Power and Passive, then the offering slot -->
    <div v-if="kit.length || offering" class="kit">
      <div v-for="c in kit" :key="c.label" class="kit-col">
        <span class="kit-label">{{ c.icon ? 'พลัง' : 'Passive' }}</span>
        <button
          type="button"
          class="kit-card"
          :title="`${c.name} — คลิกเพื่อขยาย`"
          @click="zoomKit(c.src)"
          @mouseenter="pointKit(c.src, $event)"
          @focus="pointKit(c.src, $event)"
          @mouseleave="kitTip = null"
          @blur="kitTip = null"
        >
          <img :class="{ icon: c.icon }" :src="asset(c.thumb)" :alt="c.name" draggable="false" />
        </button>
      </div>
      <span v-if="kit.length && offering" class="kit-sep" aria-hidden="true" />
      <div v-if="offering" class="kit-col">
        <span class="kit-label">เครื่องเซ่น</span>
        <div class="hex-row">
          <button
            v-for="n in Math.max(1, offering.slots)"
            :key="n"
            type="button"
            class="hex slot-hex"
            :class="{ on: shelf === 'offerings', empty: !offering.picked[n - 1] }"
            :title="offering.note || 'เลือกเครื่องเซ่น'"
            @click="openOfferings"
            @mouseenter="offering.picked[n - 1] && pointOffering(offering.picked[n - 1], $event)"
            @mouseleave="offeringTip = null"
          >
            <img v-if="offering.picked[n - 1]" :src="asset(offeringIcon(OFFERING_CARDS.find((x) => x.id === offering!.picked[n - 1])!.image.en))" alt="" />
            <span v-else class="hex-plus">{{ offering.note ? '?' : '+' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- the three perks played: a click picks which one changes -->
    <p class="label">PERKS</p>
    <div class="slots">
      <!-- the gold ring sits outside the diamond: a glow on the diamond itself would be cut off with it -->
      <div v-for="(p, i) in loadout" :key="i" class="slot" :class="{ active: slot === i && !confirmed }">
        <span class="ring" aria-hidden="true" />
        <button
          type="button"
          class="dia big"
          :class="[kind(p), { laid: !printed.includes(p) }]"
          :aria-label="PERKS[p].name"
          :aria-pressed="slot === i"
          @click="pickSlot(i)"
          @mouseenter="point(p, $event)"
          @focus="point(p, $event)"
          @mouseleave="tip = null"
          @blur="tip = null"
        >
          <span class="face" :style="face(p)" />
        </button>
        <span class="cost big" :class="{ free: !PERKS[p].cost }" aria-hidden="true">
          <template v-if="PERKS[p].cost">{{ PERKS[p].cost }}<BpIcon /></template>
          <template v-else>ฟรี</template>
        </span>
        <span class="slot-name">{{ PERKS[p].name }}</span>
        <span v-if="!printed.includes(p)" class="slot-sub">วางทับ Perk บนกระดาน</span>
      </div>
    </div>
    <button v-if="!confirmed && !readonly" type="button" class="reset" @click="reset">↺ Perk เดิม</button>
    <p v-if="!confirmed && !readonly" class="hint muted">คลิกช่องด้านบนเพื่อเลือกช่องที่จะเปลี่ยน (กรอบทอง) แล้วคลิก Perk ด้านล่างเพื่อใส่</p>
    <p v-if="readonly" class="hint muted">Adept: ใช้ Perk ที่พิมพ์บนกระดาน เปลี่ยนไม่ได้</p>
    <p v-if="bare && confirmed && !readonly && shelf === 'perks'" class="hint muted">🔒 ยืนยัน Perk แล้ว — แก้ได้ที่ปุ่ม “✎ แก้ Perk” ข้างปุ่มมุมขวาล่าง</p>

    <!-- the side's offerings, from the offering slot: their hexagons, a click burns one -->
    <template v-if="shelf === 'offerings' && offering">
      <div class="store-head">
        <p class="label">คลังเครื่องเซ่น <small class="muted">({{ offering.picked.length }}/{{ offering.slots }})</small></p>
        <button type="button" class="back-perks" @click="shelf = 'perks'">← คลัง PERKS</button>
      </div>
      <p v-if="offering.note" class="hint muted">{{ offering.note }}</p>
      <div v-else class="hex-store">
        <button
          v-for="c in offeringCards"
          :key="c.id"
          type="button"
          class="hex"
          :class="{ in: offering.picked.includes(c.id) }"
          :disabled="offering.confirmed"
          :aria-label="c.name"
          @click="toggleOffering(c.id)"
          @mouseenter="pointOffering(c.id, $event)"
          @focus="pointOffering(c.id, $event)"
          @mouseleave="offeringTip = null"
          @blur="offeringTip = null"
        >
          <img :src="asset(c.icon)" alt="" />
        </button>
      </div>
      <p v-if="offering.problem && !offering.confirmed && !offering.note" class="hint muted">{{ offering.problem }} — เผาตอนเริ่มเกม ทุกคนเห็นเมื่อเกมเริ่ม (หน้า 19)</p>
      <p v-if="offering.confirmed && !offering.note" class="hint muted">🔒 ยืนยันเครื่องเซ่นแล้ว — แก้ได้ที่ปุ่ม “✎ แก้เครื่องเซ่น” ข้างปุ่มมุมขวาล่าง</p>
    </template>

    <!-- what may be picked -->
    <template v-else-if="!readonly">
    <div class="store-head">
      <p class="label">คลัง PERKS <small class="muted">({{ list.length }})</small></p>
      <input v-if="choices.length > PAGE" v-model="query" class="search" type="search" placeholder="ค้นหา Perk / ตัวละคร / คำในการ์ด" />
    </div>
    <div class="store">
      <button type="button" class="arrow" :class="{ hidden: pages < 2 }" :disabled="page === 0" aria-label="หน้าก่อน" title="หน้าก่อน" @click="turn(-1)">‹</button>
      <div class="rows">
        <div v-for="(row, r) in rows" :key="r" class="row" :class="{ odd: r % 2 === 1 }">
          <span v-for="p in row" :key="p" class="cell" :class="{ dim: taken.includes(p) }">
            <button
              type="button"
              class="dia"
              :class="[kind(p), { in: loadout.includes(p), taken: taken.includes(p) }]"
              :disabled="confirmed || taken.includes(p)"
              :aria-label="PERKS[p].name"
              @click="put(p)"
              @mouseenter="point(p, $event)"
              @focus="point(p, $event)"
              @mouseleave="tip = null"
              @blur="tip = null"
            >
              <span class="face" :style="face(p)" />
            </button>
            <span class="cost" :class="{ free: !PERKS[p].cost }" aria-hidden="true">
              <template v-if="PERKS[p].cost">{{ PERKS[p].cost }}<BpIcon /></template>
              <template v-else>ฟรี</template>
            </span>
          </span>
        </div>
        <p v-if="!list.length" class="muted">ไม่พบ Perk</p>
      </div>
      <button type="button" class="arrow" :class="{ hidden: pages < 2 }" :disabled="page >= pages - 1" aria-label="หน้าถัดไป" title="หน้าถัดไป" @click="turn(1)">›</button>
    </div>
    <!-- a dot per page: the one shown is lit, a click on another goes there -->
    <div v-if="pages > 1" class="pager">
      <button v-for="n in pages" :key="n" type="button" class="dot" :class="{ on: page === n - 1 }" :aria-label="`หน้า ${n}`" :aria-current="page === n - 1" @click="go(n - 1)" />
      <span class="muted">หน้า {{ page + 1 }}/{{ pages }}</span>
    </div>

    </template>

    <footer v-if="!bare" class="foot">
      <p v-if="problem && !confirmed" class="problem">{{ problem }}</p>
      <button type="button" class="confirm" :class="{ primary: !confirmed }" :disabled="!confirmed && !!problem" @click="emit('confirm', !confirmed)">
        {{ confirmed ? '🔒 ยืนยันแล้ว (กดเพื่อแก้)' : '✓ ยืนยัน Perk' }}
      </button>
    </footer>
  </div>

  <!-- the perk pointed at, as the PC game's box: name, owner, cost, text -->
  <Teleport to="body">
    <img v-if="kitTip" class="kit-tip" :src="asset(kitTip.src)" alt="" :style="{ left: `${kitTip.x}px`, top: `${kitTip.y}px` }" />
    <div v-if="zoomed" class="kit-zoom" role="dialog" aria-modal="true" @click="zoomed = null">
      <img :src="asset(zoomed)" alt="" />
    </div>
    <PcTip v-if="tip" :x="tip.x" :y="tip.y" :title="PERKS[tip.p].name" :en="PERKS[tip.p].en" :tone="perkTone(tip.p)">
      <template #left>{{ ownerName(tip.p) }}</template>
      <template #right>{{ KIND_TH[kind(tip.p)] }} · <BpText :text="PERKS[tip.p].cost ? `${PERKS[tip.p].cost} ▲` : 'ฟรี'" /></template>
      <p class="tip-text"><PerkRichText :text="perkText(tip.p)" /></p>
      <p class="tip-when">{{ PERKS[tip.p].when }}</p>
      <p v-if="taken.includes(tip.p)" class="tip-taken">การ์ดใบนี้มีคนใช้แล้ว — การ์ดมีใบเดียว</p>
      <p v-else-if="!printed.includes(tip.p) && loadout.includes(tip.p)" class="tip-laid">วางทับ Perk บนกระดาน</p>
    </PcTip>
    <PcTip v-if="offeringTip && tipCard" :x="offeringTip.x" :y="offeringTip.y" :title="tipCard.name" :en="tipCard.en" tone="offering">
      <template #left>เครื่องเซ่น{{ offering?.side === 'killer' ? 'ฝั่งฆาตกร' : 'ฝั่งผู้รอดชีวิต' }}</template>
      <template #right>เผาตอนเริ่มเกม</template>
      <p class="tip-text"><BpText :text="tipCard.text.replaceAll('{BP}', '▲')" /></p>
      <p class="tip-flavor">“{{ tipCard.flavor }}”</p>
    </PcTip>
  </Teleport>
</template>

<style scoped>
.loadout {
  --frame-own: linear-gradient(135deg, #e7d4ff, #7a4fc4);
  --frame-shared: linear-gradient(135deg, #d9f7a8, #4f7d1e);
  --frame-card: linear-gradient(135deg, #ffe7a6, #a8781c);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem 1.1rem;
  border-radius: var(--radius);
  background:
    radial-gradient(ellipse at 20% 0%, rgb(120 90 160 / 0.18), transparent 60%),
    rgb(12 14 20 / 0.85);
  border: 1px solid var(--line-strong);
}
.loadout.killer {
  background:
    radial-gradient(ellipse at 20% 0%, rgb(160 30 30 / 0.2), transparent 60%),
    rgb(14 10 12 / 0.88);
}
.head {
  display: flex;
  gap: 0.7rem;
  align-items: center;
}
.head .mini {
  width: 52px;
  height: 52px;
}
.head div {
  display: flex;
  flex-direction: column;
}
/* the row on top, as the PC game's: พลัง, Passive | เครื่องเซ่น */
.kit {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 1.4rem;
  margin-top: 0.3rem;
  padding-bottom: 0.9rem;
  border-bottom: 1px solid rgb(255 255 255 / 0.14);
}
.kit-col {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.kit-label {
  font-family: var(--font-display);
  font-size: 1rem;
  color: #e3dcdc;
}
.kit-sep {
  align-self: stretch;
  width: 1px;
  background: rgb(255 255 255 / 0.16);
}
.hex-row {
  display: flex;
  gap: 0.6rem;
}
/* an offering: its hexagon, as cut from the card */
.hex {
  position: relative;
  width: 84px;
  height: 94px;
  padding: 0;
  border: none;
  background: none;
  clip-path: polygon(50% 0, 100% 21%, 100% 79%, 50% 100%, 0 79%, 0 21%);
  transition:
    transform 0.15s,
    filter 0.15s;
}
.hex img {
  display: block;
  width: 100%;
  height: 100%;
}
.hex:hover:not(:disabled),
.hex:focus-visible {
  transform: scale(1.08);
  filter: brightness(1.2);
}
/* the slot: empty, a dark hexagon with a + (as the PC game's) */
.slot-hex {
  width: 88px;
  height: 99px;
  background: rgb(0 0 0 / 0.45);
}
.slot-hex.empty {
  background: rgb(190 190 200 / 0.45);
}
.slot-hex.empty::before {
  content: '';
  position: absolute;
  inset: 4px;
  clip-path: polygon(50% 0, 100% 21%, 100% 79%, 50% 100%, 0 79%, 0 21%);
  background: rgb(18 18 22 / 0.92);
}
.hex-plus {
  position: relative;
}
.slot-hex.on {
  filter: drop-shadow(0 0 0 #fff) brightness(1.15);
  outline: 2px solid #fff;
}
.hex-plus {
  display: grid;
  place-items: center;
  height: 100%;
  font-size: 2rem;
  color: rgb(255 255 255 / 0.55);
}
.hex-store {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  padding: 0.6rem 0.4rem;
}
/* burnt already: lit with a white edge */
.hex.in {
  filter: drop-shadow(0 0 8px rgb(255 255 255 / 0.65)) brightness(1.1);
}
.hex:disabled {
  cursor: default;
  opacity: 0.6;
}
.hex.in:disabled {
  opacity: 1;
}
.back-perks,
.unlock {
  align-self: flex-start;
  font-size: 0.85rem;
}
.unlock {
  align-self: center;
}
.kit-card {
  padding: 0;
  border: 1px solid rgb(255 255 255 / 0.18);
  border-radius: 6px;
  background: none;
  overflow: hidden;
  cursor: zoom-in;
  transition:
    transform 0.15s,
    border-color 0.15s;
}
.kit-card:hover,
.kit-card:focus-visible {
  border-color: #f5c542;
  transform: translateY(-2px);
}
.kit-card img {
  display: block;
  height: 88px;
  width: auto;
}
/* the power's icon: square, as the PC game's power slot */
.kit-card img.icon {
  width: 88px;
}
.head strong {
  font-family: var(--font-display);
  font-size: 1.15rem;
}
.label {
  margin: 0.4rem 0 0;
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #e9e6df;
}
.hint {
  margin: 0;
  text-align: center;
  font-size: 0.8rem;
}

/* ---------- diamonds ---------- */
.dia {
  --d: 92px;
  position: relative;
  width: var(--d);
  height: var(--d);
  padding: 0;
  border: none;
  background: none;
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  transition:
    transform 0.15s,
    filter 0.15s;
}

.dia.big {
  --d: 128px;
}
.dia.big .face {
  inset: 0;
}
.dia:hover:not(:disabled),
.dia:focus-visible {
  z-index: 1;
  transform: scale(1.12);
  filter: brightness(1.15);
}
/* the icon: the diamond cut from the card, its own frame in the card's colour (purple, green, gold) */
.face {
  position: absolute;
  inset: 0;
  background-size: 100% 100%;
  background-repeat: no-repeat;
}
/* a slot: its diamond, the perk's name under it */
.slot {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  width: 150px;
}
/* the slot a click below fills: a gold diamond ring around it, pulsing */
.ring {
  position: absolute;
  top: -11px;
  left: 50%;
  width: 150px;
  height: 150px;
  transform: translateX(-50%);
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%, 7.3% 50%, 50% 92.7%, 92.7% 50%, 50% 7.3%, 7.3% 50%, 0 50%);
  background: #f5c542;
  opacity: 0;
  pointer-events: none;
}
.slot.active .ring {
  opacity: 1;
  animation: pulse 1.1s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.45;
    transform: translateX(-50%) scale(1.04);
  }
}
.slot.active .dia {
  filter: brightness(1.15);
}
/* a perk's cost, on the empty corner below-right of its diamond */
.cell {
  position: relative;
  display: inline-flex;
}
/* in the store, centred just above the diamond's bottom point: that part is its own, while the
   corners beside it are where the next row's diamonds interlock */
.cost {
  position: absolute;
  z-index: 2;
  left: 50%;
  bottom: 6px;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 1px;
  padding: 0 5px;
  border-radius: 999px;
  background: rgb(0 0 0 / 0.85);
  border: 1px solid rgb(255 255 255 / 0.35);
  color: #fff;
  font-family: var(--font-display);
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.3;
  pointer-events: none;
}
.cost.free {
  color: #8fe36a;
  font-size: 0.75rem;
}
.cell.dim .cost {
  opacity: 0.35;
}
/* on a slot: the corner of the 128px diamond, which sits centred in the 150px slot */
.cost.big {
  top: 100px;
  right: 6px;
  bottom: auto;
  left: auto;
  transform: none;
  font-size: 1rem;
  padding: 2px 8px;
}
.slot-name {
  margin-top: 0.55rem;
  font-family: var(--font-display);
  font-size: 0.95rem;
  text-align: center;
  line-height: 1.2;
}
.slot-sub {
  font-size: 0.75rem;
  color: #ffe7a6;
}
/* in the loadout already: a white frame */
.dia.in {
  background: #fff;
}
/* someone else plays it: dark, can't be picked */
.dia.taken .face {
  filter: grayscale(1) brightness(0.3);
}
.dia:disabled {
  cursor: not-allowed;
}

.slots {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  gap: 1.2rem;
  padding: 0.8rem 0.4rem 0.2rem;
}
/* under the three slots, in the middle */
.reset {
  align-self: center;
  font-size: 0.85rem;
}
.store-head {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.search {
  flex: 1;
  min-width: 12rem;
  font: inherit;
  font-size: 0.9rem;
  color: var(--text);
  background: rgb(0 0 0 / 0.4);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  padding: 0.35rem 0.6rem;
}
.store {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.rows {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 230px;
  padding-right: 58px;
}
/* rows interlock like the PC game's honeycomb: every other row half a step (41px) to the right,
   each row up by half a step so the diamonds' points sit between the ones above */
.row {
  display: flex;
  gap: 24px;
  width: calc(5 * 92px + 4 * 24px);
}
.row + .row {
  margin-top: -34px;
}
/* half a step right: a margin, not a transform, which would make each row a layer of its own and
   put the next row's diamonds over this row's cost badges (in a centred column the margin counts
   twice: 116px moves it 58px) */
.row.odd {
  margin-left: 116px;
}
/* big round arrows on either side of the perks: easy to see and to hit */
.arrow {
  flex: none;
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  padding: 0 0 4px;
  border-radius: 50%;
  font-size: 2.4rem;
  font-weight: 700;
  line-height: 1;
  color: #fff;
  background: rgb(255 255 255 / 0.08);
  border: 2px solid rgb(255 255 255 / 0.55);
  transition:
    background 0.15s,
    border-color 0.15s,
    transform 0.15s;
}
.arrow:hover:not(:disabled),
.arrow:focus-visible {
  background: rgb(245 197 66 / 0.25);
  border-color: #f5c542;
  transform: scale(1.08);
  box-shadow: 0 0 16px rgb(245 197 66 / 0.45);
}
/* nothing that way: faded, still in place so the perks don't shift */
.arrow:disabled {
  opacity: 0.15;
  cursor: default;
}
.arrow.hidden {
  visibility: hidden;
}
.pager {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
}
.dot {
  width: 14px;
  height: 14px;
  padding: 0;
  border-radius: 50%;
  background: rgb(255 255 255 / 0.15);
  border: 1px solid rgb(255 255 255 / 0.5);
}
.dot.on {
  background: #f5c542;
  border-color: #f5c542;
  box-shadow: 0 0 8px rgb(245 197 66 / 0.6);
}
.dot:hover:not(.on) {
  background: rgb(255 255 255 / 0.45);
}
.foot {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.4rem;
}
.problem {
  margin: 0;
  color: var(--warn);
  font-size: 0.9rem;
}
.confirm {
  padding: 0.65rem;
  font-size: 1.05rem;
}
.loadout.done .slots .dia {
  filter: brightness(0.9);
}

/* ---------- the Power / Passive card pointed at, and one zoomed ---------- */
.kit-tip {
  position: fixed;
  z-index: 80;
  width: min(760px, calc(100vw - 16px));
  pointer-events: none;
  border-radius: 8px;
  box-shadow: 0 14px 40px rgb(0 0 0 / 0.75);
}
.kit-zoom {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(0 0 0 / 0.8);
  cursor: zoom-out;
}
.kit-zoom img {
  max-width: min(1000px, 100%);
  max-height: 100%;
  border-radius: 8px;
  box-shadow: 0 14px 40px rgb(0 0 0 / 0.75);
}

@media (prefers-reduced-motion: reduce) {
  .slot.active .ring {
    animation: none;
  }
}
</style>
