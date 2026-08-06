/* ============ Hourling — bootstrap & main loop ============ */
'use strict';

(function main() {
  const hadSave = load();
  Sound.setEnabled(S.settings.sound);
  PWA.init();
  applyBuddyTheme();
  VFX.attach(document.getElementById('vfx'));

  /* ---- static wiring ---- */
  $$('#tabbar button').forEach(b => b.onclick = () => UI.switchTab(b.dataset.tab));
  $('#btn-settings').onclick = () => UI.showSettings();
  $('#hud-level').onclick = () => toast(`${fmt(S.player.xp)} / ${fmt(xpForLevel(S.player.level))} XP to next level`);
  $('#btn-boss').onclick = () => { Battle.challengeBoss(); Sound.click(); };
  $('#btn-map').onclick = () => UI.showMap();
  $('#btn-log-meal').onclick = () => UI.showMealModal(true);
  $('#btn-kcal-target').onclick = () => UI.showKcalTargetModal();
  $('#btn-add-custom').onclick = () => UI.showAddCustomModal();
  $('#btn-portal').onclick = () => Merge.spawn(false);
  $('#btn-portal-gold').onclick = () => Merge.spawn(true);
  $('#btn-water').onclick = () => UI.waterGarden();
  $('#btn-all-quests').onclick = () => UI.switchTab('quests');
  $('#quest-log').onclick = () => UI.switchTab('quests');
  $('#hero-edit').onclick = () => UI.showPlanEditor();
  $$('.panel-head').forEach(b => b.onclick = () => UI.togglePanel(b.dataset.panel));

  /* ---- first-run vs returning ---- */
  if (!hadSave || !S.dream || !S.dream.key) {
    UI.renderSceneBg();
    UI.showOnboarding();
  } else {
    Quests.generateToday();
    Habits.resetMealsIfNewDay();
    if (S.exTimer && Habits.timerRemaining() <= 0) Habits.finishTimer();
    if (S.session) UI.openSessionOverlay();
    const away = (Date.now() - S.lastSeen) / 1000;
    if (away > 90 && S.party.length > 0) {
      const idleCap = 12 * 3600 * (1 + relicBonusStat('idle'));
      const gains = Battle.offlineGains(Math.min(away, idleCap));
      const mult = rewardMult();
      gains.gold *= mult; gains.xp *= mult;
      if (gains.kills > 0) UI.showWelcomeBack(away, gains);
      else setTimeout(UI.maybeShowLogin, 600);
    } else {
      setTimeout(UI.maybeShowLogin, 600);
    }
  }
  UI.renderAll();
  PWA.hideBoot();

  /* ---- loops ---- */
  setInterval(() => Battle.tick(), Battle.TICK_MS);

  let slowTick = 0;
  setInterval(() => {
    UI.renderUltMeter(Battle.ultCharge);
    UI.tickCooldowns();
    Habits.tickTimer();
    UI.updateTimerModal();
    UI.tickSession();
    UI.renderBoost();
    UI.renderBattleStats();
    UI.renderHud();
    Merge.regen();
    const pe = $('#portal-energy');
    if (pe) pe.textContent = `${S.merge.energy}/${Merge.energyMax()}`;
    if (UI.currentTab() === 'quests' && S.exTimer) UI.renderRituals();
    // garden countdowns tick once per 3s while visible
    if (++slowTick % 3 === 0 && UI.currentTab() === 'farm') UI.renderFarm();
    // the focus card shows a live session countdown
    if (S.session && slowTick % 3 === 0 && UI.currentTab() === 'today') UI.renderFocus();
  }, 1000);

  setInterval(save, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
    else {
      Quests.generateToday();
      Habits.resetMealsIfNewDay();
      if (S.exTimer && Habits.timerRemaining() <= 0) Habits.finishTimer();
      UI.tickSession();
      UI.renderAll();
      UI.maybeShowLogin();
    }
  });
  window.addEventListener('beforeunload', save);

  const unlock = () => { Sound.click(); document.removeEventListener('pointerdown', unlock); };
  document.addEventListener('pointerdown', unlock, { once: true });
})();
