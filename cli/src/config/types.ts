import { z } from "zod";

/**
 * Project info schema
 */
export const ProjectSchema = z.object({
	name: z.string().default(""),
	language: z.string().default(""),
	framework: z.string().default(""),
	description: z.string().default(""),
});

/**
 * Notifications schema for webhook configuration
 */
export const NotificationsSchema = z.object({
	discord_webhook: z.string().default(""),
	slack_webhook: z.string().default(""),
	custom_webhook: z.string().default(""),
});

/**
 * Commands schema
 */
export const CommandsSchema = z.object({
	test: z.string().default(""),
	lint: z.string().default(""),
	build: z.string().default(""),
});

/**
 * Boundaries schema
 */
export const BoundariesSchema = z.object({
	never_touch: z
		.array(z.string())
		.nullable()
		.transform((v) => v ?? [])
		.default([]),
});

/**
 * Full Meeseeks config schema
 */
export const MeeseeksConfigSchema = z.object({
	project: ProjectSchema.default({}),
	commands: CommandsSchema.default({}),
	rules: z
		.array(z.string())
		.nullable()
		.transform((v) => v ?? [])
		.default([]),
	boundaries: BoundariesSchema.default({}),
	notifications: NotificationsSchema.default({}),
});

/**
 * Meeseeks configuration from .meeseeks/config.yaml
 */
export type MeeseeksConfig = z.infer<typeof MeeseeksConfigSchema>;

/**
 * Runtime options parsed from CLI args
 */
export interface RuntimeOptions {
	/** Skip running tests */
	skipTests: boolean;
	/** Skip running lint */
	skipLint: boolean;
	/** AI engine to use */
	aiEngine: string;
	/** Dry run mode (don't execute) */
	dryRun: boolean;
	/** Maximum iterations (0 = unlimited) */
	maxIterations: number;
	/** Maximum retries per task */
	maxRetries: number;
	/** Delay between retries in seconds */
	retryDelay: number;
	/** Verbose output */
	verbose: boolean;
	/** Create branch per task */
	branchPerTask: boolean;
	/** Base branch for PRs */
	baseBranch: string;
	/** Create PR after task */
	createPr: boolean;
	/** Create draft PR */
	draftPr: boolean;
	/** Run tasks in parallel */
	parallel: boolean;
	/** Maximum parallel agents */
	maxParallel: number;
	/** PRD source type */
	prdSource: "markdown" | "markdown-folder" | "yaml" | "github";
	/** PRD file or folder path */
	prdFile: string;
	/** Whether PRD path is a folder */
	prdIsFolder: boolean;
	/** GitHub repo (owner/repo) */
	githubRepo: string;
	/** GitHub issue label filter */
	githubLabel: string;
	/** Auto-commit changes */
	autoCommit: boolean;
	/** Browser automation mode: 'auto' | 'true' | 'false' */
	browserEnabled: "auto" | "true" | "false";
	/** Override default model for the engine */
	modelOverride?: string;
	/** Skip automatic branch merging after parallel execution */
	skipMerge?: boolean;
	/** Use lightweight sandboxes instead of git worktrees for parallel execution */
	useSandbox?: boolean;
	/** Additional arguments to pass to the engine CLI */
	engineArgs?: string[];
	/** Interactive mode: prompt before each task for approval */
	interactive?: boolean;
	/** Planning mode: AI creates execution plan before running tasks */
	planMode?: boolean;
	/** How often to check Anthropic API quota (every N completed tasks) */
	quotaCheckInterval?: number;
	/** Run token optimization pre-check (generate CLAUDE.md, .claudeignore, etc.) */
	optimizeTokens?: boolean;
	/** Wait for PR to be merged before marking task complete and moving on */
	waitForPrMerge?: boolean;
	/** Shell command to run after agent completes to verify correctness (non-zero = task fails) */
	verifyCommand?: string;
}

/**
 * Default runtime options
 */
export const DEFAULT_OPTIONS: RuntimeOptions = {
	skipTests: false,
	skipLint: false,
	aiEngine: "claude",
	dryRun: false,
	maxIterations: 0,
	maxRetries: 3,
	retryDelay: 5,
	verbose: false,
	branchPerTask: false,
	baseBranch: "",
	createPr: false,
	draftPr: false,
	parallel: false,
	maxParallel: 3,
	prdSource: "markdown",
	prdFile: "PRD.md",
	prdIsFolder: false,
	githubRepo: "",
	githubLabel: "",
	autoCommit: true,
	browserEnabled: "auto",
	interactive: false,
	quotaCheckInterval: 5,
	optimizeTokens: true,
};
