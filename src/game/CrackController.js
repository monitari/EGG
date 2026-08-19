const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * A screen-space crack gesture. The egg is swung into a ceramic bowl rim, so
 * the result is independent from the illustrated scene scale and consistent across devices.
 */
export class CrackController {
  constructor(stage, egg, onStrike = () => {}) {
    this.stage = stage;
    this.egg = egg;
    this.onStrike = onStrike;
    this.active = null;
    this.enabled = false;
    this.locked = false;

    this.handleDown = this.handleDown.bind(this);
    this.handleMove = this.handleMove.bind(this);
    this.handleUp = this.handleUp.bind(this);
    this.handleCancel = this.handleCancel.bind(this);
    this.handleKey = this.handleKey.bind(this);

    egg.addEventListener('pointerdown', this.handleDown);
    egg.addEventListener('pointermove', this.handleMove);
    egg.addEventListener('pointerup', this.handleUp);
    egg.addEventListener('pointercancel', this.handleCancel);
    egg.addEventListener('lostpointercapture', this.handleCancel);
    egg.addEventListener('keydown', this.handleKey);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.egg.disabled = !enabled;
    if (!enabled) this.cancel();
  }

  reset() {
    this.locked = false;
    this.cancel();
    this.stage.classList.remove('weak', 'good', 'hard', 'glance', 'struck');
    this.stage.style.setProperty('--swing-x', '0px');
    this.stage.style.setProperty('--swing-y', '0px');
    this.stage.style.setProperty('--swing-rotate', '0deg');
  }

  handleDown(event) {
    if (!this.enabled || this.locked || this.active || !event.isPrimary) return;
    const now = performance.now();
    this.active = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: now,
      velocityX: 0,
      velocityY: 0,
      peakAcceleration: 0,
      travelX: 0,
      travelY: 0,
    };
    this.egg.setPointerCapture?.(event.pointerId);
    this.stage.classList.add('dragging');
    event.preventDefault();
  }

  handleMove(event) {
    if (!this.active || event.pointerId !== this.active.pointerId) return;
    const now = performance.now();
    const dt = Math.max(0.004, (now - this.active.lastTime) / 1000);
    const dx = event.clientX - this.active.lastX;
    const dy = event.clientY - this.active.lastY;
    const nextVelocityX = dx / dt;
    const nextVelocityY = dy / dt;
    const acceleration = Math.hypot(
      nextVelocityX - this.active.velocityX,
      nextVelocityY - this.active.velocityY,
    ) / dt;
    this.active.peakAcceleration = Math.max(this.active.peakAcceleration, acceleration);
    this.active.velocityX = nextVelocityX;
    this.active.velocityY = nextVelocityY;
    this.active.travelX = event.clientX - this.active.startX;
    this.active.travelY = event.clientY - this.active.startY;
    this.active.lastX = event.clientX;
    this.active.lastY = event.clientY;
    this.active.lastTime = now;

    const rect = this.stage.getBoundingClientRect();
    const x = clamp(this.active.travelX, -rect.width * 0.27, rect.width * 0.27);
    const y = clamp(this.active.travelY, -36, rect.height * 0.31);
    this.stage.style.setProperty('--swing-x', `${x}px`);
    this.stage.style.setProperty('--swing-y', `${y}px`);
    this.stage.style.setProperty('--swing-rotate', `${clamp(x / 8, -13, 13)}deg`);

    if (y >= rect.height * 0.285) this.finishStrike(event.pointerId, rect);
    event.preventDefault();
  }

  handleUp(event) {
    if (!this.active || event.pointerId !== this.active.pointerId) return;
    this.finishStrike(event.pointerId, this.stage.getBoundingClientRect());
    event.preventDefault();
  }

  finishStrike(pointerId, rect) {
    if (!this.active || this.locked) return;
    const active = this.active;
    const scale = Math.max(240, Math.min(rect.width, rect.height));
    const downwardSpeed = Math.max(0, active.velocityY) / scale;
    const normalizedAcceleration = Math.sqrt(Math.max(0, active.peakAcceleration)) / Math.sqrt(scale * 10);
    const impact = downwardSpeed * 0.82 + normalizedAcceleration * 0.18;
    const lateralRatio = Math.abs(active.travelX) / Math.max(36, Math.abs(active.travelY));
    const travel = Math.max(0, active.travelY) / Math.max(1, rect.height);

    this.locked = true;
    this.stage.classList.remove('dragging');
    this.stage.classList.add('struck');
    if (this.egg.hasPointerCapture?.(pointerId)) this.egg.releasePointerCapture(pointerId);
    this.active = null;
    this.onStrike({ impact, downwardSpeed, acceleration: normalizedAcceleration, lateralRatio, travel });
  }

  showFeedback(kind, unlockDelay = 520) {
    this.stage.classList.remove('weak', 'good', 'hard', 'glance');
    this.stage.classList.add(kind);
    window.setTimeout(() => {
      if (!this.enabled) return;
      this.locked = false;
      this.stage.classList.remove('struck', 'weak', 'hard', 'glance');
      this.stage.style.setProperty('--swing-x', '0px');
      this.stage.style.setProperty('--swing-y', '0px');
      this.stage.style.setProperty('--swing-rotate', '0deg');
    }, unlockDelay);
  }

  handleKey(event) {
    if (!this.enabled || this.locked || event.repeat || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    this.locked = true;
    this.stage.classList.add('struck', 'good');
    this.onStrike({ impact: 1.2, downwardSpeed: 1.2, acceleration: 1.1, lateralRatio: 0, travel: 0.3, keyboard: true });
  }

  handleCancel(event) {
    if (this.active && event.pointerId !== this.active.pointerId) return;
    this.cancel();
  }

  cancel() {
    if (this.active && this.egg.hasPointerCapture?.(this.active.pointerId)) {
      this.egg.releasePointerCapture(this.active.pointerId);
    }
    this.active = null;
    this.stage.classList.remove('dragging');
  }
}

export default CrackController;
