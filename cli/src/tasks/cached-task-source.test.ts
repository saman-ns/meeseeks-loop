import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CachedTaskSource, withCache } from "./cached-task-source.ts";
import type { Task, TaskSource, TaskSourceType } from "./types.ts";

// Mock TaskSource for testing
function createMockTaskSource(tasks: Task[]): TaskSource {
	const completedIds = new Set<string>();

	return {
		type: "markdown" as TaskSourceType,
		async getAllTasks() {
			return tasks.filter((t) => !completedIds.has(t.id));
		},
		async getNextTask() {
			const remaining = tasks.filter((t) => !completedIds.has(t.id));
			return remaining[0] ?? null;
		},
		async markComplete(id: string) {
			completedIds.add(id);
		},
		async countRemaining() {
			return tasks.filter((t) => !completedIds.has(t.id)).length;
		},
		async countCompleted() {
			return completedIds.size;
		},
	};
}

function createTask(id: string, title: string): Task {
	return {
		id,
		title,
		completed: false,
	};
}

describe("CachedTaskSource", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("getAllTasks", () => {
		it("caches tasks after first load", async () => {
			const tasks = [createTask("1", "Task 1"), createTask("2", "Task 2")];
			const inner = createMockTaskSource(tasks);
			const getAllTasksSpy = vi.spyOn(inner, "getAllTasks");

			const cached = new CachedTaskSource(inner);

			// First call should hit inner source
			const result1 = await cached.getAllTasks();
			expect(result1).toHaveLength(2);
			expect(getAllTasksSpy).toHaveBeenCalledTimes(1);

			// Second call should use cache
			const result2 = await cached.getAllTasks();
			expect(result2).toHaveLength(2);
			expect(getAllTasksSpy).toHaveBeenCalledTimes(1);
		});

		it("filters out pending completions from cached results", async () => {
			const tasks = [createTask("1", "Task 1"), createTask("2", "Task 2")];
			const inner = createMockTaskSource(tasks);

			const cached = new CachedTaskSource(inner, { flushIntervalMs: 0 });

			// Load cache
			await cached.getAllTasks();

			// Mark complete (pending, not flushed)
			await cached.markComplete("1");

			// Should filter out completed task
			const result = await cached.getAllTasks();
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("2");
		});
	});

	describe("getNextTask", () => {
		it("returns first incomplete task", async () => {
			const tasks = [createTask("1", "Task 1"), createTask("2", "Task 2")];
			const cached = new CachedTaskSource(createMockTaskSource(tasks));

			const task = await cached.getNextTask();
			expect(task?.id).toBe("1");
		});

		it("returns null when all tasks complete", async () => {
			const tasks = [createTask("1", "Task 1")];
			const cached = new CachedTaskSource(createMockTaskSource(tasks), {
				flushIntervalMs: 0,
			});

			await cached.markComplete("1");

			const task = await cached.getNextTask();
			expect(task).toBeNull();
		});
	});

	describe("markComplete", () => {
		it("tracks completions in memory", async () => {
			const tasks = [createTask("1", "Task 1"), createTask("2", "Task 2")];
			const cached = new CachedTaskSource(createMockTaskSource(tasks), {
				flushIntervalMs: 0,
			});

			// Load cache first
			await cached.getAllTasks();

			await cached.markComplete("1");

			expect(cached.hasPendingWrites()).toBe(true);
			const remaining = await cached.countRemaining();
			expect(remaining).toBe(1);
		});

		it("schedules flush when auto-flush enabled", async () => {
			const tasks = [createTask("1", "Task 1")];
			const inner = createMockTaskSource(tasks);
			const markCompleteSpy = vi.spyOn(inner, "markComplete");

			const cached = new CachedTaskSource(inner, { flushIntervalMs: 1000 });

			await cached.markComplete("1");

			// Not flushed immediately
			expect(markCompleteSpy).not.toHaveBeenCalled();

			// Advance timer to trigger flush
			await vi.advanceTimersByTimeAsync(1000);

			// Should have flushed
			expect(markCompleteSpy).toHaveBeenCalledWith("1");
		});

		it("does not schedule flush when auto-flush disabled", async () => {
			const tasks = [createTask("1", "Task 1")];
			const inner = createMockTaskSource(tasks);
			const markCompleteSpy = vi.spyOn(inner, "markComplete");

			const cached = new CachedTaskSource(inner, { flushIntervalMs: 0 });

			await cached.markComplete("1");

			// Advance timer well past any potential flush
			await vi.advanceTimersByTimeAsync(5000);

			// Should not have flushed
			expect(markCompleteSpy).not.toHaveBeenCalled();
		});
	});

	describe("flush", () => {
		it("writes all pending completions to inner source", async () => {
			const tasks = [createTask("1", "Task 1"), createTask("2", "Task 2")];
			const inner = createMockTaskSource(tasks);
			const markCompleteSpy = vi.spyOn(inner, "markComplete");

			const cached = new CachedTaskSource(inner, { flushIntervalMs: 0 });

			await cached.markComplete("1");
			await cached.markComplete("2");

			await cached.flush();

			expect(markCompleteSpy).toHaveBeenCalledTimes(2);
			expect(markCompleteSpy).toHaveBeenCalledWith("1");
			expect(markCompleteSpy).toHaveBeenCalledWith("2");
		});

		it("clears pending completions after flush", async () => {
			const tasks = [createTask("1", "Task 1")];
			const cached = new CachedTaskSource(createMockTaskSource(tasks), {
				flushIntervalMs: 0,
			});

			await cached.markComplete("1");
			expect(cached.hasPendingWrites()).toBe(true);

			await cached.flush();
			expect(cached.hasPendingWrites()).toBe(false);
		});

		it("is safe to call multiple times", async () => {
			const tasks = [createTask("1", "Task 1")];
			const inner = createMockTaskSource(tasks);
			const markCompleteSpy = vi.spyOn(inner, "markComplete");

			const cached = new CachedTaskSource(inner, { flushIntervalMs: 0 });

			await cached.markComplete("1");
			await cached.flush();
			await cached.flush();
			await cached.flush();

			// Should only write once
			expect(markCompleteSpy).toHaveBeenCalledTimes(1);
		});

		it("is no-op when nothing pending", async () => {
			const tasks = [createTask("1", "Task 1")];
			const inner = createMockTaskSource(tasks);
			const markCompleteSpy = vi.spyOn(inner, "markComplete");

			const cached = new CachedTaskSource(inner, { flushIntervalMs: 0 });

			await cached.flush();

			expect(markCompleteSpy).not.toHaveBeenCalled();
		});

		it("invalidates cache after flush", async () => {
			const tasks = [createTask("1", "Task 1"), createTask("2", "Task 2")];
			const inner = createMockTaskSource(tasks);
			const getAllTasksSpy = vi.spyOn(inner, "getAllTasks");

			const cached = new CachedTaskSource(inner, { flushIntervalMs: 0 });

			// Load cache
			await cached.getAllTasks();
			expect(getAllTasksSpy).toHaveBeenCalledTimes(1);

			// Mark complete and flush
			await cached.markComplete("1");
			await cached.flush();

			// Next getAllTasks should reload from source
			await cached.getAllTasks();
			expect(getAllTasksSpy).toHaveBeenCalledTimes(2);
		});

		it("queues flush if already flushing", async () => {
			const tasks = [createTask("1", "Task 1"), createTask("2", "Task 2")];
			let resolveMarkComplete: () => void;
			const markCompletePromise = new Promise<void>((resolve) => {
				resolveMarkComplete = resolve;
			});

			const inner: TaskSource = {
				type: "markdown",
				getAllTasks: async () => tasks,
				getNextTask: async () => tasks[0],
				markComplete: async () => {
					await markCompletePromise;
				},
				countRemaining: async () => tasks.length,
				countCompleted: async () => 0,
			};

			const cached = new CachedTaskSource(inner, { flushIntervalMs: 0 });

			await cached.markComplete("1");

			// Start first flush (will wait on markComplete)
			const flush1 = cached.flush();

			// Mark another complete and try to flush while first is in progress
			await cached.markComplete("2");
			const flush2 = cached.flush();

			// Release the lock
			resolveMarkComplete?.();

			await flush1;
			await flush2;

			// Both should eventually complete
			expect(cached.hasPendingWrites()).toBe(false);
		});
	});

	describe("countRemaining", () => {
		it("accounts for pending completions", async () => {
			const tasks = [
				createTask("1", "Task 1"),
				createTask("2", "Task 2"),
				createTask("3", "Task 3"),
			];
			const cached = new CachedTaskSource(createMockTaskSource(tasks), {
				flushIntervalMs: 0,
			});

			expect(await cached.countRemaining()).toBe(3);

			await cached.markComplete("1");
			expect(await cached.countRemaining()).toBe(2);

			await cached.markComplete("2");
			expect(await cached.countRemaining()).toBe(1);
		});
	});

	describe("countCompleted", () => {
		it("includes pending completions in count", async () => {
			const tasks = [createTask("1", "Task 1"), createTask("2", "Task 2")];
			const cached = new CachedTaskSource(createMockTaskSource(tasks), {
				flushIntervalMs: 0,
			});

			expect(await cached.countCompleted()).toBe(0);

			await cached.markComplete("1");
			expect(await cached.countCompleted()).toBe(1);
		});
	});

	describe("type", () => {
		it("returns inner source type", () => {
			const inner = createMockTaskSource([]);
			const cached = new CachedTaskSource(inner);

			expect(cached.type).toBe("markdown");
		});
	});

	describe("getInner", () => {
		it("returns the inner task source", () => {
			const inner = createMockTaskSource([]);
			const cached = new CachedTaskSource(inner);

			expect(cached.getInner()).toBe(inner);
		});
	});

	describe("invalidateCache", () => {
		it("forces fresh read on next access", async () => {
			const tasks = [createTask("1", "Task 1")];
			const inner = createMockTaskSource(tasks);
			const getAllTasksSpy = vi.spyOn(inner, "getAllTasks");

			const cached = new CachedTaskSource(inner);

			// Load cache
			await cached.getAllTasks();
			expect(getAllTasksSpy).toHaveBeenCalledTimes(1);

			// Access again (should use cache)
			await cached.getAllTasks();
			expect(getAllTasksSpy).toHaveBeenCalledTimes(1);

			// Invalidate
			cached.invalidateCache();

			// Should reload
			await cached.getAllTasks();
			expect(getAllTasksSpy).toHaveBeenCalledTimes(2);
		});
	});

	describe("dispose", () => {
		it("cancels pending flush timer", async () => {
			const tasks = [createTask("1", "Task 1")];
			const inner = createMockTaskSource(tasks);
			const markCompleteSpy = vi.spyOn(inner, "markComplete");

			const cached = new CachedTaskSource(inner, { flushIntervalMs: 1000 });

			await cached.markComplete("1");
			cached.dispose();

			// Advance timer past flush interval
			await vi.advanceTimersByTimeAsync(2000);

			// Should not have flushed because disposed
			expect(markCompleteSpy).not.toHaveBeenCalled();
		});
	});

	describe("withCache", () => {
		it("creates a CachedTaskSource wrapper", () => {
			const inner = createMockTaskSource([]);
			const cached = withCache(inner);

			expect(cached).toBeInstanceOf(CachedTaskSource);
			expect(cached.getInner()).toBe(inner);
		});

		it("passes options through", async () => {
			const tasks = [createTask("1", "Task 1")];
			const inner = createMockTaskSource(tasks);
			const markCompleteSpy = vi.spyOn(inner, "markComplete");

			const cached = withCache(inner, { flushIntervalMs: 500 });

			await cached.markComplete("1");

			// Check that custom interval is respected
			await vi.advanceTimersByTimeAsync(400);
			expect(markCompleteSpy).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(200);
			expect(markCompleteSpy).toHaveBeenCalled();
		});
	});

	describe("retry on flush failure", () => {
		it("retries flush up to MAX_FLUSH_RETRIES times", async () => {
			const tasks = [createTask("1", "Task 1")];
			let callCount = 0;

			const inner: TaskSource = {
				type: "markdown",
				getAllTasks: async () => tasks,
				getNextTask: async () => tasks[0],
				markComplete: async () => {
					callCount++;
					if (callCount < 3) {
						throw new Error("Temporary failure");
					}
				},
				countRemaining: async () => tasks.length,
				countCompleted: async () => 0,
			};

			const cached = new CachedTaskSource(inner, { flushIntervalMs: 100 });

			await cached.markComplete("1");

			// First flush attempt (fails)
			await vi.advanceTimersByTimeAsync(100);

			// Retry 1 (fails)
			await vi.advanceTimersByTimeAsync(100);

			// Retry 2 (succeeds)
			await vi.advanceTimersByTimeAsync(100);

			expect(callCount).toBe(3);
			expect(cached.hasPendingWrites()).toBe(false);
		});
	});
});
