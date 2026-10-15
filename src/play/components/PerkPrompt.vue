<script setup lang="ts">
// Decisions about perks: a perk offered when its moment comes, the start-of-turn perks, and a
// roll still waiting on Iron Will, a key or Bond's choice. Docked beside the board (not over
// it) so the map stays readable: the board lights up who is involved and where they could go,
// a few facts sum it up, and hovering a choice previews it on the map.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { asset } from '../../i18n'
import { CARD_NAMES, ITEM_NAMES, KILLER_CARDS, offeredPerks, perkButtons, perkChoices, phantasmInteractions, rerollers, roomName } from '../engine/engine'
import { PERKS, type PerkId } from '../engine/perks'
import type { Action, GameState, KillerInteraction, MoveCard, PerkChoice, PerkOwner } from '../engine/types'
import { actionKey } from '../boardActions'
import { choicePreview, decisionFocus, preview } from '../focus'
import { fxSound } from '../fx/audio'
import { fx } from '../fx/bus'
import { dispatch } from '../game'
import { ROLL_TITLE, orderedChoices, cardCaption, cardImage, cardLabel, killerInteractionLabel, killerMini, ownerLabel, perkChoiceLabel, perkImage, perkText, playerOf, survivorMini, windowLabel } from '../labels'
import CardHand, { type HandCard } from './CardHand.vue'
import DiceRow from './DiceRow.vue'
import FaceLabel from './FaceLabel.vue'
import Mini from './Mini.vue'

const props = defineProps<{ st: GameState; hidden: boolean; onBoard: Set<string> }>()

// A choice the board already offers (a path, a prop, a survivor, a room) is made there, not here.
const perkAct = (perk: PerkId, c: PerkChoice): Action => ({ t: 'perk', perk, use: true, choice: c })
const here = (a: Action) => !props.onBoard.has(actionKey(a))
/** A choice of the perk on offer that isn't on the board. */
const offerHere = (c: PerkChoice) => (props.st.step.t === 'offer' ? here(perkAct(props.st.step.perk, c)) : true)

const step = computed(() => props.st.step)
const buttons = computed(() => perkButtons(props.st))
const keyHolders = computed(() => rerollers(props.st))

const offerChoices = computed(() => {
  const s = step.value
  if (s.t !== 'offer') return []
  return orderedChoices(props.st, s.perk, s.w, perkChoices(props.st, s.perk, s.owner, s.w))
})

// ---------- Tinkerer, Zanshin Tactics: pick the planned card, then what to put in its place ----------

const isTinkerer = computed(() => step.value.t === 'offer' && (step.value.perk === 'tinkerer' || step.value.perk === 'zanshin_tactics'))
const tinkerIndex = ref<number | null>(null)
watch(
  () => (isTinkerer.value ? JSON.stringify(step.value) : null),
  () => (tinkerIndex.value = offerChoices.value.find((c) => c.index !== undefined)?.index ?? null),
  { immediate: true },
)
/** The killer's planned cards: played, or still to come (and so changeable). */
const plannedCards = computed(() => {
  const k = props.st.killer
  return k.planned.map((card, i) => ({ card, i, played: i < k.revealedCount, next: i === k.revealedCount }))
})
const tinkerSwaps = computed(() => offerChoices.value.filter((c) => c.index === tinkerIndex.value))

/** Several perks of one owner at the same moment: each with its choices, used in any order (p.16). */
const offerList = computed(() => {
  const s = step.value
  return s.t === 'offer' ? offeredPerks(s).map((perk) => ({ perk, choices: perkChoices(props.st, perk, s.owner, s.w) })) : []
})

/** What is being decided now, if anything worth the panel. */
const kind = computed<'offer' | 'turnStart' | 'roll' | 'spark' | 'phantasm' | 'replace' | 'guess' | null>(() => {
  const s = step.value
  if (s.t === 'offer') return 'offer'
  if (s.t === 'sparkChoice') return 'spark'
  if (s.t === 'phantasmChoice') return 'phantasm'
  if (s.t === 'replaceCard') return 'replace'
  if (s.t === 'redeemerGuess') return 'guess'
  if (s.t === 'turnStart' && buttons.value.length) return 'turnStart'
  if (s.t === 'roll' && (s.keep || buttons.value.length || keyHolders.value.length)) return 'roll'
  return null
})

