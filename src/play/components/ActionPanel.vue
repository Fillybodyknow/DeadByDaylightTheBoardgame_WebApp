<script setup lang="ts">
// What the current player can do now. Every button dispatches one engine action; moves can
// also be made by clicking the highlighted paths on the board.
import { isBot } from '../bots'
import { playerOfSurvivor } from '../engine/seats'
import { computed, onBeforeUnmount, ref, watch, watchEffect } from 'vue'
import { offeringName } from '../engine/offerings'
import { asset } from '../../i18n'
import { sfx } from '../../sound'
import { fxSound } from '../fx/audio'
import { boardOf,
  CARD_NAMES,
  crowsCards,
  dogPaths,
  isPathCard,
  ITEM_NAMES,
  WARD_COST,
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
  artistCrows,
  DIRE_CROWS,
  unknownRooms,
  mustMove,
  perkButtons,
  propsIn,
  rerollers,
  rollHelpers,
  roomName,
  survivorInteractions,
  survivorMoves,
  usableHook,
} from '../engine/engine'
import { PERKS, type PerkId } from '../engine/perks'
import type { Action, GameState, KillerInteraction, MoveCard, PathKind, PerkChoice, PropCategory, SurvivorInteraction } from '../engine/types'
import { onTargetPerk, STEP_NAME, type BoardAction, actionKey, aimedOnMap, gatePerks, interactGate, perkPicked, plainInteract, REPLACES_INTERACT, undyingCards, undyingOptions, undyingPaths, undyingRoomOf, type StepKind } from '../boardActions'
import { controls, dispatch, online } from '../game'
import { pathPick, pathPickFor } from '../pathPick'
import {
  ANTIDOTE_IMAGE,
  GUARD_IMAGE,
  KILLER_CARD_BACK,
  PROP_IMAGE,
  DIRE_CROW_IMAGE,
  TONIC_IMAGE,
  unknownMini,
  cardImage,
  cardLabel,
  itemImage,
  interactionWho,
  killerInteractionLabel,
  killerMini,
  VICTOR_MINI,
  DOG_MINI,
  iconLabel,
  pathLabel,
  pathName,
  perkChoiceLabel,
  playerOf,
  powerName,
  survivorInteractionLabel,
  survivorMini,
  windowLabel,
} from '../labels'
import CardHand, { type HandCard } from './CardHand.vue'
import RollDice from './RollDice.vue'
import FaceLabel from './FaceLabel.vue'
import MomentLine from './MomentLine.vue'
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
  /** Pain Resonance's hook interacted with, its survivor being picked on the board. */
  painArmed?: boolean
  /** An interaction that buys a bonus turn with a ▲ for the killer, settled here before it is sent. */
  bonusAsk?: { i?: SurvivorInteraction; card: MoveCard | null; path: string | null; go?: boolean } | null
  /** Treacherous Crows: the crow picked on the map, and the killer's card picked here. */
  crowsCrow?: string | null
  crowsCard?: number | null
  /** Scent of Blood: The Dog left where it stands, its new card being picked here. */
  dogStay?: boolean
  /** A target clicked on the map that a perk may use: its actions, the perks' and the plain one. */
  ask?: BoardAction[]
}>()

// Perk and power choices the board already offers are made there; the panel points at it.
const here = (a: Action) => !props.onBoard.has(actionKey(a))
/** Windows of Opportunity's pallets are picked on the board, the pallet and then its path. */
/** Treacherous Crows too: the crow, then the room it goes to, both on the board. */
const boardPallet = (perk: PerkId, c: PerkChoice) => (perk === 'windows_of_opportunity' && !!c.path) || perk === 'treacherous_crows'
const perkAct = (perk: PerkId, c: PerkChoice): Action => ({ t: 'perk', perk, use: true, choice: c })
const powerAct = (i: KillerInteraction): Action => ({ t: 'interact', i })
const emit = defineEmits<{
  powerOn: [on: boolean]
  undyingOn: [on: boolean]
  undyingCard: [card: MoveCard | null]
  undyingRoom: [room: string | null]
  trapPath: [path: string | null]
  powerCard: [card: MoveCard | null]
  /** Pain Resonance: interact with this hook, then pick the survivor (on the board); null: put back. */
  painHook: [hook: string | null]
  bonusAsk: [pick: { i?: SurvivorInteraction; card: MoveCard | null; path: string | null; go?: boolean } | null]
  /** A confirmed crow bonus turn: the move it already settled, made when the engine asks for it. */
  bonusMove: [move: { s: number | 'killer'; card: PathKind; path: string } | null]
  /** The bonus turn's card (null: none), to be sent when the engine offers the bonus turn. */
  bonusCard: [pick: { s: number; card: MoveCard | null } | null]
  crowsCrow: [crow: string | null]
  crowsCard: [index: number | null]
  dogStay: [on: boolean]
  /** The target's question answered or put back. */
  ask: []
}>()

const askPerks = computed(() => (props.ask ?? []).filter((a) => a.perk))
const askPlain = computed(() => (props.ask ?? []).filter((a) => !a.perk))
/** A perk choice's words without the perk's name in front (its card says it). */
const askWhat = (a: BoardAction) => a.label.replace(/^[^:]+:\s*/, '')
function answer(a: BoardAction) {
  emit('ask')
  a.run()
}

/** Treacherous Crows, its crow picked: the killer's cards still unseen, to pick which to reveal. */
const crowsPick = computed(() => (props.crowsCrow && step.value.t === 'survivorInteract' ? crowsCards(props.st) : []))
const CARD_PLACE = ['ซ้าย', 'ขวา', 'โบนัส']

const step = computed(() => props.st.step)

function act(a: Action) {
  preview.value = null
  if (dispatch(a)) sfx.click()
}

/** The room a prop stands in, by name (Vigo's Blueprint names the exit gate's). */
const propRoom = (id: string) => roomName(props.st, props.st.props.find((p) => p.id === id)?.room ?? '')

