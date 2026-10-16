# ดบดล Companion

**ดบดล Companion** (ดบดล = DBD, Dead by Daylight) is a companion web app for **Dead by Daylight: The Board Game** (Level 99 Games). The app icon, a campfire in the fog, is `public/icon.svg`. PNG sizes for home screens (`icon-192/512`, `icon-maskable-512`, `apple-touch-icon`) are rendered from it, and `public/manifest.webmanifest` makes the app installable on a tablet.
It runs on one device placed in the middle of the table. The game itself is played on the physical board; the app does **not** track game state. Its job is to get the table set up and to give everyone the Thai text of what's in play.

1. **Lobby**: choose 2–5 players (player 1 is the Killer) and assign the 4 Survivor seats (the rulebook's split by player count, p.19). The **Survivors pick their characters first**, in seat order. **Then the Killer picks a character, and then the map.** You can tap a character to read its board before picking it.
   **Game mode**: *Adept* (printed perks) or *Devout* (rulebook p.19). In Devout, after the map, each player in turn (Survivors, then the Killer) gets the device behind a hand-off screen and secretly picks 3 different perks. The choices are their own printed perks plus every shareable perk (perks 2–3 of each board) of their side. All picks are revealed together, and setup lists which perk cards to take from the decks.
2. **Table setup**: the rulebook p.6 setup steps as a checklist, with the numbers for the characters you picked (starting BP, killer tokens, movement-card rules for this player count, first player). Rulebook step 11 (start rooms) happens when you press **เริ่มเกม**. An animation rolls a skill check die for each mini (Survivors first in turn order, then the Killer) and drops it into the matching start room on the map. Each board has six rooms marked with a die face 0–5; they are listed in `src/data/maps.ts`.
3. **During play**: Thai text for the 5 characters in the game (perks, power, passive), all items, a short rules summary, rules search, and the map. Keeps the screen awake.

Also: the full card library (Thai/English) and the full Thai rules reference ([docs/rules-th.md](docs/rules-th.md)), with rulebook page citations.

The earlier game-tracker version (BP, hooks, generators, dice) is in git history at commit `1440d39`.

## Run

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build into dist/
```

## Project layout

| Path | What |
|---|---|
| `src/views/MenuView.vue` | The first screen: Online, Offline (full game) or Companion |
| `src/play/` | The full playable game, online and hot-seat — see [src/play/README.md](src/play/README.md) |
| `src/stores/lobby.ts` | Pinia store: players, seats, picks, map, setup checklist (saved in localStorage) |
| `src/views/LobbyView.vue`, `SetupView.vue`, `TableView.vue` | The three steps: lobby, table setup, and during play |
| `src/rulesDoc.ts` | Splits `docs/rules-th.md` into sections for the summary and search |
| `src/data/raw/*.json` | Hand-transcribed card data (source of truth) |
| `src/data/*.json` | Generated: raw data plus public image paths |
| `public/assets/` | Generated: de-duplicated, renamed WebP images |
| `scripts/build_assets.py` | Regenerates `public/assets/` and `src/data/*.json` from `_extract_dbd_assets/` |
| `docs/rules-th.md` | Thai rules reference |

## Regenerating assets

The raw asset pack (`_extract_dbd_assets/`, git-ignored) contains the images plus `_Rulebook.pdf`. After editing `src/data/raw/*.json` or the pack, run:

```sh
python -I scripts/build_assets.py .
```

Files named `X - Copy (n).webp` in the pack stand for physical component counts. The script keeps one image of each and writes the counts to `src/data/components.json`.

## Theme

"The Fog", after the Dead by Daylight menus. The design tokens (colours, fonts, grain) live in `src/style.css`. The backdrop scene is set in `src/App.vue`: the campfire lobby by default, then the chosen map's realm (`public/assets/app/background-img/background_<map id>.webp`) on the setup, table and start-roll screens. It adds slow fog, film grain and The Entity's red glow. Headings and buttons use Kanit in uppercase, body text uses Sarabun, and call-to-action buttons are red with cut corners.

## Extras

- **Sound** (`src/sound.ts`): every effect is synthesised with Web Audio, so there are no audio files. Effects: a heartbeat during the start roll (faster on the Killer's roll), dice rattle and landing, reel ticks, mini drop, an "Entity" swell for reveals, and escape and sacrifice stingers. The 🔊 button in the top bar mutes everything, and the setting is remembered. Recorded clips in `public/assets/app/sound/` replace the synthesised version of an effect. They are listed in `SOUND_FILES` in `src/sound.ts`; at the moment that is `escape.ogg` and `sacrifice.ogg`. Ambient music loops quietly and cross-fades between two tracks: `sound/theme/lobby-ambient.ogg` on the lobby and setup screens, and `sound/theme/during-play-ambient.ogg` once play starts. Every sound file is OGG (Vorbis): it loops without the gap an MP3 carries, and Safari has played it since 17. In the full game the killer standing on a survivor also brings up his **chase theme** (`sound/theme/chase/…`), in layers that build with the chase; the ambient track ducks under it. The cards, rules and history screens keep whichever track is already playing.
- **Particles and auras**:
  - Campfire embers rise behind the lobby and setup screens, and dark-red Entity motes drift during play (`Particles.vue`).
  - Characters glow with in-game-style auras: `.aura-survivor` is gold-white and `.aura-killer` is red with a heartbeat pulse (both in `style.css`). Hovering a character in the lobby lights its aura.
  - During play the Killer tab pulses the screen edge red (the terror radius), and perk cards lift and glow purple (own perk) or green (shareable).
  - Particles and motion are switched off under reduced motion.
- **Roulette reels** (`RouletteReel.vue`): the lobby's random buttons for survivors, killer and map spin a slot-machine reel before picking.
- **Loading screen** (`LoadingVeil.vue`, `src/loading.ts`): shown on the way into table setup and when the trial starts. It displays a quote from a survivor in the game or a rules tip. Tap to skip.
- **End game + history** (`EndGame.vue`, `HistoryView.vue`, `src/stores/history.ts`): 🏁 จบเกม asks which side won and shows a result screen ("หนีรอด" / "ถูกสังเวย"), then records the game on this device. ประวัติ shows the win rates and per-killer, per-survivor and per-map tallies.

## Notes

- The non-Thai item cards in the pack are printed in Portuguese, so items have Thai and Portuguese text but no English yet. In English mode the app shows the Thai text.
- Game artwork © Behaviour Interactive / Level 99 Games. This is a personal fan tool and is not for public distribution of the assets.
