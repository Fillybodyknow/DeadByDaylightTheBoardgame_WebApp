// Thai labels for actions, steps and pieces.

import { editPerkById, killerById, survivorById } from '../data'
import { CARD_NAMES, GUARD_NAMES, palletOn, ITEM_NAMES, isDirect, PROGRESS_MAX, boardOf, pathDef, roomName, showstopperTargets, tokenOf, wrathGain } from './engine/engine'
import { PERKS, type PerkId } from './engine/perks'
import type { Die, GameState, ItemUse, KillerInteraction, MoveCard, PerkChoice, PerkOwner, PerkWindow, PropKind, RollContext, SurvivorInteraction } from './engine/types'
import type { Perk } from '../types'

export const CARD_TH: Record<MoveCard, string> = {
  sneak: 'ย่อง',
  sprint: 'วิ่ง',
  crouch: 'หมอบ',
  vault: 'กระโดดข้าม',
  wait: 'รอ',
  skull: 'ตรงไปห้อง 💀',
  one: 'ตรงไปห้อง 1',
  two: 'ตรงไปห้อง 2',
  three: 'ตรงไปห้อง 3',
  four: 'ตรงไปห้อง 4',
  five: 'ตรงไปห้อง 5',
}

export const cardLabel = (c: MoveCard) => `${CARD_NAMES[c]} (${CARD_TH[c]})`

/** The Artist's Dire Crow (a crow, drawn in his colours). */
export const DIRE_CROW_IMAGE = 'assets/killers/tokens/artist-dire-crow.webp'
/** A prop's picture face up (a Dire Crow has its own). */
export const propPicture = (p: { kind: PropKind; dire?: boolean }) => (p.dire ? DIRE_CROW_IMAGE : PROP_IMAGE[p.kind])

export const PROP_IMAGE: Record<PropKind, string> = {
  generator: 'assets/props/generator.webp',
  exitGate: 'assets/props/exit-gate.webp',
  chest: 'assets/props/chest.webp',
  locker: 'assets/props/locker.webp',
  crow: 'assets/props/crow.webp',
  pallet: 'assets/props/pallet.webp',
  hook: 'assets/props/hook.webp',
  totem: 'assets/props/totem.webp',
  drone: 'assets/props/skullmerchant-drone.webp',
}

/** The Sacrifice Progress token (a red disc with the hook): the HUD's icon and the reveal's. */
export const SACRIFICE_IMAGE = 'assets/tokens/sacrifice-progress.webp'

export const cardImage = (c: MoveCard) => (isDirect(c) ? `assets/movement/back-${c}.webp` : `assets/movement/${c}.webp`)
/**
 * A survivor's face-down movement card: the deck's own back. (The numbered backs, back-one to
 * back-five, mark one player's hand at the table; a single one for every survivor misled.)
 */
export const SURVIVOR_CARD_BACK = 'assets/movement/back_movement_card.webp'
/** The killer's face-down movement cards: the same deck back as the survivors' (a red frame tells them apart). */
export const KILLER_CARD_BACK = 'assets/movement/back_movement_card.webp'
/** The Doctor's Madness token. */
export const MADNESS_IMAGE = 'assets/killers/tokens/doctor-madness.webp'
/** The Clown's tokens (resized to 256 px, as Madness). */
/** The Knight's Guards (resized to 256 px). */
export const GUARD_IMAGE = {
  carnifex: 'assets/killers/tokens/knight-carnifex.webp',
  assassin: 'assets/killers/tokens/knight-assassin.webp',
  jailer: 'assets/killers/tokens/knight-jailer.webp',
} as const
export const TONIC_IMAGE = 'assets/killers/tokens/clown-afterpiece-tonic.webp'
export const ANTIDOTE_IMAGE = 'assets/killers/tokens/clown-afterpiece-antidote.webp'
/** The Plague's Vile Purge token (resized to 256 px, as Madness). */
export const VILE_PURGE_IMAGE = 'assets/killers/tokens/plague-vile-purge.webp'
/** The Trickster's Knife token (resized to 256 px, as Madness). */
export const KNIFE_IMAGE = 'assets/killers/tokens/trickster-knife.webp'
export const BEAR_TRAP_IMAGE = 'assets/killers/tokens/trapper-bear-trap.webp'
/** The Twins: Victor's own mini. */
export const VICTOR_MINI = 'assets/killers/mini/twins_victor.webp'

