// Thai labels for actions, steps and pieces.

import { killerById, survivorById } from '../data'
import { CARD_NAMES, ITEM_NAMES, PROGRESS_MAX, pathDef, roomName } from './engine/engine'
import { PERKS, type PerkId } from './engine/perks'
import type { GameState, ItemUse, KillerInteraction, MoveCard, PerkChoice, PerkOwner, PerkWindow, PropKind, RollContext, SurvivorInteraction } from './engine/types'
import type { Perk } from '../types'

export const CARD_TH: Record<MoveCard, string> = {
  sneak: 'ย่อง',
  sprint: 'วิ่ง',
  crouch: 'หมอบ',
  vault: 'กระโดดข้าม',
  wait: 'รอ',
}

export const cardLabel = (c: MoveCard) => `${CARD_NAMES[c]} (${CARD_TH[c]})`

export const PROP_IMAGE: Record<PropKind, string> = {
  generator: 'assets/props/generator.webp',
  exitGate: 'assets/props/exit-gate.webp',
  chest: 'assets/props/chest.webp',
  locker: 'assets/props/locker.webp',
  crow: 'assets/props/crow.webp',
  pallet: 'assets/props/pallet.webp',
  hook: 'assets/props/hook.webp',
  totem: 'assets/props/totem.webp',
}

export const cardImage = (c: MoveCard) => `assets/movement/${c}.webp`
export const SURVIVOR_CARD_BACK = 'assets/movement/back-one.webp'
export const KILLER_CARD_BACK = 'assets/movement/back-skull.webp'
export const BEAR_TRAP_IMAGE = 'assets/killers/tokens/trapper-bear-trap.webp'

export function survivorMini(st: GameState, s: number): string {
  return survivorById.get(st.survivors[s].characterId)?.images.mini ?? ''
}

export function killerMini(st: GameState): string {
  return killerById.get(st.killer.characterId)?.images.mini ?? ''
}

export const itemImage = (id: string) => `assets/items/th/${id}.webp`

/** "Sneak → Scrapyard" seen from `from`. */
export function pathLabel(st: GameState, path: string, from: string): string {
  const p = pathDef(st, path)
  const other = p.a === from ? p.b : p.a
  return `${CARD_NAMES[p.kind]} → ${roomName(st, other)}`
}

/** "Sneak: Shack ↔ Scrapyard" */
export function pathName(st: GameState, path: string): string {
  const p = pathDef(st, path)
  return `${CARD_NAMES[p.kind]}: ${roomName(st, p.a)} ${p.kind === 'vault' ? '→' : '↔'} ${roomName(st, p.b)}`
}

const PROP_NAMES_TH: Record<PropKind, string> = {
  generator: 'Generator',
  exitGate: 'Exit Gate',
  chest: 'Chest',
  locker: 'Locker',
  crow: 'Crow',
  pallet: 'Pallet',
  hook: 'Hook',
  totem: 'Hex Totem',
}

function prop(st: GameState, id: string) {
  return st.props.find((p) => p.id === id)!
}

export function survivorInteractionLabel(st: GameState, s: number, i: SurvivorInteraction): string {
  const room = st.survivors[s].room
  switch (i.k) {
    case 'rummage':
      return 'ค้น Chest (จั่ว item)'
    case 'hide':
      return 'ซ่อนใน Locker'
    case 'crow':
      return 'ไล่ Crow (ฆาตกร +1 ▲, ได้ Bonus Turn)'
    case 'dropPallet':
      return `ทิ้ง Pallet บนทาง ${pathLabel(st, i.path, room)}`
    case 'repair':
      return `ซ่อม Generator (${prop(st, i.prop).progress}/${PROGRESS_MAX})`
    case 'openGate':
      return `เปิด Exit Gate (${prop(st, i.prop).progress}/${PROGRESS_MAX})`
    case 'sabotage': {
      const o = prop(st, i.prop).occupant
      return o === null ? 'Sabotage Hook (วาง Entity)' : `ช่วย ${st.survivors[o].name} ลงจาก Hook (+1 ▲)`
    }
    case 'cleanse':
      return 'ชำระ Hex Totem (สำเร็จ +2 ▲)'
    case 'heal':
      return `รักษา ${st.survivors[i.target].name}`
    case 'calmSpirit':
      return `Calm Spirit: ย้าย Crow ไป ${roomName(st, i.room)}`
  }
}

