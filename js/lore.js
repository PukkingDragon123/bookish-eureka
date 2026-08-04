/* ============ Ritual Beasts — skills, passives, ultimates, dex lore ============
   Everything here is derived deterministically from a creature's id, so the
   full 336-strong roster gets its own kit without shipping a giant data blob.
   Same creature -> same skills, every session, forever.                       */
'use strict';

const Lore = (() => {

  /* ---------- deterministic RNG ---------- */
  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function rngFor(seed) {
    let a = hash(seed);
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pickIn = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

  /* ---------- per-element move vocabulary ---------- */
  const MOVES = {
    Fire: {
      vfx: 'fire',
      basic: [['Ember Spit', 'flings a hissing coal'], ['Cinder Lash', 'whips a trail of sparks'],
              ['Scorch Claw', 'rakes with heated claws'], ['Flare Bite', 'bites down, red-hot']],
      heavy: [['Magma Burst', 'erupts in a pillar of fire'], ['Wildfire Roar', 'roars a wall of flame'],
              ['Pyre Slam', 'crashes down in a blast of embers'], ['Blaze Rush', 'charges wreathed in fire']],
      ult:   [['INFERNO CROWN', 'The air ignites. Everything burns at once.'],
              ['SOLAR FANG', 'Bites with the heat of a small sun.'],
              ['ASHFALL REQUIEM', 'Rains burning ash across the whole field.']],
    },
    Water: {
      vfx: 'water',
      basic: [['Bubble Shot', 'fires a pressurised bubble'], ['Tide Slap', 'slaps with a curl of water'],
              ['Brine Jet', 'spits a stinging jet of brine'], ['Ripple Fang', 'strikes through a ripple']],
      heavy: [['Torrent Crash', 'breaks a wave over the enemy'], ['Whirlpool Drag', 'drags the foe under'],
              ['Geyser Punch', 'launches a column of water'], ['Undertow Coil', 'coils and drowns']],
      ult:   [['ABYSSAL TIDE', 'Calls the deep ocean up over the field.'],
              ['LEVIATHAN CALL', 'Something vast answers from below.'],
              ['MONSOON VERDICT', 'A storm that does not negotiate.']],
    },
    Nature: {
      vfx: 'nature',
      basic: [['Vine Snap', 'snaps a taut green vine'], ['Seed Volley', 'scatters hard little seeds'],
              ['Leaf Edge', 'slices with a razor leaf'], ['Root Jab', 'spears up from below']],
      heavy: [['Bramble Prison', 'wraps the foe in thorns'], ['Bloomburst', 'detonates a flower bomb'],
              ['Grove Wrath', 'the whole thicket strikes at once'], ['Thornquake', 'splits the ground with roots']],
      ult:   [['WORLDROOT AWAKEN', 'Ancient roots surface and take their due.'],
              ['ETERNAL BLOOM', 'Blossoms open, and the field turns green.'],
              ['SPORE CATHEDRAL', 'Builds a living prison of growth.']],
    },
    Electric: {
      vfx: 'electric',
      basic: [['Spark Nip', 'nips with a crackling jolt'], ['Static Flick', 'flicks a snap of static'],
              ['Arc Dart', 'throws a thin white arc'], ['Volt Tap', 'taps once — and it stings']],
      heavy: [['Thunder Lance', 'hurls a spear of lightning'], ['Overload Surge', 'dumps its whole charge'],
              ['Chain Bolt', 'lightning leaps and leaps again'], ['Storm Kick', 'kicks with thunder behind it']],
      ult:   [['TEMPEST OVERDRIVE', 'Every cloud in the sky discharges here.'],
              ['GIGAVOLT JUDGEMENT', 'One bolt. Nothing left standing.'],
              ['LIGHTNING SOVEREIGN', 'Becomes the storm for a moment.']],
    },
    Ice: {
      vfx: 'ice',
      basic: [['Frost Nip', 'bites with numbing cold'], ['Sleet Spray', 'sprays stinging sleet'],
              ['Icicle Dart', 'flicks a needle of ice'], ['Chill Touch', 'touches, and warmth leaves']],
      heavy: [['Glacier Slam', 'drops a sheet of ice'], ['Blizzard Howl', 'howls up a whiteout'],
              ['Permafrost Lock', 'freezes the ground solid'], ['Shard Storm', 'shreds with flying ice']],
      ult:   [['ABSOLUTE WINTER', 'Stops the season. Stops everything.'],
              ['GLACIAL TOMB', 'Seals the enemy in ancient ice.'],
              ['AURORA ZERO', 'Beautiful, silent, and lethally cold.']],
    },
    Earth: {
      vfx: 'earth',
      basic: [['Pebble Toss', 'lobs a well-aimed stone'], ['Dust Kick', 'kicks grit into the eyes'],
              ['Stone Butt', 'headbutts like a boulder'], ['Tremor Step', 'stamps a small shock out']],
      heavy: [['Boulder Drop', 'brings the mountain down'], ['Fissure Split', 'cracks the earth open'],
              ['Landslide', 'buries the foe in rubble'], ['Tectonic Slam', 'slams with continental weight']],
      ult:   [['CONTINENTAL BREAK', 'The ground itself gives up.'],
              ['TITAN AWAKENING', 'Something old and heavy stands up.'],
              ['MONOLITH VERDICT', 'A pillar of stone settles the matter.']],
    },
    Shadow: {
      vfx: 'shadow',
      basic: [['Shade Nick', 'cuts from the wrong angle'], ['Gloom Touch', 'drains a little warmth'],
              ['Umbral Fang', 'bites out of the dark'], ['Dread Whisper', 'says something unbearable']],
      heavy: [['Void Rend', 'tears a hole in the light'], ['Nightmare Grasp', 'grabs from inside a shadow'],
              ['Eclipse Slash', 'cuts while the light is gone'], ['Soul Siphon', 'takes strength and keeps it']],
      ult:   [['ENDLESS MIDNIGHT', 'Puts out every light on the field.'],
              ['OBLIVION MAW', 'Opens something that should stay shut.'],
              ['UMBRA ASCENDANT', 'Becomes the dark, briefly and totally.']],
    },
    Mystic: {
      vfx: 'mystic',
      basic: [['Rune Spark', 'flicks a glowing sigil'], ['Aura Pulse', 'pushes with pure intent'],
              ['Star Chime', 'rings a note that hurts'], ['Charm Bolt', 'a spell, politely lethal']],
      heavy: [['Sigil Storm', 'a hundred runes ignite'], ['Astral Lance', 'spears with starlight'],
              ['Fate Rewrite', 'edits the last two seconds'], ['Lunar Judgement', 'the moon takes a side']],
      ult:   [['CONSTELLATION EDICT', 'Rearranges the stars into a verdict.'],
              ['PRISMATIC ASCENSION', 'Every colour of magic at once.'],
              ['ORACLE FINALE', 'Shows the enemy exactly how this ends.']],
    },
    Metal: {
      vfx: 'metal',
      basic: [['Bolt Fling', 'throws a heavy bolt'], ['Gear Grind', 'grinds against armour'],
              ['Rivet Punch', 'punches with a piston'], ['Steel Nip', 'snips with hardened jaws']],
      heavy: [['Piston Barrage', 'hammers in fast succession'], ['Alloy Crusher', 'crushes with hydraulic force'],
              ['Forge Slam', 'strikes like a drop hammer'], ['Shrapnel Burst', 'sprays hot fragments']],
      ult:   [['OVERCLOCK PROTOCOL', 'Removes every safety limiter.'],
              ['SIEGE ENGINE MODE', 'Unfolds into something much worse.'],
              ['ADAMANT VERDICT', 'One strike, rated for demolition.']],
    },
  };

  /* ---------- passive vocabulary ---------- */
  const PASSIVES = [
    { key: 'atk',    name: 'Sharpened Instinct', icon: 'sword',   fmt: v => `+${v}% party attack` },
    { key: 'hp',     name: 'Thick Hide',         icon: 'shield',  fmt: v => `+${v}% party vitality` },
    { key: 'crit',   name: 'Killing Eye',        icon: 'bolt',    fmt: v => `+${v}% critical chance` },
    { key: 'gold',   name: 'Treasure Sense',     icon: 'gold',    fmt: v => `+${v}% gold from battle` },
    { key: 'mana',   name: 'Ritual Attunement',  icon: 'mana',    fmt: v => `+${v}% mana from rituals` },
    { key: 'ess',    name: 'Essence Weaving',    icon: 'essence', fmt: v => `+${v}% essence gained` },
    { key: 'ult',    name: 'Burning Focus',      icon: 'star',    fmt: v => `+${v}% ultimate charge rate` },
    { key: 'lifest', name: 'Bloodbond',          icon: 'hp',      fmt: v => `heals the party for ${v}% of damage` },
    { key: 'xp',     name: "Scholar's Mark",     icon: 'book',    fmt: v => `+${v}% XP from battle` },
    { key: 'spd',    name: 'Quickened Step',     icon: 'walk',    fmt: v => `+${v}% attack speed` },
  ];
  const UNLOCK_LEVELS = [5, 12, 22, 35];

  /* ---------- dex flavour ---------- */
  const HABITAT = {
    Fire: ['sleeps in cooling ash', 'nests inside dormant vents', 'follows the warmest stone it can find',
           'is drawn to hearths and campfires'],
    Water: ['drifts along quiet shorelines', 'shelters in tidal caves', 'follows rainfall inland',
            'rests where two currents meet'],
    Nature: ['roosts in old hedgerows', 'buries itself in leaf litter to sleep', 'tends a patch of ground it has claimed',
             'follows the first green shoots of the year'],
    Electric: ['gathers under storm clouds', 'is found near anything that hums', 'sleeps curled around a charge',
               'rides the updraught before a storm'],
    Ice: ['walks where the frost holds longest', 'shelters in blue shadow', 'sleeps beneath a crust of snow',
          'follows the cold down from the peaks'],
    Earth: ['tunnels under warm rock', 'is happiest half-buried', 'wanders old quarry floors',
            'sleeps standing, like a stone'],
    Shadow: ['keeps to the hour before dawn', 'lives in the space behind things', 'avoids being counted',
             'is only ever seen at the edge of vision'],
    Mystic: ['appears where a promise was kept', 'drifts along old ley lines', 'is seen most often by the newly hopeful',
             'follows quiet, repeated devotion'],
    Metal: ['nests in abandoned works', 'collects fasteners it does not need', 'sharpens itself on anything harder',
            'sleeps standing in a locked posture'],
  };
  const TRAIT = [
    'It grows bolder each day its bonded human keeps a promise.',
    'It measures strength in habits kept, not battles won.',
    'It refuses to eat until its partner has.',
    'It will not move at dawn until it is greeted.',
    'Its colours deepen during a long streak, and dull when one breaks.',
    'It hums, faintly, whenever its partner drinks water.',
    'It sleeps through idleness and wakes the moment work begins.',
    'It has been known to nudge a sleeping partner awake at sunrise.',
    'Trainers say it can smell an unkept intention.',
    'It hoards small tokens of finished tasks.',
  ];
  const STAGE_LINE = {
    1: ['Young and untested, but stubborn about it.', 'Small, loud, and entirely unbothered by its size.',
        'Still learning what it will become.'],
    2: ['Grown into its strength, and aware of it.', 'The awkward stage is over; the dangerous one has begun.',
        'Steadier now, and much harder to discourage.'],
    3: ['Fully realised, and calm in the way only the very strong are.', 'The final shape of a long, patient effort.',
        'What it became is what its partner became.'],
  };

  /* ---------- builders ---------- */
  function scaleFor(c) {
    const rar = { common: 1, uncommon: 1.08, rare: 1.18, epic: 1.3, legendary: 1.5 }[c.rarity] || 1;
    return rar * (1 + 0.12 * (c.stage - 1));
  }

  function skillsFor(c) {
    const rng = rngFor('sk' + c.id);
    const prim = MOVES[c.types[0]] ? c.types[0] : 'Mystic';
    const sec = (c.types[1] && MOVES[c.types[1]]) ? c.types[1] : prim;
    const s = scaleFor(c);
    const [n1, d1] = pickIn(rng, MOVES[prim].basic);
    const [n2, d2] = pickIn(rng, MOVES[sec].heavy);
    const out = [
      { name: n1, desc: d1, type: prim, vfx: MOVES[prim].vfx,
        power: +(1.0 * s).toFixed(2), cd: 3.2, id: c.id + '_a' },
      { name: n2, desc: d2, type: sec, vfx: MOVES[sec].vfx,
        power: +(2.1 * s).toFixed(2), cd: 7.5, id: c.id + '_b' },
    ];
    // signature move: one of the ten named moves of its element, with its own
    // uploaded icon and a composed effect. Unlocks once the beast hits Lv.8.
    const bank = (window.MOVE_DATA || {})[prim];
    if (bank) {
      const mi = Math.floor(rng() * bank.names.length);
      out.push({ name: bank.names[mi], desc: 'Signature move.',
                 type: prim, vfx: 'move:' + prim + ':' + mi, moveIdx: mi,
                 power: +(3.0 * s).toFixed(2), cd: 11, id: c.id + '_m',
                 unlockLv: 8 });
    }
    return out;
  }

  function ultimateFor(c) {
    const rng = rngFor('ult' + c.id);
    const prim = MOVES[c.types[0]] ? c.types[0] : 'Mystic';
    const [name, desc] = pickIn(rng, MOVES[prim].ult);
    return { name, desc, type: prim, vfx: MOVES[prim].vfx,
             power: +(6.5 * scaleFor(c)).toFixed(2), charge: 100, id: c.id + '_u' };
  }

  function passivesFor(c) {
    const rng = rngFor('ps' + c.id);
    const pool = PASSIVES.slice();
    const out = [];
    for (let i = 0; i < 4; i++) {
      const p = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      const base = { atk: 6, hp: 8, crit: 3, gold: 8, mana: 6, ess: 8, ult: 8, lifest: 2, xp: 8, spd: 5 }[p.key];
      const value = Math.max(1, Math.round(base * (1 + i * 0.55) * scaleFor(c) * 0.9));
      out.push({ key: p.key, name: p.name, icon: p.icon, value,
                 level: UNLOCK_LEVELS[i], desc: p.fmt(value) });
    }
    return out;
  }

  function dexEntry(c) {
    const rng = rngFor('dx' + c.id);
    const t = c.types[0];
    const hab = pickIn(rng, HABITAT[t] || HABITAT.Mystic);
    const tr = pickIn(rng, TRAIT);
    const st = pickIn(rng, STAGE_LINE[Math.min(c.stage, 3)]);
    const dual = c.types.length > 1 ? ` Its ${c.types[1].toLowerCase()} nature shows under pressure.` : '';
    return `A ${c.rarity} ${c.types.join('/').toLowerCase()} beast that ${hab}.${dual} ${st} ${tr}`;
  }

  /* memoised, because the battle loop asks constantly */
  const cache = {};
  function kit(cid) {
    if (!cache[cid]) {
      const c = C_BY_ID[cid];
      cache[cid] = { skills: skillsFor(c), ult: ultimateFor(c),
                     passives: passivesFor(c), dex: dexEntry(c) };
    }
    return cache[cid];
  }

  /* passive totals for the current party, keyed by passive type */
  function partyPassives() {
    const tot = {};
    for (const cid of S.party) {
      const lvl = S.beasts[cid] ? S.beasts[cid].level : 0;
      for (const p of kit(cid).passives) {
        if (lvl >= p.level) tot[p.key] = (tot[p.key] || 0) + p.value;
      }
    }
    return tot;
  }
  function passiveBonus(key) {
    return (partyPassives()[key] || 0) / 100;
  }

  return { kit, partyPassives, passiveBonus, UNLOCK_LEVELS, MOVES };
})();