/** Who decides: the perk's owner, or the survivor whose turn / roll it is. */
const decider = computed<PerkOwner | null>(() => {
  const s = step.value
  if (s.t === 'offer') return s.owner
  if (s.t === 'turnStart') return s.s
  if (s.t === 'roll') return buttons.value[0]?.owner ?? s.ctx.s
  if (s.t === 'sparkChoice' || s.t === 'replaceCard' || s.t === 'redeemerGuess') return s.s
  if (s.t === 'phantasmChoice') return 'killer'
  return null
})

const hagMoves = computed(() => {
  const s = step.value
  return s.t === 'phantasmChoice' ? phantasmInteractions(props.st, s.room) : []
})

function hoverHag(i: KillerInteraction | null, room: string) {
  preview.value = i ? { survivors: 'target' in i ? [i.target] : [], dests: [room] } : null
}

const handCards = computed(() => {
  const s = step.value
  return s.t === 'replaceCard' ? [...new Set(props.st.survivorHands[props.st.survivors[s.s].hand])] : []
})

const killerSide = computed(() => decider.value === 'killer')
/** Dragon's Grip discards one or two cards: its choices are buttons, not the hand. */
const isGrip = computed(() => step.value.t === 'offer' && step.value.perk === 'dragons_grip')
/** Oppression: its generators are picked on the board (GameScreen confirms), not from a list. */
const isOppression = computed(() => step.value.t === 'offer' && step.value.perk === 'oppression')

// ---------- movement cards: picked from the hand along the bottom, then confirmed ----------

/** The card choice picked, waiting for "confirm". */
const cardPick = ref<PerkChoice | null>(null)
watch(
  () => JSON.stringify(step.value),
  () => (cardPick.value = null),
)

/** Perks whose card is then played to move: hovering it shows where it goes. */
const MOVE_PERKS: PerkId[] = ['adrenaline', 'saboteur', 'up_the_ante', 'any_means_necessary', 'devour_hope', 'shadowborn']

/** The cards to choose from: an offer's card choices (Tinkerer / Zanshin: for the planned card picked), or Predator's new card. */
const handChoices = computed<PerkChoice[]>(() => {
  const s = step.value
  if (s.t === 'replaceCard') return handCards.value.map((card) => ({ card }))
  if (s.t === 'redeemerGuess') return KILLER_CARDS.map((card) => ({ card }))
  if (s.t !== 'offer' || offerList.value.length > 1) return []
  // Dragon's Grip discards one or two cards: its choices stay buttons
  if (s.perk === 'dragons_grip') return []
  return isTinkerer.value ? tinkerSwaps.value : offerChoices.value.filter((c) => c.card)
})

const perkHand = computed<HandCard[]>(() => {
  const s = step.value
  return handChoices.value.map((c) => {
    const picked = cardPick.value?.card === c.card
    return { card: c.card!, picked, ...(picked && s.t === 'offer' ? { badge: cardCaption(s.perk, c) } : {}) }
  })
})

const handLabel = computed(() => {
  const s = step.value
  if (s.t === 'replaceCard') return `Predator — มือของ ${props.st.survivors[s.s].name}`
  if (s.t === 'redeemerGuess') return `ทายการ์ดที่ ${props.st.killer.name} ทิ้ง`
  return s.t === 'offer' ? `${PERKS[s.perk].name} — เลือกการ์ดจากมือ` : ''
})

function pickHandCard(card: MoveCard) {
  fxSound.flip()
  cardPick.value = cardPick.value?.card === card ? null : (handChoices.value.find((c) => c.card === card) ?? null)
}

function hoverHandCard(card: MoveCard | null) {
  const s = step.value
  const owner = s.t === 'replaceCard' ? s.s : s.t === 'offer' && MOVE_PERKS.includes(s.perk) ? s.owner : null
  if (!card || owner === null) return (preview.value = null)
  preview.value = choicePreview(props.st, { card }, owner === 'killer' ? props.st.killer.room : props.st.survivors[owner].room, owner)
}

function confirmCard() {
  const s = step.value
  const c = cardPick.value
  if (!c) return
  if (s.t === 'replaceCard') act({ t: 'replace', card: c.card! })
  else if (s.t === 'redeemerGuess') act({ t: 'guess', card: c.card! })
  else if (s.t === 'offer') act({ t: 'perk', perk: s.perk, use: true, choice: c })
}

