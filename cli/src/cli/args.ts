import { existsSync, statSync } from "node:fs";
import { Command } from "commander";
import type { RuntimeOptions } from "../config/types.ts";

const VERSION = "5.1.0";

/**
 * Create the CLI program with all options
 */
export function createProgram(): Command {
	const program = new Command();

	program
		.name("meeseeks")
		.description(
			"Meeseeks — Token-Optimized Autonomous AI Coding Loop with interactive mode and quota tracking",
		)
		.version(VERSION)
		.argument("[task]", "Single task to execute (brownfield mode)")
		.option("--init", "Initialize .meeseeks/ configuration")
		.option("--init-interactive", "Interactive project setup with guided questions")
		.option("--config", "Show current configuration")
		.option("--add-rule <rule>", "Add a rule to config")
		.option("--no-tests, --skip-tests", "Skip running tests")
		.option("--no-lint, --skip-lint", "Skip running lint")
		.option("--fast", "Skip both tests and lint")
		.option("--claude", "Use Claude Code (default)")
		.option("--opencode", "Use OpenCode")
		.option("--cursor", "Use Cursor Agent")
		.option("--codex", "Use Codex")
		.option("--qwen", "Use Qwen-Code")
		.option("--droid", "Use Factory Droid")
		.option("--copilot", "Use GitHub Copilot")
		.option("--dry-run", "Show what would be done without executing")
		.option("--max-iterations <n>", "Maximum iterations (0 = unlimited)", "0")
		.option("--max-retries <n>", "Maximum retries per task", "3")
		.option("--retry-delay <n>", "Delay between retries in seconds", "5")
		.option("--parallel", "Run tasks in parallel using worktrees")
		.option(
			"--sandbox",
			"Use lightweight sandboxes instead of git worktrees (faster for large repos)",
		)
		.option("--max-parallel <n>", "Maximum parallel agents", "3")
		.option("--branch-per-task", "Create a branch for each task")
		.option("--base-branch <branch>", "Base branch for PRs")
		.option("--create-pr", "Create pull request after each task")
		.option("--draft-pr", "Create PRs as draft")
		.option(
			"--prd <path>",
			"PRD file or folder (auto-detects PRD.md, PRD.yaml, or PRD.yml)",
			"PRD.md",
		)
		.option("--yaml <file>", "YAML task file")
		.option("--github <repo>", "GitHub repo for issues (owner/repo)")
		.option("--github-label <label>", "Filter GitHub issues by label")
		.option("--no-commit", "Don't auto-commit changes")
		.option("--browser", "Enable browser automation (agent-browser)")
		.option("--no-browser", "Disable browser automation")
		.option("--model <name>", "Override default model for the engine")
		.option("--sonnet", "Shortcut for --claude --model sonnet")
		.option("--no-merge", "Skip automatic branch merging after parallel execution")
		.option("--interactive", "Prompt before each task for approval (Y/n/s/e/a/q)")
		.option("--plan", "Enable planning mode: AI creates execution plan before running tasks")
		.option("--quota-interval <n>", "Check Anthropic API quota every N tasks", "5")
		.option(
			"--optimize-tokens",
			"Run token optimization pre-check before starting tasks (enabled by default, use --no-optimize-tokens to disable)",
		)
		.option("--no-optimize-tokens", "Disable token optimization pre-check")
		.option("--wait-for-pr-merge", "Wait for PR to be merged before proceeding to next task")
		.option(
			"--verify <command>",
			"Shell command to run after each task to verify correctness (non-zero = task fails)",
		)
		.option("-v, --verbose", "Verbose output")
		.allowUnknownOption();

	return program;
}

/**
 * Parse command line arguments into RuntimeOptions
 */
