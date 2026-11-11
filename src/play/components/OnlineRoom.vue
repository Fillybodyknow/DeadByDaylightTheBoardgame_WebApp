<script setup lang="ts">
// An online room before the game, laid out as the PC game's lobby (one screen from the lobby to
// the start): the campfire behind, the players on their places (the killer's against the four
// survivors' — a click on an empty one takes it), this player's character big on the right, the
// chat and the one button that moves things on in the corner.
//   A rail on the left opens a panel at a time: ตัวละคร (the side in the lobby; the bans and the
//   character in the picks), อุปกรณ์ (the killer's power, the perks and the offerings), แผนที่ and
//   ห้อง (the room's settings, the ping colour, the bots, who watches).
//   The rules' order stays the room's (session.ts): the bans before the characters, every character
//   locked before the perks (Bloodweb deals from them all); a panel not open yet says why. The
//   offerings are set alongside the perks.
//   Survivors never see the killer's pick (unless the room shows it); Devout's perks stay each
//   player's own until the game.
import { computed, ref, watch } from 'vue'
import { killerById, survivorById } from '../../data'
import { asset } from '../../i18n'
import { sfx } from '../../sound'
import { fxSound } from '../fx/audio'
import { KILLER_PLAYER } from '../engine/seats'
import {
  addBot,
  backToLobby,
  botSeat,
  mayStart,
  removeBot,
  setBotPick,
  confirmPerks,
  lockBans,
  myBans,
  revealedBans,
  toggleBan,
  myPerkKeys,
  perkChars,
  perkHands,
  perkProblem,
  perkStage,
  perksWaiting,
  offeringsWaiting,
  offeringSlotsNow,
  myOfferingSide,
  myOfferings,
  myOfferingsDone,
  setOfferings,
  confirmOfferings,
  roomLoadouts,
  setLoadout,
  doubleId,
  isHost,
  kickMember,
  leaveRoom,
  lobbyBlocker,
  lockPicks,
  mapDone,
  mayPickBoard,
  me,
  memberList,
  mySeat,
  pickCharacter,
  pickStage,
  proceedToPick,
  roomSettings,
  session,
  setBoard,
  setDouble,
  setPingColor,
  pingColors,
  setReady,
  setSide,
  slotsOf,
  startable,
  startOnlineGame,
  bansDone,
  allLocked,
} from '../online/session'
import { cardChoices, ownPerk, printedOf, takenBy } from '../engine/loadout'
import { PERKS, type PerkId } from '../engine/perks'
import BanPicker from './BanPicker.vue'
import ChatPanel from './ChatPanel.vue'
import CharacterPicker from './CharacterPicker.vue'
import { PING_COLORS, pingHex } from '../online/pingColors'
import PerkLoadout from './PerkLoadout.vue'
import PcTip from './PcTip.vue'
import PerkRichText from '../../components/PerkRichText.vue'
import { offeringProblem, type OfferingId } from '../engine/offerings'
import MapPicker from './MapPicker.vue'
import RoomSettingsCard from './RoomSettingsCard.vue'
import SyncBadge from './SyncBadge.vue'
import SettingsDialog from '../../components/SettingsDialog.vue'
import VoiceButton from './VoiceButton.vue'
import LfgPostDialog from './LfgPostDialog.vue'
import { lobbyLacks } from '../online/lfg'
import { playableKillers } from '../online/settings'
import { openProfile } from '../../profile'
import { voice } from '../voice'
import { perkIcon, perkText, perkTone } from '../labels'

const data = computed(() => session.data!)
const code = computed(() => session.room?.code ?? '')
const inLobby = computed(() => data.value.phase === 'lobby')

// ---------- invite ----------

/**
 * The invite as The Entity would send it: the room, its code, then the link last (a chat app shows
 * its preview card under the message).
 */
function inviteText(): string {
  const link = `${location.origin}${location.pathname}#/online?room=${code.value}`
  const room = data.value.name || `ห้อง ${code.value}`
  return [
    '🩸 The Entity เรียกหาเจ้า…',
    `Trial “${room}” เปิดแล้ว — มาเป็นผู้รอดชีวิตที่หนีรอด หรือฆาตกรผู้ล่า ถ้าเจ้ากล้าพอ`,
    `🔑 รหัสห้อง ${code.value}${data.value.passwordHash ? ' · มีรหัสผ่าน ถามจากหัวห้อง' : ''}`,
    link,
  ].join('\n')
}

/** What was copied last, said for a moment on its button. */
const copied = ref<'' | 'link' | 'code'>('')
async function copy(what: 'link' | 'code') {
  try {
    await navigator.clipboard.writeText(what === 'code' ? code.value : inviteText())
    sfx.click()
    copied.value = what
    setTimeout(() => (copied.value = ''), 1500)
  } catch {
    // clipboard blocked: the code is on screen anyway
  }
}

// ---------- looking for players: a message with this room in the public chat (#/lfg) ----------

const lfgOpen = ref(false)
const lfgPosted = ref(false)
function openLfg() {
  sfx.click()
  lfgOpen.value = true
}
function onLfgPosted() {
  lfgPosted.value = true
  setTimeout(() => (lfgPosted.value = false), 2500)
}

// ---------- the room fills the screen under the app's top bar ----------

// (the room takes the whole screen: the page's top bar stands down here, so there is no height
// to measure and subtract any more — it used to leave a black strip the bar's height at the foot)

// ---------- the panels on the left ----------

type Tab = 'chars' | 'gear' | 'map' | 'room'
const tab = ref<Tab | null>(null)
const settingsDialog = ref<{ close: () => void } | null>(null)

/**
 * The trial begins: shut every panel of the room's first. The game's own alarm plays over the
 * room as it stands (`introStage` 'beat' in `intro.ts` holds this page), so a panel left open
 * would sit over the moment the room is meant to be seen in — and the player would come back to
 * a game with the lobby's panel still on top of it.
 */
watch(
  () => !!session.data?.game,
  (started) => {
    if (!started) return
    tab.value = null
    lfgOpen.value = false
    settingsDialog.value?.close()
  },
)
function openTab(t: Tab) {
  sfx.click()
  tab.value = tab.value === t ? null : t
}
const TABS: { id: Tab; label: string }[] = [
  { id: 'chars', label: 'ตัวละคร' },
  { id: 'gear', label: 'อุปกรณ์' },
  { id: 'map', label: 'แผนที่' },
  { id: 'room', label: 'ห้อง' },
]

// ---------- lobby ----------

// someone joins or leaves the lobby: a sound (not for the room as you open it)
watch(
  () => memberList.value.length,
  (n, was) => {
    if (data.value.phase !== 'lobby') return
    if (n > was) fxSound.lobbyJoin()
    else if (n < was) fxSound.lobbyLeave()
  },
)

/**
 * Your own name on your place opens the profile (the top bar's): the name is set there only, and
 * the room follows it (session.ts).
 */
function rename() {
  sfx.click()
  openProfile()
}

/** The lineup: the killer's place, four survivor places (empty ones null), and who hasn't chosen. */
const killerMember = computed(() => memberList.value.find((m) => m.side === 'killer') ?? null)
/** The four survivor places: each member in the one they took, those without one in the first free. */
const survivorMembers = computed(() => {
  const on = memberList.value.filter((m) => m.side === 'survivor')
  const slots: ((typeof on)[number] | null)[] = [null, null, null, null]
  const rest: typeof on = []
  for (const m of on) {
    if (m.seat !== undefined && m.seat >= 0 && m.seat < 4 && !slots[m.seat]) slots[m.seat] = m
    else rest.push(m)
  }
  for (const m of rest) {
    const free = slots.indexOf(null)
    if (free >= 0) slots[free] = m
  }
  return slots
})
const bench = computed(() => memberList.value.filter((m) => !m.side))
/** Who else holds a ping colour (their name), or null when it is free or this player's own. */
const colorHolder = (color: string) => {
  const id = Object.keys(pingColors.value).find((k) => pingColors.value[k] === color)
  return id && id !== session.me ? (session.data?.members[id]?.name ?? '?') : null
}
/** The seated players (a side taken): only they say ready; the others watch the game. */
const seated = computed(() => memberList.value.filter((m) => m.side))
const readyCount = computed(() => seated.value.filter((m) => m.ready || m.bot).length)

const killerTaken = computed(() => memberList.value.some((m) => m.side === 'killer' && m.id !== session.me))
const survivorCount = computed(() => memberList.value.filter((m) => m.side === 'survivor').length)

function side(s: 'killer' | 'survivor') {
  sfx.click()
  void setSide(me.value?.side === s ? null : s)
}
function watchOnly() {
  sfx.click()
  void setSide(null)
}

/**
 * The rail's role switch (the lobby): to the next role there is room for, as the PC game's —
 * spectator → killer → survivor → spectator.
 */
const nextRole = computed<{ side: 'killer' | 'survivor' | null; label: string } | null>(() => {
  const order: ('killer' | 'survivor' | null)[] = [null, 'killer', 'survivor']
  const at = order.indexOf(me.value?.side ?? null)
  for (let i = 1; i < order.length; i++) {
    const s = order[(at + i) % order.length]
    if (s === 'killer' && killerTaken.value) continue
    if (s === 'survivor' && survivorCount.value >= 4) continue
    return { side: s, label: s === 'killer' ? 'เปลี่ยนเป็นฆาตกร' : s === 'survivor' ? 'เปลี่ยนเป็นผู้รอดชีวิต' : 'เปลี่ยนเป็นผู้ชม' }
  }
  return null
})
function switchRole() {
  const r = nextRole.value
  if (!r || session.busy) return
  sfx.click()
  void setSide(r.side)
}

/** The host may kick anyone else out of the lobby. */
const canKick = (id: string | undefined) => !!id && isHost.value && id !== session.me && data.value.phase === 'lobby' && !data.value.game
function kick(id: string) {
  const who = data.value.members[id]?.name ?? 'ผู้เล่น'
  if (!confirm(`เตะ ${who} ออกจากห้อง? เขาจะกลับเข้าห้องนี้ไม่ได้อีก`)) return
  sfx.click()
  void kickMember(id)
}

/** Voice: this member is speaking now, and their mic's state in words. */
const talking = (id: string | undefined) => !!id && !!voice.speaking[id]
const voiceTitle = (id: string) => (voice.roster[id]?.m ? 'อยู่ในห้องเสียง — ไมค์ปิด' : 'อยู่ในห้องเสียง')

/**
 * A click on a place: an empty one takes that side (`slot`: which survivor place). A taken one,
 * your own too, does nothing: the side is changed with the rail's role switch only (a click on
 * your own place used to leave the side, which looked like that button going off by itself).
 */
function clickSeat(s: 'killer' | 'survivor', id: string | undefined, slot?: number) {
  if (!id) return takeSlot(s, slot)
}

/**
 * A click on an empty place: take that side (moving over from the other one), at that place; a
 * survivor already moves to the empty survivor place clicked.
 */
function takeSlot(s: 'killer' | 'survivor', slot?: number) {
  if (session.busy) return
  if (s === 'survivor' && me.value?.side === 'survivor') {
    sfx.click()
    return void setSide('survivor', slot)
  }
  if (me.value?.side === s) return
  if (s === 'killer' && killerTaken.value) return
  if (s === 'survivor' && survivorCount.value >= 4) return
  sfx.click()
  void setSide(s, slot)
}

/** Host: a bot takes the killer's side or a survivor place (`seat`, else the first free). */
function seatBot(s: 'killer' | 'survivor', seat?: number) {
  sfx.click()
  void addBot(s, seat)
}
/** The killers a bot can play, for the host's pick on its place. */
const botKillers = playableKillers()
function pickBotKiller(id: string, pick: string) {
  sfx.click()
  void setBotPick(id, pick || null)
}
function dropBot(id: string) {
  sfx.click()
  void removeBot(id)
}

function toggleReady() {
  sfx.select()
  void setReady(!me.value?.ready)
}

