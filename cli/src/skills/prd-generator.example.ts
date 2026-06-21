/**
 * Example usage of the PRD generator
 *
 * This shows how to use generatePRD() with an AI engine to create
 * a PRD.md and contextguide.md for a new project.
 */

import { ClaudeEngine } from "../engines/claude.ts";
import { type PRDGenerationInput, generatePRD } from "./prd-generator.ts";

async function exampleUsage() {
	// Define the project inputs (typically from a wizard)
	const input: PRDGenerationInput = {
		projectName: "Task Manager API",
		description: "A RESTful API for managing tasks and todos with user authentication",
		language: "TypeScript",
		framework: "Express.js",
		mainGoal: "Build a production-ready task management API with CRUD operations and JWT auth",
		focusAreas: [
			"RESTful API design",
			"Security and authentication",
			"Database schema design",
			"Error handling",
		],
		rules: [
			"Use TypeScript strict mode",
			"Follow REST conventions",
			"Include comprehensive error handling",
			"Write tests for all endpoints",
		],
	};

	// Create the AI engine
	const engine = new ClaudeEngine();

	// Check if engine is available
	if (!(await engine.isAvailable())) {
		console.error("Claude CLI is not installed or not in PATH");
		return;
	}

	// Generate PRD and context guide
	console.log("Generating PRD with AI task breakdown...");

	const result = await generatePRD(input, engine, process.cwd());

	// The result contains two markdown files that the caller should save
	console.log("\n=== PRD.md ===\n");
	console.log(result.prdContent);

	console.log("\n=== contextguide.md ===\n");
	console.log(result.contextGuideContent);

	// In a real implementation, the caller would save these files:
	// writeFileSync('PRD.md', result.prdContent);
	// writeFileSync('.meeseeks/contextguide.md', result.contextGuideContent);
}

// Run example (uncomment to test)
// exampleUsage().catch(console.error);
