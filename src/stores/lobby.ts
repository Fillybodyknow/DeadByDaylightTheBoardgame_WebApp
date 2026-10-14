import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  killerById,
  mapById,
  perkOption,
  printedPerks,
  survivorById,
  type PerkRef,
} from '../data'
import type { Perk } from '../types'

export const SURVIVOR_COUNT = 4 // p.19: always 4 survivors regardless of player count
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 5

export type LobbyStep = 'players' | 'survivors' | 'killer' | 'map' | 'perks'

/** p.19: Adept = printed perks only; Devout = each character picks its 3 perks. */
export type GameMode = 'adept' | 'devout'

export interface LobbyState {
  mode: GameMode
  /** Devout: the perk step has been opened (after the map is picked). */
  perksStarted: boolean
  /** Devout: each mini's 3 chosen perks, set when that player confirms (hidden until reveal). */
  perkPicks: Partial<Record<MiniKey, PerkRef[]>>
  /** Devout: all picks revealed together (p.19 "reveal them simultaneously"). */
  perksRevealed: boolean
  players: string[]
  /** Player list confirmed; character picking can start. */
  playersConfirmed: boolean
  /** Index into players of the Killer player. */
  killerPlayer: number
  /** For each of the 4 survivor seats, the index of the player controlling it. */
  seats: number[]
  survivorPicks: (string | null)[]
  killerPick: string | null
  mapId: string | null
  /** Survivor seat holding the first player marker (setup step 2). */
  firstPlayerSeat: number | null
  setupChecked: boolean[]
  /** Setup step 11: die face (0–5) each mini rolled for its start room, keyed by mini. */
  startRolls: Partial<Record<MiniKey, number>>
}

/** A mini on the board: the killer or a survivor seat. */
export type MiniKey = 'killer' | 's0' | 's1' | 's2' | 's3'
export const MINI_KEYS: MiniKey[] = ['killer', 's0', 's1', 's2', 's3']

const STORAGE_KEY = 'dbd-companion-lobby'

function fresh(players: string[] = ['', '', '', '', ''], killerPlayer = 0): LobbyState {
  return {
    mode: 'adept',
    perksStarted: false,
    perkPicks: {},
    perksRevealed: false,
    players,
    playersConfirmed: false,
    killerPlayer,
    seats: autoSeats(players.length, killerPlayer),
    survivorPicks: Array(SURVIVOR_COUNT).fill(null),
    killerPick: null,
    mapId: null,
    firstPlayerSeat: null,
    setupChecked: [],
    startRolls: {},
  }
}

/**
 * p.6/19: 5 players = 1 survivor each; 4 = one player controls 2; 3 = both control 2;
 * 2 = one player controls all 4. Seats go round-robin over the survivor players.
 */
export function autoSeats(playerCount: number, killerPlayer: number): number[] {
  const survivorPlayers = Array.from({ length: playerCount }, (_, i) => i).filter((i) => i !== killerPlayer)
  return Array.from({ length: SURVIVOR_COUNT }, (_, s) => survivorPlayers[s % survivorPlayers.length])
}

function load(): LobbyState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = { ...fresh(), ...(JSON.parse(raw) as Partial<LobbyState>) }
      // Older saves could make any player the Killer; it is now always player 1.
      if (saved.killerPlayer !== 0) saved.seats = autoSeats(saved.players.length, (saved.killerPlayer = 0))
      return saved
    }
  } catch {
    // storage unavailable or corrupt: start fresh
  }
  return fresh()
}