export function survivorMini(st: GameState, s: number): string {
  return survivorById.get(st.survivors[s].characterId)?.images.mini ?? ''
}

export function killerMini(st: GameState): string {
  return killerById.get(st.killer.characterId)?.images.mini ?? ''
}

export const itemImage = (id: string) => `assets/items/th/${id}.webp`

/** "Sneak → Scrapyard" seen from `from`. */
/** The rooms a path icon joins (three for a fork). */
function iconRooms(st: GameState, path: string): string[] {
  const b = boardOf(st)
  const t = tokenOf(b, path)
  return [...new Set(b.paths.filter((p) => tokenOf(b, p.id) === t).flatMap((p) => [p.a, p.b]))]
}

/** A move along a pair of rooms: the room at the other end. */
export function pathLabel(st: GameState, path: string, from: string): string {
  const p = pathDef(st, path)
  const other = p.a === from ? p.b : p.a
  return `${CARD_NAMES[p.kind]} → ${roomName(st, other)}`
}

/** Something on a path icon (a pallet, a trap, a wall): every room it leads to from `from`. */
export function iconLabel(st: GameState, path: string, from: string): string {
  const p = pathDef(st, path)
  return `${CARD_NAMES[p.kind]} → ${iconRooms(st, path).filter((r) => r !== from).map((r) => roomName(st, r)).join(' / ')}`
}

/** "Sneak: Shack ↔ Scrapyard" */
export function pathName(st: GameState, path: string): string {
  const p = pathDef(st, path)
  const rooms = iconRooms(st, path)
  if (rooms.length > 2) return `${CARD_NAMES[p.kind]}: ${rooms.map((r) => roomName(st, r)).join(' / ')}`
  return `${CARD_NAMES[p.kind]}: ${roomName(st, p.a)} ${p.kind === 'vault' ? '→' : '↔'} ${roomName(st, p.b)}`
}

const PROP_CATEGORY_TH = { objective: 'เหลือง', survival: 'น้ำเงิน', altruism: 'เขียว', boldness: 'แดง' } as const

