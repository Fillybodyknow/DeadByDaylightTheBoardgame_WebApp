// The killer's tutorial, chapter by chapter: the learner plays The Hillbilly, the tutorial plays the
// four survivors. The Entity speaks as in the survivors' chapters ("เจ้า" / "ข้า"); pages are the
// rulebook's.

import { components, skillFaceImage } from '../../data'
import { KILLER_CARDS, palletOn } from '../engine/engine'
import type { GameState, MoveCard, PathKind } from '../engine/types'
import { PROP_IMAGE, cardImage } from '../labels'
import { baseScene, place, play, propIn, rigged, roomProps, settle, takeCard } from './scene'
import type { Chapter } from './types'

const KILLER_HAND = KILLER_CARDS.map(cardImage)

/** The learner's killer. */
const me = (st: GameState) => st.killer
const meg = (st: GameState) => st.survivors[1]

/** The survivors' cards for the round, face down (a card with no path from their room keeps them still). */
function survivorsPlan(st: GameState, cards: MoveCard[]) {
  cards.forEach((card, s) => {
    takeCard(st, s, card)
    Object.assign(st.survivors[s], { planned: card, plannedRevealed: false, acted: false })
  })
}

/**
 * The killer's two cards, and his turn `turn` on: about to move with its card, or (a Wait) about
 * to interact where he stands. The survivors have all played already.
 */
function killerTurn(st: GameState, cards: [PathKind | 'wait', PathKind | 'wait'], turn: 0 | 1) {
  for (const s of [0, 1, 2, 3]) {
    const sv = st.survivors[s]
    const card = st.survivorHands[sv.hand][0]
    takeCard(st, s, card)
    Object.assign(sv, { planned: card, plannedRevealed: true, acted: true })
  }
  const hand = [...KILLER_CARDS]
  for (const c of cards) hand.splice(hand.indexOf(c), 1)
  Object.assign(st.killer, { planned: cards, hand, revealedCount: turn + 1 })
  Object.assign(st, { phase: 'killer', activeSurvivor: null, canInteract: true, turnHurt: [], killerMoved: false })
  const card = cards[turn]
  if (card === 'wait') {
    st.step = { t: 'killerInteract', turn, canInteract: true }
    st.queue = [{ k: 'endKillerTurn', turn }]
  } else {
    st.step = { t: 'killerMove', turn, card }
    st.queue = [
      { k: 'killerInteract', turn },
      { k: 'endKillerTurn', turn },
    ]
  }
}

const generator = (st: GameState, room: string) => propIn(st, room, 'generator')

// ---------- 1 · the killer's goal ----------

