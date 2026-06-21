import pc from "picocolors";
import type { Task } from "../tasks/types.ts";

/**
 * Extract file path from task body if it starts with "File: "
 */
function extractFilePath(body?: string): string | null {
	if (!body) return null;

	const lines = body.split("\n");
	const fileLine = lines.find((line) => line.trim().startsWith("File:"));

	if (fileLine) {
		// Extract: "File: test/providers/admin_provider_test.dart"
		const match = fileLine.match(/File:\s*(.+)/);
		if (match) {
			return match[1].trim();
		}
	}

	return null;
}

/**
 * Get task type emoji/label based on file path or title
 */
function getTaskTypeInfo(task: Task, filePath?: string | null): { emoji: string; label: string } {
	const title = task.title.toLowerCase();
	const path = filePath?.toLowerCase() || "";

	// Provider tests
	if (title.includes("provider") || path.includes("provider")) {
		return { emoji: "🔌", label: "Provider" };
	}

	// Service tests
	if (title.includes("service") || path.includes("service")) {
		return { emoji: "⚙️", label: "Service" };
	}

	// Model tests
	if (title.includes("model") || path.includes("model")) {
		return { emoji: "📦", label: "Model" };
	}

	// Widget/Screen tests
	if (
		title.includes("widget") ||
		title.includes("screen") ||
		path.includes("widget") ||
		path.includes("screen")
	) {
		return { emoji: "🎨", label: "UI" };
	}

	// Infrastructure/Setup
	if (title.includes("helper") || title.includes("mock") || title.includes("infrastructure")) {
		return { emoji: "🏗️", label: "Infra" };
	}

	// Refactoring
	if (title.includes("refactor")) {
		return { emoji: "♻️", label: "Refactor" };
	}

	// Bug fixes
	if (title.includes("fix")) {
		return { emoji: "🐛", label: "Fix" };
	}

	// New features / creation
	if (title.includes("create") || title.includes("add") || title.includes("implement")) {
		return { emoji: "✨", label: "Feature" };
	}

	// Security
	if (title.includes("cors") || title.includes("auth") || title.includes("security")) {
		return { emoji: "🔒", label: "Security" };
	}

	// Cleanup / deletion
	if (title.includes("delete") || title.includes("remove") || title.includes("extract")) {
		return { emoji: "🧹", label: "Cleanup" };
	}

	// Integration tests
	if (title.includes("integration") || title.includes("e2e") || title.includes("flow")) {
		return { emoji: "🔗", label: "Integration" };
	}

	// Replace / migrate
	if (title.includes("replace") || title.includes("generate")) {
		return { emoji: "🔄", label: "Update" };
	}

	// Default
	return { emoji: "📝", label: "Task" };
}

/**
 * Format task info line with enhanced details
 *
 * Examples:
 * - [INFO] 📦 Task 1/74 [Group 2] test/models/organization_test.dart
 *   Write tests for Organization model
 *
 * - [INFO] 🔌 Task 5/69 test/providers/admin_provider_test.dart
 *   Write tests for admin_provider
 *
 * With tokens:
 * - [INFO] 📦 Task 1/74 [12.2K tokens used] test/models/organization_test.dart
 */
export function formatTaskInfo(
	task: Task,
	iteration: number,
	remaining: number,
	sessionTokens?: { input: number; output: number },
): string {
	const total = iteration + remaining - 1;
	const filePath = extractFilePath(task.body);
	const typeInfo = getTaskTypeInfo(task, filePath);

	const parts: string[] = [];

	// Type emoji
	parts.push(typeInfo.emoji);

	// Task number
	parts.push(`Task ${iteration}/${total}`);

	// Session tokens (if provided)
	if (sessionTokens) {
		const totalTokens = sessionTokens.input + sessionTokens.output;
		const formattedTokens =
			totalTokens >= 1_000_000
				? `${(totalTokens / 1_000_000).toFixed(1)}M`
				: totalTokens >= 1_000
					? `${(totalTokens / 1_000).toFixed(1)}K`
					: totalTokens.toString();
		parts.push(pc.cyan(`[${formattedTokens} tokens]`));
	}

	// Parallel group (if applicable)
	if (task.parallelGroup && task.parallelGroup > 0) {
		parts.push(pc.yellow(`[Group ${task.parallelGroup}]`));
	}

	// File path (if available)
	if (filePath) {
		parts.push(pc.cyan(filePath));
	}

	// Task title (truncated if too long)
	const titleMaxLen = filePath ? 60 : 80;
	let title = task.title;
	if (title.length > titleMaxLen) {
		title = `${title.slice(0, titleMaxLen - 3)}...`;
	}
	parts.push(pc.dim(`— ${title}`));

	return parts.join(" ");
}

/**
 * Format compact task info (for spinner/progress)
 * Example: "📦 admin_provider_test.dart"
 */
export function formatCompactTaskInfo(task: Task): string {
	const filePath = extractFilePath(task.body);
	const typeInfo = getTaskTypeInfo(task, filePath);

	if (filePath) {
		// Just show filename, not full path
		const filename = filePath.split("/").pop() || filePath;
		return `${typeInfo.emoji} ${filename}`;
	}

	// Fallback to truncated title
	const title = task.title.length > 40 ? `${task.title.slice(0, 37)}...` : task.title;
	return `${typeInfo.emoji} ${title}`;
}
