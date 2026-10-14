<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import DiceRoller from '../components/DiceRoller.vue'
import PerkButton from '../components/PerkButton.vue'
import Pips from '../components/Pips.vue'
import { items, killerById, maps, survivorById } from '../data'
import { asset, lang, tr } from '../i18n'
import {
  EXIT_GATE_PROGRESS_TO_OPEN,
  GENERATOR_PROGRESS_MAX,
  GENERATORS_TO_POWER_GATES,
  KILLER_BONUS_TURN_COST,
  PHASES,
  SACRIFICE_TRACK_LENGTH,
} from '../rules'
import { useGameStore } from '../stores/game'

const game = useGameStore()
const g = computed(() => game.state)
const killer = computed(() => (g.value ? killerById.get(g.value.killer.characterId) : undefined))
const map = computed(() => maps.find((m) => m.id === g.value?.mapId))
const showMap = ref(false)
const rescueTarget = ref<number | null>(null)

const activeSurvivor = computed(() =>
  g.value?.phase === 'survivors' ? game.turnOrder[g.value.turn] ?? null : null,
)

const T = {
  th: {
    round: 'รอบ',
    phases: { planning: 'วางแผน', survivors: 'ผู้รอดชีวิต', killer: 'ฆาตกร', cleanup: 'เก็บกวาด' },
    next: 'ถัดไป →',
    undo: '↶ ย้อน',
    newGame: 'เกมใหม่',
    map: 'แผนที่',
    hint: {
      planning: 'ผู้รอดชีวิตวางการ์ดเคลื่อนที่คว่ำคนละ 1 ใบ · ฆาตกรวาง 2 ใบ (ซ้าย → ขวา)',
      survivors: 'เปิดการ์ด → เคลื่อนที่ (เปิด prop 1 อัน) → Interact',
      killer: 'เปิดการ์ด → เคลื่อนที่ → Interact หรือใช้ Power (1 ครั้ง/รอบ)',
      cleanup: 'กด "ถัดไป" เพื่อ: +1 sacrifice ต่อคนบน hook → นำ Entity ออก → ส่ง First Player → เก็บการ์ด',
    },
    turnOf: 'ตาของ',
    killerTurn: 'เทิร์นฆาตกรที่',
    objectives: 'เป้าหมาย',
    generators: 'เครื่องปั่นไฟที่ซ่อมเสร็จ',
    revealed: 'เครื่องปั่นไฟที่เปิดแล้ว',
    addGen: '+ เปิดเครื่องปั่นไฟ',
    repair: 'ซ่อม',
    great: 'ซ่อม (5)',
    damage: 'ทำลาย',
    gates: 'ประตูทางออก',
    unpowered: `ยังไม่มีไฟ (ต้องซ่อมครบ ${GENERATORS_TO_POWER_GATES} เครื่อง)`,
    sacrifice: 'Sacrifice Progress',
    entity: 'Entity token อยู่บนกระดาน',
    power: 'ใช้ Power',
    bonus: `Bonus Turn (−${KILLER_BONUS_TURN_COST} ▲)`,
    freeBonus: 'Bonus Turn ฟรี',
    freeBonusHint: 'เมื่อ perk/power ให้ Bonus Turn โดยไม่ต้องจ่าย ▲ (เช่น Devour Hope) — ได้สูงสุด 1 ครั้ง/รอบ',
    searchHint: 'Search ตู้แล้วผู้รอดชีวิตทอยล้มเหลว → ถูกอุ้ม (หน้า 14)',
    attack: 'โจมตี',
    heal: 'รักษา',
    hide: 'ซ่อนในตู้',
    unhide: 'ออกจากตู้',
    hook: 'แขวน Hook',
    rescue: 'ช่วยลง',
    rescuedBy: 'ใครช่วย?',
    cancel: 'ยกเลิก',
    healthy: 'ปกติ',
    wounded: 'บาดเจ็บ',
    hidden: 'ในตู้',
    hooked: 'บน Hook',
    woundedNow: 'บาดเจ็บรอบนี้ (อุ้มไม่ได้)',
    token: 'ยังมี sacrifice token',
    item: 'ไอเทม',
    none: '— ไม่มี —',
    log: 'บันทึก',
    win: { survivors: 'ผู้รอดชีวิตชนะ! 🏃', killer: 'ฆาตกรชนะ! 🪝' },
    noGame: 'ยังไม่มีเกม',
    setup: 'ไปตั้งค่าเกม',
  },
  en: {
    round: 'Round',
    phases: { planning: 'Planning', survivors: 'Survivors', killer: 'Killer', cleanup: 'Cleanup' },
    next: 'Next →',
    undo: '↶ Undo',
    newGame: 'New game',
    map: 'Map',
    hint: {
      planning: 'Survivors place 1 movement card face down · Killer places 2 (left → right)',
      survivors: 'Reveal → Move (flip 1 prop) → Interact',
      killer: 'Reveal → Move → Interact or use Power (once per round)',
      cleanup: 'Press Next to: +1 sacrifice per hooked survivor → remove Entity → pass first player → pick up cards',
    },
    turnOf: 'Turn:',
    killerTurn: 'Killer turn',
    objectives: 'Objectives',
    generators: 'Generators completed',
    revealed: 'Revealed generators',
    addGen: '+ Reveal generator',
    repair: 'Repair',
    great: 'Repair (5)',
    damage: 'Damage',
    gates: 'Exit gates',
    unpowered: `Unpowered (complete ${GENERATORS_TO_POWER_GATES} generators)`,
    sacrifice: 'Sacrifice progress',
    entity: 'Entity token in play',
    power: 'Use power',
    bonus: `Bonus turn (−${KILLER_BONUS_TURN_COST} ▲)`,
    freeBonus: 'Free bonus turn',
    freeBonusHint: 'When a perk/power grants a bonus turn without paying ▲ (e.g. Devour Hope) — max once per round',
    searchHint: 'Locker Search failed → survivor is picked up (p.14)',
    attack: 'Attack',
    heal: 'Heal',
    hide: 'Hide in locker',
    unhide: 'Leave locker',
    hook: 'Hook',
    rescue: 'Rescue',
    rescuedBy: 'Rescued by?',
    cancel: 'Cancel',
    healthy: 'Healthy',
    wounded: 'Wounded',
    hidden: 'In locker',
    hooked: 'Hooked',
    woundedNow: 'Wounded this round (no pick up)',
    token: 'Sacrifice token on board',
    item: 'Item',
    none: '— none —',
    log: 'Log',
    win: { survivors: 'Survivors win! 🏃', killer: 'Killer wins! 🪝' },
    noGame: 'No game in progress',
    setup: 'Go to setup',
  },
}
const t = computed(() => T[lang.value])

