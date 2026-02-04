#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import { NansenClient, NansenApiError } from './api.js';
import { NansenMcp, NansenMcpError, MCP_TOOLS, type McpTool } from './mcp.js';
import { NansenAgent } from './agent.js';
import { NansenTrader, type TradingSignal } from './trader.js';
import type {
  Chain,
  ScanMode,
  FlowDirection,
} from './types.js';

const program = new Command();

let client: NansenClient;

function getClient(): NansenClient {
  if (!client) {
    try {
      client = new NansenClient();
    } catch (error: any) {
      console.error(chalk.red(error.message));
      console.log('\nSet your API key:');
      console.log('  export NANSEN_API_KEY=your_key_here');
      process.exit(1);
    }
  }
  return client;
}

function formatNumber(num: number): string {
  if (Math.abs(num) >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (Math.abs(num) >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}

function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function handleError(error: any): never {
  if (error instanceof NansenApiError) {
    console.error(chalk.red(`API Error [${error.code}]: ${error.message}`));
    if (error.details) {
      console.error(chalk.dim(JSON.stringify(error.details, null, 2)));
    }
  } else {
    console.error(chalk.red(`Error: ${error.message}`));
  }
  process.exit(1);
}

program
  .name('nansen')
  .description('Nansen trading intelligence CLI')
  .version('1.0.0');

// =============================================================================
// Streamlined Commands (JSON-first)
// =============================================================================

program
  .command('hot <chain>')
  .description('Top tokens by smart money flow on a chain')
  .option('-l, --limit <n>', 'Number of results', parseInt, 10)
  .option('--pretty', 'Pretty print output')
  .action(async (chain: Chain, options) => {
    try {
      const netflow = await getClient().getSmartMoneyNetflow({
        chain,
        direction: 'inflow',
        limit: options.limit,
      });

      const result = {
        chain,
        timestamp: new Date().toISOString(),
        count: netflow.length,
        hotTokens: netflow.map(t => ({
          token: t.token,
          symbol: t.symbol,
          netflowUsd: t.netflowUsd,
          netflow7d: t.netflow7d,
          traderCount: t.traderCount,
          marketCap: t.marketCap,
          signal: t.netflow > 0 && t.netflow7d && t.netflow7d > 0 ? 'strong_accumulation' :
                  t.netflow > 0 ? 'accumulation' : 'mixed',
        })),
      };

      console.log(JSON.stringify(result, null, options.pretty ? 2 : 0));
    } catch (error: any) {
      console.log(JSON.stringify({ error: error.message }));
      process.exit(1);
    }
  });

program
  .command('token <address>')
  .description('Token summary: holders, flows, trades')
  .requiredOption('-c, --chain <chain>', 'Chain (ethereum, base, arbitrum, etc.)')
  .option('--pretty', 'Pretty print output')
  .action(async (address: string, options) => {
    try {
      const analysis = await getClient().getTokenAnalysis({
        chain: options.chain as Chain,
        tokenAddress: address,
      });

      const result = {
        token: address,
        chain: options.chain,
        timestamp: new Date().toISOString(),
        topHolders: analysis.holders.slice(0, 5).map(h => ({
          address: h.address,
          label: h.label,
          ownershipPercent: h.ownershipPercent,
          valueUsd: h.valueUsd,
          balanceChange7d: h.balanceChange7d,
        })),
        flows: analysis.flows.slice(0, 5).map(f => ({
          entity: f.entity,
          label: f.label,
          netFlowUsd: f.netFlowUsd,
          txCount: f.txCount,
        })),
        recentTrades: analysis.recentTrades.slice(0, 5).map(t => ({
          side: t.side,
          valueUsd: t.valueUsd,
          trader: t.traderLabel || formatAddress(t.trader),
          timestamp: t.timestamp,
        })),
        whoBoughtSold: analysis.whoBoughtSold.slice(0, 5),
      };

      console.log(JSON.stringify(result, null, options.pretty ? 2 : 0));
    } catch (error: any) {
      console.log(JSON.stringify({ error: error.message }));
      process.exit(1);
    }
  });

program
  .command('address <addr>')
  .description('Wallet summary: balances, related wallets')
  .requiredOption('-c, --chain <chain>', 'Chain (ethereum, base, arbitrum, etc.)')
  .option('--pretty', 'Pretty print output')
  .action(async (addr: string, options) => {
    try {
      const [balances, related] = await Promise.all([
        getClient().getWalletBalances({ address: addr, chain: options.chain as Chain }),
        getClient().getRelatedWallets({ address: addr, chain: options.chain as Chain }),
      ]);

      const totalValue = balances.reduce((sum, b) => sum + b.valueUsd, 0);

      const result = {
        address: addr,
        chain: options.chain,
        timestamp: new Date().toISOString(),
        totalValueUsd: totalValue,
        topHoldings: balances.slice(0, 10).map(b => ({
          symbol: b.symbol,
          name: b.name,
          amount: b.amount,
          valueUsd: b.valueUsd,
        })),
        relatedWallets: related.slice(0, 5).map(r => ({
          address: r.address,
          label: r.label,
          relationship: r.relationship,
          txCount: r.txCount,
        })),
      };

      console.log(JSON.stringify(result, null, options.pretty ? 2 : 0));
    } catch (error: any) {
      console.log(JSON.stringify({ error: error.message }));
      process.exit(1);
    }
  });

program
  .command('alerts')
  .description('Recent trading signals from signal log')
  .option('-l, --limit <n>', 'Number of alerts', parseInt, 10)
  .option('-c, --chain <chain>', 'Filter by chain')
  .option('--min-score <n>', 'Minimum score', parseFloat, 3)
  .option('--pretty', 'Pretty print output')
  .action(async (options) => {
    try {
      const signals = getTrader().getRecentSignals(options.limit * 2);

      let filtered = signals.filter(s => s.score >= options.minScore);
      if (options.chain) {
        filtered = filtered.filter(s => s.chain === options.chain);
      }

      const result = {
        timestamp: new Date().toISOString(),
        count: Math.min(filtered.length, options.limit),
        alerts: filtered.slice(0, options.limit).map(s => ({
          id: s.id,
          token: s.token,
          symbol: s.symbol,
          chain: s.chain,
          type: s.type,
          score: s.score,
          reason: s.reason,
          loggedAt: s.loggedAt,
          acted: s.acted,
          outcome: s.outcome,
        })),
        stats: getTrader().getPerformanceStats(),
      };

      console.log(JSON.stringify(result, null, options.pretty ? 2 : 0));
    } catch (error: any) {
      console.log(JSON.stringify({ error: error.message }));
      process.exit(1);
    }
  });

// =============================================================================
// Smart Money Commands
// =============================================================================

program
  .command('smart-money')
  .description('Track smart money netflow')
  .requiredOption('--chain <chain>', 'Blockchain (ethereum, base, arbitrum, etc.)')
  .option('--direction <dir>', 'Filter: inflow, outflow, or all', 'all')
  .option('--min-value <usd>', 'Minimum USD value', parseFloat)
  .option('--limit <n>', 'Number of results', parseInt, 20)
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const spinner = ora('Fetching smart money data...').start();

    try {
      const data = await getClient().getSmartMoneyNetflow({
        chain: options.chain as Chain,
        direction: options.direction as FlowDirection,
        minValue: options.minValue,
        limit: options.limit,
      });

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      if (data.length === 0) {
        console.log(chalk.yellow('No smart money activity found matching criteria.'));
        return;
      }

      const table = new Table({
        head: ['Token', 'Symbol', 'Net Flow', 'Traders', 'Direction'],
        style: { head: ['cyan'] },
      });

      for (const item of data) {
        const direction = item.netflow > 0
          ? chalk.green('ACCUMULATING')
          : chalk.red('DISTRIBUTING');

        table.push([
          formatAddress(item.token),
          item.symbol,
          `$${formatNumber(item.netflowUsd)}`,
          item.traderCount.toString(),
          direction,
        ]);
      }

      console.log(`\n${chalk.cyan('Smart Money Activity')} - ${options.chain}\n`);
      console.log(table.toString());

    } catch (error: any) {
      spinner.stop();
      handleError(error);
    }
  });

