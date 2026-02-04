---
name: nansen-api
description: Trading-focused Nansen skill with intelligence layer - caching, rate limiting, signal persistence, risk filtering. Direct API + 21 MCP tools. Designed for autonomous trading agents.
homepage: https://docs.nansen.ai/mcp/overview
user-invocable: true
metadata: {"openclaw":{"primaryEnv":"NANSEN_API_KEY","requires":{"bins":["node","npx"],"env":["NANSEN_API_KEY"]}}}
---

# Nansen API Skill

> **Trading Intelligence Layer**: Caching, rate limiting, signal persistence, risk filtering

This skill provides a complete trading-focused Nansen integration with:
- **NansenTrader**: High-level trading intelligence with caching, rate limiting, signal logging, and risk filtering
- **Direct API**: Fast programmatic access to all Nansen endpoints
- **MCP**: 21 AI-powered tools for comprehensive analysis

Designed for autonomous trading agents who need to efficiently find and act on opportunities while managing API costs.

## Setup

```bash
cd {baseDir}
npm install
npm run build
export NANSEN_API_KEY=your_key_here
```

Get your API key at: https://app.nansen.ai/api?tab=api

## Tool: nansen-api

### Quick Reference

```bash
# Trading Intelligence (RECOMMENDED for autonomous agents)
node {baseDir}/dist/index.js trader scan --chains ethereum,base --json
node {baseDir}/dist/index.js trader quick --chain base
node {baseDir}/dist/index.js trader deep --chains base --limit 3
node {baseDir}/dist/index.js trader monitor --chains base --interval 30
node {baseDir}/dist/index.js trader analyze --token 0x... --chain base
node {baseDir}/dist/index.js trader stats

# Direct API (fast, no caching)
node {baseDir}/dist/index.js smart-money --chain base --json
node {baseDir}/dist/index.js screen --chain ethereum --smart-money-only
node {baseDir}/dist/index.js scan --chain base --mode accumulation --json
node {baseDir}/dist/index.js dex-trades --chain ethereum --smart-money-only

# MCP (AI-powered)
node {baseDir}/dist/index.js mcp analyze-token --token 0x... --chain ethereum
node {baseDir}/dist/index.js mcp tools  # List all 21 MCP tools

# Combined (API + MCP)
node {baseDir}/dist/index.js find --chains ethereum,base --analyze 3 --json
node {baseDir}/dist/index.js watch --chains base --threshold 100000 --webhook https://...
```

### Trader Commands (Trading Intelligence Layer)

The trader commands provide an intelligence layer on top of the raw API with:
- **Caching**: Saves API credits by caching recent results
- **Rate Limiting**: Prevents API throttling with token bucket algorithm
- **Signal Logging**: Persists signals for performance tracking
- **Risk Filtering**: Quality-focused with configurable thresholds
- **Deduplication**: Prevents duplicate signals within time windows

#### trader scan - Smart Scan with Risk Filtering

```bash
node {baseDir}/dist/index.js trader scan \
  --chains <list>         # Comma-separated (default: ethereum,base,arbitrum)
  --modes <list>          # Comma-separated (default: accumulation)
  --limit <n>             # Max signals (default: 10)
  --analyze               # Include MCP analysis
  --min-score <n>         # Minimum score (default: 2)
  --json
```

Output includes:
- **recommendation**: strong_buy, buy, watch, avoid
- **confidence**: 0-1 confidence score
- **riskScore**: Composite risk score
- **riskFactors**: Reasons for the score
- **suggestedAction**: Action, urgency, position size hint

#### trader quick - Fast Single-Chain Scan

```bash
node {baseDir}/dist/index.js trader quick \
  --chain <chain>         # Required
  --mode <mode>           # Default: accumulation
  --json
```

#### trader deep - Comprehensive Scan with MCP

```bash
node {baseDir}/dist/index.js trader deep \
  --chains <list>
  --modes <list>
  --limit <n>
  --json
```