/** How the survivors will be split, for the current number of survivor players (p.19). */
const splitNote = computed(() => {
  const n = survivorCount.value
  if (n === 4) return 'ผู้เล่นฝั่ง Survivor คุมคนละ 1 ตัว'
  if (n === 3) return 'ผู้เล่นที่มีป้าย 👥 คุม 2 ตัว อีก 2 คนคุมคนละ 1 ตัว — หัวห้องเลือกให้ใครก็ได้ หรือกดรับเองก็ได้'
  if (n === 2) return 'ผู้เล่นฝั่ง Survivor คุมคนละ 2 ตัว'
  if (n === 1) return 'โหมด 2 คน: ผู้เล่นฝั่ง Survivor คุมทั้ง 4 ตัว — การ์ดเคลื่อนที่ 2 ชุดสับรวมกัน จั่ว 3 ใบ แล้ววางให้ทีละตัว (หน้า 6)'
  return 'เกมมี Survivor 4 ตัวเสมอ — ต้องมีผู้เล่นฝั่งนี้ 1–4 คน'
})

function proceed() {
  sfx.entity()
  void proceedToPick()
}

// ---------- character picks ----------

const amKiller = computed(() => mySeat.value === KILLER_PLAYER)
const mySlots = computed(() => (mySeat.value ? slotsOf(mySeat.value) : []))
const locked = computed(() => !!mySeat.value && !!data.value.locked[String(mySeat.value)])

/** The slot this player is filling now: the first of theirs still empty, or the one tapped. */
const activeSlot = ref<number | null>(null)
watch(
  [mySlots, () => data.value.picks],
  () => {
    if (activeSlot.value !== null && mySlots.value.includes(activeSlot.value)) return
    activeSlot.value = mySlots.value.find((s) => !data.value.picks[String(s)]) ?? mySlots.value[0] ?? null
  },
  { immediate: true },
)

/** Survivor slots: who plays each, and what they picked. */
const survivorSlots = computed(() =>
  [0, 1, 2, 3].map((slot) => {
    const player = Number(Object.keys(data.value.seats).find((p) => slotsOf(Number(p)).includes(slot)) ?? 0)
    const id = data.value.picks[String(slot)]
    const seat = data.value.seats[String(player)]
    return {
      slot,
      player,
      memberId: seat?.id,
      who: seat?.name ?? '',
      mine: player === mySeat.value,
      bot: botSeat(data.value, player),
      character: id ? survivorById.get(id) : undefined,
      // a bot's survivor is drawn once the people are in: locked as soon as it has one
      locked: !!data.value.locked[String(player)] || (botSeat(data.value, player) && !!id),
    }
  }),
)

/** Survivors a teammate already took (not counting this player's own slots); none with repeats allowed. */
const takenByOthers = computed(
  () => new Set(roomSettings.value.dupes ? [] : survivorSlots.value.filter((s) => !s.mine && s.character).map((s) => s.character!.id)),
)

/** Who picks the board, for the read-only card. */
// a bot killer picks no map: it was drawn
const boardChooser = computed(() =>
  botSeat(data.value, KILLER_PLAYER) && roomSettings.value.map !== 'host' ? 'สุ่ม' : { killer: 'ฆาตกร', host: 'หัวห้อง', random: 'สุ่ม' }[roomSettings.value.map],
)

/** The killer's character, for whoever may see it: the killer, or everyone when the room shows it. */
const killerChar = computed(() => (data.value.picks.killer && (amKiller.value || roomSettings.value.showKiller) ? killerById.get(data.value.picks.killer) : undefined))

function pickKiller(id: string) {
  fxSound.charPick()
  void pickCharacter('killer', id)
}
function unpickKiller() {
  fxSound.charUnconfirm()
  void pickCharacter('killer', null)
}

/** Put a survivor in the slot being filled, then move on to the next empty one. */
function pickSurvivor(id: string) {
  if (locked.value || takenByOthers.value.has(id) || activeSlot.value === null) return
  fxSound.charPick()
  const slot = activeSlot.value
  void pickCharacter(slot, id)
  activeSlot.value = mySlots.value.find((s) => s !== slot && !data.value.picks[String(s)]) ?? slot
}

function unpickSurvivor(id: string) {
  const slot = mySlots.value.find((s) => data.value.picks[String(s)] === id)
  if (slot === undefined || locked.value) return
  fxSound.charUnconfirm()
  void pickCharacter(slot, null)
  activeSlot.value = slot
}

const myPicks = computed(() => mySlots.value.map((s) => data.value.picks[String(s)]).filter((id): id is string => !!id))

const myPicksComplete = computed(() =>
  amKiller.value ? !!data.value.picks.killer : mySlots.value.length > 0 && mySlots.value.every((s) => data.value.picks[String(s)]),
)
// every character of this player picked: the characters' panel closes, the scene shows them (a
// survivor playing several closes it with the last one)
watch(
  () => (myPicksComplete.value ? (amKiller.value ? (data.value.picks.killer ?? '') : myPicks.value.join(',')) : null),
  (picked, was) => {
    // every pick that completes them (a character changed for another too), not only the first
    if (picked && picked !== was && tab.value === 'chars') tab.value = null
  },
)
const picksMissing = computed(() => (amKiller.value ? (data.value.picks.killer ? 0 : 1) : mySlots.value.length - myPicks.value.length))

function toggleLock() {
  // a character changing deals the perks again: everyone sets theirs anew
  if (locked.value && perkStage.value && !confirm('เปลี่ยนตัวละครจะล้าง Perk ที่ทุกคนแต่งไว้ ให้แต่งใหม่ทั้งหมด — ต่อไหม?')) return
  if (locked.value) fxSound.charUnconfirm()
  else fxSound.charConfirm()
  void lockPicks(!locked.value)
}

// ---------- the bans ----------

const myBansLocked = computed(() => !!mySeat.value && !!data.value.bansLocked?.[String(mySeat.value)])
const banWaiting = computed(() => Array.from({ length: data.value.players }, (_, i) => String(i + 1)).filter((p) => !data.value.bansLocked?.[p] && !botSeat(data.value, p)).length)
function toggleBans() {
  if (myBansLocked.value) fxSound.charUnconfirm()
  else fxSound.charConfirm()
  void lockBans(!myBansLocked.value)
}

// ---------- perks (Bloodweb, Devout): this device's characters, once everyone is locked in ----------

/** This player's characters with their loadouts (their own only: Devout's picks are revealed together). */
const myLoadouts = computed(() =>
  myPerkKeys.value.flatMap((key) => {
    const c = perkChars.value.find((x) => x.key === key)
    return c ? [{ ...c, perks: roomLoadouts.value[key] ?? printedOf(c.id) }] : []
  }),
)
/** The character whose perks the panel shows (a player with several switches between them). */
const loadoutKey = ref<string | null>(null)
const shownLoadout = computed(() => myLoadouts.value.find((c) => c.key === loadoutKey.value) ?? myLoadouts.value[0] ?? null)
const perkTaken = (key: string) => [...takenBy(perkChars.value, roomLoadouts.value, key)]
const perkDone = (key: string) => !!data.value.perksDone?.[key]
function confirmLoadout(key: string, on: boolean) {
  sfx.select()
  void confirmPerks(key, on)
  // confirmed: the panel closes, as the characters' does (what is left glows on the rail)
  if (on && tab.value === 'gear') tab.value = null
}
/** This player's loadouts still to confirm. */
const myPerksOpen = computed(() => (roomSettings.value.mode === 'adept' || !perkStage.value ? [] : myLoadouts.value.filter((c) => !perkDone(c.key))))

/** The character this player sees big on the right, and wears in the corner: the one picked. */
const myCharacter = computed(() => {
  if (inLobby.value || !mySeat.value) return null
  if (amKiller.value) {
    const id = data.value.picks.killer
    return id ? { side: 'killer' as const, key: 'killer', c: killerById.get(id) } : null
  }
  const slot = activeSlot.value ?? mySlots.value[0]
  const id = slot !== undefined && slot !== null ? data.value.picks[String(slot)] : undefined
  return id ? { side: 'survivor' as const, key: String(slot), c: survivorById.get(id) } : null
})
/** A perk worn, pointed at: its box beside it (to the left: the corner is on the right). */
const wornTip = ref<{ p: PerkId; x: number; y: number } | null>(null)
function pointWorn(p: PerkId, e: MouseEvent | FocusEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  wornTip.value = { p, x: Math.max(8, r.left - 452), y: Math.min(r.top, window.innerHeight - 320) }
}
/** Its colour: the character's own (purple), printed on its board (green), or a card laid (gold). */
function wornKind(p: PerkId): 'own' | 'shared' | 'card' {
  const id = myCharacter.value?.c?.id
  if (!id || !printedOf(id).includes(p)) return 'card'
  return ownPerk(p) ? 'own' : 'shared'
}
/** Its perks: the loadout set, or the ones printed on its board. */
const myCharacterPerks = computed<PerkId[]>(() => {
  const m = myCharacter.value
  if (!m?.c) return []
  return roomLoadouts.value[m.key] ?? printedOf(m.c.id)
})

// ---------- offerings (p.19): this player's side's, once the characters are in ----------

/** This side's slots, when it picks its offerings now (null: nothing to pick here). */
const myOfferingSlots = computed(() => {
  const side = myOfferingSide.value
  return side && offeringsWaiting.value.concat(myOfferingsDone.value ? [side] : []).includes(side) ? offeringSlotsNow.value[side] : null
})
const myOfferingProblem = computed(() => (myOfferingSide.value && myOfferingSlots.value ? offeringProblem(myOfferingSide.value, myOfferings.value, myOfferingSlots.value) : ''))
function pickOfferings(list: OfferingId[]) {
  void setOfferings(list)
}
function confirmMyOfferings(on: boolean) {
  sfx.select()
  void confirmOfferings(on)
  if (on && tab.value === 'gear') tab.value = null
}

/**
 * What this player confirmed and may take back while the room still waits (beside the corner
 * button, where it is seen — not inside the panel): each character's perks, the side's offerings.
 * Taking one back opens the equipment panel on it.
 */
const undos = computed(() => {
  if (inLobby.value || !mySeat.value || startable.value) return []
  const out: { key: string; label: string; run: () => void }[] = []
  if (roomSettings.value.mode !== 'adept' && perkStage.value)
    for (const c of myLoadouts.value)
      if (perkDone(c.key))
        out.push({
          key: `p${c.key}`,
          label: myLoadouts.value.length > 1 ? `✎ แก้ Perk ${c.side === 'killer' ? 'Killer' : `Survivor ${Number(c.key) + 1}`}` : '✎ แก้ Perk',
          run: () => {
            confirmLoadout(c.key, false)
            loadoutKey.value = c.key
            tab.value = 'gear'
          },
        })
  if (myOfferingSlots.value && myOfferingsDone.value)
    out.push({
      key: 'o',
      label: '✎ แก้เครื่องเซ่น',
      run: () => {
        confirmMyOfferings(false)
        tab.value = 'gear'
      },
    })
  return out
})
/** The offering slot in the loadout: picked here, or only shown (drawn, or this side burns none). */
const offeringSlot = computed(() => {
  const side = myOfferingSide.value
  if (!side) return null
  if (myOfferingSlots.value) return { side, slots: myOfferingSlots.value, picked: myOfferings.value, problem: myOfferingProblem.value, confirmed: myOfferingsDone.value }
  const slots = offeringSlotsNow.value[side]
  if (!slots) return null
  return { side, slots, picked: [], problem: '', confirmed: true, note: roomSettings.value.offeringRandom ? 'เครื่องเซ่นสุ่มให้ตอนเริ่มเกม' : 'เลือกเครื่องเซ่นได้หลังทุกคนล็อกตัวละคร' }
})

function start() {
  sfx.entity()
  void startOnlineGame()
}

// ---------- who is done with what: the places' marks ----------

/** Which player each character key belongs to: 'killer' is player 1, a survivor slot its hand's player. */
function playerOfKey(key: string): number {
  return key === 'killer' ? KILLER_PLAYER : (survivorSlots.value[Number(key)]?.player ?? 0)
}

/**
 * Whether a player is done with what the room waits on now (null: not shown — the killer's own
 * progress is only the killer's, unless the room shows the killer).
 */
