// The perks the engine implements: the printed perks (Adept mode, p.19) of the rulebook's
// automated-mode cast (p.20–23: The Trapper, The Nurse, The Huntress, The Hillbilly, Dwight,
// Meg, Jake, Claudette), plus The Doctor, The Hag, The Wraith, The Oni, The Deathslinger, The Twins,
// The Blight, Feng Min, Ace, Nea, Yui, Zarina, Élodie and Felix. Names and costs match src/data; the rules
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
  | 'blood_echo'
  | 'zanshin_tactics'
  | 'nemesis'
  | 'gearhead'
  | 'retribution'
  | 'dead_mans_switch'
  | 'coup_de_grace'
  | 'hoarder'
  | 'oppression'
  | 'blood_favour'
  | 'dragons_grip'
  | 'undying'
  | 'rancor'
  | 'mad_grit'
  | 'discordance'
  | 'iron_maiden'
  | 'haunted_ground'
  | 'spirit_fury'
  | 'no_way_out'
  | 'crowd_control'
  | 'starstruck'
  | 'dark_devotion'
  | 'corrupt_intervention'
  | 'infectious_fright'
  | 'coulrophobia'
  | 'bamboozle'
  | 'pop_goes_the_weasel'
  | 'face_the_darkness'
  | 'nowhere_to_hide'
  | 'hubris'
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
  | 'breakout'
  | 'lucky_break'
  | 'any_means_necessary'
  | 'red_herring'
  | 'for_the_people'
  | 'off_the_record'
  | 'power_struggle'
  | 'fast_track'
  | 'smash_hit'
  | 'self_preservation'
  | 'diversion'
  | 'autodidact'
  | 'deliverance'
  | 'appraisal'
  | 'deception'
  | 'desperate_measures'
  | 'visionary'
  | 'built_to_last'
  | 'poised'
  | 'solidarity'
  | 'head_on'
  | 'windows_of_opportunity'
  | 'boil_over'
  | 'dance_with_me'
  | 'no_mither'
  | 'dead_hard'
  | 'wgl_forever'
  | 'breakdown'
  | 'aftercare'
  | 'distortion'
  // cards only, on no character's board (the edit-perks mode)
  | 'hope'
  | 'kindred'
  | 'small_game'
  | 'this_is_not_happening'
  | 'resilience'
  | 'well_make_it'
  | 'renewal'
  | 'monstrous_shrine'
  | 'spies_from_the_shadows'
  | 'sloppy_butcher'
  | 'no_one_escapes_death'
  | 'inner_healing'
  | 'situational_awareness'
  | 'kinship'
  | 'guardian'
  | 'dark_sense'
  | 'deja_vu'
  | 'premonition'
  | 'spine_chill'
  | 'lightweight'
  | 'bitter_murmur'
  | 'claustrophobia'
  | 'distressing'
  | 'unrelenting'
  | 'iron_grasp'
  | 'insidious'
  | 'whispers'

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
  /**
   * Perks that are only cards, printed on no character board (the edit-perks mode): the card's
   * id in `src/data/editPerks.json`, where its name, cost and text come from instead.
   */
  card?: string
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

