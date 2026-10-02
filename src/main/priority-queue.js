'use strict';

class PriorityQueue {
  constructor(compare) {
    if (typeof compare !== 'function') throw new TypeError('A priority comparison function is required.');
    this.compare = compare;
    this.values = [];
  }

  get size() {
    return this.values.length;
  }

  push(value) {
    const values = this.values;
    values.push(value);
    let index = values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(values[parent], value) <= 0) break;
      values[index] = values[parent];
      index = parent;
    }
    values[index] = value;
    return this.size;
  }

  shift() {
    const values = this.values;
    if (!values.length) return undefined;
    const first = values[0];
    const last = values.pop();
    if (!values.length) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= values.length) break;
      const child = right < values.length && this.compare(values[right], values[left]) < 0 ? right : left;
      if (this.compare(values[child], last) >= 0) break;
      values[index] = values[child];
      index = child;
    }
    values[index] = last;
    return first;
  }

  clear() {
    this.values.length = 0;
  }
}

module.exports = { PriorityQueue };
