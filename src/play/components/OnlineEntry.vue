<script setup lang="ts">
// Online play: create a room or join one with its 4-letter code.
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { asset } from '../../i18n'
import { sfx } from '../../sound'
import { backend, createRoom, joinRoom, lastRoom, savedName, session } from '../online/session'

const name = ref(savedName())
const code = ref('')
const last = lastRoom()

async function create() {
  sfx.select()
  await createRoom(name.value.trim())
}

async function join(c = code.value) {
  if (!c.trim()) return
  sfx.select()
  await joinRoom(c, name.value.trim())
}

// #/online?room=ABCD in an invite link joins straight away
const route = useRoute()
const router = useRouter()
onMounted(() => {
  const fromLink = route.query.room
  if (typeof fromLink !== 'string' || !fromLink) return
  void router.replace({ query: {} })
  void join(fromLink)
})
</script>

<template>
  <section class="hero" :style="{ backgroundImage: `url(${asset('assets/app/background-img/background_dbd.webp')})` }">
    <div class="hero-text">
      <h1>เล่นออนไลน์</h1>
      <p>แต่ละคนเล่นบนเครื่องตัวเอง — สร้างห้องแล้วส่งรหัสหรือลิงก์ให้เพื่อน</p>
    </div>
  </section>
  <section class="card online">
    <h2>เข้าห้อง</h2>
    <p v-if="backend.name === 'local'" class="warn">
      ยังไม่ได้ตั้งค่า Firebase: ห้องจะใช้ได้เฉพาะแท็บในเบราว์เซอร์นี้ (ไว้ทดสอบ — เปิดหลายแท็บแทนผู้เล่นแต่ละคน)
    </p>

    <label class="field">
      ชื่อของคุณ
      <input v-model="name" maxlength="16" placeholder="เช่น บิว" />
    </label>

    <div class="row">
      <button class="primary" :disabled="session.busy" @click="create">สร้างห้องใหม่</button>
      <span class="or muted">หรือ</span>
      <input v-model="code" class="code" maxlength="4" placeholder="รหัสห้อง" @keyup.enter="join()" />
      <button :disabled="session.busy || code.trim().length !== 4" @click="join()">เข้าห้อง</button>
    </div>
    <button v-if="last" class="link" :disabled="session.busy" @click="join(last)">กลับเข้าห้องล่าสุด ({{ last }})</button>
    <p v-if="session.error" class="error">{{ session.error }}</p>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  display: flex;
  align-items: flex-end;
  min-height: 200px;
  margin-bottom: 1rem;
  padding: 1.25rem 1.5rem;
  border-radius: var(--radius);
  border: 1px solid var(--line-strong);
  background-size: cover;
  background-position: center 30%;
  overflow: hidden;
  box-shadow: 0 10px 40px rgb(0 0 0 / 0.6);
}
.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgb(5 6 8 / 0.92) 0%, rgb(5 6 8 / 0.55) 45%, transparent 75%),
    linear-gradient(0deg, rgb(5 6 8 / 0.8), transparent 60%);
}
.hero-text {
  position: relative;
  max-width: 34rem;
}
.hero h1 {
  margin: 0;
  font-size: 2.3rem;
  text-shadow: 0 2px 12px rgb(0 0 0 / 0.8);
}
.hero h1::after {
  content: '';
  display: block;
  width: 4rem;
  height: 3px;
  margin-top: 0.35rem;
  background: var(--blood-bright);
  box-shadow: 0 0 10px var(--blood-bright);
}
.hero p {
  margin: 0.5rem 0 0;
  color: #cfcac0;
}
@media (max-width: 560px) {
  .hero {
    min-height: 160px;
    padding: 1rem;
  }
  .hero h1 {
    font-size: 1.6rem;
  }
}
.online {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.online h2 {
  margin: 0;
}
.online p {
  margin: 0;
}
.warn {
  color: var(--warn);
  font-size: 0.9rem;
}
.error {
  color: var(--blood-bright);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-width: 260px;
}
input {
  font: inherit;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  padding: 0.45rem 0.7rem;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.code {
  width: 7.5rem;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-family: var(--font-display);
}
.link {
  align-self: flex-start;
  background: none;
  border: none;
  color: var(--muted);
  text-decoration: underline;
  padding: 0;
}
</style>
