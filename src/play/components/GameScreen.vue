<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { muted, setChase, sfx, startHeartbeat, stopChase, stopHeartbeat, type ChaseLayer } from '../../sound'
import { anyMoves, boardOf, survivorInteractions, CARD_NAMES, charlotteRoom, isGreat, perkChoices, PROGRESS_MAX, roomName, SACRIFICE_TO_WIN, succeeded, touchingPaths, victorRoom } from '../engine/engine'
import type { Die, GameState, ItemUse, LogEntry, MoveCard, RollContext } from '../engine/types'
import { clearFx, flash, fx, showAction, showBanner, showDice, showFinale, showPerk, showSacrifice, showStarts, type DiceShow, type SkillVerdict } from '../fx/bus'
import { CastBuilder } from '../casts'
import { fxSound } from '../fx/audio'
import { pathPick, pathPickLabel } from '../pathPick'
import { openHands } from '../hands'
import CardHand, { type HandCard } from './CardHand.vue'
import { canUndo, controls, dispatch, myTurn, online, quitGame, undo } from '../game'
import { PERKS } from '../engine/perks'
import { asset } from '../../i18n'
import { KILLER_PLAYER, actorsOf } from '../engine/seats'
import { closeOnlineGame, isHost, leaveRoom, pingColors, returnToLobby, roomSettings, session } from '../online/session'
import { pingHex } from '../online/pingColors'
import { canPing, pingArmed, pingWait } from '../pings'
import { timeoutActions } from '../online/timeout'
import type { InspectTarget } from '../inspect'
import { decisionFocus } from '../focus'
import { STEP_NAME, boardActionKeys, perkPicked, boardActions, boardTargets, powerMode as isPowerMode, stepKind, undyingCards, undyingPaths, type BoardAction, type BoardModes } from '../boardActions'
import { BEAR_TRAP_IMAGE, GUARD_IMAGE, PHASE_TH, PROP_IMAGE, ROLL_TITLE, cardImage, killerMini, playerOf, survivorMini } from '../labels'
import SoundSettings from '../../components/SoundSettings.vue'
import ActionPanel from './ActionPanel.vue'
import ActionReveal from './ActionReveal.vue'
import FinaleReveal from './FinaleReveal.vue'
import SacrificeReveal from './SacrificeReveal.vue'
import StartPlacement from './StartPlacement.vue'
import { SEEN, firstTime, gameKey, startMinis, startsRolled } from '../intro'
import BannerHost from './BannerHost.vue'
import Board from './Board.vue'
import ChoiceMenu from './ChoiceMenu.vue'
import DetailModal from './DetailModal.vue'
import DiceModal from './DiceModal.vue'
import EndSummary from './EndSummary.vue'
import PerkPrompt from './PerkPrompt.vue'
import PerkReveal from './PerkReveal.vue'
import Planning from './Planning.vue'
import RoundSummary from './RoundSummary.vue'
import StatusPanel from './StatusPanel.vue'
import SyncBadge from './SyncBadge.vue'
import BpText from '../../components/BpText.vue'

const props = defineProps<{ st: GameState }>()

// ---------- what the screen shows ----------
// The engine resolves an action at once. While that action's perk cards and dice play, the
// screen keeps showing the state from before it, so a result never shows before its roll; then
// it shows the new state and the board animates what happened.

const view = shallowRef<GameState>(props.st)

/** The dice of a roll that waited for a decision, already shown on screen. */
let pendingShown: string | null = null

watch(
  () => props.st,
  (st, prev) => {
    if (!prev || st.log.length < prev.log.length) {
      // Undo: show it straight away.
      clearFx()
      view.value = st
      return
    }
    const fresh = st.log.slice(prev.log.length)
    const casts = new CastBuilder(prev, st)
    // the track as it stood before each event: only a rise is shown (Breakdown lowers it)
    let sacrificed = prev.sacrifice
    for (const [n, e] of fresh.entries()) {
      const ev = e.ev
      // a player's action (a card played, an attack, a pallet, the power): shown before the result
      const cast = casts.of(e)
      if (cast) showAction(cast)
      if (ev?.k === 'item') {
        const said = fresh.slice(n + 1).find((x) => x.text && x.who === ev.s)
        showPerk({ item: ev.item, owner: ev.s, detail: said?.text.replace(`${st.survivors[ev.s].name} `, '') ?? '' })
      }
      // The perk's card, big: the log line after "—" says what it did.
      if (ev?.k === 'sacrifice') {
        // the last one is the finale's, not a card of its own
        if (ev.total > sacrificed && ev.total < SACRIFICE_TO_WIN) showSacrifice(ev.total, ev.total - sacrificed)
        sacrificed = ev.total
      }
      if (ev?.k === 'gameOver') showFinale(ev.winner)
      if (ev?.k === 'perk') showPerk({ perk: ev.perk, owner: ev.who, detail: e.text.split(' — ').slice(1).join(' — ') })
      // A roll already shown while it waited for a decision, and kept as it was, isn't shown twice.
      if (e.dice && ev?.k === 'roll' && JSON.stringify(e.dice) !== pendingShown)
        showDice({
          dice: e.dice,
          title: st.survivors[ev.s].name,
          ...diceResult(ev.ctx, e.dice),
          ...skillCheck(ev.ctx, e.dice, rollProgress(prev, ev.ctx, ev.prop, fresh.slice(n + 1))),
          icon: rollIcon(st, ev.ctx, ev.s, ev.target),
        })
    }
    const leftover = casts.leftover()
    if (leftover) showAction(leftover)
    // A roll waiting on a decision (Iron Will, a key, Bond): roll it on screen first, then ask.
    const step = st.step
    if (step.t === 'roll') {
      const sig = JSON.stringify(step.dice)
      if (sig !== pendingShown) {
        pendingShown = sig
        const res = step.keep ? { outcome: 'Bond — เลือกเก็บ 1 ลูก', tone: 'good' as const } : diceResult(step.ctx.k, step.dice)
        showDice({
          dice: step.dice,
          title: st.survivors[step.ctx.s].name,
          outcome: `${res.outcome} — รอการตัดสินใจ`,
          tone: res.tone,
          ...skillCheck(step.ctx.k, step.dice, rollProgress(st, step.ctx.k, 'prop' in step.ctx ? step.ctx.prop : undefined, [])),
          icon: rollIcon(st, step.ctx.k, step.ctx.s, 'target' in step.ctx ? step.ctx.target : undefined),
        })
      }
    } else if (prev.step.t !== 'roll') pendingShown = null
    if (!fx.perks.length && !fx.dice.length && !fx.finale) view.value = st
  },
)

watch(
  () => fx.perks.length + fx.dice.length + (fx.finale ? 1 : 0),
  (n) => {
    if (n === 0) view.value = props.st
  },
)

// ---------- the minis' start-room rolls, played on the map ----------

watch(
  () => props.st,
  (st) => {
    if (fx.starts || !startsRolled(st) || !firstTime(SEEN, gameKey(st))) return
    showStarts(startMinis(st))
  },
  { immediate: true },
)
/** The minis the rolls have not placed yet are off the map. */
const startHidden = computed(() => (fx.starts ? fx.starts.minis.slice(fx.starts.shown).map((m) => m.key) : undefined))
const startArrive = computed(() => (fx.starts && fx.starts.shown > 0 ? fx.starts.minis[fx.starts.shown - 1].key : undefined))

// ---------- board targets ----------

/** The killer chose "use power": the power's targets are now on the board. */
const powerOn = ref(false)
/** Undying (The Blight): using it, a step at a time — the card, the path, then the prop. */
const undyingOn = ref(false)
const undyingCard = ref<MoveCard | null>(null)
const undyingRoom = ref<string | null>(null)
// Undying and Yamaoka's Haunting share these steps: starting either clears them.
watch([undyingOn, () => powerOn.value], () => ((undyingCard.value = null), (undyingRoom.value = null)))
// A new card: the room it reaches is picked at once when there is only one (or when the card was
// picked by clicking one of its paths, which names the room already).
watch(undyingCard, (card) => {
  const kind = stepKind(view.value, modes)
  if (!card || !kind) return (undyingRoom.value = null)
  const rooms = undyingPaths(view.value, card, kind).map((r) => r.to)
  if (undyingRoom.value && rooms.includes(undyingRoom.value)) return
  undyingRoom.value = rooms.length === 1 ? rooms[0] : null
})
/** Bear trap placement when the supply is empty: the path picked, waiting for which trap to move. */
const trapPath = ref<string | null>(null)
/** The Hillbilly picked the card to discard for the chainsaw (in the panel). */
const powerCard = ref<MoveCard | null>(null)
/** A survivor clicked a pallet: the paths to drop it on are now the board targets. */
const palletMode = ref<string | null>(null)
/** Map / Rainbow Map: survivor picking up to 3 face-down tiles. */
const revealing = ref<{ s: number; props: string[] } | null>(null)
/** Calm Spirit: the crow to send to another room. */
const calmCrow = ref<string | null>(null)
/** Ace in the Hole: the prop in Ace's room, waiting for the one to swap with. */
const aceFirst = ref<string | null>(null)
/** Fogwise: the path whose wall or pallet moves, waiting for where it goes. */
const fogwiseFrom = ref<string | null>(null)
/** A survivor's item whose target is being picked on the board. */
const itemPick = ref<number | null>(null)
/** Breakout: the wounded survivor picked, waiting for where to move them. */
const breakoutTarget = ref<number | null>(null)
/** Diversion: the killer was clicked, his paths are the targets. */
const diversion = ref(false)
/** A fork's icon was clicked: its moves, waiting for the room to go to. */
const forkMoves = shallowRef<BoardAction[] | null>(null)
/** Oppression: generators picked on the board, waiting for confirm. */
const multiPick = ref<string[]>([])
const oppressing = computed(() => {
  const s = view.value.step
  return s.t === 'offer' && s.perk === 'oppression' && myTurn.value
})
/** The generators picked, in the engine's own order, as the choice to send. */
const oppressionChoice = computed(() => {
  const s = view.value.step
  if (s.t !== 'offer' || !multiPick.value.length) return null
  const want = [...multiPick.value].sort().join()
  // The engine lists each pair one way round only, so match on the set, not the order clicked.
  return perkChoices(view.value, 'oppression', s.owner, s.w).find((c) => [c.prop, c.prop2].filter(Boolean).sort().join() === want) ?? null
})
/** The picked generators in words: "Main Garage 3→2 · Barn 2→1". */
const oppressionPicks = computed(() =>
  multiPick.value
    .map((id) => view.value.props.find((p) => p.id === id)!)
    .map((p) => `${roomName(view.value, p.room!)} ${p.progress}→${p.progress - 1}`)
    .join(' · '),
)
function confirmOppression() {
  const choice = oppressionChoice.value
  if (!choice) return
  if (dispatch({ t: 'perk', perk: 'oppression', use: true, choice })) {
    sfx.select()
    multiPick.value = []
  }
}

