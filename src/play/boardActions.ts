// Everything that can be done by clicking the board right now: moves on paths, flipping tiles,
// interacting with props and survivors, picking rooms for powers and perks, item targets. Each
// action names the spot it lives on; when one spot has several, the board asks which.

import { ref, type Ref } from 'vue'
import { sfx } from '../sound'
import {
  anyMoves,
  CARD_NAMES,
  boardOf,
  pathDef,
  tokenOf,
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
  touchingPaths,
} from './engine/engine'
import { PERKS, type PerkId } from './engine/perks'
import type { Action, GameState, KillerInteraction, MoveCard, PerkChoice, PerkOwner, SurvivorInteraction } from './engine/types'
import { dispatch } from './game'
import { iconLabel, itemUseLabel, killerInteractionLabel, pathLabel, pathName, perkChoiceLabel, powerName, survivorInteractionLabel } from './labels'

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
  /** The engine action it sends, when it sends one straight away (not entering a mode). */
  action?: Action
  /** A move along a path: the room it leads to (a fork's icon offers several). */
  dest?: string
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
  /** Breakout (Yui): the wounded survivor picked, waiting for the path to move them along. */
  breakoutTarget: Ref<number | null>
  /** An item whose target is being picked on the board. */
  itemPick: Ref<number | null>
  /** The card picked in the panel for a power that discards one (Chainsaw, Redeemer). */
  powerCard: Ref<MoveCard | null>
  /** A fork's icon was clicked: its moves, waiting for the room to go to. */
  forkMoves: Ref<BoardAction[] | null>
  /** Oppression: the generators picked so far on the board (up to 2), before confirming. */
  multiPick: Ref<string[]>
  /** Undying (The Blight): using it, one step at a time — card, then path, then the prop. */
  undyingOn: Ref<boolean>
  undyingCard: Ref<MoveCard | null>
  undyingRoom: Ref<string | null>
  /** Diversion (Adam): the killer was clicked — his paths are the targets now. */
  diversion: Ref<boolean>
}

type Run = (() => void) & { action?: Action }

const go = (a: Action, sound: () => void = sfx.click): Run =>
  Object.assign(
    () => {
      if (dispatch(a)) sound()
    },
    { action: a },
  )

/** The same action written any way (keys in any order) gives the same key. */
export function actionKey(a: Action): string {
  const norm = (v: unknown): unknown =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, norm((v as Record<string, unknown>)[k])]),
        )
      : v
  return JSON.stringify(norm(a))
}

/** Actions the board offers right now, as keys: a panel leaves these to the board. */
export function boardActionKeys(actions: BoardAction[]): Set<string> {
  return new Set(actions.flatMap((a) => (a.action ? [actionKey(a.action)] : [])))
}

/** A path's spot is its icon: a fork's pairs share one (several actions there open a menu). */
function spotKey(st: GameState, key: SpotKey): SpotKey {
  return key.startsWith('path:') ? `path:${tokenOf(boardOf(st), key.slice(5))}` : key
}

function spotOf(i: SurvivorInteraction | KillerInteraction): SpotKey {
  if ('target' in i) return `s:${i.target}`
  if ('prop' in i) return `prop:${i.prop}`
  // Undying: the prop in the other room
  if (i.k === 'undying' || i.k === 'haunt') return spotOf(i.i)
  if (i.k === 'removeVictor') return 'victor'
  if (i.k === 'diversion') return `path:${i.path}`
  return 'killer'
}

/**
 * Undying (The Blight's perk) and Yamaoka's Haunting (The Spirit's power) are played the same way:
 * discard a card, follow a path of its colour, interact over there. On screen they go a step at a
 * time — the card (from the hand, or by clicking a path), the room (when the card reaches several),
 * the target.
 */
export type StepKind = 'undying' | 'haunt'
type Undying = Extract<KillerInteraction, { k: 'undying' | 'haunt' }>

/** Which of the two is being played now, if either. */
export function stepKind(st: GameState, modes: BoardModes): StepKind | null {
  if (modes.undyingOn.value) return 'undying'
  return powerMode(st, modes) && st.killer.characterId === 'spirit' ? 'haunt' : null
}

export const STEP_NAME: Record<StepKind, string> = { undying: 'Undying', haunt: "Yamaoka's Haunting" }

/** The cards Undying can be spent on right now (each reaches at least one prop). */
export function undyingCards(st: GameState, kind: StepKind = 'undying'): MoveCard[] {
  return [...new Set(killerInteractions(st).flatMap((i) => (i.k === kind ? [i.card] : [])))]
}

