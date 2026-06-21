import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import * as readline from "node:readline";
import pc from "picocolors";
import YAML from "yaml";
import { detectProject } from "../../config/detector.ts";
import {
	getConfigPath,
	getMeeseeksDir,
	getProgressPath,
	isInitialized,
} from "../../config/loader.ts";
import { initConfig } from "../../config/writer.ts";
import { createEngine } from "../../engines/index.ts";
import type { AIResult } from "../../engines/types.ts";
import type { PRDGenerationInput } from "../../skills/prd-generator.ts";
import { generatePRD } from "../../skills/prd-generator.ts";
import { logError, logSuccess, logWarn } from "../../ui/logger.ts";
import type { WizardPhase } from "../../ui/wizard.ts";
import { runWizard } from "../../ui/wizard.ts";

/**
 * Build wizard phases for interactive init
 */
function buildWizardPhases(): WizardPhase[] {
	return [
		{
			name: "Project Basics",
			description: "Let's start with the fundamentals of your project",
			questions: [
				{
					id: "projectName",
					type: "text",
					prompt: "What is your project name?",
					validate: (answer) => {
						const str = answer as string;
						if (str.length < 2) return "Project name must be at least 2 characters";
						return true;
					},
				},
				{
					id: "description",
					type: "text",
					prompt: "Describe your project in one sentence:",
					validate: (answer) => {
						const str = answer as string;
						if (str.length < 10) return "Description must be at least 10 characters";
						return true;
					},
				},
				{
					id: "language",
					type: "choice",
					prompt: "What language is this project?",
					choices: ["TypeScript", "JavaScript", "Python", "Go", "Rust", "Other"],
					default: "TypeScript",
				},
				{
					id: "framework",
					type: "text",
					prompt: "What framework/stack are you using? (optional)",
					default: "",
				},
			],
		},
		{
			name: "Goals & Scope",
			description: "Define what you want to accomplish with Meeseeks",
			questions: [
				{
					id: "mainGoal",
					type: "text",
					prompt: "What is the main goal for this Meeseeks session?",
					validate: (answer) => {
						const str = answer as string;
						if (str.length < 10) return "Please provide a clear goal (at least 10 characters)";
						return true;
					},
				},
				{
					id: "focusAreas",
					type: "text",
					prompt: "What files/directories should agents prioritize? (optional, comma-separated)",
					default: "",
				},
				{
					id: "boundaries",
					type: "text",
					prompt:
						"What should agents never touch? (optional, comma-separated, e.g., node_modules, .env)",
					default: "node_modules, .env, .git",
				},
			],
		},
		{
			name: "Rules & Preferences",
			description: "Configure how Meeseeks should work",
			questions: [
				{
					id: "codingStandards",
					type: "text",
					prompt:
						"Any specific coding standards or patterns to follow? (optional, e.g., 'Use TypeScript strict mode')",
					default: "",
				},
				{
					id: "runTests",
					type: "confirm",
					prompt: "Should Meeseeks run tests after each task?",
					default: true,
				},
				{
					id: "runLint",
					type: "confirm",
					prompt: "Should Meeseeks run linting after each task?",
					default: true,
				},
				{
					id: "executionMode",
					type: "choice",
					prompt: "Preferred execution mode?",
					choices: ["Sequential", "Parallel"],
					default: "Sequential",
				},
			],
		},
	];
}

/**
 * Parse focus areas from comma-separated string
 */
