// The survivors' tutorial, chapter by chapter (the basics of the rulebook). The Entity speaks:
// it calls the learner "เจ้า" and itself "ข้า". Pages are the rulebook's.

import { components, skillFaceImage } from '../../data'
import { PROGRESS_MAX, carryMoves, hookHere, killerInteractions, killerMoves } from '../engine/engine'
import type { Action, GameState } from '../engine/types'
import { PROP_IMAGE, cardImage } from '../labels'
import { learnersTurn, plainest } from './policy'
import { baseScene, generatorsRepaired, killerInteracting, killerPlans, learnerInteracting, learnerMoving, place as placeAll, play, propIn, propsOf, rigged, roomProps, settle } from './scene'
import type { Chapter } from './types'

const BACK = (c: 'objective' | 'survival' | 'altruism' | 'boldness') => `assets/props/back-${c}.webp`
const CARDS = (['sneak', 'sprint', 'crouch', 'vault'] as const).map(cardImage)

/** The learner's survivor. */
const me = (st: GameState) => st.survivors[0]

// ---------- 1 · the goal ----------

const goal: Chapter = {
  id: 'goal',
  title: 'เป้าหมายของเกม',
  blurb: 'รู้จักกระดาน ห้อง เส้นทาง prop และวิธีชนะของทั้งสองฝ่าย',
  image: 'assets/app/background-img/background_macmillan.webp',
  build() {
    const st = baseScene()
    roomProps(st, 'ancient-tree', ['generator', 'chest'], false)
    learnerInteracting(st)
    return st
  },
  steps: [
    {
      say: 'ยินดีต้อนรับสู่ Trial ของข้า… ข้าคือ **The Entity** ผู้ดึงเจ้ามาไว้ที่นี่ ข้าจะสอนกฎของเกมนี้ให้ทีละข้อ — ฟังให้ดี เพราะความผิดพลาดมีราคาที่ต้องจ่าย',
      pics: [components.entity.image],
    },
    {
      say: 'นี่คือ**แผนที่** MacMillan Estate แบ่งเป็น**ห้อง** (ช่อง) ทั้งหมด 11 ห้อง ตัวเจ้า **Dwight** ยืนอยู่ที่ห้อง **Ancient Tree**',
      spot: { room: 'ancient-tree' },
    },
    {
      say: 'ห้องเชื่อมกันด้วย**เส้นทาง** แต่ละเส้นมี**สี**ของมัน: **น้ำเงิน** **เขียว** **แดง** และ**เหลือง** — สีบอกว่าต้องใช้การ์ดใบไหนจึงเดินผ่านได้ (หน้า 8) เส้นสีน้ำเงินนี้พาไปยัง Scrapyard',
      spot: { path: 'p14' },
      pics: CARDS,
    },
    {
      say: 'ในแต่ละห้องมี **prop** วางคว่ำอยู่ — เครื่องปั่นไฟ หีบ ตะขอ และอื่น ๆ เจ้าจะรู้ว่าเป็นอะไรก็ต่อเมื่อมีใครเดินเข้าห้องนั้น **สีหลังการ์ด**บอกประเภทของมัน',
      spot: (st) => ({ prop: propsOf(st, 'ancient-tree')[0]?.id }),
      pics: [BACK('objective'), BACK('survival'), BACK('altruism'), BACK('boldness')],
    },
    {
      say: 'และนั่นคือ**ฆาตกร** — The Hillbilly ผู้รับใช้ของข้า เขาเดินเหมือนเจ้า แต่ได้เล่น**สองเทิร์น**ต่อรอบ และจะล่าเจ้าไปแขวนบน**ตะขอ**',
      spot: { room: 'backlot' },
    },
    {
      say: 'ทางซ้ายคือ**ผู้เล่นทุกคน** — ผู้รอดชีวิตสี่คนกับฆาตกร ตัวเลข **▲** คือ **Bloodpoint** แต้มที่ใช้จ่ายเปิดพลังพิเศษ (Perk) ซึ่งเจ้าจะได้เรียนทีหลัง',
      spot: { el: '.players' },
    },
    {
      say: '**ผู้รอดชีวิตชนะ** เมื่อซ่อม **Generator ครบ 4 เครื่อง** ไฟจะเข้า**ประตูทางออก** (Exit Gate) แล้วเปิดประตูหนีออกไปได้ — ทุกคนชนะพร้อมกัน แม้คนที่ยังติดตะขออยู่ (หน้า 5, 13)',
      spot: { el: '.hud' },
      pics: [PROP_IMAGE.generator, PROP_IMAGE.exitGate],
    },
    {
      say: '**ฆาตกรชนะ** เมื่อ**รางการสังเวย** (Sacrifice) เต็ม **8 ช่อง** — ทุกครั้งที่ผู้รอดชีวิตถูกแขวนบนตะขอ ข้าจะได้รับส่วนของข้า (หน้า 5, 11) ใครทำเป้าหมายได้ก่อน ชนะทันที',
      spot: { el: '.hud' },
      pics: [PROP_IMAGE.hook],
    },
    {
      say: 'เกมเล่นเป็น**รอบ** แต่ละรอบมี 4 ช่วง: **วางแผน** (ทุกคนวางการ์ดคว่ำ) → **ผู้รอดชีวิตเล่น** ทีละคน → **ฆาตกรเล่น** สองเทิร์น → **เก็บกวาด** (หน้า 8) แผงทางขวาจะบอกเสมอว่าตอนนี้ต้องทำอะไร',
      spot: { el: '.side' },
    },
    {
      say: 'นั่นคือภาพรวมของ Trial… บทถัดไป ข้าจะสอนเจ้า**เดิน**ด้วยการ์ดเคลื่อนที่ — อย่าทำให้ข้าผิดหวัง',
    },
  ],
}

// ---------- 2 · movement cards ----------