function seatDone(player: number): boolean | null {
  const killer = player === KILLER_PLAYER
  if (botSeat(data.value, player)) return true
  const st = pickStage.value
  if (st === 'chars' && killer && !amKiller.value && !roomSettings.value.showKiller) return null
  if (st === 'bans') return !!data.value.bansLocked?.[String(player)]
  if (st === 'chars') return !!data.value.locked[String(player)]
  const perks = perkChars.value.filter((c) => playerOfKey(c.key) === player).every((c) => perkDone(c.key))
  const offerings = !offeringsWaiting.value.includes(killer ? 'killer' : 'survivor')
  return (roomSettings.value.mode === 'adept' || perks) && offerings
}

// ---------- the one button in the corner: what moves things on for this player now ----------

interface Action {
  label: string
  /** The line beside it: what the room waits on. */
  note: string
  run?: () => void
  /** The panel it opens instead, when there is something to do there first. */
  open?: Tab
  done?: boolean
  primary?: boolean
}

const action = computed<Action>(() => {
  const d = data.value
  if (inLobby.value) {
    const waitLine = lobbyBlocker.value || (isHost.value ? 'ทุกคนพร้อมแล้ว' : 'ทุกคนพร้อมแล้ว — รอหัวห้องดำเนินเกม')
    const note = `พร้อม ${readyCount.value}/${seated.value.length} · ${waitLine}`
    if (!me.value?.side) return { label: 'เลือกฝั่ง', note: 'คลิกที่ว่างเพื่อเป็น Killer หรือ Survivor — ไม่เลือกก็ดูเกมได้', open: 'chars' }
    if (!me.value.ready) return { label: 'พร้อม', note, run: toggleReady, primary: true }
    if (isHost.value && !lobbyBlocker.value) return { label: 'ดำเนินเกม', note: 'ทุกคนพร้อมแล้ว — ไปเลือกตัวละคร', run: proceed, primary: true }
    return { label: 'พร้อมแล้ว', note: `${note} · กดเพื่อยกเลิก`, run: toggleReady, done: true }
  }
  if (!mySeat.value) {
    if (mayStart.value && startable.value) return { label: 'เริ่ม Trial', note: 'ทุกอย่างพร้อมแล้ว', run: start, primary: true }
    return { label: 'ผู้ชม', note: 'คุณดูเกมนี้ — เกมเริ่มเมื่อทุกคนเลือกเสร็จ' }
  }
  const stage = pickStage.value
  if (stage === 'bans') {
    if (!myBansLocked.value) return { label: 'ยืนยันการแบน', note: `แบนแล้วกดยืนยัน · ยืนยันแล้ว ${d.players - banWaiting.value}/${d.players}`, run: toggleBans, primary: true }
    return { label: 'ยืนยันแล้ว', note: `รอผู้เล่นคนอื่นแบน (${banWaiting.value}) · กดเพื่อแก้`, run: toggleBans, done: true }
  }
  if (!locked.value) {
    if (!myPicksComplete.value) return { label: 'เลือกตัวละคร', note: `เลือกอีก ${picksMissing.value} ตัว`, open: 'chars' }
    return { label: 'ล็อกตัวละคร', note: 'เลือกครบแล้ว — ล็อกได้เลย', run: toggleLock, primary: true }
  }
  if (!allLocked.value) return { label: 'ล็อกแล้ว', note: 'รอทุกคนล็อกตัวละคร · กดเพื่อแก้', run: toggleLock, done: true }
  const open = myPerksOpen.value[0]
  if (open) {
    const problem = perkProblem(open.key, open.perks)
    // seen before confirmed: the panel is opened first (it no longer opens by itself)
    if (tab.value !== 'gear' || shownLoadout.value?.key !== open.key || problem) return { label: 'แต่ง Perk', note: problem || `ยืนยัน Perk ของ ${open.side === 'killer' ? 'Killer' : `Survivor ${Number(open.key) + 1}`}`, open: 'gear' }
    return { label: 'ยืนยัน Perk', note: `${myPerksOpen.value.length > 1 ? `อีก ${myPerksOpen.value.length} ตัว · ` : ''}ยืนยันแล้วแก้ไม่ได้จนกว่าจะกดยกเลิก`, run: () => confirmLoadout(open.key, true), primary: true }
  }
  if (myOfferingSide.value && myOfferingSlots.value && !myOfferingsDone.value) {
    if (tab.value !== 'gear' || myOfferingProblem.value) return { label: 'เลือกเครื่องเซ่น', note: myOfferingProblem.value || 'เปิดแผงอุปกรณ์ แล้วกดช่องเครื่องเซ่น', open: 'gear' }
    return { label: 'ยืนยันเครื่องเซ่น', note: 'เผาตอนเริ่มเกม — ทุกคนเห็นเมื่อเกมเริ่ม', run: () => confirmMyOfferings(true), primary: true }
  }
  if (!mapDone.value && mayPickBoard.value) return { label: 'เลือกแผนที่', note: 'คุณเป็นคนเลือกแผนที่', open: 'map' }
  if (mayStart.value) {
    if (startable.value) return { label: 'เริ่ม Trial', note: 'ทุกอย่างพร้อมแล้ว', run: start, primary: true }
    return { label: 'รอ', note: waitingLine.value }
  }
  return { label: startable.value ? 'พร้อมแล้ว' : 'รอ', note: startable.value ? (botSeat(d, KILLER_PLAYER) ? 'รอหัวห้องเริ่มเกม' : 'รอ Killer เริ่มเกม') : waitingLine.value, done: startable.value }
})

/** What the room still waits on, in words (the picks). */
const waitingLine = computed(() => {
  if (!allLocked.value) return 'รอทุกคนล็อกตัวละคร'
  if (perksWaiting.value.length) return `รอแต่ง Perk (${perksWaiting.value.length} ตัว)`
  if (offeringsWaiting.value.length) return `รอ${offeringsWaiting.value.includes('killer') ? ' Killer' : 'ฝั่ง Survivor'}เลือกเครื่องเซ่น`
  if (!mapDone.value) return `รอ${boardChooser.value}เลือกแผนที่`
  return 'ทุกอย่างพร้อมแล้ว'
})

function runAction() {
  const a = action.value
  if (session.busy) return
  if (a.run) return a.run()
  if (a.open) {
    sfx.click()
    tab.value = a.open
    if (a.open === 'gear' && myPerksOpen.value[0]) loadoutKey.value = myPerksOpen.value[0].key
  }
}

/**
 * The panel the room's next step is in for this player: its rail button glows until it is opened.
 * Nothing opens by itself — the player opens it (the players asked: a panel popping up over the
 * scene the moment everyone was ready took the room away from them).
 */
const nextTab = computed<Tab | null>(() => {
  if (inLobby.value || !mySeat.value) return null
  // until this player's bans and character are locked (the lock itself is the corner button's):
  // a closed panel with nothing glowing read as "done" before it was
  if (!bansDone.value) return myBansLocked.value ? null : 'chars'
  if (!locked.value) return 'chars'
  if (allLocked.value && (myPerksOpen.value.length || (myOfferingSlots.value && !myOfferingsDone.value))) return 'gear'
  if (allLocked.value && !mapDone.value && mayPickBoard.value) return 'map'
  return null
})
// back to the lobby: no panel left open from the picks
watch(inLobby, (lobby) => lobby && (tab.value = null))

// ---------- the big figure on the right, the side's colour ----------

/** The left strip of a character's board (its portrait), shown as the PC game shows its model. */
const hero = computed(() => {
  const m = myCharacter.value
  if (!m?.c) return null
  return { src: asset(m.c.images.boardTh), killer: m.side === 'killer', name: m.c.name }
})
/** The side this player plays: the scene's colour (red for the killer, cold for the survivors). */
const mySide = computed<'killer' | 'survivor' | null>(() => (inLobby.value ? (me.value?.side ?? null) : mySeat.value ? (amKiller.value ? 'killer' : 'survivor') : null))

// ---------- the panels' headings ----------

const tabLocked = computed<Record<Tab, string>>(() => ({
  chars: '',
  gear: inLobby.value ? 'แต่ง Perk และเครื่องเซ่นได้หลังเลือกตัวละคร' : !allLocked.value ? 'รอทุกคนล็อกตัวละครก่อน (Bloodweb แจกการ์ดจากตัวละครทุกตัว)' : '',
  map: inLobby.value ? `เลือกแผนที่หลังเริ่มเลือกตัวละคร — ${boardChooser.value}เป็นคนเลือก` : '',
  room: '',
}))
</script>

