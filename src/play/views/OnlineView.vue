<script setup lang="ts">
// Online: each player on their own device. No room yet → create or join one; in a room → its
// lobby and character picks, then the shared game.
import GameScreen from '../components/GameScreen.vue'
import OnlineEntry from '../components/OnlineEntry.vue'
import OnlineRoom from '../components/OnlineRoom.vue'
import TrialIntro from '../components/TrialIntro.vue'
import { game } from '../game'
import { session } from '../online/session'
</script>

<template>
  <template v-if="session.data">
    <template v-if="session.data.game && game">
      <GameScreen :st="game" />
      <TrialIntro :st="game" />
    </template>
    <OnlineRoom v-else />
  </template>
  <OnlineEntry v-else />
</template>