program
  .command('holdings')
  .description('Smart money holdings')
  .requiredOption('--chain <chain>', 'Blockchain')
  .option('--limit <n>', 'Number of results', parseInt, 20)
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const spinner = ora('Fetching holdings...').start();

    try {
      const data = await getClient().getSmartMoneyHoldings({
        chain: options.chain as Chain,
        limit: options.limit,
      });

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      const table = new Table({
        head: ['Symbol', 'Holders', 'Total Value', 'Change 24h', 'Change 7d'],
        style: { head: ['cyan'] },
      });

      for (const item of data) {
        const change24h = item.balanceChange24hUsd > 0
          ? chalk.green(`+$${formatNumber(item.balanceChange24hUsd)}`)
          : chalk.red(`-$${formatNumber(Math.abs(item.balanceChange24hUsd))}`);
        const change7d = item.balanceChange7dUsd > 0
          ? chalk.green(`+$${formatNumber(item.balanceChange7dUsd)}`)
          : chalk.red(`-$${formatNumber(Math.abs(item.balanceChange7dUsd))}`);

        table.push([
          item.symbol,
          item.holderCount.toString(),
          `$${formatNumber(item.totalBalanceUsd)}`,
          change24h,
          change7d,
        ]);
      }

      console.log(`\n${chalk.cyan('Smart Money Holdings')} - ${options.chain}\n`);
      console.log(table.toString());

    } catch (error: any) {
      spinner.stop();
      handleError(error);
    }
  });

