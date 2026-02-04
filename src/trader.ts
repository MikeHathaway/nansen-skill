/**
 * NansenTrader - Trading-focused intelligence layer
 *
 * Wraps NansenAgent with:
 * - Caching (saves API credits)
 * - Rate limiting (prevents throttling)
 * - Signal logging (tracks performance)
 * - Risk filtering (quality over quantity)
 * - Deduplication (no duplicate signals)
 *
 * Designed to feed into execution skills (Bankr, polyclaw, etc.)
 */

import { NansenAgent } from './agent.js';
import { Cache, CACHE_TTL } from './cache.js';
import { RateLimiter, RATE_LIMIT_PRESETS } from './rate-limiter.js';
import { SignalLog, type LoggedSignal, type SignalOutcome } from './signal-log.js';
import type {
  Chain,
  ScanMode,
  OpportunitySignal,
  SmartMoneyNetflow,
  TokenScreenerResult,
  TokenInfo,
} from './types.js';

// =============================================================================
// Types
// =============================================================================

export interface TraderConfig {
  // API
  apiKey?: string;

  // Caching
  enableCache?: boolean;
  cacheTtlMs?: number;

  // Rate limiting
  enableRateLimit?: boolean;
  rateLimitPreset?: keyof typeof RATE_LIMIT_PRESETS;

  // Signal logging
  enableSignalLog?: boolean;
  signalLogPath?: string;

  // Risk filters
  riskConfig?: RiskConfig;
}

export interface RiskConfig {
  // Signal quality
  minScore: number;
  maxSignalsPerScan: number;

  // Duplicate prevention
  dedupeWindowMs: number;

  // Chain preferences
  allowedChains?: Chain[];
  excludedChains?: Chain[];

  // Token filters
  minLiquidity?: number;
  minHolders?: number;
  maxMcap?: number;
  minMcap?: number;

  // Smart money filters
  minSmartMoneyBuyers?: number;
  minNetflowUsd?: number;

  // Fresh wallet filter (potential insider signals)
  minFreshWallets?: number;
}

export interface ScanOptions {
  chains?: Chain[];
  modes?: ScanMode[];
  limit?: number;
  analyze?: boolean;
  riskOverride?: Partial<RiskConfig>;
}

export interface TradingSignal extends LoggedSignal {
  riskScore: number;
  riskFactors: string[];
  recommendation: 'strong_buy' | 'buy' | 'watch' | 'avoid';
  confidence: number;
  suggestedAction?: SuggestedAction;
}

export interface SuggestedAction {
  action: 'buy' | 'sell' | 'wait';
  urgency: 'high' | 'medium' | 'low';
  reasoning: string;
  targetChain: Chain;
  targetToken: string;
  positionSizeHint: 'small' | 'medium' | 'large';
}

export interface TraderStats {
  cache: {
    hits: number;
    misses: number;
    creditsSaved: number;
  };
  rateLimit: {
    totalRequests: number;
    throttledRequests: number;
    totalWaitTimeMs: number;
  };
  signals: {
    totalSignals: number;
    actedOn: number;
    winRate: number;
    totalPnl: number;
  };
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_RISK_CONFIG: RiskConfig = {
  minScore: 2.0,
  maxSignalsPerScan: 10,
  dedupeWindowMs: 60 * 60 * 1000, // 1 hour
  minLiquidity: 10000,
  minHolders: 100,
  minSmartMoneyBuyers: 3,
  minNetflowUsd: 10000,
  minFreshWallets: 5,
};

// =============================================================================
// NansenTrader Class
// =============================================================================

export class NansenTrader {
  public readonly agent: NansenAgent;
  private cache: Cache;
  private rateLimiter: RateLimiter;
  private signalLog: SignalLog;
  private riskConfig: RiskConfig;
  private config: TraderConfig;

  constructor(config: TraderConfig = {}) {
    this.config = config;

    // Initialize agent
    this.agent = new NansenAgent(config.apiKey);

    // Initialize cache
    this.cache = new Cache(config.cacheTtlMs || 60000);

    // Initialize rate limiter
    const preset = config.rateLimitPreset || 'standard';
    this.rateLimiter = new RateLimiter(RATE_LIMIT_PRESETS[preset]);

    // Initialize signal log
    this.signalLog = new SignalLog(config.signalLogPath, config.enableSignalLog !== false);

    // Initialize risk config
    this.riskConfig = {
      ...DEFAULT_RISK_CONFIG,
      ...config.riskConfig,
    };
  }

  // ===========================================================================
  // Core Trading Methods
  // ===========================================================================