const movement: Chapter = {
  id: 'movement',
  title: 'การ์ดเคลื่อนที่',
  blurb: 'การ์ด 4 ใบ สีของเส้นทาง การวางแผนคว่ำการ์ด และการเดิน',
  image: 'assets/movement/sneak.webp',
  build() {
    const st = baseScene()
    roomProps(st, 'scrapyard', ['generator', 'chest'], true)
    roomProps(st, 'mine-entrance', ['generator'], true)
    // planning: the other three have their cards down; the learner plans, then the killer
    for (const s of [1, 2, 3]) {
      const card = (['sprint', 'crouch', 'sneak'] as const)[s - 1]
      const hand = st.survivorHands[st.survivors[s].hand]
      hand.splice(hand.indexOf(card), 1)
      Object.assign(st.survivors[s], { planned: card, plannedRevealed: false })
    }
    st.phase = 'planning'
    st.step = { t: 'planSurvivors' }
    return st
  },
  steps: [
    {
      say: 'ผู้รอดชีวิตทุกคนถือ**การ์ดเคลื่อนที่ 4 ใบ**: **Sneak** (น้ำเงิน) **Sprint** (เขียว) **Crouch** (แดง) และ **Vault** (เหลือง) การ์ดอยู่ที่มุมขวาล่าง — ชี้ที่การ์ดเพื่อยกขึ้นดูได้',
      pics: CARDS,
      spot: { el: '.hand' },
    },
    {
      say: 'การ์ดแต่ละใบเดินได้เฉพาะ**เส้นทางสีเดียวกัน** ทีละ 1 ห้อง ส่วน **Vault** (เหลือง) เป็น**ทางเดียว** เดินได้ตามลูกศรเท่านั้น (หน้า 8)',
      spot: { room: 'ancient-tree' },
    },
    {
      say: 'ทุกรอบเริ่มด้วยช่วง**วางแผน**: ผู้รอดชีวิตแต่ละคนเลือกการ์ด **1 ใบ** วาง**คว่ำ** ฆาตกรวาง 2 ใบ — ไม่มีใครรู้ว่าใครจะไปไหน จนกว่าจะเปิด (หน้า 8)',
    },
    {
      say: 'จาก Ancient Tree เส้น**สีน้ำเงิน**พาไป **Scrapyard** ได้ — เลือกการ์ด **Sneak** จากมือ แล้วกดยืนยันในแผงขวา',
      spot: { el: '.hand' },
      task: {
        allow: (_st, a) => a.t === 'planSurvivors' && a.cards[0] === 'sneak',
        done: (st) => me(st).planned === 'sneak',
        hint: 'เลือก Sneak (การ์ดสีน้ำเงิน) แล้วกดยืนยัน',
      },
    },
    {
      say: 'ดี… ฆาตกรก็วางการ์ดของเขาแล้ว ถึงตา**ผู้รอดชีวิตเล่น** เจ้าเป็นคนแรก: การ์ด Sneak ถูกเปิด และเส้นสีน้ำเงินจากห้องนี้มี**สองเส้น** — คลิกเส้นที่ไป **Scrapyard** บนแผนที่',
      spot: { path: 'p14' },
      task: {
        allow: (_st, a) => a.t === 'move' && a.path === 'p14',
        done: (st) => me(st).room === 'scrapyard',
        hint: 'คลิกเส้นสีน้ำเงินที่ไป Scrapyard บนแผนที่',
      },
    },
    {
      say: 'เจ้ามาถึง Scrapyard แล้ว จำไว้: เมื่อเปิดการ์ดแล้ว**ต้องเดิน** ถ้าห้องที่ยืนอยู่**ไม่มีเส้นสีนั้น** หรือมี**กำแพง**ขวาง เจ้าจะอยู่ที่เดิมและ**เสียการ Interact** ของเทิร์นนั้น (หน้า 8, 13)',
      spot: { room: 'scrapyard' },
    },
    {
      say: 'การ์ดที่ใช้แล้วจะคว่ำกลับเข้ามือเมื่อจบรอบ ทางซ้ายจะขีดฆ่าการ์ดที่เปิดไปแล้วให้ฆาตกรเห็นว่าเจ้าเหลือใบไหน — คิดให้ดีก่อนวาง เพราะเขาก็อ่านเจ้าออกเหมือนกัน',
      spot: { el: '.players' },
    },
  ],
}

// ---------- 3 · revealing props ----------

