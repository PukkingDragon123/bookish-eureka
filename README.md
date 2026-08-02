# Ritual Beasts

**A habit-powered idle RPG.** Your real life is the power source: drink water, eat well,
cook, walk, exercise, and create — every real-world ritual becomes mana, XP and evolution
essence for a world of 336 collectible pixel beasts, each with its own dex entry, skills,
passives and ultimate.

No installs, no build step, no server. Open `index.html`, or grab the single-file build in
`dist/ritual-beasts.html` and open that anywhere — it has every asset inlined and needs no
network at all.

| Battle + fusion camp | Farm | Gacha banners |
|---|---|---|
| ![Battle](docs/screenshots/battle.png) | ![Farm](docs/screenshots/farm.png) | ![Banners](docs/screenshots/banners.png) |

| 10-pull | Quests + login | Region map | Beast page |
|---|---|---|---|
| ![Pulls](docs/screenshots/pulls.png) | ![Quests](docs/screenshots/quests.png) | ![Map](docs/screenshots/map.png) | ![Creature](docs/screenshots/creature.png) |

**v3:** warm wood/nature UI, packs of up to 3 enemies that walk in (attack dashes, death
falls, party advances between waves), cookie-clicker battle upgrades, a merge board under
the battle scene (portal-spawned weapons/armor/charms, drag to fuse tiers, board-wide party
boosts), a real-time farm growing 9 element foods that level your beasts (seeds come from
logging real meals — a photo earns a bonus seed), Genshin-style element banners with 10-pulls
and a wish animation, The Lab (lab-point gacha: mutations, serums, skill grafts), 7-day login
rewards, a personalized challenge-of-the-day with real links (GeoGuessr, Scratch, Wordle…),
a quest log on the battle screen, timed cache-digging encounters, a region map, and a defeat
screen that tells you how to come back stronger. All 326 sprites re-audited and normalized
to one pixel density (tools/pixelate.py).

## How real life powers the game

| You do this (for real) | The game gives you |
|---|---|
| Morning check-in | Dawn Blessing: +15% gold & XP for 4 hours |
| Drink a glass of water (×8/day) | +12 mana toward your next summon |
| Log a healthy meal | Mana + XP + essence, and it feeds the calorie ring |
| Cook something | Bonus essence |
| Finish the day within your calorie target | Gems + essence bonus the next morning |
| Walk (real countdown timer) | Minutes → mana & essence |
| Exercise session (real timer: 10–60 min) | **x3 idle rewards for twice the duration** + essence |
| Create / practice (real timer) | Deep-work minutes → essence |
| Your own custom rituals | Mana + XP, once per day |

Habits are never punished — missing a day just pauses your streak bonus. The tone is
"feed your beasts", not "you failed".

## Every beast has a kit

Each of the 336 creatures gets its own deterministic loadout, derived from its id so it is
identical every session:

- **2 active skills** — a fast basic and a heavier hitter, each typed, on its own cooldown,
  with a matching pixel effect and an on-screen name banner when it fires.
- **1 ultimate** — charges as your party deals damage; on release it flashes the screen,
  shakes the scene and lands a hit worth several hundred percent of a normal attack.
- **4 passives** — unlocked at levels 5 / 12 / 22 / 35. They feed the whole party: attack,
  vitality, crit, gold, mana, essence, XP, attack speed, ultimate charge rate, lifesteal.
- **A dex entry** — habitat, temperament, and a line about how the beast responds to *your*
  consistency, written from the creature's type, stage and rarity.

## The game around it

- **Idle auto-battler** — your party of up to 4 beasts fights waves across 4 areas
  (Dewy Meadow, Sunwash Plains, Whisperfall Ruins, Frostpeak Pass), 10 stages each, looping
  into higher tiers. Wave 10 is a timed boss.
- **336 creatures** with 9 elemental types, a type-effectiveness chart, party synergy,
  rarities up to legendary, and **26 evolution lines** — evolving needs levels *and* essence,
  which only real-life rituals produce in volume.
- **Summoning** — mana or gems fuel the circle, with pity protection and relic drops.
- **Personalized quests** — pick 1–2 life goals at the start (Move More / Eat Better /
  Clear Mind / Create Daily); you get a matching starter and daily quests built from them.
- **Offline progress** — your party keeps fighting while you're away (up to 12h); an active
  exercise boost multiplies it.

## Look and feel

Everything on screen is custom pixel art with no external dependencies:

- **RitualPixel**, a 5×7 bitmap font built glyph-by-glyph and compiled to a real TTF
  (`tools/make-font.py`), embedded as a data URI.
- **A 31-icon spritesheet** hand-authored as colour-keyed pixel maps
  (`tools/make-ui-art.py`) — currency, stats, elements, rituals, UI marks. No emoji anywhere.
- **Canvas VFX** (`js/vfx.js`) drawn on a virtual pixel grid: fire columns, water bursts,
  lightning bolts, ice shards, shadow rings, metal slashes, plus impact flashes, screen
  shake and the ultimate's full-screen flash.
- Chunky 2px borders, hard drop shadows, stepped animations, and segmented meters — the UI
  commits to one dark, cartridge-game world rather than following the viewer's theme.

## Tooling

The whole asset pipeline is in `tools/` and is re-runnable:

| Script | What it does |
|---|---|
| `tools/fix-sprites.py` | Repairs extraction defects — strips cell borders, dark background slabs and neighbouring art, splits fused cutouts, drops fragments, re-trims every sprite |
| `tools/gen-creatures.py` | Rebuilds `js/creatures-data.js` — types from hue analysis, evolution chains, rarities, base stats. Ids are stable, so saves survive a regeneration |
| `tools/make-font.py` | Compiles the bitmap font to TTF and writes `css/font.css` |
| `tools/make-ui-art.py` | Draws the icon sheet, the 9-slice frames and `css/icons.css` |
| `tools/build-single.py` | Bundles everything into one self-contained HTML file |

Creature sprites were auto-extracted from the uploaded sprite-sheet compilations with a
background flood-fill and connected-component slicer, then audited sprite-by-sprite.

## Running it

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

Or open `dist/ritual-beasts.html` directly — one file, no server. Progress saves to
`localStorage` per browser.

*Creature and background pixel art from the uploaded Pinterest compilations; for personal use.*
