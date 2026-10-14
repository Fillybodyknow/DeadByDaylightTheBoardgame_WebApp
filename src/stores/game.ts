import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { killerById, survivorById } from '../data'
import {
  EXIT_GATE_COUNT,
  EXIT_GATE_PROGRESS_TO_OPEN,
  GENERATOR_PROGRESS_MAX,
  GENERATORS_TO_POWER_GATES,
  KILLER_BONUS_TURN_COST,
  PHASES,
  REPAIR_PROGRESS,
  SACRIFICE_TRACK_LENGTH,
  type Phase,
  type SkillResult,
} from '../rules'

export interface SurvivorState {
  characterId: string
  bp: number
  health: 'healthy' | 'wounded'
  status: 'active' | 'hidden' | 'hooked'
  woundedThisRound: boolean // p.15: can't be picked up the round they were wounded
  hasSacrificeToken: boolean // p.6/15: moved to the track on first hooking
  perksUsed: boolean[] // p.16: each perk once per round
  itemId: string | null // p.12: max 1 item
}

export interface KillerState {
  characterId: string
  bp: number
  perksUsed: boolean[]
  powerUsed: boolean // p.14: once per round, instead of interacting
  bonusTurnUsed: boolean // p.10: max once per round
}

export interface Generator {
  id: number
  progress: number
}

export interface LogEntry {
  round: number
  text: string
}

export interface GameState {
  mapId: string
  round: number
  phase: Phase
  /** Index into survivors for the active survivor turn, or killer turn number (1–3). */
  turn: number
  /** Survivor turn order for the current survivors phase (indices into survivors). */
  order?: number[]
  firstPlayer: number
  survivors: SurvivorState[]
  killer: KillerState
  generators: Generator[]
  nextGeneratorId: number
  generatorsCompleted: number
  gates: number[]
  sacrifice: number
  entityInPlay: boolean
  winner: 'survivors' | 'killer' | null
  log: LogEntry[]
}

const STORAGE_KEY = 'dbd-companion-game'
const HISTORY_LIMIT = 50

function load(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as GameState) : null
  } catch {
    return null
  }
}

