<script setup lang="ts">
// What the current player can do now. Every button dispatches one engine action; moves can
// also be made by clicking the highlighted paths on the board.
import { computed, onBeforeUnmount, ref, watch, watchEffect } from 'vue'
import { asset } from '../../i18n'
import { sfx } from '../../sound'
import {
  CARD_NAMES,
  ITEM_NAMES,
  bonusCost,
  charlotteRoom,
  victorRoom,
  anyMoves,
  carryMoves,
  hookHere,
  isPower,
  killerInteractions,
  killerMoves,
  perkButtons,
  perkChoices,
  propsIn,
  rerollers,
  rollHelpers,
  roomName,
  survivorInteractions,
  survivorMoves,
} from '../engine/engine'
import { PERKS, type PerkId } from '../engine/perks'
import type { Action, GameState, KillerInteraction, MoveCard, PerkChoice, PropCategory, SurvivorInteraction } from '../engine/types'
import { actionKey, undyingCards, undyingOptions, undyingPaths, undyingRoomOf } from '../boardActions'
import { controls, dispatch, online } from '../game'
import { pathPick, pathPickFor } from '../pathPick'
import {
  orderedChoices,
  cardCaption,
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
  perkImage,
  perkText,
  playerOf,
  powerName,
  survivorInteractionLabel,
  survivorMini,
  windowLabel,
} from '../labels'
import CardHand, { type HandCard } from './CardHand.vue'
import DiceRow from './DiceRow.vue'
import FaceLabel from './FaceLabel.vue'
import { choicePreview, decisionFocus, powerPreview, preview } from '../focus'
import Mini from './Mini.vue'

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
const perkAct = (perk: PerkId, c: PerkChoice): Action => ({ t: 'perk', perk, use: true, choice: c })
const powerAct = (i: KillerInteraction): Action => ({ t: 'interact', i })
/** A choice of the perk on offer that isn't on the board. */
const offerHere = (c: PerkChoice) => (props.st.step.t === 'offer' ? here(perkAct(props.st.step.perk, c)) : true)
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
    case 'survivorInteract':
    case 'bonusOffer':
    case 'anyMove':
    case 'keepItem':
      return s.s
    case 'revealProp':
      return s.who
    case 'offer':
      return s.owner
    case 'turnStart':
      return s.s
    case 'pickSurvivor':
      return 'killer'
    case 'roll':
      return s.ctx.s
    case 'killerMove':
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
  if (s.t === 'carryMove') return carryMoves(st).map((m) => ({ path: m.path.id, label: pathLabel(st, m.path.id, st.killer.room) }))
  return []
})

const sInteractions = computed(() => {
  const s = step.value
  return s.t === 'survivorInteract' && s.canInteract ? survivorInteractions(props.st, s.s).filter((i) => i.k !== 'calmSpirit') : []
})

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
  doctor: 'เลือกห้องนี้หรือห้องที่เชื่อมกัน — ทุกคนในห้องนั้นจ่าย 1 ▲ หรือติด Madness (มีแล้ว = บาดเจ็บ)',
  hag: 'วาง Phantasm Trap ในห้องนี้ (ห้องละ 1) — มี Hex Totem ในห้องได้ +1 ▲',
  wraith: 'วาร์ปไปห้องที่ไม่เชื่อมกับห้องนี้',
  oni: 'รับ ▲ เท่ากับจำนวนผู้รอดชีวิตที่บาดเจ็บ และ Hex Totem ในห้องนี้กับห้องที่เชื่อมกัน',
  twins: 'วาง Victor ในห้องนี้ (ถ้าอยู่ที่อื่นจะย้ายมา) — เทิร์นต่อไปเลือกเล่นด้วย Victor ได้',
  blight: 'สุ่มทิ้งการ์ด 1 ใบจากมือ แล้วเดินตามเส้นทางสีนั้น — เข้าห้องใหม่ได้: Interact ที่นั่น หรือพุ่งต่อ',
}

const powerFacts = computed(() => (powerMode.value ? (decisionFocus(props.st, true)?.facts ?? []) : []))

function hoverPower(i: KillerInteraction | null) {
  preview.value = i ? powerPreview(props.st, i) : null
}

