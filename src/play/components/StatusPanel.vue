<script setup lang="ts">
// The players, in a row under the board: the killer, then the survivors in turn order — health,
// ▲, item and planned card. Perks, power and passive are in the details (click a tile).
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { components, items, killerById } from '../../data'
import { asset } from '../../i18n'
import { CARD_NAMES, ITEM_NAMES, KILLER_BP, SURVIVOR_CARDS, isPower, killerCardCount, purgeSupply, survivorMax, itemUses, killerInteractions, roomName, turnOrder, victorRoom } from '../engine/engine'
import type { GameState, ItemUse, PathKind } from '../engine/types'
import { itemHidden, myTurn, online } from '../game'
import { KILLER_PLAYER } from '../engine/seats'
import type { InspectTarget } from '../inspect'
import { KILLER_CARD_BACK, SURVIVOR_CARD_BACK, BEAR_TRAP_IMAGE, KNIFE_IMAGE, MADNESS_IMAGE, PROP_IMAGE, VILE_PURGE_IMAGE, cardImage, cardLabel, itemImage, itemUseLabel, killerMini, playerOf, powerName, survivorMini } from '../labels'
import Mini from './Mini.vue'
import WoundRing from './WoundRing.vue'
import ObjectiveHud from './ObjectiveHud.vue'
import PerkDiamonds from './PerkDiamonds.vue'
import BpIcon from '../../components/BpIcon.vue'
import BpText from '../../components/BpText.vue'

const props = defineProps<{ st: GameState; powerOn?: boolean }>()
const emit = defineEmits<{ use: [s: number, use: ItemUse]; inspect: [target: InspectTarget]; pick: [s: number]; power: [on: boolean] }>()

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

/**
 * A survivor's hand this round, as the table shows it: each of its four cards, and whether it is
 * already face up — played (its card turned over) or discarded (a bonus turn, a perk). A card
 * still face down in planning is no one else's business: it counts as not used. Players sharing a
 * hand (p.19) show the same one. Everything comes back at Cleanup (p.11).
 */
function handCards(s: number): { card: PathKind; used: boolean }[] {
  const st = props.st
  const hand = st.survivors[s].hand
  const missing = [...SURVIVOR_CARDS] as PathKind[]
  for (const c of st.survivorHands[hand] ?? []) {
    const i = missing.indexOf(c as PathKind)
    if (i >= 0) missing.splice(i, 1)
  }
  for (const sv of st.survivors)
    if (sv.hand === hand && sv.planned && !sv.plannedRevealed) {
      const i = missing.indexOf(sv.planned as PathKind)
      if (i >= 0) missing.splice(i, 1)
    }
  return SURVIVOR_CARDS.map((card) => {
    const i = missing.indexOf(card)
    if (i >= 0) missing.splice(i, 1)
    return { card, used: i >= 0 }
  })
}
const handTitle = (s: number) => {
  const used = handCards(s).filter((c) => c.used)
  const mates = props.st.survivors.filter((sv, i) => i !== s && sv.hand === props.st.survivors[s].hand).map((sv) => sv.name)
  return `การ์ดที่ใช้ไปแล้วรอบนี้: ${used.length ? used.map((c) => CARD_NAMES[c.card]).join(', ') : 'ยังไม่มี'}${mates.length ? ` (มือร่วมกับ ${mates.join(', ')})` : ''}`
}

const STATUS_TH = { board: '', locker: 'ใน Locker', carried: 'ถูกแบก', hooked: 'บน Hook' }

/** Off the board, the state's icon goes over the portrait, as in the PC game's list. */
function stateIcon(s: number): string | null {
  const status = props.st.survivors[s].status
  if (status === 'hooked') return PROP_IMAGE.hook
  if (status === 'locker') return PROP_IMAGE.locker
  if (status === 'carried') return killerMini(props.st)
  return null
}

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
    // The Unknown: each card is one Unknown's
    caption: props.st.killer.unknowns ? `The Unknown ${i + 1}` : `ใบที่ ${i + 1}${i === 0 ? ' (ซ้าย)' : i === 1 ? ' (ขวา)' : ' (โบนัส)'}`,
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

