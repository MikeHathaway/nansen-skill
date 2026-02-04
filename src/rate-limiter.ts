/**
 * Token bucket rate limiter
 * Prevents API throttling and ensures sustainable request rates
 */

export interface RateLimiterConfig {
  maxTokens: number;      // Maximum burst capacity
  refillRate: number;     // Tokens added per second
  minDelayMs: number;     // Minimum delay between requests
}

export interface RateLimiterStats {
  totalRequests: number;
  throttledRequests: number;
  totalWaitTimeMs: number;
  currentTokens: number;
}

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private lastRequest: number = 0;
  private config: RateLimiterConfig;
  private stats = {
    totalRequests: 0,
    throttledRequests: 0,
    totalWaitTimeMs: 0,
  };

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = {
      maxTokens: config.maxTokens ?? 10,
      refillRate: config.refillRate ?? 2,
      minDelayMs: config.minDelayMs ?? 100,
    };
    this.tokens = this.config.maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.config.refillRate;

    this.tokens = Math.min(this.config.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Acquire a token, waiting if necessary
   * Returns the wait time in ms
   */
  async acquire(cost: number = 1): Promise<number> {
    this.stats.totalRequests++;
    this.refill();

    let waitTime = 0;

    // Enforce minimum delay between requests
    const timeSinceLastRequest = Date.now() - this.lastRequest;
    if (timeSinceLastRequest < this.config.minDelayMs) {
      const minWait = this.config.minDelayMs - timeSinceLastRequest;
      await this.sleep(minWait);
      waitTime += minWait;
    }

    // Wait for tokens if needed
    while (this.tokens < cost) {
      this.stats.throttledRequests++;
      const tokensNeeded = cost - this.tokens;
      const waitForTokens = (tokensNeeded / this.config.refillRate) * 1000;
      const delay = Math.ceil(waitForTokens) + 10; // Small buffer

      await this.sleep(delay);
      waitTime += delay;
      this.refill();
    }

    this.tokens -= cost;
    this.lastRequest = Date.now();
    this.stats.totalWaitTimeMs += waitTime;

    return waitTime;
  }

  /**
   * Check if a request can be made immediately
   */
  canAcquire(cost: number = 1): boolean {
    this.refill();
    return this.tokens >= cost;
  }

  /**
   * Get current stats
   */
  getStats(): RateLimiterStats {
    this.refill();
    return {
      ...this.stats,
      currentTokens: Math.floor(this.tokens),
    };
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.tokens = this.config.maxTokens;
    this.lastRefill = Date.now();
    this.lastRequest = 0;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Preset configurations for different use cases
export const RATE_LIMIT_PRESETS = {
  // Conservative - for long-running monitoring
  conservative: {
    maxTokens: 5,
    refillRate: 1,
    minDelayMs: 500,
  },
  // Standard - balanced for normal operation
  standard: {
    maxTokens: 10,
    refillRate: 2,
    minDelayMs: 200,
  },
  // Aggressive - for time-sensitive scanning
  aggressive: {
    maxTokens: 20,
    refillRate: 5,
    minDelayMs: 50,
  },
  // Burst - for initial data gathering
  burst: {
    maxTokens: 30,
    refillRate: 3,
    minDelayMs: 100,
  },
};
