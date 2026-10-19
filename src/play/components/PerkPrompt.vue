<script setup lang="ts">
// Decisions about perks: a perk offered when its moment comes, the start-of-turn perks, and a
// roll still waiting on Iron Will, a key or Bond's choice. Docked beside the board (not over
// it) so the map stays readable: the board lights up who is involved and where they could go,
// and hovering a choice previews it on the map.
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { asset } from '../../i18n'
import { CARD_NAMES, KILLER_CARDS, purgeOptions, crowdPayments, crowdPledges, pledgedPay, gripTargets, offeredPerks, perkButtons, perkChoices, phantasmInteractions, rerollers, rollHelpers, roomName } from '../engine/engine'
import { PERKS, type PerkId } from '../engine/perks'
import type { Action, GameState, KillerInteraction, MoveCard, PerkChoice, PerkOwner } from '../engine/types'
import { actionKey, perkPicked, perksToPick } from '../boardActions'
import { choicePreview, preview } from '../focus'
import { fxSound } from '../fx/audio'
import { fx } from '../fx/bus'
import { controls, dispatch, online } from '../game'
import { pathPick, pathPickFor } from '../pathPick'
import { KILLER_CARD_BACK, VILE_PURGE_IMAGE, ROLL_TITLE, orderedChoices, cardCaption, cardImage, cardLabel, killerInteractionLabel, killerMini, ownerLabel, perkChoiceLabel, perkImage, pathLabel, perkText, playerOf, survivorMini, windowLabel, windowWho } from '../labels'
import CardHand, { type HandCard } from './CardHand.vue'
import RollDice from './RollDice.vue'
import FaceLabel from './FaceLabel.vue'
import Mini from './Mini.vue'
import BpIcon from '../../components/BpIcon.vue'
import BpText from '../../components/BpText.vue'

const props = defineProps<{ st: GameState; hidden: boolean; onBoard: Set<string> }>()

// A choice the board already offers (a path, a prop, a survivor, a room) is made there, not here.
const perkAct = (perk: PerkId, c: PerkChoice): Action => ({ t: 'perk', perk, use: true, choice: c })
const here = (a: Action) => !props.onBoard.has(actionKey(a))
/** A choice of the perk on offer that isn't on the board. */
const offerHere = (c: PerkChoice) => (props.st.step.t === 'offer' ? here(perkAct(props.st.step.perk, c)) : true)

const step = computed(() => props.st.step)
const buttons = computed(() => perkButtons(props.st).filter((b) => b.owner === 'killer' || controls(props.st, b.owner)))
// Online each helper (a key, Iron Will) decides on their own device; the roller waits for them.
const keyHolders = computed(() => rerollers(props.st).filter((s) => controls(props.st, s)))
const rollOthers = computed(() => (props.st.step.t === 'roll' ? rollHelpers(props.st).filter((s) => s !== (props.st.step as { ctx: { s: number } }).ctx.s) : []))
const passers = computed(() => (online.value ? rollOthers.value.filter((s) => controls(props.st, s)) : []))
const keyWaiting = computed(() => rollOthers.value.filter((s) => !controls(props.st, s)))
const rollMine = computed(() => step.value.t === 'roll' && controls(props.st, step.value.ctx.s))

// ---------- several perks at the start of a turn: the perk first, then what to do with it ----------

const pickPerk = computed(() => perksToPick(props.st))
watch(
  () => JSON.stringify(step.value),
  () => (perkPicked.value = null),
)
onBeforeUnmount(() => (perkPicked.value = null))
/** This perk's choices are out (on the board, and as buttons here). */
const perkOpen = (perk: PerkId) => !pickPerk.value || perkPicked.value === perk
function choosePerk(perk: PerkId) {
  if (!pickPerk.value) return
  fxSound.flip()
  perkPicked.value = perkPicked.value === perk ? null : perk
}

/** The perk being decided: the one offered, or with several at once the one picked (null: none yet). */
const activePerk = computed<PerkId | null>(() => {
  const s = step.value
  if (s.t !== 'offer') return null
  return offeredPerks(s).length > 1 ? perkPicked.value : s.perk
})