const goal: Chapter = {
  id: 'k-goal',
  side: 'killer',
  title: 'เป้าหมายของฆาตกร',
  blurb: 'รู้จักบทบาทของฆาตกร ราง Sacrifice ▲ และพลังของเจ้า',
  image: 'assets/props/hook.webp',
  build() {
    const st = baseScene()
    killerTurn(st, ['wait', 'sneak'], 0)
    return st
  },
  steps: [
    {
      say: 'ผู้รับใช้ของข้า… คราวนี้เจ้าคือ**ฆาตกร** — **The Hillbilly** ข้าจะสอนเจ้าล่าผู้รอดชีวิตทีละขั้น เพื่อถวายพวกมันแด่ข้า',
      pics: [components.entity.image],
    },
    {
      say: 'นั่นคือตัวเจ้า ยืนอยู่ที่ **Backlot** ผู้รอดชีวิต **4 คน**กระจายอยู่ทั่วแผนที่ — เจ้าเล่นคนเดียว สู้พวกมันทั้งสี่',
      spot: { room: 'backlot' },
    },
    {
      say: '**เจ้าชนะ**เมื่อ**รางการสังเวย** (Sacrifice) ครบ **8 ช่อง** — แขวนผู้รอดชีวิตบน**ตะขอ** ครั้งแรกของแต่ละคนได้ **+1 ทันที** และทุกช่วง**เก็บกวาด** +1 ต่อคนที่ยังถูกแขวน (หน้า 5, 11, 15)',
      spot: { el: '.hud' },
      pics: [PROP_IMAGE.hook],
    },
    {
      say: '**พวกมันชนะ**เมื่อซ่อม **Generator ครบ 4 เครื่อง** แล้วเปิด**ประตูทางออก** — เจ้าต้องขัดขวาง: ทำลายความคืบหน้าของเครื่อง และไล่ล่าคนที่ซ่อม ใครทำเป้าหมายได้ก่อนชนะทันที (หน้า 5, 11, 13)',
      spot: { el: '.hud' },
      pics: [PROP_IMAGE.generator, PROP_IMAGE.exitGate],
    },
    {
      say: 'ทุกรอบ: **วางแผน** — ผู้รอดชีวิตวางการ์ดคว่ำคนละใบ เจ้าวาง **2 ใบ** → ผู้รอดชีวิต**เล่นก่อนทุกคน** → แล้วจึงถึงตา**เจ้า เล่น 2 เทิร์น** ใบละเทิร์น → **เก็บกวาด** (หน้า 8, 10) แผงทางขวาบอกเสมอว่าต้องทำอะไร',
      spot: { el: '.side' },
    },
    {
      say: '**▲ Bloodpoint** ของเจ้าเริ่มที่ **4** มีได้สูงสุด **12** — ได้มาจากความพลาดของผู้รอดชีวิต และใช้จ่าย**เทิร์นที่ 3** หรือ Perk (หน้า 4, 10, 16)',
      spot: { el: '.players' },
    },
    {
      say: 'ช่องนี้คือ**พลัง**ของเจ้า — **เลื่อยไฟฟ้า** ใช้ได้ **1 ครั้งต่อรอบ แทนการ Interact** (หน้า 14) ฆาตกรแต่ละตัวมีพลังของตัวเอง ข้าจะให้เจ้าลองใช้ในบทหลัง ๆ',
      spot: { el: '.slot.power' },
    },
    {
      say: 'ผู้รอดชีวิต**คุยกันได้** แต่ต้องพูดให้เจ้าได้ยินทุกคำ (หน้า 8) — ฟังให้ดี พวกมันจะเผยแผนเอง… บทถัดไป ข้าจะสอนเจ้า**วางแผนและโจมตี**',
    },
  ],
}

// ---------- 2 · planning, moving and attacking ----------

const PLAN_ROOM = 'foundry-ground'