const reveal: Chapter = {
  id: 'reveal',
  title: 'เปิด prop',
  blurb: 'เข้าห้องใหม่แล้วเปิด prop 1 อัน — 4 สี 4 ประเภท',
  image: 'assets/props/back-objective.webp',
  build() {
    const st = baseScene()
    roomProps(st, 'shack', ['generator', 'chest', 'crow', 'hook'], false)
    learnerMoving(st, 'crouch')
    return st
  },
  steps: [
    {
      say: 'ห้อง **Shack** ข้างหน้ามี prop คว่ำอยู่ 4 อัน — หลังการ์ดแต่ละ**สี**บอกประเภท: **เหลือง** = เป้าหมาย, **น้ำเงิน** = เอาตัวรอด, **เขียว** = ช่วยเหลือ, **แดง** = ความกล้า',
      spot: { room: 'shack' },
      pics: [BACK('objective'), BACK('survival'), BACK('altruism'), BACK('boldness')],
    },
    {
      say: 'เจ้าเปิดการ์ด **Crouch** (แดง) — เดินตามเส้นสีแดงเข้าไปใน Shack',
      spot: { path: 'p15' },
      task: {
        allow: (_st, a) => a.t === 'move' && a.path === 'p15',
        done: (st) => me(st).room === 'shack',
        hint: 'คลิกเส้นสีแดงที่ไป Shack',
      },
    },
    {
      say: 'เมื่อเข้าห้องใหม่ เจ้า**เปิด prop ที่คว่ำได้ 1 อัน** (หน้า 8) — เลือกเองว่าจะเปิดอันไหน ลองเปิด**สีเหลือง**ดู มักเป็นเครื่องปั่นไฟ',
      spot: (st) => ({ prop: propsOf(st, 'shack').find((p) => p.category === 'objective')?.id }),
      task: {
        allow: (st, a) => a.t === 'reveal' && st.props.find((p) => p.id === a.prop)?.category === 'objective',
        done: (st) => propsOf(st, 'shack').some((p) => p.revealed),
        hint: 'คลิก prop สีเหลืองที่คว่ำอยู่ใน Shack',
      },
    },
    {
      say: 'นั่นคือ **Generator** (เครื่องปั่นไฟ) — สิ่งที่เจ้าต้องซ่อมให้ครบ 4 เครื่องเพื่อหนี ส่วน prop อื่นยัง**คว่ำอยู่** จนกว่าจะมีใครเดินเข้าห้องนี้อีกครั้ง',
      spot: (st) => ({ prop: propsOf(st, 'shack').find((p) => p.kind === 'generator')?.id }),
      pics: [PROP_IMAGE.generator],
    },
    {
      say: '**น้ำเงิน — เอาตัวรอด**: **Chest** (หีบ ค้นแล้วได้ item) และ **Locker** (ตู้ เข้าไปซ่อนตัว) — prop ที่ช่วยเจ้ารอดจากฆาตกร (หน้า 12)',
      spot: (st) => ({ prop: propsOf(st, 'shack').find((p) => p.category === 'survival')?.id }),
      pics: [PROP_IMAGE.chest, PROP_IMAGE.locker],
    },
    {
      say: '**เขียว — ช่วยเหลือ**: **Crow** (อีกา ไล่แล้วได้เทิร์นพิเศษ แต่ฆาตกรได้ ▲) และ **Pallet** (แผ่นไม้ ล้มขวางทางฆาตกร) (หน้า 12)',
      spot: (st) => ({ prop: propsOf(st, 'shack').find((p) => p.category === 'altruism')?.id }),
      pics: [PROP_IMAGE.crow, PROP_IMAGE.pallet],
    },
    {
      say: '**แดง — ความกล้า**: **Hook** (ตะขอ ที่ฆาตกรแขวนผู้รอดชีวิต — Sabotage ปิดมันได้ หรือช่วยเพื่อนลงมา) และ **Hex Totem** (ชำระแล้วได้ ▲) — ต้องกล้าเข้าใกล้ (หน้า 13)',
      spot: (st) => ({ prop: propsOf(st, 'shack').find((p) => p.category === 'boldness')?.id }),
      pics: [PROP_IMAGE.hook, PROP_IMAGE.totem],
    },
    {
      say: 'ทุกห้องที่เจ้าเดินเข้า คือโอกาสเปิดสิ่งใหม่ — เลือกให้ดีว่าจะเปิดอะไร บทถัดไป ข้าจะสอนเจ้า**ซ่อมเครื่องปั่นไฟ**',
    },
  ],
}

// ---------- 4 · repairing and the skill check ----------

const REPAIR_ROOM = 'shack'

const repair: Chapter = {
  id: 'repair',
  title: 'ซ่อม Generator และ Skill Check',
  blurb: 'Interact 1 อย่างต่อเทิร์น ทอยลูกเต๋า Skill Check และผลของมัน',
  image: 'assets/props/generator.webp',
  build() {
    const st = baseScene()
    place(st)
    roomProps(st, REPAIR_ROOM, ['generator', 'chest'], true)
    learnerInteracting(st)
    // the roll a plain success (a great one and a failure are explained after it)
    const gen = propsOf(st, REPAIR_ROOM).find((p) => p.kind === 'generator')!
    st.rng = rigged(
      st,
      (s) => settle(play(s, { t: 'interact', i: { k: 'repair', prop: gen.id } })),
      (s) => s.props.find((p) => p.id === gen.id)!.progress === 1,
    )
    return st
  },
  steps: [
    {
      say: 'หลังเดินแล้ว เจ้า **Interact** ได้ **1 อย่าง**ต่อเทิร์น กับ prop ที่**เปิดแล้ว**ในห้องของเจ้า — หรือจะไม่ทำอะไรก็ได้ (หน้า 9)',
      spot: { room: REPAIR_ROOM },
    },
    {
      say: 'การซ่อมต้องทอย **Skill Check** — ลูกเต๋า 6 หน้า: **หัวกะโหลก** = ล้มเหลว, **ขีด 1–4** = สำเร็จ, **ขีด 4 มีขีดทับ** = สำเร็จยอดเยี่ยม (หน้า 16)',
      pics: [0, 1, 2, 3, 4, 5].map(skillFaceImage),
    },
    {
      say: 'ตรงหน้าเจ้าคือ **Generator** ที่ยังไม่มีใครซ่อม (0/3) — คลิกที่มันเพื่อ**ซ่อม** แล้วดูลูกเต๋าที่ทอยออกมากลางจอ',
      spot: (st) => ({ prop: propsOf(st, REPAIR_ROOM).find((p) => p.kind === 'generator')?.id }),
      task: {
        allow: (_st, a) => a.t === 'interact' && a.i.k === 'repair',
        done: (st) => (propsOf(st, REPAIR_ROOM).find((p) => p.kind === 'generator')?.progress ?? 0) > 0,
        hint: 'คลิก Generator ใน Shack เพื่อซ่อม',
      },
    },
    {
      say: 'ลูกเต๋าออก**ขีด** — **สำเร็จ**! เมื่อไม่มีใครเปลี่ยนผลทอยได้ (เช่นด้วย Perk) ผลจะใช้ทันที',
      spot: (st) => ({ prop: propsOf(st, REPAIR_ROOM).find((p) => p.kind === 'generator')?.id }),
    },
    {
      say: `Generator ขยับขึ้น **+1** — ซ่อมครบ **${PROGRESS_MAX}** จึงเสร็จ ถ้าได้**สำเร็จยอดเยี่ยม**จะได้ **+2** แต่ถ้า**ล้มเหลว** ได้ 0 และ**ฆาตกรได้ ▲ 1 แต้ม**จากความพลาดของเจ้า (หน้า 12, 16)`,
      spot: (st) => ({ prop: propsOf(st, REPAIR_ROOM).find((p) => p.kind === 'generator')?.id }),
      pics: [skillFaceImage(5), skillFaceImage(0)],
    },
    {
      say: 'ซ่อมเสร็จแล้ว เครื่องจะย้ายขึ้น**รางเครื่องปั่นไฟ** — ครบ **4 เครื่อง** ประตูทางออกจะมีไฟ เพื่อน ๆ ซ่อมเครื่องเดียวกันต่อจากเจ้าได้ ร่วมมือกันจะเร็วกว่า',
      spot: { el: '.hud' },
    },
    {
      say: 'เจ้าได้เรียนพื้นฐานของการเอาตัวรอดแล้ว… แต่ Trial ของข้ายังมีอีกมาก — กลับมาเรียนบทต่อไปเมื่อเจ้าพร้อม',
    },
  ],
}

