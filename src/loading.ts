import { reactive } from 'vue'
import { survivorById } from './data'
import { lang } from './i18n'

// A short game-style loading screen shown when entering table setup and when the trial starts.
// It shows a quote from a survivor in the game or a rules tip; tap to skip.

export interface LoadingSlide {
  kind: 'quote' | 'tip'
  text: string
  by?: string
  image?: string
}

export const loading = reactive({
  active: false,
  title: '',
  slide: null as LoadingSlide | null,
})

let timer: number | null = null

export function showLoading(title: string, slide: LoadingSlide, ms = 2600) {
  if (timer !== null) clearTimeout(timer)
  loading.title = title
  loading.slide = slide
  loading.active = true
  timer = window.setTimeout(hideLoading, ms)
}

export function hideLoading() {
  if (timer !== null) clearTimeout(timer)
  timer = null
  loading.active = false
}

// Rules tips, all from docs/rules-th.md (rulebook page in brackets).
export const TIPS: string[] = [
  'ผู้รอดชีวิตต้องซ่อมเครื่องปั่นไฟให้เสร็จ 4 เครื่อง ประตูทางออกจึงจะมีไฟ (หน้า 13)',
  'ซ่อมเครื่องปั่นไฟ: สำเร็จได้ +1 สำเร็จยิ่งใหญ่ (5) ได้ +2 ล้มเหลวไม่ได้อะไร (หน้า 12)',
  'ทอยได้หัวกะโหลก (0) = ล้มเหลว และฆาตกรได้ +1 ▲ ทันที (หน้า 16)',
  'ฆาตกรอุ้มผู้รอดชีวิตที่เพิ่งบาดเจ็บในรอบนี้ไม่ได้ (หน้า 15)',
  'Sacrifice Progress ครบ 8 เมื่อไหร่ ฆาตกรชนะทันที (หน้า 11)',
  'ตอน Cleanup ฆาตกรได้ +1 Sacrifice Progress ต่อผู้รอดชีวิตทุกคนที่แขวนอยู่ (หน้า 11)',
  'ผู้รอดชีวิตเดินผ่าน Pallet ได้ แต่ฆาตกรต้องทำลายมันและหยุดอยู่ที่เดิม (หน้า 12, 14)',
  'กำแพงทำลายได้ ผู้รอดชีวิตผ่านไม่ได้ แต่ฆาตกรพังแล้วเดินต่อได้เลย (หน้า 13, 14)',
  'ทาง Vault (สีเหลือง) เดินได้ทางเดียวตามลูกศรเท่านั้น (หน้า 8)',
  'Interact กับ Crow ทำให้ได้ Bonus Turn แต่ฆาตกรได้ +1 ▲ (หน้า 12)',
  'ผู้รอดชีวิตที่ซ่อนในตู้ ถือว่าไม่อยู่บนกระดานสำหรับฆาตกรและ Perk (หน้า 12)',
  'Cleanse Hex Totem สำเร็จ ผู้รอดชีวิตได้ +2 ▲ — ถ้าฆาตกร Venerate ก่อน ฆาตกรได้ +2 ▲ แทน (หน้า 13, 14)',
  'ช่วยผู้รอดชีวิตลงจาก Hook ด้วยการ Sabotage — ผู้ช่วยได้ +1 ▲ (หน้า 13)',
  'Perk แต่ละใบใช้ได้รอบละ 1 ครั้ง แม้จะราคา 0 ▲ (หน้า 16)',
  'ฆาตกรจ่าย 4 ▲ หลังเทิร์นที่ 2 เพื่อเล่นเทิร์นเพิ่มได้ รอบละ 1 ครั้ง (หน้า 10)',
  'ถืออเทมได้ทีละ 1 ใบเท่านั้น (หน้า 12)',
  'ตอนแบกผู้รอดชีวิต ถ้าทอยได้ 5 แม้แต่ลูกเดียว ผู้รอดชีวิตดิ้นหลุด (หน้า 15)',
]

/**
 * A loading slide for a game with these survivors: half the time a quote from one of them,
 * otherwise a rules tip.
 */
export function quoteOrTip(survivorIds: (string | null | undefined)[]): LoadingSlide {
  const withQuote = survivorIds
    .map((id) => (id ? survivorById.get(id) : undefined))
    .filter((c) => !!c && (c.quote.th || c.quote.en))
  if (withQuote.length && Math.random() < 0.5) {
    const c = withQuote[Math.floor(Math.random() * withQuote.length)]!
    const raw = (lang.value === 'th' ? c.quote.th : c.quote.en) || c.quote.en || c.quote.th
    // quotes end with "– Name"; show the name as the attribution instead
    const text = raw.replace(/\s*[–—-]{1,2}\s*[^"”]+$/, '').trim()
    return { kind: 'quote', text, by: c.name, image: c.images.mini }
  }
  return { kind: 'tip', text: TIPS[Math.floor(Math.random() * TIPS.length)] }
}
