/**
 * Simple in-memory cache with TTL
 * Prevents redundant API calls and saves credits
 */

export interface CacheEntry<T> {
  data: T;
  expiry: number;
  hits: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  entries: number;
  creditsSaved: number;
}

export class Cache<T = unknown> {
  private store: Map<string, CacheEntry<T>> = new Map();
  private stats = { hits: 0, misses: 0, creditsSaved: 0 };
  private defaultTtl: number;

  constructor(defaultTtlMs: number = 60000) {
    this.defaultTtl = defaultTtlMs;
  }

  /**
   * Get cached value or undefined if expired/missing
   */
  get(key: string): T | undefined {
    const entry = this.store.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    if (Date.now() > entry.expiry) {
      this.store.delete(key);
      this.stats.misses++;
      return undefined;
    }

    entry.hits++;
    this.stats.hits++;
    return entry.data;
  }

  /**
   * Set cached value with optional TTL
   */
  set(key: string, data: T, ttlMs?: number, credits: number = 1): void {
    const expiry = Date.now() + (ttlMs || this.defaultTtl);
    this.store.set(key, { data, expiry, hits: 0 });
  }

  /**
   * Get or fetch - returns cached value or calls fetcher
   */
  async getOrFetch(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs?: number,
    credits: number = 1
  ): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      this.stats.creditsSaved += credits;
      return cached;
    }

    const data = await fetcher();
    this.set(key, data, ttlMs, credits);
    return data;
  }

  /**
   * Invalidate a specific key
   */
  invalidate(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Invalidate all keys matching a pattern
   */
  invalidatePattern(pattern: string): number {
    const regex = new RegExp(pattern);
    let count = 0;
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Clean up expired entries
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expiry) {
        this.store.delete(key);
        pruned++;
      }
    }
    return pruned;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return {
      ...this.stats,
      entries: this.store.size,
    };
  }

  /**
   * Generate cache key from parameters
   */
  static makeKey(prefix: string, params: Record<string, unknown>): string {
    const sorted = Object.keys(params)
      .sort()
      .map(k => `${k}=${JSON.stringify(params[k])}`)
      .join('&');
    return `${prefix}:${sorted}`;
  }
}

// Default cache TTLs by data type
export const CACHE_TTL = {
  SMART_MONEY: 60 * 1000,      // 1 minute - changes frequently
  TOKEN_SCREEN: 5 * 60 * 1000, // 5 minutes
  DEX_TRADES: 30 * 1000,       // 30 seconds - very dynamic
  FLOWS: 5 * 60 * 1000,        // 5 minutes
  WALLET_PROFILE: 15 * 60 * 1000, // 15 minutes - relatively stable
  TOKEN_INFO: 5 * 60 * 1000,   // 5 minutes
  MCP_ANALYSIS: 10 * 60 * 1000, // 10 minutes - expensive, cache longer
  SEARCH: 30 * 60 * 1000,      // 30 minutes - stable
};
