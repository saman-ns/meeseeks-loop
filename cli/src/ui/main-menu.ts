import { existsSync } from "node:fs";
import { join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline/promises";
import pc from "picocolors";

export type MainMenuChoice =
	| "init"
	| "optimize-tokens"
	| "run-tasks"
	| "plan-mode"
	| "show-config"
	| "exit";

interface MenuStatus {
	hasInit: boolean;
	hasOptimization: boolean;
	hasPlan: boolean;
	hasPrd: boolean;
}

/**
 * Check status of various Meeseeks features
 */
function checkStatus(workDir: string): MenuStatus {
	return {
		hasInit: existsSync(join(workDir, ".meeseeks", "config.yaml")),
		hasOptimization:
			existsSync(join(workDir, "CLAUDE.md")) && existsSync(join(workDir, ".claudeignore")),
		hasPlan: existsSync(join(workDir, ".meeseeks", "plan.md")),
		hasPrd: existsSync(join(workDir, "PRD.md")) || existsSync(join(workDir, "PRD.yaml")),
	};
}

/**
 * Format status indicator for menu
 */
function statusLabel(done: boolean): string {
	return done ? pc.green("✓ ready") : pc.dim("not setup");
}

/**
 * Format PRD status for run tasks option
 */
function prdStatusLabel(hasPrd: boolean): string {
	return hasPrd ? pc.green("✓ PRD found") : pc.yellow("⚠ no PRD");
}

/**
 * Show main menu and get user's choice
 */
export async function showMainMenu(workDir: string): Promise<MainMenuChoice> {
	const status = checkStatus(workDir);

	console.log("");
	console.log("=".repeat(60));
	console.log(pc.bold(pc.cyan("                    🎯 Meeseeks Main Menu")));
	console.log("=".repeat(60));
	console.log("");
	console.log("What would you like to do?");
	console.log("");
	console.log(`  ${pc.bold("1.")} Initialize project         [${statusLabel(status.hasInit)}]`);
	console.log(
		`  ${pc.bold("2.")} Optimize tokens          [${statusLabel(status.hasOptimization)}]`,
	);
	console.log(`  ${pc.bold("3.")} Run tasks                [${prdStatusLabel(status.hasPrd)}]`);
	console.log(`  ${pc.bold("4.")} Plan mode                [${prdStatusLabel(status.hasPrd)}]`);
	console.log(`  ${pc.bold("5.")} Show config`);
	console.log(`  ${pc.bold("6.")} Exit`);
	console.log("");

	// Show quick recommendations
	if (!status.hasInit) {
		console.log(pc.yellow("  💡 Tip: Start with option 1 to initialize your project"));
	} else if (!status.hasOptimization) {
		console.log(pc.yellow("  💡 Tip: Run option 2 to optimize tokens (saves 50-80% in costs)"));
	} else if (!status.hasPrd) {
		console.log(pc.yellow("  💡 Tip: No PRD file found - consider initializing first"));
	}

	console.log("");
	const rl = readline.createInterface({ input, output });
	const answer = await rl.question(pc.cyan("Enter your choice (1-6): "));
	rl.close();

	const choice = answer.trim();

	switch (choice) {
		case "1":
			return "init";
		case "2":
			return "optimize-tokens";
		case "3":
			return "run-tasks";
		case "4":
			return "plan-mode";
		case "5":
			return "show-config";
		case "6":
			return "exit";
		default:
			console.log(pc.yellow("\nInvalid choice, showing menu again...\n"));
			return showMainMenu(workDir); // Recursive call to show menu again
	}
}

/**
 * Show a confirmation prompt for running tasks without init
 */
export async function confirmRunWithoutInit(): Promise<boolean> {
	console.log("");
	console.log(pc.yellow("⚠️  Project not initialized yet."));
	console.log(pc.yellow("   Running without .meeseeks/config.yaml may not work as expected."));
	console.log("");

	const rl = readline.createInterface({ input, output });
	const answer = await rl.question(pc.cyan("Continue anyway? (y/N): "));
	rl.close();

	return answer.trim().toLowerCase() === "y";
}

/**
 * Show a confirmation prompt for running tasks without optimization
 */
export async function confirmRunWithoutOptimization(): Promise<boolean> {
	console.log("");
	console.log(pc.yellow("⚠️  Token optimization not set up."));
	console.log(pc.yellow("   Agents may waste tokens exploring. Run --optimize-tokens first."));
	console.log("");

	const rl = readline.createInterface({ input, output });
	const answer = await rl.question(pc.cyan("Continue anyway? (y/N): "));
	rl.close();

	return answer.trim().toLowerCase() === "y";
}
