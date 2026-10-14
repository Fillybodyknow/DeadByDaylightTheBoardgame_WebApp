// Numeric rules from the official rulebook (page numbers in comments).
// See docs/rules-th.md for the full Thai reference.

export const SURVIVOR_COUNT = 4 // p.19: always 4 survivors regardless of player count
export const GENERATORS_TO_POWER_GATES = 4 // p.13
export const GENERATOR_PROGRESS_MAX = 3 // p.12
export const EXIT_GATE_COUNT = 2 // p.3
export const EXIT_GATE_PROGRESS_TO_OPEN = 3 // p.13
export const SACRIFICE_TRACK_LENGTH = 8 // p.11
export const KILLER_BONUS_TURN_COST = 4 // p.10: only after the 2nd turn, max once per round
export const PICKUP_DICE_MAX = 4 // p.15

export type Phase = 'planning' | 'survivors' | 'killer' | 'cleanup'
export const PHASES: Phase[] = ['planning', 'survivors', 'killer', 'cleanup'] // p.8

export type SkillResult = 'fail' | 'success' | 'great'

/** Skill check die faces 0–5 (p.16): 0 = failure, 1–4 = success, 5 = great success. */
export function skillResult(face: number): SkillResult {
  if (face === 0) return 'fail'
  return face === 5 ? 'great' : 'success'
}

// Face order matches the cropped images public/assets/dice/skill-1..6.webp.
export const SKILL_DIE_IMAGE_FACES = [2, 4, 5, 1, 3, 0]

// Danger die (p.16): 4 failure faces, 2 great-success faces.
// Image order matches public/assets/dice/danger-1..6.webp.
export const DANGER_DIE_FACES: SkillResult[] = ['great', 'fail', 'great', 'fail', 'fail', 'fail']

/** Generator repair progress for a skill check result (p.12). */
export const REPAIR_PROGRESS: Record<SkillResult, number> = { fail: 0, success: 1, great: 2 }
