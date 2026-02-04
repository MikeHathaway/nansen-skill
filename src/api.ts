/**
 * Nansen Direct API Client
 * Updated to match actual Nansen API v1 format (Feb 2025)
 *
 * Working endpoints:
 * - /smart-money/netflow     (chains[])
 * - /smart-money/holdings    (chains[])
 * - /smart-money/dex-trades  (chains[])
 * - /tgm/holders             (chain, token_address)
 * - /tgm/flows               (chain, token_address, date)
 * - /tgm/dex-trades          (chain, token_address, date)
 * - /tgm/who-bought-sold     (chain, token_address, date)
 * - /tgm/transfers           (chain, token_address, date)
 * - /profiler/address/current-balance  (address, chain)
 * - /profiler/address/related-wallets  (address, chain)
 */

import type {
  NansenConfig,
  Chain,
  SmartMoneyNetflow,
  OpportunitySignal,
  SmartMoneyRequest,
  OpportunityScanRequest,
  ApiError,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.nansen.ai/api/v1';

// =============================================================================
// Raw API Response Types
// =============================================================================

interface RawSmartMoneyNetflow {
  token_address: string;
  token_symbol: string;
  net_flow_1h_usd: number;
  net_flow_24h_usd: number;
  net_flow_7d_usd: number;
  net_flow_30d_usd: number;
  chain: string;
  token_sectors?: string[];
  trader_count: number;
  token_age_days: number;
  market_cap_usd: number;
}

interface RawSmartMoneyHolding {
  token_address: string;
  token_symbol: string;
  chain: string;
  holder_count: number;
  total_balance_usd: number;
  balance_change_24h_usd: number;
  balance_change_7d_usd: number;
  market_cap_usd: number;
}

interface RawSmartMoneyDexTrade {
  token_address: string;
  token_symbol: string;
  chain: string;
  buy_volume_usd: number;
  sell_volume_usd: number;
  net_volume_usd: number;
  buy_count: number;
  sell_count: number;
  unique_traders: number;
}

interface RawTokenHolder {
  address: string;
  address_label?: string;
  token_amount: number;
  total_inflow: number;
  total_outflow: number;
  balance_change_24h: number;
  balance_change_7d: number;
  balance_change_30d: number;
  ownership_percentage: number;
  value_usd: number;
}

interface RawTokenFlow {
  entity: string;
  entity_label?: string;
  inflow_usd: number;
  outflow_usd: number;
  net_flow_usd: number;
  transaction_count: number;
}

interface RawDexTrade {
  tx_hash: string;
  timestamp: string;
  trader_address: string;
  trader_label?: string;
  side: 'buy' | 'sell';
  token_amount: number;
  value_usd: number;
  price_usd: number;
}

interface RawWhoBoughtSold {
  entity: string;
  entity_label?: string;
  buy_volume_usd: number;
  sell_volume_usd: number;
  net_volume_usd: number;
  trade_count: number;
}

interface RawTransfer {
  tx_hash: string;
  timestamp: string;
  from_address: string;
  from_label?: string;
  to_address: string;
  to_label?: string;
  token_amount: number;
  value_usd: number;
}

interface RawWalletBalance {
  chain: string;
  address: string;
  token_address: string;
  token_symbol: string;
  token_name: string;
  token_amount: number;
  price_usd: number;
  value_usd: number;
}

interface RawRelatedWallet {
  address: string;
  label?: string;
  relationship: string;
  transaction_count: number;
  total_value_usd: number;
}

interface RawApiResponse<T> {
  data: T;
}

// =============================================================================
// Normalized Types (for consumers)
// =============================================================================

export interface SmartMoneyHolding {
  token: string;
  symbol: string;
  chain: Chain;
  holderCount: number;
  totalBalanceUsd: number;
  balanceChange24hUsd: number;
  balanceChange7dUsd: number;
  marketCap: number;
}

export interface SmartMoneyDexTrade {
  token: string;
  symbol: string;
  chain: Chain;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  netVolumeUsd: number;
  buyCount: number;
  sellCount: number;
  uniqueTraders: number;
}

export interface TokenHolder {
  address: string;
  label?: string;
  tokenAmount: number;
  valueUsd: number;
  ownershipPercent: number;
  balanceChange24h: number;
  balanceChange7d: number;
  balanceChange30d: number;
}

export interface TokenFlow {
  entity: string;
  label?: string;
  inflowUsd: number;
  outflowUsd: number;
  netFlowUsd: number;
  txCount: number;
}

export interface DexTrade {
  txHash: string;
  timestamp: string;
  trader: string;
  traderLabel?: string;
  side: 'buy' | 'sell';
  tokenAmount: number;
  valueUsd: number;
  priceUsd: number;
}

export interface TokenTransfer {
  txHash: string;
  timestamp: string;
  from: string;
  fromLabel?: string;
  to: string;
  toLabel?: string;
  tokenAmount: number;
  valueUsd: number;
}

export interface WalletBalance {
  chain: Chain;
  token: string;
  symbol: string;
  name: string;
  amount: number;
  priceUsd: number;
  valueUsd: number;
}

export interface RelatedWallet {
  address: string;
  label?: string;
  relationship: string;
  txCount: number;
  totalValueUsd: number;
}

// =============================================================================
// Request Types
// =============================================================================

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

export interface TokenRequest {
  chain: Chain;
  tokenAddress: string;
  date?: DateRange;
  limit?: number;
}

export interface AddressRequest {
  address: string;
  chain: Chain;
  limit?: number;
}

// =============================================================================
// Client
// =============================================================================

export class NansenApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'NansenApiError';
  }
}