  /**
   * Scan for trading opportunities with caching, rate limiting, and risk filtering
   * This is the primary method for autonomous trading agents
   */
  async scan(options: ScanOptions = {}): Promise<TradingSignal[]> {
    const {
      chains = ['ethereum', 'base', 'arbitrum'],
      modes = ['accumulation'],
      limit = this.riskConfig.maxSignalsPerScan,
      analyze = false,
      riskOverride,
    } = options;

    const effectiveRisk = { ...this.riskConfig, ...riskOverride };
    const allSignals: OpportunitySignal[] = [];

    // Filter chains
    const targetChains = this.filterChains(chains, effectiveRisk);

    // Scan each chain/mode combination
    for (const chain of targetChains) {
      for (const mode of modes) {
        const cacheKey = Cache.makeKey('scan', { chain, mode });

        // Rate limit
        if (this.config.enableRateLimit !== false) {
          await this.rateLimiter.acquire();
        }

        // Fetch with caching
        const signals = await this.cache.getOrFetch(
          cacheKey,
          () => this.agent.api.scanOpportunities({ chain, mode, limit: limit * 2 }),
          CACHE_TTL.SMART_MONEY
        ) as OpportunitySignal[];

        allSignals.push(...signals);
      }
    }

    // Apply risk filters
    const filtered = this.applyRiskFilters(allSignals, effectiveRisk);

    // Deduplicate
    const deduped = this.deduplicateSignals(filtered, effectiveRisk.dedupeWindowMs);

    // Score and rank
    const scored = this.scoreSignals(deduped);

    // Take top signals
    const topSignals = scored.slice(0, limit);

    // Optionally analyze with MCP
    if (analyze && topSignals.length > 0) {
      await this.enrichWithMcp(topSignals.slice(0, 3));
    }

    // Log signals
    for (const signal of topSignals) {
      this.signalLog.log(signal);
    }

    return topSignals;
  }

  /**
   * Quick scan - fast, minimal processing
   */
  async quickScan(chain: Chain, mode: ScanMode = 'accumulation'): Promise<TradingSignal[]> {
    return this.scan({
      chains: [chain],
      modes: [mode],
      limit: 5,
      analyze: false,
    });
  }

  /**
   * Deep scan - comprehensive with MCP analysis
   */
  async deepScan(options: ScanOptions = {}): Promise<TradingSignal[]> {
    return this.scan({
      ...options,
      analyze: true,
    });
  }

  /**
   * Get smart money data with caching
   */
  async getSmartMoney(chain: Chain, direction: 'inflow' | 'outflow' | 'all' = 'all'): Promise<SmartMoneyNetflow[]> {
    const cacheKey = Cache.makeKey('smartmoney', { chain, direction });

    if (this.config.enableRateLimit !== false) {
      await this.rateLimiter.acquire();
    }

    return this.cache.getOrFetch(
      cacheKey,
      () => this.agent.api.getSmartMoneyNetflow({ chain, direction }),
      CACHE_TTL.SMART_MONEY
    ) as Promise<SmartMoneyNetflow[]>;
  }

  /**
   * Screen tokens with caching
   */
  async screenTokens(chain: Chain, smartMoneyOnly: boolean = true): Promise<TokenScreenerResult[]> {
    const cacheKey = Cache.makeKey('screen', { chain, smartMoneyOnly });

    if (this.config.enableRateLimit !== false) {
      await this.rateLimiter.acquire();
    }

    return this.cache.getOrFetch(
      cacheKey,
      () => this.agent.api.screenTokens({ chain, onlySmartMoney: smartMoneyOnly }),
      CACHE_TTL.TOKEN_SCREEN
    ) as Promise<TokenScreenerResult[]>;
  }

