import type {
  NansenConfig,
  Chain,
  WalletLabel,
  Timeframe,
  SmartMoneyNetflow,
  TokenScreenerResult,
  DexTrade,
  TokenFlow,
  WalletProfile,
  WalletHolding,
  WalletTrade,
  TokenInfo,
  HolderBreakdown,
  OpportunitySignal,
  SmartMoneyRequest,
  TokenScreenerRequest,
  DexTradesRequest,
  FlowsRequest,
  WalletProfileRequest,
  TokenAnalysisRequest,
  OpportunityScanRequest,
  ApiResponse,
  ApiError,
  ScanMode,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.nansen.ai/api/v1';

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
    method: 'GET' | 'POST' = 'GET',
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

    if (body) {
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

  // Smart Money Endpoints

  async getSmartMoneyNetflow(
    params: SmartMoneyRequest
  ): Promise<SmartMoneyNetflow[]> {
    const body: Record<string, unknown> = {
      chain: params.chain,
      limit: params.limit || 50,
    };

    if (params.token) body.token = params.token;
    if (params.timeframe) body.timeframe = params.timeframe;

    const response = await this.request<ApiResponse<SmartMoneyNetflow[]>>(
      '/smart-money/netflow',
      'POST',
      body
    );

    let data = response.data || [];

    // Filter by direction
    if (params.direction === 'inflow') {
      data = data.filter((d) => d.netflow > 0);
    } else if (params.direction === 'outflow') {
      data = data.filter((d) => d.netflow < 0);
    }

    // Filter by minimum value
    if (params.minValue) {
      data = data.filter((d) => Math.abs(d.netflowUsd) >= params.minValue!);
    }

    return data;
  }

  // Token Screener

  async screenTokens(params: TokenScreenerRequest): Promise<TokenScreenerResult[]> {
    const body: Record<string, unknown> = {
      chain: params.chain,
      limit: params.limit || 50,
    };

    if (params.onlySmartMoney) body.onlySmartMoney = true;
    if (params.minHolders) body.minHolders = params.minHolders;
    if (params.maxHolders) body.maxHolders = params.maxHolders;
    if (params.minVolume) body.minVolume = params.minVolume;
    if (params.maxVolume) body.maxVolume = params.maxVolume;
    if (params.minMcap) body.minMarketCap = params.minMcap;
    if (params.maxMcap) body.maxMarketCap = params.maxMcap;
    if (params.sort) body.sortBy = params.sort;

    const response = await this.request<ApiResponse<TokenScreenerResult[]>>(
      '/token-screener',
      'POST',
      body
    );

    let data = response.data || [];

    // Additional filter for minNetflow (may not be in API)
    if (params.minNetflow) {
      data = data.filter((d) => d.smartMoneyNetflow >= params.minNetflow!);
    }

    return data;
  }

  // DEX Trades

  async getDexTrades(params: DexTradesRequest): Promise<DexTrade[]> {
    const body: Record<string, unknown> = {
      chain: params.chain,
      limit: params.limit || 50,
    };

    if (params.token) body.token = params.token;
    if (params.onlySmartMoney) body.onlySmartMoney = true;
    if (params.dex) body.dex = params.dex;

    const response = await this.request<ApiResponse<DexTrade[]>>(
      '/tgm/dex-trades',
      'POST',
      body
    );

    let data = response.data || [];

    // Filter by minimum value
    if (params.minValue) {
      data = data.filter((d) => d.amountUsd >= params.minValue!);
    }

    return data;
  }

  // Flows

  async getFlows(params: FlowsRequest): Promise<TokenFlow[]> {
    const body: Record<string, unknown> = {
      chain: params.chain,
      labels: params.labels,
      limit: params.limit || 50,
    };

    if (params.token) body.token = params.token;
    if (params.timeframe) body.timeframe = params.timeframe;

    const response = await this.request<ApiResponse<TokenFlow[]>>(
      '/flows',
      'POST',
      body
    );

    let data = response.data || [];

    // Filter by direction
    if (params.direction && params.direction !== 'all') {
      data = data.filter((d) => d.direction === params.direction);
    }

    return data;
  }

  // Wallet Profile

  async getWalletProfile(params: WalletProfileRequest): Promise<WalletProfile> {
    const body: Record<string, unknown> = {
      address: params.address,
    };

    const response = await this.request<ApiResponse<WalletProfile>>(
      '/profiler/wallet',
      'POST',
      body
    );

    return response.data;
  }

  async getWalletHoldings(address: string): Promise<WalletHolding[]> {
    const response = await this.request<ApiResponse<WalletHolding[]>>(
      '/profiler/holdings',
      'POST',
      { address }
    );

    return response.data || [];
  }

  async getWalletTrades(address: string, limit = 50): Promise<WalletTrade[]> {
    const response = await this.request<ApiResponse<WalletTrade[]>>(
      '/profiler/trades',
      'POST',
      { address, limit }
    );

    return response.data || [];
  }

  async getWalletLabels(address: string): Promise<WalletLabel[]> {
    const profile = await this.getWalletProfile({ address });
    return profile.labels || [];
  }

  // Token Analysis

  async getTokenInfo(params: TokenAnalysisRequest): Promise<TokenInfo> {
    const response = await this.request<ApiResponse<TokenInfo>>(
      '/tgm/token',
      'POST',
      {
        token: params.address,
        chain: params.chain,
      }
    );

    return response.data;
  }

  async getTokenHolders(
    address: string,
    chain: Chain
  ): Promise<HolderBreakdown[]> {
    const response = await this.request<ApiResponse<HolderBreakdown[]>>(
      '/tgm/holders',
      'POST',
      { token: address, chain }
    );

    return response.data || [];
  }

  async getSmartMoneyHolders(address: string, chain: Chain): Promise<WalletProfile[]> {
    const response = await this.request<ApiResponse<WalletProfile[]>>(
      '/tgm/smart-money-holders',
      'POST',
      { token: address, chain }
    );

    return response.data || [];
  }

  // Opportunity Scanner

  async scanOpportunities(
    params: OpportunityScanRequest
  ): Promise<OpportunitySignal[]> {
    const signals: OpportunitySignal[] = [];

    switch (params.mode) {
      case 'accumulation': {
        // Look for tokens with positive smart money netflow
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
            chain: params.chain,
            score: this.calculateAccumulationScore(item),
            reason: `${item.buyersCount} smart money wallets accumulating, $${formatNumber(item.netflowUsd)} net inflow`,
            metrics: {
              netflow24h: item.netflowUsd,
              priceChange24h: 0, // Would need separate call
              volumeChange24h: 0,
              smartMoneyHolders: item.buyersCount,
            },
            timestamp: new Date().toISOString(),
          });
        }
        break;
      }

      case 'distribution': {
        // Look for tokens with negative smart money netflow
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
            chain: params.chain,
            score: Math.abs(this.calculateAccumulationScore(item)),
            reason: `${item.sellersCount} smart money wallets distributing, $${formatNumber(Math.abs(item.netflowUsd))} net outflow`,
            metrics: {
              netflow24h: item.netflowUsd,
              priceChange24h: 0,
              volumeChange24h: 0,
              smartMoneyHolders: item.sellersCount,
            },
            timestamp: new Date().toISOString(),
          });
        }
        break;
      }

      case 'breakout': {
        // Look for tokens with both accumulation and volume surge
        const tokens = await this.screenTokens({
          chain: params.chain,
          onlySmartMoney: true,
          sort: 'volume',
          limit: params.limit || 20,
        });

        for (const item of tokens) {
          if (item.smartMoneyNetflow > 0 && item.priceChange24h > 5) {
            signals.push({
              type: 'breakout',
              token: item.token,
              symbol: item.symbol,
              chain: params.chain,
              score: (item.priceChange24h / 10) + (item.smartMoneyNetflow / 100000),
              reason: `${item.priceChange24h.toFixed(1)}% price gain with $${formatNumber(item.smartMoneyNetflow)} smart money inflow`,
              metrics: {
                netflow24h: item.smartMoneyNetflow,
                priceChange24h: item.priceChange24h,
                volumeChange24h: 0,
                smartMoneyHolders: item.smartMoneyHolders,
              },
              timestamp: new Date().toISOString(),
            });
          }
        }
        break;
      }

      case 'fresh-wallets': {
        // Look for fresh wallet activity (potential insider signals)
        const flows = await this.getFlows({
          chain: params.chain,
          labels: ['fresh_wallet'],
          direction: 'inflow',
          limit: params.limit || 20,
        });

        for (const item of flows) {
          signals.push({
            type: 'fresh-wallets',
            token: item.token,
            symbol: item.symbol,
            chain: params.chain,
            score: item.uniqueWallets * (item.amountUsd / 10000),
            reason: `${item.uniqueWallets} fresh wallets accumulated $${formatNumber(item.amountUsd)}`,
            metrics: {
              netflow24h: item.amountUsd,
              priceChange24h: 0,
              volumeChange24h: 0,
              smartMoneyHolders: item.uniqueWallets,
            },
            timestamp: new Date().toISOString(),
          });
        }
        break;
      }
    }

    // Sort by score descending
    return signals.sort((a, b) => b.score - a.score);
  }

  private calculateAccumulationScore(item: SmartMoneyNetflow): number {
    // Score based on netflow value and buyer/seller ratio
    const valueScore = Math.min(item.netflowUsd / 100000, 10);
    const ratioScore = item.buyersCount / (item.sellersCount || 1);
    return valueScore * Math.min(ratioScore, 3);
  }

  // Utility: Get supported chains
  async getSupportedChains(): Promise<string[]> {
    const response = await this.request<ApiResponse<string[]>>(
      '/chains',
      'GET'
    );
    return response.data || [];
  }
}

// Helper function
function formatNumber(num: number): string {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}

// Export a default client factory
export function createClient(apiKey?: string): NansenClient {
  return new NansenClient(apiKey);
}
