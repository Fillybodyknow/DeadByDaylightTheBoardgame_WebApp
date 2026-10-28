<script setup lang="ts">
// The Entity's greeting on a first visit (welcome.ts): are you new? A new player hears of its world
// a page at a time, over the realms it built, then picks the side to learn first and goes straight
// into that side's first tutorial chapter. A player who has been here before is let go at once.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { asset } from '../i18n'
import { CHAPTERS } from '../play/tutorial/chapters'
import { reducedMotion } from '../settings'
import { sfx } from '../sound'
import { markWelcomed, welcome } from '../welcome'

const router = useRouter()

interface Page {
  title: string
  text: string
  /** The realm behind it. */
  scene: string
}

const bg = (name: string) => `assets/app/background-img/background_${name}.webp`

const ASK = 'เจ้า… กลิ่นของเจ้ายังใหม่นัก ข้ายังไม่เคยลิ้มรสความหวาดกลัวของเจ้ามาก่อน\nเจ้าเป็นผู้มาใหม่ในหมอกของข้าหรือ?'

const LORE: Page[] = [
  {
    title: 'The Entity',
    text: 'ข้าคือ The Entity — สิ่งที่อยู่เหนือกาลเวลาและความเข้าใจของเจ้า ข้าดึงผู้คนจากโลกของเจ้าเข้ามาในหมอกแห่งนี้ และดำรงอยู่ด้วยความหวังและความสิ้นหวังของพวกเขา',
    scene: bg('dbd'),
  },
  {
    title: 'อาณาจักรในหมอก',
    text: 'ในหมอกของข้ามีอาณาจักรมากมาย ข้าสร้างมันขึ้นจากความทรงจำอันมืดมิด — คฤหาสน์ร้าง โรงงานเหล็กกล้า สุสานรถ โรงพยาบาลบ้า… ทุกครั้งที่ Trial เริ่มขึ้น ข้าจะเลือกหนึ่งในนั้นเป็นสนามล่า',
    scene: bg('macmillan'),
  },
  {
    title: 'ผู้รอดชีวิต',
    text: 'ผู้รอดชีวิตต้องร่วมมือกัน ซ่อม Generator ให้ครบเพื่อจ่ายไฟให้ Exit Gate แล้วหนีออกไป พวกเขาซ่อนตัวใน Locker กระโดดข้ามหน้าต่าง ล้ม Pallet ขวางทาง และช่วยเพื่อนลงจาก Hook… แต่ไม่ว่าจะหนีไปได้กี่ครั้ง กองไฟจะเรียกพวกเขากลับมาหาข้าเสมอ',
    scene: bg('autohaven'),
  },
  {
    title: 'ฆาตกร',
    text: 'ฆาตกรคือผู้รับใช้ของข้า แต่ละตนมีพลังของตัวเอง หน้าที่ของมันคือไล่ล่า ทำร้าย และแขวนผู้รอดชีวิตบน Hook เพื่อถวายแด่ข้า — เมื่อ Sacrifice Progress ครบ 8 ช่อง Trial นั้นเป็นของข้า',
    scene: bg('crotus-prenn'),
  },
  {
    title: 'Trial บนกระดาน',
    text: 'ใน Trial ของข้า ทุกฝ่ายวางการ์ดเคลื่อนที่อย่างลับ ๆ แล้วเปิดพร้อมกัน ทุก Skill Check ถูกตัดสินด้วยลูกเต๋า และ Perk ของแต่ละคนอาจพลิกเกมได้ในพริบตา… ข้าจะสอนเจ้าทีละขั้น บนกระดานจริง',
    scene: bg('ormond'),
  },
]

type Stage = 'ask' | 'lore' | 'side'
const stage = ref<Stage>('ask')
const page = ref(0)

const scene = computed(() => (stage.value === 'lore' ? LORE[page.value].scene : stage.value === 'side' ? bg('withered-isle') : bg('lobby')))
const text = computed(() => (stage.value === 'ask' ? ASK : stage.value === 'lore' ? LORE[page.value].text : 'เจ้าจะเริ่มเรียนรู้จากฝั่งใด?'))

// ---------- the words appear as The Entity speaks them (a click shows them all) ----------
const shown = ref(0)
let typer = 0
const CHAR_MS = 28
const typing = computed(() => shown.value < text.value.length)

function speak() {
  clearInterval(typer)
  shown.value = reducedMotion.value ? text.value.length : 0
  if (!typing.value) return
  typer = window.setInterval(() => {
    shown.value += 1
    if (!typing.value) clearInterval(typer)
  }, CHAR_MS)
}
function finishLine() {
  clearInterval(typer)
  shown.value = text.value.length
}
watch(text, speak)
watch(
  () => welcome.open,
  (o) => {
    if (!o) return
    stage.value = 'ask'
    page.value = 0
    speak()
  },
  { immediate: true },
)
onBeforeUnmount(() => clearInterval(typer))

