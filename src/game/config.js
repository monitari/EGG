import { Vector3 } from './Vector.js';

export const PHASE = Object.freeze({
  INTRO: 'intro',
  READY: 'ready',
  CARRYING: 'carrying',
  CRACK_READY: 'crack-ready',
  CRACKING: 'cracking',
  RECOVERING: 'recovering',
  COOKING: 'cooking',
  PLATING: 'plating',
  RESULT: 'result',
  FAILED: 'failed',
});

export const DEFAULT_DIFFICULTY = 'normal';

export const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({
    key: 'easy',
    label: '연습',
    englishLabel: 'EASY',
    multiplier: 0.75,
    roundTime: 60,
    description: '넓은 판정으로 굴리기와 뒤집기를 느긋하게 익히는 모드',
    transport: Object.freeze({
      safeSpeed: 0.75, warningSpeed: 1.18, dangerSpeed: 1.55, breakSpeed: 2.15, shockDuration: 0.18,
      recoveryRate: 26, warningRate: 14, dangerRate: 42, criticalRate: 90,
      warningLevel: 55, dangerLevel: 80, turnPenalty: 8, followTime: 0.07,
      crackZoneRadius: 1.0, releaseSpeed: 1.45, settleDuration: 0, maxLandingStress: 100, fatigueAfter: 99, fatigueRate: 0,
      drift: 0, driftSpeed: 0,
    }),
    crack: Object.freeze({ taps: 1, timed: false, minImpact: 0.35, idealMin: 0.55, idealMax: 1.9, breakImpact: 2.8, maxLateral: 0.6, weakPenalty: 5, glancePenalty: 15, hardPenalty: 25 }),
    cooking: Object.freeze({ rate: 5.5, perfectMin: 55, perfectMax: 92, burnAt: 125, ideal: 75, heatSwing: 0, heatSpeed: 0, platingDelay: 0, eventCount: 1, eventDuration: 4.4, windowScale: 1.35, whiteMin: 78, whiteMax: 100, yolkMin: 48, yolkMax: 80, edgeMax: 65, panControl: Object.freeze({ coverageTarget: 0.68, requiredTurns: 1, idealVelocity: 3.2, splashVelocity: 12, penalty: 10 }), flipControl: Object.freeze({ readyWhite: 32, idealMinWhite: 44, idealMaxWhite: 84, expireWhite: 102, minUpwardVelocity: 1.8, idealMinVelocity: 3.2, idealMaxVelocity: 8.5, hardVelocity: 13, maxLateral: 0.82, penalty: 12 }) }),
    breakPenalty: 40,
    failPenalty: -220,
  }),
  normal: Object.freeze({
    key: 'normal',
    label: '보통',
    englishLabel: 'NORMAL',
    multiplier: 1,
    roundTime: 52,
    description: '직접 깨고 굴리고 뒤집는 네 단계 조리를 즐기는 기본 모드',
    transport: Object.freeze({
      safeSpeed: 0.52, warningSpeed: 0.86, dangerSpeed: 1.18, breakSpeed: 1.62, shockDuration: 0.12,
      recoveryRate: 18, warningRate: 26, dangerRate: 70, criticalRate: 135,
      warningLevel: 45, dangerLevel: 72, turnPenalty: 16, followTime: 0.1,
      crackZoneRadius: 0.74, releaseSpeed: 1.03, settleDuration: 0.2, maxLandingStress: 75, fatigueAfter: 8, fatigueRate: 2,
      drift: 0.015, driftSpeed: 1.25,
    }),
    crack: Object.freeze({ taps: 1, timed: false, minImpact: 0.48, idealMin: 0.75, idealMax: 1.75, breakImpact: 2.45, maxLateral: 0.45, weakPenalty: 8, glancePenalty: 25, hardPenalty: 55 }),
    cooking: Object.freeze({ rate: 6.5, perfectMin: 65, perfectMax: 84, burnAt: 112, ideal: 75, heatSwing: 0.045, heatSpeed: 1.3, platingDelay: 0.15, eventCount: 1, eventDuration: 4.2, windowScale: 1.15, whiteMin: 82, whiteMax: 100, yolkMin: 52, yolkMax: 76, edgeMax: 55, panControl: Object.freeze({ coverageTarget: 0.82, requiredTurns: 2, idealVelocity: 3, splashVelocity: 9, penalty: 20 }), flipControl: Object.freeze({ readyWhite: 38, idealMinWhite: 50, idealMaxWhite: 78, expireWhite: 94, minUpwardVelocity: 2.4, idealMinVelocity: 3.8, idealMaxVelocity: 7.5, hardVelocity: 10.5, maxLateral: 0.62, penalty: 28 }) }),
    breakPenalty: 65,
    failPenalty: -300,
  }),
  hard: Object.freeze({
    key: 'hard',
    label: '집중',
    englishLabel: 'HARD',
    multiplier: 1.4,
    roundTime: 42,
    description: '정교한 크랙과 빠르고 곧은 팬 플릭에 집중하는 모드',
    transport: Object.freeze({
      safeSpeed: 0.42, warningSpeed: 0.7, dangerSpeed: 0.96, breakSpeed: 1.34, shockDuration: 0.09,
      recoveryRate: 10, warningRate: 38, dangerRate: 95, criticalRate: 170,
      warningLevel: 38, dangerLevel: 64, turnPenalty: 22, followTime: 0.135,
      crackZoneRadius: 0.6, releaseSpeed: 0.82, settleDuration: 0.45, maxLandingStress: 50, fatigueAfter: 5.5, fatigueRate: 4.5,
      drift: 0.045, driftSpeed: 1.7,
    }),
    crack: Object.freeze({ taps: 1, timed: false, minImpact: 0.58, idealMin: 0.9, idealMax: 1.55, breakImpact: 2.1, maxLateral: 0.34, weakPenalty: 12, glancePenalty: 40, hardPenalty: 85 }),
    cooking: Object.freeze({ rate: 7.25, perfectMin: 69, perfectMax: 81, burnAt: 107, ideal: 75, heatSwing: 0.11, heatSpeed: 1.65, platingDelay: 0.3, eventCount: 2, eventDuration: 3.5, windowScale: 0.95, whiteMin: 86, whiteMax: 97, yolkMin: 57, yolkMax: 72, edgeMax: 42, panControl: Object.freeze({ coverageTarget: 0.92, requiredTurns: 3, idealVelocity: 2.8, splashVelocity: 7, penalty: 34 }), flipControl: Object.freeze({ readyWhite: 42, idealMinWhite: 55, idealMaxWhite: 74, expireWhite: 88, minUpwardVelocity: 3, idealMinVelocity: 4.3, idealMaxVelocity: 7, hardVelocity: 8.6, maxLateral: 0.45, penalty: 45 }) }),
    breakPenalty: 90,
    failPenalty: -380,
  }),
  extreme: Object.freeze({
    key: 'extreme',
    label: '아슬',
    englishLabel: 'EXTREME',
    multiplier: 2,
    roundTime: 34,
    description: '좁은 속도 판정과 촘촘한 뒤집기 타이밍에 도전하는 모드',
    transport: Object.freeze({
      safeSpeed: 0.33, warningSpeed: 0.55, dangerSpeed: 0.76, breakSpeed: 1.08, shockDuration: 0.075,
      recoveryRate: 4, warningRate: 55, dangerRate: 125, criticalRate: 220,
      warningLevel: 30, dangerLevel: 55, turnPenalty: 30, followTime: 0.17,
      crackZoneRadius: 0.47, releaseSpeed: 0.64, settleDuration: 0.75, maxLandingStress: 30, fatigueAfter: 3.2, fatigueRate: 8,
      drift: 0.095, driftSpeed: 2.15,
    }),
    crack: Object.freeze({ taps: 1, timed: false, minImpact: 0.66, idealMin: 1, idealMax: 1.45, breakImpact: 1.85, maxLateral: 0.28, weakPenalty: 18, glancePenalty: 60, hardPenalty: 110 }),
    cooking: Object.freeze({ rate: 8.1, perfectMin: 71, perfectMax: 79, burnAt: 102, ideal: 75, heatSwing: 0.18, heatSpeed: 1.85, platingDelay: 0.48, eventCount: 2, eventDuration: 3.1, windowScale: 0.86, whiteMin: 89, whiteMax: 96, yolkMin: 60, yolkMax: 70, edgeMax: 35, panControl: Object.freeze({ coverageTarget: 1, requiredTurns: 4, idealVelocity: 2.6, splashVelocity: 5.6, penalty: 48 }), flipControl: Object.freeze({ readyWhite: 46, idealMinWhite: 58, idealMaxWhite: 70, expireWhite: 80, minUpwardVelocity: 3.4, idealMinVelocity: 4.7, idealMaxVelocity: 6.5, hardVelocity: 7.4, maxLateral: 0.33, penalty: 65 }) }),
    breakPenalty: 120,
    failPenalty: -500,
  }),
});

export const GAME_CONFIG = Object.freeze({
  eggStart: new Vector3(-3.45, 2.08, 0.72),
  crackPoint: new Vector3(0.02, 2.35, 0.72),
  panCenter: new Vector3(1.38, 1.34, -0.02),
  plateCenter: new Vector3(4.25, 1.24, -1.62),
  dragPlaneY: 2.25,
  safeBoardRadius: 1.2,
  crackZoneRadius: 0.82,
});

export function getDifficulty(key) {
  return DIFFICULTIES[key] || DIFFICULTIES[DEFAULT_DIFFICULTY];
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function smoothstep(min, max, value) {
  const x = clamp((value - min) / (max - min), 0, 1);
  return x * x * (3 - 2 * x);
}

export function donenessStatus(doneness, cookingRules = DIFFICULTIES[DEFAULT_DIFFICULTY].cooking) {
  if (doneness < cookingRules.perfectMin) return 'undercooked';
  if (doneness <= cookingRules.perfectMax) return 'perfect';
  return 'overcooked';
}