const plan: Chapter = {
  id: 'k-plan',
  side: 'killer',
  title: 'วางแผน เดิน และโจมตี',
  blurb: 'การ์ด 5 ใบของฆาตกร วาง 2 ใบ เล่นสองเทิร์น โจมตี และทำลาย Generator',
  image: 'assets/movement/wait.webp',
  build() {
    const st = baseScene()
    place(st, { 1: PLAN_ROOM }, 'backlot')
    roomProps(st, PLAN_ROOM, ['generator'], true)
    generator(st, PLAN_ROOM)!.progress = 2
    // cards with no path from where they stand: this round the survivors stay put
    survivorsPlan(st, ['vault', 'vault', 'vault', 'sprint'])
    // short of a third turn: that is a later chapter's
    st.killer.bp = 3
    st.phase = 'planning'
    st.step = { t: 'planKiller' }
    return st
  },
  steps: [
    {
      say: 'ฆาตกรถือการ์ด **5 ใบ**: **Sneak** **Sprint** **Crouch** **Vault** เดินตามเส้นสีเดียวกันเหมือนผู้รอดชีวิต และ **Wait** — **ไม่เดิน แต่ยัง Interact ได้** (หน้า 10, 18)',
      pics: KILLER_HAND,
      spot: { el: '.hand' },
    },
    {
      say: 'ช่วงวางแผน เจ้าวาง**การ์ด 2 ใบคว่ำ** — **ใบซ้ายเล่นก่อน** แล้วจึงใบขวา (หน้า 8, 10) ผู้รอดชีวิตวางการ์ดไปแล้ว แต่เจ้าไม่รู้ว่าใครจะไปไหน',
    },
    {
      say: '**Meg** อยู่ที่ **Foundry Ground Floor** — เส้น**สีเขียว**จาก Backlot ไปถึงเธอ และในห้องนั้นมี Generator ที่ซ่อมค้างไว้',
      spot: { room: PLAN_ROOM },
    },
    {
      say: 'วาง **Sprint** เป็นใบซ้าย (เดินไปหาเธอ) แล้ว **Wait** เป็นใบขวา (อยู่ต่อเพื่อ Interact อีกครั้ง) — เลือกการ์ดจากมือ แล้วกดยืนยันในแผงขวา',
      spot: { el: '.hand' },
      task: {
        allow: (_st, a) => a.t === 'planKiller' && a.cards[0] === 'sprint' && a.cards[1] === 'wait',
        done: (st) => me(st).planned.length === 2,
        hint: 'วาง Sprint (สีเขียว) เป็นใบซ้าย และ Wait เป็นใบขวา',
      },
    },
    {
      say: 'ผู้รอดชีวิต**เล่นก่อนเสมอ**… ดูพวกมัน',
      task: {
        allow: () => false,
        done: (st) => st.step.t === 'killerMove',
        hint: 'รอผู้รอดชีวิตเล่นให้จบ…',
      },
    },
    {
      say: 'ถึงตาเจ้า — ใบซ้าย **Sprint** ถูกเปิด คลิกเส้นสีเขียวที่ไป **Foundry Ground Floor**',
      spot: { path: 'p18' },
      task: {
        allow: (_st, a) => a.t === 'move' && a.path === 'p18',
        done: (st) => me(st).room === PLAN_ROOM,
        hint: 'คลิกเส้นสีเขียวที่ไป Foundry Ground Floor',
      },
    },
    {
      say: 'เจ้าอยู่ห้องเดียวกับ Meg — คลิกที่ตัวเธอบนแผนที่เพื่อ**โจมตี** (หน้า 14)',
      spot: { room: PLAN_ROOM },
      task: {
        allow: (_st, a) => a.t === 'interact' && a.i.k === 'attack' && a.i.target === 1,
        done: (st) => meg(st).wounded,
        hint: 'คลิกที่ Meg แล้วเลือกโจมตี',
      },
    },
    {
      say: 'Meg **บาดเจ็บ** (วงแหวนแดงที่ฐาน) — แต่เจ้า**อุ้มคนที่เพิ่งบาดเจ็บในรอบนี้ไม่ได้** (หน้า 15) ต้องรอรอบหน้า… ถ้าเธอยังหนีไม่พ้น',
      spot: { room: PLAN_ROOM },
    },
    {
      say: 'ใบขวาคือ **Wait** — เจ้าอยู่ที่เดิม แต่ Interact ได้อีกครั้ง Generator ตรงนี้ซ่อมไปแล้ว **2/3** คลิกที่มันเพื่อ**ทำลาย** (Damage): ความคืบหน้า**ทั้งหมด**หายไป พวกมันต้องเริ่มใหม่จาก 0 (หน้า 14)',
      spot: (st) => ({ prop: generator(st, PLAN_ROOM)?.id }),
      task: {
        allow: (_st, a) => a.t === 'interact' && a.i.k === 'damage',
        done: (st) => generator(st, PLAN_ROOM)?.progress === 0,
        hint: 'คลิก Generator ใน Foundry Ground Floor แล้วเลือกทำลาย',
      },
    },
    {
      say: 'สองเทิร์นของเจ้าจบ รอบนี้จึงจบ — ช่วง**เก็บกวาด**สรุปให้เห็นว่าเกิดอะไรขึ้น แล้วทุกคนเก็บการ์ดคืนมือ (หน้า 11) ส่วน**ประตูทางออก** เจ้าทำลายไม่ได้ (หน้า 18)',
    },
    {
      say: 'จำไว้: เปิดการ์ดแล้วต้องเดิน ถ้าห้องเจ้า**ไม่มีเส้นสีนั้น** เจ้าอยู่ที่เดิมและ**เสียการ Interact** — ยกเว้น Wait ที่ตั้งใจอยู่กับที่ (หน้า 10) บทถัดไป: **อุ้มและแขวน**',
    },
  ],
}

