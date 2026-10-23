// A tutorial chapter: a scene on the real board (built from the engine), and the steps the guide
// (The Entity) walks the learner through. The learner plays one survivor; everyone else is played
// by the tutorial (runner.ts).

import type { Action, GameState } from '../engine/types'

/** What the guide points at on screen. */
export interface Spot {
  room?: string
  prop?: string
  path?: string
  /** Any element, by CSS selector (the side panel, the player column…). */
  el?: string
}

export interface Step {
  /** What The Entity says. `**words**` are key words, lit. */
  say: string
  /** Pictures beside the words (asset paths): cards, props, dice… */
  pics?: string[]
  /** A new scene as the step begins (the lesson moves on in time), made from the one on screen. */
  setup?(st: GameState): GameState
  /** A question: the learner picks an option, and only the right one goes on (`why` when wrong). */
  quiz?: { options: string[]; answer: number; why: string }
  /** Where to look; a function for a spot that depends on the scene. */
  spot?: Spot | ((st: GameState) => Spot)
  /**
   * Something the learner does on the board. Only actions `allow` lets through go (the hint says
   * what to do instead); the step is over once `done` holds.
   */
  task?: {
    allow(st: GameState, a: Action): boolean
    done(st: GameState): boolean
    /** Said when the learner tries something else. */
    hint: string
  }
}

export interface Chapter {
  id: string
  title: string
  /** One line on the chapter's card. */
  blurb: string
  /** The card's picture. */
  image: string
  build(): GameState
  steps: Step[]
  /** The tutorial's own move for a step that isn't the learner's (default: the plainest one). */
  auto?(st: GameState): Action | null
}

/** The survivor the learner plays. */
export const LEARNER = 0