/** The Hillbilly: cards that have a chainsaw path. The Deathslinger: cards he may discard. */
const powerCards = computed(() => [...new Set(kInteractions.value.powers.flatMap((i) => (i.k === 'chainsaw' || i.k === 'redeemer' ? [i.card] : [])))])

// ---------- Undying: discard a card, take its path, interact in the room it reaches ----------

/** The cards in hand that reach a prop (a colour with nothing to do isn't offered). */
const undyingHand = computed<HandCard[]>(() =>
  undyingCards(props.st).map((card) => ({ card, picked: props.undyingCard === card, ...(props.undyingCard === card ? { badge: 'Undying' } : {}) })),
)

function pickUndyingCard(card: MoveCard) {
  sfx.click()
  emit('undyingCard', props.undyingCard === card ? null : card)
}

/** The rooms the picked card reaches, for the panel's buttons (the board offers the same paths). */
const undyingRooms = computed(() => (props.undyingCard ? undyingPaths(props.st, props.undyingCard) : []))

/** What Undying can do in the room picked. */
const undyingHere = computed(() =>
  props.undyingCard && props.undyingRoom
    ? undyingOptions(props.st, props.undyingCard).filter((i) => undyingRoomOf(props.st, i) === props.undyingRoom)
    : [],
)


/** Perk buttons in this step (start of turn, interact, a roll). */
// online, a perk button shows only on its owner's device
const buttons = computed(() => perkButtons(props.st).filter((b) => b.owner === 'killer' || controls(props.st, b.owner)))

