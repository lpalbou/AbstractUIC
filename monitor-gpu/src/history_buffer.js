export class HistoryBuffer {
  constructor(maxSize) {
    this._maxSize = HistoryBuffer._normalizeMaxSize(maxSize);
    this._values = [];
  }

  get maxSize() {
    return this._maxSize;
  }

  get size() {
    return this._values.length;
  }

  static _normalizeMaxSize(maxSize) {
    const n = Number(maxSize);
    if (!Number.isFinite(n) || n <= 0) {
      return 1;
    }
    return Math.min(1000, Math.floor(n));
  }

  setMaxSize(maxSize) {
    const next = HistoryBuffer._normalizeMaxSize(maxSize);
    this._maxSize = next;
    if (this._values.length > next) {
      this._values = this._values.slice(this._values.length - next);
    }
  }

  clear() {
    this._values = [];
  }

  push(value) {
    const n = Number(value);
    const v = Number.isFinite(n) ? n : null;
    this._values.push(v);
    if (this._values.length > this._maxSize) {
      this._values.splice(0, this._values.length - this._maxSize);
    }
  }

  values() {
    return this._values.slice();
  }

  last() {
    return this._values.length ? this._values[this._values.length - 1] : null;
  }
}

