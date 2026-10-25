<script setup lang="ts">
// An online room before the game.
//   Lobby: laid out as a PC game's — the killer's slot against four survivor slots (a click on an
//   empty one takes that side), the room's settings, and a bar at the foot to say ready; the host
//   goes on when everyone is.
//   Picks: survivor players pick their survivors (they see each other's, no duplicates, and
//   nothing of the killer's side); the killer picks and sees the survivors' picks; when
//   everyone has locked in, the killer starts the game.
import { computed, ref, watch } from 'vue'
import { killerById, survivorById } from '../../data'
import { asset, cssUrl } from '../../i18n'
import { sfx } from '../../sound'
import { fxSound } from '../fx/audio'
import { KILLER_PLAYER } from '../engine/seats'
import {
  backToLobby,
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
  setName,
  setPingColor,
  pingColors,
  setReady,
  setSide,
  slotsOf,
  startable,
  startOnlineGame,
} from '../online/session'
import { cardChoices, printedOf, takenBy } from '../engine/loadout'
import type { PerkId } from '../engine/perks'
import BanPicker from './BanPicker.vue'
import ChatDock from './ChatDock.vue'
import CharacterPicker from './CharacterPicker.vue'
import StageBar from './StageBar.vue'
import { PING_COLORS, pingHex } from '../online/pingColors'
import PerkLoadout from './PerkLoadout.vue'
import MapPicker from './MapPicker.vue'
import Mini from './Mini.vue'
import RoomSettingsCard from './RoomSettingsCard.vue'
import SyncBadge from './SyncBadge.vue'

const data = computed(() => session.data!)
const code = computed(() => session.room?.code ?? '')

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

const name = ref(me.value?.name ?? '')
watch(
  () => me.value?.name,
  (n) => {
    if (n && !nameFocused.value) name.value = n
  },
)
const nameFocused = ref(false)
/** Puts the cursor in the rename field as it appears. */
const vFocus = { mounted: (el: HTMLInputElement) => (el.focus(), el.select()) }

/** Renaming on your own seat (the name is set on the Online page; this is only to change it). */
const renaming = ref(false)
function startRename() {
  sfx.click()
  name.value = me.value?.name ?? ''
  renaming.value = true
  nameFocused.value = true
}
function saveName() {
  renaming.value = false
  nameFocused.value = false
  const n = name.value.trim()
  if (n && n !== me.value?.name) void setName(n)
}

/** The lineup: the killer's slot, four survivor slots (empty ones null), and who hasn't chosen. */
const killerMember = computed(() => memberList.value.find((m) => m.side === 'killer') ?? null)
/** The four survivor slots: each member in the slot they took, those without one in the first free. */
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
const readyCount = computed(() => memberList.value.filter((m) => m.ready).length)
/** The silhouettes on the slots: the figure on the Sprint card, the skull on a card's back. */
// each survivor seat shows one of the four movement cards (Sneak, Sprint, Crouch, Vault), the killer's the skull
const SEAT_CARDS = ['sneak', 'sprint', 'crouch', 'vault'] as const
const artVars = { ...Object.fromEntries(SEAT_CARDS.map((c) => [`--${c}`, cssUrl(`assets/movement/${c}.webp`)])), '--skull': cssUrl('assets/movement/back-skull.webp') }
const seatArt = (i: number) => `var(--${SEAT_CARDS[i % SEAT_CARDS.length]})`

const killerTaken = computed(() => memberList.value.some((m) => m.side === 'killer' && m.id !== session.me))
const survivorCount = computed(() => memberList.value.filter((m) => m.side === 'survivor').length)

function side(s: 'killer' | 'survivor') {
  sfx.click()
  void setSide(me.value?.side === s ? null : s)
}

/** The host may kick anyone else out of the lobby. */
const canKick = (id: string | undefined) => !!id && isHost.value && id !== session.me && data.value.phase === 'lobby' && !data.value.game
function kick(id: string) {
  const who = data.value.members[id]?.name ?? 'ผู้เล่น'
  if (!confirm(`เตะ ${who} ออกจากห้อง? เขาจะกลับเข้าห้องนี้ไม่ได้อีก`)) return
  sfx.click()
  void kickMember(id)
}

/** Your own seat, while not ready yet: a click on it leaves that side. */
const leavable = (id: string | undefined) => !!id && id === session.me && !me.value?.ready

/** A click on a seat: an empty one takes that side, your own one leaves it. */
/** `slot`: which survivor slot was clicked (the one taken). */
function clickSeat(s: 'killer' | 'survivor', id: string | undefined, slot?: number) {
  if (!id) return takeSlot(s, slot)
  if (leavable(id) && !session.busy) side(s)
}

/**
 * A click on an empty slot: take that side (moving over from the other one), in that slot; a
 * survivor already moves to the empty survivor slot clicked.
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
  return 'เกมมี Survivor 4 ตัวเสมอ — ต้องมีผู้เล่นฝั่งนี้ 2–4 คน'
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
    return {
      slot,
      player,
      who: data.value.seats[String(player)]?.name ?? '',
      mine: player === mySeat.value,
      character: id ? survivorById.get(id) : undefined,
      locked: !!data.value.locked[String(player)],
    }
  }),
)

/** Survivors a teammate already took (not counting this player's own slots); none with repeats allowed. */
const takenByOthers = computed(
  () => new Set(roomSettings.value.dupes ? [] : survivorSlots.value.filter((s) => !s.mine && s.character).map((s) => s.character!.id)),
)

/** Who picks the board, for the read-only card. */
const boardChooser = computed(() => ({ killer: 'ฆาตกร', secret: 'ฆาตกร', host: 'หัวห้อง', random: 'สุ่ม' })[roomSettings.value.map])

/** The killer's pick, for the survivors when the room shows it. */
const shownKiller = computed(() => (roomSettings.value.showKiller && data.value.picks.killer ? killerById.get(data.value.picks.killer) : undefined))

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

// ---------- perks (Bloodweb, Devout): this device's characters, once everyone is locked in ----------

/** This player's characters with their loadouts (their own only: Devout's picks are revealed together). */
const myLoadouts = computed(() =>
  myPerkKeys.value.flatMap((key) => {
    const c = perkChars.value.find((x) => x.key === key)
    return c ? [{ ...c, perks: roomLoadouts.value[key] ?? printedOf(c.id) }] : []
  }),
)
const perkTaken = (key: string) => [...takenBy(perkChars.value, roomLoadouts.value, key)]
const perkDone = (key: string) => !!data.value.perksDone?.[key]
function confirmLoadout(key: string, on: boolean) {
  sfx.select()
  void confirmPerks(key, on)
}