/** A player's first tile (in turn order), where their chat bubbles point (ChatDock). */
const firstOfPlayer = (s: number) => turnOrder(props.st).find((x) => playerOf(props.st, x) === playerOf(props.st, s)) === s

// ---------- online: the characters this device plays ----------
// Their tiles are highlighted, so a player finds their own at a glance.

/** The characters this device plays (empty offline and for a spectator). */
const mine = computed<(number | 'killer')[]>(() => {
  const o = online.value
  if (!o?.seat) return []
  if (o.seat === KILLER_PLAYER) return ['killer']
  return props.st.survivors.flatMap((_, i) => (playerOf(props.st, i) === o.seat ? [i] : []))
})

// ---------- the slot under the goals: your item, or the killer's power ----------
// As in the PC game, the item in hand sits under the HUD's corner, ready to use. It belongs to
// whoever is playing now: online this device's character (the one whose turn it is, if it has
// several), on one shared device the survivor taking their turn or the killer in his.

const slotOwner = computed<number | 'killer' | null>(() => {
  const st = props.st
  if (online.value) {
    const m = mine.value
    if (m.includes('killer')) return 'killer'
    return m.find((s) => s === st.activeSurvivor) ?? m[0] ?? null
  }
  if (st.phase === 'killer') return 'killer'
  if (st.phase === 'survivors' && st.activeSurvivor !== null) return st.activeSurvivor
  return null
})

/** The killer's power card, for its icon (the picture on the card's left). */
const powerImage = computed(() => killerById.get(props.st.killer.characterId)?.power.image?.th ?? null)
/** The power can be used now: the panel's "use power" would be offered. */
const powerReady = computed(() => {
  const s = props.st.step
  return myTurn.value && s.t === 'killerInteract' && s.canInteract && killerInteractions(props.st).some(isPower)
})

function onPowerSlot() {
  if (powerReady.value) emit('power', !props.powerOn)
  else emit('inspect', { k: 'killer' })
}

</script>

