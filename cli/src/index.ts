#!/usr/bin/env node
import { parseArgs } from "./cli/args.ts";
import { addRule, showConfig } from "./cli/commands/config.ts";
import { runInit } from "./cli/commands/init.ts";
import { runLoop } from "./cli/commands/run.ts";
import { runTask } from "./cli/commands/task.ts";
import { flushAllProgressWrites } from "./config/writer.ts";
import { runTokenOptimize } from "./skills/token-optimize.ts";
import { logError, logInfo } from "./ui/logger.ts";
import { showStatusMenu } from "./ui/status-menu.ts";

async function main(): Promise<void> {
	try {
		const {
			options,
			task,
			initMode,
			initInteractive,
			showConfig: showConfigMode,
			addRule: rule,
			optimizeTokensMode,
		} = parseArgs(process.argv);

		// Check if running with no arguments (show main menu)
		const isNoArgs = process.argv.length === 2; // Just 'node' and script path
		const isHelpOrVersion =
			process.argv.includes("-h") ||
			process.argv.includes("--help") ||
			process.argv.includes("-V") ||
			process.argv.includes("--version");

		// Show status menu if no arguments provided
		if (isNoArgs && !isHelpOrVersion) {
			const action = await showStatusMenu(process.cwd());

			switch (action.type) {
				case "run-auto":
					options.interactive = false;
					options.planMode = false;
					options.parallel = false;
					break;

				case "run-interactive":
					options.interactive = true;
					options.planMode = false;
					options.parallel = false;
					break;

				case "run-plan":
					options.planMode = true;
					options.interactive = false;
					options.parallel = false;
					break;

				case "run-parallel":
					options.parallel = true;
					options.interactive = false;
					options.planMode = false;
					break;

				case "init":
					await runInit(process.cwd(), true);
					return;

				case "optimize":
					await runTokenOptimize();
					return;

				case "settings":
					await showConfig();
					return;

				case "exit":
					logInfo("Goodbye!");
					return;
			}

			// For run actions, auto-detect PRD file
			const fs = await import("node:fs");
			if (fs.existsSync("PRD.yaml")) {
				options.prdSource = "yaml";
				options.prdFile = "PRD.yaml";
			} else if (fs.existsSync("PRD.md")) {
				options.prdSource = "markdown";
				options.prdFile = "PRD.md";
			} else {
				logError("No PRD file found");
				return;
			}
		}

		// Mascot is now shown in status menu for no-args mode
		// For direct execution (with args), still show mascot
		const isActualExecution =
			!initMode && !initInteractive && !showConfigMode && !rule && !isHelpOrVersion && !isNoArgs;

		if (isActualExecution) {
			const { showMascot } = await import("./ui/mascot.ts");
			showMascot();
		}

		// Handle --init-interactive
		if (initInteractive) {
			await runInit(process.cwd(), true);
			return;
		}

		// Handle --init
		if (initMode) {
			await runInit(process.cwd(), false);
			return;
		}

		// Handle --config
		if (showConfigMode) {
			await showConfig();
			return;
		}

		// Handle --add-rule
		if (rule) {
			await addRule(rule);
			return;
		}

		// Handle --optimize-tokens (standalone command mode — only when no PRD/yaml/github source)
		const hasTaskSource = options.prdSource === "yaml" || options.prdSource === "github";
		if (optimizeTokensMode && !task && !hasTaskSource) {
			await runTokenOptimize();
			return;
		}

		// Single task mode (brownfield)
		if (task) {
			await runTask(task, options);
			return;
		}

		// PRD loop mode
		await runLoop(options);
	} catch (error) {
		logError(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	} finally {
		// Ensure all progress writes are flushed before exit
		await flushAllProgressWrites();
	}
}

main();
