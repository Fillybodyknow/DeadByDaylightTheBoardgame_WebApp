<script setup lang="ts">
// One character's perk loadout before a trial (Bloodweb, Devout — p.19), laid out like the PC
// game's: the 3 perk slots on top, the perks to choose from below as diamonds, and a details box
// when pointing at one. A click on a slot picks which slot changes; a click on a perk below puts it
// there. The icon is cut from the middle of the perk card (as `PerkDiamonds` does in the game).
// A killer's Power and Passive cards sit under his name, since his perks are picked around them.
import { computed, ref, watch } from 'vue'
import BpIcon from '../../components/BpIcon.vue'
import BpText from '../../components/BpText.vue'
import { killerById, survivorById } from '../../data'
import { asset } from '../../i18n'
import { sfx } from '../../sound'
import { ownPerk, printedOf, type GameMode, type Side } from '../engine/loadout'
import { PERKS, type PerkId } from '../engine/perks'
import { perkImage, perkText } from '../labels'
import Mini from './Mini.vue'
import PerkRichText from './PerkRichText.vue'

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
}>()
const loadout = defineModel<PerkId[]>({ required: true })
const emit = defineEmits<{ confirm: [on: boolean] }>()

const character = computed(() => (props.side === 'killer' ? killerById.get(props.characterId) : survivorById.get(props.characterId)))
const printed = computed(() => printedOf(props.characterId))

/** The slot a click below puts a perk into. */
const slot = ref(0)
watch(
  () => props.characterId,
  () => (slot.value = 0),
)

function pickSlot(i: number) {
  if (props.confirmed) return
  sfx.click()
  slot.value = i
}

function put(p: PerkId) {
  if (props.confirmed || props.taken.includes(p)) return
  const at = loadout.value.indexOf(p)
  // already in the loadout: that slot is the one to change next
  if (at >= 0) return void (slot.value = at)
  sfx.select()
  const next = [...loadout.value]
  next[slot.value] = p
  loadout.value = next
  // on to the next slot still showing a printed perk, if any
  const free = next.findIndex((x, i) => i !== slot.value && printed.value.includes(x))
  if (free >= 0) slot.value = free
}