#### trader monitor - Continuous Monitoring

```bash
node {baseDir}/dist/index.js trader monitor \
  --chains <list>
  --modes <list>
  --interval <sec>        # Scan interval (default: 60)
  --min-score <n>         # Minimum score (default: 3)
  --json
```

#### trader analyze - Token Analysis

```bash
node {baseDir}/dist/index.js trader analyze \
  --token <address>       # Required
  --chain <chain>         # Required
  --json
```

Returns buy/watch/avoid recommendation with confidence and reasoning.

#### trader signals - View Logged Signals

```bash
node {baseDir}/dist/index.js trader signals \
  --limit <n>             # Number of signals (default: 20)
  --token <address>       # Filter by token
  --chain <chain>
  --acted                 # Only acted signals
  --json
```

#### trader mark - Mark Signal as Acted

```bash
node {baseDir}/dist/index.js trader mark \
  --id <signalId>         # Required
  --action <action>       # buy, sell, skip
  --notes <text>
```

#### trader outcome - Record Trade Outcome

```bash
node {baseDir}/dist/index.js trader outcome \
  --id <signalId>
  --entry <price>
  --exit <price>
  --pnl <amount>
  --notes <text>
```

#### trader stats - View Statistics

```bash
node {baseDir}/dist/index.js trader stats --json
```

Shows cache stats, rate limiter stats, signal performance, and breakdowns by chain/mode.

### Direct API Commands

#### smart-money - Track Smart Money Netflow

```bash
node {baseDir}/dist/index.js smart-money \
  --chain <chain>           # Required: ethereum, base, arbitrum, etc.
  --token <address>         # Filter by token
  --direction <dir>         # inflow, outflow, or all (default: all)
  --min-value <usd>         # Minimum USD value
  --timeframe <tf>          # 1h, 24h, 7d, 30d (default: 24h)
  --limit <n>               # Results (default: 20)
  --json                    # Output JSON
```

#### screen - Token Screener

```bash
node {baseDir}/dist/index.js screen \
  --chain <chain>           # Required
  --smart-money-only        # Only tokens with SM activity
  --min-holders <n>
  --max-holders <n>
  --min-volume <usd>
  --max-volume <usd>
  --min-mcap <usd>
  --max-mcap <usd>
  --min-netflow <usd>
  --sort <field>            # netflow, volume, holders, mcap
  --limit <n>
  --json
```

#### scan - Opportunity Scanner

```bash
node {baseDir}/dist/index.js scan \
  --chain <chain>           # Required
  --mode <mode>             # accumulation, distribution, breakout, fresh-wallets
  --limit <n>
  --watch                   # Continuous monitoring
  --interval <sec>          # Watch interval (default: 60)
  --json
```

#### dex-trades - DEX Trade Monitor

```bash
node {baseDir}/dist/index.js dex-trades \
  --chain <chain>           # Required
  --token <address>
  --smart-money-only
  --dex <name>              # uniswap_v3, aerodrome, etc.
  --min-value <usd>
  --limit <n>
  --json
```

#### flows - Token Flows by Category

```bash
node {baseDir}/dist/index.js flows \
  --chain <chain>           # Required
  --token <address>
  --label <label>           # smart_money, whale, exchange
  --labels <list>           # Comma-separated
  --direction <dir>         # inflow, outflow, all
  --timeframe <tf>
  --limit <n>
  --json
```

#### profile - Wallet Analysis

```bash
node {baseDir}/dist/index.js profile \
  --address <addr>          # Required
  --trades                  # Include trade history
  --holdings                # Include holdings
  --labels-only             # Only show labels
  --json
```

#### token - Token Analysis

```bash
node {baseDir}/dist/index.js token \
  --address <addr>          # Required
  --chain <chain>           # Required
  --holders                 # Include holder breakdown
  --smart-money-holders     # Show SM holders
  --json
```

### MCP Commands

#### mcp tool - Call Any MCP Tool

