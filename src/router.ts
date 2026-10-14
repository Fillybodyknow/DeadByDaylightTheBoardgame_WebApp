import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  // Hash history so the built app works from any static host or file path.
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'setup', component: () => import('./views/SetupView.vue') },
    { path: '/game', name: 'game', component: () => import('./views/GameView.vue') },
    { path: '/cards', name: 'cards', component: () => import('./views/CardsView.vue') },
    { path: '/cards/:kind(survivor|killer|item)/:id', name: 'card', component: () => import('./views/CardDetailView.vue') },
    { path: '/rules', name: 'rules', component: () => import('./views/RulesView.vue') },
  ],
})
