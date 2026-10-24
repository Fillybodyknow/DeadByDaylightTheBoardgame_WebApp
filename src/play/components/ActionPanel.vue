<script setup lang="ts">
// What the current player can do now. Every button dispatches one engine action; moves can
// also be made by clicking the highlighted paths on the board.
import { computed, onBeforeUnmount, ref, watch, watchEffect } from 'vue'
import { asset } from '../../i18n'
import { sfx } from '../../sound'
import { boardOf,
  CARD_NAMES,
  ITEM_NAMES,
  antidoteKillerMoves,
  bonusCost,
  charlotteRoom,
  victorRoom,
  anyMoves,
  carryMoves,
  hookHere,
  isPower,
  killerInteractions,
  killerMoves,
  merchantDrones,
  unknownRooms,
  mustMove,
  perkButtons,
  propsIn,
  rerollers,
  rollHelpers,
  roomName,
  survivorInteractions,
  survivorMoves,
} from '../engine/engine'
import { PERKS, type PerkId } from '../engine/perks'
import type { Action, GameState, KillerInteraction, MoveCard, PerkChoice, PropCategory, SurvivorInteraction } from '../engine/types'
import { STEP_NAME, actionKey, perkPicked, undyingCards, undyingOptions, undyingPaths, undyingRoomOf, type StepKind } from '../boardActions'
import { controls, dispatch, online } from '../game'
import { pathPick, pathPickFor } from '../pathPick'
import {
  ANTIDOTE_IMAGE,
  GUARD_IMAGE,
  PROP_IMAGE,
  TONIC_IMAGE,
  unknownMini,
  cardImage,
  cardLabel,
  itemImage,
  interactionWho,
  killerInteractionLabel,
  killerMini,
  VICTOR_MINI,
  iconLabel,
  pathLabel,
  pathName,
  perkChoiceLabel,
  playerOf,
  powerName,
  survivorInteractionLabel,
  survivorMini,
} from '../labels'
import CardHand, { type HandCard } from './CardHand.vue'
import RollDice from './RollDice.vue'
import FaceLabel from './FaceLabel.vue'
import PerkCard from './PerkCard.vue'
import { PERK_LEAD, pickedHint as perkPickedHint } from '../perkHints'
import { choicePreview, decisionFocus, powerPreview, preview } from '../focus'
import Mini from './Mini.vue'
import BpIcon from '../../components/BpIcon.vue'
import BpText from '../../components/BpText.vue'

const props = defineProps<{
  st: GameState
  powerOn: boolean
  undyingOn: boolean
  undyingCard: MoveCard | null
  undyingRoom: string | null
  trapPath: string | null
  powerCard: MoveCard | null
  onBoard: Set<string>
}>()

// Perk and power choices the board already offers are made there; the panel points at it.
const here = (a: Action) => !props.onBoard.has(actionKey(a))
/** Windows of Opportunity's pallets are picked on the board, the pallet and then its path. */
const boardPallet = (perk: PerkId, c: PerkChoice) => perk === 'windows_of_opportunity' && !!c.path
const perkAct = (perk: PerkId, c: PerkChoice): Action => ({ t: 'perk', perk, use: true, choice: c })
const powerAct = (i: KillerInteraction): Action => ({ t: 'interact', i })
const emit = defineEmits<{
  powerOn: [on: boolean]
  undyingOn: [on: boolean]
  undyingCard: [card: MoveCard | null]
  undyingRoom: [room: string | null]
  trapPath: [path: string | null]
  powerCard: [card: MoveCard | null]
}>()

const step = computed(() => props.st.step)

function act(a: Action) {
  preview.value = null
  if (dispatch(a)) sfx.click()
}

/** Who has to act for this step: a survivor index or 'killer'. */
const actor = computed<number | 'killer' | null>(() => {
  const s = step.value
  switch (s.t) {
    case 'setupReveal':
    case 'survivorMove':
    case 'innerFocus':
    case 'empathyAsk':
    case 'survivorInteract':
    case 'bonusOffer':
    case 'anyMove':
    case 'keepItem':
    case 'pickItem':
      return s.s
    case 'revealProp':
      return s.who
    case 'offer':
      return s.owner
    case 'turnStart':
      return s.s
    case 'pickSurvivor':
    case 'carnifexProp':
    case 'carnifexMove':
    case 'reignPath':
      return 'killer'
    case 'roll':
      return s.ctx.s
    case 'killerMove':
    case 'killerAnyMove':
    case 'killerInteract':
    case 'killerBonusOffer':
    case 'carryDice':
    case 'carryMove':
      return 'killer'
    case 'reaction':
      return null
    default:
      return null
  }
})

const moves = computed(() => {
  const s = step.value
  const st = props.st
  if (s.t === 'survivorMove') return survivorMoves(st, s.s, s.card).map((m) => ({ path: m.path.id, label: pathLabel(st, m.path.id, st.survivors[s.s].room) }))
  if (s.t === 'anyMove') return anyMoves(st, s.s).map((m) => ({ path: m.path.id, label: pathLabel(st, m.path.id, st.survivors[s.s].room) }))
  if (s.t === 'killerMove') return killerMoves(st, s.card).map((m) => ({ path: m.path.id, label: pathLabel(st, m.path.id, st.killer.room) }))
  if (s.t === 'reignPath') return survivorMoves(st, s.s, s.card).map((m) => ({ path: m.path.id, label: pathLabel(st, m.path.id, st.survivors[s.s].room) }))
  if (s.t === 'killerAnyMove') return antidoteKillerMoves(st).map((m) => ({ path: m.path.id, label: pathLabel(st, m.path.id, st.killer.room) }))
  if (s.t === 'carryMove') return carryMoves(st).map((m) => ({ path: m.path.id, label: pathLabel(st, m.path.id, st.killer.room) }))
  return []
})

/** Where a Guard of The Knight stands, for the power's panel. */
const guardWhere = (g: 'carnifex' | 'assassin' | 'jailer') => (props.st.guards?.[g] ? `อยู่ที่ ${roomName(props.st, props.st.guards[g]!)}` : 'ยังไม่วาง')

/** Survivor `s` holds an item kept by Built to Last on an earlier turn of this round. */
const keptBefore = (s: number) => (props.st.kept ?? []).some((k) => k.s === s && k.item === props.st.survivors[s].item)

const hasDiversion = computed(() => {
  const s = step.value
  return s.t === 'survivorInteract' && s.canInteract && survivorInteractions(props.st, s.s).some((i) => i.k === 'diversion')
})

const sInteractions = computed(() => {
  const s = step.value
  return s.t === 'survivorInteract' && s.canInteract ? survivorInteractions(props.st, s.s).filter((i) => i.k !== 'calmSpirit' && i.k !== 'diversion') : []
})

/**
 * The interactions left for the panel: the board offers the rest (board first). A pallet is played
 * there in two clicks, the pallet then the path, so a room full of pallets doesn't fill the panel.
 */
const panelInteractions = computed(() => sInteractions.value.filter((i) => i.k !== 'dropPallet' && here({ t: 'interact', i })))
const hasPallet = computed(() => sInteractions.value.some((i) => i.k === 'dropPallet'))

/** Calm Spirit: one entry per crow, each with the rooms it can be sent to. */
const calmSpirit = computed(() => {
  const s = step.value
  if (s.t !== 'survivorInteract' || !s.canInteract) return []
  const all = survivorInteractions(props.st, s.s).filter((i): i is Extract<SurvivorInteraction, { k: 'calmSpirit' }> => i.k === 'calmSpirit')
  return [...new Set(all.map((i) => i.prop))].map((prop) => ({ prop, options: all.filter((i) => i.prop === prop) }))
})

const kInteractions = computed(() => {
  const s = step.value
  if (s.t !== 'killerInteract' || !s.canInteract) return { plain: [] as KillerInteraction[], undying: [] as KillerInteraction[], traps: [] as KillerInteraction[], powers: [] as KillerInteraction[] }
  const all = killerInteractions(props.st)
  return {
    plain: s.powerOnly ? [] : all.filter((i) => !isPower(i) && i.k !== 'undying'),
    undying: s.powerOnly ? [] : all.filter((i) => i.k === 'undying'),
    traps: all.filter((i) => i.k === 'power' && !i.remove),
    powers: all.filter(isPower),
  }
})