export const useLobbyStore = defineStore('lobby', () => {
  const state = ref<LobbyState>(load())

  watch(
    state,
    (value) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      } catch {
        // storage unavailable: lobby just won't survive a reload
      }
    },
    { deep: true },
  )

  const s = state

  // Players aren't named in the lobby: they are "ผู้เล่น 1..n", player 1 being the Killer.
  function playerName(i: number): string {
    return `ผู้เล่น ${i + 1}`
  }

  function seatPlayerName(seat: number): string {
    return playerName(s.value.seats[seat])
  }

  // ---------- players ----------

  function setPlayerCount(n: number) {
    const count = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, n))
    const players = Array.from({ length: count }, (_, i) => s.value.players[i] ?? '')
    const killerPlayer = s.value.killerPlayer < count ? s.value.killerPlayer : 0
    s.value.players = players
    s.value.killerPlayer = killerPlayer
    s.value.seats = autoSeats(count, killerPlayer)
  }

  function confirmPlayers() {
    s.value.playersConfirmed = true
  }

  function editPlayers() {
    s.value.playersConfirmed = false
  }

  function setSeat(seat: number, player: number) {
    if (player === s.value.killerPlayer) return
    s.value.seats[seat] = player
  }

  // ---------- survivors pick first, in seat order ----------

  /** The first survivor seat without a character, or null when all 4 are picked. */
  const currentSurvivorSeat = computed(() => {
    const i = s.value.survivorPicks.findIndex((p) => p === null)
    return i === -1 ? null : i
  })

  function pickSurvivor(id: string) {
    const seat = currentSurvivorSeat.value
    if (seat === null || s.value.survivorPicks.includes(id)) return
    s.value.survivorPicks[seat] = id
  }

  function clearSurvivorSeat(seat: number) {
    s.value.survivorPicks[seat] = null
    invalidatePerkPicks()
  }



  const survivorsDone = computed(() => currentSurvivorSeat.value === null)

  // ---------- then the killer picks a character and the map ----------

  function pickKiller(id: string | null) {
    if (s.value.killerPick !== id) invalidatePerkPicks()
    s.value.killerPick = id
  }


  function pickMap(id: string | null) {
    if (s.value.mapId !== id) s.value.startRolls = {}
    s.value.mapId = id
  }

  function invalidatePerkPicks() {
    // Changing a character invalidates any perk choices made for it.
    s.value.perkPicks = {}
    s.value.perksRevealed = false
  }

  function clearPerks() {
    s.value.perksStarted = false
    s.value.perkPicks = {}
    s.value.perksRevealed = false
  }

  /** Go back to an earlier lobby step, clearing the choices made after it. */
  function backTo(step: LobbyStep) {
    const order: LobbyStep[] = ['players', 'survivors', 'killer', 'map', 'perks']
    const i = order.indexOf(step)
    clearPerks()
    if (step === 'perks') {
      s.value.perksStarted = true
      return
    }
    if (i <= 0) s.value.playersConfirmed = false
    if (i <= 1) s.value.survivorPicks = s.value.survivorPicks.map(() => null)
    if (i <= 2) s.value.killerPick = null
    s.value.mapId = null
    s.value.startRolls = {}
  }

  // ---------- Devout perks (p.19) ----------

  function setMode(mode: GameMode) {
    if (s.value.mode !== mode) clearPerks()
    s.value.mode = mode
  }

  function startPerks() {
    if (s.value.mode === 'devout' && s.value.mapId) s.value.perksStarted = true
  }

  /** Character id behind a mini. */
  function characterOf(key: MiniKey): string | null {
    return key === 'killer' ? s.value.killerPick : s.value.survivorPicks[Number(key.slice(1))]
  }

  // Survivors pick in seat order, then the killer (same order as the lobby).
  const PERK_ORDER: MiniKey[] = ['s0', 's1', 's2', 's3', 'killer']

  /** The next mini whose player still has to pick perks, or null when everyone has. */
  const currentPerkPicker = computed(() => PERK_ORDER.find((k) => !s.value.perkPicks[k]) ?? null)

  /** Exactly 3 different perks (p.19: no two copies of the same perk). */
  function confirmPerks(key: MiniKey, refs: PerkRef[]) {
    if (refs.length !== 3 || new Set(refs).size !== 3) return
    s.value.perkPicks = { ...s.value.perkPicks, [key]: [...refs] }
  }

  function revealPerks() {
    if (currentPerkPicker.value === null) s.value.perksRevealed = true
  }

  /** The perks a mini plays with: the Devout picks, or the printed ones. */
  function perksFor(key: MiniKey): Perk[] {
    const id = characterOf(key)
    if (!id) return []
    const kind = key === 'killer' ? 'killer' : 'survivor'
    const refs = (s.value.mode === 'devout' && s.value.perkPicks[key]) || printedPerks(kind, id)
    return refs.map((r) => perkOption(r)?.perk).filter((p): p is Perk => !!p)
  }

  const ready = computed(
    () =>
      survivorsDone.value &&
      !!s.value.killerPick &&
      !!s.value.mapId &&
      (s.value.mode === 'adept' || s.value.perksRevealed),
  )

  /** Which lobby step the group is on, derived from what has been chosen. */
  const step = computed<LobbyStep>(() => {
    if (!s.value.playersConfirmed) return 'players'
    if (!survivorsDone.value) return 'survivors'
    if (!s.value.killerPick) return 'killer'
    if (s.value.mode === 'devout' && s.value.perksStarted && s.value.mapId) return 'perks'
    return 'map'
  })

  // ---------- setup checklist ----------

  function setFirstPlayer(seat: number) {
    s.value.firstPlayerSeat = seat
  }

  function randomFirstPlayer() {
    s.value.firstPlayerSeat = Math.floor(Math.random() * SURVIVOR_COUNT)
  }

  // p.6 step 11: every mini rolls a skill check die; several minis may share a room.
  const rollDie = () => Math.floor(Math.random() * 6)

  function rollStartRooms() {
    s.value.startRolls = Object.fromEntries(MINI_KEYS.map((k) => [k, rollDie()]))
  }

  const hasStartRolls = computed(() => MINI_KEYS.every((k) => s.value.startRolls[k] !== undefined))

  /** Every mini with its character, controlling player, rolled face and start room. */
  const minis = computed(() => {
    const map = s.value.mapId ? mapById.get(s.value.mapId) : undefined
    return MINI_KEYS.map((key) => {
      const isKiller = key === 'killer'
      const seat = isKiller ? -1 : Number(key.slice(1))
      const c = isKiller
        ? killerById.get(s.value.killerPick ?? '')
        : survivorById.get(s.value.survivorPicks[seat] ?? '')
      const face = s.value.startRolls[key]
      return {
        key,
        killer: isKiller,
        name: c?.name ?? '?',
        image: c?.images.mini ?? '',
        player: isKiller ? playerName(s.value.killerPlayer) : seatPlayerName(seat),
        face,
        room: face === undefined ? undefined : map?.startRooms.find((r) => r.face === face)?.name,
      }
    })
  })

  function toggleSetup(i: number) {
    s.value.setupChecked[i] = !s.value.setupChecked[i]
  }

  // ---------- restart ----------

  /** Same players, seats and mode; new characters, map and perks. */
  function rematch() {
    state.value = {
      ...fresh([...s.value.players], s.value.killerPlayer),
      seats: [...s.value.seats],
      playersConfirmed: true,
      mode: s.value.mode,
    }
  }

  function reset() {
    state.value = fresh(Array(s.value.players.length).fill(''))
  }

  return {
    state,
    step,
    currentSurvivorSeat,
    survivorsDone,
    ready,
    playerName,
    seatPlayerName,
    setPlayerCount,
    setSeat,
    pickSurvivor,
    clearSurvivorSeat,
    pickKiller,
    pickMap,
    backTo,
    setMode,
    startPerks,
    characterOf,
    currentPerkPicker,
    confirmPerks,
    revealPerks,
    perksFor,
    setFirstPlayer,
    randomFirstPlayer,
    rollStartRooms,
    hasStartRolls,
    minis,
    toggleSetup,
    confirmPlayers,
    editPlayers,
    rematch,
    reset,
  }
})
