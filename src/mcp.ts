/**
 * Nansen MCP Client
 * Programmatic access to Nansen MCP for AI-assisted analysis
 *
 * MCP Endpoint: https://mcp.nansen.ai/ra/mcp
 * Docs: https://docs.nansen.ai/mcp/overview
 */

import { spawn } from 'child_process';
import type { Chain } from './types.js';

const MCP_ENDPOINT = 'https://mcp.nansen.ai/ra/mcp';

export class NansenMcpError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = 'NansenMcpError';
  }
}

export type McpTool =
  // Smart Money
  | 'smart_traders_and_funds_token_balances'
  | 'smart_traders_and_funds_netflows'
  | 'smart_traders_and_funds_dcas_solana'
  // Token God Mode
  | 'token_current_top_holders'
  | 'token_dex_trades'
  | 'token_transfers'
  | 'token_flows'
  | 'token_pnl_leaderboard'
  | 'token_who_bought_sold'
  | 'token_jup_dca'
  | 'token_recent_flows_summary'
  | 'token_discovery_screener'
  | 'token_ohlcv'
  // Wallet Profiler
  | 'address_historical_balances'
  | 'address_related_addresses'
  | 'address_counterparties'
  | 'address_transactions'
  | 'wallet_pnl_for_token'
  | 'wallet_pnl_summary'
  | 'address_transactions_for_token'
  | 'address_portfolio'
  // Misc
  | 'general_search'
  | 'growth_chain_rank'
  | 'transaction_lookup';

export const MCP_TOOLS: Record<McpTool, { description: string; credits: number }> = {
  smart_traders_and_funds_token_balances: { description: 'Aggregated smart trader/fund balances per chain', credits: 5 },
  smart_traders_and_funds_netflows: { description: 'Net flows over 1/7/30 days', credits: 5 },
  smart_traders_and_funds_dcas_solana: { description: 'Jupiter DCA orders on Solana', credits: 5 },
  token_current_top_holders: { description: 'Top 25 holders for a token', credits: 5 },
  token_dex_trades: { description: 'DEX trades with smart money filter', credits: 1 },
  token_transfers: { description: 'Token transfers (25 per page)', credits: 1 },
  token_flows: { description: 'Hourly flows by segment', credits: 1 },
  token_pnl_leaderboard: { description: 'Trader PnL rankings', credits: 5 },
  token_who_bought_sold: { description: 'Buy/sell amounts by address', credits: 1 },
  token_jup_dca: { description: 'Jupiter DCA for Solana tokens', credits: 1 },
  token_recent_flows_summary: { description: 'Flow summary per segment', credits: 1 },
  token_discovery_screener: { description: 'Multi-chain screener', credits: 1 },
  token_ohlcv: { description: 'Price data with intervals', credits: 1 },
  address_historical_balances: { description: 'Historical balances', credits: 1 },
  address_related_addresses: { description: 'Funders, signers, contracts', credits: 1 },
  address_counterparties: { description: 'Top 25 counterparties', credits: 5 },
  address_transactions: { description: 'Recent transactions (20 per page)', credits: 1 },
  wallet_pnl_for_token: { description: 'PnL for specific tokens', credits: 1 },
  wallet_pnl_summary: { description: 'Aggregate realized PnL', credits: 1 },
  address_transactions_for_token: { description: 'Token transfer history', credits: 1 },
  address_portfolio: { description: 'Full portfolio + DeFi positions', credits: 1 },
  general_search: { description: 'Search tokens/entities/addresses', credits: 0 },
  growth_chain_rank: { description: 'Chain activity rankings', credits: 1 },
  transaction_lookup: { description: 'Transaction details (EVM)', credits: 1 },
};

export class NansenMcp {
  private apiKey: string;
  private mcpEndpoint: string;

  constructor(apiKey: string, mcpEndpoint?: string) {
    this.apiKey = apiKey;
    this.mcpEndpoint = mcpEndpoint || MCP_ENDPOINT;
  }

