'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { StorageReservationBroker } = require('../src/main/storage-reservations');

test('reserves storage quantities atomically across owners', () => {
  let now = 1000;
  const broker = new StorageReservationBroker({ now: () => now, defaultTtl: 5000 });
  const first = broker.reserve({ owner: 'bot-a', entries: [{ key: 'withdraw:zone:0,0,0:stone', count: 40, available: 64 }] });
  assert.equal(broker.snapshot().reservations[0].count, 40);
  assert.throws(() => broker.reserve({ owner: 'bot-b', entries: [{ key: 'withdraw:zone:0,0,0:stone', count: 25, available: 64 }] }), /only 24 available/u);
  const second = broker.reserve({ owner: 'bot-b', entries: [{ key: 'withdraw:zone:0,0,0:stone', count: 24, available: 64 }] });
  assert.equal(broker.snapshot().reservations[0].count, 64);
  assert.equal(broker.release(first.id, 'bot-b'), false);
  assert.equal(broker.release(first.id, 'bot-a'), true);
  assert.equal(broker.snapshot().reservations[0].count, 24);
  now = second.expiresAt + 1;
  assert.deepEqual(broker.snapshot().reservations, []);
});

test('renews leases and releases every lease owned by a closing session', () => {
  let now = 500;
  const broker = new StorageReservationBroker({ now: () => now });
  const lease = broker.reserve({
    owner: 'primary',
    ttlMs: 2000,
    entries: [
      { key: 'withdraw:zone:a:item', count: 4, available: 8 },
      { key: 'withdraw:zone:b:item', count: 2, available: 8 }
    ]
  });
  now = 1000;
  const renewed = broker.renew(lease.id, 'primary', 4000);
  assert.equal(renewed.expiresAt, 5000);
  assert.equal(broker.releaseOwner('primary'), 1);
  assert.deepEqual(broker.snapshot().reservations, []);
});