program
  .command('sm-trades')
  .description('Smart money DEX trades')
  .requiredOption('--chain <chain>', 'Blockchain')
  .option('--limit <n>', 'Number of results', parseInt, 20)
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const spinner = ora('Fetching smart money trades...').start();

    try {
      const data = await getClient().getSmartMoneyDexTrades({
        chain: options.chain as Chain,
        limit: options.limit,
      });

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      const table = new Table({
        head: ['Symbol', 'Buy Vol', 'Sell Vol', 'Net', 'Traders'],
        style: { head: ['cyan'] },
      });

      for (const item of data) {
        const net = item.netVolumeUsd > 0
          ? chalk.green(`+$${formatNumber(item.netVolumeUsd)}`)
          : chalk.red(`-$${formatNumber(Math.abs(item.netVolumeUsd))}`);

        table.push([
          item.symbol,
          `$${formatNumber(item.buyVolumeUsd)}`,
          `$${formatNumber(item.sellVolumeUsd)}`,
          net,
          item.uniqueTraders.toString(),
        ]);
      }

      console.log(`\n${chalk.cyan('Smart Money DEX Trades')} - ${options.chain}\n`);
      console.log(table.toString());

    } catch (error: any) {
      spinner.stop();
      handleError(error);
    }
  });

// =============================================================================
// Token God Mode Commands
// =============================================================================

program
  .command('holders')
  .description('Token top holders')
  .requiredOption('--token <address>', 'Token address')
  .requiredOption('--chain <chain>', 'Blockchain')
  .option('--limit <n>', 'Number of results', parseInt, 10)
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const spinner = ora('Fetching holders...').start();

    try {
      const data = await getClient().getTokenHolders({
        chain: options.chain as Chain,
        tokenAddress: options.token,
        limit: options.limit,
      });

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      const table = new Table({
        head: ['Address', 'Label', 'Ownership', 'Value', 'Change 7d'],
        style: { head: ['cyan'] },
      });

      for (const item of data) {
        const change = item.balanceChange7d > 0
          ? chalk.green(`+${formatNumber(item.balanceChange7d)}`)
          : chalk.red(`${formatNumber(item.balanceChange7d)}`);

        table.push([
          formatAddress(item.address),
          item.label || '-',
          `${item.ownershipPercent.toFixed(2)}%`,
          `$${formatNumber(item.valueUsd)}`,
          change,
        ]);
      }

      console.log(`\n${chalk.cyan('Token Holders')} - ${options.chain}\n`);
      console.log(table.toString());

    } catch (error: any) {
      spinner.stop();
      handleError(error);
    }
  });

program
  .command('flows')
  .description('Token flows by entity')
  .requiredOption('--token <address>', 'Token address')
  .requiredOption('--chain <chain>', 'Blockchain')
  .option('--limit <n>', 'Number of results', parseInt, 10)
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const spinner = ora('Fetching flows...').start();

    try {
      const data = await getClient().getTokenFlows({
        chain: options.chain as Chain,
        tokenAddress: options.token,
        limit: options.limit,
      });

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      const table = new Table({
        head: ['Entity', 'Inflow', 'Outflow', 'Net', 'Txs'],
        style: { head: ['cyan'] },
      });

      for (const item of data) {
        const net = item.netFlowUsd > 0
          ? chalk.green(`+$${formatNumber(item.netFlowUsd)}`)
          : chalk.red(`-$${formatNumber(Math.abs(item.netFlowUsd))}`);

        table.push([
          item.label || item.entity,
          `$${formatNumber(item.inflowUsd)}`,
          `$${formatNumber(item.outflowUsd)}`,
          net,
          item.txCount.toString(),
        ]);
      }

      console.log(`\n${chalk.cyan('Token Flows')} - ${options.chain}\n`);
      console.log(table.toString());

    } catch (error: any) {
      spinner.stop();
      handleError(error);
    }
  });

