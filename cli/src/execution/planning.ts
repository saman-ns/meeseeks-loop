import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline/promises";
import type { AIEngine } from "../engines/types.ts";
import type { Task } from "../tasks/types.ts";
import { logError, logInfo, logSuccess } from "../ui/logger.ts";

export interface PlanningOptions {
	workDir: string;
	engine: AIEngine;
	tasks: Task[];
	projectInfo?: {
		name: string;
		language: string;
		framework: string;
		description: string;
	};
}

/**
 * Ask user questions to gather planning preferences
 */
async function gatherPlanningPreferences(tasks: Task[]): Promise<{
	priorityTasks: string[];
	interactiveTasks: string[];
	parallelPreference: string;
	additionalContext: string;
}> {
	console.log("");
	console.log("=".repeat(60));
	logInfo("Planning Mode - Let's gather some information");
	console.log("=".repeat(60));
	console.log("");

	const rl = readline.createInterface({ input, output });

	// Question 1: Priority tasks
	console.log(`Tasks to plan (${tasks.length} total):`);
	tasks.forEach((t, i) => console.log(`  ${i + 1}. ${t.title}`));
	console.log("");
	const priorityAnswer = await rl.question(
		"Which tasks are highest priority? (comma-separated numbers, or 'all'): ",
	);
	const priorityTasks =
		priorityAnswer.trim().toLowerCase() === "all"
			? tasks.map((t) => t.title)
			: priorityAnswer
					.split(",")
					.map((n) => Number.parseInt(n.trim()) - 1)
					.filter((i) => i >= 0 && i < tasks.length)
					.map((i) => tasks[i].title);

	// Question 2: Interactive tasks
	console.log("");
	const interactiveAnswer = await rl.question(
		"Any tasks that need manual review? (comma-separated numbers, or 'none'): ",
	);
	const interactiveTasks =
		interactiveAnswer.trim().toLowerCase() === "none"
			? []
			: interactiveAnswer
					.split(",")
					.map((n) => Number.parseInt(n.trim()) - 1)
					.filter((i) => i >= 0 && i < tasks.length)
					.map((i) => tasks[i].title);

	// Question 3: Parallel preference
	console.log("");
	const parallelAnswer = await rl.question("Execution preference? (sequential/parallel/auto): ");
	const parallelPreference = parallelAnswer.trim().toLowerCase() || "auto";

	// Question 4: Additional context
	console.log("");
	const contextAnswer = await rl.question(
		"Any additional context or constraints? (press enter to skip): ",
	);
	const additionalContext = contextAnswer.trim();

	rl.close();

	return { priorityTasks, interactiveTasks, parallelPreference, additionalContext };
}

/**
 * Generate an execution plan using the AI engine
 */
export async function generatePlan(options: PlanningOptions): Promise<string> {
	const { workDir, engine, tasks, projectInfo } = options;

	// Gather user preferences first
	const preferences = await gatherPlanningPreferences(tasks);

	logInfo("Planning mode: Generating execution plan...");

	// Build planning prompt
	const taskList = tasks
		.map((t, i) => `${i + 1}. ${t.title}${t.body ? `\n   ${t.body}` : ""}`)
		.join("\n\n");

	const userPreferences = `
User Preferences:
- Priority tasks: ${preferences.priorityTasks.length > 0 ? preferences.priorityTasks.join(", ") : "None specified"}
- Interactive tasks: ${preferences.interactiveTasks.length > 0 ? preferences.interactiveTasks.join(", ") : "None"}
- Execution preference: ${preferences.parallelPreference}
${preferences.additionalContext ? `- Additional context: ${preferences.additionalContext}` : ""}
`;

	const planningPrompt = `You are an AI coding assistant helping to plan the execution of multiple tasks.

Project Information:
${
	projectInfo
		? `- Name: ${projectInfo.name}
- Language: ${projectInfo.language}
- Framework: ${projectInfo.framework}
- Description: ${projectInfo.description}`
		: "- No project information available"
}

Tasks to execute (${tasks.length} total):
${taskList}

${userPreferences}

Please create a detailed execution plan that:
1. Analyzes dependencies between tasks
2. Identifies which tasks can run in parallel vs must run sequentially
3. Estimates complexity and potential risks for each task
4. Suggests an optimal execution order
5. Identifies any tasks that might conflict with each other
6. Recommends which tasks should be done interactively vs automatically

Output your plan in markdown format with clear sections.`;

	// Execute planning task using the AI engine
	const planResult = await engine.execute({
		prompt: planningPrompt,
		workDir,
		model: "opus", // Use opus for planning
		skipTests: true,
		skipLint: true,
	});

	if (!planResult.success) {
		throw new Error("Failed to generate execution plan");
	}

	return `${planningPrompt}\n\n---\n\n# AI-Generated Execution Plan\n\n${planResult.output}`;
}

/**
 * Save plan to .meeseeks/plan.md
 */
export async function savePlan(workDir: string, plan: string): Promise<string> {
	const meeseeksDir = join(workDir, ".meeseeks");
	if (!existsSync(meeseeksDir)) {
		mkdirSync(meeseeksDir, { recursive: true });
	}

	const planPath = join(meeseeksDir, "plan.md");
	await writeFile(planPath, plan, "utf-8");
	return planPath;
}

/**
 * Show plan and ask for user approval
 */
export async function reviewPlan(planPath: string): Promise<boolean> {
	console.log("");
	console.log("=".repeat(60));
	logInfo(`Execution plan saved to: ${planPath}`);
	console.log("=".repeat(60));
	console.log("");
	console.log("Please review the plan and decide:");
	console.log("");
	console.log("  1. Approve and proceed with execution");
	console.log("  2. Cancel and exit");
	console.log("");

	const rl = readline.createInterface({ input, output });
	const answer = await rl.question("Enter your choice (1-2): ");
	rl.close();

	return answer.trim() === "1";
}

/**
 * Run full planning workflow
 */
export async function runPlanningMode(options: PlanningOptions): Promise<boolean> {
	try {
		const plan = await generatePlan(options);
		const planPath = await savePlan(options.workDir, plan);
		logSuccess(`Plan generated: ${planPath}`);

		const approved = await reviewPlan(planPath);

		if (approved) {
			logSuccess("Plan approved! Proceeding with execution...");
			return true;
		}
		logInfo("Plan rejected. Exiting...");
		return false;
	} catch (error) {
		logError(`Planning failed: ${error instanceof Error ? error.message : String(error)}`);
		return false;
	}
}