/** Survivor (and its tile) need no other room for the repair scene than the base one. */
function place(st: GameState) {
  st.survivors[0].room = REPAIR_ROOM
}

// ---------- 5 · survival props ----------

const survival: Chapter = {
  id: 'survival',
  title: 'prop เอาตัวรอด',
  blurb: 'ค้น Chest หา item, ซ่อนใน Locker และ Pallet ที่ขวางฆาตกร',
  image: 'assets/props/chest.webp',
  build() {
    const st = baseScene()
    roomProps(st, 'ancient-tree', ['chest', 'locker'], true)
    learnerInteracting(st)
    return st
  },
  steps: [
    {
      say: 'prop **สีน้ำเงิน** คือของ**เอาตัวรอด** — ในห้อง Ancient Tree มี **Chest** (หีบ) กับ **Locker** (ตู้) เปิดอยู่แล้ว',
      spot: { room: 'ancient-tree' },
      pics: [PROP_IMAGE.chest, PROP_IMAGE.locker],
    },
    {
      say: '**ค้นหีบ** (Rummage): หีบหายไปจากกระดาน แล้วเจ้าจั่ว **item** 1 ใบ — คลิกที่ Chest (หน้า 12)',
      spot: (st) => ({ prop: propIn(st, 'ancient-tree', 'chest')?.id }),
      task: {
        allow: (_st, a) => a.t === 'interact' && a.i.k === 'rummage',
        done: (st) => !!me(st).item,
        hint: 'คลิก Chest ใน Ancient Tree',
      },
    },
    {
      say: 'เจ้าได้ **item** มาแล้ว — อยู่ในช่องใต้รายชื่อผู้เล่น คลิกดูได้ว่าใช้ทำอะไร แต่ละใบใช้ได้ตามเงื่อนไขบนการ์ด เช่น **Flashlight** กันฆาตกรไม่ให้ Interact ในห้องเจ้า **ถือได้แค่ 1 ใบ** (หน้า 12, 18)',
      spot: { el: '.item-slot' },
    },
    {
      say: 'เทิร์นต่อมา… เจ้ายังอยู่ที่ Ancient Tree และได้ Interact อีกครั้ง',
      setup(st) {
        const next = structuredClone(st)
        learnerInteracting(next)
        return next
      },
    },
    {
      say: '**ซ่อนใน Locker** (Hide): เจ้าจะถือว่า**ไม่อยู่บนกระดาน** — ฆาตกรโจมตีหรืออุ้มเจ้าไม่ได้ แต่เขา**ค้นตู้**ได้ — คลิกที่ Locker',
      spot: (st) => ({ prop: propIn(st, 'ancient-tree', 'locker')?.id }),
      task: {
        allow: (_st, a) => a.t === 'interact' && a.i.k === 'hide',
        done: (st) => me(st).status === 'locker',
        hint: 'คลิก Locker ใน Ancient Tree',
      },
    },
    {
      say: 'อยู่ในตู้ เจ้า**ใช้ Perk และ item ไม่ได้** ถ้าฆาตกร**ค้นตู้** เจ้าทอย Skill Check — **ล้มเหลว = ถูกอุ้มทันที** แม้ยังไม่บาดเจ็บ, สำเร็จ = ตู้ถูกนำออก เมื่อจะเดินต้องออกจากตู้ก่อน (หน้า 12, 14)',
      spot: (st) => ({ prop: propIn(st, 'ancient-tree', 'locker')?.id }),
    },
    {
      say: 'อีกอันที่ช่วยหนีคือ **Pallet** (สีเขียว) — Interact เพื่อ**ล้มขวางเส้นทาง**ข้างห้องเจ้า ผู้รอดชีวิตเดินผ่านได้ แต่ฆาตกรที่จะผ่านต้อง**ทำลาย**มัน แล้ว**ติดอยู่ที่เดิม เสียการ Interact** เทิร์นนั้น (หน้า 12, 14)',
      pics: [PROP_IMAGE.pallet],
    },
    {
      say: 'หีบให้เครื่องมือ ตู้ให้ที่ซ่อน แผ่นไม้ให้เวลา… ใช้มันให้คุ้ม เพราะข้าไม่ให้อะไรฟรี',
    },
  ],
}

// ---------- 6 · crows, bonus turns and bloodpoints ----------

