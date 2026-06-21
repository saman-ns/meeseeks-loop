/**
 * Local cost estimation and quota tracking for Claude API usage.
 *
 * Tracks both:
 * 1. Session cost (for billing estimates)
 * 2. Rate limit usage (tokens per minute/day based on tier)
 */

import { logDebug } from "../ui/logger.ts";

// Pricing per million tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
	sonnet: { input: 3, output: 15 },
	opus: { input: 15, output: 75 },
};

// Claude Max 5x rate limits (tokens per minute)
// Source: https://docs.claude.com/en/api/rate-limits
const RATE_LIMITS = {
	claude_max_5x: {
		tokensPerMinute: 200_000, // 5x base tier
		tokensPerDay: 10_000_000, // Estimated daily limit
		requestsPerMinute: 250, // 5x base tier of 50 RPM
	},
	claude_max_1x: {
		tokensPerMinute: 40_000,
		tokensPerDay: 2_000_000,
		requestsPerMinute: 50,
	},
	free: {
		tokensPerMinute: 20_000,
		tokensPerDay: 300_000,
		requestsPerMinute: 5,
	},
};

// Session-level accumulator
let sessionCostUsd = 0;
let sessionTasks = 0;
let sessionStartTime = Date.now();
let sessionTotalTokens = 0;

// User's rate limit tier (detect from credentials or environment)
let rateLimitTier: keyof typeof RATE_LIMITS = "claude_max_5x";

/**
 * Estimate cost for a single task based on token usage and model.
 */
export function estimateTaskCost(
	inputTokens: number,
	outputTokens: number,
	model?: string,
): number {
	const pricing = MODEL_PRICING[model || "sonnet"] || MODEL_PRICING.sonnet;
	const inputCost = (inputTokens / 1_000_000) * pricing.input;
	const outputCost = (outputTokens / 1_000_000) * pricing.output;
	return inputCost + outputCost;
}

/**
 * Track a completed task's cost and return the task cost.
 */
export function trackTaskCost(inputTokens: number, outputTokens: number, model?: string): number {
	const cost = estimateTaskCost(inputTokens, outputTokens, model);
	const totalTokens = inputTokens + outputTokens;

	sessionCostUsd += cost;
	sessionTasks++;
	sessionTotalTokens += totalTokens;

	return cost;
}

/**
 * Format a dollar amount for display.
 */
export function formatCost(usd: number): string {
	if (usd < 0.001) return "<$0.001";
	if (usd < 0.01) return `~$${usd.toFixed(4)}`;
	if (usd < 1) return `~$${usd.toFixed(3)}`;
	return `~$${usd.toFixed(2)}`;
}

/**
 * Get the current session cost summary with rate limit usage.
 */
export function getSessionCost(): {
	totalUsd: number;
	taskCount: number;
	totalTokens: number;
	dailyLimit: number;
	percentUsed: number;
	tier: string;
} {
	const limits = RATE_LIMITS[rateLimitTier];
	const percentUsed = (sessionTotalTokens / limits.tokensPerDay) * 100;

	return {
		totalUsd: sessionCostUsd,
		taskCount: sessionTasks,
		totalTokens: sessionTotalTokens,
		dailyLimit: limits.tokensPerDay,
		percentUsed,
		tier: rateLimitTier,
	};
}

/**
 * Set the user's rate limit tier (call this at startup if you can detect it).
 */
export function setRateLimitTier(tier: keyof typeof RATE_LIMITS): void {
	rateLimitTier = tier;
}

/**
 * Detect rate limit tier from Claude credentials.
 */
export function detectRateLimitTier(): keyof typeof RATE_LIMITS {
	try {
		const fs = require("node:fs");
		const os = require("node:os");
		const path = require("node:path");

		const credPath = path.join(os.homedir(), ".claude", ".credentials.json");
		if (fs.existsSync(credPath)) {
			const creds = JSON.parse(fs.readFileSync(credPath, "utf-8"));
			const tier = creds.claudeAiOauth?.rateLimitTier;

			if (tier?.includes("5x")) {
				return "claude_max_5x";
			}
			if (tier?.includes("max") || creds.claudeAiOauth?.subscriptionType === "max") {
				return "claude_max_1x";
			}
		}
	} catch (error) {
		logDebug("Failed to detect rate limit tier from credentials:", error);
	}

	return "claude_max_5x"; // Default assumption
}

/**
 * Reset session cost tracking (for testing or new sessions).
 */
export function resetSessionCost(): void {
	sessionCostUsd = 0;
	sessionTasks = 0;
	sessionTotalTokens = 0;
	sessionStartTime = Date.now();
}

/**
 * Check if approaching rate limits and return warning if needed.
 */
export function checkRateLimitWarning(): string | null {
	const session = getSessionCost();

	if (session.percentUsed >= 95) {
		return `⚠️  CRITICAL: ${session.percentUsed.toFixed(1)}% of daily quota used (${session.totalTokens.toLocaleString()}/${session.dailyLimit.toLocaleString()} tokens)`;
	}

	if (session.percentUsed >= 80) {
		return `⚠️  WARNING: ${session.percentUsed.toFixed(1)}% of daily quota used (${session.totalTokens.toLocaleString()}/${session.dailyLimit.toLocaleString()} tokens)`;
	}

	return null;
}