<template>
  <section class="players">
    <!-- 16:9 screens: the round and phase, teleported here from GameScreen's bar -->
    <div id="rail-top" class="rail-slot" />
    <div class="tiles">
    <!-- killer -->
    <div class="tile killer" :class="{ me: mine.includes('killer') }" :data-chat-seat="KILLER_PLAYER" role="button" tabindex="0" :title="`${st.killer.name} — ดูรายละเอียดตัวละคร`" @click="emit('inspect', { k: 'killer' })" @keydown.enter="emit('inspect', { k: 'killer' })">
      <div class="head">
        <Mini class="mini aura-killer" :src="asset(killerMini(st))" :alt="st.killer.name" />
        <div class="names">
          <strong class="name" :class="{ me: mine.includes('killer') }">{{ st.killer.name }}</strong>
        </div>
      </div>
      <div class="line small">
        <span class="ptag" :class="{ me: mine.includes('killer') }" :title="`ผู้เล่น 1${mine.includes('killer') ? ' (คุณ)' : ''}`">{{ mine.includes('killer') ? 'คุณ' : 'P1' }}</span>
        <span class="bp">{{ st.killer.bp }}/{{ KILLER_BP.max }} <BpIcon /></span>
        <span v-if="st.killer.characterId === 'trapper'" class="traps"><img :src="asset(BEAR_TRAP_IMAGE)" alt="" /> ×{{ st.killer.trapsInSupply }}</span>
        <span v-if="st.killer.characterId === 'hag'" class="traps" title="Phantasm Trap ที่ยังวางได้"
          ><img :src="asset('assets/killers/tokens/hag-phantasm-trap.webp')" alt="" /> ×{{ 7 - st.phantasm.length }}</span
        >
        <span v-if="st.killer.characterId === 'plague'" class="traps" title="Vile Purge ที่ยังวางได้"
          ><img :src="asset(VILE_PURGE_IMAGE)" alt="" /> ×{{ purgeSupply(st) }}</span
        >
        <span v-if="st.sealedCard" class="warn" title="The Third Seal">ห้ามใช้ {{ st.sealedCard }}</span>
        <span v-if="st.killer.powerUsed" class="muted">ใช้พลังแล้ว</span>
        <span v-if="victorRoom(st)" class="victor-at" :title="`Victor อยู่ที่ ${roomName(st, victorRoom(st)!)}`">V · {{ roomName(st, victorRoom(st)!) }}</span>
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
        <!-- the two cards still to plan: dashed places, so the row keeps its size -->
        <span v-for="n in Math.max(0, killerCardCount(st) - st.killer.planned.length)" :key="`e${n}`" class="pcard empty" title="ยังไม่ได้วางการ์ด" />
        <PerkDiamonds :st="st" owner="killer" @open="emit('inspect', { k: 'perk', perk: $event, owner: 'killer' })" />
      </div>
    </div>

    <!-- survivors in turn order -->
    <div
      v-for="s in turnOrder(st)"
      :key="s"
      class="tile"
      :data-chat-seat="firstOfPlayer(s) ? playerOf(st, s) : undefined"
      :class="{ active: st.activeSurvivor === s, hooked: st.survivors[s].status === 'hooked', wounded: st.survivors[s].wounded, me: mine.includes(s) }"
      role="button"
      tabindex="0"
      :title="`${order(s)}. ${st.survivors[s].name}${st.survivors[s].wounded ? ' (บาดเจ็บ)' : ''}${STATUS_TH[st.survivors[s].status] ? ` — ${STATUS_TH[st.survivors[s].status]}` : ''} — ดูรายละเอียดตัวละคร`"
      @click="emit('inspect', { k: 'survivor', s })"
      @keydown.enter="emit('inspect', { k: 'survivor', s })"
    >
      <div class="head">
        <div class="mini-wrap">
          <Mini class="mini" :class="{ wounded: st.survivors[s].wounded, away: !!stateIcon(s) }" :src="asset(survivorMini(st, s))" :alt="st.survivors[s].name">
            <WoundRing v-if="st.survivors[s].wounded" />
          </Mini>
          <img v-if="stateIcon(s)" class="state" :class="st.survivors[s].status" :src="asset(stateIcon(s)!)" :alt="STATUS_TH[st.survivors[s].status]" />
          <span class="order" :title="`ลำดับเทิร์นที่ ${order(s)}`">{{ order(s) }}</span>
          <!-- the first player token: a gold coin on the portrait's corner -->
          <span v-if="st.firstPlayer === s" class="first" title="First Player — เล่นก่อนในรอบนี้">
            <img :src="asset(components.firstPlayer.image)" alt="First Player" />
          </span>
          <img v-if="st.survivors[s].madness" class="madness" :src="asset(MADNESS_IMAGE)" alt="Madness" title="Madness: ทอย Danger Die แทน Skill Check" />
          <img v-if="st.survivors[s].sacrificeToken" class="token" :src="asset(components.sacrificeProgress.image)" alt="" title="ยังมี sacrifice token บนกระดาน" />
        </div>
        <div class="names">
          <strong class="name" :class="{ me: mine.includes(s) }">{{ st.survivors[s].name }}</strong>
        </div>
      </div>
      <div class="line small">
        <span class="ptag" :class="{ me: mine.includes(s) }" :title="`ผู้เล่น ${playerOf(st, s)}${mine.includes(s) ? ' (คุณ)' : ''}`">{{ mine.includes(s) ? 'คุณ' : `P${playerOf(st, s)}` }}</span>
        <span class="bp">{{ st.survivors[s].bp }}/{{ survivorMax(st, s) }} <BpIcon /></span>
        <!-- The Trickster's Knives: one token each, the ▲ maximum 2 lower for every one -->
        <span v-if="st.survivors[s].knives" class="knives" :class="{ full: st.survivors[s].knives === 3 }" :title="`Knife ${st.survivors[s].knives}/3 — ▲ สูงสุดลดลง ${2 * st.survivors[s].knives!}${st.survivors[s].knives === 3 ? ' · หายบาดเจ็บไม่ได้' : ''} · เข้า Locker เพื่อทิ้ง`">
          <img :src="asset(KNIFE_IMAGE)" alt="Knife" /><b>{{ st.survivors[s].knives }}/3</b>
        </span>
        <!-- the hand's movement cards: the ones already face up this round are crossed out -->
        <span class="hand-strip" :title="handTitle(s)" :aria-label="handTitle(s)">
          <span v-for="c in handCards(s)" :key="c.card" class="hcard" :class="{ used: c.used }">
            <img :src="asset(cardImage(c.card))" alt="" />
          </span>
        </span>
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
        <!-- no card yet: a dashed place for it (none for a survivor on a hook, who plans none) -->
        <span v-else-if="st.survivors[s].status !== 'hooked'" class="pcard empty" title="ยังไม่ได้วางการ์ด" />
        <!-- online, everyone but its holder sees the back of the item card: something is held, not what -->
        <img v-if="st.survivors[s].item && itemHidden(st, s)" class="item hidden" :src="asset('assets/items/back.webp')" alt="ถือ item อยู่" title="ถือ item อยู่ 1 ใบ" />
        <button
          v-else-if="st.survivors[s].item"
          class="item"
          :class="{ usable: itemUses(st, s).length > 0 }"
          :title="ITEM_NAMES[st.survivors[s].item!]"
          @click.stop="openItem = openItem === s ? null : s"
        >
          <img :src="asset(itemImage(st.survivors[s].item!))" :alt="ITEM_NAMES[st.survivors[s].item!]" />
        </button>
        <span v-else class="item empty" title="ไม่มี item" />
        <PerkDiamonds :st="st" :owner="s" @open="emit('inspect', { k: 'perk', perk: $event, owner: s })" />
      </div>
    </div>
    </div>

    <!-- both sides' goals at the foot of the column: the bottom-left corner, as in the PC game -->
    <ObjectiveHud class="objectives" :st="st" />

    <!-- under the goals: the item of whoever plays now, or the killer's power; a click uses it -->
    <button
      v-if="slotOwner === 'killer' && powerImage"
      type="button"
      class="slot power"
      :class="{ usable: powerReady, on: powerOn, spent: st.killer.powerUsed }"
      :title="powerReady ? (powerOn ? `ยกเลิกการใช้พลัง ${powerName(st)}` : `ใช้พลัง: ${powerName(st)}`) : st.killer.powerUsed ? `${powerName(st)} — ใช้ไปแล้วรอบนี้` : `${powerName(st)} — ตอนนี้ใช้ไม่ได้ (คลิกดูรายละเอียด)`"
      @click="onPowerSlot"
    >
      <span class="slot-icon" :style="{ backgroundImage: `url(${asset(powerImage)})` }" />
      <span class="slot-name">{{ powerName(st) }}</span>
    </button>
    <template v-else-if="typeof slotOwner === 'number'">
      <button
        v-if="st.survivors[slotOwner].item"
        type="button"
        class="slot item-slot"
        :class="{ usable: itemUses(st, slotOwner).length > 0 }"
        :title="`${st.survivors[slotOwner].name}: ${ITEM_NAMES[st.survivors[slotOwner].item!]} — คลิกเพื่อใช้`"
        @click="openItem = slotOwner"
      >
        <span class="slot-crop"><img :src="asset(itemImage(st.survivors[slotOwner].item!))" alt="" /></span>
        <span class="slot-name">{{ ITEM_NAMES[st.survivors[slotOwner].item!] }}</span>
        <!-- what the item can do now, in words: gold and pulsing when it can be used -->
        <span class="slot-use">{{ itemUses(st, slotOwner).length > 0 ? '👆 กดเพื่อใช้' : 'ยังใช้ไม่ได้ตอนนี้' }}</span>
      </button>
      <div v-else class="slot empty" :title="`${st.survivors[slotOwner].name} ไม่มี item`">
        <span class="slot-crop" />
        <span class="slot-name">ไม่มี item</span>
      </div>
    </template>

    <!-- 16:9 screens: the game's controls, teleported here from GameScreen's bar -->
    <div id="rail-bottom" class="rail-slot" />

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
              <p class="item-text"><BpText :text="itemOpen.text" /></p>
              <div class="buttons">
                <button v-for="(u, i) in itemOpen.uses" :key="i" class="primary" @click="use(itemOpen.s, u)"><BpText :text="itemUseLabel(st, itemOpen.s, itemOpen.id, u)" /></button>
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
  /* room for a killer's three planned cards and his perks in one row */
  width: 230px;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