const offerChoices = computed(() => {
  const s = step.value
  const perk = activePerk.value
  if (s.t !== 'offer' || !perk) return []
  return orderedChoices(props.st, perk, s.w, perkChoices(props.st, perk, s.owner, s.w))
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
/** Lightborn: which planned card to turn face up, picked on the card itself. */
// Lightborn (the killer) and Open-Handed (a survivor) both turn one of the killer's planned cards
// face up: the cards are laid out to click. The survivor sees only their backs, unless already shown.
const isLightborn = computed(() => step.value.t === 'offer' && (activePerk.value === 'lightborn' || activePerk.value === 'open_handed'))
const lightbornChoice = (i: number) => (isLightborn.value ? offerChoices.value.find((c) => c.index === i) : undefined)
const openHanded = computed(() => activePerk.value === 'open_handed')
/** A planned card's face is in sight: always for the killer, for a survivor once it is revealed. */
const faceUp = (i: number) => {
  const k = props.st.killer
  return !openHanded.value || i < k.revealedCount || k.shown.includes(i) || k.plannedShown
}

const tinkerSwaps = computed(() => offerChoices.value.filter((c) => c.index === tinkerIndex.value))

/** Several perks of one owner at the same moment: each with its choices, used in any order (p.16). */
const offerList = computed(() => {
  const s = step.value
  return s.t === 'offer' ? offeredPerks(s).map((perk) => ({ perk, choices: perkChoices(props.st, perk, s.owner, s.w) })) : []
})

/** What is being decided now, if anything worth the panel. */
const kind = computed<'offer' | 'turnStart' | 'roll' | 'spark' | 'phantasm' | 'replace' | 'guess' | 'crowd' | 'purge' | null>(() => {
  const s = step.value
  if (s.t === 'offer') return 'offer'
  if (s.t === 'purgeChoice') return 'purge'
  if (s.t === 'crowdPay' || s.t === 'crowdPick') return 'crowd'
  if (s.t === 'sparkChoice') return 'spark'
  if (s.t === 'phantasmChoice') return 'phantasm'
  if (s.t === 'replaceCard') return 'replace'
  if (s.t === 'redeemerGuess') return 'guess'
  if (s.t === 'turnStart' && buttons.value.length) return 'turnStart'
  if (s.t === 'roll' && (s.keep || buttons.value.length || keyHolders.value.length || passers.value.length || keyWaiting.value.length)) return 'roll'
  return null
})

/** Who decides: the perk's owner, or the survivor whose turn / roll it is. */
const decider = computed<PerkOwner | null>(() => {
  const s = step.value
  if (s.t === 'offer') return s.owner
  if (s.t === 'turnStart') return s.s
  // online, a helper's device names the helper: it's their key or perk being asked about
  if (s.t === 'roll') return buttons.value[0]?.owner ?? (rollMine.value ? s.ctx.s : (passers.value[0] ?? s.ctx.s))
  if (s.t === 'sparkChoice' || s.t === 'replaceCard' || s.t === 'redeemerGuess' || s.t === 'crowdPay' || s.t === 'purgeChoice') return s.s
  if (s.t === 'phantasmChoice' || s.t === 'crowdPick') return 'killer'
  return null
})

/**
 * Crowd Control: the survivors pay its 2 ▲ between them — a click on a survivor puts in 1 ▲ of
 * theirs (twice for both), then confirm.
 */
const payPick = ref<number[]>([])
watch(
  () => JSON.stringify(step.value),
  () => (payPick.value = []),
)
const canPay = computed(() => crowdPayments(props.st).length > 1)
function addPay(s: number) {
  const n = payPick.value.filter((x) => x === s).length
  if (payPick.value.length >= 2 || props.st.survivors[s].bp <= n) return
  fxSound.flip()
  payPick.value = [...payPick.value, s].sort((a, b) => a - b)
}
const paid = (s: number) => payPick.value.filter((x) => x === s).length

/** Online, each player puts in their own survivors' ▲; the tally shows on every survivor's screen. */
const pledges = computed(() => {
  const s = step.value
  return s.t === 'crowdPay' ? (s.pledge ?? crowdPledges(props.st)) : []
})
const pledgeTotal = computed(() => pledges.value.reduce<number>((t, p) => t + (p ?? 0), 0))
const pledgesIn = computed(() => pledges.value.every((p) => p !== null))
function pledgeLabel(s: number): string {
  const p = pledges.value[s]
  if (p === null) return 'ยังไม่ตัดสินใจ'
  if (p === 0) return props.st.survivors[s].bp ? 'ไม่ลง' : 'ไม่มี ▲'
  return `ลง ${p} ▲`
}

/** Vile Purge: the perk opened big, waiting for the confirm. */
const purgePick = ref<PerkId | null>(null)
watch(
  () => JSON.stringify(step.value),
  () => (purgePick.value = null),
)
function openPurge(p: PerkId) {
  fxSound.flip()
  purgePick.value = p
}
function confirmPurge() {
  const p = purgePick.value
  purgePick.value = null
  if (p) act({ t: 'purgeChoice', perk: p })
}

/** Killer perks moving a survivor along a path: the survivor first, then the path. */
const movesSomeone = computed(() => step.value.t === 'offer' && (step.value.perk === 'dark_devotion' || step.value.perk === 'infectious_fright'))
const moveTargets = computed(() => (movesSomeone.value ? [...new Set(offerChoices.value.map((c) => c.target!))] : []))
const moveWho = ref<number | null>(null)
watch(
  () => JSON.stringify(step.value),
  () => (moveWho.value = null),
)

const hagMoves = computed(() => {
  const s = step.value
  return s.t === 'phantasmChoice' ? phantasmInteractions(props.st, s.room) : []
})

function hoverHag(i: KillerInteraction | null, room: string) {
  preview.value = i ? { survivors: 'target' in i ? [i.target] : [], dests: [room] } : null
}

const handCards = computed(() => {
  const s = step.value
  return s.t === 'replaceCard' || s.t === 'crowdPick' ? [...new Set(props.st.survivorHands[props.st.survivors[s.s].hand])] : []
})

const killerSide = computed(() => decider.value === 'killer')
/** Dragon's Grip discards one or two cards: its choices are buttons, not the hand. */
const isGrip = computed(() => step.value.t === 'offer' && step.value.perk === 'dragons_grip')
// ---------- Dragon's Grip: one or two cards picked from the hand, then confirmed ----------

const gripPick = ref<MoveCard[]>([])
watch(
  () => JSON.stringify(step.value),
  () => (gripPick.value = []),
)

/** The damaged generator's room: the grip reaches out from there. */
const gripRoom = computed(() => {
  const s = step.value
  if (s.t !== 'offer' || s.w.k !== 'killerBreak' || !s.w.prop) return null
  const prop = s.w.prop
  return props.st.props.find((p) => p.id === prop)?.room ?? null
})

/** The hand's path cards, one per kind with the copies left (The Blight holds two of each). */
const gripHand = computed<HandCard[]>(() => {
  if (!isGrip.value) return []
  const hand = props.st.killer.hand.filter((c) => c !== 'wait')
  return [...new Set(hand)].map((card) => {
    const total = hand.filter((c) => c === card).length
    const taken = gripPick.value.filter((c) => c === card).length
    return { card, picked: taken > 0, ...(taken ? { badge: 'ทิ้ง' } : {}), ...(total > 1 ? { count: total - taken } : {}) }
  })
})

function pickGrip(card: MoveCard) {
  fxSound.flip()
  const pick = gripPick.value
  const total = props.st.killer.hand.filter((c) => c === card).length
  const taken = pick.filter((c) => c === card).length
  if (taken && (taken === total || pick.length === 2)) pick.splice(pick.lastIndexOf(card), 1)
  else if (pick.length < 2) pick.push(card)
  else pick.splice(1, 1, card)
}

/** The perk choice matching the cards picked (either order), if it reaches anyone. */
const gripChoice = computed<PerkChoice | null>(() => {
  const want = [...gripPick.value].sort().join()
  return offerChoices.value.find((c) => [c.card, c.card2].filter(Boolean).sort().join() === want) ?? null
})

/** Who the picked cards reach, shown on the map. */
const gripHits = computed(() => (gripRoom.value && gripPick.value.length ? gripTargets(props.st, gripRoom.value, gripPick.value) : []))
watch(gripHits, (hits) => {
  if (isGrip.value) preview.value = hits.length || gripPick.value.length ? { survivors: hits, rooms: gripRoom.value ? [gripRoom.value] : [] } : null
})

function confirmGrip() {
  const s = step.value
  if (s.t === 'offer' && gripChoice.value) act({ t: 'perk', perk: s.perk, use: true, choice: gripChoice.value })
}

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
const MOVE_PERKS: PerkId[] = ['adrenaline', 'saboteur', 'up_the_ante', 'any_means_necessary', 'devour_hope', 'shadowborn', 'resilience', 'renewal', 'situational_awareness', 'lightweight']

/** The cards to choose from: an offer's card choices (Tinkerer / Zanshin: for the planned card picked), or Predator's new card. */
const handChoices = computed<PerkChoice[]>(() => {
  const s = step.value
  if (s.t === 'replaceCard' || s.t === 'crowdPick') return handCards.value.map((card) => ({ card }))
  if (s.t === 'redeemerGuess') return KILLER_CARDS.map((card) => ({ card }))
  if (s.t !== 'offer' || !activePerk.value) return []
  // Dragon's Grip discards one or two cards: its choices stay buttons
  if (activePerk.value === 'dragons_grip') return []
  return isTinkerer.value ? tinkerSwaps.value : offerChoices.value.filter((c) => c.card)
})

const perkHand = computed<HandCard[]>(() => {
  const s = step.value
  return handChoices.value.map((c) => {
    const picked = cardPick.value?.card === c.card
    return { card: c.card!, picked, ...(picked && s.t === 'offer' && activePerk.value ? { badge: cardCaption(activePerk.value, c) } : {}) }
  })
})

const handLabel = computed(() => {
  const s = step.value
  if (s.t === 'replaceCard') return `Predator — มือของ ${props.st.survivors[s.s].name}`
  if (s.t === 'crowdPick') return `Crowd Control — มือของ ${props.st.survivors[s.s].name}`
  if (s.t === 'redeemerGuess') return `ทายการ์ดที่ ${props.st.killer.name} ทิ้ง`
  return s.t === 'offer' && activePerk.value ? `${PERKS[activePerk.value].name} — เลือกการ์ดจากมือ` : ''
})

/** What is asking for a card, shown on the hand itself (it is easy to miss in the corner). */
const handPrompt = computed(() => {
  const s = step.value
  if (s.t === 'replaceCard') return 'Predator — เลือกการ์ดใบใหม่'
  if (s.t === 'crowdPick') return `Crowd Control — เลือกการ์ดให้ ${props.st.survivors[s.s].name}`
  if (s.t === 'redeemerGuess') return `Redeemer — ทายการ์ดที่ ${props.st.killer.name} ทิ้ง`
  return s.t === 'offer' && activePerk.value ? `${PERKS[activePerk.value].name} — เลือกการ์ด` : ''
})

function pickHandCard(card: MoveCard) {
  fxSound.flip()
  cardPick.value = cardPick.value?.card === card ? null : (handChoices.value.find((c) => c.card === card) ?? null)
}

function hoverHandCard(card: MoveCard | null) {
  const s = step.value
  const owner = s.t === 'replaceCard' || s.t === 'crowdPick' ? s.s : s.t === 'offer' && activePerk.value && MOVE_PERKS.includes(activePerk.value) ? s.owner : null
  // Shadowborn's card is played third, from where the first two lead: the map can't say yet
  if (!card || owner === null || activePerk.value === 'shadowborn') return (preview.value = null)
  preview.value = choicePreview(props.st, { card }, owner === 'killer' ? props.st.killer.room : props.st.survivors[owner].room, owner)
}

// ---------- a perk's card, opened big (a click on it); a click anywhere or Esc puts it back ----------

const zoomed = ref<string | null>(null)
function zoom(e: MouseEvent) {
  zoomed.value = (e.currentTarget as HTMLImageElement).src
}
// Esc closes the picture, not the decision behind it (caught before anything else hears the key).
function onZoomKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !zoomed.value) return
  e.stopImmediatePropagation()
  zoomed.value = null
}
watch(zoomed, (z) => (z ? window.addEventListener('keydown', onZoomKey, true) : window.removeEventListener('keydown', onZoomKey, true)))
onBeforeUnmount(() => window.removeEventListener('keydown', onZoomKey, true))