export function killerInteractionLabel(st: GameState, i: KillerInteraction): string {
  switch (i.k) {
    case 'search':
      return 'ค้น Locker'
    case 'scout':
      return 'ไล่ Crow (+1 ▲)'
    case 'damage':
      return `ทำลาย Generator (${prop(st, i.prop).progress}/${PROGRESS_MAX} → 0)`
    case 'venerate':
      return 'บูชา Hex Totem (+2 ▲)'
    case 'attack':
      return `โจมตี ${st.survivors[i.target].name}`
    case 'pickUp':
      return `อุ้ม ${st.survivors[i.target].name}`
    case 'power':
      return `Bear Trap: ${pathLabel(st, i.path, st.killer.room)}`
    case 'blink': {
      const p = pathDef(st, i.path)
      return `Blink → ${roomName(st, p.a === st.killer.room ? p.b : p.a)}`
    }
    case 'hatchet':
      return `Hatchet → ${st.survivors[i.target].name}`
    case 'chainsaw':
      return `Chainsaw: ทิ้ง ${CARD_NAMES[i.card]} → ${pathLabel(st, i.path, st.killer.room)}`
    case 'spark':
      return `Carter's Spark → ${roomName(st, i.room)}${i.room === st.killer.room ? ' (ห้องนี้)' : ''}`
    case 'phantasm':
      return `วาง Phantasm Trap ที่ ${roomName(st, st.killer.room)}`
    case 'bell':
      return `Wailing Bell → ${roomName(st, i.room)}`
  }
}

/** What each roll is, for titles. */
export const ROLL_TITLE: Record<RollContext['k'], string> = {
  repair: 'ซ่อม Generator',
  openGate: 'เปิด Exit Gate',
  cleanse: 'ชำระ Hex Totem',
  heal: 'รักษา',
  trap: 'Bear Trap',
  search: 'ค้น Locker',
  carry: 'ดิ้นหลุดจากการแบก',
  hatchet: 'หลบ Hatchet',
  botany: 'Botany Knowledge',
  selfCare: 'Self-Care',
  phantasm: 'Phantasm Trap',
  overwhelm: 'Overwhelming Presence',
}

/** The survivor an interaction is about (heal, attack, pick up, hatchet, a rescue), if any. */
export function interactionWho(st: GameState, i: SurvivorInteraction | KillerInteraction): number | null {
  if ('target' in i) return i.target
  if (i.k === 'sabotage') return prop(st, i.prop).occupant
  return null
}

/** The killer's power name, from the character board. */
export function powerName(st: GameState): string {
  return killerById.get(st.killer.characterId)?.power.name ?? 'Power'
}

// ---------- perks ----------

/** The printed perk card (name, cost, Thai text, image) from the character data. */
export function perkCard(perk: PerkId): Perk | undefined {
  const d = PERKS[perk]
  const c = d.side === 'killer' ? killerById.get(d.character) : survivorById.get(d.character)
  return c?.perks[d.index]
}

export function perkText(perk: PerkId): string {
  return (perkCard(perk)?.text.th ?? '').replaceAll('{BP}', '▲')
}

export function perkImage(perk: PerkId): string {
  return perkCard(perk)?.image?.th ?? ''
}

export function ownerLabel(st: GameState, o: PerkOwner): string {
  return o === 'killer' ? st.killer.name : st.survivors[o].name
}

