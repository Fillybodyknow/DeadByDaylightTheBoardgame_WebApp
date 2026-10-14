<script setup lang="ts">
import rulesMd from '../../docs/rules-th.md?raw'
import { renderMd } from '../rulesDoc'

const html = renderMd(rulesMd)
</script>

<template>
  <article class="rules card" v-html="html" />
</template>

<style scoped>
.rules :deep(h1),
.rules :deep(h2) {
  color: var(--blood);
  margin-top: 1.5rem;
}
.rules :deep(table) {
  border-collapse: collapse;
  width: 100%;
  display: block;
  overflow-x: auto;
}
.rules :deep(th),
.rules :deep(td) {
  border: 1px solid var(--line);
  padding: 0.35rem 0.6rem;
  text-align: left;
}
.rules :deep(code) {
  background: var(--bg-hover);
  padding: 0 0.3em;
  border-radius: 4px;
}
.rules :deep(pre) {
  overflow-x: auto;
}
</style>
