/**
 * Persistent analytics & session tracking.
 *
 * Stores task/run data in `.meeseeks/analytics.json` (auto-pruned to 7 days).
 * Learns session capacity from rate limit observations so the display
 * can show meaningful "% used / est. remaining" instead of guessing.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { formatDuration, logDebug } from "../ui/logger.ts";
import { estimateTaskCost, formatCost } from "./quota.ts";

// ── Types ──────────────────────────────────────────────────────────────────

export interface TaskRecord {
	title: string;
	startedAt: string; // ISO
	endedAt: string;
	durationMs: number;
	model: string;
	inputTokens: number;
	outputTokens: number;
	costUsd: number;
	success: boolean;
	retryCount: number;
	error?: string;
}

export interface RunRecord {
	id: string;
	startedAt: string;
	endedAt?: string;
	model: string;
	totalTasks: number;
	tasksCompleted: number;
	tasksFailed: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCostUsd: number;
}

export interface RateLimitObservation {
	timestamp: string;
	cumulativeTokens: number;
	model: string;
	tasksInWindow: number;
}

export interface LearnedCapacity {
	estimatedMaxTokens: number;
	observationCount: number;
	lastObservedAt: string;
	/** Highest tokens used successfully without hitting rate limit */
	successHighWaterMark?: number;
	/** Whether the estimate is from a rate limit hit (true) or inferred from success (false) */
	fromRateLimitHit?: boolean;
}

export interface AnalyticsData {
	version: number;
	tasks: TaskRecord[];
	runs: RunRecord[];
	rateLimitObservations: RateLimitObservation[];
	learnedCapacity: LearnedCapacity | null;
}

export interface SessionEstimate {
	taskCount: number;
	totalTokens: number;
	totalCostUsd: number;
	durationMs: number;
	model: string;
	/** Only present if we have learned capacity */
	capacity?: {
		percentUsed: number;
		estimatedMaxTokens: number;
		estimatedTasksLeft: number;
		/** Whether this is from an actual rate limit hit (more accurate) or inferred */
		fromRateLimitHit: boolean;
	};
}

// ── Constants ──────────────────────────────────────────────────────────────

const ANALYTICS_FILE = "analytics.json";
const MEESEEKS_DIR = ".meeseeks";
const PRUNE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const WINDOW_MS = 5 * 60 * 60 * 1000; // 5-hour rolling window

// ── File I/O ───────────────────────────────────────────────────────────────

function analyticsPath(workDir: string): string {
	return path.join(workDir, MEESEEKS_DIR, ANALYTICS_FILE);
}

function emptyData(): AnalyticsData {
	return {
		version: 1,
		tasks: [],
		runs: [],
		rateLimitObservations: [],
		learnedCapacity: null,
	};
}

export function loadAnalytics(workDir: string): AnalyticsData {
	const filePath = analyticsPath(workDir);
	try {
		if (fs.existsSync(filePath)) {
			const raw = fs.readFileSync(filePath, "utf-8");
			const data = JSON.parse(raw) as AnalyticsData;
			if (data.version === 1) return data;
		}
	} catch (error) {
		logDebug("Failed to load analytics (corrupt file?), starting fresh:", error);
	}
	return emptyData();
}

function saveAnalytics(workDir: string, data: AnalyticsData): void {
	const dirPath = path.join(workDir, MEESEEKS_DIR);
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true });
	}
	pruneOldRecords(data);
	fs.writeFileSync(analyticsPath(workDir), JSON.stringify(data, null, 2), "utf-8");
}

function pruneOldRecords(data: AnalyticsData): void {
	const cutoff = new Date(Date.now() - PRUNE_AGE_MS).toISOString();
	data.tasks = data.tasks.filter((t) => t.endedAt >= cutoff);
	data.runs = data.runs.filter((r) => (r.endedAt || r.startedAt) >= cutoff);
	data.rateLimitObservations = data.rateLimitObservations.filter((o) => o.timestamp >= cutoff);
}

// ── Run lifecycle ──────────────────────────────────────────────────────────

export function startRun(workDir: string, model: string): string {
	const data = loadAnalytics(workDir);
	const id = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	const run: RunRecord = {
		id,
		startedAt: new Date().toISOString(),
		model,
		totalTasks: 0,
		tasksCompleted: 0,
		tasksFailed: 0,
		totalInputTokens: 0,
		totalOutputTokens: 0,
		totalCostUsd: 0,
	};
	data.runs.push(run);
	saveAnalytics(workDir, data);
	return id;
}

