import { describe, expect, it } from "vitest";
import type { AIEngine, AIResult } from "../engines/types.ts";
import { type PRDGenerationInput, generatePRD } from "./prd-generator.ts";

// Mock AI engine for testing
class MockAIEngine implements AIEngine {
	name = "Mock";
	cliCommand = "mock";

	async isAvailable(): Promise<boolean> {
		return true;
	}

	async execute(_prompt: string, _workDir: string): Promise<AIResult> {
		return {
			success: true,
			response: `- [ ] Set up project structure
- [ ] Implement core functionality
- [ ] Add tests
- [ ] Write documentation
- [ ] Deploy to production`,
			inputTokens: 100,
			outputTokens: 50,
		};
	}
}

describe("prd-generator", () => {
	it("should generate PRD with task list", async () => {
		const input: PRDGenerationInput = {
			projectName: "Test Project",
			description: "A test project for PRD generation",
			language: "TypeScript",
			framework: "Node.js",
			mainGoal: "Build a CLI tool",
			focusAreas: ["Developer experience", "Performance"],
			rules: ["Follow TypeScript best practices"],
		};

		const mockEngine = new MockAIEngine();
		const result = await generatePRD(input, mockEngine, "/tmp");

		// Check PRD content
		expect(result.prdContent).toContain("# Test Project");
		expect(result.prdContent).toContain("A test project for PRD generation");
		expect(result.prdContent).toContain("## Stack");
		expect(result.prdContent).toContain("**Language:** TypeScript");
		expect(result.prdContent).toContain("**Framework:** Node.js");
		expect(result.prdContent).toContain("## Goals");
		expect(result.prdContent).toContain("Build a CLI tool");
		expect(result.prdContent).toContain("## Focus Areas");
		expect(result.prdContent).toContain("Developer experience");
		expect(result.prdContent).toContain("## Tasks");
		expect(result.prdContent).toContain("- [ ] Set up project structure");
		expect(result.prdContent).toContain("- [ ] Implement core functionality");
		expect(result.prdContent).toContain("## Rules");
		expect(result.prdContent).toContain("Follow TypeScript best practices");
		expect(result.prdContent).toContain("## Success Criteria");

		// Check context guide content
		expect(result.contextGuideContent).toContain("# Context Guide");
		expect(result.contextGuideContent).toContain("## Project Overview");
		expect(result.contextGuideContent).toContain("A test project for PRD generation");
		expect(result.contextGuideContent).toContain("## Current Goal");
		expect(result.contextGuideContent).toContain("Build a CLI tool");
		expect(result.contextGuideContent).toContain("## Technology Stack");
		expect(result.contextGuideContent).toContain("**Language:** TypeScript");
		expect(result.contextGuideContent).toContain("## Focus Areas");
		expect(result.contextGuideContent).toContain("Developer experience");
		expect(result.contextGuideContent).toContain("## Progress");
	});

	it("should handle minimal input", async () => {
		const input: PRDGenerationInput = {
			projectName: "Minimal Project",
			description: "Minimal description",
			mainGoal: "Basic goal",
		};

		const mockEngine = new MockAIEngine();
		const result = await generatePRD(input, mockEngine, "/tmp");

		expect(result.prdContent).toContain("# Minimal Project");
		expect(result.prdContent).toContain("Minimal description");
		expect(result.prdContent).toContain("Basic goal");
		expect(result.prdContent).toContain("- [ ] Set up project structure");

		expect(result.contextGuideContent).toContain("# Context Guide");
		expect(result.contextGuideContent).toContain("Minimal description");
	});

	it("should clean AI response with markdown code blocks", async () => {
		const mockEngine = new MockAIEngine();
		mockEngine.execute = async () => ({
			success: true,
			response: `Here are the tasks:

\`\`\`markdown
- [ ] Task 1
- [ ] Task 2
\`\`\`

Done!`,
			inputTokens: 100,
			outputTokens: 50,
		});

		const input: PRDGenerationInput = {
			projectName: "Test",
			description: "Test",
			mainGoal: "Test",
		};

		const result = await generatePRD(input, mockEngine, "/tmp");

		expect(result.prdContent).toContain("- [ ] Task 1");
		expect(result.prdContent).toContain("- [ ] Task 2");
		expect(result.prdContent).not.toContain("```markdown");
		expect(result.prdContent).not.toContain("Here are the tasks:");
	});

	it("should throw error if AI fails", async () => {
		const mockEngine = new MockAIEngine();
		mockEngine.execute = async () => ({
			success: false,
			response: "",
			inputTokens: 0,
			outputTokens: 0,
			error: "AI error",
		});

		const input: PRDGenerationInput = {
			projectName: "Test",
			description: "Test",
			mainGoal: "Test",
		};

		await expect(generatePRD(input, mockEngine, "/tmp")).rejects.toThrow(
			"Failed to generate task breakdown",
		);
	});

	it("should throw error if AI returns invalid format", async () => {
		const mockEngine = new MockAIEngine();
		mockEngine.execute = async () => ({
			success: true,
			response: "This is not a task list",
			inputTokens: 100,
			outputTokens: 50,
		});

		const input: PRDGenerationInput = {
			projectName: "Test",
			description: "Test",
			mainGoal: "Test",
		};

		await expect(generatePRD(input, mockEngine, "/tmp")).rejects.toThrow(
			"AI did not generate tasks in the expected format",
		);
	});
});