function toggleLock() {
  // a character changing deals the perks again: everyone sets theirs anew
  if (locked.value && perkStage.value && !confirm('เปลี่ยนตัวละครจะล้าง Perk ที่ทุกคนแต่งไว้ ให้แต่งใหม่ทั้งหมด — ต่อไหม?')) return
  if (locked.value) fxSound.charUnconfirm()
  else fxSound.charConfirm()
  void lockPicks(!locked.value)
}


function start() {
  sfx.entity()
  void startOnlineGame()
}

// ---------- the confirm bar of the characters stage ----------

/** How many are done, as the others may see it (the killer's own progress is only the killer's unless shown). */
const barTotal = computed(() => (amKiller.value || roomSettings.value.showKiller ? data.value.players : data.value.players - 1))
const barDone = computed(() =>
  Array.from({ length: data.value.players }, (_, i) => i + 1).filter(
    (p) => data.value.locked[String(p)] && (p !== KILLER_PLAYER || amKiller.value || roomSettings.value.showKiller),
  ).length,
)
const picksMissing = computed(() => (amKiller.value ? (data.value.picks.killer ? 0 : 1) : mySlots.value.length - myPicks.value.length))

// ---------- the bans ----------

const myBansLocked = computed(() => !!mySeat.value && !!data.value.bansLocked?.[String(mySeat.value)])
const banWaiting = computed(() => Array.from({ length: data.value.players }, (_, i) => String(i + 1)).filter((p) => !data.value.bansLocked?.[p]).length)
function toggleBans() {
  if (myBansLocked.value) fxSound.charUnconfirm()
  else fxSound.charConfirm()
  void lockBans(!myBansLocked.value)
}

// ---------- the stages ----------

const stage = pickStage
/** The steps of the picks, in order (bans and perks only when the room sets them). */
const steps = computed(() => [
  ...(roomSettings.value.banlist ? [{ id: 'bans', label: 'แบนตัวละคร' }] : []),
  { id: 'chars', label: 'เลือกตัวละคร' },
  ...(roomSettings.value.mode !== 'adept' ? [{ id: 'perks', label: 'แต่ง Perk' }] : []),
  { id: 'map', label: 'เลือกแผนที่' },
])
const stepIndex = computed(() => Math.max(0, steps.value.findIndex((s) => s.id === stage.value)))

/** Which player each character key belongs to: 'killer' is player 1, a survivor slot its hand's player. */
function playerOfKey(key: string): number {
  return key === 'killer' ? KILLER_PLAYER : survivorSlots.value[Number(key)]?.player ?? 0
}

/**
 * Each player and whether they are done with this stage (null: not shown — the killer's own
 * progress is only the killer's, unless the room shows the killer).
 */
const seatStatus = computed(() =>
  Array.from({ length: data.value.players }, (_, i) => i + 1).map((player) => {
    const killer = player === KILLER_PLAYER
    const hidden = stage.value === 'chars' && killer && !amKiller.value && !roomSettings.value.showKiller
    const done =
      stage.value === 'bans'
        ? !!data.value.bansLocked?.[String(player)]
        : stage.value === 'chars'
          ? !!data.value.locked[String(player)]
          : stage.value === 'perks'
            ? perkChars.value.filter((c) => playerOfKey(c.key) === player).every((c) => perkDone(c.key))
            : true
    return { player, killer, name: data.value.seats[String(player)]?.name ?? '', mine: player === mySeat.value, done: hidden ? null : done }
  }),
)

</script>

