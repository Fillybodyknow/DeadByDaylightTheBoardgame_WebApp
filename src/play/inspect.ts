// What the details modal can show, and the rules text for each prop (rulebook p.12–15).

import type { PerkId } from './engine/perks'
import type { PerkOwner, PropKind } from './engine/types'

export type InspectTarget =
  | { k: 'prop'; id: string }
  | { k: 'survivor'; s: number }
  | { k: 'killer' }
  | { k: 'item'; id: string }
  | { k: 'perk'; perk: PerkId; owner: PerkOwner }

export const CATEGORY_TH = {
  objective: 'Objective (เหลือง)',
  survival: 'Survival (น้ำเงิน)',
  altruism: 'Altruism (เขียว)',
  boldness: 'Boldness (แดง)',
} as const

export const PROP_RULES: Record<PropKind, { survivor: string; killer: string }> = {
  generator: {
    survivor: 'Repair: ทอย Skill Check — สำเร็จ +1, สำเร็จยอดเยี่ยม +2, ล้มเหลว +0 ครบ 3 = ซ่อมเสร็จ ย้ายขึ้นราง Generator (หน้า 12)',
    killer: 'Damage: นำความคืบหน้าทั้งหมดออก (หน้า 14)',
  },
  exitGate: {
    survivor: 'Open: ได้เฉพาะเมื่อซ่อม Generator ครบ 4 เครื่อง — ทอย Skill Check สำเร็จ +1 ครบ 3 = ประตูเปิด ผู้รอดชีวิตชนะ (หน้า 13)',
    killer: 'ทำลาย Exit Gate ไม่ได้ (หน้า 18)',
  },
  chest: {
    survivor: 'Rummage: นำ Chest ออก แล้วจั่ว item 1 ใบ — ถือได้สูงสุด 1 ใบ (หน้า 12)',
    killer: '—',
  },
  locker: {
    survivor: 'Hide: ซ่อนใน Locker — ถือว่าไม่อยู่บนกระดาน ใช้ perk / item ไม่ได้ ต้องออกก่อนเคลื่อนที่ (หน้า 12)',
    killer: 'Search: Locker ที่มีคน — ผู้รอดชีวิตทอย ล้มเหลว = ถูกอุ้มทันที, สำเร็จ = นำ Locker ออก (หน้า 14)',
  },
  crow: {
    survivor: 'Sprint: ฆาตกร +1 ▲ แล้วผู้รอดชีวิตได้ Bonus Turn (หน้า 12)',
    killer: 'Scout: นำ Crow ออก ได้ +1 ▲ (หน้า 14)',
  },
  pallet: {
    survivor: 'Drop: วาง Pallet บนเส้นทางที่เชื่อมกับห้อง ผู้รอดชีวิตเดินผ่านได้ (หน้า 12)',
    killer: 'เดินผ่าน Pallet = ทำลาย Pallet อยู่ที่เดิม และไม่ได้ Interact เทิร์นนั้น (หน้า 14)',
  },
  hook: {
    survivor: 'Sabotage: วาง Entity บน Hook — ถ้ามีคนถูกแขวน ช่วยลงได้ +1 ▲ แล้วทั้งคู่เดินตามเส้นทางใดก็ได้ (หน้า 13)',
    killer: 'แขวนผู้รอดชีวิตที่อุ้มมา — ทุกตอนเก็บกวาด +1 Sacrifice ต่อคนบน Hook (หน้า 15)',
  },
  totem: {
    survivor: 'Cleanse: ทอย Skill Check สำเร็จ = นำ Hex Totem ออก ได้ +2 ▲ (หน้า 13)',
    killer: 'Venerate: ได้ +2 ▲ (Totem ไม่ถูกนำออก) (หน้า 14)',
  },
  drone: {
    survivor: 'Drone ของ The Skull Merchant (หงายหน้า): ส่งกลับบอร์ดของเขา · ทอย Skill Check ในห้องที่มี Drone หงายหน้า — สำเร็จ ฆาตกร +1 ▲, ล้มเหลว = บาดเจ็บ แล้ว Drone 1 ตัวคว่ำลง',
    killer: 'Eyes in the Sky: เก็บ Drone หงายหน้ากลับขึ้นบอร์ด หรือวาง Drone จากบอร์ดหงายหน้าในห้องของคุณ',
  },
}