/** What choosing this option does, in a few words. */
export function perkChoiceLabel(st: GameState, perk: PerkId, o: PerkOwner, w: PerkWindow, c: PerkChoice): string {
  const name = (s: number) => st.survivors[s].name
  const from = (who: PerkOwner) => (who === 'killer' ? st.killer.room : st.survivors[who].room)
  switch (perk) {
    case 'brutal_strength':
      return `ผลัก ${name((w as { target: number }).target)} ไปทาง ${pathLabel(st, c.path!, st.survivors[(w as { target: number }).target].room)}`
    case 'agitation':
    case 'beast_of_prey':
      return `เดินทาง ${pathLabel(st, c.path!, st.killer.room)}`
    case 'sprint_burst':
      return `วิ่งต่อทาง ${pathLabel(st, c.path!, from(o))}`
    case 'stridor':
      return `${name(c.target!)} ต้องเปิดการ์ด`
    case 'lightborn':
      return `เปิดการ์ดใบที่ ${c.index! + 1} (${CARD_NAMES[st.killer.planned[c.index!]]}) +1 ▲`
    case 'tinkerer':
      return `ใบที่ ${c.index! + 1} (${CARD_NAMES[st.killer.planned[c.index!]]}) → ${CARD_NAMES[c.card!]}`
    case 'leader':
      return c.target !== undefined ? `พา ${name(c.target)} ไปด้วย` : 'เดินตามไปด้วย'
    case 'prove_thyself':
      return `ให้ ${name(c.target!)} Interact แทน`
    case 'adrenaline':
      return `Bonus Turn ด้วย ${CARD_NAMES[c.card!]}`
    case 'quick_and_quiet':
      return 'ซ่อนใน Locker'
    case 'saboteur':
      return c.mode === 'bp' ? 'รับ +1 ▲' : `จ่าย 2 ▲ เล่น Bonus Turn ด้วย ${CARD_NAMES[c.card!]}`
    case 'botany_knowledge':
      return `รักษา ${name(c.target!)} (ทอย Danger Die)`
    case 'empathy':
      return c.mode === 'take' ? `รับ 1 ▲ จาก ${name(c.target!)}` : `ให้ 1 ▲ แก่ ${name(c.target!)}`
    case 'self_care':
      return 'รักษาตัวเอง (ทอย Danger Die)'
    case 'unnerving_presence':
    case 'thanatophobia':
      return 'ให้ทอย Danger Die แทน'
    case 'bond':
      return 'ทอย 2 ลูก เลือกเก็บ 1'
    case 'huntress_lullaby':
      return `ทิ้ง ${CARD_NAMES[(w as { card: MoveCard }).card]} — ขวางการเดิน`
    case 'territorial_imperative':
      return 'ใช้พลังอีกครั้ง'
    case 'enduring':
      return 'ทำลาย Pallet แล้วเดินต่อ'
    case 'iron_will':
      return 'นับผลล้มเหลวเป็นสำเร็จ'
    case 'overcharge':
      return `ทำให้ ${name(c.target!)} บาดเจ็บ`
    case 'overwhelming_presence':
      return `ให้ทอย Danger Die (ล้มเหลว = item เสียเปล่า)`
    case 'the_third_seal':
      return `ทิ้ง ${CARD_NAMES[c.card!]} — ผู้รอดชีวิตใช้ ${CARD_NAMES[c.card!]} ไม่ได้รอบนี้`
    case 'devour_hope':
    case 'shadowborn':
      return `วางการ์ด ${CARD_NAMES[c.card!]}`
    case 'ruin': {
      const g = prop(st, c.prop!)
      return `Generator ที่ ${roomName(st, g.room!)} (${g.progress}/${PROGRESS_MAX} → ${g.progress - 1})`
    }
    case 'predator':
      return `${name(c.target!)} ต้องเปลี่ยนการ์ด`
    case 'lithe':
    case 'alert':
      return `วิ่งไปทาง ${pathLabel(st, c.path!, from(o))}`
    case 'technician':
      return 'Interact อีกครั้ง (ห้ามซ้ำ Generator เดิม)'
    case 'open_handed':
      return `เปิดการ์ดฆาตกรใบที่ ${c.index! + 1}`
    case 'ace_in_the_hole': {
      const a = prop(st, c.prop!)
      const b = prop(st, c.prop2!)
      const nm = (p: typeof a) => (p.revealed ? PROP_NAMES_TH[p.kind] : 'prop คว่ำ')
      return `สลับ ${nm(a)} ↔ ${nm(b)} (${roomName(st, b.room!)})`
    }
    case 'up_the_ante':
      return `Bonus Turn ด้วย ${CARD_NAMES[c.card!]} (ฆาตกร +2 ▲)`
    case 'balanced_landing':
      return `กระโดดไปทาง ${pathLabel(st, c.path!, from(o))} +1 ▲`
    case 'urban_evasion': {
      // say which walls stand next to whoever is about to move (or next to Nea)
      const p = pathDef(st, c.path!)
      const turn = (w as { s: number }).s
      const touches = (room: string) => p.a === room || p.b === room
      const near = touches(st.survivors[turn].room) ? ` · ติดห้องของ ${name(turn)}` : typeof o === 'number' && o !== turn && touches(from(o)) ? ' · ติดห้องคุณ' : ''
      return `เอากำแพงออก: ${pathName(st, c.path!)}${near}`
    }
    case 'streetwise':
      return 'เก็บ Chest ไว้'
    default:
      return 'ใช้'
  }
}

