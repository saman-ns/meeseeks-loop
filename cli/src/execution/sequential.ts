import * as readline from "node:readline";
import { logTaskProgress } from "../config/writer.ts";
import type { AIEngine, AIResult } from "../engines/types.ts";
import { createTaskBranch, returnToBaseBranch } from "../git/branch.ts";
import { createPullRequest, waitForPrMerge } from "../git/pr.ts";
import type { Task, TaskSource } from "../tasks/types.ts";
import {
	logCostSummary,
	logDebug,
	logError,
	logInfo,
	logSessionEstimate,
	logSuccess,
	logTokenUsage,
	logWarn,
} from "../ui/logger.ts";
import { notifyTaskComplete, notifyTaskFailed } from "../ui/notify.ts";
import { ProgressSpinner } from "../ui/spinner.ts";
import {
	type TaskRecord,
	endRun,
	formatSessionEstimate,
	getSessionEstimate,
	recordRateLimitHit,
	recordSuccessfulRun,
	recordTask,
	startRun,
} from "./analytics.ts";
import { clearDeferredTask, recordDeferredTask } from "./deferred.ts";
import { buildPrompt } from "./prompt.ts";
import {
	checkRateLimitWarning,
	detectRateLimitTier,
	estimateTaskCost,
	formatCost,
	getSessionCost,
	setRateLimitTier,
	trackTaskCost,
} from "./quota.ts";
import { isRetryableError, withRetry } from "./retry.ts";

export interface ExecutionOptions {
	engine: AIEngine;
	taskSource: TaskSource;
	workDir: string;
	skipTests: boolean;
	skipLint: boolean;
	dryRun: boolean;
	maxIterations: number;
	maxRetries: number;
	retryDelay: number;
	branchPerTask: boolean;
	baseBranch: string;
	createPr: boolean;
	draftPr: boolean;
	autoCommit: boolean;
	browserEnabled: "auto" | "true" | "false";
	prdFile?: string;
	/** Active settings to display in spinner */
	activeSettings?: string[];
	/** Override default model for the engine */
	modelOverride?: string;
	/** Skip automatic branch merging after parallel execution */
	skipMerge?: boolean;
	/** Use lightweight sandboxes instead of git worktrees for parallel execution */
	useSandbox?: boolean;
	/** Additional arguments to pass to the engine CLI */
	engineArgs?: string[];
	/** Interactive mode: prompt before each task */
	interactive?: boolean;
	/** How often to check Anthropic API quota (every N tasks) */
	quotaCheckInterval?: number;
	/** Wait for PR to be merged before marking task complete */
	waitForPrMerge?: boolean;
	/** Shell command to run after agent completes to verify correctness */
	verifyCommand?: string;
}

export interface ExecutionResult {
	tasksCompleted: number;
	tasksFailed: number;
	totalInputTokens: number;
	totalOutputTokens: number;
}

/**
 * Prompt the user for interactive task approval.
 * Returns: 'proceed' | 'skip' | 'auto' | 'quit'
 */
async function promptInteractive(
	taskTitle: string,
	taskBody: string,
): Promise<"proceed" | "skip" | "auto" | "quit"> {
	console.log("");
	console.log("─".repeat(60));
	console.log(`  Task: ${taskTitle}`);
	if (taskBody && taskBody !== taskTitle) {
		// Show first 5 lines of the task body
		const bodyLines = taskBody.split("\n").slice(0, 5);
		for (const line of bodyLines) {
			console.log(`  ${line}`);
		}
		if (taskBody.split("\n").length > 5) {
			console.log("  ...");
		}
	}
	console.log("─".repeat(60));

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		rl.question("  Proceed with this task? [Y/n/s(kip)/a(uto)/q(uit)] > ", (answer) => {
			rl.close();
			const normalized = answer.trim().toLowerCase();
			if (normalized === "" || normalized === "y" || normalized === "yes") {
				resolve("proceed");
			} else if (normalized === "n" || normalized === "s" || normalized === "skip") {
				resolve("skip");
			} else if (normalized === "a" || normalized === "auto") {
				resolve("auto");
			} else if (normalized === "q" || normalized === "quit") {
				resolve("quit");
			} else {
				resolve("proceed"); // Default to proceed for unrecognized input
			}
		});
	});
}

/**
 * Run tasks sequentially
 */
