import { mkdirSync, readFileSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import type { Task, TaskSource } from "./types.ts";

/**
 * Read file content and normalize line endings to Unix format
 */
function readFileNormalized(filePath: string): string {
	return readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Acquire a file lock using mkdir (atomic on POSIX).
 * Spins until the lock is acquired or timeout is reached.
 */
function acquireLock(filePath: string, timeoutMs = 5000): void {
	const lockDir = `${filePath}.lock`;
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			mkdirSync(lockDir);
			return; // acquired
		} catch {
			// Lock held by another process, spin-wait
			const end = Date.now() + 50;
			while (Date.now() < end);
		}
	}
	throw new Error(`Failed to acquire lock on ${filePath} after ${timeoutMs}ms`);
}

/**
 * Release a file lock by removing the lock directory.
 */
function releaseLock(filePath: string): void {
	const lockDir = `${filePath}.lock`;
	try {
		rmdirSync(lockDir);
	} catch {
		/* already released */
	}
}

/**
 * Cached file content with task counts for performance
 */
interface CachedContent {
	content: string;
	lines: string[];
	incompleteTasks: Task[];
	remainingCount: number;
	completedCount: number;
	fileMtime: number;
}

/**
 * Markdown task source - reads tasks from markdown files with checkbox format
 * Format: "- [ ] Task description" (incomplete) or "- [x] Task description" (complete)
 *
 * Performance optimized: caches file content and task counts to avoid redundant reads.
 */
export class MarkdownTaskSource implements TaskSource {
	type = "markdown" as const;
	private filePath: string;
	private cache: CachedContent | null = null;

	constructor(filePath: string) {
		this.filePath = filePath;
	}

	/**
	 * Get the file's modification time
	 */
	private getFileMtime(): number {
		try {
			return statSync(this.filePath).mtimeMs;
		} catch {
			return 0;
		}
	}

	/**
	 * Load and cache file content with parsed task data
	 */
	private loadCache(): CachedContent {
		const fileMtime = this.getFileMtime();
		const content = readFileNormalized(this.filePath);
		const lines = content.split("\n");
		const incompleteTasks: Task[] = [];
		let remainingCount = 0;
		let completedCount = 0;
		let currentTaskTitle: string | null = null;
		let currentTaskLineNumber = -1;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			// Format 1: Checkbox tasks (- [ ] or - [x])
			const incompleteMatch = line.match(/^- \[ \] (.+)$/);
			if (incompleteMatch) {
				incompleteTasks.push({
					id: String(i + 1), // Line number as ID
					title: incompleteMatch[1].trim(),
					completed: false,
				});
				remainingCount++;
				currentTaskTitle = null;
			}

			if (/^- \[x\] /i.test(line)) {
				completedCount++;
				currentTaskTitle = null;
			}

			// Format 2: Numbered header tasks (#### N. Title)
			const headerMatch = line.match(/^####\s+(\d+)\.\s+(.+)$/);
			if (headerMatch) {
				currentTaskTitle = headerMatch[2].trim();
				currentTaskLineNumber = i;
			}

			// Check for status line after header
			if (currentTaskTitle && /^\*\*Status:\*\*/.test(line)) {
				// Check if marked as not completed FIRST (❌ or "Not Completed")
				if (line.includes("❌") || /Not Completed/i.test(line)) {
					incompleteTasks.push({
						id: String(currentTaskLineNumber + 1),
						title: currentTaskTitle,
						completed: false,
					});
					remainingCount++;
					currentTaskTitle = null;
				}
				// Check if marked as completed (✅ or just "Completed" without "Not")
				else if (line.includes("✅") || /\bCompleted\b/i.test(line)) {
					completedCount++;
					currentTaskTitle = null;
				}
			}
		}

		this.cache = {
			content,
			lines,
			incompleteTasks,
			remainingCount,
			completedCount,
			fileMtime,
		};

		return this.cache;
	}

	/**
	 * Get cached content or load fresh if file was modified externally
	 */
	private getCache(): CachedContent {
		if (!this.cache) {
			return this.loadCache();
		}
		// Check if file was modified externally
		const currentMtime = this.getFileMtime();
		if (currentMtime !== this.cache.fileMtime) {
			return this.loadCache();
		}
		return this.cache;
	}

	/**
	 * Invalidate cache (call after file modifications)
	 */
	private invalidateCache(): void {
		this.cache = null;
	}

	async getAllTasks(): Promise<Task[]> {
		return [...this.getCache().incompleteTasks];
	}

	async getNextTask(): Promise<Task | null> {
		const cache = this.getCache();
		return cache.incompleteTasks[0] || null;
	}

	async markComplete(id: string): Promise<void> {
		acquireLock(this.filePath);
		try {
			// Force fresh read for modification to avoid stale data
			this.invalidateCache();
			const content = readFileNormalized(this.filePath);
			const lines = content.split("\n");
			const lineNumber = Number.parseInt(id, 10) - 1;

			if (lineNumber >= 0 && lineNumber < lines.length) {
				// Format 1: Checkbox tasks - replace "- [ ]" with "- [x]"
				if (lines[lineNumber].startsWith("- [ ]")) {
					lines[lineNumber] = lines[lineNumber].replace(/^- \[ \] /, "- [x] ");
				}
				// Format 2: Numbered header tasks - find and update status line
				else if (lines[lineNumber].match(/^####\s+\d+\./)) {
					// Find the status line (should be within next few lines)
					for (let i = lineNumber + 1; i < Math.min(lineNumber + 5, lines.length); i++) {
						if (lines[i].startsWith("**Status:**")) {
							// Replace ❌ with ✅ and "Not Completed" with "Completed"
							lines[i] = lines[i].replace(/❌/g, "✅").replace(/Not Completed/gi, "Completed");
							break;
						}
					}
				}
				writeFileSync(this.filePath, lines.join("\n"), "utf-8");
				// Invalidate cache after modification
				this.invalidateCache();
			}
		} finally {
			releaseLock(this.filePath);
		}
	}

	async countRemaining(): Promise<number> {
		return this.getCache().remainingCount;
	}

	async countCompleted(): Promise<number> {
		return this.getCache().completedCount;
	}
}
