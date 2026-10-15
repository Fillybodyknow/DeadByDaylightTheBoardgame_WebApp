// The perks the engine implements: the printed perks (Adept mode, p.19) of the rulebook's
// automated-mode cast (p.20–23: The Trapper, The Nurse, The Huntress, The Hillbilly, Dwight,
// Meg, Jake, Claudette), plus The Doctor, The Hag, The Wraith, Feng Min, Ace and Nea. Names and costs match src/data; the rules
// text is shown from there by the UI.

export type PerkId =
  // killers
  | 'brutal_strength'
  | 'unnerving_presence'
  | 'agitation'
  | 'stridor'
  | 'thanatophobia'
  | 'nurses_calling'
  | 'huntress_lullaby'
  | 'beast_of_prey'
  | 'territorial_imperative'
  | 'lightborn'
  | 'enduring'
  | 'tinkerer'
  | 'monitor_and_abuse'
  | 'overcharge'
  | 'overwhelming_presence'
  | 'the_third_seal'
  | 'devour_hope'
  | 'ruin'
  | 'shadowborn'
  | 'bloodhound'
  | 'predator'
  // survivors
  | 'prove_thyself'
  | 'leader'
  | 'bond'
  | 'sprint_burst'
  | 'adrenaline'
  | 'quick_and_quiet'
  | 'iron_will'
  | 'calm_spirit'
  | 'saboteur'
  | 'botany_knowledge'
  | 'empathy'
  | 'self_care'
  | 'lithe'
  | 'alert'
  | 'technician'
  | 'open_handed'
  | 'ace_in_the_hole'
  | 'up_the_ante'
  | 'balanced_landing'
  | 'urban_evasion'
  | 'streetwise'

export interface PerkDef {
  id: PerkId
  name: string
  cost: number
  side: 'killer' | 'survivor'
  /** Character whose board prints it, and its position there (0–2), to find its text. */
  character: string
  index: number
  /** Thai: when the game asks / where the button is. */
  when: string
}

const def = (id: PerkId, name: string, cost: number, side: PerkDef['side'], character: string, index: number, when: string): PerkDef => ({
  id,
  name,
  cost,
  side,
  character,
  index,
  when,
})