export function endRun(
	workDir: string,
	runId: string,
	stats: {
		totalTasks: number;
		tasksCompleted: number;
		tasksFailed: number;
		totalInputTokens: number;
		totalOutputTokens: number;
		totalCostUsd: number;
	},
): void {
	const data = loadAnalytics(workDir);
	const run = data.runs.find((r) => r.id === runId);
	if (run) {
		run.endedAt = new Date().toISOString();
		run.totalTasks = stats.totalTasks;
		run.tasksCompleted = stats.tasksCompleted;
		run.tasksFailed = stats.tasksFailed;
		run.totalInputTokens = stats.totalInputTokens;
		run.totalOutputTokens = stats.totalOutputTokens;
		run.totalCostUsd = stats.totalCostUsd;
	}
	saveAnalytics(workDir, data);
}

// ── Task recording ─────────────────────────────────────────────────────────

export function recordTask(workDir: string, task: TaskRecord): void {
	const data = loadAnalytics(workDir);
	data.tasks.push(task);
	saveAnalytics(workDir, data);
}

// ── Rate limit learning ────────────────────────────────────────────────────

/**
 * Call when a rate limit error is detected.
 * Records cumulative tokens in the 5-hour window as ~100% capacity,
 * then averages across all observations to refine the learned estimate.
 */
export function recordRateLimitHit(workDir: string, model: string): void {
	const data = loadAnalytics(workDir);
	const windowTokens = getWindowTokens(data);
	const windowTasks = getWindowTaskCount(data);

	if (windowTokens === 0) return; // Nothing to learn from

	const observation: RateLimitObservation = {
		timestamp: new Date().toISOString(),
		cumulativeTokens: windowTokens,
		model,
		tasksInWindow: windowTasks,
	};
	data.rateLimitObservations.push(observation);

	// Re-compute learned capacity from all observations
	const allTokenObservations = data.rateLimitObservations.map((o) => o.cumulativeTokens);
	const avgCapacity =
		allTokenObservations.reduce((sum, t) => sum + t, 0) / allTokenObservations.length;

	data.learnedCapacity = {
		estimatedMaxTokens: Math.round(avgCapacity),
		observationCount: allTokenObservations.length,
		lastObservedAt: new Date().toISOString(),
		successHighWaterMark: data.learnedCapacity?.successHighWaterMark,
		fromRateLimitHit: true,
	};

	saveAnalytics(workDir, data);
}

/**
 * Call after a successful run completes (no rate limit hit).
 * Updates the success high water mark and adjusts capacity estimate if needed.
 *
 * Learning strategy:
 * - Always update success high water mark (max tokens used without hitting limit)
 * - If we exceed 50% of learned capacity without hitting limit, the estimate may be stale
 * - If learned capacity is from rate limit hit > 24h ago, trust it less
 * - Infer new capacity: assume we're at ~20% of actual (conservative for Max plans)
 */
export function recordSuccessfulRun(workDir: string, model: string): void {
	const data = loadAnalytics(workDir);
	const windowTokens = getWindowTokens(data);

	if (windowTokens === 0) return;

	// Update high water mark
	const currentHighWater = data.learnedCapacity?.successHighWaterMark ?? 0;
	const newHighWater = Math.max(currentHighWater, windowTokens);

	const currentCap = data.learnedCapacity?.estimatedMaxTokens ?? 0;
	const lastObserved = data.learnedCapacity?.lastObservedAt;
	const fromRateLimit = data.learnedCapacity?.fromRateLimitHit ?? false;

	// Check if learned capacity is stale (>24h old and from rate limit)
	const isStale =
		fromRateLimit &&
		lastObserved &&
		Date.now() - new Date(lastObserved).getTime() > 24 * 60 * 60 * 1000;

	// Recalibrate if:
	// 1. We exceeded 50% of learned cap without hitting limit (estimate probably too low)
	// 2. OR the learned capacity is stale and we have significant new data
	const shouldRecalibrate =
		(currentCap > 0 && windowTokens > currentCap * 0.5) ||
		(isStale && windowTokens > currentCap * 0.3);

	if (shouldRecalibrate || currentCap === 0) {
		// Estimate new capacity: assume we're at ~20% of actual (conservative for Max plans)
		// This will be corrected when/if we actually hit a rate limit
		const inferredCapacity = Math.round(windowTokens * 5);

		data.learnedCapacity = {
			estimatedMaxTokens: Math.max(currentCap, inferredCapacity),
			observationCount: data.learnedCapacity?.observationCount ?? 0,
			lastObservedAt: new Date().toISOString(),
			successHighWaterMark: newHighWater,
			fromRateLimitHit: false,
		};
	} else {
		// Just update the high water mark
		if (!data.learnedCapacity) {
			data.learnedCapacity = {
				estimatedMaxTokens: Math.round(windowTokens * 5),
				observationCount: 0,
				lastObservedAt: new Date().toISOString(),
				successHighWaterMark: newHighWater,
				fromRateLimitHit: false,
			};
		} else {
			data.learnedCapacity.successHighWaterMark = newHighWater;
		}
	}

	saveAnalytics(workDir, data);
}

// ── Window calculations ────────────────────────────────────────────────────

function getWindowCutoff(): string {
	return new Date(Date.now() - WINDOW_MS).toISOString();
}

