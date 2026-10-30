// The game in play: current state, undo history and saving to localStorage — or, online, the
// shared room's state (see online/session.ts).

import { computed, shallowRef } from 'vue'
import { botsOnly, peopleMay } from './bots'
import { createGame, tryApply, type GameConfig } from './engine/engine'
import { KILLER_PLAYER, actorsOf, mayAct } from './engine/seats'
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

/**
 * Online, a survivor's item shows only on the screen of the player who holds it (house rule): the
 * killer, a spectator and the other survivors' players see that an item is held, not which.
 * Items show when used. One shared device can't hide anything.
 */
export function itemHidden(st: GameState, s: number): boolean {
  const o = online.value
  if (!o) return false
  return !o.seat || o.seat === KILLER_PLAYER || st.handPlayers[st.survivors[s].hand] !== o.seat
}

/** Whether this device plays survivor `s` (always, on one shared device). */
export function controls(st: GameState, s: number): boolean {
  const o = online.value
  return !o || (!!o.seat && st.handPlayers[st.survivors[s].hand] === o.seat)
}

/**
 * Set while a tutorial chapter plays (tutorial/runner.ts): its game is never saved over the
 * hot-seat one, and `allow` may hold back an action (the learner is shown what to do instead).
 */
export const tutorial = shallowRef<{ allow(st: GameState, action: Action): boolean } | null>(null)

/** Online moves made on this device that the room hasn't confirmed yet. */
export const pendingWrites = shallowRef(0)

export const canUndo = computed(() => !online.value && !tutorial.value && history.value.length > 0)

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
  if (tutorial.value) return // a lesson's game: the hot-seat save stays as it was
  try {
    if (game.value) localStorage.setItem(KEY, JSON.stringify(game.value))
    else localStorage.removeItem(KEY)
  } catch {
    // storage full or blocked: the game still runs, it just won't survive a reload
  }
}

type Online = NonNullable<typeof online.value>

/** Online: make `seat`'s move here at once, then send it to the room. */
function send(o: Online, seat: number, action: Action): boolean {
  const cur = game.value
  if (!cur || !mayAct(cur, seat, action)) return false
  const next = tryApply(cur, action)
  if (!next) return false
  // Show it at once, then send the move. If someone else moved first, it is checked again
  // against their state; every device replays the same moves, so all of them agree.
  game.value = next
  pendingWrites.value++
  void o.room
    .sendMove((latest) => (latest && mayAct(latest, seat, action) && tryApply(latest, action) ? action : null))
    .then(
      (ok) => !ok && resync(o),
      () => resync(o),
    )
    .finally(() => pendingWrites.value--)
  return true
}

/** Online: a bot's move, sent by the device that plays the bots (session.ts `botDriver`). */
export function dispatchBot(player: number, action: Action): boolean {
  const o = online.value
  return !!o && !!game.value?.bots?.includes(player) && send(o, player, action)
}

/**
 * Apply an action; false when it is not legal right now (or, online, not this player's; on one
 * device with bots, a bot's — unless `byBot`, the bot driver's own).
 */
export function dispatch(action: Action, byBot = false): boolean {
  const cur = game.value
  if (!cur) return false
  const o = online.value
  if (o) return send(o, o.seat, action)
  if (tutorial.value && !tutorial.value.allow(cur, action)) return false
  if (!byBot && !peopleMay(cur, action)) return false
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
  const h = [...history.value]
  if (!h.length || online.value) return
  // back to the people's last move: a state waiting on bots would only be played again at once
  let back = h.pop()!
  while (botsOnly(back) && h.length) back = h.pop()!
  game.value = back
  history.value = h
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

/** A tutorial chapter's game on screen (never saved). */
export function playTutorial(st: GameState) {
  history.value = []
  game.value = st
}

/** Back to the hot-seat save after a tutorial. */
export function leaveTutorial() {
  tutorial.value = null
  history.value = []
  game.value = load()
}

/** Back to the hot-seat save after leaving an online room. */
export function restoreLocal() {
  online.value = null
  history.value = []
  game.value = load()
}
