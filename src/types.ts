// Nansen API Types

export interface NansenConfig {
  apiKey: string;
  baseUrl: string;
}

export type Chain =
  | 'ethereum'
  | 'base'
  | 'arbitrum'
  | 'optimism'
  | 'polygon'
  | 'bsc'
  | 'avalanche'
  | 'solana';

export type WalletLabel =
  | 'smart_money'
  | 'whale'
  | 'exchange'
  | 'public_figure'
  | 'fresh_wallet'
  | 'top_pnl';

export type FlowDirection = 'inflow' | 'outflow' | 'all';

export type ScanMode = 'accumulation' | 'distribution' | 'breakout' | 'fresh-wallets';

export type Timeframe = '1h' | '24h' | '7d' | '30d';

// API Response Types

export interface SmartMoneyNetflow {
  token: string;
  symbol: string;
  name: string;
  chain: Chain;
  netflow: number;
  netflowUsd: number;
  inflow: number;
  inflowUsd: number;
  outflow: number;
  outflowUsd: number;
  buyersCount: number;
  sellersCount: number;
  timestamp: string;
}

export interface TokenScreenerResult {
  token: string;
  symbol: string;
  name: string;
  chain: Chain;
  price: number;
  priceChange24h: number;
  marketCap: number;
  volume24h: number;
  holders: number;
  smartMoneyNetflow: number;
  smartMoneyHolders: number;
  liquidity: number;
}

export interface DexTrade {
  txHash: string;
  token: string;
  symbol: string;
  chain: Chain;
  dex: string;
  side: 'buy' | 'sell';
  amount: number;
  amountUsd: number;
  price: number;
  wallet: string;
  walletLabel?: string;
  timestamp: string;
}

export interface TokenFlow {
  token: string;
  symbol: string;
  chain: Chain;
  label: WalletLabel;
  direction: FlowDirection;
  amount: number;
  amountUsd: number;
  txCount: number;
  uniqueWallets: number;
  timestamp: string;
}

export interface WalletProfile {
  address: string;
  labels: WalletLabel[];
  totalValue: number;
  realizedPnl: number;
  unrealizedPnl: number;
  winRate: number;
  tradesCount: number;
  firstSeen: string;
  lastActive: string;
}

export interface WalletHolding {
  token: string;
  symbol: string;
  chain: Chain;
  balance: number;
  value: number;
  pnl: number;
  pnlPercent: number;
}

export interface WalletTrade {
  txHash: string;
  token: string;
  symbol: string;
  chain: Chain;
  side: 'buy' | 'sell';
  amount: number;
  amountUsd: number;
  price: number;
  pnl?: number;
  timestamp: string;
}

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  chain: Chain;
  decimals: number;
  totalSupply: number;
  price: number;
  marketCap: number;
  holders: number;
  volume24h: number;
  liquidity: number;
}

export interface HolderBreakdown {
  label: WalletLabel;
  count: number;
  percentage: number;
  totalValue: number;
}

export interface OpportunitySignal {
  type: ScanMode;
  token: string;
  symbol: string;
  chain: Chain;
  score: number;
  reason: string;
  metrics: Record<string, number>;
  timestamp: string;
}

// API Request Types

export interface SmartMoneyRequest {
  chain: Chain;
  token?: string;
  direction?: FlowDirection;
  minValue?: number;
  limit?: number;
  timeframe?: Timeframe;
}

export interface TokenScreenerRequest {
  chain: Chain;
  onlySmartMoney?: boolean;
  minHolders?: number;
  maxHolders?: number;
  minVolume?: number;
  maxVolume?: number;
  minMcap?: number;
  maxMcap?: number;
  minNetflow?: number;
  sort?: 'netflow' | 'volume' | 'holders' | 'mcap';
  limit?: number;
}

export interface DexTradesRequest {
  chain: Chain;
  token?: string;
  onlySmartMoney?: boolean;
  dex?: string;
  minValue?: number;
  limit?: number;
}

export interface FlowsRequest {
  chain: Chain;
  token?: string;
  labels: WalletLabel[];
  direction?: FlowDirection;
  timeframe?: Timeframe;
  limit?: number;
}

export interface WalletProfileRequest {
  address: string;
  includeTrades?: boolean;
  includeHoldings?: boolean;
}

export interface TokenAnalysisRequest {
  address: string;
  chain: Chain;
  includeHolders?: boolean;
  includeSmartMoneyHolders?: boolean;
  timeframe?: Timeframe;
}

export interface OpportunityScanRequest {
  chain: Chain;
  mode: ScanMode;
  limit?: number;
}

// API Response Wrappers

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
