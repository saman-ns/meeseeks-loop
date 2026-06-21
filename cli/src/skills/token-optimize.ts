import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import * as readline from "node:readline";
import { detectProject } from "../config/detector.ts";
import { logInfo, logSuccess, logWarn } from "../ui/logger.ts";

/**
 * Quick pre-flight check: are the token optimization files present?
 * Used by `runLoop()` when `--optimize-tokens` is set.
 */
export function checkTokenOptimization(workDir: string): boolean {
	const claudeMd = existsSync(join(workDir, "CLAUDE.md"));
	const claudeIgnore = existsSync(join(workDir, ".claudeignore"));
	const meeseeksConfig = existsSync(join(workDir, ".meeseeks", "config.yaml"));
	const contextGuide = existsSync(join(workDir, ".meeseeks", "contextguide.md"));

	if (!claudeMd) logWarn("Missing: CLAUDE.md");
	if (!claudeIgnore) logWarn("Missing: .claudeignore");
	if (!meeseeksConfig) logWarn("Missing: .meeseeks/config.yaml");
	if (!contextGuide) logWarn("Missing: .meeseeks/contextguide.md");

	return claudeMd && claudeIgnore && meeseeksConfig && contextGuide;
}

interface RepoAnalysis {
	project: ReturnType<typeof detectProject>;
	hasTests: boolean;
	testDir: string;
	testPatterns: string[];
	docFiles: string[];
	buildDirs: string[];
	generatedPatterns: string[];
	lockFiles: string[];
	envFiles: string[];
	keyFiles: string[];
}

/**
 * Analyze a repository to detect project info, test patterns, and files to exclude.
 */
function analyzeRepo(workDir: string): RepoAnalysis {
	const project = detectProject(workDir);

	// Detect test directory
	const testDirCandidates = ["test", "tests", "__tests__", "spec", "src/test", "src/__tests__"];
	let testDir = "";
	for (const dir of testDirCandidates) {
		if (existsSync(join(workDir, dir))) {
			testDir = dir;
			break;
		}
	}

	// Detect test patterns from existing test files
	const testPatterns: string[] = [];
	if (testDir) {
		try {
			const testFiles = findFiles(
				join(workDir, testDir),
				/\.(test|spec)\.(ts|js|dart|py|go|rs)$/,
				5,
			);
			if (testFiles.length > 0) {
				testPatterns.push(`Found ${testFiles.length} test files in ${testDir}/`);
			}
		} catch {
			// Ignore errors scanning test dir
		}
	}

	// Detect documentation files in root
	const docFiles: string[] = [];
	try {
		const rootFiles = readdirSync(workDir);
		for (const f of rootFiles) {
			if (f.endsWith(".md") && f !== "README.md" && f !== "CLAUDE.md" && f !== "CHANGELOG.md") {
				docFiles.push(f);
			}
		}
	} catch {
		// Ignore
	}

	// Detect build artifact directories
	const buildDirCandidates = [
		"build",
		"build_old",
		"dist",
		"out",
		".next",
		".nuxt",
		"node_modules",
		"__pycache__",
		".dart_tool",
		"target",
	];
	const buildDirs = buildDirCandidates.filter((d) => existsSync(join(workDir, d)));

	// Detect generated file patterns
	const generatedPatterns: string[] = [];
	if (project.language === "Dart") {
		generatedPatterns.push("*.g.dart", "*.freezed.dart", "*.mocks.dart");
	}
	if (project.language === "TypeScript" || project.language === "JavaScript") {
		generatedPatterns.push("*.generated.*", "*.d.ts");
	}
	if (project.language === "Go") {
		generatedPatterns.push("*_gen.go", "*.pb.go");
	}

	// Detect lock files
	const lockFileCandidates = [
		"pubspec.lock",
		"package-lock.json",
		"yarn.lock",
		"bun.lockb",
		"pnpm-lock.yaml",
		"Cargo.lock",
		"poetry.lock",
		"Pipfile.lock",
	];
	const lockFiles = lockFileCandidates.filter((f) => existsSync(join(workDir, f)));

	// Detect env files
	const envFiles: string[] = [];
	try {
		const rootFiles = readdirSync(workDir);
		for (const f of rootFiles) {
			if (f === ".env" || f.startsWith(".env.")) {
				envFiles.push(f);
			}
		}
	} catch {
		// Ignore
	}

	// Detect key files
	const keyFiles: string[] = [];
	const keyFileCandidates = [
		"README.md",
		"CLAUDE.md",
		".claudeignore",
		".meeseeks/config.yaml",
		"PRD.md",
		"PRD.yaml",
	];
	for (const f of keyFileCandidates) {
		if (existsSync(join(workDir, f))) {
			keyFiles.push(f);
		}
	}

	return {
		project,
		hasTests: testDir !== "",
		testDir,
		testPatterns,
		docFiles,
		buildDirs,
		generatedPatterns,
		lockFiles,
		envFiles,
		keyFiles,
	};
}