export class NansenClient {
  private config: NansenConfig;

  constructor(apiKey?: string, baseUrl?: string) {
    const key = apiKey || process.env.NANSEN_API_KEY;
    if (!key) {
      throw new Error('NANSEN_API_KEY is required');
    }

    this.config = {
      apiKey: key,
      baseUrl: baseUrl || DEFAULT_BASE_URL,
    };
  }

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'POST',
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;

    const options: RequestInit = {
      method,
      headers: {
        'apiKey': this.config.apiKey,
        'Content-Type': 'application/json',
      },
    };

    if (body && method === 'POST') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      let errorData: ApiError;
      try {
        errorData = await response.json();
      } catch {
        errorData = {
          code: `HTTP_${response.status}`,
          message: response.statusText,
        };
      }
      throw new NansenApiError(
        errorData.code || `HTTP_${response.status}`,
        errorData.message || 'API request failed',
        errorData.details
      );
    }

    return response.json();
  }

  // ===========================================================================
  // Smart Money Endpoints
  // ===========================================================================

  /**
   * Get smart money netflow data
   * POST /smart-money/netflow { chains: ['base'] }
   */
  async getSmartMoneyNetflow(params: SmartMoneyRequest): Promise<SmartMoneyNetflow[]> {
    const chains = params.chains || [params.chain];

    const response = await this.request<RawApiResponse<RawSmartMoneyNetflow[]>>(
      '/smart-money/netflow',
      'POST',
      { chains }
    );

    let data: SmartMoneyNetflow[] = (response.data || []).map(item => ({
      token: item.token_address,
      symbol: item.token_symbol,
      name: item.token_symbol,
      chain: item.chain as Chain,
      netflow: item.net_flow_24h_usd,
      netflowUsd: item.net_flow_24h_usd,
      netflow1h: item.net_flow_1h_usd,
      netflow7d: item.net_flow_7d_usd,
      netflow30d: item.net_flow_30d_usd,
      inflow: item.net_flow_24h_usd > 0 ? item.net_flow_24h_usd : 0,
      inflowUsd: item.net_flow_24h_usd > 0 ? item.net_flow_24h_usd : 0,
      outflow: item.net_flow_24h_usd < 0 ? Math.abs(item.net_flow_24h_usd) : 0,
      outflowUsd: item.net_flow_24h_usd < 0 ? Math.abs(item.net_flow_24h_usd) : 0,
      buyersCount: item.net_flow_24h_usd > 0 ? item.trader_count : 0,
      sellersCount: item.net_flow_24h_usd < 0 ? item.trader_count : 0,
      traderCount: item.trader_count,
      marketCap: item.market_cap_usd,
      tokenAge: item.token_age_days,
      sectors: item.token_sectors || [],
      timestamp: new Date().toISOString(),
    }));

    // Apply filters
    if (params.direction === 'inflow') {
      data = data.filter(d => d.netflow > 0);
    } else if (params.direction === 'outflow') {
      data = data.filter(d => d.netflow < 0);
    }

    if (params.minValue) {
      data = data.filter(d => Math.abs(d.netflowUsd) >= params.minValue!);
    }

    if (params.chain && !params.chains) {
      data = data.filter(d => d.chain === params.chain);
    }

    data.sort((a, b) => Math.abs(b.netflowUsd) - Math.abs(a.netflowUsd));

    if (params.limit) {
      data = data.slice(0, params.limit);
    }

    return data;
  }

  /**
   * Get smart money holdings
   * POST /smart-money/holdings { chains: ['base'] }
   */
  async getSmartMoneyHoldings(params: SmartMoneyRequest): Promise<SmartMoneyHolding[]> {
    const chains = params.chains || [params.chain];

    const response = await this.request<RawApiResponse<RawSmartMoneyHolding[]>>(
      '/smart-money/holdings',
      'POST',
      { chains }
    );

    let data: SmartMoneyHolding[] = (response.data || []).map(item => ({
      token: item.token_address,
      symbol: item.token_symbol,
      chain: item.chain as Chain,
      holderCount: item.holder_count,
      totalBalanceUsd: item.total_balance_usd,
      balanceChange24hUsd: item.balance_change_24h_usd,
      balanceChange7dUsd: item.balance_change_7d_usd,
      marketCap: item.market_cap_usd,
    }));

    if (params.chain && !params.chains) {
      data = data.filter(d => d.chain === params.chain);
    }

    if (params.limit) {
      data = data.slice(0, params.limit);
    }

    return data;
  }

  /**
   * Get smart money DEX trades
   * POST /smart-money/dex-trades { chains: ['base'] }
   */
  async getSmartMoneyDexTrades(params: SmartMoneyRequest): Promise<SmartMoneyDexTrade[]> {
    const chains = params.chains || [params.chain];

    const response = await this.request<RawApiResponse<RawSmartMoneyDexTrade[]>>(
      '/smart-money/dex-trades',
      'POST',
      { chains }
    );

    let data: SmartMoneyDexTrade[] = (response.data || []).map(item => ({
      token: item.token_address,
      symbol: item.token_symbol,
      chain: item.chain as Chain,
      buyVolumeUsd: item.buy_volume_usd,
      sellVolumeUsd: item.sell_volume_usd,
      netVolumeUsd: item.net_volume_usd,
      buyCount: item.buy_count,
      sellCount: item.sell_count,
      uniqueTraders: item.unique_traders,
    }));

    if (params.chain && !params.chains) {
      data = data.filter(d => d.chain === params.chain);
    }

    if (params.limit) {
      data = data.slice(0, params.limit);
    }

    return data;
  }

  // ===========================================================================
  // Token God Mode Endpoints
  // ===========================================================================

  /**
   * Get top holders for a token
   * POST /tgm/holders { chain, token_address }
   */
  async getTokenHolders(params: TokenRequest): Promise<TokenHolder[]> {
    const response = await this.request<RawApiResponse<RawTokenHolder[]>>(
      '/tgm/holders',
      'POST',
      { chain: params.chain, token_address: params.tokenAddress }
    );

    let data: TokenHolder[] = (response.data || []).map(item => ({
      address: item.address,
      label: item.address_label,
      tokenAmount: item.token_amount,
      valueUsd: item.value_usd,
      ownershipPercent: item.ownership_percentage * 100,
      balanceChange24h: item.balance_change_24h,
      balanceChange7d: item.balance_change_7d,
      balanceChange30d: item.balance_change_30d,
    }));

    if (params.limit) {
      data = data.slice(0, params.limit);
    }

    return data;
  }

  /**
   * Get token flows by entity
   * POST /tgm/flows { chain, token_address, date: { from, to } }
   */
  async getTokenFlows(params: TokenRequest): Promise<TokenFlow[]> {
    const date = params.date || getDefaultDateRange();

    const response = await this.request<RawApiResponse<RawTokenFlow[]>>(
      '/tgm/flows',
      'POST',
      { chain: params.chain, token_address: params.tokenAddress, date }
    );

    let data: TokenFlow[] = (response.data || []).map(item => ({
      entity: item.entity,
      label: item.entity_label,
      inflowUsd: item.inflow_usd,
      outflowUsd: item.outflow_usd,
      netFlowUsd: item.net_flow_usd,
      txCount: item.transaction_count,
    }));

    if (params.limit) {
      data = data.slice(0, params.limit);
    }

    return data;
  }

  /**
   * Get DEX trades for a token
   * POST /tgm/dex-trades { chain, token_address, date: { from, to } }
   */
  async getTokenDexTrades(params: TokenRequest): Promise<DexTrade[]> {
    const date = params.date || getDefaultDateRange();

    const response = await this.request<RawApiResponse<RawDexTrade[]>>(
      '/tgm/dex-trades',
      'POST',
      { chain: params.chain, token_address: params.tokenAddress, date }
    );

    let data: DexTrade[] = (response.data || []).map(item => ({
      txHash: item.tx_hash,
      timestamp: item.timestamp,
      trader: item.trader_address,
      traderLabel: item.trader_label,
      side: item.side,
      tokenAmount: item.token_amount,
      valueUsd: item.value_usd,
      priceUsd: item.price_usd,
    }));

    if (params.limit) {
      data = data.slice(0, params.limit);
    }

    return data;
  }

  /**
   * Get who bought/sold a token
   * POST /tgm/who-bought-sold { chain, token_address, date: { from, to } }
   */
  async getWhoBoughtSold(params: TokenRequest): Promise<{ entity: string; label?: string; buyVolumeUsd: number; sellVolumeUsd: number; netVolumeUsd: number; tradeCount: number }[]> {
    const date = params.date || getDefaultDateRange();

    const response = await this.request<RawApiResponse<RawWhoBoughtSold[]>>(
      '/tgm/who-bought-sold',
      'POST',
      { chain: params.chain, token_address: params.tokenAddress, date }
    );

    let data = (response.data || []).map(item => ({
      entity: item.entity,
      label: item.entity_label,
      buyVolumeUsd: item.buy_volume_usd,
      sellVolumeUsd: item.sell_volume_usd,
      netVolumeUsd: item.net_volume_usd,
      tradeCount: item.trade_count,
    }));

    if (params.limit) {
      data = data.slice(0, params.limit);
    }

    return data;
  }

  /**
   * Get token transfers
   * POST /tgm/transfers { chain, token_address, date: { from, to } }
   */
  async getTokenTransfers(params: TokenRequest): Promise<TokenTransfer[]> {
    const date = params.date || getDefaultDateRange();

    const response = await this.request<RawApiResponse<RawTransfer[]>>(
      '/tgm/transfers',
      'POST',
      { chain: params.chain, token_address: params.tokenAddress, date }
    );

    let data: TokenTransfer[] = (response.data || []).map(item => ({
      txHash: item.tx_hash,
      timestamp: item.timestamp,
      from: item.from_address,
      fromLabel: item.from_label,
      to: item.to_address,
      toLabel: item.to_label,
      tokenAmount: item.token_amount,
      valueUsd: item.value_usd,
    }));

    if (params.limit) {
      data = data.slice(0, params.limit);
    }

    return data;
  }

  // ===========================================================================
  // Profiler Endpoints
  // ===========================================================================

  /**
   * Get wallet current balances
   * POST /profiler/address/current-balance { address, chain }
   */
  async getWalletBalances(params: AddressRequest): Promise<WalletBalance[]> {
    const response = await this.request<RawApiResponse<RawWalletBalance[]>>(
      '/profiler/address/current-balance',
      'POST',
      { address: params.address, chain: params.chain }
    );

    let data: WalletBalance[] = (response.data || []).map(item => ({
      chain: item.chain as Chain,
      token: item.token_address,
      symbol: item.token_symbol,
      name: item.token_name,
      amount: item.token_amount,
      priceUsd: item.price_usd,
      valueUsd: item.value_usd,
    }));

    // Sort by value descending
    data.sort((a, b) => b.valueUsd - a.valueUsd);

    if (params.limit) {
      data = data.slice(0, params.limit);
    }

    return data;
  }

  /**
   * Get related wallets
   * POST /profiler/address/related-wallets { address, chain }
   */
  async getRelatedWallets(params: AddressRequest): Promise<RelatedWallet[]> {
    const response = await this.request<RawApiResponse<RawRelatedWallet[]>>(
      '/profiler/address/related-wallets',
      'POST',
      { address: params.address, chain: params.chain }
    );

    let data: RelatedWallet[] = (response.data || []).map(item => ({
      address: item.address,
      label: item.label,
      relationship: item.relationship,
      txCount: item.transaction_count,
      totalValueUsd: item.total_value_usd,
    }));

    if (params.limit) {
      data = data.slice(0, params.limit);
    }

    return data;
  }

  // ===========================================================================
  // Composite Methods
  // ===========================================================================

  /**
   * Scan for trading opportunities
   */
  async scanOpportunities(params: OpportunityScanRequest): Promise<OpportunitySignal[]> {
    const signals: OpportunitySignal[] = [];

    switch (params.mode) {
      case 'accumulation': {
        const netflow = await this.getSmartMoneyNetflow({
          chain: params.chain,
          direction: 'inflow',
          minValue: 10000,
          limit: params.limit || 20,
        });

        for (const item of netflow) {
          signals.push({
            type: 'accumulation',
            token: item.token,
            symbol: item.symbol,
            chain: item.chain,
            score: this.calculateScore(item),
            reason: `${item.traderCount} smart traders, $${formatNumber(item.netflowUsd)} net inflow (24h)`,
            metrics: {
              netflow24h: item.netflowUsd,
              netflow7d: item.netflow7d || 0,
              traderCount: item.traderCount,
              marketCap: item.marketCap || 0,
            },
            timestamp: new Date().toISOString(),
          });
        }
        break;
      }

      case 'distribution': {
        const netflow = await this.getSmartMoneyNetflow({
          chain: params.chain,
          direction: 'outflow',
          limit: params.limit || 20,
        });

        for (const item of netflow) {
          signals.push({
            type: 'distribution',
            token: item.token,
            symbol: item.symbol,
            chain: item.chain,
            score: Math.abs(this.calculateScore(item)),
            reason: `${item.traderCount} smart traders exiting, $${formatNumber(Math.abs(item.netflowUsd))} outflow (24h)`,
            metrics: {
              netflow24h: item.netflowUsd,
              netflow7d: item.netflow7d || 0,
              traderCount: item.traderCount,
              marketCap: item.marketCap || 0,
            },
            timestamp: new Date().toISOString(),
          });
        }
        break;
      }

      default: {
        const netflow = await this.getSmartMoneyNetflow({
          chain: params.chain,
          limit: params.limit || 20,
        });

        for (const item of netflow) {
          const isAccumulation = item.netflow > 0;
          signals.push({
            type: isAccumulation ? 'accumulation' : 'distribution',
            token: item.token,
            symbol: item.symbol,
            chain: item.chain,
            score: Math.abs(this.calculateScore(item)),
            reason: `${item.traderCount} smart traders, $${formatNumber(Math.abs(item.netflowUsd))} ${isAccumulation ? 'inflow' : 'outflow'}`,
            metrics: {
              netflow24h: item.netflowUsd,
              netflow7d: item.netflow7d || 0,
              traderCount: item.traderCount,
              marketCap: item.marketCap || 0,
            },
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    return signals.sort((a, b) => b.score - a.score);
  }

  /**
   * Get comprehensive token analysis
   */
  async getTokenAnalysis(params: TokenRequest): Promise<{
    holders: TokenHolder[];
    flows: TokenFlow[];
    recentTrades: DexTrade[];
    whoBoughtSold: { entity: string; label?: string; buyVolumeUsd: number; sellVolumeUsd: number; netVolumeUsd: number; tradeCount: number }[];
  }> {
    const [holders, flows, recentTrades, whoBoughtSold] = await Promise.all([
      this.getTokenHolders({ ...params, limit: 10 }),
      this.getTokenFlows({ ...params, limit: 10 }),
      this.getTokenDexTrades({ ...params, limit: 20 }),
      this.getWhoBoughtSold({ ...params, limit: 10 }),
    ]);

    return { holders, flows, recentTrades, whoBoughtSold };
  }

  private calculateScore(item: SmartMoneyNetflow): number {
    const netflowScore = Math.min(Math.abs(item.netflowUsd) / 50000, 5);
    const traderScore = Math.min(item.traderCount / 5, 3);

    let trendBonus = 0;
    if (item.netflow7d) {
      const sameDirection = (item.netflow > 0 && item.netflow7d > 0) ||
                           (item.netflow < 0 && item.netflow7d < 0);
      trendBonus = sameDirection ? 2 : 0;
    }

    return netflowScore + traderScore + trendBonus;
  }

  /**
   * Get supported chains
   */
  getSupportedChains(): string[] {
    return ['ethereum', 'base', 'arbitrum', 'optimism', 'polygon', 'bsc', 'avalanche', 'solana'];
  }
}

// =============================================================================
// Helpers
// =============================================================================

function getDefaultDateRange(): DateRange {
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  return {
    from: weekAgo.toISOString().split('T')[0],
    to: today.toISOString().split('T')[0],
  };
}

function formatNumber(num: number): string {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}

export function createClient(apiKey?: string): NansenClient {
  return new NansenClient(apiKey);
}