/** A perk that is only a card in the box (the edit-perks mode), on no character's board. */
const deck = (id: PerkId, name: string, cost: number, side: PerkDef['side'], card: string, when: string): PerkDef => ({
  id,
  name,
  cost,
  side,
  character: '',
  index: -1,
  when,
  card,
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
  blood_echo: def('blood_echo', 'Blood Echo', 2, 'killer', 'oni', 0, 'ถามหลังแขวนผู้รอดชีวิต'),
  zanshin_tactics: def('zanshin_tactics', 'Zanshin Tactics', 2, 'killer', 'oni', 1, 'ถามตอนเริ่มเทิร์นฆาตกร ก่อนเปิดการ์ด'),
  nemesis: def('nemesis', 'Nemesis', 2, 'killer', 'oni', 2, 'ถามหลังผู้รอดชีวิตทิ้ง Pallet / ซ่อนใน Locker ใกล้คุณ'),
  gearhead: def('gearhead', 'Gearhead', 1, 'killer', 'deathslinger', 0, 'ถามหลังทำลาย Generator'),
  retribution: def('retribution', 'Retribution', 0, 'killer', 'deathslinger', 1, 'ถามก่อนผู้รอดชีวิตทอยชำระ Hex Totem'),
  dead_mans_switch: def('dead_mans_switch', "Dead Man's Switch", 1, 'killer', 'deathslinger', 2, 'ถามหลังแขวนผู้รอดชีวิต'),
  breakout: def('breakout', 'Breakout', 1, 'survivor', 'yui', 0, 'ปุ่มตอนเริ่มเทิร์น'),
  lucky_break: def('lucky_break', 'Lucky Break', 2, 'survivor', 'yui', 1, 'ถามเมื่อมีคนทอยได้สำเร็จอย่างยิ่ง ขณะคุณบาดเจ็บ'),
  any_means_necessary: def('any_means_necessary', 'Any Means Necessary', 0, 'survivor', 'yui', 2, 'ถามตอนจบเทิร์นตัวเอง ถ้าไม่บาดเจ็บ'),
  red_herring: def('red_herring', 'Red Herring', 2, 'survivor', 'zarina', 0, 'ถามเมื่อฆาตกรจะโจมตี / อุ้มคนในห้องคุณ'),
  for_the_people: def('for_the_people', 'For the People', 1, 'survivor', 'zarina', 1, 'ถามหลังคุณเข้าห้อง ถ้าไม่บาดเจ็บ'),
  off_the_record: def('off_the_record', 'Off the Record', 0, 'survivor', 'zarina', 2, 'ถามเมื่อคนในห้อง/ห้องติดกันทอยล้มเหลว'),
  coup_de_grace: def('coup_de_grace', 'Coup de Grâce', 2, 'killer', 'twins', 0, 'ถามตอนจบเทิร์นฆาตกร (ถ้ายังไม่ได้ใช้ Bonus Turn รอบนี้)'),
  hoarder: def('hoarder', 'Hoarder', 0, 'killer', 'twins', 1, 'เป็น Interaction กับ Chest ในห้อง'),
  oppression: def('oppression', 'Oppression', 2, 'killer', 'twins', 2, 'ถามหลังทำลาย Generator'),
  blood_favour: def('blood_favour', 'Blood Favour', 0, 'killer', 'blight', 0, 'ทำงานเองตอนเริ่มเก็บกวาด ถ้าทุกคนบาดเจ็บและไม่มีใครบน Hook'),
  dragons_grip: def('dragons_grip', "Dragon's Grip", 1, 'killer', 'blight', 1, 'ถามหลังทำลาย Generator'),
  undying: def('undying', 'Undying', 1, 'killer', 'blight', 2, 'เป็น Interaction: ทิ้งการ์ดแล้ว Interact กับ prop ในห้องที่เชื่อมด้วยเส้นทางสีนั้น'),
  mad_grit: def('mad_grit', 'Mad Grit', 0, 'killer', 'legion', 0, 'ถามเมื่อแบกผู้รอดชีวิตเข้าห้องที่มีผู้รอดชีวิตอีกคน'),
  discordance: def('discordance', 'Discordance', 0, 'killer', 'legion', 1, 'ถามเมื่อผู้รอดชีวิตเข้าห้องที่มีผู้รอดชีวิตอีกคน'),
  iron_maiden: def('iron_maiden', 'Iron Maiden', 2, 'killer', 'legion', 2, 'ปุ่มก่อน Interact: สลับ Locker ว่างกับ Hook ว่าง'),
  no_way_out: def('no_way_out', 'No Way Out', 1, 'killer', 'trickster', 0, 'ถามเมื่อผู้รอดชีวิตที่มี ▲ น้อยกว่าคุณจะ Interact กับ Generator / Exit Gate'),
  crowd_control: def('crowd_control', 'Crowd Control', 1, 'killer', 'trickster', 1, 'ถามตอนเริ่มเฟสวางแผน'),
  starstruck: def('starstruck', 'Starstruck', 2, 'killer', 'trickster', 2, 'ถามเมื่อคุณจะอุ้มผู้รอดชีวิต'),
  dark_devotion: def('dark_devotion', 'Dark Devotion', 2, 'killer', 'plague', 0, 'ถามตอนเริ่มเก็บกวาด'),
  corrupt_intervention: def('corrupt_intervention', 'Corrupt Intervention', 1, 'killer', 'plague', 1, 'ถามตอนเริ่มเฟสวางแผน'),
  infectious_fright: def('infectious_fright', 'Infectious Fright', 1, 'killer', 'plague', 2, 'ถามหลังโจมตีผู้รอดชีวิตที่ไม่บาดเจ็บ'),
  coulrophobia: def('coulrophobia', 'Coulrophobia', 2, 'killer', 'clown', 0, 'ถามเมื่อผู้รอดชีวิตจะเดินด้วยการ์ดเข้าห้องของคุณ'),
  bamboozle: def('bamboozle', 'Bamboozle', 1, 'killer', 'clown', 1, 'ถามตอนเริ่มเฟสวางแผน'),
  pop_goes_the_weasel: def('pop_goes_the_weasel', 'Pop Goes the Weasel', 0, 'killer', 'clown', 2, 'ถามหลังทำให้ผู้รอดชีวิตบาดเจ็บ หรือแขวนบน Hook'),
  face_the_darkness: def('face_the_darkness', 'Face the Darkness', 1, 'killer', 'knight', 0, 'ถามตอนเริ่มเทิร์นฆาตกร ก่อนเปิดการ์ด'),
  nowhere_to_hide: def('nowhere_to_hide', 'Nowhere to Hide', 1, 'killer', 'knight', 1, 'ถามเมื่อคุณค้น Locker ที่มีคนซ่อน'),
  hubris: def('hubris', 'Hubris', 1, 'killer', 'knight', 2, 'ถามเมื่อผู้รอดชีวิตเข้าห้องของคุณ'),
  rancor: def('rancor', 'Rancor', 2, 'killer', 'spirit', 0, 'ถามเมื่อคุณเดินออกจากห้องที่มีผู้รอดชีวิตบาดเจ็บ'),
  haunted_ground: def('haunted_ground', 'Haunted Ground', 1, 'killer', 'spirit', 1, 'ถามหลังผู้รอดชีวิตเปิด prop'),
  spirit_fury: def('spirit_fury', 'Spirit Fury', 0, 'killer', 'spirit', 2, 'ถามหลังคุณทำลาย Pallet'),
  diversion: def('diversion', 'Diversion', 2, 'survivor', 'adam', 0, 'เป็น Interaction กับฆาตกรในห้องเดียวกัน'),
  autodidact: def('autodidact', 'Autodidact', 2, 'survivor', 'adam', 1, 'ปุ่มตอนคนในห้อง/ห้องติดกันทอยได้สำเร็จ'),
  deliverance: def('deliverance', 'Deliverance', 1, 'survivor', 'adam', 2, 'ถามหลังคุณช่วยคนลงจาก Hook หรือถูกช่วยลง'),
  fast_track: def('fast_track', 'Fast Track', 1, 'survivor', 'yunjin', 0, 'ถามตอนจบเทิร์นที่คนอื่นบาดเจ็บ / ถูกแขวน'),
  smash_hit: def('smash_hit', 'Smash Hit', 0, 'survivor', 'yunjin', 1, 'ถามเมื่อฆาตกรทุบ Pallet / กำแพง หรือทำลาย Generator'),
  self_preservation: def('self_preservation', 'Self-Preservation', 1, 'survivor', 'yunjin', 2, 'ถามตอนจบเทิร์นที่คนอื่นบาดเจ็บ / ถูกแขวน'),
  power_struggle: def('power_struggle', 'Power Struggle', 2, 'survivor', 'elodie', 0, 'เป็น Interaction กับฆาตกรในห้องเดียวกัน'),
  appraisal: def('appraisal', 'Appraisal', 2, 'survivor', 'elodie', 1, 'ถามเมื่อผู้รอดชีวิตคนอื่นทิ้ง item'),
  deception: def('deception', 'Deception', 0, 'survivor', 'elodie', 2, 'ถามก่อนเดินในเทิร์นตัวเอง'),
  desperate_measures: def('desperate_measures', 'Desperate Measures', 1, 'survivor', 'felix', 0, 'ถามหลัง Interact ครั้งแรกในเทิร์นตัวเอง'),
  visionary: def('visionary', 'Visionary', 0, 'survivor', 'felix', 1, 'ถามเมื่อจะเปิด prop ตอนเข้าห้อง'),
  built_to_last: def('built_to_last', 'Built to Last', 2, 'survivor', 'felix', 2, 'ถามเมื่อจะทิ้ง item หลังใช้'),
  poised: def('poised', 'Poised', 1, 'survivor', 'jane', 0, 'ถามเมื่อผู้รอดชีวิตทอย Skill Check ได้สำเร็จอย่างยิ่งในเทิร์นผู้รอดชีวิต'),
  solidarity: def('solidarity', 'Solidarity', 1, 'survivor', 'jane', 1, 'ปุ่มแทนการ Interact: รักษาผู้รอดชีวิตในห้องที่เชื่อมกัน'),
  windows_of_opportunity: def('windows_of_opportunity', 'Windows of Opportunity', 1, 'survivor', 'kate', 0, 'ปุ่มแทนการ Interact: prop สีน้ำเงิน / เขียวในห้องที่เชื่อมกัน'),
  boil_over: def('boil_over', 'Boil Over', 2, 'survivor', 'kate', 1, 'ถามหลังฆาตกรเลือกจำนวนเต๋าตอนอุ้มคุณหรือคนในห้องคุณ'),
  dance_with_me: def('dance_with_me', 'Dance With Me', 0, 'survivor', 'kate', 2, 'ถามหลังเดินด้วยการ์ด ถ้าเริ่มเทิร์นใน Locker'),
  no_mither: def('no_mither', 'No Mither', 1, 'survivor', 'david', 0, 'ถามเมื่อฆาตกรจะโจมตีผู้รอดชีวิตที่ไม่บาดเจ็บในห้องคุณ'),
  dead_hard: def('dead_hard', 'Dead Hard', 2, 'survivor', 'david', 1, 'ถามเมื่อผู้รอดชีวิตคนอื่นในห้องคุณจะถูกแขวน'),
  breakdown: def('breakdown', 'Breakdown', 1, 'survivor', 'jeff', 0, 'ถามหลังคุณช่วยคนลงจาก Hook หรือถูกช่วยลง'),
  aftercare: def('aftercare', 'Aftercare', 0, 'survivor', 'jeff', 1, 'ถามหลังผู้รอดชีวิตหายบาดเจ็บ'),
  distortion: def('distortion', 'Distortion', 1, 'survivor', 'jeff', 2, 'ถามหลังคุณเดินเข้าห้องฆาตกรในเทิร์นตัวเอง (เดินด้วยวิธีใดก็ได้)'),
  wgl_forever: def('wgl_forever', "We're Gonna Live Forever", 1, 'survivor', 'david', 2, 'ถามเมื่อฆาตกรจะเดินด้วยการ์ดออกจากห้องคุณ'),
  head_on: def('head_on', 'Head On', 1, 'survivor', 'jane', 2, 'ถามเมื่อฆาตกรเข้าห้องของคุณในเทิร์นฆาตกร'),

  // ----- cards only, on no character's board (the edit-perks mode) -----
  hope: deck('hope', 'Hope', 0, 'survivor', 'hope', 'ทำงานเองเมื่อซ่อม Generator เสร็จ'),
  kindred: deck('kindred', 'Kindred', 0, 'survivor', 'kindred', 'ทำงานเองหลัง Sabotage Hook (ของคุณหรือ Hook ที่คุณอยู่)'),
  small_game: deck('small_game', 'Small Game', 1, 'survivor', 'small-game', 'ถามหลังคุณชำระ Hex Totem สำเร็จ'),
  this_is_not_happening: deck('this_is_not_happening', 'This Is Not Happening', 1, 'survivor', 'this-is-not-happening', 'ถามก่อนคุณทอย Skill Check'),
  resilience: deck('resilience', 'Resilience', 2, 'survivor', 'resilience', 'ถามตอนเริ่มเก็บกวาด ถ้าคุณบาดเจ็บในรอบนี้'),
  well_make_it: deck('well_make_it', "We'll Make It", 2, 'survivor', 'well-make-it', 'ถามหลังคุณรักษาผู้รอดชีวิตคนอื่นสำเร็จ'),
  renewal: deck('renewal', 'Renewal', 2, 'survivor', 'renewal', 'ถามตอนจบเทิร์น ถ้ารอบนี้คุณรักษาคนอื่นหรือถูกรักษา'),
  monstrous_shrine: deck('monstrous_shrine', 'Monstrous Shrine', 0, 'killer', 'monstrous-shrine', 'ทำงานเองหลังแขวนผู้รอดชีวิต ถ้าไม่มีใครอื่นในห้อง'),
  spies_from_the_shadows: deck('spies_from_the_shadows', 'Spies from the Shadows', 0, 'killer', 'spies-from-the-shadows', 'ทำงานเองเมื่อมีการเปิด Crow'),
  sloppy_butcher: deck('sloppy_butcher', 'Sloppy Butcher', 1, 'killer', 'sloppy-butcher', 'ถามก่อนผู้รอดชีวิตทอยรักษา'),
  no_one_escapes_death: deck('no_one_escapes_death', 'No One Escapes Death', 0, 'killer', 'no-one-escapes-death', 'ถามตอนจบเทิร์นฆาตกร ถ้าประตูมีไฟแล้ว'),
  // these four are discarded when used, freeing the printed perk they were laid over
  inner_healing: deck('inner_healing', 'Inner Healing', 2, 'survivor', 'inner-healing', 'ปุ่มตอนเริ่มเทิร์นของคุณ ถ้าบาดเจ็บ (ใช้แล้วทิ้งการ์ด)'),
  situational_awareness: deck('situational_awareness', 'Situational Awareness', 1, 'survivor', 'situational-awareness', 'ถามตอนจบเทิร์นของคุณ (ใช้แล้วทิ้งการ์ด)'),
  kinship: deck('kinship', 'Kinship', 1, 'survivor', 'kinship', 'ปุ่มแทนการ Interact: ให้ผู้รอดชีวิตอีกคนเล่น Bonus Turn (ใช้แล้วทิ้งการ์ด)'),
  guardian: deck('guardian', 'Guardian', 1, 'survivor', 'guardian', 'ถามเมื่อฆาตกรเข้าห้องของคุณ (ใช้แล้วทิ้งการ์ด)'),
  dark_sense: deck('dark_sense', 'Dark Sense', 1, 'survivor', 'dark-sense', 'ถามเมื่อคุณเข้าห้องที่ไม่มี prop ในเทิร์นของคุณ'),
  deja_vu: deck('deja_vu', 'Déjà Vu', 2, 'survivor', 'deja-vu', 'ถามเมื่อฆาตกรทำลาย Generator ในห้องอื่น'),
  premonition: deck('premonition', 'Premonition', 1, 'survivor', 'premonition', 'ถามเมื่อฆาตกรเข้าห้องของคุณ ก่อนเขา Interact'),
  spine_chill: deck('spine_chill', 'Spine Chill', 1, 'survivor', 'spine-chill', 'ถามเมื่อฆาตกรเข้าห้องของคุณ'),
  lightweight: deck('lightweight', 'Lightweight', 1, 'survivor', 'lightweight', 'ถามตอนจบเฟสวางแผน'),
  bitter_murmur: deck('bitter_murmur', 'Bitter Murmur', 1, 'killer', 'bitter-murmur', 'ถามหลังเดินผ่านทางเดินทางเดียว (Vault) หรือทุบกำแพง'),
  claustrophobia: deck('claustrophobia', 'Claustrophobia', 1, 'killer', 'claustrophobia', 'ถามหลังผู้รอดชีวิตซ่อม Generator สำเร็จ'),
  distressing: deck('distressing', 'Distressing', 2, 'killer', 'distressing', 'ถามหลังผู้รอดชีวิตเดินเข้าห้องที่มี Locker'),
  unrelenting: deck('unrelenting', 'Unrelenting', 2, 'killer', 'unrelenting', 'ถามหลัง Interact กับผู้รอดชีวิตในห้องของคุณ'),
  iron_grasp: deck('iron_grasp', 'Iron Grasp', 1, 'killer', 'iron-grasp', 'ปุ่มตอนผู้รอดชีวิตทอยหนีการแบก'),
  insidious: deck('insidious', 'Insidious', 2, 'killer', 'insidious', 'ถามเมื่อคุณจะโจมตีผู้ที่ไม่บาดเจ็บ และยังไม่ได้เดินในเทิร์นนี้'),
  whispers: deck('whispers', 'Whispers', 1, 'killer', 'whispers', 'ถามตอนเริ่มเฟสวางแผน'),
}

/**
 * Printed perks by character (Adept mode). Characters not listed play without perks for now;
 * the cards that are on no board at all are left out.
 */
export const PRINTED_PERKS: Record<string, PerkId[]> = Object.values(PERKS).reduce<Record<string, PerkId[]>>((out, p) => {
  if (!p.character) return out
  ;(out[p.character] ??= [])[p.index] = p.id
  return out
}, {})

/** The perks that are only cards: what the edit-perks mode can deal out. */
export const DECK_PERKS: PerkId[] = Object.values(PERKS)
  .filter((p) => p.card)
  .map((p) => p.id)

/** Killers the full game can play (their power is implemented). */
export const PLAYABLE_KILLERS = ['trapper', 'nurse', 'huntress', 'hillbilly', 'doctor', 'hag', 'wraith', 'oni', 'deathslinger', 'twins', 'blight', 'spirit', 'legion', 'trickster', 'plague', 'clown', 'knight']