export function parseArgs(args: string[]): {
	options: RuntimeOptions;
	task: string | undefined;
	initMode: boolean;
	initInteractive: boolean;
	showConfig: boolean;
	addRule: string | undefined;
	optimizeTokensMode: boolean;
} {
	// Find the -- separator and extract engine-specific arguments
	const separatorIndex = args.indexOf("--");
	let engineArgs: string[] = [];
	let meeseeksArgs = args;

	if (separatorIndex !== -1) {
		engineArgs = args.slice(separatorIndex + 1);
		meeseeksArgs = args.slice(0, separatorIndex);
	}

	const program = createProgram();
	program.parse(meeseeksArgs);

	const opts = program.opts();
	const [task] = program.args;

	// Determine AI engine (--sonnet implies --claude)
	let aiEngine = "claude";
	if (opts.sonnet) aiEngine = "claude";
	else if (opts.opencode) aiEngine = "opencode";
	else if (opts.cursor) aiEngine = "cursor";
	else if (opts.codex) aiEngine = "codex";
	else if (opts.qwen) aiEngine = "qwen";
	else if (opts.droid) aiEngine = "droid";
	else if (opts.copilot) aiEngine = "copilot";

	// Determine model override (default to sonnet for cost efficiency)
	const modelOverride = opts.sonnet ? "sonnet" : opts.model || "sonnet";

	// Determine PRD source with auto-detection for file vs folder
	let prdSource: "markdown" | "markdown-folder" | "yaml" | "github" = "markdown";
	let prdFile = opts.prd || "PRD.md";
	let prdIsFolder = false;

	if (opts.yaml) {
		prdSource = "yaml";
		prdFile = opts.yaml;
	} else if (opts.github) {
		prdSource = "github";
	} else {
		// Auto-detect PRD file if using defaults
		if (!opts.yaml && !opts.github && opts.prd === "PRD.md") {
			const candidates = ["PRD.md", "PRD.yaml", "PRD.yml"];
			for (const candidate of candidates) {
				if (existsSync(candidate)) {
					prdFile = candidate;
					if (candidate.endsWith(".yaml") || candidate.endsWith(".yml")) {
						prdSource = "yaml";
					}
					if (opts.verbose) {
						console.log(`Auto-detected PRD file: ${candidate}`);
					}
					break;
				}
			}
		}

		// Auto-detect if PRD path is a file or folder
		if (existsSync(prdFile)) {
			const stat = statSync(prdFile);
			if (stat.isDirectory()) {
				prdSource = "markdown-folder";
				prdIsFolder = true;
			}
		}
	}

	// Handle --fast
	const skipTests = opts.fast || opts.skipTests;
	const skipLint = opts.fast || opts.skipLint;

	const options: RuntimeOptions = {
		skipTests,
		skipLint,
		aiEngine,
		dryRun: opts.dryRun || false,
		maxIterations: Number.parseInt(opts.maxIterations, 10) || 0,
		maxRetries: Number.parseInt(opts.maxRetries, 10) || 3,
		retryDelay: Number.parseInt(opts.retryDelay, 10) || 5,
		verbose: opts.verbose || false,
		branchPerTask: opts.branchPerTask || false,
		baseBranch: opts.baseBranch || "",
		createPr: opts.createPr || false,
		draftPr: opts.draftPr || false,
		parallel: opts.parallel || false,
		maxParallel: Number.parseInt(opts.maxParallel, 10) || 3,
		prdSource,
		prdFile,
		prdIsFolder,
		githubRepo: opts.github || "",
		githubLabel: opts.githubLabel || "",
		autoCommit: opts.commit !== false,
		browserEnabled: opts.browser === true ? "true" : opts.browser === false ? "false" : "auto",
		modelOverride,
		skipMerge: opts.merge === false,
		useSandbox: opts.sandbox || false,
		engineArgs,
		interactive: opts.interactive || false,
		planMode: opts.plan || false,
		quotaCheckInterval: Number.parseInt(opts.quotaInterval, 10) || 5,
		optimizeTokens: opts.optimizeTokens !== false,
		waitForPrMerge: opts.waitForPrMerge || false,
		verifyCommand: opts.verify || "",
	};

	return {
		options,
		task,
		initMode: opts.init || false,
		initInteractive: opts.initInteractive || false,
		showConfig: opts.config || false,
		addRule: opts.addRule,
		optimizeTokensMode: opts.optimizeTokens || false,
	};
}

/**
 * Print version
 */
export function printVersion(): void {
	console.log(`meeseeks v${VERSION}`);
}

/**
 * Print help
 */
export function printHelp(): void {
	const program = createProgram();
	program.outputHelp();
}