const modes: BoardModes = { powerOn, trapPath, palletMode, revealing, calmCrow, aceFirst, fogwiseFrom, breakoutTarget, itemPick, powerCard, forkMoves, multiPick, undyingOn, undyingCard, undyingRoom, diversion }

watch(
  () => view.value.step,
  () => {
    powerOn.value = false
    undyingOn.value = false
    trapPath.value = null
    powerCard.value = null
    palletMode.value = null
    calmCrow.value = null
    aceFirst.value = null
    fogwiseFrom.value = null
    breakoutTarget.value = null
    diversion.value = false
    perkPicked.value = null
    itemPick.value = null
    forkMoves.value = null
    multiPick.value = []
    undyingCard.value = null
    undyingRoom.value = null
  },
)

/** Choosing where the power goes: after "use power", or Territorial Imperative's extra use. */
const powerMode = computed(() => isPowerMode(view.value, modes))

/** While a perk or power is being decided, the board points at who and where. */
const boardFocus = computed(() => {
  // Breakout: the friend being moved, and every path they could take
  if (breakoutTarget.value !== null) {
    const st = view.value
    const s = breakoutTarget.value
    const moves = anyMoves(st, s)
    return { survivors: [s], killer: false, rooms: [st.survivors[s].room], paths: moves.map((m) => m.path.id), dests: moves.map((m) => m.to) }
  }
  // Diversion: the killer, and the paths he can be sent along
  if (diversion.value) {
    const st = view.value
    const s = st.step
    const paths = s.t === 'survivorInteract' ? survivorInteractions(st, s.s).flatMap((i) => (i.k === 'diversion' ? [i.path] : [])) : []
    const dests = paths.map((id) => {
      const p = boardOf(st).paths.find((x) => x.id === id)!
      return p.a === st.killer.room ? p.b : p.a
    })
    return { survivors: [], killer: true, rooms: [st.killer.room], paths, dests }
  }
  // A fork's icon was clicked: dim everything but the rooms it can lead to, so the two or three
  // choices stand out (the icon itself is one spot for all of them).
  const fork = forkMoves.value
  if (fork) {
    const st = view.value
    const s = st.step
    const from = s.t === 'survivorMove' || s.t === 'anyMove' ? st.survivors[s.s].room : st.killer.room
    return { survivors: [], killer: false, rooms: [from], paths: [fork[0].key.slice(5)], dests: fork.flatMap((a) => (a.dest ? [a.dest] : [])) }
  }
  // Undying: the killer's room, and what the step is about — the rooms the card reaches, or the
  // one room its prop is being picked in.
  const kind = stepKind(view.value, modes)
  if (kind) {
    const st = view.value
    const base = { survivors: [], killer: true, rooms: [st.killer.room] }
    if (undyingRoom.value) return { ...base, rooms: [st.killer.room, undyingRoom.value], paths: [], dests: [undyingRoom.value] }
    const cards = undyingCard.value ? [undyingCard.value] : undyingCards(st, kind)
    const reach = cards.flatMap((c) => undyingPaths(st, c, kind))
    return { ...base, paths: reach.flatMap((r) => r.paths), dests: reach.map((r) => r.to) }
  }
  return decisionFocus(view.value, powerMode.value)?.focus ?? null
})

/**
 * Online: whether the screen as it is held (`view`) is waiting on this device. `view` trails the
 * newest state while dice, perk cards and the board play, so `myTurn` can already be true (or
 * still false) for what the panels show. Anything that picks which panel to show, or lights
 * targets, goes by this — else, for a moment, the player who is up next sees the panel of the
 * one who just moved. `myTurn` stays for what must react at once (the "your turn" cues).
 */
// (and not while the minis are still being placed on the map: nobody is asked anything yet)
const viewTurn = computed(() => !fx.starts && (!online.value || actorsOf(view.value).includes(online.value.seat)))

/** Everything clickable on the board now, and the shapes the board takes them in. */
const actions = computed(() => boardActions(view.value, modes))
// Online, only the player the game waits on gets clickable targets.
const targets = computed(() => {
  const t = viewTurn.value ? boardTargets(actions.value) : boardTargets([])
  // a hand of cards is out (planning, a bonus turn): its paths pick a card
  const pp = pathPick.value
  if (pp && viewTurn.value) {
    for (const [id, card] of Object.entries(pp.paths)) t.paths[id] ??= pathPickLabel(card)
    for (const [id, card] of Object.entries(pp.rooms)) t.rooms[id] ??= pathPickLabel(card)
  }
  return t
})
/** What the board already offers: the side panels leave these out and point at the board. */
const onBoard = computed(() => (viewTurn.value ? boardActionKeys(actions.value) : new Set<string>()))

/** Online planning: what this device has already sent, while the others finish. */
const myPlanDone = computed(() => {
  const st = view.value
  const o = online.value
  if (!o?.seat || st.step.t !== 'planSurvivors') return null
  if (o.seat === KILLER_PLAYER) return st.killerDraft ? `คุณวางการ์ดแล้ว: ${st.killerDraft.map((c) => CARD_NAMES[c]).join(' → ')}` : null
  const mine = st.survivors.flatMap((sv, i) => (st.handPlayers[sv.hand] === o.seat && st.planDraft?.[i] ? [`${sv.name} — ${CARD_NAMES[st.planDraft![i]!]}`] : []))
  return mine.length ? `คุณวางการ์ดแล้ว: ${mine.join(' · ')}` : null
})

/** The cards this device has sent, to show them with the undo button: each with whose it is. */
const myPlanCards = computed<{ card: MoveCard; sub: string }[]>(() => {
  const st = view.value
  const o = online.value
  if (!o?.seat || st.step.t !== 'planSurvivors') return []
  if (o.seat === KILLER_PLAYER) return (st.killerDraft ?? []).map((card, i) => ({ card, sub: i === 0 ? 'ใบซ้าย' : 'ใบขวา' }))
  return st.survivors.flatMap((sv, i) => (st.handPlayers[sv.hand] === o.seat && st.planDraft?.[i] ? [{ card: st.planDraft[i]!, sub: sv.name.split(' ')[0] }] : []))
})

/** Take this device's confirmed plan back, to pick again (until the last plan is in). */
function undoPlan() {
  const st = view.value
  const o = online.value
  if (!o?.seat) return
  if (o.seat === KILLER_PLAYER) dispatch({ t: 'unplanKiller' })
  else {
    const hand = st.handPlayers.indexOf(o.seat)
    if (hand >= 0) dispatch({ t: 'unplanHand', hand })
  }
  sfx.click()
}

/** Online: who the game is waiting on, for the side panel. */
const waitingOn = computed(() => {
  const o = online.value
  if (!o || viewTurn.value || fx.starts) return null
  const st = view.value
  const names = actorsOf(st).map((p) => {
    const seat = session.data?.seats[String(p)]
    const chars = p === 1 ? [st.killer.name] : st.survivors.filter((_, i) => st.handPlayers[st.survivors[i].hand] === p).map((sv) => sv.name)
    return `ผู้เล่น ${p}${seat ? ` (${seat.name})` : ''} — ${chars.join(' + ')}`
  })
  return names
})

/** Several actions on one spot: a small menu at the click. */
const menu = ref<{ actions: BoardAction[]; x: number; y: number } | null>(null)
let pointer = { x: 0, y: 0 }

function onSpot(key: string) {
  const found = actions.value.filter((a) => a.key === key)
  // A fork's icon with moves to different rooms: pick the room on the board next.
  const dests = new Set(found.map((a) => a.dest))
  if (found.length > 1 && found.every((a) => a.dest) && dests.size === found.length) {
    forkMoves.value = found
    sfx.click()
    return
  }
  if (forkMoves.value && key.startsWith('room:')) forkMoves.value = null
  // a token to place (a Guard, an Afterpiece, a crow) is always picked from the chooser, even when
  // only one can go there: a click on the room shouldn't place one the player never chose
  if (found.length === 1 && !found[0].icon) found[0].run()
  else if (found.length) menu.value = { actions: found, x: pointer.x + 8, y: pointer.y + 8 }
}