```bash
node {baseDir}/dist/index.js mcp tool \
  --name <tool>             # Tool name (see mcp tools)
  --params <json>           # Parameters as JSON
```

#### mcp analyze-token - Comprehensive Token Analysis

Calls multiple MCP tools: holders, trades, flows, PnL leaderboard

```bash
node {baseDir}/dist/index.js mcp analyze-token \
  --token <address>
  --chain <chain>
```

#### mcp analyze-wallet - Comprehensive Wallet Analysis

Calls multiple MCP tools: portfolio, PnL, transactions, related addresses

```bash
node {baseDir}/dist/index.js mcp analyze-wallet --address 0x...
```

#### mcp search - Free Search

```bash
node {baseDir}/dist/index.js mcp search --query "PEPE token"
```

#### mcp tools - List All Tools

Shows all 21 MCP tools with descriptions and credit costs.

### Combined Commands

#### find - API Scan + MCP Analysis

```bash
node {baseDir}/dist/index.js find \
  --chains <list>           # Comma-separated (default: ethereum,base,arbitrum)
  --modes <list>            # Comma-separated (default: accumulation)
  --limit <n>               # Per chain/mode
  --analyze <n>             # MCP analysis for top N
  --min-score <n>
  --json
```

#### watch - Real-time Monitoring

```bash
node {baseDir}/dist/index.js watch \
  --chains <list>
  --modes <list>
  --threshold <usd>         # Minimum value (default: 50000)
  --interval <sec>          # Scan interval (default: 60)
  --webhook <url>           # Alert webhook
  --json
```

## Programmatic Usage

### NansenTrader (Recommended for Autonomous Agents)

```typescript
import { NansenTrader, createTrader } from '{baseDir}/dist/trader.js';

// Create trader with defaults
const trader = createTrader();

// Or with custom config
const trader = new NansenTrader({
  enableCache: true,
  enableRateLimit: true,
  rateLimitPreset: 'standard', // conservative, standard, aggressive, burst
  enableSignalLog: true,
  riskConfig: {
    minScore: 2.5,
    maxSignalsPerScan: 10,
    dedupeWindowMs: 3600000, // 1 hour
    minSmartMoneyBuyers: 5,
    minNetflowUsd: 25000,
  },
});

// Scan for opportunities (cached, rate-limited, risk-filtered)
const signals = await trader.scan({
  chains: ['ethereum', 'base'],
  modes: ['accumulation'],
  analyze: true, // Include MCP analysis
});

// Process signals
for (const signal of signals) {
  console.log(`${signal.recommendation}: ${signal.symbol}`);
  console.log(`  Confidence: ${signal.confidence}`);
  console.log(`  Risk factors: ${signal.riskFactors.join(', ')}`);

  if (signal.suggestedAction) {
    console.log(`  Action: ${signal.suggestedAction.action}`);
    console.log(`  Urgency: ${signal.suggestedAction.urgency}`);
    console.log(`  Position: ${signal.suggestedAction.positionSizeHint}`);
  }

  // Mark as acted (for tracking)
  trader.markActed(signal.id, 'buy', 'Auto-executed');
}

// Later, record outcome
trader.recordOutcome(signalId, {
  entryPrice: 0.001,
  exitPrice: 0.0015,
});

// Monitor continuously
const stop = trader.monitor(
  { chains: ['base'], intervalMs: 30000 },
  async (signal) => {
    // Handle new signal - connect to execution skill (Bankr, polyclaw)
    console.log('New signal:', signal);
  }
);

// Stop monitoring
stop();

// Get stats
const stats = trader.getStats();
console.log('Cache credits saved:', stats.cache.creditsSaved);
console.log('Win rate:', stats.signals.winRate);
```

### NansenAgent (Lower-Level)