<template>
  <div class="pc-room" :class="[mySide ?? 'none', { 'panel-open': !!tab }]" :style="{ '--turn': mySide === 'killer' ? -1 : mySide === 'survivor' ? 1 : 0 }">
    <!-- the light of the room. Keyed by the side, so changing sides swings it too — a shorter
         way than the line, which is nearer the camera (`turn`). -->
    <div :key="`light-${mySide ?? 'none'}`" class="light" aria-hidden="true">
      <div class="tint" />
      <div class="firepulse" />
    </div>
    <div class="roomfog" aria-hidden="true" />
    <!-- and a bank of fog blows through while the room turns, covering the swap -->
    <div :key="`gust-${mySide ?? 'none'}`" class="fogsweep" aria-hidden="true" />

    <!-- the rail: a panel at a time -->
    <nav class="rail" aria-label="เมนูห้อง">
      <button
        v-for="t in TABS"
        :key="t.id"
        type="button"
        class="rail-btn"
        :class="{ on: tab === t.id, ask: tab !== t.id && nextTab === t.id }"
        :aria-pressed="tab === t.id"
        :title="t.label"
        @click="openTab(t.id)"
      >
        <svg v-if="t.id === 'chars'" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>
        <svg v-else-if="t.id === 'gear'" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8.5 5v10L12 22l-8.5-5V7z" /><path d="M12 7l4.3 2.5v5L12 17l-4.3-2.5v-5z" /></svg>
        <svg v-else-if="t.id === 'map'" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" /><path d="M9 4v14M15 6v14" /></svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="8" cy="18" r="2" /></svg>
        <span>{{ t.label }}</span>
      </button>
      <!-- the lobby: switch role, as the PC game's — the icon is the role a click switches to -->
      <button
        v-if="inLobby && nextRole"
        type="button"
        class="rail-btn role-btn"
        :disabled="session.busy"
        :aria-label="nextRole.label"
        @click="switchRole"
      >
        <span class="swap" aria-hidden="true">⟳</span>
        <svg v-if="nextRole.side === 'killer'" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c-4.7 0-8 3.2-8 7.6 0 2.6 1.2 4.6 3 5.8v3.6h2.2v-2h1.6v2h2.4v-2h1.6v2H17v-3.6c1.8-1.2 3-3.2 3-5.8 0-4.4-3.3-7.6-8-7.6z" /><circle cx="8.8" cy="10.6" r="1.9" /><circle cx="15.2" cy="10.6" r="1.9" /><path d="M12 13.4l-1 2h2z" /></svg>
        <svg v-else-if="nextRole.side === 'survivor'" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="9" r="3" /><path d="M6.5 18.2c1.2-2.6 3.2-4 5.5-4s4.3 1.4 5.5 4" /></svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="3.2" /></svg>
        <span class="rail-tip">{{ nextRole.label }}</span>
      </button>
    </nav>

    <!-- the room: its name and phase, the code (a click copies it), the invite -->
    <header class="top">
      <div class="title">
        <small>{{ inLobby ? 'Lobby' : 'เตรียม Trial' }}</small>
        <h1>{{ data.passwordHash ? '🔒 ' : '' }}{{ data.name || `ห้อง ${code}` }}</h1>
      </div>
      <button type="button" class="chip code" title="คลิกเพื่อคัดลอกรหัสห้อง" @click="copy('code')">
        <small>รหัสห้อง</small><strong>{{ code }}</strong><span>{{ copied === 'code' ? '✓' : '📋' }}</span>
      </button>
      <button type="button" class="chip" @click="copy('link')">{{ copied === 'link' ? '✓ คัดลอกลิงก์แล้ว' : '🔗 ลิงก์เชิญเพื่อน' }}</button>
      <button v-if="inLobby" type="button" class="chip" title="ส่งประกาศไปที่ห้องแชตหาผู้เล่น พร้อมห้องนี้" @click="openLfg">{{ lfgPosted ? '✓ ลงประกาศแล้ว' : '📢 ประกาศหาคน' }}</button>
      <!-- a survivor's lobby has no killer's place on it (each side sees its own scene): who holds it,
           and the host's bot for it, said in a box of its own -->
      <div v-if="inLobby && mySide === 'survivor'" class="killer-seat">
        <span class="ks-label">ฆาตกร</span>
        <template v-if="killerMember">
          <b>{{ killerMember.bot ? '🤖 ' : '' }}{{ killerMember.name }}</b>
          <small :class="{ ok: killerMember.ready || killerMember.bot }">{{ killerMember.bot || killerMember.ready ? '✓ พร้อม' : 'ยังไม่พร้อม' }}</small>
          <select
            v-if="killerMember.bot && isHost"
            class="bot-pick"
            :value="killerMember.pick ?? ''"
            :disabled="session.busy"
            title="ตัวละครของบอท Killer"
            @change="pickBotKiller(killerMember.id, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">🎲 สุ่ม Killer</option>
            <option v-for="k in botKillers" :key="k.id" :value="k.id">{{ k.name }}</option>
          </select>
          <button v-if="canKick(killerMember.id)" type="button" class="ks-btn" @click="killerMember.bot ? dropBot(killerMember.id) : kick(killerMember.id)">{{ killerMember.bot ? '✕ เอาบอทออก' : '✕ เตะ' }}</button>
        </template>
        <template v-else>
          <b class="empty">ว่าง</b>
          <button v-if="isHost" type="button" class="ks-btn add" :disabled="session.busy" @click="seatBot('killer')">🤖 เพิ่มบอทฆาตกร</button>
          <small v-else>รอผู้เล่นมาเป็นฆาตกร</small>
        </template>
      </div>
      <span class="grow" />
      <VoiceButton />
      <!-- the page's own top bar is gone here, so settings live with the room's other buttons -->
      <SettingsDialog ref="settingsDialog" />
      <SyncBadge />
    </header>

    <!-- this player, in the corner: the name (the profile) and the perks worn -->
    <aside class="me-box">
      <div v-if="myCharacterPerks.length" class="worn" aria-label="Perk ที่ใส่">
        <img
          v-for="(p, i) in myCharacterPerks"
          :key="p"
          :class="`w${i}`"
          :src="asset(perkIcon(p))"
          :alt="PERKS[p].name"
          tabindex="0"
          @mouseenter="pointWorn(p, $event)"
          @focus="pointWorn(p, $event)"
          @mouseleave="wornTip = null"
          @blur="wornTip = null"
        />
      </div>
      <PcTip v-if="wornTip" :x="wornTip.x" :y="wornTip.y" :title="PERKS[wornTip.p].name" :en="PERKS[wornTip.p].en" :tone="perkTone(wornTip.p)">
        <template #left>{{ myCharacter?.c?.name }}</template>
        <template #right>{{ { own: 'Perk เฉพาะตัว', shared: 'Perk บนกระดาน', card: 'การ์ด Perk' }[wornKind(wornTip.p)] }} · {{ PERKS[wornTip.p].cost ? `${PERKS[wornTip.p].cost} ▲` : 'ฟรี' }}</template>
        <p class="tip-text"><PerkRichText :text="perkText(wornTip.p)" /></p>
        <p class="tip-when">{{ PERKS[wornTip.p].when }}</p>
      </PcTip>
      <button
        type="button"
        class="me-name"
        :class="mySide ?? 'watch'"
        :title="`${mySide === 'killer' ? 'ฆาตกร' : mySide === 'survivor' ? 'ผู้รอดชีวิต' : 'ผู้ชม'}${isHost ? ' · หัวห้อง' : ''} — คลิกเพื่อเปลี่ยนชื่อ (โปรไฟล์)`"
        @click="rename"
      >
        <span>{{ isHost ? '👑 ' : '' }}{{ me?.name ?? 'ผู้เล่น' }}</span>
        <svg v-if="mySide === 'killer'" class="role-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c-4.7 0-8 3.2-8 7.6 0 2.6 1.2 4.6 3 5.8v3.6h2.2v-2h1.6v2h2.4v-2h1.6v2H17v-3.6c1.8-1.2 3-3.2 3-5.8 0-4.4-3.3-7.6-8-7.6z" /><circle cx="8.8" cy="10.6" r="1.9" /><circle cx="15.2" cy="10.6" r="1.9" /><path d="M12 13.4l-1 2h2z" /></svg>
        <svg v-else-if="mySide === 'survivor'" class="role-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="9" r="3" /><path d="M6.5 18.2c1.2-2.6 3.2-4 5.5-4s4.3 1.4 5.5 4" /></svg>
        <svg v-else class="role-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="3.2" /></svg>
      </button>
    </aside>

    <!-- ================= the scene: everyone on their places ================= -->
    <section :key="`scene-${mySide ?? 'none'}`" class="scene" aria-label="ผู้เล่นในห้อง">
      <!-- the lobby: a place per player, taken with a click -->
      <div v-if="inLobby" class="places">
        <component
          :is="killerMember ? 'div' : 'button'"
          v-if="mySide !== 'survivor'"
          class="place killer"
          :class="{ 'hero-place': mySide === 'killer', empty: !killerMember, me: killerMember?.id === session.me, ready: killerMember?.ready || killerMember?.bot, talking: talking(killerMember?.id) }"
          :disabled="!killerMember && session.busy ? true : undefined"
          :title="killerMember ? undefined : 'คลิกเพื่อเป็น Killer'"
          @click="clickSeat('killer', killerMember?.id)"
        >
          <span class="side-tag">KILLER</span>
          <span class="figure killer"><span class="pillar" aria-hidden="true"><span class="plus">{{ killerMember ? '' : '+' }}</span></span></span>
          <template v-if="killerMember">
            <button v-if="killerMember.id === session.me" type="button" class="pname mine" title="เปลี่ยนชื่อ (โปรไฟล์)" @click.stop="rename">{{ killerMember.id === data.host ? '👑 ' : '' }}{{ killerMember.name }} ✎</button>
            <span v-else class="pname">{{ killerMember.id === data.host ? '👑 ' : '' }}{{ killerMember.name }}</span>
            <span class="pstate">
              <i v-if="!killerMember.bot" class="ping-dot" :style="{ '--c': pingHex(pingColors[killerMember.id]) }" title="สี Ping" />
              {{ killerMember.bot ? '🤖 บอท' : killerMember.ready ? '✓ พร้อม' : 'ยังไม่พร้อม' }}
              <i v-if="voice.roster[killerMember.id]" :title="voiceTitle(killerMember.id)">{{ voice.roster[killerMember.id].m ? '🔇' : '🎙️' }}</i>
            </span>
            <!-- the host picks the bot killer's character, or leaves it to the draw (only the host sees it) -->
            <select
              v-if="killerMember.bot && isHost"
              class="bot-pick"
              :value="killerMember.pick ?? ''"
              :disabled="session.busy"
              title="ตัวละครของบอท Killer"
              @click.stop
              @change="pickBotKiller(killerMember.id, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">🎲 สุ่ม Killer</option>
              <option v-for="k in botKillers" :key="k.id" :value="k.id">{{ k.name }}</option>
            </select>
            <button v-if="canKick(killerMember.id)" type="button" class="kick" :title="killerMember.bot ? 'เอาบอทออก' : 'เตะออกจากห้อง'" @click.stop="killerMember.bot ? dropBot(killerMember.id) : kick(killerMember.id)">✕</button>
          </template>
          <template v-else>
            <span class="pname">ว่าง</span>
            <span class="pstate">คลิกเพื่อเป็น Killer</span>
            <button v-if="isHost" type="button" class="bot-add" :disabled="session.busy" @click.stop="seatBot('killer')">🤖 เพิ่มบอท</button>
          </template>
        </component>

        <span v-if="!mySide" class="vs" aria-hidden="true">VS</span>

        <component
          :is="m ? 'div' : 'button'"
          v-for="(m, i) in survivorMembers"
          :key="m?.id ?? `empty-${i}`"
          class="place survivor"
          :style="{ '--i': i }"
          :class="{ empty: !m, me: m?.id === session.me, ready: m?.ready || m?.bot, talking: talking(m?.id) }"
          :disabled="!m && session.busy ? true : undefined"
          :title="m ? undefined : me?.side === 'survivor' ? 'คลิกเพื่อย้ายมาที่นี่' : 'คลิกเพื่อเป็น Survivor'"
          @click="clickSeat('survivor', m?.id, i)"
        >
          <span class="side-tag">SURVIVOR {{ i + 1 }}</span>
          <span class="figure"><span class="pillar" aria-hidden="true"><span class="plus">{{ m ? '' : '+' }}</span></span></span>
          <template v-if="m">
            <button v-if="m.id === session.me" type="button" class="pname mine" title="เปลี่ยนชื่อ (โปรไฟล์)" @click.stop="rename">{{ m.id === data.host ? '👑 ' : '' }}{{ m.name }} ✎</button>
            <span v-else class="pname">{{ m.id === data.host ? '👑 ' : '' }}{{ m.name }}</span>
            <span class="pstate">
              <i v-if="!m.bot" class="ping-dot" :style="{ '--c': pingHex(pingColors[m.id]) }" title="สี Ping" />
              {{ m.bot ? '🤖 บอท' : m.ready ? '✓ พร้อม' : 'ยังไม่พร้อม' }}
              <i v-if="voice.roster[m.id]" :title="voiceTitle(m.id)">{{ voice.roster[m.id].m ? '🔇' : '🎙️' }}</i>
            </span>
            <!-- 3 survivor players: one of them plays two survivors -->
            <button
              v-if="doubleId"
              type="button"
              class="double"
              :class="{ on: doubleId === m.id }"
              :disabled="session.busy || doubleId === m.id || (!isHost && m.id !== session.me)"
              :title="doubleId === m.id ? 'คนนี้คุม Survivor 2 ตัว' : 'ให้คนนี้คุม Survivor 2 ตัว'"
              @click.stop="setDouble(m.id)"
            >
              {{ doubleId === m.id ? '👥 คุม 2 ตัว' : 'ให้คุม 2 ตัว' }}
            </button>
            <button v-if="canKick(m.id)" type="button" class="kick" :title="m.bot ? 'เอาบอทออก' : 'เตะออกจากห้อง'" @click.stop="m.bot ? dropBot(m.id) : kick(m.id)">✕</button>
          </template>
          <template v-else>
            <span class="pname">ว่าง</span>
            <span class="pstate">{{ me?.side === 'survivor' ? 'คลิกเพื่อย้ายมาที่นี่' : 'คลิกเพื่อเป็น Survivor' }}</span>
            <button v-if="isHost" type="button" class="bot-add" :disabled="session.busy || survivorCount >= 4" @click.stop="seatBot('survivor', i)">🤖 เพิ่มบอท</button>
          </template>
        </component>
      </div>

      <!-- the picks: each character as it is picked (the killer's hidden from the survivors) -->
      <div v-else class="places">
        <div v-if="amKiller || !mySeat || roomSettings.showKiller" class="place killer" :style="{ '--i': 0 }" :class="{ me: amKiller, ready: seatDone(KILLER_PLAYER) === true, 'hero-place': amKiller }">
          <span class="side-tag">KILLER</span>
          <span class="figure killer">
            <img v-if="killerChar" class="strip" :src="asset(killerChar.images.boardTh)" :alt="killerChar.name" draggable="false" />
            <span v-else class="pillar" aria-hidden="true"><span class="plus">?</span></span>
          </span>
          <span class="pname">{{ data.seats[String(KILLER_PLAYER)]?.name ?? '' }}{{ amKiller ? ' (คุณ)' : '' }}</span>
          <span class="pstate">{{ killerChar?.name ?? (amKiller ? 'เลือกฆาตกร' : '???') }}</span>
          <span class="done-mark">{{ seatDone(KILLER_PLAYER) === null ? '' : seatDone(KILLER_PLAYER) ? '✓' : '…' }}</span>
        </div>
        <span v-if="!mySeat || (!amKiller && roomSettings.showKiller)" class="vs" aria-hidden="true">VS</span>
        <component
          :is="s.mine && !locked ? 'button' : 'div'"
          v-for="s in survivorSlots"
          :key="s.slot"
          class="place survivor"
          :style="{ '--i': s.slot + 1 }"
          :class="{ me: s.mine, active: s.mine && activeSlot === s.slot && !locked, ready: seatDone(s.player) === true, }"
          @click="s.mine && !locked ? ((activeSlot = s.slot), (tab = 'chars')) : undefined"
        >
          <span class="side-tag">SURVIVOR {{ s.slot + 1 }}</span>
          <span class="figure">
            <img v-if="s.character" class="strip" :src="asset(s.character.images.boardTh)" :alt="s.character.name" draggable="false" />
            <span v-else class="pillar" aria-hidden="true"><span class="plus">?</span></span>
          </span>
          <span class="pname">{{ s.bot ? '🤖 ' : '' }}{{ s.who }}{{ s.mine ? ' (คุณ)' : '' }}</span>
          <span class="pstate">{{ s.character?.name ?? (s.mine ? 'เลือกตัวละคร' : s.bot ? 'บอทเลือกหลังผู้เล่น' : 'กำลังเลือก…') }}</span>
          <span class="done-mark">{{ seatDone(s.player) ? '✓' : '…' }}</span>
        </component>
      </div>
      <p v-if="inLobby" class="split">{{ splitNote }}</p>

      <!-- this player's character, big: the portrait from their board -->
      <!-- the killer only: a survivor stands in the team's line, as big as the others -->
      <figure v-if="hero && mySide === 'killer'" class="hero killer">
        <img :src="hero.src" :alt="hero.name" draggable="false" />
        <figcaption>{{ hero.name }}</figcaption>
      </figure>
      <figure v-else-if="mySide === 'killer'" class="hero placeholder killer">
        <span class="pillar big" aria-hidden="true"><span class="plus">?</span></span>
        <figcaption class="ph-cap">
          <b>{{ me?.name }}</b>
          <small>{{ inLobby ? (me?.ready ? '✓ พร้อม' : 'ยังไม่พร้อม') : 'เลือกตัวละคร' }}</small>
        </figcaption>
      </figure>
    </section>

    <!-- ================= the panel of the rail's tab ================= -->
    <Transition name="panel">
    <section v-if="tab" class="panel" :aria-label="TABS.find((t) => t.id === tab)?.label">
      <header class="panel-head">
        <i class="ring" :class="mySide ?? ''" />
        <div>
          <b>{{ myCharacter?.c?.name ?? me?.name ?? '' }}</b>
          <small>{{ TABS.find((t) => t.id === tab)?.label }}</small>
        </div>
        <button type="button" class="close" aria-label="ปิดแผง" @click="tab = null">✕</button>
      </header>
      <p v-if="tabLocked[tab]" class="locked-note">🔒 {{ tabLocked[tab] }}</p>

      <!-- ===== ตัวละคร ===== -->
      <template v-if="tab === 'chars'">
        <!-- the lobby: which side -->
        <div v-if="inLobby" class="sides">
          <button type="button" class="side-btn killer" :class="{ on: me?.side === 'killer' }" :disabled="session.busy || (killerTaken && me?.side !== 'killer')" @click="side('killer')">
            <b>ฆาตกร</b><small>{{ killerTaken && me?.side !== 'killer' ? 'มีคนเลือกแล้ว' : '1 คน' }}</small>
          </button>
          <button type="button" class="side-btn survivor" :class="{ on: me?.side === 'survivor' }" :disabled="session.busy || (survivorCount >= 4 && me?.side !== 'survivor')" @click="side('survivor')">
            <b>ผู้รอดชีวิต</b><small>{{ survivorCount }}/4 คน</small>
          </button>
          <button type="button" class="side-btn watch" :class="{ on: !me?.side }" :disabled="session.busy || !me?.side" @click="watchOnly">
            <b>ผู้ชม</b><small>ดูเกมอย่างเดียว</small>
          </button>
          <p class="note">{{ splitNote }}</p>
          <p class="note">ตัวละครเลือกได้เมื่อทุกคนกดพร้อม แล้วหัวห้องกดดำเนินเกม</p>
        </div>

        <!-- the Banlist (room setting): each side bans characters of the other -->
        <template v-else-if="!bansDone && mySeat">
          <h3>🚫 แบนตัวละคร{{ amKiller ? ' Survivor' : ' Killer' }}</h3>
          <p class="note">
            {{
              amKiller
                ? `คุณแบน Survivor ได้ไม่เกิน ${roomSettings.banCount} ตัว — Survivor จะไม่เห็นจนกว่าทั้งสองฝั่งยืนยัน`
                : `ทีม Survivor ช่วยกันแบน Killer ได้ไม่เกิน ${roomSettings.banCount} ตัว (ใครแก้ก็ต้องยืนยันใหม่ทุกคน) — Killer จะไม่เห็นจนกว่าทั้งสองฝั่งยืนยัน`
            }}
          </p>
          <BanPicker :kind="amKiller ? 'survivor' : 'killer'" :banned="myBans" :max="roomSettings.banCount" :locked="myBansLocked" @toggle="toggleBan" />
        </template>

        <template v-else-if="mySeat">
          <p v-if="roomSettings.banlist && revealedBans.length" class="banned">
            🚫
            <span v-for="id in revealedBans" :key="id">{{ (survivorById.get(id) ?? killerById.get(id))?.name }}</span>
          </p>
          <p v-if="roomSettings.random" class="note">🎲 หัวห้องตั้งให้สุ่มตัวละครทุกคน — ดูบนแท่น แล้วกดล็อกที่มุมขวาล่าง</p>
          <!-- a player with several survivors: which one is being picked -->
          <div v-if="mySlots.length > 1 && !roomSettings.random" class="slot-tabs">
            <button v-for="s in mySlots" :key="s" type="button" :class="{ on: activeSlot === s }" :disabled="locked" @click="activeSlot = s">
              Survivor {{ s + 1 }}<small>{{ survivorById.get(data.picks[String(s)] ?? '')?.name ?? 'ยังไม่เลือก' }}</small>
            </button>
          </div>
          <CharacterPicker
            v-if="mySlots.length && !roomSettings.random"
            kind="survivor"
            :taken="[...takenByOthers]"
            :banned="revealedBans"
            :selected="myPicks"
            :remaining="mySlots.length - myPicks.length"
            :locked="locked"
            taken-label="เพื่อนเลือกแล้ว"
            :roll-title="activeSlot !== null ? `สุ่ม Survivor ตัวที่ ${activeSlot + 1}` : ''"
            @pick="pickSurvivor"
            @unpick="unpickSurvivor"
          />
          <CharacterPicker
            v-if="amKiller && !roomSettings.random"
            kind="killer"
            :selected="data.picks.killer ? [data.picks.killer] : []"
            :banned="revealedBans"
            :remaining="data.picks.killer ? 0 : 1"
            :locked="locked"
            @pick="pickKiller"
            @unpick="unpickKiller"
          />
          <p v-if="locked" class="note">🔒 ล็อกแล้ว — กดที่มุมขวาล่างเพื่อแก้</p>
        </template>
        <p v-else class="note">คุณไม่ได้อยู่ในเกมนี้ — รอดูได้เมื่อเกมเริ่ม</p>
      </template>

      <!-- ===== อุปกรณ์ ===== -->
      <template v-else-if="tab === 'gear'">
        <template v-if="!tabLocked.gear && mySeat">
          <!-- a player with several characters: whose perks -->
          <div v-if="myLoadouts.length > 1" class="slot-tabs">
            <button v-for="c in myLoadouts" :key="c.key" type="button" :class="{ on: shownLoadout?.key === c.key }" @click="loadoutKey = c.key">
              {{ c.side === 'killer' ? 'Killer' : `Survivor ${Number(c.key) + 1}` }}<small>{{ roomSettings.mode === 'adept' ? 'Perk บนกระดาน' : perkDone(c.key) ? '✓ ยืนยันแล้ว' : 'ยังไม่ยืนยัน' }}</small>
            </button>
          </div>
          <!-- as the PC game's: พลัง, Passive | เครื่องเซ่น on top, the perks, then the store (perks or offerings) -->
          <PerkLoadout
            v-if="shownLoadout"
            :key="shownLoadout.key"
            bare
            :readonly="roomSettings.mode === 'adept'"
            :model-value="shownLoadout.perks"
            :side="shownLoadout.side"
            :character-id="shownLoadout.id"
            :mode="roomSettings.mode"
            :who="shownLoadout.side === 'killer' ? 'Killer' : `Survivor ${Number(shownLoadout.key) + 1}`"
            :choices="roomSettings.mode === 'adept' ? [] : cardChoices(roomSettings.mode, shownLoadout, perkHands[shownLoadout.key])"
            :taken="perkTaken(shownLoadout.key)"
            :problem="roomSettings.mode === 'adept' ? '' : perkProblem(shownLoadout.key, shownLoadout.perks)"
            :confirmed="roomSettings.mode === 'adept' || perkDone(shownLoadout.key)"
            :offering="offeringSlot"
            @update:model-value="(p: PerkId[]) => setLoadout(shownLoadout!.key, p)"
            @confirm="(on: boolean) => confirmLoadout(shownLoadout!.key, on)"
            @offerings="pickOfferings"
            @confirm-offerings="confirmMyOfferings"
          />
        </template>
        <p v-else-if="!mySeat && !inLobby" class="note">คุณไม่ได้อยู่ในเกมนี้ — รอดูได้เมื่อเกมเริ่ม</p>
      </template>

      <!-- ===== แผนที่ ===== -->
      <template v-else-if="tab === 'map'">
        <template v-if="!inLobby">
          <MapPicker v-if="mayPickBoard" :model-value="data.board ?? ''" @update:model-value="setBoard" />
          <MapPicker v-else-if="mapDone" :model-value="data.board ?? 'macmillan'" :chooser="boardChooser" readonly />
          <p v-else class="note">รอ{{ boardChooser }}เลือกแผนที่…</p>
        </template>
      </template>

      <!-- ===== ห้อง ===== -->
      <template v-else>
        <RoomSettingsCard />
        <!-- the colour of this player's pings in the game: one each, none the same -->
        <div v-if="me" class="ping-pick" role="radiogroup" aria-label="สี Ping ของคุณ">
          <span class="label">📍 สี Ping ของคุณ</span>
          <small class="note">ระหว่างเกมคลิกขวาบนแผนที่ หรือชี้แล้วกด Q (แท็บเล็ต: กดค้าง) — ทุกคนในห้องเห็น รวม Killer</small>
          <span class="swatches">
            <button
              v-for="c in PING_COLORS"
              :key="c.id"
              type="button"
              role="radio"
              class="swatch"
              :class="{ on: pingColors[session.me] === c.id, taken: !!colorHolder(c.id) }"
              :style="{ '--c': c.hex }"
              :aria-checked="pingColors[session.me] === c.id"
              :disabled="session.busy || !!colorHolder(c.id)"
              :title="colorHolder(c.id) ? `${c.name} — ${colorHolder(c.id)} ใช้อยู่` : c.name"
              @click="setPingColor(c.id)"
            >
              <span v-if="colorHolder(c.id)" class="holder">{{ colorHolder(c.id)!.slice(0, 1) }}</span>
            </button>
          </span>
        </div>
        <div v-if="bench.length" class="bench">
          <span class="label">ผู้ชม (ยังไม่เลือกฝั่ง)</span>
          <span v-for="m in bench" :key="m.id" class="bench-chip" :class="{ me: m.id === session.me, talking: talking(m.id) }">
            <i class="ping-dot" :style="{ '--c': pingHex(pingColors[m.id]) }" />{{ m.id === data.host ? '👑 ' : '' }}{{ m.name }}{{ m.id === session.me ? ' (คุณ)' : '' }}
            <button v-if="canKick(m.id)" type="button" class="kick small" title="เตะออกจากห้อง" @click.stop="kick(m.id)">✕</button>
          </span>
        </div>
      </template>
    </section>
    </Transition>

    <!-- the room's chat: above the button, as the PC game's -->
    <section v-if="session.room?.chat" class="chat-box" aria-label="แชทในห้อง">
      <ChatPanel />
    </section>

    <!-- the foot: leaving on the left, the one button that moves things on in the corner -->
    <footer class="foot">
      <button type="button" class="back-btn" @click="leaveRoom">‹ ออกจากห้อง</button>
      <button v-if="isHost && !inLobby" type="button" class="back-btn" @click="backToLobby">‹ กลับ Lobby</button>
      <p v-if="session.error" class="error">{{ session.error }}</p>
      <span class="grow" />
      <div v-if="undos.length" class="undos">
        <button v-for="u in undos" :key="u.key" type="button" class="undo-btn" :disabled="session.busy" @click="u.run">{{ u.label }}</button>
      </div>
      <div :key="action.label" class="go" :class="{ primary: action.primary, done: action.done }">
        <button type="button" class="go-btn" :disabled="session.busy || (!action.run && !action.open)" @click="runAction">{{ action.label }}</button>
        <p class="go-note">{{ action.note }}</p>
      </div>
    </footer>

    <LfgPostDialog
      :open="lfgOpen"
      :name="data.members[session.me]?.name ?? ''"
      :room="code"
      :room-name="data.name"
      :need="lobbyLacks(data.members)"
      @close="lfgOpen = false"
      @posted="onLfgPosted"
    />
  </div>
</template>

<style scoped>
/* ---------- the room: the whole page under the top bar ---------- */
.pc-room {
  --rail: 92px;
  --head: 76px;
  --foot: 84px;
  --slate: 48 56 64;
  position: relative;
  height: var(--vh, 100vh);
  min-height: 600px;
  overflow: hidden;
  color: #ece6e6;
}
/* The campfire is alive: its light swells and falls over the whole room. Slow, and at 7 s out of
   step with the scene's own 40 s drift (App.vue), so the two never beat together. */
.firepulse {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse 34% 30% at 47% 56%, rgb(255 150 60 / 0.16), transparent 70%);
  animation: firepulse 7s ease-in-out infinite;
}
@keyframes firepulse {
  0%,
  100% {
    opacity: 0.5;
  }
  38% {
    opacity: 1;
  }
  62% {
    opacity: 0.7;
  }
}
/* Fog in front of everyone, not only behind them (`App.vue` drifts its own behind the scene):
   two slow banks, far apart in pace, so the room has air between the camera and the fire. Thin
   enough to read through — it sits under the rail, the header and the panel. */