/** Who has to act for this step: a survivor index or 'killer'. */
const actor = computed<number | 'killer' | null>(() => {
  const s = step.value
  switch (s.t) {
    case 'setupReveal':
    case 'shroudRoom':
    case 'vigo':
    case 'whiteWard':
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
    case 'cutCoin':
    case 'shrikeWreath':
    case 'carnifexProp':
    case 'carnifexMove':
    case 'dogCard':
    case 'dogMove':
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
  if (s.t === 'carryMove' && !s.hang) return carryMoves(st).map((m) => ({ path: m.path.id, label: pathLabel(st, m.path.id, st.killer.room) }))
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
  // (the crow is chased on the board, where the bonus turn it gives is settled first: `bonusAsk`)
  return s.t === 'survivorInteract' && s.canInteract ? survivorInteractions(props.st, s.s).filter((i) => i.k !== 'calmSpirit' && i.k !== 'diversion' && i.k !== 'crow') : []
})

/**
 * The interactions left for the panel: the board offers the rest (board first). A pallet is played
 * there in two clicks, the pallet then the path, so a room full of pallets doesn't fill the panel.
 */
const panelInteractions = computed(() => sInteractions.value.filter((i) => i.k !== 'dropPallet' && here({ t: 'interact', i })))
const hasPallet = computed(() => sInteractions.value.some((i) => i.k === 'dropPallet'))

/**
 * The perks that take this turn's interaction (`REPLACES_INTERACT`): asked before anything else,
 * because interacting by habit spends the turn and the perk with it. While the question is open
 * the ordinary interactions wait; pressing a card arms it (the map then shows its targets), and
 * "ไม่ใช้ Perk" lets the turn go on as usual (`plainInteract`, reset with the step).
 */
const gateCards = computed(() => gatePerks(props.st))
const gateOpen = computed(() => interactGate(props.st))
// the question opens: the alert every perk question gives (PerkPrompt's), for the player it asks
watch(
  () => (gateOpen.value && props.st.step.t === 'survivorInteract' && controls(props.st, props.st.step.s) ? JSON.stringify(props.st.step) : null),
  (now, was) => {
    if (now && now !== was) fxSound.perk(false)
  },
)
/** On screen: all of them while the question is open, the armed one alone after. */
const shownGate = computed(() => (gateOpen.value ? gateCards.value : perkPicked.value && gateCards.value.includes(perkPicked.value) ? [perkPicked.value] : []))

/** Pressing a gate card: one with nothing to aim at (Wicked) is used at once, the rest arm. */
function pickGate(perk: PerkId) {
  const b = perkButtons(props.st).find((x) => x.perk === perk)
  const choice = b?.choices.length === 1 ? b.choices[0] : null
  if (choice && !aimedOnMap(choice)) return act({ t: 'perk', perk, use: true, choice })
  pickInteractPerk(perk)
}

/** What the armed gate card says to do next (Calm Spirit has no perk button of its own). */
function gateHint(perk: PerkId): string | undefined {
  if (perkPicked.value !== perk) return undefined
  if (perk === 'calm_spirit') return '🎯 คลิก Crow ในห้องคุณบนแผนที่ แล้วเลือกห้องที่จะส่งมันไป — กดการ์ดอีกครั้งเพื่อยกเลิก'
  const b = perkButtons(props.st).find((x) => x.perk === perk)
  return b ? pickedHint(b) : undefined
}

const kInteractions = computed(() => {
  const s = step.value
  if (s.t !== 'killerInteract' || !s.canInteract)
    return { plain: [] as KillerInteraction[], undying: [] as KillerInteraction[], traps: [] as KillerInteraction[], powers: [] as KillerInteraction[], painHook: null as string | null }
  const all = killerInteractions(props.st)
  return {
    // (Pain Resonance goes by its hook first: its card below, or the hook on the board)
    plain: s.powerOnly ? [] : all.filter((i) => !isPower(i) && i.k !== 'undying' && i.k !== 'painResonance'),
    undying: s.powerOnly ? [] : all.filter((i) => i.k === 'undying'),
    traps: all.filter((i) => i.k === 'power' && !i.remove),
    powers: all.filter(isPower),
    /** The empty hook Pain Resonance is used at, when it can be. */
    painHook: !s.powerOnly && all.some((i) => i.k === 'painResonance') ? (usableHook(props.st, props.st.killer.room)?.id ?? null) : null,
  }
})

/** Choosing where the power goes (after "use power", or Territorial Imperative's extra use). */
const powerMode = computed(() => {
  const s = step.value
  return s.t === 'killerInteract' && s.canInteract && (props.powerOn || s.powerOnly === true)
})

/** The situation while choosing where the power goes (same facts as the perk panel). */
const POWER_HINT: Record<string, string> = {
  houndmaster: 'เลือกว่า The Dog จะอยู่ที่ไหน แล้วเลือกการ์ดที่จะมอบให้ (หรือไม่มอบ)',
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
            : b.perk === 'treacherous_crows'
              ? 'คลิก Crow ในห้องคุณบนแผนที่ แล้วคลิกห้องที่เชื่อมกันที่จะส่งมันไป'
              : undefined
  return perkPickedHint(b.choices, (c) => !here(perkAct(b.perk, c)), how)
}

function pickInteractPerk(perk: PerkId) {
  sfx.click()
  perkPicked.value = perkPicked.value === perk ? null : perk
}

/** "ไม่ใช้ Perk": the question is answered, the turn goes on with the ordinary interactions. */
function declineGate() {
  sfx.click()
  plainInteract.value = true
}

/** Out of the flow altogether. */
function stopSteps() {
  if (stepKind.value === 'haunt') emit('powerOn', false)
  else emit('undyingOn', false)
}


/**
 * Perk buttons in this step (start of turn, interact, a roll). The interact step's perks with
 * targets on the map are here too: their card is what says they can be used at all, and a player
 * who never clicks that target would otherwise miss them (the players asked for this back).
 * Pressing one arms it, as every other perk card; the click on the target still works meanwhile.
 */
// online, a perk button shows only on its owner's device
const buttons = computed(() => perkButtons(props.st).filter((b) => b.owner === 'killer' || controls(props.st, b.owner)))
/** The cards under the interactions: the ones that take the interaction are asked above instead. */
const stepButtons = computed(() => buttons.value.filter((b) => !REPLACES_INTERACT.includes(b.perk)))
/** Of those, the ones whose targets are on the map: their card says the map works too. */
const targetPerks = computed(() => stepButtons.value.flatMap((b) => (onTargetPerk(b) ? [PERKS[b.perk].name] : [])))

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


// ---------- a bonus turn: the card from the hand, then the room on the map, and it goes ----------
//
// One flow for every bonus turn (the players asked for it): chasing a crow and Power of Two (whose
// interaction is sent with it), and the bonus turns offered (a perk's or a power's, the killer's).
// The card is picked from the hand; the rooms it can reach then light up on the map, and a click on
// one — always, a single one too — sends all of it: the interaction if any, the card, and the move
// (`moveIntent` in GameScreen makes it when the engine asks). "ยกเลิก" until then costs nothing.

/** Who plays the bonus turn being settled: a survivor, the killer, or nobody. */
const bonusWho = computed<number | 'killer' | null>(() => {
  const s = step.value
  if (s.t === 'survivorInteract') return props.bonusAsk ? s.s : null
  if (s.t === 'bonusOffer') return s.s
  if (s.t === 'killerBonusOffer') return 'killer'
  return null
})
/** What it is, in words: chasing a crow, Power of Two on a friend, or a bonus turn offered. */
const bonusWhat = computed(() => {
  const i = props.bonusAsk?.i
  if (!i) return 'Bonus Turn'
  return i.k === 'partner' ? `${PERKS.power_of_two.name} กับ ${props.st.survivors[i.target].name}` : 'ไล่ Crow'
})
const bonusCards = computed<MoveCard[]>(() => {
  const w = bonusWho.value
  if (w === null) return []
  return w === 'killer' ? [...new Set(props.st.killer.hand)] : [...new Set(props.st.survivorHands[props.st.survivors[w].hand])]
})
/** Where a card takes them from their room: none means the bonus turn's move is wasted (p.9). */
function bonusMoves(card: MoveCard) {
  const w = bonusWho.value
  if (w === null || !isPathCard(card)) return []
  return w === 'killer' ? killerMoves(props.st, card) : survivorMoves(props.st, w, card)
}
const bonusPick = computed(() => props.bonusAsk?.card ?? null)
/** The rooms the picked card reaches (clicked on the map). */
const bonusRooms = computed(() => (bonusPick.value ? [...new Set(bonusMoves(bonusPick.value).map((m) => m.to))] : []))
const bonusHand = computed<HandCard[]>(() =>
  bonusCards.value.map((card) => {
    const dead = isPathCard(card) && bonusMoves(card).length === 0
    return { card, picked: bonusPick.value === card, ...(dead ? { badge: 'เดินไม่ได้' } : bonusPick.value === card ? { badge: 'Bonus Turn' } : {}) }
  }),
)
function pickBonus(card: MoveCard) {
  sfx.click()
  const same = bonusPick.value === card
  emit('bonusAsk', same ? (props.bonusAsk?.i ? { ...props.bonusAsk, card: null, path: null } : null) : { ...(props.bonusAsk ?? {}), card, path: null })
}
function hoverBonus(card: MoveCard | null) {
  const w = bonusWho.value
  if (w === null) return
  preview.value = card ? choicePreview(props.st, { card }, w === 'killer' ? props.st.killer.room : props.st.survivors[w].room, w) : null
}

/**
 * Send the bonus turn settled: the interaction first for a crow or Power of Two (the killer's ▲,
 * p.12), then the card, and the move handed up to be made when the engine asks for it (a perk may
 * be offered on the card first).
 */
function sendBonus() {
  const pick = props.bonusAsk
  const w = bonusWho.value
  if (w === null) return
  preview.value = null
  const card = pick?.card ?? null
  const path = pick?.path ?? null
  emit('bonusAsk', null)
  if (path && card && isPathCard(card)) emit('bonusMove', { s: w, card, path })
  if (pick?.i) {
    // one action carries it all (`then`): the engine plays the card and the move on at once, so
    // nothing is left to send after it (sent apart, online, the later ones were refused)
    const then = { card, ...(path && card && isPathCard(card) ? { path } : {}) }
    // kept too (from before the action, while they are still in their room): if the game asks
    // something else first (a perk on the card), the rest goes when that is answered
    if (w !== 'killer') emit('bonusCard', { s: w, card })
    if (!dispatch({ t: 'interact', i: pick.i, then })) return void (emit('bonusCard', null), emit('bonusMove', null))
    sfx.select()
    return
  }
  if (!card) return
  dispatch({ t: 'bonus', card })
}
onBeforeUnmount(() => (preview.value = null))
// before a card is picked, a path out of their room on the map picks the card of its colour too (as
// the hand does); the room is then clicked as usual
let bonusPathPick = false
watchEffect(() => {
  const w = bonusWho.value
  if (w !== null && !bonusPick.value) {
    pathPick.value = pathPickFor(props.st, w === 'killer' ? props.st.killer.room : props.st.survivors[w].room, bonusCards.value, pickBonus)
    bonusPathPick = true
  } else if (bonusPathPick) {
    pathPick.value = null
    bonusPathPick = false
  }
})
onBeforeUnmount(() => bonusPathPick && (pathPick.value = null))
// the room clicked on the map: it all goes
watch(
  () => props.bonusAsk?.go,
  (go) => {
    if (go) sendBonus()
  },
)

// ---------- Scent of Blood, step 2: a card for The Dog, picked from the hand, then confirmed ----------

const dogPick = ref<MoveCard | null>(null)
watch(
  () => JSON.stringify(step.value),
  () => (dogPick.value = null),
)
/** The Dog left where it stands: its card is picked before the power is used, so going back costs nothing. */
const dogStaying = computed(() => !!props.dogStay && step.value.t === 'killerInteract')
watch(dogStaying, () => (dogPick.value = null))
const dogHand = computed<HandCard[]>(() =>
  step.value.t === 'dogCard' || dogStaying.value ? [...new Set(props.st.killer.hand)].map((card) => ({ card, picked: dogPick.value === card, ...(dogPick.value === card ? { badge: 'The Dog' } : {}) })) : [],
)
function pickDog(card: MoveCard) {
  sfx.click()
  dogPick.value = dogPick.value === card ? null : card
}
function confirmDog() {
  if (!dogPick.value) return
  if (dogStaying.value) act({ t: 'interact', i: { k: 'dog', stay: true, card: dogPick.value } })
  else act({ t: 'dogCard', card: dogPick.value })
}
/** What The Dog would do with a card at the start of his first turn, from where it stands now. */
function dogWhere(card: MoveCard): string {
  const room = props.st.killer.dogRoom
  if (!room) return ''
  if (card === 'wait') return `อยู่ที่ ${roomName(props.st, room)} แล้วขย้ำคนในห้องนั้น`
  const runs = isPathCard(card) ? dogPaths(props.st, card) : []
  return runs.length ? `วิ่งจาก ${roomName(props.st, room)} ไป ${runs.map((e) => roomName(props.st, e.to)).join(' หรือ ')} แล้วขย้ำคนที่นั่น` : `ไม่มีเส้นทางสีนี้จาก ${roomName(props.st, room)} — อยู่กับที่ ไม่ขย้ำใคร`
}
const dogRuns = computed(() => (step.value.t === 'dogMove' ? dogPaths(props.st, step.value.card) : []))

// Online each helper (a key, Iron Will) decides on their own device; the roller waits for them.
const rollers = computed(() => rerollers(props.st).filter((s) => controls(props.st, s)))
const rollOthers = computed(() => (props.st.step.t === 'roll' ? rollHelpers(props.st).filter((s) => s !== (props.st.step as { ctx: { s: number } }).ctx.s) : []))
// On one device, a bot's roll: the people who could help pass on it here (the roll is the bot's to accept)
const botRoll = computed(() => props.st.step.t === 'roll' && isBot(props.st, playerOfSurvivor(props.st, props.st.step.ctx.s)))
const passers = computed(() =>
  online.value || botRoll.value ? rollOthers.value.filter((s) => controls(props.st, s) && !isBot(props.st, playerOfSurvivor(props.st, s))) : [],
)
const keyWaiting = computed(() => rollOthers.value.filter((s) => !controls(props.st, s)))
const rollMine = computed(() => step.value.t === 'roll' && controls(props.st, step.value.ctx.s) && !botRoll.value)
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

    <!-- the setup offerings (p.19) -->
    <template v-else-if="step.t === 'shroudRoom'">
      <p><b>{{ offeringName('shroud-of-union') }}</b>: ฝั่ง Survivor เลือกห้อง 1 ห้องที่ทุกคนจะเริ่มด้วยกัน — ห้องไหนก็ได้ ไม่ต้องเป็นห้องเริ่ม</p>
      <p class="board-hint">🎯 คลิกห้องบนแผนที่ · ฆาตกรยังทอยหาห้องเริ่มตามปกติ</p>
    </template>
    <template v-else-if="step.t === 'vigo'">
      <p><b>{{ offeringName('vigos-blueprint') }}</b>: เปิดเจอ Exit Gate ที่ {{ propRoom(step.gate) }} — สลับกับ Generator ที่หงายอยู่และยังไม่มีความคืบหน้าไหม?</p>
      <p class="board-hint">🎯 คลิก Generator ที่กระพริบบนแผนที่เพื่อสลับ</p>
      <div class="buttons">
        <button class="ghost" @click="act({ t: 'vigo', gen: null })">ไม่สลับ</button>
      </div>
    </template>
    <template v-else-if="step.t === 'whiteWard'">
      <p><b>{{ offeringName('white-ward') }}</b>: {{ ITEM_NAMES[step.item] }} กำลังจะถูกทิ้ง — จ่าย {{ WARD_COST }} ▲ เพื่อวางไว้บนสุดของกอง Item ไหม? (มี {{ st.survivors[step.s].bp }} ▲)</p>
      <div class="buttons">
        <button class="primary" :disabled="st.survivors[step.s].bp < WARD_COST" @click="act({ t: 'ward', pay: true })">จ่าย {{ WARD_COST }} ▲ เก็บไว้บนกอง</button>
        <button class="ghost" @click="act({ t: 'ward', pay: false })">ไม่จ่าย</button>
        <button class="ghost" @click="act({ t: 'ward', pay: false, mute: true })">ไม่ต้องถามฉันอีก</button>
      </div>
    </template>
    <template v-else-if="step.t === 'cutCoin'">
      <p><b>{{ offeringName('cut-coin') }}</b>: เอา prop <b>สีน้ำเงิน</b> ที่คว่ำอยู่ออกจากเกม อีก {{ step.left }} อัน</p>
      <p class="board-hint">🎯 คลิกไทล์สีน้ำเงินที่คว่ำอยู่บนแผนที่ — ไม่รู้ว่าเป็น Chest หรือ Locker</p>
    </template>
    <template v-else-if="step.t === 'shrikeWreath'">
      <p><b>{{ offeringName('shrike-wreath') }}</b>: เลือกผู้รอดชีวิตอีก {{ 2 - step.chosen.length }} คน วาง Sacrifice Progress เพิ่มบนบอร์ด — ไปเข้าราง Sacrifice ตอนเขาถูกแขวนครั้งแรก</p>
      <div class="buttons">
        <button v-for="(sv, s) in st.survivors" v-show="!step.chosen.includes(s)" :key="s" class="primary" @click="act({ t: 'shrike', s })"><FaceLabel :st="st" :who="s" :text="sv.name" /></button>
      </div>
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
      <!-- what the perk is asked about: who, doing what, to which prop -->
      <p v-if="step.t === 'offer' && windowLabel(st, step.w)" class="moment-line"><MomentLine :st="st" :w="step.w" /></p>
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

    <!-- The Houndmaster's Scent of Blood, step 2: the card The Dog runs with -->
    <template v-else-if="step.t === 'dogCard' || dogStaying">
      <p><Mini class="token-inline" :src="asset(DOG_MINI)" alt="" /> <b>กลิ่นเลือด</b> — {{ dogStaying ? `The Dog อยู่ที่ ${roomName(st, st.killer.dogRoom!)} ต่อ: มอบการ์ดใบใหม่ 1 ใบจากมือ` : 'มอบการ์ดเคลื่อนที่ 1 ใบจากมือให้ The Dog' }}</p>
      <p class="small">
        ทุกรอบ ตอนเริ่มเทิร์นแรกของคุณ The Dog จะวิ่งตามการ์ดนี้ (ข้าม Pallet กำแพง และย้อนเส้นทางทางเดียวได้) แล้ว<b>ขย้ำ</b>ผู้รอดชีวิตที่ไม่บาดเจ็บในห้องที่ไปถึง 1 คน — คนนั้นยังถูกอุ้มได้ในรอบเดียวกัน
      </p>
      <p class="small muted">การ์ดที่มอบจะอยู่กับ The Dog ไม่กลับเข้ามือ จนกว่าจะมอบใบใหม่{{ st.killer.dogCard ? ` · ตอนนี้ The Dog ถือ ${CARD_NAMES[st.killer.dogCard]} (มอบใบใหม่ = ทิ้งใบนี้)` : '' }}</p>
      <p class="muted small">👇 เลือกการ์ดจากมือด้านล่าง แล้วกดยืนยัน</p>
      <p v-if="dogPick" class="small">{{ CARD_NAMES[dogPick] }}: {{ dogWhere(dogPick) }}</p>
      <div class="buttons col way-on">
        <button class="primary" :disabled="!dogPick" @click="confirmDog">{{ dogPick ? `ยืนยัน: มอบ ${CARD_NAMES[dogPick]} ให้ The Dog` : 'เลือกการ์ดจากมือก่อน' }}</button>
        <!-- staying with no new card would change nothing: it goes back, nothing used -->
        <button v-if="dogStaying" @click="emit('dogStay', false)">ยกเลิก — กลับไปเลือกใหม่</button>
        <button v-else @click="act({ t: 'dogCard', card: null })">{{ st.killer.dogCard ? `ไม่มอบ — The Dog ใช้ ${CARD_NAMES[st.killer.dogCard]} ต่อ` : 'ไม่มอบการ์ด (The Dog ไม่วิ่ง)' }}</button>
      </div>
      <CardHand :cards="dogHand" :label="`กลิ่นเลือด — มือของ ${st.killer.name}`" prompt="กลิ่นเลือด — เลือกการ์ดให้ The Dog" @pick="pickDog" />
    </template>

    <!-- The Dog's run at the start of his first turn: which path of its colour -->
    <template v-else-if="step.t === 'dogMove'">
      <p><Mini class="token-inline" :src="asset(DOG_MINI)" alt="" /> <b>The Dog</b> วิ่งด้วย <b>{{ CARD_NAMES[step.card] }}</b> — มีหลายเส้นทางสีนี้ เลือกทางที่มันจะไป</p>
      <p class="small muted">ไปถึงแล้ว มันจะขย้ำผู้รอดชีวิตที่ไม่บาดเจ็บในห้องนั้น 1 คน</p>
      <p class="board-hint">🎯 คลิกเส้นทางที่กระพริบบนแผนที่{{ dogRuns.some((e) => here({ t: 'dogPath', path: e.path.id })) ? ' หรือปุ่มด้านล่าง' : '' }}</p>
      <div class="buttons col">
        <template v-for="e in dogRuns" :key="e.path.id">
          <button v-if="here({ t: 'dogPath', path: e.path.id })" @click="act({ t: 'dogPath', path: e.path.id })">→ {{ roomName(st, e.to) }}</button>
        </template>
      </div>
    </template>

    <template v-else-if="step.t === 'pickSurvivor'">
      <p v-if="step.why === 'dog'"><b>The Dog</b> — เลือกผู้รอดชีวิตที่จะถูกขย้ำ (บาดเจ็บ แต่ยังถูกอุ้มได้ในรอบนี้)</p>
      <p v-else>เลื่อยไฟฟ้า — เลือกผู้รอดชีวิตในห้องที่จะบาดเจ็บ</p>
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

    <!-- a target clicked that a perk may use: which perk, or the plain action -->
    <template v-else-if="askPerks.length">
      <p class="ask-title">{{ askPerks.length > 1 ? 'ใช้ Perk ไหน?' : 'ใช้ Perk นี้ไหม?' }}</p>
      <PerkCard v-for="(a, i) in askPerks" :key="i" :perk="a.perk!" state="ready" :hint="`👆 กดการ์ดเพื่อใช้: ${askWhat(a)}`" @pick="answer(a)" />
      <button v-for="(a, i) in askPlain" :key="`p${i}`" @click="answer(a)">
        <FaceLabel :st="st" :who="a.who" :text="`ไม่ใช้ Perk — ${a.label}`" :icon="a.icon" />
      </button>
      <button class="ghost" @click="emit('ask')">ยกเลิก</button>
    </template>

    <!-- Treacherous Crows, the crow picked: which of the killer's cards to reveal, then the room on the map -->
    <template v-else-if="step.t === 'survivorInteract' && crowsPick.length > 1">
      <PerkCard perk="treacherous_crows" state="picked" @pick="emit('crowsCrow', null)" />
      <p class="crow-step">1. เลือกการ์ดฆาตกรที่จะเปิด</p>
      <div class="card-row crow-cards">
        <button
          v-for="i in crowsPick"
          :key="i"
          class="cardbtn cap"
          :class="{ on: crowsCard === i }"
          :title="`การ์ดฆาตกรใบที่ ${i + 1}`"
          @click="(emit('crowsCard', crowsCard === i ? null : i), sfx.click())"
        >
          <img :src="asset(KILLER_CARD_BACK)" alt="คว่ำ" />
          <span>ใบที่ {{ i + 1 }} ({{ CARD_PLACE[i] ?? 'โบนัส' }})</span>
        </button>
      </div>
      <p v-if="crowsCard !== null && crowsCard !== undefined" class="board-hint">🎯 2. คลิกห้องที่เชื่อมกันบนแผนที่ ที่จะส่ง Crow ไป</p>
      <button @click="emit('crowsCrow', null)">ยกเลิก</button>
    </template>

    <!-- survivor interact -->
    <template v-else-if="step.t === 'survivorInteract'">
      <p v-if="!step.canInteract" class="warn">เคลื่อนที่ไม่สำเร็จ — เทิร์นนี้ Interact ไม่ได้</p>
      <!-- it buys the killer a ▲: the whole bonus turn is settled here, and sent only on confirm -->
      <template v-else-if="bonusAsk">
        <p>
          <b>{{ bonusWhat }}</b> — {{ st.killer.name }} ได้ +1 <BpIcon /> แล้วเล่น Bonus Turn: ทิ้งการ์ด 1 ใบ เคลื่อนที่ + Interact อีกครั้ง (หน้า 12)<br />
          <span class="muted small">ยังไม่เสียอะไรจนกว่าจะคลิกห้อง — ยกเลิกได้</span>
        </p>
        <p v-if="!bonusPick" class="board-hint">👇 1. เลือกการ์ดจากมือ หรือคลิกเส้นทางสีนั้นบนแผนที่</p>
        <p v-else-if="bonusRooms.length" class="board-hint">🎯 2. คลิกห้องที่จะไปบนแผนที่ ({{ bonusRooms.map((r) => roomName(st, r)).join(' · ') }}) — ไปทันที</p>
        <p v-else-if="isPathCard(bonusPick)" class="warn">{{ CARD_NAMES[bonusPick] }} ไม่มีเส้นทางจากห้องนี้ — เดินไม่ได้ และเสียการ Interact ของ Bonus Turn ไปด้วย</p>
        <div class="buttons col way-on">
          <!-- nothing to click on the map (no card left, or a card that can't move): confirmed here -->
          <button v-if="!bonusCards.length || (bonusPick && !bonusRooms.length)" class="primary" @click="sendBonus">
            {{ !bonusCards.length ? `ยืนยัน: ${bonusWhat} (ไม่มีการ์ดเหลือ ไม่ได้ Bonus Turn)` : `ยืนยัน: ${bonusWhat} แล้ว Bonus Turn ด้วย ${CARD_NAMES[bonusPick!]}` }}
          </button>
          <button @click="emit('bonusAsk', null), sfx.click()">ยกเลิก</button>
        </div>
        <CardHand :cards="bonusHand" :label="`Bonus Turn — มือของ ${st.survivors[step.s].name}`" @pick="pickBonus" @hover="hoverBonus" />
      </template>
      <!-- the perks that ARE this turn's interaction are asked before it (`interactGate`) -->
      <p v-else-if="gateOpen">
        <b>ใช้ Perk แทนการ Interact ไหม?</b><br /><span class="muted small">Perk ด้านล่างนับเป็นการ Interact ของเทิร์นนี้ — กดการ์ดแล้วเลือกเป้าหมายบนแผนที่ หรือเลือก Interact ตามปกติ</span>
      </p>
      <p v-else-if="sInteractions.length || hasDiversion">
        <!-- with a perk armed the glowing spots are its targets, not the ordinary interactions -->
        Interact 1 อย่าง ที่ {{ roomName(st, st.survivors[step.s].room) }}<br /><span v-if="!perkPicked" class="muted small">คลิกของหรือตัวละครที่เรืองแสงบนแผนที่ได้เลย</span>
      </p>
      <p v-else class="muted">ไม่มีอะไรให้ Interact ในห้องนี้</p>
      <!-- the question's cards: one of them takes the place of the interaction -->
      <PerkCard
        v-for="p in shownGate"
        :key="p"
        :perk="p"
        :state="perkPicked === p ? 'picked' : perkPicked ? 'dim' : 'ready'"
        :hint="gateHint(p)"
        @pick="pickGate(p)"
      />
      <div v-if="!gateOpen && !bonusAsk" class="buttons col">
        <!-- a perk picked: its targets only, the ordinary interactions wait -->
        <button v-for="(i, n) in perkPicked ? [] : panelInteractions" :key="n" @click="act({ t: 'interact', i })"><FaceLabel :st="st" :who="interactionWho(st, i)" :text="survivorInteractionLabel(st, step.s, i)" /></button>
        <p v-if="hasPallet && !perkPicked" class="board-hint">🎯 ทิ้ง Pallet: คลิก Pallet บนแผนที่ แล้วเลือกเส้นทาง</p>
        <!-- Diversion is played on the board: the killer, then the path -->
        <p v-if="hasDiversion" class="board-hint">🎯 หันเหความสนใจ: คลิกตัว {{ st.killer.name }} บนแผนที่ แล้วเลือกเส้นทางที่จะส่งไป</p>
      </div>
      <!-- a perk is picked first (its targets then show on the board), again to put it back -->
      <p v-if="stepButtons.length && !perkPicked && !bonusAsk" class="perk-lead">{{ PERK_LEAD }}</p>
      <p v-if="targetPerks.length && !perkPicked && !bonusAsk" class="board-hint">🎯 {{ targetPerks.join(' / ') }} — กดการ์ดด้านล่าง หรือคลิกเป้าหมายบนแผนที่ได้เลย</p>
      <div v-for="b in bonusAsk ? [] : stepButtons" :key="b.perk">
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
      <div v-if="!bonusAsk" class="buttons col way-on">
        <!-- the question's other answer; and a way back to it for a player who changes their mind -->
        <button v-if="gateOpen" class="primary" @click="declineGate">ไม่ใช้ Perk — Interact ตามปกติ</button>
        <button v-else-if="plainInteract && gateCards.length && !perkPicked" class="small" @click="plainInteract = false">↩ กลับไปดู Perk ที่ใช้แทน Interact</button>
        <button v-if="!gateOpen" class="end" @click="act({ t: 'endTurn' })">จบเทิร์น (ไม่ทำอะไรต่อ)</button>
      </div>
    </template>

    <!-- bonus turns -->
    <template v-else-if="step.t === 'bonusOffer' || step.t === 'killerBonusOffer'">
      <p v-if="step.t === 'bonusOffer' && step.why === 'power_of_two'">
        <b>สองคนเพื่อนตาย</b> — {{ st.killer.name }} ได้ +1 ▲ แล้ว ตอนนี้ <b>{{ st.survivors[step.s].name }}</b> เล่น Bonus Turn: ทิ้งการ์ด 1 ใบจากมือ แล้วเคลื่อนที่ + Interact อีกครั้ง
      </p>
      <p v-else-if="step.t === 'bonusOffer'">Bonus Turn: ทิ้งการ์ด 1 ใบจากมือ แล้วเคลื่อนที่ + Interact อีกครั้ง (หน้า 9)</p>
      <p v-else-if="step.free"><b>สลิปสตรีม</b> — การ์ดทั้งหมดกลับเข้ามือแล้ว เลือกการ์ด 1 ใบเล่น Bonus Turn (ไม่เสีย ▲)</p>
      <p v-else>จ่าย {{ bonusCost(st) }} <BpIcon /> (มี {{ st.killer.bp }}) เพื่อเล่นเทิร์นที่ 3? (หน้า 10)</p>
      <p v-if="!bonusPick" class="board-hint">👇 1. เลือกการ์ดจากมือ หรือคลิกเส้นทางสีนั้นบนแผนที่</p>
      <p v-else-if="bonusRooms.length" class="board-hint">🎯 2. คลิกห้องที่จะไปบนแผนที่ ({{ bonusRooms.map((r) => roomName(st, r)).join(' · ') }}) — ไปทันที</p>
      <p v-else-if="isPathCard(bonusPick)" class="warn">{{ CARD_NAMES[bonusPick] }} ไม่มีเส้นทางจากห้องนี้ — เดินไม่ได้ และเสียการ Interact ของ Bonus Turn ไปด้วย</p>
      <div class="buttons col way-on">
        <!-- Wait, or a card that can't move: nothing to click on the map, so it is confirmed here -->
        <button v-if="bonusPick && !bonusRooms.length" class="primary" @click="sendBonus">ยืนยัน: Bonus Turn ด้วย {{ CARD_NAMES[bonusPick] }}</button>
        <button v-if="bonusPick" @click="emit('bonusAsk', null), sfx.click()">ยกเลิก (เลือกการ์ดใหม่)</button>
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
      <p v-else-if="step.other">พันธะ: เก็บลูกนี้แล้ว — ใช้กุญแจทอยลูกนี้ใหม่ หรือ perk ได้</p>
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
          <!-- The Houndmaster: the two ways Scent of Blood goes, and where each is clicked -->
          <ul v-if="st.killer.characterId === 'houndmaster'" class="afterpiece">
            <li v-if="kInteractions.powers.some((i) => i.k === 'dog' && !i.stay)">
              <img :src="asset(DOG_MINI)" alt="" /><span><b>{{ st.killer.dogRoom ? 'ย้าย' : 'วาง' }} The Dog มาที่ {{ roomName(st, st.killer.room) }}</b> — คลิกห้องของคุณ (หรือตัวคุณ) บนแผนที่</span>
            </li>
            <li v-if="st.killer.dogRoom && kInteractions.powers.some((i) => i.k === 'dog' && i.stay)">
              <!-- (its card is then picked from the hand; "ยกเลิก" there goes back with nothing used) -->
              <img :src="asset(DOG_MINI)" alt="" /><span><b>ให้ The Dog อยู่ที่ {{ roomName(st, st.killer.dogRoom) }}</b> — คลิกตัว The Dog{{ st.killer.dogRoom === st.killer.room ? ' หรือห้องของคุณ' : '' }} บนแผนที่ (มอบการ์ดใหม่ได้)</span>
            </li>
          </ul>
          <!-- The Unknown: where each one stands, and which is playing now -->
          <ul v-if="st.killer.unknowns" class="afterpiece">
            <li v-for="(room, u) in unknownRooms(st)" :key="u">
              <img :src="asset(unknownMini(u))" alt="" />
              <span><b>The Unknown {{ u + 1 }}</b> — {{ room ? roomName(st, room) : 'ยังไม่อยู่บนกระดาน' }}{{ u === (st.killer.unknownAt ?? 0) && room ? ' · ตัวที่เล่นอยู่' : '' }}</span>
            </li>
          </ul>
          <!-- The Skull Merchant: the Drones on his board. With none there, "place" is not offered
               at all, so it says why rather than leaving only "take back" with no reason. -->
          <ul v-if="st.killer.characterId === 'skullmerchant'" class="afterpiece">
            <li><img :src="asset(PROP_IMAGE.drone)" alt="" /><span><b>Drone</b> — Skill Check ในห้องที่มี Drone หงายหน้า: สำเร็จ คุณ +1 ▲, ล้มเหลว = บาดเจ็บ แล้ว Drone คว่ำลง · บนบอร์ดคุณ {{ merchantDrones(st).length }} ตัว</span></li>
            <li v-if="!merchantDrones(st).length"><img :src="asset(PROP_IMAGE.drone)" alt="" /><span class="warn">ไม่มี Drone บนบอร์ด — <b>วางไม่ได้</b> ต้องเก็บ Drone หงายหน้าจากแผนที่กลับขึ้นบอร์ดก่อน</span></li>
          </ul>
          <!-- The Artist: what is still on her board to place -->
          <ul v-if="st.killer.characterId === 'artist'" class="afterpiece">
            <li><img :src="asset(PROP_IMAGE.crow)" alt="" /><span><b>Crow</b> — บนบอร์ดคุณ {{ artistCrows(st).crows }} ตัว</span></li>
            <li><img :src="asset(DIRE_CROW_IMAGE)" alt="" /><span><b>Dire Crow</b> — ผู้รอดชีวิตในห้องนั้นวางการ์ดหงายก่อนใคร · บนบอร์ดคุณ {{ artistCrows(st).dire }}/{{ DIRE_CROWS }} ตัว</span></li>
          </ul>
          <!-- The Clown: what each token does, and where it stands now -->
          <ul v-if="st.killer.characterId === 'clown'" class="afterpiece">
            <li><img :src="asset(TONIC_IMAGE)" alt="" /><span><b>Tonic</b> — ผู้รอดชีวิตในห้องนั้นวางการ์ดหงาย · {{ st.afterpiece?.tonic ? `อยู่ที่ ${roomName(st, st.afterpiece.tonic)}` : 'ยังไม่วาง' }}</span></li>
            <li><img :src="asset(ANTIDOTE_IMAGE)" alt="" /><span><b>Antidote</b> — ใครเข้าห้องนั้นเดินต่อได้อีก 1 ทาง · {{ st.afterpiece?.antidote ? `อยู่ที่ ${roomName(st, st.afterpiece.antidote)}` : 'ยังไม่วาง' }}</span></li>
          </ul>
          <div class="buttons">
            <button v-for="(i, n) in kInteractions.powers.filter((i) => here(powerAct(i)) && !(i.k === 'dog' && i.stay))" :key="n" @mouseenter="hoverPower(i)" @mouseleave="hoverPower(null)" @click="act({ t: 'interact', i })"><FaceLabel :st="st" :who="interactionWho(st, i)" :text="killerInteractionLabel(st, i)" /></button>
          </div>
        </template>
        <button v-if="!step.powerOnly" @click="emit('trapPath', null), emit('powerCard', null), emit('powerOn', false)">ยกเลิก ไม่ใช้พลัง</button>
        <button v-else @click="act({ t: 'endTurn' })">ไม่ใช้พลัง</button>
      </template>

      <template v-else>
        <p>
          <!-- with a perk armed the glowing spots are its targets, not his ordinary interactions -->
          Interact 1 อย่าง หรือใช้พลังแทน (1 ครั้ง/รอบ) ที่ {{ roomName(st, st.killer.room) }}<br /><span v-if="!perkPicked" class="muted small"
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
          <!-- Pain Resonance: the hook first (here or on the board), then whom it wounds on the board -->
          <PerkCard
            v-if="kInteractions.painHook && !perkPicked"
            perk="pain_resonance"
            :state="painArmed ? 'picked' : 'ready'"
            text="Interact กับ Hook ว่างในห้องนี้ แล้วเลือกผู้รอดชีวิตในห้องที่เชื่อมกัน — คนนั้นบาดเจ็บ"
            @pick="emit('painHook', painArmed ? null : kInteractions.painHook!), sfx.click()"
          />
          <button v-if="kInteractions.powers.length" class="power" @click="emit('powerOn', true), sfx.click()">⚡ ใช้พลัง: {{ powerName(st) }}</button>
          <span v-else-if="st.killer.powerUsed" class="muted small">ใช้พลังไปแล้วรอบนี้</span>
          <span v-else class="muted small">ใช้พลังไม่ได้จากห้องนี้</span>
        </div>
        <!-- a perk is picked first (its targets then show on the board), again to put it back -->
        <p v-if="buttons.length && !perkPicked" class="perk-lead">{{ PERK_LEAD }}</p>
        <p v-if="targetPerks.length && !perkPicked" class="board-hint">🎯 {{ targetPerks.join(' / ') }} — กดการ์ดด้านล่าง หรือคลิกเป้าหมายบนแผนที่ได้เลย</p>
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

    <!-- out of steps on a free hook: the hanging, pressed by itself once the walk there has shown -->
    <template v-else-if="step.t === 'carryMove' && step.hang">
      <p>แบก {{ st.survivors[step.s].name }} มาถึง Hook ว่าง — แขวน</p>
      <button class="primary" @click="act({ t: 'hang' })">แขวนที่ Hook ในห้องนี้</button>
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
      <!-- The Unknown: a Flashlight on any Unknown stops the one interacting, wherever it is -->
      <p v-else-if="st.killer.unknowns">
        The Unknown {{ (st.killer.unknownAt ?? 0) + 1 }} กำลังจะ Interact ที่ {{ roomName(st, st.killer.room) }} — ใช้ <b>Flashlight</b> ใส่ The Unknown ในห้องของคุณเพื่อกันไว้ไหม?
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
/* ending the turn: small, quiet and set apart from the answers above it, so it isn't hit instead */
.end {
  justify-self: start;
  margin-top: 0.9rem;
  padding: 0.35rem 0.8rem;
  font-size: 0.85rem;
  background: none;
  border: 1px dashed rgb(255 255 255 / 0.3);
  color: var(--muted);
}
.buttons.col .end {
  align-self: flex-start;
  text-align: center;
}
.end:hover {
  color: var(--text);
  border-color: rgb(255 255 255 / 0.55);
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
.ask-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  color: #ffe9b0;
}
/* Treacherous Crows: the killer's cards at a size to pick from, not the hand's thumbnails */
.crow-step {
  margin: 0.2rem 0 0;
  font-weight: 600;
  color: #ffe9b0;
}
.crow-cards {
  gap: 0.6rem;
}
.crow-cards .cardbtn {
  width: 120px;
  padding: 4px;
  font-size: 0.82rem;
}
.cardbtn.on {
  border-color: #f5c542;
  box-shadow: 0 0 0 2px #f5c542, 0 0 12px rgb(245 197 66 / 0.55);
}
.itembtn {
  display: grid;
  gap: 0.3rem;
  width: 120px;
  justify-items: center;
}
</style>
