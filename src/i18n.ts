import { ref, watch } from 'vue'
import type { Bilingual, Lang } from './types'

function readLang(): Lang {
  try {
    return localStorage.getItem('lang') === 'en' ? 'en' : 'th'
  } catch {
    return 'th'
  }
}

export const lang = ref<Lang>(readLang())

watch(lang, (value) => {
  try {
    localStorage.setItem('lang', value)
  } catch {
    // storage unavailable: language just won't persist
  }
})

/** Pick the current language, falling back to the other one when a translation is missing. */
export function tr(text: Partial<Record<keyof Bilingual, string | null>> | null | undefined): string {
  if (!text) return ''
  return text[lang.value] || text.en || text.th || ''
}

/** Resolve a public asset path against Vite's base URL. */
export function asset(path: string | undefined): string {
  return path ? `${import.meta.env.BASE_URL}${path}` : ''
}
