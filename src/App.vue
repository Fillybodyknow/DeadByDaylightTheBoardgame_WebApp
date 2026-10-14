<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { lang } from './i18n'
import { useGameStore } from './stores/game'

const game = useGameStore()
</script>

<template>
  <header class="topbar">
    <RouterLink to="/" class="brand">DBD <span>Companion</span></RouterLink>
    <nav>
      <RouterLink to="/">{{ lang === 'th' ? 'ตั้งค่าเกม' : 'Setup' }}</RouterLink>
      <RouterLink v-if="game.started" to="/game">{{ lang === 'th' ? 'เกม' : 'Game' }}</RouterLink>
      <RouterLink to="/cards">{{ lang === 'th' ? 'การ์ด' : 'Cards' }}</RouterLink>
      <RouterLink to="/rules">{{ lang === 'th' ? 'กติกา' : 'Rules' }}</RouterLink>
    </nav>
    <button class="lang" type="button" @click="lang = lang === 'th' ? 'en' : 'th'">
      {{ lang === 'th' ? 'EN' : 'TH' }}
    </button>
  </header>
  <main class="page">
    <RouterView />
  </main>
</template>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 1rem;
  background: var(--bg-raised);
  border-bottom: 1px solid var(--line);
}
.brand {
  font-weight: 800;
  letter-spacing: 0.05em;
  color: var(--blood);
  text-decoration: none;
}
.brand span {
  color: var(--text);
  font-weight: 400;
}
nav {
  display: flex;
  gap: 0.25rem;
  flex: 1;
  overflow-x: auto;
}
nav a {
  padding: 0.35rem 0.7rem;
  border-radius: 6px;
  color: var(--muted);
  text-decoration: none;
  white-space: nowrap;
}
nav a.router-link-exact-active {
  background: var(--bg-hover);
  color: var(--text);
}
.lang {
  min-width: 2.75rem;
}
.page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem;
}
@media (max-width: 480px) {
  .topbar {
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
  }
  .brand span {
    display: none;
  }
  nav a {
    padding: 0.35rem 0.45rem;
  }
}
</style>
