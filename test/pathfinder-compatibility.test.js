'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Heap = require('mineflayer-pathfinder/lib/heap');
const { Goal, GoalCompositeAll, GoalInvert } = require('mineflayer-pathfinder').goals;

class FixedGoal extends Goal {
  constructor(value) {
    super();
    this.value = value;
  }

  heuristic() {
    return this.value;
  }

  isEnd() {
    return false;
  }
}

test('keeps the Pathfinder A* open set in priority order', () => {
  const heap = new Heap();
  [0, 1, 0, 1].forEach((f) => heap.push({ f }));
  const values = [];
  while (!heap.isEmpty()) values.push(heap.pop().f);
  assert.deepEqual(values, [0, 0, 1, 1]);
});

test('preserves negative composite heuristics', () => {
  const goal = new GoalCompositeAll([new GoalInvert(new FixedGoal(5)), new GoalInvert(new FixedGoal(1))]);
  assert.equal(goal.heuristic({}), -1);
});
