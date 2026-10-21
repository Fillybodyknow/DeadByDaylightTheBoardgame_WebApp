<script setup lang="ts">
// "มีอะไรใหม่": the releases since the version the player last saw (all of them from the menu's
// button), as a dialog. Opens once after an update; see update.ts.
import { computed } from 'vue'
import { CHANGELOG, releasesSince } from '../changelog'
import ModalShell from '../play/components/ModalShell.vue'
import { update } from '../update'
import { APP_VERSION } from '../version'

const releases = computed(() => (update.since ? releasesSince(update.since) : CHANGELOG))
const when = (iso: string) => new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
</script>

<template>
  <ModalShell :open="update.panel" title="มีอะไรใหม่" width="520px" @close="update.panel = false">
    <p v-if="update.since" class="lead">แอปอัปเดตจาก v{{ update.since }} เป็น v{{ APP_VERSION }} แล้ว</p>
    <section v-for="r in releases" :key="r.version" class="release">
      <h3>v{{ r.version }} <small>{{ when(r.date) }}</small></h3>
      <ul>
        <li v-for="(item, i) in r.items" :key="i">{{ item }}</li>
      </ul>
    </section>
    <p v-if="!releases.length" class="lead">ยังไม่มีบันทึกการเปลี่ยนแปลง</p>
    <template #footer>
      <button type="button" class="primary" @click="update.panel = false">เข้าใจแล้ว</button>
    </template>
  </ModalShell>
</template>

<style scoped>
.lead {
  margin: 0 0 0.75rem;
  color: var(--muted);
}
.release {
  margin-bottom: 1rem;
}
.release h3 {
  margin: 0 0 0.35rem;
  color: var(--warn);
}
.release h3 small {
  margin-left: 0.5rem;
  color: var(--muted);
  font-weight: 400;
}
.release ul {
  margin: 0;
  padding-left: 1.2rem;
  display: grid;
  gap: 0.3rem;
}
</style>
