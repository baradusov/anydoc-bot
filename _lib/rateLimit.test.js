import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { take, reset, config } from './rateLimit.js';

const { CAPACITY, REFILL_MS, NOTICE_COOLDOWN_MS } = config;
const T0 = 1_700_000_000_000;

beforeEach(reset);

test('serves a burst up to capacity, then refuses', () => {
  for (let i = 0; i < CAPACITY; i++) {
    assert.equal(take(1, T0).allowed, true, `request ${i + 1}`);
  }

  assert.equal(take(1, T0).allowed, false);
});

test('tokens come back over time', () => {
  for (let i = 0; i < CAPACITY; i++) take(2, T0);
  assert.equal(take(2, T0).allowed, false);

  assert.equal(take(2, T0 + REFILL_MS).allowed, true);
  assert.equal(take(2, T0 + REFILL_MS).allowed, false);
});

test('a long idle does not bank more than capacity', () => {
  take(3, T0);

  for (let i = 0; i < CAPACITY; i++) {
    assert.equal(take(3, T0 + REFILL_MS * 1000).allowed, true, `request ${i + 1}`);
  }

  assert.equal(take(3, T0 + REFILL_MS * 1000).allowed, false);
});

test('chats do not share a bucket', () => {
  for (let i = 0; i < CAPACITY; i++) take(10, T0);

  assert.equal(take(10, T0).allowed, false);
  assert.equal(take(11, T0).allowed, true);
});

test('one notice per flood, not one per message', () => {
  for (let i = 0; i < CAPACITY; i++) take(4, T0);

  assert.equal(take(4, T0).notify, true);

  let notices = 0;
  for (let i = 1; i <= 50; i++) {
    const r = take(4, T0 + 100 * i);
    if (!r.allowed && r.notify) notices++;
  }

  assert.equal(notices, 0);
});

test('a sustained flood is reminded once per cooldown', () => {
  for (let i = 0; i < CAPACITY; i++) take(7, T0);

  const step = REFILL_MS / 3;
  let notices = 0;

  for (let i = 0; i * step <= NOTICE_COOLDOWN_MS * 2; i++) {
    const r = take(7, T0 + i * step);
    if (!r.allowed && r.notify) notices++;
  }

  assert.ok(notices >= 2, `expected at least 2, got ${notices}`);
  assert.ok(notices <= 3, `expected at most 3, got ${notices}`);
});

test('tells the sender when to retry', () => {
  for (let i = 0; i < CAPACITY; i++) take(5, T0);

  const r = take(5, T0 + 2000);

  assert.equal(r.allowed, false);
  assert.ok(r.retryInMs > 0 && r.retryInMs <= REFILL_MS);
});

test('the steady rate matches the refill', () => {
  for (let i = 0; i < CAPACITY; i++) take(6, T0);

  let served = 0;
  for (let i = 1; i <= 100; i++) {
    if (take(6, T0 + i * REFILL_MS).allowed) served++;
  }

  assert.equal(served, 100);
});

test('a bystander waits a bounded time however large the flood', () => {
  const SERVICE_MS = 3000; // median PDF generation, measured over 30 days
  const wait = (messages) => {
    let now = 0;
    for (let i = 0; i < messages; i++) {
      if (take(9, now).allowed) now += SERVICE_MS;
    }
    return now;
  };

  reset();
  const small = wait(200);
  reset();
  const huge = wait(100000);

  assert.equal(small, huge, 'the wait stops growing once the bucket is empty');
  assert.ok(huge < 120000, `bystander waits under two minutes, got ${huge / 1000}s`);
});
