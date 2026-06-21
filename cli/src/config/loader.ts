import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { type MeeseeksConfig, MeeseeksConfigSchema } from "./types.ts";

export const MEESEEKS_DIR = ".meeseeks";
export const CONFIG_FILE = "config.yaml";
export const PROGRESS_FILE = "progress.txt";

/**
 * Get the full path to the meeseeks directory
 */
export function getMeeseeksDir(workDir = process.cwd()): string {
	const meeseeksDir = join(workDir, MEESEEKS_DIR);
	return meeseeksDir;
}

/**
 * Get the full path to the config file
 */
export function getConfigPath(workDir = process.cwd()): string {
	return join(getMeeseeksDir(workDir), CONFIG_FILE);
}

/**
 * Get the full path to the progress file
 */
export function getProgressPath(workDir = process.cwd()): string {
	return join(getMeeseeksDir(workDir), PROGRESS_FILE);
}

/**
 * Check if meeseeks is initialized in the directory
 */
export function isInitialized(workDir = process.cwd()): boolean {
	return existsSync(getConfigPath(workDir));
}

/**
 * Load the meeseeks config from disk
 */
export function loadConfig(workDir = process.cwd()): MeeseeksConfig | null {
	const configPath = getConfigPath(workDir);

	if (!existsSync(configPath)) {
		return null;
	}

	try {
		const content = readFileSync(configPath, "utf-8");
		const parsed = YAML.parse(content);
		return MeeseeksConfigSchema.parse(parsed);
	} catch (error) {
		// Log error for debugging, but return default config
		console.error(`Warning: Failed to parse config at ${configPath}:`, error);
		return MeeseeksConfigSchema.parse({});
	}
}

/**
 * Get rules from config
 */
export function loadRules(workDir = process.cwd()): string[] {
	const config = loadConfig(workDir);
	return config?.rules ?? [];
}

/**
 * Get boundaries from config
 */
export function loadBoundaries(workDir = process.cwd()): string[] {
	const config = loadConfig(workDir);
	return config?.boundaries.never_touch ?? [];
}

/**
 * Get test command from config
 */
export function loadTestCommand(workDir = process.cwd()): string {
	const config = loadConfig(workDir);
	return config?.commands.test ?? "";
}

/**
 * Get lint command from config
 */
export function loadLintCommand(workDir = process.cwd()): string {
	const config = loadConfig(workDir);
	return config?.commands.lint ?? "";
}

/**
 * Get build command from config
 */
export function loadBuildCommand(workDir = process.cwd()): string {
	const config = loadConfig(workDir);
	return config?.commands.build ?? "";
}

/**
 * Format project context from a loaded config object
 */
export function formatProjectContext(config: MeeseeksConfig | null): string {
	if (!config) return "";

	const parts: string[] = [];
	if (config.project.name) parts.push(`Project: ${config.project.name}`);
	if (config.project.language) parts.push(`Language: ${config.project.language}`);
	if (config.project.framework) parts.push(`Framework: ${config.project.framework}`);
	if (config.project.description) parts.push(`Description: ${config.project.description}`);

	return parts.join("\n");
}

/**
 * Get project context as a formatted string
 */
export function loadProjectContext(workDir = process.cwd()): string {
	return formatProjectContext(loadConfig(workDir));
}
