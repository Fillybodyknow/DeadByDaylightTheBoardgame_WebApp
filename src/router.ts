import { createRouter, createWebHashHistory } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    /** Which part of the app the screen belongs to (top bar links, brand subtitle). */
    section?: 'menu' | 'companion' | 'offline' | 'online'
  }
}

export const router = createRouter({
  // Hash history so the built app works from any static host or file path.
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'menu', component: () => import('./views/MenuView.vue'), meta: { section: 'menu' } },
    // the full game: hot-seat on one device, or online with each player on their own
    { path: '/play', name: 'offline', component: () => import('./play/views/OfflineView.vue'), meta: { section: 'offline' } },
    { path: '/online', name: 'online', component: () => import('./play/views/OnlineView.vue'), meta: { section: 'online' } },
    // the companion for the physical board game
    { path: '/lobby', name: 'lobby', component: () => import('./views/LobbyView.vue'), meta: { section: 'companion' } },
    { path: '/setup', name: 'setup', component: () => import('./views/SetupView.vue'), meta: { section: 'companion' } },
    { path: '/table', name: 'table', component: () => import('./views/TableView.vue'), meta: { section: 'companion' } },
    { path: '/history', name: 'history', component: () => import('./views/HistoryView.vue'), meta: { section: 'companion' } },
    // references, shared by every mode
    { path: '/cards', name: 'cards', component: () => import('./views/CardsView.vue') },
    { path: '/cards/:kind(survivor|killer|item)/:id', name: 'card', component: () => import('./views/CardDetailView.vue') },
    { path: '/rules', name: 'rules', component: () => import('./views/RulesView.vue') },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