function confirmCard() {
  const s = step.value
  const c = cardPick.value
  if (!c) return
  if (s.t === 'replaceCard') act({ t: 'replace', card: c.card! })
  else if (s.t === 'crowdPick') act({ t: 'crowdPick', card: c.card! })
  else if (s.t === 'redeemerGuess') act({ t: 'guess', card: c.card! })
  else if (s.t === 'offer' && activePerk.value) act({ t: 'perk', perk: activePerk.value, use: true, choice: c })
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

/** Folded away to see the board: only the header stays, saying what is waiting. */
const collapsed = ref(false)

/** Wide screens: the decision lives in the side panel (and folds with it). */
const WIDE = '(min-width: 981px)'
const wideQuery = typeof matchMedia === 'function' ? matchMedia(WIDE) : null
const wide = ref(!!wideQuery?.matches)
const onWide = (e: MediaQueryListEvent) => ((wide.value = e.matches), e.matches && (collapsed.value = false))
onMounted(() => wideQuery?.addEventListener('change', onWide))
onBeforeUnmount(() => wideQuery?.removeEventListener('change', onWide))

// The map: while a perk's movement card is being picked (Adrenaline, Any Means Necessary, Predator's
// new card…), a path out of the mover's room picks the card of its colour, as the hand does.
let ownPick = false
watchEffect(() => {
  const s = step.value
  // (not Shadowborn: its card is played third, from wherever the first two lead)
  const perk = activePerk.value
  const mover = s.t === 'replaceCard' ? s.s : s.t === 'offer' && perk && perk !== 'shadowborn' && MOVE_PERKS.includes(perk) ? s.owner : null
  if (open.value && !collapsed.value && mover !== null && perkHand.value.length) {
    const room = mover === 'killer' ? props.st.killer.room : props.st.survivors[mover].room
    pathPick.value = pathPickFor(props.st, room, perkHand.value.map((c) => c.card), pickHandCard)
    ownPick = true
  } else if (ownPick) {
    pathPick.value = null
    ownPick = false
  }
})
onBeforeUnmount(() => ownPick && (pathPick.value = null))


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
  // Breakout's own hint says to use the board, so it isn't counted here
  if (s.t === 'turnStart') return buttons.value.reduce((n, b) => n + (b.perk === 'breakout' ? 0 : b.choices.filter((c) => !here(perkAct(b.perk, c))).length), 0)
  if (s.t === 'phantasmChoice') return [...hagMoves.value.map((i) => ({ t: 'phantasm', teleport: true, i }) as Action), { t: 'phantasm', teleport: true } as Action].filter((a) => !here(a)).length
  return 0
})
</script>

