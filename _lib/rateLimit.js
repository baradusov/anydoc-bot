const CAPACITY = Number(process.env.RATE_LIMIT_BURST) || 20;
const REFILL_MS = Number(process.env.RATE_LIMIT_REFILL_MS) || 10000;
const NOTICE_COOLDOWN_MS = 60000;
const IDLE_MS = 3600000;

const buckets = new Map();

const refill = (bucket, now) => {
  const gained = Math.floor((now - bucket.updatedAt) / REFILL_MS);

  if (gained > 0) {
    bucket.tokens = Math.min(CAPACITY, bucket.tokens + gained);
    bucket.updatedAt = now;
  }
};

const sweep = (now) => {
  for (const [id, bucket] of buckets) {
    if (now - bucket.updatedAt > IDLE_MS) buckets.delete(id);
  }
};

export const take = (chatId, now = Date.now()) => {
  if (buckets.size > 1000) sweep(now);

  let bucket = buckets.get(chatId);

  if (!bucket) {
    bucket = { tokens: CAPACITY, updatedAt: now, notifiedAt: 0 };
    buckets.set(chatId, bucket);
  }

  refill(bucket, now);

  if (bucket.tokens > 0) {
    bucket.tokens -= 1;
    return { allowed: true };
  }

  const notify = now - bucket.notifiedAt >= NOTICE_COOLDOWN_MS;
  if (notify) bucket.notifiedAt = now;

  return {
    allowed: false,
    notify,
    retryInMs: Math.max(0, REFILL_MS - (now - bucket.updatedAt)),
  };
};

export const reset = () => buckets.clear();

export const config = { CAPACITY, REFILL_MS, NOTICE_COOLDOWN_MS };
