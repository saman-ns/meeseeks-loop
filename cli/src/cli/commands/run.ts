import { existsSync } from "node:fs";
import { loadConfig } from "../../config/loader.ts";
import type { RuntimeOptions } from "../../config/types.ts";
import { createEngine, isEngineAvailable } from "../../engines/index.ts";
import type { AIEngineName } from "../../engines/types.ts";
import { isBrowserAvailable } from "../../execution/browser.ts";
import { acquireLock } from "../../execution/lock.ts";
import { runParallel } from "../../execution/parallel.ts";
import { runPlanningMode } from "../../execution/planning.ts";
import { type ExecutionResult, runSequential } from "../../execution/sequential.ts";
import { getDefaultBaseBranch } from "../../git/branch.ts";
import { sendNotifications } from "../../notifications/webhook.ts";
import { checkTokenOptimization } from "../../skills/token-optimize.ts";
import { CachedTaskSource, createTaskSource } from "../../tasks/index.ts";
import {
	formatDuration,
	formatTokens,
	logError,
	logInfo,
	logSuccess,
	logWarn,
	setVerbose,
} from "../../ui/logger.ts";
import { notifyAllComplete } from "../../ui/notify.ts";
import { buildActiveSettings } from "../../ui/settings.ts";

/**
 * Run the PRD loop (multiple tasks from file/GitHub)
 */
