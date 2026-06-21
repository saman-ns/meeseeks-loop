import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { formatProjectContext, loadConfig } from "../config/loader.ts";
import { logDebug } from "../ui/logger.ts";
import { sanitizeFilePath } from "../utils/sanitize.ts";
import { getBrowserInstructions, isBrowserAvailable } from "./browser.ts";

interface PromptOptions {
	task: string;
	autoCommit?: boolean;
	workDir?: string;
	browserEnabled?: "auto" | "true" | "false";
	skipTests?: boolean;
	skipLint?: boolean;
	prdFile?: string;
	/** File hints - specific files the agent should read first */
	fileHints?: string[];
	/** Blocker issue numbers — used to surface relevant contextguide sections */
	blockerIssueNumbers?: number[];
}

/**
 * Parse blocker issue numbers from a task body.
 * Matches "Blocked by #N" in any case, with or without leading dash.
 */
function parseBlockerNumbers(body: string): number[] {
	const matches = body.matchAll(/blocked by\s+#(\d+)/gi);
	return [...matches].map((m) => Number.parseInt(m[1], 10)).filter((n) => !Number.isNaN(n));
}

/**
 * Extract sections from the context guide that are relevant to specific blocker issue numbers.
 * Looks for sections starting with "## Task #N" or containing "issue #N" / "#N:".
 * Returns the matched sections joined together, capped at 60 lines.
 */
function extractBlockerContext(contextGuide: string, blockerNumbers: number[]): string {
	if (blockerNumbers.length === 0 || !contextGuide) return "";

	const lines = contextGuide.split("\n");
	const result: string[] = [];
	let inRelevantSection = false;
	let sectionLines = 0;

	for (const line of lines) {
		// Detect start of a new section
		if (line.startsWith("## ")) {
			// Check if this section header references any blocker number
			const isBlockerSection = blockerNumbers.some(
				(n) =>
					line.includes(`#${n}`) ||
					line.toLowerCase().includes(`issue ${n}`) ||
					line.includes(`:${n}`) ||
					line.includes(`${n}:`),
			);
			inRelevantSection = isBlockerSection;
			sectionLines = 0;
		}

		if (inRelevantSection && sectionLines < 30) {
			result.push(line);
			sectionLines++;
		}
	}

	return result.join("\n").trim();
}

/**
 * Load the context guide if it exists.
 * The context guide is a living document updated by agents with information
 * about recent changes, key files, and decisions made during the session.
 * Capped at the most recent 200 lines to prevent unbounded prompt growth.
 */
function loadContextGuide(workDir: string): string | null {
	const guidePath = join(workDir, ".meeseeks", "contextguide.md");
	if (!existsSync(guidePath)) {
		return null;
	}
	try {
		const content = readFileSync(guidePath, "utf-8").trim();
		if (!content) return null;

		const lines = content.split("\n");
		if (lines.length <= 200) return content;

		// Keep only the last 200 lines (most recent entries are appended at the end)
		const trimmed = lines.slice(-200).join("\n");
		return `[...earlier entries trimmed — showing last 200 lines]\n\n${trimmed}`;
	} catch (error) {
		logDebug("Failed to load context guide:", error);
		return null;
	}
}

/**
 * Detect skill/playbook directories that can guide the agent.
 * We keep this engine-agnostic: OpenCode can load skills via `skill` tool,
 * other engines can still read these docs as repo guidance.
 */
function detectAgentSkills(workDir: string): string[] {
	const candidates = [
		join(workDir, ".opencode", "skills"),
		join(workDir, ".claude", "skills"),
		join(workDir, ".skills"),
	];

	return candidates.filter((p) => existsSync(p));
}

/**
 * Build the full prompt with project context, rules, boundaries, and task
 */
export function buildPrompt(options: PromptOptions): string {
	const {
		task,
		autoCommit = true,
		workDir = process.cwd(),
		browserEnabled = "auto",
		skipTests = false,
		skipLint = false,
		prdFile,
		fileHints,
		blockerIssueNumbers,
	} = options;

	const parts: string[] = [];

	// Load config once for context, rules, and boundaries
	const config = loadConfig(workDir);

	const context = formatProjectContext(config);
	if (context) {
		parts.push(`## Project Context\n${context}`);
	}

	// Load context guide from previous agent sessions
	const contextGuide = loadContextGuide(workDir);
	if (contextGuide) {
		parts.push(`## Context Guide (from previous tasks)\n${contextGuide}`);
	}

	// Blocker-scoped context: surface contextguide sections from direct dependencies
	const effectiveBlockers = blockerIssueNumbers ?? parseBlockerNumbers(task);
	if (effectiveBlockers.length > 0 && contextGuide) {
		const blockerCtx = extractBlockerContext(contextGuide, effectiveBlockers);
		if (blockerCtx) {
			parts.push(
				`## Changes from blocking tasks (read carefully — your work builds on these)\n${blockerCtx}`,
			);
		}
	}

	const rules = config?.rules ?? [];
	if (rules.length > 0) {
		parts.push(`## Rules (you MUST follow these)\n${rules.join("\n")}`);
	}

	const boundaries = config?.boundaries.never_touch ?? [];
	if (boundaries.length > 0) {
		parts.push(`## Boundaries\nDo NOT modify these files/directories:\n${boundaries.join("\n")}`);
	}

	// Agent skills/playbooks (optional)
	const skillRoots = detectAgentSkills(workDir);
	if (skillRoots.length > 0) {
		parts.push(
			[
				"## Agent Skills",
				"This repo includes skill/playbook docs that describe preferred patterns, workflows, or tooling:",
				...skillRoots.map((p) => `- ${p}`),
				"",
				"Before you start coding:",
				"- Read and follow any relevant skill docs from the paths above.",
				"- If your engine supports a `skill` tool (e.g. OpenCode), use it to load the relevant skills before implementing.",
				"- If none apply, continue normally.",
			].join("\n"),
		);
	}

	// Add browser instructions if available
	if (isBrowserAvailable(browserEnabled)) {
		parts.push(getBrowserInstructions());
	}

	// File hints - specific files the agent should read first
	if (fileHints && fileHints.length > 0) {
		parts.push(
			[
				"## File Hints",
				"Start by reading these files before exploring the codebase — they are directly relevant to this task:",
				// File hints can come from untrusted task sources (YAML/GitHub); strip
				// path-traversal sequences before injecting them into the prompt.
				...fileHints.map((f) => `- ${sanitizeFilePath(f)}`),
			].join("\n"),
		);
	}

	// Add the task
	parts.push(`## Task\n${task}`);

	// Add instructions
	const instructions = ["1. Implement the task described above"];

	let step = 2;

	// Exploration-minimizing instruction
	if (fileHints && fileHints.length > 0) {
		instructions.push(
			`${step}. Read the files listed in File Hints first. Only explore beyond those files if necessary to complete the task`,
		);
	} else if (contextGuide) {
		instructions.push(
			`${step}. Use the Context Guide above to orient yourself. Only explore the codebase for files not already described there`,
		);
	} else {
		instructions.push(
			`${step}. Minimize broad directory exploration. Search for specific files relevant to the task rather than scanning the full project structure`,
		);
	}
	step++;

	if (!skipTests) {
		instructions.push(`${step}. Write tests for the feature`);
		step++;
		instructions.push(`${step}. Run tests and ensure they pass before proceeding`);
		step++;
	}

	if (!skipLint) {
		instructions.push(`${step}. Run linting and ensure it passes`);
		step++;
	}

	instructions.push(`${step}. Ensure the code works correctly`);
	step++;

	if (autoCommit) {
		instructions.push(`${step}. Commit your changes with a descriptive message`);
		step++;
	}

	// Context guide update instruction
	instructions.push(
		`${step}. Update .meeseeks/contextguide.md — append a section starting with "## Task #N: title" (use the issue number and title from the ## Task section above), then note: which files you modified, key decisions made, and anything the next task's agent should know. Create the file if it does not exist`,
	);

	parts.push(`## Instructions\n${instructions.join("\n")}`);

	// Add final note
	const prdNote = prdFile ? `Do NOT modify ${prdFile}.` : "Do NOT modify the PRD file.";
	parts.push(
		[
			prdNote,
			"Do NOT modify .meeseeks/progress.txt, .meeseeks-worktrees, or .meeseeks-sandboxes.",
			"Keep changes focused and minimal. Do not refactor unrelated code.",
		].join(" "),
	);

	return parts.join("\n\n");
}

interface ParallelPromptOptions {
	task: string;
	progressFile: string;
	prdFile?: string;
	skipTests?: boolean;
	skipLint?: boolean;
	browserEnabled?: "auto" | "true" | "false";
	allowCommit?: boolean;
	/** File hints - specific files the agent should read first */
	fileHints?: string[];
}

/**
 * Build a prompt for parallel agent execution
 */
export function buildParallelPrompt(options: ParallelPromptOptions): string {
	const {
		task,
		progressFile,
		prdFile,
		skipTests = false,
		skipLint = false,
		browserEnabled = "auto",
		allowCommit = true,
		fileHints,
	} = options;

	// Parallel execution typically runs in a worktree; we still try to detect skills from CWD.
	// If callers pass a workDir in the future, prefer that instead.
	const skillRoots = detectAgentSkills(process.cwd());
	const skillsSection =
		skillRoots.length > 0
			? `\n\nAgent Skills:\nThis repo includes skill/playbook docs:\n${skillRoots
					.map((p) => `- ${p}`)
					.join(
						"\n",
					)}\nBefore coding, read relevant skills. If your engine supports a \`skill\` tool, load them before implementing.`
			: "";

	const browserSection = isBrowserAvailable(browserEnabled)
		? `\n\n${getBrowserInstructions()}`
		: "";

	// Context guide from previous tasks
	const contextGuide = loadContextGuide(process.cwd());
	const contextSection = contextGuide
		? `\n\nContext Guide (from previous tasks):\n${contextGuide}`
		: "";

	// File hints
	const fileHintsSection =
		fileHints && fileHints.length > 0
			? `\n\nFile Hints — read these files first before exploring:\n${fileHints.map((f) => `- ${f}`).join("\n")}`
			: "";

	const instructions = ["1. Implement this specific task completely"];

	let step = 2;

	// Exploration-minimizing instruction
	if (fileHints && fileHints.length > 0) {
		instructions.push(
			`${step}. Read the files listed in File Hints first. Only explore beyond those if necessary`,
		);
	} else {
		instructions.push(
			`${step}. Minimize broad exploration. Search for specific files relevant to the task`,
		);
	}
	step++;

	if (!skipTests) {
		instructions.push(`${step}. Write tests for the feature`);
		step++;
		instructions.push(`${step}. Run tests and ensure they pass before proceeding`);
		step++;
	}

	if (!skipLint) {
		instructions.push(`${step}. Run linting and ensure it passes`);
		step++;
	}

	instructions.push(`${step}. Update ${progressFile} with what you did`);
	step++;
	if (allowCommit) {
		instructions.push(`${step}. Commit your changes with a descriptive message`);
		step++;
	} else {
		instructions.push(`${step}. Do NOT run git commit; changes will be collected automatically`);
		step++;
	}

	instructions.push(
		`${step}. Update .meeseeks/contextguide.md — append which files you modified, key decisions, and notes for the next agent. Create the file if it does not exist`,
	);

	return `You are working on a specific task. Focus ONLY on this task:

TASK: ${task}${browserSection}${skillsSection}${contextSection}${fileHintsSection}

Instructions:
${instructions.join("\n")}

${prdFile ? `Do NOT modify ${prdFile}.` : "Do NOT modify the PRD file."}
Do NOT modify .meeseeks/progress.txt, .meeseeks-worktrees, or .meeseeks-sandboxes.
Do NOT mark tasks complete - that will be handled separately.
Focus only on implementing: ${task}`;
}