export const useGameStore = defineStore('game', () => {
  const state = ref<GameState | null>(load())
  const history = ref<string[]>([])

  watch(
    state,
    (value) => {
      try {
        if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
        else localStorage.removeItem(STORAGE_KEY)
      } catch {
        // storage unavailable: game just won't survive a reload
      }
    },
    { deep: true },
  )

  const started = computed(() => state.value !== null)
  const gatesPowered = computed(() => (state.value?.generatorsCompleted ?? 0) >= GENERATORS_TO_POWER_GATES)
  const killerBpMax = computed(() => (state.value ? killerById.get(state.value.killer.characterId)?.bloodpoints.max ?? 12 : 12))

  function survivorName(i: number): string {
    const s = state.value?.survivors[i]
    return s ? survivorById.get(s.characterId)?.name ?? s.characterId : '?'
  }

  function survivorBpMax(i: number): number {
    const s = state.value?.survivors[i]
    return s ? survivorById.get(s.characterId)?.bloodpoints.max ?? 6 : 6
  }

  /** Wrap a mutation so it can be undone. */
  function act(text: string, fn: (g: GameState) => void) {
    const g = state.value
    if (!g || g.winner) return
    history.value.push(JSON.stringify(g))
    if (history.value.length > HISTORY_LIMIT) history.value.shift()
    fn(g)
    g.log.unshift({ round: g.round, text })
    checkWin(g)
  }

  function undo() {
    const prev = history.value.pop()
    if (prev) state.value = JSON.parse(prev) as GameState
  }

  function checkWin(g: GameState) {
    if (g.winner) return
    // p.11: whichever side completes its objective first wins immediately.
    if (g.gates.some((p) => p >= EXIT_GATE_PROGRESS_TO_OPEN)) g.winner = 'survivors'
    else if (g.sacrifice >= SACRIFICE_TRACK_LENGTH) g.winner = 'killer'
  }

  function clamp(n: number, max: number) {
    return Math.max(0, Math.min(max, n))
  }

  // ---------- setup ----------

  function start(opts: { killerId: string; survivorIds: string[]; mapId: string; firstPlayer: number }) {
    const killer = killerById.get(opts.killerId)
    history.value = []
    state.value = {
      mapId: opts.mapId,
      round: 1,
      phase: 'planning',
      turn: 0,
      firstPlayer: opts.firstPlayer,
      survivors: opts.survivorIds.map((id) => ({
        characterId: id,
        bp: survivorById.get(id)?.bloodpoints.start ?? 2,
        health: 'healthy',
        status: 'active',
        woundedThisRound: false,
        hasSacrificeToken: true,
        perksUsed: [false, false, false],
        itemId: null,
      })),
      killer: {
        characterId: opts.killerId,
        bp: killer?.bloodpoints.start ?? 4,
        perksUsed: [false, false, false],
        powerUsed: false,
        bonusTurnUsed: false,
      },
      generators: [],
      nextGeneratorId: 1,
      generatorsCompleted: 0,
      gates: Array(EXIT_GATE_COUNT).fill(0),
      sacrifice: 0,
      entityInPlay: false,
      winner: null,
      log: [],
    }
  }

  function reset() {
    history.value = []
    state.value = null
  }

  // ---------- phases (p.8–11) ----------

  /** Unhooked survivors in turn order starting from the first player (p.8, p.15). */
  function liveOrder(g: GameState): number[] {
    const n = g.survivors.length
    return Array.from({ length: n }, (_, k) => (g.firstPlayer + k) % n).filter((i) => g.survivors[i].status !== 'hooked')
  }

  // Fixed when the survivors phase starts, so hooks/rescues mid-phase don't shift whose turn it is.
  const turnOrder = computed(() => {
    const g = state.value
    if (!g) return []
    return g.phase === 'survivors' && g.order ? g.order : liveOrder(g)
  })

  /** Killer turns before any bonus turn: 2 normally, 3 for The Singularity (its board). */
  const killerBaseTurns = computed(() => (state.value?.killer.characterId === 'singularity' ? 3 : 2))

  function nextStep() {
    const g = state.value
    if (!g || g.winner) return
    if (g.phase === 'planning') {
      act('Survivors act', (s) => {
        s.phase = 'survivors'
        s.turn = 0
        s.order = liveOrder(s)
      })
    } else if (g.phase === 'survivors') {
      if (g.turn < turnOrder.value.length - 1) act(`${survivorName(turnOrder.value[g.turn + 1])}'s turn`, (s) => s.turn++)
      else
        act('Killer acts', (s) => {
          s.phase = 'killer'
          s.turn = 1
        })
    } else if (g.phase === 'killer') {
      const maxTurn = killerBaseTurns.value + (g.killer.bonusTurnUsed ? 1 : 0)
      if (g.turn < maxTurn) act(`Killer turn ${g.turn + 1}`, (s) => s.turn++)
      else
        act('Cleanup', (s) => {
          s.phase = 'cleanup'
          s.turn = 0
        })
    } else {
      cleanup()
    }
  }

  /** p.11: run the cleanup steps in order, then start the next round's planning. */
  function cleanup() {
    act('Cleanup done', (g) => {
      const hooked = g.survivors.filter((s) => s.status === 'hooked').length
      g.sacrifice = clamp(g.sacrifice + hooked, SACRIFICE_TRACK_LENGTH)
      if (hooked) g.log.unshift({ round: g.round, text: `Sacrifice progression +${hooked}` })
      if (g.sacrifice >= SACRIFICE_TRACK_LENGTH) return
      g.entityInPlay = false
      // p.11: pass clockwise to the next survivor in turn order; hooked survivors are skipped (p.15).
      const n = g.survivors.length
      const nextFirst = Array.from({ length: n }, (_, k) => (g.firstPlayer + 1 + k) % n).find(
        (i) => g.survivors[i].status !== 'hooked',
      )
      g.firstPlayer = nextFirst ?? (g.firstPlayer + 1) % n
      for (const s of g.survivors) {
        s.woundedThisRound = false
        s.perksUsed = s.perksUsed.map(() => false)
      }
      g.killer.perksUsed = g.killer.perksUsed.map(() => false)
      g.killer.powerUsed = false
      g.killer.bonusTurnUsed = false
      g.round++
      g.phase = 'planning'
      g.turn = 0
    })
  }

  const phaseIndex = computed(() => (state.value ? PHASES.indexOf(state.value.phase) : 0))

  // ---------- bloodpoints ----------

  function survivorBp(i: number, delta: number) {
    act(`${survivorName(i)} ${delta > 0 ? '+' : ''}${delta} BP`, (g) => {
      g.survivors[i].bp = clamp(g.survivors[i].bp + delta, survivorBpMax(i))
    })
  }

  function killerBp(delta: number) {
    act(`Killer ${delta > 0 ? '+' : ''}${delta} BP`, (g) => {
      g.killer.bp = clamp(g.killer.bp + delta, killerBpMax.value)
    })
  }

  // ---------- perks / power ----------

  function activateSurvivorPerk(i: number, perk: number) {
    const g = state.value
    const s = g?.survivors[i]
    const cost = survivorById.get(s?.characterId ?? '')?.perks[perk]?.cost ?? 0
    if (!s || s.perksUsed[perk] || s.bp < cost || s.status !== 'active') return
    act(`${survivorName(i)} used ${survivorById.get(s.characterId)?.perks[perk].name} (-${cost} BP)`, (st) => {
      st.survivors[i].bp -= cost
      st.survivors[i].perksUsed[perk] = true
    })
  }

  function activateKillerPerk(perk: number) {
    const k = state.value?.killer
    const def = killerById.get(k?.characterId ?? '')?.perks[perk]
    const cost = def?.cost ?? 0
    if (!k || k.perksUsed[perk] || k.bp < cost) return
    act(`Killer used ${def?.name} (-${cost} BP)`, (g) => {
      g.killer.bp -= cost
      g.killer.perksUsed[perk] = true
    })
  }

  function activateKillerPower() {
    if (!state.value || state.value.killer.powerUsed) return
    act(`Killer used ${killerById.get(state.value.killer.characterId)?.power.name}`, (g) => {
      g.killer.powerUsed = true
    })
  }

  // p.10: pay 4 BP after the last regular turn. Boards with no extra action
  // (The Singularity, The Unknown) can't buy one.
  const canBuyBonusTurn = computed(() => {
    const g = state.value
    if (!g || !killerById.get(g.killer.characterId)?.extraAction) return false
    return g.phase === 'killer' && g.turn === killerBaseTurns.value && !g.killer.bonusTurnUsed && g.killer.bp >= KILLER_BONUS_TURN_COST
  })

  // Perks such as Devour Hope or Coup de Grâce grant a bonus turn for free, even at the start of cleanup.
  // Still max one per round (p.10).
  const canFreeBonusTurn = computed(() => {
    const g = state.value
    if (!g || g.killer.bonusTurnUsed) return false
    return (g.phase === 'killer' && g.turn === killerBaseTurns.value) || g.phase === 'cleanup'
  })

  function killerBonusTurn(free = false) {
    if (!(free ? canFreeBonusTurn.value : canBuyBonusTurn.value)) return
    const cost = free ? 0 : KILLER_BONUS_TURN_COST
    act(`Killer bonus turn${cost ? ` (-${cost} BP)` : ' (free)'}`, (g) => {
      g.killer.bp -= cost
      g.killer.bonusTurnUsed = true
      g.phase = 'killer'
      g.turn = killerBaseTurns.value + 1
    })
  }

  // ---------- survivor status (p.12–15) ----------

  // p.12: a survivor on a locker or hook is "not on the board" for interactions.
  function attack(i: number) {
    const s = state.value?.survivors[i]
    if (!s || s.health === 'wounded' || s.status !== 'active') return
    act(`${survivorName(i)} wounded`, (g) => {
      g.survivors[i].health = 'wounded'
      g.survivors[i].woundedThisRound = true
    })
  }

  function heal(i: number) {
    const s = state.value?.survivors[i]
    if (!s || s.health !== 'wounded' || s.status !== 'active') return
    act(`${survivorName(i)} healed`, (g) => {
      g.survivors[i].health = 'healthy'
      g.survivors[i].woundedThisRound = false
    })
  }

  function toggleHide(i: number) {
    const s = state.value?.survivors[i]
    if (!s || s.status === 'hooked') return
    act(`${survivorName(i)} ${s.status === 'hidden' ? 'left' : 'hid in'} a locker`, (g) => {
      g.survivors[i].status = s.status === 'hidden' ? 'active' : 'hidden'
    })
  }

  /** p.15: once sacrificed, a survivor's own sacrifice token moves to the track. */
  /** p.15: can't pick up a survivor wounded this round (a failed locker Search still can, p.14). */
  function canHook(i: number): boolean {
    const s = state.value?.survivors[i]
    return !!s && s.status !== 'hooked' && !(s.woundedThisRound && s.status === 'active')
  }

  function hook(i: number) {
    if (!canHook(i)) return
    act(`${survivorName(i)} sacrificed on a hook`, (g) => {
      const t = g.survivors[i]
      t.status = 'hooked'
      if (t.hasSacrificeToken) {
        t.hasSacrificeToken = false
        g.sacrifice = clamp(g.sacrifice + 1, SACRIFICE_TRACK_LENGTH)
      }
    })
  }

  /** p.13: sabotaging an occupied hook rescues the survivor; rescuer gains 1 BP. */
  function rescue(i: number, rescuer: number) {
    const s = state.value?.survivors[i]
    if (!s || s.status !== 'hooked' || rescuer === i) return
    act(`${survivorName(rescuer)} rescued ${survivorName(i)}`, (g) => {
      g.survivors[i].status = 'active'
      g.survivors[rescuer].bp = clamp(g.survivors[rescuer].bp + 1, survivorBpMax(rescuer))
      g.entityInPlay = true
    })
  }

  function setItem(i: number, itemId: string | null) {
    act(`${survivorName(i)} item: ${itemId ?? 'none'}`, (g) => {
      g.survivors[i].itemId = itemId
    })
  }

  // ---------- objectives ----------

  function addGenerator() {
    act('Generator revealed', (g) => {
      g.generators.push({ id: g.nextGeneratorId++, progress: 0 })
    })
  }

  /** p.12: a generator reaching 3 progress is completed and moves to the generator track. */
  function generatorProgress(id: number, delta: number) {
    act(`Generator #${id} ${delta > 0 ? '+' : ''}${delta}`, (g) => {
      const gen = g.generators.find((x) => x.id === id)
      if (!gen) return
      gen.progress = clamp(gen.progress + delta, GENERATOR_PROGRESS_MAX)
      if (gen.progress >= GENERATOR_PROGRESS_MAX) {
        g.generators = g.generators.filter((x) => x.id !== id)
        g.generatorsCompleted++
        g.log.unshift({ round: g.round, text: `Generator #${id} completed (${g.generatorsCompleted}/${GENERATORS_TO_POWER_GATES})` })
      }
    })
  }

  function repair(id: number, result: SkillResult) {
    if (REPAIR_PROGRESS[result] > 0) generatorProgress(id, REPAIR_PROGRESS[result])
  }

  /** p.14: Damage removes all progress. */
  function damageGenerator(id: number) {
    act(`Generator #${id} damaged`, (g) => {
      const gen = g.generators.find((x) => x.id === id)
      if (gen) gen.progress = 0
    })
  }

  function removeGenerator(id: number) {
    act(`Generator #${id} removed`, (g) => {
      g.generators = g.generators.filter((x) => x.id !== id)
    })
  }

  /** p.13: only once gates are powered; success adds 1 progress, 3 opens the gate. */
  function gateProgress(gate: number, delta: number) {
    if (!gatesPowered.value) return
    act(`Exit gate ${gate + 1} ${delta > 0 ? '+' : ''}${delta}`, (g) => {
      g.gates[gate] = clamp(g.gates[gate] + delta, EXIT_GATE_PROGRESS_TO_OPEN)
    })
  }

  function sacrificeProgress(delta: number) {
    act(`Sacrifice progress ${delta > 0 ? '+' : ''}${delta}`, (g) => {
      g.sacrifice = clamp(g.sacrifice + delta, SACRIFICE_TRACK_LENGTH)
    })
  }

  function completedGenerators(delta: number) {
    act(`Completed generators ${delta > 0 ? '+' : ''}${delta}`, (g) => {
      g.generatorsCompleted = clamp(g.generatorsCompleted + delta, 8)
    })
  }

  function toggleEntity() {
    act('Entity token toggled', (g) => {
      g.entityInPlay = !g.entityInPlay
    })
  }

  // ---------- dice (p.16) ----------

  /** Record a skill check; any failure gives the killer 1 BP (p.16, p.18 FAQ). */
  function recordRoll(who: string, faces: SkillResult[]) {
    const failed = faces.includes('fail')
    act(`${who} rolled ${faces.join(', ')}${failed ? ' — Killer +1 BP' : ''}`, (g) => {
      if (failed) g.killer.bp = clamp(g.killer.bp + 1, killerBpMax.value)
    })
  }

  return {
    state,
    started,
    history,
    gatesPowered,
    killerBpMax,
    turnOrder,
    phaseIndex,
    canBuyBonusTurn,
    canFreeBonusTurn,
    killerBaseTurns,
    canHook,
    survivorName,
    survivorBpMax,
    start,
    reset,
    undo,
    nextStep,
    survivorBp,
    killerBp,
    activateSurvivorPerk,
    activateKillerPerk,
    activateKillerPower,
    killerBonusTurn,
    attack,
    heal,
    toggleHide,
    hook,
    rescue,
    setItem,
    addGenerator,
    generatorProgress,
    repair,
    damageGenerator,
    removeGenerator,
    gateProgress,
    sacrificeProgress,
    completedGenerators,
    toggleEntity,
    recordRoll,
  }
})