const bonus: Chapter = {
  id: 'bonus',
  title: 'Crow, Bonus Turn และ ▲',
  blurb: 'ไล่อีกาเพื่อได้เทิร์นพิเศษ ชำระ Hex Totem และแต้ม Bloodpoint',
  image: 'assets/props/crow.webp',
  build() {
    const st = baseScene()
    roomProps(st, 'ancient-tree', ['crow'], true)
    roomProps(st, 'mine-depths', ['totem'], false)
    learnerInteracting(st)
    // the cleanse after the bonus turn succeeds
    const crow = propIn(st, 'ancient-tree', 'crow')!
    const totem = propIn(st, 'mine-depths', 'totem')!
    st.rng = rigged(
      st,
      (s) => {
        let x = play(s, { t: 'interact', i: { k: 'crow', prop: crow.id } }, { t: 'bonus', card: 'sprint' }, { t: 'move', path: 'p5' })
        while (x.step.t === 'revealProp') x = play(x, { t: 'reveal', prop: totem.id })
        return settle(play(x, { t: 'interact', i: { k: 'cleanse', prop: totem.id } }))
      },
      (s) => s.props.find((p) => p.id === totem.id)!.removed,
    )
    return st
  },
  steps: [
    {
      say: '**Crow** (อีกา สีเขียว) — เมื่อเจ้า**ไล่อีกา** ฆาตกรได้ **▲ 1 แต้ม** เพราะเสียงของมัน แต่เจ้าได้ **Bonus Turn** (หน้า 12)',
      spot: (st) => ({ prop: propIn(st, 'ancient-tree', 'crow')?.id }),
      pics: [PROP_IMAGE.crow],
    },
    {
      say: 'คลิกที่ Crow เพื่อไล่มัน',
      spot: (st) => ({ prop: propIn(st, 'ancient-tree', 'crow')?.id }),
      task: {
        allow: (_st, a) => a.t === 'interact' && a.i.k === 'crow',
        done: (st) => st.step.t === 'bonusOffer',
        hint: 'คลิก Crow ใน Ancient Tree',
      },
    },
    {
      say: '**Bonus Turn**: **ทิ้ง**การ์ด 1 ใบจากมือ แล้วเดินตามสีของมัน + Interact อีกครั้ง (หน้า 9) — เส้น**สีเขียว**จากที่นี่ไป **Mine Depths** เลือกการ์ด **Sprint** แล้วกดยืนยัน',
      spot: { el: '.hand' },
      task: {
        allow: (_st, a) => a.t === 'bonus' && a.card === 'sprint',
        done: (st) => st.step.t !== 'bonusOffer',
        hint: 'เลือก Sprint (การ์ดสีเขียว) แล้วกดยืนยัน',
      },
    },
    {
      say: 'คลิกเส้นสีเขียวที่ไป Mine Depths',
      spot: { path: 'p5' },
      task: {
        allow: (_st, a) => a.t === 'move' && a.path === 'p5',
        done: (st) => me(st).room === 'mine-depths',
        hint: 'คลิกเส้นสีเขียวที่ไป Mine Depths',
      },
    },
    {
      say: 'ห้องใหม่ — เปิด prop ที่คว่ำอยู่',
      spot: (st) => ({ prop: propIn(st, 'mine-depths', 'totem')?.id }),
      task: {
        allow: (_st, a) => a.t === 'reveal',
        done: (st) => !!propIn(st, 'mine-depths', 'totem')?.revealed,
        hint: 'คลิก prop ที่คว่ำอยู่ใน Mine Depths',
      },
    },
    {
      say: 'นั่นคือ **Hex Totem** (สีแดง) — **ชำระ** (Cleanse) มันด้วย Skill Check ถ้าสำเร็จ Totem ถูกนำออก และเจ้าได้ **▲ 2 แต้ม** — คลิกที่มัน (หน้า 13)',
      spot: (st) => ({ prop: propIn(st, 'mine-depths', 'totem')?.id }),
      task: {
        allow: (_st, a) => a.t === 'interact' && a.i.k === 'cleanse',
        done: (st) => !propIn(st, 'mine-depths', 'totem'),
        hint: 'คลิก Hex Totem เพื่อชำระ',
      },
    },
    {
      say: 'สำเร็จ! **▲** ของเจ้าเพิ่มขึ้น 2 — นี่คือ **Bloodpoint** ผู้รอดชีวิตเริ่มที่ 2 มีได้**สูงสุด 6** ได้จากชำระ Totem (+2) และช่วยเพื่อนลงจากตะขอ (+1) (หน้า 4, 13)',
      spot: { el: '.players' },
    },
    {
      say: 'ใช้ ▲ จ่ายเปิด **Perk** — พลังพิเศษบนกระดานตัวละคร ราคาอยู่บนการ์ด แต่ละใบใช้ได้ **1 ครั้งต่อรอบ** ส่วนฆาตกรได้ ▲ จากความพลาดของเจ้า (ทอยล้มเหลว, ไล่อีกา) และจ่าย **4 ▲** เพื่อเล่นเทิร์นที่ 3 (หน้า 5, 10, 16)',
    },
    {
      say: 'Bonus Turn เล่นได้หลายครั้งต่อรอบ ตราบที่ยังมีการ์ดในมือ — แต่การ์ดที่ทิ้งไปแล้ว คือทางที่เจ้าใช้ไม่ได้อีกในรอบนั้น',
    },
  ],
}

// ---------- 7 · the killer arrives ----------

const HUNT_ROOM = 'scrapyard'

/** The killer hunts the learner: into their room, attack, pick up, carry to the hook in Shack. */
function hunt(st: GameState): Action | null {
  const step = st.step
  const room = me(st).room
  if (step.t === 'killerMove') {
    const m = killerMoves(st, step.card).find((x) => x.to === room)
    return m ? { t: 'move', path: m.path.id } : null
  }
  if (step.t === 'killerInteract') {
    const i = killerInteractions(st).find((x) => (x.k === 'attack' || x.k === 'pickUp') && x.target === 0)
    return i ? { t: 'interact', i } : null
  }
  if (step.t === 'carryDice') return hookHere(st) ? { t: 'hang' } : { t: 'carryDice', n: 2 }
  if (step.t === 'carryMove') {
    if (hookHere(st)) return { t: 'hang' }
    const m = carryMoves(st).find((x) => propsOf(st, x.to).some((p) => p.kind === 'hook' && p.revealed && p.occupant === null))
    return m ? { t: 'move', path: m.path.id } : null
  }
  return null
}