  /**
   * Analyze a specific token (MCP + API combined)
   */
  async analyzeToken(token: string, chain: Chain): Promise<{
    apiData: TokenInfo | null;
    mcpData: unknown;
    recommendation: 'buy' | 'watch' | 'avoid';
    confidence: number;
    reasoning: string;
  }> {
    const cacheKey = Cache.makeKey('analyze', { token, chain });

    if (this.config.enableRateLimit !== false) {
      await this.rateLimiter.acquire(2); // MCP costs more
    }

    const [apiResult, mcpResult] = await Promise.allSettled([
      this.cache.getOrFetch(
        `token:${token}:${chain}`,
        () => this.agent.api.getTokenInfo({ address: token, chain }),
        CACHE_TTL.TOKEN_INFO
      ),
      this.cache.getOrFetch(
        cacheKey,
        () => this.agent.mcp.analyzeToken(token, chain),
        CACHE_TTL.MCP_ANALYSIS
      ),
    ]);

    const apiData = apiResult.status === 'fulfilled' ? apiResult.value as TokenInfo : null;
    const mcpData = mcpResult.status === 'fulfilled' ? mcpResult.value : null;

    // Simple recommendation logic based on available data
    let recommendation: 'buy' | 'watch' | 'avoid' = 'watch';
    let confidence = 0.5;
    let reasoning = 'Insufficient data for strong recommendation';

    // Use screener data for better metrics if available
    if (apiData) {
      // TokenInfo doesn't have smartMoneyNetflow directly, use volume as proxy
      if (apiData.volume24h > 100000 && apiData.holders > 500) {
        recommendation = 'buy';
        confidence = 0.6;
        reasoning = `High volume ($${formatNumber(apiData.volume24h)}) with ${apiData.holders} holders`;
      } else if (apiData.liquidity < 10000) {
        recommendation = 'avoid';
        confidence = 0.7;
        reasoning = `Low liquidity ($${formatNumber(apiData.liquidity)})`;
      }
    }

    return { apiData, mcpData, recommendation, confidence, reasoning };
  }

  // ===========================================================================
  // Signal Management
  // ===========================================================================

  /**
   * Mark a signal as acted upon
   */
  markActed(signalId: string, action: 'buy' | 'sell' | 'skip', notes?: string): LoggedSignal | undefined {
    return this.signalLog.markActed(signalId, action, notes);
  }

  /**
   * Record trade outcome
   */
  recordOutcome(signalId: string, outcome: Partial<SignalOutcome>): LoggedSignal | undefined {
    return this.signalLog.recordOutcome(signalId, outcome);
  }

  /**
   * Get recent signals
   */
  getRecentSignals(limit: number = 20): LoggedSignal[] {
    return this.signalLog.find({ limit });
  }

  /**
   * Get signals for a specific token
   */
  getTokenSignals(token: string, chain?: Chain): LoggedSignal[] {
    return this.signalLog.getTokenHistory(token, chain);
  }

  // ===========================================================================
  // Monitoring
  // ===========================================================================