// Wait for perk cards, dice and board animations to finish before asking.
const open = computed(() => kind.value !== null && !props.hidden && fx.perks.length === 0 && fx.dice.length === 0 && !fx.boardBusy)

watch(
  () => (open.value ? JSON.stringify(step.value) : null),
  (now, before) => {
    preview.value = null
    if (now && now !== before) {
      fxSound.perk(killerSide.value)
      collapsed.value = false // a new decision always opens the panel
    }
  },
)
onBeforeUnmount(() => (preview.value = null))

const facts = computed(() => (open.value ? (decisionFocus(props.st)?.facts ?? []) : []))

/** Folded away to see the board: only the header stays, saying what is waiting. */
const collapsed = ref(false)

/** What is being decided, in a few words, for the folded panel. */
const summary = computed(() => {
  const s = step.value
  if (s.t === 'offer') return `ใช้ ${offeredPerks(s).map((p) => PERKS[p].name).join(' / ')}?`
  if (kind.value === 'turnStart') return 'Perk ตอนเริ่มเทิร์น'
  if (kind.value === 'roll') return 'ตัดสินใจเรื่องผลทอย'
  if (kind.value === 'replace') return 'เปลี่ยนการ์ดเคลื่อนที่'
  if (kind.value === 'guess') return 'ทายการ์ดของ Redeemer'
  return 'ใช้พลัง?'
})

function act(a: Action) {
  preview.value = null
  dispatch(a)
}

/** Where a choice starts from, to find the room at the other end of its path. */
function fromRoom(owner: PerkOwner, c: PerkChoice, perk?: PerkId): string {
  const s = step.value
  if (s.t === 'offer' && s.w.k === 'afterAttack' && (perk ?? s.perk) === 'brutal_strength') return props.st.survivors[s.w.target].room
  if (c.path && owner !== 'killer') return props.st.survivors[owner].room
  return props.st.killer.room
}

function hover(owner: PerkOwner, c: PerkChoice | null, perk?: PerkId) {
  preview.value = c ? choicePreview(props.st, c, fromRoom(owner, c, perk), owner) : null
}

const face = computed(() => {
  const d = decider.value
  if (d === null) return ''
  return d === 'killer' ? killerMini(props.st) : survivorMini(props.st, d)
})

const who = computed(() => {
  const d = decider.value
  if (d === null) return ''
  return `${ownerLabel(props.st, d)} · ผู้เล่น ${d === 'killer' ? 1 : playerOf(props.st, d)}`
})


const cost = (p: PerkId) => (PERKS[p].cost ? `${PERKS[p].cost} ▲` : 'ฟรี')

/** How many of this decision's choices are on the board (for the hint). */
const boardCount = computed(() => {
  const s = step.value
  if (isOppression.value) return offerChoices.value.filter((c) => !c.prop2).length
  if (s.t === 'offer') return offerList.value.reduce((n, o) => n + o.choices.filter((c) => !here(perkAct(o.perk, c))).length, 0)
  if (s.t === 'turnStart') return buttons.value.reduce((n, b) => n + b.choices.filter((c) => !here(perkAct(b.perk, c))).length, 0)
  if (s.t === 'phantasmChoice') return [...hagMoves.value.map((i) => ({ t: 'phantasm', teleport: true, i }) as Action), { t: 'phantasm', teleport: true } as Action].filter((a) => !here(a)).length
  return 0
})
</script>

