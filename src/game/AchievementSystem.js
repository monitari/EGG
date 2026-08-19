const STORAGE_VERSION = 2;

export const ACHIEVEMENT_STORAGE_KEY = 'eggcellent-achievements-v1';

const DIFFICULTY_KEYS = ['easy', 'normal', 'hard', 'extreme'];

const isFiniteNumber = (value) => Number.isFinite(Number(value));
const toNumber = (value, fallback = 0) => (isFiniteNumber(value) ? Number(value) : fallback);
const toCount = (value) => Math.max(0, Math.floor(toNumber(value, 0)));
const clamp01 = (value) => Math.min(1, Math.max(0, value));

function difficultyTotal(stats, keys, field = 'completed') {
  return keys.reduce((total, key) => total + toCount(stats.byDifficulty[key]?.[field]), 0);
}

/**
 * Achievement definitions deliberately depend only on cumulative statistics.
 * That makes unlocks deterministic, persistent, and easy for the UI to render.
 */
export const ACHIEVEMENTS = Object.freeze([
  { id: 'first_plate', icon: '○', title: '첫 한 접시', description: '첫 후라이를 플레이팅하기', goal: 1, progress: (s) => s.roundsCompleted },
  { id: 'plates_5', icon: '⑤', title: '아침 단골', description: '후라이 5접시 완성하기', goal: 5, progress: (s) => s.roundsCompleted },
  { id: 'plates_15', icon: '⑮', title: '작은 브런치', description: '후라이 15접시 완성하기', goal: 15, progress: (s) => s.roundsCompleted },
  { id: 'plates_30', icon: 'Ⅲ', title: '계란 한 판', description: '후라이 30접시 완성하기', goal: 30, progress: (s) => s.roundsCompleted },
  { id: 'plates_50', icon: '王', title: '브런치 가게', description: '후라이 50접시 완성하기', goal: 50, progress: (s) => s.roundsCompleted },
  { id: 'rounds_100', icon: '∞', title: '백 번의 아침', description: '총 100라운드 플레이하기', goal: 100, progress: (s) => s.roundsPlayed },
  { id: 'perfect_fry', icon: '★', title: '노른자의 정석', description: '익힘이 딱 좋은 후라이 만들기', goal: 1, progress: (s) => s.perfectRounds },
  { id: 'perfect_3', icon: '✦', title: '감 잡았어', description: '완벽한 후라이 3접시 만들기', goal: 3, progress: (s) => s.perfectRounds },
  { id: 'perfect_10', icon: '冠', title: '열 번의 완벽', description: '완벽한 후라이 10접시 만들기', goal: 10, progress: (s) => s.perfectRounds },
  { id: 'perfect_25', icon: '♛', title: '노른자 장인', description: '완벽한 후라이 25접시 만들기', goal: 25, progress: (s) => s.perfectRounds },
  { id: 'easy_perfect', icon: '芽', title: '연습 졸업', description: '연습에서 완벽한 후라이 만들기', goal: 1, progress: (s) => s.byDifficulty.easy.perfect },
  { id: 'normal_perfect', icon: '◎', title: '기본기 탄탄', description: '보통에서 완벽한 후라이 만들기', goal: 1, progress: (s) => s.byDifficulty.normal.perfect },
  { id: 'hard_clear', icon: '↑', title: '고온 주방', description: '집중 이상 난이도를 완주하기', goal: 1, progress: (s) => difficultyTotal(s, ['hard', 'extreme']) },
  { id: 'hard_perfect', icon: '火', title: '집중의 결실', description: '집중에서 완벽한 후라이 만들기', goal: 1, progress: (s) => s.byDifficulty.hard.perfect },
  { id: 'extreme_survivor', icon: '!', title: '아슬 생존자', description: '아슬 난이도를 끝까지 완주하기', goal: 1, progress: (s) => s.byDifficulty.extreme.completed },
  { id: 'extreme_10', icon: 'Ⅹ', title: '아슬 단골', description: '아슬 난이도 10회 완주하기', goal: 10, progress: (s) => s.byDifficulty.extreme.completed },
  { id: 'extreme_perfect', icon: '◇', title: '불가능은 없다', description: '아슬에서 완벽한 후라이 만들기', goal: 1, progress: (s) => s.byDifficulty.extreme.perfect },
  { id: 'all_modes', icon: '四', title: '네 가지 아침', description: '모든 난이도를 한 번씩 완주하기', goal: 4, progress: (s) => DIFFICULTY_KEYS.filter((k) => s.byDifficulty[k].completed > 0).length },
  { id: 'score_1000', icon: '₁', title: '첫 천 점', description: '누적 점수 1,000점 모으기', goal: 1000, progress: (s) => Math.max(0, s.totalScore) },
  { id: 'score_5000', icon: '₅', title: '차곡차곡', description: '누적 점수 5,000점 모으기', goal: 5000, progress: (s) => Math.max(0, s.totalScore) },
  { id: 'score_20000', icon: '₂', title: '작은 저금통', description: '누적 점수 20,000점 모으기', goal: 20000, progress: (s) => Math.max(0, s.totalScore) },
  { id: 'score_50000', icon: '₅', title: '황금 주걱', description: '누적 점수 50,000점 모으기', goal: 50000, progress: (s) => Math.max(0, s.totalScore) },
  { id: 'score_100000', icon: '♢', title: '전설의 브런치', description: '누적 점수 100,000점 모으기', goal: 100000, progress: (s) => Math.max(0, s.totalScore) },
  { id: 'crack_first', icon: '↧', title: '첫 번째 톡', description: '좋은 힘으로 계란 깨기', goal: 1, progress: (s) => s.perfectCracks },
  { id: 'crack_5', icon: 'Ⅴ', title: '손목의 감각', description: '좋은 크랙 5회 성공하기', goal: 5, progress: (s) => s.perfectCracks },
  { id: 'crack_20', icon: '↯', title: '톡톡 전문가', description: '좋은 크랙 20회 성공하기', goal: 20, progress: (s) => s.perfectCracks },
  { id: 'crack_50', icon: '✺', title: '한 번에 쏙', description: '좋은 크랙 50회 성공하기', goal: 50, progress: (s) => s.perfectCracks },
  { id: 'weak_5', icon: '…', title: '조심조심', description: '약한 타격도 5번 경험해보기', goal: 5, progress: (s) => s.weakStrikes },
  { id: 'shell_collector', icon: '⌁', title: '껍질 수집가', description: '강하거나 빗나간 크랙 5번 경험하기', goal: 5, progress: (s) => s.damagedCracks },
  { id: 'cracked_but_saved', icon: '+', title: '금 간 영웅', description: '손상된 계란을 끝까지 살려내기', goal: 1, progress: (s) => s.rescuedRounds },
  { id: 'rescues_5', icon: '✚', title: '금 간 구조대', description: '손상된 계란 5개를 완성하기', goal: 5, progress: (s) => s.rescuedRounds },
  { id: 'season_first', icon: '✧', title: '한 꼬집', description: '간 맞추기 처음 성공하기', goal: 1, progress: (s) => s.seasonedRounds },
  { id: 'season_10', icon: '※', title: '간의 감각', description: '간 맞추기 10회 성공하기', goal: 10, progress: (s) => s.seasonedRounds },
  { id: 'butter_first', icon: '≈', title: '버터 샤워', description: '버터 끼얹기 처음 성공하기', goal: 1, progress: (s) => s.bastedRounds },
  { id: 'butter_10', icon: '≋', title: '윤기의 비밀', description: '버터 끼얹기 10회 성공하기', goal: 10, progress: (s) => s.bastedRounds },
  { id: 'technique_5', icon: '✓', title: '순서대로 척척', description: '조리 동작을 놓치지 않고 5회 완성하기', goal: 5, progress: (s) => s.techniquePerfectRounds },
  { id: 'heat_10', icon: '♨', title: '불과 친구', description: '좋은 화력 점수로 10회 완성하기', goal: 10, progress: (s) => s.heatMasterRounds },
  { id: 'event_responder', icon: '!', title: '돌발 대응반', description: '주방 돌발 이벤트를 처음 해결하기', goal: 1, progress: (s) => s.eventsResolved },
  { id: 'events_10', icon: '⑩', title: '침착한 주방', description: '돌발 이벤트 10회 해결하기', goal: 10, progress: (s) => s.eventsResolved },
  { id: 'events_25', icon: '盾', title: '주방 방패', description: '돌발 이벤트 25회 해결하기', goal: 25, progress: (s) => s.eventsResolved },
  { id: 'event_specialist', icon: '⚡', title: '주방 해결사', description: '돌발 이벤트 10회를 빠르게 해결하기', goal: 10, progress: (s) => s.eventsPerfect },
  { id: 'clean_3', icon: '＝', title: '안정된 손', description: '손상 없이 3라운드 연속 완주하기', goal: 3, progress: (s) => s.longestCleanStreak },
  { id: 'clean_10', icon: '〓', title: '흔들림 제로', description: '손상 없이 10라운드 연속 완주하기', goal: 10, progress: (s) => s.longestCleanStreak },
  { id: 'clean_20', icon: '静', title: '고요한 손목', description: '손상 없이 20라운드 연속 완주하기', goal: 20, progress: (s) => s.longestCleanStreak },
  { id: 'speed_finish', icon: '»', title: '번개 플레이팅', description: '제한 시간의 45% 안에 완성하기', goal: 1, progress: (s) => s.fastFinishes },
  { id: 'fast_10', icon: '≫', title: '아침은 빠르게', description: '빠른 완성을 10회 기록하기', goal: 10, progress: (s) => s.fastFinishes },
  { id: 'undercooked_5', icon: '水', title: '촉촉 연구원', description: '덜 익은 결과도 5번 연구하기', goal: 5, progress: (s) => s.undercookedRounds },
  { id: 'overcooked_5', icon: '焦', title: '바삭 연구원', description: '너무 익은 결과도 5번 연구하기', goal: 5, progress: (s) => s.overcookedRounds },
].map(Object.freeze));

