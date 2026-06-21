/**
 * Global test setup for Vitest
 */

import { afterEach, beforeEach, vi } from "vitest";

// Reset all mocks between tests
beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.restoreAllMocks();
});

// Mock console methods by default to keep test output clean
// Tests can override these if needed
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});

// Helper to create a temporary directory for file-based tests
export function createTempDir(): string {
	const tempDir = `/tmp/meeseeks-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	return tempDir;
}

// Helper to clean up temporary directories
export async function cleanupTempDir(dir: string): Promise<void> {
	const fs = await import("node:fs/promises");
	try {
		await fs.rm(dir, { recursive: true, force: true });
	} catch {
		// Ignore cleanup errors
	}
}