/** Choosing where the power goes (after "use power", or Territorial Imperative's extra use). */
const powerMode = computed(() => {
  const s = step.value
  return s.t === 'killerInteract' && s.canInteract && (props.powerOn || s.powerOnly === true)
})

/** The situation while choosing where the power goes (same facts as the perk panel). */
const POWER_HINT: Record<string, string> = {
  nurse: 'เลือกห้องที่เชื่อมกัน (ผ่าน Pallet / กำแพง / ทวน Vault ได้)',
  huntress: 'เลือกผู้รอดชีวิตในห้องที่เชื่อมกัน (คลิกบนแผนที่หรือปุ่ม)',
  doctor: 'เลือกห้องนี้หรือห้องที่เชื่อมกัน — ทุกคนในห้องนั้นจ่าย 1 ▲ หรือติด บ้าคลั่ง (มีแล้ว = บาดเจ็บ)',
  hag: 'วาง กับดักหลอก ในห้องนี้ (ห้องละ 1) — มี Hex Totem ในห้องได้ +1 ▲',
  wraith: 'วาร์ปไปห้องที่ไม่เชื่อมกับห้องนี้',
  oni: 'รับ ▲ เท่ากับจำนวนผู้รอดชีวิตที่บาดเจ็บ และ Hex Totem ในห้องนี้กับห้องที่เชื่อมกัน',
  twins: 'วาง Victor ในห้องนี้ (ถ้าอยู่ที่อื่นจะย้ายมา) — เทิร์นต่อไปเลือกเล่นด้วย Victor ได้',
  spirit: 'ทิ้งการ์ด 1 ใบ (ไม่ใช่ Wait) แล้วโจมตีผู้รอดชีวิตที่ไม่บาดเจ็บ หรือ Interact กับ prop ในห้องที่เชื่อมด้วยเส้นทางสีนั้น — คลิกเป้าหมายบนแผนที่',
  legion: 'ผู้รอดชีวิตทุกคนในห้องนี้บาดเจ็บ — ถ้ามีคนบาดเจ็บอยู่แล้วอย่างน้อย 1 คน ได้ +1 ▲',
  plague: 'วาง การชำระมลทินต่ำช้า ในห้องนี้และห้องที่เชื่อมกันที่เลือก — ผู้รอดชีวิตที่เดินเข้าไปต้องเก็บไปปิด Perk 1 อัน (อันที่ 3 = บาดเจ็บ)',
  singularity: 'เก็บการ์ดเคลื่อนที่ทุกใบที่วางไว้ (เปิดแล้วหรือยัง) กลับเข้ามือ แล้วเล่น Bonus Turn ด้วยการ์ดใบไหนก็ได้ — เทิร์นที่เหลือที่วางไว้หายไป (Bonus Turn ได้ 1 ครั้งต่อรอบ)',
  unknown: 'วาง The Unknown ตัวหมายเลขต่ำสุดที่ยังไม่อยู่บนกระดาน ลงห้องที่เชื่อมกับห้องของตัวที่เล่นอยู่ — คลิกห้องบนแผนที่ แต่ละตัวได้การ์ดของตัวเองตั้งแต่รอบหน้า',
  skullmerchant: 'เก็บ Drone หงายหน้าบนแผนที่กลับขึ้นบอร์ด (คลิก Drone) หรือวาง Drone จากบอร์ดหงายหน้าในห้องของคุณ (คลิกห้องตัวเอง)',
  artist: 'วาง Crow หรือ Dire Crow จากบอร์ดของคุณลงห้องใดก็ได้ — ถ้ามี Crow อยู่ในห้องคุณ +1 ▲ — คลิกห้องบนแผนที่ แล้วเลือกตัว',
  dredge: 'เลือกผู้รอดชีวิตในห้องนี้หรือห้องที่เชื่อมกัน (คลิกบนแผนที่) แล้วทิ้งการ์ดจากมือของเขาให้เขาเดินตามการ์ดนั้น — เข้ามาห้องคุณ = Interact กับเขาได้',
  knight: 'วาง Guard (เพชฌฆาต / มือลอบสังหาร / ผู้คุม) ในห้องนี้หรือห้องที่เชื่อมกัน (ย้ายได้ถ้าวางไว้แล้ว) — คลิกห้องบนแผนที่ แล้วเลือกตัว',
  clown: 'วาง ยาบำรุงส่งท้าย หรือ Antidote ในห้องนี้หรือห้องที่เชื่อมกัน (ย้ายได้ถ้าวางไว้แล้ว) — คลิกห้องบนแผนที่ แล้วเลือกว่าอันไหน',
  trickster: 'ผู้รอดชีวิตในห้องนี้และห้องที่เชื่อมกันได้ Knife คนละ 1 เล่ม — เล่มที่ 3 บาดเจ็บ, เกิน 3 = Sacrifice +1',
  blight: 'สุ่มทิ้งการ์ด 1 ใบจากมือ แล้วเดินตามเส้นทางสีนั้น — เข้าห้องใหม่ได้: Interact ที่นั่น หรือพุ่งต่อ',
}

const powerFacts = computed(() => (powerMode.value ? (decisionFocus(props.st, true)?.facts ?? []) : []))

function hoverPower(i: KillerInteraction | null) {
  preview.value = i ? powerPreview(props.st, i) : null
}

/** The Hillbilly: cards that have a chainsaw path. The Deathslinger: cards he may discard. */
const powerCards = computed(() => [...new Set(kInteractions.value.powers.flatMap((i) => (i.k === 'chainsaw' || i.k === 'redeemer' ? [i.card] : [])))])

// ---------- Undying / Yamaoka's Haunting: discard a card, take its path, interact over there ----------

/** Which of the two is being played, a step at a time (GameScreen holds the steps). */
const stepKind = computed<StepKind | null>(() => {
  if (props.undyingOn && kInteractions.value.undying.length) return 'undying'
  return powerMode.value && props.st.killer.characterId === 'spirit' ? 'haunt' : null
})
const stepName = computed(() => (stepKind.value ? STEP_NAME[stepKind.value] : ''))

/** The cards in hand that reach something (a colour with nothing to do isn't offered). */
const undyingHand = computed<HandCard[]>(() =>
  stepKind.value
    ? undyingCards(props.st, stepKind.value).map((card) => ({ card, picked: props.undyingCard === card, ...(props.undyingCard === card ? { badge: stepName.value } : {}) }))
    : [],
)

function pickUndyingCard(card: MoveCard) {
  sfx.click()
  emit('undyingCard', props.undyingCard === card ? null : card)
}

/** The rooms the picked card reaches, for the panel's buttons (the board offers the same paths). */
const undyingRooms = computed(() => (props.undyingCard && stepKind.value ? undyingPaths(props.st, props.undyingCard, stepKind.value) : []))

/** What can be done in the room picked. */
const undyingHere = computed(() =>
  props.undyingCard && props.undyingRoom && stepKind.value
    ? undyingOptions(props.st, props.undyingCard, stepKind.value).filter((i) => undyingRoomOf(props.st, i) === props.undyingRoom)
    : [],
)

/** Perks that swap two props: picked one prop at a time on the board, never listed as pairs. */
const SWAPS: PerkId[] = ['ace_in_the_hole', 'iron_maiden']

/** An interact-step perk, picked before its targets show on the board. */
/** A pressed perk card's hint (perkHints.ts): swaps and No One Left Behind are two clicks on the map. */
function pickedHint(b: { perk: PerkId; choices: PerkChoice[] }): string {
  const how =
    b.perk === 'iron_maiden'
      ? 'คลิก Locker ว่างบนแผนที่ แล้วคลิก Hook ว่างที่จะสลับด้วย'
      : SWAPS.includes(b.perk)
        ? 'คลิก prop ในห้องคุณ แล้วคลิก prop ในห้องติดกันที่จะสลับด้วย'
        : b.perk === 'no_one_left_behind'
          ? 'คลิกผู้รอดชีวิตบนแผนที่ แล้วเลือกเส้นทางที่จะให้เดิน'
          : b.perk === 'weaving_spiders'
            ? 'คลิก Generator ที่หงายอยู่บนแผนที่ — แล้วผู้รอดชีวิตในห้องคุณร่วมกันลง 6 ▲'
            : undefined
  return perkPickedHint(b.choices, (c) => !here(perkAct(b.perk, c)), how)
}

