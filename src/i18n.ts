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

/**
 * A public asset as a CSS url() to pass in a custom property (--art: …). The built base is
 * relative ('./'), and a relative url() given through a custom property resolves against the
 * stylesheet that uses it — the bundled CSS in assets/ — not the page: so it is made absolute here.
 */
export function cssUrl(path: string): string {
  return `url("${new URL(asset(path), document.baseURI).href}")`
}
