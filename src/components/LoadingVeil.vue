<script setup lang="ts">
import { asset } from '../i18n'
import { hideLoading, loading } from '../loading'
</script>

<template>
  <Transition name="veil">
    <div v-if="loading.active && loading.slide" class="veil" role="status" @click="hideLoading">
      <div class="content">
        <p class="kind">{{ loading.slide.kind === 'quote' ? 'คำพูดจากในหมอก' : 'เคล็ดลับ' }}</p>
        <div class="slide" :class="loading.slide.kind">
          <img v-if="loading.slide.image" class="who" :src="asset(loading.slide.image)" alt="" />
          <blockquote>
            {{ loading.slide.text }}
            <cite v-if="loading.slide.by">{{ loading.slide.by }}</cite>
          </blockquote>
        </div>
      </div>
      <footer class="foot">
        <img class="spinner" :src="asset('assets/tokens/entity.webp')" alt="" />
        <span class="title">{{ loading.title }}</span>
        <small class="muted">แตะเพื่อข้าม</small>
      </footer>
      <div class="bar"><span /></div>
    </div>
  </Transition>
</template>

<style scoped>
.veil {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 2rem;
  cursor: pointer;
  background:
    radial-gradient(ellipse 80% 50% at 50% 120%, rgb(200 20 29 / 0.35), transparent 70%),
    radial-gradient(ellipse at center, #0b0d11, #030304 80%);
}
.content {
  width: min(820px, 100%);
  margin: 0 auto;
}
.kind {
  margin: 0 0 0.8rem;
  color: var(--blood-bright);
  font-family: var(--font-display);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  font-size: 0.85rem;
}
.slide {
  display: flex;
  gap: 1.5rem;
  align-items: center;
  animation: rise 0.6s ease-out both;
}
.who {
  width: 120px;
  height: 120px;
  flex: none;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--line-strong);
  box-shadow: 0 0 30px rgb(0 0 0 / 0.8);
}
blockquote {
  margin: 0;
  font-size: clamp(1.15rem, 2.6vw, 1.7rem);
  line-height: 1.55;
  color: #ddd8ce;
}
.tip blockquote {
  font-family: var(--font-display);
  font-weight: 500;
}
cite {
  display: block;
  margin-top: 0.6rem;
  font-size: 0.95rem;
  font-style: normal;
  color: var(--muted);
}
.foot {
  position: absolute;
  left: 2rem;
  right: 2rem;
  bottom: 2.2rem;
  display: flex;
  align-items: center;
  gap: 0.8rem;
}
.spinner {
  width: 34px;
  height: 34px;
  animation: spin 2.4s linear infinite;
  filter: drop-shadow(0 0 8px rgb(255 40 40 / 0.6));
}
.title {
  font-family: var(--font-display);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.foot small {
  margin-left: auto;
}
/* progress bar along the bottom, matching the default duration */
.bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: rgb(255 255 255 / 0.06);
}
.bar span {
  display: block;
  height: 100%;
  background: var(--blood-bright);
  box-shadow: 0 0 10px var(--blood-bright);
  animation: fill 2.6s linear both;
}
.veil-enter-active,
.veil-leave-active {
  transition: opacity 0.35s;
}
.veil-enter-from,
.veil-leave-to {
  opacity: 0;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes fill {
  from {
    width: 0;
  }
  to {
    width: 100%;
  }
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}
@media (max-width: 560px) {
  .veil {
    padding: 1.25rem;
  }
  .slide {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }
  .who {
    width: 84px;
    height: 84px;
  }
  .foot {
    left: 1.25rem;
    right: 1.25rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinner,
  .slide {
    animation: none;
  }
}
</style>