// ---------- 3 · picking up and hooking ----------

const HOOK_FROM = 'scrapyard'
const HOOK_ROOM = 'shack'

const hooking: Chapter = {
  id: 'k-hook',
  side: 'killer',
  title: 'อุ้มและแขวน',
  blurb: 'อุ้มผู้รอดชีวิตที่บาดเจ็บ เลือกลูกเต๋าตอนแบก แล้วแขวนบนตะขอ',
  image: 'assets/props/back-boldness.webp',
  build() {
    const st = baseScene()
    roomProps(st, HOOK_FROM, ['generator'], true)
    roomProps(st, HOOK_ROOM, ['hook'], true)
    place(st, { 1: HOOK_FROM }, HOOK_FROM)
    Object.assign(meg(st), { wounded: true, woundedThisRound: false })
    st.round = 2
    killerTurn(st, ['wait', 'sneak'], 0)
    // carried with one die, she doesn't wriggle free
    st.rng = rigged(
      st,
      (s) => settle(play(s, { t: 'interact', i: { k: 'pickUp', target: 1 } }, { t: 'carryDice', n: 1 })),
      (s) => s.step.t === 'carryMove' && meg(s).status === 'carried',
    )
    return st
  },
  steps: [
    {
      say: 'รอบใหม่… **Meg** ยังบาดเจ็บจากรอบก่อน และอยู่ห้องเดียวกับเจ้า — คนที่บาดเจ็บถูก**อุ้ม** (Pick Up) ได้ (หน้า 14, 15)',
      spot: { room: HOOK_FROM },
    },
    {
      say: 'คลิกที่ตัว Meg เพื่อ**อุ้ม**',
      spot: { room: HOOK_FROM },
      task: {
        allow: (_st, a) => a.t === 'interact' && a.i.k === 'pickUp' && a.i.target === 1,
        done: (st) => meg(st).status === 'carried',
        hint: 'คลิกที่ Meg แล้วเลือกอุ้ม',
      },
    },
    {
      say: 'ห้องนี้ไม่มีตะขอ เจ้าจึงต้อง**แบก**เธอไป: เลือก**ลูกเต๋า 1–4 ลูก** แล้ว Meg ทอยทั้งหมด — ออก**สำเร็จยอดเยี่ยม**สักลูก เธอ**ดิ้นหลุด** ไม่อย่างนั้นเจ้าเดินได้ **1 ห้องต่อลูก** เส้นสีใดก็ได้ ไม่ต้องใช้การ์ด (หน้า 15)',
      pics: [skillFaceImage(5)],
    },
    {
      say: 'ตะขออยู่ที่ **Shack** ห่างไปแค่ 1 ห้อง — **ลูกเดียวก็พอ** ยิ่งมากลูก ยิ่งเสี่ยงให้เธอหลุด เลือก **1 ลูก** ในแผงขวา',
      spot: { room: HOOK_ROOM },
      task: {
        allow: (_st, a) => a.t === 'carryDice' && a.n === 1,
        done: (st) => st.step.t === 'carryMove' || meg(st).status !== 'carried',
        hint: 'เลือกลูกเต๋า 1 ลูกในแผงขวา',
      },
    },
    {
      say: 'เธอดิ้นไม่หลุด! แบกไปตามเส้นสีเขียวเข้า **Shack** — ถึงห้องที่มีตะขอว่าง เธอจะถูก**แขวน**ทันที',
      spot: { path: 'p16' },
      task: {
        allow: (_st, a) => (a.t === 'move' && a.path === 'p16') || a.t === 'hang',
        done: (st) => meg(st).status === 'hooked',
        hint: 'คลิกเส้นสีเขียวที่ไป Shack',
      },
    },
    {
      say: 'Meg ถูก**แขวน** — token บนกระดานของเธอขึ้น**รางการสังเวย +1** ทันที และทุกช่วง**เก็บกวาด** +1 ต่อคนที่ยังถูกแขวน ครบ 8 เจ้าชนะ (หน้า 11, 15)',
      spot: { el: '.hud' },
      pics: [PROP_IMAGE.hook],
    },
    {
      say: 'ระหว่าง**แบก** เจ้า**ข้าม Pallet ไม่ได้** **ผ่านกำแพงไม่ได้** **ใช้พลังไม่ได้** และ Interact ไม่ได้ — เดินไม่ถึงตะขอว่าง เธอหลุดลงในห้องที่เจ้าหยุด (หน้า 15)',
    },
    {
      say: 'ผู้รอดชีวิตจะมา**ช่วย**เธอลงจากตะขอ (Sabotage) หรือ Sabotage ตะขอว่างแล้ววาง **Entity** ปิดมันจนจบรอบ (หน้า 13) — จะเฝ้าตะขอ หรือออกล่าคนอื่นต่อ เจ้าเลือกเอง',
      pics: [components.entity.image],
    },
  ],
}