const killerArrives: Chapter = {
  id: 'killer',
  title: 'เมื่อฆาตกรมาถึง',
  blurb: 'ถูกโจมตี บาดเจ็บ ถูกอุ้ม ดิ้นหลุด และถูกแขวนบนตะขอ',
  image: 'assets/props/hook.webp',
  auto: hunt,
  build() {
    const st = baseScene()
    roomProps(st, HUNT_ROOM, ['generator'], true)
    placeAll(st, { 0: HUNT_ROOM }, 'shack')
    learnerInteracting(st)
    killerPlans(st, ['sprint', 'wait'])
    return st
  },
  steps: [
    {
      say: 'เมื่อผู้รอดชีวิต**ทุกคนเล่นจบ** ถึงตา**ฆาตกร** — เขาเปิดการ์ดทีละใบ ซ้ายก่อนขวา เดินแล้ว Interact ใบละครั้ง (หน้า 10) ตอนนี้เขาอยู่ที่ **Shack** ข้าง ๆ เจ้า',
      spot: { room: 'shack' },
    },
    {
      say: 'กด**จบเทิร์น**ในแผงขวา แล้วดูว่าเกิดอะไรขึ้น',
      spot: { el: '.side' },
      task: {
        allow: (_st, a) => a.t === 'endTurn',
        done: (st) => !learnersTurn(st),
        hint: 'กดจบเทิร์นในแผงขวา',
      },
    },
    {
      say: 'ผู้รอดชีวิตคนอื่นเล่นเทิร์นของตัวเอง… แล้วฆาตกรก็มา',
      task: {
        allow: () => false,
        done: (st) => me(st).wounded,
        hint: 'รอดูฆาตกร…',
      },
    },
    {
      say: 'เขาเดินเข้ามาด้วย **Sprint** แล้ว**โจมตี** — เจ้า**บาดเจ็บ** (มีวงแหวนแดงที่ฐานมินิ) ถ้าถูกโจมตีซ้ำขณะบาดเจ็บ จะ**ไม่มีอะไรเกิดขึ้น** และเขา**อุ้มคนที่เพิ่งบาดเจ็บรอบนี้ไม่ได้** (หน้า 14, 15, 18)',
      spot: { room: HUNT_ROOM },
    },
    {
      say: 'แต่รอบถัดไป… ฆาตกรยังยืนอยู่กับเจ้า และเจ้ายังบาดเจ็บ — คนที่บาดเจ็บ ถูก**อุ้ม** (Pick Up) ได้',
      setup() {
        const st = baseScene()
        roomProps(st, HUNT_ROOM, ['generator'], true)
        roomProps(st, 'shack', ['hook'], true)
        placeAll(st, { 0: HUNT_ROOM }, HUNT_ROOM)
        Object.assign(me(st), { wounded: true, woundedThisRound: false })
        killerInteracting(st)
        st.round = 2
        // carried without a die coming up a great success: the hook is reached
        st.rng = rigged(
          st,
          (s) => {
            let x = s
            for (let n = 0; n < 30 && me(x).status !== 'hooked'; n++) {
              const a = learnersTurn(x) ? (x.step.t === 'roll' ? ({ t: 'acceptRoll' } as Action) : null) : (hunt(x) ?? plainest(x))
              if (!a) break
              x = play(x, a)
            }
            return x
          },
          (s) => me(s).status === 'hooked',
        )
        return st
      },
      spot: { room: HUNT_ROOM },
    },
    {
      say: 'ดูให้ดี…',
      task: {
        allow: (_st, a) => a.t === 'acceptRoll',
        done: (st) => me(st).status === 'hooked',
        hint: 'รอดูฆาตกรอุ้มเจ้า (ถ้ามีลูกเต๋าของเจ้า กดยอมรับผล)',
      },
    },
    {
      say: 'ห้องนี้ไม่มีตะขอ เขาจึง**แบก**เจ้าไป: ฆาตกรเลือก**ลูกเต๋า 1–4 ลูก** เจ้าทอยทั้งหมด — ถ้าออก**สำเร็จยอดเยี่ยม**สักลูก เจ้า**ดิ้นหลุด** ไม่งั้นเขาเดินได้ 1 ห้องต่อลูกเต๋า จนถึงตะขอว่าง (หน้า 15)',
      pics: [skillFaceImage(5)],
    },
    {
      say: 'เจ้าถูก**แขวนบนตะขอ** — **ถูกสังเวย** Token ที่อยู่บนกระดานเจ้าขึ้นราง Sacrifice ทันที **+1** และทุกช่วง**เก็บกวาด** (จบรอบ) +1 ต่อคนที่ยังถูกแขวน ครบ **8** ฆาตกรชนะ (หน้า 11, 15)',
      spot: { el: '.hud' },
      pics: [PROP_IMAGE.hook],
    },
    {
      say: 'บนตะขอ เจ้า**ไม่ได้วางการ์ด ไม่ได้เล่นเทิร์น** ใช้ Perk และ item ไม่ได้ — ทางรอดเดียวคือ**เพื่อน**มาช่วย… บทถัดไป ข้าจะสอนวิธีช่วย',
    },
  ],
}

// ---------- 8 · helping others ----------

const HELP_ROOM = 'ancient-tree'

