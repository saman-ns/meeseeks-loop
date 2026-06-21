import pc from "picocolors";

let verboseMode = false;

/**
 * Set verbose mode
 */
export function setVerbose(verbose: boolean): void {
	verboseMode = verbose;
}

/**
 * Log info message
 */
export function logInfo(...args: unknown[]): void {
	console.log(pc.blue("[INFO]"), ...args);
}

/**
 * Log success message
 */
export function logSuccess(...args: unknown[]): void {
	console.log(pc.green("[OK]"), ...args);
}

/**
 * Log warning message
 */
export function logWarn(...args: unknown[]): void {
	console.log(pc.yellow("[WARN]"), ...args);
}

/**
 * Log error message
 */
export function logError(...args: unknown[]): void {
	console.error(pc.red("[ERROR]"), ...args);
}

/**
 * Log debug message (only in verbose mode)
 */
export function logDebug(...args: unknown[]): void {
	if (verboseMode) {
		console.log(pc.dim("[DEBUG]"), ...args);
	}
}

/**
 * Format a task name for display (truncate if too long)
 */
export function formatTask(task: string, maxLen = 40): string {
	if (task.length <= maxLen) return task;
	return `${task.slice(0, maxLen - 3)}...`;
}

/**
 * Format duration in human readable format
 */
export function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	const secs = Math.floor(ms / 1000);
	const mins = Math.floor(secs / 60);
	const remainingSecs = secs % 60;
	if (mins === 0) return `${secs}s`;
	return `${mins}m ${remainingSecs}s`;
}

/**
 * Format token count
 */
export function formatTokens(input: number, output: number): string {
	const total = input + output;
	if (total === 0) return "";
	return pc.dim(`(${input.toLocaleString()} in / ${output.toLocaleString()} out)`);
}

/**
 * Log per-task and cumulative token usage with cost estimate
 *
 * Token meanings:
 * - "in" = Input tokens (what Claude reads: prompt, codebase, files explored)
 * - "out" = Output tokens (what Claude writes: code, tests, responses)
 */
export function logTokenUsage(
	taskIn: number,
	taskOut: number,
	totalIn: number,
	totalOut: number,
	taskCost?: string,
	sessionCost?: string,
): void {
	// Format with emoji hints for clarity
	const taskTokens = `📖 Read: ${taskIn.toLocaleString()} → ✍️  Wrote: ${taskOut.toLocaleString()}`;
	const costPart = taskCost ? pc.yellow(` (${taskCost})`) : "";

	const sessionTotal = totalIn + totalOut;

	// Show session tokens vs daily quota (not context window)
	// Import quota tracking to get actual limits
	const sessionTokens = `${pc.dim("Session:")} ${sessionTotal.toLocaleString()} tokens`;
	const sessionCostPart = sessionCost ? pc.yellow(` (${sessionCost})`) : "";

	console.log(
		pc.cyan("[TOKENS]"),
		taskTokens + costPart,
		pc.dim("│"),
		sessionTokens + sessionCostPart,
	);
}

/**
 * Log quota usage with rate limit warnings
 */
export function logQuotaUsage(
	totalTokens: number,
	dailyLimit: number,
	percentUsed: number,
	tier: string,
): void {
	const status =
		percentUsed >= 95
			? pc.red("CRITICAL")
			: percentUsed >= 80
				? pc.yellow("WARNING")
				: pc.green("OK");

	const tierLabel = tier.includes("5x") ? "Max 5x" : tier.includes("max") ? "Max 1x" : "Free";

	console.log(
		pc.cyan("[QUOTA]"),
		`${status} ${percentUsed.toFixed(1)}% used`,
		pc.dim("│"),
		`${totalTokens.toLocaleString()}/${dailyLimit.toLocaleString()} daily tokens`,
		pc.dim(`(${tierLabel} tier)`),
	);
}

/**
 * Log session cost summary (replaces old API-based quota check)
 */
export function logCostSummary(formattedCost: string, taskNumber: number): void {
	console.log(
		pc.magenta("[COST]"),
		`Session total: ${formattedCost}`,
		pc.dim(`(after task ${taskNumber})`),
	);
}

/**
 * Log persistent session estimate (rolling 5-hour window).
 *
 * Before learning:
 *   [SESSION] 3 tasks | 245.1K tokens | 12m 30s | ~$0.42 (sonnet)
 *
 * After learning (rate limit hit at least once):
 *   [SESSION] ~53% used | 7 tasks (est. ~6 left) | 245.1K / ~462K cap | ~$1.27 (sonnet)
 */
export function logSessionEstimate(formatted: string): void {
	console.log(pc.magenta("[SESSION]"), formatted);
}
