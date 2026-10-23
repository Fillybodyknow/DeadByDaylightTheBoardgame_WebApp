// Running a tutorial chapter: its scene in the game store (never saved), the step the guide is
// on, what the learner may do, and the moves of everyone else (played after a short pause, so the
// learner sees them happen).

import { reactive, watch } from 'vue'
import { sfx } from '../../sound'
import type { Action, GameState } from '../engine/types'
import { dispatch, game, leaveTutorial, playTutorial, tutorial } from '../game'
import { SEEN, firstTime, gameKey } from '../intro'
import { CHAPTERS } from './chapters'
import { learnersTurn, plainest } from './policy'
import type { Chapter, Step } from './types'

export const run = reactive({
  chapter: null as Chapter | null,
  /** The step the guide is on. */
  index: 0,
  /** Every step done: the chapter's end card shows. */
  finished: false,
  /** Said for a moment when the learner tries something the step doesn't ask for. */
  nudge: '',
  /**
   * Counts the scenes put on screen: the game screen starts afresh with each (it would otherwise
   * try to animate one unrelated game into the next).
   */
  scene: 0,
})

const DONE_KEY = 'dbdl-tutorial-done'

/** Chapters finished on this device. */
export function doneChapters(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

function markDone(id: string) {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify([...new Set([...doneChapters(), id])]))
  } catch {
    // storage blocked: the tick just isn't remembered
  }
}

export const currentStep = (): Step | null => run.chapter?.steps[run.index] ?? null

let nudgeTimer: number | undefined
function nudge(text: string) {
  run.nudge = text
  sfx.click()
  clearTimeout(nudgeTimer)
  nudgeTimer = window.setTimeout(() => (run.nudge = ''), 3500)
}

/** Set while the tutorial plays someone else's move: only then does a move that isn't the learner's go. */
let autoActing = false

function allow(st: GameState, a: Action): boolean {
  if (!learnersTurn(st)) {
    if (!autoActing) nudge('ตอนนี้เป็นตาของคนอื่น — รอสักครู่')
    return autoActing
  }
  const step = currentStep()
  if (run.finished || !step) return false
  if (step.quiz) {
    nudge('ตอบคำถามของข้าก่อน')
    return false
  }
  if (!step.task) {
    nudge('อ่านคำแนะนำให้จบก่อน แล้วกด "ถัดไป"')
    return false
  }
  if (step.task.allow(st, a)) return true
  nudge(step.task.hint)
  return false
}

export function startChapter(id: string) {
  const chapter = CHAPTERS.find((c) => c.id === id)
  if (!chapter) return
  const built = chapter.build()
  const st = chapter.steps[0]?.setup?.(built) ?? built
  // the start-room rolls are the real game's opening, not a lesson's
  firstTime(SEEN, gameKey(st))
  Object.assign(run, { chapter, index: 0, finished: false, nudge: '', scene: run.scene + 1 })
  tutorial.value = { allow }
  playTutorial(st)
}

export function exitChapter() {
  clearTimeout(autoTimer)
  Object.assign(run, { chapter: null, index: 0, finished: false, nudge: '' })
  leaveTutorial()
}

/** The guide's "next" (a step with nothing to do on the board). */
export function nextStep() {
  if (!run.chapter || currentStep()?.task || currentStep()?.quiz) return
  sfx.click()
  advance()
}

function advance() {
  if (!run.chapter) return
  run.index++
  if (run.index >= run.chapter.steps.length) {
    run.index = run.chapter.steps.length - 1
    run.finished = true
    markDone(run.chapter.id)
    sfx.select()
    return
  }
  // the lesson moves on in time: the step's own scene
  const step = currentStep()
  if (step?.setup && game.value) {
    const next = step.setup(game.value)
    firstTime(SEEN, gameKey(next))
    run.scene++
    playTutorial(next)
  }
  // a task the board already shows done (the learner went ahead) is passed by
  const st = game.value
  if (st && step?.task?.done(st)) return advance()
  // a step that has the others play (a task) starts them again: the game may not change by itself
  pump()
}

/** An answer to the step's question: the right one goes on, a wrong one is told why. */
export function answerQuiz(i: number) {
  const q = currentStep()?.quiz
  if (!q) return
  if (i !== q.answer) return nudge(q.why)
  sfx.select()
  advance()
}

// ---------- everyone else: the tutorial's own moves ----------

let autoTimer: number | undefined

/**
 * After every change of the game, and every move of the guide to a new step: the step done? and is
 * it someone else's move (made after a short pause)?
 */
function pump() {
  const st = game.value
  clearTimeout(autoTimer)
  if (!run.chapter || !st || !tutorial.value) return
  // the learner did what the step asked
  const step = currentStep()
  if (!run.finished && step?.task?.done(st)) advance()
  // while The Entity explains (or the chapter is over), everyone else holds still
  if (run.finished || !currentStep()?.task) return
  if (learnersTurn(st) || st.step.t === 'gameOver' || st.step.t === 'idle') return
  const chapter = run.chapter
  autoTimer = window.setTimeout(() => {
    const cur = game.value
    if (!cur || run.chapter !== chapter || learnersTurn(cur)) return
    const a = chapter.auto?.(cur) ?? plainest(cur)
    if (!a) return
    autoActing = true
    try {
      // a move the engine refuses would leave the lesson waiting for nothing: say so
      if (!dispatch(a)) console.warn('tutorial: the engine refused a move of the tutorial', a, cur.step)
    } finally {
      autoActing = false
    }
  }, 900)
}

watch(game, pump)
