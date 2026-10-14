<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import LoadingVeil from './components/LoadingVeil.vue'
import Particles from './components/Particles.vue'
import { survivorById } from './data'
import { showLoading, TIPS, type LoadingSlide } from './loading'
import { asset, lang } from './i18n'
import { muted, setAmbient, type AmbientTrack } from './sound'
import { useLobbyStore } from './stores/lobby'

const lobby = useLobbyStore()
const route = useRoute()

// Scene behind the app: the campfire lobby, or the chosen map's realm once the game is set.
// Loading screen when entering table setup and when the trial starts: half the time a quote from
// a survivor in this game, otherwise a rules tip.
function loadingSlide(): LoadingSlide {
  const inGame = lobby.state.survivorPicks.map((id) => (id ? survivorById.get(id) : undefined)).filter((c) => !!c)
  const withQuote = inGame.filter((c) => c!.quote.th || c!.quote.en)
  if (withQuote.length && Math.random() < 0.5) {
    const c = withQuote[Math.floor(Math.random() * withQuote.length)]!
    const raw = (lang.value === 'th' ? c.quote.th : c.quote.en) || c.quote.en || c.quote.th
    // quotes end with "– Name"; show the name as the attribution instead
    const text = raw.replace(/\s*[–—-]{1,2}\s*[^"”]+$/, '').trim()
    return { kind: 'quote', text, by: c.name, image: c.images.mini }
  }
  return { kind: 'tip', text: TIPS[Math.floor(Math.random() * TIPS.length)] }
}

useRouter().afterEach((to, from) => {
  if (to.name === 'setup' && from.name === 'lobby') showLoading('กำลังเตรียมโต๊ะ…', loadingSlide())
  else if (to.name === 'table' && to.query.intro === '1') showLoading('กำลังเข้าสู่ Trial…', loadingSlide())
})

const links = computed(() => [
  { to: '/', label: 'Lobby', icon: '🔥' },
  ...(lobby.ready
    ? [
        { to: '/setup', label: 'จัดโต๊ะ', icon: '🧰' },
        { to: '/table', label: 'ระหว่างเล่น', icon: '🎲' },
      ]
    : []),
  { to: '/cards', label: 'การ์ด', icon: '🃏' },
  { to: '/rules', label: 'กติกา', icon: '📖' },
  { to: '/history', label: 'ประวัติ', icon: '📜' },
])

// Ambience: the campfire before the trial (lobby, table setup), the trial's own track during
// play; other screens (cards, rules, history) keep whatever is already playing.
const AMBIENT_BY_ROUTE: Record<string, AmbientTrack> = { lobby: 'lobby', setup: 'lobby', table: 'play' }
watch(
  () => route.name,
  (name) => {
    const track = AMBIENT_BY_ROUTE[String(name)]
    if (track) setAmbient(track)
  },
  { immediate: true },
)

const PARTICLES_BY_ROUTE: Record<string, 'embers' | 'spores'> = { lobby: 'embers', setup: 'embers', table: 'spores' }
const particles = computed(() => PARTICLES_BY_ROUTE[String(route.name)] ?? null)

const MAP_SCENES = new Set(['setup', 'table'])
const scene = computed(() => {
  const mapId = lobby.state.mapId
  if (mapId && MAP_SCENES.has(String(route.name))) return `assets/app/background-img/background_${mapId}.webp`
  return 'assets/app/background-img/background_lobby.webp'
})
</script>

<template>
  <!-- cross-fading backdrop; keyed so a change of scene fades in -->
  <div class="scene" aria-hidden="true">
    <Transition name="scene">
      <div :key="scene" class="scene-img" :style="{ backgroundImage: `url(${asset(scene)})` }" />
    </Transition>
    <!-- campfire embers before the trial, Entity motes during it -->
    <Particles v-if="particles" :key="particles" :variant="particles" />
  </div>

  <LoadingVeil />

  <header class="topbar">
    <RouterLink to="/" class="brand" aria-label="ดบดล Companion">
      <img :src="asset('icon.svg')" alt="" />
      <span>ดบดล <small>Companion</small></span>
    </RouterLink>
    <nav>
      <!-- on narrow screens each link becomes an icon over a small label -->
      <RouterLink v-for="l in links" :key="l.to" :to="l.to" :aria-label="l.label">
        <span class="ico" aria-hidden="true">{{ l.icon }}</span>
        <span class="lbl">{{ l.label }}</span>
      </RouterLink>
    </nav>
    <button class="icon-btn" type="button" :title="muted ? 'เปิดเสียง' : 'ปิดเสียง'" :aria-pressed="!muted" @click="muted = !muted">
      {{ muted ? '🔇' : '🔊' }}
    </button>
    <!-- Switches card/board text between Thai and English; the UI itself is Thai. -->
    <button class="lang" type="button" title="ภาษาข้อความการ์ด" @click="lang = lang === 'th' ? 'en' : 'th'">
      <span class="lang-label">การ์ด: </span>{{ lang === 'th' ? 'TH' : 'EN' }}
    </button>
  </header>
  <main class="page">
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </main>
</template>

<style scoped>
.scene {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  background: var(--bg);
}
.scene-img {
  position: absolute;
  inset: -2%;
  background-size: cover;
  background-position: center;
  filter: saturate(0.8) brightness(0.8);
  animation: drift 40s ease-in-out infinite alternate;
}
/* darken toward the edges and the bottom so text stays readable, with film grain and the
   red glow of The Entity rising from below */
.scene::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    var(--grain),
    radial-gradient(ellipse 90% 40% at 50% 112%, var(--entity), transparent 70%),
    linear-gradient(180deg, rgb(7 8 10 / 0.45) 0%, rgb(7 8 10 / 0.2) 40%, rgb(7 8 10 / 0.8) 100%),
    radial-gradient(ellipse at center, transparent 40%, rgb(0 0 0 / 0.7) 100%);
  background-size: 160px 160px, auto, auto, auto;
  z-index: 2;
}
/* slow drifting fog */
.scene::before {
  content: '';
  position: absolute;
  inset: -20%;
  z-index: 1;
  background:
    radial-gradient(ellipse 40% 25% at 25% 70%, var(--fog), transparent 70%),
    radial-gradient(ellipse 35% 20% at 75% 40%, var(--fog), transparent 70%),
    radial-gradient(ellipse 50% 30% at 50% 95%, rgb(140 160 185 / 0.06), transparent 70%);
  animation: fog 60s ease-in-out infinite alternate;
}
@keyframes fog {
  to {
    transform: translate3d(8%, -4%, 0) scale(1.1);
  }
}
@keyframes drift {
  to {
    transform: scale(1.06) translate3d(-1%, -1%, 0);
  }
}
.scene-enter-active,
.scene-leave-active {
  transition: opacity 1.2s ease;
}
.scene-enter-from,
.scene-leave-to {
  opacity: 0;
}

.page-enter-active,
.page-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.page-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .scene-img,
  .scene::before {
    animation: none;
  }
  .page-enter-active,
  .page-leave-active {
    transition: none;
  }
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding: 0.55rem 1rem;
  background: linear-gradient(180deg, rgb(5 6 8 / 0.95), rgb(9 10 13 / 0.88));
  border-bottom: 1px solid rgb(200 20 29 / 0.45);
  box-shadow: 0 1px 18px rgb(200 20 29 / 0.18);
  backdrop-filter: blur(6px);
}
.brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-display);
  text-transform: uppercase;
  text-decoration: none;
  letter-spacing: 0.08em;
}
.brand img {
  width: 32px;
  height: 32px;
  filter: drop-shadow(0 0 8px rgb(255 90 30 / 0.45));
}
.brand span {
  color: #f1e3c8;
  font-weight: 700;
  font-size: 1.1rem;
  white-space: nowrap;
  text-shadow: 0 0 14px rgb(255 90 30 / 0.35);
}
.brand small {
  margin-left: 0.15rem;
  color: var(--blood-bright);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.1em;
}
nav {
  display: flex;
  gap: 0.25rem;
  flex: 1;
  overflow-x: auto;
}
nav a {
  position: relative;
  padding: 0.35rem 0.75rem;
  color: var(--muted);
  font-family: var(--font-display);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-decoration: none;
  white-space: nowrap;
  transition: color 0.15s;
}
nav a .ico {
  display: none;
}
nav a:hover {
  color: var(--text);
}
/* active tab: white text with a red bar underneath */
nav a.router-link-exact-active {
  color: #fff;
}
nav a.router-link-exact-active::after {
  content: '';
  position: absolute;
  left: 0.75rem;
  right: 0.75rem;
  bottom: -0.1rem;
  height: 2px;
  background: var(--blood-bright);
  box-shadow: 0 0 8px var(--blood-bright);
}
.lang {
  flex: none;
  font-size: 0.85rem;
}
.icon-btn {
  flex: none;
  padding: 0.3rem 0.55rem;
  font-size: 1rem;
  line-height: 1;
}
.page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1rem;
}
@media (max-width: 560px) {
  .topbar {
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
  }
  .brand,
  .lang-label {
    display: none;
  }
  nav {
    gap: 0;
  }
  nav {
    justify-content: space-between;
  }
  nav a {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.1rem 0.15rem;
    min-width: 0;
  }
  nav a .ico {
    display: block;
    font-size: 1.1rem;
    line-height: 1.2;
  }
  nav a .lbl {
    font-size: 0.62rem;
    letter-spacing: 0;
  }
  nav a.router-link-exact-active::after {
    left: 20%;
    right: 20%;
  }
  .lang {
    padding: 0.35rem 0.5rem;
  }
}
</style>
