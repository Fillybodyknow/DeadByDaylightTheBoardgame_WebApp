<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, type RouteMeta } from 'vue-router'
import Particles from './components/Particles.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import UpdateBanner from './components/UpdateBanner.vue'
import WhatsNew from './components/WhatsNew.vue'
import { asset, lang } from './i18n'
import { game, tutorial } from './play/game'
import { isPhone } from './play/device'
import { introStage } from './play/intro'
import { finishedGame, session } from './play/online/session'
import PhoneBlock from './play/views/PhoneBlock.vue'
import { setAmbient, type AmbientTrack } from './sound'
import { startUpdateWatch } from './update'

const route = useRoute()
startUpdateWatch()

// The part of the app the screen belongs to; shared screens (cards, rules) keep the last one.
type Section = NonNullable<RouteMeta['section']>
const lastSection = ref<Section>('menu')
const section = computed<Section>(() => route.meta.section ?? lastSection.value)
watch(section, (s) => (lastSection.value = s))

const SUBTITLE: Record<Section, string> = { menu: '', offline: 'Offline', online: 'Online', tutorial: 'Tutorial' }

/** The full game (Online / Offline) is for computers and tablets; a phone gets a notice. */
const phone = isPhone()
const phoneBlocked = computed(() => phone && (route.name === 'offline' || route.name === 'online' || route.name === 'tutorial'))

/** A full game is on screen: it has its own top bar and takes the whole width. */
const inGame = computed(
  () =>
    !phoneBlocked.value &&
    // the alarm before a game plays over the page it started from, laid out as that page
    introStage.value !== 'beat' &&
    ((route.name === 'offline' && !!game.value && !session.room) ||
      (route.name === 'online' && !!(session.data?.game || finishedGame.value) && !!game.value) ||
      (route.name === 'tutorial' && !!tutorial.value && !!game.value)),
)

const links = computed(() => [
  { to: '/', label: 'เมนู', icon: '🏠' },
  ...(section.value === 'offline'
    ? [{ to: '/play', label: 'เล่นเครื่องเดียว', icon: '🎲' }]
    : section.value === 'online'
      ? [{ to: '/online', label: session.room ? `ห้อง ${session.room.code}` : 'ออนไลน์', icon: '🌐' }]
      : []),
  { to: '/cards', label: 'การ์ด', icon: '🃏' },
  { to: '/rules', label: 'กติกา', icon: '📖' },
])

// Ambience: the campfire before a trial (menu, setup, rooms), the trial's own track during play;
// other screens (cards, rules) keep whatever is already playing.
const AMBIENT_BY_ROUTE: Record<string, AmbientTrack> = { menu: 'lobby', offline: 'lobby', online: 'lobby' }
watch(
  () => (inGame.value ? 'play' : AMBIENT_BY_ROUTE[String(route.name)]),
  (track) => {
    if (track) setAmbient(track)
  },
  { immediate: true },
)

const PARTICLES_BY_ROUTE: Record<string, 'embers' | 'spores'> = { menu: 'embers', offline: 'embers', online: 'embers' }
const particles = computed(() => (inGame.value ? 'spores' : (PARTICLES_BY_ROUTE[String(route.name)] ?? null)))

// Scene behind the app: the campfire, or the map's realm during a game.
const scene = computed(() =>
  inGame.value && game.value ? `assets/app/background-img/background_${game.value.board}.webp` : 'assets/app/background-img/background_lobby.webp',
)
</script>

<template>
  <!-- cross-fading backdrop; keyed so a change of scene fades in -->
  <div class="scene" :class="{ dim: inGame }" aria-hidden="true">
    <Transition name="scene">
      <div :key="scene" class="scene-img" :style="{ backgroundImage: `url(${asset(scene)})` }" />
    </Transition>
    <!-- campfire embers before the trial, Entity motes during it -->
    <Particles v-if="particles" :key="particles" :variant="particles" />
  </div>

  <UpdateBanner />
  <WhatsNew />

  <!-- in a full game, the game's own top bar (round, room, mute, leave) takes over -->
  <header v-if="!inGame" class="topbar">
    <RouterLink to="/" class="brand" aria-label="ดบดล — เมนู">
      <img :src="asset('icon.svg')" alt="" />
      <span>ดบดล <small v-if="SUBTITLE[section]">{{ SUBTITLE[section] }}</small></span>
    </RouterLink>
    <nav>
      <!-- on narrow screens each link becomes an icon over a small label -->
      <RouterLink v-for="l in links" :key="l.to" :to="l.to" :aria-label="l.label">
        <span class="ico" aria-hidden="true">{{ l.icon }}</span>
        <span class="lbl">{{ l.label }}</span>
      </RouterLink>
    </nav>
    <SettingsDialog class="icon-btn" />
    <!-- Switches card/board text between Thai and English; the UI itself is Thai. -->
    <button class="lang" type="button" title="ภาษาข้อความการ์ด" @click="lang = lang === 'th' ? 'en' : 'th'">
      <span class="lang-label">การ์ด: </span>{{ lang === 'th' ? 'TH' : 'EN' }}
    </button>
  </header>
  <main class="page" :class="{ full: inGame }">
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <PhoneBlock v-if="phoneBlocked" />
        <component :is="Component" v-else />
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
.page.full {
  max-width: none;
  padding: 0;
}
/* behind the game board, the realm stays dark so the board reads */
.scene.dim .scene-img {
  filter: saturate(0.8) brightness(0.4);
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
