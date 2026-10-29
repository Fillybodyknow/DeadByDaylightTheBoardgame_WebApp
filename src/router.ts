import { createRouter, createWebHashHistory } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    /** Which part of the app the screen belongs to (top bar links, brand subtitle). */
    section?: 'menu' | 'offline' | 'online' | 'tutorial'
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
    // the public chat for finding people to play with
    { path: '/lfg', name: 'lfg', component: () => import('./play/views/LfgView.vue'), meta: { section: 'online' } },
    // online games played to the end on this device
    { path: '/history', name: 'history', component: () => import('./play/views/HistoryView.vue') },
    { path: '/tutorial', name: 'tutorial', component: () => import('./play/tutorial/TutorialView.vue'), meta: { section: 'tutorial' } },
    // references, shared by every mode
    { path: '/cards', name: 'cards', component: () => import('./views/CardsView.vue') },
    { path: '/cards/:kind(survivor|killer|item)/:id', name: 'card', component: () => import('./views/CardDetailView.vue') },
    { path: '/rules', name: 'rules', component: () => import('./views/RulesView.vue') },
    // anything else (an old link to the companion's #/lobby, #/table…): the menu
    { path: '/:rest(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