function onPath(id: string) {
  const pp = pathPick.value
  if (pp?.paths[id] && !actions.value.some((a) => a.key === `path:${id}`)) return pp.pick(pp.paths[id])
  onSpot(`path:${id}`)
}
const onProp = (id: string) => onSpot(`prop:${id}`)
function onRoom(id: string) {
  const pp = pathPick.value
  if (pp?.rooms[id] && !actions.value.some((a) => a.key === `room:${id}`)) return pp.pick(pp.rooms[id])
  onSpot(`room:${id}`)
}
const onInteract = (key: string) => onSpot(key.startsWith('s:') || key === 'killer' || key === 'victor' ? key : `prop:${key}`)

/** The mode the board is in, for the bar above it (with a way out). */
const modeBar = computed(() => {
  if (palletMode.value) return { text: 'เลือกเส้นทางที่เชื่อมกับห้องเพื่อทิ้ง Pallet (คลิกวงบนแผนที่)', cancel: () => (palletMode.value = null) }
  if (calmCrow.value) return { text: 'Calm Spirit: คลิกห้องที่จะส่ง Crow ไป', cancel: () => (calmCrow.value = null) }
  if (aceFirst.value)
    return view.value.step.t === 'killerInteract'
      ? { text: 'Iron Maiden: คลิก Hook ที่จะสลับกับ Locker นี้', cancel: () => (aceFirst.value = null) }
      : { text: 'Ace in the Hole: คลิก prop ในห้องติดกันที่จะสลับด้วย', cancel: () => (aceFirst.value = null) }
  if (fogwiseFrom.value) return { text: 'Fogwise: คลิกเส้นทางว่างที่เรืองแสงเพื่อวางกำแพง/Pallet', cancel: () => (fogwiseFrom.value = null) }
  if (perkPicked.value && (view.value.step.t === 'survivorInteract' || view.value.step.t === 'killerInteract'))
    return {
      text: perkPicked.value === 'iron_maiden' ? 'Iron Maiden: คลิก Locker ว่างที่กระพริบบนแผนที่ แล้วคลิก Hook ว่างที่จะสลับด้วย' : `${PERKS[perkPicked.value].name}: คลิกเป้าหมายที่กระพริบบนแผนที่`,
      cancel: () => (perkPicked.value = null),
    }
  if (breakoutTarget.value !== null) {
    // Breakout, or a killer perk that moves a survivor (Dark Devotion, Infectious Fright)
    const s = view.value.step
    const name = s.t === 'offer' ? PERKS[s.perk].name : 'Breakout'
    return { text: `${name}: ย้าย ${view.value.survivors[breakoutTarget.value].name} — คลิกเส้นทางบนแผนที่`, cancel: () => (breakoutTarget.value = null) }
  }
  if (trapPath.value) return { text: 'Bear Trap หมดมือ: คลิก Bear Trap บนแผนที่ที่จะย้ายมา', cancel: () => (trapPath.value = null) }
  if (itemPick.value !== null) return { text: 'เลือกเป้าหมายของ item บนแผนที่', cancel: () => (itemPick.value = null) }
  if (forkMoves.value)
    return {
      text: `ทางแยก: คลิกห้องที่จะไปบนแผนที่ — ${forkMoves.value.map((a) => roomName(view.value, a.dest!)).join(' · ')}`,
      cancel: () => (forkMoves.value = null),
    }
  // after the fork: picking its room comes first, and its way out goes back to the paths
  if (diversion.value) return { text: `Diversion: คลิกเส้นทางที่จะส่ง ${view.value.killer.name} ไป (ทางแยกจะให้เลือกห้องต่อ)`, cancel: () => (diversion.value = false) }
  // Undying: card → path → (room, at a fork) → prop; each step says what to do and goes back one
  const kind = stepKind(view.value, modes)
  if (kind) {
    const name = STEP_NAME[kind]
    const what = kind === 'haunt' ? 'ผู้รอดชีวิตที่ไม่บาดเจ็บ หรือ prop' : 'prop'
    const stop = () => (kind === 'haunt' ? (powerOn.value = false) : (undyingOn.value = false))
    if (!undyingCard.value) return { text: `${name}: เลือกการ์ดที่จะทิ้ง — จากไพ่บนมือ หรือคลิกเส้นทางบนแผนที่`, cancel: stop }
    const card = CARD_NAMES[undyingCard.value]
    // one step back: a room picked straight away (only one) goes back to the card
    const rooms = undyingPaths(view.value, undyingCard.value, kind).length
    if (!undyingRoom.value) return { text: `${name} (ทิ้ง ${card}): คลิกห้องที่จะไปบนแผนที่`, cancel: () => (undyingCard.value = null) }
    return {
      text: `${name} (ทิ้ง ${card}) ที่ ${roomName(view.value, undyingRoom.value)}: คลิก${what} ในห้องนั้น`,
      cancel: () => (rooms > 1 ? (undyingRoom.value = null) : (undyingCard.value = null)),
    }
  }
  return null
})

function trackPointer(e: PointerEvent) {
  pointer = { x: e.clientX, y: e.clientY }
}

function onUse(s: number, use: ItemUse) {
  if (use.k === 'reveal') {
    revealing.value = { s, props: [] }
    return
  }
  if (dispatch({ t: 'useItem', s, use })) sfx.select()
}

function confirmReveal() {
  const r = revealing.value
  if (r && dispatch({ t: 'useItem', s: r.s, use: { k: 'reveal', props: r.props } })) sfx.entity()
  revealing.value = null
}

// ---------- dice, flashes and summaries from the log ----------


/** Where each die's skill-check needle lands. Struggling free and danger dice count only a great. */
function skillCheck(ctx: RollContext['k'], dice: Die[], progress?: DiceShow['progress']): Pick<DiceShow, 'verdicts' | 'greatOnly' | 'action' | 'progress'> {
  const greatOnly = ctx === 'carry' || dice.every((d) => d.kind === 'danger')
  const verdicts = dice.map((d): SkillVerdict => (isGreat(d) ? 'great' : succeeded(d) && (!greatOnly || d.asSuccess) ? 'good' : 'fail'))
  return { verdicts, greatOnly, action: ROLL_TITLE[ctx], progress }
}

/** The icon in the middle of the skill check: what the survivor is working on, or up against. */
function rollIcon(st: GameState, ctx: RollContext['k'], s: number, target: number | undefined): DiceShow['icon'] {
  switch (ctx) {
    case 'repair':
      return { src: PROP_IMAGE.generator, round: false }
    case 'openGate':
      return { src: PROP_IMAGE.exitGate, round: false }
    case 'cleanse':
      return { src: PROP_IMAGE.totem, round: false }
    case 'search':
      return { src: PROP_IMAGE.locker, round: false }
    case 'trap':
      return { src: BEAR_TRAP_IMAGE, round: false }
    case 'heal':
    case 'botany':
      return { src: survivorMini(st, target ?? s), round: true }
    case 'selfCare':
    case 'innerFocus':
      return { src: survivorMini(st, s), round: true }
    case 'noMither':
      return { src: survivorMini(st, target ?? s), round: true }
    case 'deadHard':
    case 'breakdown':
      return { src: PROP_IMAGE.hook, round: false }
    case 'assassin':
      return { src: GUARD_IMAGE.assassin, round: false }
    default:
      // struggling, a hatchet, a phantasm trap, Overwhelming Presence: the killer
      return { src: killerMini(st), round: true }
  }
}

/**
 * The progress bar under a roll on a generator or an exit gate: from the event right after the
 * roll when it moved, otherwise as it stood before.
 */
function rollProgress(before: GameState, ctx: RollContext['k'], prop: string | undefined, after: LogEntry[]): DiceShow['progress'] {
  if (ctx !== 'repair' && ctx !== 'openGate') return undefined
  const nextRoll = after.findIndex((e) => e.ev?.k === 'roll')
  const next = nextRoll === -1 ? after : after.slice(0, nextRoll)
  const ev = next.find((e) => e.ev?.k === 'repair' || e.ev?.k === 'gate')?.ev
  if (ev?.k === 'repair') return { before: ev.progress - ev.add, after: ev.progress, max: PROGRESS_MAX }
  if (ev?.k === 'gate') return { before: ev.progress - 1, after: ev.progress, max: PROGRESS_MAX }
  const p = prop ? before.props.find((x) => x.id === prop) : undefined
  return p ? { before: p.progress, after: p.progress, max: PROGRESS_MAX } : undefined
}

