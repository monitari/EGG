export const COSMETIC_STORAGE_KEY = 'eggcellent-cosmetics-v1';

export const COSMETICS = Object.freeze({
  egg: Object.freeze([
    { id: 'cream', name: '크림 달걀', description: '깨끗하고 포근한 기본 껍질', color: '#fffaf0', accent: '#ffffff', unlocked: true },
    { id: 'peach', name: '복숭아 달걀', description: '살구빛이 은은한 껍질', color: '#ffd8c8', accent: '#fff4e7', achievement: 'plates_5' },
    { id: 'mint', name: '민트 달걀', description: '차분한 카페 민트색', color: '#c8ecdd', accent: '#f4fff9', achievement: 'clean_3' },
    { id: 'sky', name: '구름 달걀', description: '맑은 하늘을 닮은 껍질', color: '#d7edf7', accent: '#ffffff', achievement: 'events_10' },
    { id: 'gold', name: '황금 달걀', description: '완벽한 요리사를 위한 반짝임', color: '#ffd56a', accent: '#fff2b0', achievement: 'perfect_10' },
    { id: 'night', name: '달빛 달걀', description: '은은한 보랏빛 야간 한정색', color: '#d9d2eb', accent: '#f7f3ff', achievement: 'extreme_perfect' },
  ]),
  pan: Object.freeze([
    { id: 'cocoa', name: '코코아 팬', description: '음식이 선명해 보이는 기본 팬', body: '#4e4541', inner: '#373331', grip: '#f0a39e', unlocked: true },
    { id: 'mint', name: '민트 팬', description: '포근한 민트 에나멜', body: '#76aa96', inner: '#405d55', grip: '#f4d39b', achievement: 'perfect_3' },
    { id: 'berry', name: '딸기 팬', description: '산뜻한 코랄 에나멜', body: '#d87870', inner: '#5b3c3a', grip: '#ffd0bf', achievement: 'score_5000' },
    { id: 'sky', name: '하늘 팬', description: '아침빛 하늘색 팬', body: '#82b9d2', inner: '#3f5966', grip: '#ffe39a', achievement: 'fast_10' },
    { id: 'lavender', name: '라벤더 팬', description: '부드러운 보라색 팬', body: '#9a8bc2', inner: '#494359', grip: '#f7cfbf', achievement: 'hard_perfect' },
    { id: 'chef', name: '셰프 팬', description: '금빛 손잡이의 마스터 팬', body: '#7b6a52', inner: '#302e2b', grip: '#e7bb58', achievement: 'perfect_25' },
  ]),
  kitchen: Object.freeze([
    { id: 'morning', name: '아침 주방', description: '햇살이 드는 기본 미니 주방', floor: '#e7c4a8', wall: '#f6e7dc', band: '#e3b1aa', counter: '#f5ddd1', unlocked: true },
    { id: 'mint-cafe', name: '민트 카페', description: '초록 식물이 어울리는 작은 카페', floor: '#cbbca7', wall: '#e7f3ea', band: '#a8d7c4', counter: '#f4ead8', achievement: 'season_10' },
    { id: 'sunset', name: '노을 주방', description: '복숭아빛 저녁의 주방', floor: '#d6ab91', wall: '#f6d8ca', band: '#e99e91', counter: '#f1c7b0', achievement: 'rescues_5' },
    { id: 'cloud', name: '구름 주방', description: '하늘색 타일의 맑은 주방', floor: '#d6c7b2', wall: '#eaf5f8', band: '#b9dff2', counter: '#f6eee0', achievement: 'plates_15' },
    { id: 'picnic', name: '피크닉 키친', description: '버터색과 풀빛이 섞인 주방', floor: '#d7bd91', wall: '#f8efcf', band: '#a8cda9', counter: '#f4dfb6', achievement: 'score_20000' },
    { id: 'midnight', name: '달빛 주방', description: '따뜻한 조명이 켜진 밤의 주방', floor: '#4e4038', wall: '#59483f', band: '#745a54', counter: '#6b5549', achievement: 'extreme_10' },
  ]),
});

function safeStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function read(storage) {
  try { return JSON.parse(storage?.getItem(COSMETIC_STORAGE_KEY) || 'null') || {}; } catch { return {}; }
}

export class CosmeticsSystem {
  constructor(storage = safeStorage()) {
    this.storage = storage;
    const saved = read(storage);
    this.equipped = {
      egg: saved.equipped?.egg || 'cream',
      pan: saved.equipped?.pan || 'cocoa',
      kitchen: saved.equipped?.kitchen || 'morning',
    };
  }

  getSnapshot(achievementSnapshot = {}) {
    const achievementItems = achievementSnapshot.achievements || achievementSnapshot.progress || [];
    const achievementMap = new Map(achievementItems.map((item) => [item.id, item]));
    const unlockedAchievements = new Set(achievementItems.filter((item) => item.unlocked).map((item) => item.id));
    const categories = Object.fromEntries(Object.entries(COSMETICS).map(([type, items]) => [
      type,
      items.map((item) => ({
        ...item,
        type,
        unlocked: Boolean(item.unlocked || unlockedAchievements.has(item.achievement)),
        equipped: this.equipped[type] === item.id,
        unlockLabel: item.achievement ? achievementMap.get(item.achievement)?.title : null,
      })),
    ]));
    Object.entries(categories).forEach(([type, items]) => {
      if (!items.some((item) => item.id === this.equipped[type] && item.unlocked)) this.equipped[type] = items[0].id;
    });
    return { categories, equipped: { ...this.equipped } };
  }

  equip(type, id, achievementSnapshot) {
    const snapshot = this.getSnapshot(achievementSnapshot);
    const item = snapshot.categories[type]?.find((candidate) => candidate.id === id);
    if (!item?.unlocked) return { changed: false, snapshot };
    this.equipped[type] = id;
    try { this.storage?.setItem(COSMETIC_STORAGE_KEY, JSON.stringify({ version: 1, equipped: this.equipped })); } catch { /* optional save */ }
    return { changed: true, item, snapshot: this.getSnapshot(achievementSnapshot) };
  }
}

export default CosmeticsSystem;
