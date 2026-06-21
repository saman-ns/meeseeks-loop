import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type AnalyticsData,
	type TaskRecord,
	endRun,
	formatSessionEstimate,
	getSessionEstimate,
	loadAnalytics,
	recordRateLimitHit,
	recordSuccessfulRun,
	recordTask,
	startRun,
} from "./analytics.ts";

// Test helpers
const TEST_DIR = "/tmp/meeseeks-analytics-test";
const MEESEEKS_DIR = ".meeseeks";
const ANALYTICS_FILE = "analytics.json";

function getAnalyticsPath(): string {
	return path.join(TEST_DIR, MEESEEKS_DIR, ANALYTICS_FILE);
}

function writeTestAnalytics(data: AnalyticsData): void {
	const dirPath = path.join(TEST_DIR, MEESEEKS_DIR);
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true });
	}
	fs.writeFileSync(getAnalyticsPath(), JSON.stringify(data, null, 2), "utf-8");
}

function createEmptyAnalytics(): AnalyticsData {
	return {
		version: 1,
		tasks: [],
		runs: [],
		rateLimitObservations: [],
		learnedCapacity: null,
	};
}

function createTaskRecord(overrides: Partial<TaskRecord> = {}): TaskRecord {
	const now = new Date();
	return {
		title: "Test task",
		startedAt: new Date(now.getTime() - 60000).toISOString(),
		endedAt: now.toISOString(),
		durationMs: 60000,
		model: "sonnet",
		inputTokens: 10000,
		outputTokens: 5000,
		costUsd: 0.05,
		success: true,
		retryCount: 0,
		...overrides,
	};
}