function diceResult(ctx: RollContext['k'], dice: Die[]): Pick<DiceShow, 'outcome' | 'tone'> {
  const fail = !succeeded(dice[0])
  const great = isGreat(dice[0])
  switch (ctx) {
    case 'repair':
      return fail ? { outcome: 'พลาด! +0', tone: 'bad' } : great ? { outcome: 'ซ่อม +2!', tone: 'great' } : { outcome: 'ซ่อม +1', tone: 'good' }
    case 'openGate':
      return fail ? { outcome: 'พลาด!', tone: 'bad' } : { outcome: 'ประตู +1', tone: great ? 'great' : 'good' }
    case 'cleanse':
      return fail ? { outcome: 'ชำระไม่สำเร็จ', tone: 'bad' } : { outcome: 'ชำระสำเร็จ! +2 ▲', tone: great ? 'great' : 'good' }
    case 'heal':
      return fail ? { outcome: 'รักษาไม่สำเร็จ', tone: 'bad' } : { outcome: 'หายบาดเจ็บ!', tone: great ? 'great' : 'good' }
    case 'trap':
      return fail ? { outcome: 'ติดกับดัก!', tone: 'bad' } : { outcome: 'รอดจากกับดัก', tone: 'great' }
    case 'search':
      return fail ? { outcome: 'ถูกลากออกมา!', tone: 'bad' } : { outcome: 'รอด! Locker พัง', tone: great ? 'great' : 'good' }
    case 'carry':
      return dice.some(isGreat) ? { outcome: 'ดิ้นหลุด!', tone: 'great' } : { outcome: `หลุดไม่ได้ — แบกได้ ${dice.length} ช่อง`, tone: 'bad' }
    case 'hatchet':
      return fail ? { outcome: 'โดน Hatchet!', tone: 'bad' } : { outcome: 'หลบได้!', tone: 'great' }
    case 'botany':
    case 'selfCare':
      return fail ? { outcome: 'ไม่สำเร็จ', tone: 'bad' } : { outcome: 'หายบาดเจ็บ!', tone: 'great' }
    case 'phantasm': {
      const face = dice[0].face
      return face === 0 ? { outcome: 'ได้ 0 — Hag วาร์ปมาฟรี!', tone: 'bad' } : { outcome: `ได้ ${face} — Hag รับ ${face} ▲ หรือจ่าย ${face} ▲ เพื่อวาร์ป`, tone: face >= 4 ? 'great' : 'good' }
    }
    case 'overwhelm':
      return fail ? { outcome: 'item เสียเปล่า!', tone: 'bad' } : { outcome: 'ใช้ item ได้', tone: 'great' }
    case 'noMither':
      return fail ? { outcome: 'ไม่สำเร็จ — โดนโจมตี', tone: 'bad' } : { outcome: 'ไม่บาดเจ็บ! ฆาตกร +1 ▲', tone: 'great' }
    case 'assassin':
      return fail ? { outcome: 'โดน Assassin!', tone: 'bad' } : { outcome: 'หลบได้!', tone: 'great' }
    case 'breakdown':
      return fail ? { outcome: 'ไม่สำเร็จ', tone: 'bad' } : { outcome: 'ฆาตกรเสีย Sacrifice Progress!', tone: 'great' }
    case 'deadHard':
      return fail ? { outcome: 'ไม่สำเร็จ — ถูกแขวน', tone: 'bad' } : { outcome: 'หลุดรอดจากตะขอ!', tone: 'great' }
    case 'spineChill':
      return fail ? { outcome: 'ไม่สำเร็จ', tone: 'bad' } : { outcome: 'เดินหนีได้!', tone: 'great' }
    case 'deerstalker':
      return fail ? { outcome: 'ออกจากห้องไม่ได้!', tone: 'bad' } : { outcome: 'หลุดออกไปได้', tone: 'great' }
    case 'innerFocus': {
      const f = (f: number) => (f === 0 ? '💀' : String(f))
      return { outcome: `ได้ ${dice.map((d) => f(d.face)).join(' กับ ')} — เลือกห้องเริ่มต้น 1 ห้อง`, tone: 'good' }
    }
  }
}

/** The round whose summary is open (shown after cleanup). */
const summaryRound = ref<number | null>(null)

watch(
  () => view.value.log.length,
  (len, old) => {
    if (old === undefined || len <= old) return
    for (const e of view.value.log.slice(old)) {
      const ev = e.ev
      if (ev?.k === 'hook') flash('red')
      if (ev?.k === 'gatesPowered') {
        flash('gold')
        showBanner({ title: 'Exit Gate มีไฟแล้ว!', sub: 'ซ่อม Generator ครบ 4 เครื่อง — ไปเปิดประตู', tone: 'game' })
      }
      if (ev?.k === 'round' && ev.round > 1) summaryRound.value = ev.round - 1
    }
  },
)

// ---------- phase / turn banners ----------

const turnSignature = computed(() => `${view.value.phase}|${view.value.activeSurvivor}|${view.value.killer.revealedCount}|${view.value.round}`)

watch(turnSignature, (now, before) => {
  const st = view.value
  const [phase, active, revealed] = now.split('|')
  const [prevPhase, prevActive, prevRevealed] = (before ?? '').split('|')
  if (phase === 'planning' && prevPhase !== 'planning') showBanner({ title: `รอบ ${st.round}`, sub: 'วางแผน — เลือกการ์ดเคลื่อนที่', tone: 'game' }, { replace: true })
  if (phase === 'survivors' && active !== 'null' && active !== prevActive) {
    const s = Number(active)
    showBanner({
      title: `ตาของ ${st.survivors[s].name}`,
      sub: `${prevPhase !== 'survivors' ? 'ผู้รอดชีวิตเล่น · ' : ''}ผู้เล่น ${playerOf(st, s)}`,
      tone: 'survivor',
      image: survivorMini(st, s),
    }, { replace: true })
  }
  if (phase === 'killer' && revealed !== prevRevealed && Number(revealed) > 0) {
    const turn = Number(revealed)
    showBanner({
      title: turn === 1 ? `${st.killer.name} ออกล่า` : turn === 3 ? 'Bonus Turn' : `เทิร์นที่ ${turn}`,
      sub: turn === 1 ? 'ฆาตกรเล่น · ผู้เล่น 1' : `${st.killer.name} · ผู้เล่น 1`,
      tone: 'killer',
      image: killerMini(st),
    }, { replace: true })
  }
})

// ---------- online: telling a player the game is waiting on them ----------
// Online the others can't see a player's screen, so nobody knows they're the one being waited
// on. When the game turns to this device it plays the skill-check warning and a chime, shows a
// banner, makes the side panel glow, and — with the tab in the background — blinks the tab title
// and sends a system notification. While it stays this player's turn a gold pill at the top and a
// gold glow round the screen say so, and every 20 s without a move it all rings again.

/**
 * Online, this player's own movement cards, always at hand to look at (sunk, rising on hover)
 * while nothing asks for one; a hand to pick from takes its place when something does. The
 * killer's (The Blight holds two of each) are grouped with a count.
 */
const ownHand = computed<HandCard[]>(() => {
  const o = online.value
  const st = view.value
  if (!o?.seat || st.phase === 'setup' || st.phase === 'over') return []
  const cards = o.seat === KILLER_PLAYER ? st.killer.hand : (st.survivorHands[st.handPlayers.indexOf(o.seat)] ?? [])
  return [...new Set(cards)].map((card) => {
    const n = cards.filter((c) => c === card).length
    return { card, picked: false, ...(n > 1 ? { count: n } : {}) }
  })
})

/** Online, the game waits on this device now. */
const yourTurn = computed(() => !!online.value?.seat && myTurn.value && props.st.phase !== 'over')
/** Who else is waiting, for the pill ("ผู้เล่น 2, 4 รออยู่"). */
const othersWaiting = computed(() => {
  const n = session.data ? Object.keys(session.data.seats).length : 0
  return Math.max(0, n - 1)
})
const REMIND_MS = 20000
let remindTimer: number | null = null
function stopRemind() {
  if (remindTimer !== null) clearInterval(remindTimer)
  remindTimer = null
}

/** What this player is being asked, in a few words. */
const askWhat = computed(() => {
  const st = props.st
  const s = st.step
  switch (s.t) {
    case 'setupReveal':
      return 'เตรียมเกม — เปิด prop 1 อันบนแผนที่'
    case 'planSurvivors':
    case 'planKiller':
      return 'วางแผน — เลือกการ์ดเคลื่อนที่'
    case 'offer':
      return `ใช้ Perk ${PERKS[s.perk].name} ไหม?`
    case 'reaction':
      return `ใช้ ${s.item === 'flashlight' ? 'Flashlight' : 'Firecracker'} ไหม?`
    case 'roll':
      return controls(st, s.ctx.s) ? 'ผลทอยของคุณ — ตัดสินใจ' : `${st.survivors[s.ctx.s].name} ทอยลูกเต๋า — จะช่วยไหม?`
    case 'crowdPay':
      return `Crowd Control: ${st.survivors[s.s].name} — ลง ▲ ช่วยจ่ายไหม?`
    case 'crowdPick':
      return `Crowd Control: เลือกการ์ดให้ ${st.survivors[s.s].name}`
    case 'reignCard':
      return `Reign of Darkness: เลือกการ์ดของ ${st.survivors[s.s].name}`
    case 'reignPath':
      return `Reign of Darkness: เลือกเส้นทางของ ${st.survivors[s.s].name}`
    case 'innerFocus':
      return 'Inner Focus: เลือกห้องเริ่มต้นที่จะไป'
    case 'empathyAsk':
      return `Empathy: ${st.survivors[s.from].name} ขอ${s.mode === 'take' ? 'รับ ▲ จากคุณ' : 'ให้ ▲ คุณ'} — ยอมไหม?`
    default:
      return st.phase === 'killer' ? `ตาของ ${st.killer.name}` : st.activeSurvivor !== null ? `ตาของ ${st.survivors[st.activeSurvivor].name}` : 'ถึงตาคุณ'
  }
})