function makeDifficultyStats(source = {}) {
  return DIFFICULTY_KEYS.reduce((result, key) => {
    const stored = source[key] || {};
    result[key] = {
      played: toCount(stored.played),
      completed: toCount(stored.completed),
      perfect: toCount(stored.perfect),
    };
    return result;
  }, {});
}

function makeStats(source = {}) {
  return {
    roundsPlayed: toCount(source.roundsPlayed),
    roundsCompleted: toCount(source.roundsCompleted),
    perfectRounds: toCount(source.perfectRounds),
    undercookedRounds: toCount(source.undercookedRounds),
    overcookedRounds: toCount(source.overcookedRounds),
    failedRounds: toCount(source.failedRounds),
    totalScore: Math.round(toNumber(source.totalScore)),
    highestRoundScore: Math.round(toNumber(source.highestRoundScore)),
    damagedRounds: toCount(source.damagedRounds),
    rescuedRounds: toCount(source.rescuedRounds),
    eventsSeen: toCount(source.eventsSeen),
    eventsResolved: toCount(source.eventsResolved),
    eventsPerfect: toCount(source.eventsPerfect),
    eventsFailed: toCount(source.eventsFailed),
    currentCleanStreak: toCount(source.currentCleanStreak),
    longestCleanStreak: toCount(source.longestCleanStreak),
    fastFinishes: toCount(source.fastFinishes),
    perfectCracks: toCount(source.perfectCracks),
    damagedCracks: toCount(source.damagedCracks),
    weakStrikes: toCount(source.weakStrikes),
    glancingStrikes: toCount(source.glancingStrikes),
    seasonedRounds: toCount(source.seasonedRounds),
    bastedRounds: toCount(source.bastedRounds),
    techniquePerfectRounds: toCount(source.techniquePerfectRounds),
    heatMasterRounds: toCount(source.heatMasterRounds),
    totalBrokenEggs: toCount(source.totalBrokenEggs),
    fastestCompletionSeconds: isFiniteNumber(source.fastestCompletionSeconds)
      ? Math.max(0, Number(source.fastestCompletionSeconds))
      : null,
    byDifficulty: makeDifficultyStats(source.byDifficulty),
  };
}