function pickInteractPerk(perk: PerkId) {
  sfx.click()
  perkPicked.value = perkPicked.value === perk ? null : perk
}

/** Out of the flow altogether. */
function stopSteps() {
  if (stepKind.value === 'haunt') emit('powerOn', false)
  else emit('undyingOn', false)
}


/** Perk buttons in this step (start of turn, interact, a roll). */
// online, a perk button shows only on its owner's device
const buttons = computed(() => perkButtons(props.st).filter((b) => b.owner === 'killer' || controls(props.st, b.owner)))

/** All traps on the board, when the supply is empty and one must be moved. */
const trapsOnBoard = computed(() => Object.keys(props.st.paths).filter((id) => props.st.paths[id].trap))
const mustMoveTrap = computed(() => props.st.killer.trapsInSupply === 0)
const trapTargets = computed(() => [...new Set(kInteractions.value.powers.flatMap((i) => (i.k === 'power' ? [i.path] : [])))])

const CATEGORY_TH: Record<PropCategory, string> = { objective: 'เหลือง (Objective)', survival: 'น้ำเงิน (Survival)', altruism: 'เขียว (Altruism)', boldness: 'แดง (Boldness)' }

/** One face-down tile per colour in the room being entered. */
const revealChoices = computed(() => {
  const s = step.value
  if (s.t !== 'revealProp') return []
  const byCat = new Map<PropCategory, string>()
  for (const p of propsIn(props.st, s.room)) if (!p.revealed && !byCat.has(p.category)) byCat.set(p.category, p.id)
  return [...byCat].map(([category, prop]) => ({ category, prop }))
})

const bonusCards = computed(() => {
  const s = step.value
  if (s.t === 'bonusOffer') return [...new Set(props.st.survivorHands[props.st.survivors[s.s].hand])]
  if (s.t === 'killerBonusOffer') return [...new Set(props.st.killer.hand)] // The Blight holds two of each
  return []
})

// ---------- bonus turn: the card is picked from the hand along the bottom, then confirmed ----------

const bonusPick = ref<MoveCard | null>(null)
watch(
  () => JSON.stringify(step.value),
  () => (bonusPick.value = null),
)
onBeforeUnmount(() => (preview.value = null))

const bonusHand = computed<HandCard[]>(() => bonusCards.value.map((card) => ({ card, picked: bonusPick.value === card, ...(bonusPick.value === card ? { badge: 'Bonus Turn' } : {}) })))

/** Who moves with the bonus card, for the map preview. */
const bonusOwner = computed<number | 'killer'>(() => (step.value.t === 'bonusOffer' ? step.value.s : 'killer'))

function pickBonus(card: MoveCard) {
  sfx.click()
  bonusPick.value = bonusPick.value === card ? null : card
}

function hoverBonus(card: MoveCard | null) {
  const o = bonusOwner.value
  preview.value = card ? choicePreview(props.st, { card }, o === 'killer' ? props.st.killer.room : props.st.survivors[o].room, o) : null
}

// the map: a path out of the room picks the bonus card of its colour, as the hand does
let ownPick = false
watchEffect(() => {
  const s = step.value
  if (s.t === 'bonusOffer' || s.t === 'killerBonusOffer') {
    const o = bonusOwner.value
    pathPick.value = pathPickFor(props.st, o === 'killer' ? props.st.killer.room : props.st.survivors[o].room, bonusCards.value, pickBonus)
    ownPick = true
  } else if (ownPick) {
    pathPick.value = null
    ownPick = false
  }
})
onBeforeUnmount(() => ownPick && (pathPick.value = null))

function confirmBonus() {
  if (!bonusPick.value) return
  preview.value = null
  act({ t: 'bonus', card: bonusPick.value })
}

// Online each helper (a key, Iron Will) decides on their own device; the roller waits for them.
const rollers = computed(() => rerollers(props.st).filter((s) => controls(props.st, s)))
const rollOthers = computed(() => (props.st.step.t === 'roll' ? rollHelpers(props.st).filter((s) => s !== (props.st.step as { ctx: { s: number } }).ctx.s) : []))
const passers = computed(() => (online.value ? rollOthers.value.filter((s) => controls(props.st, s)) : []))
const keyWaiting = computed(() => rollOthers.value.filter((s) => !controls(props.st, s)))
const rollMine = computed(() => step.value.t === 'roll' && controls(props.st, step.value.ctx.s))
</script>

