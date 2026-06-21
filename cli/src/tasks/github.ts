import { Octokit } from "@octokit/rest";
import type { Task, TaskSource } from "./types.ts";

/**
 * Cached GitHub issues data
 */
interface GitHubCache {
	openIssues: Task[];
	closedCount: number;
	lastFetched: number;
}

/** Cache TTL in milliseconds (30 seconds) */
const CACHE_TTL_MS = 30_000;

/**
 * Parse issue numbers from "Blocked by #N" lines in an issue body.
 * Handles formats: "Blocked by #8", "- Blocked by #8", "- Blocked by #8 (description)"
 */
function parseBlockerNumbers(body: string | undefined | null): number[] {
	if (!body) return [];
	const matches = body.matchAll(/blocked by\s+#(\d+)/gi);
	return [...matches].map((m) => Number.parseInt(m[1], 10)).filter((n) => !Number.isNaN(n));
}

/**
 * GitHub Issues task source - reads tasks from GitHub issues
 *
 * Performance optimized: caches issue data to avoid redundant API calls.
 * Cache is invalidated after TTL or when markComplete() is called.
 *
 * Dependency-aware: skips tasks whose "Blocked by #N" issues are still open.
 */
export class GitHubTaskSource implements TaskSource {
	type = "github" as const;
	private octokit: Octokit;
	private owner: string;
	private repo: string;
	private label?: string;
	private cache: GitHubCache | null = null;
	/** Cache of issue states keyed by issue number: true = closed, false = open */
	private issueStateCache: Map<number, boolean> = new Map();
	private issueStateCacheExpiry = 0;

	constructor(repoPath: string, label?: string) {
		// Parse owner/repo format
		const [owner, repo] = repoPath.split("/");
		if (!owner || !repo) {
			throw new Error(`Invalid repo format: ${repoPath}. Expected owner/repo`);
		}

		this.owner = owner;
		this.repo = repo;
		this.label = label;

		// Use GITHUB_TOKEN from environment
		this.octokit = new Octokit({
			auth: process.env.GITHUB_TOKEN,
		});
	}

	/**
	 * Check if cache is still valid
	 */
	private isCacheValid(): boolean {
		if (!this.cache) return false;
		return Date.now() - this.cache.lastFetched < CACHE_TTL_MS;
	}

	/**
	 * Invalidate the cache
	 */
	private invalidateCache(): void {
		this.cache = null;
	}

	/**
	 * Fetch and cache open issues
	 */
	private async fetchOpenIssues(): Promise<Task[]> {
		if (this.isCacheValid() && this.cache) {
			return this.cache.openIssues;
		}

		const issues = await this.octokit.paginate(this.octokit.issues.listForRepo, {
			owner: this.owner,
			repo: this.repo,
			state: "open",
			labels: this.label,
			per_page: 100,
		});

		const tasks = issues.map((issue) => ({
			id: `${issue.number}:${issue.title}`,
			title: issue.title,
			body: issue.body || undefined,
			completed: false,
		}));

		// Update cache (preserve closed count if we have it)
		this.cache = {
			openIssues: tasks,
			closedCount: this.cache?.closedCount ?? -1,
			lastFetched: Date.now(),
		};

		return tasks;
	}

	/**
	 * Check if all blocker issues for a task are closed.
	 * Caches issue states for 2 minutes to avoid hammering the API.
	 */
	private async areBlockersResolved(blockerNumbers: number[]): Promise<boolean> {
		if (blockerNumbers.length === 0) return true;

		const now = Date.now();
		if (now > this.issueStateCacheExpiry) {
			this.issueStateCache.clear();
			this.issueStateCacheExpiry = now + 120_000;
		}

		for (const num of blockerNumbers) {
			if (this.issueStateCache.has(num)) {
				if (!this.issueStateCache.get(num)) return false;
				continue;
			}
			try {
				const { data } = await this.octokit.issues.get({
					owner: this.owner,
					repo: this.repo,
					issue_number: num,
				});
				const isClosed = data.state === "closed";
				this.issueStateCache.set(num, isClosed);
				if (!isClosed) return false;
			} catch {
				// If we can't fetch the blocker, assume it's not resolved
				this.issueStateCache.set(num, false);
				return false;
			}
		}
		return true;
	}

	async getAllTasks(): Promise<Task[]> {
		return await this.fetchOpenIssues();
	}

	async getNextTask(): Promise<Task | null> {
		const tasks = await this.fetchOpenIssues();
		for (const task of tasks) {
			const blockers = parseBlockerNumbers(task.body);
			if (await this.areBlockersResolved(blockers)) {
				return task;
			}
		}
		return null;
	}

	async markComplete(id: string): Promise<void> {
		// Extract issue number from "number:title" format
		const issueNumber = Number.parseInt(id.split(":")[0], 10);

		if (Number.isNaN(issueNumber)) {
			throw new Error(`Invalid issue ID: ${id}`);
		}

		await this.octokit.issues.update({
			owner: this.owner,
			repo: this.repo,
			issue_number: issueNumber,
			state: "closed",
		});

		// Invalidate cache after modification
		this.invalidateCache();
	}

	async countRemaining(): Promise<number> {
		const tasks = await this.fetchOpenIssues();
		return tasks.length;
	}

	async countCompleted(): Promise<number> {
		// Check if we have a recent closed count
		if (this.isCacheValid() && this.cache && this.cache.closedCount >= 0) {
			return this.cache.closedCount;
		}

		const issues = await this.octokit.paginate(this.octokit.issues.listForRepo, {
			owner: this.owner,
			repo: this.repo,
			state: "closed",
			labels: this.label,
			per_page: 100,
		});

		const closedCount = issues.length;

		// Update cache with closed count
		if (this.cache) {
			this.cache.closedCount = closedCount;
		}

		return closedCount;
	}

	/**
	 * Get full issue body for a task
	 */
	async getIssueBody(id: string): Promise<string> {
		const issueNumber = Number.parseInt(id.split(":")[0], 10);

		if (Number.isNaN(issueNumber)) {
			return "";
		}

		const issue = await this.octokit.issues.get({
			owner: this.owner,
			repo: this.repo,
			issue_number: issueNumber,
		});

		return issue.data.body || "";
	}
}
