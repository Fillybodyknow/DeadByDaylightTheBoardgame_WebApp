// Everything that can be done by clicking the board right now: moves on paths, flipping tiles,
// interacting with props and survivors, picking rooms for powers and perks, item targets. Each
// action names the spot it lives on; when one spot has several, the board asks which.

import type { Ref } from 'vue'
import { sfx } from '../sound'
import {
  anyMoves,
  carryMoves,
  hookHere,
  isPower,
  itemUses,
  killerInteractions,
  killerMoves,
  perkButtons,
  perkChoices,
  phantasmInteractions,
  propsIn,
  roomName,
  survivorInteractions,
  survivorMoves,
} from './engine/engine'
import { PERKS } from './engine/perks'
import type { Action, GameState, KillerInteraction, PerkOwner, SurvivorInteraction } from './engine/types'
import { dispatch } from './game'
import { itemUseLabel, killerInteractionLabel, pathLabel, pathName, perkChoiceLabel, powerName, survivorInteractionLabel } from './labels'

/** "path:<id>", "prop:<id>", "s:<survivor>", "killer" or "room:<id>". */
export type SpotKey = string

export interface BoardAction {
  key: SpotKey
  label: string
  /** A character the label is about, for the chooser's icon. */
  who?: PerkOwner | null
  /** Gold for flipping face-down tiles, orange for doing something. */
  style: 'flip' | 'act'
  run: () => void
}

/** What the screen is in the middle of choosing, beyond the engine's step. */
export interface BoardModes {
  powerOn: Ref<boolean>
  trapPath: Ref<string | null>
  palletMode: Ref<string | null>
  revealing: Ref<{ s: number; props: string[] } | null>
  /** Calm Spirit: the crow being sent elsewhere. */
  calmCrow: Ref<string | null>
  /** Ace in the Hole: the prop in Ace's room picked first. */
  aceFirst: Ref<string | null>
  /** An item whose target is being picked on the board. */
  itemPick: Ref<number | null>
}

const go =
  (a: Action, sound: () => void = sfx.click) =>
  () => {
    if (dispatch(a)) sound()
  }

function spotOf(i: SurvivorInteraction | KillerInteraction): SpotKey {
  if ('target' in i) return `s:${i.target}`
  if ('prop' in i) return `prop:${i.prop}`
  return 'killer'
}

export function powerMode(st: GameState, modes: BoardModes): boolean {
  const s = st.step
  return s.t === 'killerInteract' && s.canInteract && (modes.powerOn.value || s.powerOnly === true)
}

