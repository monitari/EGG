import {
  DEFAULT_DIFFICULTY,
  DIFFICULTIES,
  GAME_CONFIG,
  PHASE,
  clamp,
  getDifficulty,
} from './config.js';
import { KitchenScene2D as KitchenScene } from './KitchenScene2D.js';
import { Vector3 } from './Vector.js';
import { SoundManager } from './SoundManager.js';
import { UI } from './UI.js';
import AchievementSystem from './AchievementSystem.js';
import CrackController from './CrackController.js';
import CosmeticsSystem from './CosmeticsSystem.js';

const HEAT_LEVEL_VALUES = Object.freeze([0.68, 1, 1.28]);
const COOKING_STEPS = Object.freeze([
  { id: 'set-edge', label: '팬 굴리기', hint: '좌우로 살살' },
  { id: 'season', label: '소금', hint: '버튼 한 번' },
  { id: 'flip', label: '뒤집기', hint: '위로 휙' },
  { id: 'plate', label: '담기', hint: '초록색 확인' },
]);
const KITCHEN_EVENTS = Object.freeze([
  Object.freeze({ type: 'heat-surge', icon: '↑', title: '불꽃이 확 올라왔어요!', message: '가장자리가 타기 전에 화력을 낮추세요.', responseLabel: '불 낮추기', kind: 'danger', heatModifier: 0.34 }),
  Object.freeze({ type: 'flame-dip', icon: '◌', title: '불꽃이 약해졌어요!', message: '팬 온도가 떨어지기 전에 화력을 보정하세요.', responseLabel: '화력 보정', kind: 'warning', heatModifier: -0.25 }),
  Object.freeze({ type: 'oil-pop', icon: '≈', title: '버터 거품이 넘쳐요!', message: '팬을 살짝 흔들어 거품을 고르게 퍼뜨리세요.', responseLabel: '팬 흔들기', kind: 'bonus', heatModifier: 0.08 }),
]);

const VALID_TRANSITIONS = Object.freeze({
  [PHASE.INTRO]: [PHASE.READY],
  [PHASE.READY]: [PHASE.CARRYING, PHASE.RECOVERING, PHASE.FAILED, PHASE.INTRO],
  [PHASE.CARRYING]: [PHASE.READY, PHASE.CRACK_READY, PHASE.RECOVERING, PHASE.FAILED],
  [PHASE.CRACK_READY]: [PHASE.CRACKING, PHASE.RECOVERING, PHASE.FAILED],
  [PHASE.CRACKING]: [PHASE.COOKING, PHASE.FAILED],
  [PHASE.RECOVERING]: [PHASE.READY, PHASE.FAILED, PHASE.INTRO],
  [PHASE.COOKING]: [PHASE.PLATING, PHASE.RESULT],
  [PHASE.PLATING]: [PHASE.RESULT],
  [PHASE.RESULT]: [PHASE.READY, PHASE.INTRO],
  [PHASE.FAILED]: [PHASE.READY, PHASE.INTRO],
});

