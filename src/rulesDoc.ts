import { marked } from 'marked'
import rulesMd from '../docs/rules-th.md?raw'

export interface RulesSection {
  /** Section number from the "## N. title" heading, or 0 for the preamble. */
  num: number
  title: string
  body: string
}

// Split docs/rules-th.md on its "## " headings.
export const rulesSections: RulesSection[] = rulesMd
  .split(/^## /m)
  .slice(1)
  .map((chunk) => {
    const [heading, ...rest] = chunk.split('\n')
    const m = /^(\d+)\.\s*(.*)$/.exec(heading.trim())
    return { num: m ? Number(m[1]) : 0, title: m ? m[2] : heading.trim(), body: rest.join('\n').replace(/\n---\s*$/m, '').trim() }
  })

// The doc is our own file, so rendering it as HTML is safe.
export function renderMd(md: string): string {
  return marked.parse(md, { async: false })
}

/**
 * Lines of the rules that mention the query, grouped by section. Table rows and bullets
 * are kept whole so each hit reads on its own.
 */
export function searchRules(query: string): { section: RulesSection; lines: string[] }[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  return rulesSections
    .map((section) => ({
      section,
      lines: section.body
        .split('\n')
        .filter((l) => l.trim() && !/^\|[-\s|]+\|$/.test(l.trim()) && l.toLowerCase().includes(q)),
    }))
    .filter((r) => r.lines.length || r.section.title.toLowerCase().includes(q))
}
