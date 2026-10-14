"""Copy raw assets from _extract_dbd_assets/ into public/assets/ with clean names.

Duplicate files ("X - Copy (n).webp") represent physical component counts; only one
image is kept and the count is written to src/data/components.json.
Character/item images are mapped via the "source" fields in src/data/*.json.

Usage: python -I scripts/build_assets.py <repo-root>
"""
import json
import re
import shutil
import sys
from collections import Counter
from pathlib import Path

from PIL import Image

root = Path(sys.argv[1])
src = root / "_extract_dbd_assets"
out = root / "public" / "assets"
data = root / "src" / "data"

HASH = re.compile(r"^[0-9A-F]{40}_")
COPY = re.compile(r" - Copy( \(\d+\))?(?=\.webp$)")


def canonical(p: Path) -> str:
    return COPY.sub("", HASH.sub("", p.name))


def count_in(folder: Path, name: str) -> int:
    return sum(1 for f in folder.glob("*.webp") if canonical(f) == name)


def find(folder: Path, name: str) -> Path:
    for f in sorted(folder.glob("*.webp")):
        if canonical(f) == name:
            return f
    raise FileNotFoundError(f"{folder}/{name}")


def put(source: Path, dest: str) -> str:
    target = out / dest
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    return f"assets/{dest}"


if out.exists():
    shutil.rmtree(out)
data.mkdir(parents=True, exist_ok=True)

components: dict = {}

# --- simple renamed assets: (folder, canonical name, dest, component key or None)
SIMPLE = [
    ("", "TokenBP.webp", "tokens/bloodpoint.webp", "bloodpoint"),
    ("", "TokenEntity.webp", "tokens/entity.webp", "entity"),
    ("", "TokenProgressGen.webp", "tokens/generator-progress.webp", "generatorProgress"),
    ("", "TokenSacrificeProgress.webp", "tokens/sacrifice-progress.webp", "sacrificeProgress"),
    ("", "FirstPlayerMarker.webp", "tokens/first-player.webp", "firstPlayer"),
    ("", "TokenBreakableWall.webp", "tokens/breakable-wall.webp", "breakableWall"),
    ("props/Objective", "TokenGenerator.webp", "props/generator.webp", "generator"),
    ("props/Objective", "TokenExit.webp", "props/exit-gate.webp", "exitGate"),
    ("props/Objective", "TokenObjectiveBack.webp", "props/back-objective.webp", None),
    ("props/Boldness", "TokenHook.webp", "props/hook.webp", "hook"),
    ("props/Boldness", "TokenTotem.webp", "props/totem.webp", "totem"),
    ("props/Boldness", "tokenBoldnessBack.webp", "props/back-boldness.webp", None),
    ("props/Altruism", "TokenPallet.webp", "props/pallet.webp", "pallet"),
    ("props/Altruism", "TokenCrow.webp", "props/crow.webp", "crow"),
    ("props/Altruism", "TokenAltruismBack.webp", "props/back-altruism.webp", None),
    ("props/TokenSurvival", "TokenChest.webp", "props/chest.webp", "chest"),
    ("props/TokenSurvival", "TokenLocker.webp", "props/locker.webp", "locker"),
    ("props/TokenSurvival", "TokenSurvivalBack.webp", "props/back-survival.webp", None),
    ("props/Objective/for_The_Skull_Merchant", "skullmerchant_drone.webp", "props/skullmerchant-drone.webp", "skullmerchantDrone"),
    ("props/TokenSurvival/For_The_Singularity", "singularity_emp.webp", "props/singularity-emp.webp", "singularityEmp"),
    ("item_cards", "back_card.webp", "items/back.webp", None),
    # The Knight's three Guards, referenced as {CARNIFEX}/{ASSASSIN}/{JAILER} in his passive
    ("killer/miniature", "knight_carnifex.webp", "killers/tokens/knight-carnifex.webp", None),
    ("killer/miniature", "knight_assassin.webp", "killers/tokens/knight-assassin.webp", None),
    ("killer/miniature", "knight_jailer.webp", "killers/tokens/knight-jailer.webp", None),
]
for folder, name, dest, key in SIMPLE:
    f = src / folder
    put(find(f, name), dest)
    if key:
        components[key] = {"image": f"assets/{dest}", "count": count_in(f, name)}

