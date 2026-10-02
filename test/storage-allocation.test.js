'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { planWithdrawal, resolveIndexedVariant, withdrawalKey } = require('../src/main/storage-allocation');

function item(overrides = {}) {
  return {
    variantId: 'stone-variant',
    identity: 'stone-identity',
    name: 'stone',
    displayName: 'Stone',
    count: 64,
    stackSize: 64,
    ...overrides
  };
}

function container(x, count) {
  return { position: { x, y: 64, z: 0 }, items: [item({ count })] };
}

function scan(containers, variants = [item({ count: containers.reduce((sum, entry) => sum + entry.items[0].count, 0) })]) {
  return { complete: true, stale: false, containers, items: new Map(variants.map((entry) => [entry.identity, entry])) };
}

test('chooses a lower travel route instead of the fewest containers', () => {
  const value = scan([container(1, 32), container(2, 32), container(100, 64)]);
  const plan = planWithdrawal({ zoneId: 'main', scan: value, selector: 'stone', count: 64, origin: { x: 0, y: 64, z: 0 } });
  assert.deepEqual(plan.allocations.map((entry) => entry.position.x), [1, 2]);
  assert.deepEqual(plan.allocations.map((entry) => entry.count), [32, 32]);
  assert.equal(plan.reservationEntries.length, 2);
});

test('subtracts concurrent reservations before allocating stock', () => {
  const value = scan([container(1, 64), container(2, 64)]);
  const key = withdrawalKey('main', { x: 1, y: 64, z: 0 }, 'stone-variant');
  const plan = planWithdrawal({
    zoneId: 'main',
    scan: value,
    selector: 'stone-variant',
    count: 80,
    origin: { x: 0, y: 64, z: 0 },
    reservations: { reservations: [{ key, count: 48 }] }
  });
  assert.deepEqual(plan.allocations.map((entry) => entry.count), [16, 64]);
});

test('requires a variant id when an item name is ambiguous', () => {
  const plain = item();
  const named = item({ variantId: 'named-variant', identity: 'named-identity', displayName: 'Named Stone', count: 1 });
  const value = scan([container(1, 64)], [plain, named]);
  assert.throws(() => resolveIndexedVariant(value, 'stone'), /multiple item variants/u);
  assert.equal(resolveIndexedVariant(value, 'named-variant').identity, 'named-identity');
});

test('considers distant capacity alongside nearby containers', () => {
  const containers = Array.from({ length: 60 }, (_, index) => container(index + 1, 1));
  containers.push(container(100, 64));
  const plan = planWithdrawal({ zoneId: 'main', scan: scan(containers), selector: 'stone', count: 64, origin: { x: 0, y: 64, z: 0 } });
  assert.deepEqual(plan.allocations.map((entry) => entry.position.x), [100]);
});

test('rejects withdrawals requiring more than the visit limit', () => {
  const containers = Array.from({ length: 257 }, (_, index) => container(index + 1, 1));
  assert.throws(
    () => planWithdrawal({ zoneId: 'main', scan: scan(containers), selector: 'stone', count: 257, origin: { x: 0, y: 64, z: 0 } }),
    /more than 256 container visits/u
  );
});