export async function runSequential(options: ExecutionOptions): Promise<ExecutionResult> {
	const {
		engine,
		taskSource,
		workDir,
		skipTests,
		skipLint,
		dryRun,
		maxIterations,
		maxRetries,
		retryDelay,
		branchPerTask,
		baseBranch,
		createPr,
		draftPr,
		autoCommit,
		browserEnabled,
		activeSettings,
		modelOverride,
		engineArgs,
		quotaCheckInterval = 5,
		waitForPrMerge: shouldWaitForPrMerge = false,
		verifyCommand = "",
	} = options;

	// Interactive mode is mutable — can be toggled off via 'a' command
	let interactive = options.interactive || false;

	const result: ExecutionResult = {
		tasksCompleted: 0,
		tasksFailed: 0,
		totalInputTokens: 0,
		totalOutputTokens: 0,
	};

	let iteration = 0;
	let totalCompletedForQuota = 0;
	let abortDueToRetryableFailure = false;

	// Detect and set rate limit tier at start
	const detectedTier = detectRateLimitTier();
	setRateLimitTier(detectedTier);
	logDebug(`Detected rate limit tier: ${detectedTier}`);

	// Start persistent analytics run
	const analyticsModel = modelOverride || "sonnet";
	const runId = startRun(workDir, analyticsModel);
	let runCostUsd = 0;

	while (true) {
		// Check iteration limit
		if (maxIterations > 0 && iteration >= maxIterations) {
			logInfo(`Reached max iterations (${maxIterations})`);
			break;
		}

		// Get next task
		const task = await taskSource.getNextTask();
		if (!task) {
			logSuccess("All tasks completed!");
			break;
		}

		iteration++;
		const remaining = await taskSource.countRemaining();

		// Enhanced task info logging with session token tracking
		const { formatTaskInfo } = await import("../ui/task-formatter.ts");
		const sessionTokens = {
			input: result.totalInputTokens,
			output: result.totalOutputTokens,
		};
		console.log("");
		logInfo(formatTaskInfo(task, iteration, remaining, sessionTokens));

		// Interactive mode: prompt before executing
		if (interactive) {
			const decision = await promptInteractive(task.title, task.body || "");
			if (decision === "quit") {
				logInfo("User quit interactive mode.");
				break;
			}
			if (decision === "skip") {
				logInfo(`Skipped: ${task.title}`);
				continue;
			}
			if (decision === "auto") {
				logInfo("Switching to auto mode (interactive OFF).");
				interactive = false;
			}
			// 'proceed' falls through to execution
		}

		// Create branch if needed
		let branch: string | null = null;
		if (branchPerTask && baseBranch) {
			try {
				branch = await createTaskBranch(task.title, baseBranch, workDir);
				logDebug(`Created branch: ${branch}`);
			} catch (error) {
				logError(`Failed to create branch: ${error}`);
			}
		}

		// Parse blocker issue numbers from task body for context injection
		const blockerIssueNumbers = (task.body || "").matchAll(/blocked by\s+#(\d+)/gi);
		const parsedBlockers = [...blockerIssueNumbers]
			.map((m) => Number.parseInt(m[1], 10))
			.filter((n) => !Number.isNaN(n));

		// Build prompt
		const prompt = buildPrompt({
			task: task.body || task.title,
			autoCommit,
			workDir,
			browserEnabled,
			skipTests,
			skipLint,
			prdFile: options.prdFile,
			fileHints: task.files,
			blockerIssueNumbers: parsedBlockers,
		});

		// Execute with spinner (use compact format)
		const { formatCompactTaskInfo } = await import("../ui/task-formatter.ts");
		const compactTitle = formatCompactTaskInfo(task);
		const spinner = new ProgressSpinner(compactTitle, activeSettings);
		let aiResult: AIResult | null = null;
		const taskStartTime = Date.now();

		if (dryRun) {
			spinner.success("(dry run) Skipped");
		} else {
			try {
				aiResult = await withRetry(
					async () => {
						spinner.updateStep("Working");

						// Use streaming if available
						const engineOptions = {
							...(modelOverride && { modelOverride }),
							...(engineArgs && engineArgs.length > 0 && { engineArgs }),
						};
						let res: AIResult;
						if (engine.executeStreaming) {
							res = await engine.executeStreaming(
								prompt,
								workDir,
								(step) => {
									logDebug(`  → ${step}`);
									spinner.updateStep(step);
								},
								engineOptions,
							);
						} else {
							res = await engine.execute(prompt, workDir, engineOptions);
						}

						if (!res.success && res.error && isRetryableError(res.error)) {
							throw new Error(res.error);
						}

						return res;
					},
					{
						maxRetries,
						retryDelay,
						onRetry: (attempt) => {
							spinner.updateStep(`Retry ${attempt}`);
						},
					},
				);

				if (aiResult.success) {
					spinner.success(undefined, true); // Show timing breakdown
					result.totalInputTokens += aiResult.inputTokens;
					result.totalOutputTokens += aiResult.outputTokens;

					// Track cost and display per-task token usage with cost
					const taskCostUsd = trackTaskCost(
						aiResult.inputTokens,
						aiResult.outputTokens,
						aiResult.model,
					);
					const session = getSessionCost();
					logTokenUsage(
						aiResult.inputTokens,
						aiResult.outputTokens,
						result.totalInputTokens,
						result.totalOutputTokens,
						`${formatCost(taskCostUsd)} ${aiResult.model || "sonnet"}`,
						formatCost(session.totalUsd),
					);

					// Record task in persistent analytics
					const taskEndTime = Date.now();
					const taskRecord: TaskRecord = {
						title: task.title,
						startedAt: new Date(taskStartTime).toISOString(),
						endedAt: new Date(taskEndTime).toISOString(),
						durationMs: taskEndTime - taskStartTime,
						model: aiResult.model || analyticsModel,
						inputTokens: aiResult.inputTokens,
						outputTokens: aiResult.outputTokens,
						costUsd: taskCostUsd,
						success: true,
						retryCount: 0,
					};
					recordTask(workDir, taskRecord);
					runCostUsd += taskCostUsd;

					// Display persistent session estimate (rolling 5-hour window)
					const sessionEst = getSessionEstimate(workDir, analyticsModel);
					logSessionEstimate(formatSessionEstimate(sessionEst));

					// Check for rate limit warnings
					const warning = checkRateLimitWarning();
					if (warning) {
						logWarn(warning);
						if (session.percentUsed >= 95) {
							logWarn("Consider pausing Meeseeks to avoid hitting rate limits.");
							logInfo("Your quota will reset based on your tier's time window.");
						}
					}

					// Verify step: run user-supplied command before creating PR
					if (verifyCommand) {
						spinner.updateStep("Verifying");
						const { execCommand: exec } = await import("../engines/base.ts");
						const { exitCode: verifyExit, stderr: verifyStderr } = await exec(
							verifyCommand.split(" ")[0],
							verifyCommand.split(" ").slice(1),
							workDir,
						);
						if (verifyExit !== 0) {
							const verifyErr = `Verify command failed (exit ${verifyExit}): ${verifyStderr || verifyCommand}`;
							spinner.error(verifyErr);
							logTaskProgress(task.title, "failed", workDir);
							result.tasksFailed++;
							notifyTaskFailed(task.title, verifyErr);
							if (branchPerTask && baseBranch) {
								await returnToBaseBranch(baseBranch, workDir);
							}
							continue;
						}
						logSuccess(`Verify passed: ${verifyCommand}`);
					}

					// Create PR before marking complete (so failed PR doesn't lose the task)
					let prUrl: string | null = null;
					if (createPr && branch && baseBranch) {
						prUrl = await createPullRequest(
							branch,
							baseBranch,
							task.title,
							`Automated PR created by Meeseeks\n\n${aiResult.response}`,
							draftPr,
							workDir,
						);

						if (prUrl) {
							logSuccess(`PR created: ${prUrl}`);
						}
					}

					// Optionally wait for PR to be merged before proceeding
					if (shouldWaitForPrMerge && prUrl) {
						const merged = await waitForPrMerge(prUrl, workDir);
						if (!merged) {
							logWarn(`PR was closed without merging — task "${task.title}" not marked complete.`);
							result.tasksFailed++;
							notifyTaskFailed(task.title, "PR closed without merge");
							if (branchPerTask && baseBranch) {
								await returnToBaseBranch(baseBranch, workDir);
							}
							continue;
						}
					}

					// Mark task complete (after PR merge when --wait-for-pr-merge is set)
					await taskSource.markComplete(task.id);
					logTaskProgress(task.title, "completed", workDir);
					result.tasksCompleted++;
					totalCompletedForQuota++;

					notifyTaskComplete(task.title);
					clearDeferredTask(taskSource.type, task, workDir, options.prdFile);

					// Periodic cost summary
					if (quotaCheckInterval > 0 && totalCompletedForQuota % quotaCheckInterval === 0) {
						const sessionCost = getSessionCost();
						logCostSummary(formatCost(sessionCost.totalUsd), totalCompletedForQuota);
					}
				} else {
					const errMsg = aiResult.error || "Unknown error";
					// Record failed task in analytics
					const failEndTime = Date.now();
					recordTask(workDir, {
						title: task.title,
						startedAt: new Date(taskStartTime).toISOString(),
						endedAt: new Date(failEndTime).toISOString(),
						durationMs: failEndTime - taskStartTime,
						model: aiResult.model || analyticsModel,
						inputTokens: aiResult.inputTokens,
						outputTokens: aiResult.outputTokens,
						costUsd: estimateTaskCost(aiResult.inputTokens, aiResult.outputTokens, aiResult.model),
						success: false,
						retryCount: 0,
						error: errMsg,
					});

					if (isRetryableError(errMsg)) {
						// Record rate limit observation for capacity learning
						recordRateLimitHit(workDir, analyticsModel);

						const deferrals = recordDeferredTask(taskSource.type, task, workDir, options.prdFile);
						spinner.error(errMsg);
						if (deferrals >= maxRetries) {
							logError(`Task "${task.title}" failed after ${deferrals} deferrals: ${errMsg}`);
							logTaskProgress(task.title, "failed", workDir);
							result.tasksFailed++;
							notifyTaskFailed(task.title, errMsg);
							await taskSource.markComplete(task.id);
							clearDeferredTask(taskSource.type, task, workDir, options.prdFile);
						} else {
							logWarn(`Temporary failure, stopping early (${deferrals}/${maxRetries}): ${errMsg}`);
							result.tasksFailed++;
							abortDueToRetryableFailure = true;
						}
					} else {
						spinner.error(errMsg);
						logTaskProgress(task.title, "failed", workDir);
						result.tasksFailed++;
						notifyTaskFailed(task.title, errMsg);
						await taskSource.markComplete(task.id);
						clearDeferredTask(taskSource.type, task, workDir, options.prdFile);
					}
				}
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				// Record failed task in analytics (catch path)
				const catchEndTime = Date.now();
				recordTask(workDir, {
					title: task.title,
					startedAt: new Date(taskStartTime).toISOString(),
					endedAt: new Date(catchEndTime).toISOString(),
					durationMs: catchEndTime - taskStartTime,
					model: analyticsModel,
					inputTokens: 0,
					outputTokens: 0,
					costUsd: 0,
					success: false,
					retryCount: 0,
					error: errorMsg,
				});

				if (isRetryableError(errorMsg)) {
					// Record rate limit observation for capacity learning
					recordRateLimitHit(workDir, analyticsModel);

					const deferrals = recordDeferredTask(taskSource.type, task, workDir, options.prdFile);
					spinner.error(errorMsg);
					if (deferrals >= maxRetries) {
						logError(`Task "${task.title}" failed after ${deferrals} deferrals: ${errorMsg}`);
						logTaskProgress(task.title, "failed", workDir);
						result.tasksFailed++;
						notifyTaskFailed(task.title, errorMsg);
						await taskSource.markComplete(task.id);
						clearDeferredTask(taskSource.type, task, workDir, options.prdFile);
					} else {
						logWarn(`Temporary failure, stopping early (${deferrals}/${maxRetries}): ${errorMsg}`);
						result.tasksFailed++;
						abortDueToRetryableFailure = true;
					}
				} else {
					spinner.error(errorMsg);
					logTaskProgress(task.title, "failed", workDir);
					result.tasksFailed++;
					notifyTaskFailed(task.title, errorMsg);
					await taskSource.markComplete(task.id);
					clearDeferredTask(taskSource.type, task, workDir, options.prdFile);
				}
			}
		}

		// Return to base branch if we created one
		if (branchPerTask && baseBranch) {
			await returnToBaseBranch(baseBranch, workDir);
		}

		if (abortDueToRetryableFailure) {
			break;
		}
	}

	// End persistent analytics run
	endRun(workDir, runId, {
		totalTasks: result.tasksCompleted + result.tasksFailed,
		tasksCompleted: result.tasksCompleted,
		tasksFailed: result.tasksFailed,
		totalInputTokens: result.totalInputTokens,
		totalOutputTokens: result.totalOutputTokens,
		totalCostUsd: runCostUsd,
	});

	// If run completed without rate limit issues, record success to calibrate capacity
	if (!abortDueToRetryableFailure) {
		recordSuccessfulRun(workDir, analyticsModel);
	}

	return result;
}
