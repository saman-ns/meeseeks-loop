#!/usr/bin/env node
/**
 * Interactive wizard demo
 *
 * Run with: node --import tsx/esm examples/wizard-demo.ts
 * Or with Bun: bun run examples/wizard-demo.ts
 */

import { runWizard } from "../src/ui/wizard.ts";
import type { WizardPhase } from "../src/ui/wizard.ts";

const phases: WizardPhase[] = [
	{
		name: "Project Basics",
		description: "Let's configure your new project",
		questions: [
			{
				id: "projectName",
				type: "text",
				prompt: "What is your project name?",
				default: "my-awesome-project",
				validate: (answer) => {
					if (typeof answer !== "string") return "Must be text";
					if (answer.length < 3) return "Project name must be at least 3 characters";
					if (!/^[a-z0-9-]+$/.test(answer))
						return "Only lowercase letters, numbers, and hyphens allowed";
					return true;
				},
			},
			{
				id: "language",
				type: "choice",
				prompt: "Which programming language?",
				choices: ["TypeScript", "JavaScript", "Python", "Go", "Rust"],
				default: "TypeScript",
			},
			{
				id: "useGit",
				type: "confirm",
				prompt: "Initialize a Git repository?",
				default: true,
			},
		],
	},
	{
		name: "Development Tools",
		description: "Select the tools you want to include",
		questions: [
			{
				id: "tools",
				type: "multiChoice",
				prompt: "Which development tools would you like?",
				choices: ["Testing (Vitest)", "Linting (Biome)", "CI/CD (GitHub Actions)", "Docker"],
				default: ["Testing (Vitest)", "Linting (Biome)"],
			},
		],
	},
	{
		name: "Database Configuration",
		questions: [
			{
				id: "needsDatabase",
				type: "confirm",
				prompt: "Does your project need a database?",
				default: false,
			},
			{
				id: "database",
				type: "choice",
				prompt: "Which database?",
				choices: ["PostgreSQL", "MySQL", "MongoDB", "SQLite"],
				default: "PostgreSQL",
				skip: (answers) => !answers.needsDatabase,
			},
		],
	},
	{
		name: "Final Configuration",
		questions: [
			{
				id: "packageManager",
				type: "choice",
				prompt: "Which package manager?",
				choices: ["npm", "yarn", "pnpm", "bun"],
				default: "bun",
			},
			{
				id: "readme",
				type: "confirm",
				prompt: "Generate README.md with project details?",
				default: true,
			},
		],
	},
];

async function main() {
	console.log("Welcome to the Project Setup Wizard!\n");

	const result = await runWizard(phases);

	if (result.completed) {
		console.log("\n📋 Your Configuration:");
		console.log("━".repeat(50));
		for (const [key, value] of Object.entries(result.answers)) {
			const displayValue = Array.isArray(value) ? value.join(", ") : String(value);
			console.log(`  ${key}: ${displayValue}`);
		}
		console.log("━".repeat(50));
		console.log("\nConfiguration saved! Ready to create your project.");
	} else {
		console.log("Setup cancelled. No changes made.");
		process.exit(1);
	}
}

main().catch((error) => {
	console.error("Error:", error);
	process.exit(1);
});
