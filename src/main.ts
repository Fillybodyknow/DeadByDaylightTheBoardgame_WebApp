import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './style.css'

createApp(App).use(createPinia()).use(router).mount('#app')

// Automated multi-tab tests (`?test` in the URL) drive the full game through the same dispatch
// the buttons use, picking legal actions; nothing is exposed otherwise.
if (new URLSearchParams(location.search).has('test')) {
  void Promise.all([import('./play/game'), import('./play/engine/legal'), import('./play/engine/seats')]).then(([g, legal, seats]) => {
    Object.assign(window, { __dbdl: { ...g, ...legal, ...seats } })
  })
}