const helping: Chapter = {
  id: 'help',
  title: 'ช่วยเพื่อน',
  blurb: 'รักษาเพื่อนที่บาดเจ็บ ช่วยลงจากตะขอ และ Sabotage ตะขอ',
  image: 'assets/props/back-altruism.webp',
  build() {
    const st = baseScene()
    roomProps(st, HELP_ROOM, ['generator'], true)
    placeAll(st, { 1: HELP_ROOM }, 'backlot')
    st.survivors[1].wounded = true
    learnerInteracting(st)
    st.rng = rigged(
      st,
      (s) => settle(play(s, { t: 'interact', i: { k: 'heal', target: 1 } })),
      (s) => !s.survivors[1].wounded,
    )
    return st
  },
  steps: [
    {
      say: '**Meg** อยู่ห้องเดียวกับเจ้า และ**บาดเจ็บ** — ผู้รอดชีวิต**รักษา**คนอื่นในห้องเดียวกันได้ (รักษาตัวเองไม่ได้) ด้วย Skill Check สำเร็จ = หายดี (หน้า 13)',
      spot: { room: HELP_ROOM },
    },
    {
      say: 'คลิกที่ตัว Meg บนแผนที่เพื่อ**รักษา**',
      spot: { room: HELP_ROOM },
      task: {
        allow: (_st, a) => a.t === 'interact' && a.i.k === 'heal',
        done: (st) => !st.survivors[1].wounded,
        hint: 'คลิกที่ Meg ใน Ancient Tree แล้วเลือกรักษา',
      },
    },
    {
      say: 'Meg **หายดี**แล้ว — ฆาตกรต้องโจมตีเธอใหม่ก่อนจึงจะอุ้มได้',
    },
    {
      say: 'คราวนี้ Meg ถูก**แขวน**บนตะขอในห้องของเจ้า…',
      setup() {
        const st = baseScene()
        roomProps(st, HELP_ROOM, ['hook'], true)
        const hook = propIn(st, HELP_ROOM, 'hook')!
        hook.occupant = 1
        Object.assign(st.survivors[1], { status: 'hooked', room: HELP_ROOM, wounded: true, sacrificeToken: false })
        st.sacrifice = 1
        learnerInteracting(st)
        return st
      },
      spot: { room: HELP_ROOM },
    },
    {
      say: '**Sabotage** ตะขอที่มีคนถูกแขวน = **ช่วยลงมา** เจ้าได้ **▲ 1** — คลิกที่ตะขอ (หน้า 13)',
      spot: (st) => ({ prop: propIn(st, HELP_ROOM, 'hook')?.id }),
      task: {
        allow: (_st, a) => a.t === 'interact' && a.i.k === 'sabotage',
        done: (st) => st.survivors[1].status === 'board',
        hint: 'คลิกตะขอที่ Meg ถูกแขวนอยู่',
      },
    },
    {
      say: 'ช่วยแล้ว เจ้า**เดินตามเส้นทางใดก็ได้ 1 ครั้ง** (สีไหนก็ได้) แล้ว Meg ก็เดินต่อ — หนีจากตะขอให้ไกล หรือจะอยู่ห้องเดิมก็ได้',
      task: {
        allow: (_st, a) => a.t === 'move' || a.t === 'stop',
        done: (st) => !(st.step.t === 'anyMove' && st.step.s === 0),
        hint: 'คลิกเส้นทางใดก็ได้บนแผนที่ หรือกด "อยู่ห้องเดิม"',
      },
    },
    {
      say: 'Sabotage ตะขอที่**ว่าง**ก็ได้ — วาง **Entity token** บนมัน ฆาตกรใช้ตะขอนั้นไม่ได้จนจบรอบ (ไม่ได้ ▲) ช่วยตัดทางฆาตกรก่อนเขาจะอุ้มใคร (หน้า 13, 16)',
      pics: [components.entity.image],
    },
    {
      say: 'ผู้รอดชีวิตที่ช่วยกัน… คือสิ่งที่ข้าเกลียดที่สุด จำไว้ว่าทุกคนชนะพร้อมกันเมื่อประตูเปิด',
    },
  ],
}

// ---------- 9 · escaping ----------

const ESCAPE_ROOM = 'shack'

const escape: Chapter = {
  id: 'escape',
  title: 'หนีออกไป',
  blurb: 'ซ่อม Generator เครื่องที่ 4 ไฟเข้าประตู แล้วเปิด Exit Gate',
  image: 'assets/props/exit-gate.webp',
  build() {
    const st = baseScene()
    roomProps(st, ESCAPE_ROOM, ['generator'], true)
    generatorsRepaired(st, 3)
    placeAll(st, { 0: ESCAPE_ROOM }, 'backlot')
    propIn(st, ESCAPE_ROOM, 'generator')!.progress = 2
    learnerInteracting(st)
    const gen = propIn(st, ESCAPE_ROOM, 'generator')!
    st.rng = rigged(
      st,
      (s) => settle(play(s, { t: 'interact', i: { k: 'repair', prop: gen.id } })),
      (s) => s.props.find((p) => p.id === gen.id)!.done,
    )
    return st
  },
  steps: [
    {
      say: 'ซ่อมเสร็จไปแล้ว **3 เครื่อง** — ดูที่**รางเครื่องปั่นไฟ** ใต้รายชื่อผู้เล่น เครื่องตรงหน้าเจ้าอยู่ที่ **2/3**',
      spot: { el: '.hud' },
    },
    {
      say: 'ซ่อมเครื่องสุดท้าย — คลิก Generator',
      spot: (st) => ({ prop: propIn(st, ESCAPE_ROOM, 'generator')?.id }),
      task: {
        allow: (_st, a) => a.t === 'interact' && a.i.k === 'repair',
        done: (st) => st.props.filter((p) => p.kind === 'generator' && p.done).length >= 4,
        hint: 'คลิก Generator ใน Shack',
      },
    },
    {
      say: 'ครบ **4 เครื่อง** — **ประตูทางออกมีไฟแล้ว** ประตูก็เป็น prop สีเหลือง ต้องมีคนเปิดเจอในห้องก่อน และฆาตกร**ทำลายประตูไม่ได้** (หน้า 13, 18)',
      pics: [PROP_IMAGE.exitGate],
    },
    {
      say: 'เจ้าเจอประตูแล้ว และเพื่อนช่วยเปิดไปถึง **2/3** — **เปิดประตู** ต้องทอย Skill Check สำเร็จ +1 ครบ 3 = ประตูเปิด',
      setup() {
        const st = baseScene()
        roomProps(st, 'ancient-tree', ['exitGate'], true)
        generatorsRepaired(st, 4)
        propIn(st, 'ancient-tree', 'exitGate')!.progress = 2
        learnerInteracting(st)
        const gate = propIn(st, 'ancient-tree', 'exitGate')!
        st.rng = rigged(
          st,
          (s) => settle(play(s, { t: 'interact', i: { k: 'openGate', prop: gate.id } })),
          (s) => s.phase === 'over',
        )
        return st
      },
      spot: (st) => ({ prop: propIn(st, 'ancient-tree', 'exitGate')?.id }),
    },
    {
      say: 'เมื่อประตูเปิด **ผู้รอดชีวิตทุกคนชนะทันที** — รวมถึงคนที่ยังติดตะขอ (หน้า 5, 17) คลิกที่ Exit Gate เพื่อเปิด',
      spot: (st) => ({ prop: propIn(st, 'ancient-tree', 'exitGate')?.id }),
      task: {
        allow: (_st, a) => a.t === 'interact' && a.i.k === 'openGate',
        done: (st) => st.phase === 'over',
        hint: 'คลิก Exit Gate ใน Ancient Tree',
      },
    },
  ],
}

