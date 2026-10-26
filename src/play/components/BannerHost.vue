<script setup lang="ts">
// Phase and turn announcements: a band slides across the middle of the screen, then away.
// It never blocks clicks, and waits while a modal (round summary) is open.
import { computed, onBeforeUnmount, watch } from 'vue'
import { asset } from '../../i18n'
import { fx } from '../fx/bus'
import { anim } from '../../settings'
import { fxSound } from '../fx/audio'
import Mini from './Mini.vue'
import BpText from '../../components/BpText.vue'

const props = defineProps<{ paused: boolean }>()

const current = computed(() => (props.paused ? null : (fx.banners[0] ?? null)))
const SHOW_MS = 1250 // at the player's animation speed (anim)
/** Older than this when its turn comes: skip it, the game has moved on. */
const STALE_MS = 2500

let timer: number | undefined
watch(
  () => current.value?.id,
  (id) => {
    clearTimeout(timer)
    if (id === undefined) return
    if (Date.now() - current.value!.at > STALE_MS) {
      fx.banners.shift()
      return
    }
    fxSound.whoosh()
    timer = window.setTimeout(() => fx.banners.shift(), anim(SHOW_MS))
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <transition name="banner">
    <div v-if="current" :key="current.id" class="banner" :class="current.tone" aria-live="polite">
      <div class="band">
        <Mini v-if="current.image" class="face" :class="current.tone === 'killer' ? 'aura-killer' : 'aura-survivor'" :src="asset(current.image)" />
        <div>
          <strong><BpText :text="current.title" /></strong>
          <span v-if="current.sub"><BpText :text="current.sub" /></span>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.banner {
  position: fixed;
  left: 0;
  right: 0;
  top: 38%;
  z-index: 25;
  pointer-events: none;
  display: grid;
  place-items: center;
}
.band {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  width: 100%;
  padding: 0.9rem 1rem;
  background: linear-gradient(90deg, transparent, rgb(8 9 12 / 0.92) 20%, rgb(8 9 12 / 0.92) 80%, transparent);
  border-top: 1px solid rgb(255 255 255 / 0.08);
  border-bottom: 1px solid rgb(255 255 255 / 0.08);
}
.killer .band {
  background: linear-gradient(90deg, transparent, rgb(60 4 8 / 0.92) 20%, rgb(60 4 8 / 0.92) 80%, transparent);
  border-color: rgb(255 40 40 / 0.35);
}
.game .band {
  background: linear-gradient(90deg, transparent, rgb(40 32 8 / 0.92) 20%, rgb(40 32 8 / 0.92) 80%, transparent);
  border-color: rgb(245 197 66 / 0.35);
}
.face {
  width: 64px;
  height: 64px;
}
strong {
  display: block;
  font-family: var(--font-display);
  font-size: clamp(1.6rem, 4vw, 2.6rem);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  line-height: 1.1;
}
.killer strong {
  color: var(--blood-bright);
  text-shadow: 0 0 20px rgb(255 30 30 / 0.6);
}
.game strong {
  color: #f5c542;
}
span {
  color: var(--muted);
  letter-spacing: 0.05em;
}
.banner-enter-active {
  transition:
    transform 0.35s cubic-bezier(0.2, 1, 0.3, 1),
    opacity 0.35s;
}
.banner-leave-active {
  transition:
    transform 0.3s ease-in,
    opacity 0.3s;
}
.banner-enter-from {
  transform: translateX(-30%) skewX(-12deg);
  opacity: 0;
}
.banner-leave-to {
  transform: translateX(30%) skewX(-12deg);
  opacity: 0;
}
/* Beside the sidebar on wide screens, so the panel's buttons stay readable. */
@media (min-width: 981px) {
  .banner {
    right: 396px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .banner-enter-from,
  .banner-leave-to {
    transform: none;
  }
}
</style>