  async callTool<T = unknown>(tool: McpTool, params: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      const args = [
        '-y', 'mcp-remote',
        this.mcpEndpoint,
        '--header', `NANSEN-API-KEY:${this.apiKey}`,
        '--allow-http',
        '--tool', tool,
        '--input', JSON.stringify(params),
      ];

      const proc = spawn('npx', args, { stdio: ['pipe', 'pipe', 'pipe'] });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
      proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

      proc.on('close', (code: number) => {
        if (code === 0 && stdout.trim()) {
          try {
            resolve(JSON.parse(stdout));
          } catch {
            resolve(stdout.trim() as unknown as T);
          }
        } else {
          reject(new NansenMcpError(`MCP tool call failed: ${stderr || 'Unknown error'}`, { code, stdout, stderr }));
        }
      });

      proc.on('error', (err: Error) => {
        reject(new NansenMcpError(`Failed to spawn MCP process: ${err.message}`));
      });

      setTimeout(() => {
        proc.kill();
        reject(new NansenMcpError('MCP tool call timed out'));
      }, 30000);
    });
  }

  // Smart Money
  async getSmartTraderBalances(chain: Chain) {
    return this.callTool('smart_traders_and_funds_token_balances', { chain });
  }

  async getSmartTraderNetflows(chain: Chain) {
    return this.callTool('smart_traders_and_funds_netflows', { chain });
  }

  async getSolanaDcaOrders(token?: string) {
    return this.callTool('smart_traders_and_funds_dcas_solana', token ? { token } : {});
  }

  // Token Analysis
  async getTokenHolders(token: string, chain: Chain, limit = 25) {
    return this.callTool('token_current_top_holders', { token, chain, limit });
  }

  async getTokenDexTrades(token: string, chain: Chain, onlySmartMoney = false) {
    return this.callTool('token_dex_trades', { token, chain, only_smart_money: onlySmartMoney });
  }

  async getTokenFlows(token: string, chain: Chain, startDate?: string, endDate?: string) {
    const params: Record<string, unknown> = { token, chain };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    return this.callTool('token_flows', params);
  }

  async getTokenPnlLeaderboard(token: string, chain: Chain) {
    return this.callTool('token_pnl_leaderboard', { token, chain });
  }

  async screenTokens(chain?: Chain) {
    return this.callTool('token_discovery_screener', chain ? { chain } : {});
  }

  async getTokenOhlcv(token: string, chain: Chain) {
    return this.callTool('token_ohlcv', { token, chain });
  }

  // Wallet Profiler
  async getWalletPortfolio(address: string) {
    return this.callTool('address_portfolio', { address });
  }

  async getWalletPnlSummary(address: string) {
    return this.callTool('wallet_pnl_summary', { address });
  }

  async getWalletPnlForToken(address: string, token: string, chain: Chain) {
    return this.callTool('wallet_pnl_for_token', { address, token, chain });
  }

  async getAddressTransactions(address: string, page = 1) {
    return this.callTool('address_transactions', { address, page });
  }

  async getRelatedAddresses(address: string) {
    return this.callTool('address_related_addresses', { address });
  }

  async getCounterparties(address: string) {
    return this.callTool('address_counterparties', { address });
  }

  // Misc
  async search(query: string) {
    return this.callTool('general_search', { query });
  }

  async getChainRankings() {
    return this.callTool('growth_chain_rank', {});
  }

  async lookupTransaction(txHash: string, chain: Chain) {
    return this.callTool('transaction_lookup', { tx_hash: txHash, chain });
  }

  // Comprehensive Analysis
  async analyzeToken(token: string, chain: Chain): Promise<{
    holders?: unknown;
    trades?: unknown;
    flows?: unknown;
    pnl?: unknown;
    errors: string[];
  }> {
    const result: { holders?: unknown; trades?: unknown; flows?: unknown; pnl?: unknown; errors: string[] } = { errors: [] };

    try { result.holders = await this.getTokenHolders(token, chain); } catch (e) { result.errors.push(`holders: ${(e as Error).message}`); }
    try { result.trades = await this.getTokenDexTrades(token, chain, true); } catch (e) { result.errors.push(`trades: ${(e as Error).message}`); }
    try { result.flows = await this.getTokenFlows(token, chain); } catch (e) { result.errors.push(`flows: ${(e as Error).message}`); }
    try { result.pnl = await this.getTokenPnlLeaderboard(token, chain); } catch (e) { result.errors.push(`pnl: ${(e as Error).message}`); }

    return result;
  }

  async analyzeWallet(address: string): Promise<{
    portfolio?: unknown;
    pnl?: unknown;
    transactions?: unknown;
    related?: unknown;
    errors: string[];
  }> {
    const result: { portfolio?: unknown; pnl?: unknown; transactions?: unknown; related?: unknown; errors: string[] } = { errors: [] };

    try { result.portfolio = await this.getWalletPortfolio(address); } catch (e) { result.errors.push(`portfolio: ${(e as Error).message}`); }
    try { result.pnl = await this.getWalletPnlSummary(address); } catch (e) { result.errors.push(`pnl: ${(e as Error).message}`); }
    try { result.transactions = await this.getAddressTransactions(address); } catch (e) { result.errors.push(`transactions: ${(e as Error).message}`); }
    try { result.related = await this.getRelatedAddresses(address); } catch (e) { result.errors.push(`related: ${(e as Error).message}`); }

    return result;
  }

  getToolCredits(tool: McpTool): number {
    return MCP_TOOLS[tool]?.credits ?? 1;
  }

  listTools() {
    return Object.entries(MCP_TOOLS).map(([name, info]) => ({ name: name as McpTool, ...info }));
  }
}

export function createMcp(apiKey?: string): NansenMcp {
  const key = apiKey || process.env.NANSEN_API_KEY;
  if (!key) throw new Error('NANSEN_API_KEY is required');
  return new NansenMcp(key);
}
