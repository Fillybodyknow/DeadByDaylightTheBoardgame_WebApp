<script setup lang="ts">
import { asset } from '../../src/i18n'
import GameScreen from './components/GameScreen.vue'
import SetupScreen from './components/SetupScreen.vue'
import { game } from './game'
</script>

<template>
  <div class="scene" :style="{ backgroundImage: `url(${asset(game ? 'assets/app/background-img/background_macmillan.webp' : 'assets/app/background-img/background_lobby.webp')})` }" />
  <GameScreen v-if="game" :st="game" />
  <SetupScreen v-else />
</template>

<style>
.scene {
  position: fixed;
  inset: 0;
  z-index: -1;
  background-size: cover;
  background-position: center;
  filter: brightness(0.32) saturate(0.8);
}
body {
  background: var(--bg);
}
</style>
