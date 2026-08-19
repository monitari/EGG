import { GAME_CONFIG, PHASE, clamp, smoothstep } from './config.js';
import { COSMETICS } from './CosmeticsSystem.js';
import { Vector2, Vector3 } from './Vector.js';

const TAU = Math.PI * 2;

const hashNoise = (value) => {
  const wave = Math.sin(value * 127.1 + 311.7) * 43758.5453;
  return wave - Math.floor(wave);
};

const sceneNode = (position) => ({
  position: position.clone(),
  rotation: new Vector3(),
  scale: new Vector3(1, 1, 1),
  visible: true,
  getWorldPosition(target = new Vector3()) { return target.copy(this.position); },
});

const hexToRgb = (hex) => {
  const rgbMatch = String(hex).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (rgbMatch) {
    return { r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3]) };
  }
  const value = hex.replace('#', '');
  const full = value.length === 3 ? [...value].map((part) => part + part).join('') : value;
  const parsed = Number.parseInt(full, 16);
  return { r: (parsed >> 16) & 255, g: (parsed >> 8) & 255, b: parsed & 255 };
};

const mixColor = (from, to, amount) => {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const t = clamp(amount, 0, 1);
  return `rgb(${Math.round(a.r + (b.r - a.r) * t)}, ${Math.round(a.g + (b.g - a.g) * t)}, ${Math.round(a.b + (b.b - a.b) * t)})`;
};

const roundedRect = (ctx, x, y, width, height, radius) => {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, r);
};

const ellipse = (ctx, x, y, radiusX, radiusY, fill, stroke = null, lineWidth = 0) => {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, radiusX), Math.max(0.01, radiusY), 0, 0, TAU);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke && lineWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
};

const blobPath = (ctx, cx, cy, radiusX, radiusY, points, phase = 0) => {
  const vertices = Array.from({ length: points }, (_, index) => {
    const angle = (index / points) * TAU;
    const wobble = 1 + Math.sin(angle * 3 + phase) * 0.075 + Math.sin(angle * 5 - phase * 1.3) * 0.035;
    return {
      x: cx + Math.cos(angle) * radiusX * wobble,
      y: cy + Math.sin(angle) * radiusY * wobble,
    };
  });
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const first = midpoint(vertices.at(-1), vertices[0]);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  vertices.forEach((point, index) => {
    const next = vertices[(index + 1) % vertices.length];
    const mid = midpoint(point, next);
    ctx.quadraticCurveTo(point.x, point.y, mid.x, mid.y);
  });
  ctx.closePath();
};

const drawSparkle = (ctx, x, y, size, color, rotation = 0) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.quadraticCurveTo(size * 0.2, -size * 0.2, size, 0);
  ctx.quadraticCurveTo(size * 0.2, size * 0.2, 0, size);
  ctx.quadraticCurveTo(-size * 0.2, size * 0.2, -size, 0);
  ctx.quadraticCurveTo(-size * 0.2, -size * 0.2, 0, -size);
  ctx.fill();
  ctx.restore();
};

/**
 * Flat, illustration-first kitchen renderer. It keeps the old scene contract
 * so gameplay, scoring, achievements and inputs remain independent from art.
 */
