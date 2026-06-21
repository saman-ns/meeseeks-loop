import type { AIEngine } from "../engines/types.ts";

/**
 * Input for PRD generation
 */
export interface PRDGenerationInput {
	projectName: string;
	description: string;
	language?: string;
	framework?: string;
	mainGoal: string;
	focusAreas?: string[];
	rules?: string[];
}

/**
 * Result from PRD generation
 */
export interface PRDGenerationResult {
	prdContent: string; // Full PRD.md markdown
	contextGuideContent: string; // Initial contextguide.md
}

/**
 * Build the AI prompt for task breakdown
 */
function buildTaskBreakdownPrompt(input: PRDGenerationInput): string {
	const lines: string[] = [];

	lines.push(
		"You are a technical product manager helping to break down a project into actionable tasks.",
	);
	lines.push("");
	lines.push("# Project Information");
	lines.push("");
	lines.push(`**Project Name:** ${input.projectName}`);
	lines.push(`**Description:** ${input.description}`);
	if (input.language) lines.push(`**Language:** ${input.language}`);
	if (input.framework) lines.push(`**Framework:** ${input.framework}`);
	lines.push("");
	lines.push("# Goal");
	lines.push("");
	lines.push(input.mainGoal);
	lines.push("");

	if (input.focusAreas && input.focusAreas.length > 0) {
		lines.push("# Focus Areas");
		lines.push("");
		for (const area of input.focusAreas) {
			lines.push(`- ${area}`);
		}
		lines.push("");
	}

	if (input.rules && input.rules.length > 0) {
		lines.push("# Rules & Constraints");
		lines.push("");
		for (const rule of input.rules) {
			lines.push(`- ${rule}`);
		}
		lines.push("");
	}

	lines.push("# Instructions");
	lines.push("");
	lines.push("Generate a comprehensive task breakdown for this project. Follow these guidelines:");
	lines.push("");
	lines.push("1. Break down the goal into 5-15 concrete, actionable tasks");
	lines.push("2. Order tasks logically (setup first, then features, then polish)");
	lines.push("3. Each task should be specific and testable");
	lines.push("4. Keep task descriptions concise (1-2 sentences max)");
	lines.push("5. Include setup, implementation, testing, and documentation tasks");
	lines.push("");
	lines.push("# Required Output Format");
	lines.push("");
	lines.push("Respond with a markdown task list ONLY, using this exact format:");
	lines.push("");
	lines.push("```markdown");
	lines.push("- [ ] Task 1: Description");
	lines.push("- [ ] Task 2: Description");
	lines.push("- [ ] Task 3: Description");
	lines.push("```");
	lines.push("");
	lines.push("Do NOT include any explanation, preamble, or additional text.");
	lines.push("Do NOT use numbered lists or any other format.");
	lines.push("ONLY output the markdown task list with checkbox format: `- [ ] Task: description`");

	return lines.join("\n");
}

/**
 * Format PRD content from AI response
 */
function formatPRDContent(input: PRDGenerationInput, taskList: string): string {
	const lines: string[] = [];

	lines.push(`# ${input.projectName}`);
	lines.push("");
	lines.push(`> ${input.description}`);
	lines.push("");

	// Stack info if provided
	if (input.language || input.framework) {
		lines.push("## Stack");
		lines.push("");
		const stack: string[] = [];
		if (input.language) stack.push(`**Language:** ${input.language}`);
		if (input.framework) stack.push(`**Framework:** ${input.framework}`);
		lines.push(stack.join(" | "));
		lines.push("");
	}

	// Goals section
	lines.push("## Goals");
	lines.push("");
	lines.push(`- ${input.mainGoal}`);
	lines.push("");

	// Focus areas if provided
	if (input.focusAreas && input.focusAreas.length > 0) {
		lines.push("## Focus Areas");
		lines.push("");
		for (const area of input.focusAreas) {
			lines.push(`- ${area}`);
		}
		lines.push("");
	}

	// Tasks section
	lines.push("## Tasks");
	lines.push("");
	lines.push(taskList.trim());
	lines.push("");

	// Rules if provided
	if (input.rules && input.rules.length > 0) {
		lines.push("## Rules");
		lines.push("");
		for (const rule of input.rules) {
			lines.push(`- ${rule}`);
		}
		lines.push("");
	}

	// Success criteria
	lines.push("## Success Criteria");
	lines.push("");
	lines.push("- [ ] All tasks completed");
	lines.push("- [ ] Code follows project conventions");
	lines.push("- [ ] Tests passing");
	lines.push("- [ ] Documentation updated");
	lines.push("");

	return lines.join("\n");
}