function reset() {
  if (props.confirmed) return
  sfx.click()
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
  return props.choices.filter((p) => [PERKS[p].name, ownerName(p), perkText(p)].some((t) => t.toLowerCase().includes(q)))
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

/** His Power and Passive cards (Thai, as in the game), to see while picking perks. */
const kit = computed(() => {
  if (props.side !== 'killer') return []
  const k = killerById.get(props.characterId)
  if (!k) return []
  return [
    { label: 'POWER', name: k.power.name, src: k.power.image?.th ?? k.power.image?.en },
    { label: 'PASSIVE', name: 'Passive', src: k.passiveImage?.th ?? k.passiveImage?.en },
  ].filter((c): c is { label: string; name: string; src: string } => !!c.src)
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
  const img = perkImage(p)
  return img ? { backgroundImage: `url(${asset(img)})` } : {}
}
</script>

<template>
  <div class="loadout" :class="[side, { done: confirmed }]">
    <header class="head">
      <Mini v-if="character" class="mini" :class="side === 'killer' ? 'aura-killer' : 'aura-survivor'" :src="asset(character.images.mini)" />
      <div>
        <strong>{{ character?.name }}</strong>
        <small class="muted">{{ who }}{{ who ? ' · ' : '' }}{{ mode === 'devout' ? 'Devout — เลือก Perk ได้ 3 ใบ' : 'Bloodweb — การ์ดที่จั่วได้ 5 ใบ' }}</small>
      </div>
    </header>

    <!-- the killer's Power and Passive, under his name: his perks are picked around them -->
    <div v-if="kit.length" class="kit">
      <button
        v-for="c in kit"
        :key="c.label"
        type="button"
        class="kit-card"
        :title="`${c.name} — คลิกเพื่อขยาย`"
        @click="zoomKit(c.src)"
        @mouseenter="pointKit(c.src, $event)"
        @focus="pointKit(c.src, $event)"
        @mouseleave="kitTip = null"
        @blur="kitTip = null"
      >
        <img :src="asset(c.src)" :alt="c.name" draggable="false" />
      </button>
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
    <button v-if="!confirmed" type="button" class="reset" @click="reset">↺ Perk เดิม</button>
    <p v-if="!confirmed" class="hint muted">คลิกช่องด้านบนเพื่อเลือกช่องที่จะเปลี่ยน (กรอบทอง) แล้วคลิก Perk ด้านล่างเพื่อใส่</p>

    <!-- what may be picked -->
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

    <footer class="foot">
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
    <div v-if="tip" class="perk-tip" :class="[kind(tip.p), side]" :style="{ left: `${tip.x}px`, top: `${tip.y}px` }" role="tooltip">
      <div class="tip-title">{{ PERKS[tip.p].name }}</div>
      <div class="tip-band">
        <span>{{ ownerName(tip.p) }}</span>
        <span>{{ KIND_TH[kind(tip.p)] }} · <BpText :text="PERKS[tip.p].cost ? `${PERKS[tip.p].cost} ▲` : 'ฟรี'" /></span>
      </div>
      <p class="tip-text"><PerkRichText :text="perkText(tip.p)" /></p>
      <p class="tip-when">{{ PERKS[tip.p].when }}</p>
      <p v-if="taken.includes(tip.p)" class="tip-taken">การ์ดใบนี้มีคนใช้แล้ว — การ์ดมีใบเดียว</p>
      <p v-else-if="!printed.includes(tip.p) && loadout.includes(tip.p)" class="tip-laid">วางทับ Perk บนกระดาน</p>
    </div>
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
/* the killer's Power and Passive cards: a row of their own between the header and the perks */
.kit {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.8rem;
  margin-top: 0.3rem;
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
  height: 132px;
  width: auto;
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
  background: var(--frame-shared);
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  transition:
    transform 0.15s,
    filter 0.15s;
}
.dia.own {
  background: var(--frame-own);
}
.dia.card {
  background: var(--frame-card);
}
.dia.big {
  --d: 128px;
}
.dia.big .face {
  inset: 7px;
}
.dia:hover:not(:disabled),
.dia:focus-visible {
  z-index: 1;
  transform: scale(1.12);
  filter: brightness(1.15);
}
/* the icon: the diamond printed on the card, cut out and centred */
.face {
  position: absolute;
  /* a thick frame: its colour says printed on the board (purple, green) or a card (gold) */
  inset: 5px;
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  background-color: #222;
  background-size: 230% auto;
  background-position: 50% 14%;
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

/* ---------- the box pointed at ---------- */
.perk-tip {
  position: fixed;
  z-index: 80;
  width: 420px;
  pointer-events: none;
  background: rgb(10 10 14 / 0.97);
  border: 1px solid rgb(255 255 255 / 0.15);
  box-shadow: 0 14px 40px rgb(0 0 0 / 0.7);
}
.tip-title {
  padding: 0.7rem 1rem 0.45rem;
  font-family: var(--font-display);
  font-size: 1.5rem;
  color: #fff;
  border-bottom: 1px solid rgb(255 255 255 / 0.15);
}
/* the coloured band under the name: the perk's colour, owner on the left */
.tip-band {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.35rem 1rem;
  font-size: 0.95rem;
  color: #fff;
  background: linear-gradient(90deg, #6b3fa0, #4a2a72);
}
.perk-tip.shared .tip-band {
  background: linear-gradient(90deg, #4f7d1e, #33531a);
}
.perk-tip.card .tip-band {
  background: linear-gradient(90deg, #a8781c, #6e4d10);
}
.tip-text {
  margin: 0;
  padding: 0.75rem 1rem 0.4rem;
  font-size: 1.08rem;
  line-height: 1.6;
  color: #eee;
}
.tip-when {
  margin: 0;
  padding: 0 1rem 0.75rem;
  font-size: 0.9rem;
  color: var(--muted);
}
.tip-taken,
.tip-laid {
  margin: 0;
  padding: 0.4rem 1rem 0.65rem;
  font-size: 0.92rem;
}
.tip-taken {
  color: var(--blood-bright);
}
.tip-laid {
  color: #ffe7a6;
}
@media (prefers-reduced-motion: reduce) {
  .slot.active .ring {
    animation: none;
  }
}
</style>
