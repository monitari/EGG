export class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  set(x = 0, y = 0) {
    this.x = x;
    this.y = y;
    return this;
  }

  copy(value) {
    this.x = value?.x || 0;
    this.y = value?.y || 0;
    return this;
  }

  clone() {
    return new Vector2(this.x, this.y);
  }
}

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  set(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  copy(value) {
    this.x = value?.x || 0;
    this.y = value?.y || 0;
    this.z = value?.z || 0;
    return this;
  }

  clone() {
    return new Vector3(this.x, this.y, this.z);
  }

  add(value) {
    this.x += value.x;
    this.y += value.y;
    this.z += value.z;
    return this;
  }

  sub(value) {
    this.x -= value.x;
    this.y -= value.y;
    this.z -= value.z;
    return this;
  }

  divideScalar(value) {
    if (value) {
      this.x /= value;
      this.y /= value;
      this.z /= value;
    }
    return this;
  }

  lerp(target, amount) {
    this.x += (target.x - this.x) * amount;
    this.y += (target.y - this.y) * amount;
    this.z += (target.z - this.z) * amount;
    return this;
  }
}

