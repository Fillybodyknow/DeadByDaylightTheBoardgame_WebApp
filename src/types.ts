export type Lang = 'th' | 'en'
export type Bilingual = Record<Lang, string>

export interface Perk {
  name: string
  cost: number
  flavor: Bilingual
  text: Bilingual
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
  power: { name: string; text: Bilingual }
  passive: Bilingual | null
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
