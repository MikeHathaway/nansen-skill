/**
 * NansenAgent - Unified interface combining Direct API + MCP
 * For autonomous trading agents
 */

import { NansenClient, createClient } from './api.js';
import { NansenMcp, createMcp } from './mcp.js';
import type {
  Chain,
  ScanMode,
  OpportunitySignal,
  SmartMoneyRequest,
  OpportunityScanRequest,
} from './types.js';
import type { TokenRequest, AddressRequest } from './api.js';

export interface FindOpportunitiesOptions {
  chains?: Chain[];
  modes?: ScanMode[];
  limit?: number;
  analyzeTop?: number;
  minScore?: number;
}

export interface WatchOptions {
  chains?: Chain[];
  modes?: ScanMode[];
  threshold?: number;
  interval?: number;
}

export class NansenAgent {
  public readonly api: NansenClient;
  public readonly mcp: NansenMcp;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.NANSEN_API_KEY;
    if (!key) {
      throw new Error('NANSEN_API_KEY is required');
    }

    this.api = createClient(key);
    this.mcp = createMcp(key);
  }

  /**
   * Find opportunities using API scan + optional MCP analysis
   */
  async findOpportunities(options: FindOpportunitiesOptions = {}): Promise<{
    allSignals: OpportunitySignal[];
    topSignals: OpportunitySignal[];
    timestamp: string;
  }> {
    const {
      chains = ['ethereum', 'base', 'arbitrum'],
      modes = ['accumulation'],
      limit = 10,
      analyzeTop = 0,
      minScore = 1,
    } = options;

    const allSignals: OpportunitySignal[] = [];

    // Fast API scan
    for (const chain of chains) {
      for (const mode of modes) {
        try {
          const signals = await this.api.scanOpportunities({ chain, mode, limit });
          allSignals.push(...signals.filter(s => s.score >= minScore));
        } catch (error) {
          console.error(`Scan error ${chain}/${mode}:`, (error as Error).message);
        }
      }
    }

    // Dedupe and sort
    const seen = new Set<string>();
    const uniqueSignals = allSignals
      .sort((a, b) => b.score - a.score)
      .filter(s => {
        const key = `${s.chain}:${s.token}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    const topSignals = uniqueSignals.slice(0, Math.max(analyzeTop, limit));

    // MCP analysis for top signals
    if (analyzeTop > 0) {
      for (const signal of topSignals.slice(0, analyzeTop)) {
        try {
          const analysis = await this.mcp.analyzeToken(signal.token, signal.chain);
          (signal as any).mcpAnalysis = analysis;
        } catch (error) {
          (signal as any).mcpAnalysis = { error: (error as Error).message };
        }
      }
    }

    return {
      allSignals: uniqueSignals,
      topSignals,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Watch for signals with callback
   */
  watch(options: WatchOptions, onSignal: (signal: OpportunitySignal) => void | Promise<void>): () => void {
    const {
      chains = ['ethereum'],
      modes = ['accumulation'],
      threshold = 10000,
      interval = 60000,
    } = options;

    const seenKeys = new Set<string>();

    const scan = async () => {
      for (const chain of chains) {
        for (const mode of modes) {
          try {
            const signals = await this.api.scanOpportunities({ chain, mode, limit: 50 });

            for (const signal of signals) {
              const value = signal.metrics.netflow24h || signal.metrics.amountUsd || 0;
              if (Math.abs(value) < threshold) continue;

              const key = `${signal.chain}:${signal.token}:${signal.type}`;
              if (seenKeys.has(key)) continue;

              seenKeys.add(key);
              setTimeout(() => seenKeys.delete(key), 3600000);

              await onSignal(signal);
            }
          } catch (error) {
            console.error(`Watch error ${chain}/${mode}:`, (error as Error).message);
          }
        }
      }
    };

    scan();
    const intervalId = setInterval(scan, interval);
    return () => clearInterval(intervalId);
  }

  /**
   * Watch with webhook
   */
  async watchWithWebhook(options: WatchOptions & { webhook: string }): Promise<() => void> {
    const { webhook, ...watchOptions } = options;

    return this.watch(watchOptions, async (signal) => {
      try {
        await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'nansen_signal', signal, timestamp: new Date().toISOString() }),
        });
      } catch (error) {
        console.error('Webhook error:', (error as Error).message);
      }
    });
  }

  // Convenience methods - API
  async getSmartMoneyNetflow(params: SmartMoneyRequest) { return this.api.getSmartMoneyNetflow(params); }
  async getSmartMoneyHoldings(params: SmartMoneyRequest) { return this.api.getSmartMoneyHoldings(params); }
  async getSmartMoneyDexTrades(params: SmartMoneyRequest) { return this.api.getSmartMoneyDexTrades(params); }
  async getTokenHolders(params: TokenRequest) { return this.api.getTokenHolders(params); }
  async getTokenFlows(params: TokenRequest) { return this.api.getTokenFlows(params); }
  async getTokenDexTrades(params: TokenRequest) { return this.api.getTokenDexTrades(params); }
  async getWalletBalances(params: AddressRequest) { return this.api.getWalletBalances(params); }
  async getRelatedWallets(params: AddressRequest) { return this.api.getRelatedWallets(params); }
  async scan(params: OpportunityScanRequest) { return this.api.scanOpportunities(params); }

  // Convenience methods - MCP
  async analyzeToken(token: string, chain: Chain) { return this.mcp.analyzeToken(token, chain); }
  async analyzeWallet(address: string) { return this.mcp.analyzeWallet(address); }
  async search(query: string) { return this.mcp.search(query); }
}

export function createAgent(apiKey?: string): NansenAgent {
  return new NansenAgent(apiKey);
}

export default NansenAgent;