.roomfog {
  position: absolute;
  inset: -10%;
  /* above `.scene` (2), which holds the figures, and below the rail, the header and the panel */
  z-index: 3;
  pointer-events: none;
  background:
    radial-gradient(ellipse 45% 18% at 30% 72%, rgb(190 205 225 / 0.07), transparent 70%),
    radial-gradient(ellipse 38% 14% at 72% 64%, rgb(190 205 225 / 0.05), transparent 70%);
  animation: roomfog 85s ease-in-out infinite alternate;
}
@keyframes roomfog {
  to {
    transform: translate3d(6%, -2%, 0) scale(1.08);
  }
}

/* ---------- changing sides: the camera walks round the fire ----------
   Each side sees its own scene across the fire, so changing sides is a move, not a redraw. The
   near ground (`.scene`: the line and your own figure) swings the furthest, the light behind it
   a third as far, and a bank of fog blows through while the swap happens underneath. `--turn` on
   the room says which way: the killer's view is one side of the fire, the survivors' the other.
   All three are keyed by the side in the template, so they play on the change and nowhere else. */
.scene {
  animation: turn-near 520ms cubic-bezier(0.22, 0.75, 0.3, 1);
}
.light {
  position: absolute;
  inset: 0;
  pointer-events: none;
  animation: turn-far 620ms cubic-bezier(0.22, 0.75, 0.3, 1);
}
@keyframes turn-near {
  from {
    opacity: 0.25;
    transform: translateX(calc(var(--turn, 0) * 7%)) scale(1.03);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes turn-far {
  from {
    transform: translateX(calc(var(--turn, 0) * 2.2%)) scale(1.02);
  }
  to {
    transform: none;
  }
}
/* The gust: not mist but the dark itself, rolling through in the way the camera went and gone
   again — The Entity's, so its red is in the low edge of it, as the scene's own glow is. Dense
   enough to take the room while the swap happens underneath. */
.fogsweep {
  position: absolute;
  inset: -15%;
  z-index: 3;
  pointer-events: none;
  opacity: 0;
  background:
    radial-gradient(ellipse 46% 60% at 32% 54%, rgb(5 3 5 / 0.88), rgb(8 5 8 / 0.5) 45%, transparent 72%),
    radial-gradient(ellipse 58% 50% at 64% 62%, rgb(7 4 7 / 0.78), transparent 74%),
    radial-gradient(ellipse 70% 30% at 50% 100%, rgb(90 10 18 / 0.3), transparent 70%);
  animation: fogsweep 760ms ease-out;
}
@keyframes fogsweep {
  0% {
    opacity: 0;
    transform: translateX(calc(var(--turn, 0) * 26%)) scale(1.05);
  }
  28% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateX(calc(var(--turn, 0) * -16%)) scale(1.16);
  }
}

/* the side's colour over the campfire (App draws the campfire behind every page) */
.tint {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgb(0 0 0 / 0.25), rgb(0 0 0 / 0.1) 45%, rgb(0 0 0 / 0.55));
}
.killer > .tint {
  background:
    /* a dark blood-red, not a wash of it: the scene stays readable (the players found it too red) */
    radial-gradient(ellipse at 70% 25%, rgb(170 20 30 / 0.14), transparent 60%),
    linear-gradient(180deg, rgb(70 6 12 / 0.4), rgb(35 2 8 / 0.28) 45%, rgb(6 0 2 / 0.66));
}
.survivor > .tint {
  background:
    radial-gradient(ellipse at 70% 30%, rgb(90 130 180 / 0.18), transparent 60%),
    linear-gradient(180deg, rgb(10 30 60 / 0.4), rgb(5 15 30 / 0.2) 45%, rgb(0 4 10 / 0.6));
}

