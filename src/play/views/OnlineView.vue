<script setup lang="ts">
// Online: each player on their own device. No room yet → create or join one; in a room → its
// lobby and character picks, then the shared game.
import { ref, watch } from 'vue'
import GameScreen from '../components/GameScreen.vue'
import TrialLoading from '../components/TrialLoading.vue'
import TrialFade from '../components/TrialFade.vue'
import { introStage } from '../intro'
import MatchBeat from '../components/MatchBeat.vue'
import OnlineEntry from '../components/OnlineEntry.vue'
import OnlineRoom from '../components/OnlineRoom.vue'
import { game } from '../game'
import { finishedGame, session } from '../online/session'

/**
 * Everyone is ready and the killer started: first the beat — the alarm and the heartbeat over the
 * page as it was (`MatchBeat`) — then the loading page (`TrialLoading`), then the game. Only for a
 * game that starts while this view is open, not one joined or reloaded.
 */
const intro = introStage
const introAt = ref(0)
/** The game just opened from the loading page: it comes in out of the black (`TrialFade`). */
const fadeIn = ref(false)
function loaded() {
  intro.value = null
  fadeIn.value = true
}
watch(
  () => !!session.data?.game,
  (on, was) => {
    if (on && !was) {
      introAt.value = Date.now()
      intro.value = 'beat'
    }
    if (!on) intro.value = null
  },
)
</script>

<template>
  <!-- one root that stays: the app's page transition animates it once, not each swap inside (a
       swapping root is left stuck in its entering state, invisible). display: contents keeps the
       layout as if it weren't there. -->
  <div class="online-view">
    <template v-if="session.data">
      <TrialLoading v-if="session.data.game && game && intro === 'loading'" :st="game" @done="loaded" />
      <!-- during the beat the room stays on screen, under it; a finished game's summary stays on
           this device until its player goes back, though the room is in its lobby again -->
      <template v-else-if="(session.data.game || finishedGame) && game && intro !== 'beat'">
        <GameScreen :st="game" />
      </template>
      <OnlineRoom v-else />
    </template>
    <OnlineEntry v-else />
    <MatchBeat v-if="intro === 'beat'" :since="introAt" @done="intro = 'loading'" />
    <TrialFade v-if="fadeIn" @done="fadeIn = false" />
  </div>
</template>

<style scoped>
.online-view {
  display: contents;
}
</style>