/** What Undying can do for one card. */
export function undyingOptions(st: GameState, card: MoveCard, kind: StepKind = 'undying'): Undying[] {
  return killerInteractions(st).filter((i): i is Undying => i.k === kind && i.card === card)
}

/** The room an Undying target stands in. */
export function undyingRoomOf(st: GameState, i: Undying): string {
  return i.k === 'haunt' ? i.room : st.props.find((p) => p.id === (i.i as { prop: string }).prop)!.room!
}

/** The rooms that card reaches, each with the paths of its colour leading there (a fork can share one icon). */
export function undyingPaths(st: GameState, card: MoveCard, kind: StepKind = 'undying'): { to: string; paths: string[] }[] {
  const rooms = new Set(undyingOptions(st, card, kind).map((i) => undyingRoomOf(st, i)))
  const out = new Map<string, string[]>()
  for (const p of touchingPaths(st, st.killer.room)) {
    const to = p.a === st.killer.room ? p.b : p.a
    if (p.kind === card && rooms.has(to)) out.set(to, [...(out.get(to) ?? []), p.id])
  }
  return [...out].map(([to, paths]) => ({ to, paths }))
}

export function powerMode(st: GameState, modes: BoardModes): boolean {
  const s = st.step
  return s.t === 'killerInteract' && s.canInteract && (modes.powerOn.value || s.powerOnly === true)
}