function makeState(source = {}, now = Date.now()) {
  const unlocked = source.unlocked && typeof source.unlocked === 'object' && !Array.isArray(source.unlocked)
    ? Object.fromEntries(Object.entries(source.unlocked).filter(([, value]) => isFiniteNumber(value)))
    : {};
  // v1 called the three-round clean streak `clean_streak`. Keep the earned
  // badge when loading an older save while exposing the clearer v2 id.
  if (isFiniteNumber(unlocked.clean_streak) && !isFiniteNumber(unlocked.clean_3)) {
    unlocked.clean_3 = unlocked.clean_streak;
  }
  return {
    version: STORAGE_VERSION,
    createdAt: toNumber(source.createdAt, now),
    updatedAt: toNumber(source.updatedAt, now),
    unlocked,
    stats: makeStats(source.stats),
  };
}

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function readStorage(storage, key) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStorage(storage, key, value) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function copyStats(stats) {
  return {
    ...stats,
    byDifficulty: Object.fromEntries(
      Object.entries(stats.byDifficulty).map(([key, value]) => [key, { ...value }]),
    ),
  };
}

function normalizeDifficulty(value) {
  const key = typeof value === 'object' ? value?.key : value;
  return DIFFICULTY_KEYS.includes(key) ? key : 'normal';
}

