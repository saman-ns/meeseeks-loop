/**
 * Process lock to prevent multiple Meeseeks instances on the same project.
 *
 * Uses `.meeseeks/lock.json` with PID-based stale detection.
 * Automatically cleans up on SIGINT/SIGTERM/exit.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { MEESEEKS_DIR } from "../config/loader.ts";
import { logDebug, logError, logWarn } from "../ui/logger.ts";

const LOCK_FILE = "lock.json";

interface LockData {
	pid: number;
	startedAt: string;
	command: string;
}

function lockPath(workDir: string): string {
	return path.join(workDir, MEESEEKS_DIR, LOCK_FILE);
}

/**
 * Check if a process with the given PID is running.
 */
function isProcessRunning(pid: number): boolean {
	try {
		// signal 0 doesn't kill — just checks if process exists
		process.kill(pid, 0);
		return true;
	} catch (error) {
		logDebug(`Process ${pid} is not running:`, error);
		return false;
	}
}

/**
 * Acquire the process lock. Exits with error if another instance is running.
 * Returns a cleanup function to release the lock.
 */
export function acquireLock(workDir: string): () => void {
	const filePath = lockPath(workDir);
	const dirPath = path.join(workDir, MEESEEKS_DIR);

	// Check for existing lock
	if (fs.existsSync(filePath)) {
		try {
			const raw = fs.readFileSync(filePath, "utf-8");
			const existing = JSON.parse(raw) as LockData;

			if (isProcessRunning(existing.pid)) {
				logError(
					`Another Meeseeks instance is already running (PID ${existing.pid}, started ${existing.startedAt}).`,
				);
				logError("Kill it first or wait for it to finish.");
				process.exit(1);
			}

			// Stale lock — previous process died without cleanup
			logWarn(`Removing stale lock from PID ${existing.pid} (process no longer running).`);
		} catch (error) {
			logDebug("Corrupt lock file, removing:", error);
		}
	}

	// Write lock
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true });
	}

	const lock: LockData = {
		pid: process.pid,
		startedAt: new Date().toISOString(),
		command: process.argv.slice(2).join(" "),
	};
	fs.writeFileSync(filePath, JSON.stringify(lock, null, 2), "utf-8");

	// Cleanup function
	const release = () => {
		try {
			// Only remove if it's still our lock
			if (fs.existsSync(filePath)) {
				const raw = fs.readFileSync(filePath, "utf-8");
				const current = JSON.parse(raw) as LockData;
				if (current.pid === process.pid) {
					fs.unlinkSync(filePath);
				}
			}
		} catch (error) {
			logDebug("Best-effort lock cleanup failed:", error);
		}
	};

	// Register signal handlers for cleanup
	const onExit = () => {
		release();
	};
	const onSignal = () => {
		release();
		process.exit(130);
	};

	process.on("exit", onExit);
	process.on("SIGINT", onSignal);
	process.on("SIGTERM", onSignal);

	return release;
}
