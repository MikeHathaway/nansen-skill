#!/usr/bin/env node
/**
 * Nansen API + MCP Test Script
 * Tests both Direct API and MCP HTTP endpoints
 * Run: npm run test:api
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env
try {
  const envContent = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
  for (const line of envContent.split('\n')) {
    const [key, ...val] = line.split('=');
    if (key && val.length) process.env[key.trim()] = val.join('=').trim();
  }
} catch (e) {}

const API_KEY = process.env.NANSEN_API_KEY;
const BASE_URL = 'https://api.nansen.ai/api/v1';
const MCP_URL = 'https://mcp.nansen.ai/ra/mcp';

// Test addresses
const AERO_TOKEN = '0x940181a94a35a4569e4529a3cdfb74e38fd98631';  // AERO on Base
const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

async function testApi(name, endpoint, body) {
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'apiKey': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return { name, type: 'api', ok: res.ok, status: res.status, error: data?.message || data?.error, data: res.ok ? data : null };
  } catch (e) {
    return { name, type: 'api', ok: false, status: 'ERR', error: e.message };
  }
}

async function testMcp(name, tool, args) {
  try {
    const res = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'NANSEN-API-KEY': API_KEY,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: tool, arguments: args },
      }),
    });
    const data = await res.json().catch(() => null);
    const hasError = !res.ok || data?.error || data?.result?.isError;
    return {
      name,
      type: 'mcp',
      ok: !hasError,
      status: res.status,
      error: data?.error?.message || (data?.result?.isError ? 'Tool error' : null),
      data: hasError ? null : data?.result,
    };
  } catch (e) {
    return { name, type: 'mcp', ok: false, status: 'ERR', error: e.message };
  }
}

async function main() {
  if (!API_KEY) {
    console.log(JSON.stringify({ error: 'NANSEN_API_KEY not set' }));
    process.exit(1);
  }

  console.log('Testing Nansen API + MCP...\n');

  // ========== Direct API Tests ==========
  console.log('━━━ Direct API ━━━\n');

  const apiTests = [
    ['sm/netflow', '/smart-money/netflow', { chains: ['base'] }],
    ['sm/holdings', '/smart-money/holdings', { chains: ['base'] }],
    ['sm/dex-trades', '/smart-money/dex-trades', { chains: ['base'] }],
    ['tgm/holders', '/tgm/holders', { chain: 'base', token_address: AERO_TOKEN }],
    ['prof/balance', '/profiler/address/current-balance', { address: VITALIK, chain: 'ethereum' }],
    ['prof/related', '/profiler/address/related-wallets', { address: VITALIK, chain: 'ethereum' }],
  ];

  const apiResults = [];
  for (const [name, endpoint, body] of apiTests) {
    const result = await testApi(name, endpoint, body);
    const status = result.ok ? '✓' : '✗';
    const info = result.ok
      ? `${Array.isArray(result.data?.data) ? result.data.data.length + ' items' : 'ok'}`
      : `${result.status} - ${(result.error || 'error').slice(0, 50)}`;
    console.log(`${status} API ${name.padEnd(16)} ${info}`);
    apiResults.push(result);
  }

  // ========== MCP Tests ==========
  console.log('\n━━━ MCP (HTTP) ━━━\n');

  const mcpTests = [
    ['search', 'general_search', { query: 'AERO base' }],
    ['screener', 'token_discovery_screener', { chains: ['base'] }],
    ['sm/balances', 'smart_traders_and_funds_token_balances', { chains: ['base'] }],
    ['holders', 'token_current_top_holders', { token: AERO_TOKEN, chain: 'base' }],
    ['wallet/pnl', 'wallet_pnl_summary', { address: VITALIK }],
    ['wallet/portfolio', 'address_portfolio', { address: VITALIK }],
  ];

  const mcpResults = [];
  for (const [name, tool, args] of mcpTests) {
    const result = await testMcp(name, tool, args);
    const status = result.ok ? '✓' : '✗';
    const info = result.ok
      ? 'ok'
      : `${result.status} - ${(result.error || 'error').slice(0, 50)}`;
    console.log(`${status} MCP ${name.padEnd(16)} ${info}`);
    mcpResults.push(result);
  }

  // ========== Summary ==========
  const allResults = [...apiResults, ...mcpResults];
  const passed = allResults.filter(r => r.ok);
  const failed = allResults.filter(r => !r.ok);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Summary: ${passed.length} passed, ${failed.length} failed`);
  console.log(`  API: ${apiResults.filter(r => r.ok).length}/${apiResults.length}`);
  console.log(`  MCP: ${mcpResults.filter(r => r.ok).length}/${mcpResults.length}`);

  // Show sample MCP response
  const mcpOk = mcpResults.find(r => r.ok && r.data?.content);
  if (mcpOk) {
    console.log(`\nSample MCP response (${mcpOk.name}):`);
    const text = mcpOk.data.content?.find(c => c.type === 'text')?.text;
    if (text) {
      console.log(text.slice(0, 500) + (text.length > 500 ? '...' : ''));
    }
  }

  process.exit(failed.length === allResults.length ? 1 : 0);
}

main();
