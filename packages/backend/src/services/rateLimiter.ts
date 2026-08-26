/**
 * Simple in-memory sliding window rate limiter.
 *
 * Tracks request timestamps per key (IP or userId) and rejects requests that
 * exceed the configured threshold within the window. No external dependencies.
 */

export interface RateLimiterConfig {
  /** Maximum allowed requests within the window. */
  maxRequests: number;
  /** Time window in milliseconds. */
  windowMs: number;
}

export interface RateLimiter {
  /** Returns true if the request should be allowed, false if rate-limited. */
  allow(key: string): boolean;
  /** Reset all tracked keys (useful in tests). */
  reset(): void;
}

export function makeRateLimiter(config: RateLimiterConfig): RateLimiter {
  const requests = new Map<string, number[]>();

  // Periodic cleanup of stale entries to prevent memory leak.
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of requests) {
      const valid = timestamps.filter((t) => now - t < config.windowMs);
      if (valid.length === 0) requests.delete(key);
      else requests.set(key, valid);
    }
  }, config.windowMs * 2);
  if (cleanupInterval.unref) cleanupInterval.unref();

  return {
    allow(key: string): boolean {
      const now = Date.now();
      const timestamps = requests.get(key) ?? [];
      const valid = timestamps.filter((t) => now - t < config.windowMs);

      if (valid.length >= config.maxRequests) {
        requests.set(key, valid);
        return false;
      }

      valid.push(now);
      requests.set(key, valid);
      return true;
    },

    reset() {
      requests.clear();
    },
  };
}