<template>
  <div class="room">
    <!-- the room bar: its name and phase, the code (a click copies it), the invite, leaving -->
    <header class="room-bar">
      <div class="rb-title">
        <p class="rb-phase">{{ data.phase === 'lobby' ? 'Lobby' : steps[stepIndex]?.label }}</p>
        <h1>{{ data.passwordHash ? '🔒 ' : '' }}{{ data.name || `ห้อง ${code}` }}</h1>
      </div>
      <button type="button" class="code-chip" title="คลิกเพื่อคัดลอกรหัสห้อง" @click="copy('code')">
        <small>รหัสห้อง</small>
        <strong>{{ code }}</strong>
        <span class="copied" :class="{ on: copied === 'code' }">{{ copied === 'code' ? '✓ คัดลอกแล้ว' : '📋' }}</span>
      </button>
      <button type="button" class="invite" @click="copy('link')">{{ copied === 'link' ? '✓ คัดลอกลิงก์แล้ว' : '🔗 ลิงก์เชิญเพื่อน' }}</button>
      <span class="spacer" />
      <SyncBadge />
      <button type="button" class="leave" @click="leaveRoom">⎋ ออกจากห้อง</button>
    </header>

    <!-- ================= lobby ================= -->
    <template v-if="data.phase === 'lobby'">
      <!-- the lineup: the killer against the four survivors, one slot per player -->
      <section class="stage" :style="artVars">
        <div class="lineup">
          <div class="side-label killer">Killer <small>{{ killerMember ? 1 : 0 }}/1</small></div>
          <div class="side-label survivor">Survivor <small>{{ survivorCount }}/4</small></div>

          <!-- the killer's slot -->
          <component
            :is="killerMember ? 'div' : 'button'"
            class="seat killer"
            :class="{ empty: !killerMember, me: killerMember?.id === session.me, ready: killerMember?.ready, leavable: leavable(killerMember?.id) }"
            :disabled="!killerMember && session.busy ? true : undefined"
            :title="leavable(killerMember?.id) ? 'คลิกเพื่อออกจากฝั่ง Killer' : undefined"
            @click="clickSeat('killer', killerMember?.id)"
          >
            <span class="art" aria-hidden="true" />
            <template v-if="killerMember">
              <span v-if="killerMember.id === data.host" class="crown" title="หัวห้อง">👑</span>
              <template v-if="killerMember.id === session.me">
                <input v-if="renaming" v-model="name" v-focus class="seat-rename" maxlength="16" aria-label="ชื่อของคุณ" @blur="saveName" @keyup.enter="saveName" @keyup.esc="renaming = false" @click.stop />
                <button v-else type="button" class="seat-name mine" title="เปลี่ยนชื่อ" @click.stop="startRename">{{ killerMember.name }} <i>✎</i></button>
              </template>
              <span v-else class="seat-name">{{ killerMember.name }}</span>
              <span class="seat-sub"><i class="ping-dot" :style="{ '--c': pingHex(pingColors[killerMember.id]) }" title="สี Ping" />{{ killerMember.id === session.me ? 'คุณ' : 'ฆาตกร' }}</span>
              <span v-if="leavable(killerMember.id)" class="leave-hint" aria-hidden="true">✕ ออกจากฝั่ง</span>
              <button v-if="canKick(killerMember.id)" type="button" class="kick" title="เตะออกจากห้อง" @click.stop="kick(killerMember.id)">✕ เตะ</button>
            </template>
            <template v-else>
              <span class="plus" aria-hidden="true">+</span>
              <span class="seat-name">ว่าง</span>
              <span class="seat-sub">คลิกเพื่อเป็น Killer</span>
            </template>
            <span class="stamp">พร้อม</span>
          </component>

          <span class="vs" aria-hidden="true">VS</span>

          <!-- four survivor slots -->
          <component
            :is="m ? 'div' : 'button'"
            v-for="(m, i) in survivorMembers"
            :key="m?.id ?? `empty-${i}`"
            class="seat survivor"
            :class="{ empty: !m, me: m?.id === session.me, ready: m?.ready, leavable: leavable(m?.id) }"
            :style="{ '--i': i, '--art': seatArt(i) }"
            :disabled="!m && session.busy ? true : undefined"
            :title="leavable(m?.id) ? 'คลิกเพื่อออกจากฝั่ง Survivor' : undefined"
            @click="clickSeat('survivor', m?.id, i)"
          >
            <span class="art" aria-hidden="true" />
            <template v-if="m">
              <span v-if="m.id === data.host" class="crown" title="หัวห้อง">👑</span>
              <template v-if="m.id === session.me">
                <input v-if="renaming" v-model="name" v-focus class="seat-rename" maxlength="16" aria-label="ชื่อของคุณ" @blur="saveName" @keyup.enter="saveName" @keyup.esc="renaming = false" @click.stop />
                <button v-else type="button" class="seat-name mine" title="เปลี่ยนชื่อ" @click.stop="startRename">{{ m.name }} <i>✎</i></button>
              </template>
              <span v-else class="seat-name">{{ m.name }}</span>
              <span class="seat-sub"><i class="ping-dot" :style="{ '--c': pingHex(pingColors[m.id]) }" title="สี Ping" />{{ m.id === session.me ? 'คุณ' : 'ผู้รอดชีวิต' }}</span>
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
              <span v-if="leavable(m.id)" class="leave-hint" aria-hidden="true">✕ ออกจากฝั่ง</span>
              <button v-if="canKick(m.id)" type="button" class="kick" title="เตะออกจากห้อง" @click.stop="kick(m.id)">✕ เตะ</button>
            </template>
            <template v-else>
              <span class="plus" aria-hidden="true">+</span>
              <span class="seat-name">ว่าง</span>
              <span class="seat-sub">{{ me?.side === 'survivor' ? 'คลิกเพื่อย้ายมาช่องนี้' : 'คลิกเพื่อเป็น Survivor' }}</span>
            </template>
            <span class="stamp">พร้อม</span>
          </component>
        </div>

        <p v-if="bench.length" class="bench">
          <span class="muted">ยังไม่เลือกฝั่ง:</span>
          <span v-for="m in bench" :key="m.id" class="bench-chip" :class="{ me: m.id === session.me }">
            <i class="ping-dot" :style="{ '--c': pingHex(pingColors[m.id]) }" title="สี Ping" />{{ m.id === data.host ? '👑 ' : '' }}{{ m.name }}{{ m.id === session.me ? ' (คุณ)' : '' }}
            <button v-if="canKick(m.id)" type="button" class="kick small" title="เตะออกจากห้อง" @click.stop="kick(m.id)">✕</button>
          </span>
          <span v-if="!me?.side" class="bench-hint">คลิกช่องว่างด้านบนเพื่อเลือกฝั่ง</span>
        </p>
        <p class="split muted">{{ splitNote }}</p>
        <!-- the colour of this player's pings in the game: one each, none the same -->
        <div v-if="me" class="ping-pick" role="radiogroup" aria-label="สี Ping ของคุณ">
          <span class="ping-pick-label">📍 สี Ping ของคุณ <small class="muted">— ระหว่างเกมคลิกขวาบนแผนที่ หรือชี้แล้วกด Q (แท็บเล็ต: กดค้าง) ทุกคนในห้องเห็น รวม Killer</small></span>
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
      </section>

      <!-- the room's settings: everyone reads them before saying ready -->
      <RoomSettingsCard />

      <!-- the bar at the foot: how many are ready, ready, and the host's go -->
      <footer class="ready-bar">
        <div class="rb-status">
          <span class="ready-line">
            <span class="ready-pips" aria-hidden="true"><i v-for="m in memberList" :key="m.id" :class="{ on: m.ready }" /></span>
            พร้อม {{ readyCount }}/{{ memberList.length }}
          </span>
          <small class="muted">{{ lobbyBlocker || (isHost ? 'ทุกคนพร้อมแล้ว — ดำเนินเกมได้เลย' : 'ทุกคนพร้อมแล้ว — รอหัวห้องดำเนินเกม') }}</small>
        </div>
        <button class="ready-btn" :class="{ primary: !me?.ready, done: me?.ready }" :disabled="session.busy || !me?.side" @click="toggleReady">
          <span>{{ me?.ready ? '✓ พร้อมแล้ว' : me?.side ? 'พร้อม' : 'เลือกฝั่งก่อน' }}</span>
          <small v-if="me?.ready">กดเพื่อยกเลิก</small>
        </button>
        <button v-if="isHost" class="go-btn primary" :disabled="!!lobbyBlocker || session.busy" @click="proceed">ดำเนินเกม ➜</button>
      </footer>
    </template>

    <!-- ================= the picks, a stage at a time ================= -->
    <template v-else>
      <!-- where the room is: characters → perks (when the room sets them) → map → start -->
      <ol class="steps" aria-label="ขั้นตอน">
        <li v-for="(st, i) in steps" :key="st.id" :class="{ done: i < stepIndex, now: i === stepIndex }">
          <span class="num">{{ i < stepIndex ? '✓' : i + 1 }}</span>
          {{ st.label }}
        </li>
      </ol>

      <!-- who has finished this stage -->
      <section v-if="seatStatus.length" class="who-done" aria-label="สถานะผู้เล่น">
        <span v-for="p in seatStatus" :key="p.player" class="pchip" :class="{ ok: p.done, killer: p.killer, me: p.mine }">
          <b>{{ p.done === null ? '·' : p.done ? '✓' : '…' }}</b>
          {{ p.killer ? '🔪 ' : '' }}{{ p.name }}{{ p.mine ? ' (คุณ)' : '' }}
        </span>
      </section>

      <!-- ===== 0 · the Banlist (room setting): each side bans characters of the other ===== -->
      <template v-if="stage === 'bans'">
        <section v-if="mySeat" class="card">
          <h2>🚫 แบนตัวละคร{{ amKiller ? ' Survivor' : ' Killer' }}</h2>
          <p class="muted small">
            {{
              amKiller
                ? `คุณแบน Survivor ได้ไม่เกิน ${roomSettings.banCount} ตัว — Survivor จะไม่เห็นจนกว่าทั้งสองฝั่งยืนยัน`
                : `ทีม Survivor ช่วยกันแบน Killer ได้ไม่เกิน ${roomSettings.banCount} ตัว (เพื่อนร่วมทีมเห็นรายการเดียวกัน ใครแก้ก็ต้องยืนยันใหม่ทุกคน) — Killer จะไม่เห็นจนกว่าทั้งสองฝั่งยืนยัน`
            }}
          </p>
          <BanPicker :kind="amKiller ? 'survivor' : 'killer'" :banned="myBans" :max="roomSettings.banCount" :locked="myBansLocked" @toggle="toggleBan" />
        </section>
        <StageBar v-if="mySeat" :done="data.players - banWaiting" :total="data.players">
          {{ myBansLocked ? 'ยืนยันแล้ว — รอผู้เล่นคนอื่น' : 'แบนให้เรียบร้อยแล้วกดยืนยัน' }}
          <template #actions>
            <button class="lockbtn" :class="{ primary: !myBansLocked }" :disabled="session.busy" @click="toggleBans">
              {{ myBansLocked ? '🔒 ยืนยันแล้ว (กดเพื่อแก้)' : 'ยืนยันการแบน' }}
            </button>
          </template>
        </StageBar>
      </template>

      <!-- ===== 1 · characters ===== -->
      <template v-else-if="stage === 'chars'">
        <!-- the bans, public now -->
        <section v-if="roomSettings.banlist && revealedBans.length" class="card banned-card">
          <h2>🚫 ตัวละครที่ถูกแบน</h2>
          <p class="banned-list">
            <span v-for="id in revealedBans" :key="id" class="banned-chip">
              <img :src="asset((survivorById.get(id) ?? killerById.get(id))?.images.mini ?? '')" alt="" />
              {{ (survivorById.get(id) ?? killerById.get(id))?.name }}
            </span>
          </p>
        </section>

        <div class="pick-layout">
          <!-- the lineup: the survivor team (everyone sees it, the killer included) and the killer's own pick -->
          <aside class="team-panel card" aria-label="ทีมของเกมนี้">
            <h2>ทีม Survivor</h2>
            <div class="slots">
              <button
                v-for="s in survivorSlots"
                :key="s.slot"
                class="slot"
                :class="{ mine: s.mine, active: s.mine && activeSlot === s.slot && !locked, locked: s.locked }"
                :disabled="!s.mine || locked"
                @click="activeSlot = s.slot"
              >
                <Mini v-if="s.character" class="mini aura-survivor" :src="asset(s.character.images.mini)" />
                <span v-else class="empty">?</span>
                <span class="slot-text">
                  <strong>{{ s.character?.name ?? (s.mine ? 'เลือกตัวละคร' : 'กำลังเลือก…') }}</strong>
                  <small class="muted">ผู้เล่น {{ s.player }} · {{ s.who }}{{ s.mine ? ' (คุณ)' : '' }}</small>
                </span>
                <span v-if="s.locked" class="lock">🔒</span>
              </button>
            </div>

            <!-- the killer: your own pick, or — when the room shows it — the killer's for the survivors -->
            <template v-if="amKiller || roomSettings.showKiller">
              <h2 class="team-killer">ฆาตกร</h2>
              <div class="drawn">
                <Mini v-if="amKiller ? data.picks.killer : shownKiller" class="mini aura-killer" :src="asset((amKiller ? killerById.get(data.picks.killer ?? '') : shownKiller)?.images.mini ?? '')" />
                <span v-else class="empty">?</span>
                <span>
                  <small class="muted">{{ amKiller ? 'ตัวที่คุณเลือก' : `ฆาตกร${data.locked['1'] ? ' (ยืนยันแล้ว)' : ''}` }}</small>
                  <strong class="killer-name">{{ (amKiller ? killerById.get(data.picks.killer ?? '') : shownKiller)?.name ?? 'กำลังเลือก…' }}</strong>
                </span>
              </div>
            </template>
          </aside>

          <div class="pick-main">
            <!-- characters drawn for everyone (room settings): nothing to pick, only to confirm -->
            <section v-if="roomSettings.random && mySeat" class="card">
              <h2>🎲 สุ่มตัวละครให้แล้ว</h2>
              <p class="muted">หัวห้องตั้งให้สุ่มตัวละครทุกคน — ตรวจดูทีมด้านซ้ายแล้วกดยืนยันด้านล่าง</p>
            </section>

            <!-- survivor players pick survivors -->
            <section v-if="mySlots.length && !roomSettings.random" class="card">
              <h2>เลือก Survivor {{ mySlots.length > 1 ? `(คุณคุม ${mySlots.length} ตัว — แตะช่องทีมด้านซ้ายเพื่อสลับ)` : '' }}</h2>
              <CharacterPicker
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
            </section>

            <!-- the killer picks a killer; survivors never see this part -->
            <section v-if="amKiller && !roomSettings.random" class="card killer-card">
              <h2>🔪 เลือกฆาตกร</h2>
              <CharacterPicker
                kind="killer"
                :selected="data.picks.killer ? [data.picks.killer] : []"
                :banned="revealedBans"
                :remaining="data.picks.killer ? 0 : 1"
                :locked="locked"
                @pick="pickKiller"
                @unpick="unpickKiller"
              />
            </section>

            <section v-if="!mySlots.length && !amKiller" class="card">
              <p class="muted">คุณไม่ได้อยู่ในเกมนี้ — รอดูได้เมื่อเกมเริ่ม</p>
            </section>
          </div>
        </div>

        <StageBar v-if="mySeat" :done="barDone" :total="barTotal">
          {{
            locked
              ? 'ยืนยันตัวละครแล้ว — รอผู้เล่นคนอื่น'
              : myPicksComplete
                ? 'เลือกครบแล้ว — กดยืนยันได้เลย'
                : `เลือกอีก ${picksMissing} ตัว`
          }}
          <template #actions>
            <button class="lockbtn" :class="{ primary: !locked }" :disabled="session.busy || !myPicksComplete" @click="toggleLock">
              {{ locked ? '🔒 ล็อกแล้ว (กดเพื่อแก้)' : 'ยืนยันตัวละคร' }}
            </button>
          </template>
        </StageBar>
      </template>

      <!-- ===== 2 · perks (Bloodweb, Devout): once every character is locked in ===== -->
      <template v-else-if="stage === 'perks'">
        <section v-if="myLoadouts.length" class="perks-stage">
          <h2>🃏 แต่ง Perk — {{ roomSettings.mode === 'devout' ? 'Devout' : 'Bloodweb' }}</h2>
          <p class="muted small">
            {{ roomSettings.mode === 'devout' ? 'เลือก Perk ได้สูงสุด 3 ใบ — คนอื่นไม่เห็นจนกว่าเกมจะเริ่ม' : 'การ์ดที่จั่วได้ 5 ใบ เลือกวางทับ Perk บนกระดานได้สูงสุด 3 ใบ' }}
            · การ์ดมีใบเดียว: Perk ที่มีคนใช้แล้วจะมืดลง
          </p>
          <PerkLoadout
            v-for="c in myLoadouts"
            :key="c.key"
            :model-value="c.perks"
            :side="c.side"
            :character-id="c.id"
            :mode="roomSettings.mode"
            :who="c.side === 'killer' ? 'Killer' : `Survivor ${Number(c.key) + 1}`"
            :choices="cardChoices(roomSettings.mode, c, perkHands[c.key])"
            :taken="perkTaken(c.key)"
            :problem="perkProblem(c.key, c.perks)"
            :confirmed="perkDone(c.key)"
            @update:model-value="(p: PerkId[]) => setLoadout(c.key, p)"
            @confirm="(on: boolean) => confirmLoadout(c.key, on)"
          />
        </section>
        <section v-else class="card wait-card">
          <h2>🃏 กำลังแต่ง Perk</h2>
          <p class="muted">คุณไม่ได้แต่ง Perk ในเกมนี้ — รอผู้เล่นอื่นแต่งให้เสร็จ</p>
        </section>
        <section v-if="mySeat" class="card actions">
          <p class="muted center">{{ perksWaiting.length ? `รอทุกคนแต่ง Perk (${perksWaiting.length} ตัว)` : '' }}</p>
        </section>
      </template>

      <!-- ===== 3 · the map, then the killer starts ===== -->
      <template v-else>
        <!-- whoever picks the board: the killer, or the host -->
        <MapPicker v-if="mayPickBoard" :model-value="data.board ?? ''" @update:model-value="setBoard" />
        <!-- a secret map (room settings): the survivors learn it when the game starts -->
        <section v-else-if="roomSettings.map === 'secret'" class="card wait-card">
          <h2>🗺 แผนที่ลับ</h2>
          <p class="muted">{{ mapDone ? 'ฆาตกรเลือกแผนที่แล้ว — จะรู้ตอนเริ่มเกม' : 'ฆาตกรกำลังเลือกแผนที่ (แบบลับ) — จะรู้ตอนเริ่มเกม' }}</p>
        </section>
        <MapPicker v-else-if="mapDone" :model-value="data.board ?? 'macmillan'" :chooser="boardChooser" readonly />
        <section v-else class="card wait-card">
          <h2>🗺 เลือกแผนที่</h2>
          <p class="muted">รอ{{ boardChooser }}เลือกแผนที่…</p>
        </section>

        <StageBar v-if="mySeat">
          {{
            !mapDone
              ? `รอ${boardChooser}เลือกแผนที่`
              : amKiller
                ? 'ทุกอย่างพร้อมแล้ว — เริ่มเกมได้'
                : 'ทุกอย่างพร้อมแล้ว — รอ Killer ดำเนินเกม'
          }}
          <template #actions>
            <button v-if="amKiller" class="primary big-go" :disabled="!startable || session.busy" @click="start">
              {{ startable ? 'ดำเนินเกม — เริ่ม Trial' : 'เลือกแผนที่ก่อน' }}
            </button>
          </template>
        </StageBar>
      </template>

      <section v-if="!mySeat" class="card">
        <p class="muted">คุณไม่ได้อยู่ในเกมนี้ — รอดูได้เมื่อเกมเริ่ม</p>
      </section>

      <button v-if="isHost" class="back" @click="backToLobby">← กลับ Lobby</button>
    </template>

    <p v-if="session.error" class="error">{{ session.error }}</p>

    <!-- the room's chat: beside the column on a wide screen, a 💬 button otherwise -->
    <ChatDock mode="room" />
  </div>