const PROP_NAMES_TH: Record<PropKind, string> = {
  generator: 'Generator',
  exitGate: 'Exit Gate',
  chest: 'Chest',
  locker: 'Locker',
  crow: 'Crow',
  pallet: 'Pallet',
  hook: 'Hook',
  totem: 'Hex Totem',
  drone: 'Drone',
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
    case 'drone':
      return `ส่ง Drone กลับบอร์ดของ ${st.killer.name}`
    case 'dropPallet':
      return `ทิ้ง Pallet บนทาง ${iconLabel(st, i.path, room)}`
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
    case 'removeVictor':
      return 'ไล่ Victor ออกจากกระดาน'
    case 'powerStruggle':
      return `Power Struggle: เปิดการ์ดใบแรกของ ${st.killer.name} (ฆาตกร +2 ▲)`
    case 'diversion':
      return `Diversion: ส่ง ${st.killer.name} ไปทาง ${pathLabel(st, i.path, room)} (ฆาตกร +1 ▲)`
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
      return st.killer.asVictor ? `จับ ${st.survivors[i.target].name} (Victor อุ้มไม่ได้: +1 ▲)` : `อุ้ม ${st.survivors[i.target].name}`
    case 'power':
      return `Bear Trap: ${iconLabel(st, i.path, st.killer.room)}`
    case 'blink': {
      const p = pathDef(st, i.path)
      return `Blink → ${roomName(st, p.a === st.killer.room ? p.b : p.a)}`
    }
    case 'hatchet':
      return `Hatchet → ${st.survivors[i.target].name}`
    case 'reign':
      return `Reign of Darkness → ${st.survivors[i.target].name}`
    case 'chainsaw':
      return `Chainsaw: ทิ้ง ${CARD_NAMES[i.card]} → ${pathLabel(st, i.path, st.killer.room)}`
    case 'spark':
      return `Carter's Spark → ${roomName(st, i.room)}${i.room === st.killer.room ? ' (ห้องนี้)' : ''}`
    case 'phantasm':
      return `วาง Phantasm Trap ที่ ${roomName(st, st.killer.room)}`
    case 'bell':
      return `Wailing Bell → ${roomName(st, i.room)}`
    case 'wrath':
      return `Yamaoka's Wrath (+${wrathGain(st)} ▲)`
    case 'redeemer':
      return `Redeemer → ${st.survivors[i.target].name} (ทิ้ง ${CARD_NAMES[i.card]} แบบคว่ำ)`
    case 'victor':
      return `Blood Bond: ${st.killer.victorRoom ? 'ย้าย' : 'วาง'} Victor มาที่ ${roomName(st, st.killer.room)}`
    case 'rush':
      return `Blighted Corruption: สุ่มทิ้งการ์ด 1 ใบ (เหลือ ${st.killer.hand.length} ใบ) แล้วพุ่ง`
    case 'hoard':
      return 'Hoarder: นำ Chest ออก (+2 ▲)'
    case 'painResonance':
      return `Pain Resonance: Interact กับ Hook — ${st.survivors[i.target].name} บาดเจ็บ (${PERKS.pain_resonance.cost} ▲)`
    case 'birds':
      return `${i.dire ? 'Dire Crow' : 'Crow'} → ${roomName(st, i.room)}`
    case 'droneTake':
      return `Eyes in the Sky: เก็บ Drone ที่ ${roomName(st, prop(st, i.prop).room!)} กลับขึ้นบอร์ด`
    case 'droneDrop':
      return `Eyes in the Sky: วาง Drone หงายหน้าที่ ${roomName(st, st.killer.room)}`
    case 'guard':
      return `${GUARD_NAMES[i.guard]} → ${roomName(st, i.room)}${st.guards?.[i.guard] ? ' (ย้าย)' : ''}`
    case 'afterpiece':
      return `${i.which === 'tonic' ? 'Afterpiece Tonic' : 'Afterpiece Antidote'} → ${roomName(st, i.room)}${st.afterpiece?.[i.which] ? ' (ย้าย)' : ''}`
    case 'purge': {
      const rooms = [st.killer.room, i.room].filter((r) => !(st.purge ?? []).includes(r)).map((r) => roomName(st, r))
      return `Vile Purge → ${rooms.join(' + ')}`
    }
    case 'showstopper': {
      const who = showstopperTargets(st).map((s) => st.survivors[s])
      return `Showstopper: Knife ให้ ${who.map((sv) => `${sv.name} (${sv.knives ?? 0}→${Math.min(3, (sv.knives ?? 0) + 1)})`).join(', ')}`
    }
    case 'frenzy': {
      const here = st.survivors.filter((sv) => sv.status === 'board' && sv.room === st.killer.room)
      return `Feral Frenzy: ${here.map((sv) => sv.name).join(', ')} บาดเจ็บ${here.some((sv) => sv.wounded) ? ' (+1 ▲)' : ''}`
    }
    case 'haunt':
      return `Yamaoka's Haunting: ทิ้ง ${CARD_NAMES[i.card]} → ${killerInteractionLabel(st, i.i)} ที่ ${roomName(st, i.room)}`
    case 'undying': {
      const p = 'prop' in i.i ? prop(st, i.i.prop) : null
      return `Undying: ทิ้ง ${CARD_NAMES[i.card]} → ${killerInteractionLabel(st, i.i)}${p?.room ? ` ที่ ${roomName(st, p.room)}` : ''}`
    }
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
  noMither: 'No Mither',
  breakdown: 'Breakdown',
  assassin: 'หลบ Assassin',
  deadHard: 'Dead Hard',
  spineChill: 'Spine Chill',
  deerstalker: 'Deerstalker',
  innerFocus: 'Inner Focus',
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

/** The perk card (name, cost, Thai text, image): from the character board, or from the deck. */
export function perkCard(perk: PerkId): Perk | undefined {
  const d = PERKS[perk]
  if (d.card) return editPerkById.get(d.card)
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
    case 'dance_with_me':
      return `เดินต่อทาง ${pathLabel(st, c.path!, from(o))}`
    case 'boil_over': {
      const { s, n } = w as Extract<PerkWindow, { k: 'carryRoll' }>
      return `${name(s)} ทอยดิ้น 4 ลูก แทน ${n} ลูก`
    }
    case 'windows_of_opportunity': {
      const p = prop(st, c.prop!)
      const what = p.kind === 'chest' ? 'ค้น Chest' : p.kind === 'locker' ? 'เข้าไปซ่อนใน Locker' : p.kind === 'crow' ? 'ไล่ Crow' : `ทิ้ง Pallet บนทาง ${iconLabel(st, c.path!, p.room!)}`
      return `${what} ที่ ${roomName(st, p.room!)}`
    }
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
    case 'autodidact':
      return `ลูกที่ ${c.index! + 1} → สำเร็จอย่างยิ่ง`
    case 'corrective_action':
      return `ลูกที่ ${c.index! + 1} ได้ "4" → สำเร็จอย่างยิ่ง`
    case 'potential_energy': {
      const a = prop(st, c.prop!)
      const b = prop(st, c.prop2!)
      return `Generator ที่ ${roomName(st, a.room!)} (${a.progress}/${PROGRESS_MAX}) −1 → ${roomName(st, b.room!)} (${b.progress}/${PROGRESS_MAX}) +1`
    }
    case 'fogwise': {
      const to = pathDef(st, c.path2!)
      return `ย้าย${palletOn(st, c.path!) ? ' Pallet' : 'กำแพง'} ไปทาง ${roomName(st, to.a)} ↔ ${roomName(st, to.b)}`
    }
    case 'quick_gambit':
      return `${st.killer.name} ต้องเดินตามไปด้วย`
    case 'circle_of_healing':
      return `${name(c.target!)} หายบาดเจ็บ (แทน ▲ ที่ได้)`
    case 'shadow_step':
      return 'วาง Entity บนเส้นทางที่เพิ่งเดินมา — ไม่มีใครเดินผ่านได้ จนจบรอบ'
    case 'clairvoyance': {
      const p = prop(st, c.prop!)
      return `เปิด prop สี${({ objective: 'เหลือง', survival: 'ฟ้า', altruism: 'เขียว', boldness: 'แดง' } as const)[p.category]} ที่ ${roomName(st, p.room!)}`
    }
    case 'exponential':
      return `${name(c.target!)} ลงจาก Hook ไปทาง ${pathLabel(st, c.path!, st.survivors[c.target!].room)} (แทน ▲ ที่ได้)`
    case 'deliverance':
      return `${name(c.target!)} หายบาดเจ็บ`
    case 'fast_track': {
      const g = prop(st, c.prop!)
      return `ซ่อม Generator ที่ ${roomName(st, g.room!)} (${g.progress}/${PROGRESS_MAX})`
    }
    case 'self_preservation':
      return `ซ่อนใน Locker ที่ ${roomName(st, prop(st, c.prop!).room!)}`
    case 'smash_hit':
      return '+1 ▲'
    case 'mad_grit':
      return `ทำให้ ${name(c.target!)} บาดเจ็บ`
    case 'discordance':
      return 'รับ ▲ ตามจำนวนคนในห้อง'
    case 'iron_maiden': {
      const l = prop(st, c.prop!)
      const h = prop(st, c.prop2!)
      return `สลับ Locker (${roomName(st, l.room!)}) ↔ Hook (${roomName(st, h.room!)})`
    }
    case 'rancor':
      return `ลาก ${name(c.target!)} ไปด้วย`
    case 'haunted_ground': {
      const a = prop(st, (w as { prop: string }).prop)
      const b = prop(st, c.prop!)
      return `สลับ ${PROP_NAMES_TH[a.kind]} (${roomName(st, a.room!)}) ↔ ${PROP_NAMES_TH[b.kind]} (${roomName(st, b.room!)})`
    }
    case 'spirit_fury':
      return '+2 ▲'
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
    case 'blood_echo':
      return `ทำให้ ${name(c.target!)} บาดเจ็บ (${roomName(st, st.survivors[c.target!].room)})`
    case 'zanshin_tactics':
      return `ทิ้งใบที่ ${c.index! + 1} (${CARD_NAMES[st.killer.planned[c.index!]]}) → ${CARD_NAMES[c.card!]}`
    case 'nemesis': {
      const p = prop(st, (w as { prop: string }).prop)
      return `นำ ${PROP_NAMES_TH[p.kind]} ออก`
    }
    case 'gearhead':
      return 'Interact อีกครั้งในห้องนี้'
    case 'retribution':
      return 'ให้ทอย Danger Die แทน (สำเร็จ = ฆาตกร +2 ▲)'
    case 'dead_mans_switch': {
      const p = prop(st, c.prop!)
      return `${PROP_NAMES_TH[p.kind]} ที่ ${roomName(st, p.room!)} (${p.progress}/${PROGRESS_MAX} → ${p.progress - 1})`
    }
    case 'breakout':
      return `ย้าย ${name(c.target!)} ไปทาง ${pathLabel(st, c.path!, st.survivors[c.target!].room)}`
    case 'lucky_break':
      return 'หายบาดเจ็บ'
    case 'any_means_necessary':
      return `ยอมบาดเจ็บ เล่น Bonus Turn ด้วย ${CARD_NAMES[c.card!]}`
    case 'red_herring': {
      const g = prop(st, c.prop!)
      return `บังคับให้ทำลาย Generator แทน (${g.progress}/${PROGRESS_MAX})${g.progress === 2 ? ' +1 ▲' : ''}`
    }
    case 'for_the_people':
      if (c.prop) return `ยอมบาดเจ็บ: Generator +1 (${prop(st, c.prop).progress}/${PROGRESS_MAX})`
      return `ยอมบาดเจ็บ: รักษา ${name(c.target!)}`
    case 'off_the_record':
      return `รับ 1 ▲ แทน ${st.killer.name}`
    case 'coup_de_grace':
      return `Bonus Turn ด้วย ${CARD_NAMES[st.killer.planned[(w as { turn: number }).turn]]} อีกครั้ง`
    case 'oppression':
      return [c.prop!, c.prop2].filter((x): x is string => !!x).map((id) => `${roomName(st, prop(st, id).room!)} (${prop(st, id).progress}→${prop(st, id).progress - 1})`).join(' + ')
    case 'dragons_grip':
      return `ทิ้ง ${[c.card!, c.card2].filter((x): x is MoveCard => !!x).map((x) => CARD_NAMES[x]).join(' + ')}`
    case 'appraisal': {
      const d = w as { s: number; item: string }
      const mine = typeof o === 'number' ? st.survivors[o].item : null
      return `รับ ${ITEM_NAMES[d.item]} ที่ ${name(d.s)} ทิ้ง${mine ? ` (ทิ้ง ${ITEM_NAMES[mine]} ของคุณ)` : ''}`
    }
    case 'deception':
      return 'อยู่ห้องเดิม ไม่ Interact (+1 ▲)'
    case 'desperate_measures':
      return 'Interact อีกครั้ง (Chest / Locker)'
    case 'visionary': {
      const p = prop(st, c.prop!)
      return `เปิด prop สี${PROP_CATEGORY_TH[p.category]} ที่ ${roomName(st, p.room!)} แทน`
    }
    case 'breakdown':
      return `ทอย Danger Die — สำเร็จ: ${st.killer.name} เสีย Sacrifice Progress 1 แต้ม`
    case 'aftercare': {
      const p = prop(st, c.prop!)
      return `วาง Entity บน Hook ที่ ${roomName(st, p.room!)}`
    }
    case 'distortion':
      return `เดินต่อทาง ${pathLabel(st, c.path!, from(o))}`
    case 'no_mither':
      return `ทอย Danger Die — สำเร็จ: ${name((w as { target: number }).target)} ไม่บาดเจ็บ, ฆาตกร +1 ▲`
    case 'dead_hard':
      return `ทอย Danger Die — สำเร็จ: ${name((w as { s: number }).s)} หนีไปตามเส้นทางแทนถูกแขวน`
    case 'wgl_forever':
      return `${st.killer.name} ออกจากห้องไม่ได้ (ยัง Interact ได้)`
    case 'face_the_darkness':
      return `${GUARD_NAMES[c.guard!]} → ${roomName(st, c.room!)}${st.guards?.[c.guard!] ? ' (ย้าย)' : ''}`
    case 'nowhere_to_hide':
      return 'ให้คนใน Locker ทอย Danger Die แทน'
    case 'hubris': {
      const sv = st.survivors[(w as { s: number }).s]
      return sv.bp > 0 ? `${sv.name} ต้องจ่าย 1 ▲ (มี ${sv.bp})` : `${sv.name} ไม่มี ▲ — Interact ไม่ได้เทิร์นนี้`
    }
    case 'coulrophobia': {
      const { s } = w as Extract<PerkWindow, { k: 'preEnter' }>
      return `ห้าม ${name(s)} เข้าห้อง (Interact ไม่ได้เทิร์นนี้)`
    }
    case 'bamboozle': {
      const p = pathDef(st, c.path!)
      return `Entity บนทาง ${roomName(st, p.a)} ↔ ${roomName(st, p.b)}`
    }
    case 'grim_embrace': {
      const sv = st.survivors[(w as { s: number }).s]
      return `วาง ▲ บนบอร์ดของ ${sv.name} — ถ้าเขาถูกแขวน: Sacrifice Progress +${(sv.embrace ?? 0) + 1}`
    }
    case 'darkness_revealed':
      return 'คว่ำ Locker แทนการเปิด prop แล้วเดินต่อ 1 ทาง'
    case 'dissolution': {
      const p = pathDef(st, c.path!)
      return `▲ บนทาง ${roomName(st, p.a)} ↔ ${roomName(st, p.b)} — เดินผ่าน = บาดเจ็บ`
    }
    case 'septic_touch': {
      const p = prop(st, (w as { prop: string }).prop)
      return `นำ ${PROP_NAMES_TH[p.kind]} ที่ ${roomName(st, p.room!)} ออกจากกระดาน`
    }
    case 'pop_goes_the_weasel': {
      const p = prop(st, c.prop!)
      return `นำ ${PROP_NAMES_TH[p.kind]} ที่ ${roomName(st, p.room!)} ออก`
    }
    case 'dark_devotion':
    case 'infectious_fright':
      return `ย้าย ${name(c.target!)} ไปทาง ${pathLabel(st, c.path!, st.survivors[c.target!].room)}`
    case 'corrupt_intervention': {
      const g = prop(st, c.prop!)
      return `Entity บน Generator ที่ ${roomName(st, g.room!)} (${g.progress}/${PROGRESS_MAX})`
    }
    case 'no_way_out':
      return `ห้าม ${name((w as { s: number }).s)} Interact`
    case 'crowd_control':
      return `เลือก ${name(c.target!)} (ผู้รอดชีวิตจ่าย 2 ▲ หรือคุณเลือกการ์ดให้)`
    case 'starstruck':
      return `ไป ${roomName(st, (() => { const p = pathDef(st, c.path!); return p.a === st.killer.room ? p.b : p.a })())} แล้วอุ้ม ${name(c.target!)} แทน`
    case 'solidarity':
      return `รักษา ${name(c.target!)} ที่ ${roomName(st, st.survivors[c.target!].room)}`
    case 'poised':
      return `ให้ ${name(c.target!)} เล่น Bonus Turn`
    case 'head_on':
      return `นำ Locker ออก — ${st.killer.name} Interact ไม่ได้เทิร์นนี้`
    case 'built_to_last':
      return `เก็บ ${ITEM_NAMES[(w as { item: string }).item]} ไว้`
    case 'residual_manifest':
      return `ทิ้ง ${ITEM_NAMES[st.survivors[o as number].item ?? ''] ?? 'item'} — กัน Interaction นี้ของ ${st.killer.name}`
    case 'inner_focus':
      return 'ทอยเต๋า Skill Check 2 ลูก เลือก 1 แล้วไปห้องเริ่มต้นของเลขนั้น'
    // ----- cards only (the edit-perks mode) -----
    case 'small_game':
      return `${st.killer.name} −2 ▲`
    case 'this_is_not_happening':
    case 'sloppy_butcher':
      return 'ทอย Danger Die แทน'
    case 'resilience':
    case 'renewal':
    case 'situational_awareness':
    case 'no_one_escapes_death':
      return `Bonus Turn ด้วย ${CARD_NAMES[c.card!]}`
    case 'well_make_it':
      return `ให้ ${name((w as { s: number }).s)} เล่น Bonus Turn ด้วย ${CARD_NAMES[c.card!]}`
    case 'inner_healing':
      return 'หายบาดเจ็บ (ทิ้งการ์ดนี้)'
    case 'dark_sense':
    case 'bitter_murmur':
      return `เดินต่อทาง ${pathLabel(st, c.path!, o === 'killer' ? st.killer.room : st.survivors[o].room)}`
    case 'deja_vu':
      return `ซ่อม Generator ที่ ${roomName(st, prop(st, c.prop!).room!)}`
    case 'premonition':
      return 'ไล่ Crow ในห้องนี้'
    case 'spine_chill':
      return 'ทอย Danger Die — สำเร็จ = เดินหนี'
    case 'lightweight':
      return `ทิ้ง ${CARD_NAMES[c.card!]} แล้วเดินก่อนเริ่มเทิร์น`
    case 'claustrophobia':
      return `Entity บนเส้นทาง ${pathName(st, c.path!)} — ผู้รอดชีวิตผ่านไม่ได้`
    case 'distressing':
      return `${name(c.target!)} ต้องซ่อนใน Locker`
    case 'unrelenting':
      return `${st.survivors[c.target!].wounded ? 'อุ้ม' : 'โจมตี'} ${name(c.target!)} ต่อ`
    case 'iron_grasp':
      return 'ทอยเต๋า Skill Check ใหม่ทั้งหมด'
    case 'insidious':
    case 'game_afoot':
      return `อุ้ม ${name((w as { target: number }).target)} แทนการโจมตี`
    case 'leverage':
      return `${name(c.target!)} หายบาดเจ็บไม่ได้รอบนี้`
    case 'thwack': {
      const p = prop(st, (w as { prop: string }).prop)
      return `นำ ${PROP_NAMES_TH[p.kind]} ที่ ${roomName(st, p.room!)} ออก`
    }
    case 'whispers':
      return `เลือก ${name(c.target!)} — จ่าย 1 ▲ หรือวางการ์ดหงายหน้า`
    case 'kinship':
      return `ให้ ${name(c.target!)} เล่น Bonus Turn ท้ายเทิร์นนี้`
    case 'guardian':
      return `บังคับ ${st.killer.name} ให้ Interact กับคุณเท่านั้นเทิร์นนี้`
    case 'jolt':
      return 'ให้ลูกที่ได้ 1–2 เป็นล้มเหลว (+1 ▲ ต่อลูก)'
    case 'plunderers_instinct':
      return 'จั่ว 3 ใบ เลือกเก็บ 1'
    case 'fearmonger':
      return `${name(c.target!)} ใช้ Perk ไม่ได้รอบนี้`
    case 'slippery_meat':
      return 'ลงจาก Hook เอง (อยู่ห้องเดิม)'
    case 'self_aware':
      return 'จั่ว Perk 4 ใบ เลือก 1 ใบมาแทนการ์ดนี้'
    case 'deerstalker':
      return `ให้ ${name((w as { s: number }).s)} ทอย Danger Die — ล้มเหลว = อยู่ที่เดิม`
    case 'thrill_of_the_hunt':
      return `เดินตาม ${name((w as { s: number }).s)} ไป ${roomName(st, (w as { to: string }).to)}`
    case 'no_one_left_behind':
      return `ย้าย ${name(c.target!)} ไปทาง ${pathLabel(st, c.path!, st.survivors[c.target!].room)}`
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
    case 'zanshin_tactics':
      return `แทนใบที่ ${c.index! + 1}`
    case 'any_means_necessary':
      return 'ยอมบาดเจ็บ'
    default:
      return 'Bonus Turn'
  }
}

