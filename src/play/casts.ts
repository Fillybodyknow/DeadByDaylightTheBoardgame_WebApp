// What a player just did, as a short card in the middle of the screen before the board shows the
// result: a movement card played, an attack, a pallet dropped, the killer's power. Built from the
// log, like everything else on screen. Perks, items and rolls have their own reveals (PerkReveal,
// DiceModal), so they are left out here.

import { components, killerById } from '../data'
import { CARD_NAMES } from './engine/engine'
import type { GameState, LogEntry, MoveCard } from './engine/types'
import type { ActionShow } from './fx/bus'
import { itemHidden } from './game'
import { BEAR_TRAP_IMAGE, PROP_IMAGE, cardImage, powerName } from './labels'

/** Events that already have a reveal of their own, or are the game's bookkeeping. */
const SKIP = new Set(['perk', 'item', 'roll', 'reveal', 'repair', 'genDone', 'gatesPowered', 'gate', 'sacrifice', 'round', 'heal', 'cleanse', 'carryEscape', 'gameOver', 'bp', 'phantasmSet'])

/** Log lines that aren't a player's action: setup rolls, Stridor's note, the result of a roll. */
const SKIP_TEXT = [/ทอยได้ \d+ เริ่มที่/, /^Stridor:/, /ดิ้นหลุด!/, /เลือกทอย \d+ ลูก/, /หาย Madness/, /^วางแผน/, /^—/]

const CARD_RE = /เปิด (Sneak|Sprint|Crouch|Vault|Wait)\b/
const CARD_OF: Record<string, MoveCard> = { Sneak: 'sneak', Sprint: 'sprint', Crouch: 'crouch', Vault: 'vault', Wait: 'wait' }

/** The picture for a line that names a prop or a token. */
function pictureOf(text: string): string | undefined {
  if (/Locker/.test(text)) return PROP_IMAGE.locker
  if (/Crow/.test(text)) return PROP_IMAGE.crow
  if (/Chest/.test(text)) return PROP_IMAGE.chest
  if (/Hex Totem|Totem/.test(text)) return PROP_IMAGE.totem
  if (/Entity/.test(text)) return components.entity.image
  if (/Bonus Turn/.test(text)) return components.bloodpoint.image
  return undefined
}

/** The power card's picture, cropped to its icon by the reveal. */
function powerImage(st: GameState): string | undefined {
  return killerById.get(st.killer.characterId)?.power.image?.th
}

/**
 * Turns a batch of fresh log entries into action cards, in order. `prev` is the state before
 * them: a power used in this batch is marked on the killer's first card (or gets its own).
 */
export class CastBuilder {
  private power: boolean
  private shownFor = new Set<string>()
  private count = 0

  private st: GameState
  /** Movement cards in play in this batch, by who plays them: only a move made with one shows. */
  private cards = new Map<string, MoveCard>()

  constructor(prev: GameState, st: GameState) {
    this.st = st
    // the step this batch answered: a move with the card it asked for
    const p = prev.step
    if (p.t === 'survivorMove') this.cards.set(String(p.s), p.card)
    if (p.t === 'killerMove') this.cards.set('killer', p.card)
    this.power = !prev.killer.powerUsed && st.killer.powerUsed
  }

  /** The card for one log entry, or null. */
  of(e: LogEntry): Omit<ActionShow, 'id'> | null {
    // a burst of events (a killer's chained turn) shows its first few; the board shows the rest
    if (this.count >= 3) return null
    const ev = e.ev
    if (!e.text || e.who === 'game') return null
    if (ev && SKIP.has(ev.k)) return null
    if (SKIP_TEXT.some((r) => r.test(e.text))) return null
    const owner = e.who
    const key = String(owner)
    let [title, sub] = splitText(e.text)
    let image: string | undefined
    let kind: ActionShow['kind'] = 'action'
    let target: number | undefined

    const card = CARD_RE.exec(e.text)
    if (card) this.cards.set(key, CARD_OF[card[1]])
    if (card) {
      // A movement card turned up: the move itself shows when it is made (with its room). Only a
      // card that goes nowhere — Wait, a blocked path — is shown here.
      if (card[1] !== 'Wait' && !/แต่/.test(e.text)) return null
      kind = 'move'
      image = cardImage(CARD_OF[card[1]])
    } else if (ev?.k === 'move') {
      // Only a move made with a movement card shows: being carried, a perk's move (Breakout) or a
      // teleport has no card, and the board shows those.
      const c = this.cards.get(key)
      if (!c || !ev.path || this.shownFor.has(key)) return null
      kind = 'move'
      image = cardImage(c)
      sub = sub ?? `การ์ด ${CARD_NAMES[c]}`
    } else if (ev?.k === 'wound') {
      kind = ev.by === 'power' ? 'power' : 'action'
      target = ev.s
      image = ev.by === 'trap' ? BEAR_TRAP_IMAGE : undefined
    } else if (ev?.k === 'pickUp' || ev?.k === 'hook') {
      target = ev.s
      image = PROP_IMAGE.hook
    } else if (ev?.k === 'rescue') {
      target = ev.s
      image = PROP_IMAGE.hook
    } else if (ev?.k === 'palletDrop' || ev?.k === 'palletBreak') image = PROP_IMAGE.pallet
    else if (ev?.k === 'wallBreak') image = components.breakableWall.image
    else if (ev?.k === 'damage') image = PROP_IMAGE.generator
    else if (ev?.k === 'trapSet') image = BEAR_TRAP_IMAGE
    else if (ev?.k === 'madness') kind = 'passive'
    else image = pictureOf(e.text)

    // Online, an item found in a chest stays hidden from everyone but its finder.
    if (typeof owner === 'number' && /ค้น Chest ได้/.test(title) && itemHidden(this.st, owner)) title = title.replace(/ ได้ .*/, '')

    if (owner === 'killer' && this.power) {
      // this batch used the power: its first killer card is the power's
      this.power = false
      kind = 'power'
      const name = powerName(this.st)
      if (!title.includes(name)) sub = sub ? `${name} · ${sub}` : name
      image = powerImage(this.st) ?? image
    }
    this.shownFor.add(key)
    this.count++
    return { owner, kind, title, sub: sub ?? '', image, target }
  }

  /** A power used without a line of its own (its effect had no card above): a card for it. */
  leftover(): Omit<ActionShow, 'id'> | null {
    if (!this.power || this.count >= 3) return null
    this.power = false
    return { owner: 'killer', kind: 'power', title: `${this.st.killer.name} ใช้พลัง`, sub: powerName(this.st), image: powerImage(this.st) }
  }
}

function splitText(text: string): [string, string | undefined] {
  const i = text.indexOf(' — ')
  return i < 0 ? [text, undefined] : [text.slice(0, i), text.slice(i + 3)]
}