/** A perk's choices in the order worth reading: Urban Evasion's walls next to whoever moves first. */
export function orderedChoices(st: GameState, perk: PerkId, w: PerkWindow, choices: PerkChoice[]): PerkChoice[] {
  if (perk !== 'urban_evasion' || w.k !== 'turnBegin') return choices
  const room = st.survivors[w.s].room
  const near = (c: PerkChoice) => {
    const p = pathDef(st, c.path!)
    return p.a === room || p.b === room ? 0 : 1
  }
  return [...choices].sort((a, b) => near(a) - near(b))
}

/** A few words under a movement-card choice (the card image says the rest). */
export function cardCaption(perk: PerkId, c: PerkChoice): string {
  switch (perk) {
    case 'tinkerer':
      return `แทนใบที่ ${c.index! + 1}`
    case 'saboteur':
      return 'จ่าย 2 ▲'
    case 'up_the_ante':
      return 'ฆาตกร +2 ▲'
    case 'the_third_seal':
      return 'ผนึกการ์ดนี้'
    case 'devour_hope':
    case 'shadowborn':
      return 'เทิร์นเพิ่ม'
    default:
      return 'Bonus Turn'
  }
}

/** What an offer is about, for its heading. */
export function windowLabel(st: GameState, w: PerkWindow): string {
  switch (w.k) {
    case 'afterAttack':
      return `หลังโจมตี ${st.survivors[w.target].name}`
    case 'preRoll':
      return `${st.survivors[w.ctx.s].name} กำลังจะทอย Skill Check`
    case 'planningStart':
      return 'เริ่มเฟสวางแผน'
    case 'planningEnd':
      return 'จบเฟสวางแผน'
    case 'cardMove':
      return `${st.survivors[w.s].name} กำลังจะเดินด้วย ${CARD_NAMES[w.card]}`
    case 'afterKillerInteract':
      return 'หลัง Interact'
    case 'palletBlock':
      return 'มี Pallet ขวางทาง'
    case 'genDone':
      return 'Generator ซ่อมเสร็จ'
    case 'afterCardMove':
      return `${st.survivors[w.s].name} เดินไป ${roomName(st, w.to)}`
    case 'cleanupStart':
      return 'เริ่มเก็บกวาด'
    case 'killerEntered':
      return `${st.killer.name} เข้ามาใน ${roomName(st, w.room)}`
    case 'afterSabotage':
      return 'หลัง Sabotage Hook'
    case 'turnBegin':
      return `เริ่มเทิร์นของ ${st.survivors[w.s].name}`
    case 'turnEnd':
      return `จบเทิร์นของ ${st.survivors[w.s].name}`
    case 'killerBreak':
      return w.what === 'damage' ? `${st.killer.name} ทำลาย Generator` : w.what === 'pallet' ? `${st.killer.name} ทุบ Pallet` : `${st.killer.name} ทุบกำแพง`
    case 'repairFail':
      return `${st.survivors[w.s].name} ซ่อม Generator พลาด`
    case 'afterRummage':
      return `${st.survivors[w.s].name} ค้น Chest`
    case 'preItem':
      return `${st.survivors[w.s].name} กำลังจะใช้ ${st.survivors[w.s].item ? ITEM_NAMES[st.survivors[w.s].item!] : 'item'}`
    default:
      return ''
  }
}

export function itemUseLabel(st: GameState, s: number, item: string, u: ItemUse): string {
  const name = ITEM_NAMES[item]
  switch (u.k) {
    case 'bp':
      return `ทิ้ง ${name} รับ ▲`
    case 'generator':
      return `${name}: Generator +1 (${prop(st, u.prop).progress}/${PROGRESS_MAX})`
    case 'heal':
      return `${name}: รักษา ${st.survivors[u.target].name}`
    case 'wall':
      return `${name}: ทำลายกำแพง ${pathLabel(st, u.path, st.survivors[s].room)}`
    case 'reveal':
      return `${name}: เปิด prop สูงสุด 3 อัน`
    case 'draw':
      return `${name}: จั่ว item ใหม่`
    case 'showKiller':
      return `${name}: เปิดการ์ดเคลื่อนที่ของฆาตกร`
  }
}

export const PHASE_TH: Record<GameState['phase'], string> = {
  setup: 'เตรียมเกม',
  planning: 'วางแผน',
  survivors: 'ผู้รอดชีวิตเล่น',
  killer: 'ฆาตกรเล่น',
  cleanup: 'เก็บกวาด',
  over: 'จบเกม',
}

/** Player number controlling a survivor (killer = player 1). */
export function playerOf(st: GameState, s: number): number {
  return st.handPlayers[st.survivors[s].hand]
}