</template>

<style scoped>
/* ---------- the room bar ---------- */
.room-bar {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.8rem 1rem;
  padding: 0.9rem 1.2rem;
  background: linear-gradient(90deg, rgb(40 6 8 / 0.92), rgb(10 11 14 / 0.9) 55%);
  border: 1px solid var(--line-strong);
  border-left: 3px solid var(--blood);
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.55);
  animation: drop-in 0.4s ease-out both;
}
@keyframes drop-in {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
}
.rb-title {
  min-width: 0;
}
.rb-phase {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.8rem;
  /* not the wide tracking of a Latin eyebrow: it breaks Thai apart */
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--blood-bright);
}
.rb-title h1 {
  margin: 0;
  font-size: 1.6rem;
  line-height: 1.15;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 2px 10px rgb(0 0 0 / 0.8);
}
/* the code, big and red; a click copies it */
.code-chip {
  display: grid;
  grid-template-columns: auto auto;
  align-items: center;
  column-gap: 0.6rem;
  padding: 0.25rem 0.9rem 0.35rem;
  background: rgb(0 0 0 / 0.55);
  border: 1px solid rgb(255 59 48 / 0.45);
}
.code-chip small {
  grid-column: 1 / -1;
  font-family: 'Sarabun', sans-serif;
  font-size: 0.72rem;
  color: var(--muted);
  text-align: left;
}
.code-chip strong {
  font-family: var(--font-display);
  font-size: 1.9rem;
  line-height: 1.05;
  letter-spacing: 0.3em;
  color: var(--blood-bright);
  text-shadow: 0 0 14px rgb(255 40 40 / 0.55);
}
.copied {
  font-size: 0.85rem;
  color: var(--muted);
  transition: color 0.15s;
}
.copied.on {
  color: var(--ok);
}
.invite,
.leave {
  padding: 0.5rem 0.9rem;
}
.leave {
  background: none;
}
.spacer {
  flex: 1;
}