export const PERKS: Record<PerkId, PerkDef> = {
  brutal_strength: def('brutal_strength', 'Brutal Strength', 1, 'killer', 'trapper', 0, 'ถามหลังโจมตีผู้รอดชีวิตที่ไม่บาดเจ็บ'),
  unnerving_presence: def('unnerving_presence', 'Unnerving Presence', 1, 'killer', 'trapper', 1, 'ถามก่อนผู้รอดชีวิตในห้อง/ห้องติดกันทอย Skill Check'),
  agitation: def('agitation', 'Agitation', 1, 'killer', 'trapper', 2, 'ถามหลังโจมตีผู้รอดชีวิตที่ไม่บาดเจ็บ'),
  stridor: def('stridor', 'Stridor', 1, 'killer', 'nurse', 0, 'ถามตอนเริ่มเฟสวางแผน'),
  thanatophobia: def('thanatophobia', 'Thanatophobia', 1, 'killer', 'nurse', 1, 'ถามก่อนผู้รอดชีวิตที่บาดเจ็บทอย Skill Check'),
  nurses_calling: def('nurses_calling', "A Nurse's Calling", 0, 'killer', 'nurse', 2, 'ทำงานเองเมื่อผู้รอดชีวิตหายบาดเจ็บ'),
  huntress_lullaby: def('huntress_lullaby', 'Huntress Lullaby', 2, 'killer', 'huntress', 0, 'ถามเมื่อผู้รอดชีวิตจะเดินด้วยการ์ด'),
  beast_of_prey: def('beast_of_prey', 'Beast of Prey', 1, 'killer', 'huntress', 1, 'ถามตอนเริ่มเฟสวางแผน'),
  territorial_imperative: def('territorial_imperative', 'Territorial Imperative', 2, 'killer', 'huntress', 2, 'ถามหลัง Interact'),
  lightborn: def('lightborn', 'Lightborn', 0, 'killer', 'hillbilly', 0, 'ถามตอนจบเฟสวางแผน'),
  enduring: def('enduring', 'Enduring', 2, 'killer', 'hillbilly', 1, 'ถามเมื่อจะเดินผ่าน Pallet'),
  tinkerer: def('tinkerer', 'Tinkerer', 0, 'killer', 'hillbilly', 2, 'ถามเมื่อ Generator ซ่อมเสร็จ (เลือกลับ)'),
  prove_thyself: def('prove_thyself', 'Prove Thyself', 1, 'survivor', 'dwight', 0, 'ปุ่มตอน Interact ในเทิร์นตัวเอง'),
  leader: def('leader', 'Leader', 1, 'survivor', 'dwight', 1, 'ถามหลังเดินด้วยการ์ด (ตัวเองหรือคนในห้อง)'),
  bond: def('bond', 'Bond', 1, 'survivor', 'dwight', 2, 'ถามก่อนผู้รอดชีวิตอื่นในห้อง/ห้องติดกันทอย Skill Check'),
  sprint_burst: def('sprint_burst', 'Sprint Burst', 1, 'survivor', 'meg', 0, 'ถามหลังเดินด้วยการ์ด'),
  adrenaline: def('adrenaline', 'Adrenaline', 2, 'survivor', 'meg', 1, 'ถามตอนเริ่มเก็บกวาด ถ้ารอบนี้ซ่อม Generator เสร็จ'),
  quick_and_quiet: def('quick_and_quiet', 'Quick & Quiet', 1, 'survivor', 'meg', 2, 'ถามเมื่อฆาตกรเข้าห้องของคุณ'),
  iron_will: def('iron_will', 'Iron Will', 1, 'survivor', 'jake', 0, 'ปุ่มตอนผลทอยล้มเหลว'),
  calm_spirit: def('calm_spirit', 'Calm Spirit', 0, 'survivor', 'jake', 1, 'เป็น Interaction กับ Crow'),
  saboteur: def('saboteur', 'Saboteur', 0, 'survivor', 'jake', 2, 'ถามหลัง Sabotage Hook'),
  botany_knowledge: def('botany_knowledge', 'Botany Knowledge', 1, 'survivor', 'claudette', 0, 'ปุ่มตอนเริ่มเทิร์น หรือก่อน Interact'),
  empathy: def('empathy', 'Empathy', 0, 'survivor', 'claudette', 1, 'ปุ่มตอนเริ่มเทิร์น'),
  self_care: def('self_care', 'Self-Care', 1, 'survivor', 'claudette', 2, 'ปุ่มตอนเริ่มเทิร์น'),
  monitor_and_abuse: def('monitor_and_abuse', 'Monitor & Abuse', 0, 'killer', 'doctor', 0, 'ทำงานเองตอนจบเก็บกวาด ถ้าไม่มีใครอยู่บน Hook'),
  overcharge: def('overcharge', 'Overcharge', 2, 'killer', 'doctor', 1, 'ถามหลังทำลาย Generator'),
  overwhelming_presence: def('overwhelming_presence', 'Overwhelming Presence', 1, 'killer', 'doctor', 2, 'ถามเมื่อผู้รอดชีวิตในห้อง/ห้องติดกันใช้ item'),
  the_third_seal: def('the_third_seal', 'The Third Seal', 3, 'killer', 'hag', 0, 'ถามตอนเริ่มเฟสวางแผน'),
  devour_hope: def('devour_hope', 'Devour Hope', 1, 'killer', 'hag', 1, 'ถามตอนเริ่มเก็บกวาด ถ้ารอบนี้ซ่อม Generator เสร็จ'),
  ruin: def('ruin', 'Ruin', 1, 'killer', 'hag', 2, 'ถามตอนเริ่มเฟสวางแผน'),
  shadowborn: def('shadowborn', 'Shadowborn', 2, 'killer', 'wraith', 0, 'ถามตอนจบเฟสวางแผน'),
  bloodhound: def('bloodhound', 'Bloodhound', 0, 'killer', 'wraith', 1, 'ทำงานเองเมื่อแขวนผู้รอดชีวิต'),
  predator: def('predator', 'Predator', 2, 'killer', 'wraith', 2, 'ถามตอนจบเฟสวางแผน'),
  lithe: def('lithe', 'Lithe', 0, 'survivor', 'feng', 0, 'ถามหลังเดินผ่าน Pallet หรือออกจากห้องที่มี Pallet'),
  alert: def('alert', 'Alert', 1, 'survivor', 'feng', 1, 'ถามเมื่อฆาตกรทุบ Pallet / กำแพง หรือทำลาย Generator'),
  technician: def('technician', 'Technician', 0, 'survivor', 'feng', 2, 'ถามเมื่อซ่อม Generator แล้วทอยพลาด'),
  open_handed: def('open_handed', 'Open-Handed', 1, 'survivor', 'ace', 0, 'ถามตอนเริ่มเทิร์นของผู้รอดชีวิตทุกคน'),
  ace_in_the_hole: def('ace_in_the_hole', 'Ace in the Hole', 1, 'survivor', 'ace', 1, 'ปุ่มก่อน Interact ในเทิร์นตัวเอง'),
  up_the_ante: def('up_the_ante', 'Up the Ante', 2, 'survivor', 'ace', 2, 'ถามตอนจบเทิร์นตัวเอง'),
  balanced_landing: def('balanced_landing', 'Balanced Landing', 0, 'survivor', 'nea', 0, 'ปุ่มแทนการ Interact ในเทิร์นตัวเอง'),
  urban_evasion: def('urban_evasion', 'Urban Evasion', 1, 'survivor', 'nea', 1, 'ถามตอนเริ่มเทิร์นของผู้รอดชีวิตทุกคน'),
  streetwise: def('streetwise', 'Streetwise', 1, 'survivor', 'nea', 2, 'ถามหลังค้น Chest'),
}

/** Printed perks by character (Adept mode). Characters not listed play without perks for now. */
export const PRINTED_PERKS: Record<string, PerkId[]> = Object.values(PERKS).reduce<Record<string, PerkId[]>>((out, p) => {
  ;(out[p.character] ??= [])[p.index] = p.id
  return out
}, {})

/** Killers the full game can play (their power is implemented). */
export const PLAYABLE_KILLERS = ['trapper', 'nurse', 'huntress', 'hillbilly', 'doctor', 'hag', 'wraith']
