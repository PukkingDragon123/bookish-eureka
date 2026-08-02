/* ============ Ritual Beasts — The Lab ============
   Lab points come from quests, challenges, logins and big fusions.
   One roll = one experiment: mutations, serums, skill grafts, jackpots.     */
'use strict';

const Lab = (() => {
  const COST = 10;

  const OUTCOMES = [
    { key: 'mutation', w: 42 },
    { key: 'serum',    w: 24 },
    { key: 'graft',    w: 20 },
    { key: 'jackpot',  w: 14 },
  ];

  function roll() {
    if (S.lab.points < COST) { toast('Not enough lab points — quests grant them!'); return null; }
    if (!Object.keys(S.beasts).length) return null;
    S.lab.points -= COST;
    S.lab.rolls++;
    Quests.progress('lab', 1);
    const r = weightedPick(OUTCOMES, o => o.w);
    let result;
    switch (r.key) {
      case 'mutation': {
        const cid = pick(Object.keys(S.beasts));
        const stat = pick(['atk', 'hp', 'spd']);
        const amt = irnd(6, 14);
        const inst = S.beasts[cid];
        inst.mut = inst.mut || {};
        inst.mut[stat] = (inst.mut[stat] || 0) + amt;
        result = {
          kind: 'mutation', icon: 'flask', cid,
          title: 'MUTATION!',
          text: `${C_BY_ID[cid].name} mutates: permanent +${amt}% ${({atk:'attack',hp:'vitality',spd:'speed'})[stat]}!`,
        };
        break;
      }
      case 'serum':
        S.lab.serums = (S.lab.serums || 0) + 1;
        result = {
          kind: 'serum', icon: 'flask',
          title: 'PARTY SERUM',
          text: `The whole party grows stronger: +1% attack forever (x${S.lab.serums} brewed).`,
        };
        break;
      case 'graft': {
        const cid = pick(Object.keys(S.beasts));
        const donor = pick(window.CREATURES.filter(c => c.id !== cid));
        const inst = S.beasts[cid];
        inst.graft = donor.id;
        const sk = Lore.kit(donor.id).skills[1];
        result = {
          kind: 'graft', icon: 'bolt', cid,
          title: 'SKILL GRAFT!',
          text: `${C_BY_ID[cid].name} learns ${sk.name} from ${donor.name}'s essence — a third skill in battle!`,
        };
        break;
      }
      default: {
        const gems = irnd(15, 30), ess = irnd(10, 20), seeds = irnd(2, 4);
        grantGems(gems); grantEssence(ess); grantSeeds(seeds);
        result = {
          kind: 'jackpot', icon: 'chest',
          title: 'JACKPOT!',
          text: `The experiment overflows: +${gems} gems, +${ess} essence, +${seeds} seeds!`,
        };
      }
    }
    Sound.summon();
    save();
    return result;
  }

  return { roll, COST };
})();