program
  .command('trades')
  .description('Token DEX trades')
  .requiredOption('--token <address>', 'Token address')
  .requiredOption('--chain <chain>', 'Blockchain')
  .option('--limit <n>', 'Number of results', parseInt, 20)
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const spinner = ora('Fetching trades...').start();

    try {
      const data = await getClient().getTokenDexTrades({
        chain: options.chain as Chain,
        tokenAddress: options.token,
        limit: options.limit,
      });

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      const table = new Table({
        head: ['Time', 'Side', 'Value', 'Price', 'Trader'],
        style: { head: ['cyan'] },
      });

      for (const item of data) {
        const side = item.side === 'buy'
          ? chalk.green('BUY')
          : chalk.red('SELL');
        const time = new Date(item.timestamp).toLocaleTimeString();

        table.push([
          time,
          side,
          `$${formatNumber(item.valueUsd)}`,
          `$${item.priceUsd.toFixed(6)}`,
          item.traderLabel || formatAddress(item.trader),
        ]);
      }

      console.log(`\n${chalk.cyan('Token DEX Trades')} - ${options.chain}\n`);
      console.log(table.toString());

    } catch (error: any) {
      spinner.stop();
      handleError(error);
    }
  });

// =============================================================================
// Wallet Commands
// =============================================================================

program
  .command('balances')
  .description('Wallet token balances')
  .requiredOption('--address <addr>', 'Wallet address')
  .requiredOption('--chain <chain>', 'Blockchain')
  .option('--limit <n>', 'Number of results', parseInt, 20)
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const spinner = ora('Fetching balances...').start();

    try {
      const data = await getClient().getWalletBalances({
        address: options.address,
        chain: options.chain as Chain,
        limit: options.limit,
      });

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      const totalValue = data.reduce((sum, item) => sum + item.valueUsd, 0);

      const table = new Table({
        head: ['Symbol', 'Amount', 'Price', 'Value'],
        style: { head: ['cyan'] },
      });

      for (const item of data) {
        table.push([
          item.symbol,
          formatNumber(item.amount),
          `$${item.priceUsd.toFixed(6)}`,
          `$${formatNumber(item.valueUsd)}`,
        ]);
      }

      console.log(`\n${chalk.cyan('Wallet Balances')} - ${options.chain}`);
      console.log(`Total Value: $${formatNumber(totalValue)}\n`);
      console.log(table.toString());

    } catch (error: any) {
      spinner.stop();
      handleError(error);
    }
  });

program
  .command('related')
  .description('Related wallets')
  .requiredOption('--address <addr>', 'Wallet address')
  .requiredOption('--chain <chain>', 'Blockchain')
  .option('--limit <n>', 'Number of results', parseInt, 10)
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const spinner = ora('Fetching related wallets...').start();

    try {
      const data = await getClient().getRelatedWallets({
        address: options.address,
        chain: options.chain as Chain,
        limit: options.limit,
      });

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      const table = new Table({
        head: ['Address', 'Label', 'Relationship', 'Txs'],
        style: { head: ['cyan'] },
      });

      for (const item of data) {
        table.push([
          formatAddress(item.address),
          item.label || '-',
          item.relationship,
          item.txCount.toString(),
        ]);
      }

      console.log(`\n${chalk.cyan('Related Wallets')} - ${options.chain}\n`);
      console.log(table.toString());

    } catch (error: any) {
      spinner.stop();
      handleError(error);
    }
  });

// =============================================================================
// Scan Commands
// =============================================================================

