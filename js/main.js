/* ============ Ritual Beasts — bootstrap & main loop ============ */
'use strict';

(function main() {
  const hadSave = load();
  Sound.setEnabled(S.settings.sound);

  VFX.attach(document.getElementById('vfx'));

  /* ---- wire static buttons ---- */
  $$('#tabbar button').forEach(b => b.onclick = () => UI.switchTab(b.dataset.tab));
  $('#btn-settings').onclick = () => UI.showSettings();
  $('#hud-level').onclick = () => toast(`${fmt(S.player.xp)} / ${fmt(xpForLevel(S.player.level))} XP to next level`);
  $('#btn-boss').onclick = () => { Battle.challengeBoss(); Sound.click(); };
  $('#btn-summon-mana').onclick = () => Summon.doSummon(false);
  $('#btn-summon-gem').onclick = () => Summon.doSummon(true);
  $('#btn-log-meal').onclick = () => UI.showMealModal(true);
  $('#btn-kcal-target').onclick = () => UI.showKcalTargetModal();
  $('#btn-add-custom').onclick = () => UI.showAddCustomModal();

  /* ---- first-run vs returning ---- */
  if (!hadSave) {
    UI.renderSceneBg();
    UI.showOnboarding();
  } else {
    Quests.generateToday();
    Habits.resetMealsIfNewDay();
    // finished-while-away timer?
    if (S.exTimer && Habits.timerRemaining() <= 0) Habits.finishTimer();
    // offline gains
    const away = (Date.now() - S.lastSeen) / 1000;
    if (away > 90 && S.party.length > 0) {
      const idleCap = 12 * 3600 * (1 + relicBonusStat('idle'));
      const gains = Battle.offlineGains(Math.min(away, idleCap));
      const mult = rewardMult();
      gains.gold *= mult; gains.xp *= mult;
      if (gains.kills > 0) UI.showWelcomeBack(away, gains);
    }
  }
  UI.renderAll();

  /* ---- main loops ---- */
  setInterval(() => Battle.tick(), Battle.TICK_MS);

  setInterval(() => {
    UI.renderUltMeter(Battle.ultCharge);
    Habits.tickTimer();
    UI.updateTimerModal();
    UI.renderBoost();
    UI.renderBattleStats();
    UI.renderHud();
    // refresh ritual timer buttons once per second when visible
    if (UI.currentTab() === 'rituals' && S.exTimer) UI.renderRituals();
  }, 1000);

  setInterval(save, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
    else {
      // catch up after returning to the tab
      Quests.generateToday();
      Habits.resetMealsIfNewDay();
      if (S.exTimer && Habits.timerRemaining() <= 0) Habits.finishTimer();
      UI.renderAll();
    }
  });
  window.addEventListener('beforeunload', save);

  /* unlock audio on first interaction (mobile) */
  const unlock = () => { Sound.click(); document.removeEventListener('pointerdown', unlock); };
  document.addEventListener('pointerdown', unlock, { once: true });
})();