<template>
  <transition name="dock">
    <aside v-if="open" class="dock" :class="{ killer: killerSide, collapsed }" role="dialog" aria-live="assertive">
      <header @click="collapsed && (collapsed = false)">
        <Mini class="face" :class="killerSide ? 'aura-killer' : 'aura-survivor'" :src="asset(face)" />
        <div class="head-text">
          <p class="eyebrow">⚡ {{ kind === 'spark' || kind === 'phantasm' || kind === 'guess' ? 'Power' : kind === 'replace' ? 'Predator' : 'Perk' }} — ถึงคราวตัดสินใจ</p>
          <strong class="who">{{ who }}</strong>
          <p v-if="collapsed" class="why">{{ summary }}</p>
          <p v-else-if="step.t === 'offer' && windowLabel(st, step.w)" class="why">{{ windowLabel(st, step.w) }}</p>
        </div>
        <button
          type="button"
          class="fold"
          :aria-expanded="!collapsed"
          :title="collapsed ? 'เปิดแผงตัดสินใจ' : 'พับเก็บเพื่อดูกระดาน'"
          @click.stop="collapsed = !collapsed"
        >
          {{ collapsed ? 'เปิด ◂' : 'พับ ▸' }}
        </button>
      </header>

      <!-- the situation, in a few lines; the board lights the same things up -->
      <ul v-if="facts.length" class="facts">
        <li v-for="(f, i) in facts" :key="i">
          <span class="icon">{{ f.icon }}</span>
          <FaceLabel :st="st" :who="f.who" :text="f.text" />
        </li>
      </ul>

      <p v-if="boardCount" class="board-hint">🎯 เลือกบนแผนที่ได้เลย — คลิกวงที่กระพริบ ({{ boardCount }} ตัวเลือก)</p>

      <!-- several perks of one owner at the same moment: pick which to use first (p.16) -->
      <template v-if="step.t === 'offer' && offerList.length > 1">
        <p class="lead">มี {{ offerList.length }} Perk ที่ใช้ได้ในจังหวะนี้ — เลือกใช้ใบไหนก่อนก็ได้ ใบที่เหลือจะถามต่อ (หน้า 16)</p>
        <div v-for="o in offerList" :key="o.perk" class="perk boxed">
          <img v-if="perkImage(o.perk)" class="thumb small" :src="asset(perkImage(o.perk))" :alt="PERKS[o.perk].name" />
          <div>
            <h3>
              {{ PERKS[o.perk].name }} <span class="cost">{{ cost(o.perk) }}</span>
            </h3>
            <p class="text small">{{ perkText(o.perk) }}</p>
            <div class="choices inline">
              <button
                v-for="(c, i) in o.choices.filter((c) => here(perkAct(o.perk, c)))"
                :key="i"
                class="primary"
                @mouseenter="hover(step.owner, c, o.perk)"
                @mouseleave="hover(step.owner, null)"
                @focus="hover(step.owner, c, o.perk)"
                @blur="hover(step.owner, null)"
                @click="act({ t: 'perk', perk: o.perk, use: true, choice: c })"
              >
                <FaceLabel :st="st" :who="c.target" :text="c.card ? cardCaption(o.perk, c) : perkChoiceLabel(st, o.perk, step.owner, step.w, c)" />
              </button>
            </div>
          </div>
        </div>
        <div class="choices">
          <button @click="act({ t: 'perk', perk: step.perk, use: false })">ไม่ใช้ทั้งหมด</button>
          <button class="quiet" @click="act({ t: 'perk', perk: step.perk, use: false, quiet: true })">ไม่ใช้ และไม่ต้องถามอีกในรอบนี้</button>
        </div>
      </template>

      <!-- a perk offered at its moment -->
      <template v-else-if="step.t === 'offer'">
        <div class="perk">
          <img v-if="perkImage(step.perk)" class="thumb" :src="asset(perkImage(step.perk))" :alt="PERKS[step.perk].name" />
          <div>
            <h2>
              ใช้ {{ PERKS[step.perk].name }}? <span class="cost">{{ cost(step.perk) }}</span>
            </h2>
            <p class="text">{{ perkText(step.perk) }}</p>
          </div>
        </div>
        <!-- Tinkerer: the planned cards, then the hand -->
        <div v-if="isTinkerer" class="tinker">
          <p class="tinker-step">1. เลือกการ์ดที่วางไว้ที่จะเปลี่ยน</p>
          <div class="card-row">
            <button
              v-for="p in plannedCards"
              :key="`p${p.i}`"
              class="card-btn planned"
              :class="{ on: tinkerIndex === p.i, played: p.played }"
              :disabled="p.played"
              @click="tinkerIndex = p.i"
            >
              <img :src="asset(cardImage(p.card))" :alt="cardLabel(p.card)" />
              <span>ใบที่ {{ p.i + 1 }} · {{ p.played ? 'เล่นแล้ว' : p.next ? 'ใช้เทิร์นถัดไป' : 'ยังไม่ใช้' }}</span>
            </button>
          </div>
          <template v-if="tinkerIndex !== null">
            <p class="tinker-step">2. เปลี่ยน {{ CARD_NAMES[st.killer.planned[tinkerIndex]] }} (ใบที่ {{ tinkerIndex + 1 }}) เป็น — เลือกจากไพ่บนมือด้านล่าง</p>
          </template>
        </div>
        <p v-else-if="handChoices.length" class="hand-hint">👇 เลือกการ์ดจากไพ่บนมือด้านล่าง{{ MOVE_PERKS.includes(step.perk) ? ' — ชี้เพื่อดูเส้นทาง' : '' }}</p>
        <div class="choices">
          <button v-if="handChoices.length" class="primary" :disabled="!cardPick" @click="confirmCard">
            {{ cardPick ? `ยืนยัน: ${perkChoiceLabel(st, step.perk, step.owner, step.w, cardPick)}` : 'เลือกการ์ดจากมือก่อน' }}
          </button>
          <button
            v-for="(c, i) in offerChoices.filter((c) => (!c.card || isGrip) && offerHere(c) && !isOppression)"
            :key="i"
            class="primary"
            @mouseenter="hover(step.owner, c)"
            @mouseleave="hover(step.owner, null)"
            @focus="hover(step.owner, c)"
            @blur="hover(step.owner, null)"
            @click="act({ t: 'perk', perk: step.perk, use: true, choice: c })"
          >
            <FaceLabel :st="st" :who="c.target" :text="perkChoiceLabel(st, step.perk, step.owner, step.w, c)" />
          </button>
          <button @click="act({ t: 'perk', perk: step.perk, use: false })">ไม่ใช้</button>
          <button class="quiet" @click="act({ t: 'perk', perk: step.perk, use: false, quiet: true })">ไม่ใช้ และไม่ต้องถามอีกในรอบนี้</button>
        </div>
      </template>

      <!-- start of a survivor's turn -->
      <template v-else-if="step.t === 'turnStart'">
        <p class="lead">เริ่มเทิร์น — ใช้ perk ก่อนเปิดการ์ดเดินได้</p>
        <div v-for="b in buttons" :key="b.perk" class="perk boxed">
          <img v-if="perkImage(b.perk)" class="thumb small" :src="asset(perkImage(b.perk))" :alt="PERKS[b.perk].name" />
          <div>
            <h3>
              {{ PERKS[b.perk].name }} <span class="cost">{{ cost(b.perk) }}</span>
            </h3>
            <p class="text small">{{ perkText(b.perk) }}</p>
            <div class="choices inline">
              <button
                v-for="(c, i) in b.choices.filter((c) => here(perkAct(b.perk, c)))"
                :key="i"
                @mouseenter="hover(b.owner, c)"
                @mouseleave="hover(b.owner, null)"
                @click="act({ t: 'perk', perk: b.perk, use: true, choice: c })"
              >
                <FaceLabel :st="st" :who="c.target" :text="perkChoiceLabel(st, b.perk, b.owner, b.w, c)" />
              </button>
            </div>
          </div>
        </div>
        <button class="primary wide" @click="act({ t: 'continue' })">ไม่ใช้ perk — เปิดการ์ดแล้วเดิน</button>
      </template>

      <!-- Carter's Spark: pay or take it -->
      <template v-else-if="step.t === 'sparkChoice' && step.grip">
        <p class="lead"><b>Dragon's Grip!</b> {{ st.survivors[step.s].name }} จ่าย 1 ▲ หรือบาดเจ็บ</p>
        <div class="choices">
          <button class="primary" @click="act({ t: 'spark', pay: true })">จ่าย 1 ▲ (มี {{ st.survivors[step.s].bp }} → เหลือ {{ st.survivors[step.s].bp - 1 }})</button>
          <button @click="act({ t: 'spark', pay: false })">ไม่จ่าย — บาดเจ็บ</button>
        </div>
      </template>
      <template v-else-if="step.t === 'sparkChoice'">
        <p class="lead">
          <b>Carter's Spark!</b> {{ st.survivors[step.s].name }} จ่าย 1 ▲ หรือ{{ st.survivors[step.s].madness ? 'บาดเจ็บ (มี Madness อยู่แล้ว)' : 'ติด Madness' }}
        </p>
        <p class="text small">Madness: ทอย Danger Die แทน Skill Check จนกว่าจะทอยล้มเหลว และทำให้ Bonus Turn ของ Doctor ถูกลง</p>
        <div class="choices">
          <button class="primary" @click="act({ t: 'spark', pay: true })">จ่าย 1 ▲ (มี {{ st.survivors[step.s].bp }} → เหลือ {{ st.survivors[step.s].bp - 1 }})</button>
          <button @click="act({ t: 'spark', pay: false })">ไม่จ่าย — {{ st.survivors[step.s].madness ? 'บาดเจ็บ' : 'ติด Madness' }}</button>
        </div>
      </template>

      <!-- a Phantasm Trap went off -->
      <template v-else-if="step.t === 'phantasmChoice'">
        <p class="lead">
          <b>Phantasm Trap!</b> {{ st.survivors[step.s].name }} ทอยได้ <b>{{ step.face }}</b> ที่ {{ roomName(st, step.room) }}
        </p>
        <div class="choices">
          <button @click="act({ t: 'phantasm', teleport: false })">ไม่วาร์ป — รับ +{{ step.face }} ▲</button>
          <template v-if="st.killer.bp >= step.face">
            <button
              v-for="(i, n) in hagMoves.filter((i) => here({ t: 'phantasm', teleport: true, i }))"
              :key="n"
              class="primary"
              @mouseenter="hoverHag(i, step.room)"
              @mouseleave="hoverHag(null, '')"
              @click="act({ t: 'phantasm', teleport: true, i })"
            >
              <FaceLabel :st="st" :who="'target' in i ? i.target : null" :text="`วาร์ป (${step.face} ▲) แล้ว${killerInteractionLabel(st, i)}`" />
            </button>
            <button v-if="here({ t: 'phantasm', teleport: true })" @click="act({ t: 'phantasm', teleport: true })">วาร์ปเฉย ๆ ({{ step.face }} ▲)</button>
          </template>
          <p v-else class="small">▲ ไม่พอวาร์ป (มี {{ st.killer.bp }}, ต้องใช้ {{ step.face }})</p>
        </div>
      </template>

      <!-- Predator: pick a new card -->
      <template v-else-if="step.t === 'replaceCard'">
        <p class="lead">Predator ทิ้งการ์ดของ {{ st.survivors[step.s].name }} — เลือกการ์ดใบใหม่ (คว่ำไว้)</p>
        <p class="hand-hint">👇 เลือกการ์ดจากไพ่บนมือด้านล่าง — ชี้เพื่อดูเส้นทาง</p>
        <button class="primary" :disabled="!cardPick" @click="confirmCard">{{ cardPick ? `ยืนยัน: วาง ${CARD_NAMES[cardPick.card!]} (คว่ำ)` : 'เลือกการ์ดจากมือก่อน' }}</button>
      </template>

      <!-- The Deathslinger's Redeemer: guess the card he discarded face down -->
      <template v-else-if="step.t === 'redeemerGuess'">
        <p class="lead">
          <b>Redeemer!</b> {{ st.killer.name }} ทิ้งการ์ด 1 ใบแบบคว่ำ — {{ st.survivors[step.s].name }} ทายว่าเป็นการ์ดอะไร
        </p>
        <p class="text small">ทายถูก: หลุดรอด · ทายผิด: ถูกดึงเข้าห้องของ {{ st.killer.name }} ({{ roomName(st, st.killer.room) }}) แล้วถูกอุ้ม</p>
        <p class="hand-hint">👇 เลือกการ์ดที่ทายจากไพ่ด้านล่าง แล้วกดยืนยัน</p>
        <button class="primary" :disabled="!cardPick" @click="confirmCard">{{ cardPick ? `ยืนยัน: ทาย ${CARD_NAMES[cardPick.card!]}` : 'เลือกการ์ดก่อน' }}</button>
      </template>

      <!-- a roll waiting on Iron Will, a key or Bond -->
      <template v-else-if="step.t === 'roll'">
        <p class="lead">
          <FaceLabel :st="st" :who="step.ctx.s" :text="`${st.survivors[step.ctx.s].name} ทอย ${ROLL_TITLE[step.ctx.k]}`" />
        </p>
        <div class="dice"><DiceRow :dice="step.dice" big /></div>
        <div v-for="b in buttons" :key="b.perk" class="perk boxed">
          <img v-if="perkImage(b.perk)" class="thumb small" :src="asset(perkImage(b.perk))" :alt="PERKS[b.perk].name" />
          <div>
            <h3>
              <FaceLabel :st="st" :who="b.owner" :text="`${ownerLabel(st, b.owner)}: ${PERKS[b.perk].name}`" /> <span class="cost">{{ cost(b.perk) }}</span>
            </h3>
            <p class="text small">{{ perkText(b.perk) }}</p>
            <button class="primary" @click="act({ t: 'perk', perk: b.perk, use: true, choice: {} })">ใช้ — นับผลล้มเหลวเป็นสำเร็จ</button>
          </div>
        </div>
        <div class="choices">
          <template v-for="s in keyHolders" :key="s">
            <template v-for="(d, i) in step.dice" :key="i">
              <button v-if="!d.rerolled" @click="act({ t: 'reroll', s, die: i })">
                <FaceLabel :st="st" :who="s" :text="`${st.survivors[s].name} ทิ้ง ${ITEM_NAMES[st.survivors[s].item!]} ทอยลูกที่ ${i + 1} ใหม่`" />
              </button>
            </template>
          </template>
          <template v-if="step.keep">
            <p class="small">Bond: เลือกเก็บ 1 ลูก</p>
            <button v-for="(_, i) in step.dice" :key="`k${i}`" class="primary" @click="act({ t: 'acceptRoll', die: i })">เก็บลูกที่ {{ i + 1 }}</button>
          </template>
          <button v-else @click="act({ t: 'acceptRoll' })">ไม่ใช้ — รับผลนี้</button>
        </div>
      </template>
    </aside>
  </transition>
  <CardHand v-if="open && !collapsed && perkHand.length" :cards="perkHand" :label="handLabel" @pick="pickHandCard" @hover="hoverHandCard" />