/* The column is as tall as the map at most; with your own block on top of a full table of tiles
   it can run past the foot of a short screen, and then it scrolls on its own. */
@media (min-width: 981px) {
  .players {
    /* as tall as the map, so the goals sit at its foot */
    align-self: stretch;
    max-height: calc(100vh - 4.5rem);
    overflow-y: auto;
    scrollbar-width: thin;
  }
}
/* 16:9 screens: no bar on top, the column runs the full height */
@media (min-width: 981px) and (min-aspect-ratio: 16/9) {
  .players {
    max-height: calc(100vh - 1rem);
  }
}
/* hooked / in a locker / carried: the state's icon over a darkened portrait */
.mini.away {
  filter: grayscale(0.7) brightness(0.45);
}
.state {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 78%;
  translate: -50% -50%;
  pointer-events: none;
  filter: drop-shadow(0 0 3px rgb(0 0 0 / 0.9));
}
.state.hooked {
  animation: hooked 1.6s ease-in-out infinite;
}
/* carried: the killer's mini, small and ringed in red */
.state.carried {
  width: 64%;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--blood-bright);
}
@keyframes hooked {
  50% {
    filter: drop-shadow(0 0 6px rgb(255 40 40 / 0.95));
  }
}
@media (prefers-reduced-motion: reduce) {
  .state.hooked {
    animation: none;
  }
}
/* the goals: at the foot of the column, under the list */
.rail-slot {
  flex: none;
}
.rail-slot:empty {
  display: none;
}
.objectives {
  flex: none;
  margin-top: 0.35rem;
}
/* The item / power slot under the goals: a square icon in a dark frame, like the PC game's item
   slot, with its name under it. It glows when it can be used now. */
