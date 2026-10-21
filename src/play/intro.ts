// What the game's opening plays once per game: the minis' start-room rolls.
// "Once" is per browser session and per game, so a reload or a second device doesn't replay it.

import { ref } from 'vue'
import { killerById, survivorById } from '../data'
import { boards } from './engine/boards'
import type { GameState } from './engine/types'
import type { StartMini } from './fx/bus'

export const SEEN = 'dbdl-play-intro-seen'

/**
 * A game just started: 'beat' while the alarm plays over the page as it was (the page keeps its
 * own layout, not the game's), then 'loading', then null. Set by the views.
 */
export const introStage = ref<null | 'beat' | 'loading'>(null)

/** Same for every device in the same game, different between games (the minis' rooms aside). */
export function gameKey(st: GameState): string {
  return [st.board, st.killer.characterId, st.firstPlayer, ...st.survivors.map((s) => s.characterId), st.props.map((p) => p.kind).join('')].join('|')
}

/** Marks `key` as seen under `name`; false when it already was. */
export function firstTime(name: string, key: string): boolean {
  try {
    if (sessionStorage.getItem(name) === key) return false
    sessionStorage.setItem(name, key)
  } catch {
    // storage blocked: it may play again after a reload
  }
  return true
}

/** The minis have rolled their rooms (after the reveals; a game saved before that change rolled at the start). */
export function startsRolled(st: GameState): boolean {
  return st.round === 1 && !st.startPending && (st.phase === 'setup' || (st.phase === 'planning' && st.log.some((e) => /เริ่มที่/.test(e.text))))
}

/** Survivors in turn order from the first player, then the killer (as in the companion): the faces are read back from the rooms. */
export function startMinis(st: GameState): StartMini[] {
  const rooms = boards[st.board].rooms
  const faceOf = (room: string) => rooms.find((r) => r.id === room)?.startFace ?? 0
  const roomName = (room: string) => rooms.find((r) => r.id === room)?.name ?? ''
  const order = [0, 1, 2, 3].map((i) => (st.firstPlayer + i) % 4)
  return [
    ...order.map((i) => {
      const sv = st.survivors[i]
      return {
        key: `s${i}`,
        name: sv.name,
        image: survivorById.get(sv.characterId)?.images.mini ?? '',
        player: `ผู้เล่น ${st.handPlayers[sv.hand]}`,
        room: roomName(sv.room),
        face: faceOf(sv.room),
      }
    }),
    {
      key: 'k',
      killer: true,
      name: st.killer.name,
      image: killerById.get(st.killer.characterId)?.images.mini ?? '',
      player: 'ผู้เล่น 1',
      room: roomName(st.killer.room),
      face: faceOf(st.killer.room),
    },
  ]
}