  /**
   * Start continuous monitoring
   */
  monitor(
    options: ScanOptions & { intervalMs?: number },
    onSignal: (signal: TradingSignal) => void | Promise<void>
  ): () => void {
    const { intervalMs = 60000, ...scanOptions } = options;
    const seen = new Set<string>();

    const runScan = async () => {
      try {
        const signals = await this.scan(scanOptions);

        for (const signal of signals) {
          const key = `${signal.chain}:${signal.token}:${signal.type}`;
          if (!seen.has(key)) {
            seen.add(key);
            setTimeout(() => seen.delete(key), this.riskConfig.dedupeWindowMs);
            await onSignal(signal);
          }
        }
      } catch (error) {
        console.error('Monitor scan error:', (error as Error).message);
      }
    };

    runScan();
    const intervalId = setInterval(runScan, intervalMs);

    return () => clearInterval(intervalId);
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get comprehensive stats
   */
  getStats(): TraderStats {
    const cacheStats = this.cache.getStats();
    const rateLimitStats = this.rateLimiter.getStats();
    const signalStats = this.signalLog.getStats();

    return {
      cache: {
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        creditsSaved: cacheStats.creditsSaved,
      },
      rateLimit: {
        totalRequests: rateLimitStats.totalRequests,
        throttledRequests: rateLimitStats.throttledRequests,
        totalWaitTimeMs: rateLimitStats.totalWaitTimeMs,
      },
      signals: {
        totalSignals: signalStats.totalSignals,
        actedOn: signalStats.actedOn,
        winRate: signalStats.winRate,
        totalPnl: signalStats.totalPnl,
      },
    };
  }

  /**
   * Get signal performance stats
   */
  getPerformanceStats() {
    return this.signalLog.getStats();
  }

  // ===========================================================================
  // Internal Methods
  // ===========================================================================

  private filterChains(chains: Chain[], risk: RiskConfig): Chain[] {
    let filtered = chains;

    if (risk.allowedChains?.length) {
      filtered = filtered.filter(c => risk.allowedChains!.includes(c));
    }

    if (risk.excludedChains?.length) {
      filtered = filtered.filter(c => !risk.excludedChains!.includes(c));
    }

    return filtered;
  }

  private applyRiskFilters(signals: OpportunitySignal[], risk: RiskConfig): OpportunitySignal[] {
    return signals.filter(s => {
      // Score filter
      if (s.score < risk.minScore) return false;

      // Metrics filters
      const m = s.metrics;

      if (risk.minSmartMoneyBuyers && m.buyers && m.buyers < risk.minSmartMoneyBuyers) {
        return false;
      }

      if (risk.minNetflowUsd && m.netflow24h && Math.abs(m.netflow24h) < risk.minNetflowUsd) {
        return false;
      }

      if (risk.minFreshWallets && m.freshWallets && m.freshWallets < risk.minFreshWallets) {
        return false;
      }

      return true;
    });
  }

  private deduplicateSignals(signals: OpportunitySignal[], windowMs: number): OpportunitySignal[] {
    const seen = new Map<string, OpportunitySignal>();

    for (const signal of signals) {
      const key = `${signal.chain}:${signal.token}`;

      // Check signal log for recent duplicates
      if (this.signalLog.hasRecentSignal(signal, windowMs)) {
        continue;
      }

      // Keep highest score for each token
      const existing = seen.get(key);
      if (!existing || signal.score > existing.score) {
        seen.set(key, signal);
      }
    }

    return Array.from(seen.values());
  }

  private scoreSignals(signals: OpportunitySignal[]): TradingSignal[] {
    return signals
      .map(signal => {
        const riskFactors: string[] = [];
        let riskScore = 0;

        // Positive factors
        if (signal.score > 5) {
          riskScore += 2;
        } else if (signal.score > 3) {
          riskScore += 1;
        }

        const m = signal.metrics;

        if (m.buyers && m.sellers && m.buyers > m.sellers * 2) {
          riskScore += 1;
          riskFactors.push('Strong buyer/seller ratio');
        }

        if (m.netflow24h && m.netflow24h > 100000) {
          riskScore += 1;
          riskFactors.push('High netflow');
        }

        // Negative factors
        if (m.sellers && m.buyers && m.sellers > m.buyers) {
          riskScore -= 1;
          riskFactors.push('More sellers than buyers');
        }

        // Determine recommendation
        let recommendation: TradingSignal['recommendation'];
        let confidence: number;

        if (riskScore >= 3) {
          recommendation = 'strong_buy';
          confidence = 0.8;
        } else if (riskScore >= 1) {
          recommendation = 'buy';
          confidence = 0.6;
        } else if (riskScore >= 0) {
          recommendation = 'watch';
          confidence = 0.4;
        } else {
          recommendation = 'avoid';
          confidence = 0.3;
        }

        // Create suggested action for strong signals
        let suggestedAction: SuggestedAction | undefined;
        if (recommendation === 'strong_buy' || recommendation === 'buy') {
          suggestedAction = {
            action: 'buy',
            urgency: recommendation === 'strong_buy' ? 'high' : 'medium',
            reasoning: riskFactors.join('; ') || 'Positive signal detected',
            targetChain: signal.chain,
            targetToken: signal.token,
            positionSizeHint: recommendation === 'strong_buy' ? 'medium' : 'small',
          };
        }

        return {
          ...signal,
          id: `${signal.chain}:${signal.token}:${signal.type}:${signal.timestamp}`,
          loggedAt: new Date().toISOString(),
          acted: false,
          riskScore,
          riskFactors,
          recommendation,
          confidence,
          suggestedAction,
        } as TradingSignal;
      })
      .sort((a, b) => b.riskScore - a.riskScore || b.score - a.score);
  }

  private async enrichWithMcp(signals: TradingSignal[]): Promise<void> {
    for (const signal of signals) {
      try {
        if (this.config.enableRateLimit !== false) {
          await this.rateLimiter.acquire(2);
        }

        const cacheKey = Cache.makeKey('mcp_analyze', { token: signal.token, chain: signal.chain });
        const analysis = await this.cache.getOrFetch(
          cacheKey,
          () => this.agent.mcp.analyzeToken(signal.token, signal.chain),
          CACHE_TTL.MCP_ANALYSIS,
          5
        );

        (signal as any).mcpAnalysis = analysis;
      } catch (error) {
        (signal as any).mcpAnalysis = { error: (error as Error).message };
      }
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Invalidate cache for a specific chain
   */
  invalidateChain(chain: Chain): void {
    this.cache.invalidatePattern(chain);
  }
}

// =============================================================================
// Helpers
// =============================================================================

function formatNumber(num: number): string {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}

// =============================================================================
// Factory
// =============================================================================

export function createTrader(config?: TraderConfig): NansenTrader {
  return new NansenTrader(config);
}

export default NansenTrader;