</template>

<style scoped>
.dock {
  --glow: 170 110 255;
  position: fixed;
  z-index: 33;
  right: 1rem;
  top: 4.4rem;
  width: 392px;
  max-height: calc(100vh - 5.4rem);
  overflow-y: auto;
  display: grid;
  gap: 0.75rem;
  align-content: start;
  padding: 1rem 1.1rem;
  border-radius: 10px;
  background: rgb(14 15 19 / 0.97);
  border: 2px solid rgb(var(--glow) / 0.85);
  box-shadow:
    0 0 0 4px rgb(var(--glow) / 0.15),
    0 0 50px 6px rgb(var(--glow) / 0.35),
    0 30px 80px rgb(0 0 0 / 0.8);
  animation: attention 1.8s ease-in-out infinite;
}
.dock.killer {
  --glow: 255 50 50;
}
@keyframes attention {
  50% {
    box-shadow:
      0 0 0 6px rgb(var(--glow) / 0.25),
      0 0 80px 12px rgb(var(--glow) / 0.5),
      0 30px 80px rgb(0 0 0 / 0.8);
  }
}
header {
  display: flex;
  gap: 0.7rem;
  align-items: center;
}
.head-text {
  flex: 1;
  min-width: 0;
}
.fold {
  align-self: flex-start;
  flex: none;
  padding: 0.25rem 0.6rem;
  font-size: 0.85rem;
}
/* folded: just the header, narrower, out of the board's way; tap it to open again */
.dock.collapsed {
  width: 340px;
  animation: none;
  box-shadow: 0 0 0 1px rgb(var(--glow) / 0.5), 0 10px 30px rgb(0 0 0 / 0.6);
}
.dock.collapsed > :not(header) {
  display: none;
}
.dock.collapsed header {
  cursor: pointer;
}
.dock.collapsed .face {
  width: 40px;
  height: 40px;
}
.face {
  width: 54px;
  height: 54px;
}
.eyebrow {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgb(var(--glow));
  animation: blink 1.1s ease-in-out infinite;
}
@keyframes blink {
  50% {
    opacity: 0.55;
  }
}
.who {
  display: block;
  font-family: var(--font-display);
  font-size: 1.15rem;
}
.why {
  margin: 0.1rem 0 0;
  color: var(--muted);
  font-size: 0.92rem;
}