/* ---------- the lineup ---------- */
.stage {
  display: grid;
  gap: 0.7rem;
  padding: 1.2rem 1.2rem 1rem;
  background:
    radial-gradient(ellipse at 50% 120%, rgb(255 110 40 / 0.16), transparent 60%),
    linear-gradient(180deg, rgb(8 9 12 / 0.35), rgb(8 9 12 / 0.8));
  border: 1px solid var(--line-strong);
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.5);
}
.lineup {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) 64px repeat(4, minmax(0, 1fr));
  grid-template-rows: auto auto;
  align-items: stretch;
  column-gap: 0.75rem;
  row-gap: 0.45rem;
}
.side-label {
  font-family: var(--font-display);
  font-size: 1rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.side-label small {
  margin-left: 0.3rem;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.lineup > .seat,
.lineup > .vs {
  grid-row: 2;
}
.side-label.killer {
  grid-column: 1;
  color: #ff6b62;
}
.side-label.survivor {
  grid-column: 3 / -1;
  color: #ffd56a;
}
.vs {
  align-self: center;
  justify-self: center;
  font-family: var(--font-display);
  font-size: 2rem;
  font-style: italic;
  color: var(--blood-bright);
  text-shadow:
    0 0 18px rgb(255 30 30 / 0.7),
    0 2px 0 #000;
  animation: throb 2.4s ease-in-out infinite;
}
@keyframes throb {
  50% {
    transform: scale(1.12);
    text-shadow:
      0 0 28px rgb(255 30 30 / 0.95),
      0 2px 0 #000;
  }
}

/* a seat: a tall card with the side's silhouette, the player's name over its foot */
.seat {
  --tone: 217 162 39;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  gap: 0.15rem;
  min-height: 300px;
  padding: 0.8rem 0.6rem 0.9rem;
  border: 1px solid rgb(var(--tone) / 0.35);
  border-radius: 0;
  background: linear-gradient(180deg, rgb(255 255 255 / 0.03), rgb(var(--tone) / 0.12));
  text-align: center;
  overflow: hidden;
  animation: seat-in 0.5s ease-out both;
  animation-delay: calc(var(--i, 0) * 70ms + 80ms);
  transition:
    transform 0.2s,
    border-color 0.2s,
    box-shadow 0.2s;
}
.seat.killer {
  --tone: 255 59 48;
  animation-delay: 0s;
}
@keyframes seat-in {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
}
/* the silhouette: white art on black, screened onto the card, fog rising over its feet */
.seat .art {
  position: absolute;
  inset: 0 0 25% 0;
  background: var(--art) center 46% / 210% auto no-repeat;
  mix-blend-mode: screen;
  opacity: 0.85;
  filter: drop-shadow(0 0 16px rgb(var(--tone) / 0.6)) sepia(1) saturate(2.2) hue-rotate(5deg);
  transition:
    opacity 0.3s,
    filter 0.3s;
  pointer-events: none;
}
.seat.killer .art {
  background: var(--skull) center 47% / 240% auto no-repeat;
  filter: drop-shadow(0 0 18px rgb(255 30 30 / 0.7));
}
.seat::after {
  content: '';
  position: absolute;
  inset: auto 0 0 0;
  height: 45%;
  background: linear-gradient(0deg, rgb(5 6 8 / 0.95), transparent);
  pointer-events: none;
}
.seat > :not(.art) {
  position: relative;
  z-index: 1;
}
.seat-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 2px 6px #000;
}
/* your own name: a click renames */
button.seat-name.mine {
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
}
button.seat-name.mine i {
  font-style: normal;
  font-size: 0.8em;
  color: rgb(var(--tone));
  opacity: 0.7;
}
button.seat-name.mine:hover i {
  opacity: 1;
}
.seat-rename {
  width: 100%;
  padding: 0.2rem 0.4rem;
  font-family: var(--font-display);
  font-size: 1.1rem;
  text-align: center;
  border-color: rgb(var(--tone));
}
.seat-sub {
  font-size: 0.85rem;
  color: rgb(var(--tone));
}
/* the host's kick: on the seat's top-right, where a player's own "leave" hint sits for themselves */
.kick {
  position: absolute !important;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 3;
  padding: 0.1rem 0.5rem;
  font-size: 0.78rem;
  border: 1px solid rgb(255 90 80 / 0.7);
  background: rgb(60 10 10 / 0.85);
  color: #ffb0a8;
  opacity: 0.55;
  transition: opacity 0.15s;
}
.seat:hover .kick,
.kick:hover,
.kick:focus-visible {
  opacity: 1;
  background: var(--blood);
  color: #fff;
}
.kick.small {
  position: static !important;
  margin-left: 0.3rem;
  padding: 0 0.35rem;
  opacity: 0.7;
}
@media (hover: none) {
  .kick {
    opacity: 1;
  }
}
.crown {
  position: absolute !important;
  top: 0.5rem;
  left: 0.55rem;
  font-size: 1.2rem;
  filter: drop-shadow(0 0 6px rgb(255 214 106 / 0.8));
}
/* this player's seat: a bright frame */
.seat.me {
  border-color: rgb(var(--tone));
  box-shadow:
    0 0 0 1px rgb(var(--tone)) inset,
    0 0 24px rgb(var(--tone) / 0.35);
}
/* your own seat, not ready yet: a click leaves the side, said while pointing at it */
.seat.leavable {
  cursor: pointer;
}
.leave-hint {
  position: absolute !important;
  top: 0.5rem;
  right: 0.5rem;
  padding: 0.1rem 0.5rem;
  border: 1px solid rgb(var(--tone) / 0.6);
  background: rgb(0 0 0 / 0.7);
  color: #fff;
  font-size: 0.78rem;
  opacity: 0;
  transform: translateY(-4px);
  transition:
    opacity 0.15s,
    transform 0.15s;
  pointer-events: none;
}
.seat.leavable:hover .leave-hint {
  opacity: 1;
  transform: none;
}
.seat.leavable:hover {
  border-color: var(--blood-bright);
}
/* on a tablet there is no pointing: the hint stays */
@media (hover: none) {
  .leave-hint {
    opacity: 1;
    transform: none;
  }
}
.double {
  margin-top: 0.35rem;
  padding: 0.15rem 0.55rem;
  font-size: 0.8rem;
  background: rgb(0 0 0 / 0.5);
}
.double.on {
  border-color: #ffd56a;
  color: #ffd56a;
  background: rgb(255 214 106 / 0.12);
  opacity: 1;
}
/* an empty seat: dark, a dashed frame and a +, a click takes it */
.seat.empty {
  border-style: dashed;
  background: rgb(0 0 0 / 0.35);
  cursor: pointer;
  font: inherit;
}
.seat.empty .art {
  opacity: 0.12;
  filter: grayscale(1);
}
.seat.empty .seat-name {
  color: var(--muted);
  font-size: 1.05rem;
}
.seat.empty .seat-sub {
  color: var(--muted);
  font-size: 0.8rem;
}
.plus {
  font-family: var(--font-display);
  font-size: 2.6rem;
  line-height: 1;
  color: rgb(var(--tone) / 0.5);
  margin-bottom: auto;
  margin-top: 30%;
  transition:
    transform 0.2s,
    color 0.2s;
}
.seat.empty:hover:not(:disabled) {
  transform: translateY(-4px);
  border-color: rgb(var(--tone));
  box-shadow: 0 0 24px rgb(var(--tone) / 0.3);
}
.seat.empty:hover:not(:disabled) .plus {
  transform: scale(1.2) rotate(90deg);
  color: rgb(var(--tone));
}
.seat.empty:hover:not(:disabled) .art {
  opacity: 0.35;
}
.seat.empty:disabled {
  opacity: 0.55;
  filter: none;
  cursor: default;
}
.seat.waiting .plus {
  animation: breathe 2s ease-in-out infinite;
}
@keyframes breathe {
  50% {
    opacity: 0.3;
  }
}
/* ready: a green glow along the foot and a stamp that slams on */
.stamp {
  position: absolute !important;
  top: 34%;
  left: 50%;
  padding: 0.15rem 0.9rem;
  border: 3px solid var(--ok);
  color: var(--ok);
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  background: rgb(5 20 10 / 0.6);
  box-shadow: 0 0 18px rgb(79 179 106 / 0.45);
  transform: translate(-50%, -50%) rotate(-12deg) scale(2.2);
  opacity: 0;
  pointer-events: none;
  transition:
    transform 0.22s cubic-bezier(0.3, 1.6, 0.5, 1),
    opacity 0.15s;
}
.seat.ready .stamp {
  opacity: 1;
  transform: translate(-50%, -50%) rotate(-12deg) scale(1);
}
.seat.ready {
  border-color: rgb(79 179 106 / 0.75);
  box-shadow:
    inset 0 -40px 40px -20px rgb(79 179 106 / 0.45),
    0 0 18px rgb(79 179 106 / 0.25);
}

.bench {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin: 0.2rem 0 0;
}
.bench-chip {
  padding: 0.1rem 0.6rem;
  border: 1px solid var(--line-strong);
  background: rgb(0 0 0 / 0.4);
  font-size: 0.9rem;
}
.bench-chip.me {
  border-color: var(--text);
}
.bench-hint {
  color: var(--warn);
  font-size: 0.88rem;
  animation: breathe 2s ease-in-out infinite;
}
.split {
  margin: 0;
  font-size: 0.85rem;
}

/* ---------- ping colours: a dot on every seat, and this player's picker ---------- */
.ping-dot {
  display: inline-block;
  width: 0.62em;
  height: 0.62em;
  margin-right: 0.35em;
  border-radius: 50%;
  background: var(--c);
  box-shadow: 0 0 6px var(--c);
  vertical-align: 0.05em;
}
.ping-pick {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.8rem;
  margin-top: 0.4rem;
}
.ping-pick-label {
  font-size: 0.9rem;
}
.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.swatch {
  position: relative;
  width: 1.9rem;
  height: 1.9rem;
  min-height: 0;
  padding: 0;
  border-radius: 50%;
  border: 2px solid rgb(255 255 255 / 0.25);
  background: var(--c);
  cursor: pointer;
  transition:
    transform 0.12s,
    box-shadow 0.12s;
}
.swatch:hover:not(:disabled) {
  transform: scale(1.12);
}
.swatch.on {
  border-color: #fff;
  box-shadow:
    0 0 0 3px rgb(0 0 0 / 0.6),
    0 0 12px var(--c);
}
/* someone else's: dimmed, with their initial on it */
.swatch.taken {
  opacity: 0.35;
  cursor: not-allowed;
}
.swatch .holder {
  font-size: 0.75rem;
  font-weight: 800;
  color: #111;
}

/* ---------- the ready bar, held at the foot of the screen ---------- */
.ready-bar {
  position: sticky;
  bottom: 0.6rem;
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.8rem 1.2rem;
  padding: 0.75rem 1rem;
  background: rgb(8 9 12 / 0.94);
  border: 1px solid var(--line-strong);
  border-top: 2px solid var(--blood);
  box-shadow: 0 -6px 30px rgb(0 0 0 / 0.7);
  backdrop-filter: blur(6px);
}
.rb-status {
  flex: 1;
  display: grid;
  min-width: 14rem;
}
.ready-line {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-family: var(--font-display);
  font-size: 1.1rem;
}
.ready-pips {
  display: inline-flex;
  gap: 4px;
}
.ready-pips i {
  width: 12px;
  height: 12px;
  transform: rotate(45deg);
  border: 1px solid var(--line-strong);
  background: rgb(255 255 255 / 0.05);
  transition:
    background 0.2s,
    box-shadow 0.2s;
}
.ready-pips i.on {
  border-color: var(--ok);
  background: var(--ok);
  box-shadow: 0 0 8px rgb(79 179 106 / 0.7);
}
/* READY: the big one, breathing while not pressed yet */
.ready-btn {
  display: grid;
  justify-items: center;
  min-width: 13rem;
  padding: 0.75rem 1.6rem;
  font-size: 1.35rem;
  line-height: 1.1;
}
.ready-btn small {
  font-size: 0.72rem;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  opacity: 0.8;
}
.ready-btn.primary:not(:disabled) {
  animation: call 1.8s ease-in-out infinite;
}
@keyframes call {
  50% {
    filter: drop-shadow(0 0 14px rgb(255 40 40 / 0.75));
  }
}
.ready-btn.done {
  border-color: var(--ok);
  color: var(--ok);
  background: rgb(79 179 106 / 0.12);
  box-shadow: 0 0 16px rgb(79 179 106 / 0.3);
}
.go-btn {
  padding: 0.85rem 1.6rem;
  font-size: 1.2rem;
}
.go-btn:not(:disabled) {
  animation: call 1.2s ease-in-out infinite;
}

@media (max-width: 1000px) {
  .lineup {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .side-label.killer,
  .side-label.survivor,
  .lineup > .seat.killer {
    grid-column: 1 / -1;
  }
  .side-label.killer {
    grid-row: 1;
  }
  .lineup > .seat.killer {
    grid-row: 2;
  }
  .side-label.survivor {
    grid-row: 3;
  }
  .lineup > .seat.survivor {
    grid-row: 4;
  }
  .vs {
    display: none;
  }
  .seat.killer {
    min-height: 200px;
  }
  .seat {
    min-height: 240px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .room-bar,
  .seat,
  .vs,
  .bench-hint,
  .seat.waiting .plus,
  .ready-btn.primary:not(:disabled),
  .go-btn:not(:disabled) {
    animation: none;
  }
}
/* where the picks are: numbered steps, the finished ones ticked, the current one lit */
.steps {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.steps li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.9rem 0.4rem 0.45rem;
  border: 1px solid var(--line);
  border-radius: 99px;
  background: rgb(10 11 14 / 0.7);
  color: var(--muted);
  font-family: var(--font-display);
  letter-spacing: 0.04em;
}
.steps .num {
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background: rgb(255 255 255 / 0.08);
  font-size: 0.8rem;
}
.steps li + li::before {
  content: '';
  width: 1.1rem;
  height: 2px;
  margin-right: 0.15rem;
  background: var(--line-strong);
}
.steps li.done + li::before,
.steps li.done + li.now::before {
  background: rgb(80 200 120 / 0.6);
}
.steps li.done {
  color: var(--ok);
  border-color: rgb(80 200 120 / 0.4);
}
.steps li.done .num {
  background: rgb(80 200 120 / 0.2);
}
.steps li.now {
  color: #fff;
  border-color: var(--blood-bright);
  background: linear-gradient(90deg, rgb(70 8 12 / 0.85), rgb(20 10 12 / 0.85));
  box-shadow: 0 0 14px rgb(255 59 48 / 0.3);
}
.steps li.now .num {
  background: var(--blood);
}
/* who has finished the stage */
.who-done {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.pchip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 99px;
  background: rgb(10 11 14 / 0.7);
  color: var(--muted);
  font-size: 0.9rem;
}
.pchip.ok {
  border-color: rgb(80 200 120 / 0.5);
  color: var(--text);
}
.pchip.ok b {
  color: var(--ok);
}
.pchip.me {
  box-shadow: inset 0 0 0 1px rgb(255 214 120 / 0.5);
}
/* the bans, once public */
.banned-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0;
}
.banned-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.15rem 0.7rem 0.15rem 0.2rem;
  border: 1px solid var(--blood-dim);
  border-radius: 99px;
  background: rgb(40 6 8 / 0.6);
  font-size: 0.88rem;
}
.banned-chip img {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  object-fit: cover;
  filter: grayscale(1) brightness(0.6);
}
.wait-card h2 {
  margin-bottom: 0.3rem;
}
.big-go {
  font-weight: 700;
}
.perks-stage {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.perks-stage h2 {
  margin: 0;
}
.room {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 1100px;
  margin: 0 auto;
  padding: 1rem;
}
.spacer {
  flex: 1;
}
.small {
  font-size: 0.85rem;
}
.center {
  text-align: center;
}
h2 {
  margin-top: 0;
}
input {
  font: inherit;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  padding: 0.5rem 0.7rem;
}
/* the two sides as big cards, side by side: the room's main choice */
.drawn {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.drawn .mini {
  width: 56px;
  height: 56px;
}
.killer-name {
  display: block;
  font-size: 1.15rem;
}
.double {
  padding: 0.15rem 0.55rem;
  font-size: 0.8rem;
  background: none;
}
.double.on {
  border-color: #ffd56a;
  color: #ffd56a;
  background: rgb(255 214 106 / 0.1);
  opacity: 1;
}
.big {
  width: 100%;
  padding: 0.8rem;
  font-size: 1.1rem;
}
/* the characters stage: the lineup stays beside the pickers while they scroll */
.pick-layout {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}
.team-panel {
  position: sticky;
  top: 0.8rem;
  display: grid;
  gap: 0.6rem;
}
.team-panel h2 {
  margin: 0;
  font-size: 1.05rem;
  letter-spacing: 0.04em;
}
.team-killer {
  margin-top: 0.4rem !important;
  color: var(--blood-bright);
}
.pick-main {
  display: grid;
  gap: 1rem;
  min-width: 0;
}
@media (max-width: 900px) {
  .pick-layout {
    grid-template-columns: 1fr;
  }
  .team-panel {
    position: static;
  }
}
.slots {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: 1fr;
}
.slot {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem;
  text-align: left;
  background: rgb(0 0 0 / 0.3);
}
.slot:disabled {
  opacity: 1;
  cursor: default;
}
.slot.mine {
  border-color: rgb(217 162 39 / 0.6);
}
.slot.active {
  border-color: var(--warn);
  box-shadow: 0 0 0 2px var(--warn) inset;
}
.slot .mini,
.slot .empty,
.drawn .empty {
  width: 48px;
  height: 48px;
  flex: none;
}
.slot .empty,
.drawn .empty {
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px dashed var(--line-strong);
  color: var(--muted);
}
.slot-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.lock {
  margin-left: auto;
}
.killer-card {
  border-color: var(--blood-dim);
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.lockbtn {
  padding: 0.7rem;
  font-size: 1.05rem;
}
.back {
  align-self: flex-start;
  background: none;
  border: none;
  color: var(--muted);
}
.error {
  color: var(--blood-bright);
}
</style>