/** The side panel glows for a few seconds after the turn comes to this device. */
const nudge = ref(false)
let nudgeTimer: number | null = null
let titleTimer: number | null = null
const baseTitle = typeof document !== 'undefined' ? document.title : ''

function stopTitleBlink() {
  if (titleTimer !== null) clearInterval(titleTimer)
  titleTimer = null
  document.title = baseTitle
}

/** `again`: a reminder, the player hasn't moved yet. */
function notifyTurn(again = false) {
  // the skill-check warning cuts through anything; the chime after it says "you"
  fxSound.skillWarn()
  window.setTimeout(() => sfx.yourTurn(), 350)
  navigator.vibrate?.(again ? [200, 100, 200, 100, 200] : [120, 80, 120])
  if (!again) showBanner({ title: 'ถึงตาคุณแล้ว!', sub: askWhat.value, tone: 'game' })
  nudge.value = true
  if (nudgeTimer !== null) clearTimeout(nudgeTimer)
  nudgeTimer = window.setTimeout(() => (nudge.value = false), 4000)
  if (!document.hidden) return
  // in the background: blink the tab's title until the player comes back, and a system notice
  stopTitleBlink()
  let on = false
  titleTimer = window.setInterval(() => (document.title = (on = !on) ? '🔔 ถึงตาคุณ!' : baseTitle), 900)
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification('ดบดล — ถึงตาคุณแล้ว', { body: askWhat.value, icon: asset('icon.svg'), tag: 'dbdl-turn' })
    } catch {
      // some browsers only allow notifications from a service worker: the title still blinks
    }
  }
}

const onVisible = () => !document.hidden && stopTitleBlink()
// The browser asks for the notification permission only after a tap: ask on the first one.
const askPermission = () => {
  if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission()
}
onMounted(() => {
  document.addEventListener('visibilitychange', onVisible)
  if (online.value) window.addEventListener('pointerdown', askPermission, { once: true })
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener('pointerdown', askPermission)
  stopTitleBlink()
  stopRemind()
  if (nudgeTimer !== null) clearTimeout(nudgeTimer)
})

watch(yourTurn, (mine, was) => {
  if (mine && !was) notifyTurn()
  if (!mine) stopTitleBlink()
})
// Every move restarts the wait; a turn left alone rings again.
watch(
  [yourTurn, () => props.st],
  ([mine]) => {
    stopRemind()
    if (mine) remindTimer = window.setInterval(() => notifyTurn(true), REMIND_MS)
  },
  { immediate: true },
)

// ---------- online: the room's turn timer (room settings) ----------
// Each decision gets the room's time, counted from when it shows (after the animations before
// it). When it runs out, the player's own device answers what can be passed over (timeout.ts);
// a move or a plan stays theirs, and the whole room is told they are over time.

const turnLimit = computed(() => (online.value && props.st.phase !== 'over' ? roomSettings.value.timer : 0))
const fxBusy = computed(() => fx.dice.length > 0 || fx.perks.length > 0 || !!fx.finale || !!fx.starts || fx.boardBusy)
/** Changes with every new decision (or new set of players being waited on). */
const waitKey = computed(() => JSON.stringify([props.st.step, actorsOf(props.st)]))
const turnStarted = ref(Date.now())
const clock = ref(Date.now())
watch([waitKey, fxBusy], () => (turnStarted.value = clock.value = Date.now()))
let clockTimer: number | null = null
watch(
  turnLimit,
  (limit) => {
    if (clockTimer !== null) clearInterval(clockTimer)
    clockTimer = limit ? window.setInterval(() => (clock.value = Date.now()), 500) : null
  },
  { immediate: true },
)
onBeforeUnmount(() => clockTimer !== null && clearInterval(clockTimer))

/** Seconds left on this decision; null without a timer (or while animations play). */
const timeLeft = computed(() => {
  if (!turnLimit.value || fxBusy.value) return null
  return Math.max(0, Math.ceil(turnLimit.value - (clock.value - turnStarted.value) / 1000))
})

/** Who the room waits on, by name, for everyone else's timer pill. */
const waitingNames = computed(() => {
  const seats = session.data?.seats ?? {}
  return actorsOf(props.st).map((p) => seats[String(p)]?.name ?? `ผู้เล่น ${p}`)
})

let timedOut = ''
watch(timeLeft, (t) => {
  if (t !== 0 || !yourTurn.value || timedOut === waitKey.value) return
  timedOut = waitKey.value
  const acts = timeoutActions(props.st, online.value!.seat)
  if (acts.length) {
    showBanner({ title: 'หมดเวลา', sub: 'ตอบ "ไม่ใช้" ให้อัตโนมัติ', tone: 'game' })
    for (const a of acts) dispatch(a)
  } else showBanner({ title: 'หมดเวลาแล้ว!', sub: `ทั้งห้องกำลังรอ — ${askWhat.value}`, tone: 'game' })
})

// ---------- terror radius ----------

/** 2 = the killer is in the room, 1 = in a connected room, 0 = out of range. */
const terror = computed(() => {
  const st = view.value
  if (st.phase === 'over') return 0
  const k = st.killer.room
  const near = new Set(touchingPaths(st, k).flatMap((p) => [p.a, p.b]))
  const level = (room: string) => (room === k ? 2 : near.has(room) ? 1 : 0)
  const subjects =
    st.phase === 'survivors' && st.activeSurvivor !== null
      ? [st.activeSurvivor]
      : st.phase === 'killer'
        ? st.survivors.flatMap((sv, i) => (sv.status === 'board' || sv.status === 'locker' ? [i] : []))
        : []
  return Math.max(0, ...subjects.map((s) => level(st.survivors[s].room)))
})

const terrorBpm = computed(() => (terror.value === 2 ? 118 : 76))

// ---------- chase music ----------
// The killer standing on someone: his theme plays, and builds as the chase does — layer 2 when
// he is on a healthy survivor, 3 once they are wounded, 4 while he carries one away. Online only
// the two sides of that chase hear it; on one shared device the whole table does.

/** Online, whether this device is part of that chase (the killer, or the survivor's player). */
function hearsChase(subjects: number[]): boolean {
  const o = online.value
  if (!o?.seat || o.seat === KILLER_PLAYER) return true
  return subjects.some((s) => playerOf(view.value, s) === o.seat)
}

const chase = computed<ChaseLayer | null>(() => {
  const st = view.value
  if (st.phase === 'setup' || st.phase === 'over') return null
  // Victor is the killer too, so either mini standing on someone is a chase
  const rooms = [charlotteRoom(st), victorRoom(st)].filter((r): r is string => !!r)
  const carried = st.survivors.flatMap((sv, i) => (sv.status === 'carried' ? [i] : []))
  const cornered = st.survivors.flatMap((sv, i) => (sv.status === 'board' && rooms.includes(sv.room) ? [i] : []))
  const subjects = carried.length ? carried : cornered
  if (!subjects.length || !hearsChase(subjects)) return null
  if (carried.length) return 4
  return subjects.some((s) => st.survivors[s].wounded) ? 3 : 2
})

watch(chase, (layer) => setChase(layer), { immediate: true })

watch(
  [terror, muted],
  ([level]) => {
    if (level && !muted.value) startHeartbeat(terrorBpm.value)
    else stopHeartbeat()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  stopHeartbeat()
  stopChase()
  clearFx()
})

// ---------- details ----------

const inspecting = ref<InspectTarget | null>(null)

// ---------- the side panel, folded to a tab on the right edge (remembered per device) ----------
// Folded, the board takes its width (on a tablet the map then fills the screen). Choices on the
// board still work; the tab glows when a new decision comes, so a choice made only in the panel
// isn't missed.

function readSideFolded(): boolean {
  try {
    return localStorage.getItem('dbdl-side-folded') === '1'
  } catch {
    return false
  }
}
const sideFolded = ref(readSideFolded())
watch(sideFolded, (f) => {
  try {
    localStorage.setItem('dbdl-side-folded', f ? '1' : '0')
  } catch {
    // storage unavailable: it just isn't remembered
  }
})
/** A new step while folded: the tab pulses for a while. */
const sideNews = ref(false)
let sideNewsTimer: number | null = null
watch(
  () => view.value.step,
  () => {
    if (!sideFolded.value || !myTurn.value) return
    sideNews.value = true
    if (sideNewsTimer !== null) clearTimeout(sideNewsTimer)
    sideNewsTimer = window.setTimeout(() => (sideNews.value = false), 6000)
  },
)
watch(sideFolded, (f) => !f && (sideNews.value = false))

// ---------- secret choices (Tinkerer swaps a face-down card) ----------

const secretSeen = ref(false)
/** Who must hold the device alone: the killer swapping a hidden card, survivors picking one. */
const secretFor = computed<'killer' | 'survivors' | null>(() => {
  const s = view.value.step
  // Lightborn shows both planned cards to pick one: only one of them is turned face up
  if (s.t === 'offer' && (s.perk === 'tinkerer' || s.perk === 'zanshin_tactics' || s.perk === 'lightborn')) return 'killer'
  // Redeemer: the card discarded face down is picked first.
  if (s.t === 'killerInteract' && powerMode.value && view.value.killer.characterId === 'deathslinger') return 'killer'
  if (s.t === 'replaceCard') return 'survivors'
  return null
})
/** What the killer is about to do alone, for the curtain. */
const secretWhat = computed(() => {
  const s = view.value.step
  if (s.t === 'offer' && s.perk === 'lightborn') return 'เลือกการ์ดที่วางไว้ใบที่จะเปิดหงาย (Lightborn)'
  if (s.t === 'offer') return `เลือกเปลี่ยนการ์ดที่คว่ำไว้ (${s.perk === 'tinkerer' ? 'Tinkerer' : 'Zanshin Tactics'})`
  return 'เลือกการ์ดที่จะทิ้งแบบคว่ำ (Redeemer)'
})
// Online every player has their own screen: no hand-off curtain needed.
const secret = computed(() => !online.value && secretFor.value !== null && !secretSeen.value)
watch(
  () => view.value.step,
  () => (secretSeen.value = false),
)

