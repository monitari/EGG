import { clamp, donenessStatus } from './config.js';

const $ = (selector) => document.querySelector(selector);
const HEAT_LEVELS = ['LOW', 'MID', 'HIGH'];
const HEAT_LEVEL_LABELS = ['약불', '중불', '강불'];
const DEFAULT_COOKING_STEPS = [
  { id: 'set-edge', label: '팬 굴리기', hint: '좌우로' },
  { id: 'season', label: '소금', hint: '한 번' },
  { id: 'flip', label: '뒤집기', hint: '위로' },
  { id: 'plate', label: '담기', hint: '딱 맞게' },
];

export class UI {
  constructor() {
    this.elements = {
      app: $('#app'),
      gameCanvas: $('#game-canvas'),
      crackStage: $('#crack-stage'),
      crackStageHelp: $('#crack-stage-help'),
      crackMeterLabel: $('#crack-meter-label'),
      crackMeterFill: $('#crack-meter-fill'),
      crackPenalty: $('#crack-penalty'),
      score: $('#score-value'),
      best: $('#best-value'),
      timer: $('#timer-value'),
      timerPill: $('#timer-pill'),
      timerRing: $('#timer-ring'),
      difficultyBadge: $('#difficulty-badge'),
      difficultySummary: $('#difficulty-summary'),
      difficultyButtons: [...document.querySelectorAll('[data-difficulty]')],
      missionIndex: $('#mission-index'),
      missionEyebrow: $('#mission-eyebrow'),
      missionTitle: $('#mission-title'),
      missionText: $('#mission-text'),
      missionProgress: [...document.querySelectorAll('.mission-progress i')],
      stabilityCard: $('#stability-card'),
      stabilityValue: $('#stability-value'),
      stabilityFill: $('#stability-fill'),
      stabilityTip: $('#stability-tip'),
      cookPanel: $('#cook-panel'),
      donenessTitle: $('#doneness-title'),
      cookStepHelp: $('#cook-step-help'),
      cookPenalty: $('#cook-penalty'),
      cookPenaltyValue: $('#cook-penalty-value'),
      cookPenaltyReason: $('#cook-penalty-reason'),
      cookTime: $('#cook-time'),
      trackMarker: $('#track-marker'),
      donenessTrack: $('#doneness-track'),
      perfectZone: $('.perfect-zone'),
      landingMarker: $('#landing-marker'),
      heatIndicator: $('#heat-indicator'),
      heatValue: $('#heat-value'),
      cookingStepList: $('#cooking-step-list'),
      cookingSteps: [...document.querySelectorAll('[data-cook-step]')],
      whiteDetail: $('#white-detail'),
      whiteDetailValue: $('#white-detail-value'),
      whiteDetailFill: $('#white-detail-fill'),
      whiteDetailTarget: $('#white-detail-target'),
      yolkDetail: $('#yolk-detail'),
      yolkDetailValue: $('#yolk-detail-value'),
      yolkDetailFill: $('#yolk-detail-fill'),
      yolkDetailTarget: $('#yolk-detail-target'),
      edgeDetail: $('#edge-detail'),
      edgeDetailValue: $('#edge-detail-value'),
      edgeDetailFill: $('#edge-detail-fill'),
      edgeDetailTarget: $('#edge-detail-target'),
      cookControls: $('#cook-controls'),
      panGesture: $('#pan-gesture'),
      panGesturePad: $('#pan-gesture-pad'),
      panGestureTitle: $('#pan-gesture-title'),
      panGestureHint: $('#pan-gesture-hint'),
      panGestureProgress: $('.pan-gesture-progress'),
      panGestureProgressFill: $('#pan-gesture-progress-fill'),
      heatControl: $('.heat-control'),
      heatDownButton: $('#heat-down-button'),
      heatUpButton: $('#heat-up-button'),
      heatLevel: $('#heat-level'),
      seasonButton: $('#season-button'),
      seasonStatus: $('#season-action-status'),
      basteButton: $('#baste-button'),
      basteStatus: $('#baste-action-status'),
      serveButton: $('#serve-button'),
      serveTitle: $('#serve-button strong'),
      serveSubtitle: $('#serve-button small'),
      startOverlay: $('#start-overlay'),
      startButton: $('#start-button'),
      resultOverlay: $('#result-overlay'),
      resultStamp: $('#result-stamp'),
      resultEyebrow: $('#result-eyebrow'),
      resultTitle: $('#result-title'),
      resultMessage: $('#result-message'),
      cookingScore: $('#cooking-score'),
      handlingScore: $('#handling-score'),
      difficultyMultiplier: $('#difficulty-multiplier'),
      roundScore: $('#round-score'),
      retryButton: $('#retry-button'),
      changeDifficultyButton: $('#change-difficulty-button'),
      soundButton: $('#sound-button'),
      themeButton: $('#theme-button'),
      toast: $('#toast'),
      kitchenEvent: $('#kitchen-event'),
      kitchenEventIcon: $('#kitchen-event-icon'),
      kitchenEventEyebrow: $('#kitchen-event-eyebrow'),
      kitchenEventTitle: $('#kitchen-event-title'),
      kitchenEventMessage: $('#kitchen-event-message'),
      kitchenEventTimer: $('#kitchen-event-timer'),
      kitchenEventTimerFill: $('#kitchen-event-timer-fill'),
      kitchenEventResponse: $('#kitchen-event-response'),
      kitchenEventResponseLabel: $('#kitchen-event-response-label'),
      achievementSummaryText: $('#achievement-summary-text'),
      achievementSummaryCount: $('#achievement-summary-count'),
      achievementsButton: $('#achievements-button'),
      achievementOverlay: $('#achievement-overlay'),
      achievementCloseButton: $('#achievement-close-button'),
      achievementList: $('#achievement-list'),
      achievementProgressText: $('#achievement-progress-text'),
      achievementProgressFill: $('#achievement-progress-fill'),
      collectionTabs: [...document.querySelectorAll('[data-collection-tab]')],
      achievementPanel: $('#achievement-panel'),
      skinPanel: $('#skin-panel'),
      skinCategoryButtons: [...document.querySelectorAll('[data-skin-category]')],
      skinList: $('#skin-list'),
      achievementToast: $('#achievement-toast'),
      achievementToastIcon: $('#achievement-toast-icon'),
      achievementToastTitle: $('#achievement-toast-title'),
      achievementToastDescription: $('#achievement-toast-description'),
      resultAchievements: $('#result-achievements'),
      resultWhiteStars: $('#result-white-stars'),
      resultYolkStars: $('#result-yolk-stars'),
      resultHeatStars: $('#result-heat-stars'),
      resultTimingStars: $('#result-timing-stars'),
      crackLabel: $('#crack-label'),
      eggLabel: $('#egg-label'),
      tapPips: $('.tap-pips'),
      tapTiming: $('.tap-timing'),
      tapTimingMarker: $('#tap-timing-marker'),
      crackTimingText: $('#crack-timing-text'),
      dangerFlash: $('#danger-flash'),
    };
    this.toastTimer = null;
    this.achievementToastTimer = null;
    this.currentEventId = null;
    this.lastAchievementFocus = null;
    this.lastTimerText = '';
    this.cosmeticsSnapshot = null;
    this.skinCategory = 'egg';
    this.difficultyKey = 'normal';
    this.syncModalState();
  }