function newGame() {
  if (confirm(lang.value === 'th' ? 'จบเกมนี้แล้วเริ่มใหม่?' : 'End this game and start over?')) game.reset()
}
</script>

<template>
  <div v-if="!g" class="card empty">
    <p>{{ t.noGame }}</p>
    <RouterLink to="/"><button type="button" class="primary">{{ t.setup }}</button></RouterLink>
  </div>

  <template v-else>
    <!-- round / phase bar -->
    <section class="card phasebar">
      <div class="round">
        <span class="muted">{{ t.round }}</span>
        <strong>{{ g.round }}</strong>
      </div>
      <ol class="steps">
        <li v-for="(p, i) in PHASES" :key="p" :class="{ done: i < game.phaseIndex, now: i === game.phaseIndex }">
          {{ t.phases[p] }}
        </li>
      </ol>
      <div class="turn">
        <template v-if="g.phase === 'survivors' && activeSurvivor !== null">
          {{ t.turnOf }} <strong>{{ game.survivorName(activeSurvivor) }}</strong>
        </template>
        <template v-else-if="g.phase === 'killer'">
          {{ t.killerTurn }} <strong>{{ g.turn }}</strong>
        </template>
      </div>
      <div class="buttons">
        <button type="button" :disabled="!game.history.length" @click="game.undo()">{{ t.undo }}</button>
        <button type="button" class="primary" :disabled="!!g.winner" @click="game.nextStep()">{{ t.next }}</button>
      </div>
      <p class="hint muted">{{ t.hint[g.phase] }}</p>
    </section>

    <div v-if="g.winner" class="winner" :class="g.winner">
      {{ t.win[g.winner] }}
      <button type="button" @click="newGame">{{ t.newGame }}</button>
    </div>

    <div class="layout">
      <!-- objectives -->
      <section class="card">
        <h3>{{ t.objectives }}</h3>

        <div class="track">
          <span>{{ t.generators }}</span>
          <Pips :value="g.generatorsCompleted" :max="GENERATORS_TO_POWER_GATES" color="var(--warn)" />
          <span class="stepper">
            <button type="button" @click="game.completedGenerators(-1)">−</button>
            <button type="button" @click="game.completedGenerators(1)">+</button>
          </span>
        </div>

        <div class="gens">
          <div class="muted small">{{ t.revealed }}</div>
          <div v-for="gen in g.generators" :key="gen.id" class="gen">
            <span>#{{ gen.id }}</span>
            <Pips :value="gen.progress" :max="GENERATOR_PROGRESS_MAX" color="var(--warn)" />
            <button type="button" @click="game.repair(gen.id, 'success')">{{ t.repair }} +1</button>
            <button type="button" @click="game.repair(gen.id, 'great')">{{ t.great }} +2</button>
            <button type="button" @click="game.damageGenerator(gen.id)">{{ t.damage }}</button>
            <button type="button" class="x" @click="game.removeGenerator(gen.id)">✕</button>
          </div>
          <button type="button" @click="game.addGenerator()">{{ t.addGen }}</button>
        </div>

        <div class="track">
          <span>{{ t.gates }}</span>
          <span v-if="!game.gatesPowered" class="muted small">{{ t.unpowered }}</span>
          <template v-else>
            <span v-for="(p, i) in g.gates" :key="i" class="gate">
              <Pips :value="p" :max="EXIT_GATE_PROGRESS_TO_OPEN" color="var(--ok)" />
              <button type="button" @click="game.gateProgress(i, 1)">+1</button>
            </span>
          </template>
        </div>

        <div class="track">
          <span>{{ t.sacrifice }}</span>
          <Pips :value="g.sacrifice" :max="SACRIFICE_TRACK_LENGTH" color="var(--blood)" />
          <span class="stepper">
            <button type="button" @click="game.sacrificeProgress(-1)">−</button>
            <button type="button" @click="game.sacrificeProgress(1)">+</button>
          </span>
        </div>

        <label class="entity">
          <input type="checkbox" :checked="g.entityInPlay" @change="game.toggleEntity()" />
          <img :src="asset('assets/tokens/entity.webp')" alt="" /> {{ t.entity }}
        </label>

        <button v-if="map" type="button" class="maptoggle" @click="showMap = !showMap">🗺 {{ t.map }}: {{ map.name }}</button>
        <img v-if="showMap && map" class="map" :src="asset(map.image)" :alt="map.name" />
      </section>

      <!-- killer -->
      <section v-if="killer" class="card player killer" :class="{ active: g.phase === 'killer' }">
        <header>
          <img :src="asset(killer.images.mini)" :alt="killer.name" />
          <div>
            <RouterLink :to="`/cards/killer/${killer.id}`"><strong>{{ killer.name }}</strong></RouterLink>
            <div class="bp">
              <button type="button" @click="game.killerBp(-1)">−</button>
              <span><img :src="asset('assets/tokens/bloodpoint.webp')" alt="BP" /> {{ g.killer.bp }} / {{ game.killerBpMax }}</span>
              <button type="button" @click="game.killerBp(1)">+</button>
            </div>
          </div>
        </header>
        <div class="row">
          <button type="button" :disabled="g.killer.powerUsed" :title="tr(killer.power.text)" @click="game.activateKillerPower()">
            ⚡ {{ t.power }}: {{ killer.power.name }}
          </button>
          <button v-if="killer.extraAction" type="button" :disabled="!game.canBuyBonusTurn" @click="game.killerBonusTurn()">
            {{ t.bonus }}
          </button>
          <button type="button" :disabled="!game.canFreeBonusTurn" :title="t.freeBonusHint" @click="game.killerBonusTurn(true)">
            {{ t.freeBonus }}
          </button>
        </div>
        <div class="perks">
          <PerkButton
            v-for="(p, i) in killer.perks"
            :key="p.name"
            :perk="p"
            :used="g.killer.perksUsed[i]"
            :affordable="g.killer.bp >= p.cost"
            @activate="game.activateKillerPerk(i)"
          />
        </div>
      </section>

      <!-- survivors -->
      <section
        v-for="(s, i) in g.survivors"
        :key="s.characterId"
        class="card player"
        :class="{ active: activeSurvivor === i, hooked: s.status === 'hooked', wounded: s.health === 'wounded' }"
      >
        <header>
          <img :src="asset(survivorById.get(s.characterId)?.images.mini)" alt="" />
          <div>
            <RouterLink :to="`/cards/survivor/${s.characterId}`"><strong>{{ game.survivorName(i) }}</strong></RouterLink>
            <span v-if="g.firstPlayer === i" class="first" :title="'First player'">
              <img :src="asset('assets/tokens/first-player.webp')" alt="1st" />
            </span>
            <div class="tags">
              <span :class="s.health">{{ t[s.health] }}</span>
              <span v-if="s.status !== 'active'" class="status">{{ t[s.status] }}</span>
              <span v-if="s.woundedThisRound" class="small muted">· {{ t.woundedNow }}</span>
            </div>
            <div class="bp">
              <button type="button" @click="game.survivorBp(i, -1)">−</button>
              <span><img :src="asset('assets/tokens/bloodpoint.webp')" alt="BP" /> {{ s.bp }} / {{ game.survivorBpMax(i) }}</span>
              <button type="button" @click="game.survivorBp(i, 1)">+</button>
            </div>
          </div>
        </header>

        <div v-if="rescueTarget === i" class="row">
          <span>{{ t.rescuedBy }}</span>
          <template v-for="(r, j) in g.survivors" :key="r.characterId">
            <button v-if="j !== i && r.status === 'active'" type="button" @click="game.rescue(i, j); rescueTarget = null">
              {{ game.survivorName(j) }}
            </button>
          </template>
          <button type="button" @click="rescueTarget = null">{{ t.cancel }}</button>
        </div>
        <div v-else class="row">
          <template v-if="s.status !== 'hooked'">
            <template v-if="s.status === 'active'">
              <button v-if="s.health === 'healthy'" type="button" @click="game.attack(i)">🔪 {{ t.attack }}</button>
              <button v-else type="button" @click="game.heal(i)">🩹 {{ t.heal }}</button>
            </template>
            <button type="button" @click="game.toggleHide(i)">{{ s.status === 'hidden' ? t.unhide : t.hide }}</button>
            <button type="button" :disabled="!game.canHook(i)" :title="s.status === 'hidden' ? t.searchHint : ''" @click="game.hook(i)">
              🪝 {{ t.hook }}
            </button>
          </template>
          <button v-else type="button" @click="rescueTarget = i">🤝 {{ t.rescue }}</button>
          <span v-if="s.hasSacrificeToken" class="token" :title="t.token">
            <img :src="asset('assets/tokens/sacrifice-progress.webp')" :alt="t.token" />
          </span>
        </div>

        <label class="item">
          {{ t.item }}
          <select :value="s.itemId ?? ''" @change="game.setItem(i, ($event.target as HTMLSelectElement).value || null)">
            <option value="">{{ t.none }}</option>
            <option v-for="it in items" :key="it.id" :value="it.id">{{ tr(it.name) }}</option>
          </select>
          <RouterLink v-if="s.itemId" :to="`/cards/item/${s.itemId}`" class="small">ℹ</RouterLink>
        </label>

        <div class="perks">
          <PerkButton
            v-for="(p, pi) in survivorById.get(s.characterId)?.perks ?? []"
            :key="p.name"
            :perk="p"
            :used="s.perksUsed[pi]"
            :affordable="s.bp >= p.cost && s.status === 'active'"
            @activate="game.activateSurvivorPerk(i, pi)"
          />
        </div>
      </section>

      <DiceRoller />

      <section class="card log">
        <h3>{{ t.log }}</h3>
        <ol>
          <li v-for="(e, i) in g.log.slice(0, 40)" :key="i"><span class="muted">R{{ e.round }}</span> {{ e.text }}</li>
        </ol>
        <button type="button" class="small" @click="newGame">{{ t.newGame }}</button>
      </section>
    </div>
  </template>