.slot {
  flex: none;
  display: grid;
  justify-items: center;
  gap: 0.2rem;
  padding: 0.35rem 0.3rem 0.3rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: linear-gradient(180deg, rgb(10 11 14 / 0.94), rgb(20 22 26 / 0.94));
  color: inherit;
  font: inherit;
  text-align: center;
}
button.slot {
  cursor: pointer;
}
button.slot:hover .slot-icon,
button.slot:hover .slot-crop {
  border-color: var(--line-strong);
}
.slot-icon,
.slot-crop {
  position: relative;
  display: block;
  width: 64px;
  height: 64px;
  overflow: hidden;
  border: 2px solid rgb(255 255 255 / 0.18);
  border-radius: 6px;
  background-color: #1a1c20;
}
/* the power card's picture: the square on its left (each card is laid out the same) */
.slot-icon {
  background-size: 413% auto;
  background-position: 3% 62%;
  background-repeat: no-repeat;
}
/* the item's icon, cropped from the top of its card (as on the tiles) */
.slot-crop img {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 290%;
  max-width: none;
  transform: translate(-50%, -27%);
}
.slot-name {
  max-width: 100%;
  font-size: 0.64rem;
  line-height: 1.2;
  color: #e9e2d2;
}
.slot.usable .slot-icon,
.slot.usable .slot-crop {
  border-color: #ffe9b0;
  box-shadow: 0 0 12px rgb(255 214 140 / 0.6);
  animation: ready 1.8s ease-in-out infinite;
}
/* the power picked: its targets are on the board now */
.slot.on .slot-icon {
  border-color: var(--blood-bright);
  box-shadow: 0 0 14px rgb(255 40 40 / 0.8);
  animation: none;
}
.slot.spent .slot-icon {
  filter: grayscale(1) brightness(0.5);
}
.slot.empty .slot-crop {
  border-style: dashed;
  background: rgb(0 0 0 / 0.3);
}
.slot.empty .slot-name {
  color: var(--muted);
}
@keyframes ready {
  50% {
    box-shadow: 0 0 18px rgb(255 214 140 / 0.9);
  }
}
/* an item that can be used now stands out of the rail: a gold frame, a ring spreading from the
   icon, the words under it; one that cannot is dimmed, so the difference is not only a glow */
