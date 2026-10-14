# DeadByDaylightTheBoardgame_WebApp

Companion web app for **Dead by Daylight: The Board Game** (Level 99 Games). Players keep using the physical board and minis; the app tracks everything else.

- **Setup**: pick the Killer, 4 Survivors, map and first player
- **Game tracker**: round and phase (Planning → Survivors → Killer → Cleanup), whose turn it is, Bloodpoints, perks and power once per round, Killer bonus turn, wounds, lockers, hooks and rescues, generators, exit gates, the sacrifice track, the Entity token, and the win conditions. Undo is available and the state survives a reload.
- **Dice**: skill check (1–4 dice) and danger die, with one re-roll per die. A failure gives the Killer +1 BP.
- **Cards**: every Survivor, Killer and Item in Thai and English, with the original board images
- **Rules**: Thai rules reference ([docs/rules-th.md](docs/rules-th.md)), with rulebook page citations

## Run

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build into dist/
```

## Project layout

| Path | What |
|---|---|
| `src/stores/game.ts` | Pinia store: all game state and rule logic |
| `src/rules.ts` | Numeric rules constants and die faces (with rulebook pages) |
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

## Notes

- The non-Thai item cards in the pack are printed in Portuguese, so items have Thai and Portuguese text but no English yet. In English mode the app shows the Thai text.
- Game artwork © Behaviour Interactive / Level 99 Games. This is a personal fan tool and is not for public distribution of the assets.