function parseFocusAreas(input: string): string[] {
	if (!input || input.trim().length === 0) return [];
	return input
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

/**
 * Parse boundaries from comma-separated string
 */
function parseBoundaries(input: string): string[] {
	if (!input || input.trim().length === 0) return [];
	return input
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

/**
 * Build rules array from wizard answers
 */
function buildRules(answers: Record<string, unknown>): string[] {
	const rules: string[] = [];

	// Add coding standards if provided
	const codingStandards = answers.codingStandards as string;
	if (codingStandards && codingStandards.trim().length > 0) {
		rules.push(codingStandards.trim());
	}

	// Add test/lint preferences
	const runTests = answers.runTests as boolean;
	const runLint = answers.runLint as boolean;

	if (runTests) {
		rules.push("Run tests after completing each task to verify correctness");
	}
	if (runLint) {
		rules.push("Run linting to ensure code quality and consistency");
	}

	return rules;
}

/**
 * Build AI interview prompt
 */
function buildInterviewPrompt(): string {
	const lines: string[] = [];

	lines.push("You are conducting an interview to set up a new Meeseeks project.");
	lines.push("");
	lines.push("# Your Goal");
	lines.push("");
	lines.push("Gather complete project information through thoughtful, conversational questions.");
	lines.push("");
	lines.push("# Instructions");
	lines.push("");
	lines.push("1. Use the AskUserQuestion tool for EACH question - ask ONE question at a time");
	lines.push('2. After each question, show progress like: "✓ Question 5 of ~20 (25% complete)"');
	lines.push("3. Be conversational and adaptive - use their answers to ask relevant follow-ups");
	lines.push("4. Ask 15-20 questions total to gather comprehensive information");
	lines.push("");
	lines.push("# Interview Topics (in order)");
	lines.push("");
	lines.push("1. **Project Basics** (3-4 questions)");
	lines.push("   - Project name");
	lines.push("   - One-line description");
	lines.push("   - Language (TypeScript, JavaScript, Python, Go, Rust, etc.)");
	lines.push("   - Framework or stack (if applicable)");
	lines.push("");
	lines.push("2. **Goals & Objectives** (2-3 questions)");
	lines.push("   - Main goal for this Meeseeks session");
	lines.push("   - What are they building or fixing?");
	lines.push("   - Success criteria");
	lines.push("");
	lines.push("3. **Technical Details** (3-4 questions)");
	lines.push("   - Key dependencies or tools");
	lines.push("   - Database or external services");
	lines.push("   - Build/test/lint commands");
	lines.push("");
	lines.push("4. **Scope & Focus** (2-3 questions)");
	lines.push("   - What files or directories should AI prioritize?");
	lines.push("   - What should AI never touch? (boundaries)");
	lines.push("   - Any specific modules to focus on?");
	lines.push("");
	lines.push("5. **Coding Standards** (2-3 questions)");
	lines.push("   - Coding conventions or patterns to follow");
	lines.push("   - Documentation requirements");
	lines.push("   - Code quality preferences");
	lines.push("");
	lines.push("6. **Workflow Preferences** (2-3 questions)");
	lines.push("   - Should tests run after each task?");
	lines.push("   - Should linting run after each task?");
	lines.push("   - Preferred execution mode (Sequential or Parallel)?");
	lines.push("   - Auto-commit changes?");
	lines.push("");
	lines.push("# Important");
	lines.push("");
	lines.push("- Ask questions ONE AT A TIME using AskUserQuestion");
	lines.push("- Show progress after each answer");
	lines.push("- Adapt follow-up questions based on previous answers");
	lines.push("- Be friendly and conversational");
	lines.push("");
	lines.push("# When You Have Enough Information");
	lines.push("");
	lines.push('Respond with a summary starting with "PROJECT SETUP SUMMARY" followed by:');
	lines.push("");
	lines.push("```");
	lines.push("PROJECT SETUP SUMMARY");
	lines.push("");
	lines.push("Name: {project name}");
	lines.push("Description: {one-line description}");
	lines.push("Language: {language}");
	lines.push("Framework: {framework or stack}");
	lines.push("Main Goal: {main goal}");
	lines.push("");
	lines.push("Technical Details:");
	lines.push("- Dependencies: {key dependencies}");
	lines.push("- Test Command: {test command}");
	lines.push("- Lint Command: {lint command}");
	lines.push("- Build Command: {build command}");
	lines.push("");
	lines.push("Focus Areas:");
	lines.push("- {area 1}");
	lines.push("- {area 2}");
	lines.push("");
	lines.push("Boundaries (never touch):");
	lines.push("- {boundary 1}");
	lines.push("- {boundary 2}");
	lines.push("");
	lines.push("Coding Standards:");
	lines.push("- {standard 1}");
	lines.push("- {standard 2}");
	lines.push("");
	lines.push("Workflow Preferences:");
	lines.push("- Run Tests: {yes/no}");
	lines.push("- Run Lint: {yes/no}");
	lines.push("- Execution Mode: {Sequential/Parallel}");
	lines.push("- Auto Commit: {yes/no}");
	lines.push("```");
	lines.push("");
	lines.push("Begin the interview now. Ask your first question!");

	return lines.join("\n");
}

/**
 * Parse AI interview summary into structured data
 */
interface InterviewData {
	projectName: string;
	description: string;
	language: string;
	framework: string;
	mainGoal: string;
	dependencies: string;
	testCmd: string;
	lintCmd: string;
	buildCmd: string;
	focusAreas: string[];
	boundaries: string[];
	codingStandards: string[];
	runTests: boolean;
	runLint: boolean;
	executionMode: string;
	autoCommit: boolean;
}

function parseInterviewSummary(summary: string): InterviewData {
	const lines = summary.split("\n");

	// Helper function to extract value after a label
	const extractValue = (label: string): string => {
		const line = lines.find((l) => l.trim().startsWith(label));
		if (!line) return "";
		return line.substring(line.indexOf(":") + 1).trim();
	};

	// Helper function to extract list items
	const extractList = (startLabel: string, endLabel?: string): string[] => {
		const items: string[] = [];
		let inSection = false;

		for (const line of lines) {
			const trimmed = line.trim();

			if (trimmed.startsWith(startLabel)) {
				inSection = true;
				continue;
			}

			if (endLabel && trimmed.startsWith(endLabel)) {
				break;
			}

			if (inSection && trimmed.startsWith("-")) {
				const item = trimmed.substring(trimmed.indexOf("-") + 1).trim();
				if (item.length > 0) {
					items.push(item);
				}
			} else if (inSection && trimmed.length > 0 && !trimmed.startsWith("-")) {
				// Next section started
				break;
			}
		}

		return items;
	};

	// Helper for yes/no values
	const extractBoolean = (label: string): boolean => {
		const line = lines.find((l) => l.includes(label));
		if (!line) return true; // Default to true
		const value = line.toLowerCase();
		return value.includes("yes") || value.includes("true");
	};

	return {
		projectName: extractValue("Name:"),
		description: extractValue("Description:"),
		language: extractValue("Language:"),
		framework: extractValue("Framework:"),
		mainGoal: extractValue("Main Goal:"),
		dependencies: extractValue("Dependencies:"),
		testCmd: extractValue("Test Command:"),
		lintCmd: extractValue("Lint Command:"),
		buildCmd: extractValue("Build Command:"),
		focusAreas: extractList("Focus Areas:", "Boundaries"),
		boundaries: extractList("Boundaries", "Coding Standards"),
		codingStandards: extractList("Coding Standards:", "Workflow Preferences"),
		runTests: extractBoolean("Run Tests:"),
		runLint: extractBoolean("Run Lint:"),
		executionMode: extractValue("Execution Mode:"),
		autoCommit: extractBoolean("Auto Commit:"),
	};
}

/**
 * Run the AI-powered interactive interview
 */
async function runInteractiveInit(workDir: string): Promise<void> {
	console.log(pc.bold(pc.cyan("\n🧙 AI-Powered Project Interview\n")));
	console.log("An AI agent will interview you to gather project information.");
	console.log(pc.dim("Press Ctrl+C at any time to cancel.\n"));

	// Create Claude engine for interview
	const engine = createEngine("claude");

	// Check if engine is available
	const isAvailable = await engine.isAvailable();
	if (!isAvailable) {
		logError("Claude CLI is not available. Please install it first:");
		console.log("  npm install -g @anthropic-ai/claude-code");
		process.exit(1);
	}

	// Build interview prompt
	const interviewPrompt = buildInterviewPrompt();

	console.log(pc.dim("Starting AI interview...\n"));

	// Execute interview with streaming for progress updates
	let result: AIResult;
	try {
		if (engine.executeStreaming) {
			result = await engine.executeStreaming(interviewPrompt, workDir, (step) => {
				// Show step updates during interview
				if (step && !step.includes("tool_use")) {
					console.log(pc.dim(`  ${step}`));
				}
			});
		} else {
			result = await engine.execute(interviewPrompt, workDir);
		}
	} catch (error) {
		logError(`Interview failed: ${error instanceof Error ? error.message : String(error)}`);
		console.log(pc.yellow("\nFalling back to standard setup..."));
		process.exit(1);
	}

	if (!result.success) {
		logError(`Interview failed: ${result.error || "Unknown error"}`);
		console.log(pc.yellow("\nFalling back to standard setup..."));
		process.exit(1);
	}

	console.log();
	console.log(pc.bold(pc.green("✓ Interview completed!")));
	console.log();

	// Parse the interview summary
	const interviewResponse = result.response;

	if (!interviewResponse.includes("PROJECT SETUP SUMMARY")) {
		logError("Interview did not produce expected summary format");
		console.log(pc.dim("AI Response:"));
		console.log(interviewResponse);
		process.exit(1);
	}

	const interviewData = parseInterviewSummary(interviewResponse);

	// Validate essential fields
	if (!interviewData.projectName || !interviewData.description || !interviewData.mainGoal) {
		logError("Interview did not gather essential project information");
		console.log(pc.yellow("Please ensure project name, description, and main goal are provided"));
		process.exit(1);
	}

	// Show gathered information
	console.log(pc.bold("Gathered Information:"));
	console.log(`  ${pc.cyan("Project:")} ${interviewData.projectName}`);
	console.log(`  ${pc.cyan("Language:")} ${interviewData.language}`);
	if (interviewData.framework) {
		console.log(`  ${pc.cyan("Framework:")} ${interviewData.framework}`);
	}
	console.log(`  ${pc.cyan("Goal:")} ${interviewData.mainGoal}`);
	console.log();

	// Phase 4: PRD Generation (60%)
	console.log(pc.bold(pc.cyan("\nGenerating PRD and Configuration Files...")) + pc.dim(" (60%)"));
	console.log();

	// Prepare PRD generation input from interview data
	const prdInput: PRDGenerationInput = {
		projectName: interviewData.projectName,
		description: interviewData.description,
		language: interviewData.language,
		framework: interviewData.framework || undefined,
		mainGoal: interviewData.mainGoal,
		focusAreas: interviewData.focusAreas,
		rules: interviewData.codingStandards,
	};

	console.log(pc.dim("Generating task breakdown with AI..."));
	console.log();

	let prdContent = "";
	let contextGuideContent = "";
	let generatedTasks: string[] = [];

	try {
		// Create Claude engine for PRD generation
		const engine = createEngine("claude");

		// Generate PRD using AI
		const prdResult = await generatePRD(prdInput, engine, workDir);
		prdContent = prdResult.prdContent;
		contextGuideContent = prdResult.contextGuideContent;

		// Extract task lines for display
		const taskLines = prdContent.split("\n").filter((line) => line.trim().match(/^-\s*\[\s*\]\s+/));
		generatedTasks = taskLines.map((line) => line.trim());

		// Display generated tasks
		console.log(pc.bold("Generated Tasks:"));
		console.log();
		for (const task of generatedTasks) {
			console.log(`  ${pc.cyan(task)}`);
		}
		console.log();

		// Confirm acceptance
		console.log(pc.bold("Accept this task breakdown?") + pc.dim(" (Y/n)"));
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		const acceptAnswer = await new Promise<string>((resolve) => {
			rl.question(pc.cyan("> "), (answer: string) => {
				rl.close();
				resolve(answer.trim().toLowerCase());
			});
		});

		const accepted = !acceptAnswer || acceptAnswer === "y" || acceptAnswer === "yes";

		if (!accepted) {
			console.log();
			console.log(pc.yellow("Task breakdown rejected. Using manual task entry..."));
			console.log();
			console.log("Enter custom tasks (one per line, empty line to finish):");

			const customTasks: string[] = [];
			const taskRl = readline.createInterface({
				input: process.stdin,
				output: process.stdout,
			});

			await new Promise<void>((resolve) => {
				taskRl.prompt();
				taskRl.on("line", (line: string) => {
					const trimmed = line.trim();
					if (trimmed.length === 0) {
						taskRl.close();
						resolve();
					} else {
						customTasks.push(`- [ ] ${trimmed}`);
						taskRl.prompt();
					}
				});
			});

			if (customTasks.length > 0) {
				// Rebuild PRD with custom tasks
				const customTaskList = customTasks.join("\n");
				prdContent = prdContent.replace(
					/## Tasks\n\n[\s\S]*?\n\n##/,
					`## Tasks\n\n${customTaskList}\n\n##`,
				);
			} else {
				console.log(pc.yellow("No custom tasks provided. Using AI-generated tasks."));
			}
		}
	} catch (error) {
		logError(`Failed to generate PRD: ${error instanceof Error ? error.message : String(error)}`);
		console.log();
		console.log(pc.yellow("Falling back to manual task entry..."));
		console.log();
		console.log("Enter tasks (one per line, empty line to finish):");

		const fallbackTasks: string[] = [];
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		await new Promise<void>((resolve) => {
			rl.prompt();
			rl.on("line", (line: string) => {
				const trimmed = line.trim();
				if (trimmed.length === 0) {
					rl.close();
					resolve();
				} else {
					fallbackTasks.push(`- [ ] ${trimmed}`);
					rl.prompt();
				}
			});
		});

		if (fallbackTasks.length === 0) {
			console.log(pc.red("No tasks provided. Setup cancelled."));
			process.exit(1);
		}

		// Create minimal PRD content
		const taskList = fallbackTasks.join("\n");
		prdContent = `# ${prdInput.projectName}\n\n> ${prdInput.description}\n\n## Tasks\n\n${taskList}\n`;
		contextGuideContent = `# Context Guide\n\n${prdInput.description}\n\n## Goal\n\n${prdInput.mainGoal}\n`;
	}

	// Phase 5: Finalization (100%)
	console.log(pc.bold(pc.cyan("\nFinalizing Setup...")) + pc.dim(" (100%)"));
	console.log();

	// Create .meeseeks/ directory
	const meeseeksDir = getMeeseeksDir(workDir);
	if (!existsSync(meeseeksDir)) {
		mkdirSync(meeseeksDir, { recursive: true });
	}

	// Auto-detect project settings for config (fallback for missing commands)
	const detected = detectProject(workDir);

	// Build config content using interview data
	const config = {
		project: {
			name: interviewData.projectName,
			language: interviewData.language,
			framework: interviewData.framework || detected.framework || "",
			description: interviewData.description,
		},
		commands: {
			test: interviewData.testCmd || detected.testCmd || "",
			lint: interviewData.lintCmd || detected.lintCmd || "",
			build: interviewData.buildCmd || detected.buildCmd || "",
		},
		rules: interviewData.codingStandards,
		boundaries: {
			never_touch:
				interviewData.boundaries.length > 0
					? interviewData.boundaries
					: ["node_modules", ".env", ".git"],
		},
	};

	// Write config.yaml
	const configPath = getConfigPath(workDir);
	const configYaml = YAML.stringify(config);
	const configContent = `# Meeseeks Configuration
# https://github.com/saman-ns/tool-meeseeks

${configYaml}`;
	writeFileSync(configPath, configContent, "utf-8");

	// Write PRD.md
	const prdPath = `${workDir}/PRD.md`;
	writeFileSync(prdPath, prdContent, "utf-8");

	// Write contextguide.md
	const contextGuidePath = `${meeseeksDir}/contextguide.md`;
	writeFileSync(contextGuidePath, contextGuideContent, "utf-8");

	// Write progress.txt
	const progressPath = getProgressPath(workDir);
	writeFileSync(progressPath, "# Meeseeks Progress Log\n\n", "utf-8");

	// Write project_current_status.md
	const statusPath = `${meeseeksDir}/project_current_status.md`;
	const currentDate = new Date().toISOString().split("T")[0];
	const taskCount = generatedTasks.length;

	const statusContent = `# Project Current Status

## Interview Completed
Date: ${currentDate}
Questions answered: ~${Math.max(15, taskCount)} questions

## Project Information
- **Name**: ${interviewData.projectName}
- **Description**: ${interviewData.description}
- **Language**: ${interviewData.language}
- **Framework**: ${interviewData.framework || "None specified"}
- **Main Goal**: ${interviewData.mainGoal}

## Technical Details
${interviewData.dependencies ? `- **Dependencies**: ${interviewData.dependencies}` : ""}
- **Test Command**: ${config.commands.test || "Not specified"}
- **Lint Command**: ${config.commands.lint || "Not specified"}
- **Build Command**: ${config.commands.build || "Not specified"}

## Focus Areas
${interviewData.focusAreas.length > 0 ? interviewData.focusAreas.map((a) => `- ${a}`).join("\n") : "- No specific focus areas defined"}

## Boundaries (Never Touch)
${config.boundaries.never_touch.map((b) => `- ${b}`).join("\n")}

## Coding Standards
${interviewData.codingStandards.length > 0 ? interviewData.codingStandards.map((s) => `- ${s}`).join("\n") : "- No specific standards defined"}

## Workflow Preferences
- **Run Tests**: ${interviewData.runTests ? "Yes" : "No"}
- **Run Lint**: ${interviewData.runLint ? "Yes" : "No"}
- **Execution Mode**: ${interviewData.executionMode || "Sequential"}
- **Auto Commit**: ${interviewData.autoCommit ? "Yes" : "No"}

## Setup Steps Completed
- [x] AI-powered project interview
- [x] PRD.md generated with ${taskCount} task${taskCount !== 1 ? "s" : ""}
- [x] Configuration created (.meeseeks/config.yaml)
- [x] Context guide initialized (.meeseeks/contextguide.md)
- [x] Project status tracking started

## Next Steps
1. Review PRD.md and adjust tasks if needed
2. Review .meeseeks/config.yaml and customize rules
3. Run: \`meeseeks\` to start executing tasks
4. This file will be updated as tasks complete

---
*Last updated: ${currentDate}*
`;
	writeFileSync(statusPath, statusContent, "utf-8");

	console.log();
	logSuccess("Project initialized!");
	console.log();
	console.log(pc.bold("Created files:"));
	console.log(`  ${pc.cyan(".meeseeks/config.yaml")}              - Your rules and preferences`);
	console.log(`  ${pc.cyan(".meeseeks/contextguide.md")}          - Living context document`);
	console.log(`  ${pc.cyan(".meeseeks/project_current_status.md")} - Setup summary and progress`);
	console.log(`  ${pc.cyan(".meeseeks/progress.txt")}             - Progress log (auto-updated)`);
	console.log(
		`  ${pc.cyan("PRD.md")}                           - Your task list (${taskCount} tasks)`,
	);
	console.log();
	console.log(pc.bold("Next steps:"));
	console.log(
		`  1. Review:  ${pc.cyan(".meeseeks/project_current_status.md")} for complete setup info`,
	);
	console.log(`  2. Review:  ${pc.cyan("PRD.md")} to see your task breakdown`);
	console.log(`  3. Adjust:  ${pc.cyan(".meeseeks/config.yaml")} if needed`);
	console.log(`  4. Run:     ${pc.cyan("meeseeks")} to start the autonomous coding loop`);
	console.log();
}

/**
 * Handle --init or --init-interactive command
 */
export async function runInit(workDir = process.cwd(), interactive = false): Promise<void> {
	// Check if already initialized
	if (isInitialized(workDir)) {
		logWarn(".meeseeks/ already exists");

		if (interactive) {
			// Prompt to overwrite or cancel
			console.log();
			console.log("What would you like to do?");
			console.log("  1. Start over (overwrite existing setup)");
			console.log("  2. Cancel");
			console.log();

			const rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout,
			});

			const answer = await new Promise<string>((resolve) => {
				rl.question(pc.bold("Enter your choice (1-2): "), resolve);
			});
			rl.close();

			if (answer.trim() === "1") {
				console.log(pc.yellow("\nOverwriting existing configuration...\n"));
			} else {
				console.log(pc.yellow("\nSetup cancelled."));
				return;
			}
		} else {
			console.log("To overwrite, delete .meeseeks/ and run again");
			return;
		}
	}

	// Run interactive wizard if requested
	if (interactive) {
		await runInteractiveInit(workDir);
		return;
	}

	// Otherwise, run standard auto-detect init
	const { detected } = initConfig(workDir);

	// Show what we detected
	console.log("");
	console.log(pc.bold("Detected:"));
	console.log(`  Project:   ${pc.cyan(detected.name)}`);
	if (detected.language) console.log(`  Language:  ${pc.cyan(detected.language)}`);
	if (detected.framework) console.log(`  Framework: ${pc.cyan(detected.framework)}`);
	if (detected.testCmd) console.log(`  Test:      ${pc.cyan(detected.testCmd)}`);
	if (detected.lintCmd) console.log(`  Lint:      ${pc.cyan(detected.lintCmd)}`);
	if (detected.buildCmd) console.log(`  Build:     ${pc.cyan(detected.buildCmd)}`);
	console.log("");

	logSuccess("Created .meeseeks/");
	console.log("");
	console.log(`  ${pc.cyan(".meeseeks/config.yaml")}   - Your rules and preferences`);
	console.log(`  ${pc.cyan(".meeseeks/progress.txt")} - Progress log (auto-updated)`);
	console.log("");
	console.log(pc.bold("Next steps:"));
	console.log(`  1. Add rules:  ${pc.cyan('meeseeks --add-rule "your rule here"')}`);
	console.log(`  2. Or edit:    ${pc.cyan(".meeseeks/config.yaml")}`);
	console.log(
		`  3. Run:        ${pc.cyan('meeseeks "your task"')} or ${pc.cyan("meeseeks")} (with PRD.md)`,
	);
}