export function boardActions(st: GameState, modes: BoardModes): BoardAction[] {
  const out: BoardAction[] = []
  const add = (key: SpotKey, label: string, run: () => void, style: BoardAction['style'] = 'act', who?: PerkOwner | null) =>
    out.push({ key, label, run, style, who })
  const s = st.step
  const faceDown = (room?: string) =>
    st.props.filter((p) => !p.revealed && p.room !== null && (room === undefined || p.room === room) && propsIn(st, p.room).includes(p))

  // ---------- modes the screen is in ----------

  const rev = modes.revealing.value
  if (rev) {
    if (rev.props.length < 3)
      for (const p of faceDown()) if (!rev.props.includes(p.id)) add(`prop:${p.id}`, 'เปิด prop นี้', () => (rev.props.push(p.id), sfx.tick()), 'flip')
    return out
  }

  const item = modes.itemPick.value
  if (item !== null) {
    const holder = st.survivors[item]
    for (const u of itemUses(st, item)) {
      const run = () => {
        modes.itemPick.value = null
        go({ t: 'useItem', s: item, use: u }, sfx.select)()
      }
      const label = itemUseLabel(st, item, holder.item!, u)
      if (u.k === 'generator') add(`prop:${u.prop}`, label, run)
      if (u.k === 'heal') add(`s:${u.target}`, label, run, 'act', u.target)
      if (u.k === 'wall') add(`path:${u.path}`, label, run)
    }
    return out
  }

  if (modes.palletMode.value && s.t === 'survivorInteract') {
    for (const i of survivorInteractions(st, s.s))
      if (i.k === 'dropPallet' && i.prop === modes.palletMode.value)
        add(`path:${i.path}`, `ทิ้ง Pallet: ${pathLabel(st, i.path, st.survivors[s.s].room)}`, () => {
          modes.palletMode.value = null
          go({ t: 'interact', i }, sfx.drop)()
        })
    return out
  }

  if (modes.calmCrow.value && s.t === 'survivorInteract') {
    for (const i of survivorInteractions(st, s.s))
      if (i.k === 'calmSpirit' && i.prop === modes.calmCrow.value)
        add(`room:${i.room}`, `ย้าย Crow ไป ${roomName(st, i.room)}`, () => {
          modes.calmCrow.value = null
          go({ t: 'interact', i }, sfx.select)()
        })
    return out
  }

  if (modes.aceFirst.value && s.t === 'survivorInteract') {
    const b = perkButtons(st).find((x) => x.perk === 'ace_in_the_hole')
    for (const c of b?.choices ?? [])
      if (c.prop === modes.aceFirst.value)
        add(`prop:${c.prop2}`, perkChoiceLabel(st, 'ace_in_the_hole', s.s, b!.w, c), () => {
          modes.aceFirst.value = null
          go({ t: 'perk', perk: 'ace_in_the_hole', use: true, choice: c }, sfx.select)()
        })
    return out
  }

  if (modes.trapPath.value && s.t === 'killerInteract') {
    const to = modes.trapPath.value
    for (const id of Object.keys(st.paths))
      if (st.paths[id].trap)
        add(`path:${id}`, `ย้าย Bear Trap จาก ${pathName(st, id)}`, () => {
          modes.trapPath.value = null
          go({ t: 'interact', i: { k: 'power', path: to, remove: id } }, sfx.drop)()
        })
    return out
  }

  // ---------- the engine's step ----------

  const moves = (list: { path: { id: string } }[], from: string) =>
    list.forEach((m) => add(`path:${m.path.id}`, pathLabel(st, m.path.id, from), go({ t: 'move', path: m.path.id }, sfx.drop)))

  switch (s.t) {
    case 'setupReveal':
      for (const p of faceDown()) add(`prop:${p.id}`, 'เปิด prop นี้', go({ t: 'setupReveal', prop: p.id }, sfx.select), 'flip')
      break
    case 'revealProp':
      for (const p of faceDown(s.room)) add(`prop:${p.id}`, 'เปิด prop นี้', go({ t: 'reveal', prop: p.id }, sfx.select), 'flip')
      break
    case 'survivorMove':
      moves(survivorMoves(st, s.s, s.card), st.survivors[s.s].room)
      break
    case 'anyMove':
      moves(anyMoves(st, s.s), st.survivors[s.s].room)
      break
    case 'killerMove':
      moves(killerMoves(st, s.card), st.killer.room)
      break
    case 'carryMove':
      moves(carryMoves(st), st.killer.room)
      hookSpot(st, add)
      break
    case 'carryDice':
      hookSpot(st, add)
      break

    case 'survivorInteract': {
      if (s.canInteract) {
        const pallets = new Set<string>()
        const crows = new Set<string>()
        for (const i of survivorInteractions(st, s.s)) {
          if (i.k === 'dropPallet') {
            if (pallets.has(i.prop)) continue
            pallets.add(i.prop)
            add(spotOf(i), 'ทิ้ง Pallet (แล้วเลือกเส้นทาง)', () => ((modes.palletMode.value = i.prop), sfx.click()))
          } else if (i.k === 'calmSpirit') {
            if (crows.has(i.prop)) continue
            crows.add(i.prop)
            add(spotOf(i), 'Calm Spirit: ย้าย Crow (แล้วเลือกห้อง)', () => ((modes.calmCrow.value = i.prop), sfx.click()))
          } else add(spotOf(i), survivorInteractionLabel(st, s.s, i), go({ t: 'interact', i }, sfx.select), 'act', 'target' in i ? i.target : null)
        }
      }
      perkSpots(st, out, modes)
      break
    }
    case 'turnStart':
      perkSpots(st, out, modes)
      break

    case 'offer': {
      const name = PERKS[s.perk].name
      for (const c of perkChoices(st, s.perk, s.owner, s.w)) {
        const label = `${name}: ${perkChoiceLabel(st, s.perk, s.owner, s.w, c)}`
        const run = go({ t: 'perk', perk: s.perk, use: true, choice: c }, sfx.select)
        if (c.path) add(`path:${c.path}`, label, run)
        else if (c.prop) add(`prop:${c.prop}`, label, run)
        else if (c.target !== undefined) add(`s:${c.target}`, label, run, 'act', c.target)
      }
      break
    }

    case 'killerInteract': {
      if (!s.canInteract) break
      if (!powerMode(st, modes)) {
        for (const i of killerInteractions(st)) {
          if (isPower(i)) continue
          add(spotOf(i), killerInteractionLabel(st, i), go({ t: 'interact', i }, sfx.select), 'act', 'target' in i ? i.target : null)
        }
        if (killerInteractions(st).some(isPower)) add('killer', `ใช้พลัง: ${powerName(st)}`, () => ((modes.powerOn.value = true), sfx.click()))
        break
      }
      for (const i of killerInteractions(st).filter(isPower)) {
        const label = killerInteractionLabel(st, i)
        const run = go({ t: 'interact', i }, sfx.drop)
        switch (i.k) {
          case 'power':
            if (i.remove) break
            add(`path:${i.path}`, label, run)
            break
          case 'blink':
          case 'chainsaw':
            add(`path:${i.path}`, label, run)
            break
          case 'hatchet':
            add(`s:${i.target}`, label, run, 'act', i.target)
            break
          case 'spark':
          case 'bell':
            add(`room:${i.room}`, label, run)
            break
          case 'phantasm':
            add(`room:${st.killer.room}`, label, run)
            add('killer', label, run)
            break
        }
      }
      // The Trapper with every trap out: pick where, then which trap moves.
      if (st.killer.characterId === 'trapper' && st.killer.trapsInSupply === 0)
        for (const i of killerInteractions(st))
          if (i.k === 'power' && i.remove && !out.some((a) => a.key === `path:${i.path}`))
            add(`path:${i.path}`, `Bear Trap: ${pathLabel(st, i.path, st.killer.room)} (แล้วเลือกอันที่จะย้าย)`, () => ((modes.trapPath.value = i.path), sfx.click()))
      break
    }

    case 'phantasmChoice': {
      if (st.killer.bp < s.face) break
      for (const i of phantasmInteractions(st, s.room))
        add(spotOf(i), `วาร์ป (${s.face} ▲) แล้ว${killerInteractionLabel(st, i)}`, go({ t: 'phantasm', teleport: true, i }, sfx.drop), 'act', 'target' in i ? i.target : null)
      add(`room:${s.room}`, `วาร์ปไป ${roomName(st, s.room)} (${s.face} ▲)`, go({ t: 'phantasm', teleport: true }, sfx.drop))
      break
    }

    case 'pickSurvivor':
      for (const t of s.options) add(`s:${t}`, `${st.survivors[t].name} โดน Chainsaw`, go({ t: 'pick', s: t }, sfx.select), 'act', t)
      break
  }
  return out
}

