import simpleGit, { type SimpleGit } from "simple-git";
import { execCommand } from "../engines/base.ts";
import { logDebug, logInfo, logSuccess, logWarn } from "../ui/logger.ts";

/**
 * Push a branch to origin
 */
export async function pushBranch(branch: string, workDir = process.cwd()): Promise<boolean> {
	const git: SimpleGit = simpleGit(workDir);

	try {
		await git.push("origin", branch, ["--set-upstream"]);
		return true;
	} catch (error) {
		logDebug(`Failed to push branch ${branch}:`, error);
		return false;
	}
}

/**
 * Create a pull request using gh CLI
 */
export async function createPullRequest(
	branch: string,
	baseBranch: string,
	title: string,
	body: string,
	draft = false,
	workDir = process.cwd(),
): Promise<string | null> {
	// Push branch first
	const pushed = await pushBranch(branch, workDir);
	if (!pushed) {
		return null;
	}

	// Build gh pr create command args
	const args = [
		"pr",
		"create",
		"--base",
		baseBranch,
		"--head",
		branch,
		"--title",
		title,
		"--body",
		body,
	];

	if (draft) {
		args.push("--draft");
	}

	// Execute gh CLI
	const { stdout, exitCode } = await execCommand("gh", args, workDir);

	if (exitCode !== 0) {
		return null;
	}

	// Return the PR URL (gh outputs the URL on success)
	return stdout.trim() || null;
}

/**
 * Poll until a PR is merged or closed. Returns true if merged, false if closed without merge.
 * Blocks the sequential loop — use only with --wait-for-pr-merge.
 */
export async function waitForPrMerge(
	prUrl: string,
	workDir: string,
	pollIntervalMs = 60_000,
): Promise<boolean> {
	const match = prUrl.match(/\/pull\/(\d+)$/);
	if (!match) {
		logWarn(`Could not extract PR number from URL: ${prUrl}`);
		return false;
	}
	const prNumber = match[1];
	logInfo(`⏳ Waiting for PR #${prNumber} to be merged before proceeding...`);

	while (true) {
		const { stdout, exitCode } = await execCommand(
			"gh",
			["pr", "view", prNumber, "--json", "state,mergedAt"],
			workDir,
		);

		if (exitCode === 0) {
			try {
				const data = JSON.parse(stdout.trim()) as { state: string; mergedAt: string | null };
				if (data.state === "MERGED" || data.mergedAt) {
					logSuccess(`PR #${prNumber} merged — continuing to next task.`);
					return true;
				}
				if (data.state === "CLOSED") {
					logWarn(`PR #${prNumber} was closed without merging — marking task failed.`);
					return false;
				}
				logDebug(
					`PR #${prNumber} state=${data.state}, checking again in ${pollIntervalMs / 1000}s`,
				);
			} catch {
				logDebug(`Failed to parse PR state JSON, retrying in ${pollIntervalMs / 1000}s`);
			}
		}

		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
	}
}

/**
 * Check if gh CLI is available and authenticated
 */
export async function isGhAvailable(): Promise<boolean> {
	try {
		const { exitCode } = await execCommand("gh", ["auth", "status"], process.cwd());
		return exitCode === 0;
	} catch (error) {
		logDebug("gh CLI not available or not authenticated:", error);
		return false;
	}
}

/**
 * Get the remote URL for origin
 */
export async function getOriginUrl(workDir = process.cwd()): Promise<string | null> {
	const git: SimpleGit = simpleGit(workDir);

	try {
		const remotes = await git.getRemotes(true);
		const origin = remotes.find((r) => r.name === "origin");
		return origin?.refs?.fetch || null;
	} catch (error) {
		logDebug("Failed to get origin URL:", error);
		return null;
	}
}