// ---------- 10 · rules to know ----------

const rules: Chapter = {
  id: 'rules',
  title: 'กฎที่ควรรู้',
  blurb: 'ทบทวนกฎที่มักลืม แล้วตอบคำถามของ The Entity',
  image: 'assets/tokens/entity.webp',
  build() {
    const st = baseScene()
    roomProps(st, 'ancient-tree', ['generator'], true)
    learnerInteracting(st)
    return st
  },
  steps: [
    {
      say: 'ก่อนเจ้าจะออกไปเผชิญ Trial จริง… ข้าจะทวนกฎที่คนมักลืม แล้วถามเจ้า — ตอบผิด ข้าจะบอกว่าทำไม',
    },
    {
      say: 'ผู้รอดชีวิต**คุยกันได้**ตลอด แต่**ห้ามคุยลับ** — ทุกอย่างต้องพูดให้ฆาตกรได้ยิน (หน้า 8) ในเทิร์นของเจ้า: **เดิน 1 ครั้ง** → **เปิด prop 1 อัน** ถ้ามีคว่ำ → **Interact 1 อย่าง**',
    },
    {
      say: 'เจ้าเดินเข้าห้องที่มี prop คว่ำอยู่ 3 อัน — เปิดได้กี่อัน?',
      quiz: { options: ['1 อัน', '2 อัน', 'ทั้งหมด 3 อัน'], answer: 0, why: 'เข้าห้องใหม่ เปิด prop ที่คว่ำได้แค่ 1 อัน (หน้า 8)' },
    },
    {
      say: 'เปิดการ์ดแล้วห้องเจ้า**ไม่มีเส้นสีนั้น** หรือทางนั้นมี**กำแพง** — จะเกิดอะไรขึ้น?',
      quiz: {
        options: ['เลือกการ์ดใบใหม่ได้', 'อยู่ที่เดิม และเสียการ Interact เทิร์นนั้น', 'เดินเส้นสีอื่นแทนได้'],
        answer: 1,
        why: 'เดินไม่ได้ = อยู่ที่เดิมและเสียการ Interact (หน้า 8, 13)',
      },
    },
    {
      say: 'ฆาตกร**โจมตี**เจ้าที่**บาดเจ็บอยู่แล้ว** — เกิดอะไรขึ้น?',
      quiz: { options: ['ถูกอุ้มทันที', 'ไม่มีอะไรเกิดขึ้น', 'ถูกแขวนทันที'], answer: 1, why: 'ถูกโจมตีขณะบาดเจ็บ ไม่มีผล — ต้องถูกอุ้ม (Pick Up) แยกอีกครั้ง (หน้า 18)' },
    },
    {
      say: '**item** ถือได้ 1 ใบ, **▲** ผู้รอดชีวิตมีได้สูงสุด 6, **Perk** ใช้ได้ใบละ 1 ครั้งต่อรอบ, อยู่ใน **Locker** = ไม่อยู่บนกระดาน, ฆาตกรที่**แบก**คนอยู่ ข้าม Pallet และกำแพงไม่ได้ (หน้า 12, 15, 16)',
    },
    {
      say: 'Generator ต้องซ่อมกี่เครื่องประตูจึงมีไฟ?',
      quiz: { options: ['3 เครื่อง', '4 เครื่อง', '5 เครื่อง'], answer: 1, why: 'ครบ 4 เครื่อง ประตูทางออกจึงมีไฟ (หน้า 13)' },
    },
    {
      say: 'ฆาตกรชนะเมื่อ…?',
      quiz: {
        options: ['ผู้รอดชีวิตทุกคนบาดเจ็บ', 'รางการสังเวยครบ 8', 'แขวนผู้รอดชีวิตได้ 4 ครั้ง'],
        answer: 1,
        why: 'ฆาตกรชนะเมื่อราง Sacrifice ครบ 8 ช่อง (หน้า 5, 11)',
      },
    },
    {
      say: 'เจ้าผ่านบททดสอบของข้า… Trial จริงรอเจ้าอยู่ — ไปเล่น**ออนไลน์**กับเพื่อน หรือ**เครื่องเดียว**ก็ได้ ข้าจะเฝ้าดู',
      pics: [components.entity.image],
    },
  ],
}

export const CHAPTERS: Chapter[] = [goal, movement, reveal, repair, survival, bonus, killerArrives, helping, escape, rules]