</template>

<style scoped>
.empty {
  text-align: center;
}
.phasebar {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.5rem 1rem;
  align-items: center;
  position: sticky;
  top: 3.2rem;
  z-index: 5;
}
.round {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
}
.round strong {
  font-size: 1.8rem;
  color: var(--blood);
}
.steps {
  display: flex;
  gap: 0.25rem;
  list-style: none;
  margin: 0;
  padding: 0;
  flex-wrap: wrap;
}
.steps li {
  padding: 0.3rem 0.6rem;
  border-radius: 6px;
  background: var(--bg-hover);
  color: var(--muted);
  font-size: 0.9rem;
}
.steps li.done {
  opacity: 0.5;
}
.steps li.now {
  background: var(--blood);
  color: #fff;
  font-weight: 700;
}
.turn {
  grid-column: 2;
}
.buttons {
  grid-row: 1 / span 2;
  grid-column: 3;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.hint {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 0.85rem;
}
.winner {
  margin: 1rem 0;
  padding: 1rem;
  border-radius: var(--radius);
  font-size: 1.5rem;
  font-weight: 800;
  text-align: center;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
}
.winner.survivors {
  background: #1d4d2a;
}
.winner.killer {
  background: var(--blood-dim);
}
.layout {
  display: grid;
  gap: 0.75rem;
  margin-top: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}
.track {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin: 0.6rem 0;
}
.track > span:first-child {
  min-width: 9rem;
}
.stepper button,
.bp button {
  padding: 0.1rem 0.6rem;
}
.gens {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.5rem;
  border: 1px dashed var(--line);
  border-radius: 8px;
}
.gen {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
.gen button {
  padding: 0.2rem 0.5rem;
  font-size: 0.85rem;
}
.gate {
  display: inline-flex;
  gap: 0.35rem;
  align-items: center;
}
.entity {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.entity img {
  height: 1.5rem;
}
.maptoggle {
  margin-top: 0.75rem;
}
.map {
  width: 100%;
  margin-top: 0.5rem;
  border-radius: 8px;
}
.player header {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}
.player header > img {
  width: 64px;
  height: 64px;
  object-fit: contain;
  background: #000;
  border-radius: 8px;
}
.player.active {
  border-color: var(--blood);
  box-shadow: 0 0 0 2px var(--blood);
}
.player.hooked {
  opacity: 0.75;
  background: repeating-linear-gradient(-45deg, var(--bg-raised), var(--bg-raised) 10px, #1e1215 10px, #1e1215 20px);
}
.player.wounded header > img {
  box-shadow: 0 0 0 3px var(--blood);
}
.player.killer {
  background: linear-gradient(160deg, #2a1012, var(--bg-raised) 60%);
}
.first img {
  height: 1.2rem;
  vertical-align: middle;
  margin-left: 0.3rem;
}
.tags {
  display: flex;
  gap: 0.4rem;
  font-size: 0.85rem;
}
.tags .healthy {
  color: var(--ok);
}
.tags .wounded {
  color: var(--blood);
}
.status {
  color: var(--warn);
}
.bp {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.2rem;
}
.bp img {
  height: 1rem;
  vertical-align: -0.15em;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0.6rem 0;
  align-items: center;
}
.row button {
  font-size: 0.9rem;
  padding: 0.3rem 0.6rem;
}
.token img {
  height: 1.6rem;
}
.item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}
.item select {
  padding: 0.2rem 0.4rem;
}
.perks {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.6rem;
}
.log ol {
  list-style: none;
  padding: 0;
  margin: 0 0 0.75rem;
  max-height: 260px;
  overflow-y: auto;
  font-size: 0.85rem;
}
.small {
  font-size: 0.8rem;
}
.x {
  padding: 0.1rem 0.4rem;
}
@media (max-width: 640px) {
  .phasebar {
    grid-template-columns: auto 1fr;
    top: 3rem;
  }
  .buttons {
    grid-row: auto;
    grid-column: 1 / -1;
    flex-direction: row;
  }
  .buttons button {
    flex: 1;
  }
  .turn {
    grid-column: 1 / -1;
  }
}
</style>
