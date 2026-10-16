// Picking a movement card by clicking a path on the map (or, for Wait, the room), while a hand of cards is out for it
// (planning, a bonus turn). The panel holding the hand sets which paths stand for which card and
// what a pick does; GameScreen makes those paths clickable and calls `pick`. A click picks the
// card in the hand, exactly as clicking it there would — the choice is still confirmed in the panel.

import { shallowRef } from 'vue'
import { boardOf, CARD_NAMES, tokenOf, touchingPaths } from './engine/engine'
import type { GameState, MoveCard } from './engine/types'

export interface PathPick {
  /** Path icon → the card its colour stands for. */
  paths: Record<string, MoveCard>
  /** Room → Wait: a killer's Wait has no path, so the room he stays in stands for it. */
  rooms: Record<string, MoveCard>
  pick: (card: MoveCard) => void
}

export const pathPick = shallowRef<PathPick | null>(null)

/**
 * The paths out of `room` (or out of any of several rooms) whose colour is one of `cards`, each
 * picking that card.
 */
export function pathPickFor(st: GameState, room: string | string[], cards: MoveCard[], pick: (card: MoveCard) => void): PathPick | null {
  const board = boardOf(st)
  const paths: Record<string, MoveCard> = {}
  const rooms: Record<string, MoveCard> = {}
  for (const r of typeof room === 'string' ? [room] : room) {
    for (const p of touchingPaths(st, r)) if (cards.includes(p.kind)) paths[tokenOf(board, p.id)] = p.kind
    if (cards.includes('wait')) rooms[r] = 'wait'
  }
  return Object.keys(paths).length || Object.keys(rooms).length ? { paths, rooms, pick } : null
}

/** The board's tooltip for such a path. */
export const pathPickLabel = (card: MoveCard) => (card === 'wait' ? 'เลือกการ์ด Wait (อยู่ที่ห้องนี้)' : `เลือกการ์ด ${CARD_NAMES[card]}`)