describe("analytics", () => {
	beforeEach(() => {
		// Create test directory
		if (!fs.existsSync(TEST_DIR)) {
			fs.mkdirSync(TEST_DIR, { recursive: true });
		}
	});

	afterEach(() => {
		// Clean up test directory
		if (fs.existsSync(TEST_DIR)) {
			fs.rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	describe("loadAnalytics", () => {
		it("returns empty data when file does not exist", () => {
			const data = loadAnalytics(TEST_DIR);
			expect(data).toEqual({
				version: 1,
				tasks: [],
				runs: [],
				rateLimitObservations: [],
				learnedCapacity: null,
			});
		});

		it("loads existing analytics data", () => {
			const existingData = createEmptyAnalytics();
			existingData.tasks.push(createTaskRecord({ title: "Existing task" }));
			writeTestAnalytics(existingData);

			const data = loadAnalytics(TEST_DIR);
			expect(data.tasks).toHaveLength(1);
			expect(data.tasks[0].title).toBe("Existing task");
		});

		it("returns empty data for corrupt JSON", () => {
			const dirPath = path.join(TEST_DIR, MEESEEKS_DIR);
			fs.mkdirSync(dirPath, { recursive: true });
			fs.writeFileSync(getAnalyticsPath(), "{ invalid json", "utf-8");

			const data = loadAnalytics(TEST_DIR);
			expect(data).toEqual({
				version: 1,
				tasks: [],
				runs: [],
				rateLimitObservations: [],
				learnedCapacity: null,
			});
		});

		it("returns empty data for wrong version", () => {
			const existingData = { ...createEmptyAnalytics(), version: 99 };
			writeTestAnalytics(existingData as AnalyticsData);

			const data = loadAnalytics(TEST_DIR);
			expect(data).toEqual({
				version: 1,
				tasks: [],
				runs: [],
				rateLimitObservations: [],
				learnedCapacity: null,
			});
		});
	});

	describe("startRun", () => {
		it("creates a new run and returns its ID", () => {
			const runId = startRun(TEST_DIR, "sonnet");

			expect(runId).toMatch(/^run_\d+_[a-z0-9]+$/);

			const data = loadAnalytics(TEST_DIR);
			expect(data.runs).toHaveLength(1);
			expect(data.runs[0].id).toBe(runId);
			expect(data.runs[0].model).toBe("sonnet");
			expect(data.runs[0].totalTasks).toBe(0);
		});
	});

	describe("endRun", () => {
		it("updates run with final stats", () => {
			const runId = startRun(TEST_DIR, "sonnet");

			endRun(TEST_DIR, runId, {
				totalTasks: 10,
				tasksCompleted: 8,
				tasksFailed: 2,
				totalInputTokens: 100000,
				totalOutputTokens: 50000,
				totalCostUsd: 1.5,
			});

			const data = loadAnalytics(TEST_DIR);
			const run = data.runs.find((r) => r.id === runId);
			expect(run).toBeDefined();
			expect(run?.endedAt).toBeDefined();
			expect(run?.totalTasks).toBe(10);
			expect(run?.tasksCompleted).toBe(8);
			expect(run?.tasksFailed).toBe(2);
			expect(run?.totalInputTokens).toBe(100000);
			expect(run?.totalOutputTokens).toBe(50000);
			expect(run?.totalCostUsd).toBe(1.5);
		});
	});

	describe("recordTask", () => {
		it("adds a task record to analytics", () => {
			const task = createTaskRecord({ title: "New task", inputTokens: 20000 });
			recordTask(TEST_DIR, task);

			const data = loadAnalytics(TEST_DIR);
			expect(data.tasks).toHaveLength(1);
			expect(data.tasks[0].title).toBe("New task");
			expect(data.tasks[0].inputTokens).toBe(20000);
		});

		it("accumulates multiple tasks", () => {
			recordTask(TEST_DIR, createTaskRecord({ title: "Task 1" }));
			recordTask(TEST_DIR, createTaskRecord({ title: "Task 2" }));
			recordTask(TEST_DIR, createTaskRecord({ title: "Task 3" }));

			const data = loadAnalytics(TEST_DIR);
			expect(data.tasks).toHaveLength(3);
		});
	});

	describe("recordRateLimitHit", () => {
		it("records rate limit observation and updates learned capacity", () => {
			// Add some tasks first to have window tokens
			const now = new Date();
			recordTask(
				TEST_DIR,
				createTaskRecord({
					endedAt: now.toISOString(),
					inputTokens: 50000,
					outputTokens: 25000,
				}),
			);

			recordRateLimitHit(TEST_DIR, "sonnet");

			const data = loadAnalytics(TEST_DIR);
			expect(data.rateLimitObservations).toHaveLength(1);
			expect(data.rateLimitObservations[0].cumulativeTokens).toBe(75000);
			expect(data.learnedCapacity).not.toBeNull();
			expect(data.learnedCapacity?.estimatedMaxTokens).toBe(75000);
			expect(data.learnedCapacity?.fromRateLimitHit).toBe(true);
		});

		it("averages multiple rate limit observations", () => {
			const now = new Date();

			// First rate limit hit
			recordTask(
				TEST_DIR,
				createTaskRecord({
					endedAt: now.toISOString(),
					inputTokens: 50000,
					outputTokens: 25000,
				}),
			);
			recordRateLimitHit(TEST_DIR, "sonnet");

			// Second rate limit hit with different token count
			recordTask(
				TEST_DIR,
				createTaskRecord({
					endedAt: now.toISOString(),
					inputTokens: 25000,
					outputTokens: 25000,
				}),
			);
			recordRateLimitHit(TEST_DIR, "sonnet");

			const data = loadAnalytics(TEST_DIR);
			expect(data.rateLimitObservations).toHaveLength(2);
			// Average of 75000 and 125000 = 100000
			expect(data.learnedCapacity?.estimatedMaxTokens).toBe(100000);
		});

		it("does nothing when window tokens is 0", () => {
			recordRateLimitHit(TEST_DIR, "sonnet");

			const data = loadAnalytics(TEST_DIR);
			expect(data.rateLimitObservations).toHaveLength(0);
			expect(data.learnedCapacity).toBeNull();
		});
	});

	describe("recordSuccessfulRun", () => {
		it("updates success high water mark", () => {
			const now = new Date();
			recordTask(
				TEST_DIR,
				createTaskRecord({
					endedAt: now.toISOString(),
					inputTokens: 30000,
					outputTokens: 15000,
				}),
			);

			recordSuccessfulRun(TEST_DIR, "sonnet");

			const data = loadAnalytics(TEST_DIR);
			expect(data.learnedCapacity).not.toBeNull();
			expect(data.learnedCapacity?.successHighWaterMark).toBe(45000);
			expect(data.learnedCapacity?.fromRateLimitHit).toBe(false);
		});

		it("infers capacity from successful run", () => {
			const now = new Date();
			recordTask(
				TEST_DIR,
				createTaskRecord({
					endedAt: now.toISOString(),
					inputTokens: 30000,
					outputTokens: 15000,
				}),
			);

			recordSuccessfulRun(TEST_DIR, "sonnet");

			const data = loadAnalytics(TEST_DIR);
			// Inferred capacity: 45000 * 5 = 225000
			expect(data.learnedCapacity?.estimatedMaxTokens).toBe(225000);
		});
	});

	describe("getSessionEstimate", () => {
		it("returns basic stats without capacity when no data", () => {
			const estimate = getSessionEstimate(TEST_DIR, "sonnet");

			expect(estimate.taskCount).toBe(0);
			expect(estimate.totalTokens).toBe(0);
			expect(estimate.totalCostUsd).toBe(0);
			expect(estimate.model).toBe("sonnet");
			expect(estimate.capacity).toBeUndefined();
		});

		it("calculates window stats correctly", () => {
			const now = new Date();
			recordTask(
				TEST_DIR,
				createTaskRecord({
					endedAt: now.toISOString(),
					inputTokens: 10000,
					outputTokens: 5000,
					costUsd: 0.05,
				}),
			);
			recordTask(
				TEST_DIR,
				createTaskRecord({
					endedAt: now.toISOString(),
					inputTokens: 20000,
					outputTokens: 10000,
					costUsd: 0.1,
				}),
			);

			const estimate = getSessionEstimate(TEST_DIR, "sonnet");

			expect(estimate.taskCount).toBe(2);
			expect(estimate.totalTokens).toBe(45000);
			expect(estimate.totalCostUsd).toBeCloseTo(0.15);
		});

		it("includes capacity info when learned", () => {
			const now = new Date();
			recordTask(
				TEST_DIR,
				createTaskRecord({
					endedAt: now.toISOString(),
					inputTokens: 20000,
					outputTokens: 10000,
				}),
			);
			recordRateLimitHit(TEST_DIR, "sonnet");

			const estimate = getSessionEstimate(TEST_DIR, "sonnet");

			expect(estimate.capacity).toBeDefined();
			expect(estimate.capacity?.estimatedMaxTokens).toBe(30000);
			expect(estimate.capacity?.percentUsed).toBe(100);
			expect(estimate.capacity?.fromRateLimitHit).toBe(true);
		});

		it("estimates remaining tasks based on average", () => {
			const now = new Date();

			// Set up learned capacity at 100000
			const data = createEmptyAnalytics();
			data.learnedCapacity = {
				estimatedMaxTokens: 100000,
				observationCount: 1,
				lastObservedAt: now.toISOString(),
				fromRateLimitHit: true,
			};
			data.tasks.push(
				createTaskRecord({
					endedAt: now.toISOString(),
					inputTokens: 5000,
					outputTokens: 5000,
				}),
			);
			data.tasks.push(
				createTaskRecord({
					endedAt: now.toISOString(),
					inputTokens: 5000,
					outputTokens: 5000,
				}),
			);
			writeTestAnalytics(data);

			const estimate = getSessionEstimate(TEST_DIR, "sonnet");

			// 20000 tokens used, 10000 per task avg, 80000 remaining = 8 tasks left
			expect(estimate.capacity?.estimatedTasksLeft).toBe(8);
			expect(estimate.capacity?.percentUsed).toBe(20);
		});
	});

	describe("formatSessionEstimate", () => {
		it("formats basic stats without capacity", () => {
			const estimate = {
				taskCount: 3,
				totalTokens: 245100,
				totalCostUsd: 0.42,
				durationMs: 750000, // 12m 30s
				model: "sonnet",
			};

			const formatted = formatSessionEstimate(estimate);

			expect(formatted).toContain("3 tasks");
			expect(formatted).toContain("245.1K tokens");
			expect(formatted).toContain("sonnet");
		});

		it("formats with capacity from rate limit hit", () => {
			const estimate = {
				taskCount: 7,
				totalTokens: 245100,
				totalCostUsd: 1.27,
				durationMs: 750000,
				model: "sonnet",
				capacity: {
					percentUsed: 53,
					estimatedMaxTokens: 462000,
					estimatedTasksLeft: 6,
					fromRateLimitHit: true,
				},
			};

			const formatted = formatSessionEstimate(estimate);

			expect(formatted).toContain("~53%");
			expect(formatted).not.toContain("?"); // No uncertainty marker for rate limit hit
			expect(formatted).toContain("est. ~6 left");
			expect(formatted).toContain("462.0K");
		});

		it("shows uncertainty marker when capacity is inferred", () => {
			const estimate = {
				taskCount: 7,
				totalTokens: 245100,
				totalCostUsd: 1.27,
				durationMs: 750000,
				model: "sonnet",
				capacity: {
					percentUsed: 10,
					estimatedMaxTokens: 2500000,
					estimatedTasksLeft: 50,
					fromRateLimitHit: false,
				},
			};

			const formatted = formatSessionEstimate(estimate);

			expect(formatted).toContain("?"); // Uncertainty marker
		});
	});

	describe("pruning", () => {
		it("removes records older than 7 days on save", () => {
			const now = new Date();
			const oldDate = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000); // 8 days ago
			const recentDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

			const data = createEmptyAnalytics();
			data.tasks.push(
				createTaskRecord({
					title: "Old task",
					endedAt: oldDate.toISOString(),
				}),
			);
			data.tasks.push(
				createTaskRecord({
					title: "Recent task",
					endedAt: recentDate.toISOString(),
				}),
			);
			writeTestAnalytics(data);

			// Recording a new task triggers save which prunes
			recordTask(TEST_DIR, createTaskRecord({ title: "New task", endedAt: now.toISOString() }));

			const loadedData = loadAnalytics(TEST_DIR);
			expect(loadedData.tasks).toHaveLength(2);
			expect(loadedData.tasks.some((t) => t.title === "Old task")).toBe(false);
			expect(loadedData.tasks.some((t) => t.title === "Recent task")).toBe(true);
			expect(loadedData.tasks.some((t) => t.title === "New task")).toBe(true);
		});
	});
});