function roundWasCompleted(summary) {
  if (typeof summary.completed === 'boolean') return summary.completed;
  return ['perfect', 'undercooked', 'overcooked', 'completed', 'success'].includes(summary.status);
}

function roundWasDamaged(summary) {
  // `eggDamaged` means accidental damage. Intentional tapping/cracking must not set it.
  return Boolean(summary.eggDamaged ?? summary.accidentalBreak ?? summary.wasDamaged);
}

function completionSeconds(summary) {
  if (isFiniteNumber(summary.elapsedSeconds)) return Math.max(0, Number(summary.elapsedSeconds));
  if (isFiniteNumber(summary.elapsed)) return Math.max(0, Number(summary.elapsed));
  if (isFiniteNumber(summary.timeLimit) && isFiniteNumber(summary.timeRemaining)) {
    return Math.max(0, Number(summary.timeLimit) - Number(summary.timeRemaining));
  }
  return null;
}

function recordKey(prefix, payload, fallbackFields) {
  if (payload.recordId != null) return `${prefix}:record:${String(payload.recordId)}`;
  const values = fallbackFields.map((field) => payload[field]).filter((value) => value != null);
  return values.length === fallbackFields.length ? `${prefix}:${values.map(String).join(':')}` : null;
}

export class AchievementSystem {
  constructor({ storage = defaultStorage(), storageKey = ACHIEVEMENT_STORAGE_KEY, now = () => Date.now() } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.now = typeof now === 'function' ? now : () => Date.now();
    this.state = makeState(readStorage(this.storage, this.storageKey) || {}, this.now());
    // Game round IDs restart after reload, so de-duplication belongs to this runtime session.
    this.processed = new Set();

    // Persist sanitized data when possible; failures simply leave the system in memory-only mode.
    this.persisted = writeStorage(this.storage, this.storageKey, this.state);
  }

  /**
   * Record one finished gameplay round.
   *
   * Recommended shape:
   * { roundId, status, difficulty, roundScore, elapsedSeconds, timeLimit,
   *   eggDamaged, completed }
   */
  recordRound(summary = {}) {
    const key = recordKey('round', summary, ['roundId']);
    if (key && this.processed.has(key)) return this.makeUpdate([], true);

    const stats = this.state.stats;
    const difficulty = normalizeDifficulty(summary.difficultyKey ?? summary.difficulty);
    const completed = roundWasCompleted(summary);
    const damaged = roundWasDamaged(summary);
    const status = String(summary.status || (completed ? 'completed' : 'failed')).toLowerCase();
    const score = Math.round(toNumber(summary.roundScore ?? summary.score));
    const elapsed = completionSeconds(summary);
    const timeLimit = isFiniteNumber(summary.timeLimit) ? Math.max(0, Number(summary.timeLimit)) : null;
    const explicitFast = typeof summary.fastFinish === 'boolean' ? summary.fastFinish : null;
    const fastFinish = completed && (explicitFast ?? (elapsed != null && timeLimit > 0 && elapsed / timeLimit <= 0.45));

    stats.roundsPlayed += 1;
    stats.totalScore += score;
    stats.highestRoundScore = Math.max(stats.highestRoundScore, score);
    stats.byDifficulty[difficulty].played += 1;

    if (completed) {
      stats.roundsCompleted += 1;
      stats.byDifficulty[difficulty].completed += 1;
      if (elapsed != null) {
        stats.fastestCompletionSeconds = stats.fastestCompletionSeconds == null
          ? elapsed
          : Math.min(stats.fastestCompletionSeconds, elapsed);
      }
    } else {
      stats.failedRounds += 1;
    }

    if (status === 'perfect') {
      stats.perfectRounds += 1;
      stats.byDifficulty[difficulty].perfect += 1;
    } else if (status === 'undercooked') {
      stats.undercookedRounds += 1;
    } else if (status === 'overcooked') {
      stats.overcookedRounds += 1;
    }

    if (damaged) stats.damagedRounds += 1;
    if (completed && damaged) stats.rescuedRounds += 1;

    if (completed && !damaged) {
      stats.currentCleanStreak += 1;
      stats.longestCleanStreak = Math.max(stats.longestCleanStreak, stats.currentCleanStreak);
    } else {
      stats.currentCleanStreak = 0;
    }

    if (fastFinish) stats.fastFinishes += 1;
    if (summary.crackPerfect) stats.perfectCracks += 1;
    if (summary.crackDamaged) stats.damagedCracks += 1;
    stats.weakStrikes += toCount(summary.weakStrikes);
    stats.glancingStrikes += toCount(summary.glancingStrikes);
    stats.totalBrokenEggs += toCount(summary.brokenEggs);
    if (summary.seasoned) stats.seasonedRounds += 1;
    if (toCount(summary.basteCount) > 0 || summary.basted) stats.bastedRounds += 1;
    if (summary.techniquePerfect) stats.techniquePerfectRounds += 1;
    if (toNumber(summary.heatQuality) >= 0.8 || summary.heatMaster) stats.heatMasterRounds += 1;

    return this.commit(key);
  }