// ---------- game over ----------

const over = computed(() => (view.value.step.t === 'gameOver' ? view.value.step.winner : null))
const showOver = ref(true)
watch(over, () => {
  showOver.value = true
  summaryRound.value = null
})

// ---------- full screen: hides the browser's bars, so the board gets bigger ----------

const canFullscreen = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen
const fullscreen = ref(typeof document !== 'undefined' && !!document.fullscreenElement)
const onFullscreen = () => (fullscreen.value = !!document.fullscreenElement)
onMounted(() => document.addEventListener('fullscreenchange', onFullscreen))
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', onFullscreen))

// ---------- 16:9 and wider: one column on the left instead of a bar on top ----------

const RAIL = '(min-width: 981px) and (min-aspect-ratio: 16/9)'
const railQuery = typeof matchMedia === 'function' ? matchMedia(RAIL) : null
const rail = ref(!!railQuery?.matches)
const onRail = (e: MediaQueryListEvent) => (rail.value = e.matches)
onMounted(() => railQuery?.addEventListener('change', onRail))
onBeforeUnmount(() => railQuery?.removeEventListener('change', onRail))

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen().catch(() => {})
}

function leave() {
  if (online.value) {
    // the host can end the game for everyone; others just leave the room (and can rejoin)
    if (isHost.value && confirm('จบเกมนี้สำหรับทุกคนแล้วกลับไปที่ห้อง?')) void closeOnlineGame()
    else if (!isHost.value && confirm('ออกจากห้อง? (กลับเข้ามาได้ด้วยรหัสห้องเดิม)')) leaveRoom()
    return
  }
  if (over.value || confirm('ออกจากเกมนี้? (เกมจะหายไป)')) quitGame()
}

/** The summary's "play again": online, this player back to the lobby (the room follows once
 * everyone is); on one device, a new game. */
function playAgain() {
  if (online.value) void returnToLobby()
  else quitGame()
}

const planning = computed(() => view.value.step.t === 'planSurvivors' || view.value.step.t === 'planKiller' || view.value.step.t === 'planStridor')
</script>

<template>
  <div class="game">
    <!-- On 16:9 screens there is no bar: the round goes on top of the player column and the
         controls under it (teleported into StatusPanel's two anchors). -->
    <header class="top">
      <span class="spacer" />
      <Teleport to="#rail-top" :disabled="!rail" defer>
        <div class="phase-row">
          <span class="phase">รอบ {{ view.round }}<span class="sep"> · </span><span class="phase-name">{{ PHASE_TH[view.phase] }}</span></span>
          <button v-if="over && !showOver" class="primary" @click="showOver = true">สรุปเกม</button>
        </div>
        <!-- online: the others are waiting on this device, or (with a timer) whom the room waits on —
             in the bar / the player column, never over the map -->
        <div v-if="yourTurn" class="your-turn" role="status" aria-live="polite">
          <span class="bell" aria-hidden="true">🔔</span>
          <b>ถึงตาคุณ</b>
          <span><BpText :text="askWhat" /></span>
          <small v-if="othersWaiting">· เพื่อนกำลังรอ</small>
          <b v-if="timeLeft !== null" class="clock" :class="{ low: timeLeft <= 10 }">⏱ {{ timeLeft ? `${timeLeft} วิ` : 'หมดเวลา' }}</b>
        </div>
        <!-- online with a turn timer: everyone else sees whom the room waits on, and their time -->
        <div v-else-if="timeLeft !== null && waitingNames.length" class="wait-clock" :class="{ over: timeLeft === 0 }" role="status">
          ⏱ {{ timeLeft ? `${timeLeft} วิ` : 'หมดเวลา' }} · รอ {{ waitingNames.join(', ') }}
        </div>
      </Teleport>
      <Teleport to="#rail-bottom" :disabled="!rail" defer>
      <div class="controls">
        <SyncBadge v-if="online" />
        <span v-if="online" class="room-tag">ห้อง {{ session.room?.code }} · {{ online.seat ? `ผู้เล่น ${online.seat}` : 'ผู้ชม' }}</span>
        <button v-else :disabled="!canUndo" title="ย้อนการกระทำล่าสุด" @click="undo">↶<span class="btn-text"> ย้อน</span></button>
        <!-- online: ping a spot on the map for everyone (or Alt+click on it) -->
        <button
          v-if="canPing"
          type="button"
          class="ping-btn"
          :class="{ on: pingArmed }"
          :style="{ '--c': pingHex(pingColors[session.me]) }"
          :disabled="!!pingWait"
          :aria-pressed="pingArmed"
          :title="pingArmed ? 'คลิกจุดบนแผนที่เพื่อปิง — กดอีกครั้งเพื่อยกเลิก' : 'ปิงจุดบนแผนที่ให้ทุกคนเห็น — หรือปิงได้ทันที: คลิกขวาบนแผนที่, คลิกปุ่มกลาง, ชี้แล้วกด Q (แท็บเล็ต: กดค้างบนแผนที่)'"
          @click="pingArmed = !pingArmed"
        >
          📍<b v-if="pingWait" class="ping-count">{{ pingWait }}</b><span v-else class="btn-text"> {{ pingArmed ? 'คลิกบนแผนที่' : 'ปิง' }}</span>
        </button>
        <button v-if="canFullscreen" :title="fullscreen ? 'ออกจากเต็มจอ' : 'เต็มจอ'" @click="toggleFullscreen">{{ fullscreen ? '🗗' : '⛶' }}</button>
        <SoundSettings />
        <button @click="leave">ออก</button>
      </div>
      </Teleport>
    </header>

    <main class="layout" :class="{ 'side-folded': sideFolded }">
      <div class="board-col" :style="{ '--aspect': String(boardOf(view).aspect) }">
        <!-- floating at the foot of the screen: showing a bar must not move or resize the board -->
        <div class="board-bars">
          <div v-if="modeBar" class="reveal-bar card">
            <span><BpText :text="modeBar.text" /></span>
            <button @click="modeBar.cancel()">ยกเลิก</button>
          </div>
          <div v-if="oppressing" class="reveal-bar card">
            <span v-if="!multiPick.length">Oppression: คลิก Generator ที่กระพริบบนแผนที่ 1–2 เครื่อง (แต่ละเครื่อง −1)</span>
            <span v-else>Oppression ({{ multiPick.length }}/2): <b>{{ oppressionPicks }}</b> — คลิกซ้ำเพื่อเอาออก</span>
            <button class="primary" :disabled="!oppressionChoice" @click="confirmOppression">ยืนยัน −1</button>
            <button @click="multiPick = []">ล้าง</button>
          </div>
          <div v-if="revealing" class="reveal-bar card">
            <span>{{ view.survivors[revealing.s].name }}: คลิกไทล์คว่ำที่จะเปิด ({{ revealing.props.length }}/3)</span>
            <button class="primary" :disabled="!revealing.props.length" @click="confirmReveal">เปิด</button>
            <button @click="revealing = null">ยกเลิก</button>
          </div>
        </div>
        <!-- the player tiles beside the map, on its left -->
        <div class="stage">
          <StatusPanel :st="view" :power-on="powerOn" @power="powerOn = $event" @use="onUse" @inspect="inspecting = $event" @pick="itemPick = $event" />
          <Board
            :st="view"
            :path-targets="targets.paths"
            :prop-targets="targets.flip"
            :interact-targets="targets.interact"
            :room-targets="targets.rooms"
            @room="onRoom"
            @pointerdown.capture="trackPointer"
            :picked="revealing?.props ?? (oppressing ? multiPick : undefined)"
            :focus="boardFocus"
            :hide-minis="startHidden"
            :arrive="startArrive"
            @interact="onInteract"
            @path="onPath"
            @prop="onProp"
            @inspect="inspecting = $event"
          />
        </div>
      </div>

      <aside v-show="!sideFolded" class="side" :class="{ nudge }">
        <!-- a perk decision (PerkPrompt), teleported here: while it is open it is the panel -->
        <div id="side-dock" />
        <Planning v-if="planning && viewTurn" :st="view" />
        <section v-else-if="waitingOn && !over" class="card waiting">
          <p v-if="myPlanDone" class="done-note">✓ คุณวางการ์ดแล้ว</p>
          <!-- the cards sent, face up to their own player, right by the button that takes them back -->
          <div v-if="myPlanCards.length" class="plan-sent" :aria-label="myPlanDone ?? undefined">
            <figure v-for="(c, i) in myPlanCards" :key="i">
              <img :src="asset(cardImage(c.card))" :alt="CARD_NAMES[c.card]" />
              <figcaption><b>{{ CARD_NAMES[c.card] }}</b>{{ c.sub }}</figcaption>
            </figure>
          </div>
          <button v-if="myPlanDone" type="button" class="undo-plan" @click="undoPlan">↶ ยกเลิก — เลือกการ์ดใหม่</button>
          <p class="muted small">กำลังรอ</p>
          <strong v-for="w in waitingOn" :key="w">{{ w }}</strong>
          <span class="dots" aria-hidden="true"><i /><i /><i /></span>
        </section>
        <!-- while the start-room rolls play on the map, nobody is asked anything: the panel stays empty
             (else the step waiting next — a killer perk at the start of planning — showed to everyone) -->
        <ActionPanel
          v-else-if="!over && !fx.starts"
          :st="view"
          :power-on="powerOn"
          :undying-on="undyingOn"
          :undying-card="undyingCard"
          :undying-room="undyingRoom"
          @undying-on="undyingOn = $event"
          @undying-card="undyingCard = $event"
          @undying-room="undyingRoom = $event"
          :trap-path="trapPath"
          :power-card="powerCard"
          :on-board="onBoard"
          @power-on="powerOn = $event"
          @trap-path="trapPath = $event"
          @power-card="powerCard = $event"
        />
      </aside>
    </main>

    <!-- terror radius: the screen edge pulses with the heartbeat -->
    <!-- one tab on the right edge, always in the same place: folds the side panel and opens it again -->
    <button type="button" class="side-tab" :class="{ news: sideFolded && (sideNews || nudge), open: !sideFolded }" :title="sideFolded ? 'เปิดแผงควบคุม' : 'พับแผงควบคุม — ขยายแผนที่'" @click="sideFolded = !sideFolded">
      <span aria-hidden="true">{{ sideFolded ? '◂' : '▸' }}</span>
      <span class="side-tab-text">{{ sideFolded ? 'เปิดแผงควบคุม' : 'พับแผงควบคุม' }}</span>
    </button>
    <!-- online: your own hand, to look at, while no hand to pick from is out -->
    <CardHand v-if="ownHand.length && openHands === 0" :cards="ownHand" label="มือของคุณ" passive />
    <!-- online: the others are waiting on this device — a gold edge (the notice is in the bar) -->
    <div v-if="yourTurn" class="your-turn-edge" aria-hidden="true" />
    <div v-if="terror" class="terror" :class="{ close: terror === 2 }" :style="{ '--beat': `${60 / terrorBpm}s` }" />
    <div v-if="fx.flash" :key="fx.flash.id" class="flash" :class="fx.flash.tone" @animationend="fx.flash = null" />

    <Teleport to="body">
      <button v-if="secret" class="secret" @click="secretSeen = true">
        <template v-if="secretFor === 'killer'">
          <strong>ส่งเครื่องให้ฆาตกร ({{ view.killer.name }})</strong>
          <span>ผู้รอดชีวิตห้ามดูจอ — {{ secretWhat }} · แตะเพื่อเริ่ม</span>
        </template>
        <template v-else>
          <strong>ส่งเครื่องให้ฝ่ายผู้รอดชีวิต</strong>
          <span>ฆาตกรห้ามดูจอ — เลือกการ์ดใบใหม่ (Predator) · แตะเพื่อเริ่ม</span>
        </template>
      </button>
    </Teleport>

    <BannerHost :paused="summaryRound !== null || !!over || fx.dice.length > 0 || fx.perks.length > 0 || !!fx.finale || !!fx.starts" />
    <ChoiceMenu v-if="menu" :st="view" :actions="menu.actions" :x="menu.x" :y="menu.y" @close="menu = null" />
    <PerkReveal :st="view" />
    <ActionReveal :st="view" />
    <SacrificeReveal :st="view" />
    <FinaleReveal :st="props.st" />
    <StartPlacement />
    <PerkPrompt :st="view" :hidden="secret || !!over || !viewTurn" :on-board="onBoard" />
    <DiceModal />
    <RoundSummary v-if="summaryRound !== null && !over && !fx.boardBusy && !fx.dice.length && !fx.perks.length" :st="view" :round="summaryRound" @close="summaryRound = null" />
    <DetailModal v-if="inspecting" :st="view" :target="inspecting" @close="inspecting = null" />
    <EndSummary v-if="over && showOver" :st="view" :winner="over" :online="!!online" @close="showOver = false" @again="playAgain" />
  </div>
</template>

<style scoped>
.game {
  min-height: var(--vh);
  display: flex;
  flex-direction: column;
}
.top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.7rem;
  padding: 0.3rem 0.75rem;
  border-bottom: 1px solid var(--line);
  background: rgb(7 8 10 / 0.88);
  position: sticky;
  top: 0;
  z-index: 10;
}
/* compact top-bar buttons: the height goes to the board */
.top button {
  padding: 0.25rem 0.65rem;
}
.phase {
  color: var(--blood-bright);
  font-family: var(--font-display);
}
.spacer {
  flex: 1;
}
.layout {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  align-items: start;
  /* on one column a short side panel must not leave the rows spread down the screen */
  align-content: start;
}
.board-col {
  position: relative;
  display: grid;
  gap: 0.6rem;
}
/* The player tiles on the left, the map beside them: as tall as the screen allows (the top bar
   and padding take about 4rem), narrower if the width runs out. */