export function boardActions(st: GameState, modes: BoardModes): BoardAction[] {
  const out: BoardAction[] = []
  const add = (key: SpotKey, label: string, run: Run, style: BoardAction['style'] = 'act', who?: PerkOwner | null) =>
    out.push({ key: spotKey(st, key), label, run, style, who, action: run.action })
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
        add(`path:${i.path}`, `ทิ้ง Pallet: ${iconLabel(st, i.path, st.survivors[s.s].room)}`, () => {
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

  // A fork's icon: its rooms are the targets now.
  const fork = modes.forkMoves.value
  if (fork) {
    for (const a of fork) out.push({ ...a, key: `room:${a.dest}` })
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

  const moves = (list: { path: { id: string }; to: string }[], from: string) =>
    list.forEach((m) => {
      add(`path:${m.path.id}`, pathLabel(st, m.path.id, from), go({ t: 'move', path: m.path.id }, sfx.drop))
      out[out.length - 1].dest = m.to
    })

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
      // after a rescue they may stay put (house rule): their own room says so
      add(`room:${st.survivors[s.s].room}`, 'อยู่ห้องเดิม', go({ t: 'stop' }, sfx.select))
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
      // a perk picked in the panel: only its targets
      if (perkPicked.value && perksToPick(st)) {
        perkSpots(st, out, modes)
        break
      }
      // Diversion, after clicking the killer: only his paths, each with the room it sends him to
      // (a fork asks which room next, as any move does)
      if (modes.diversion.value) {
        for (const i of survivorInteractions(st, s.s)) {
          if (i.k !== 'diversion') continue
          add(spotOf(i), survivorInteractionLabel(st, s.s, i), go({ t: 'interact', i }, sfx.select))
          const p = pathDef(st, i.path)
          out[out.length - 1].dest = p.a === st.killer.room ? p.b : p.a
        }
        break
      }
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
          } else if (i.k === 'diversion') {
            // Diversion: the killer first, then his paths (in its own mode, above). Once, however
            // many paths; with Power Struggle on him too, a click asks which.
            if (!out.some((a) => a.key === 'killer' && a.label.startsWith('Diversion')))
              add('killer', `Diversion: ส่ง ${st.killer.name} (แล้วเลือกเส้นทาง)`, () => ((modes.diversion.value = true), sfx.click()))
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
      // Oppression: click one or two generators, then confirm (GameScreen's bar)
      if (s.perk === 'oppression') {
        const picked = modes.multiPick
        for (const c of perkChoices(st, s.perk, s.owner, s.w)) {
          if (c.prop2) continue
          const id = c.prop!
          const on = picked.value.includes(id)
          out.push({
            key: `prop:${id}`,
            label: on ? `${name}: เอาเครื่องนี้ออก` : `${name}: เลือกเครื่องนี้ (−1)`,
            style: 'act',
            run: () => {
              sfx.click()
              if (on) picked.value = picked.value.filter((x) => x !== id)
              else if (picked.value.length < 2) picked.value = [...picked.value, id]
              else picked.value = [picked.value[1], id]
            },
          })
        }
        break
      }
      for (const c of perkChoices(st, s.perk, s.owner, s.w)) {
        const label = `${name}: ${perkChoiceLabel(st, s.perk, s.owner, s.w, c)}`
        const run = go({ t: 'perk', perk: s.perk, use: true, choice: c }, sfx.select)
        if (c.path) {
          add(`path:${c.path}`, label, run)
          // where it leads: at a fork the room is then picked on the map, as for any move
          out[out.length - 1].dest = perkDest(st, s.owner, c)
        } else if (c.prop) add(`prop:${c.prop}`, label, run)
        else if (c.target !== undefined) add(`s:${c.target}`, label, run, 'act', c.target)
      }
      break
    }

    case 'killerInteract': {
      if (!s.canInteract) break
      // Undying / Yamaoka's Haunting, step by step: the card (from the hand, or a path of its
      // colour on the map), the room it reaches (a fork asks which, as any move does), the target.
      const kind = stepKind(st, modes)
      if (kind) {
        const name = STEP_NAME[kind]
        const card = modes.undyingCard.value
        const room = modes.undyingRoom.value
        if (room === null) {
          for (const c of card ? [card] : undyingCards(st, kind))
            for (const { to, paths } of undyingPaths(st, c, kind))
              for (const path of paths) {
                add(`path:${path}`, `${name}: ทิ้ง ${CARD_NAMES[c]} → ${roomName(st, to)}`, () => ((modes.undyingCard.value = c), (modes.undyingRoom.value = to), sfx.click()))
                out[out.length - 1].dest = to
              }
          break
        }
        for (const i of undyingOptions(st, card!, kind))
          if (undyingRoomOf(st, i) === room) add(spotOf(i), killerInteractionLabel(st, i.i), go({ t: 'interact', i }, sfx.select), 'act', i.i.k === 'attack' ? i.i.target : null)
        break
      }
      if (!powerMode(st, modes)) {
        const all = killerInteractions(st)
        for (const i of all) {
          if (isPower(i) || i.k === 'undying') continue
          add(spotOf(i), killerInteractionLabel(st, i), go({ t: 'interact', i }, sfx.select), 'act', 'target' in i ? i.target : null)
        }
        // The killer's own mini: the power and Undying both live there, so clicking it asks which.
        if (all.some(isPower)) add('killer', `ใช้พลัง: ${powerName(st)}`, () => ((modes.powerOn.value = true), sfx.click()))
        if (all.some((i) => i.k === 'undying'))
          add('killer', `ใช้ Perk: Undying (${PERKS.undying.cost} ▲)`, () => ((modes.undyingOn.value = true), sfx.click()))
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
          case 'chainsaw': {
            add(`path:${i.path}`, label, run)
            const p = pathDef(st, i.path)
            out[out.length - 1].dest = p.a === st.killer.room ? p.b : p.a
            break
          }
          case 'hatchet':
            add(`s:${i.target}`, label, run, 'act', i.target)
            break
          case 'spark':
          case 'bell':
            add(`room:${i.room}`, label, run)
            break
          case 'phantasm':
          case 'wrath':
          case 'victor':
          case 'rush':
            add(`room:${st.killer.room}`, label, run)
            add('killer', label, run)
            break
          case 'redeemer':
            // the card is chosen first, in the panel (secretly)
            if (modes.powerCard.value === i.card) add(`s:${i.target}`, `Redeemer: ยิง ${st.survivors[i.target].name}`, run, 'act', i.target)
            break
        }
      }
      // The Trapper with every trap out: pick where, then which trap moves.
      if (st.killer.characterId === 'trapper' && st.killer.trapsInSupply === 0)
        for (const i of killerInteractions(st))
          if (i.k === 'power' && i.remove && !out.some((a) => a.key === `path:${i.path}`))
            add(`path:${i.path}`, `Bear Trap: ${iconLabel(st, i.path, st.killer.room)} (แล้วเลือกอันที่จะย้าย)`, () => ((modes.trapPath.value = i.path), sfx.click()))
      break
    }

    case 'phantasmChoice': {
      if (st.killer.bp < s.face) break
      for (const i of phantasmInteractions(st, s.room))
        add(spotOf(i), `วาร์ป (${s.face} ▲) แล้ว${killerInteractionLabel(st, i)}`, go({ t: 'phantasm', teleport: true, i }, sfx.drop), 'act', 'target' in i ? i.target : null)
      add(`room:${s.room}`, `วาร์ปไป ${roomName(st, s.room)} (${s.face} ▲)`, go({ t: 'phantasm', teleport: true }, sfx.drop))
      break
    }

    case 'twinChoice':
      add('killer', 'เล่นเทิร์นนี้ด้วย Charlotte', go({ t: 'twin', victor: false }, sfx.select))
      add('victor', 'เล่นเทิร์นนี้ด้วย Victor', go({ t: 'twin', victor: true }, sfx.select))
      break

    case 'pickSurvivor':
      for (const t of s.options) add(`s:${t}`, `${st.survivors[t].name} โดน Chainsaw`, go({ t: 'pick', s: t }, sfx.select), 'act', t)
      break
  }
  return out
}

