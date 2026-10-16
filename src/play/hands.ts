// How many hands of cards are out to pick from (CardHand). Online, the player's own hand rests
// at the foot of the screen to look at whenever none is (GameScreen's passive hand).

import { ref } from 'vue'

export const openHands = ref(0)