/**
 * Find files matching a pattern recursively (limited depth).
 */
function findFiles(dir: string, pattern: RegExp, maxDepth: number, currentDepth = 0): string[] {
	if (currentDepth >= maxDepth) return [];
	const results: string[] = [];

	try {
		const entries = readdirSync(dir);
		for (const entry of entries) {
			const fullPath = join(dir, entry);
			try {
				const stat = statSync(fullPath);
				if (stat.isFile() && pattern.test(entry)) {
					results.push(fullPath);
				} else if (stat.isDirectory() && !entry.startsWith(".")) {
					results.push(...findFiles(fullPath, pattern, maxDepth, currentDepth + 1));
				}
			} catch {
				// Skip inaccessible files
			}
		}
	} catch {
		// Skip inaccessible directories
	}

	return results;
}

/**
 * Generate a CLAUDE.md file from detected project info.
 */
function generateClaudeMd(analysis: RepoAnalysis, workDir: string): string {
	const { project } = analysis;
	const name = project.name || basename(workDir);
	const lines: string[] = [];

	lines.push(`# CLAUDE.md \u2014 ${name}`);
	lines.push("");
	lines.push("## Project Overview");
	lines.push("");
	if (project.language || project.framework) {
		lines.push(`**Stack:** ${[project.language, project.framework].filter(Boolean).join(", ")}`);
		lines.push("");
	}

	lines.push("## Commands");
	lines.push("");
	lines.push("```bash");
	if (project.testCmd) lines.push(`${project.testCmd}    # Run tests`);
	if (project.lintCmd) lines.push(`${project.lintCmd}    # Lint`);
	if (project.buildCmd) lines.push(`${project.buildCmd}    # Build`);
	lines.push("```");
	lines.push("");

	if (analysis.hasTests) {
		lines.push("## Test Directory");
		lines.push("");
		lines.push(`Tests are in \`${analysis.testDir}/\`.`);
		lines.push("");
	}

	lines.push("## Key Files");
	lines.push("");
	for (const f of analysis.keyFiles) {
		lines.push(`- \`${f}\``);
	}
	lines.push("");

	lines.push("## Rules");
	lines.push("");
	lines.push("- Follow existing code patterns and conventions");
	lines.push("- Keep changes focused and minimal");
	if (analysis.generatedPatterns.length > 0) {
		lines.push(`- Do NOT modify generated files (${analysis.generatedPatterns.join(", ")})`);
	}
	lines.push("");

	return lines.join("\n");
}

/**
 * Generate a .claudeignore file from detected project info.
 */
function generateClaudeIgnore(analysis: RepoAnalysis, workDir: string): string {
	const lines: string[] = [];

	if (analysis.buildDirs.length > 0) {
		lines.push("# Build artifacts");
		for (const d of analysis.buildDirs) {
			lines.push(`${d}/`);
		}
		lines.push("");
	}

	if (analysis.generatedPatterns.length > 0) {
		lines.push("# Generated files");
		for (const p of analysis.generatedPatterns) {
			lines.push(p);
		}
		lines.push("");
	}

	if (analysis.docFiles.length > 0) {
		lines.push("# Documentation (agent reads CLAUDE.md instead)");
		for (const f of analysis.docFiles) {
			lines.push(f);
		}
		lines.push("");
	}

	// Common directories to exclude
	const excludeDirs = ["docs/", "development/", "scripts/"].filter((d) =>
		existsSync(join(workDir, d)),
	);
	if (excludeDirs.length > 0) {
		lines.push("# Documentation/script directories");
		for (const d of excludeDirs) {
			lines.push(d);
		}
		lines.push("");
	}

	if (analysis.lockFiles.length > 0) {
		lines.push("# Lock files");
		for (const f of analysis.lockFiles) {
			lines.push(f);
		}
		lines.push("");
	}

	if (analysis.envFiles.length > 0) {
		lines.push("# Environment files");
		lines.push(".env");
		lines.push(".env.*");
		lines.push("");
	}

	lines.push("# IDE and OS");
	lines.push(".idea/");
	lines.push(".vscode/");
	lines.push("*.iml");
	lines.push(".DS_Store");
	lines.push("");

	return lines.join("\n");
}

/**
 * Prompt user for confirmation.
 */