.facts {
  list-style: none;
  margin: 0;
  padding: 0.55rem 0.65rem;
  display: grid;
  gap: 0.4rem;
  border-radius: 8px;
  background: rgb(var(--glow) / 0.08);
  border: 1px solid rgb(var(--glow) / 0.3);
  font-size: 0.9rem;
}
.facts li {
  display: flex;
  gap: 0.45rem;
  align-items: center;
}
.facts .icon {
  width: 1.3rem;
  text-align: center;
  flex: none;
}
.facts :deep(.chip) {
  width: 24px;
  height: 24px;
}

.perk {
  display: grid;
  grid-template-columns: 76px 1fr;
  gap: 0.7rem;
  align-items: start;
}
.perk.boxed {
  padding: 0.6rem;
  border-radius: 8px;
  background: rgb(var(--glow) / 0.07);
  border: 1px solid rgb(var(--glow) / 0.35);
}
.thumb {
  width: 76px;
  border-radius: 6px;
  box-shadow:
    0 0 0 2px rgb(var(--glow) / 0.7),
    0 0 18px rgb(var(--glow) / 0.4);
  animation: card-in 0.45s cubic-bezier(0.2, 1.3, 0.4, 1);
}
.thumb.small {
  width: 64px;
}
@keyframes card-in {
  from {
    transform: rotateY(-90deg) scale(0.7);
    opacity: 0;
  }
}
h2,
h3 {
  margin: 0;
}
h2 {
  font-size: 1.2rem;
}
h3 {
  font-size: 1rem;
}
.cost {
  white-space: nowrap;
  margin-left: 0.25rem;
  padding: 0 0.4rem;
  border-radius: 4px;
  background: rgb(var(--glow) / 0.22);
  border: 1px solid rgb(var(--glow) / 0.7);
  font-size: 0.8rem;
  vertical-align: middle;
}
.text {
  margin: 0.25rem 0 0;
  line-height: 1.5;
  font-size: 0.9rem;
}
.small {
  font-size: 0.85rem;
  margin: 0;
}
.hand-hint {
  margin: 0;
  padding: 0.4rem 0.6rem;
  border: 1px dashed var(--line-strong);
  border-radius: 6px;
  font-size: 0.86rem;
  color: var(--muted);
}
.board-hint {
  margin: 0;
  padding: 0.45rem 0.6rem;
  border: 1px dashed #ff8a3d;
  border-radius: 6px;
  background: rgb(255 138 61 / 0.1);
  font-size: 0.88rem;
  font-weight: 600;
}
.lead {
  margin: 0;
  font-size: 1.02rem;
}
.choices {
  display: grid;
  gap: 0.4rem;
}
.choices.inline {
  display: flex;
  flex-wrap: wrap;
  margin-top: 0.4rem;
}
.choices button {
  text-align: left;
  padding: 0.55rem 0.8rem;
}
.choices .quiet {
  background: none;
  border-color: transparent;
  color: var(--muted);
  font-size: 0.82rem;
  padding: 0.25rem 0.8rem;
}
.dice {
  display: flex;
  justify-content: center;
}
.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.card-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.card-btn {
  padding: 3px;
  width: 78px;
  display: grid;
  gap: 0.2rem;
  justify-items: center;
  font-size: 0.72rem;
  line-height: 1.2;
}
.card-btn:hover:not(:disabled) {
  transform: translateY(-4px);
  box-shadow: 0 0 14px rgb(var(--glow) / 0.6);
}
.card-btn img {
  display: block;
  width: 100%;
  border-radius: 4px;
}
.wide {
  width: 100%;
  padding: 0.7rem;
}
.tinker {
  display: grid;
  gap: 0.4rem;
}
.tinker-step {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: var(--muted);
}
.card-btn.planned.on {
  border-color: var(--blood-bright);
  box-shadow: 0 0 0 2px var(--blood-bright) inset, 0 0 14px rgb(255 40 40 / 0.4);
}
.card-btn.planned.played {
  opacity: 0.4;
}

.dock-enter-active {
  transition:
    transform 0.35s cubic-bezier(0.2, 1.3, 0.4, 1),
    opacity 0.2s;
}
.dock-leave-active {
  transition:
    transform 0.2s ease-in,
    opacity 0.15s;
}
.dock-enter-from,
.dock-leave-to {
  transform: translateX(40px);
  opacity: 0;
}

/* Narrow screens: a sheet along the bottom, the board above stays visible. */
@media (max-width: 980px) {
  .dock {
    left: 0.5rem;
    right: 0.5rem;
    top: auto;
    bottom: 0.5rem;
    width: auto;
    max-height: 55vh;
  }
  .dock.collapsed {
    width: auto;
  }
  .dock-enter-from,
  .dock-leave-to {
    transform: translateY(40px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .dock,
  .thumb,
  .eyebrow {
    animation: none;
  }
}
</style>
