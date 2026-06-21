import { spawn, spawnSync } from "node:child_process";
import type { AIEngine, AIResult, EngineOptions, ProgressCallback } from "./types.ts";

const isWindows = process.platform === "win32";

/**
 * Check if a command is available in PATH
 */
export async function commandExists(command: string): Promise<boolean> {
	try {
		const checkCommand = isWindows ? "where" : "which";
		const result = spawnSync(checkCommand, [command], { stdio: "pipe" });
		return result.status === 0;
	} catch {
		return false;
	}
}

/**
 * Execute a command and return stdout
 * @param stdinContent - Optional content to pass via stdin (useful for multi-line prompts on Windows)
 */
export async function execCommand(
	command: string,
	args: string[],
	workDir: string,
	env?: Record<string, string>,
	stdinContent?: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	// Use shell on Windows to execute .cmd wrappers
	return new Promise((resolve) => {
		const proc = spawn(command, args, {
			cwd: workDir,
			env: { ...process.env, ...env },
			stdio: [stdinContent ? "pipe" : "ignore", "pipe", "pipe"],
			shell: isWindows, // Required on Windows for npm global commands (.cmd wrappers)
		});

		// Write stdin content if provided
		if (stdinContent && proc.stdin) {
			proc.stdin.write(stdinContent);
			proc.stdin.end();
		}

		let stdout = "";
		let stderr = "";

		proc.stdout?.on("data", (data) => {
			stdout += data.toString();
		});

		proc.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		proc.on("close", (exitCode) => {
			resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
		});

		proc.on("error", (err) => {
			// Maintain backward compatibility - don't reject, include error in stderr
			stderr += `\nSpawn error: ${err.message}`;
			resolve({ stdout, stderr, exitCode: 1 });
		});
	});
}

/**
 * Parse token counts from stream-json output (Claude/Qwen format)
 *
 * Claude's stream-json emits usage data across multiple event types, not just
 * the final "result" event. We track the maximum input/output tokens seen across
 * ALL events to get accurate cumulative totals.
 */
export function parseStreamJsonResult(output: string): {
	response: string;
	inputTokens: number;
	outputTokens: number;
} {
	const lines = output.split("\n").filter(Boolean);
	let response = "";
	let maxInputTokens = 0;
	let maxOutputTokens = 0;
	let resultInputTokens = 0;
	let resultOutputTokens = 0;

	for (const line of lines) {
		try {
			const parsed = JSON.parse(line);

			// Extract usage from any event that carries it
			const usage = parsed.usage;
			if (usage) {
				const inTokens = usage.input_tokens || usage.total_input_tokens || 0;
				const outTokens = usage.output_tokens || usage.total_output_tokens || 0;
				if (inTokens > maxInputTokens) maxInputTokens = inTokens;
				if (outTokens > maxOutputTokens) maxOutputTokens = outTokens;
			}

			// Also check top-level alternate keys
			const topIn = parsed.total_input_tokens || 0;
			const topOut = parsed.total_output_tokens || 0;
			if (topIn > maxInputTokens) maxInputTokens = topIn;
			if (topOut > maxOutputTokens) maxOutputTokens = topOut;

			if (parsed.type === "result") {
				response = parsed.result || "Task completed";
				resultInputTokens = usage?.input_tokens || usage?.total_input_tokens || 0;
				resultOutputTokens = usage?.output_tokens || usage?.total_output_tokens || 0;
			}
		} catch {
			// Ignore non-JSON lines
		}
	}

	// Use result event totals if they are >= accumulated max, otherwise use accumulated max
	const inputTokens = resultInputTokens >= maxInputTokens ? resultInputTokens : maxInputTokens;
	const outputTokens = resultOutputTokens >= maxOutputTokens ? resultOutputTokens : maxOutputTokens;

	// Debug: Log suspiciously low token counts (< 500 input tokens is unusual for Claude Code)
	if (process.env.DEBUG_TOKENS && inputTokens < 500 && inputTokens > 0) {
		console.error(
			`[DEBUG] Low input tokens detected: ${inputTokens} (result: ${resultInputTokens}, max: ${maxInputTokens})`,
		);
	}

	return { response: response || "Task completed", inputTokens, outputTokens };
}

/**
 * Check for errors in stream-json output
 */
export function checkForErrors(output: string): string | null {
	const lines = output.split("\n").filter(Boolean);

	for (const line of lines) {
		try {
			const parsed = JSON.parse(line);
			if (parsed.type === "error") {
				return parsed.error?.message || parsed.message || "Unknown error";
			}
			// Detect errors from result events (e.g., rate limit, quota exceeded)
			if (parsed.type === "result" && parsed.is_error) {
				return parsed.result || "Unknown error";
			}
		} catch {
			// Ignore non-JSON lines
		}
	}

	return null;
}

/**
 * Format a command failure with useful output context.
 */
export function formatCommandError(exitCode: number, output: string): string {
	const trimmed = output.trim();
	if (!trimmed) {
		return `Command failed with exit code ${exitCode}`;
	}

	const lines = trimmed.split("\n").filter(Boolean);
	const snippet = lines.slice(-12).join("\n");
	return `Command failed with exit code ${exitCode}. Output:\n${snippet}`;
}

/**
 * Read a stream line by line, calling onLine for each non-empty line
 */
async function readStream(
	stream: ReadableStream<Uint8Array>,
	onLine: (line: string) => void,
): Promise<void> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			for (const line of lines) {
				if (line.trim()) onLine(line);
			}
		}
		if (buffer.trim()) onLine(buffer);
	} finally {
		reader.releaseLock();
	}
}