```typescript
import { NansenAgent } from '{baseDir}/dist/agent.js';

const agent = new NansenAgent();

// API - fast, direct
const signals = await agent.api.scanOpportunities({ chain: 'base', mode: 'accumulation' });
const netflow = await agent.api.getSmartMoneyNetflow({ chain: 'ethereum', direction: 'inflow' });

// MCP - comprehensive
const analysis = await agent.mcp.analyzeToken('0x...', 'base');
const walletInfo = await agent.mcp.analyzeWallet('0x...');
const search = await agent.mcp.search('PEPE');

// Combined workflow
const opportunities = await agent.findOpportunities({
  chains: ['ethereum', 'base'],
  modes: ['accumulation', 'breakout'],
  analyzeTop: 3,
});
```

### Direct API & MCP

```typescript
import { NansenClient } from '{baseDir}/dist/api.js';
import { NansenMcp } from '{baseDir}/dist/mcp.js';

// Direct API
const api = new NansenClient();
const tokens = await api.screenTokens({ chain: 'base', onlySmartMoney: true });

// MCP
const mcp = new NansenMcp();
const result = await mcp.callTool('token_dex_trades', { token: '0x...', chain: 'base' });
```

### Utilities

```typescript
import { Cache, CACHE_TTL } from '{baseDir}/dist/cache.js';
import { RateLimiter, RATE_LIMIT_PRESETS } from '{baseDir}/dist/rate-limiter.js';
import { SignalLog } from '{baseDir}/dist/signal-log.js';

// Use independently
const cache = new Cache(60000);
const limiter = new RateLimiter(RATE_LIMIT_PRESETS.aggressive);
const log = new SignalLog('./signals.json');
```

## All 21 MCP Tools

### Smart Money (5 credits each)
| Tool | Description |
|------|-------------|
| `smart_traders_and_funds_token_balances` | Aggregated balances per chain |
| `smart_traders_and_funds_netflows` | Net flows 1/7/30 days |
| `smart_traders_and_funds_dcas_solana` | Jupiter DCA orders |

### Token Analysis (1-5 credits)
| Tool | Credits | Description |
|------|---------|-------------|
| `token_current_top_holders` | 5 | Top 25 holders |
| `token_dex_trades` | 1 | DEX trades + SM filter |
| `token_transfers` | 1 | Token transfers |
| `token_flows` | 1 | Hourly flows by segment |
| `token_pnl_leaderboard` | 5 | PnL rankings |
| `token_who_bought_sold` | 1 | Buy/sell by address |
| `token_jup_dca` | 1 | Jupiter DCA (Solana) |
| `token_recent_flows_summary` | 1 | Flow summary |
| `token_discovery_screener` | 1 | Multi-chain screener |
| `token_ohlcv` | 1 | Price data |

### Wallet Profiler (1-5 credits)
| Tool | Credits | Description |
|------|---------|-------------|
| `address_portfolio` | 1 | Full portfolio + DeFi |
| `wallet_pnl_summary` | 1 | Realized PnL stats |
| `wallet_pnl_for_token` | 1 | Token-specific PnL |
| `address_transactions` | 1 | Recent transactions |
| `address_transactions_for_token` | 1 | Token transfers |
| `address_historical_balances` | 1 | Balance history |
| `address_related_addresses` | 1 | Related wallets |
| `address_counterparties` | 5 | Top counterparties |

### Miscellaneous
| Tool | Credits | Description |
|------|---------|-------------|
| `general_search` | 0 | Search (FREE) |
| `growth_chain_rank` | 1 | Chain rankings |
| `transaction_lookup` | 1 | TX details (EVM) |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NANSEN_API_KEY` | Yes | Your Nansen API key |

## Supported Chains

Ethereum, Base, Arbitrum, Optimism, Polygon, BSC, Avalanche, Solana, Bitcoin, and 15+ more.

## References

- [Nansen MCP Overview](https://docs.nansen.ai/mcp/overview)
- [Connecting to MCP](https://docs.nansen.ai/mcp/connecting)
- [MCP Tools Reference](https://docs.nansen.ai/mcp/tools)
- [Nansen API Documentation](https://docs.nansen.ai/)