  bind({
    onStart,
    onRetry,
    onServe,
    onSound,
    onTheme,
    onDifficulty,
    onChangeDifficulty,
    onHeatChange = () => {},
    onCookAction = () => {},
    onEventResponse = () => {},
    onAchievementsOpen = () => {},
    onSkinEquip = () => {},
    onPanGesture = () => {},
  }) {
    this.elements.startButton.addEventListener('click', onStart);
    this.elements.retryButton.addEventListener('click', onRetry);
    this.elements.serveButton.addEventListener('click', onServe);
    this.elements.soundButton.addEventListener('click', onSound);
    this.elements.themeButton.addEventListener('click', onTheme);
    this.elements.changeDifficultyButton.addEventListener('click', onChangeDifficulty);
    this.elements.heatDownButton.addEventListener('click', () => onHeatChange(-1));
    this.elements.heatUpButton.addEventListener('click', () => onHeatChange(1));
    this.elements.seasonButton.addEventListener('click', () => onCookAction('season'));
    this.elements.basteButton.addEventListener('click', () => onCookAction('baste'));
    this.bindPanGesture(onPanGesture);
    this.elements.kitchenEventResponse.addEventListener('click', () => {
      if (!this.currentEventId) return;
      this.elements.kitchenEventResponse.disabled = true;
      this.elements.kitchenEventResponseLabel.textContent = '처리 중…';
      onEventResponse(this.currentEventId);
    });
    this.elements.achievementsButton.addEventListener('click', () => {
      onAchievementsOpen();
      this.showAchievements(true);
    });
    this.elements.achievementCloseButton.addEventListener('click', () => this.showAchievements(false));
    this.elements.achievementOverlay.addEventListener('click', (event) => {
      if (event.target === this.elements.achievementOverlay) this.showAchievements(false);
    });
    this.elements.collectionTabs.forEach((button) => {
      button.addEventListener('click', () => this.setCollectionTab(button.dataset.collectionTab));
    });
    this.bindTabKeys(this.elements.collectionTabs, (button) => this.setCollectionTab(button.dataset.collectionTab));
    this.elements.skinCategoryButtons.forEach((button) => {
      button.addEventListener('click', () => {
        this.skinCategory = button.dataset.skinCategory;
        this.renderSkins();
      });
    });
    this.bindTabKeys(this.elements.skinCategoryButtons, (button) => {
      this.skinCategory = button.dataset.skinCategory;
      this.renderSkins();
    });
    this.elements.skinList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-skin-id]');
      if (!button || button.disabled) return;
      onSkinEquip(button.dataset.skinType, button.dataset.skinId);
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.elements.achievementOverlay.classList.contains('visible')) {
        event.preventDefault();
        this.showAchievements(false);
        return;
      }
      if (event.key === 'Tab') this.trapModalFocus(event);
    });
    this.elements.difficultyButtons.forEach((button) => {
      button.addEventListener('click', () => onDifficulty(button.dataset.difficulty));
    });
  }

  bindTabKeys(buttons, activate) {
    buttons.forEach((button) => button.addEventListener('keydown', (event) => {
      const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
      if (!keys.includes(event.key)) return;
      const current = Math.max(0, buttons.indexOf(button));
      const next = event.key === 'Home' ? 0
        : event.key === 'End' ? buttons.length - 1
          : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      activate(buttons[next]);
      buttons[next].focus();
      event.preventDefault();
    }));
  }

  bindPanGesture(onPanGesture) {
    const pad = this.elements.panGesturePad;
    if (!pad) return;
    let active = null;
    const positionFromEvent = (event) => {
      const rect = pad.getBoundingClientRect();
      return {
        x: clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1, -1, 1),
        y: clamp(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1, -1, 1),
      };
    };
    const updateVisual = (positionX, positionY = 0) => {
      pad.style.setProperty('--pan-gesture-x', `${50 + positionX * 42}%`);
      pad.style.setProperty('--pan-gesture-y', `${50 + positionY * 38}%`);
      pad.setAttribute('aria-valuenow', String(Math.round((pad.dataset.mode === 'flip' ? -positionY : positionX) * 100)));
    };
    pad.addEventListener('pointerdown', (event) => {
      if (pad.getAttribute('aria-disabled') === 'true' || !event.isPrimary) return;
      const position = positionFromEvent(event);
      active = {
        pointerId: event.pointerId,
        startX: position.x,
        startY: position.y,
        x: position.x,
        y: position.y,
        time: performance.now(),
        direction: 0,
        directionChanges: 0,
        peakUpwardVelocity: 0,
      };
      pad.setPointerCapture?.(event.pointerId);
      pad.classList.add('dragging');
      updateVisual(position.x, position.y);
      onPanGesture({ phase: 'start', x: position.x, y: position.y, velocity: 0, velocityX: 0, velocityY: 0, directionChanges: 0 });
      event.preventDefault();
    });
    pad.addEventListener('pointermove', (event) => {
      if (!active || active.pointerId !== event.pointerId) return;
      const now = performance.now();
      const position = positionFromEvent(event);
      const dt = Math.max(0.008, (now - active.time) / 1000);
      const velocityX = (position.x - active.x) / dt;
      const velocityY = (position.y - active.y) / dt;
      const direction = Math.abs(velocityX) > 0.12 ? Math.sign(velocityX) : active.direction;
      if (active.direction && direction && direction !== active.direction) active.directionChanges += 1;
      active = {
        ...active,
        x: position.x,
        y: position.y,
        time: now,
        direction,
        peakUpwardVelocity: Math.max(active.peakUpwardVelocity, -velocityY),
      };
      updateVisual(position.x, position.y);
      onPanGesture({
        phase: 'move',
        x: position.x,
        y: position.y,
        velocity: Math.abs(velocityX),
        velocityX,
        velocityY,
        upwardVelocity: active.peakUpwardVelocity,
        travelX: position.x - active.startX,
        travelY: position.y - active.startY,
        directionChanges: active.directionChanges,
      });
      event.preventDefault();
    });
    const finish = (event) => {
      if (!active || (event.pointerId != null && active.pointerId !== event.pointerId)) return;
      const pointerId = active.pointerId;
      const payload = {
        phase: 'end',
        x: active.x,
        y: active.y,
        velocity: 0,
        upwardVelocity: active.peakUpwardVelocity,
        travelX: active.x - active.startX,
        travelY: active.y - active.startY,
        directionChanges: active.directionChanges,
      };
      active = null;
      if (pad.hasPointerCapture?.(pointerId)) pad.releasePointerCapture(pointerId);
      pad.classList.remove('dragging');
      updateVisual(0, 0);
      onPanGesture(payload);
    };
    pad.addEventListener('pointerup', finish);
    pad.addEventListener('pointercancel', finish);
    pad.addEventListener('lostpointercapture', finish);
    pad.addEventListener('keydown', (event) => {
      const flipMode = pad.dataset.mode === 'flip';
      const allowed = flipMode ? ['ArrowUp', ' ', 'Enter'] : ['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'];
      if (!allowed.includes(event.key) || event.repeat) return;
      const direction = ['ArrowLeft', 'a', 'A'].includes(event.key) ? -1 : 1;
      updateVisual(flipMode ? 0 : direction * 0.82, flipMode ? -0.86 : 0);
      onPanGesture({ phase: 'start', x: 0, y: flipMode ? 0.75 : 0, velocity: 0, directionChanges: 0, keyboard: true });
      onPanGesture({
        phase: 'move',
        x: flipMode ? 0 : direction * 0.82,
        y: flipMode ? -0.86 : 0,
        velocity: flipMode ? 0 : 3,
        upwardVelocity: flipMode ? 5 : 0,
        travelX: flipMode ? 0 : direction * 0.82,
        travelY: flipMode ? -1.61 : 0,
        directionChanges: flipMode ? 0 : 1,
        keyboard: true,
      });
      window.setTimeout(() => {
        updateVisual(0, 0);
        onPanGesture({
          phase: 'end', x: 0, y: 0, velocity: 0,
          upwardVelocity: flipMode ? 5 : 0,
          travelX: 0,
          travelY: flipMode ? -1.61 : 0,
          directionChanges: flipMode ? 0 : 1,
          keyboard: true,
        });
      }, 110);
      event.preventDefault();
    });
  }

  setPanGesture({ progress = 0, quality = 'idle', title, hint, enabled = true, visible = enabled, mode = 'roll' } = {}) {
    if (!this.elements.panGesture) return;
    const value = clamp(Number(progress) || 0, 0, 100);
    this.elements.panGesture.dataset.quality = quality;
    this.elements.panGesture.dataset.mode = mode;
    this.elements.panGesturePad.dataset.mode = mode;
    this.elements.panGesturePad.setAttribute('aria-orientation', mode === 'flip' ? 'vertical' : 'horizontal');
    this.elements.panGesturePad.setAttribute('aria-label', mode === 'flip' ? '팬을 위로 밀어 계란 뒤집기' : '팬 좌우로 굴리기');
    this.elements.panGesture.classList.toggle('visible', Boolean(visible));
    this.elements.panGesture.setAttribute('aria-hidden', String(!visible));
    this.elements.panGesture.inert = !visible;
    this.elements.cookPanel.classList.toggle('pan-gesture-active', Boolean(visible));
    if (title) this.elements.panGestureTitle.textContent = title;
    if (hint) this.elements.panGestureHint.textContent = hint;
    this.elements.panGesturePad.setAttribute('aria-disabled', String(!enabled));
    this.elements.panGesturePad.tabIndex = enabled ? 0 : -1;
    this.elements.panGestureProgressFill.style.width = `${value}%`;
    this.elements.panGestureProgress.setAttribute('aria-label', mode === 'flip' ? '뒤집기 준비도' : '팬 굴리기 진행');
    this.elements.panGestureProgress.setAttribute('aria-valuenow', String(Math.round(value)));
  }

  setDifficulty(key, profile, coarsePointer = false) {
    this.difficultyKey = key;
    this.elements.app.dataset.difficulty = key;
    this.elements.difficultyBadge.textContent = profile.label;
    const friendlyDescriptions = {
      easy: '도움 표시가 켜지고 타이밍이 넉넉해요.',
      normal: '톡 깨고 팬을 굴리는 기본 손맛이에요.',
      hard: '팬 리듬과 조리 타이밍이 더 빨라져요.',
      extreme: '좁은 충격 판정과 과감한 팬 조작에 도전해요.',
    };
    this.elements.difficultySummary.textContent = `${friendlyDescriptions[key] || profile.description}${coarsePointer ? ' 터치 판정은 화면에 맞게 보정돼요.' : ''}`;
    this.elements.difficultyButtons.forEach((button) => {
      const selected = button.dataset.difficulty === key;
      button.setAttribute('aria-pressed', String(selected));
    });
    this.elements.difficultyMultiplier.textContent = `×${profile.multiplier.toFixed(2)}`;
    const perfectLeft = (profile.cooking.perfectMin / profile.cooking.burnAt) * 100;
    const perfectWidth = ((profile.cooking.perfectMax - profile.cooking.perfectMin) / profile.cooking.burnAt) * 100;
    this.elements.perfectZone.style.left = `${perfectLeft}%`;
    this.elements.perfectZone.style.width = `${perfectWidth}%`;
    this.elements.landingMarker.classList.toggle('hidden', profile.cooking.platingDelay <= 0);
    this.elements.serveSubtitle.textContent = profile.cooking.platingDelay
      ? `접시에 닿기까지 ${profile.cooking.platingDelay.toFixed(2)}초`
      : '지금 접시에 담기';
  }

  setScore(score) {
    this.elements.score.textContent = Math.round(score).toLocaleString('ko-KR');
  }

  setBest(score) {
    this.elements.best.textContent = Math.max(0, Math.round(score)).toLocaleString('ko-KR');
  }

  setTimer(seconds, total) {
    const value = Math.max(0, seconds);
    const remaining = Math.ceil(value);
    const minutes = Math.floor(remaining / 60);
    const wholeSeconds = remaining % 60;
    const timerText = `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}`;
    if (timerText !== this.lastTimerText) {
      this.elements.timer.textContent = timerText;
      this.lastTimerText = timerText;
    }
    this.elements.timerPill.classList.toggle('urgent', value <= Math.min(10, total * 0.25));
    const turn = (1 - value / Math.max(1, total)) * 360;
    this.elements.timerRing.style.setProperty('--timer-turn', `${turn}deg`);
  }

  setStability(stability, speed = 0, warningSpeed = 0.9) {
    const value = clamp(stability, 0, 100);
    this.elements.stabilityValue.textContent = `${Math.round(value)}%`;
    this.elements.stabilityFill.style.width = `${value}%`;
    this.elements.stabilityCard.setAttribute('role', 'progressbar');
    this.elements.stabilityCard.setAttribute('aria-label', '계란 껍질 안정도');
    this.elements.stabilityCard.setAttribute('aria-valuemin', '0');
    this.elements.stabilityCard.setAttribute('aria-valuemax', '100');
    this.elements.stabilityCard.setAttribute('aria-valuenow', String(Math.round(value)));
    const warning = value < 55 || speed > warningSpeed;
    this.elements.stabilityCard.classList.toggle('warning', warning);
    if (value < 30) this.elements.stabilityTip.textContent = '위험해요! 잠깐 멈춰 안정도를 회복하세요';
    else if (warning) this.elements.stabilityTip.textContent = '천천히—급출발과 급정지를 피하세요';
    else this.elements.stabilityTip.textContent = '오래 들고 있어도 손 피로가 쌓일 수 있어요';
  }

  setMission(step, title, text, eyebrow = '지금 할 일') {
    this.elements.missionIndex.textContent = String(step).padStart(2, '0');
    this.elements.missionEyebrow.textContent = eyebrow;
    this.elements.missionTitle.textContent = title;
    this.elements.missionText.textContent = text;
    this.elements.missionProgress.forEach((item, index) => item.classList.toggle('active', index === step - 1));
  }

  showIntro(show) {
    this.elements.startOverlay.classList.toggle('hidden', !show);
    this.elements.startOverlay.setAttribute('aria-hidden', String(!show));
    this.syncModalState();
    if (show) window.setTimeout(() => this.elements.startButton.focus({ preventScroll: true }), 80);
  }

  getActiveModal() {
    if (this.elements.achievementOverlay.classList.contains('visible')) return this.elements.achievementOverlay;
    if (this.elements.resultOverlay.classList.contains('visible')) return this.elements.resultOverlay;
    if (!this.elements.startOverlay.classList.contains('hidden')) return this.elements.startOverlay;
    return null;
  }

  syncModalState() {
    const activeModal = this.getActiveModal();
    [...this.elements.app.children].forEach((child) => {
      child.inert = Boolean(activeModal && child !== activeModal);
    });
  }

  trapModalFocus(event) {
    const modal = this.getActiveModal();
    if (!modal) return;
    const focusable = [...modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((item) => item.getClientRects().length && !item.inert);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  showCooking(show) {
    this.elements.cookPanel.classList.toggle('visible', show);
    this.elements.cookPanel.setAttribute('aria-hidden', String(!show));
    this.elements.cookPanel.inert = !show;
    this.elements.gameCanvas.setAttribute('aria-hidden', String(show));
    this.elements.gameCanvas.tabIndex = show ? -1 : 0;
    this.elements.stabilityCard.classList.toggle('hidden', show);
    this.elements.app.classList.toggle('is-cooking', show);
  }

  showCrackStage(show) {
    this.elements.crackStage.classList.toggle('visible', show);
    this.elements.crackStage.setAttribute('aria-hidden', String(!show));
    this.elements.crackStage.inert = !show;
    this.elements.gameCanvas.setAttribute('aria-hidden', String(show));
    this.elements.gameCanvas.tabIndex = show ? -1 : 0;
    this.elements.crackStage.querySelector('#swing-egg').disabled = !show;
    if (show && !this.elements.startOverlay.classList.contains('hidden')) return;
    if (show) window.setTimeout(() => this.elements.crackStage.querySelector('#swing-egg').focus({ preventScroll: true }), 60);
  }

  setCrackFeedback(kind, { impact = 0, penalty = 0, message = '' } = {}) {
    const labels = {
      ready: '힘을 모아 아래로',
      weak: '조금 더 빠르게!',
      good: '딱 좋은 충격!',
      hard: '너무 세게 쳤어요',
      glance: '옆으로 빗나갔어요',
    };
    this.elements.crackMeterLabel.textContent = labels[kind] || labels.ready;
    this.elements.crackStageHelp.textContent = message || '두꺼운 팬 테두리를 향해 짧고 곧게 휘둘러보세요.';
    this.elements.crackMeterFill.style.width = `${clamp((impact / 2.5) * 100, 3, 100)}%`;
    this.elements.crackPenalty.textContent = penalty > 0 ? `이번 감점 -${penalty}` : '감점 없음';
    this.elements.crackPenalty.classList.toggle('bad', penalty > 0);
  }

  setCookingInstruction(title, help) {
    this.elements.donenessTitle.textContent = title;
    this.elements.cookStepHelp.textContent = help;
  }

  setPenalty(amount = 0, reason = '아직 감점 없음') {
    const value = Math.max(0, Math.round(amount));
    this.elements.cookPenaltyValue.textContent = value ? `-${value}` : '0';
    this.elements.cookPenaltyReason.textContent = reason;
    this.elements.cookPenalty.classList.toggle('active', value > 0);
  }

  setCookingSteps(steps = DEFAULT_COOKING_STEPS, currentId = steps[0]?.id) {
    const normalized = steps.map((step, index) => typeof step === 'string'
      ? { id: step, label: step, hint: '' }
      : {
        id: step.id || step.key || `step-${index + 1}`,
        label: step.label || step.title || step.name || step.id || step.key,
        hint: step.hint || step.subtitle || step.description || '',
      });

    this.elements.cookingStepList.replaceChildren(...normalized.map((step, index) => {
      const item = document.createElement('li');
      item.dataset.cookStep = step.id;
      const number = document.createElement('i');
      number.textContent = String(index + 1).padStart(2, '0');
      const label = document.createElement('span');
      label.textContent = step.label;
      const hint = document.createElement('small');
      hint.textContent = step.hint;
      item.append(number, label, hint);
      return item;
    }));
    this.elements.cookingSteps = [...this.elements.cookingStepList.children];
    this.setCookingStep(currentId);
  }

  setCookingStep(currentId, options = {}) {
    this.elements.cookPanel.dataset.step = currentId || '';
    const currentIndex = this.elements.cookingSteps.findIndex((item) => item.dataset.cookStep === currentId);
    const completed = new Set(options.completed || []);
    const failed = new Set(options.failed || []);

    this.elements.cookingSteps.forEach((item, index) => {
      const id = item.dataset.cookStep;
      const isCurrent = id === currentId;
      const isDone = completed.has(id) || (options.completePrevious !== false && currentIndex >= 0 && index < currentIndex);
      item.classList.toggle('active', isCurrent);
      item.classList.toggle('done', !isCurrent && isDone);
      item.classList.toggle('failed', failed.has(id));
      if (isCurrent) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
  }

  setCookActions({
    heatLevel,
    heatIndex,
    heatLocked = false,
    season,
    baste,
  } = {}) {
    const normalizedIndex = heatIndex == null
      ? HEAT_LEVELS.indexOf(String(heatLevel || this.elements.heatControl.dataset.level || 'MID').toUpperCase())
      : clamp(Math.round(heatIndex), 0, HEAT_LEVELS.length - 1);
    const nextIndex = normalizedIndex < 0 ? 1 : normalizedIndex;
    const nextLevel = HEAT_LEVELS[nextIndex];
    this.elements.heatLevel.textContent = HEAT_LEVEL_LABELS[nextIndex];
    this.elements.heatControl.dataset.level = nextLevel.toLowerCase();
    this.elements.heatDownButton.disabled = heatLocked || nextIndex <= 0;
    this.elements.heatUpButton.disabled = heatLocked || nextIndex >= HEAT_LEVELS.length - 1;

    if (season !== undefined) this.setCookActionState('season', season);
    if (baste !== undefined) this.setCookActionState('baste', baste);
  }

  setCookActionState(action, state = {}) {
    const button = action === 'season' ? this.elements.seasonButton : this.elements.basteButton;
    const status = action === 'season' ? this.elements.seasonStatus : this.elements.basteStatus;
    const options = typeof state === 'boolean' ? { enabled: state } : state;
    const label = button.querySelector('strong');
    if (options.label) label.textContent = options.label;
    if (options.status != null) status.textContent = options.status;
    else if (options.count != null) status.textContent = `${options.count}회`;
    else if (options.cooldown != null) status.textContent = options.cooldown > 0 ? `${options.cooldown.toFixed(1)}초` : '준비 완료';
    button.disabled = options.disabled ?? options.enabled === false;
    button.classList.toggle('active', Boolean(options.active));
    button.setAttribute('aria-pressed', String(Boolean(options.active)));
  }

  showKitchenEvent({
    id,
    icon = '!',
    eyebrow = '앗!',
    title,
    message,
    responseLabel = '대응하기',
    kind = 'warning',
    remaining,
    duration,
  }) {
    this.currentEventId = id;
    this.elements.kitchenEventIcon.textContent = icon;
    this.elements.kitchenEventEyebrow.textContent = eyebrow;
    this.elements.kitchenEventTitle.textContent = title;
    this.elements.kitchenEventMessage.textContent = message;
    this.elements.kitchenEventResponseLabel.textContent = responseLabel;
    this.elements.kitchenEventResponse.disabled = false;
    this.elements.kitchenEvent.className = `kitchen-event glass visible ${kind}`;
    this.elements.kitchenEvent.setAttribute('aria-hidden', 'false');
    this.updateKitchenEvent(remaining ?? duration ?? 1, duration ?? remaining ?? 1);
  }

  updateKitchenEvent(remaining, duration) {
    const progress = clamp(remaining / Math.max(duration, 0.001), 0, 1);
    this.elements.kitchenEvent.style.setProperty('--event-progress', progress);
    this.elements.kitchenEventTimer.setAttribute('aria-label', `대응 시간 ${Math.max(0, remaining).toFixed(1)}초 남음`);
  }

  hideKitchenEvent() {
    this.currentEventId = null;
    this.elements.kitchenEvent.classList.remove('visible');
    this.elements.kitchenEvent.setAttribute('aria-hidden', 'true');
    this.elements.kitchenEventResponse.disabled = false;
  }

  updateCooking(doneness, seconds, { rules, prediction, heat, plating = false, detailedStatus, predictedDetailedStatus }) {
    const progress = clamp((doneness / rules.burnAt) * 100, 0, 100);
    const predictionProgress = clamp((prediction / rules.burnAt) * 100, 0, 100);
    const status = detailedStatus || donenessStatus(doneness, rules);
    const predictedStatus = predictedDetailedStatus || donenessStatus(prediction, rules);
    const copy = {
      undercooked: '조금 더 · 아직 속이 촉촉해요',
      perfect: '딱 좋아요 · 접시에 담을 준비!',
      overcooked: '너무 익어요 · 지금 바로 담아요!',
    };
    this.elements.trackMarker.style.left = `${progress}%`;
    this.elements.landingMarker.style.left = `${predictionProgress}%`;
    this.elements.cookTime.textContent = seconds.toFixed(1);
    this.elements.cookPanel.dataset.doneness = status;
    this.elements.donenessTrack.setAttribute('role', 'progressbar');
    this.elements.donenessTrack.setAttribute('aria-label', '전체 익힘 상태');
    this.elements.donenessTrack.setAttribute('aria-valuemin', '0');
    this.elements.donenessTrack.setAttribute('aria-valuemax', String(rules.burnAt));
    this.elements.donenessTrack.setAttribute('aria-valuenow', String(Math.round(doneness)));
    this.elements.donenessTrack.setAttribute('aria-valuetext', `${copy[status]}, 예상 착지 구움도 ${Math.round(prediction)}`);

    this.elements.heatValue.textContent = heat < 0.94 ? '약불' : heat > 1.18 ? '강불' : '중불';
    this.elements.heatIndicator.className = 'heat-indicator';
    if (heat < 0.94) this.elements.heatIndicator.classList.add('low');
    else if (heat > 1.18) this.elements.heatIndicator.classList.add('danger');
    else if (heat > 1.07) this.elements.heatIndicator.classList.add('hot');
    else this.elements.heatIndicator.classList.add('steady');

    this.elements.serveButton.disabled = plating;
    const assistedGlow = ['easy', 'normal'].includes(this.difficultyKey) && predictedStatus === 'perfect' && !plating;
    this.elements.serveButton.classList.toggle('perfect', assistedGlow);
  }

  updateCookingDetails({ white = 0, yolk = 0, edge = 0, rules, plating = false } = {}) {
    const update = (name, value, max, minTarget, maxTarget, lowerIsBetter = false) => {
      const element = this.elements[`${name}Detail`];
      const display = Math.max(0, value);
      this.elements[`${name}DetailValue`].textContent = `${Math.round(clamp(display / max, 0, 1) * 100)}%`;
      this.elements[`${name}DetailFill`].style.width = `${clamp(display / max, 0, 1) * 100}%`;
      const target = this.elements[`${name}DetailTarget`];
      target.style.left = `${clamp(minTarget / max, 0, 1) * 100}%`;
      target.style.width = `${clamp((maxTarget - minTarget) / max, 0, 1) * 100}%`;
      const good = lowerIsBetter ? display <= maxTarget : display >= minTarget && display <= maxTarget;
      const danger = lowerIsBetter ? display > maxTarget : display > maxTarget;
      element.classList.toggle('good', good);
      element.classList.toggle('danger', danger);
      element.setAttribute('aria-valuenow', String(Math.round(display)));
      element.setAttribute('aria-valuetext', good ? '목표 범위' : danger ? '너무 익음' : '익는 중');
    };
    update('white', white, 120, rules.whiteMin, rules.whiteMax);
    update('yolk', yolk, 100, rules.yolkMin, rules.yolkMax);
    update('edge', edge, 100, 0, rules.edgeMax, true);
    const allReady = white >= rules.whiteMin && white <= rules.whiteMax
      && yolk >= rules.yolkMin && yolk <= rules.yolkMax && edge <= rules.edgeMax;
    if (plating) this.elements.donenessTitle.textContent = '담는 중 · 잔열로 조금 더 익어요';
    else if (edge > rules.edgeMax) this.elements.donenessTitle.textContent = '가장자리가 타기 전에 불을 낮춰요';
    else if (white < rules.whiteMin) this.elements.donenessTitle.textContent = '먼저 흰자를 몽글몽글 익혀요';
    else if (yolk < rules.yolkMin) this.elements.donenessTitle.textContent = '약불로 노른자를 마무리해요';
    else if (allReady) this.elements.donenessTitle.textContent = '지금이 딱 좋아요!';
  }

  setPlating(delay) {
    this.setCookingStep('plate');
    this.elements.serveButton.disabled = true;
    this.elements.serveButton.classList.remove('perfect');
    this.elements.serveButton.classList.add('plating');
    this.elements.serveTitle.textContent = '담는 중…';
    this.elements.serveSubtitle.textContent = `잔열 ${delay.toFixed(2)}초 적용`;
  }

  resetCooking() {
    this.setCookingSteps(DEFAULT_COOKING_STEPS, 'set-edge');
    this.setCookActions({
      heatLevel: 'MID',
      season: { enabled: false, active: false, status: '대기' },
      baste: { enabled: false, active: false, status: '준비 중' },
    });
    this.elements.trackMarker.style.left = '0%';
    this.elements.landingMarker.style.left = '0%';
    this.elements.cookTime.textContent = '0.0';
    this.elements.heatValue.textContent = '중불';
    this.elements.heatIndicator.className = 'heat-indicator steady';
    this.elements.donenessTitle.textContent = '팬이 기다리고 있어요';
    this.elements.cookStepHelp.textContent = '지금 해야 할 행동만 하나씩 알려드릴게요.';
    this.setPenalty(0);
    this.updateCookingDetails({
      white: 0,
      yolk: 0,
      edge: 0,
      rules: { whiteMin: 84, whiteMax: 98, yolkMin: 54, yolkMax: 74, edgeMax: 50 },
    });
    this.elements.serveTitle.textContent = '완성!';
    this.elements.serveButton.disabled = true;
    this.elements.serveButton.classList.remove('perfect', 'plating');
  }

  setCrackRequirements(total, timed) {
    this.elements.tapPips.replaceChildren();
    for (let index = 0; index < total; index += 1) {
      this.elements.tapPips.append(document.createElement('i'));
    }
    this.elements.tapTiming.hidden = !timed;
    this.elements.crackTimingText.textContent = timed ? '마커가 초록 중앙에 올 때 탭' : `편하게 ${total}번 탭하세요`;
    this.setCrackTapCount(0);
  }

  setCrackTapCount(count) {
    [...this.elements.tapPips.children].forEach((pip, index) => pip.classList.toggle('done', index < count));
  }

  updateCrackTiming(phase, canHit, timed) {
    if (!timed) return;
    this.elements.tapTiming.style.setProperty('--tap-timing-position', `${clamp(phase, 0, 1) * 100}%`);
    this.elements.tapTiming.classList.toggle('hot', canHit);
    this.elements.crackTimingText.textContent = canHit ? '지금, 톡!' : '가운데 초록 영역을 기다려요';
  }

  showWorldLabel(name, show, position) {
    const element = name === 'crack' ? this.elements.crackLabel : this.elements.eggLabel;
    element.classList.toggle('visible', show);
    element.setAttribute('aria-hidden', String(!show));
    if (position) {
      const viewport = window.visualViewport;
      const width = viewport?.width || window.innerWidth;
      const height = viewport?.height || window.innerHeight;
      element.style.left = `${clamp(position.x, 70, width - 70)}px`;
      element.style.top = `${clamp(position.y, 80, height - 24)}px`;
    }
  }

  flashDanger(show) {
    this.elements.dangerFlash.classList.toggle('visible', show);
  }

  showToast(message, kind = '', duration = 1200) {
    window.clearTimeout(this.toastTimer);
    const toast = this.elements.toast;
    toast.textContent = message;
    toast.className = `toast visible ${kind}`.trim();
    this.toastTimer = window.setTimeout(() => { toast.className = 'toast'; }, duration);
  }

  setAchievements(achievements = []) {
    if (!Array.isArray(achievements)) achievements = achievements?.achievements || achievements?.progress || [];
    const unlocked = achievements.filter((achievement) => achievement.unlocked);
    const total = achievements.length;
    const latest = unlocked.at(-1);
    this.elements.achievementSummaryCount.textContent = `${unlocked.length}/${total}`;
    this.elements.achievementSummaryText.textContent = latest
      ? `최근 달성 · ${latest.title}`
      : total ? '첫 업적에 도전해보세요' : '아직 등록된 업적이 없어요';
    this.elements.achievementProgressText.textContent = `${unlocked.length} / ${total}개 달성`;
    this.elements.achievementProgressFill.style.width = `${total ? (unlocked.length / total) * 100 : 0}%`;

    if (!total) {
      const empty = document.createElement('p');
      empty.className = 'achievement-empty';
      empty.textContent = '플레이를 시작하면 업적이 이곳에 모여요.';
      this.elements.achievementList.replaceChildren(empty);
      return;
    }

    const items = achievements.map((achievement) => {
      const item = document.createElement('article');
      item.className = 'achievement-item';
      item.setAttribute('role', 'listitem');
      item.classList.toggle('unlocked', Boolean(achievement.unlocked));
      item.classList.toggle('secret', Boolean(achievement.secret));
      const isSecret = achievement.secret && !achievement.unlocked;

      const icon = document.createElement('span');
      icon.className = 'achievement-item-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = isSecret ? '?' : achievement.icon || '★';
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = isSecret ? '비밀 업적' : achievement.title;
      const description = document.createElement('p');
      description.textContent = isSecret ? '조건을 달성하면 공개돼요.' : achievement.description;
      const state = document.createElement('small');
      if (achievement.unlocked) state.textContent = achievement.unlockedLabel || '달성!';
      else if ((achievement.target || achievement.goal) && achievement.progress != null) {
        const target = achievement.target || achievement.goal;
        state.textContent = `${Math.min(achievement.progress, target)} / ${target}`;
      } else state.textContent = '아직 잠김';
      copy.append(title, description, state);
      item.append(icon, copy);
      return item;
    });
    this.elements.achievementList.replaceChildren(...items);
  }

  setCollectionTab(tab = 'achievements') {
    const skins = tab === 'skins';
    this.elements.collectionTabs.forEach((button) => {
      const selected = (button.dataset.collectionTab === 'skins') === skins;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    this.elements.achievementPanel.hidden = skins;
    this.elements.skinPanel.hidden = !skins;
    if (skins) this.renderSkins();
  }

  setCosmetics(snapshot) {
    this.cosmeticsSnapshot = snapshot;
    const egg = snapshot?.categories?.egg?.find((item) => item.equipped);
    const pan = snapshot?.categories?.pan?.find((item) => item.equipped);
    if (egg) {
      this.elements.app.style.setProperty('--equipped-egg', egg.color);
      this.elements.app.style.setProperty('--equipped-egg-accent', egg.accent);
    }
    if (pan) {
      this.elements.app.style.setProperty('--equipped-pan', pan.body);
      this.elements.app.style.setProperty('--equipped-pan-inner', pan.inner);
    }
    this.renderSkins();
  }

  renderSkins() {
    const items = this.cosmeticsSnapshot?.categories?.[this.skinCategory] || [];
    this.elements.skinCategoryButtons.forEach((button) => {
      const selected = button.dataset.skinCategory === this.skinCategory;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    const cards = items.map((skin) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'skin-item';
      button.dataset.skinType = skin.type;
      button.dataset.skinId = skin.id;
      button.disabled = !skin.unlocked;
      button.classList.toggle('equipped', skin.equipped);
      button.classList.toggle('locked', !skin.unlocked);
      button.setAttribute('role', 'listitem');
      button.setAttribute('aria-pressed', String(skin.equipped));
      const preview = document.createElement('i');
      preview.className = `skin-preview ${skin.type}`;
      preview.style.setProperty('--skin-color', skin.color || skin.body || skin.wall);
      preview.style.setProperty('--skin-accent', skin.accent || skin.inner || skin.band);
      const copy = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = skin.name;
      const description = document.createElement('small');
      description.textContent = skin.equipped ? '장착 중' : skin.unlocked ? skin.description : skin.unlockLabel ? `‘${skin.unlockLabel}’ 배지로 열려요` : '배지를 달성하면 열려요';
      copy.append(title, description);
      const state = document.createElement('b');
      state.textContent = skin.equipped ? '✓' : skin.unlocked ? '장착' : '잠김';
      button.append(preview, copy, state);
      return button;
    });
    this.elements.skinList.replaceChildren(...cards);
  }

  showAchievements(show = true) {
    if (show) this.lastAchievementFocus = document.activeElement;
    this.elements.achievementOverlay.classList.toggle('visible', show);
    this.elements.achievementOverlay.setAttribute('aria-hidden', String(!show));
    this.syncModalState();
    if (show) {
      window.setTimeout(() => this.elements.achievementCloseButton.focus({ preventScroll: true }), 50);
    } else if (this.lastAchievementFocus?.focus) {
      this.lastAchievementFocus.focus({ preventScroll: true });
      this.lastAchievementFocus = null;
    }
  }

  showAchievement(achievement, duration = 3200) {
    window.clearTimeout(this.achievementToastTimer);
    this.elements.achievementToastIcon.textContent = achievement.icon || '★';
    this.elements.achievementToastTitle.textContent = achievement.title;
    this.elements.achievementToastDescription.textContent = achievement.description || '새로운 업적을 달성했어요.';
    this.elements.achievementToast.classList.add('visible');
    this.elements.achievementToast.setAttribute('aria-hidden', 'false');
    this.achievementToastTimer = window.setTimeout(() => this.hideAchievement(), duration);
  }

  hideAchievement() {
    window.clearTimeout(this.achievementToastTimer);
    this.elements.achievementToast.classList.remove('visible');
    this.elements.achievementToast.setAttribute('aria-hidden', 'true');
  }

  setResultAchievements(achievements = []) {
    this.elements.resultAchievements.hidden = achievements.length === 0;
    this.elements.resultAchievements.textContent = achievements.length
      ? `★ 새 업적 · ${achievements.map((achievement) => achievement.title || achievement).join(', ')}`
      : '';
  }

  setSoundMuted(muted) {
    this.elements.soundButton.classList.toggle('muted', muted);
    this.elements.soundButton.setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기');
    this.elements.soundButton.setAttribute('aria-pressed', String(muted));
    const state = this.elements.soundButton.querySelector('.sound-state');
    if (state) state.textContent = muted ? '꺼짐' : '켜짐';
  }

  setTheme(theme) {
    const dark = theme === 'dark';
    this.elements.themeButton.setAttribute('aria-pressed', String(dark));
    this.elements.themeButton.setAttribute('aria-label', dark ? '라이트 모드 사용' : '다크 모드 사용');
  }

  showResult(result) {
    this.hideAchievement();
    const isPerfect = result.status === 'perfect';
    const isFailure = result.status === 'failed';
    const whiteLow = Number.isFinite(result.whiteCook) && result.whiteCook < (result.difficulty?.cooking?.whiteMin ?? 0);
    const yolkLow = Number.isFinite(result.yolkCook) && result.yolkCook < (result.difficulty?.cooking?.yolkMin ?? 0);
    const edgeHigh = Number.isFinite(result.edgeBrown) && result.edgeBrown > (result.difficulty?.cooking?.edgeMax ?? Infinity);
    const content = isFailure ? {
      stamp: '아쉬워요', eyebrow: '다시 한 번', title: '접시를 완성하지 못했어요',
      message: result.reason || '실패 수치를 확인하고 다음 동작을 조정해보세요.',
    } : result.eggDamaged && isPerfect ? {
      stamp: '구조 성공!', eyebrow: '포기하지 않았어요', title: '깨졌지만 완벽하게 살렸어요!',
      message: `금이 갔어도 포기하지 않고 촉촉하게 살려냈어요.`,
    } : result.flipDamaged && isPerfect ? {
      stamp: '아슬아슬!', eyebrow: '맛으로 만회했어요', title: '모양은 삐뚤어도 맛은 완벽!',
      message: '뒤집을 때 조금 흐트러졌지만 익힘은 훌륭해요.',
    } : result.status === 'undercooked' ? {
      stamp: '조금만 더', eyebrow: '거의 다 왔어요', title: '조금 덜 익었어요',
      message: whiteLow ? '흰자가 아직 말랑해요. 다음엔 조금만 더 기다려봐요.' : yolkLow ? '노른자가 아주 촉촉해요. 약불에서 잠깐 더 익혀봐요.' : '조금만 더 기다렸다면 딱 좋았을 거예요.',
    } : result.status === 'overcooked' ? {
      stamp: '바삭바삭', eyebrow: '조금 늦었어요', title: '조금 많이 익었어요',
      message: edgeHigh ? '가장자리가 꽤 바삭해졌어요. 다음엔 불을 조금 일찍 줄여봐요.' : '조금 오래 익었어요. 접시로 옮기는 타이밍을 앞당겨봐요.',
    } : {
      stamp: '참 잘했어요!', eyebrow: '오늘의 계란', title: '완벽한 후라이!',
      message: '노른자는 촉촉하고 흰자는 포근하게 익었어요.',
    };

    this.elements.resultStamp.textContent = content.stamp;
    this.elements.resultStamp.classList.toggle('bad', !isPerfect);
    this.elements.resultEyebrow.textContent = content.eyebrow;
    this.elements.resultTitle.textContent = content.title;
    this.elements.resultMessage.textContent = content.message;
    const rules = result.difficulty?.cooking || {};
    const componentRating = (value, min, max) => {
      if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return isPerfect ? 5 : 2;
      if (value >= min && value <= max) return 5;
      const distance = value < min ? min - value : value - max;
      const span = Math.max(8, max - min);
      return clamp(Math.round(5 - (distance / span) * 2.4), 1, 4);
    };
    const whiteRating = componentRating(result.whiteCook, rules.whiteMin, rules.whiteMax);
    const yolkRating = componentRating(result.yolkCook, rules.yolkMin, rules.yolkMax);
    const heatRating = Number.isFinite(result.flipQuality)
      ? clamp(Math.round(1 + clamp(result.flipQuality, 0, 1) * 4), 1, 5)
      : Number.isFinite(result.edgeBrown) && Number.isFinite(rules.edgeMax)
        ? (result.edgeBrown <= rules.edgeMax * 0.55 ? 5 : result.edgeBrown <= rules.edgeMax ? 4 : componentRating(result.edgeBrown, 0, rules.edgeMax))
        : (isPerfect ? 5 : 2);
    const timingRating = Number.isFinite(result.crackQuality)
      ? clamp(Math.round(1 + clamp(result.crackQuality, 0, 1) * 4), 1, 5)
      : clamp(Math.round(1 + clamp((result.handlingScore || 0) / 500, 0, 1) * 4), 1, 5);
    this.renderRating(this.elements.resultWhiteStars, whiteRating, '흰자');
    this.renderRating(this.elements.resultYolkStars, yolkRating, '노른자');
    this.renderRating(this.elements.resultHeatStars, heatRating, '뒤집기');
    this.renderRating(this.elements.resultTimingStars, timingRating, '톡 깨기');
    this.setResultAchievements(result.achievements || []);
    this.elements.cookingScore.textContent = `익힘 ${this.formatSigned(result.cookingScore)}`;
    this.elements.handlingScore.textContent = `손놀림 ${this.formatSigned(result.handlingScore)}`;
    this.elements.difficultyMultiplier.textContent = `×${(result.multiplier || 1).toFixed(2)}`;
    this.elements.roundScore.textContent = this.formatSigned(result.roundScore);
    this.elements.resultOverlay.dataset.status = result.status;
    this.elements.resultOverlay.classList.add('visible');
    this.elements.resultOverlay.setAttribute('aria-hidden', 'false');
    this.syncModalState();
    this.elements.retryButton.focus({ preventScroll: true });
    window.setTimeout(() => {
      if (document.activeElement !== this.elements.retryButton) this.elements.retryButton.focus({ preventScroll: true });
    }, 80);
  }

  hideResult() {
    this.elements.resultOverlay.classList.remove('visible');
    this.elements.resultOverlay.setAttribute('aria-hidden', 'true');
    this.syncModalState();
  }

  formatSigned(value) {
    const rounded = Math.round(value);
    return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('ko-KR')}`;
  }

  renderRating(element, rating, label) {
    const count = clamp(Math.round(rating), 1, 5);
    const stars = Array.from({ length: 5 }, (_, index) => {
      const star = document.createElement('i');
      star.className = `result-star ${index < count ? 'filled' : 'empty'}`;
      star.textContent = '★';
      star.setAttribute('aria-hidden', 'true');
      return star;
    });
    const number = document.createElement('small');
    number.textContent = `${count}/5`;
    number.setAttribute('aria-hidden', 'true');
    element.replaceChildren(...stars, number);
    element.setAttribute('aria-label', `${label} ${count}점, 5점 만점`);
  }
}