<template>
  <!-- wide screens: inside the side panel, in its place (GameScreen's #side-dock) -->
  <Teleport to="#side-dock" :disabled="!wide" defer>
  <transition name="dock">
    <aside v-if="open" class="dock" :class="{ killer: killerSide, collapsed }" role="dialog" aria-live="assertive">
      <header @click="collapsed && (collapsed = false)">
        <Mini class="face" :class="killerSide ? 'aura-killer' : 'aura-survivor'" :src="asset(face)" />
        <div class="head-text">
          <p class="eyebrow">⚡ {{ kind === 'spark' || kind === 'phantasm' || kind === 'guess' ? 'Power' : kind === 'purge' ? 'Passive' : kind === 'replace' ? 'Predator' : 'Perk' }} — ถึงคราวตัดสินใจ</p>
          <strong class="who">{{ who }}</strong>
          <p v-if="collapsed" class="why"><BpText :text="summary" /></p>
          <!-- the moment, with the mini of whom it is about (not when that is the one deciding) -->
          <p v-else-if="step.t === 'offer' && windowLabel(st, step.w)" class="why">
            <FaceLabel :st="st" :who="windowWho(step.w) === step.owner ? null : windowWho(step.w)" :text="windowLabel(st, step.w)" />
          </p>
        </div>
        <!-- narrow screens only: on wide ones the side panel's tab folds it, with the panel -->
        <button
          v-if="!wide"
          type="button"
          class="fold"
          :aria-expanded="!collapsed"
          :title="collapsed ? `เปิดแผงตัดสินใจ — ${summary}` : 'พับไปด้านขวา เพื่อดูกระดาน'"
          @click.stop="collapsed = !collapsed"
        >
          {{ collapsed ? '◂ ตัดสินใจ' : 'พับ ▸' }}
        </button>
      </header>


      <p v-if="boardCount" class="board-hint">🎯 เลือกบนแผนที่ได้เลย — คลิกวงที่กระพริบ ({{ boardCount }} ตัวเลือก)</p>

      <!-- several perks of one owner at the same moment: pick which to use first (p.16) -->
      <template v-if="step.t === 'offer' && offerList.length > 1">
        <p class="lead">มี {{ offerList.length }} Perk ที่ใช้ได้ในจังหวะนี้ — ใช้ใบไหนก่อนก็ได้ ใบที่เหลือจะถามต่อ (หน้า 16)</p>
        <p class="small">{{ perkPicked ? 'เลือกของ Perk นี้ — คลิก Perk อีกครั้งเพื่อเปลี่ยน' : '👆 เลือก Perk ที่จะใช้ก่อน' }}</p>
        <div
          v-for="o in offerList"
          :key="o.perk"
          class="perk boxed pickable"
          :class="{ picked: perkPicked === o.perk, dim: perkPicked && perkPicked !== o.perk }"
          role="button"
          tabindex="0"
          @click="choosePerk(o.perk)"
          @keydown.enter="choosePerk(o.perk)"
        >
          <img v-if="perkImage(o.perk)" class="thumb small zoomable" title="คลิกเพื่อขยาย" @click="zoom" :src="asset(perkImage(o.perk))" :alt="PERKS[o.perk].name" />
          <div>
            <h3>
              {{ PERKS[o.perk].name }} <span class="cost"><BpText :text="cost(o.perk)" /></span>
            </h3>
            <p class="text small"><BpText :text="perkText(o.perk)" /></p>
            <!-- picked: a card from the hand below, or a survivor on the board (or a button here) -->
            <p v-if="perkPicked === o.perk && o.choices.some((c) => c.card)" class="hand-hint">👇 เลือกการ์ดจากไพ่บนมือด้านล่าง แล้วกดยืนยัน</p>
            <p v-if="perkPicked === o.perk && o.choices.some((c) => !c.card && !here(perkAct(o.perk, c)))" class="board-hint">🎯 คลิกเป้าหมายที่กระพริบบนแผนที่</p>
            <div v-if="perkPicked === o.perk" class="choices inline" @click.stop>
              <button
                v-for="(c, i) in o.choices.filter((c) => !c.card && here(perkAct(o.perk, c)))"
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
          <button v-if="handChoices.length" class="primary" :disabled="!cardPick" @click="confirmCard">
            <BpText :text="cardPick && activePerk ? `ยืนยัน: ${PERKS[activePerk].name} — ${perkChoiceLabel(st, activePerk, step.owner, step.w, cardPick)}` : 'เลือกการ์ดจากมือก่อน'" />
          </button>
          <button @click="act({ t: 'perk', perk: step.perk, use: false })">ไม่ใช้ทั้งหมด</button>
          <button class="quiet" @click="act({ t: 'perk', perk: step.perk, use: false, quiet: true })">ไม่ใช้ และไม่ต้องถามอีกในรอบนี้</button>
        </div>
      </template>

      <!-- a perk offered at its moment -->
      <template v-else-if="step.t === 'offer'">
        <div class="perk">
          <img v-if="perkImage(step.perk)" class="thumb zoomable" title="คลิกเพื่อขยาย" @click="zoom" :src="asset(perkImage(step.perk))" :alt="PERKS[step.perk].name" />
          <div>
            <h2>
              ใช้ {{ PERKS[step.perk].name }}? <span class="cost"><BpText :text="cost(step.perk)" /></span>
            </h2>
            <p class="text"><BpText :text="perkText(step.perk)" /></p>
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
        <!-- Lightborn / Open-Handed: the planned cards side by side — click the one to turn face up -->
        <div v-else-if="isLightborn" class="tinker">
          <p class="tinker-step"><BpText :text="openHanded ? 'คลิกการ์ดของฆาตกรที่จะเปิดหงาย' : 'คลิกการ์ดที่จะเปิดหงาย (+1 ▲)'" /></p>
          <div class="card-row">
            <button
              v-for="p in openHanded ? plannedCards : plannedCards.slice(0, 2)"
              :key="`l${p.i}`"
              class="card-btn planned lightborn"
              :disabled="!lightbornChoice(p.i)"
              @click="act({ t: 'perk', perk: activePerk!, use: true, choice: lightbornChoice(p.i)! })"
            >
              <img :src="asset(faceUp(p.i) ? cardImage(p.card) : KILLER_CARD_BACK)" :alt="faceUp(p.i) ? cardLabel(p.card) : 'คว่ำ'" />
              <span>ใบที่ {{ p.i + 1 }} ({{ p.i === 0 ? 'ซ้าย' : p.i === 1 ? 'ขวา' : 'โบนัส' }}) · {{ !lightbornChoice(p.i) ? (p.played ? 'เล่นแล้ว' : 'เปิดแล้ว') : faceUp(p.i) ? CARD_NAMES[p.card] : 'คว่ำอยู่' }}</span>
            </button>
          </div>
        </div>
        <template v-else-if="isGrip">
          <p class="hand-hint">👇 เลือกการ์ด 1–2 ใบจากไพ่บนมือด้านล่าง — แผนที่จะไฮไลต์ผู้รอดชีวิตที่โดน</p>
          <p v-if="gripPick.length" class="small">
            โดน: {{ gripHits.length ? gripHits.map((s) => st.survivors[s].name).join(', ') : 'ไม่มีใคร — เลือกการ์ดสีอื่น' }}
          </p>
        </template>
        <p v-else-if="handChoices.length" class="hand-hint">👇 เลือกการ์ดจากไพ่บนมือด้านล่าง{{ MOVE_PERKS.includes(step.perk) ? ' — ชี้เพื่อดูเส้นทาง' : '' }}</p>
        <!-- a survivor moved along a path (Dark Devotion, Infectious Fright): who, then where -->
        <template v-if="movesSomeone">
          <p class="board-hint">🎯 คลิกผู้รอดชีวิตบนแผนที่ แล้วคลิกเส้นทาง — หรือเลือกด้านล่าง</p>
          <div class="who-row">
            <button v-for="t in moveTargets" :key="t" type="button" class="who-chip" :class="{ on: moveWho === t }" @click="moveWho = moveWho === t ? null : t">
              <FaceLabel :st="st" :who="t" :text="st.survivors[t].name" />
            </button>
          </div>
          <div v-if="moveWho !== null" class="choices">
            <button
              v-for="(c, i) in offerChoices.filter((c) => c.target === moveWho)"
              :key="i"
              class="primary"
              @mouseenter="hover(step.owner, c)"
              @mouseleave="hover(step.owner, null)"
              @click="act({ t: 'perk', perk: step.perk, use: true, choice: c })"
            >
              {{ pathLabel(st, c.path!, st.survivors[moveWho].room) }}
            </button>
          </div>
        </template>
        <div class="choices">
          <button v-if="isGrip" class="primary" :disabled="!gripChoice" @click="confirmGrip">
            <BpText :text="gripChoice ? `ยืนยัน: ${perkChoiceLabel(st, step.perk, step.owner, step.w, gripChoice)}` : 'เลือกการ์ดจากมือก่อน'" />
          </button>
          <button v-if="handChoices.length" class="primary" :disabled="!cardPick" @click="confirmCard">
            <BpText :text="cardPick ? `ยืนยัน: ${perkChoiceLabel(st, step.perk, step.owner, step.w, cardPick)}` : 'เลือกการ์ดจากมือก่อน'" />
          </button>
          <button
            v-for="(c, i) in offerChoices.filter((c) => !c.card && offerHere(c) && !isOppression && !isLightborn && !movesSomeone)"
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
        <p v-if="pickPerk" class="small">{{ perkPicked ? 'เลือกเป้าหมายของ Perk นี้ — คลิก Perk อีกครั้งเพื่อเปลี่ยน' : '👆 เลือก Perk ที่จะใช้ก่อน' }}</p>
        <div
          v-for="b in buttons"
          :key="b.perk"
          class="perk boxed"
          :class="{ pickable: pickPerk, picked: pickPerk && perkPicked === b.perk, dim: pickPerk && perkPicked && perkPicked !== b.perk }"
          :role="pickPerk ? 'button' : undefined"
          :tabindex="pickPerk ? 0 : undefined"
          @click="choosePerk(b.perk)"
          @keydown.enter="choosePerk(b.perk)"
        >
          <img v-if="perkImage(b.perk)" class="thumb small zoomable" title="คลิกเพื่อขยาย" @click="zoom" :src="asset(perkImage(b.perk))" :alt="PERKS[b.perk].name" />
          <div>
            <h3>
              {{ PERKS[b.perk].name }} <span class="cost"><BpText :text="cost(b.perk)" /></span>
            </h3>
            <p class="text small"><BpText :text="perkText(b.perk)" /></p>
            <!-- Breakout is a person and then a path: both are picked on the board, one at a time -->
            <template v-if="perkOpen(b.perk)">
            <p v-if="b.perk === 'breakout'" class="board-hint">🎯 คลิกเพื่อนที่บาดเจ็บบนแผนที่ แล้วเลือกเส้นทาง</p>
            <div v-else class="choices inline" @click.stop>
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
            </template>
          </div>
        </div>
        <button class="primary wide" @click="act({ t: 'continue' })">ไม่ใช้ perk — เปิดการ์ดแล้วเดิน</button>
      </template>

      <!-- Whispers: pay or set the card face up -->
      <template v-else-if="step.t === 'sparkChoice' && step.whispers">
        <p class="lead"><b>Whispers!</b> {{ st.survivors[step.s].name }} จ่าย 1 <BpIcon /> หรือวางการ์ดเคลื่อนที่หงายหน้า</p>
        <p class="text small">วางหงายหน้า = ทุกคน (รวมฆาตกร) เห็นการ์ดของคุณก่อนวางแผนของตัวเอง</p>
        <div class="choices">
          <button class="primary" @click="act({ t: 'spark', pay: true })">จ่าย 1 <BpIcon /> (มี {{ st.survivors[step.s].bp }} → เหลือ {{ st.survivors[step.s].bp - 1 }})</button>
          <button @click="act({ t: 'spark', pay: false })">ไม่จ่าย — วางการ์ดหงายหน้า</button>
        </div>
      </template>

      <!-- Carter's Spark: pay or take it -->
      <template v-else-if="step.t === 'sparkChoice' && step.grip">
        <p class="lead"><b>Dragon's Grip!</b> {{ st.survivors[step.s].name }} จ่าย 1 <BpIcon /> หรือบาดเจ็บ</p>
        <div class="choices">
          <button class="primary" @click="act({ t: 'spark', pay: true })">จ่าย 1 <BpIcon /> (มี {{ st.survivors[step.s].bp }} → เหลือ {{ st.survivors[step.s].bp - 1 }})</button>
          <button @click="act({ t: 'spark', pay: false })">ไม่จ่าย — บาดเจ็บ</button>
        </div>
      </template>
      <template v-else-if="step.t === 'sparkChoice'">
        <p class="lead">
          <b>Carter's Spark!</b> {{ st.survivors[step.s].name }} จ่าย 1 <BpIcon /> หรือ{{ st.survivors[step.s].madness ? 'บาดเจ็บ (มี Madness อยู่แล้ว)' : 'ติด Madness' }}
        </p>
        <p class="text small">Madness: ทอย Danger Die แทน Skill Check จนกว่าจะทอยล้มเหลว และทำให้ Bonus Turn ของ Doctor ถูกลง</p>
        <div class="choices">
          <button class="primary" @click="act({ t: 'spark', pay: true })">จ่าย 1 <BpIcon /> (มี {{ st.survivors[step.s].bp }} → เหลือ {{ st.survivors[step.s].bp - 1 }})</button>
          <button @click="act({ t: 'spark', pay: false })">ไม่จ่าย — {{ st.survivors[step.s].madness ? 'บาดเจ็บ' : 'ติด Madness' }}</button>
        </div>
      </template>

      <!-- a Phantasm Trap went off -->
      <template v-else-if="step.t === 'phantasmChoice'">
        <p class="lead">
          <b>Phantasm Trap!</b> {{ st.survivors[step.s].name }} ทอยได้ <b>{{ step.face }}</b> ที่ {{ roomName(st, step.room) }}
        </p>
        <div class="choices">
          <button @click="act({ t: 'phantasm', teleport: false })">ไม่วาร์ป — รับ +1 <BpIcon /></button>
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
            <button v-if="here({ t: 'phantasm', teleport: true })" @click="act({ t: 'phantasm', teleport: true })">วาร์ปเฉย ๆ ({{ step.face }} <BpIcon />)</button>
          </template>
          <p v-else class="small"><BpIcon /> ไม่พอวาร์ป (มี {{ st.killer.bp }}, ต้องใช้ {{ step.face }})</p>
        </div>
      </template>

      <!-- Predator: pick a new card -->
      <template v-else-if="step.t === 'replaceCard'">
        <p class="lead">Predator ทิ้งการ์ดของ {{ st.survivors[step.s].name }} — เลือกการ์ดใบใหม่ (คว่ำไว้)</p>
        <p class="hand-hint">👇 เลือกการ์ดจากไพ่บนมือด้านล่าง — ชี้เพื่อดูเส้นทาง</p>
        <button class="primary" :disabled="!cardPick" @click="confirmCard">{{ cardPick ? `ยืนยัน: วาง ${CARD_NAMES[cardPick.card!]} (คว่ำ)` : 'เลือกการ์ดจากมือก่อน' }}</button>
      </template>

      <!-- The Plague's Vile Purge: which perk it covers, or (in a locker) which it comes off -->
      <template v-else-if="step.t === 'purgeChoice'">
        <p class="lead">
          <img class="purge-token" :src="asset(VILE_PURGE_IMAGE)" alt="" />
          <template v-if="step.mode === 'cover'"><b>Vile Purge!</b> {{ st.survivors[step.s].name }} ต้องเอาไปปิด Perk 1 อัน — Perk ที่ถูกปิดใช้ไม่ได้</template>
          <template v-else><b>ซ่อนใน Locker</b> — {{ st.survivors[step.s].name }} เอา Vile Purge ออกได้ 1 อัน: เลือก Perk ที่จะเปิดคืน</template>
        </p>
        <p class="text small">มี {{ (st.survivors[step.s].purged ?? []).length }}/3 — อันที่ 3 ทิ้งทั้งหมดและบาดเจ็บ (บาดเจ็บอยู่แล้ว = ฆาตกรได้ Sacrifice Progress)</p>
        <div class="purge-perks">
          <button v-for="p in purgeOptions(st, step.s, step.mode)" :key="p" type="button" class="purge-perk" @click="openPurge(p)">
            <img v-if="perkImage(p)" :src="asset(perkImage(p))" :alt="PERKS[p].name" />
            <strong>{{ PERKS[p].name }}</strong>
            <small>👆 ดูแล้วยืนยัน</small>
          </button>
        </div>
      </template>

      <!-- Crowd Control: the survivors buy it off together, or the killer sets the card -->
      <template v-else-if="step.t === 'crowdPay'">
        <p class="lead">
          <b>Crowd Control!</b> {{ st.killer.name }} เลือก <b>{{ st.survivors[step.s].name }}</b>
        </p>
        <p class="text small">ผู้รอดชีวิตรวมกันจ่าย 2 <BpIcon /> (ใครจ่ายก็ได้) — ถ้าไม่จ่าย {{ st.killer.name }} จะเลือกการ์ดเคลื่อนที่ที่ {{ st.survivors[step.s].name }} ต้องวางรอบนี้ (เปิดหน้า)</p>
        <!-- online: each player puts in their own ▲; at 2, anyone confirms -->
        <template v-if="online">
          <div class="pledges">
            <div v-for="(sv, s) in st.survivors" :key="s" class="pledge" :class="{ on: (pledges[s] ?? 0) > 0, waiting: pledges[s] === null }">
              <Mini class="face" :src="asset(survivorMini(st, s))" :alt="sv.name" />
              <span class="pledge-who">{{ sv.name }} <span class="muted">({{ sv.bp }} <BpIcon />)</span></span>
              <span v-if="!controls(st, s) || !sv.bp" class="pledge-state"><BpText :text="pledgeLabel(s)" /></span>
              <span v-else class="pledge-btns">
                <button
                  v-for="n in [0, 1, 2]"
                  :key="n"
                  type="button"
                  :class="{ picked: pledges[s] === n }"
                  :disabled="n > sv.bp || pledgeTotal - (pledges[s] ?? 0) + n > 2"
                  @click="act({ t: 'crowdPledge', s, n })"
                >
                  <BpText :text="n ? `ลง ${n} ▲` : 'ไม่ลง'" />
                </button>
              </span>
            </div>
          </div>
          <p class="pledge-total" :class="{ full: pledgeTotal === 2 }">รวม {{ pledgeTotal }}/2 <BpIcon /></p>
          <div class="choices">
            <!-- nothing goes through by itself: the chosen survivor's player confirms, paying or refusing -->
            <button v-if="!controls(st, step.s)" class="primary" disabled>
              <BpText :text="pledgeTotal === 2 ? `ครบ 2 ▲ — รอ ${st.survivors[step.s].name} ยืนยัน` : pledgesIn ? `รอ ${st.survivors[step.s].name} ยืนยันไม่จ่าย` : `รอทุกคนตัดสินใจ (รวม ${pledgeTotal}/2 ▲)`" />
            </button>
            <button v-else-if="pledgeTotal === 2" class="primary crowd-pay" @click="act({ t: 'crowdPay', pay: pledgedPay(pledges) })">ยืนยัน: จ่าย 2 <BpIcon /></button>
            <button v-else-if="pledgesIn" class="primary crowd-refuse" @click="act({ t: 'crowdPay', pay: [] })">ยืนยัน: ไม่จ่าย — ให้ {{ st.killer.name }} เลือกการ์ด</button>
            <button v-else class="primary" disabled>รอทุกคนตัดสินใจ (อีก {{ 2 - pledgeTotal }} <BpIcon /> ถึงจะจ่ายได้)</button>
          </div>
          <p class="small muted">{{ st.survivors[step.s].name }} เป็นคนกดยืนยัน — ก่อนนั้นทุกคนเปลี่ยนที่ตัวเองลงได้</p>
        </template>
        <template v-else-if="canPay">
          <p class="small">คลิกผู้รอดชีวิตเพื่อใส่ 1 <BpIcon /> ของเขา (คลิกซ้ำ = 2 <BpIcon />) — รวมให้ครบ 2 <BpIcon /></p>
          <div class="payers">
            <button
              v-for="(sv, s) in st.survivors"
              :key="s"
              type="button"
              class="payer"
              :class="{ on: paid(s) > 0 }"
              :disabled="sv.bp <= paid(s) || payPick.length >= 2"
              @click="addPay(s)"
            >
              <Mini class="face" :src="asset(survivorMini(st, s))" :alt="sv.name" />
              <span class="payer-name">{{ sv.name }}</span>
              <span class="payer-bp">{{ sv.bp - paid(s) }} <BpIcon /><b v-if="paid(s)"> −{{ paid(s) }}</b></span>
            </button>
          </div>
          <div class="choices">
            <button class="primary crowd-pay" :disabled="payPick.length < 2" @click="act({ t: 'crowdPay', pay: payPick })">
              <BpText :text="payPick.length < 2 ? `เลือกอีก ${2 - payPick.length} ▲` : 'ยืนยัน: จ่าย 2 ▲'" />
            </button>
            <button v-if="payPick.length" @click="payPick = []">ล้างที่เลือก</button>
          </div>
        </template>
        <div v-if="!online" class="choices">
          <button class="crowd-refuse" @click="act({ t: 'crowdPay', pay: [] })">ไม่จ่าย — ให้ {{ st.killer.name }} เลือกการ์ด</button>
        </div>
      </template>
      <template v-else-if="step.t === 'crowdPick'">
        <p class="lead"><b>Crowd Control</b> — เลือกการ์ดที่ {{ st.survivors[step.s].name }} ต้องวางรอบนี้</p>
        <p class="text small">การ์ดจะวางแบบเปิดหน้า ผู้รอดชีวิตคนนี้ไม่ต้องวางแผนเอง</p>
        <p class="hand-hint">👇 เลือกจากมือของ {{ st.survivors[step.s].name }} ด้านล่าง — ชี้เพื่อดูเส้นทาง</p>
        <button class="primary" :disabled="!cardPick" @click="confirmCard">{{ cardPick ? `ยืนยัน: ให้วาง ${CARD_NAMES[cardPick.card!]}` : 'เลือกการ์ดจากมือก่อน' }}</button>
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
        <RollDice :st="st" :key-holders="keyHolders" :can-keep="rollMine && !keyWaiting.length" @act="act" />
        <div v-for="b in buttons" :key="b.perk" class="perk boxed">
          <img v-if="perkImage(b.perk)" class="thumb small zoomable" title="คลิกเพื่อขยาย" @click="zoom" :src="asset(perkImage(b.perk))" :alt="PERKS[b.perk].name" />
          <div>
            <h3>
              <FaceLabel :st="st" :who="b.owner" :text="`${ownerLabel(st, b.owner)}: ${PERKS[b.perk].name}`" /> <span class="cost"><BpText :text="cost(b.perk)" /></span>
            </h3>
            <p class="text small"><BpText :text="perkText(b.perk)" /></p>
            <button v-for="(c, n) in b.choices" :key="n" class="primary" @click="act({ t: 'perk', perk: b.perk, use: true, choice: c })">ใช้ — <BpText :text="perkChoiceLabel(st, b.perk, b.owner, b.w, c)" /></button>
          </div>
        </div>
        <div class="choices">
          <!-- someone else's roll: each helper on this device passes on it here -->
          <button v-for="s in passers" :key="`p${s}`" @click="act({ t: 'passRoll', s })">
            <FaceLabel :st="st" :who="s" :text="`${st.survivors[s].name} ไม่ช่วย — ไม่ใช้กุญแจ / Perk`" />
          </button>
          <template v-if="rollMine">
            <p v-if="keyWaiting.length" class="small waiting-key">
              ⏳ รอ {{ keyWaiting.map((s) => st.survivors[s].name).join(', ') }} ตัดสินใจว่าจะช่วย (กุญแจ / Perk) หรือไม่
            </p>
            <p v-if="step.keep" class="small">Bond: คลิกลูกเต๋าที่จะเก็บ 1 ลูก</p>
            <button v-else :disabled="keyWaiting.length > 0" @click="act({ t: 'acceptRoll' })">ไม่ใช้ — รับผลนี้</button>
          </template>
          <p v-else class="small muted">รอ {{ st.survivors[step.ctx.s].name }} รับผลทอย</p>
        </div>
      </template>
    </aside>
  </transition>
  </Teleport>
  <!-- Vile Purge: the perk picked, big with its text, before it is covered (or freed) -->
  <Teleport to="body">
    <div v-if="purgePick && step.t === 'purgeChoice'" class="purge-modal" role="dialog" aria-modal="true" @click.self="purgePick = null">
      <div class="purge-box">
        <img v-if="perkImage(purgePick)" :src="asset(perkImage(purgePick))" :alt="PERKS[purgePick].name" />
        <div class="purge-info">
          <p class="eyebrow"><img class="purge-token" :src="asset(VILE_PURGE_IMAGE)" alt="" />Vile Purge — {{ step.mode === 'cover' ? 'Perk ที่จะถูกปิด' : 'Perk ที่จะเปิดคืน' }}</p>
          <h2>{{ PERKS[purgePick].name }} <span class="cost"><BpText :text="PERKS[purgePick].cost ? `${PERKS[purgePick].cost} ▲` : 'ฟรี'" /></span></h2>
          <p class="text"><BpText :text="perkText(purgePick)" /></p>
          <p class="muted small"><BpText :text="PERKS[purgePick].when" /></p>
          <p class="small warn-line">{{ step.mode === 'cover' ? 'ปิดแล้วใช้ Perk นี้ไม่ได้ จนกว่าจะซ่อนใน Locker เพื่อเอา Vile Purge ออก' : 'Perk นี้จะใช้ได้อีกครั้ง' }}</p>
          <div class="choices">
            <button class="primary" @click="confirmPurge">{{ step.mode === 'cover' ? `ยืนยัน: ปิด ${PERKS[purgePick].name}` : `ยืนยัน: เปิด ${PERKS[purgePick].name} คืน` }}</button>
            <button @click="purgePick = null">เลือกใบอื่น</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
  <Teleport to="body">
    <div v-if="zoomed" class="perk-zoom" role="dialog" aria-modal="true" @click="zoomed = null">
      <img :src="zoomed" alt="" />
      <p>คลิกที่ไหนก็ได้เพื่อย่อกลับ</p>
    </div>
  </Teleport>
  <CardHand v-if="open && !collapsed && perkHand.length" :cards="perkHand" :label="handLabel" :prompt="handPrompt" @pick="pickHandCard" @hover="hoverHandCard" />
  <CardHand
    v-if="open && !collapsed && gripHand.length"
    :cards="gripHand"
    label="Dragon's Grip — เลือกการ์ดที่จะทิ้ง"
    prompt="Dragon's Grip — ทิ้งการ์ด 1–2 ใบ"
    @pick="pickGrip"
    @hover="() => {}"
  />
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


.perk {
  display: grid;
  grid-template-columns: 76px 1fr;
  gap: 0.7rem;
  align-items: start;
}
/* several perks at once: each box is picked first */
.perk.boxed.pickable {
  cursor: pointer;
  transition:
    border-color 0.15s,
    opacity 0.15s,
    transform 0.15s;
}
.perk.boxed.pickable:hover {
  border-color: rgb(var(--glow) / 0.9);
  transform: translateX(-2px);
}
.perk.boxed.picked {
  border-color: #ffe9b0;
  box-shadow: 0 0 14px rgb(255 214 140 / 0.45);
}
.perk.boxed.dim {
  opacity: 0.5;
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
.zoomable {
  cursor: zoom-in;
}
/* a perk's card opened big, over everything */
.perk-zoom {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 0.6rem;
  padding: 1.5rem;
  background: rgb(4 5 7 / 0.92);
  cursor: zoom-out;
}
.perk-zoom img {
  max-width: min(92vw, 520px);
  max-height: 84vh;
  object-fit: contain;
  border-radius: 12px;
  box-shadow:
    0 0 0 2px rgb(255 233 176 / 0.6),
    0 24px 60px rgb(0 0 0 / 0.85);
}
.perk-zoom p {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted);
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
/* who to move (Dark Devotion, Infectious Fright): a row of faces */
.who-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.4rem;
}
.who-chip {
  padding: 0.25rem 0.55rem;
  border-radius: 99px;
}
.who-chip.on {
  box-shadow: 0 0 0 2px var(--blood-bright);
  background: rgb(255 60 60 / 0.15);
}
/* Vile Purge: the perk picked, big, before the confirm */
.purge-modal {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background: rgb(4 5 7 / 0.88);
}
.purge-box {
  display: flex;
  gap: 1.4rem;
  align-items: center;
  max-width: min(860px, 94vw);
  padding: 1.2rem;
  border: 1px solid #b6e36a;
  border-radius: 14px;
  background: linear-gradient(180deg, rgb(16 20 12 / 0.98), rgb(8 9 10 / 0.98));
  box-shadow: 0 0 40px rgb(182 227 106 / 0.25), 0 24px 60px rgb(0 0 0 / 0.85);
}
.purge-box > img {
  width: min(300px, 38vw);
  border-radius: 10px;
  flex: none;
}
.purge-info {
  display: grid;
  gap: 0.5rem;
}
.purge-info h2 {
  margin: 0;
}
.purge-info .text {
  font-size: 1.05rem;
  line-height: 1.55;
}
.warn-line {
  color: #d9f7a8;
}
@media (max-width: 700px) {
  .purge-box {
    flex-direction: column;
  }
}
/* Vile Purge: the perks to pick from, as cards */
.purge-token {
  width: 28px;
  height: 28px;
  vertical-align: middle;
  margin-right: 0.35rem;
  border-radius: 4px;
}
.purge-perks {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}
.purge-perk {
  display: grid;
  justify-items: center;
  gap: 0.25rem;
  padding: 0.4rem;
  border-radius: 10px;
}
.purge-perk img {
  width: 100%;
  aspect-ratio: 0.72;
  object-fit: cover;
  border-radius: 6px;
}
.purge-perk:hover {
  box-shadow: 0 0 0 2px #b6e36a, 0 0 14px rgb(182 227 106 / 0.6);
}
.purge-perk small {
  color: #b6e36a;
}
/* Crowd Control online: one row per survivor, what they put in */
.pledges {
  display: grid;
  gap: 0.3rem;
}
.pledge {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.45rem;
  border-radius: 10px;
  background: rgb(255 255 255 / 0.04);
}
.pledge .face {
  width: 34px;
  height: 34px;
}
.pledge.on {
  box-shadow: inset 0 0 0 1px var(--blood-bright);
}
.pledge.waiting .pledge-state {
  color: var(--muted, #999);
  font-style: italic;
}
.pledge-who {
  font-size: 0.85rem;
}
.pledge-state {
  font-size: 0.8rem;
  color: #ff8a80;
}
.pledge-btns {
  display: flex;
  gap: 0.2rem;
}
.pledge-btns button {
  padding: 0.2rem 0.45rem;
  font-size: 0.76rem;
}
.pledge-btns button.picked {
  background: var(--blood);
  color: #fff;
}
.pledge-total {
  margin: 0.3rem 0;
  text-align: center;
  font-weight: 700;
}
.pledge-total.full {
  color: #ff8a80;
}
/* Crowd Control: the survivors putting in a ▲ each */
.payers {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.35rem;
}
.payer {
  display: grid;
  justify-items: center;
  gap: 0.15rem;
  padding: 0.4rem 0.2rem;
  border-radius: 10px;
}
.payer .face {
  width: 44px;
  height: 44px;
}
.payer.on {
  box-shadow: 0 0 0 2px var(--blood-bright), 0 0 12px rgb(255 60 60 / 0.5);
}
.payer-name {
  font-size: 0.78rem;
}
.payer-bp {
  font-size: 0.78rem;
  color: #ff8a80;
}
.payer-bp b {
  color: #fff;
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
.card-btn.lightborn {
  width: 112px;
  font-size: 0.8rem;
}
/* Lightborn: a card to pick lifts under the pointer */
.card-btn.lightborn:not(:disabled):hover {
  transform: translateY(-4px);
  border-color: var(--blood-bright);
  box-shadow: 0 0 14px rgb(255 40 40 / 0.45);
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

/* Wide screens: inside the side panel, in its place — no longer floating. */
@media (min-width: 981px) {
  .dock {
    position: static;
    width: auto;
    max-height: none;
    overflow: visible;
  }
  .dock.collapsed {
    right: 0;
    width: auto;
    padding: 0.5rem 0.35rem;
    border-right: none;
    border-radius: 10px 0 0 10px;
  }
  .dock.collapsed header {
    flex-direction: column;
    gap: 0.4rem;
  }
  .dock.collapsed .head-text {
    display: none;
  }
  .dock.collapsed .fold {
    align-self: center;
    padding: 0.4rem 0.2rem;
    writing-mode: vertical-rl;
  }
}
/* Screens narrower than 16:9 (a tablet), where it floats over the map: its own background is
   see-through, what is on it stays solid (as the side panel, GameScreen); solid again under the
   pointer, to read. */
@media (min-width: 981px) and (max-aspect-ratio: 1777/1000) {
  .dock {
    background: rgb(12 13 17 / 0.42);
    text-shadow: 0 1px 3px rgb(0 0 0 / 0.95);
    transition: background 0.2s;
  }
  .dock:hover {
    background: rgb(14 15 19 / 0.97);
  }
  .dock :is(header, .lead, .board-hint, .hand-hint, .small, h3, .text) {
    background-color: rgb(12 13 17 / 0.88);
    border-radius: 6px;
  }
  .dock header {
    padding: 0.3rem;
  }
  .dock .perk.boxed {
    background: rgb(20 18 26 / 0.92);
  }
  .dock :deep(button:disabled) {
    opacity: 1;
    filter: none;
    color: var(--muted);
    background: #121317;
  }
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