MAPS = {
    "AutohavenMapRecreated.webp": "autohaven",
    "MacMillanRecreated.webp": "macmillan",
    "OrmondRecreated.webp": "ormond",
    "CrotusRecreated.webp": "crotus-prenn",
    "map_forsakenboneyard.webp": "forsaken-boneyard",
    "map_witheredisle.webp": "withered-isle",
}
for name, mid in MAPS.items():
    put(find(src / "maps", name), f"maps/{mid}.webp")

movement = {}
for name in ["Sneak", "Sprint", "Crouch", "Vault", "Wait", "One", "Two", "Three", "Four", "Five", "Skull"]:
    key = name.lower()
    dest = f"movement/{key}.webp" if name in ("Sneak", "Sprint", "Crouch", "Vault", "Wait") else f"movement/back-{key}.webp"
    movement[key] = {"image": put(find(src / "movement_card", f"{name}.webp"), dest), "count": count_in(src / "movement_card", f"{name}.webp")}
components["movementCards"] = movement

# --- dice: each texture is a 3x3 grid; faces occupy the bottom two rows
def crop_die(path: Path, prefix: str) -> list[str]:
    faces = []
    with Image.open(path) as im:
        w, h = im.size
        cw, ch = w // 3, h // 3
        for row in (1, 2):
            for col in range(3):
                n = len(faces) + 1
                target = out / "dice" / f"{prefix}-{n}.webp"
                target.parent.mkdir(parents=True, exist_ok=True)
                im.crop((col * cw, row * ch, (col + 1) * cw, (row + 1) * ch)).save(target, "WEBP", quality=90)
                faces.append(f"assets/dice/{prefix}-{n}.webp")
    return faces

components["dangerDieFaces"] = crop_die(find(src / "dice_face/dangerdie", "dieCrit.webp"), "danger")
components["skillDieFaces"] = crop_die(find(src / "dice_face/skillcheck", "dieSkill.webp"), "skill")

# --- characters & items: map via JSON "source" fields
def remap(kind: str, entries: list, folder: str) -> None:
    for e in entries:
        s = e.pop("source")
        img = {}
        for key, dest in (("boardEn", "board-en"), ("boardTh", "board-th"), ("mini", "mini")):
            if s.get(key):
                img[key] = put(src / s[key], f"{folder}/{dest}/{e['id']}.webp")
        e["images"] = img
        for t in e.get("tokens", []):
            slug = re.sub(r"[^a-z0-9]+", "-", t["name"].lower()).strip("-")
            t["image"] = put(src / t.pop("source"), f"{folder}/tokens/{e['id']}-{slug}.webp")


def load(name: str):
    p = data / "raw" / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


for kind, folder in (("survivors", "survivors"), ("killers", "killers")):
    entries = load(f"{kind}.json")
    if entries is None:
        print(f"skip {kind}: src/data/raw/{kind}.json missing")
        continue
    remap(kind, entries, folder)
    (data / f"{kind}.json").write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

items = load("items.json")
if items is not None:
    for it in items:
        s = it.pop("source")
        # The non-Thai item cards in the source pack are printed in Portuguese.
        lang_of = {"en": "pt", "th": "th"}
        it["images"] = {lang_of[k]: put(src / v, f"items/{lang_of[k]}/{it['id']}.webp") for k, v in s.items() if v}
    (data / "items.json").write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

(data / "components.json").write_text(json.dumps(components, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

files = list(out.rglob("*.webp"))
print(f"wrote {len(files)} files, {sum(f.stat().st_size for f in files) / 1048576:.1f}MB")
