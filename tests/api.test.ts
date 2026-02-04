import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NansenClient, NansenApiError } from '../src/api.js';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('NansenClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NANSEN_API_KEY = 'test-api-key';
  });

  describe('constructor', () => {
    it('should throw if no API key provided', () => {
      delete process.env.NANSEN_API_KEY;
      expect(() => new NansenClient()).toThrow('NANSEN_API_KEY is required');
    });

    it('should create client with API key from env', () => {
      const client = new NansenClient();
      expect(client).toBeInstanceOf(NansenClient);
    });

    it('should create client with provided API key', () => {
      delete process.env.NANSEN_API_KEY;
      const client = new NansenClient('my-key');
      expect(client).toBeInstanceOf(NansenClient);
    });
  });

  describe('getSmartMoneyNetflow', () => {
    it('should fetch and normalize smart money data', async () => {
      // Raw API response format
      const mockData = {
        data: [
          {
            token_address: '0x123',
            token_symbol: 'TEST',
            chain: 'base',
            net_flow_1h_usd: 1000,
            net_flow_24h_usd: 50000,
            net_flow_7d_usd: 100000,
            net_flow_30d_usd: 200000,
            trader_count: 10,
            token_age_days: 30,
            market_cap_usd: 5000000,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const client = new NansenClient();
      const result = await client.getSmartMoneyNetflow({ chain: 'base' });

      expect(result).toHaveLength(1);
      // Check normalization
      expect(result[0].token).toBe('0x123');
      expect(result[0].symbol).toBe('TEST');
      expect(result[0].netflowUsd).toBe(50000);
      expect(result[0].netflow7d).toBe(100000);
      expect(result[0].traderCount).toBe(10);
      expect(result[0].marketCap).toBe(5000000);

      // Check API call uses chains array
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.nansen.ai/api/v1/smart-money/netflow',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ chains: ['base'] }),
        })
      );
    });

    it('should filter by direction=inflow', async () => {
      const mockData = {
        data: [
          { token_address: '0x1', token_symbol: 'A', chain: 'base', net_flow_24h_usd: 100, trader_count: 1 },
          { token_address: '0x2', token_symbol: 'B', chain: 'base', net_flow_24h_usd: -50, trader_count: 1 },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const client = new NansenClient();
      const result = await client.getSmartMoneyNetflow({
        chain: 'base',
        direction: 'inflow',
      });

      expect(result).toHaveLength(1);
      expect(result[0].netflow).toBeGreaterThan(0);
    });

    it('should filter by direction=outflow', async () => {
      const mockData = {
        data: [
          { token_address: '0x1', token_symbol: 'A', chain: 'base', net_flow_24h_usd: 100, trader_count: 1 },
          { token_address: '0x2', token_symbol: 'B', chain: 'base', net_flow_24h_usd: -50, trader_count: 1 },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const client = new NansenClient();
      const result = await client.getSmartMoneyNetflow({
        chain: 'base',
        direction: 'outflow',
      });

      expect(result).toHaveLength(1);
      expect(result[0].netflow).toBeLessThan(0);
    });

    it('should filter by minimum value', async () => {
      const mockData = {
        data: [
          { token_address: '0x1', token_symbol: 'A', chain: 'base', net_flow_24h_usd: 100000, trader_count: 1 },
          { token_address: '0x2', token_symbol: 'B', chain: 'base', net_flow_24h_usd: 5000, trader_count: 1 },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const client = new NansenClient();
      const result = await client.getSmartMoneyNetflow({
        chain: 'base',
        minValue: 50000,
      });

      expect(result).toHaveLength(1);
      expect(result[0].netflowUsd).toBe(100000);
    });

    it('should apply limit', async () => {
      const mockData = {
        data: [
          { token_address: '0x1', token_symbol: 'A', chain: 'base', net_flow_24h_usd: 100, trader_count: 1 },
          { token_address: '0x2', token_symbol: 'B', chain: 'base', net_flow_24h_usd: 200, trader_count: 1 },
          { token_address: '0x3', token_symbol: 'C', chain: 'base', net_flow_24h_usd: 300, trader_count: 1 },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const client = new NansenClient();
      const result = await client.getSmartMoneyNetflow({
        chain: 'base',
        limit: 2,
      });

      expect(result).toHaveLength(2);
    });
  });

  describe('new endpoints', () => {
    it('getSmartMoneyHoldings should fetch holdings data', async () => {
      const mockData = {
        data: [
          {
            token_address: '0x123',
            token_symbol: 'TEST',
            chain: 'base',
            holder_count: 50,
            total_balance_usd: 1000000,
            balance_change_24h_usd: 50000,
            balance_change_7d_usd: 100000,
            market_cap_usd: 5000000,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const client = new NansenClient();
      const result = await client.getSmartMoneyHoldings({ chain: 'base' });

      expect(result).toHaveLength(1);
      expect(result[0].token).toBe('0x123');
      expect(result[0].holderCount).toBe(50);
      expect(result[0].totalBalanceUsd).toBe(1000000);
    });

    it('getTokenHolders should fetch token holders', async () => {
      const mockData = {
        data: [
          {
            address: '0xabc',
            address_label: 'Whale',
            token_amount: 1000000,
            value_usd: 500000,
            ownership_percentage: 0.05,
            balance_change_24h: 1000,
            balance_change_7d: 5000,
            balance_change_30d: 10000,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const client = new NansenClient();
      const result = await client.getTokenHolders({ chain: 'base', tokenAddress: '0x123' });

      expect(result).toHaveLength(1);
      expect(result[0].address).toBe('0xabc');
      expect(result[0].label).toBe('Whale');
      expect(result[0].ownershipPercent).toBe(5); // 0.05 * 100
    });

    it('getWalletBalances should fetch wallet balances', async () => {
      const mockData = {
        data: [
          {
            chain: 'ethereum',
            address: '0x123',
            token_address: '0xtoken',
            token_symbol: 'ETH',
            token_name: 'Ethereum',
            token_amount: 10,
            price_usd: 2000,
            value_usd: 20000,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const client = new NansenClient();
      const result = await client.getWalletBalances({ address: '0x123', chain: 'ethereum' });

      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('ETH');
      expect(result[0].valueUsd).toBe(20000);
    });
  });

  describe('error handling', () => {
    it('should throw NansenApiError on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          code: 'UNAUTHORIZED',
          message: 'Invalid API key',
        }),
      });

      const client = new NansenClient();

      await expect(client.getSmartMoneyNetflow({ chain: 'base' }))
        .rejects.toThrow(NansenApiError);
    });

    it('should handle non-JSON error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      const client = new NansenClient();

      await expect(client.getSmartMoneyNetflow({ chain: 'base' }))
        .rejects.toThrow(NansenApiError);
    });
  });

  describe('scanOpportunities', () => {
    it('should scan for accumulation signals', async () => {
      const mockData = {
        data: [
          {
            token_address: '0x123',
            token_symbol: 'ALPHA',
            chain: 'base',
            net_flow_24h_usd: 100000,
            net_flow_7d_usd: 200000,
            trader_count: 15,
            market_cap_usd: 5000000,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const client = new NansenClient();
      const result = await client.scanOpportunities({
        chain: 'base',
        mode: 'accumulation',
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('accumulation');
      expect(result[0].token).toBe('0x123');
      expect(result[0].symbol).toBe('ALPHA');
      expect(result[0].score).toBeGreaterThan(0);
      expect(result[0].metrics.netflow24h).toBe(100000);
    });

    it('should scan for distribution signals', async () => {
      const mockData = {
        data: [
          {
            token_address: '0x456',
            token_symbol: 'BETA',
            chain: 'base',
            net_flow_24h_usd: -75000,
            net_flow_7d_usd: -150000,
            trader_count: 10,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const client = new NansenClient();
      const result = await client.scanOpportunities({
        chain: 'base',
        mode: 'distribution',
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('distribution');
      expect(result[0].metrics.netflow24h).toBe(-75000);
    });
  });

  describe('getSupportedChains', () => {
    it('should return hardcoded chain list', () => {
      const client = new NansenClient();
      const chains = client.getSupportedChains();

      expect(chains).toContain('ethereum');
      expect(chains).toContain('base');
      expect(chains).toContain('solana');
    });
  });
});