// ---------- going on ----------
function close() {
  clearInterval(typer)
  markWelcomed()
  welcome.open = false
}

function answer(isNew: boolean) {
  sfx.select()
  if (!isNew) return close()
  stage.value = 'lore'
  page.value = 0
}

/** "ถัดไป": the rest of the line first, then the next page. */
function next() {
  if (typing.value) return finishLine()
  sfx.click()
  if (stage.value === 'lore' && page.value < LORE.length - 1) page.value++
  else stage.value = 'side'
}

function back() {
  sfx.click()
  if (stage.value === 'side') {
    stage.value = 'lore'
    page.value = LORE.length - 1
  } else if (page.value > 0) page.value--
  else stage.value = 'ask'
}

// the characters the tutorial plays (tutorial/scene.ts): Dwight, and The Hillbilly
const SIDES = [
  { side: 'survivor' as const, name: 'ผู้รอดชีวิต', sub: 'ซ่อม Generator หลบหนี และช่วยเหลือกัน', mini: 'assets/survivors/mini/dwight.webp' },
  { side: 'killer' as const, name: 'ฆาตกร', sub: 'ไล่ล่า แขวนบน Hook และถวายแด่ The Entity', mini: 'assets/killers/mini/hillbilly.webp' },
]

/** That side's first chapter, at once. */
function pickSide(side: 'survivor' | 'killer') {
  sfx.select()
  const first = CHAPTERS.find((c) => (c.side ?? 'survivor') === side)
  close()
  try {
    localStorage.setItem('dbdl-tutorial-side', side)
  } catch {
    // storage blocked: the list opens on its usual side
  }
  void router.push({ path: '/tutorial', query: first ? { start: first.id } : {} })
}