/** The free hook in the killer's room: click it to hang the carried survivor there. */
function hookSpot(st: GameState, add: (key: SpotKey, label: string, run: () => void) => void) {
  const hook = hookHere(st)
  const s = st.step
  if (hook && (s.t === 'carryDice' || s.t === 'carryMove')) add(`prop:${hook.id}`, `แขวน ${st.survivors[s.s].name} ที่ Hook นี้`, go({ t: 'hang' }, sfx.select))
}

/** Perks used by clicking: Prove Thyself, Botany Knowledge, Empathy, Self-Care, Ace in the Hole, Balanced Landing. */
function perkSpots(st: GameState, out: BoardAction[], modes: BoardModes) {
  for (const b of perkButtons(st)) {
    const name = PERKS[b.perk].name
    if (b.perk === 'ace_in_the_hole') {
      for (const first of new Set(b.choices.map((c) => c.prop!)))
        out.push({ key: `prop:${first}`, label: `${name}: สลับ prop นี้ (แล้วเลือกอีกอันในห้องติดกัน)`, style: 'act', run: () => ((modes.aceFirst.value = first), sfx.click()) })
      continue
    }
    for (const c of b.choices) {
      const label = `${name}: ${perkChoiceLabel(st, b.perk, b.owner, b.w, c)}`
      const run = go({ t: 'perk', perk: b.perk, use: true, choice: c }, sfx.select)
      if (c.path) out.push({ key: `path:${c.path}`, label, style: 'act', run })
      else if (c.target !== undefined) out.push({ key: `s:${c.target}`, label, style: 'act', run, who: c.target })
      else if (b.perk === 'self_care') out.push({ key: `s:${b.owner}`, label, style: 'act', run, who: b.owner })
    }
  }
}

/** Board targets in the shapes the board takes. */
export function boardTargets(actions: BoardAction[]) {
  const paths: Record<string, string> = {}
  const rooms: Record<string, string> = {}
  const interact: Record<string, string> = {}
  const flip: string[] = []
  const join = (rec: Record<string, string>, k: string, label: string) => (rec[k] = rec[k] ? `${rec[k]} / ${label}` : label)
  for (const a of actions) {
    if (a.key.startsWith('path:')) join(paths, a.key.slice(5), a.label)
    else if (a.key.startsWith('room:')) join(rooms, a.key.slice(5), a.label)
    else if (a.key.startsWith('prop:') && a.style === 'flip') flip.push(a.key.slice(5))
    else if (a.key.startsWith('prop:')) join(interact, a.key.slice(5), a.label)
    else join(interact, a.key, a.label)
  }
  return { paths, rooms, interact, flip }
}