.stage {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  justify-content: flex-start;
  min-width: 0;
}
.stage > .board {
  flex: 0 1 auto;
  min-width: 0;
  width: max(22rem, calc((var(--vh) - 4rem) * var(--aspect)));
}
@media (max-width: 980px) {
  /* one column: the map, then the tiles under it */
  .stage {
    flex-direction: column-reverse;
    align-items: stretch;
  }
  .stage > .board {
    width: 100%;
  }
}
.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}
/* the ping button wears the player's ping colour, and glows while the next click pings */
.ping-btn {
  border-color: var(--c);
}
.ping-count {
  margin-left: 0.2em;
  font-size: 0.8em;
}
.ping-btn.on {
  color: #111;
  background: var(--c);
  box-shadow: 0 0 12px var(--c);
}

/* the round and its button sit in the bar as if they weren't wrapped */
.phase-row {
  display: contents;
}
/* Wide screens (16:9 and wider): the board is limited by the height, so there is no bar on top:
   the round heads the player column on the left and the controls close it (teleported there),
   and the board takes the height. Narrower screens (16:10, iPad) are limited by the width: they
   keep the bar on top. */
@media (min-width: 981px) and (min-aspect-ratio: 16/9) {
  .top {
    display: none;
  }
  .phase-row {
    display: grid;
    justify-items: center;
    gap: 0.3rem;
    padding: 0.15rem 0 0.25rem;
    border-bottom: 1px solid var(--line);
  }
  .phase {
    text-align: center;
    font-size: 0.9rem;
  }
  .phase-name {
    font-size: 0.8rem;
  }
  .btn-text {
    display: none;
  }
  /* the controls in one row under the item slot */
  .controls {
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.3rem;
    padding-top: 0.35rem;
  }
  .controls > * {
    flex: 1 1 0;
  }
  .controls button {
    min-width: 0;
    padding: 0.3rem 0;
    font-size: 0.8rem;
  }
  .room-tag {
    flex-basis: 100%;
    font-size: 0.66rem;
    text-align: center;
  }
  .layout {
    flex: 1;
    min-width: 0;
  }
  .side {
    top: 0.5rem;
    max-height: calc(var(--vh) - 1rem);
  }
  /* no top bar to leave room for: only the padding */
  .stage > .board {
    width: max(22rem, calc((var(--vh) - 1.25rem) * var(--aspect)));
  }
}
/* online: while the game waits on this device, a pill at the top and a gold glow round the
   screen (under modals and the hand, over the map) */
