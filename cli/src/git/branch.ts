import simpleGit, { type SimpleGit } from "simple-git";
import { logDebug, logWarn } from "../ui/logger.ts";

/**
 * Slugify text for branch names
 */
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 50);
}

/**
 * Create a task branch
 */
export async function createTaskBranch(
	task: string,
	baseBranch: string,
	workDir = process.cwd(),
): Promise<string> {
	const git: SimpleGit = simpleGit(workDir);
	const branchName = `meeseeks/${slugify(task)}`;

	// Stash any changes
	let stashed = false;
	const status = await git.status();
	if (status.files.length > 0) {
		await git.stash(["push", "-m", "meeseeks-autostash"]);
		stashed = true;
	}

	try {
		// Checkout base branch and pull
		await git.checkout(baseBranch);
		await git.pull("origin", baseBranch).catch(() => {
			// Ignore pull errors
		});

		// Create new branch (or checkout if exists)
		try {
			await git.checkoutLocalBranch(branchName);
		} catch (error) {
			logDebug(`Branch ${branchName} already exists, checking out:`, error);
			await git.checkout(branchName);
		}
	} finally {
		// Pop stash if we stashed
		if (stashed) {
			try {
				await git.stash(["pop"]);
			} catch (popErr) {
				logWarn(
					`Failed to restore stashed changes. Run 'git stash list' to recover. Error: ${popErr}`,
				);
			}
		}
	}

	return branchName;
}

/**
 * Return to the base branch
 */
export async function returnToBaseBranch(
	baseBranch: string,
	workDir = process.cwd(),
): Promise<void> {
	const git: SimpleGit = simpleGit(workDir);
	try {
		await git.checkout(baseBranch);
	} catch (err) {
		logWarn(`Failed to checkout ${baseBranch}: ${err}`);
	}
}

/**
 * Get the current branch name
 */
export async function getCurrentBranch(workDir = process.cwd()): Promise<string> {
	const git: SimpleGit = simpleGit(workDir);
	const status = await git.status();
	return status.current || "";
}

/**
 * Check if the repository has any commits
 */
export async function hasCommits(workDir = process.cwd()): Promise<boolean> {
	const git: SimpleGit = simpleGit(workDir);
	try {
		await git.revparse(["HEAD"]);
		return true;
	} catch (error) {
		logDebug("rev-parse HEAD failed (no commits?):", error);
		return false;
	}
}

/**
 * Get the default base branch (main or master)
 * Returns empty string if no commits exist (unborn branch)
 */
export async function getDefaultBaseBranch(workDir = process.cwd()): Promise<string> {
	const git: SimpleGit = simpleGit(workDir);

	// Check if repo has any commits first
	const repoHasCommits = await hasCommits(workDir);
	if (!repoHasCommits) {
		// Repository has no commits yet - return empty to signal unborn branch
		return "";
	}

	// Try main first, then master
	const branches = await git.branchLocal();
	if (branches.all.includes("main")) return "main";
	if (branches.all.includes("master")) return "master";

	// Fall back to current branch
	return branches.current;
}

/**
 * Check if there are uncommitted changes
 */
export async function hasUncommittedChanges(workDir = process.cwd()): Promise<boolean> {
	const git: SimpleGit = simpleGit(workDir);
	const status = await git.status();
	return status.files.length > 0;
}
