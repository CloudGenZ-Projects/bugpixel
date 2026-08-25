/**
 * Clock abstraction so time-dependent logic (session idle timeout, token
 * expiry) is deterministic and testable. Production uses `systemClock`; tests
 * inject a controllable clock.
 */
export interface Clock {
  /** Current time in epoch milliseconds. */
  now(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
};

/** A test/controllable clock whose time can be set and advanced. */
export class MutableClock implements Clock {
  constructor(private current: number = 0) {}
  now(): number {
    return this.current;
  }
  set(ms: number): void {
    this.current = ms;
  }
  advance(ms: number): void {
    this.current += ms;
  }
}