export class KitchenScene2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!this.context) throw new Error('2D canvas is unavailable');

    this.lowPower = (navigator.deviceMemory && navigator.deviceMemory <= 4)
      || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.eggGroup = sceneNode(GAME_CONFIG.eggStart);
    this.crackMarker = sceneNode(GAME_CONFIG.crackPoint);

    this.renderer = {
      domElement: canvas,
      setAnimationLoop: (callback) => this.setAnimationLoop(callback),
      setPixelRatio: () => {},
      setSize: () => this.resize(),
    };

    this.width = 1;
    this.height = 1;
    this.pixelRatio = 1;
    this.time = 0;
    this.phase = PHASE.INTRO;
    this.theme = 'light';
    this.pointer = new Vector2();
    this.motionRisk = 0;
    this.eggVelocity = new Vector3();
    this.crackProgress = 0;
    this.crackBeatPhase = 0.5;
    this.crackBeatHot = true;
    this.landingProgress = 0;
    this.failTime = -1;
    this.celebrationTime = 0;
    this.actionPulse = 0;
    this.actionKind = '';
    this.cookingDamaged = false;
    this.heatLevel = 0;
    this.cookTime = 0;
    this.cookingState = this.freshCookingState();
    this.cosmetics = { egg: 'cream', pan: 'cocoa', kitchen: 'morning' };
    this.setTheme(document.documentElement.dataset.theme || 'light');
    this.resize();

    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas.parentElement || canvas);
    }
  }

  setAnimationLoop(callback) {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    const frame = (time) => {
      callback(time);
      this.animationFrame = requestAnimationFrame(frame);
    };
    this.animationFrame = requestAnimationFrame(frame);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width || window.innerWidth);
    this.height = Math.max(1, rect.height || window.innerHeight);
    const pixelBudget = this.lowPower ? 1_050_000 : 2_300_000;
    const budgetRatio = Math.sqrt(pixelBudget / Math.max(1, this.width * this.height));
    this.pixelRatio = Math.max(0.8, Math.min(window.devicePixelRatio || 1, this.lowPower ? 1.25 : 2, budgetRatio));
    const targetWidth = Math.round(this.width * this.pixelRatio);
    const targetHeight = Math.round(this.height * this.pixelRatio);
    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;
    }
    this.draw();
  }

  setDifficulty(profile) {
    this.difficulty = profile;
  }

  freshCookingState() {
    return {
      doneness: 0,
      whiteCook: 0,
      yolkCook: 0,
      edgeBrown: 0,
      damaged: false,
      oil: 0,
      seasoning: 0,
      panTilt: 0,
      panShake: 0,
      flipProgress: 0,
      flipDamaged: false,
      sizzle: 0,
    };
  }

  setTheme(theme) {
    this.theme = theme === 'dark' ? 'dark' : 'light';
    this.draw();
  }

  setCosmetics(equipped = {}) {
    this.cosmetics = { ...this.cosmetics, ...equipped };
    this.draw();
  }

  setPointer(pointer) {
    this.pointer.copy(pointer);
  }

  setEggMotion(risk, velocity) {
    this.motionRisk = risk;
    this.eggVelocity.copy(velocity);
  }

  setCrackTiming(phase, isHot) {
    this.crackBeatPhase = phase;
    this.crackBeatHot = isHot;
  }

  setLandingProgress(progress) {
    this.landingProgress = clamp(progress, 0, 1);
  }

  prepareCrackStage() {
    this.eggGroup.visible = false;
    this.crackMarker.visible = false;
  }

  beginCracking() {
    this.eggGroup.visible = true;
    this.crackMarker.visible = false;
    this.crackProgress = 0;
    this.failTime = -1;
  }

  updateCracking(progress) {
    this.crackProgress = clamp(progress, 0, 1);
  }

  startCooking(damaged = false) {
    this.cookingDamaged = damaged;
    this.cookingState = { ...this.freshCookingState(), damaged };
    this.heatLevel = 1;
    this.failTime = -1;
    this.crackProgress = 1;
  }

  updateCooking(cookState, cookTime, heat = 1) {
    const state = typeof cookState === 'number'
      ? { doneness: cookState, whiteCook: cookState, yolkCook: cookState * 0.72, edgeBrown: Math.max(0, cookState - 68) }
      : cookState;
    // Optional illustration controls (oil, seasoning, panTilt, panShake,
    // flipProgress and sizzle) can be supplied by future gameplay without
    // changing the renderer contract.
    this.cookingState = { ...this.cookingState, ...state };
    this.cookTime = cookTime;
    this.heatLevel = heat;
  }

  pulseCookingAction(kind) {
    this.actionKind = kind;
    this.actionPulse = 1;
  }

  stopHeat() {
    this.heatLevel = 0;
  }

  celebrate() {
    this.celebrationTime = this.reducedMotion ? 0.7 : 3;
  }

  failEgg() {
    this.failTime = 0;
    this.eggGroup.visible = false;
  }

  resetEggOnly() {
    this.failTime = -1;
    this.eggGroup.visible = true;
    this.eggGroup.position.copy(GAME_CONFIG.eggStart);
    this.eggGroup.rotation.set(0, 0, 0);
  }

  reset() {
    this.failTime = -1;
    this.celebrationTime = 0;
    this.actionPulse = 0;
    this.crackProgress = 0;
    this.cookTime = 0;
    this.heatLevel = 0;
    this.cookingDamaged = false;
    this.cookingState = this.freshCookingState();
    this.eggGroup.visible = true;
    this.eggGroup.position.copy(GAME_CONFIG.eggStart);
    this.eggGroup.rotation.set(0, 0, 0);
    this.crackMarker.visible = true;
    this.draw();
  }

  worldToScreen(position) {
    const usableWidth = Math.min(this.width, 1500);
    return {
      x: this.width / 2 + position.x * usableWidth / 13,
      y: this.height * 0.44 + position.z * Math.min(this.height, 900) / 9,
    };
  }

  update(dt, phase) {
    this.phase = phase;
    this.time += dt;
    this.actionPulse = Math.max(0, this.actionPulse - dt * 1.8);
    this.celebrationTime = Math.max(0, this.celebrationTime - dt);
    if (this.failTime >= 0) this.failTime += dt;
    this.draw();
  }

  palette() {
    const kitchen = COSMETICS.kitchen.find((item) => item.id === this.cosmetics.kitchen) || COSMETICS.kitchen[0];
    const pan = COSMETICS.pan.find((item) => item.id === this.cosmetics.pan) || COSMETICS.pan[0];
    const egg = COSMETICS.egg.find((item) => item.id === this.cosmetics.egg) || COSMETICS.egg[0];
    const dark = this.theme === 'dark';
    const shade = (color, amount = 0.46) => (dark && kitchen.id !== 'midnight' ? mixColor(color, '#493a31', amount) : color);
    return {
      backdrop: dark ? '#4b3b34' : '#f5ead2',
      wall: shade(kitchen.wall),
      floor: shade(kitchen.floor),
      band: shade(kitchen.band),
      counter: shade(kitchen.counter),
      outline: dark ? '#342a31' : '#3a3038',
      outlineSoft: dark ? '#4a3933' : '#9a8880',
      panBody: pan.body,
      panInner: pan.inner,
      panGrip: pan.grip,
      shell: egg.color,
      shellAccent: egg.accent,
      whiteRaw: dark ? '#fff0d7' : '#fff8e8',
      whiteCooked: '#fffdf3',
      whiteEdge: '#d99355',
      yolk: '#ffc946',
      yolkDeep: '#f0a932',
      mint: '#82d4b2',
      mintDeep: '#4f9279',
      coral: '#ff806f',
      sky: '#94cee9',
      paper: dark ? '#725b50' : '#fff9e9',
      steam: dark ? '#e8ddd1' : '#ffffff',
      ink: dark ? '#2b232a' : '#3a3038',
      paperLight: dark ? '#81695c' : '#fff9e9',
      butter: '#ffd65c',
      flameHot: '#ff765d',
      herb: dark ? '#72ad83' : '#5f9c70',
    };
  }

  draw() {
    if (!this.context || !this.width || !this.height) return;
    const ctx = this.context;
    const palette = this.palette();
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.drawBackdrop(ctx, palette);

    if (this.phase === PHASE.CRACKING) this.drawCrackingScene(ctx, palette);
    else if (this.phase === PHASE.PLATING) this.drawPlatingScene(ctx, palette);
    else if (this.phase === PHASE.RESULT) this.drawResultScene(ctx, palette);
    else if (this.phase === PHASE.COOKING) this.drawCookingScene(ctx, palette);
    else this.drawHomeScene(ctx, palette);

    if (this.failTime >= 0) this.drawSpill(ctx, palette);
    if (this.celebrationTime > 0) this.drawConfetti(ctx, palette);
  }

  drawBackdrop(ctx, palette) {
    ctx.fillStyle = palette.backdrop;
    ctx.fillRect(0, 0, this.width, this.height);
    const horizon = this.height * (this.width < 620 ? 0.22 : 0.29);
    ctx.fillStyle = palette.wall;
    ctx.fillRect(0, 0, this.width, horizon);
    ctx.fillStyle = palette.band;
    ctx.fillRect(0, horizon - 9, this.width, 9);
    ctx.fillStyle = palette.counter;
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(this.width, horizon);
    ctx.lineTo(this.width, this.height);
    ctx.lineTo(0, this.height);
    ctx.closePath();
    ctx.fill();

    const tile = Math.max(90, Math.min(180, this.width / 7));
    ctx.save();
    ctx.globalAlpha = this.theme === 'dark' ? 0.1 : 0.18;
    ctx.strokeStyle = palette.outlineSoft;
    ctx.lineWidth = 1.2;
    for (let x = -tile; x < this.width + tile; x += tile) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, horizon);
      ctx.stroke();
    }
    ctx.restore();

    // A faint screen-printed wash differentiates each chapter without
    // introducing busy kitchen furniture.
    const sceneTint = this.phase === PHASE.CRACKING
      ? palette.coral
      : this.phase === PHASE.COOKING
        ? palette.butter
        : [PHASE.PLATING, PHASE.RESULT].includes(this.phase)
          ? palette.mint
          : palette.sky;
    const wash = ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.52,
      0,
      this.width * 0.5,
      this.height * 0.52,
      Math.max(this.width, this.height) * 0.72,
    );
    wash.addColorStop(0, `${sceneTint}26`);
    wash.addColorStop(0.72, `${sceneTint}08`);
    wash.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, this.width, this.height);

    this.drawPaperGrain(ctx, palette);

    // A few oversized, quiet props keep the scene kitchen-like without noise.
    const jarScale = Math.min(this.width, this.height) / 700;
    ctx.save();
    ctx.globalAlpha = this.phase === PHASE.INTRO ? 0.72 : 0.27;
    this.drawJar(ctx, this.width - 76 * jarScale, horizon - 32 * jarScale, 34 * jarScale, 66 * jarScale, palette.paper, palette.mint);
    this.drawJar(ctx, this.width - 125 * jarScale, horizon - 24 * jarScale, 30 * jarScale, 54 * jarScale, palette.paper, palette.coral);
    ctx.restore();
  }

  drawPaperGrain(ctx, palette) {
    const count = this.lowPower ? 28 : 52;
    ctx.save();
    ctx.globalAlpha = this.theme === 'dark' ? 0.055 : 0.075;
    ctx.fillStyle = palette.ink;
    for (let index = 0; index < count; index += 1) {
      const x = hashNoise(index + 4.2) * this.width;
      const y = hashNoise(index * 2.3 + 19) * this.height;
      const size = 0.5 + hashNoise(index * 4.7) * 1.25;
      ellipse(ctx, x, y, size * 1.7, size, palette.ink);
    }
    ctx.globalAlpha *= 0.7;
    ctx.strokeStyle = palette.paperLight;
    ctx.lineWidth = 1;
    for (let index = 0; index < 9; index += 1) {
      const y = hashNoise(index + 88) * this.height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(this.width * 0.3, y + 2, this.width * 0.7, y - 2, this.width, y + 1);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawJar(ctx, x, y, width, height, body, label) {
    ctx.save();
    ctx.translate(x, y);
    roundedRect(ctx, -width / 2, -height / 2, width, height, width * 0.28);
    ctx.fillStyle = body;
    ctx.fill();
    roundedRect(ctx, -width * 0.38, -height * 0.16, width * 0.76, height * 0.25, width * 0.12);
    ctx.fillStyle = label;
    ctx.fill();
    roundedRect(ctx, -width * 0.44, -height * 0.6, width * 0.88, height * 0.16, width * 0.08);
    ctx.fillStyle = '#8b7770';
    ctx.fill();
    ctx.restore();
  }

  sceneLayout() {
    const portrait = this.width / this.height < 0.82;
    if (portrait) {
      const radius = Math.min(this.width * 0.46, this.height * 0.245, 225);
      return { portrait, cx: this.width * 0.5, cy: this.height * 0.405, radius };
    }
    const radius = Math.min(this.height * 0.32, this.width * 0.22, 245);
    return { portrait, cx: this.width * 0.57, cy: this.height * 0.52, radius };
  }

  drawHomeScene(ctx, palette) {
    const { portrait, cx, cy, radius } = this.sceneLayout();
    ctx.save();
    ctx.globalAlpha = this.phase === PHASE.CRACK_READY ? 0.22 : 1;

    // A tilted paper napkin gives the composition a handmade poster base.
    ctx.save();
    ctx.translate(cx - radius * 0.08, cy + radius * 0.18);
    ctx.rotate(-0.08);
    roundedRect(ctx, -radius * 0.92, -radius * 0.68, radius * 1.84, radius * 1.36, radius * 0.12);
    ctx.fillStyle = palette.paperLight;
    ctx.fill();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = palette.coral;
    ctx.lineWidth = radius * 0.018;
    for (let line = -3; line <= 3; line += 1) {
      ctx.beginPath();
      ctx.moveTo(-radius * 0.88, line * radius * 0.18);
      ctx.lineTo(radius * 0.88, line * radius * 0.18);
      ctx.stroke();
    }
    ctx.restore();

    this.drawPan(ctx, cx, cy, radius, palette, { egg: true, heat: 0, home: true });
    drawSparkle(ctx, cx - radius * 0.98, cy - radius * 0.68, radius * 0.105, '#ffca43', -0.1);
    drawSparkle(ctx, cx + radius * 0.86, cy - radius * 0.83, radius * 0.075, '#ffd85d', 0.2);
    if (portrait) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      ellipse(ctx, cx - radius * 0.78, cy + radius * 0.77, radius * 0.16, radius * 0.08, palette.mint, palette.ink, radius * 0.018);
      ctx.restore();
    }
    ctx.restore();
  }

  drawCrackingScene(ctx, palette) {
    const { cx, cy, radius } = this.sceneLayout();
    const t = smoothstep(0, 1, this.crackProgress);
    const impact = Math.sin(smoothstep(0.02, 0.45, t) * Math.PI);
    this.drawPan(ctx, cx, cy + radius * 0.25, radius, palette, { egg: false, heat: 0.25 + t * 0.28 });
    const shellY = cy - radius * (0.9 - t * 0.24);
    const split = radius * (0.08 + t * 0.48);

    ctx.save();
    ctx.globalAlpha = impact * 0.7;
    ctx.strokeStyle = palette.coral;
    ctx.lineWidth = radius * 0.026;
    for (let index = 0; index < 8; index += 1) {
      const angle = -Math.PI * 0.93 + index * Math.PI / 7;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * radius * 0.47, shellY + Math.sin(angle) * radius * 0.33);
      ctx.lineTo(cx + Math.cos(angle) * radius * 0.68, shellY + Math.sin(angle) * radius * 0.48);
      ctx.stroke();
    }
    ctx.restore();

    this.drawShellHalf(ctx, cx - split, shellY, radius * 0.36, -0.22 - t * 0.68, palette, -1);
    this.drawShellHalf(ctx, cx + split, shellY, radius * 0.36, 0.22 + t * 0.68, palette, 1);

    const fallY = shellY + radius * (0.18 + t * 0.82);
    ctx.save();
    ctx.globalAlpha = smoothstep(0.03, 0.3, t) * (1 - smoothstep(0.82, 1, t));
    ctx.strokeStyle = palette.whiteRaw;
    ctx.lineWidth = radius * (0.18 - t * 0.07);
    ctx.shadowColor = 'rgba(90,68,43,.18)';
    ctx.shadowBlur = radius * 0.055;
    ctx.beginPath();
    ctx.moveTo(cx, shellY + radius * 0.08);
    ctx.quadraticCurveTo(cx - radius * 0.08, fallY - radius * 0.15, cx, fallY);
    ctx.stroke();
    const yolkGradient = ctx.createRadialGradient(cx - radius * 0.06, fallY - radius * 0.06, 0, cx, fallY, radius * 0.24);
    yolkGradient.addColorStop(0, '#ffe26e');
    yolkGradient.addColorStop(0.55, palette.yolk);
    yolkGradient.addColorStop(1, palette.yolkDeep);
    ellipse(ctx, cx, fallY, radius * 0.23, radius * 0.185, yolkGradient, palette.yolkDeep, radius * 0.018);
    ctx.restore();
  }

  drawShellHalf(ctx, x, y, radius, rotation, palette, direction) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.fillStyle = palette.shell;
    ctx.strokeStyle = palette.outline;
    ctx.lineWidth = radius * 0.08;
    ctx.beginPath();
    ctx.arc(0, 0, radius, direction < 0 ? -Math.PI / 2 : Math.PI / 2, direction < 0 ? Math.PI / 2 : Math.PI * 1.5, direction < 0);
    const tooth = radius * 0.18;
    for (let index = 2; index >= -2; index -= 1) {
      ctx.lineTo(direction * (index % 2 ? tooth : 0), index * radius * 0.2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawCookingScene(ctx, palette) {
    const { cx, cy, radius } = this.sceneLayout();
    this.drawPan(ctx, cx, cy, radius, palette, {
      egg: true,
      heat: this.heatLevel,
      cooking: true,
    });
  }

  drawPlatingScene(ctx, palette) {
    const { portrait, cx, cy, radius } = this.sceneLayout();
    const plateX = portrait ? cx - radius * 0.18 : cx - radius * 0.7;
    const plateY = cy + radius * 0.25;
    this.drawPlate(ctx, plateX, plateY, radius * 0.88, palette);

    ctx.save();
    ctx.translate(portrait ? radius * 0.68 : radius * 1.18, -radius * 0.2);
    ctx.rotate(-0.13);
    this.drawPan(ctx, cx, cy, radius * 0.8, palette, {
      egg: true,
      heat: 0,
      cooking: true,
      plating: true,
    });
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = palette.mintDeep;
    ctx.lineWidth = radius * 0.025;
    ctx.setLineDash([radius * 0.045, radius * 0.06]);
    ctx.beginPath();
    ctx.arc(plateX + radius * 0.45, plateY - radius * 0.28, radius * 0.4, -1.05, 0.35);
    ctx.stroke();
    ctx.restore();
  }

  drawResultScene(ctx, palette) {
    const { cx, cy, radius } = this.sceneLayout();
    const plateRadius = radius * 1.05;
    this.drawPlate(ctx, cx, cy + radius * 0.08, plateRadius, palette);
    ctx.save();
    ctx.translate(cx, cy + radius * 0.055);
    ctx.rotate(-0.03);
    ctx.scale(1.04, 1.04);
    this.drawFriedEgg(ctx, radius * 0.9, palette, false, true);
    ctx.restore();

    // Tiny herb cut-outs make the finished dish feel intentionally plated.
    for (let index = 0; index < 5; index += 1) {
      const angle = -0.45 + index * 0.22;
      const x = cx + Math.cos(angle) * radius * 0.72;
      const y = cy + radius * 0.24 + Math.sin(angle) * radius * 0.42;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle + 0.4);
      ellipse(ctx, 0, 0, radius * 0.035, radius * 0.016, palette.herb);
      ctx.restore();
    }
    drawSparkle(ctx, cx - radius * 0.93, cy - radius * 0.64, radius * 0.09, palette.butter, -0.2);
    drawSparkle(ctx, cx + radius * 0.93, cy - radius * 0.48, radius * 0.065, palette.coral, 0.3);
  }

  drawPlate(ctx, x, y, radius, palette) {
    ctx.save();
    ctx.globalAlpha = 0.17;
    ellipse(ctx, x + radius * 0.035, y + radius * 0.11, radius, radius * 0.67, palette.ink);
    ctx.restore();
    ellipse(ctx, x, y, radius, radius * 0.67, palette.outlineSoft);
    ellipse(ctx, x, y - radius * 0.035, radius * 0.93, radius * 0.61, palette.paperLight);
    ellipse(ctx, x, y - radius * 0.035, radius * 0.68, radius * 0.43, null, palette.sky, radius * 0.025);
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.ellipse(x, y - radius * 0.035, radius * 0.82, radius * 0.52, 0, Math.PI * 1.08, Math.PI * 1.78);
    ctx.strokeStyle = palette.paperLight;
    ctx.lineWidth = radius * 0.035;
    ctx.stroke();
    ctx.restore();
  }

  drawPan(ctx, cx, cy, radius, palette, options = {}) {
    const bob = this.reducedMotion ? 0 : Math.sin(this.time * 1.6) * radius * 0.006;
    const shake = options.cooking ? clamp(this.cookingState.panShake || 0, -1, 1) : 0;
    const tilt = options.cooking ? clamp(this.cookingState.panTilt || 0, -1, 1) : 0;
    const flip = options.cooking ? clamp(this.cookingState.flipProgress || 0, 0, 1) : 0;
    const shakeWave = this.reducedMotion ? 0 : Math.sin(this.time * 15) * shake * radius * 0.045;
    cy += bob;
    ctx.save();
    ctx.translate(cx + shakeWave, cy - Math.sin(flip * Math.PI) * radius * 0.16);
    ctx.rotate(-0.055 + this.pointer.x * 0.008 + tilt * 0.13 + shakeWave / radius * 0.2);
    ctx.scale(1, 1 - Math.sin(flip * Math.PI) * 0.14);

    if (options.heat > 0.1) this.drawFlames(ctx, radius, options.heat, palette);

    // Handle is drawn first so it tucks behind the pan rim.
    ctx.save();
    ctx.rotate(-0.27);
    roundedRect(ctx, radius * 0.62, -radius * 0.14, radius * 1.34, radius * 0.3, radius * 0.14);
    ctx.fillStyle = palette.outline;
    ctx.fill();
    roundedRect(ctx, radius * 0.69, -radius * 0.11, radius * 1.18, radius * 0.22, radius * 0.11);
    ctx.fillStyle = palette.panGrip;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.18;
    ellipse(ctx, 0, radius * 0.12, radius * 1.08, radius * 0.78, '#392d29');
    ctx.restore();
    ellipse(ctx, 0, 0, radius, radius * 0.73, palette.outline);
    ellipse(ctx, 0, -radius * 0.025, radius * 0.89, radius * 0.63, palette.panBody);
    ellipse(ctx, 0, -radius * 0.035, radius * 0.78, radius * 0.535, palette.panInner);

    if (options.cooking) this.drawOil(ctx, radius, palette);
    if (options.egg) {
      ctx.save();
      if (flip > 0) {
        ctx.translate(0, -Math.sin(flip * Math.PI) * radius * 0.28);
        ctx.scale(1, Math.cos(flip * Math.PI));
      }
      this.drawFriedEgg(ctx, radius, palette, options.home, false);
      ctx.restore();
    }

    // A final highlight rim makes the silhouette readable at phone size.
    ctx.globalAlpha = 0.72;
    ctx.beginPath();
    ctx.ellipse(0, -radius * 0.025, radius * 0.89, radius * 0.63, 0, Math.PI * 1.03, Math.PI * 1.9);
    ctx.strokeStyle = mixColor(palette.panBody, '#ffffff', 0.25);
    ctx.lineWidth = radius * 0.045;
    ctx.stroke();
    ctx.restore();
  }

  drawFlames(ctx, radius, heat, palette) {
    const strength = clamp((heat - 0.18) / 1.25, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.58 + strength * 0.36;
    for (let index = 0; index < 9; index += 1) {
      const x = (index - 4) * radius * 0.16;
      const wave = this.reducedMotion ? 0 : Math.sin(this.time * 8 + index) * radius * 0.025;
      const flameGradient = ctx.createLinearGradient(x, radius * 0.34, x, radius * 0.59);
      flameGradient.addColorStop(0, strength > 0.55 ? palette.flameHot : palette.butter);
      flameGradient.addColorStop(0.55, '#ffd06a');
      flameGradient.addColorStop(1, palette.sky);
      ctx.fillStyle = flameGradient;
      ctx.beginPath();
      ctx.moveTo(x - radius * 0.052, radius * 0.59);
      ctx.quadraticCurveTo(x + wave, radius * (0.43 - strength * 0.13), x + radius * 0.052, radius * 0.59);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawOil(ctx, radius, palette) {
    const oil = clamp(this.cookingState.oil ?? smoothstep(5, 32, this.cookingState.whiteCook || 0) * 0.45, 0, 1);
    if (oil <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = 0.18 + oil * 0.32;
    ctx.strokeStyle = palette.butter;
    ctx.lineWidth = radius * 0.018;
    for (let index = 0; index < 5; index += 1) {
      const angle = index * 1.31 + 0.4;
      const distance = radius * (0.37 + (index % 2) * 0.15);
      ctx.beginPath();
      ctx.ellipse(
        Math.cos(angle) * distance,
        Math.sin(angle) * distance * 0.58,
        radius * (0.055 + oil * 0.025),
        radius * 0.018,
        angle,
        0,
        TAU,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  drawFriedEgg(ctx, radius, palette, home = false, plated = false) {
    const state = home
      ? { whiteCook: 88, yolkCook: 62, edgeBrown: 8, damaged: false }
      : this.cookingState;
    const whiteCook = state.whiteCook || 0;
    const yolkCook = state.yolkCook || 0;
    const edge = state.edgeBrown || 0;
    const set = smoothstep(0, 58, whiteCook);
    const spread = 0.64 + set * 0.13;
    const white = mixColor(palette.whiteRaw, palette.whiteCooked, set);
    const edgeColor = mixColor(white, palette.whiteEdge, smoothstep(32, 85, edge));
    const damaged = state.damaged || state.flipDamaged || this.cookingDamaged;

    ctx.save();
    ctx.translate(-radius * 0.05, -radius * 0.025);
    ctx.shadowColor = plated ? 'rgba(72,49,36,.2)' : 'rgba(62,43,34,.12)';
    ctx.shadowBlur = radius * 0.045;
    ctx.shadowOffsetY = radius * 0.028;
    blobPath(ctx, 0, radius * 0.035, radius * spread, radius * spread * 0.59, 14, 0.72);
    ctx.fillStyle = edgeColor;
    ctx.fill();
    ctx.strokeStyle = mixColor(edgeColor, palette.outline, 0.25 + smoothstep(42, 88, edge) * 0.22);
    ctx.lineWidth = radius * 0.022;
    ctx.stroke();
    ctx.save();
    ctx.translate(0, -radius * 0.018);
    ctx.scale(0.95, 0.92);
    blobPath(ctx, 0, radius * 0.035, radius * spread, radius * spread * 0.59, 14, 0.72);
    const whiteGradient = ctx.createRadialGradient(-radius * 0.2, -radius * 0.14, 0, 0, 0, radius * 0.72);
    whiteGradient.addColorStop(0, '#ffffff');
    whiteGradient.addColorStop(0.58, white);
    whiteGradient.addColorStop(1, mixColor(white, edgeColor, 0.22));
    ctx.fillStyle = whiteGradient;
    ctx.fill();
    ctx.restore();

    const yolkX = damaged ? radius * 0.13 : radius * 0.05;
    const yolkY = damaged ? radius * 0.055 : -radius * 0.015;
    const yolkWidth = radius * (damaged ? 0.37 : 0.31);
    const yolkHeight = radius * (damaged ? 0.16 : 0.25 - smoothstep(65, 98, yolkCook) * 0.035);
    ellipse(ctx, yolkX, yolkY + radius * 0.035, yolkWidth * 1.02, yolkHeight * 1.04, palette.yolkDeep);
    const yolkColor = mixColor(palette.yolk, '#df8329', smoothstep(68, 102, yolkCook));
    const yolkGradient = ctx.createRadialGradient(
      yolkX - yolkWidth * 0.3,
      yolkY - yolkHeight * 0.35,
      0,
      yolkX,
      yolkY,
      yolkWidth,
    );
    yolkGradient.addColorStop(0, '#ffe477');
    yolkGradient.addColorStop(0.48, yolkColor);
    yolkGradient.addColorStop(1, palette.yolkDeep);
    ellipse(ctx, yolkX, yolkY, yolkWidth, yolkHeight, yolkGradient);
    ellipse(ctx, yolkX - yolkWidth * 0.32, yolkY - yolkHeight * 0.34, yolkWidth * 0.16, yolkHeight * 0.17, 'rgba(255,255,255,.58)');

    if (!home && whiteCook > 16 && whiteCook < 108) {
      const sizzle = clamp(state.sizzle ?? (this.heatLevel / 2), 0, 1);
      for (let index = 0; index < 8; index += 1) {
        const angle = index * 2.37 + 0.5;
        const distance = radius * (0.34 + (index % 3) * 0.09);
        const pulse = this.reducedMotion ? 0 : Math.sin(this.time * 6 + index) * radius * 0.008;
        ellipse(ctx, Math.cos(angle) * distance, Math.sin(angle) * distance * 0.54, radius * (0.014 + sizzle * 0.009) + pulse, radius * 0.011 + pulse * 0.6, 'rgba(255,255,255,.72)');
      }
    }

    this.drawBrowning(ctx, radius, palette, edge);
    this.drawSeasoning(ctx, radius, palette, state.seasoning || 0);

    this.drawCookingAction(ctx, radius, palette, yolkX, yolkY);
    this.drawSteam(ctx, radius, palette, whiteCook);
    ctx.restore();
  }

  drawBrowning(ctx, radius, palette, edgeBrown) {
    const amount = smoothstep(15, 88, edgeBrown);
    if (amount <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = 0.22 + amount * 0.58;
    ctx.strokeStyle = mixColor(palette.whiteEdge, '#9b5434', amount);
    ctx.lineWidth = radius * (0.014 + amount * 0.014);
    ctx.setLineDash([radius * 0.055, radius * 0.045]);
    for (let index = 0; index < 3; index += 1) {
      const start = 0.18 + index * 2.05;
      ctx.beginPath();
      ctx.ellipse(0, radius * 0.035, radius * 0.62, radius * 0.355, 0, start, start + 0.72 + amount * 0.25);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawSeasoning(ctx, radius, palette, seasoning) {
    const amount = clamp(seasoning, 0, 1);
    if (amount <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = 0.42 + amount * 0.35;
    const count = Math.round(5 + amount * 11);
    for (let index = 0; index < count; index += 1) {
      const angle = index * 2.399;
      const distance = radius * (0.16 + hashNoise(index + 41) * 0.42);
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance * 0.5;
      ellipse(ctx, x, y, radius * 0.008, radius * 0.006, index % 3 === 0 ? palette.herb : palette.ink);
    }
    ctx.restore();
  }

  drawCookingAction(ctx, radius, palette, yolkX, yolkY) {
    if (this.actionPulse <= 0) return;
    const alpha = Math.sin(clamp(this.actionPulse, 0, 1) * Math.PI);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (this.actionKind === 'season') {
      ctx.fillStyle = '#ffffff';
      for (let index = 0; index < 12; index += 1) {
        const x = (index % 4 - 1.5) * radius * 0.13;
        const y = -radius * 0.48 + Math.floor(index / 4) * radius * 0.12 + (1 - this.actionPulse) * radius * 0.28;
        ellipse(ctx, x, y, radius * 0.014, radius * 0.01, '#ffffff');
      }
    } else if (this.actionKind === 'baste') {
      ctx.strokeStyle = '#ffd86e';
      ctx.lineWidth = radius * 0.04;
      ctx.beginPath();
      ctx.arc(yolkX, yolkY, radius * (0.3 + (1 - this.actionPulse) * 0.2), Math.PI * 1.05, Math.PI * 1.82);
      ctx.stroke();
    } else if (this.actionKind === 'heat') {
      drawSparkle(ctx, radius * 0.53, radius * 0.15, radius * 0.07, palette.coral, this.time);
    }
    ctx.restore();
  }

  drawSteam(ctx, radius, palette, whiteCook) {
    const strength = smoothstep(12, 82, whiteCook);
    if (strength <= 0) return;
    ctx.save();
    ctx.globalAlpha = strength * (this.theme === 'dark' ? 0.38 : 0.5);
    ctx.strokeStyle = palette.steam;
    ctx.lineWidth = radius * 0.035;
    for (let index = -1; index <= 1; index += 1) {
      const offset = this.reducedMotion ? 0 : (this.time * (0.25 + index * 0.03 + 0.05)) % 1;
      const x = index * radius * 0.3 + Math.sin(this.time * 1.8 + index) * radius * 0.035;
      ctx.beginPath();
      ctx.moveTo(x, -radius * 0.34 - offset * radius * 0.08);
      ctx.bezierCurveTo(x - radius * 0.09, -radius * 0.62, x + radius * 0.1, -radius * 0.78, x, -radius * 0.98);
      ctx.stroke();
    }
    if (strength > 0.55) {
      ctx.globalAlpha *= 0.65;
      for (let index = 0; index < 3; index += 1) {
        const x = (index - 1) * radius * 0.25;
        ellipse(
          ctx,
          x + Math.sin(this.time + index) * radius * 0.035,
          -radius * (0.78 + index * 0.08),
          radius * 0.055,
          radius * 0.027,
          null,
          palette.steam,
          radius * 0.018,
        );
      }
    }
    ctx.restore();
  }

  drawSpill(ctx, palette) {
    const progress = smoothstep(0, 0.6, this.failTime);
    const x = this.width * 0.42;
    const y = this.height * 0.68;
    ctx.save();
    ctx.globalAlpha = 1 - smoothstep(1.2, 2.6, this.failTime);
    blobPath(ctx, x, y, 70 * progress, 35 * progress, 10, 1.3);
    ctx.fillStyle = palette.whiteRaw;
    ctx.fill();
    ellipse(ctx, x + 12, y - 4, 22 * progress, 15 * progress, palette.yolk);
    ctx.restore();
  }

  drawConfetti(ctx, palette) {
    const colors = ['#ffc744', palette.mint, palette.coral, palette.sky, '#f7b46b'];
    ctx.save();
    for (let index = 0; index < 28; index += 1) {
      const seed = (index * 0.61803398875) % 1;
      const x = seed * this.width;
      const fall = ((3 - this.celebrationTime) * (0.2 + (index % 5) * 0.035) + seed) % 1;
      const y = fall * this.height * 0.78;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.time * (1 + index % 4));
      ctx.fillStyle = colors[index % colors.length];
      ctx.fillRect(-5, -9, 10, 18);
      ctx.restore();
    }
    ctx.restore();
  }
}

export default KitchenScene2D;