/**
 * Format context guide content
 */
function formatContextGuide(input: PRDGenerationInput): string {
	const lines: string[] = [];

	lines.push("# Context Guide");
	lines.push("");
	lines.push(`This document tracks the evolving context of the ${input.projectName} project.`);
	lines.push("");
	lines.push("## Project Overview");
	lines.push("");
	lines.push(input.description);
	lines.push("");
	lines.push("## Current Goal");
	lines.push("");
	lines.push(input.mainGoal);
	lines.push("");

	if (input.language || input.framework) {
		lines.push("## Technology Stack");
		lines.push("");
		if (input.language) lines.push(`- **Language:** ${input.language}`);
		if (input.framework) lines.push(`- **Framework:** ${input.framework}`);
		lines.push("");
	}

	if (input.focusAreas && input.focusAreas.length > 0) {
		lines.push("## Focus Areas");
		lines.push("");
		for (const area of input.focusAreas) {
			lines.push(`- ${area}`);
		}
		lines.push("");
	}

	lines.push("## Progress");
	lines.push("");
	lines.push("_This section will be updated by AI agents as they work through tasks._");
	lines.push("");
	lines.push("### Completed Tasks");
	lines.push("");
	lines.push("None yet");
	lines.push("");
	lines.push("### Current Challenges");
	lines.push("");
	lines.push("None yet");
	lines.push("");
	lines.push("### Next Steps");
	lines.push("");
	lines.push("Review PRD.md and begin first task");
	lines.push("");

	return lines.join("\n");
}

/**
 * Clean AI response to extract only the task list
 */
function cleanTaskList(aiResponse: string): string {
	// Remove markdown code blocks if present
	const cleaned = aiResponse.replace(/```markdown\n?/g, "").replace(/```\n?/g, "");

	// Extract lines that look like tasks (start with - [ ])
	const lines = cleaned.split("\n");
	const taskLines = lines.filter((line) => line.trim().match(/^-\s*\[\s*\]\s+/));

	// If we found task lines, use those
	if (taskLines.length > 0) {
		return taskLines.join("\n");
	}

	// Otherwise, try to preserve original format if it looks task-like
	const looksLikeTasks = lines.some((line) => line.trim().match(/^-\s*\[\s*\]\s+/));
	if (looksLikeTasks) {
		return cleaned.trim();
	}

	// Fallback: return cleaned response
	return cleaned.trim();
}

/**
 * Generate PRD and context guide using AI
 */
export async function generatePRD(
	input: PRDGenerationInput,
	engine: AIEngine,
	workDir: string,
): Promise<PRDGenerationResult> {
	// Build the task breakdown prompt
	const prompt = buildTaskBreakdownPrompt(input);

	// Execute AI engine to get task breakdown
	// Use sonnet model for cost efficiency
	const result = await engine.execute(prompt, workDir, {
		modelOverride: "sonnet",
	});

	if (!result.success) {
		throw new Error(`Failed to generate task breakdown: ${result.error || "Unknown error"}`);
	}

	// Clean the AI response to extract task list
	const taskList = cleanTaskList(result.response);

	// Validate that we got tasks
	if (!taskList.match(/^-\s*\[\s*\]\s+/m)) {
		throw new Error(
			"AI did not generate tasks in the expected format. Please try again with a clearer goal.",
		);
	}

	// Format the complete PRD
	const prdContent = formatPRDContent(input, taskList);

	// Generate context guide
	const contextGuideContent = formatContextGuide(input);

	return {
		prdContent,
		contextGuideContent,
	};
}