export class EggGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.world = new KitchenScene(canvas);
    this.ui = new UI();
    this.ui.elements.app.classList.toggle('low-power', this.world.lowPower);
    this.sound = new SoundManager();
    this.achievements = new AchievementSystem();
    this.cosmetics = new CosmeticsSystem();
    this.achievementQueue = [];
    this.achievementShowing = false;
    this.coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    this.phase = PHASE.INTRO;
    this.ui.elements.app.dataset.phase = PHASE.INTRO;
    this.lastFrame = performance.now();
    this.isPageVisible = !document.hidden;
    this.roundId = 0;
    this.sessionScore = 0;
    this.keysDown = new Set();
    this.keyboardCarry = false;
    this.difficultyKey = this.loadDifficulty();
    this.theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

    this.eggTarget = GAME_CONFIG.eggStart.clone();
    this.previousEggPosition = GAME_CONFIG.eggStart.clone();
    this.eggVelocity = new Vector3();
    this.desiredEggPosition = new Vector3();

    // The active game no longer drags a 3D egg through the scene. Canvas
    // input only supplies a tiny parallax cue; the crack gesture owns touch.
    this.input = { cancelActive() {} };
    this.handleCanvasPointer = (event) => {
      const rect = canvas.getBoundingClientRect();
      this.world.setPointer({
        x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        y: -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1),
      });
    };
    canvas.addEventListener('pointermove', this.handleCanvasPointer, { passive: true });
    this.crackInput = new CrackController(
      this.ui.elements.crackStage,
      document.querySelector('#swing-egg'),
      (strike) => this.handleCrackStrike(strike),
    );

    this.ui.bind({
      onStart: () => this.startGame(),
      onRetry: () => this.retryRound(),
      onServe: () => this.requestServe(),
      onSound: () => this.toggleSound(),
      onTheme: () => this.toggleTheme(),
      onDifficulty: (key) => this.selectDifficulty(key, true),
      onChangeDifficulty: () => this.returnToMenu(),
      onHeatChange: (delta) => this.changeHeat(delta),
      onCookAction: (action) => this.performCookAction(action),
      onPanGesture: (data) => this.handlePanGesture(data),
      onEventResponse: (id) => this.handleEventResponse(id),
      onAchievementsOpen: () => this.refreshAchievements(),
      onSkinEquip: (type, id) => this.equipSkin(type, id),
    });

    this.selectDifficulty(this.difficultyKey, false);
    this.setTheme(this.theme, false);
    this.ui.setScore(0);
    this.ui.setStability(100, 0, this.transport.warningSpeed);
    this.ui.setSoundMuted(false);
    this.ui.showWorldLabel('egg', false);
    this.ui.showWorldLabel('crack', false);
    this.refreshCollections();

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', () => this.input.cancelActive());
    document.addEventListener('visibilitychange', () => {
      this.isPageVisible = !document.hidden;
      if (document.hidden) this.input.cancelActive();
      this.lastFrame = performance.now();
    });

    this.world.renderer.setAnimationLoop((time) => this.loop(time));
  }

  transition(next, force = false) {
    if (!force && !VALID_TRANSITIONS[this.phase]?.includes(next)) return false;
    this.phase = next;
    this.canvas.dataset.phase = next;
    const canvasLabels = {
      [PHASE.INTRO]: '아침 주방과 계란이 보이는 게임 홈',
      [PHASE.READY]: '계란 깨기를 준비하는 장면',
      [PHASE.CARRYING]: '계란 깨기를 준비하는 장면',
      [PHASE.CRACK_READY]: '계란을 아래로 휘둘러 팬의 두꺼운 림에 깨는 화면',
      [PHASE.CRACKING]: '계란이 깨져 팬으로 떨어지는 장면',
      [PHASE.COOKING]: '팬에서 흰자와 노른자가 익는 장면',
      [PHASE.PLATING]: '완성된 후라이를 접시로 옮기는 장면',
      [PHASE.RESULT]: '완성된 계란후라이 결과 장면',
    };
    this.canvas.setAttribute('aria-label', canvasLabels[next] || '계란후라이 요리 장면');
    this.ui.elements.app.dataset.phase = next;
    return true;
  }

  selectDifficulty(key, announce = false) {
    if (!DIFFICULTIES[key]) return;
    this.difficultyKey = key;
    this.rules = getDifficulty(key);
    const touchSpeedAssist = this.coarsePointer ? 1.1 : 1;
    this.transport = {
      ...this.rules.transport,
      safeSpeed: this.rules.transport.safeSpeed * touchSpeedAssist,
      warningSpeed: this.rules.transport.warningSpeed * touchSpeedAssist,
      dangerSpeed: this.rules.transport.dangerSpeed * touchSpeedAssist,
      breakSpeed: this.rules.transport.breakSpeed * touchSpeedAssist,
      releaseSpeed: this.rules.transport.releaseSpeed * (this.coarsePointer ? 1.08 : 1),
      crackZoneRadius: this.rules.transport.crackZoneRadius + (this.coarsePointer ? 0.06 : 0),
    };
    this.crackRules = {
      ...this.rules.crack,
      tolerance: this.rules.crack.tolerance + (this.coarsePointer && this.rules.crack.timed ? 0.025 : 0),
      maxMisses: this.rules.crack.maxMisses + (this.coarsePointer && key === 'extreme' ? 1 : 0),
    };
    this.cookingRules = this.rules.cooking;
    this.bestScore = this.loadBestScore(key);
    this.world.setDifficulty({ ...this.rules, transport: this.transport });
    this.ui.setDifficulty(key, this.rules, this.coarsePointer);
    this.ui.setBest(this.bestScore);
    this.ui.setTimer(this.rules.roundTime, this.rules.roundTime);
    this.saveDifficulty(key);
    if (announce) {
      this.sound.tap(key === 'extreme' ? 2 : 1);
      this.ui.showToast(`${this.rules.label} 난이도 · 최고 ${Math.round(1000 * this.rules.multiplier).toLocaleString('ko-KR')}점`, key === 'extreme' ? 'bad' : 'good', 1100);
    }
  }

  setTheme(theme, persist = true) {
    this.theme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = this.theme;
    this.world.setTheme(this.theme);
    this.ui.setTheme(this.theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', this.theme === 'dark' ? '#493a31' : '#fff4dd');
    if (persist) {
      try { localStorage.setItem('eggcellent-theme-v2', this.theme); } catch { /* optional preference */ }
    }
  }

  toggleTheme() {
    this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
    this.sound.tone(this.theme === 'dark' ? 360 : 620, 0.13, 'sine', 0.028, this.theme === 'dark' ? 260 : 760);
  }

  startGame() {
    this.sound.ensureContext();
    this.sessionScore = 0;
    this.ui.setScore(this.sessionScore);
    this.ui.showIntro(false);
    this.resetRound(true);
    this.ui.showToast('계란을 잡고 팬의 두꺼운 림으로 곧게 휘둘러보세요', 'good', 1800);
  }

  retryRound() {
    this.sound.ensureContext();
    this.ui.hideResult();
    this.resetRound(false);
  }

  returnToMenu() {
    this.roundId += 1;
    this.sound.stopSizzle();
    this.input.cancelActive();
    this.transition(PHASE.INTRO, true);
    this.world.reset();
    this.world.setDifficulty({ ...this.rules, transport: this.transport });
    this.ui.hideResult();
    this.ui.showCooking(false);
    this.ui.hideKitchenEvent();
    this.activeEvent = null;
    this.crackInput.setEnabled(false);
    this.ui.showCrackStage(false);
    this.ui.showWorldLabel('egg', false);
    this.ui.showWorldLabel('crack', false);
    this.ui.showIntro(true);
  }

  resetRound(fromIntro = false) {
    this.roundId += 1;
    this.sound.stopSizzle();
    this.transition(PHASE.CRACK_READY, true);
    this.timer = this.rules.roundTime;
    this.timerStarted = false;
    this.stress = 0;
    this.maxStress = 0;
    this.motionSpeed = 0;
    this.rawMotionSpeed = 0;
    this.shockExposure = 0;
    this.holdingTime = 0;
    this.fatigueAnnounced = false;
    this.settleTime = 0;
    this.insideLandingZone = false;
    this.landingHintShown = false;
    this.landingError = 0;
    this.landingSpeed = 0;
    this.keyboardCarry = false;
    this.keysDown.clear();
    this.eggTarget.copy(GAME_CONFIG.eggStart);
    this.previousEggPosition.copy(GAME_CONFIG.eggStart);
    this.eggVelocity.set(0, 0, 0);
    this.crackCount = 0;
    this.crackMisses = 0;
    this.crackAccuracyTotal = 0;
    this.crackReadyTime = 0;
    this.crackCanHit = !this.crackRules.timed;
    this.crackPhaseError = 0;
    this.crackBeatIndex = 0;
    this.lastCrackBeat = -1;
    this.crackPerfect = false;
    this.crackImpact = 0;
    this.weakStrikes = 0;
    this.glancingStrikes = 0;
    this.crackDamaged = false;
    this.crackTime = 0;
    this.eggDamaged = false;
    this.brokenEggs = 0;
    this.incidentPenalty = 0;
    this.recoveryTime = 0;
    this.recoveryDuration = 2.5;
    this.cookTime = 0;
    this.doneness = 0;
    this.whiteCook = 0;
    this.yolkCook = 0;
    this.edgeBrown = 0;
    this.heatTime = 0;
    this.heatIndex = 1;
    this.panHeat = HEAT_LEVEL_VALUES[this.heatIndex];
    this.currentHeat = 1;
    this.currentCookRate = this.cookingRules.rate;
    this.seasoned = false;
    this.seasonMissed = false;
    this.seasoningQuality = 0;
    this.heatLoweredAt = null;
    this.heatLoweringQuality = 0;
    this.lowerHeatMissed = false;
    this.heatControlQuality = 0;
    this.heatControlSamples = 0;
    this.roundHeatQuality = 0;
    this.basteCount = 0;
    this.basteQualityTotal = 0;
    this.basteMissed = false;
    this.basteCooldown = 0;
    this.basteBoostTime = 0;
    this.panTilt = 0;
    this.panMotion = 0;
    this.oilCoverage = 0;
    this.panCoatComplete = false;
    this.panMissed = false;
    this.panQuality = 0;
    this.panGestureActive = false;
    this.panGestureTravel = 0;
    this.panDirectionChanges = 0;
    this.panTotalTurns = 0;
    this.panLastGestureX = 0;
    this.panLastDirection = 0;
    this.panLastCoatDirection = 0;
    this.panPeakVelocity = 0;
    this.panSplashCount = 0;
    this.keyboardPanActive = false;
    this.flipInProgress = false;
    this.flipResolved = false;
    this.flipComplete = false;
    this.flipDamaged = false;
    this.flipProgress = 0;
    this.flipQuality = 0;
    this.flipMisses = 0;
    this.flipGestureActive = false;
    this.techniquePenalty = 0;
    this.eventScore = 0;
    this.eventsHandled = 0;
    this.eventsMissed = 0;
    this.nextKitchenEvent = 0;
    this.eventTriggers = this.cookingRules.eventCount > 1 ? [28, 58] : [36];
    this.activeEvent = null;
    this.eventAftershockTime = 0;
    this.eventAftershockHeat = 0;
    this.cookStep = 'set-edge';
    this.platingTime = 0;
    this.warningCooldown = 0;
    this.world.reset();
    this.world.setDifficulty({ ...this.rules, transport: this.transport });
    this.world.prepareCrackStage();
    this.ui.setTimer(this.timer, this.rules.roundTime);
    this.ui.setStability(100, 0, this.transport.warningSpeed);
    this.ui.resetCooking();
    this.ui.setCookingSteps(COOKING_STEPS, 'set-edge');
    this.ui.hideKitchenEvent();
    this.ui.setResultAchievements([]);
    this.ui.setDifficulty(this.difficultyKey, this.rules, this.coarsePointer);
    this.ui.showCooking(false);
    this.ui.setCrackRequirements(1, false);
    this.ui.setMission(1, '계란을 직접 깨볼까요?', '계란을 잡고 아래로 곧게 휘둘러 팬의 두꺼운 림에 톡 부딪히세요.');
    this.ui.showCrackStage(true);
    this.ui.setCrackFeedback('ready');
    this.crackInput.reset();
    this.crackInput.setEnabled(true);
    this.ui.showWorldLabel('crack', false);
    this.ui.flashDanger(false);
    if (!fromIntro) this.ui.showToast(`${this.rules.label} 모드 · 새 계란을 깨볼까요?`, 'good', 900);
  }

  handlePress() {
    if (this.phase === PHASE.READY) {
      if (!this.transition(PHASE.CARRYING)) return false;
      this.timerStarted = true;
      this.eggTarget.copy(this.world.eggGroup.position);
      this.eggTarget.y = GAME_CONFIG.dragPlaneY;
      this.sound.pickup();
      this.ui.showWorldLabel('egg', false);
      this.ui.setMission(1, '힘을 빼고, 속도를 일정하게', this.transport.fatigueAfter < 20
        ? `${this.transport.fatigueAfter.toFixed(1)}초 이상 들면 손 피로가 쌓여요.`
        : '빠른 움직임과 급격한 방향 전환은 껍질을 깨뜨려요.', 'HANDLE WITH CARE');
      return 'drag';
    }
    if (this.phase === PHASE.CRACK_READY) return 'tap';
    return false;
  }

  handleDrag({ world, speed, rawSpeed, sharpTurn }) {
    if (this.phase !== PHASE.CARRYING) return;
    this.eggTarget.set(
      clamp(world.x, -4.75, 3.15),
      GAME_CONFIG.dragPlaneY,
      clamp(world.z, -2.25, 2.4),
    );
    this.motionSpeed = Math.max(this.motionSpeed * 0.45, speed);
    this.rawMotionSpeed = Math.max(this.rawMotionSpeed * 0.5, rawSpeed);
    if (sharpTurn) {
      this.stress = clamp(this.stress + this.transport.turnPenalty, 0, 100);
      this.maxStress = Math.max(this.maxStress, this.stress);
      this.ui.showToast(`급회전 · 안정도 -${this.transport.turnPenalty}`, 'bad', 650);
      this.vibrate(14);
    }
  }

  handleDrop({ speed = 0 }) {
    if (this.phase !== PHASE.CARRYING) return;
    const eggPosition = this.world.eggGroup.position;
    const crackDistance = Math.hypot(
      eggPosition.x - GAME_CONFIG.crackPoint.x,
      eggPosition.z - GAME_CONFIG.crackPoint.z,
    );
    const boardDistance = Math.hypot(
      eggPosition.x - GAME_CONFIG.eggStart.x,
      eggPosition.z - GAME_CONFIG.eggStart.z,
    );

    if (crackDistance <= this.transport.crackZoneRadius) {
      if (speed > this.transport.releaseSpeed) {
        this.breakEgg(
          `착지 속도 ${speed.toFixed(2)} · 허용 ${this.transport.releaseSpeed.toFixed(2)}`,
          'landing_fast',
          '링 안에서는 완전히 감속한 뒤 손을 놓으세요.',
        );
        return;
      }
      if (this.stress > this.transport.maxLandingStress) {
        this.breakEgg(
          `착지 안정도 ${Math.round(100 - this.stress)}% · 필요 ${100 - this.transport.maxLandingStress}% 이상`,
          'landing_stressed',
          '링 근처에서 잠시 멈춰 안정도를 회복하세요.',
        );
        return;
      }
      if (this.settleTime + 0.025 < this.transport.settleDuration) {
        this.breakEgg(
          `정지 유지 ${this.settleTime.toFixed(2)}초 · 필요 ${this.transport.settleDuration.toFixed(2)}초`,
          'landing_unsettled',
          '링이 초록색으로 채워질 때까지 기다리세요.',
        );
        return;
      }
      this.landingError = crackDistance / this.transport.crackZoneRadius;
      this.landingSpeed = speed;
      this.world.eggGroup.position.copy(GAME_CONFIG.crackPoint);
      this.eggTarget.copy(GAME_CONFIG.crackPoint);
      this.world.eggGroup.rotation.set(0, 0, -0.09);
      this.transition(PHASE.CRACK_READY);
      this.motionSpeed = 0;
      this.rawMotionSpeed = 0;
      this.crackReadyTime = 0;
      this.ui.setMission(2, this.crackRules.timed ? '빛날 때 톡!' : '이제 톡, 톡!', this.crackRules.timed
        ? `${this.crackRules.taps}번의 초록 타이밍을 정확히 맞추세요.`
        : `계란을 짧게 ${this.crackRules.taps}번 톡톡 두드려봐요.`, '톡톡 준비');
      this.ui.showToast('안전하게 착지했어요', 'good', 950);
      this.sound.tone(660, 0.13, 'sine', 0.035, 760);
      this.vibrate(12);
      return;
    }

    if (boardDistance <= GAME_CONFIG.safeBoardRadius && speed < this.transport.releaseSpeed * 0.75) {
      this.world.eggGroup.position.copy(GAME_CONFIG.eggStart);
      this.eggTarget.copy(GAME_CONFIG.eggStart);
      this.transition(PHASE.READY);
      this.motionSpeed = 0;
      this.rawMotionSpeed = 0;
      this.settleTime = 0;
      this.ui.setMission(1, '다시 잡아도 괜찮아요', '제한시간은 계속 흐르고 있으니 침착하게 움직이세요.');
      this.ui.showToast('조리대에는 안전하게 내려놓았어요', '', 850);
      return;
    }

    this.breakEgg('팬 밖으로 떨어져 껍질이 깨졌어요.', 'dropped', '새 계란으로 다시 시도할 수 있어요.');
  }

  handleTap() {
    this.handleCrackStrike({
      impact: (this.crackRules.idealMin + this.crackRules.idealMax) / 2,
      downwardSpeed: 1.1,
      acceleration: 1,
      lateralRatio: 0,
      travel: 0.3,
      keyboard: true,
    });
  }

  handleCrackStrike(strike = {}) {
    if (this.phase !== PHASE.CRACK_READY) return;
    this.timerStarted = true;
    const impact = Number(strike.impact) || 0;
    const lateral = Number(strike.lateralRatio) || 0;
    this.crackImpact = Math.max(this.crackImpact, impact);

    if (lateral > this.crackRules.maxLateral && impact >= this.crackRules.minImpact * 0.8) {
      this.glancingStrikes += 1;
      this.crackMisses += 1;
      this.incidentPenalty += this.crackRules.glancePenalty;
      this.crackInput.showFeedback('glance');
      this.ui.setCrackFeedback('glance', {
        impact,
        penalty: this.crackRules.glancePenalty,
        message: '옆으로 긁혀 껍질 조각이 들어갔어요. 조리는 계속할 수 있어요.',
      });
      this.sound.warning();
      this.vibrate([20, 18, 28]);
      window.setTimeout(() => this.damageCrack(
        '팬의 림을 옆으로 스쳐 껍질 조각이 생겼어요.',
        'crack_glance',
        '다음에는 손목을 아래로 곧게 내려보세요.',
        false,
      ), 260);
      return;
    }

    if (impact < this.crackRules.minImpact) {
      this.weakStrikes += 1;
      this.crackMisses += 1;
      this.incidentPenalty += this.crackRules.weakPenalty;
      this.crackInput.showFeedback('weak');
      this.ui.setCrackFeedback('weak', {
        impact,
        penalty: this.crackRules.weakPenalty,
        message: '금이 생기지 않았어요. 짧고 빠르게 아래로 다시 휘둘러보세요.',
      });
      this.ui.showToast(`약한 타격 · -${this.crackRules.weakPenalty}`, 'bad', 800);
      this.sound.tone(260, 0.1, 'sine', 0.025, 210);
      this.vibrate(10);
      return;
    }

    if (impact > this.crackRules.breakImpact) {
      this.crackMisses += 1;
      this.incidentPenalty += this.crackRules.hardPenalty;
      this.crackInput.showFeedback('hard');
      this.ui.setCrackFeedback('hard', {
        impact,
        penalty: this.crackRules.hardPenalty,
        message: '충격이 너무 커 노른자가 터졌어요. 그래도 팬에서 살려낼 수 있어요.',
      });
      this.sound.warning();
      this.vibrate([26, 22, 38]);
      window.setTimeout(() => this.damageCrack(
        '너무 강한 충격으로 노른자가 터졌어요.',
        'crack_too_hard',
        '다음에는 힘 표시의 가운데를 노려보세요.',
        false,
      ), 260);
      return;
    }

    const center = (this.crackRules.idealMin + this.crackRules.idealMax) / 2;
    const half = Math.max(0.1, (this.crackRules.idealMax - this.crackRules.idealMin) / 2);
    const quality = clamp(1 - Math.abs(impact - center) / half * 0.32, 0.68, 1);
    const ideal = impact >= this.crackRules.idealMin && impact <= this.crackRules.idealMax;
    const penalty = ideal ? 0 : Math.round(this.crackRules.weakPenalty * 0.75);
    this.incidentPenalty += penalty;
    this.crackPerfect = ideal && lateral <= this.crackRules.maxLateral * 0.55;
    this.crackAccuracyTotal = quality;
    this.crackCount = 1;
    this.ui.setCrackTapCount(1);
    this.crackInput.showFeedback('good', 900);
    this.ui.setCrackFeedback('good', {
      impact,
      penalty,
      message: this.crackPerfect ? '깨끗한 금이 생겼어요. 이제 팬으로 쏙!' : '잘 깨졌어요. 다음에는 힘 표시 가운데를 노려보세요.',
    });
    this.sound.crack();
    this.vibrate([12, 24, 16]);
    window.setTimeout(() => this.finishCrack(), 300);
  }

  finishCrack() {
    if (this.phase !== PHASE.CRACK_READY) return;
    this.crackInput.setEnabled(false);
    this.ui.showCrackStage(false);
    this.transition(PHASE.CRACKING);
    this.crackTime = 0;
    this.world.beginCracking();
    this.ui.setMission(2, '깨끗하게 갈라졌어요', '흰자와 노른자가 팬으로 떨어지고 있어요.', '크랙 성공!');
  }

  handleCancel() {
    if (this.phase !== PHASE.CARRYING) return;
    this.world.eggGroup.position.copy(GAME_CONFIG.eggStart);
    this.eggTarget.copy(GAME_CONFIG.eggStart);
    this.motionSpeed = 0;
    this.rawMotionSpeed = 0;
    this.keyboardCarry = false;
    this.transition(PHASE.READY);
    this.ui.showToast('입력이 끊겨 계란을 안전한 곳으로 돌려놓았어요', '', 900);
  }

  beginCooking() {
    if (!this.transition(PHASE.COOKING)) return;
    this.crackInput.setEnabled(false);
    this.ui.showCrackStage(false);
    this.cookTime = 0;
    this.doneness = 0;
    this.whiteCook = 0;
    this.yolkCook = 0;
    this.edgeBrown = 0;
    this.heatTime = 0;
    this.heatIndex = 1;
    this.panHeat = HEAT_LEVEL_VALUES[this.heatIndex];
    this.currentHeat = 1;
    this.currentCookRate = this.cookingRules.rate;
    this.world.startCooking(this.crackDamaged);
    this.world.updateCooking(this.getCookingState(), 0, 1);
    this.sound.startSizzle();
    this.ui.showCooking(true);
    this.ui.setCookingSteps(COOKING_STEPS, 'set-edge');
    this.ui.setCookActions({
      heatIndex: this.heatIndex,
      season: { enabled: false, status: '흰자 30%부터' },
      baste: { enabled: false, status: '플립 시 자동' },
    });
    this.ui.setCookingInstruction('① 팬을 좌우로 굴리기', '팬 위를 좌우로 천천히 문질러 기름을 고르게 펴주세요. 빠르게 휘두르면 기름이 튀어요!');
    this.ui.setPanGesture?.({
      progress: 0,
      quality: 'idle',
      title: '팬을 좌우로 살랑살랑',
      hint: `${this.cookingRules.panControl?.requiredTurns || 2}번 방향을 바꾸면 기름 코팅 완성`,
      enabled: true,
      visible: true,
    });
    this.ui.setMission(3, '팬을 직접 움직여 구워요', '좌우로 굴리기 → 소금 → 위로 플릭 → 담기. 실패해도 조리는 계속돼요.', '손맛 나는 굽기');
    this.ui.showToast(this.crackDamaged
      ? '노른자가 터졌지만 아직 맛있게 살릴 수 있어요'
      : '흰자 끝이 서서히 하얘지고 있어요', this.crackDamaged ? 'bad' : 'good', 1500);
    this.vibrate([15, 30, 15]);
  }

  getCookingState() {
    return {
      doneness: this.doneness,
      whiteCook: this.whiteCook,
      yolkCook: this.yolkCook,
      edgeBrown: this.edgeBrown,
      damaged: this.crackDamaged,
      panTilt: this.panTilt,
      panMotion: this.panMotion,
      oilCoverage: this.oilCoverage,
      panCoatComplete: this.panCoatComplete,
      oil: this.oilCoverage,
      seasoning: this.seasoned ? Math.max(0.35, this.seasoningQuality) : 0,
      panShake: this.panMotion,
      flipProgress: this.flipProgress,
      flipDamaged: this.flipDamaged,
    };
  }

  handlePanGesture(data = {}) {
    if (this.phase !== PHASE.COOKING) return;
    if (this.cookStep === 'flip' || this.flipInProgress) {
      this.handleFlipGesture(data);
      return;
    }
    if (this.cookStep !== 'set-edge') return;
    const rules = this.cookingRules.panControl || {
      coverageTarget: 0.82, requiredTurns: 2, idealVelocity: 1.25, splashVelocity: 2.9, penalty: 20,
    };
    const gesturePhase = data.phase || 'move';
    const x = clamp(Number(data.x) || 0, -1, 1);
    const velocity = Math.abs(Number(data.velocity) || 0);

    if (gesturePhase === 'start') {
      this.panGestureActive = true;
      this.panGestureTravel = 0;
      this.panDirectionChanges = 0;
      this.panLastDirection = 0;
      this.panPeakVelocity = 0;
      this.panLastGestureX = x;
      this.panTilt = x * 0.16;
      return;
    }

    if (gesturePhase === 'move') {
      if (!this.panGestureActive) this.handlePanGesture({ ...data, phase: 'start' });
      const dx = x - this.panLastGestureX;
      const direction = Math.abs(dx) > 0.025 ? Math.sign(dx) : 0;
      if (direction && this.panLastDirection && direction !== this.panLastDirection) this.panDirectionChanges += 1;
      if (direction && this.panLastCoatDirection && direction !== this.panLastCoatDirection) this.panTotalTurns += 1;
      if (direction) this.panLastDirection = direction;
      if (direction) this.panLastCoatDirection = direction;
      this.panDirectionChanges = Math.max(this.panDirectionChanges, Number(data.directionChanges) || 0);
      this.panGestureTravel += Math.abs(dx);
      this.panPeakVelocity = Math.max(this.panPeakVelocity, velocity);
      this.panLastGestureX = x;
      this.panTilt = x * 0.2;
      this.panMotion = clamp(Math.max(Math.abs(dx) * 8, velocity / Math.max(0.1, rules.splashVelocity)), 0, 1);

      if (!this.panCoatComplete && !this.panMissed) {
        const control = velocity > rules.splashVelocity ? 0.22 : 1;
        const turnBonus = direction && this.panDirectionChanges > 0 ? 0.008 : 0;
        this.oilCoverage = clamp(this.oilCoverage + Math.abs(dx) * 0.48 * control + turnBonus, 0, 1);
      }
      this.ui.setPanGesture?.({
        progress: (this.oilCoverage / Math.max(0.01, rules.coverageTarget)) * 100,
        quality: velocity > rules.splashVelocity ? 'danger' : 'active',
        title: velocity > rules.splashVelocity ? '너무 빨라요!' : '좋아요, 반대쪽으로',
        hint: velocity > rules.splashVelocity ? '천천히 움직여 기름이 튀지 않게 해주세요.' : `방향 전환 ${Math.max(this.panDirectionChanges, this.panTotalTurns)}/${rules.requiredTurns}`,
        enabled: true,
        visible: true,
      });
      return;
    }

    if (gesturePhase !== 'end') return;
    this.panGestureActive = false;
    const turns = Math.max(this.panDirectionChanges, this.panTotalTurns, Number(data.directionChanges) || 0);
    const tooFast = this.panPeakVelocity > rules.splashVelocity;
    if (tooFast && this.panSplashCount < 2) {
      this.panSplashCount += 1;
      this.techniquePenalty += rules.penalty;
      this.oilCoverage = Math.max(0, this.oilCoverage - 0.16);
      this.edgeBrown += 3 + this.panSplashCount * 2;
      this.ui.showToast(`기름이 튀었어요 · -${rules.penalty} (조리는 계속!)`, 'bad', 900);
      this.ui.setPanGesture?.({ progress: this.oilCoverage * 100, quality: 'danger', title: '기름이 튀었어요', hint: '속도를 낮춰 다시 굴려도 괜찮아요.', enabled: true, visible: true });
      this.sound.warning();
      this.vibrate([16, 18, 24]);
    }

    if (!tooFast && !this.panCoatComplete && this.oilCoverage >= rules.coverageTarget && turns >= rules.requiredTurns) {
      const speedQuality = clamp(1 - Math.abs(this.panPeakVelocity - rules.idealVelocity) / Math.max(0.8, rules.idealVelocity), 0, 1);
      const coverageQuality = clamp(this.oilCoverage / Math.max(0.01, rules.coverageTarget), 0, 1);
      this.panQuality = clamp(speedQuality * 0.55 + coverageQuality * 0.45, 0, 1);
      this.panCoatComplete = true;
      this.oilCoverage = 1;
      this.world.pulseCookingAction('baste');
      this.sound.tone(this.panQuality > 0.72 ? 760 : 620, 0.14, 'triangle', 0.035, 860);
      this.ui.showToast(this.panQuality > 0.72 ? '매끈하게 한 바퀴! 팬 코팅 완벽' : '기름이 고르게 퍼졌어요', 'good', 900);
      this.ui.setPanGesture?.({ progress: 100, quality: this.panQuality > 0.72 ? 'perfect' : 'good', title: '팬 코팅 완성!', hint: '이제 소금 타이밍을 확인하세요.', enabled: false, visible: true });
      this.vibrate([8, 22, 10]);
    } else if (!tooFast && !this.panCoatComplete && this.panGestureTravel > 0.12) {
      const left = Math.max(0, rules.requiredTurns - turns);
      this.ui.showToast(left ? `방향을 ${left}번만 더 바꿔보세요` : '조금 더 넓게 굴려주세요', '', 680);
    }

    if (this.activeEvent?.type === 'oil-pop' && !tooFast && this.panGestureTravel >= 0.2) {
      this.handleEventResponse(this.activeEvent.id);
    }
    this.panTilt *= 0.45;
  }

  handleFlipGesture(data = {}) {
    if (this.flipResolved || this.flipInProgress || this.cookStep !== 'flip') return;
    const rules = this.cookingRules.flipControl;
    if (!rules) return;
    const gesturePhase = data.phase || 'move';
    if (gesturePhase === 'start') {
      this.flipGestureActive = true;
      this.panMotion = 0.18;
      this.ui.setPanGesture?.({ mode: 'flip', progress: 0, quality: 'active', title: '준비… 위로!', hint: '손가락을 팬 아래에서 위로 빠르게 밀어주세요.', enabled: true, visible: true });
      return;
    }
    if (gesturePhase === 'move') {
      const upward = Math.max(0, Number(data.upwardVelocity) || 0);
      const travel = Math.abs(Math.min(0, Number(data.travelY) || 0));
      this.panTilt = clamp((Number(data.travelX) || 0) * 0.16, -0.16, 0.16);
      this.panMotion = clamp(Math.max(upward / Math.max(1, rules.hardVelocity), travel), 0, 1);
      this.ui.setPanGesture?.({
        mode: 'flip',
        progress: clamp(travel / 1.25, 0, 1) * 100,
        quality: upward > rules.hardVelocity ? 'danger' : 'active',
        title: upward > rules.hardVelocity ? '너무 세요!' : '그대로 위로!',
        hint: `현재 속도 ${upward.toFixed(1)} · 목표 ${rules.idealMinVelocity.toFixed(1)}~${rules.idealMaxVelocity.toFixed(1)}`,
        enabled: true,
        visible: true,
      });
      return;
    }
    if (gesturePhase !== 'end' || !this.flipGestureActive) return;
    this.flipGestureActive = false;
    const upward = Math.max(0, Number(data.upwardVelocity) || 0);
    const travelX = Math.abs(Number(data.travelX) || 0);
    const travelY = Math.abs(Math.min(0, Number(data.travelY) || 0));
    const lateral = travelX / Math.max(0.16, travelY);
    const smallPenalty = Math.max(4, Math.round(rules.penalty * 0.24));

    if (this.whiteCook < rules.readyWhite) {
      this.flipMisses += 1;
      this.techniquePenalty += smallPenalty;
      this.ui.showToast(`아직 흰자가 묽어요 · -${smallPenalty}, 다시 시도!`, 'bad', 800);
      this.ui.setPanGesture?.({ mode: 'flip', progress: 0, quality: 'warning', title: '조금만 기다려요', hint: `흰자 ${Math.round(rules.readyWhite)}%부터 뒤집을 수 있어요.`, enabled: true, visible: true });
      return;
    }
    if (upward < rules.minUpwardVelocity || travelY < 0.42) {
      this.flipMisses += 1;
      this.techniquePenalty += smallPenalty;
      this.ui.showToast(`플릭이 약했어요 · -${smallPenalty}, 다시 위로!`, 'bad', 760);
      this.ui.setPanGesture?.({ mode: 'flip', progress: 0, quality: 'warning', title: '조금 더 빠르게', hint: '아래에서 위까지 한 번에 밀어주세요.', enabled: true, visible: true });
      return;
    }
    if (lateral > rules.maxLateral) {
      this.resolveFlip(true, '옆으로 새서 노른자가 조금 흐트러졌어요');
      return;
    }
    if (upward > rules.hardVelocity || this.whiteCook > rules.expireWhite) {
      this.resolveFlip(true, upward > rules.hardVelocity ? '너무 세게 뒤집어 모양이 흐트러졌어요' : '조금 늦게 뒤집어 가장자리가 바삭해졌어요');
      return;
    }

    const timingMid = (rules.idealMinWhite + rules.idealMaxWhite) / 2;
    const timingHalf = Math.max(1, (rules.idealMaxWhite - rules.idealMinWhite) / 2);
    const timingQuality = clamp(1 - Math.abs(this.whiteCook - timingMid) / (timingHalf * 1.8), 0, 1);
    const velocityQuality = upward < rules.idealMinVelocity
      ? clamp((upward - rules.minUpwardVelocity) / Math.max(0.1, rules.idealMinVelocity - rules.minUpwardVelocity), 0, 1)
      : upward > rules.idealMaxVelocity
        ? clamp((rules.hardVelocity - upward) / Math.max(0.1, rules.hardVelocity - rules.idealMaxVelocity), 0, 1)
        : 1;
    this.flipQuality = clamp(timingQuality * 0.58 + velocityQuality * 0.42, 0, 1);
    this.resolveFlip(false, this.flipQuality > 0.78 ? '공중에서 예쁘게 한 바퀴!' : '무사히 뒤집었어요');
  }

  resolveFlip(damaged, message) {
    if (this.flipResolved) return;
    const rules = this.cookingRules.flipControl;
    this.flipResolved = true;
    this.flipInProgress = true;
    this.flipDamaged = Boolean(damaged);
    this.flipProgress = 0.001;
    if (damaged) {
      this.flipQuality = Math.max(0.08, this.flipQuality * 0.35);
      this.techniquePenalty += rules.penalty;
      this.edgeBrown += 5;
    }

    // 뒤집기 한 동작에 약불 전환과 버터 코팅을 합쳐 기존 점수/업적
    // 데이터는 유지하면서 화면의 버튼 수는 줄인다.
    this.heatIndex = 0;
    this.heatLoweredAt = this.whiteCook;
    this.heatLoweringQuality = damaged ? 0.35 : Math.max(0.55, this.flipQuality);
    this.basteCount = 1;
    this.basteQualityTotal = damaged ? 0.3 : Math.max(0.55, this.flipQuality);
    this.basteBoostTime = 0.65;
    this.ui.setCookActions({ heatIndex: this.heatIndex });
    this.ui.setPanGesture?.({ mode: 'flip', progress: 0, quality: damaged ? 'danger' : this.flipQuality > 0.78 ? 'perfect' : 'good', title: damaged ? '그래도 팬 안에 착지!' : '플립 성공!', hint: '착지하는 동안 잠깐만 기다려주세요.', enabled: false, visible: true });
    this.world.pulseCookingAction('flip');
    this.sound.tone(damaged ? 360 : 820, 0.22, 'triangle', 0.04, damaged ? 280 : 1040);
    this.ui.showToast(`${message}${damaged ? ` · -${rules.penalty}` : ''}`, damaged ? 'bad' : 'good', 920);
    this.vibrate(damaged ? [20, 16, 28] : [10, 24, 12]);
  }

  changeHeat(delta, forced = false) {
    if (this.phase !== PHASE.COOKING) return;
    if (!forced) {
      this.ui.showToast('화력은 뒤집을 때 자동으로 낮춰져요', '', 650);
      return;
    }
    const next = clamp(this.heatIndex + Math.sign(delta), 0, HEAT_LEVEL_VALUES.length - 1);
    if (next === this.heatIndex) return;
    this.heatIndex = next;
    if (next === 0 && this.heatLoweredAt == null) {
      this.heatLoweredAt = this.whiteCook;
      const window = 24 * this.cookingRules.windowScale;
      this.heatLoweringQuality = clamp(1 - Math.abs(this.whiteCook - 48) / window, 0, 1);
      this.ui.showToast(this.heatLoweringQuality > 0.7 ? '좋아요! 약불로 노른자를 보호해요' : '약불 전환 완료 · 조금 늦어 감점이 있어요', this.heatLoweringQuality > 0.7 ? 'good' : '', 850);
    }
    this.ui.setCookActions({ heatIndex: this.heatIndex });
    this.world.pulseCookingAction('heat');
    this.sound.tone([310, 455, 620][this.heatIndex], 0.1, 'sine', 0.025, [280, 420, 700][this.heatIndex]);
  }

  performCookAction(action) {
    if (this.phase !== PHASE.COOKING) return;
    if (action === 'season') {
      const enabled = this.cookStep === 'season' && !this.seasoned && !this.seasonMissed && this.whiteCook >= 26 && this.whiteCook <= 72;
      if (!enabled) {
        this.ui.showToast(this.cookStep === 'set-edge' ? '먼저 팬의 기름을 고르게 펴주세요' : '지금은 소금 단계가 아니에요', '', 620);
        return;
      }
      const window = 22 * this.cookingRules.windowScale;
      this.seasoningQuality = clamp(1 - Math.abs(this.whiteCook - 48) / window, 0, 1);
      this.seasoned = true;
      this.world.pulseCookingAction('season');
      this.sound.tone(820, 0.12, 'sine', 0.025, 1040);
      this.ui.showToast(this.seasoningQuality > 0.72 ? '간이 딱 좋아요!' : '간 완료 · 타이밍 보너스는 조금 낮아요', this.seasoningQuality > 0.72 ? 'good' : '', 780);
      this.vibrate(10);
      return;
    }
    if (action === 'baste') this.ui.showToast('버터는 플립과 함께 자동으로 둘러요', '', 620);
  }

  requestServe() {
    if (this.phase !== PHASE.COOKING) return;
    if (this.cookStep !== 'plate' || !this.flipComplete) {
      this.ui.showToast(this.flipInProgress ? '계란이 착지하고 있어요' : '먼저 위로 플릭해 뒤집어주세요', '', 720);
      return;
    }
    if (this.activeEvent) this.expireKitchenEvent();
    const delay = this.cookingRules.platingDelay;
    if (delay <= 0) {
      this.scoreCooking();
      return;
    }
    if (!this.transition(PHASE.PLATING)) return;
    this.platingTime = 0;
    this.ui.setPlating(delay);
    this.ui.showToast(`플레이팅 중 · 잔열 ${delay.toFixed(2)}초`, '', 700);
    this.sound.tone(480, 0.18, 'triangle', 0.035, 620);
  }

  advanceCooking(dt) {
    this.cookTime += dt;
    this.heatTime += dt;
    this.basteCooldown = Math.max(0, this.basteCooldown - dt);
    this.basteBoostTime = Math.max(0, this.basteBoostTime - dt);
    this.eventAftershockTime = Math.max(0, this.eventAftershockTime - dt);
    this.panMotion *= Math.exp(-dt * 7.5);
    if (!this.panGestureActive) this.panTilt *= Math.exp(-dt * 5.5);
    if (this.flipInProgress) {
      this.flipProgress = clamp(this.flipProgress + dt / 0.7, 0, 1);
      this.panMotion = Math.max(this.panMotion, Math.sin(this.flipProgress * Math.PI) * 0.72);
      if (this.flipProgress >= 1) {
        this.flipInProgress = false;
        this.flipComplete = true;
        this.panTilt = 0;
        this.panMotion = 0.12;
        this.ui.showToast(this.flipDamaged ? '모양은 흐트러졌지만 맛있게 마무리해요' : '착지 성공! 이제 초록 구간에 담으세요', this.flipDamaged ? '' : 'good', 850);
      }
    }
    this.updateKitchenEvents(dt);

    const swing = this.cookingRules.heatSwing;
    const heatWave = Math.sin(this.heatTime * this.cookingRules.heatSpeed)
      + Math.sin(this.heatTime * this.cookingRules.heatSpeed * 0.43 + 1.8) * 0.34;
    const eventHeat = this.activeEvent?.heatModifier || (this.eventAftershockTime > 0 ? this.eventAftershockHeat : 0);
    const heatTarget = clamp(HEAT_LEVEL_VALUES[this.heatIndex] + heatWave * swing + eventHeat, 0.48, 1.52);
    this.panHeat += (heatTarget - this.panHeat) * (1 - Math.exp(-dt * 2.5));
    this.currentHeat = this.panHeat;
    this.currentCookRate = this.cookingRules.rate * this.currentHeat;
    const basteBoost = this.basteBoostTime > 0 ? 1 : 0;
    const whiteRate = this.cookingRules.rate * (0.87 + this.currentHeat * 0.38 + basteBoost * 0.08);
    const yolkRate = this.cookingRules.rate * (0.54 + this.currentHeat * 0.29 + basteBoost * 0.13) * (this.crackDamaged ? 1.08 : 1);
    const oilProtection = this.panCoatComplete ? 0.72 : this.panMissed ? 1.28 : 1;
    const edgeRate = this.whiteCook > 20
      ? this.cookingRules.rate * Math.max(0, this.currentHeat - 0.68) * 1.4 * oilProtection
      : 0;
    const airborneRate = this.flipInProgress ? 0.42 : 1;
    this.whiteCook += whiteRate * dt * airborneRate;
    this.yolkCook += yolkRate * dt * airborneRate;
    this.edgeBrown += edgeRate * dt * airborneRate;
    this.doneness = this.whiteCook * 0.55 + this.yolkCook * 0.45;

    const desiredHeatIndex = this.whiteCook < 40 ? 1 : 0;
    const heatSample = clamp(1 - Math.abs(this.heatIndex - desiredHeatIndex) * 0.62, 0, 1);
    this.heatControlQuality += heatSample * dt;
    this.heatControlSamples += dt;

    const missPenalty = { easy: 18, normal: 30, hard: 45, extreme: 60 }[this.difficultyKey];
    if (!this.panCoatComplete && !this.panMissed && this.whiteCook > 58) {
      this.panMissed = true;
      this.techniquePenalty += Math.round(missPenalty * 0.8);
      this.ui.showToast(`팬 코팅을 놓쳤어요 · 가장자리가 빨리 익어요`, 'bad', 900);
    }
    if (!this.seasoned && !this.seasonMissed && this.whiteCook > 72) {
      this.seasonMissed = true;
      this.techniquePenalty += missPenalty;
      this.ui.showToast(`소금 타이밍을 놓쳤어요 · -${missPenalty}`, 'bad', 850);
    }
    const flipRules = this.cookingRules.flipControl;
    if (this.cookStep === 'flip' && !this.flipResolved && flipRules && this.whiteCook > flipRules.expireWhite) {
      this.resolveFlip(true, '뒤집을 타이밍을 놓쳐 가장자리가 바삭해졌어요');
    }

    const delay = this.cookingRules.platingDelay;
    const predictedWhite = this.whiteCook + whiteRate * delay;
    const predictedYolk = this.yolkCook + yolkRate * delay;
    const predictedEdge = this.edgeBrown + edgeRate * delay;
    const prediction = predictedWhite * 0.55 + predictedYolk * 0.45;
    this.world.updateCooking(this.getCookingState(), this.cookTime, this.currentHeat);
    this.ui.updateCooking(this.doneness, this.cookTime, {
      rules: this.cookingRules,
      prediction,
      heat: this.currentHeat,
      plating: this.phase === PHASE.PLATING,
      detailedStatus: this.evaluateCookingStatus(),
      predictedDetailedStatus: this.evaluateCookingStatus({ whiteCook: predictedWhite, yolkCook: predictedYolk, edgeBrown: predictedEdge }),
    });
    this.ui.updateCookingDetails?.({
      white: this.whiteCook,
      yolk: this.yolkCook,
      edge: this.edgeBrown,
      rules: this.cookingRules,
      plating: this.phase === PHASE.PLATING,
    });
    this.updateCookingSteps();
    if (this.doneness >= this.cookingRules.burnAt || this.whiteCook >= 126 || this.yolkCook >= 102 || this.edgeBrown >= 100) this.scoreCooking();
  }

  updateCookingSteps() {
    const completed = [];
    const failed = [];
    if (this.panCoatComplete) completed.push('set-edge');
    else if (this.panMissed) failed.push('set-edge');
    if (this.seasoned) completed.push('season');
    else if (this.seasonMissed) failed.push('season');
    if (this.flipComplete) completed.push('flip');
    else if (this.flipDamaged) failed.push('flip');

    if (!this.panCoatComplete && !this.panMissed) this.cookStep = 'set-edge';
    else if (!this.seasoned && !this.seasonMissed) this.cookStep = 'season';
    else if (!this.flipComplete) this.cookStep = 'flip';
    else this.cookStep = 'plate';
    if (this.cookStep !== 'set-edge' && this.panGestureActive) {
      this.panGestureActive = false;
      this.panTilt = 0;
      this.panMotion = Math.min(this.panMotion, 0.12);
    }

    const seasonEnabled = this.phase === PHASE.COOKING && this.cookStep === 'season' && !this.seasoned && !this.seasonMissed && this.whiteCook >= 26 && this.whiteCook <= 72;
    const instructions = {
      'set-edge': ['① 팬을 좌우로 굴리기', `팬 위를 누른 채 방향을 ${this.cookingRules.panControl.requiredTurns}번 바꾸세요. 너무 빠르면 기름이 튀어요.`],
      season: ['② 소금 한 꼬집', '아래의 노란 소금 버튼을 한 번 누르세요.'],
      flip: ['③ 위로 플릭!', '팬 아래에서 위로 곧게 밀어 계란을 뒤집으세요. 나머지 조절은 자동이에요.'],
      plate: ['④ 초록색이면 담기', '흰자와 노른자가 목표 구간에 들어오면 완성 버튼을 누르세요.'],
    };
    const [instructionTitle, instructionHelp] = instructions[this.cookStep];
    this.ui.setCookingInstruction(instructionTitle, instructionHelp);
    if (this.cookStep === 'flip') {
      const rules = this.cookingRules.flipControl;
      const ready = this.whiteCook >= rules.readyWhite;
      const timingProgress = clamp((this.whiteCook - rules.readyWhite) / Math.max(1, rules.idealMinWhite - rules.readyWhite), 0, 1) * 100;
      this.ui.setPanGesture?.({
        mode: 'flip',
        progress: this.flipInProgress ? this.flipProgress * 100 : timingProgress,
        quality: this.flipDamaged ? 'danger' : this.flipInProgress ? 'perfect' : ready ? 'ready' : 'wait',
        title: this.flipInProgress ? '공중에서 한 바퀴!' : ready ? '지금 위로 플릭!' : '흰자가 잡히는 중…',
        hint: this.flipInProgress ? '팬으로 다시 착지하고 있어요.' : ready ? '아래에서 위로 곧고 빠르게 밀어주세요.' : `${Math.max(0, Math.ceil(rules.readyWhite - this.whiteCook))}%만 더 기다려요.`,
        enabled: !this.flipResolved,
        visible: true,
      });
    } else if (this.cookStep !== 'set-edge') {
      this.ui.setPanGesture?.({ mode: 'roll', progress: this.panCoatComplete ? 100 : this.oilCoverage * 100, enabled: false, visible: false });
    }
    const penaltyReason = this.eventsMissed ? '돌발 상황 대응을 놓쳤어요'
      : this.flipDamaged ? '뒤집기에서 모양이 흐트러졌어요'
        : this.seasonMissed ? '소금 타이밍을 놓쳤어요'
            : this.panMissed ? '팬 코팅을 놓쳤어요'
              : this.panSplashCount ? '팬을 너무 세게 흔들었어요'
            : this.incidentPenalty ? '계란 깨기에서 감점됐어요' : '아직 감점 없음';
    this.ui.setPenalty(this.techniquePenalty + this.incidentPenalty, penaltyReason);
    this.ui.setCookingStep(this.cookStep, { completed, failed, completePrevious: false });
    this.ui.setCookActions({
      heatIndex: this.heatIndex,
      heatLocked: true,
      season: {
        enabled: seasonEnabled,
        active: this.seasoned,
        status: this.seasoned ? '완료' : this.seasonMissed ? '놓침' : seasonEnabled ? '지금 가능' : '대기',
      },
      baste: { enabled: false, active: this.basteCount >= 1, status: this.basteCount >= 1 ? '자동 완료' : '플립 시 자동' },
    });
  }

  updateKitchenEvents(dt) {
    if (this.activeEvent) {
      this.activeEvent.remaining -= dt;
      this.ui.updateKitchenEvent(this.activeEvent.remaining, this.activeEvent.duration);
      if (this.activeEvent.remaining <= 0) this.expireKitchenEvent();
      return;
    }
    if (this.phase !== PHASE.COOKING || this.nextKitchenEvent >= this.cookingRules.eventCount) return;
    if (this.whiteCook < this.eventTriggers[this.nextKitchenEvent]) return;
    const difficultyOffset = ['easy', 'normal', 'hard', 'extreme'].indexOf(this.difficultyKey);
    const definition = KITCHEN_EVENTS[(this.roundId + this.nextKitchenEvent + difficultyOffset) % KITCHEN_EVENTS.length];
    const occurrence = this.nextKitchenEvent + 1;
    this.nextKitchenEvent += 1;
    this.activeEvent = {
      ...definition,
      id: `${definition.type}-${occurrence}`,
      duration: this.cookingRules.eventDuration,
      remaining: this.cookingRules.eventDuration,
    };
    this.ui.showKitchenEvent(this.activeEvent);
    this.sound.warning();
    this.vibrate([12, 20, 12]);
  }

  handleEventResponse(id) {
    if (this.phase === PHASE.RECOVERING && this.activeEvent?.id === id) {
      this.finishRecovery(false);
      return;
    }
    if (this.phase !== PHASE.COOKING || !this.activeEvent || this.activeEvent.id !== id) return;
    const event = this.activeEvent;
    const responseRatio = clamp(event.remaining / event.duration, 0, 1);
    const perfect = responseRatio >= 0.55;
    this.eventsHandled += 1;
    this.eventScore += perfect ? 10 : 6;
    if (event.type === 'heat-surge') this.changeHeat(-1, true);
    else if (event.type === 'flame-dip') this.changeHeat(1, true);
    else {
      this.basteBoostTime = Math.max(this.basteBoostTime, 0.7);
      this.world.pulseCookingAction('baste');
    }
    this.ui.hideKitchenEvent();
    this.activeEvent = null;
    this.sound.tone(perfect ? 780 : 620, 0.15, 'triangle', 0.035, 900);
    this.ui.showToast(perfect ? '돌발 상황 완벽 대응!' : '돌발 상황 처리 완료', 'good', 820);
    this.applyAchievementUpdate(this.achievements.recordKitchenEvent({ roundId: this.roundId, eventId: event.id, outcome: perfect ? 'perfect' : 'resolved' }));
  }

  expireKitchenEvent() {
    const event = this.activeEvent;
    if (!event) return;
    this.eventsMissed += 1;
    this.techniquePenalty += 24;
    this.eventAftershockTime = 2.2;
    this.eventAftershockHeat = event.heatModifier * 0.65;
    this.ui.hideKitchenEvent();
    this.activeEvent = null;
    this.ui.showToast('대응을 놓쳤어요 · 조리는 계속됩니다', 'bad', 900);
    this.applyAchievementUpdate(this.achievements.recordKitchenEvent({ roundId: this.roundId, eventId: event.id, outcome: 'failed' }));
  }

  scoreCooking() {
    if (![PHASE.COOKING, PHASE.PLATING].includes(this.phase)) return;
    if (this.activeEvent) this.expireKitchenEvent();
    const status = this.evaluateCookingStatus();
    const crackQuality = clamp(this.crackCount ? this.crackAccuracyTotal / this.crackCount : 0, 0, 1);
    let cookingScore;
    let handlingScore;
    if (status === 'perfect') {
      const whiteAccuracy = this.componentAccuracy(this.whiteCook, this.cookingRules.whiteMin, this.cookingRules.whiteMax);
      const yolkAccuracy = this.componentAccuracy(this.yolkCook, this.cookingRules.yolkMin, this.cookingRules.yolkMax);
      const edgeAccuracy = 1 - clamp(this.edgeBrown / Math.max(1, this.cookingRules.edgeMax), 0, 1) * 0.22;
      const sampledHeatQuality = this.heatControlSamples > 0 ? this.heatControlQuality / this.heatControlSamples : 0;
      const lowerHeatQuality = this.heatLoweredAt == null ? 0 : this.heatLoweringQuality;
      const heatQuality = clamp(sampledHeatQuality * 0.65 + lowerHeatQuality * 0.35, 0, 1);
      const basteQuality = this.basteCount ? this.basteQualityTotal : 0;
      const eventQuality = this.cookingRules.eventCount ? clamp(this.eventScore / (this.cookingRules.eventCount * 10), 0, 1) : 1;
      const panTechnique = this.panCoatComplete ? this.panQuality : 0;
      const flipTechnique = this.flipComplete ? this.flipQuality : 0;
      const techniqueScore = panTechnique * 20 + flipTechnique * 25 + this.seasoningQuality * 15 + heatQuality * 10 + basteQuality * 10 + eventQuality * 10;
      this.roundHeatQuality = heatQuality;
      cookingScore = Math.round(whiteAccuracy * 190 + yolkAccuracy * 190 + edgeAccuracy * 50 + techniqueScore - this.techniquePenalty);
      const crackScore = 300 * crackQuality * Math.max(0, 1 - this.crackMisses * 0.12);
      const timeScore = 200 * clamp((this.timer / this.rules.roundTime) * 2.1, 0, 1);
      handlingScore = Math.round(clamp(crackScore + timeScore, 0, 500) - this.incidentPenalty);
    } else {
      const whiteDeviation = this.whiteCook < this.cookingRules.whiteMin
        ? this.cookingRules.whiteMin - this.whiteCook
        : Math.max(0, this.whiteCook - this.cookingRules.whiteMax);
      const yolkDeviation = this.yolkCook < this.cookingRules.yolkMin
        ? this.cookingRules.yolkMin - this.yolkCook
        : Math.max(0, this.yolkCook - this.cookingRules.yolkMax);
      const edgeDeviation = Math.max(0, this.edgeBrown - this.cookingRules.edgeMax);
      cookingScore = -Math.round(Math.min(500, 120 + (whiteDeviation + yolkDeviation + edgeDeviation) * 6 + this.techniquePenalty));
      handlingScore = -this.incidentPenalty;
    }
    const baseScore = cookingScore + handlingScore;
    const roundScore = Math.round(baseScore * this.rules.multiplier);
    this.completeRound({
      status,
      cookingScore,
      handlingScore,
      roundScore,
      multiplier: this.rules.multiplier,
      difficulty: this.rules,
      doneness: this.doneness,
      whiteCook: this.whiteCook,
      yolkCook: this.yolkCook,
      edgeBrown: this.edgeBrown,
      eggDamaged: this.eggDamaged,
      brokenEggs: this.brokenEggs,
      maxStress: this.maxStress,
      crackPerfect: this.crackPerfect,
      crackQuality,
      crackDamaged: this.crackDamaged,
      weakStrikes: this.weakStrikes,
      glancingStrikes: this.glancingStrikes,
      seasoned: this.seasoned,
      basteCount: this.basteCount,
      panQuality: this.panQuality,
      panCoatComplete: this.panCoatComplete,
      flipQuality: this.flipQuality,
      flipComplete: this.flipComplete,
      flipDamaged: this.flipDamaged,
      techniquePerfect: this.panCoatComplete && this.seasoned && this.flipComplete && !this.flipDamaged && this.heatLoweredAt != null && this.basteCount >= 1 && this.techniquePenalty === 0,
      heatQuality: this.roundHeatQuality || 0,
    });
  }

  evaluateCookingStatus(state = this) {
    if (state.edgeBrown > this.cookingRules.edgeMax || state.whiteCook > this.cookingRules.whiteMax || state.yolkCook > this.cookingRules.yolkMax) return 'overcooked';
    if (state.whiteCook < this.cookingRules.whiteMin || state.yolkCook < this.cookingRules.yolkMin) return 'undercooked';
    return 'perfect';
  }

  componentAccuracy(value, min, max) {
    const midpoint = (min + max) / 2;
    const halfWindow = Math.max(1, (max - min) / 2);
    return clamp(1 - Math.abs(value - midpoint) / halfWindow * 0.22, 0.72, 1);
  }

  breakEgg(reason, failureCode = 'broken', tip = '새 계란으로 이어갈 수 있어요.') {
    if (![PHASE.READY, PHASE.CARRYING, PHASE.CRACK_READY].includes(this.phase)) return;
    if (this.phase === PHASE.CRACK_READY) {
      this.damageCrack(reason, failureCode, tip);
      return;
    }
    this.transition(PHASE.RECOVERING, true);
    this.input.cancelActive();
    this.keyboardCarry = false;
    this.eggDamaged = true;
    this.brokenEggs += 1;
    this.incidentPenalty += this.rules.breakPenalty;
    this.recoveryTime = 0;
    this.world.failEgg();
    this.sound.failure();
    this.ui.showWorldLabel('egg', false);
    this.ui.showWorldLabel('crack', false);
    this.ui.flashDanger(true);
    this.ui.setMission(1, '괜찮아, 새 계란이 있어요!', `${reason} 감점 -${this.rules.breakPenalty} · ${tip}`, '다시 차분하게');
    this.activeEvent = {
      id: `rescue-${this.brokenEggs}`,
      icon: '🥚',
      title: '새 계란을 준비할까요?',
      message: '바로 받으면 시간을 아낄 수 있어요. 놓쳐도 자동으로 계속됩니다.',
      responseLabel: '새 계란 받기',
      kind: 'warning',
      duration: this.recoveryDuration,
      remaining: this.recoveryDuration,
    };
    this.ui.showKitchenEvent(this.activeEvent);
    this.ui.showToast(`계란은 깨졌지만 요리는 계속! · -${this.rules.breakPenalty}`, 'bad', 1250);
    this.vibrate([30, 35, 55]);
  }

  finishRecovery(automatic = false) {
    if (this.phase !== PHASE.RECOVERING) return;
    if (automatic) this.incidentPenalty += Math.round(this.rules.breakPenalty * 0.25);
    this.activeEvent = null;
    this.ui.hideKitchenEvent();
    this.ui.flashDanger(false);
    this.world.resetEggOnly();
    this.eggTarget.copy(GAME_CONFIG.eggStart);
    this.previousEggPosition.copy(GAME_CONFIG.eggStart);
    this.eggVelocity.set(0, 0, 0);
    this.stress = 0;
    this.motionSpeed = 0;
    this.rawMotionSpeed = 0;
    this.shockExposure = 0;
    this.holdingTime = 0;
    this.settleTime = 0;
    this.crackCount = 0;
    this.crackMisses = 0;
    this.crackAccuracyTotal = 0;
    this.crackReadyTime = 0;
    this.crackBeatIndex = 0;
    this.lastCrackBeat = -1;
    this.crackCanHit = !this.crackRules.timed;
    this.ui.setCrackRequirements(this.crackRules.taps, this.crackRules.timed);
    this.transition(PHASE.READY);
    this.ui.setStability(100, 0, this.transport.warningSpeed);
    this.ui.setMission(1, '새 계란이 도착했어요', `파손 ${this.brokenEggs}회 · 누적 처리 감점 -${this.incidentPenalty}`, '살살 다시 시작');
    this.ui.showToast(automatic ? '자동으로 새 계란을 준비했어요' : '빠른 교체 성공!', automatic ? '' : 'good', 900);
    this.sound.tone(automatic ? 480 : 680, 0.15, 'sine', 0.03, 760);
  }

  damageCrack(reason, failureCode = 'crack-damaged', tip = '손상된 상태로 조리를 이어갑니다.', addDefaultPenalty = true) {
    if (this.phase !== PHASE.CRACK_READY) return;
    this.eggDamaged = true;
    this.crackDamaged = true;
    this.brokenEggs += 1;
    const penalty = addDefaultPenalty ? Math.round(this.rules.breakPenalty * 1.15) : 0;
    this.incidentPenalty += penalty;
    this.crackInput.setEnabled(false);
    this.ui.showCrackStage(false);
    this.transition(PHASE.CRACKING);
    this.crackTime = 0;
    this.world.beginCracking();
    this.sound.crack();
    this.ui.showWorldLabel('crack', false);
    this.ui.setMission(2, '노른자가 터졌지만 아직 끝이 아니에요', `${reason}${penalty ? ` 감점 -${penalty}` : ''} · ${tip}`, failureCode.toUpperCase());
    this.ui.showToast('아직 끝이 아니에요 · 팬에서 맛있게 살려봐요', 'bad', 1300);
    this.vibrate([22, 25, 34]);
  }

  refreshAchievements() {
    this.refreshCollections();
  }

  refreshCollections() {
    const achievements = this.achievements.getSnapshot();
    const cosmetics = this.cosmetics.getSnapshot(achievements);
    this.ui.setAchievements(achievements);
    this.ui.setCosmetics(cosmetics);
    this.world.setCosmetics(cosmetics.equipped);
  }

  equipSkin(type, id) {
    const achievements = this.achievements.getSnapshot();
    const result = this.cosmetics.equip(type, id, achievements);
    this.ui.setCosmetics(result.snapshot);
    if (!result.changed) return;
    this.world.setCosmetics(result.snapshot.equipped);
    this.sound.tone(620, 0.14, 'triangle', 0.03, 820);
    this.ui.showToast(`${result.item.name} 장착 완료!`, 'good', 900);
  }

  applyAchievementUpdate(update) {
    if (!update) return;
    this.ui.setAchievements(update);
    const cosmetics = this.cosmetics.getSnapshot(this.achievements.getSnapshot());
    this.ui.setCosmetics(cosmetics);
    if (update.unlocked?.length) {
      this.achievementQueue.push(...update.unlocked);
      this.showNextAchievement();
    }
  }

  showNextAchievement() {
    if (this.achievementShowing || !this.achievementQueue.length) return;
    this.achievementShowing = true;
    this.ui.showAchievement(this.achievementQueue.shift(), 3000);
    window.setTimeout(() => {
      this.achievementShowing = false;
      this.showNextAchievement();
    }, 3250);
  }

  completeRound(result) {
    if (!this.transition(PHASE.RESULT)) return;
    this.sound.stopSizzle();
    this.world.stopHeat();
    this.ui.showCooking(false);
    this.crackInput.setEnabled(false);
    this.ui.showCrackStage(false);
    this.ui.showWorldLabel('egg', false);
    this.ui.showWorldLabel('crack', false);
    this.ui.hideKitchenEvent();
    this.activeEvent = null;
    this.ui.flashDanger(false);
    this.sessionScore += result.roundScore;
    this.ui.setScore(this.sessionScore);

    if (result.roundScore > this.bestScore) {
      this.bestScore = result.roundScore;
      this.saveBestScore(this.difficultyKey, this.bestScore);
      this.ui.setBest(this.bestScore);
    }

    if (result.status === 'perfect') {
      this.sound.success();
      this.world.celebrate();
      this.ui.setMission(3, this.eggDamaged ? '깨졌지만 완벽하게 살렸어요!' : '세 가지 익힘이 모두 완벽해요!', `흰자 ${Math.round(this.whiteCook)} · 노른자 ${Math.round(this.yolkCook)} · 가장자리 ${Math.round(this.edgeBrown)}`, this.eggDamaged ? '멋진 만회!' : '딱 좋은 한 접시');
      this.vibrate([20, 30, 20, 30, 35]);
    } else {
      this.sound.failure();
      this.ui.setMission(3, result.status === 'undercooked' ? '흰자나 노른자가 아직 촉촉해요' : '한 부분이 너무 익었어요', `흰자 ${Math.round(this.whiteCook)} · 노른자 ${Math.round(this.yolkCook)} · 가장자리 ${Math.round(this.edgeBrown)}`, '다음 판엔 더 맛있게');
      this.vibrate([28, 35, 45]);
    }

    const achievementUpdate = this.achievements.recordRound({
      roundId: this.roundId,
      status: result.status,
      difficulty: this.difficultyKey,
      roundScore: result.roundScore,
      elapsedSeconds: this.rules.roundTime - this.timer,
      timeLimit: this.rules.roundTime,
      eggDamaged: result.eggDamaged || result.flipDamaged,
      completed: true,
      crackPerfect: result.crackPerfect,
      crackDamaged: result.crackDamaged,
      weakStrikes: result.weakStrikes,
      glancingStrikes: result.glancingStrikes,
      brokenEggs: result.brokenEggs,
      seasoned: result.seasoned,
      basteCount: result.basteCount,
      techniquePerfect: result.techniquePerfect,
      heatQuality: result.heatQuality,
    });
    result.achievements = achievementUpdate.unlocked;
    this.applyAchievementUpdate(achievementUpdate);

    const roundId = this.roundId;
    window.setTimeout(() => {
      if (this.roundId === roundId && this.phase === PHASE.RESULT) this.ui.showResult(result);
    }, result.status === 'perfect' ? 780 : 520);
  }

  failRound(reason, failureCode = 'failed', tip = '다음에는 조금 더 천천히 움직여보세요.') {
    if (![PHASE.READY, PHASE.CARRYING, PHASE.CRACK_READY, PHASE.CRACKING, PHASE.RECOVERING].includes(this.phase)) return;
    const wasRecovering = this.phase === PHASE.RECOVERING;
    this.transition(PHASE.FAILED, true);
    this.sound.stopSizzle();
    this.sound.failure();
    if (!wasRecovering) this.world.failEgg();
    this.ui.hideKitchenEvent();
    this.activeEvent = null;
    this.ui.showCooking(false);
    this.crackInput.setEnabled(false);
    this.ui.showCrackStage(false);
    this.ui.showWorldLabel('egg', false);
    this.ui.showWorldLabel('crack', false);
    this.ui.flashDanger(true);
    this.ui.showToast('시간이 다 됐어요 · 다음 계란은 더 맛있을 거예요', 'bad', 1300);
    this.ui.setMission(1, '실패 원인을 확인하세요', reason, failureCode.toUpperCase());
    this.vibrate([30, 35, 55]);

    const result = {
      status: 'failed',
      reason: `${reason} ${tip}`,
      failureCode,
      cookingScore: this.rules.failPenalty,
      handlingScore: -this.incidentPenalty,
      roundScore: this.rules.failPenalty - this.incidentPenalty,
      multiplier: this.rules.multiplier,
      difficulty: this.rules,
      eggDamaged: this.eggDamaged,
    };
    const achievementUpdate = this.achievements.recordRound({
      roundId: this.roundId,
      status: 'failed',
      difficulty: this.difficultyKey,
      roundScore: result.roundScore,
      elapsedSeconds: this.rules.roundTime,
      timeLimit: this.rules.roundTime,
      eggDamaged: this.eggDamaged,
      completed: false,
    });
    result.achievements = achievementUpdate.unlocked;
    this.applyAchievementUpdate(achievementUpdate);
    this.sessionScore += result.roundScore;
    this.ui.setScore(this.sessionScore);
    const roundId = this.roundId;
    window.setTimeout(() => {
      if (this.roundId === roundId && this.phase === PHASE.FAILED) {
        this.ui.flashDanger(false);
        this.ui.showResult(result);
      }
    }, 850);
  }

  handleKeyDown(event) {
    const key = event.key.toLowerCase();
    if (this.ui.elements.achievementOverlay.classList.contains('visible')) return;
    if (event.target?.id === 'swing-egg') return;
    if (event.target?.id === 'pan-gesture-pad' && key !== 'e') return;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
      this.keysDown.add(key);
      if (this.phase === PHASE.CARRYING && this.keyboardCarry) event.preventDefault();
    }
    if ((event.key === 'Enter' || event.code === 'Space') && this.phase === PHASE.READY) {
      event.preventDefault();
      if (this.handlePress()) this.keyboardCarry = true;
      return;
    }
    if (event.key === 'Enter' && this.phase === PHASE.CARRYING && this.keyboardCarry) {
      event.preventDefault();
      this.handleDrop({ speed: 0 });
      return;
    }
    if ((event.key === 'Enter' || event.code === 'Space') && this.phase === PHASE.CRACK_READY) {
      event.preventDefault();
      if (event.repeat) return;
      this.handleTap();
      return;
    }
    if ((key === 'e' || event.key === 'Enter') && this.activeEvent && [PHASE.COOKING, PHASE.RECOVERING].includes(this.phase)) {
      event.preventDefault();
      if (!event.repeat) this.handleEventResponse(this.activeEvent.id);
      return;
    }
    if (this.phase === PHASE.COOKING && this.cookStep === 'flip' && ['arrowup', 'enter', ' '].includes(key)) {
      event.preventDefault();
      if (!event.repeat) {
        const velocity = (this.cookingRules.flipControl.idealMinVelocity + this.cookingRules.flipControl.idealMaxVelocity) / 2;
        this.handlePanGesture({ phase: 'start', x: 0, y: 0.72, upwardVelocity: 0, travelX: 0, travelY: 0, keyboard: true });
        this.handlePanGesture({ phase: 'move', x: 0, y: -0.86, upwardVelocity: velocity, travelX: 0, travelY: -1.58, keyboard: true });
        this.handlePanGesture({ phase: 'end', x: 0, y: -0.86, upwardVelocity: velocity, travelX: 0, travelY: -1.58, keyboard: true });
      }
      return;
    }
    if (this.phase === PHASE.COOKING && this.cookStep === 'set-edge' && ['arrowleft', 'arrowright', 'a', 'd'].includes(key)) {
      event.preventDefault();
      const x = key === 'arrowleft' || key === 'a' ? -0.82 : 0.82;
      if (!this.keyboardPanActive) {
        this.keyboardPanActive = true;
        this.handlePanGesture({ phase: 'start', x: 0, velocity: 0, directionChanges: 0 });
      }
      if (!event.repeat) this.handlePanGesture({
        phase: 'move',
        x,
        velocity: this.cookingRules.panControl?.idealVelocity || 1.2,
        directionChanges: this.panDirectionChanges,
      });
      return;
    }
    if (this.phase === PHASE.COOKING && key === 'f') {
      event.preventDefault();
      if (!event.repeat && this.cookStep === 'season') this.performCookAction('season');
      return;
    }
    if (event.code === 'Space' && this.phase === PHASE.COOKING && this.cookStep === 'plate') {
      event.preventDefault();
      this.requestServe();
      return;
    }
    if (key === 'r' && [PHASE.RESULT, PHASE.FAILED].includes(this.phase)) this.retryRound();
  }

  handleKeyUp(event) {
    const key = event.key.toLowerCase();
    this.keysDown.delete(key);
    if (this.keyboardPanActive && ['arrowleft', 'arrowright', 'a', 'd'].includes(key)) {
      const stillHeld = ['arrowleft', 'arrowright', 'a', 'd'].some((candidate) => this.keysDown.has(candidate));
      if (!stillHeld) {
        this.keyboardPanActive = false;
        this.handlePanGesture({ phase: 'end', x: this.panLastGestureX, velocity: 0, directionChanges: this.panDirectionChanges });
      }
    }
  }

  updateKeyboardCarry(dt) {
    if (!this.keyboardCarry || this.phase !== PHASE.CARRYING) return;
    const horizontal = Number(this.keysDown.has('arrowright') || this.keysDown.has('d'))
      - Number(this.keysDown.has('arrowleft') || this.keysDown.has('a'));
    const vertical = Number(this.keysDown.has('arrowdown') || this.keysDown.has('s'))
      - Number(this.keysDown.has('arrowup') || this.keysDown.has('w'));
    if (!horizontal && !vertical) return;
    const length = Math.hypot(horizontal, vertical) || 1;
    const moveSpeed = this.difficultyKey === 'extreme' ? 0.82 : 1.05;
    this.eggTarget.x = clamp(this.eggTarget.x + (horizontal / length) * moveSpeed * dt, -4.75, 3.15);
    this.eggTarget.z = clamp(this.eggTarget.z + (vertical / length) * moveSpeed * dt, -2.25, 2.4);
    this.motionSpeed = this.transport.safeSpeed * 0.78;
  }

  toggleSound() {
    const muted = !this.sound.muted;
    this.sound.setMuted(muted);
    this.ui.setSoundMuted(muted);
    if (!muted) {
      this.sound.tone(520, 0.1, 'sine', 0.03, 650);
      if ([PHASE.COOKING, PHASE.PLATING].includes(this.phase)) this.sound.startSizzle();
    }
  }

  updateStress(dt) {
    if (this.phase !== PHASE.CARRYING) return;
    this.holdingTime += dt;
    let rate;
    if (this.motionSpeed <= this.transport.safeSpeed) rate = -this.transport.recoveryRate;
    else if (this.motionSpeed <= this.transport.warningSpeed) rate = this.transport.warningRate;
    else if (this.motionSpeed <= this.transport.dangerSpeed) rate = this.transport.dangerRate;
    else rate = this.transport.criticalRate;
    if (this.holdingTime > this.transport.fatigueAfter) {
      rate += this.transport.fatigueRate;
      if (!this.fatigueAnnounced && this.transport.fatigueRate > 0) {
        this.fatigueAnnounced = true;
        this.ui.showToast('손 피로가 쌓여 미세하게 흔들려요', 'bad', 1000);
      }
    }
    this.stress = clamp(this.stress + rate * dt, 0, 100);
    this.maxStress = Math.max(this.maxStress, this.stress);

    if (this.rawMotionSpeed > this.transport.breakSpeed) this.shockExposure += dt;
    else this.shockExposure = Math.max(0, this.shockExposure - dt * 3.4);
    if (this.shockExposure >= this.transport.shockDuration) {
      this.breakEgg(
        `충격 속도 ${this.rawMotionSpeed.toFixed(2)} · 허용 ${this.transport.breakSpeed.toFixed(2)}`,
        'transport_shock',
        '빠른 이동 자체보다 급출발과 급정지를 피하세요.',
      );
      return;
    }

    this.warningCooldown -= dt;
    if (this.stress >= this.transport.warningLevel && this.warningCooldown <= 0) {
      this.warningCooldown = this.stress >= this.transport.dangerLevel ? 0.42 : 0.72;
      this.sound.warning();
      if (this.stress >= this.transport.dangerLevel) this.vibrate(18);
    }
    if (this.stress >= 100) this.breakEgg('안정도 0% · 흔들림이 누적됐어요.', 'stress_break', '새 계란은 잠시 멈추며 안정도를 회복해보세요.');
  }

  updateEgg(dt) {
    if (this.phase !== PHASE.CARRYING) return;
    this.previousEggPosition.copy(this.world.eggGroup.position);
    const fatigueBlend = clamp((this.holdingTime - this.transport.fatigueAfter) / 4, 0, 1);
    const drift = this.transport.drift * (0.35 + fatigueBlend * 0.65);
    this.desiredEggPosition.copy(this.eggTarget);
    this.desiredEggPosition.x += Math.sin(this.holdingTime * this.transport.driftSpeed + 0.4) * drift;
    this.desiredEggPosition.z += Math.sin(this.holdingTime * this.transport.driftSpeed * 0.73 + 2.1) * drift * 0.75;
    const follow = 1 - Math.exp(-dt / this.transport.followTime);
    this.world.eggGroup.position.lerp(this.desiredEggPosition, follow);
    this.eggVelocity.copy(this.world.eggGroup.position).sub(this.previousEggPosition).divideScalar(Math.max(dt, 0.001));
    this.motionSpeed *= Math.exp(-dt * 4.2);
    this.rawMotionSpeed *= Math.exp(-dt * 5.2);
    const risk = clamp((this.motionSpeed - this.transport.safeSpeed * 0.7) / Math.max(0.1, this.transport.breakSpeed), 0, 1);
    this.world.setEggMotion(risk + fatigueBlend * 0.16, this.eggVelocity);
  }

  updateLanding(dt) {
    if (this.phase !== PHASE.CARRYING) {
      this.world.setLandingProgress(0);
      return;
    }
    const egg = this.world.eggGroup.position;
    const distance = Math.hypot(egg.x - GAME_CONFIG.crackPoint.x, egg.z - GAME_CONFIG.crackPoint.z);
    const inside = distance <= this.transport.crackZoneRadius;
    const calm = this.motionSpeed <= this.transport.safeSpeed * 0.82 && this.stress <= this.transport.maxLandingStress;
    if (inside && calm) this.settleTime += dt;
    else this.settleTime = Math.max(0, this.settleTime - dt * 2.4);
    this.insideLandingZone = inside;
    const progress = this.transport.settleDuration > 0
      ? clamp(this.settleTime / this.transport.settleDuration, 0, 1)
      : inside ? 1 : 0;
    this.world.setLandingProgress(progress);
    if (inside && !this.landingHintShown && this.transport.settleDuration > 0) {
      this.landingHintShown = true;
      this.ui.showToast(`링 안에서 ${this.transport.settleDuration.toFixed(2)}초 멈추세요`, '', 950);
    }
    if (!inside && distance > this.transport.crackZoneRadius * 1.45) this.landingHintShown = false;
  }

  updateCrackTiming(dt) {
    if (this.phase !== PHASE.CRACK_READY) return;
    if (!this.crackRules.timed) {
      this.crackCanHit = true;
      this.crackPhaseError = 0;
      this.world.setCrackTiming(0.5, true);
      this.ui.updateCrackTiming(0.5, true, false);
      return;
    }
    this.crackReadyTime += dt;
    const leg = this.crackReadyTime / this.crackRules.beatDuration;
    const legPhase = leg % 2;
    const phase = legPhase <= 1 ? legPhase : 2 - legPhase;
    this.crackBeatIndex = Math.floor(leg);
    this.crackPhaseError = Math.abs(phase - 0.5);
    this.crackCanHit = this.crackPhaseError <= this.crackRules.tolerance;
    this.world.setCrackTiming(phase, this.crackCanHit);
    this.ui.updateCrackTiming(phase, this.crackCanHit, true);
  }

  updateWorldLabels() {
    if (this.phase === PHASE.READY) {
      const point = this.world.worldToScreen(this.world.eggGroup.position.clone().add(new Vector3(0, -0.42, 0)));
      this.ui.showWorldLabel('egg', true, point);
      this.ui.showWorldLabel('crack', false);
    } else {
      this.ui.showWorldLabel('egg', false);
      this.ui.showWorldLabel('crack', false);
    }
  }

  updateTimer(dt) {
    if (!this.timerStarted || [PHASE.RESULT, PHASE.FAILED, PHASE.INTRO].includes(this.phase)) return;
    this.timer = Math.max(0, this.timer - dt);
    this.ui.setTimer(this.timer, this.rules.roundTime);
    if (this.timer > 0) return;
    if ([PHASE.COOKING, PHASE.PLATING].includes(this.phase)) this.scoreCooking();
    else this.failRound('제한시간이 끝났어요.', 'timer_expired', '경로를 짧게 잡되 급하게 움직이지 마세요.');
  }

  loop(time) {
    if (!this.isPageVisible) {
      this.lastFrame = time;
      return;
    }
    const dt = clamp((time - this.lastFrame) / 1000, 0, 0.05);
    this.lastFrame = time;

    this.updateTimer(dt);
    this.updateKeyboardCarry(dt);
    this.updateStress(dt);
    this.updateEgg(dt);
    this.updateLanding(dt);
    this.updateCrackTiming(dt);

    if (this.phase === PHASE.RECOVERING) {
      this.recoveryTime += dt;
      if (this.activeEvent) {
        this.activeEvent.remaining = Math.max(0, this.recoveryDuration - this.recoveryTime);
        this.ui.updateKitchenEvent(this.activeEvent.remaining, this.recoveryDuration);
      }
      if (this.recoveryTime >= this.recoveryDuration) this.finishRecovery(true);
    }

    if (this.phase === PHASE.CRACKING) {
      this.crackTime += dt;
      this.world.updateCracking(this.crackTime / 1.25);
      if (this.crackTime >= 1.25) this.beginCooking();
    }

    if (this.phase === PHASE.COOKING) this.advanceCooking(dt);
    else if (this.phase === PHASE.PLATING) {
      this.platingTime += dt;
      this.advanceCooking(dt);
      if (this.phase === PHASE.PLATING && this.platingTime >= this.cookingRules.platingDelay) this.scoreCooking();
    }

    const stability = 100 - this.stress;
    this.ui.setStability(stability, this.motionSpeed, this.transport.warningSpeed);
    this.ui.flashDanger((this.phase === PHASE.CARRYING && this.stress >= this.transport.dangerLevel)
      || (this.phase === PHASE.RECOVERING && this.recoveryTime < 0.45));
    this.updateWorldLabels();
    this.world.update(dt, this.phase);
  }

  vibrate(pattern) {
    if ('vibrate' in navigator) navigator.vibrate(pattern);
  }

  loadDifficulty() {
    try {
      const key = localStorage.getItem('eggcellent-difficulty') || DEFAULT_DIFFICULTY;
      return DIFFICULTIES[key] ? key : DEFAULT_DIFFICULTY;
    } catch { return DEFAULT_DIFFICULTY; }
  }

  saveDifficulty(key) {
    try { localStorage.setItem('eggcellent-difficulty', key); } catch { /* optional preference */ }
  }

  loadBestScore(key) {
    try {
      const fallback = key === 'normal' ? localStorage.getItem('eggcellent-best') : '0';
      return Number.parseInt(localStorage.getItem(`eggcellent-best-v2-${key}`) || fallback || '0', 10) || 0;
    } catch { return 0; }
  }

  saveBestScore(key, score) {
    try { localStorage.setItem(`eggcellent-best-v2-${key}`, String(score)); }
    catch { /* storage can be unavailable in private contexts */ }
  }
}
