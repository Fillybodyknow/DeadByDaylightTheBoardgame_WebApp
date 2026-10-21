// What the game's opening plays once per game: the minis' start-room rolls.
// "Once" is per browser session and per game, so a reload or a second device doesn't replay it.

import { ref } from 'vue'
import { components, killerById, survivorById } from '../data'
import { asset } from '../i18n'
import { boards } from './engine/boards'
import { PERKS, type PerkId } from './engine/perks'
import {
  BEAR_TRAP_IMAGE,
  KNIFE_IMAGE,
  MADNESS_IMAGE,
  PROP_IMAGE,
  SACRIFICE_IMAGE,
  VICTOR_MINI,
  VILE_PURGE_IMAGE,
  cardImage,
  itemImage,
  killerMini,
  perkImage,
  survivorMini,
} from './labels'
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

/**
 * Every picture this game will put on screen early: the map and its backdrop, the minis, the props
 * (face up and face down), the movement cards, the dice, the tokens, the killer's power and passive,
 * the items in hand and every perk in play. The loading page fetches them so the game opens whole.
 */
export function gameAssets(st: GameState): string[] {
  const k = killerById.get(st.killer.characterId)
  const perks = [...st.killer.perks, ...st.survivors.flatMap((s) => s.perks)] as PerkId[]
  const list = [
    boards[st.board]?.image,
    `assets/app/background-img/background_${st.board}.webp`,
    killerMini(st),
    ...st.survivors.map((_, i) => survivorMini(st, i)),
    ...(st.killer.characterId === 'twins' ? [VICTOR_MINI] : []),
    ...Object.values(PROP_IMAGE),
    ...(['objective', 'survival', 'altruism', 'boldness'] as const).map((c) => `assets/props/back-${c}.webp`),
    ...(['sneak', 'sprint', 'crouch', 'vault', 'wait'] as const).map(cardImage),
    ...components.skillDieFaces,
    ...components.dangerDieFaces,
    components.bloodpoint.image,
    components.entity.image,
    components.breakableWall.image,
    SACRIFICE_IMAGE,
    k?.power.image?.th,
    k?.passiveImage?.th,
    ...(k?.tokens ?? []).map((t) => t.image),
    ...(st.killer.characterId === 'trapper' ? [BEAR_TRAP_IMAGE] : []),
    ...(st.killer.characterId === 'doctor' ? [MADNESS_IMAGE] : []),
    ...(st.killer.characterId === 'trickster' ? [KNIFE_IMAGE] : []),
    ...(st.killer.characterId === 'plague' ? [VILE_PURGE_IMAGE] : []),
    ...st.survivors.flatMap((s) => (s.item ? [itemImage(s.item)] : [])),
    'assets/items/back.webp',
    ...perks.filter((p) => PERKS[p]).map(perkImage),
  ]
  return [...new Set(list.filter((x): x is string => !!x))]
}

/** Fetch and decode one picture; settles either way (a missing one doesn't hold the game back). */
export function preload(path: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => void img.decode().then(resolve, resolve)
    img.onerror = () => resolve()
    img.src = asset(path)
  })
}