/** Whom an offer's moment is about, for their mini beside its heading (null: nobody in particular). */
export function windowWho(w: PerkWindow): PerkOwner | null {
  if ('s' in w) return w.s
  if ('target' in w && w.target !== undefined) return w.target
  if (w.k === 'preRoll') return w.ctx.s
  switch (w.k) {
    case 'killerEntered':
    case 'killerBreak':
    case 'killerTurnBegin':
    case 'killerTurnEnd':
    case 'killerInteract':
    case 'afterKillerInteract':
    case 'palletBlock':
      return 'killer'
    default:
      return null
  }
}

/** What an offer is about, for its heading. */
/** Skill dice faces in words: "1, กะโหลก". */
export function diceFaces(dice: Die[]): string {
  return dice.map((d) => (d.kind === 'skill' && d.face === 0 ? 'กะโหลก' : String(d.face))).join(', ')
}

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
    case 'killerArrived':
      return `${st.killer.name} เข้า ${roomName(st, w.room)} (ก่อนเปิด prop)`
    case 'killerRevealed': {
      const p = prop(st, w.prop)
      return `${st.killer.name} เปิด ${PROP_NAMES_TH[p.kind]} ที่ ${roomName(st, p.room!)}`
    }
    case 'killerWouldInteract':
      return `${st.killer.name} จะ Interact ใน ${roomName(st, w.room)}`
    case 'killerInteract':
      return 'ก่อน Interact'
    case 'genInteract': {
      const p = prop(st, w.prop)
      return `${st.survivors[w.s].name} (${st.survivors[w.s].bp} ▲) กำลังจะ Interact กับ ${PROP_NAMES_TH[p.kind]}`
    }
    case 'afterReveal': {
      const p = st.props.find((x) => x.id === w.prop)!
      return `${st.survivors[w.s].name} เปิด ${PROP_NAMES_TH[p.kind]} ที่ ${roomName(st, p.room!)}`
    }
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
    case 'killerTurnBegin':
      return `เริ่มเทิร์นที่ ${w.turn + 1} ของ ${st.killer.name}`
    case 'preKillerInteract':
      return `${st.killer.name} กำลังจะทำร้าย ${st.survivors[w.target].name}`
    case 'afterHang':
      return `${st.survivors[w.s].name} ถูกแขวน`
    case 'afterPalletLocker':
      return `${st.survivors[w.s].name} ใช้ ${PROP_NAMES_TH[prop(st, w.prop).kind]}`
    case 'entered':
      return `${st.survivors[w.s].name} เข้า ${roomName(st, st.survivors[w.s].room)}`
    case 'rollFail':
      return `${st.survivors[w.s].name} ทอยล้มเหลว (${st.killer.name} จะได้ +${w.fails} ▲)`
    case 'healed':
      return `${st.survivors[w.s].name} หายบาดเจ็บ`
    case 'cleansed':
      return `${st.survivors[w.s].name} ชำระ Hex Totem สำเร็จ`
    case 'repaired':
      return `${st.survivors[w.s].name} ซ่อม Generator สำเร็จ`
    case 'preHang':
      return `${st.survivors[w.s].name} กำลังจะถูกแขวนบน Hook`
    case 'preLeave':
      return `${st.killer.name} กำลังจะออกจาก ${roomName(st, st.killer.room)}`
    case 'preEnter':
      return `${st.survivors[w.s].name} กำลังจะเดินเข้า ${roomName(st, w.to)} (ห้องของคุณ)`
    case 'carryRoll':
      return `${st.killer.name} ให้ ${st.survivors[w.s].name} ทอยดิ้น ${w.n} ลูก`
    case 'greatRoll':
      return `${st.survivors[w.s].name} ทอยได้สำเร็จอย่างยิ่ง`
    case 'killerTurnEnd':
      return `จบเทิร์นที่ ${w.turn + 1} ของ ${st.killer.name}`
    case 'itemUsed':
      return `${st.survivors[w.s].name} ใช้ ${ITEM_NAMES[w.item]} แล้ว — กำลังจะทิ้ง`
    case 'itemDiscard':
      return `${st.survivors[w.s].name} ทิ้ง ${ITEM_NAMES[w.item]}`
    case 'afterSurvivorInteract':
      return `${st.survivors[w.s].name} Interact แล้ว`
    case 'beforeReveal':
      return `${st.survivors[w.s].name} เข้า ${roomName(st, w.room)} — กำลังจะเปิด prop`
    case 'rolled':
      return `${st.survivors[w.s].name} ทอย ${ROLL_TITLE[w.ctx]} ได้ ${diceFaces(w.dice)}`
    case 'preDraw':
      return `${st.survivors[w.s].name} กำลังจะจั่ว item`
    case 'survivorLeave':
      return `${st.survivors[w.s].name} กำลังจะเดินออกจากห้องของคุณไป ${roomName(st, w.to)}`
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
      return `${name}: ทำลายกำแพง ${iconLabel(st, u.path, st.survivors[s].room)}`
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