// ---------- 4 · pallets, walls and lockers ----------

const BLOCK_ROOM = 'ancient-tree'

const obstacles: Chapter = {
  id: 'k-obstacles',
  side: 'killer',
  title: 'Pallet กำแพง และ Locker',
  blurb: 'สิ่งที่ผู้รอดชีวิตใช้ขวางเจ้า และการค้นตู้',
  image: 'assets/props/pallet.webp',
  build() {
    const st = baseScene()
    place(st, { 1: 'scrapyard' }, BLOCK_ROOM)
    roomProps(st, BLOCK_ROOM, ['generator'], true)
    // Meg dropped a pallet on the blue path behind her
    const pallet = st.props.find((p) => p.kind === 'pallet' && !p.removed)!
    Object.assign(pallet, { room: null, path: 'p14', revealed: true })
    killerTurn(st, ['sneak', 'wait'], 0)
    return st
  },
  steps: [
    {
      say: 'Meg ล้ม **Pallet** ขวางเส้นทางสีน้ำเงินไป Scrapyard — ผู้รอดชีวิตเดินผ่านได้อิสระ แต่**เจ้าไม่ได้**',
      spot: { path: 'p14' },
      pics: [PROP_IMAGE.pallet],
    },
    {
      say: 'การ์ด **Sneak** ของเจ้าเปิดแล้ว — ลองเดินเส้นสีน้ำเงินไป Scrapyard ดู',
      spot: { path: 'p14' },
      task: {
        allow: (_st, a) => a.t === 'move' && a.path === 'p14',
        done: (st) => !palletOn(st, 'p14'),
        hint: 'คลิกเส้นสีน้ำเงินที่มี Pallet ขวางอยู่',
      },
    },
    {
      say: 'เจ้า**ทำลาย** Pallet แต่**ติดอยู่ที่เดิม** และ**เสียการ Interact** เทิร์นนั้น (หน้า 14) — ผู้รอดชีวิตใช้ Pallet ซื้อเวลา คิดให้ดีว่าจะฝ่าไป หรืออ้อม',
      spot: { room: BLOCK_ROOM },
    },
    {
      say: '**กำแพงทำลายได้** ตรงกันข้าม: ผู้รอดชีวิต**ผ่านไม่ได้** แต่เจ้าเดินทะลุได้ — กำแพงถูกนำออก แล้วเจ้า**เดินต่อและ Interact ได้ตามปกติ** หลังจากนั้นทุกคนใช้เส้นนั้นได้ (หน้า 13, 14)',
      pics: [components.breakableWall.image],
    },
    {
      say: 'เทิร์นต่อมา… Meg หนีเข้า **Locker** ในห้องเดียวกับเจ้า — คนในตู้**ไม่อยู่บนกระดาน** โจมตีหรืออุ้มไม่ได้ แต่เจ้า**ค้นตู้**ได้ (หน้า 12, 14)',
      setup() {
        const st = baseScene()
        roomProps(st, BLOCK_ROOM, ['locker'], true)
        place(st, { 1: BLOCK_ROOM }, BLOCK_ROOM)
        propIn(st, BLOCK_ROOM, 'locker')!.occupant = 1
        meg(st).status = 'locker'
        killerTurn(st, ['wait', 'sneak'], 0)
        // her skill check in the locker fails
        st.rng = rigged(
          st,
          (s) => settle(play(s, { t: 'interact', i: { k: 'search', prop: propIn(s, BLOCK_ROOM, 'locker')!.id } })),
          (s) => meg(s).status === 'carried',
        )
        return st
      },
      spot: (st) => ({ prop: propIn(st, BLOCK_ROOM, 'locker')?.id }),
      pics: [PROP_IMAGE.locker],
    },
    {
      say: 'คลิกที่ Locker เพื่อ**ค้น** (Search)',
      spot: (st) => ({ prop: propIn(st, BLOCK_ROOM, 'locker')?.id }),
      task: {
        allow: (_st, a) => a.t === 'interact' && a.i.k === 'search',
        done: (st) => meg(st).status !== 'locker',
        hint: 'คลิก Locker ที่ Meg ซ่อนอยู่',
      },
    },
    {
      say: 'Meg ทอย Skill Check แล้ว**ล้มเหลว** — เธอ**ถูกอุ้มทันที แม้ยังไม่บาดเจ็บ** ถ้าเธอทอยสำเร็จ ตู้จะถูกนำออก และเธอกลับมายืนบนกระดาน (หน้า 14)',
      spot: { room: BLOCK_ROOM },
    },
    {
      say: 'Pallet ซื้อเวลาให้พวกมัน ตู้ซ่อนพวกมันจากสายตา… แต่ไม่มีที่ไหนในอาณาจักรของข้าที่ปลอดภัยจริง บทถัดไป: **พลังของเจ้า**',
    },
  ],
}

