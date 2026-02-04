/**
 * Signal Logger
 * Persists signals for later analysis and performance tracking
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import type { OpportunitySignal, Chain, ScanMode } from './types.js';

export interface LoggedSignal extends OpportunitySignal {
  id: string;
  loggedAt: string;
  acted: boolean;
  outcome?: SignalOutcome;
}

export interface SignalOutcome {
  action: 'buy' | 'sell' | 'skip';
  executedAt?: string;
  entryPrice?: number;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  notes?: string;
}

export interface SignalFilter {
  chains?: Chain[];
  modes?: ScanMode[];
  minScore?: number;
  maxScore?: number;
  acted?: boolean;
  hasOutcome?: boolean;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export interface SignalStats {
  totalSignals: number;
  actedOn: number;
  skipped: number;
  withOutcome: number;
  profitableCount: number;
  totalPnl: number;
  winRate: number;
  avgScore: number;
  avgPnlPercent: number;
  byChain: Record<string, number>;
  byMode: Record<string, number>;
}

export class SignalLog {
  private signals: Map<string, LoggedSignal> = new Map();
  private logPath: string;
  private autoSave: boolean;

  constructor(logPath?: string, autoSave: boolean = true) {
    this.logPath = logPath || join(process.cwd(), '.nansen', 'signals.json');
    this.autoSave = autoSave;
    this.load();
  }

  /**
   * Generate unique signal ID
   */
  private generateId(signal: OpportunitySignal): string {
    return `${signal.chain}:${signal.token}:${signal.type}:${signal.timestamp}`;
  }

  /**
   * Log a new signal
   */
  log(signal: OpportunitySignal): LoggedSignal {
    const id = this.generateId(signal);

    // Check for duplicate
    if (this.signals.has(id)) {
      return this.signals.get(id)!;
    }

    const logged: LoggedSignal = {
      ...signal,
      id,
      loggedAt: new Date().toISOString(),
      acted: false,
    };

    this.signals.set(id, logged);

    if (this.autoSave) {
      this.save();
    }

    return logged;
  }

  /**
   * Log multiple signals
   */
  logBatch(signals: OpportunitySignal[]): LoggedSignal[] {
    const logged = signals.map(s => {
      const id = this.generateId(s);
      if (this.signals.has(id)) {
        return this.signals.get(id)!;
      }
      const entry: LoggedSignal = {
        ...s,
        id,
        loggedAt: new Date().toISOString(),
        acted: false,
      };
      this.signals.set(id, entry);
      return entry;
    });

    if (this.autoSave) {
      this.save();
    }

    return logged;
  }

  /**
   * Mark a signal as acted upon
   */
  markActed(id: string, action: 'buy' | 'sell' | 'skip', notes?: string): LoggedSignal | undefined {
    const signal = this.signals.get(id);
    if (!signal) return undefined;

    signal.acted = true;
    signal.outcome = {
      action,
      executedAt: new Date().toISOString(),
      notes,
    };

    if (this.autoSave) {
      this.save();
    }

    return signal;
  }

  /**
   * Record outcome for a signal
   */
  recordOutcome(
    id: string,
    outcome: Partial<SignalOutcome>
  ): LoggedSignal | undefined {
    const signal = this.signals.get(id);
    if (!signal) return undefined;

    signal.outcome = {
      ...signal.outcome,
      ...outcome,
    } as SignalOutcome;

    // Calculate PnL percent if we have entry and exit
    if (signal.outcome.entryPrice && signal.outcome.exitPrice) {
      signal.outcome.pnl = signal.outcome.exitPrice - signal.outcome.entryPrice;
      signal.outcome.pnlPercent = (signal.outcome.pnl / signal.outcome.entryPrice) * 100;
    }

    if (this.autoSave) {
      this.save();
    }

    return signal;
  }

  /**
   * Get a signal by ID
   */
  get(id: string): LoggedSignal | undefined {
    return this.signals.get(id);
  }

  /**
   * Find signals matching criteria
   */
  find(filter: SignalFilter = {}): LoggedSignal[] {
    let results = Array.from(this.signals.values());

    if (filter.chains?.length) {
      results = results.filter(s => filter.chains!.includes(s.chain));
    }

    if (filter.modes?.length) {
      results = results.filter(s => filter.modes!.includes(s.type));
    }

    if (filter.minScore !== undefined) {
      results = results.filter(s => s.score >= filter.minScore!);
    }

    if (filter.maxScore !== undefined) {
      results = results.filter(s => s.score <= filter.maxScore!);
    }

    if (filter.acted !== undefined) {
      results = results.filter(s => s.acted === filter.acted);
    }

    if (filter.hasOutcome !== undefined) {
      results = results.filter(s =>
        filter.hasOutcome ? s.outcome?.pnl !== undefined : s.outcome?.pnl === undefined
      );
    }

    if (filter.startDate) {
      const start = new Date(filter.startDate).getTime();
      results = results.filter(s => new Date(s.loggedAt).getTime() >= start);
    }

    if (filter.endDate) {
      const end = new Date(filter.endDate).getTime();
      results = results.filter(s => new Date(s.loggedAt).getTime() <= end);
    }

    // Sort by logged time, newest first
    results.sort((a, b) =>
      new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
    );

    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  /**
   * Get statistics
   */
  getStats(filter: SignalFilter = {}): SignalStats {
    const signals = this.find(filter);

    const withOutcome = signals.filter(s => s.outcome?.pnl !== undefined);
    const profitable = withOutcome.filter(s => (s.outcome?.pnl ?? 0) > 0);

    const byChain: Record<string, number> = {};
    const byMode: Record<string, number> = {};

    for (const s of signals) {
      byChain[s.chain] = (byChain[s.chain] || 0) + 1;
      byMode[s.type] = (byMode[s.type] || 0) + 1;
    }

    const totalPnl = withOutcome.reduce((sum, s) => sum + (s.outcome?.pnl ?? 0), 0);
    const avgPnlPercent = withOutcome.length > 0
      ? withOutcome.reduce((sum, s) => sum + (s.outcome?.pnlPercent ?? 0), 0) / withOutcome.length
      : 0;

    return {
      totalSignals: signals.length,
      actedOn: signals.filter(s => s.acted).length,
      skipped: signals.filter(s => !s.acted).length,
      withOutcome: withOutcome.length,
      profitableCount: profitable.length,
      totalPnl,
      winRate: withOutcome.length > 0 ? profitable.length / withOutcome.length : 0,
      avgScore: signals.length > 0
        ? signals.reduce((sum, s) => sum + s.score, 0) / signals.length
        : 0,
      avgPnlPercent,
      byChain,
      byMode,
    };
  }

  /**
   * Get recent signals for a specific token
   */
  getTokenHistory(token: string, chain?: Chain): LoggedSignal[] {
    return this.find({}).filter(s =>
      s.token.toLowerCase() === token.toLowerCase() &&
      (!chain || s.chain === chain)
    );
  }

  /**
   * Check if we've seen this signal recently
   */
  hasRecentSignal(signal: OpportunitySignal, withinMs: number = 3600000): boolean {
    const cutoff = Date.now() - withinMs;

    for (const logged of this.signals.values()) {
      if (
        logged.token === signal.token &&
        logged.chain === signal.chain &&
        logged.type === signal.type &&
        new Date(logged.loggedAt).getTime() > cutoff
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Save to disk
   */
  save(): void {
    const dir = dirname(this.logPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const data = Array.from(this.signals.values());
    writeFileSync(this.logPath, JSON.stringify(data, null, 2));
  }

  /**
   * Load from disk
   */
  load(): void {
    if (!existsSync(this.logPath)) {
      return;
    }

    try {
      const data = JSON.parse(readFileSync(this.logPath, 'utf-8'));
      this.signals.clear();
      for (const signal of data) {
        this.signals.set(signal.id, signal);
      }
    } catch (error) {
      console.error('Failed to load signal log:', (error as Error).message);
    }
  }

  /**
   * Clear all signals
   */
  clear(): void {
    this.signals.clear();
    if (this.autoSave) {
      this.save();
    }
  }

  /**
   * Export signals to JSON
   */
  export(filter?: SignalFilter): string {
    return JSON.stringify(this.find(filter), null, 2);
  }
}
