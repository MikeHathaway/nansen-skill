#!/usr/bin/env node
/**
 * Nansen API Test Script
 * Tests all documented endpoints to find which ones work
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

// Get date range for last 7 days
const today = new Date();
const weekAgo = new Date(today);
weekAgo.setDate(weekAgo.getDate() - 7);
const DATE_RANGE = {
  from: weekAgo.toISOString().split('T')[0],
  to: today.toISOString().split('T')[0],
};

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
    return { name, endpoint, ok: res.ok, status: res.status, error: data?.message || data?.error, data: res.ok ? data : null };
  } catch (e) {
    return { name, endpoint, ok: false, status: 'ERR', error: e.message };
  }
}

async function main() {
  if (!API_KEY) {
    console.log(JSON.stringify({ error: 'NANSEN_API_KEY not set' }));
    process.exit(1);
  }

  console.log('Testing Nansen API endpoints...\n');
  console.log(`Date range: ${DATE_RANGE.from} to ${DATE_RANGE.to}\n`);

  // Test all documented endpoints with correct params
  const tests = [
    // Smart Money
    ['sm/netflow', '/smart-money/netflow', { chains: ['base'] }],
    ['sm/holdings', '/smart-money/holdings', { chains: ['base'] }],
    ['sm/dex-trades', '/smart-money/dex-trades', { chains: ['base'] }],
    ['sm/historical-holdings', '/smart-money/historical-holdings', { chains: ['base'], date: DATE_RANGE }],
    ['sm/jupiter-dcas', '/smart-money/jupiter-dcas', { chains: ['solana'] }],
    ['sm/perp-trades', '/smart-money/perp-trades', { chains: ['hyperliquid'] }],

    // Token God Mode (chain singular + token_address + date)
    ['tgm/holders', '/tgm/holders', { chain: 'base', token_address: AERO_TOKEN }],
    ['tgm/flows', '/tgm/flows', { chain: 'base', token_address: AERO_TOKEN, date: DATE_RANGE }],
    ['tgm/dex-trades', '/tgm/dex-trades', { chain: 'base', token_address: AERO_TOKEN, date: DATE_RANGE }],
    ['tgm/who-bought-sold', '/tgm/who-bought-sold', { chain: 'base', token_address: AERO_TOKEN, date: DATE_RANGE }],
    ['tgm/flow-intelligence', '/tgm/flow-intelligence', { chain: 'base' }],
    ['tgm/transfers', '/tgm/transfers', { chain: 'base', token_address: AERO_TOKEN, date: DATE_RANGE }],
    ['tgm/pnl-leaderboard', '/tgm/pnl-leaderboard', { chain: 'base', token_address: AERO_TOKEN }],

    // Profiler (chain singular)
    ['prof/current-balance', '/profiler/address/current-balance', { address: VITALIK, chain: 'ethereum' }],
    ['prof/pnl-summary', '/profiler/address/pnl-summary', { address: VITALIK, chain: 'ethereum' }],
    ['prof/transactions', '/profiler/address/transactions', { address: VITALIK, chain: 'ethereum' }],
    ['prof/labels', '/profiler/address/labels', { address: VITALIK, chain: 'ethereum' }],
    ['prof/related-wallets', '/profiler/address/related-wallets', { address: VITALIK, chain: 'ethereum' }],

    // Portfolio
    ['portfolio/defi', '/portfolio/defi-holdings', { address: VITALIK, chains: ['ethereum'] }],
  ];

  const results = [];
  for (const [name, endpoint, body] of tests) {
    const result = await testApi(name, endpoint, body);
    const status = result.ok ? '✓' : '✗';
    const info = result.ok
      ? `${Array.isArray(result.data?.data) ? result.data.data.length + ' items' : 'ok'}`
      : `${result.status} - ${(result.error || 'unknown error').slice(0, 60)}`;
    console.log(`${status} ${name.padEnd(24)} ${info}`);
    results.push(result);
  }

  const passed = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);

  console.log(`\n${'='.repeat(70)}`);
  console.log(`Summary: ${passed.length} passed, ${failed.length} failed\n`);

  if (passed.length > 0) {
    console.log('Working endpoints:');
    for (const r of passed) {
      console.log(`  POST ${r.endpoint}`);
    }
  }

  // Group samples by category
  const samples = {};
  for (const r of passed) {
    if (r.data?.data?.[0] && !samples[r.name.split('/')[0]]) {
      samples[r.name.split('/')[0]] = { name: r.name, data: r.data.data[0] };
    }
  }

  if (Object.keys(samples).length > 0) {
    console.log('\nSample responses:');
    for (const [cat, { name, data }] of Object.entries(samples)) {
      console.log(`\n--- ${name} ---`);
      console.log(JSON.stringify(data, null, 2));
    }
  }

  process.exit(failed.length === results.length ? 1 : 0);
}

main();