program
  .command('scan')
  .description('Scan for trading opportunities')
  .requiredOption('--chain <chain>', 'Blockchain')
  .option('--mode <mode>', 'Scan mode: accumulation, distribution', 'accumulation')
  .option('--limit <n>', 'Number of results', parseInt, 10)
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const spinner = ora(`Scanning for ${options.mode} signals...`).start();

    try {
      const signals = await getClient().scanOpportunities({
        chain: options.chain as Chain,
        mode: options.mode as ScanMode,
        limit: options.limit,
      });

      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(signals, null, 2));
        return;
      }

      if (signals.length === 0) {
        console.log(chalk.yellow(`No ${options.mode} signals found.`));
        return;
      }

      const table = new Table({
        head: ['Score', 'Token', 'Reason'],
        style: { head: ['cyan'] },
        colWidths: [8, 12, 60],
        wordWrap: true,
      });

      for (const signal of signals) {
        const scoreColor = signal.score > 5 ? chalk.green : signal.score > 2 ? chalk.yellow : chalk.white;
        table.push([
          scoreColor(signal.score.toFixed(2)),
          signal.symbol,
          signal.reason,
        ]);
      }

      console.log(`\n${chalk.cyan(`Opportunity Scan: ${options.mode.toUpperCase()}`)} - ${options.chain}\n`);
      console.log(table.toString());

    } catch (error: any) {
      spinner.stop();
      handleError(error);
    }
  });

program
  .command('chains')
  .description('List supported chains')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    const chains = getClient().getSupportedChains();

    if (options.json) {
      console.log(JSON.stringify(chains, null, 2));
      return;
    }

    console.log(`\n${chalk.cyan('Supported Chains')}\n`);
    for (const chain of chains) {
      console.log(`  - ${chain}`);
    }
  });

// =============================================================================
// MCP Commands
// =============================================================================

let mcp: NansenMcp;

function getMcp(): NansenMcp {
  if (!mcp) {
    const apiKey = process.env.NANSEN_API_KEY;
    if (!apiKey) {
      console.error(chalk.red('NANSEN_API_KEY not found'));
      console.log('\nSet your API key:');
      console.log('  export NANSEN_API_KEY=your_key_here');
      process.exit(1);
    }
    mcp = new NansenMcp(apiKey);
  }
  return mcp;
}

const mcpCmd = program.command('mcp').description('MCP commands (AI-powered, 21 tools)');

