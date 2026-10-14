// The game in play: current state, undo history and saving to localStorage.

import { computed, shallowRef } from 'vue'
import { createGame, tryApply, type GameConfig } from './engine/engine'
import type { Action, GameState } from './engine/types'

const KEY = 'dbdl-play-game'
const MAX_UNDO = 60

export const game = shallowRef<GameState | null>(load())
const history = shallowRef<GameState[]>([])

export const canUndo = computed(() => history.value.length > 0)

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
  try {
    if (game.value) localStorage.setItem(KEY, JSON.stringify(game.value))
    else localStorage.removeItem(KEY)
  } catch {
    // storage full or blocked: the game still runs, it just won't survive a reload
  }
}

/** Apply an action; false when it is not legal right now. */
export function dispatch(action: Action): boolean {
  const cur = game.value
  if (!cur) return false
  const next = tryApply(cur, action)
  if (!next) return false
  history.value = [...history.value.slice(-MAX_UNDO + 1), cur]
  game.value = next
  save()
  return true
}

export function undo() {
  const h = history.value
  if (!h.length) return
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
