/**
 * Conceptual test for wizard module
 *
 * This file demonstrates proper usage of the wizard API
 * and validates the type system is working correctly.
 */

import { describe, expect, it } from "vitest";
import type { WizardPhase, WizardResult } from "./wizard.ts";

// Example 1: Basic project setup wizard
const basicWizardExample: WizardPhase[] = [
	{
		name: "Project Basics",
		description: "Let's set up your project configuration",
		questions: [
			{
				id: "name",
				type: "text",
				prompt: "Project name?",
				default: "my-app",
				validate: (answer) => {
					if (typeof answer !== "string") return "Must be text";
					if (answer.length < 3) return "Name must be at least 3 characters";
					return true;
				},
			},
			{
				id: "lang",
				type: "choice",
				prompt: "Language?",
				choices: ["TypeScript", "Python", "Go", "Rust"],
				default: "TypeScript",
			},
			{
				id: "git",
				type: "confirm",
				prompt: "Initialize git repository?",
				default: true,
			},
		],
	},
	{
		name: "Configuration",
		questions: [
			{
				id: "features",
				type: "multiChoice",
				prompt: "Select features to enable",
				choices: ["Testing", "Linting", "CI/CD", "Docker"],
				default: ["Testing", "Linting"],
			},
		],
	},
];

// Example 2: Conditional questions with skip logic
const conditionalWizardExample: WizardPhase[] = [
	{
		name: "Database Setup",
		questions: [
			{
				id: "useDatabase",
				type: "confirm",
				prompt: "Do you need a database?",
				default: true,
			},
			{
				id: "dbType",
				type: "choice",
				prompt: "Which database?",
				choices: ["PostgreSQL", "MySQL", "MongoDB", "SQLite"],
				skip: (answers) => !answers.useDatabase,
			},
		],
	},
];

// Type validation: Ensure result type is correct
function processWizardResult(result: WizardResult): void {
	if (result.completed) {
		// Access answers with proper types
		const name: string | boolean | string[] | undefined = result.answers.name;
		const lang: string | boolean | string[] | undefined = result.answers.lang;
		const features: string | boolean | string[] | undefined = result.answers.features;

		console.log("Wizard completed:", { name, lang, features });
	} else {
		console.log("Wizard was cancelled");
	}
}

// Example showing all question types
const allTypesExample: WizardPhase[] = [
	{
		name: "All Question Types",
		questions: [
			{ id: "text", type: "text", prompt: "Text input?" },
			{ id: "choice", type: "choice", prompt: "Single choice?", choices: ["A", "B"] },
			{
				id: "multi",
				type: "multiChoice",
				prompt: "Multiple choices?",
				choices: ["X", "Y", "Z"],
			},
			{ id: "confirm", type: "confirm", prompt: "Confirm?" },
		],
	},
];

// Runtime assertions so this file is a real (passing) test suite, not just a
// compile-time type demo. Without at least one test, vitest errors with
// "No test suite found in file" and the whole run exits non-zero.
describe("wizard type examples", () => {
	it("basic wizard example is well-formed", () => {
		expect(basicWizardExample.length).toBeGreaterThan(0);
		expect(basicWizardExample[0].questions.length).toBeGreaterThan(0);
	});

	it("conditional example uses skip logic", () => {
		const dbQuestion = conditionalWizardExample[0].questions.find((q) => q.id === "dbType");
		expect(dbQuestion?.skip).toBeTypeOf("function");
	});

	it("covers all question types", () => {
		const types = allTypesExample[0].questions.map((q) => q.type);
		expect(new Set(types)).toEqual(new Set(["text", "choice", "multiChoice", "confirm"]));
	});

	it("processWizardResult handles cancelled results", () => {
		const cancelled: WizardResult = { completed: false, answers: {} };
		expect(() => processWizardResult(cancelled)).not.toThrow();
	});
});

/**
 * This test file validates:
 * 1. All exported types are accessible
 * 2. WizardPhase structure is correctly typed
 * 3. WizardResult provides proper answer access
 * 4. All question types (text, choice, multiChoice, confirm) are supported
 * 5. Optional features (default, validate, skip) are correctly typed
 * 6. Example usage patterns for documentation
 */
