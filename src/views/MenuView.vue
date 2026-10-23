<script setup lang="ts">
// The first screen: play the full game online or on one device, or use the companion with the
// physical board game.
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { asset } from '../i18n'
import { sfx } from '../sound'
import { game, online } from '../play/game'
import { session } from '../play/online/session'
import { canInstall, install, iosHint } from '../install'
import { openChangelog } from '../update'
import { APP_BUILT, versionLabel } from '../version'

const router = useRouter()

/** A hot-seat game saved on this device (not the online room's game). */
const offlineGame = computed(() => (!online.value && !session.room && game.value && game.value.phase !== 'over' ? game.value : null))

const modes = computed(() => [
  {
    to: '/online',
    icon: '🌐',
    title: 'Online',
    sub: 'เล่นออนไลน์',
    text: 'แต่ละคนเล่นบนเครื่องตัวเอง สร้างห้องแล้วส่งรหัสให้เพื่อน ระบบคุมกติกาให้ทั้งหมด',
    image: 'assets/app/background-img/background_dbd.webp',
    resume: session.room ? `กลับเข้าห้อง ${session.room.code}` : '',
  },
  {
    to: '/play',
    icon: '🎲',
    title: 'Offline',
    sub: 'เล่นเครื่องเดียว',
    text: 'เล่นเต็มเกมบนเครื่องเดียว ส่งเครื่องต่อกันทั้งโต๊ะ (hot-seat) ระบบคุมกติกา ทอยเต๋า และ Perk',
    image: 'assets/app/background-img/background_macmillan.webp',
    resume: offlineGame.value ? `เล่นต่อ · รอบ ${offlineGame.value.round}` : '',
  },
  {
    to: '/tutorial',
    icon: '🕯️',
    title: 'Tutorial',
    sub: 'สอนเล่นทีละบท',
    text: 'ไม่เคยเล่นมาก่อน? The Entity จะพาเล่นบนกระดานจริงทีละขั้น ตั้งแต่การเดินจนถึงการหนี',
    image: 'assets/app/background-img/background_autohaven.webp',
    resume: '',
  },
  {
    to: '/lobby',
    icon: '📋',
    title: 'Companion',
    sub: 'ผู้ช่วยเล่นบอร์ดเกมจริง',
    text: 'มีกล่องเกมอยู่แล้ว? ใช้จัดทีม สุ่มตัวละครและแผนที่ เช็กลิสต์จัดโต๊ะ และเปิดกติการะหว่างเล่น',
    image: 'assets/app/background-img/background_lobby.webp',
    resume: '',
  },
])

function go(to: string) {
  sfx.select()
  void router.push(to)
}
</script>

<template>
  <div class="menu">
    <header class="title">
      <img :src="asset('icon.svg')" alt="" />
      <div>
        <p class="eyebrow">Dead by Daylight: The Board Game</p>
        <h1>เลือกโหมด</h1>
      </div>
    </header>

    <div class="modes">
      <button v-for="m in modes" :key="m.to" type="button" class="mode" :data-mode="m.title.toLowerCase()" @click="go(m.to)">
        <span class="bg" :style="{ backgroundImage: `url(${asset(m.image)})` }" aria-hidden="true" />
        <span class="body">
          <span class="icon" aria-hidden="true">{{ m.icon }}</span>
          <b>{{ m.title }}</b>
          <small class="sub">{{ m.sub }}</small>
          <span class="text">{{ m.text }}</span>
          <span v-if="m.resume" class="resume">▶ {{ m.resume }}</span>
        </span>
      </button>
    </div>

    <nav class="refs">
      <RouterLink to="/cards">🃏 การ์ดทั้งหมด</RouterLink>
      <RouterLink to="/rules">📖 กติกา</RouterLink>
      <button v-if="canInstall" type="button" class="install" @click="install">📲 ติดตั้งเป็นแอป</button>
    </nav>
    <p class="version" :title="`build ${APP_BUILT}`">
      {{ versionLabel() }} ·
      <button type="button" class="whats-new" @click="openChangelog">มีอะไรใหม่</button>
    </p>
    <p v-if="!canInstall && iosHint" class="ios-hint">📲 ติดตั้งเป็นแอป: กด <b>แชร์</b> ใน Safari แล้วเลือก <b>เพิ่มไปยังหน้าจอโฮม</b></p>
  </div>
</template>

<style scoped>
.menu {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1rem 0 2rem;
}
.title {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.title img {
  width: 64px;
  height: 64px;
  filter: drop-shadow(0 0 14px rgb(255 90 30 / 0.5));
}
.eyebrow {
  margin: 0;
  color: var(--muted);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-size: 0.8rem;
}
.title h1 {
  margin: 0;
  font-size: 2.4rem;
  text-shadow: 0 2px 12px rgb(0 0 0 / 0.8);
}
.title h1::after {
  content: '';
  display: block;
  width: 4rem;
  height: 3px;
  margin-top: 0.35rem;
  background: var(--blood-bright);
  box-shadow: 0 0 10px var(--blood-bright);
}
.modes {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}
.mode {
  position: relative;
  display: flex;
  align-items: flex-end;
  min-height: 340px;
  padding: 0;
  overflow: hidden;
  text-align: left;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: var(--bg-raised);
  box-shadow: 0 10px 40px rgb(0 0 0 / 0.6);
  transition:
    transform 0.2s ease,
    border-color 0.2s,
    box-shadow 0.2s;
}
.bg {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  filter: saturate(0.8) brightness(0.75);
  transition: transform 0.6s ease, filter 0.3s;
}
.bg::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(0deg, rgb(5 6 8 / 0.95) 15%, rgb(5 6 8 / 0.55) 55%, rgb(5 6 8 / 0.15));
}
.body {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 1.25rem;
}
.icon {
  font-size: 2rem;
}
.body b {
  font-family: var(--font-display);
  font-size: 2rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #f1e3c8;
  line-height: 1;
}
.sub {
  color: var(--blood-bright);
  font-weight: 700;
  letter-spacing: 0.04em;
}
.text {
  color: #cfcac0;
  font-size: 0.95rem;
}
.resume {
  align-self: flex-start;
  margin-top: 0.4rem;
  padding: 0.25rem 0.6rem;
  border-radius: 4px;
  background: var(--blood);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 700;
}
.mode:hover,
.mode:focus-visible {
  transform: translateY(-4px);
  border-color: var(--blood);
  box-shadow: 0 14px 40px rgb(0 0 0 / 0.7), 0 0 26px rgb(255 30 30 / 0.3);
}
.mode:hover .bg {
  transform: scale(1.05);
  filter: saturate(1) brightness(0.9);
}
.refs {
  display: flex;
  gap: 1.25rem;
  justify-content: center;
}
.refs {
  flex-wrap: wrap;
  align-items: center;
}
.version {
  margin: 0;
  text-align: center;
  font-size: 0.78rem;
  color: var(--muted);
  opacity: 0.75;
}
.whats-new {
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.refs a {
  color: var(--muted);
}
.install {
  padding: 0.35rem 0.9rem;
  border-color: var(--blood);
  color: #fff;
  background: rgb(200 20 29 / 0.25);
}
.ios-hint {
  margin: -0.75rem 0 0;
  text-align: center;
  font-size: 0.88rem;
  color: var(--muted);
}
@media (max-width: 560px) {
  .mode {
    min-height: 220px;
  }
  .title h1 {
    font-size: 1.8rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  .mode,
  .bg {
    transition: none;
  }
  .mode:hover {
    transform: none;
  }
}
</style>
