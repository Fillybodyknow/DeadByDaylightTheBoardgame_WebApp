<script setup lang="ts">
// The top bar's profile, as a PC game's: the player's initial in a ring and their name; a click
// opens the profile window to set the name (src/profile.ts). Without a name it asks for one.
import { computed, ref, watch } from 'vue'
import { sfx } from '../sound'
import ModalShell from '../play/components/ModalShell.vue'
import { session } from '../play/online/session'
import { NAME_MAX, closeProfile, openProfile, playerName, profileOpen, profileReason, setPlayerName } from '../profile'

/** The name's first letter for the ring: a Thai leading vowel (เ แ โ ใ ไ) gives way to its consonant. */
const initialOf = (n: string) => (n.trim().replace(/^[เแโใไ]/, '').charAt(0) || n.trim().charAt(0)).toUpperCase() || '?'

const draft = ref('')
watch(profileOpen, (on) => {
  if (on) draft.value = playerName.value
})

function open() {
  sfx.click()
  openProfile()
}
function save() {
  if (!draft.value.trim()) return
  sfx.select()
  setPlayerName(draft.value)
  closeProfile(true)
}

/** In a room now: the new name shows there too. */
const room = computed(() => (session.room && session.data?.members[session.me] ? session.room.code : null))
</script>

<template>
  <button type="button" class="profile" :class="{ unnamed: !playerName }" :title="playerName ? 'โปรไฟล์ — เปลี่ยนชื่อ' : 'ตั้งชื่อผู้เล่น'" @click="open">
    <span class="avatar" aria-hidden="true">{{ initialOf(playerName) }}</span>
    <span class="who">{{ playerName || 'ตั้งชื่อ' }}</span>
  </button>

  <ModalShell :open="profileOpen" title="โปรไฟล์ผู้เล่น" width="420px" over @close="closeProfile(false)">
    <div class="card">
      <span class="avatar big" aria-hidden="true">{{ initialOf(draft) }}</span>
      <label class="field">
        <small>ชื่อผู้เล่น</small>
        <input v-model="draft" :maxlength="NAME_MAX" placeholder="เช่น บิว" autocomplete="nickname" @keyup.enter="save" />
      </label>
    </div>
    <p v-if="profileReason" class="reason">{{ profileReason }}</p>
    <p class="muted small">
      ชื่อนี้ใช้ในห้องออนไลน์และห้องหาผู้เล่น เก็บไว้ในเครื่องนี้<template v-if="room"> · เปลี่ยนในห้อง {{ room }} ด้วย</template>
    </p>
    <template #footer>
      <button type="button" @click="closeProfile(false)">ยกเลิก</button>
      <button type="button" class="primary" :disabled="!draft.trim()" @click="save">บันทึก</button>
    </template>
  </ModalShell>
</template>

<style scoped>
.profile {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  max-width: 190px;
  padding: 0.25rem 0.75rem 0.25rem 0.3rem;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  background: rgb(8 9 12 / 0.7);
}
.profile:hover {
  border-color: var(--blood);
}
.who {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-display);
}
.avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  font-family: var(--font-display);
  font-size: 0.95rem;
  color: #fff;
  background: radial-gradient(circle at 35% 30%, #4a0d10, #12080a);
  box-shadow:
    0 0 0 2px var(--blood),
    0 0 10px rgb(255 30 30 / 0.4);
}
/* no name yet: the button calls for one */
.unnamed {
  border-color: rgb(255 213 106 / 0.7);
  animation: call 1.8s ease-in-out infinite;
}
.unnamed .who {
  color: #ffd56a;
}
@keyframes call {
  50% {
    box-shadow: 0 0 14px rgb(255 213 106 / 0.45);
  }
}
.card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.9rem;
  border: 1px solid var(--line-strong);
  background: rgb(0 0 0 / 0.35);
}
.avatar.big {
  width: 64px;
  height: 64px;
  font-size: 1.9rem;
  box-shadow:
    0 0 0 2px var(--blood),
    0 0 18px rgb(255 30 30 / 0.5);
}
.field {
  display: grid;
  gap: 0.25rem;
  flex: 1;
  min-width: 0;
}
.field small {
  color: var(--muted);
}
.field input {
  font: inherit;
  font-family: var(--font-display);
  font-size: 1.2rem;
  color: var(--text);
  background: rgb(0 0 0 / 0.5);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  padding: 0.45rem 0.7rem;
  outline: none;
}
.field input:focus {
  border-color: var(--blood);
}
.reason {
  margin: 0.8rem 0 0;
  padding: 0.45rem 0.7rem;
  border: 1px solid rgb(255 213 106 / 0.6);
  background: rgb(255 213 106 / 0.08);
  color: #ffd56a;
}
.small {
  margin: 0.7rem 0 0;
  font-size: 0.85rem;
}
@media (max-width: 760px) {
  /* narrow: the ring alone */
  .profile {
    padding: 0.2rem;
  }
  .who {
    display: none;
  }
}
</style>