// ---------- 5 · the power, the third turn and bloodpoints ----------

const SAW_ROOM = 'foundry-ground'
const SHRINE_ROOM = 'foundry-basement'

const power: Chapter = {
  id: 'k-power',
  side: 'killer',
  title: 'พลัง เทิร์นที่ 3 และ ▲',
  blurb: 'เลื่อยไฟฟ้า ของ The Hillbilly, จ่าย 4 ▲ เล่นเทิร์นที่ 3, อีกาและ Hex Totem',
  image: 'assets/props/totem.webp',
  build() {
    const st = baseScene()
    // the basement first: a room laid out later sends its old props to the first free dump room
    roomProps(st, SHRINE_ROOM, ['crow', 'totem'], true)
    roomProps(st, SAW_ROOM, ['generator'], true)
    place(st, { 1: SAW_ROOM }, 'backlot')
    // his second turn (a Wait), with the ▲ for a third
    killerTurn(st, ['crouch', 'wait'], 1)
    st.killer.bp = 5
    return st
  },
  steps: [
    {
      say: '**พลัง**ของ The Hillbilly คือ **เลื่อยไฟฟ้า**: **ทิ้ง**การ์ด 1 ใบจากมือ (ไม่ใช่ Wait) แล้ว**พุ่ง**ไปตามเส้นทางสีนั้นที่ว่างอยู่ — ผู้รอดชีวิตที่ยังไม่บาดเจ็บในห้องที่ไปถึง**บาดเจ็บทันที** ใช้ได้ **1 ครั้งต่อรอบ แทนการ Interact** (หน้า 14)',
      spot: { el: '.slot.power' },
    },
    {
      say: 'นี่คือเทิร์นที่ 2 ของเจ้า (Wait) — Meg อยู่ห่างไป 1 ห้อง กด**ใช้พลัง: เลื่อยไฟฟ้า** ในแผงขวา (หรือคลิกช่องพลังซ้ายล่าง) แล้วคลิกเส้น**สีเขียว**ที่ไปหาเธอ — การ์ด Sprint จะถูกทิ้ง',
      spot: { path: 'p18' },
      task: {
        allow: (_st, a) => a.t === 'interact' && a.i.k === 'chainsaw' && a.i.path === 'p18',
        done: (st) => meg(st).wounded,
        hint: 'กดใช้พลัง: เลื่อยไฟฟ้า แล้วคลิกเส้นสีเขียวที่ไป Foundry Ground Floor',
      },
    },
    {
      say: 'Meg บาดเจ็บ! ปกติหนึ่งเทิร์นได้แค่เดินแล้ว Interact — เลื่อยไฟฟ้า ให้เจ้า**เดินเพิ่มและโจมตี**ในทีเดียว แต่การ์ดที่ทิ้งไปใช้ไม่ได้อีกจนจบรอบ',
      spot: { room: SAW_ROOM },
    },
    {
      say: 'จบเทิร์นที่ 2 แล้ว เจ้ามี **▲ 5** — จ่าย **4 ▲** เล่น**เทิร์นที่ 3** ได้: เลือกการ์ดจากมือ 1 ใบ เดินแล้ว Interact ได้**ครั้งเดียวต่อรอบ** และเฉพาะตอนจบเทิร์นที่ 2 (หน้า 10)',
      spot: { el: '.side' },
    },
    {
      say: 'เลือก **Sneak** จากมือ แล้วกดยืนยัน',
      spot: { el: '.hand' },
      task: {
        allow: (_st, a) => a.t === 'bonus' && a.card === 'sneak',
        done: (st) => st.step.t !== 'killerBonusOffer',
        hint: 'เลือก Sneak (การ์ดสีน้ำเงิน) แล้วกดยืนยัน',
      },
    },
    {
      say: 'คลิกเส้นสีน้ำเงินลงไป **Foundry Basement**',
      spot: { path: 'p17' },
      task: {
        allow: (_st, a) => a.t === 'move' && a.path === 'p17',
        done: (st) => me(st).room === SHRINE_ROOM,
        hint: 'คลิกเส้นสีน้ำเงินที่ไป Foundry Basement',
      },
    },
    {
      say: 'ที่นี่มี **Crow** กับ **Hex Totem** — **Scout** อีกา: นำออก ได้ **▲ 1** / **Venerate** Totem: ได้ **▲ 2** และ Totem ยังอยู่ที่เดิม (หน้า 14) คลิก Hex Totem',
      spot: (st) => ({ prop: propIn(st, SHRINE_ROOM, 'totem')?.id }),
      pics: [PROP_IMAGE.crow, PROP_IMAGE.totem],
      task: {
        allow: (_st, a) => a.t === 'interact' && a.i.k === 'venerate',
        done: (st) => me(st).bp >= 3,
        hint: 'คลิก Hex Totem แล้วเลือก Venerate',
      },
    },
    {
      say: '▲ ของเจ้ามาจาก: ผู้รอดชีวิต**ทอยล้มเหลว** (+1) หรือ**ไล่อีกา** (+1) และสิ่งที่เจ้าทำเอง — สูงสุด **12** ใช้จ่ายเทิร์นที่ 3 หรือ Perk (หน้า 4, 12, 16)',
      spot: { el: '.players' },
    },
  ],
}

