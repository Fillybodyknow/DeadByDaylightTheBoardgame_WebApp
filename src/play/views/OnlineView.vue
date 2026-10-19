<script setup lang="ts">
// Online: each player on their own device. No room yet → create or join one; in a room → its
// lobby and character picks, then the shared game.
import GameScreen from '../components/GameScreen.vue'
import OnlineEntry from '../components/OnlineEntry.vue'
import OnlineRoom from '../components/OnlineRoom.vue'
import TrialIntro from '../components/TrialIntro.vue'
import { game } from '../game'
import { closeOnlineGame, isHost, leaveRoom, returnToLobby, session, stillInGame } from '../online/session'
</script>

<template>
  <!-- one root that stays: the app's page transition animates it once, not each swap inside (a
       swapping root is left stuck in its entering state, invisible). display: contents keeps the
       layout as if it weren't there. -->
  <div class="online-view">
    <template v-if="session.data">
      <!-- the game is over and this player went back: wait for the others (the room resets then) -->
      <section v-if="session.data.game && session.data.members[session.me]?.back" class="card waiting">
        <h2>กลับ Lobby แล้ว</h2>
        <p>รอผู้เล่นคนอื่นออกจากหน้าสรุปเกม — ห้องจะกลับไปที่ Lobby เมื่อทุกคนกดกลับ</p>
        <p class="muted">ยังดูสรุปเกมอยู่: {{ stillInGame.map((s) => s.name).join(', ') }}</p>
        <div class="actions">
          <button @click="returnToLobby(false)">ดูสรุปเกมอีกครั้ง</button>
          <button v-if="isHost" class="primary" @click="closeOnlineGame()">พาทุกคนกลับ Lobby ตอนนี้</button>
          <button @click="leaveRoom()">ออกจากห้อง</button>
        </div>
      </section>
      <template v-else-if="session.data.game && game">
        <GameScreen :st="game" />
        <TrialIntro :st="game" />
      </template>
      <OnlineRoom v-else />
    </template>
    <OnlineEntry v-else />
  </div>
</template>

<style scoped>
.online-view {
  display: contents;
}
.waiting {
  max-width: 560px;
  margin: 2rem auto;
  display: grid;
  gap: 0.6rem;
}
.waiting h2,
.waiting p {
  margin: 0;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
</style>