.clock {
  margin-left: 0.3rem;
  padding: 0 0.45rem;
  border-radius: 99px;
  background: rgb(255 214 106 / 0.2);
  font-variant-numeric: tabular-nums;
}
.clock.low {
  background: var(--blood);
  color: #fff;
}
.wait-clock {
  padding: 0.25rem 0.8rem;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: rgb(10 12 18 / 0.9);
  color: var(--muted);
  font-size: 0.85rem;
  pointer-events: none;
  font-variant-numeric: tabular-nums;
}
.wait-clock.over {
  border-color: var(--blood-bright);
  color: #ffb3b3;
}
/* in the bar, or stacked in the player column on 16:9 screens */
.your-turn {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.15rem 0.5rem;
  padding: 0.4rem 0.8rem;
  border: 2px solid #ffd56a;
  border-radius: 12px;
  background: rgb(30 22 4 / 0.95);
  color: #fff3cf;
  font-size: 0.9rem;
  pointer-events: none;
  box-shadow: 0 0 22px rgb(255 200 90 / 0.65);
  animation: your-turn 1.4s ease-in-out infinite;
}
.your-turn b {
  font-family: var(--font-display);
  color: #ffd56a;
  letter-spacing: 0.04em;
}
.your-turn span:not(.bell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
.your-turn small {
  color: #e8cf8f;
}
.bell {
  display: inline-block;
  animation: ring 1.4s ease-in-out infinite;
  transform-origin: 50% 10%;
}
@keyframes your-turn {
  50% {
    box-shadow: 0 0 36px 6px rgb(255 200 90 / 0.9);
  }
}
@keyframes ring {
  0%,
  60%,
  100% {
    rotate: 0deg;
  }
  10%,
  30% {
    rotate: 18deg;
  }
  20%,
  40% {
    rotate: -18deg;
  }
}
.your-turn-edge {
  position: fixed;
  inset: 0;
  z-index: 14;
  pointer-events: none;
  box-shadow: inset 0 0 40px 6px rgb(255 200 90 / 0.55);
  animation: edge 1.4s ease-in-out infinite;
}
@keyframes edge {
  50% {
    box-shadow: inset 0 0 70px 14px rgb(255 200 90 / 0.8);
  }
}
@media (prefers-reduced-motion: reduce) {
  .your-turn,
  .your-turn-edge,
  .bell {
    animation: none;
  }
}
/* one panel: while a perk decision is open in it (#side-dock), the rest steps aside */
.side:has(#side-dock .dock) > :not(#side-dock) {
  display: none;
}
#side-dock:empty {
  display: none;
}
/* folded: the board takes the panel's column */
.layout.side-folded {
  grid-template-columns: minmax(0, 1fr);
}
/* the tab has the right edge to itself: the layout and the floating panels keep clear of it */
@media (min-width: 981px) {
  .layout {
    padding-right: 2.5rem;
  }
}
@media (max-width: 980px) {
  .side-tab {
    display: none;
  }
}
.side-tab {
  position: fixed;
  z-index: 17;
  right: 0;
  top: 50%;
  translate: 0 -50%;
  display: grid;
  justify-items: center;
  gap: 0.4rem;
  padding: 0.8rem 0.35rem;
  border: 1px solid var(--line-strong);
  border-right: none;
  border-radius: 10px 0 0 10px;
  background: rgb(14 15 19 / 0.95);
  box-shadow: -4px 0 18px rgb(0 0 0 / 0.6);
}
.side-tab-text {
  writing-mode: vertical-rl;
  font-size: 0.85rem;
  letter-spacing: 0.08em;
}
/* a new decision came while folded */
.side-tab.news {
  border-color: #ffd56a;
  color: #ffe9b0;
  animation: nudge 1s ease-in-out infinite;
}
/* online: the turn just came to this device — the panel pulses gold for a moment */
.side.nudge {
  border-radius: var(--radius);
  animation: nudge 1s ease-in-out 4;
}
@keyframes nudge {
  50% {
    box-shadow: 0 0 0 3px #ffd56a, 0 0 28px rgb(255 200 90 / 0.7);
  }
}
.side {
  display: grid;
  gap: 0.75rem;
  position: sticky;
  top: 4rem;
  max-height: calc(var(--vh) - 5rem);
  overflow-y: auto;
}
/* Screens narrower than 16:9 (a tablet): the map is limited by the width, so it takes the whole
   row and the side panel floats over its right edge (fold it to a tab to see that edge). */
@media (min-width: 981px) and (max-aspect-ratio: 1777/1000) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .side {
    position: fixed;
    z-index: 12;
    top: 3.4rem;
    right: 2.5rem;
    width: 320px;
    max-height: calc(var(--vh) - 4.2rem);
  }
  /* see-through, so the map shows under it; solid again while the pointer is on it, to read */
  .side > :deep(.card) {
    background: rgb(12 13 17 / 0.42);
    backdrop-filter: none;
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.35);
    text-shadow: 0 1px 3px rgb(0 0 0 / 0.95), 0 0 8px rgb(0 0 0 / 0.8);
    transition: background 0.2s;
  }
  .side:hover > :deep(.card) {
    background: rgb(12 13 17 / 0.9);
  }
  /* only the panel's own background is see-through: what is on it stays solid — the words on a
     dark backing, dimmed things (an empty slot, a button not ready) dark rather than faded */
  .side :deep(.card) :is(p, h2, h3, li, .hint, .board-hint, .stridor-note, .done-note) {
    background: rgb(12 13 17 / 0.88);
    border-radius: 6px;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }
  .side :deep(.card) :is(p, h2, h3) {
    padding-inline: 0.35rem;
  }
  .side :deep(button:disabled) {
    opacity: 1;
    filter: none;
    color: var(--muted);
    background: #121317;
  }
  .side :deep(img.empty) {
    opacity: 1;
    filter: grayscale(1) brightness(0.3);
  }
  /* planning's survivor tabs carry a see-through tint of their own: solid here */
  .side :deep(.tab) {
    background: rgb(16 17 21 / 0.92);
  }
  .side :deep(.tab.on) {
    background: rgb(52 44 26 / 0.95);
  }
}
@media (min-width: 981px) and (max-aspect-ratio: 1777/1000) {
  :global(body.hand-open .layout .side) {
    max-height: calc(var(--vh) - 3.4rem - 80px);
  }
}
/* The hand of cards rests sunk in the bottom-right corner (CardHand), its names showing: the
   panel stops above them (a raised hand covers its foot only while the pointer is on it). On a
   tablet a tap raises the hand (body.hand-raised) and the panel stops above all of it then. */
@media (min-width: 981px) {
  :global(body.hand-open .side) {
    max-height: calc(var(--vh) - 4rem - 70px);
  }
}
@media (min-width: 981px) and (min-aspect-ratio: 16/9) {
  :global(body.hand-open .side) {
    max-height: calc(var(--vh) - 1rem - 70px);
  }
}
@media (min-width: 981px) and (hover: none) {
  :global(body.hand-raised .side) {
    max-height: calc(var(--vh) - 4rem - 250px);
  }
}
/* The mode bars float at the foot of the screen instead of sitting above the map, so the board
   keeps its size and place while a mode comes and goes. Below the map on most screens, over its
   bottom edge on the tallest ones — never over the rooms a mode is asking about. */
.board-bars {
  position: fixed;
  /* above the hand of cards (z 15), so the way out of a mode is never buried */
  z-index: 16;
  bottom: 0.6rem;
  left: 50%;
  translate: -50%;
  display: grid;
  gap: 0.35rem;
  justify-items: center;
  width: max-content;
  max-width: calc(100vw - 2rem);
  /* only the bars themselves take clicks; the map underneath stays reachable */
  pointer-events: none;
}
.board-bars > * {
  pointer-events: auto;
}
/* on one column the hand of cards floats centred at the foot: the bars go above it */
@media (max-width: 980px) {
  :global(body.hand-open .board-bars) {
    bottom: 16.5rem;
  }
}
.reveal-bar {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  flex-wrap: wrap;
  padding: 0.45rem 0.7rem;
  background: rgb(10 11 14 / 0.92);
  box-shadow: 0 8px 28px rgb(0 0 0 / 0.7);
}
.room-tag {
  font-family: var(--font-display);
  color: var(--warn);
  letter-spacing: 0.05em;
}
.waiting {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.3rem;
}
.waiting p {
  margin: 0;
}
.plan-sent {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.4rem 0 0.5rem;
}
.plan-sent figure {
  margin: 0;
  width: 72px;
  text-align: center;
}
.plan-sent img {
  display: block;
  width: 100%;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.55);
}
.plan-sent figcaption {
  display: flex;
  flex-direction: column;
  margin-top: 0.25rem;
  font-size: 0.72rem;
  line-height: 1.25;
  color: var(--muted, #aaa);
}
.plan-sent figcaption b {
  color: #fff;
  font-size: 0.78rem;
}
.undo-plan {
  margin-bottom: 0.4rem;
  padding: 0.3rem 0.7rem;
  font-size: 0.82rem;
}
/* what this device already sent, so a player knows their own part is in */
.done-note {
  color: var(--ok);
  font-size: 0.82rem;
}
.dots {
  display: flex;
  gap: 0.3rem;
  margin-top: 0.3rem;
}
.dots i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--blood-bright);
  animation: blink 1.2s infinite;
}
.dots i:nth-child(2) {
  animation-delay: 0.2s;
}
.dots i:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes blink {
  0%,
  100% {
    opacity: 0.2;
  }
  40% {
    opacity: 1;
  }
}
.secret {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-content: center;
  gap: 0.6rem;
  text-align: center;
  background: rgb(4 5 7 / 0.97);
  border: none;
  font-size: 1.1rem;
}
.secret strong {
  font-size: 1.6rem;
  color: var(--blood-bright);
}
.terror {
  position: fixed;
  inset: 0;
  z-index: 15;
  pointer-events: none;
  box-shadow: inset 0 0 60px 10px rgb(200 10 20 / 0.45);
  animation: terror var(--beat) ease-in-out infinite;
}
.terror.close {
  box-shadow: inset 0 0 110px 30px rgb(220 10 20 / 0.6);
}
@keyframes terror {
  0%,
  45%,
  100% {
    opacity: 0.45;
  }
  12% {
    opacity: 1;
  }
  26% {
    opacity: 0.8;
  }
}
.flash {
  position: fixed;
  inset: 0;
  z-index: 30;
  pointer-events: none;
  animation: flash 0.9s ease-out forwards;
}
.flash.red {
  background: radial-gradient(circle, rgb(255 20 30 / 0.15), rgb(160 0 10 / 0.55));
}
.flash.gold {
  background: radial-gradient(circle, rgb(255 230 140 / 0.35), rgb(245 197 66 / 0.1));
}
.flash.white {
  background: rgb(255 255 255 / 0.4);
}
@keyframes flash {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .terror {
    animation: none;
  }
}
@media (max-width: 980px) {
  .layout {
    grid-template-columns: 1fr;
    padding: 0.5rem;
  }
  .side {
    position: static;
    max-height: none;
  }
}
</style>