const offerChoices = computed(() => {
  const s = step.value
  return s.t === 'offer' ? orderedChoices(props.st, s.perk, s.w, perkChoices(props.st, s.perk, s.owner, s.w)) : []
})

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
    </template>

    <template v-else-if="step.t === 'revealProp'">
      <p>เข้าห้อง {{ roomName(st, step.room) }} — เลือกสีของ prop ที่จะเปิด 1 อัน (คลิกไทล์บนแผนที่หรือปุ่ม)</p>
      <div class="buttons">
        <button v-for="c in revealChoices" :key="c.category" class="cat" :class="c.category" @click="act({ t: 'reveal', prop: c.prop })">
          <img :src="asset(`assets/props/back-${c.category}.webp`)" alt="" />{{ CATEGORY_TH[c.category] }}
        </button>
      </div>
    </template>

    <!-- a perk's moment -->
    <template v-else-if="step.t === 'offer'">
      <p class="eyebrow">{{ windowLabel(st, step.w) }}</p>
      <div class="perk-offer">
        <img v-if="perkImage(step.perk)" :src="asset(perkImage(step.perk))" alt="" />
        <div>
          <strong>ใช้ {{ PERKS[step.perk].name }}?</strong>
          <span class="cost">{{ PERKS[step.perk].cost ? `${PERKS[step.perk].cost} ▲` : 'ฟรี' }}</span>
          <p class="small">{{ perkText(step.perk) }}</p>
        </div>
      </div>
      <p v-if="offerChoices.some((c) => !offerHere(c))" class="board-hint">🎯 เลือกบนแผนที่ได้เลย — คลิกวงที่กระพริบ</p>
        <div v-if="offerChoices.some((c) => c.card)" class="card-row">
          <button
            v-for="(c, i) in offerChoices.filter((c) => c.card)"
            :key="`card${i}`"
            class="cardbtn cap"
            :title="perkChoiceLabel(st, step.perk, step.owner, step.w, c)"
            
            
            @click="act({ t: 'perk', perk: step.perk, use: true, choice: c })"
          >
            <img :src="asset(cardImage(c.card!))" :alt="cardLabel(c.card!)" />
            <span>{{ cardCaption(step.perk, c) }}</span>
          </button>
        </div>
      <div class="buttons col">
        <button v-for="(c, i) in offerChoices.filter((c) => !c.card && offerHere(c) && !(step.t === 'offer' && step.perk === 'oppression'))" :key="i" class="primary" @click="act({ t: 'perk', perk: step.perk, use: true, choice: c })">
          <FaceLabel :st="st" :who="c.target" :text="perkChoiceLabel(st, step.perk, step.owner, step.w, c)" />
        </button>
        <button @click="act({ t: 'perk', perk: step.perk, use: false })">ไม่ใช้</button>
        <button class="ghost small" @click="act({ t: 'perk', perk: step.perk, use: false, quiet: true })">ไม่ใช้ และไม่ต้องถามอีกในรอบนี้</button>
      </div>
    </template>

    <!-- start of a survivor's turn: Self-Care, Empathy, Botany Knowledge -->
    <template v-else-if="step.t === 'turnStart'">
      <p>เริ่มเทิร์น — ใช้ perk ก่อนเดินได้</p>
      <p v-if="buttons.some((b) => b.perk !== 'breakout' && b.choices.some((c) => !here(perkAct(b.perk, c))))" class="board-hint">🎯 เลือกบนแผนที่ได้เลย — คลิกวงที่กระพริบ</p>
      <div v-for="b in buttons" :key="b.perk" class="perk-group">
        <span class="perk-name">{{ PERKS[b.perk].name }} <span class="cost">{{ PERKS[b.perk].cost ? `${PERKS[b.perk].cost} ▲` : 'ฟรี' }}</span></span>
        <!-- Breakout: a person and then a path, both picked on the board (a pair per button would be a wall of them) -->
        <span v-if="b.perk === 'breakout'" class="muted small">🎯 คลิกเพื่อนที่บาดเจ็บบนแผนที่ แล้วเลือกเส้นทาง</span>
        <template v-else>
          <button v-for="(c, i) in b.choices.filter((c) => here(perkAct(b.perk, c)))" :key="i" @click="act({ t: 'perk', perk: b.perk, use: true, choice: c })"><FaceLabel :st="st" :who="c.target" :text="perkChoiceLabel(st, b.perk, b.owner, b.w, c)" /></button>
        </template>
      </div>
      <button class="primary" @click="act({ t: 'continue' })">เปิดการ์ด แล้วเดิน</button>
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
          <span>Victor — {{ roomName(st, victorRoom(st)!) }} (อุ้มไม่ได้: จับแล้ว +1 ▲)</span>
        </button>
      </div>
    </template>

    <template v-else-if="step.t === 'pickSurvivor'">
      <p>Chainsaw — เลือกผู้รอดชีวิตในห้องที่จะบาดเจ็บ</p>
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
          <template v-if="step.t === 'killerMove' && step.rush">Blighted Corruption สุ่มได้ <b>{{ cardLabel(step.card) }}</b></template>
          <template v-else>เปิดการ์ด <b>{{ cardLabel(step.card) }}</b></template>
          <br /><span class="muted">เลือกเส้นทางที่ไฮไลต์บนแผนที่</span>
        </p>
      </div>
      <div class="buttons">
        <button v-for="m in moves" :key="m.path" @click="act({ t: 'move', path: m.path })">{{ m.label }}</button>
      </div>
    </template>

    <template v-else-if="step.t === 'anyMove'">
      <p>ช่วยลงจาก Hook แล้ว: <b>{{ st.survivors[step.s].name }}</b> เดินตามเส้นทางใดก็ได้ 1 ครั้ง (หน้า 13) หรือจะอยู่ห้องเดิมก็ได้</p>
      <div class="buttons">
        <button v-for="m in moves" :key="m.path" @click="act({ t: 'move', path: m.path })">{{ m.label }}</button>
      </div>
      <button class="primary" @click="act({ t: 'stop' })">อยู่ห้องเดิม</button>
    </template>

    <!-- survivor interact -->
    <template v-else-if="step.t === 'survivorInteract'">
      <p v-if="!step.canInteract" class="warn">เคลื่อนที่ไม่สำเร็จ — เทิร์นนี้ Interact ไม่ได้</p>
      <p v-else-if="sInteractions.length">
        Interact 1 อย่าง ที่ {{ roomName(st, st.survivors[step.s].room) }}<br /><span class="muted small">คลิกของหรือตัวละครที่เรืองแสงบนแผนที่ได้เลย</span>
      </p>
      <p v-else class="muted">ไม่มีอะไรให้ Interact ในห้องนี้</p>
      <div class="buttons col">
        <button v-for="(i, n) in sInteractions" :key="n" @click="act({ t: 'interact', i })"><FaceLabel :st="st" :who="interactionWho(st, i)" :text="survivorInteractionLabel(st, step.s, i)" /></button>
        <details v-for="c in calmSpirit" :key="c.prop" class="calm">
          <summary>Calm Spirit: ย้าย Crow ไปห้องอื่น (ฟรี)</summary>
          <div class="buttons">
            <button v-for="o in c.options" :key="o.room" @click="act({ t: 'interact', i: o })">{{ roomName(st, o.room) }}</button>
          </div>
        </details>
      </div>
      <div v-for="b in buttons" :key="b.perk" class="perk-group">
        <span class="perk-name">{{ PERKS[b.perk].name }} <span class="cost">{{ PERKS[b.perk].cost ? `${PERKS[b.perk].cost} ▲` : 'ฟรี' }}</span></span>
        <button v-for="(c, i) in b.choices.filter((c) => here(perkAct(b.perk, c)))" :key="i" @click="act({ t: 'perk', perk: b.perk, use: true, choice: c })"><FaceLabel :st="st" :who="c.target" :text="perkChoiceLabel(st, b.perk, b.owner, b.w, c)" /></button>
        <span v-if="b.choices.some((c) => !here(perkAct(b.perk, c)))" class="muted small">🎯 หรือคลิกบนแผนที่</span>
      </div>
      <button class="end" @click="act({ t: 'endTurn' })">จบเทิร์น</button>
    </template>

    <!-- bonus turns -->
    <template v-else-if="step.t === 'bonusOffer' || step.t === 'killerBonusOffer'">
      <p v-if="step.t === 'bonusOffer'">Bonus Turn: ทิ้งการ์ด 1 ใบจากมือ แล้วเคลื่อนที่ + Interact อีกครั้ง (หน้า 9)</p>
      <p v-else>จ่าย {{ bonusCost(st) }} ▲ (มี {{ st.killer.bp }}) เพื่อเล่นเทิร์นที่ 3? (หน้า 10)</p>
      <p class="muted small">👇 ชี้ไพ่บนมือด้านล่างเพื่อดูเส้นทาง · คลิกเพื่อเลือก แล้วกดยืนยัน</p>
      <div class="buttons col">
        <button class="primary" :disabled="!bonusPick" @click="confirmBonus">{{ bonusPick ? `ยืนยัน: Bonus Turn ด้วย ${CARD_NAMES[bonusPick]}` : 'เลือกการ์ดจากมือก่อน' }}</button>
        <button @click="act({ t: 'declineBonus' })">ไม่เล่น</button>
      </div>
      <CardHand
        :cards="bonusHand"
        :label="`Bonus Turn — มือของ ${step.t === 'bonusOffer' ? st.survivors[step.s].name : st.killer.name}`"
        @pick="pickBonus"
        @hover="hoverBonus"
      />
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
      <p v-if="step.keep">Bond: ทอย 2 ลูก — เลือกเก็บ 1 ลูก</p>
      <p v-else>ผลทอย — ใช้กุญแจทอยใหม่ หรือ perk ได้</p>
      <DiceRow :dice="step.dice" big />
      <div class="buttons col">
        <template v-for="b in buttons" :key="b.perk">
          <button class="primary" @click="act({ t: 'perk', perk: b.perk, use: true, choice: {} })">
            <FaceLabel :st="st" :who="b.owner" :text="`${st.survivors[b.owner as number].name}: ${PERKS[b.perk].name} — นับผลล้มเหลวเป็นสำเร็จ (${PERKS[b.perk].cost} ▲)`" />
          </button>
        </template>
        <template v-for="s in rollers" :key="s">
          <template v-for="(d, i) in step.dice" :key="i">
            <button v-if="!d.rerolled" @click="act({ t: 'reroll', s, die: i })">
              <FaceLabel :st="st" :who="s" :text="`${st.survivors[s].name} ทิ้ง ${ITEM_NAMES[st.survivors[s].item!]} ทอยลูกที่ ${i + 1} ใหม่`" />
            </button>
          </template>
        </template>
        <!-- someone else's roll: each helper on this device passes on it here -->
        <button v-for="s in passers" :key="`p${s}`" @click="act({ t: 'passRoll', s })">
          <FaceLabel :st="st" :who="s" :text="`${st.survivors[s].name} ไม่ช่วย — ไม่ใช้กุญแจ / Perk`" />
        </button>
        <template v-if="rollMine">
          <p v-if="keyWaiting.length" class="small">⏳ รอ {{ keyWaiting.map((s) => st.survivors[s].name).join(', ') }} ตัดสินใจว่าจะช่วย (กุญแจ / Perk) หรือไม่</p>
          <template v-if="step.keep">
            <button v-for="(_, i) in step.dice" :key="`k${i}`" class="primary" :disabled="keyWaiting.length > 0" @click="act({ t: 'acceptRoll', die: i })">เก็บลูกที่ {{ i + 1 }}</button>
          </template>
          <button v-else class="primary" :disabled="keyWaiting.length > 0" @click="act({ t: 'acceptRoll' })">ใช้ผลนี้</button>
        </template>
        <p v-else class="small muted">รอ {{ st.survivors[step.ctx.s].name }} รับผลทอย</p>
      </div>
    </template>

    <!-- killer interact -->
    <template v-else-if="step.t === 'killerInteract'">
      <p v-if="!step.canInteract" class="warn">เทิร์นนี้ Interact ไม่ได้</p>

      <!-- Undying, a step at a time: the card from the hand, its path, then the prop over there -->
      <template v-else-if="undyingOn && kInteractions.undying.length">
        <p><b>Undying</b> ({{ PERKS.undying.cost }} ▲) — ทิ้งการ์ด 1 ใบ แล้ว Interact กับ prop ในห้องที่เชื่อมด้วยเส้นทางสีเดียวกับการ์ด</p>

        <template v-if="!undyingCard">
          <p class="muted small">👇 1. เลือกการ์ดที่จะทิ้ง จากไพ่บนมือด้านล่าง</p>
          <CardHand :cards="undyingHand" :label="`Undying — มือของ ${st.killer.name}`" prompt="Undying — เลือกการ์ดที่จะทิ้ง" @pick="pickUndyingCard" />
        </template>

        <template v-else-if="!undyingRoom">
          <p class="small">ทิ้ง <b>{{ CARD_NAMES[undyingCard] }}</b> — 2. ไปทางไหน?</p>
          <p class="board-hint">🎯 คลิกเส้นทางสีนั้นบนแผนที่ (ทางแยกจะให้เลือกห้องต่อ)</p>
          <div class="buttons col">
            <button v-for="r in undyingRooms" :key="r.to" @click="emit('undyingRoom', r.to), sfx.click()">{{ roomName(st, r.to) }}</button>
            <button @click="emit('undyingCard', null)">เปลี่ยนการ์ด</button>
          </div>
        </template>

        <template v-else>
          <p class="small">3. ทำอะไรที่ <b>{{ roomName(st, undyingRoom) }}</b>?</p>
          <p v-if="undyingHere.some((i) => !here(powerAct(i)))" class="board-hint">🎯 คลิก prop ที่กระพริบในห้องนั้นบนแผนที่</p>
          <div class="buttons col">
            <template v-for="(i, n) in undyingHere" :key="n">
              <button v-if="here(powerAct(i))" @click="act({ t: 'interact', i })">{{ killerInteractionLabel(st, i.i) }}</button>
              <span v-else class="undying-target">🎯 {{ killerInteractionLabel(st, i.i) }}</span>
            </template>
            <button @click="emit('undyingRoom', null)">เปลี่ยนเส้นทาง</button>
          </div>
        </template>

        <button @click="emit('undyingOn', false)">ยกเลิก ไม่ใช้ Undying</button>
      </template>

      <!-- choosing where the power goes, after "use power" -->
      <template v-else-if="powerMode">
        <ul v-if="powerFacts.length" class="facts">
          <li v-for="(f, n) in powerFacts" :key="n">
            <span class="icon">{{ f.icon }}</span><FaceLabel :st="st" :who="f.who" :text="f.text" />
          </li>
        </ul>
        <p v-if="step.powerOnly"><b>Territorial Imperative</b> — ใช้พลังอีกครั้ง</p>
        <p v-if="kInteractions.powers.some((i) => !here(powerAct(i)))" class="board-hint">🎯 เลือกบนแผนที่ได้เลย — คลิกวงที่กระพริบ</p>
        <template v-if="st.killer.characterId === 'trapper'">
          <p>
            <b>ใช้พลัง: Bear Trap</b> — เลือกเส้นทางที่เชื่อมกับห้อง (คลิกบนแผนที่หรือปุ่ม) เหลือในมือ {{ st.killer.trapsInSupply }} อัน{{
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
            <span class="small">ย้าย Bear Trap อันไหนมา? (คลิกบนแผนที่หรือปุ่ม)</span>
            <button v-for="r in trapsOnBoard" :key="r" @click="act({ t: 'interact', i: { k: 'power', path: trapPath, remove: r } }), emit('trapPath', null)">
              {{ pathName(st, r) }}
            </button>
          </div>
        </template>
        <template v-else-if="st.killer.characterId === 'hillbilly'">
          <p><b>ใช้พลัง: Chainsaw</b> — ทิ้งการ์ด 1 ใบจากมือ แล้วเดินตามสีนั้น (ห้ามผ่าน Pallet / กำแพง / ของบนทาง) ผู้รอดชีวิตในห้องที่เข้าไปบาดเจ็บ</p>
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
            <b>ใช้พลัง: Redeemer</b> — ทิ้งการ์ด 1 ใบแบบคว่ำ แล้วยิงผู้รอดชีวิตที่บาดเจ็บในห้องที่เชื่อมกัน (ทางนั้นไม่มี Pallet / กำแพง และไม่ได้เพิ่งบาดเจ็บในรอบนี้) ถ้าเขาทายการ์ดผิด จะถูกดึงเข้ามาและถูกอุ้ม
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
            {{ POWER_HINT[st.killer.characterId] ?? '' }}
          </p>
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
            >คลิกของหรือผู้รอดชีวิตที่เรืองแสงบนแผนที่ — คลิกตัว {{ st.killer.name }} เพื่อใช้พลัง{{ kInteractions.undying.length ? ' หรือ Undying' : '' }}</span
          >
        </p>
        <div class="buttons col">
          <button v-for="(i, n) in kInteractions.plain" :key="n" @click="act({ t: 'interact', i })"><FaceLabel :st="st" :who="interactionWho(st, i)" :text="killerInteractionLabel(st, i)" /></button>
          <button v-if="kInteractions.undying.length" class="undying" @click="emit('undyingOn', true), sfx.click()">
            🃏 Undying ({{ PERKS.undying.cost }} ▲): ทิ้งการ์ด แล้ว Interact ในห้องข้าง ๆ
          </button>
          <button v-if="kInteractions.powers.length" class="power" @click="emit('powerOn', true), sfx.click()">⚡ ใช้พลัง: {{ powerName(st) }}</button>
          <span v-else-if="st.killer.powerUsed" class="muted small">ใช้พลังไปแล้วรอบนี้</span>
          <span v-else class="muted small">ใช้พลังไม่ได้จากห้องนี้</span>
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
      <p v-if="step.item === 'firecracker'">
        {{ st.killer.name }} กำลังจะเข้าห้องของคุณ — ใช้ <b>Firecracker</b> กันไว้ไหม?
      </p>
      <p v-else>{{ st.killer.name }} กำลังจะ Interact ในห้องของคุณ — ใช้ <b>Flashlight</b> กันไว้ไหม?</p>
      <div class="buttons">
        <button v-for="s in step.holders" :key="s" class="primary" @click="act({ t: 'react', s })"><FaceLabel :st="st" :who="s" :text="`${st.survivors[s].name} ใช้`" /></button>
        <button @click="act({ t: 'react', s: null })">ไม่ใช้</button>
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
.perk-offer {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 0.7rem;
  align-items: start;
}
.perk-offer img {
  width: 72px;
  border-radius: 4px;
}
.perk-offer p {
  margin: 0.2rem 0 0;
  line-height: 1.45;
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
.perk-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
  padding: 0.4rem;
  border-left: 3px solid #9b6bd6;
  background: rgb(120 70 200 / 0.08);
}
.perk-name {
  width: 100%;
  font-family: var(--font-display);
  font-size: 0.85rem;
  color: #d8c2ff;
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