/**
 * Execute a command with streaming output, calling onLine for each line
 * @param stdinContent - Optional content to pass via stdin (useful for multi-line prompts on Windows)
 */
export async function execCommandStreaming(
	command: string,
	args: string[],
	workDir: string,
	onLine: (line: string) => void,
	env?: Record<string, string>,
	stdinContent?: string,
): Promise<{ exitCode: number }> {
	// Use shell on Windows to execute .cmd wrappers
	return new Promise((resolve) => {
		const proc = spawn(command, args, {
			cwd: workDir,
			env: { ...process.env, ...env },
			stdio: [stdinContent ? "pipe" : "ignore", "pipe", "pipe"],
			shell: isWindows, // Required on Windows for npm global commands (.cmd wrappers)
		});

		// Write stdin content if provided
		if (stdinContent && proc.stdin) {
			proc.stdin.write(stdinContent);
			proc.stdin.end();
		}

		let stdoutBuffer = "";
		let stderrBuffer = "";

		const processBuffer = (buffer: string, isStderr = false) => {
			const lines = buffer.split("\n");
			const remaining = lines.pop() || "";
			for (const line of lines) {
				if (line.trim()) onLine(line);
			}
			return remaining;
		};

		proc.stdout?.on("data", (data) => {
			stdoutBuffer += data.toString();
			stdoutBuffer = processBuffer(stdoutBuffer);
		});

		proc.stderr?.on("data", (data) => {
			stderrBuffer += data.toString();
			stderrBuffer = processBuffer(stderrBuffer, true);
		});

		proc.on("close", (exitCode) => {
			// Process any remaining data
			if (stdoutBuffer.trim()) onLine(stdoutBuffer);
			if (stderrBuffer.trim()) onLine(stderrBuffer);
			resolve({ exitCode: exitCode ?? 1 });
		});

		proc.on("error", (err) => {
			// Maintain backward compatibility - don't reject, report error via onLine
			onLine(`Spawn error: ${err.message}`);
			resolve({ exitCode: 1 });
		});
	});
}

/**
 * Check if a file path looks like a test file
 */
function isTestFile(filePath: string): boolean {
	const lower = filePath.toLowerCase();
	return (
		lower.includes(".test.") ||
		lower.includes(".spec.") ||
		lower.includes("__tests__") ||
		lower.includes("_test.go")
	);
}

/**
 * Extract a short filename from a full path for display
 */
function shortFileName(filePath: string): string {
	if (!filePath) return "";
	const parts = filePath.split("/");
	return parts[parts.length - 1] || "";
}

/**
 * Detect the current step from a JSON output line
 * Returns step name like "Reading auth.ts", "Implementing config.ts", etc.
 */
export function detectStepFromOutput(line: string): string | null {
	// Fast path: skip non-JSON lines
	const trimmed = line.trim();
	if (!trimmed.startsWith("{")) {
		return null;
	}

	try {
		const parsed = JSON.parse(trimmed);

		// Extract specific fields for pattern matching (avoid stringifying entire object)
		const toolName =
			parsed.tool?.toLowerCase() ||
			parsed.name?.toLowerCase() ||
			parsed.tool_name?.toLowerCase() ||
			"";
		const command = parsed.command?.toLowerCase() || "";
		const rawFilePath = parsed.file_path || parsed.filePath || parsed.path || "";
		const filePath = rawFilePath.toLowerCase();
		const description = (parsed.description || "").toLowerCase();
		const fileName = shortFileName(rawFilePath);

		// Check tool name first to determine operation type
		const isReadOperation = toolName === "read" || toolName === "glob" || toolName === "grep";
		const isWriteOperation = toolName === "write" || toolName === "edit";

		// Reading code - check this early to avoid misclassifying reads of test files
		if (isReadOperation) {
			if (toolName === "grep") return "Searching code";
			if (toolName === "glob") return "Scanning files";
			return fileName ? `Reading ${fileName}` : "Reading code";
		}

		// Git commit
		if (command.includes("git commit") || description.includes("git commit")) {
			return "Committing";
		}

		// Git add/staging
		if (command.includes("git add") || description.includes("git add")) {
			return "Staging";
		}

		// Linting - check command for lint tools
		if (
			command.includes("lint") ||
			command.includes("eslint") ||
			command.includes("biome") ||
			command.includes("prettier")
		) {
			return "Linting";
		}

		// Testing - check command for test runners
		if (
			command.includes("vitest") ||
			command.includes("jest") ||
			command.includes("bun test") ||
			command.includes("npm test") ||
			command.includes("pytest") ||
			command.includes("go test") ||
			command.includes("flutter test")
		) {
			return "Testing";
		}

		// Writing tests - only for write operations to test files
		if (isWriteOperation && isTestFile(filePath)) {
			return fileName ? `Writing ${fileName}` : "Writing tests";
		}

		// Writing/Editing code
		if (isWriteOperation) {
			return fileName ? `Editing ${fileName}` : "Implementing";
		}

		// Bash commands - show abbreviated command
		if (toolName === "bash" && command) {
			const shortCmd = command.length > 30 ? `${command.slice(0, 27)}...` : command;
			return `Running: ${shortCmd}`;
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * Base implementation for AI engines
 */
export abstract class BaseAIEngine implements AIEngine {
	abstract name: string;
	abstract cliCommand: string;

	async isAvailable(): Promise<boolean> {
		return commandExists(this.cliCommand);
	}

	abstract execute(prompt: string, workDir: string, options?: EngineOptions): Promise<AIResult>;

	/**
	 * Execute with streaming progress updates (optional implementation)
	 */
	executeStreaming?(
		prompt: string,
		workDir: string,
		onProgress: ProgressCallback,
		options?: EngineOptions,
	): Promise<AIResult>;
}