function onKey(e: KeyboardEvent) {
  if (!welcome.open) return
  if (e.key === 'Escape') {
    e.stopPropagation()
    close()
  } else if ((e.key === 'Enter' || e.key === ' ') && stage.value === 'lore') {
    e.preventDefault()
    next()
  }
}
watch(
  () => welcome.open,
  (o) => (o ? window.addEventListener('keydown', onKey, true) : window.removeEventListener('keydown', onKey, true)),
  { immediate: true },
)
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <Transition name="welcome">
      <div v-if="welcome.open" class="welcome" role="dialog" aria-modal="true" aria-label="The Entity">
        <!-- the realm behind the words, cross-fading page to page -->
        <Transition name="realm">
          <div :key="scene" class="realm" :style="{ backgroundImage: `url(${asset(scene)})` }" aria-hidden="true" />
        </Transition>
        <div class="fog" aria-hidden="true" />

        <button v-if="stage !== 'ask'" type="button" class="skip" @click="close">ข้ามบทนำ ✕</button>

        <div class="stage">
          <img class="entity" :class="{ speaking: typing }" :src="asset('assets/tokens/entity.webp')" alt="" />
          <p class="who">THE ENTITY</p>
          <h1 v-if="stage === 'lore'" :key="page" class="title">{{ LORE[page].title }}</h1>
          <p class="say" @click="finishLine">
            {{ text.slice(0, shown) }}<span class="rest" aria-hidden="true">{{ text.slice(shown) }}</span>
          </p>

          <!-- are you new? -->
          <div v-if="stage === 'ask'" class="choices" :class="{ waiting: typing }">
            <button type="button" class="primary" @click="answer(true)">ใช่ ฉันเพิ่งมาที่นี่ครั้งแรก</button>
            <button type="button" @click="answer(false)">ไม่ ฉันรู้จักที่นี่ดีแล้ว</button>
          </div>

          <!-- the world, a page at a time -->
          <template v-else-if="stage === 'lore'">
            <div class="dots" aria-hidden="true"><i v-for="(_, i) in LORE" :key="i" :class="{ on: i === page }" /></div>
            <div class="choices row">
              <button type="button" class="quiet" @click="back">◂ ย้อน</button>
              <button type="button" class="primary" @click="next">{{ typing ? 'แสดงทั้งหมด' : page < LORE.length - 1 ? 'ถัดไป ▸' : 'เลือกฝั่ง ▸' }}</button>
            </div>
          </template>

          <!-- the side to learn first -->
          <template v-else>
            <div class="sides" :class="{ waiting: typing }">
              <button v-for="s in SIDES" :key="s.side" type="button" class="side" :class="s.side" @click="pickSide(s.side)">
                <img :src="asset(s.mini)" alt="" />
                <strong>{{ s.name }}</strong>
                <small>{{ s.sub }}</small>
                <span class="go">เริ่ม Tutorial บทแรก ▸</span>
              </button>
            </div>
            <div class="choices row">
              <button type="button" class="quiet" @click="back">◂ ย้อน</button>
              <button type="button" class="quiet" @click="close">ไว้ทีหลัง</button>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.welcome {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: #050506;
  overflow-y: auto;
}
.realm {
  position: absolute;
  inset: 0;
  background: center / cover no-repeat;
  filter: saturate(0.7) brightness(0.45);
}
/* the Entity's fog: dark at the edges, a red breath at the bottom */
.fog {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 50% 45%, transparent 0%, rgb(5 5 6 / 0.55) 55%, rgb(5 5 6 / 0.95) 100%),
    linear-gradient(0deg, rgb(120 8 14 / 0.35), transparent 40%);
  pointer-events: none;
}
.stage {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 0.9rem;
  width: min(720px, 100%);
  text-align: center;
}
.entity {
  width: 120px;
  height: 120px;
  object-fit: contain;
  filter: drop-shadow(0 0 22px rgb(220 30 40 / 0.65));
  animation: entity-breathe 4s ease-in-out infinite;
}
.entity.speaking {
  animation-duration: 1.4s;
}
@keyframes entity-breathe {
  50% {
    transform: scale(1.06);
    filter: drop-shadow(0 0 34px rgb(255 40 50 / 0.85));
  }
}
.who {
  margin: 0;
  font-family: var(--font-display);
  letter-spacing: 0.35em;
  color: var(--blood-bright, #e0323a);
  font-size: 0.85rem;
}
.title {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(1.6rem, 4vw, 2.4rem);
  letter-spacing: 0.04em;
  animation: title-in 0.6s ease-out both;
}
@keyframes title-in {
  from {
    opacity: 0;
    translate: 0 8px;
  }
}
.say {
  min-height: 6.5em;
  margin: 0;
  font-size: clamp(1.05rem, 2.2vw, 1.3rem);
  line-height: 1.75;
  white-space: pre-line;
  color: #efe9dd;
  text-shadow: 0 2px 10px rgb(0 0 0 / 0.9);
  cursor: pointer;
}
/* the words not spoken yet keep their place, so the text never jumps */
.rest {
  visibility: hidden;
}
.choices {
  display: grid;
  gap: 0.6rem;
  width: min(420px, 100%);
  transition: opacity 0.3s;
}
.choices.row {
  display: flex;
  justify-content: center;
  width: auto;
}
.waiting {
  opacity: 0.35;
}
.dots {
  display: flex;
  gap: 0.45rem;
}
.dots i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(255 255 255 / 0.25);
}
.dots i.on {
  background: var(--blood-bright, #e0323a);
  box-shadow: 0 0 8px rgb(224 50 58 / 0.8);
}
.sides {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  width: 100%;
  transition: opacity 0.3s;
}
.side {
  --tone: 217 162 39;
  display: grid;
  justify-items: center;
  gap: 0.35rem;
  padding: 1.1rem 0.9rem 1rem;
  border: 1px solid rgb(var(--tone) / 0.5);
  border-radius: 10px;
  background: linear-gradient(180deg, rgb(0 0 0 / 0.55), rgb(var(--tone) / 0.16));
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}
.side.killer {
  --tone: 224 50 58;
}
.side:hover,
.side:focus-visible {
  transform: translateY(-4px);
  box-shadow: 0 0 26px rgb(var(--tone) / 0.55);
}
.side img {
  width: 110px;
  height: 110px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 0 0 2px rgb(var(--tone) / 0.8);
}
.side strong {
  font-family: var(--font-display);
  font-size: 1.3rem;
}
.side small {
  color: var(--muted);
}
.side .go {
  margin-top: 0.3rem;
  color: rgb(var(--tone));
  font-weight: 700;
}
.skip {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 1;
  background: rgb(0 0 0 / 0.5);
}
.quiet {
  background: transparent;
}
.welcome-enter-active,
.welcome-leave-active {
  transition: opacity 0.6s ease;
}
.welcome-enter-from,
.welcome-leave-to {
  opacity: 0;
}
.realm-enter-active,
.realm-leave-active {
  transition: opacity 1.2s ease;
}
.realm-enter-from,
.realm-leave-to {
  opacity: 0;
}
@media (max-width: 560px) {
  .sides {
    grid-template-columns: 1fr;
  }
}
</style>
