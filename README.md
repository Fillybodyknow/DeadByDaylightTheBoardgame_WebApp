# ดบดล — Dead by Daylight: The Board Game

**ดบดล** (= DBD, Dead by Daylight) is a web app for **Dead by Daylight: The Board Game** (Level 99 Games): the full game online or on one device (`src/play`, see [src/play/README.md](src/play/README.md)), with a tutorial for new players, the card library and the Thai rules. The app icon, the skill check die's great success face (the struck-through tally, `public/assets/dice/skill-3.webp`) over its failure face, very faint (the skull, `skill-6.webp`), both embedded in it, is `public/icon.svg`. PNG sizes for home screens (`icon-192/512`, `icon-maskable-512`, `apple-touch-icon`) are rendered from it, and `public/manifest.webmanifest` makes the app installable on a tablet.
The card library (Thai/English) and the Thai rules reference ([docs/rules-th.md](docs/rules-th.md)) cite the rulebook pages.

The companion for the physical board game (lobby, table setup, Thai text during play, game history) was removed in 1.12.0; it is in git history before that.

## Run

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build into dist/
```

## Project layout

| Path | What |
|---|---|
| `src/views/MenuView.vue` | The first screen: Online, Offline, Tutorial |
| `src/play/` | The full playable game, online and hot-seat — see [src/play/README.md](src/play/README.md) |
| `src/rulesDoc.ts` | Renders `docs/rules-th.md` for the rules page |
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

"The Fog", after the Dead by Daylight menus. The design tokens (colours, fonts, grain) live in `src/style.css`. The backdrop scene is set in `src/App.vue`: the campfire lobby by default, then the map's realm (`public/assets/app/background-img/background_<map id>.webp`) during a game. It adds slow fog, film grain and The Entity's red glow. Headings and buttons use Kanit in uppercase, body text uses Sarabun, and call-to-action buttons are red with cut corners.

## Extras

- **Sound** (`src/sound.ts`): every effect is synthesised with Web Audio, so there are no audio files. Effects: a heartbeat during the start roll (faster on the Killer's roll), dice rattle and landing, reel ticks, mini drop, an "Entity" swell for reveals, and escape and sacrifice stingers. The 🔊 button in the top bar mutes everything, and the setting is remembered. Recorded clips in `public/assets/app/sound/` replace the synthesised version of an effect. They are listed in `SOUND_FILES` in `src/sound.ts`; at the moment that is `escape.ogg` and `sacrifice.ogg`. Ambient music loops quietly and cross-fades between two tracks: `sound/theme/lobby-ambient.ogg` on the menu and the game's setup and rooms, and `sound/theme/during-play-ambient.ogg` once play starts. Every sound file is OGG (Vorbis): it loops without the gap an MP3 carries, and Safari has played it since 17. In the full game the killer standing on a survivor also brings up his **chase theme** (`sound/theme/chase/…`), in layers that build with the chase; the ambient track ducks under it. The cards and rules screens keep whichever track is already playing.
- **Particles and auras**:
  - Campfire embers rise behind the menu and the game's setup and rooms, and dark-red Entity motes drift during play (`Particles.vue`).
  - Characters glow with in-game-style auras: `.aura-survivor` is gold-white and `.aura-killer` is red with a heartbeat pulse (both in `style.css`).
  - Particles and motion are switched off under reduced motion.
- **Roulette reels** (`RouletteReel.vue`): the character picker's random buttons spin a slot-machine reel before picking.

## Notes

- The non-Thai item cards in the pack are printed in Portuguese, so items have Thai and Portuguese text but no English yet. In English mode the app shows the Thai text.
- Game artwork © Behaviour Interactive / Level 99 Games. This is a personal fan tool and is not for public distribution of the assets.
