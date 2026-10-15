// The game in play: current state, undo history and saving to localStorage — or, online, the
// shared room's state (see online/session.ts).

import { computed, shallowRef } from 'vue'
import { createGame, tryApply, type GameConfig } from './engine/engine'
import { actorsOf, mayAct } from './engine/seats'
import type { Action, GameState } from './engine/types'
import type { Room } from './online/transport'

const KEY = 'dbdl-play-game'
const MAX_UNDO = 60

export const game = shallowRef<GameState | null>(load())
const history = shallowRef<GameState[]>([])

/**
 * Set while playing online: the shared room, the player number sitting at this device, and the
 * room's latest known game (to fall back on when a write doesn't go through).
 */
export const online = shallowRef<{ room: Room; seat: number; latest: () => GameState | null } | null>(null)

/** Online moves made on this device that the room hasn't confirmed yet. */
export const pendingWrites = shallowRef(0)

export const canUndo = computed(() => !online.value && history.value.length > 0)

/** Whether this device may act now (always, on one shared device). */
export const myTurn = computed(() => {
  const st = game.value
  const o = online.value
  return !st || !o || actorsOf(st).includes(o.seat)
})

function load(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY)
    const st = raw ? (JSON.parse(raw) as GameState) : null
    return st?.version === 3 ? st : null
  } catch {
    return null
  }
}

function save() {
  if (online.value) return // the room holds an online game; keep the local save for hot-seat
  try {
    if (game.value) localStorage.setItem(KEY, JSON.stringify(game.value))
    else localStorage.removeItem(KEY)
  } catch {
    // storage full or blocked: the game still runs, it just won't survive a reload
  }
}

/** Apply an action; false when it is not legal right now (or, online, not this player's). */
export function dispatch(action: Action): boolean {
  const cur = game.value
  if (!cur) return false
  const o = online.value
  if (o) {
    if (!mayAct(cur, o.seat, action)) return false
    const next = tryApply(cur, action)
    if (!next) return false
    // Show it at once, then commit. If someone else changed the game first, the action is
    // checked again against their state; the room's state is what everyone ends up with.
    game.value = next
    pendingWrites.value++
    void o.room
      .updateGame((latest) => (latest && mayAct(latest, o.seat, action) ? tryApply(latest, action) : null))
      .then(
        (ok) => !ok && resync(o),
        () => resync(o),
      )
      .finally(() => pendingWrites.value--)
    return true
  }
  const next = tryApply(cur, action)
  if (!next) return false
  history.value = [...history.value.slice(-MAX_UNDO + 1), cur]
  game.value = next
  save()
  return true
}

/**
 * The write didn't go through (the room had moved on, or the network failed): drop the state
 * shown ahead of time and show the room's, so this player sees whose turn it really is.
 */
function resync(o: NonNullable<typeof online.value>) {
  // (online.value is rebuilt on every room update, so compare the room itself)
  if (online.value?.room !== o.room) return
  const latest = o.latest()
  console.warn('online: action not saved, showing the room state again')
  if (latest) game.value = latest
}

/** A new state from the room (another player acted, or ours came back). */
export function receive(st: GameState | null) {
  game.value = st
}

export function undo() {
  const h = history.value
  if (!h.length || online.value) return
  game.value = h[h.length - 1]
  history.value = h.slice(0, -1)
  save()
}

export function newGame(config: GameConfig) {
  history.value = []
  game.value = createGame(config)
  save()
}

export function quitGame() {
  history.value = []
  game.value = null
  save()
}

/** Back to the hot-seat save after leaving an online room. */
export function restoreLocal() {
  online.value = null
  history.value = []
  game.value = load()
}
