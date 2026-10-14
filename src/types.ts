export type Lang = 'th' | 'en'
export type Bilingual = Record<Lang, string>

export interface Perk {
  name: string
  cost: number
  flavor: Bilingual
  text: Bilingual
  /** The perk card cut from the character board, per language. */
  image?: Partial<Record<Lang, string>>
}

export interface CharacterImages {
  boardEn?: string
  boardTh?: string
  mini?: string
}

export interface Survivor {
  id: string
  name: string
  title: Bilingual
  difficulty: 'easy' | 'hard'
  bloodpoints: { start: number; max: number }
  description: Bilingual
  quote: Bilingual
  perks: Perk[]
  images: CharacterImages
}

export interface KillerToken {
  name: string
  count: number
  image: string
}

export interface Killer {
  id: string
  name: string
  realName: string | null
  difficulty: 'easy' | 'hard'
  bloodpoints: { start: number; max: number }
  description: Bilingual
  extraAction: { cost: number; text: Bilingual } | null
  /** `image` is the POWER panel cut from the board, per language. */
  power: { name: string; text: Bilingual; image?: Partial<Record<Lang, string>> }
  passive: Bilingual | null
  /** The PASSIVE panel cut from the board, per language (absent when there is no passive). */
  passiveImage?: Partial<Record<Lang, string>>
  perks: Perk[]
  tokens: KillerToken[]
  images: CharacterImages
}

export interface Item {
  id: string
  name: Bilingual
  // The source item cards are Portuguese, so there is no English rules text yet.
  text: { th: string; en: string | null; pt: string }
  count: number
  images: { pt?: string; th?: string }
}
