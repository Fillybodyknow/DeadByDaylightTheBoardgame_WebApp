import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  // Hash history so the built app works from any static host or file path.
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'lobby', component: () => import('./views/LobbyView.vue') },
    { path: '/setup', name: 'setup', component: () => import('./views/SetupView.vue') },
    { path: '/table', name: 'table', component: () => import('./views/TableView.vue') },
    { path: '/cards', name: 'cards', component: () => import('./views/CardsView.vue') },
    { path: '/cards/:kind(survivor|killer|item)/:id', name: 'card', component: () => import('./views/CardDetailView.vue') },
    { path: '/rules', name: 'rules', component: () => import('./views/RulesView.vue') },
    { path: '/history', name: 'history', component: () => import('./views/HistoryView.vue') },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
