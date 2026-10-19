// Perk loadouts before a trial: the game modes of p.19.
//
//   Adept    — every character plays the 3 perks printed on their board.
//   Bloodweb — each side shuffles its perk deck; every character draws 5 (a card of a perk
//              printed on their own board is put aside and replaced) and lays up to 3 of them over
//              their printed perks.
//   Devout   — every player picks up to 3 perk cards to lay over their printed ones; the picks
//              are revealed together.
//
// Two kinds of perk: the ones printed on the character boards (purple: the character's own;
// green: shareable), which every board has for itself, and the perk cards in the box (gold), one
// of each. The cards are the green perks and the ones on no board — a purple perk has no card.
// Only cards are laid over a board, and a card is in one character's hands at most: two
// characters may play the same perk, one printed on their board and the other from its card
// (the user's ruling).
//
// A loadout is the 3 perks a character plays. A perk of theirs not printed on their board is a
// card laid over one of their printed slots: the first printed perk they dropped (`covered` in
// the game state, so a card that discards itself frees the perk under it).

import { PERKS, PRINTED_PERKS, type PerkId } from './perks'

export type GameMode = 'adept' | 'bloodweb' | 'devout'

export type Side = 'survivor' | 'killer'

/** Perks per character and cards drawn in Bloodweb (p.19). */
export const LOADOUT_SIZE = 3
export const BLOODWEB_DRAW = 5

/** A character in the game, by the key its loadout is stored under ('0'..'3' or 'killer'). */
export interface LoadoutCharacter {
  key: string
  side: Side
  id: string
}

const ALL = Object.keys(PERKS) as PerkId[]

export function printedOf(characterId: string): PerkId[] {
  return PRINTED_PERKS[characterId] ?? []
}

/** A board's first perk: its character's alone (purple). */
export function ownPerk(p: PerkId): boolean {
  return !!PERKS[p].character && PERKS[p].index === 0
}

/** A side's perk cards (gold): every green perk, and the ones on no board. */
export function deckOf(side: Side): PerkId[] {
  return ALL.filter((p) => PERKS[p].side === side && !ownPerk(p))
}

/** The cards a character may lay over their board in Devout: the deck, but their own printed perks. */
export function devoutPool(side: Side, characterId: string): PerkId[] {
  const own = printedOf(characterId)
  return deckOf(side).filter((p) => !own.includes(p))
}

/** The perks in play for every character: their loadout, or their printed perks until they set one. */
export function loadoutsInPlay(chars: LoadoutCharacter[], loadouts: Record<string, PerkId[] | undefined>): Record<string, PerkId[]> {
  return Object.fromEntries(chars.map((c) => [c.key, loadouts[c.key] ?? printedOf(c.id)]))
}

/** The cards a character has laid over their board: their perks not printed on it. */
export function cardsOf(c: LoadoutCharacter, loadout: PerkId[] | undefined): PerkId[] {
  const printed = printedOf(c.id)
  return (loadout ?? []).filter((p) => !printed.includes(p))
}

/** Cards someone else holds: one of each, so they can't be picked. Printed perks block nobody. */
export function takenBy(chars: LoadoutCharacter[], loadouts: Record<string, PerkId[] | undefined>, key: string): Set<PerkId> {
  return new Set(chars.filter((c) => c.key !== key).flatMap((c) => cardsOf(c, loadouts[c.key])))
}

/** mulberry32, as the engine's: the same seed gives the same draws on every device. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    let t = (s = (s + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Bloodweb's draws, every character's at once: each side shuffles its deck, and the characters
 * draw 5 each in turn (survivors in seat order). A card of a perk printed on the drawer's own
 * board is discarded and another drawn (p.19).
 */
export function bloodwebHands(seed: number, chars: LoadoutCharacter[]): Record<string, PerkId[]> {
  const random = rng(seed)
  const out: Record<string, PerkId[]> = {}
  for (const side of ['survivor', 'killer'] as const) {
    const deck = deckOf(side)
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[deck[i], deck[j]] = [deck[j], deck[i]]
    }
    for (const c of chars.filter((x) => x.side === side)) {
      const own = printedOf(c.id)
      const hand: PerkId[] = []
      while (hand.length < BLOODWEB_DRAW && deck.length) {
        const card = deck.shift()!
        if (!own.includes(card)) hand.push(card)
      }
      out[c.key] = hand
    }
  }
  return out
}

/** The cards a character may lay over their board: Devout's pool, or their Bloodweb hand. */
export function cardChoices(mode: GameMode, c: LoadoutCharacter, hand: PerkId[] | undefined): PerkId[] {
  if (mode === 'devout') return devoutPool(c.side, c.id)
  if (mode === 'bloodweb') return hand ?? []
  return []
}

/** Every perk a loadout may hold: the printed ones kept, and the cards. */
export function choicesFor(mode: GameMode, c: LoadoutCharacter, hand: PerkId[] | undefined): PerkId[] {
  return [...printedOf(c.id), ...cardChoices(mode, c, hand)]
}

/** Why a loadout can't be played, or '' when it can. */
export function loadoutProblem(mode: GameMode, c: LoadoutCharacter, loadout: PerkId[], hand: PerkId[] | undefined, taken: Set<PerkId>): string {
  if (loadout.length !== LOADOUT_SIZE) return `ต้องมี Perk ${LOADOUT_SIZE} ใบ`
  if (new Set(loadout).size !== loadout.length) return 'Perk ซ้ำกันไม่ได้'
  const allowed = new Set(choicesFor(mode, c, hand))
  for (const p of loadout) {
    if (!allowed.has(p)) return `${PERKS[p].name} เลือกไม่ได้ในโหมดนี้`
    // a card someone else holds; the perk printed on their own board is theirs regardless
    if (taken.has(p) && !printedOf(c.id).includes(p)) return `${PERKS[p].name} มีคนใช้แล้ว (การ์ดมีใบเดียว)`
  }
  return ''
}

/**
 * The game state's perks for a loadout: printed perks kept stay in their slot, each card goes
 * over the next printed slot dropped (`covered`: card → the printed perk under it).
 */
export function layLoadout(characterId: string, loadout: PerkId[] | undefined): { perks: PerkId[]; covered?: Partial<Record<PerkId, PerkId>> } {
  const printed = printedOf(characterId)
  if (!loadout) return { perks: [...printed] }
  const cards = loadout.filter((p) => !printed.includes(p))
  const covered: Partial<Record<PerkId, PerkId>> = {}
  const perks = printed.map((p) => {
    if (loadout.includes(p)) return p
    const card = cards.shift()
    if (!card) return p
    covered[card] = p
    return card
  })
  // more cards than printed slots (a character with fewer printed perks): they go at the end
  perks.push(...cards)
  return Object.keys(covered).length ? { perks, covered } : { perks }
}

/** Store a loadout in a room (the database holds strings well): "a,b,c". */
export const packLoadout = (l: PerkId[]) => l.join(',')
export const unpackLoadout = (s: string | undefined): PerkId[] | undefined =>
  s ? (s.split(',').filter((p) => p in PERKS) as PerkId[]) : undefined