.item-slot .slot-use {
  font-size: 0.66rem;
  line-height: 1.2;
  color: var(--muted);
}
.item-slot:not(.usable) .slot-crop {
  filter: saturate(0.45) brightness(0.7);
}
.item-slot.usable {
  border-color: #ffd98a;
  background: linear-gradient(180deg, rgb(70 52 14 / 0.9), rgb(28 22 10 / 0.95));
  box-shadow: 0 0 16px rgb(255 205 100 / 0.35);
}
.item-slot.usable .slot-crop::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 6px;
  border: 2px solid #ffe9b0;
  animation: item-ring 1.6s ease-out infinite;
  pointer-events: none;
}
.item-slot.usable .slot-use {
  font-size: 0.74rem;
  font-weight: 700;
  color: #ffe9b0;
  text-shadow: 0 0 8px rgb(255 190 80 / 0.7);
  animation: item-text 1.6s ease-in-out infinite;
}
@keyframes item-ring {
  from {
    transform: scale(1);
    opacity: 0.9;
  }
  to {
    transform: scale(1.3);
    opacity: 0;
  }
}
@keyframes item-text {
  50% {
    opacity: 0.6;
  }
}
@media (prefers-reduced-motion: reduce) {
  .item-slot.usable .slot-crop::after,
  .item-slot.usable .slot-use {
    animation: none;
  }
  .slot.usable .slot-icon,
  .slot.usable .slot-crop {
    animation: none;
  }
}
/* The list, as in the PC game's HUD: bare rows of portrait and name, at the foot of the column
   just above the goals — no boxes, the state on the portrait. */
.tiles {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin-top: auto;
}
.tile {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 0 0.3rem;
  /* room on the left for the wound ring and its glow, which reach past the portrait */
  padding: 0.3rem 0.25rem 0.3rem 0.55rem;
  border-left: 2px solid transparent;
  border-radius: 0 var(--radius) var(--radius) 0;
  background: linear-gradient(90deg, rgb(0 0 0 / 0.55), rgb(0 0 0 / 0.15));
  cursor: pointer;
  transition: background 0.15s;
}
.tile:hover,
.tile:focus-visible {
  background: linear-gradient(90deg, rgb(255 255 255 / 0.1), rgb(255 255 255 / 0.02));
}
/* the killer heads the list, set apart by a red edge */
.tile.killer {
  margin-bottom: 0.25rem;
  border-left-color: var(--blood-bright);
  background: linear-gradient(90deg, rgb(92 11 16 / 0.6), rgb(92 11 16 / 0.1));
}
/* whose turn it is: a gold edge and glow along the row */
.tile.active {
  border-left-color: #ffd56a;
  background: linear-gradient(90deg, rgb(255 214 140 / 0.22), rgb(255 214 140 / 0.03));
}
.tile.hooked .name {
  color: var(--muted);
}
/* wounded: a red wash behind the row, as the PC game reddens the portrait */
.tile.wounded {
  background: linear-gradient(90deg, rgb(150 12 18 / 0.5), rgb(150 12 18 / 0.05));
}
.tile.wounded.active {
  background: linear-gradient(90deg, rgb(150 12 18 / 0.5), rgb(255 214 140 / 0.12));
}
/* online: your own character — a gold frame round the row, whatever state it is in */
.tile.me {
  outline: 2px solid rgb(255 214 140 / 0.85);
  outline-offset: -2px;
  border-radius: var(--radius);
  box-shadow: 0 0 14px rgb(255 214 140 / 0.35);
}
.tile.me:not(.wounded):not(.active) {
  background: linear-gradient(90deg, rgb(255 214 140 / 0.18), rgb(255 214 140 / 0.03));
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.9rem;
  color: #f2efe6;
  text-transform: capitalize;
}
.name.me {
  color: #ffe9b0;
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
  font-size: 0.72rem;
  line-height: 1.35;
  color: var(--muted);
}
/* online: which of these tiles is yours */
.ptag.me {
  border-color: rgb(255 214 140 / 0.7);
  background: rgb(255 214 140 / 0.12);
  color: #ffe9b0;
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
  width: 46px;
  height: 46px;
  flex: none;
  border-radius: 50%;
  object-fit: contain;
}
/* wounded: the blood ring (WoundRing) is laid over the portrait */
/* the first player token: a gold coin with the jar on it, on the portrait's lower-left corner
   (clear of the name beside it) */
