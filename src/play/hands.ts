// How many hands of cards are out to pick from (CardHand). Online, the player's own hand rests
// at the foot of the screen to look at whenever none is (GameScreen's passive hand).

import { ref } from 'vue'

export const openHands = ref(0)

/**
 * The width of the stretch a hand may take (settings: handPlace 'auto' or 'map'), measured
 * by GameScreen; null when the hand floats in the corner. A hand wider than that has its cards
 * narrowed to fit.
 */
export const handZone = ref<number | null>(null)