export async function runLoop(options: RuntimeOptions): Promise<void> {
	const workDir = process.cwd();
	const startTime = Date.now();
	const config = loadConfig(workDir);

	// Set verbose mode
	setVerbose(options.verbose);

	// Validate PRD source
	if (options.prdSource === "markdown" || options.prdSource === "yaml") {
		if (!existsSync(options.prdFile)) {
			logError(`${options.prdFile} not found in current directory`);
			logInfo(`Create a ${options.prdFile} file with tasks`);
			process.exit(1);
		}
	} else if (options.prdSource === "markdown-folder") {
		if (!existsSync(options.prdFile)) {
			logError(`PRD folder ${options.prdFile} not found`);
			logInfo(`Create a ${options.prdFile}/ folder with markdown files containing tasks`);
			process.exit(1);
		}
	}

	if (options.prdSource === "github" && !options.githubRepo) {
		logError("GitHub repository not specified. Use --github owner/repo");
		process.exit(1);
	}

	// Check engine availability
	const engine = createEngine(options.aiEngine as AIEngineName);
	const available = await isEngineAvailable(options.aiEngine as AIEngineName);

	if (!available) {
		logError(`${engine.name} CLI not found. Make sure '${engine.cliCommand}' is in your PATH.`);
		process.exit(1);
	}

	// Create task source with caching for better performance
	// Caching reduces file I/O by loading tasks once and batching writes
	const innerTaskSource = createTaskSource({
		type: options.prdSource,
		filePath: options.prdFile,
		repo: options.githubRepo,
		label: options.githubLabel,
	});
	const taskSource = new CachedTaskSource(innerTaskSource);

	// Check if there are tasks
	const remaining = await taskSource.countRemaining();
	if (remaining === 0) {
		logSuccess("No tasks remaining. All done!");
		return;
	}

	// Get base branch if needed
	let baseBranch = options.baseBranch;
	if ((options.branchPerTask || options.parallel || options.createPr) && !baseBranch) {
		baseBranch = await getDefaultBaseBranch(workDir);

		// Check if base branch is empty (unborn branch - no commits yet)
		if (!baseBranch) {
			logError("Cannot run in parallel/branch mode: repository has no commits yet.");
			logInfo("Please make an initial commit first:");
			logInfo('  git add . && git commit -m "Initial commit"');
			process.exit(1);
		}
	}

	// Token optimization pre-check: ensure CLAUDE.md, .claudeignore, config.yaml exist
	const tokenOptimizationStatus = checkTokenOptimization(workDir);
	if (options.optimizeTokens) {
		logInfo("Running token optimization pre-check...");
		if (!tokenOptimizationStatus) {
			logWarn(
				"Token optimization incomplete. Run 'meeseeks --optimize-tokens' to generate missing files.",
			);
			logWarn("Proceeding without full optimization — agents may waste tokens exploring.");
		} else {
			logSuccess("Token optimization: CLAUDE.md, .claudeignore, and config.yaml all present.");
		}
		console.log("");
	}

	// Execution mode is now chosen in the status menu, so we skip the pre-run summary
	// Run planning mode if enabled
	if (options.planMode) {
		// Load all tasks for planning
		const allTasks = await taskSource.getAllTasks();

		const planApproved = await runPlanningMode({
			workDir,
			engine,
			tasks: allTasks,
			projectInfo: config?.project
				? {
						name: config.project.name,
						language: config.project.language,
						framework: config.project.framework,
						description: config.project.description,
					}
				: undefined,
		});

		if (!planApproved) {
			logInfo("Planning cancelled by user");
			return;
		}
	}

	// Acquire process lock — prevents duplicate instances on the same project
	const releaseLock = acquireLock(workDir);

	logInfo(`Starting Meeseeks with ${engine.name}`);
	logInfo(`Tasks remaining: ${remaining}`);
	if (options.parallel) {
		logInfo(`Mode: Parallel (max ${options.maxParallel} agents)`);
	} else {
		logInfo("Mode: Sequential");
	}
	if (options.interactive) {
		logInfo("Interactive mode: will prompt before each task (Y/n/s/a/q)");
	}
	if (isBrowserAvailable(options.browserEnabled)) {
		logInfo("Browser automation enabled (agent-browser)");
	}
	console.log("");

	// Build active settings for display
	const activeSettings = buildActiveSettings(options);

	// Run tasks
	let result: ExecutionResult;
	try {
		if (options.parallel) {
			result = await runParallel({
				engine,
				taskSource,
				workDir,
				skipTests: options.skipTests,
				skipLint: options.skipLint,
				dryRun: options.dryRun,
				maxIterations: options.maxIterations,
				maxRetries: options.maxRetries,
				retryDelay: options.retryDelay,
				branchPerTask: options.branchPerTask,
				baseBranch,
				createPr: options.createPr,
				draftPr: options.draftPr,
				autoCommit: options.autoCommit,
				browserEnabled: options.browserEnabled,
				maxParallel: options.maxParallel,
				prdSource: options.prdSource,
				prdFile: options.prdFile,
				prdIsFolder: options.prdIsFolder,
				activeSettings,
				useSandbox: options.useSandbox,
				modelOverride: options.modelOverride,
				skipMerge: options.skipMerge,
				engineArgs: options.engineArgs,
			});
		} else {
			result = await runSequential({
				engine,
				taskSource,
				workDir,
				skipTests: options.skipTests,
				skipLint: options.skipLint,
				dryRun: options.dryRun,
				maxIterations: options.maxIterations,
				maxRetries: options.maxRetries,
				retryDelay: options.retryDelay,
				branchPerTask: options.branchPerTask,
				baseBranch,
				createPr: options.createPr,
				draftPr: options.draftPr,
				autoCommit: options.autoCommit,
				browserEnabled: options.browserEnabled,
				activeSettings,
				prdFile: options.prdFile,
				modelOverride: options.modelOverride,
				skipMerge: options.skipMerge,
				engineArgs: options.engineArgs,
				interactive: options.interactive,
				quotaCheckInterval: options.quotaCheckInterval,
			});
		}
	} finally {
		// Always release lock and flush, even on error
		await taskSource.flush();
		taskSource.dispose();
		releaseLock();
	}

	// Summary
	const duration = Date.now() - startTime;
	console.log("");
	console.log("=".repeat(50));
	logInfo("Summary:");
	console.log(`  Completed: ${result.tasksCompleted}`);
	console.log(`  Failed:    ${result.tasksFailed}`);
	console.log(`  Duration:  ${formatDuration(duration)}`);
	if (result.totalInputTokens > 0 || result.totalOutputTokens > 0) {
		console.log(`  Tokens:    ${formatTokens(result.totalInputTokens, result.totalOutputTokens)}`);
	}
	console.log("=".repeat(50));

	// Send webhook notifications
	const status = result.tasksFailed > 0 ? "failed" : "completed";
	await sendNotifications(config, status, {
		tasksCompleted: result.tasksCompleted,
		tasksFailed: result.tasksFailed,
	});

	if (result.tasksCompleted > 0) {
		notifyAllComplete(result.tasksCompleted);
	}

	if (result.tasksFailed > 0) {
		process.exit(1);
	}
}