  /**
   * Record a kitchen interruption as it resolves so an achievement can unlock mid-round.
   * `outcome` is one of: seen, resolved, perfect, failed, ignored.
   */
  recordKitchenEvent(event = {}) {
    const key = recordKey('event', event, ['roundId', 'eventId']);
    if (key && this.processed.has(key)) return this.makeUpdate([], true);

    const stats = this.state.stats;
    const outcome = String(event.outcome || (event.perfect ? 'perfect' : event.success ? 'resolved' : 'seen')).toLowerCase();

    stats.eventsSeen += 1;
    if (outcome === 'perfect') {
      stats.eventsResolved += 1;
      stats.eventsPerfect += 1;
    } else if (['resolved', 'success'].includes(outcome)) {
      stats.eventsResolved += 1;
    } else if (outcome === 'failed') {
      stats.eventsFailed += 1;
    }

    return this.commit(key);
  }

  getAchievements() {
    const stats = this.state.stats;
    return ACHIEVEMENTS.map((definition) => {
      const rawProgress = Math.max(0, toNumber(definition.progress(stats)));
      const unlockedAt = this.state.unlocked[definition.id] || null;
      return {
        id: definition.id,
        icon: definition.icon,
        title: definition.title,
        description: definition.description,
        progress: Math.min(rawProgress, definition.goal),
        rawProgress,
        goal: definition.goal,
        ratio: clamp01(rawProgress / definition.goal),
        unlocked: Boolean(unlockedAt),
        unlockedAt,
      };
    });
  }

  getStats() {
    return copyStats(this.state.stats);
  }

  getSnapshot() {
    const achievements = this.getAchievements();
    return {
      version: this.state.version,
      updatedAt: this.state.updatedAt,
      unlockedCount: achievements.filter((achievement) => achievement.unlocked).length,
      totalAchievements: achievements.length,
      achievements,
      stats: this.getStats(),
      persisted: this.persisted,
    };
  }

  commit(key) {
    if (key) {
      this.processed.add(key);
    }

    const unlocked = [];
    const timestamp = this.now();
    for (const definition of ACHIEVEMENTS) {
      if (this.state.unlocked[definition.id]) continue;
      if (toNumber(definition.progress(this.state.stats)) < definition.goal) continue;
      this.state.unlocked[definition.id] = timestamp;
      unlocked.push(definition.id);
    }

    this.state.updatedAt = timestamp;
    this.persisted = writeStorage(this.storage, this.storageKey, this.state);
    return this.makeUpdate(unlocked, false);
  }

  makeUpdate(unlockedIds, duplicate) {
    const achievements = this.getAchievements();
    const unlockedSet = new Set(unlockedIds);
    return {
      changed: !duplicate,
      duplicate,
      unlocked: achievements.filter((achievement) => unlockedSet.has(achievement.id)),
      progress: achievements,
      stats: this.getStats(),
      persisted: this.persisted,
    };
  }
}

export default AchievementSystem;