<template>
  <section class="card action">
    <header v-if="actor !== null" class="who">
      <Mini v-if="actor === 'killer'" class="mini aura-killer" :src="asset(killerMini(st))" alt="" />
      <Mini v-else class="mini aura-survivor" :src="asset(survivorMini(st, actor))" alt="" />
      <div>
        <strong>{{ actor === 'killer' ? st.killer.name : st.survivors[actor].name }}</strong>
        <div class="muted small">ผู้เล่น {{ actor === 'killer' ? 1 : playerOf(st, actor) }}</div>
      </div>
    </header>

    <!-- setup -->
    <template v-if="step.t === 'setupReveal'">
      <p>เตรียมเกม: คลิก <b>ไทล์คว่ำ</b> ที่ใดก็ได้บนแผนที่ เพื่อเปิด prop 1 อัน — สีบอกหมวด (หน้า 6)</p>
      <p class="muted small">เปิดครบทุกคนแล้ว ทุกตัวละครจะทอยเต๋าหาห้องเริ่มแล้วลงกระดาน</p>
    </template>

    <template v-else-if="step.t === 'revealProp'">
      <p>เข้าห้อง {{ roomName(st, step.room) }} — เลือกสีของ prop ที่จะเปิด 1 อัน (คลิกไทล์บนแผนที่หรือปุ่ม)</p>
      <div class="buttons">
        <button v-for="c in revealChoices" :key="c.category" class="cat" :class="c.category" @click="act({ t: 'reveal', prop: c.prop })">
          <img :src="asset(`assets/props/back-${c.category}.webp`)" alt="" />{{ CATEGORY_TH[c.category] }}
        </button>
      </div>
    </template>

    <!-- a perk's moment, the start of a turn: decided in the Perk panel (PerkPrompt) — on wide screens
         in this panel's place, on narrow ones a sheet over it — so the two never show twice -->
    <template v-else-if="step.t === 'offer' || step.t === 'turnStart'">
      <p class="muted">⚡ ตัดสินใจเรื่อง Perk ที่แผง Perk</p>
    </template>

    <template v-else-if="step.t === 'sparkChoice' || step.t === 'phantasmChoice' || step.t === 'replaceCard'">
      <p class="muted">ตัดสินใจที่แผงด้านขวา</p>
    </template>

    <!-- The Twins: who takes this turn -->
    <template v-else-if="step.t === 'twinChoice'">
      <p>เทิร์นที่ {{ step.turn + 1 }}: เล่นด้วยใคร? (คลิกที่มินิบนแผนที่ก็ได้)</p>
      <div class="buttons col">
        <button class="primary twin" @click="act({ t: 'twin', victor: false })">
          <Mini class="twin-mini aura-killer" :src="asset(killerMini(st))" alt="" />
          <span>Charlotte — {{ roomName(st, charlotteRoom(st)) }}</span>
        </button>
        <button class="primary twin" @click="act({ t: 'twin', victor: true })">
          <Mini class="twin-mini aura-killer" :src="asset(VICTOR_MINI)" alt="" />
          <span>Victor — {{ roomName(st, victorRoom(st)!) }} (อุ้มไม่ได้: จับแล้ว +1 <BpIcon />)</span>
        </button>
      </div>
    </template>

    <!-- The Knight's Carnifex at the start of cleanup: both picked on the map -->
    <template v-else-if="step.t === 'carnifexProp' || step.t === 'carnifexMove'">
      <p><img class="token-inline" :src="asset(GUARD_IMAGE.carnifex)" alt="" /> <b>เพชฌฆาต</b> — {{ step.t === 'carnifexProp' ? 'เลือก prop สีเขียว / น้ำเงินในห้องของมันที่จะนำออก' : 'เลือกห้องที่เชื่อมกันที่มันจะย้ายไป' }}</p>
      <p class="board-hint">🎯 คลิกบนแผนที่ — {{ step.t === 'carnifexProp' ? 'prop ที่กระพริบ' : 'ห้องที่กระพริบ' }}</p>
    </template>

    <template v-else-if="step.t === 'pickSurvivor'">
      <p>เลื่อยไฟฟ้า — เลือกผู้รอดชีวิตในห้องที่จะบาดเจ็บ</p>
      <p v-if="step.options.some((s) => !here({ t: 'pick', s }))" class="board-hint">🎯 เลือกบนแผนที่ได้เลย — คลิกผู้รอดชีวิตที่กระพริบ</p>
      <div class="buttons">
        <button v-for="s in step.options.filter((s) => here({ t: 'pick', s }))" :key="s" class="primary" @click="act({ t: 'pick', s })"><FaceLabel :st="st" :who="s" :text="st.survivors[s].name" /></button>
      </div>
    </template>

    <!-- movement -->
    <template v-else-if="step.t === 'survivorMove' || step.t === 'killerMove'">
      <div class="flip">
        <img :src="asset(cardImage(step.card))" :alt="cardLabel(step.card)" />
        <p>
          <template v-if="step.t === 'killerMove' && step.rush">ความเสื่อมทรามที่พังทลาย สุ่มได้ <b>{{ cardLabel(step.card) }}</b></template>
          <template v-else>เปิดการ์ด <b>{{ cardLabel(step.card) }}</b></template>
          <br /><span class="muted">เลือกเส้นทางที่ไฮไลต์บนแผนที่</span>
        </p>
      </div>
      <div class="buttons">
        <button v-for="m in moves" :key="m.path" @click="act({ t: 'move', path: m.path })">{{ m.label }}</button>
      </div>
    </template>

    <!-- Reign of Darkness: the path of the card discarded, when it has several -->
    <!-- Inner Focus: one of the two faces rolled, as a start room (picked on the map) -->
    <!-- Empathy: the other survivor agrees, or not -->
    <template v-else-if="step.t === 'empathyAsk'">
      <p>
        <b>Empathy</b> —
        <BpText :text="`${st.survivors[step.from].name} ขอ${step.mode === 'take' ? 'รับ 1 ▲ จากคุณ' : 'ให้ 1 ▲ แก่คุณ'} (${st.survivors[step.s].name} มี ${st.survivors[step.s].bp} ▲ · ${st.survivors[step.from].name} มี ${st.survivors[step.from].bp} ▲)`" />
      </p>
      <div class="buttons">
        <button class="primary" @click="act({ t: 'empathyAnswer', yes: true })"><BpText :text="step.mode === 'take' ? 'ยอมให้ 1 ▲' : 'รับ 1 ▲'" /></button>
        <button @click="act({ t: 'empathyAnswer', yes: false })">ไม่ยอม</button>
      </div>
    </template>

    <template v-else-if="step.t === 'innerFocus'">
      <p><b>สมาธิห้วงลึก</b> — {{ st.survivors[step.s].name }} เลือกผลเต๋า 1 ลูก แล้วไปห้องเริ่มต้นของเลขนั้น จากนั้น Interact ตามปกติ</p>
      <ul class="focus-faces">
        <li v-for="f in step.faces" :key="f">
          <b>{{ f === 0 ? '💀' : f }}</b> → {{ roomName(st, boardOf(st).rooms.find((r) => r.startFace === f)!.id) }}{{ boardOf(st).rooms.find((r) => r.startFace === f)!.id === st.survivors[step.s].room ? ' (ห้องนี้ — อยู่ที่เดิม)' : '' }}
        </li>
      </ul>
      <p class="board-hint">🎯 คลิกห้องที่กระพริบบนแผนที่</p>
    </template>

    <template v-else-if="step.t === 'reignPath'">
      <p><b>รัชสมัยแห่งความมืดมิด</b> — เลือกเส้นทาง {{ CARD_NAMES[step.card] }} ที่ {{ st.survivors[step.s].name }} ต้องเดิน</p>
      <p class="board-hint">🎯 คลิกเส้นทางที่กระพริบบนแผนที่</p>
    </template>

    <template v-else-if="step.t === 'anyMove' || step.t === 'killerAnyMove'">
      <p v-if="step.t === 'killerAnyMove' && step.why === 'darkness'">
        <b>เผยความมืดมิด</b> — Locker ถูกคว่ำแล้ว {{ st.killer.name }} เดินต่อตามเส้นทางใดก็ได้ 1 ครั้งก่อน Interact (หรืออยู่ห้องเดิม)
      </p>
      <p v-else-if="step.t === 'killerAnyMove'">
        <img class="token-inline" :src="asset(ANTIDOTE_IMAGE)" alt="" /> <b>ยาแก้พิษส่งท้าย</b> — {{ st.killer.name }} เดินต่อตามเส้นทางใดก็ได้ 1 ครั้งก่อน Interact หรือจะอยู่ห้องเดิมก็ได้
      </p>
      <p v-else-if="step.why === 'antidote'">
        <img class="token-inline" :src="asset(ANTIDOTE_IMAGE)" alt="" /> <b>ยาแก้พิษส่งท้าย</b> — <b>{{ st.survivors[step.s].name }}</b> เดินต่อตามเส้นทางใดก็ได้ 1 ครั้งก่อน Interact หรือจะอยู่ห้องเดิมก็ได้
      </p>
      <p v-else-if="step.why === 'deadHard'"><b>ตายยาก!</b> <b>{{ st.survivors[step.s].name }}</b> หลุดจากการแบก — ต้องเดินไปตามเส้นทางใดก็ได้ 1 ครั้ง</p>
      <p v-else-if="step.why === 'collective'">
        <b>อำพรางหมู่</b> — <b>{{ st.survivors[step.s].name }}</b> เดินตามเส้นทางใดก็ได้ 1 ครั้ง หรือจะอยู่ห้องเดิมก็ได้
        <span class="muted small">(Renato เดินก่อน แล้วคนที่ Interact กับเขาเดินต่อ)</span>
      </p>
      <p v-else-if="step.why === 'spineChill'"><b>เสียวสันหลัง!</b> <b>{{ st.survivors[step.s].name }}</b> รู้ตัวทัน — ต้องเดินไปตามเส้นทางใดก็ได้ 1 ครั้งก่อนฆาตกร Interact</p>
      <p v-else>ช่วยลงจาก Hook แล้ว: <b>{{ st.survivors[step.s].name }}</b> เดินตามเส้นทางใดก็ได้ 1 ครั้ง (หน้า 13) หรือจะอยู่ห้องเดิมก็ได้</p>
      <p class="muted small">{{ step.t === 'anyMove' && mustMove(step.why) ? 'คลิกเส้นทางบนแผนที่' : 'คลิกเส้นทางบนแผนที่ — คลิกห้องที่อยู่เพื่ออยู่ห้องเดิม' }}</p>
      <div class="buttons">
        <button v-for="m in moves.filter((m) => here({ t: 'move', path: m.path }))" :key="m.path" @click="act({ t: 'move', path: m.path })">{{ m.label }}</button>
      </div>
      <button v-if="!(step.t === 'anyMove' && mustMove(step.why))" class="primary" @click="act({ t: 'stop' })">อยู่ห้องเดิม</button>
    </template>

    <!-- survivor interact -->
    <template v-else-if="step.t === 'survivorInteract'">
      <p v-if="!step.canInteract" class="warn">เคลื่อนที่ไม่สำเร็จ — เทิร์นนี้ Interact ไม่ได้</p>
      <p v-else-if="sInteractions.length || hasDiversion">
        Interact 1 อย่าง ที่ {{ roomName(st, st.survivors[step.s].room) }}<br /><span class="muted small">คลิกของหรือตัวละครที่เรืองแสงบนแผนที่ได้เลย</span>
      </p>
      <p v-else class="muted">ไม่มีอะไรให้ Interact ในห้องนี้</p>
      <div class="buttons col">
        <!-- a perk picked: its targets only, the ordinary interactions wait -->
        <button v-for="(i, n) in perkPicked ? [] : panelInteractions" :key="n" @click="act({ t: 'interact', i })"><FaceLabel :st="st" :who="interactionWho(st, i)" :text="survivorInteractionLabel(st, step.s, i)" /></button>
        <p v-if="hasPallet && !perkPicked" class="board-hint">🎯 ทิ้ง Pallet: คลิก Pallet บนแผนที่ แล้วเลือกเส้นทาง</p>
        <!-- Diversion is played on the board: the killer, then the path -->
        <p v-if="hasDiversion" class="board-hint">🎯 หันเหความสนใจ: คลิกตัว {{ st.killer.name }} บนแผนที่ แล้วเลือกเส้นทางที่จะส่งไป</p>
        <details v-for="c in calmSpirit" :key="c.prop" class="calm">
          <summary>วิญญาณสงบ: ย้าย Crow ไปห้องอื่น (ฟรี)</summary>
          <div class="buttons">
            <button v-for="o in c.options" :key="o.room" @click="act({ t: 'interact', i: o })">{{ roomName(st, o.room) }}</button>
          </div>
        </details>
      </div>
      <!-- a perk is picked first (its targets then show on the board), again to put it back -->
      <p v-if="buttons.length && !perkPicked" class="perk-lead">{{ PERK_LEAD }}</p>
      <div v-for="b in buttons" :key="b.perk">
        <PerkCard
          :perk="b.perk"
          :state="perkPicked === b.perk ? 'picked' : perkPicked ? 'dim' : 'ready'"
          :hint="perkPicked === b.perk ? pickedHint(b) : undefined"
          @pick="pickInteractPerk(b.perk)"
        >
        <!-- a swap (Ace in the Hole, Iron Maiden) is two props, one click each on the board; No One
             Left Behind is whoever moves, then the path (as Breakout): the card's hint says how -->
        <template v-if="perkPicked === b.perk">
          <button v-for="(c, i) in SWAPS.includes(b.perk) || b.perk === 'no_one_left_behind' ? [] : b.choices.filter((c) => here(perkAct(b.perk, c)) && !boardPallet(b.perk, c))" :key="i" @click="act({ t: 'perk', perk: b.perk, use: true, choice: c })"><FaceLabel :st="st" :who="c.target" :text="perkChoiceLabel(st, b.perk, b.owner, b.w, c)" /></button>
        </template>
        </PerkCard>
      </div>
      <button class="end" @click="act({ t: 'endTurn' })">จบเทิร์น</button>
    </template>

    <!-- bonus turns -->
    <template v-else-if="step.t === 'bonusOffer' || step.t === 'killerBonusOffer'">
      <p v-if="step.t === 'bonusOffer' && step.why === 'power_of_two'">
        <b>สองคนเพื่อนตาย</b> — {{ st.killer.name }} ได้ +1 ▲ แล้ว ตอนนี้ <b>{{ st.survivors[step.s].name }}</b> เล่น Bonus Turn: ทิ้งการ์ด 1 ใบจากมือ แล้วเคลื่อนที่ + Interact อีกครั้ง
      </p>
      <p v-else-if="step.t === 'bonusOffer'">Bonus Turn: ทิ้งการ์ด 1 ใบจากมือ แล้วเคลื่อนที่ + Interact อีกครั้ง (หน้า 9)</p>
      <p v-else-if="step.free"><b>สลิปสตรีม</b> — การ์ดทั้งหมดกลับเข้ามือแล้ว เลือกการ์ด 1 ใบเล่น Bonus Turn (ไม่เสีย ▲)</p>
      <p v-else>จ่าย {{ bonusCost(st) }} <BpIcon /> (มี {{ st.killer.bp }}) เพื่อเล่นเทิร์นที่ 3? (หน้า 10)</p>
      <p class="muted small">👇 ชี้ไพ่บนมือด้านล่างเพื่อดูเส้นทาง · คลิกเพื่อเลือก แล้วกดยืนยัน</p>
      <div class="buttons col">
        <button class="primary" :disabled="!bonusPick" @click="confirmBonus">{{ bonusPick ? `ยืนยัน: Bonus Turn ด้วย ${CARD_NAMES[bonusPick]}` : 'เลือกการ์ดจากมือก่อน' }}</button>
        <button v-if="step.t !== 'killerBonusOffer' || !step.free" @click="act({ t: 'declineBonus' })">ไม่เล่น</button>
      </div>
      <CardHand
        :cards="bonusHand"
        :label="`Bonus Turn — มือของ ${step.t === 'bonusOffer' ? st.survivors[step.s].name : st.killer.name}`"
        @pick="pickBonus"
        @hover="hoverBonus"
      />
    </template>

    <!-- Plunderer's Instinct: three items drawn, one kept (the other two are discarded) -->
    <template v-else-if="step.t === 'pickItem'">
      <p>สัญชาตญาณขโมย — เลือกเก็บ 1 ใบ อีก {{ step.drawn.length - 1 }} ใบทิ้ง</p>
      <div class="buttons">
        <button v-for="(item, i) in step.drawn" :key="i" class="itembtn" @click="act({ t: 'pickItem', item: i })">
          <img :src="asset(itemImage(item))" alt="" />{{ ITEM_NAMES[item] }}
        </button>
      </div>
    </template>

    <template v-else-if="step.t === 'keepItem'">
      <p>ถือ item ได้ใบเดียว (หน้า 12) — เก็บใบไหน?</p>
      <div class="buttons">
        <button class="itembtn" @click="act({ t: 'keepItem', keep: 'old' })">
          <img :src="asset(itemImage(st.survivors[step.s].item!))" alt="" />{{ ITEM_NAMES[st.survivors[step.s].item!] }} (เดิม)
        </button>
        <button class="itembtn" @click="act({ t: 'keepItem', keep: 'new' })"><img :src="asset(itemImage(step.drawn))" alt="" />{{ ITEM_NAMES[step.drawn] }} (ใหม่)</button>
      </div>
    </template>

    <!-- dice with a possible key re-roll -->
    <template v-else-if="step.t === 'roll'">
      <p v-if="step.keep">พันธะ: ทอย 2 ลูก — คลิกลูกที่จะเก็บ 1 ลูก</p>
      <p v-else>ผลทอย — ใช้กุญแจทอยใหม่ หรือ perk ได้</p>
      <RollDice :st="st" :key-holders="rollers" :can-keep="rollMine && !keyWaiting.length" @act="act" />
      <div class="buttons col">
        <!-- Iron Will, Autodidact: one button per choice (Autodidact names the die) -->
        <template v-for="b in buttons" :key="`${b.owner}-${b.perk}`">
          <button v-for="(c, n) in b.choices" :key="n" class="primary" @click="act({ t: 'perk', perk: b.perk, use: true, choice: c })">
            <FaceLabel :st="st" :who="b.owner" :text="`${st.survivors[b.owner as number].name}: ${PERKS[b.perk].name} — ${perkChoiceLabel(st, b.perk, b.owner, b.w, c)} (${PERKS[b.perk].cost} ▲)`" />
          </button>
        </template>
        <!-- someone else's roll: each helper on this device passes on it here -->
        <button v-for="s in passers" :key="`p${s}`" @click="act({ t: 'passRoll', s })">
          <FaceLabel :st="st" :who="s" :text="`${st.survivors[s].name} ไม่ช่วย — ไม่ใช้กุญแจ / Perk`" />
        </button>
        <template v-if="rollMine">
          <p v-if="keyWaiting.length" class="small">⏳ รอ {{ keyWaiting.map((s) => st.survivors[s].name).join(', ') }} ตัดสินใจว่าจะช่วย (กุญแจ / Perk) หรือไม่</p>
          <button v-if="!step.keep" class="primary" :disabled="keyWaiting.length > 0" @click="act({ t: 'acceptRoll' })">ใช้ผลนี้</button>
        </template>
        <p v-else class="small muted">รอ {{ st.survivors[step.ctx.s].name }} รับผลทอย</p>
      </div>
    </template>

    <!-- killer interact -->
    <template v-else-if="step.t === 'killerInteract'">
      <p v-if="!step.canInteract" class="warn">เทิร์นนี้ Interact ไม่ได้</p>

      <!-- Undying / Yamaoka's Haunting, a step at a time: the card (hand or path), the room, the target -->
      <template v-else-if="stepKind">
        <p v-if="stepKind === 'undying'"><b>ไม่รู้จักตาย</b> (<BpText :text="PERKS.undying.cost" /> <BpIcon />) — ทิ้งการ์ด 1 ใบ แล้ว Interact กับ prop ในห้องที่เชื่อมด้วยเส้นทางสีเดียวกับการ์ด</p>
        <p v-else><b>ใช้พลัง: ความหลอกหลอนของยามาโอกะ</b> — ทิ้งการ์ด 1 ใบ (ไม่ใช่ Wait) แล้วโจมตีผู้รอดชีวิตที่ไม่บาดเจ็บ หรือ Interact กับ prop ในห้องที่เชื่อมด้วยเส้นทางสีนั้น</p>

        <template v-if="!undyingCard">
          <p class="muted small">👇 1. เลือกการ์ดที่จะทิ้ง — จากไพ่บนมือด้านล่าง หรือคลิกเส้นทางบนแผนที่</p>
          <CardHand :cards="undyingHand" :label="`${stepName} — มือของ ${st.killer.name}`" :prompt="`${stepName} — เลือกการ์ดที่จะทิ้ง`" @pick="pickUndyingCard" />
        </template>

        <template v-else-if="!undyingRoom">
          <p class="small">ทิ้ง <b>{{ CARD_NAMES[undyingCard] }}</b> — 2. ไปห้องไหน?</p>
          <p class="board-hint">🎯 คลิกเส้นทางสีนั้นบนแผนที่ (ทางแยกจะให้เลือกห้องต่อ)</p>
          <div class="buttons col">
            <button v-for="r in undyingRooms" :key="r.to" @click="emit('undyingRoom', r.to), sfx.click()">{{ roomName(st, r.to) }}</button>
            <button @click="emit('undyingCard', null)">เปลี่ยนการ์ด</button>
          </div>
        </template>

        <template v-else>
          <p class="small">ทิ้ง <b>{{ CARD_NAMES[undyingCard] }}</b> — 3. ทำอะไรที่ <b>{{ roomName(st, undyingRoom) }}</b>?</p>
          <p v-if="undyingHere.some((i) => !here(powerAct(i)))" class="board-hint">🎯 คลิกเป้าหมายที่กระพริบในห้องนั้นบนแผนที่</p>
          <div class="buttons col">
            <template v-for="(i, n) in undyingHere" :key="n">
              <button v-if="here(powerAct(i))" @click="act({ t: 'interact', i })"><BpText :text="killerInteractionLabel(st, i.i)" /></button>
              <span v-else class="undying-target">🎯 <BpText :text="killerInteractionLabel(st, i.i)" /></span>
            </template>
            <button v-if="undyingRooms.length > 1" @click="emit('undyingRoom', null)">เปลี่ยนห้อง</button>
            <button @click="emit('undyingCard', null)">เปลี่ยนการ์ด / เส้นทาง</button>
          </div>
        </template>

        <button @click="stopSteps">{{ stepKind === 'haunt' ? 'ยกเลิก ไม่ใช้พลัง' : 'ยกเลิก ไม่ใช้ ไม่รู้จักตาย' }}</button>
      </template>

      <!-- choosing where the power goes, after "use power" -->
      <template v-else-if="powerMode">
        <ul v-if="powerFacts.length" class="facts">
          <li v-for="(f, n) in powerFacts" :key="n">
            <span class="icon">{{ f.icon }}</span><FaceLabel :st="st" :who="f.who" :text="f.text" />
          </li>
        </ul>
        <p v-if="step.powerOnly"><b>สิ่งจำเป็นบนผืนดิน</b> — ใช้พลังอีกครั้ง</p>
        <p v-if="kInteractions.powers.some((i) => !here(powerAct(i)))" class="board-hint">🎯 เลือกบนแผนที่ได้เลย — คลิกวงที่กระพริบ</p>
        <template v-if="st.killer.characterId === 'trapper'">
          <p>
            <b>ใช้พลัง: กับดักหมี</b> — เลือกเส้นทางที่เชื่อมกับห้อง (คลิกบนแผนที่หรือปุ่ม) เหลือในมือ {{ st.killer.trapsInSupply }} อัน{{
              mustMoveTrap ? ' — หมดแล้ว ต้องย้ายอันที่วางไว้' : ''
            }}
          </p>
          <div v-if="!trapPath" class="buttons">
            <template v-if="!mustMoveTrap">
              <button v-for="(i, n) in kInteractions.traps.filter((i) => here(powerAct(i)))" :key="n" @mouseenter="hoverPower(i)" @mouseleave="hoverPower(null)" @click="act({ t: 'interact', i })"><FaceLabel :st="st" :who="interactionWho(st, i)" :text="killerInteractionLabel(st, i)" /></button>
            </template>
            <template v-else>
              <button v-for="p in trapTargets" :key="p" @click="emit('trapPath', p)">{{ iconLabel(st, p, st.killer.room) }}</button>
            </template>
          </div>
          <div v-else class="buttons">
            <span class="small">ย้าย กับดักหมี อันไหนมา? (คลิกบนแผนที่หรือปุ่ม)</span>
            <button v-for="r in trapsOnBoard" :key="r" @click="act({ t: 'interact', i: { k: 'power', path: trapPath, remove: r } }), emit('trapPath', null)">
              {{ pathName(st, r) }}
            </button>
          </div>
        </template>
        <template v-else-if="st.killer.characterId === 'hillbilly'">
          <p><b>ใช้พลัง: เลื่อยไฟฟ้า</b> — ทิ้งการ์ด 1 ใบจากมือ แล้วเดินตามสีนั้น (ห้ามผ่าน Pallet / กำแพง / ของบนทาง) ผู้รอดชีวิตในห้องที่เข้าไปบาดเจ็บ</p>
          <div v-if="!powerCard" class="buttons">
            <button v-for="c in powerCards" :key="c" class="cardbtn" :title="cardLabel(c)" @click="emit('powerCard', c)">
              <img :src="asset(cardImage(c))" :alt="cardLabel(c)" />
            </button>
          </div>
          <div v-else class="buttons">
            <span class="small">ทิ้ง {{ CARD_NAMES[powerCard] }} — เลือกเส้นทาง (แผนที่หรือปุ่ม)</span>
            <template v-for="(i, n) in kInteractions.powers" :key="n">
              <button v-if="i.k === 'chainsaw' && i.card === powerCard && here(powerAct(i))" @mouseenter="hoverPower(i)" @mouseleave="hoverPower(null)" @click="act({ t: 'interact', i })"><FaceLabel :st="st" :who="interactionWho(st, i)" :text="killerInteractionLabel(st, i)" /></button>
            </template>
            <button @click="emit('powerCard', null)">เปลี่ยนการ์ด</button>
          </div>
        </template>
        <template v-else-if="st.killer.characterId === 'deathslinger'">
          <p>
            <b>ใช้พลัง: พระผู้ไถ่</b> — ทิ้งการ์ด 1 ใบแบบคว่ำ แล้วยิงผู้รอดชีวิตที่บาดเจ็บในห้องที่เชื่อมกัน (ทางนั้นไม่มี Pallet / กำแพง และไม่ได้เพิ่งบาดเจ็บในรอบนี้) ถ้าเขาทายการ์ดผิด จะถูกดึงเข้ามาและถูกอุ้ม
          </p>
          <div v-if="!powerCard" class="buttons">
            <span class="small">1. เลือกการ์ดที่จะทิ้งแบบคว่ำ (อย่าให้ผู้รอดชีวิตเห็น)</span>
            <button v-for="c in powerCards" :key="c" class="cardbtn" :title="cardLabel(c)" @click="emit('powerCard', c)">
              <img :src="asset(cardImage(c))" :alt="cardLabel(c)" />
            </button>
          </div>
          <div v-else class="buttons">
            <span class="small">2. ทิ้ง {{ CARD_NAMES[powerCard] }} — เลือกผู้รอดชีวิตที่จะยิง (แผนที่หรือปุ่ม)</span>
            <template v-for="(i, n) in kInteractions.powers" :key="n">
              <button v-if="i.k === 'redeemer' && i.card === powerCard && here(powerAct(i))" @mouseenter="hoverPower(i)" @mouseleave="hoverPower(null)" @click="act({ t: 'interact', i })"><FaceLabel :st="st" :who="interactionWho(st, i)" :text="`ยิง ${st.survivors[i.target].name}`" /></button>
            </template>
            <button @click="emit('powerCard', null)">เปลี่ยนการ์ด</button>
          </div>
        </template>
        <template v-else>
          <p>
            <b>ใช้พลัง: {{ powerName(st) }}</b> —
            <BpText :text="POWER_HINT[st.killer.characterId] ?? ''" />
          </p>
          <!-- The Knight: what each Guard does, and where it stands now -->
          <ul v-if="st.killer.characterId === 'knight'" class="afterpiece">
            <li><img :src="asset(GUARD_IMAGE.carnifex)" alt="" /><span><b>เพชฌฆาต</b> — เริ่มเก็บกวาด: นำ prop เขียว/น้ำเงินในห้องออก แล้วย้ายไปห้องข้าง ๆ · {{ guardWhere('carnifex') }}</span></li>
            <li><img :src="asset(GUARD_IMAGE.assassin)" alt="" /><span><b>มือลอบสังหาร</b> — ใครเดินเข้าห้องทอย Danger Die พลาด = บาดเจ็บ · {{ guardWhere('assassin') }}</span></li>
            <li><img :src="asset(GUARD_IMAGE.jailer)" alt="" /><span><b>ผู้คุม</b> — Skill Check ในห้อง (ไม่รวมคนใน Locker) ใช้ Danger Die พลาด = บาดเจ็บ (ผู้คุม กลับมาบนบอร์ด วางใหม่ได้) · {{ guardWhere('jailer') }}</span></li>
          </ul>
          <!-- The Unknown: where each one stands, and which is playing now -->
          <ul v-if="st.killer.unknowns" class="afterpiece">
            <li v-for="(room, u) in unknownRooms(st)" :key="u">
              <img :src="asset(unknownMini(u))" alt="" />
              <span><b>The Unknown {{ u + 1 }}</b> — {{ room ? roomName(st, room) : 'ยังไม่อยู่บนกระดาน' }}{{ u === (st.killer.unknownAt ?? 0) && room ? ' · ตัวที่เล่นอยู่' : '' }}</span>
            </li>
          </ul>
          <!-- The Skull Merchant: the Drones on his board -->
          <ul v-if="st.killer.characterId === 'skullmerchant'" class="afterpiece">
            <li><img :src="asset(PROP_IMAGE.drone)" alt="" /><span><b>Drone</b> — Skill Check ในห้องที่มี Drone หงายหน้า: สำเร็จ คุณ +1 ▲, ล้มเหลว = บาดเจ็บ แล้ว Drone คว่ำลง · บนบอร์ดคุณ {{ merchantDrones(st).length }} ตัว</span></li>
          </ul>
          <!-- The Clown: what each token does, and where it stands now -->
          <ul v-if="st.killer.characterId === 'clown'" class="afterpiece">
            <li><img :src="asset(TONIC_IMAGE)" alt="" /><span><b>Tonic</b> — ผู้รอดชีวิตในห้องนั้นวางการ์ดหงาย · {{ st.afterpiece?.tonic ? `อยู่ที่ ${roomName(st, st.afterpiece.tonic)}` : 'ยังไม่วาง' }}</span></li>
            <li><img :src="asset(ANTIDOTE_IMAGE)" alt="" /><span><b>Antidote</b> — ใครเข้าห้องนั้นเดินต่อได้อีก 1 ทาง · {{ st.afterpiece?.antidote ? `อยู่ที่ ${roomName(st, st.afterpiece.antidote)}` : 'ยังไม่วาง' }}</span></li>
          </ul>
          <div class="buttons">
            <button v-for="(i, n) in kInteractions.powers.filter((i) => here(powerAct(i)))" :key="n" @mouseenter="hoverPower(i)" @mouseleave="hoverPower(null)" @click="act({ t: 'interact', i })"><FaceLabel :st="st" :who="interactionWho(st, i)" :text="killerInteractionLabel(st, i)" /></button>
          </div>
        </template>
        <button v-if="!step.powerOnly" @click="emit('trapPath', null), emit('powerCard', null), emit('powerOn', false)">ยกเลิก ไม่ใช้พลัง</button>
        <button v-else @click="act({ t: 'endTurn' })">ไม่ใช้พลัง</button>
      </template>

      <template v-else>
        <p>
          Interact 1 อย่าง หรือใช้พลังแทน (1 ครั้ง/รอบ) ที่ {{ roomName(st, st.killer.room) }}<br /><span class="muted small"
            >คลิกของหรือผู้รอดชีวิตที่เรืองแสงบนแผนที่ — คลิกตัว {{ st.killer.name }} เพื่อใช้พลัง{{ kInteractions.undying.length ? ' หรือ ไม่รู้จักตาย' : '' }}</span
          >
        </p>
        <div class="buttons col">
          <button v-for="(i, n) in perkPicked ? [] : kInteractions.plain.filter((i) => here({ t: 'interact', i }))" :key="n" @click="act({ t: 'interact', i })"><FaceLabel :st="st" :who="interactionWho(st, i)" :text="killerInteractionLabel(st, i)" /></button>
          <!-- Undying: its card, as the other perks of his turn show theirs -->
          <PerkCard
            v-if="kInteractions.undying.length"
            class="undying"
            perk="undying"
            state="ready"
            text="ทิ้งการ์ด 1 ใบ แล้ว Interact กับ prop ในห้องที่เชื่อมด้วยเส้นทางสีเดียวกับการ์ด"
            @pick="emit('undyingOn', true), sfx.click()"
          />
          <button v-if="kInteractions.powers.length" class="power" @click="emit('powerOn', true), sfx.click()">⚡ ใช้พลัง: {{ powerName(st) }}</button>
          <span v-else-if="st.killer.powerUsed" class="muted small">ใช้พลังไปแล้วรอบนี้</span>
          <span v-else class="muted small">ใช้พลังไม่ได้จากห้องนี้</span>
        </div>
        <!-- a perk is picked first (its targets then show on the board), again to put it back -->
        <p v-if="buttons.length && !perkPicked" class="perk-lead">{{ PERK_LEAD }}</p>
        <div v-for="b in buttons" :key="b.perk">
          <PerkCard
            :perk="b.perk"
            :state="perkPicked === b.perk ? 'picked' : perkPicked ? 'dim' : 'ready'"
          :hint="perkPicked === b.perk ? pickedHint(b) : undefined"
            @pick="pickInteractPerk(b.perk)"
          >
          <template v-if="perkPicked === b.perk">
            <button v-for="(c, i) in SWAPS.includes(b.perk) ? [] : b.choices.filter((c) => here(perkAct(b.perk, c)) && !boardPallet(b.perk, c))" :key="i" @click="act({ t: 'perk', perk: b.perk, use: true, choice: c })"><FaceLabel :st="st" :who="c.target" :text="perkChoiceLabel(st, b.perk, b.owner, b.w, c)" /></button>
          </template>
          </PerkCard>
        </div>
      </template>
      <button v-if="!powerMode" class="end" @click="act({ t: 'endTurn' })">จบเทิร์น</button>
    </template>

    <!-- carrying -->
    <template v-else-if="step.t === 'carryDice'">
      <template v-if="hookHere(st)">
        <p>มี Hook ว่างในห้องนี้ — แขวน {{ st.survivors[step.s].name }} ที่นี่เลย หรือแบกไปห้องอื่น</p>
        <button class="primary" @click="act({ t: 'hang' })">แขวนที่ Hook ในห้องนี้ (คลิก Hook บนแผนที่ก็ได้)</button>
      </template>
      <p>
        {{ hookHere(st) ? 'แบกไปห้องอื่น:' : 'ไม่มี Hook ว่างในห้องนี้ —' }} เลือกจำนวนลูกเต๋าที่ {{ st.survivors[step.s].name }} ต้องทอย (1–4) ถ้ามีลูกไหนได้ 5
        ผู้รอดชีวิตหลุด ไม่งั้นแบกเดินได้ไม่เกินจำนวนลูก (หน้า 15)
      </p>
      <div class="buttons">
        <button v-for="n in [1, 2, 3, 4]" :key="n" @click="act({ t: 'carryDice', n })">{{ n }} ลูก</button>
      </div>
    </template>

    <template v-else-if="step.t === 'carryMove'">
      <p>
        แบก {{ st.survivors[step.s].name }} — เดินได้อีก {{ step.steps }} ช่อง (ห้ามผ่าน Pallet / กำแพง) ถ้าเดินครบแล้วจบที่ห้องมี Hook ว่างจะแขวนทันที
      </p>
      <button v-if="hookHere(st)" class="primary" @click="act({ t: 'hang' })">แขวนที่ Hook ในห้องนี้ (คลิก Hook บนแผนที่ก็ได้)</button>
      <div class="buttons">
        <button v-for="m in moves" :key="m.path" @click="act({ t: 'move', path: m.path })">{{ m.label }}</button>
      </div>
      <button @click="act({ t: 'stop' })">หยุด (ผู้รอดชีวิตหลุด)</button>
    </template>

    <!-- reactions -->
    <template v-else-if="step.t === 'reaction'">
      <p v-if="step.item === 'firecracker' && step.carry">
        {{ st.killer.name }} กำลังแบก <b>{{ st.survivors[step.carry.s].name }}</b> เข้าห้องของคุณ — ใช้ <b>Firecracker</b> กันไว้ไหม? (เขาเสีย 1 ก้าว เหลือ {{ step.carry.steps - 1 }} ก้าว{{ step.carry.steps - 1 > 0 ? '' : ' — ถ้าไม่มี Hook ตรงนั้น เพื่อนหลุด' }})
      </p>
      <p v-else-if="step.item === 'firecracker'">
        {{ st.killer.name }} กำลังจะเข้าห้องของคุณ — ใช้ <b>Firecracker</b> กันไว้ไหม?
      </p>
      <p v-else-if="step.item === 'emp'">
        {{ st.killer.name }} กำลังจะ Interact กับ <b>{{ st.survivors[step.holders[0]].name }}</b> — ในห้องมี <b>EMP</b> หงายอยู่: ทิ้ง EMP เพื่อให้ {{ st.killer.name }} Interact ไม่ได้เทิร์นนี้ไหม?
      </p>
      <p v-else>{{ st.killer.name }} กำลังจะ Interact ในห้องของคุณ — ใช้ <b>Flashlight</b> กันไว้ไหม?</p>
      <!-- an item kept by Built to Last on an earlier turn: the card forbids only that turn -->
      <p v-for="s in step.holders.filter(keptBefore)" :key="`kept-${s}`" class="board-hint">
        ทนไม้ทนมือ: {{ st.survivors[s].name }} เก็บ {{ ITEM_NAMES[st.survivors[s].item!] ?? st.survivors[s].item }} ไว้ในเทิร์นก่อน — ห้ามใช้ซ้ำแค่ในเทิร์นนั้น เทิร์นนี้ใช้ได้อีก
      </p>
      <div class="buttons">
        <button v-for="s in step.holders" :key="s" class="primary" @click="act({ t: 'react', s })"><FaceLabel :st="st" :who="s" :text="step.item === 'emp' ? `${st.survivors[s].name} ทิ้ง EMP` : `${st.survivors[s].name} ใช้`" /></button>
        <button @click="act({ t: 'react', s: null })">{{ step.item === 'emp' ? 'เก็บ EMP ไว้' : 'ไม่ใช้' }}</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.action {
  display: grid;
  gap: 0.7rem;
}
.who {
  display: flex;
  gap: 0.6rem;
  align-items: center;
}
.mini {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  object-fit: contain;
}
.small {
  font-size: 0.85rem;
}
p {
  margin: 0;
}
.warn {
  color: var(--warn);
}
.twin {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  text-align: left;
}
.twin-mini {
  flex: none;
  width: 40px;
  height: 40px;
}
.undying {
  border-color: #8a5cff;
  color: #e0d0ff;
}
.undying-target {
  font-size: 0.88rem;
}
.focus-faces {
  margin: 0;
  padding-left: 1.1rem;
}
.focus-faces b {
  font-family: var(--font-display);
  font-size: 1.1rem;
}
.board-hint {
  margin: 0;
  padding: 0.4rem 0.55rem;
  border: 1px dashed #ff8a3d;
  border-radius: 6px;
  background: rgb(255 138 61 / 0.1);
  font-size: 0.86rem;
  font-weight: 600;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
}
.buttons.col {
  flex-direction: column;
  align-items: stretch;
}
.buttons.col button {
  text-align: left;
}
.end {
  justify-self: start;
}
.flip {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}
.flip img {
  width: 64px;
  border-radius: 4px;
}
.cardbtn {
  padding: 2px;
  width: 64px;
}
.cardbtn img,
.itembtn img {
  display: block;
  width: 100%;
  border-radius: 3px;
}
.cat {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.cat img {
  width: 28px;
  height: 28px;
}
.power {
  border-color: var(--blood);
  color: #ffb3ad;
}
.eyebrow {
  margin: 0;
  color: var(--muted);
  font-size: 0.8rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.cost {
  margin-left: 0.4rem;
  padding: 0 0.35rem;
  border-radius: 3px;
  background: var(--blood-dim);
  color: #ffd1cc;
  font-size: 0.78rem;
  font-weight: 700;
}
.facts {
  list-style: none;
  margin: 0;
  padding: 0.5rem 0.6rem;
  display: grid;
  gap: 0.35rem;
  border-radius: 8px;
  background: rgb(255 50 50 / 0.07);
  border: 1px solid rgb(255 50 50 / 0.3);
  font-size: 0.88rem;
}
.facts li {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}
.facts .icon {
  width: 1.2rem;
  text-align: center;
  flex: none;
}
.facts :deep(.chip) {
  width: 22px;
  height: 22px;
}
/* the perk as its card: picture on the left, name, cost, text and what a click does */
.afterpiece {
  list-style: none;
  margin: 0.2rem 0 0.5rem;
  padding: 0;
  display: grid;
  gap: 0.35rem;
  font-size: 0.85rem;
}
.afterpiece li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.afterpiece img,
.token-inline {
  width: 30px;
  height: 30px;
  border-radius: 5px;
  vertical-align: middle;
}
/* the perk picked: its targets are on the board */
/* a perk that can be used now: its card glows and pulses, and a line above says so — in the same
   dark button chrome as the rest it was easy to miss */
.perk-lead {
  margin: 0.2rem 0 0;
  font-size: 0.82rem;
  font-weight: 700;
  color: #ffe9b0;
}
.calm summary {
  cursor: pointer;
  padding: 0.45rem 0.85rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
}
.calm .buttons {
  margin-top: 0.35rem;
}
.ghost {
  background: none;
  border-color: transparent;
}
.card-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.cardbtn.cap {
  display: grid;
  gap: 0.15rem;
  justify-items: center;
  font-size: 0.7rem;
}
.itembtn {
  display: grid;
  gap: 0.3rem;
  width: 120px;
  justify-items: center;
}
</style>