/**
 * Where a perk's move along a path takes its mover (the survivor it targets, or its owner): the
 * path's other end. Undefined when the mover isn't at either end (nothing to pick then).
 */
function perkDest(st: GameState, owner: PerkOwner, c: PerkChoice): string | undefined {
  const mover = c.target ?? owner
  const from = mover === 'killer' ? st.killer.room : st.survivors[mover].room
  const p = pathDef(st, c.path!)
  return p.a === from ? p.b : p.b === from ? p.a : undefined
}

/** The free hook in the killer's room: click it to hang the carried survivor there. */
function hookSpot(st: GameState, add: (key: SpotKey, label: string, run: () => void) => void) {
  const hook = hookHere(st)
  const s = st.step
  if (hook && (s.t === 'carryDice' || s.t === 'carryMove')) add(`prop:${hook.id}`, `แขวน ${st.survivors[s.s].name} ที่ Hook นี้`, go({ t: 'hang' }, sfx.select))
}

/** Perks used by clicking: Prove Thyself, Botany Knowledge, Empathy, Self-Care, Ace in the Hole, Balanced Landing. */
/**
 * Several perks to use at the start of a turn: the perk is picked in the panel first (PerkPrompt),
 * and only its targets are on the board. Null: none picked yet.
 */
export const perkPicked = ref<PerkId | null>(null)

/**
 * A perk has to be picked before its targets show: at the start of a turn with more than one, and
 * in the interact step with any (they would mix with the ordinary interactions on the board).
 */
export function perksToPick(st: GameState): boolean {
  const n = new Set(perkButtons(st).map((b) => b.perk)).size
  return (st.step.t === 'turnStart' && n > 1) || (st.step.t === 'survivorInteract' && n > 0)
}

function perkSpots(st: GameState, out: BoardAction[], modes: BoardModes) {
  const pick = perksToPick(st)
  for (const b of perkButtons(st)) {
    if (pick && perkPicked.value !== b.perk) continue
    const name = PERKS[b.perk].name
    // Breakout moves one wounded survivor: pick who first, then where, so a board full of
    // wounded friends isn't one long list of person-and-path pairs.
    if (b.perk === 'breakout') {
      const who = modes.breakoutTarget.value
      if (who === null) {
        for (const target of new Set(b.choices.map((c) => c.target!)))
          out.push({
            key: `s:${target}`,
            label: `${name}: ย้าย ${st.survivors[target].name} (แล้วเลือกเส้นทาง)`,
            style: 'act',
            who: target,
            run: () => ((modes.breakoutTarget.value = target), sfx.click()),
          })
        continue
      }
      for (const c of b.choices) {
        if (c.target !== who) continue
        const run = () => {
          modes.breakoutTarget.value = null
          go({ t: 'perk', perk: 'breakout', use: true, choice: c }, sfx.drop)()
        }
        const p = pathDef(st, c.path!)
        const from = st.survivors[who].room
        out.push({ key: spotKey(st, `path:${c.path}`), label: `${name}: ${pathLabel(st, c.path!, from)}`, style: 'act', run, dest: p.a === from ? p.b : p.a })
      }
      continue
    }
    if (b.perk === 'ace_in_the_hole') {
      for (const first of new Set(b.choices.map((c) => c.prop!)))
        out.push({ key: `prop:${first}`, label: `${name}: สลับ prop นี้ (แล้วเลือกอีกอันในห้องติดกัน)`, style: 'act', run: () => ((modes.aceFirst.value = first), sfx.click()) })
      continue
    }
    for (const c of b.choices) {
      const label = `${name}: ${perkChoiceLabel(st, b.perk, b.owner, b.w, c)}`
      const run = go({ t: 'perk', perk: b.perk, use: true, choice: c }, sfx.select)
      const action = run.action
      if (c.path) out.push({ key: spotKey(st, `path:${c.path}`), label, style: 'act', run, action, dest: perkDest(st, b.owner, c) })
      else if (c.target !== undefined) out.push({ key: `s:${c.target}`, label, style: 'act', run, who: c.target, action })
      else if (b.perk === 'self_care') out.push({ key: `s:${b.owner}`, label, style: 'act', run, who: b.owner, action })
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

