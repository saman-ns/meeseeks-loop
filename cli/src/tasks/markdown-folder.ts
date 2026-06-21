import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Task, TaskSource } from "./types.ts";

/**
 * Read file content and normalize line endings to Unix format
 */
function readFileNormalized(filePath: string): string {
	return readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Cached data for a single markdown file
 */
interface FileCacheEntry {
	content: string;
	lines: string[];
	incompleteTasks: Task[];
	remainingCount: number;
	completedCount: number;
}

/**
 * Cached data for the entire folder
 */
interface FolderCache {
	files: Map<string, FileCacheEntry>;
	fileMtimes: Map<string, number>;
	allTasks: Task[];
	totalRemaining: number;
	totalCompleted: number;
}

/**
 * Markdown folder task source - reads tasks from multiple markdown files in a folder
 * Each task ID includes the source file for proper tracking: "filename.md:lineNumber"
 *
 * Performance optimized: caches all file contents and task counts to avoid
 * redundant file reads across getAllTasks(), countRemaining(), and countCompleted().
 */
export class MarkdownFolderTaskSource implements TaskSource {
	type = "markdown-folder" as const;
	private folderPath: string;
	private markdownFiles: string[] = [];
	private cache: FolderCache | null = null;

	constructor(folderPath: string) {
		this.folderPath = folderPath;
		this.markdownFiles = this.scanForMarkdownFiles();
	}

	/**
	 * Scan the folder for markdown files
	 */
	private scanForMarkdownFiles(): string[] {
		const files: string[] = [];

		try {
			const entries = readdirSync(this.folderPath);
			for (const entry of entries) {
				const fullPath = join(this.folderPath, entry);
				const stat = statSync(fullPath);

				if (stat.isFile() && entry.endsWith(".md")) {
					files.push(fullPath);
				}
			}
		} catch {
			// Folder doesn't exist or can't be read
		}

		// Sort files alphabetically for consistent ordering
		return files.sort();
	}

	/**
	 * Parse task ID into file path and line number
	 */
	private parseTaskId(id: string): { filePath: string; lineNumber: number } {
		const lastColon = id.lastIndexOf(":");
		if (lastColon === -1) {
			throw new Error(`Invalid task ID format: ${id}`);
		}
		const fileName = id.substring(0, lastColon);
		const lineNumber = Number.parseInt(id.substring(lastColon + 1), 10);
		const filePath = join(this.folderPath, fileName);
		return { filePath, lineNumber };
	}

	/**
	 * Create task ID from file path and line number
	 */
	private createTaskId(filePath: string, lineNumber: number): string {
		const fileName = basename(filePath);
		return `${fileName}:${lineNumber}`;
	}

	/**
	 * Get a file's modification time
	 */
	private getFileMtime(filePath: string): number {
		try {
			return statSync(filePath).mtimeMs;
		} catch {
			return 0;
		}
	}

	/**
	 * Load and cache all file contents with parsed task data
	 */
	private loadCache(): FolderCache {
		const files = new Map<string, FileCacheEntry>();
		const fileMtimes = new Map<string, number>();
		const allTasks: Task[] = [];
		let totalRemaining = 0;
		let totalCompleted = 0;

		for (const filePath of this.markdownFiles) {
			fileMtimes.set(filePath, this.getFileMtime(filePath));
			const content = readFileNormalized(filePath);
			const lines = content.split("\n");
			const incompleteTasks: Task[] = [];
			let remainingCount = 0;
			let completedCount = 0;

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];

				// Match incomplete tasks
				const incompleteMatch = line.match(/^- \[ \] (.+)$/);
				if (incompleteMatch) {
					const task = {
						id: this.createTaskId(filePath, i + 1),
						title: incompleteMatch[1].trim(),
						completed: false,
					};
					incompleteTasks.push(task);
					allTasks.push(task);
					remainingCount++;
				}

				// Match completed tasks
				if (/^- \[x\] /i.test(line)) {
					completedCount++;
				}
			}

			files.set(filePath, {
				content,
				lines,
				incompleteTasks,
				remainingCount,
				completedCount,
			});

			totalRemaining += remainingCount;
			totalCompleted += completedCount;
		}

		this.cache = {
			files,
			fileMtimes,
			allTasks,
			totalRemaining,
			totalCompleted,
		};

		return this.cache;
	}

	/**
	 * Check if any cached file has been modified externally
	 */
	private isCacheStale(): boolean {
		if (!this.cache) return true;
		for (const [filePath, cachedMtime] of this.cache.fileMtimes) {
			if (this.getFileMtime(filePath) !== cachedMtime) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Get cached content or load fresh if any file was modified externally
	 */
	private getCache(): FolderCache {
		if (!this.cache || this.isCacheStale()) {
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
		return [...this.getCache().allTasks];
	}

	async getNextTask(): Promise<Task | null> {
		const cache = this.getCache();
		return cache.allTasks[0] || null;
	}

	async markComplete(id: string): Promise<void> {
		const { filePath, lineNumber } = this.parseTaskId(id);
		// Force fresh read for modification to avoid stale data
		this.invalidateCache();
		const content = readFileNormalized(filePath);
		const lines = content.split("\n");
		const lineIndex = lineNumber - 1;

		if (lineIndex >= 0 && lineIndex < lines.length) {
			// Replace "- [ ]" with "- [x]"
			lines[lineIndex] = lines[lineIndex].replace(/^- \[ \] /, "- [x] ");
			writeFileSync(filePath, lines.join("\n"), "utf-8");
			// Invalidate cache after modification
			this.invalidateCache();
		}
	}

	async countRemaining(): Promise<number> {
		return this.getCache().totalRemaining;
	}

	async countCompleted(): Promise<number> {
		return this.getCache().totalCompleted;
	}

	/**
	 * Get list of markdown files in the folder
	 */
	getMarkdownFiles(): string[] {
		return [...this.markdownFiles];
	}
}