.first {
  position: absolute;
  left: -12px;
  bottom: -10px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff1b8, #f5c542 45%, #9a6a12);
  box-shadow:
    0 0 0 2px #2a1d05,
    0 0 14px 2px rgb(255 205 80 / 0.75);
}
.first img {
  width: 23px;
  filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.6));
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
/* Madness, on the portrait's lower-right corner (the first player coin has the left one) */
.madness {
  position: absolute;
  right: -8px;
  bottom: -6px;
  z-index: 2;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  object-fit: cover;
  box-shadow:
    0 0 0 2px #9cff6b,
    0 1px 4px rgb(0 0 0 / 0.85);
}
.victor-at {
  color: #e0a3ff;
  font-size: 0.7rem;
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
  font-size: 0.82rem;
}
/* the hand's four movement cards, small; used ones dim under a red cross */
.hand-strip {
  display: inline-flex;
  gap: 2px;
  margin-left: auto;
}
.hcard {
  position: relative;
  width: 15px;
  height: 21px;
  border-radius: 2px;
  overflow: hidden;
}
.hcard img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.hcard.used img {
  opacity: 0.28;
  filter: grayscale(0.8);
}
.hcard.used::after {
  content: '✕';
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 900;
  line-height: 1;
  color: #ff4d4d;
  text-shadow: 0 0 2px #000;
}
.knives {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 0.74rem;
  color: #e8b77f;
}
.knives.full b {
  color: var(--blood-bright);
}
.knives img {
  width: 18px;
  height: 18px;
  border-radius: 3px;
  box-shadow: 0 0 0 1px #c98a4b;
}
/* three: wounded for good until a locker */
.knives.full img {
  box-shadow: 0 0 0 1px var(--blood-bright), 0 0 6px var(--blood-bright);
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
/* one row: the cards, the item, and the perks at its right end */
.cards {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.3rem;
  align-items: center;
}
.pcard {
  display: block;
  width: 50px;
  /* the cards give way when the row is full (the killer's third), the perks never do */
  flex: 0 1 auto;
  min-width: 0;
  aspect-ratio: 0.72;
  object-fit: cover;
  border-radius: 4px;
}
/* the killer's cards share the deck's back: a red frame says whose they are */
.tile.killer .pcard {
  box-shadow: 0 0 0 2px var(--blood-bright);
}
.tile.killer .pcard.empty {
  box-shadow: none;
}
/* a place waiting for a card or an item: dashed, the size of what goes there */
.pcard.empty,
.item.empty {
  box-sizing: border-box;
  border: 2px dashed rgb(255 255 255 / 0.22);
  background: rgb(0 0 0 / 0.25);
}
.item.empty {
  display: block;
  border-radius: 6px;
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
/* the item's icon, cropped from the top of its card and enlarged (the whole card is in the modal) */
.item {
  position: relative;
  overflow: hidden;
  padding: 0;
  width: 46px;
  height: 46px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: #1a1c20;
}
img.item.hidden {
  display: block;
  width: 34px;
  height: auto;
  border-radius: 4px;
}
button.item img {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 290%;
  max-width: none;
  transform: translate(-50%, -27%);
}
.item.usable {
  border-color: #ffe9b0;
  box-shadow: 0 0 10px rgb(255 214 140 / 0.55);
  animation: ready 1.8s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .item.usable {
    animation: none;
  }
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
  .tile {
    --perk-d: 31px;
  }
  .players {
    width: auto;
    flex-direction: row;
  }
  .tiles {
    flex: 1;
    margin-top: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  }
  .objectives,
  .slot {
    margin-top: 0;
    align-self: center;
  }
}
</style>
