<script setup lang="ts">
// The Bloodpoint token, inline with text where "▲" would stand. Sized to the text around it.
import { asset } from '../i18n'
</script>

<template>
  <img class="bp-icon" :src="asset('assets/tokens/bloodpoint.webp')" alt="▲" title="Bloodpoint" draggable="false" />
</template>

<style scoped>
.bp-icon {
  display: inline-block;
  width: 1.05em;
  height: 1.05em;
  margin: 0 0.06em;
  vertical-align: -0.17em;
  object-fit: contain;
  filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.6));
}
</style>
