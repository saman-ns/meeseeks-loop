import { existsSync } from "node:fs";
import { join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline/promises";
import pc from "picocolors";
import { loadConfig } from "../config/loader.ts";
import { checkTokenOptimization } from "../skills/token-optimize.ts";
import { createTaskSource } from "../tasks/index.ts";
import { drawBox, formatNumber, statusIndicator } from "./formatting.ts";
import { showMascot } from "./mascot.ts";

export type MenuAction =
	| { type: "run-auto" }
	| { type: "run-interactive" }
	| { type: "run-plan" }
	| { type: "run-parallel" }
	| { type: "init" }
	| { type: "optimize" }
	| { type: "settings" }
	| { type: "exit" };

interface ProjectStatus {
	// Project info
	projectName: string;
	language: string;
	framework: string;

	// Setup status
	hasConfig: boolean;
	hasOptimization: boolean;
	hasPrd: boolean;
	prdFile: string | null;

	// Task info
	totalTasks: number;
	completedTasks: number;
	remainingTasks: number;
	progressPercent: number;

	// Cost info
	estimatedTokens: number;
	estimatedCost: number;
	model: string;
}

/**
 * Detect project status by checking files and counting tasks
 */
async function detectProjectStatus(workDir: string): Promise<ProjectStatus> {
	const config = loadConfig(workDir);

	// Check setup status
	const hasConfig = existsSync(join(workDir, ".meeseeks", "config.yaml"));
	const hasOptimization = checkTokenOptimization(workDir);

	// Detect PRD file
	let hasPrd = false;
	let prdFile: string | null = null;
	let prdSource: "markdown" | "yaml" | null = null;

	if (existsSync(join(workDir, "PRD.yaml"))) {
		hasPrd = true;
		prdFile = "PRD.yaml";
		prdSource = "yaml";
	} else if (existsSync(join(workDir, "PRD.md"))) {
		hasPrd = true;
		prdFile = "PRD.md";
		prdSource = "markdown";
	}

	// Count tasks if PRD exists
	let totalTasks = 0;
	let completedTasks = 0;
	let remainingTasks = 0;

	if (hasPrd && prdSource && prdFile) {
		try {
			const taskSource = createTaskSource({
				type: prdSource,
				filePath: prdFile,
			});

			const allTasks = await taskSource.getAllTasks();
			totalTasks = allTasks.length;
			completedTasks = allTasks.filter((t) => t.completed).length;
			remainingTasks = await taskSource.countRemaining();

			taskSource.dispose();
		} catch (error) {
			// If task counting fails, continue with zeros
		}
	}

	const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

	// Estimate cost: ~3000 tokens per task, $3 per 1M tokens (Sonnet)
	const estimatedTokens = remainingTasks * 3000;
	const estimatedCost = (estimatedTokens / 1_000_000) * 3;

	return {
		projectName: config?.project?.name || "Unnamed Project",
		language: config?.project?.language || "Unknown",
		framework: config?.project?.framework || "None",
		hasConfig,
		hasOptimization,
		hasPrd,
		prdFile,
		totalTasks,
		completedTasks,
		remainingTasks,
		progressPercent,
		estimatedTokens,
		estimatedCost,
		model: "claude-sonnet-4.5",
	};
}

/**
 * Render the status dashboard
 */
function renderStatusDashboard(status: ProjectStatus): void {
	console.log("");

	// Single consolidated setup info with solid lines
	const setupStatus = status.hasConfig ? true : "warn";
	const optimizationStatus = status.hasOptimization ? true : "warn";
	const prdStatus = !!status.hasPrd;

	console.log("─".repeat(60));
	console.log(
		`  Config:        ${statusIndicator(setupStatus, "Ready", "Missing")}    (.meeseeks/config)`,
	);
	console.log(`  Optimization:  ${statusIndicator(optimizationStatus, "Ready", "Missing")}`);
	console.log(
		`  PRD File:      ${statusIndicator(prdStatus, `Found    (${status.prdFile})`, "Not Found")}`,
	);
	console.log(
		`  Tasks:         ${formatNumber(status.completedTasks)}/${formatNumber(status.totalTasks)}`,
	);
	console.log(`  Model:         ${status.model}`);
	console.log(
		`  Cost:          ~$${status.estimatedCost.toFixed(2)} (~${formatNumber(status.estimatedTokens)} tokens)`,
	);
	console.log("─".repeat(60));
	console.log("");

	// Show tips for incomplete setup
	if (!status.hasConfig) {
		console.log(pc.yellow("  💡 Tip: Run option 4 to initialize your project"));
		console.log("");
	} else if (!status.hasOptimization) {
		console.log(pc.yellow("  💡 Tip: Run option 5 to optimize tokens (saves 50-80% costs)"));
		console.log("");
	} else if (!status.hasPrd) {
		console.log(pc.yellow("  ⚠ No PRD file found (PRD.md or PRD.yaml)"));
		console.log("");
		console.log(pc.dim("  💡 Create a PRD file to define your tasks, or use:"));
		console.log(pc.dim('     - meeseeks "task description" for single tasks'));
		console.log(pc.dim("     - meeseeks --github owner/repo for GitHub issues"));
		console.log("");
	}
}

/**
 * Render action menu
 */
function renderActionMenu(status: ProjectStatus): void {
	console.log("─".repeat(60));
	console.log("");

	// Run actions (only if PRD exists)
	if (status.hasPrd && status.remainingTasks > 0) {
		console.log(`  ${pc.bold("1.")} Auto`);
		console.log(`  ${pc.bold("2.")} Interactive`);
		console.log(`  ${pc.bold("3.")} Plan mode`);
		console.log(`  ${pc.bold("4.")} Parallel`);
		console.log("");
	} else if (status.hasPrd && status.remainingTasks === 0) {
		console.log(pc.green("  ✓ All tasks completed!"));
		console.log("");
	} else {
		console.log(pc.dim(`  ${pc.bold("1-4.")} (no PRD file)`));
		console.log("");
	}

	// Setup actions
	console.log(`  ${pc.bold("5.")} Initialize project`);
	console.log(`  ${pc.bold("6.")} Optimize`);
	console.log(`  ${pc.bold("7.")} Settings`);
	console.log("");

	// Exit
	console.log(`  ${pc.bold("8.")} Exit`);
	console.log("");
	console.log("─".repeat(60));
	console.log("");
}

/**
 * Show status menu and get user's action choice
 */
export async function showStatusMenu(workDir: string): Promise<MenuAction> {
	// Show mascot first
	showMascot();

	// Detect status
	const status = await detectProjectStatus(workDir);

	// Render dashboard
	renderStatusDashboard(status);

	// Render action menu
	renderActionMenu(status);

	// Get user input with spacing
	const rl = readline.createInterface({ input, output });
	const answer = await rl.question(pc.cyan("Enter choice (1-8): "));
	rl.close();

	// Add blank lines for better UI spacing
	console.log("");
	console.log("");

	const choice = answer.trim();

	// Handle choice
	switch (choice) {
		case "1":
			if (!status.hasPrd) {
				console.log(pc.yellow("⚠ Cannot run tasks: No PRD file found\n"));
				return showStatusMenu(workDir);
			}
			if (status.remainingTasks === 0) {
				console.log(pc.green("✓ All tasks already completed!\n"));
				return showStatusMenu(workDir);
			}
			return { type: "run-auto" };

		case "2":
			if (!status.hasPrd) {
				console.log(pc.yellow("⚠ Cannot run tasks: No PRD file found\n"));
				return showStatusMenu(workDir);
			}
			if (status.remainingTasks === 0) {
				console.log(pc.green("✓ All tasks already completed!\n"));
				return showStatusMenu(workDir);
			}
			return { type: "run-interactive" };

		case "3":
			if (!status.hasPrd) {
				console.log(pc.yellow("⚠ Cannot run tasks: No PRD file found\n"));
				return showStatusMenu(workDir);
			}
			if (status.remainingTasks === 0) {
				console.log(pc.green("✓ All tasks already completed!\n"));
				return showStatusMenu(workDir);
			}
			return { type: "run-plan" };

		case "4":
			if (!status.hasPrd) {
				console.log(pc.yellow("⚠ Cannot run tasks: No PRD file found\n"));
				return showStatusMenu(workDir);
			}
			if (status.remainingTasks === 0) {
				console.log(pc.green("✓ All tasks already completed!\n"));
				return showStatusMenu(workDir);
			}
			return { type: "run-parallel" };

		case "5":
			return { type: "init" };

		case "6":
			return { type: "optimize" };

		case "7":
			return { type: "settings" };

		case "8":
			return { type: "exit" };

		default:
			console.log(pc.yellow("Invalid choice. Please enter 1-8.\n"));
			return showStatusMenu(workDir);
	}
}