/* ---------- the rail ---------- */
.rail {
  position: absolute;
  z-index: 6;
  left: 0;
  top: 0;
  bottom: 0;
  width: var(--rail);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 18px 0;
  background: linear-gradient(90deg, rgb(0 0 0 / 0.7), rgb(0 0 0 / 0.35));
}
.rail-btn {
  position: relative;
  width: 66px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 0 6px;
  background: rgb(10 8 9 / 0.85);
  border: 1px solid #2a2224;
  border-radius: 0;
  color: #e8e1e1;
  font-size: 0.72rem;
}
.rail-btn svg {
  width: 30px;
  height: 30px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
}
.rail-btn:hover {
  border-color: #c4a46a;
}
.rail-btn.on {
  background: #1b1416;
  border-color: #d9d2c3;
  box-shadow: 0 0 0 1px #d9d2c3;
}
/* the role switch: lower on the rail, its label beside it on hover (as the PC game's) */
.role-btn {
  margin-top: auto;
  margin-bottom: 22vh;
  padding: 12px 0;
}
.role-btn svg {
  width: 34px;
  height: 34px;
}
.swap {
  position: absolute;
  top: 2px;
  left: 4px;
  font-size: 0.8rem;
  color: #ff5a5a;
}
.rail-tip {
  position: absolute;
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  white-space: nowrap;
  padding: 6px 10px;
  background: rgb(10 8 9 / 0.92);
  border: 1px solid #3a3133;
  font-size: 0.9rem;
  color: #eee;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}
.role-btn:hover .rail-tip,
.role-btn:focus-visible .rail-tip {
  opacity: 1;
}
/* the panel where something waits for this player: a glow until opened */
.rail-btn.ask {
  border-color: #f5c542;
  color: #ffd27a;
  background: rgb(60 44 10 / 0.9);
  box-shadow: 0 0 0 2px #f5c542, 0 0 18px rgb(245 197 66 / 0.75);
  animation: ask 1.2s ease-in-out infinite;
}
/* a "!" on its corner, as the PC game's notice */
.rail-btn.ask::after {
  content: '!';
  position: absolute;
  top: -8px;
  right: -8px;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #c8141d;
  border: 2px solid #fff;
  color: #fff;
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1;
}
@keyframes ask {
  50% {
    box-shadow: 0 0 0 2px #f5c542, 0 0 30px rgb(245 197 66 / 0.95);
    transform: scale(1.05);
  }
}

/* ---------- the room's name and code ---------- */
.top {
  position: absolute;
  z-index: 4;
  left: calc(var(--rail) + 24px);
  right: 300px;
  top: 14px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
}
.title small {
  display: block;
  font-family: var(--font-display);
  font-size: 0.78rem;
  letter-spacing: 0.14em;
  color: #d9a3a3;
}
.title h1 {
  margin: 0;
  font-size: 1.6rem;
  color: #fff;
  text-shadow: 0 2px 10px #000;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: rgb(10 8 9 / 0.8);
  border: 1px solid #3a3133;
  border-radius: 0;
  color: #e8e1e1;
  font-family: var(--font-display);
  font-size: 0.92rem;
}
.chip.code small {
  color: var(--muted);
  font-size: 0.75rem;
}
.chip.code strong {
  letter-spacing: 0.12em;
  color: #ffd27a;
}
.grow {
  flex: 1;
}
/* The settings button sits with the room's other buttons (the page's top bar is gone here).
   Its component has two root nodes, so no scoped class of ours lands on it: reached with :deep. */
.top :deep(.settings-btn) {
  flex: none;
  width: auto;
  min-width: 0;
  padding: 8px 12px;
  background: rgb(10 8 9 / 0.8);
  border: 1px solid #3a3133;
  border-radius: 0;
  color: #e8e1e1;
  font-size: 1.05rem;
  line-height: 1;
  cursor: pointer;
}
.top :deep(.settings-btn:hover) {
  border-color: #6b585c;
}
/* a panel open covers the room's name, as the PC game's does (it would show through) */
.panel-open .top {
  visibility: hidden;
}

/* ---------- this player, in the corner ---------- */
.me-box {
  position: absolute;
  z-index: 4;
  right: 24px;
  top: 14px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.me-name {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  background: none;
  border: none;
  color: inherit;
  text-align: right;
}
.me-name span {
  font-size: 1.05rem;
  color: #f2eeee;
  text-shadow: 0 1px 6px #000;
}
.role-ico {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
}
/* the killer's name in red, as the PC game's */
.me-name.killer {
  color: #ff4040;
}
.me-name.killer span {
  color: #ff4a4a;
}
.ring {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  border: 3px solid #6b5f5f;
  background: rgb(20 14 16 / 0.85);
  font-family: var(--font-display);
  font-style: normal;
  font-size: 1.4rem;
  color: #fff;
}
.ring.killer {
  border-color: #b3262e;
}
.ring.survivor {
  border-color: #5f8fbf;
}
/* the perks worn, as the PC game's diamond of three under the name */
.worn {
  position: relative;
  width: 168px;
  height: 140px;
}
.worn img {
  position: absolute;
  width: 78px;
  height: 78px;
  cursor: help;
  transition: transform 0.15s, filter 0.15s;
}
.worn img:hover,
.worn img:focus-visible {
  z-index: 1;
  transform: scale(1.12);
  filter: brightness(1.2);
  outline: none;
}
.worn .w0 {
  left: 45px;
  top: 0;
}
.worn .w1 {
  left: 0;
  top: 45px;
}
.worn .w2 {
  left: 90px;
  top: 45px;
}

/* ---------- the scene: the places ---------- */
.scene {
  position: absolute;
  inset: 0;
  z-index: 2;
}
.places {
  position: absolute;
  left: calc(var(--rail) + 2%);
  right: 46%;
  bottom: calc(var(--foot) + 70px);
  display: flex;
  /* the figures in one line along their tops, whatever is written under each */
  align-items: flex-start;
  justify-content: center;
  gap: 18px;
}
.vs {
  align-self: center;
  font-family: var(--font-display);
  font-size: 1.6rem;
  color: rgb(255 255 255 / 0.55);
  text-shadow: 0 0 12px #000;
}
/* a place: the character standing (or a dark pillar), the name plate under it */
.place {
  /* `100vh - 400px` keeps the labels clear of the room header, however short the screen:
     the line hangs from the bottom, so a tall figure pushes them up into it. */
  --fig-h: clamp(210px, min(38vh, 100vh - 400px), 340px);
  position: relative;
  flex: 0 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  padding: 0 4px 8px;
  background: none;
  border: none;
  border-radius: 0;
  color: inherit;
  text-align: center;
}
button.place {
  cursor: pointer;
}
button.place:hover:not(:disabled) .figure {
  filter: brightness(1.25) drop-shadow(0 0 12px rgb(255 255 255 / 0.35));
}
/* An empty seat answers the pointer: the pillar lifts a little and its edge takes the colour of
   the side it would put you on, so it reads as a place to step into and not just a bright patch. */
.pillar {
  transition:
    transform 180ms cubic-bezier(0.2, 0.7, 0.3, 1),
    box-shadow 180ms ease;
}
button.place:hover:not(:disabled) .pillar,
button.place:focus-visible:not(:disabled) .pillar {
  transform: translateY(-6px);
  box-shadow: inset 0 0 0 1px rgb(245 197 66 / 0.5), 0 10px 22px rgb(0 0 0 / 0.5), 0 0 20px rgb(245 197 66 / 0.3);
}
button.place.killer:hover:not(:disabled) .pillar,
button.place.killer:focus-visible:not(:disabled) .pillar {
  box-shadow: inset 0 0 0 1px rgb(200 50 58 / 0.6), 0 10px 22px rgb(0 0 0 / 0.5), 0 0 20px rgb(179 38 46 / 0.4);
}
/* this player's own place, while their character stands big on the right: not twice */
.place.hero-place {
  display: none;
}
/* above the place: nothing on it (a kick, a tall empty place) covers it */
.side-tag {
  position: absolute;
  top: -22px;
  white-space: nowrap;
  font-family: var(--font-display);
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  color: rgb(255 255 255 / 0.45);
}
.place.killer .side-tag {
  color: rgb(255 120 120 / 0.65);
}
/* the character standing: the portrait strip on the left of its board, as the big one on the right */
.figure {
  position: relative;
  height: var(--fig-h);
  /* the strip down to above the board's ITEM CARD label */
  aspect-ratio: 0.421;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(180deg, #000 70%, transparent), linear-gradient(90deg, transparent, #000 16%, #000 84%, transparent), radial-gradient(ellipse 52% 22% at 0 0, transparent 72%, #000 100%);
  -webkit-mask-composite: source-in, source-in;
  mask-image: linear-gradient(180deg, #000 70%, transparent), linear-gradient(90deg, transparent, #000 16%, #000 84%, transparent), radial-gradient(ellipse 52% 22% at 0 0, transparent 72%, #000 100%);
  mask-composite: intersect;
  transition: filter 0.15s;
}
.figure.killer {
  aspect-ratio: 0.334;
}
.strip {
  position: absolute;
  left: 0;
  top: 0;
  width: 392%;
  max-width: none;
}
/* nobody's character yet: a dark pillar of the Entity's, as the PC game's empty places */
.pillar {
  position: absolute;
  inset: 0 18%;
  display: flex;
  justify-content: center;
  padding-top: 32%;
  background:
    repeating-linear-gradient(90deg, rgb(0 0 0 / 0) 0 5px, rgb(0 0 0 / 0.55) 5px 7px, rgb(0 0 0 / 0) 7px 11px),
    linear-gradient(180deg, rgb(0 0 0 / 0.05), rgb(0 0 0 / 0.6) 55%, rgb(0 0 0 / 0.85));
}
.plus {
  font-size: 3.4rem;
  font-weight: 300;
  line-height: 1;
  color: rgb(255 255 255 / 0.85);
  text-shadow: 0 0 14px rgb(0 0 0 / 0.9);
}

/* ---------- the lobby comes alive ----------
   Every place is keyed by who sits in it, so it mounts afresh when someone arrives, leaves or
   picks a character: these play on that mount. Durations are written at full length — the
   animation-speed setting scales them (`settings.ts`). Nothing needs a reduce-motion rule:
   `html.reduce-motion *` in style.css cuts every animation page-wide, and each of these ends on
   the element's resting state, so it simply arrives there at once.
   The fire's light rides the `.strip` and the `.pillar`, never `.figure`: that one's `filter` is
   spoken for by hovering a seat and by `.me`, and an animation there would beat both. The one
   exception is `.talking`, which animates it on purpose — someone speaking outranks a hover. */

/* A character picked: they rise out of the dark where the pillar stood, and from then on they
   stand in the fire's light — the same 7 s as `.firepulse`, so the two breathe together and the
   light reads as coming from the fire. (One shorthand, so the breath cannot restart the rise.) */
.strip {
  animation:
    stand-up 900ms cubic-bezier(0.2, 0.7, 0.3, 1),
    firelight 7s ease-in-out 900ms infinite;
}
.pillar {
  animation: firelight 7s ease-in-out infinite;
}
@keyframes firelight {
  0%,
  100% {
    filter: brightness(1) saturate(1);
  }
  38% {
    filter: brightness(1.12) saturate(1.1);
  }
  62% {
    filter: brightness(0.96) saturate(0.97);
  }
}
@keyframes stand-up {
  from {
    opacity: 0;
    transform: translateY(5%) scale(1.04);
    filter: brightness(0.25) contrast(1.2);
  }
  55% {
    opacity: 1;
    filter: brightness(1.5);
  }
  to {
    opacity: 1;
    transform: none;
    filter: none;
  }
}
/* and one flare of the side's colour from the ground up as they appear */
.place .figure::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  background: linear-gradient(0deg, rgb(245 197 66 / 0.75), transparent 60%);
}
.place.killer .figure::after {
  background: linear-gradient(0deg, rgb(179 38 46 / 0.8), transparent 60%);
}
.place:not(.empty) .figure::after {
  animation: lit 1100ms ease-out;
}
@keyframes lit {
  0% {
    opacity: 0;
  }
  25% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

/* Someone arrives, or the seat empties: the place fades up from below, so a change in the line is
   seen as it happens and not noticed afterwards — and the whole line builds itself left to right
   when the room turns to the picks, each place `--i` behind the last. `backwards` holds it down
   through its wait (without it, it would show first and then drop to start); no `forwards`, so a
   hover still has its say afterwards. One seat filling waits up to 280 ms, which reads as the
   place lighting up rather than a lag. */
.place {
  animation: seat-in 450ms ease-out backwards;
  animation-delay: calc(var(--i, 0) * 70ms);
}
@keyframes seat-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* The ✓ when a seat is ready: it pops, and a ring opens out of it. */
.place.ready .done-mark {
  animation: tick-pop 520ms cubic-bezier(0.2, 1.5, 0.4, 1);
}
.place.ready .done-mark::after {
  content: '';
  position: absolute;
  inset: -6px;
  border: 2px solid #7fe08f;
  border-radius: 50%;
  opacity: 0;
  animation: tick-ring 700ms ease-out;
}
@keyframes tick-pop {
  from {
    transform: scale(0.2);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}
@keyframes tick-ring {
  from {
    opacity: 0.9;
    transform: scale(0.4);
  }
  to {
    opacity: 0;
    transform: scale(2.2);
  }
}
.place.me .figure,
.place.active .figure {
  filter: drop-shadow(0 0 10px rgb(245 197 66 / 0.55));
}
/* Speaking: the glow breathes. Held at one value it said only "their mic is on". */
.place.talking .figure {
  filter: drop-shadow(0 0 12px rgb(79 179 106 / 0.8));
  animation: speaking 900ms ease-in-out infinite;
}
@keyframes speaking {
  0%,
  100% {
    filter: drop-shadow(0 0 8px rgb(79 179 106 / 0.55));
  }
  50% {
    filter: drop-shadow(0 0 18px rgb(79 179 106 / 0.95));
  }
}
.place.me .pname {
  color: #ffd27a;
}
.pname {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-display);
  font-size: 1rem;
  color: #fff;
  background: none;
  border: none;
  padding: 0;
}
.pname.mine {
  cursor: pointer;
  text-decoration: underline dotted rgb(255 255 255 / 0.4);
}
.pstate {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.85rem;
  color: #f0a35a;
}
.place.ready .pstate {
  color: #7fe08f;
}
.place.empty .pstate {
  color: #cfc6c6;
}
.done-mark {
  position: absolute;
  top: 8px;
  right: 14px;
  font-size: 1.1rem;
  color: #f0a35a;
}
.place.ready .done-mark {
  color: #7fe08f;
}
.ping-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--c);
  display: inline-block;
}
.hint {
  font-size: 0.75rem;
  color: var(--muted);
}
.kick {
  position: absolute;
  top: 4px;
  right: 4px;
  padding: 2px 7px;
  font-size: 0.8rem;
  background: rgb(10 8 9 / 0.85);
  border: 1px solid #5a2a2e;
  color: #ff8a8a;
}
.kick.small {
  position: static;
  padding: 0 5px;
}
.bot-add,
.double,
.bot-pick {
  font-size: 0.78rem;
  padding: 4px 8px;
  background: rgb(10 8 9 / 0.85);
  border: 1px solid #3a3133;
  color: #cfc6c6;
  max-width: 100%;
}
.double.on {
  border-color: #f5c542;
  color: #ffd27a;
}
/* the killer's seat, for a survivor (whose scene has no killer on it): top of the scene */
/* In the room's own header row, with the code and the invite link. It used to float under the
   room's name, over the lineup's band: the two were 9px apart at best and crossed on a short or
   narrow screen, where the line of figures (bottom-anchored, `50vh` tall) climbs into it — it
   covered SURVIVOR 1 (a player's report). The header is a wrapping row, so nothing can collide. */
.killer-seat {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: rgb(10 8 9 / 0.8);
  border: 1px solid #5a2a2e;
  border-left: 4px solid #b3262e;
}
.ks-label {
  font-family: var(--font-display);
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  color: #ff8a8a;
}
.killer-seat b {
  font-family: var(--font-display);
  color: #fff;
}
.killer-seat b.empty {
  color: #cfc6c6;
}
.killer-seat small {
  color: #f0a35a;
}
.killer-seat small.ok {
  color: #7fe08f;
}
.ks-btn {
  font-size: 0.85rem;
  padding: 5px 10px;
  background: rgb(10 8 9 / 0.85);
  border: 1px solid #3a3133;
  color: #e8e1e1;
}
.ks-btn.add {
  border-color: #b3262e;
}
.split {
  position: absolute;
  left: calc(var(--rail) + 2%);
  right: 46%;
  bottom: calc(var(--foot) + 40px);
  margin: 0;
  text-align: center;
  font-size: 0.85rem;
  color: rgb(255 255 255 / 0.6);
  text-shadow: 0 1px 6px #000;
}

/* this player's character, big on the right: the portrait strip of their board */
.hero {
  position: absolute;
  z-index: 1;
  right: calc(min(400px, 34%) + 48px);
  bottom: 0;
  margin: 0;
  height: 78%;
  /* the strip down to above the board's ITEM CARD label */
  aspect-ratio: 0.421;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(180deg, #000 70%, transparent), linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent), radial-gradient(ellipse 52% 22% at 0 0, transparent 72%, #000 100%);
  -webkit-mask-composite: source-in, source-in;
  mask-image: linear-gradient(180deg, #000 70%, transparent), linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent), radial-gradient(ellipse 52% 22% at 0 0, transparent 72%, #000 100%);
  mask-composite: intersect;
  pointer-events: none;
}
/* standing, not a photograph: the one figure big enough for a breath to read at all */
.hero img {
  animation: breathe 6.5s ease-in-out infinite;
  transform-origin: 50% 100%;
}
@keyframes breathe {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.012);
  }
}
/* the killer: bigger, as the PC game's (he towers over the survivors) */
.hero.killer {
  height: 92%;
  aspect-ratio: 0.334;
}
.hero img {
  position: absolute;
  left: 0;
  top: 0;
  width: 392%;
  max-width: none;
}
.hero figcaption {
  display: none;
}
/* no character yet: a tall pillar of the Entity's, fading in from above, the name under it */
.hero.placeholder,
.hero.placeholder.killer {
  height: 70%;
  -webkit-mask-image: none;
  mask-image: none;
}
.pillar.big {
  inset: 0 24% calc(var(--foot) + 64px);
  padding-top: 55%;
  -webkit-mask-image: linear-gradient(180deg, transparent, #000 22%);
  mask-image: linear-gradient(180deg, transparent, #000 22%);
}
.pillar.big .plus {
  font-size: 5rem;
}
.hero figcaption.ph-cap {
  position: absolute;
  left: 0;
  right: 0;
  /* above the foot (the corner button) */
  bottom: calc(var(--foot) + 8px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-shadow: 0 1px 8px #000;
}
.ph-cap b {
  font-family: var(--font-display);
  font-size: 1.3rem;
  color: #fff;
}
.ph-cap small {
  color: #f0a35a;
}
/* the killer looks at the survivors across the fire: they stand further off, smaller */
.pc-room.killer .place {
  /* Smaller again at the user's word: they are the ones being looked at, not the one looking,
     and the killer's own figure should carry the screen. Narrow enough that all four stay clear
     of him, and `100vh - 400px` keeps their labels out of the room header. */
  --fig-h: clamp(220px, min(42vh, 21vw, 100vh - 400px), 400px);
}
/* a survivor's team in one line, everyone the same size (the PC game's survivor lobby), up to the chat */
.pc-room.survivor .places,
.pc-room.survivor .split {
  right: calc(min(400px, 34%) + 40px);
}
.pc-room.survivor .place {
  --fig-h: clamp(260px, min(50vh, 100vh - 400px), 540px);
}
.pc-room.survivor .place.me .pname {
  font-size: 1.15rem;
}

/* ---------- the panel ---------- */
/* out of the rail it came, and back into it it goes (`panel` Transition in the template) */
.panel-enter-active,
.panel-leave-active {
  transition:
    transform 260ms cubic-bezier(0.2, 0.7, 0.3, 1),
    opacity 260ms ease;
}
.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateX(-28px);
}
.panel {
  position: absolute;
  z-index: 5;
  left: var(--rail);
  top: 0;
  bottom: var(--foot);
  width: min(980px, 60%, calc(100% - var(--rail)));
  overflow-y: auto;
  padding: 22px 30px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: linear-gradient(90deg, rgb(var(--slate) / 0.88) 0%, rgb(var(--slate) / 0.8) 88%, rgb(var(--slate) / 0.4));
  backdrop-filter: blur(3px);
  box-shadow: 12px 0 40px rgb(0 0 0 / 0.35);
}
.panel-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.panel-head .ring {
  width: 46px;
  height: 46px;
  background: none;
}
.panel-head b {
  display: block;
  font-family: var(--font-display);
  font-size: 1.25rem;
  color: #fff;
}
.panel-head small {
  color: #c9c3c3;
}
.close {
  margin-left: auto;
  padding: 4px 10px;
  background: rgb(10 12 14 / 0.6);
  border: 1px solid rgb(255 255 255 / 0.25);
  color: #ddd;
}
/* the pickers keep their own boxes elsewhere (offline); here they sit on the panel's slate */
.panel :deep(.loadout),
.panel :deep(.card) {
  background: rgb(0 0 0 / 0.22);
  border-color: rgb(255 255 255 / 0.12);
  box-shadow: none;
  backdrop-filter: none;
}
.panel h3 {
  margin: 0;
  font-size: 1.1rem;
}
.note {
  margin: 0;
  font-size: 0.9rem;
  color: #cfc8c8;
}
.locked-note {
  margin: 0;
  padding: 10px 14px;
  background: rgb(0 0 0 / 0.3);
  border-left: 3px solid #f0a35a;
  color: #f3dcc3;
}
.label {
  font-family: var(--font-display);
  font-size: 0.95rem;
  letter-spacing: 0.04em;
  color: #e3dcdc;
}
.sides {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.sides .note {
  grid-column: 1 / -1;
}
.side-btn {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 16px 10px;
  background: rgb(10 12 14 / 0.55);
  border: 1px solid rgb(255 255 255 / 0.18);
  border-radius: 0;
  color: #fff;
}
.side-btn b {
  font-family: var(--font-display);
  font-size: 1.15rem;
}
.side-btn small {
  color: #c9c3c3;
}
.side-btn.on {
  border-color: #f2ece4;
  box-shadow: 0 0 0 2px #f2ece4;
}
.side-btn.killer.on {
  background: rgb(110 14 22 / 0.6);
}
.side-btn.survivor.on {
  background: rgb(20 50 90 / 0.6);
}
.slot-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.slot-tabs button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 6px 12px;
  background: rgb(10 12 14 / 0.5);
  border: 1px solid rgb(255 255 255 / 0.18);
  border-radius: 0;
  color: #fff;
}
.slot-tabs button small {
  color: #c9c3c3;
}
.slot-tabs button.on {
  border-color: #f5c542;
  box-shadow: inset 0 -2px 0 #f5c542;
}
.banned {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
}
.banned span {
  padding: 2px 8px;
  background: rgb(120 20 30 / 0.5);
  border: 1px solid #7a2a30;
  font-size: 0.85rem;
}
.ping-pick {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.swatch {
  position: relative;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 50%;
  background: var(--c);
  border: 2px solid rgb(0 0 0 / 0.5);
}
.swatch.on {
  border-color: #fff;
  box-shadow: 0 0 0 2px var(--c);
}
.swatch.taken {
  opacity: 0.45;
}
.holder {
  font-size: 0.8rem;
  color: #000;
  font-weight: 700;
}
.bench {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.bench .label {
  width: 100%;
}
.bench-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgb(10 12 14 / 0.5);
  border: 1px solid rgb(255 255 255 / 0.18);
}
.bench-chip.me {
  border-color: #f5c542;
}

/* ---------- the chat, above the corner's button ---------- */
.chat-box {
  position: absolute;
  z-index: 3;
  right: 24px;
  bottom: calc(var(--foot) + 8px);
  width: min(400px, 34%);
  height: min(300px, 34%);
  display: flex;
  background: rgb(0 0 0 / 0.55);
  border: 1px solid rgb(255 255 255 / 0.1);
}
.chat-box > :deep(*) {
  flex: 1;
  min-width: 0;
}

/* ---------- the foot ---------- */
.foot {
  position: absolute;
  z-index: 6;
  left: calc(var(--rail) + 20px);
  right: 24px;
  bottom: 16px;
  height: calc(var(--foot) - 16px);
  display: flex;
  align-items: center;
  gap: 12px;
}
/* taking back a confirmation: beside the corner button, where it is seen */
.undos {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-self: center;
}
.undo-btn {
  padding: 8px 14px;
  background: rgb(10 8 9 / 0.88);
  border: 1px solid #6b5631;
  border-radius: 0;
  color: #ffd27a;
  font-family: var(--font-display);
  font-size: 0.92rem;
  white-space: nowrap;
}
.undo-btn:hover:not(:disabled) {
  border-color: #f5c542;
  background: rgb(40 30 8 / 0.9);
}
.back-btn {
  padding: 10px 18px;
  background: rgb(10 8 9 / 0.85);
  border: none;
  border-left: 4px solid #b3262e;
  border-radius: 0;
  color: #eee;
  font-family: var(--font-display);
  font-size: 1rem;
}
.error {
  margin: 0;
  color: var(--blood-bright);
}
/* the one button: "พร้อม", then whatever the room waits on from this player */
.go {
  position: relative;
  display: flex;
  align-items: stretch;
  height: 100%;
  overflow: hidden;
  background: rgb(8 6 7 / 0.9);
  border: 1px solid #3a3133;
}
/* The one button that moves things on changes what it does as the room goes (เลือกฝั่ง → พร้อม →
   เริ่ม); it is keyed by its label, so a new one sweeps once to say it is a new thing to press. */
.go::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: linear-gradient(105deg, transparent 35%, rgb(255 230 180 / 0.3) 50%, transparent 65%);
  transform: translateX(-120%);
  animation: go-sweep 700ms ease-out;
}
@keyframes go-sweep {
  to {
    transform: translateX(120%);
  }
}
.go-btn {
  min-width: 220px;
  padding: 0 40px;
  border: none;
  border-radius: 0;
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 500;
  color: #fff;
  background: linear-gradient(90deg, rgb(70 70 74 / 0.9), rgb(40 40 44 / 0.9));
}
.go.primary .go-btn {
  background: linear-gradient(90deg, rgb(150 18 26 / 0.95), rgb(80 8 12 / 0.95));
}
/* it is the thing to press now (ล็อกตัวละคร after picking, ยืนยัน…, เริ่ม Trial): a gold glow, as the
   rail's button of the next panel */
.go.primary {
  border-color: #f5c542;
  animation: go-ask 1.2s ease-in-out infinite;
}
@keyframes go-ask {
  0%,
  100% {
    box-shadow: 0 0 0 2px #f5c542, 0 0 12px rgb(245 197 66 / 0.5);
  }
  50% {
    box-shadow: 0 0 0 2px #f5c542, 0 0 30px rgb(245 197 66 / 0.95);
  }
}
.go.primary .go-btn:hover:not(:disabled) {
  filter: brightness(1.2);
}
.go.done .go-btn {
  background: linear-gradient(90deg, rgb(30 80 44 / 0.9), rgb(18 50 28 / 0.9));
}
.go-btn:disabled {
  opacity: 0.75;
  cursor: default;
}
.go-note {
  width: 260px;
  margin: 0;
  padding: 0 16px;
  display: flex;
  align-items: center;
  font-size: 0.88rem;
  line-height: 1.35;
  color: #f0a35a;
}
.go.done .go-note {
  color: #b9d9be;
}

/* ---------- narrower screens (a tablet): the big figure goes, the panel covers the scene ---------- */
@media (max-width: 1280px) {
  .hero {
    display: none;
  }
  /* the figures stop short of the chat in the corner */
  .places,
  .split {
    right: calc(min(360px, 38%) + 36px);
  }
  .place {
    --fig-h: clamp(180px, 30vh, 260px);
  }
  .place.hero-place {
    display: flex;
  }
  .pc-room.survivor .place {
    --fig-h: clamp(190px, 36vh, 320px);
  }
  /* the killer's view on a tablet: the big one is gone, all five in the line fit beside the chat */
  .pc-room.killer .place {
    --fig-h: clamp(180px, 30vh, 260px);
  }
  .pc-room.survivor .places,
  .pc-room.survivor .split {
    right: calc(min(360px, 38%) + 36px);
  }
  .chat-box {
    width: min(360px, 38%);
    height: 240px;
  }
}
@media (max-width: 900px) {
  .pc-room {
    --rail: 72px;
    height: auto;
    min-height: var(--vh, 100vh);
    overflow: visible;
    padding: 0 12px 110px calc(var(--rail) + 12px);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .rail-btn {
    width: 56px;
  }
  .top,
  .me-box,
  .scene,
  .places,
  .split,
  .chat-box {
    position: static;
  }
  .top {
    padding-top: 12px;
  }
  .me-box {
    align-items: flex-start;
  }
  .places {
    flex-wrap: wrap;
  }
  .chat-box {
    width: auto;
    height: 260px;
  }
  .panel {
    position: fixed;
    top: 0;
    width: calc(100% - var(--rail));
  }
  .foot {
    position: fixed;
    left: calc(var(--rail) + 8px);
    right: 8px;
    bottom: 8px;
  }
  .go-btn {
    min-width: 0;
    padding: 0 20px;
  }
  .go-note {
    width: auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  .rail-btn.ask,
  .go.primary {
    animation: none;
  }
}
</style>
