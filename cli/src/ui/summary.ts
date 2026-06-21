import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline/promises";
import type { RuntimeOptions } from "../config/types.ts";
import type { MeeseeksConfig } from "../config/types.ts";
import type { AIEngine } from "../engines/types.ts";
import { logInfo } from "./logger.ts";

export interface PreRunSummary {
	engine: string;
	model: string;
	tasksRemaining: number;
	estimatedTokens?: number;
	prdFile: string;
	configFile: string;
	tokenOptimization: "enabled" | "partial" | "disabled";
	executionMode: "sequential" | "parallel";
}

export type RunMode = "auto" | "interactive" | "plan" | "cancel";

/**
 * Display pre-run summary and prompt for execution mode
 */
export async function showPreRunSummary(
	summary: PreRunSummary,
	options: RuntimeOptions,
): Promise<RunMode> {
	console.log("");
	console.log("=".repeat(60));
	console.log("                    🤖 Meeseeks Pre-Run Summary");
	console.log("=".repeat(60));
	console.log("");
	console.log(`  AI Engine:          ${summary.engine}`);
	console.log(`  Model:              ${summary.model}`);
	console.log(`  Execution Mode:     ${summary.executionMode}`);
	if (summary.executionMode === "parallel") {
		console.log(`  Max Parallel:       ${options.maxParallel}`);
	}
	console.log(`  Tasks Remaining:    ${summary.tasksRemaining}`);
	if (summary.estimatedTokens) {
		console.log(`  Estimated Tokens:   ~${summary.estimatedTokens.toLocaleString()} tokens`);
	}
	console.log("");
	console.log(`  PRD File:           ${summary.prdFile}`);
	console.log(`  Config:             ${summary.configFile}`);
	console.log(`  Token Optimization: ${summary.tokenOptimization}`);
	console.log("");
	console.log("=".repeat(60));
	console.log("");
	console.log("Choose execution mode:");
	console.log("");
	console.log("  1. Run as-is (auto mode) - Execute all tasks without prompting");
	console.log("  2. Run interactive - Prompt before each task (Y/n/s/a/q)");
	console.log("  3. Enable planning mode - AI creates execution plan first");
	console.log("  4. Cancel - Exit without running");
	console.log("");

	const rl = readline.createInterface({ input, output });
	const answer = await rl.question("Enter your choice (1-4): ");
	rl.close();

	const choice = answer.trim();

	switch (choice) {
		case "1":
			return "auto";
		case "2":
			return "interactive";
		case "3":
			return "plan";
		case "4":
			return "cancel";
		default:
			logInfo("Invalid choice, defaulting to auto mode");
			return "auto";
	}
}

/**
 * Build pre-run summary from options and config
 */
export function buildPreRunSummary(
	engine: AIEngine,
	tasksRemaining: number,
	options: RuntimeOptions,
	config: MeeseeksConfig | null,
	tokenOptimizationStatus: boolean,
): PreRunSummary {
	const executionMode = options.parallel ? "parallel" : "sequential";

	let tokenOptimization: "enabled" | "partial" | "disabled" = "disabled";
	if (tokenOptimizationStatus && options.optimizeTokens) {
		tokenOptimization = "enabled";
	} else if (tokenOptimizationStatus) {
		tokenOptimization = "partial";
	}

	// Estimate tokens based on historical data (rough approximation)
	// Average ~3000 tokens per task for Sonnet (based on analytics)
	const estimatedTokens = tasksRemaining * 3000;

	return {
		engine: engine.name,
		model: options.modelOverride || "sonnet",
		tasksRemaining,
		estimatedTokens,
		prdFile: options.prdFile,
		configFile: ".meeseeks/config.yaml",
		tokenOptimization,
		executionMode,
	};
}