// ---------- 6 · rules to know ----------

const rules: Chapter = {
  id: 'k-rules',
  side: 'killer',
  title: 'กฎที่ฆาตกรควรรู้',
  blurb: 'ทบทวนกฎที่มักลืม แล้วตอบคำถามของ The Entity',
  image: 'assets/tokens/entity.webp',
  build() {
    const st = baseScene()
    killerTurn(st, ['wait', 'sneak'], 0)
    return st
  },
  steps: [
    {
      say: 'ก่อนเจ้าจะออกล่าใน Trial จริง… ข้าจะถาม — ตอบผิด ข้าจะบอกว่าทำไม',
    },
    {
      say: 'การ์ด **Wait** ทำอะไร?',
      pics: [cardImage('wait')],
      quiz: { options: ['เดินเส้นสีใดก็ได้', 'ไม่เดิน แต่ยัง Interact ได้', 'ข้ามเทิร์นนั้นไปเลย'], answer: 1, why: 'Wait = อยู่กับที่ แต่ยัง Interact ได้ (หน้า 10, 18)' },
    },
    {
      say: 'เจ้าเดินชน **Pallet** บนเส้นทาง — เกิดอะไรขึ้น?',
      quiz: {
        options: ['ข้ามไปได้ตามปกติ', 'ทำลาย Pallet อยู่ที่เดิม และเสียการ Interact', 'ทำลาย Pallet แล้วเดินต่อ'],
        answer: 1,
        why: 'ฆาตกรทำลาย Pallet แล้วติดอยู่ที่เดิม ไม่ได้ Interact เทิร์นนั้น (หน้า 14)',
      },
    },
    {
      say: 'เจ้าโจมตี Meg จน**บาดเจ็บ**ในเทิร์นแรก — เทิร์นที่ 2 **ของรอบเดียวกัน** อุ้มเธอได้ไหม?',
      quiz: { options: ['ได้', 'ไม่ได้ — ต้องรอรอบหน้า'], answer: 1, why: 'อุ้มผู้รอดชีวิตที่ถูกทำให้บาดเจ็บในรอบนี้ไม่ได้ (หน้า 15)' },
    },
    {
      say: '**เทิร์นที่ 3** (Killer Bonus Turn) ได้มาอย่างไร?',
      quiz: {
        options: ['จ่าย 4 ▲ ตอนจบเทิร์นที่ 2 — ครั้งเดียวต่อรอบ', 'จ่าย 2 ▲ ได้ทุกเทิร์น', 'ได้ฟรีเมื่อแขวนใครสักคน'],
        answer: 0,
        why: 'จ่าย 4 ▲ ตอนจบเทิร์นที่ 2 และได้ไม่เกิน 1 ครั้งต่อรอบ (หน้า 10)',
      },
    },
    {
      say: '**Damage** Generator ทำอะไร?',
      quiz: {
        options: ['ลดความคืบหน้า 1', 'นำความคืบหน้าทั้งหมดออก', 'นำ Generator ออกจากกระดาน'],
        answer: 1,
        why: 'Damage นำความคืบหน้าทั้งหมดออกจาก Generator — แต่ทำกับ Exit Gate ไม่ได้ (หน้า 14, 18)',
      },
    },
    {
      say: 'ระหว่าง**แบก**ผู้รอดชีวิต เจ้าทำอะไร**ได้**?',
      quiz: {
        options: ['ข้าม Pallet', 'ใช้พลัง', 'เดินตามเส้นทางสีใดก็ได้ 1 ห้องต่อลูกเต๋า'],
        answer: 2,
        why: 'แบกอยู่ ข้าม Pallet / กำแพง ใช้พลัง หรือ Interact ไม่ได้ — เดินได้ 1 ห้องต่อลูกเต๋าที่ทอย (หน้า 15)',
      },
    },
    {
      say: 'เจ้าพร้อมแล้ว… Trial จริงรออยู่ — เล่น**ออนไลน์**กับเพื่อน หรือ**เครื่องเดียว**ก็ได้ ข้าจะเฝ้าดูการล่าของเจ้า',
      pics: [components.entity.image],
    },
  ],
}

export const KILLER_CHAPTERS: Chapter[] = [goal, plan, hooking, obstacles, power, rules]