async function confirm(message: string): Promise<boolean> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		rl.question(`${message} [Y/n] > `, (answer) => {
			rl.close();
			const normalized = answer.trim().toLowerCase();
			resolve(normalized === "" || normalized === "y" || normalized === "yes");
		});
	});
}

/**
 * Run the full token optimization command.
 * Analyzes the repo and generates CLAUDE.md, .claudeignore, and enhanced config.yaml.
 */
export async function runTokenOptimize(): Promise<void> {
	const workDir = process.cwd();

	logInfo("Analyzing repository for token optimization...");
	console.log("");

	const analysis = analyzeRepo(workDir);

	// Display what was detected
	console.log("  Detected:");
	console.log(`    Language:    ${analysis.project.language || "Unknown"}`);
	console.log(`    Framework:   ${analysis.project.framework || "None detected"}`);
	console.log(`    Test dir:    ${analysis.testDir || "None found"}`);
	console.log(`    Doc files:   ${analysis.docFiles.length} markdown files in root`);
	console.log(`    Build dirs:  ${analysis.buildDirs.join(", ") || "None"}`);
	console.log(`    Generated:   ${analysis.generatedPatterns.join(", ") || "None"}`);
	console.log(`    Lock files:  ${analysis.lockFiles.join(", ") || "None"}`);
	console.log(
		`    Env files:   ${analysis.envFiles.length > 0 ? analysis.envFiles.join(", ") : "None"}`,
	);
	console.log("");

	// Check what already exists
	const hasClaudeMd = existsSync(join(workDir, "CLAUDE.md"));
	const hasClaudeIgnore = existsSync(join(workDir, ".claudeignore"));
	const hasMeeseeksConfig = existsSync(join(workDir, ".meeseeks", "config.yaml"));

	const filesToGenerate: { path: string; content: string; label: string }[] = [];

	if (!hasClaudeMd) {
		filesToGenerate.push({
			path: join(workDir, "CLAUDE.md"),
			content: generateClaudeMd(analysis, workDir),
			label: "CLAUDE.md",
		});
	} else {
		logInfo("CLAUDE.md already exists — skipping");
	}

	if (!hasClaudeIgnore) {
		filesToGenerate.push({
			path: join(workDir, ".claudeignore"),
			content: generateClaudeIgnore(analysis, workDir),
			label: ".claudeignore",
		});
	} else {
		logInfo(".claudeignore already exists — skipping");
	}

	if (!hasMeeseeksConfig) {
		// Generate a basic config.yaml
		const config = [
			"project:",
			`  name: "${analysis.project.name || basename(workDir)}"`,
			`  language: "${analysis.project.language}"`,
			`  framework: "${analysis.project.framework}"`,
			`  description: ""`,
			"",
			"commands:",
			`  test: "${analysis.project.testCmd}"`,
			`  lint: "${analysis.project.lintCmd}"`,
			`  build: "${analysis.project.buildCmd}"`,
			"",
			"rules:",
			'  - "Follow existing code patterns and conventions"',
			'  - "Keep changes focused and minimal"',
			analysis.generatedPatterns.length > 0
				? `  - "Do not modify generated files (${analysis.generatedPatterns.join(", ")})"`
				: null,
			"",
			"boundaries:",
			"  never_touch:",
			'    - "*.lock"',
			'    - ".env"',
			'    - ".env.*"',
			...analysis.generatedPatterns.map((p) => `    - "${p}"`),
			"",
		]
			.filter((line) => line !== null)
			.join("\n");

		filesToGenerate.push({
			path: join(workDir, ".meeseeks", "config.yaml"),
			content: config,
			label: ".meeseeks/config.yaml",
		});
	} else {
		logInfo(".meeseeks/config.yaml already exists — skipping");
	}

	if (filesToGenerate.length === 0) {
		logSuccess("All token optimization files already exist. No changes needed.");
		return;
	}

	// Show what will be generated
	console.log("  Files to generate:");
	for (const file of filesToGenerate) {
		console.log(`    + ${file.label}`);
	}
	console.log("");

	// Ask for confirmation
	const proceed = await confirm("Generate these files?");
	if (!proceed) {
		logInfo("Cancelled. No files were created.");
		return;
	}

	// Write files
	for (const file of filesToGenerate) {
		// Ensure parent directory exists
		const dir = dirname(file.path);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		writeFileSync(file.path, file.content, "utf-8");
		logSuccess(`Created: ${file.label}`);
	}

	console.log("");
	logSuccess("Token optimization complete. Agents will now start with better context.");
	logInfo("Tip: Review and customize the generated files for your specific project.");
}