/**
 * Window statistics calculated in a single pass
 */
interface WindowStats {
	taskCount: number;
	totalTokens: number;
	totalCostUsd: number;
	durationMs: number;
}

/**
 * Calculate all window stats in a single pass over the data.
 * This is more efficient than calling separate functions for each stat.
 */
function getWindowStats(data: AnalyticsData): WindowStats {
	const cutoff = getWindowCutoff();
	let taskCount = 0;
	let totalTokens = 0;
	let totalCostUsd = 0;
	let earliest: string | null = null;
	let latest: string | null = null;

	for (const task of data.tasks) {
		if (task.endedAt >= cutoff) {
			taskCount++;
			totalTokens += task.inputTokens + task.outputTokens;
			totalCostUsd += task.costUsd;

			if (earliest === null || task.startedAt < earliest) {
				earliest = task.startedAt;
			}
			if (latest === null || task.endedAt > latest) {
				latest = task.endedAt;
			}
		}
	}

	const durationMs =
		earliest && latest ? new Date(latest).getTime() - new Date(earliest).getTime() : 0;

	return { taskCount, totalTokens, totalCostUsd, durationMs };
}

// Legacy functions for backward compatibility (used internally)
function getWindowTokens(data: AnalyticsData): number {
	const cutoff = getWindowCutoff();
	return data.tasks
		.filter((t) => t.endedAt >= cutoff)
		.reduce((sum, t) => sum + t.inputTokens + t.outputTokens, 0);
}

function getWindowTaskCount(data: AnalyticsData): number {
	const cutoff = getWindowCutoff();
	return data.tasks.filter((t) => t.endedAt >= cutoff).length;
}

// ── Session estimate ───────────────────────────────────────────────────────

/**
 * Build a session estimate from persistent data (rolling 5-hour window).
 */
export function getSessionEstimate(workDir: string, model: string): SessionEstimate {
	const data = loadAnalytics(workDir);

	// Use optimized single-pass calculation
	const stats = getWindowStats(data);

	const estimate: SessionEstimate = {
		taskCount: stats.taskCount,
		totalTokens: stats.totalTokens,
		totalCostUsd: stats.totalCostUsd,
		durationMs: stats.durationMs,
		model,
	};

	if (data.learnedCapacity && data.learnedCapacity.estimatedMaxTokens > 0) {
		const cap = data.learnedCapacity.estimatedMaxTokens;
		const percentUsed = (stats.totalTokens / cap) * 100;

		// Estimate remaining tasks based on average tokens per task
		let estimatedTasksLeft = 0;
		if (stats.taskCount > 0) {
			const avgTokensPerTask = stats.totalTokens / stats.taskCount;
			const tokensRemaining = Math.max(0, cap - stats.totalTokens);
			estimatedTasksLeft = Math.floor(tokensRemaining / avgTokensPerTask);
		}

		estimate.capacity = {
			percentUsed: Math.min(percentUsed, 100),
			estimatedMaxTokens: cap,
			estimatedTasksLeft,
			fromRateLimitHit: data.learnedCapacity.fromRateLimitHit ?? false,
		};
	}

	return estimate;
}

// ── Formatting helpers ─────────────────────────────────────────────────────

function formatTokensCompact(tokens: number): string {
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
	if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
	return String(tokens);
}

/**
 * Format a session estimate line for display.
 *
 * Before learning (no data):
 *   [SESSION] 3 tasks | 245.1K tokens | 12m 30s | ~$0.42 (sonnet)
 *
 * After learning from rate limit hit (accurate):
 *   [SESSION] ~53% used | 7 tasks (est. ~6 left) | 245.1K / ~462K cap | ~$1.27 (sonnet)
 *
 * After learning from success only (inferred, shows ?):
 *   [SESSION] ~10%? used | 7 tasks | 245.1K / ~2.5M cap? | ~$1.27 (sonnet)
 */
export function formatSessionEstimate(est: SessionEstimate): string {
	const cost = formatCost(est.totalCostUsd);
	const tokens = formatTokensCompact(est.totalTokens);
	const duration = formatDuration(est.durationMs);

	if (est.capacity) {
		const cap = formatTokensCompact(est.capacity.estimatedMaxTokens);
		const pct = est.capacity.percentUsed.toFixed(0);
		const left = est.capacity.estimatedTasksLeft;
		const tasksLeft = left > 0 ? ` (est. ~${left} left)` : "";
		// Show ? suffix when capacity is inferred (not from actual rate limit hit)
		const uncertain = est.capacity.fromRateLimitHit ? "" : "?";
		return `~${pct}%${uncertain} used | ${est.taskCount} tasks${tasksLeft} | ${tokens} / ~${cap} cap${uncertain} | ${cost} (${est.model})`;
	}

	return `${est.taskCount} tasks | ${tokens} tokens | ${duration} | ${cost} (${est.model})`;
}