mcpCmd
  .command('tool')
  .description('Call an MCP tool directly')
  .requiredOption('--name <tool>', 'Tool name')
  .requiredOption('--params <json>', 'Parameters as JSON')
  .action(async (options) => {
    const spinner = ora(`Calling MCP tool: ${options.name}...`).start();
    try {
      const params = JSON.parse(options.params);
      const result = await getMcp().callTool(options.name as McpTool, params);
      spinner.stop();
      console.log(JSON.stringify(result, null, 2));
    } catch (error: any) {
      spinner.stop();
      if (error instanceof NansenMcpError) {
        console.error(chalk.red(`MCP Error: ${error.message}`));
      } else {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      process.exit(1);
    }
  });

mcpCmd
  .command('tools')
  .description('List all available MCP tools')
  .action(() => {
    console.log(`\n${chalk.cyan('Available MCP Tools (21 total)')}\n`);

    const categories: Record<string, McpTool[]> = {
      'Smart Money': ['smart_traders_and_funds_token_balances', 'smart_traders_and_funds_netflows', 'smart_traders_and_funds_dcas_solana'],
      'Token Analysis': ['token_current_top_holders', 'token_dex_trades', 'token_transfers', 'token_flows', 'token_pnl_leaderboard', 'token_who_bought_sold', 'token_jup_dca', 'token_recent_flows_summary', 'token_discovery_screener', 'token_ohlcv'],
      'Wallet Profiler': ['address_historical_balances', 'address_related_addresses', 'address_counterparties', 'address_transactions', 'wallet_pnl_for_token', 'wallet_pnl_summary', 'address_transactions_for_token', 'address_portfolio'],
      'Miscellaneous': ['general_search', 'growth_chain_rank', 'transaction_lookup'],
    };

    for (const [category, tools] of Object.entries(categories)) {
      console.log(chalk.yellow(`\n${category}:`));
      for (const tool of tools) {
        const info = MCP_TOOLS[tool];
        console.log(`  ${chalk.cyan(tool)} (${info.credits} credits)`);
        console.log(`    ${chalk.dim(info.description)}`);
      }
    }
  });

// =============================================================================
// Trader Commands
// =============================================================================

let trader: NansenTrader;

function getTrader(): NansenTrader {
  if (!trader) {
    try {
      trader = new NansenTrader();
    } catch (error: any) {
      console.error(chalk.red(error.message));
      console.log('\nSet your API key:');
      console.log('  export NANSEN_API_KEY=your_key_here');
      process.exit(1);
    }
  }
  return trader;
}

function formatSignal(signal: TradingSignal): void {
  const recColors: Record<string, any> = {
    strong_buy: chalk.green.bold,
    buy: chalk.green,
    watch: chalk.yellow,
    avoid: chalk.red,
  };
  const color = recColors[signal.recommendation] || chalk.white;

  console.log(`\n${color(`[${signal.recommendation.toUpperCase()}]`)} ${chalk.cyan(signal.symbol)} on ${signal.chain}`);
  console.log(`  Score: ${signal.score.toFixed(1)} | Risk: ${signal.riskScore} | Confidence: ${(signal.confidence * 100).toFixed(0)}%`);
  console.log(`  ${chalk.dim(signal.reason)}`);

  if (signal.riskFactors.length > 0) {
    console.log(`  Factors: ${signal.riskFactors.join(', ')}`);
  }
}

const traderCmd = program.command('trader').description('Trading intelligence layer');

traderCmd
  .command('quick')
  .description('Quick scan on a single chain')
  .requiredOption('--chain <chain>', 'Blockchain to scan')
  .option('--mode <mode>', 'Scan mode', 'accumulation')
  .option('--json', 'Output JSON')
  .action(async (options) => {
    const spinner = ora(`Quick scan: ${options.chain}...`).start();
    try {
      const signals = await getTrader().quickScan(options.chain as Chain, options.mode as ScanMode);
      spinner.stop();

      if (options.json) {
        console.log(JSON.stringify(signals, null, 2));
        return;
      }

      if (signals.length === 0) {
        console.log(chalk.yellow('\nNo signals found.'));
        return;
      }

      for (const signal of signals) {
        formatSignal(signal);
      }
    } catch (error: any) {
      spinner.stop();
      handleError(error);
    }
  });

traderCmd
  .command('signals')
  .description('View logged signals')
  .option('--limit <n>', 'Number of signals', parseInt, 20)
  .option('--chain <chain>', 'Filter by chain')
  .option('--json', 'Output JSON')
  .action(async (options) => {
    let signals = getTrader().getRecentSignals(options.limit);

    if (options.chain) {
      signals = signals.filter(s => s.chain === options.chain);
    }

    if (options.json) {
      console.log(JSON.stringify(signals, null, 2));
      return;
    }

    if (signals.length === 0) {
      console.log(chalk.yellow('\nNo signals found.'));
      return;
    }

    console.log(`\n${chalk.cyan('Logged Signals')} (${signals.length})\n`);

    const table = new Table({
      head: ['Token', 'Chain', 'Score', 'Acted', 'Time'],
      style: { head: ['cyan'] },
    });

    for (const s of signals) {
      table.push([
        s.symbol,
        s.chain,
        s.score.toFixed(1),
        s.acted ? chalk.green('Yes') : chalk.dim('No'),
        new Date(s.loggedAt).toLocaleString(),
      ]);
    }

    console.log(table.toString());
  });

traderCmd
  .command('stats')
  .description('View trader statistics')
  .option('--json', 'Output JSON')
  .action(async (options) => {
    const stats = getTrader().getStats();

    if (options.json) {
      console.log(JSON.stringify(stats, null, 2));
      return;
    }

    console.log(`\n${chalk.cyan('Trader Statistics')}\n`);

    console.log(chalk.yellow('Cache:'));
    console.log(`  Hits: ${stats.cache.hits}`);
    console.log(`  Misses: ${stats.cache.misses}`);
    console.log(`  Credits Saved: ${stats.cache.creditsSaved}`);

    console.log(chalk.yellow('\nRate Limiter:'));
    console.log(`  Total Requests: ${stats.rateLimit.totalRequests}`);
    console.log(`  Throttled: ${stats.rateLimit.throttledRequests}`);

    console.log(chalk.yellow('\nSignals:'));
    console.log(`  Total: ${stats.signals.totalSignals}`);
    console.log(`  Acted On: ${stats.signals.actedOn}`);
    console.log(`  Win Rate: ${(stats.signals.winRate * 100).toFixed(1)}%`);
  });

program.parse();
