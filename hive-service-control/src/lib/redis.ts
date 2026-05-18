import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

// maxRetriesPerRequest: null required by BullMQ.
// retryStrategy: give up after 3 attempts so a missing Redis instance fails
// fast instead of hanging the request indefinitely.
export const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  retryStrategy(times) {
    if (times > 3) return null; // null = stop retrying, connection emits error
    return Math.min(times * 300, 1000);
  },
});
