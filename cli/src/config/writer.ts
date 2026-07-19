import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import YAML from "yaml";
import { detectProject } from "./detector.ts";
import { getConfigPath, getMeeseeksDir, getProgressPath } from "./loader.ts";
import type { MeeseeksConfig } from "./types.ts";

/**
 * Create the default config YAML content
 */
function createConfigContent(detected: ReturnType<typeof detectProject>): string {
	return `# Meeseeks Configuration
# https://github.com/saman-ns/meeseeks-loop

# Project info (auto-detected, edit if needed)
project:
  name: "${escapeYaml(detected.name)}"
  language: "${escapeYaml(detected.language || "Unknown")}"
  framework: "${escapeYaml(detected.framework)}"
  description: ""  # Add a brief description

# Commands (auto-detected from package.json/pyproject.toml)
commands:
  test: "${escapeYaml(detected.testCmd)}"
  lint: "${escapeYaml(detected.lintCmd)}"
  build: "${escapeYaml(detected.buildCmd)}"

# Rules - instructions the AI MUST follow
# These are injected into every prompt
rules:
  # Examples:
  # - "Always use TypeScript strict mode"
  # - "Follow the error handling pattern in src/utils/errors.ts"
  # - "All API endpoints must have input validation with Zod"
  # - "Use server actions instead of API routes in Next.js"
  #
  # Skills/playbooks (optional):
  # - "Before coding, read and follow any relevant skill/playbook docs under .opencode/skills or .claude/skills."

# Boundaries - files/folders the AI should not modify
boundaries:
  never_touch:
    # Examples:
    # - "src/legacy/**"
    # - "migrations/**"
    # - "*.lock"
`;
}

/**
 * Escape a value for safe YAML string
 */
function escapeYaml(value: string | undefined | null): string {
	return (value || "").replace(/"/g, '\\"');
}

/**
 * Initialize the .meeseeks directory with config files
 */
export function initConfig(workDir = process.cwd()): {
	created: boolean;
	detected: ReturnType<typeof detectProject>;
} {
	const meeseeksDir = getMeeseeksDir(workDir);
	const configPath = getConfigPath(workDir);
	const progressPath = getProgressPath(workDir);

	// Detect project settings
	const detected = detectProject(workDir);

	// Create directory if it doesn't exist
	if (!existsSync(meeseeksDir)) {
		mkdirSync(meeseeksDir, { recursive: true });
	}

	// Create config file
	const configContent = createConfigContent(detected);
	writeFileSync(configPath, configContent, "utf-8");

	// Create progress file
	writeFileSync(progressPath, "# Meeseeks Progress Log\n\n", "utf-8");

	return { created: true, detected };
}

/**
 * Add a rule to the config
 */
export function addRule(rule: string, workDir = process.cwd()): void {
	const configPath = getConfigPath(workDir);

	if (!existsSync(configPath)) {
		throw new Error(`No config found. Run 'meeseeks --init' first.`);
	}

	const content = readFileSync(configPath, "utf-8");
	const parsed = YAML.parse(content) as MeeseeksConfig;

	// Ensure rules array exists
	if (!parsed.rules) {
		parsed.rules = [];
	}

	// Add the rule
	parsed.rules.push(rule);

	// Write back
	writeFileSync(configPath, YAML.stringify(parsed), "utf-8");
}

/** Queue for batching progress writes */
const progressWriteQueue: Map<string, string[]> = new Map();
let flushTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Flush all pending progress writes to disk
 */
async function flushProgressWrites(): Promise<void> {
	if (progressWriteQueue.size === 0) return;

	const entries = [...progressWriteQueue.entries()];
	progressWriteQueue.clear();
	flushTimeout = null;

	for (const [path, lines] of entries) {
		try {
			await appendFile(path, lines.join(""), "utf-8");
		} catch {
			// Ignore write errors for progress logging
		}
	}
}

/**
 * Schedule a flush of progress writes (debounced)
 */
function scheduleFlush(): void {
	if (flushTimeout) return;
	flushTimeout = setTimeout(() => {
		void flushProgressWrites();
	}, 100); // Batch writes within 100ms window
}

/**
 * Log a task to the progress file (async, batched)
 *
 * Performance optimized: uses async I/O and batches writes within 100ms windows
 * to reduce file system contention in parallel mode.
 */
export function logTaskProgress(
	task: string,
	status: "completed" | "failed",
	workDir = process.cwd(),
): void {
	const progressPath = getProgressPath(workDir);

	if (!existsSync(progressPath)) {
		return;
	}

	const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
	const icon = status === "completed" ? "✓" : "✗";
	const line = `- [${icon}] ${timestamp} - ${task}\n`;

	// Add to write queue
	const existing = progressWriteQueue.get(progressPath) || [];
	existing.push(line);
	progressWriteQueue.set(progressPath, existing);

	// Schedule async flush
	scheduleFlush();
}

/**
 * Force flush all pending progress writes immediately
 * Call this before process exit to ensure all writes are persisted
 */
export async function flushAllProgressWrites(): Promise<void> {
	if (flushTimeout) {
		clearTimeout(flushTimeout);
		flushTimeout = null;
	}
	await flushProgressWrites();
}
