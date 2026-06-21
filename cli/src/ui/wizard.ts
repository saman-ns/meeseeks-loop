import * as readline from "node:readline";
import pc from "picocolors";

/**
 * Question types supported by the wizard
 */
export type QuestionType = "text" | "choice" | "multiChoice" | "confirm";

/**
 * A single question in a wizard phase
 */
export interface WizardQuestion {
	/** Unique identifier for this question (used as key in answers) */
	id: string;
	/** Type of question */
	type: QuestionType;
	/** The prompt text to display to the user */
	prompt: string;
	/** Available choices (required for choice/multiChoice types) */
	choices?: string[];
	/** Default value for the question */
	default?: string | boolean | string[];
	/** Optional validation function */
	validate?: (answer: string | string[] | boolean) => boolean | string;
	/** Skip this question if condition returns true */
	skip?: (answers: WizardAnswers) => boolean;
}

/**
 * A phase in the wizard (groups related questions)
 */
export interface WizardPhase {
	/** Display name for this phase */
	name: string;
	/** Questions in this phase */
	questions: WizardQuestion[];
	/** Optional description shown before phase starts */
	description?: string;
}

/**
 * Collected answers from the wizard
 */
export interface WizardAnswers {
	[key: string]: string | boolean | string[];
}

/**
 * Result returned from running the wizard
 */
export interface WizardResult {
	/** Whether the wizard completed successfully (false if cancelled) */
	completed: boolean;
	/** Collected answers */
	answers: WizardAnswers;
}

/**
 * Calculate overall progress through the wizard
 */
function calculateProgress(
	currentPhase: number,
	totalPhases: number,
	currentQuestion: number,
	totalQuestions: number,
): { percent: number; display: string } {
	const phaseWeight = 100 / totalPhases;
	const questionWeight = phaseWeight / totalQuestions;
	const percent = Math.round(currentPhase * phaseWeight + currentQuestion * questionWeight);

	const display = `${percent}%`;
	return { percent, display };
}

/**
 * Format phase header with progress
 */
function formatPhaseHeader(
	phaseName: string,
	phaseNum: number,
	totalPhases: number,
	percent: number,
): string {
	const progress = pc.cyan(`Phase ${phaseNum} of ${totalPhases}`);
	const name = pc.bold(phaseName);
	const percentDisplay = pc.dim(`(${percent}%)`);
	return `\n${progress}: ${name} ${percentDisplay}`;
}

/**
 * Format question prompt with numbering
 */
function formatQuestionPrompt(
	question: WizardQuestion,
	questionNum: number,
	totalQuestions: number,
): string {
	const qNum = pc.dim(`[${questionNum}/${totalQuestions}]`);
	const prompt = pc.bold(question.prompt);
	return `${qNum} ${prompt}`;
}

/**
 * Read a line from stdin
 */
function readLine(rl: readline.Interface): Promise<string> {
	return new Promise((resolve) => {
		rl.once("line", (line) => resolve(line.trim()));
	});
}

/**
 * Ask a text question
 */
async function askText(rl: readline.Interface, question: WizardQuestion): Promise<string> {
	const defaultText = question.default ? pc.dim(` (${question.default})`) : "";
	rl.write(`${defaultText}\n`);
	rl.prompt();

	const answer = await readLine(rl);
	return answer || (question.default as string) || "";
}

/**
 * Ask a single choice question
 */
async function askChoice(rl: readline.Interface, question: WizardQuestion): Promise<string> {
	if (!question.choices || question.choices.length === 0) {
		throw new Error(`Question "${question.id}" requires choices`);
	}

	// Display choices
	console.log();
	for (let i = 0; i < question.choices.length; i++) {
		const isDefault = question.default === question.choices[i];
		const marker = isDefault ? pc.green("›") : " ";
		const choice = isDefault ? pc.bold(question.choices[i]) : question.choices[i];
		console.log(`  ${marker} ${pc.dim(`${i + 1}.`)} ${choice}`);
	}

	const defaultText = question.default
		? pc.dim(` (${question.default})`)
		: pc.dim(` (1-${question.choices.length})`);
	rl.write(`${defaultText}\n`);
	rl.prompt();

	while (true) {
		const answer = await readLine(rl);

		// If empty and there's a default, use it
		if (!answer && question.default) {
			return question.default as string;
		}

		// Try to parse as number
		const num = Number.parseInt(answer, 10);
		if (!Number.isNaN(num) && num >= 1 && num <= question.choices.length) {
			return question.choices[num - 1];
		}

		// Try to match choice text
		const matched = question.choices.find((c) => c.toLowerCase() === answer.toLowerCase());
		if (matched) {
			return matched;
		}

		console.log(pc.red(`  Invalid choice. Please enter 1-${question.choices.length}`));
		rl.prompt();
	}
}

/**
 * Ask a multiple choice question
 */
async function askMultiChoice(rl: readline.Interface, question: WizardQuestion): Promise<string[]> {
	if (!question.choices || question.choices.length === 0) {
		throw new Error(`Question "${question.id}" requires choices`);
	}

	// Display choices
	console.log();
	const defaults = (question.default as string[]) || [];
	for (let i = 0; i < question.choices.length; i++) {
		const isDefault = defaults.includes(question.choices[i]);
		const marker = isDefault ? pc.green("✓") : " ";
		const choice = isDefault ? pc.bold(question.choices[i]) : question.choices[i];
		console.log(`  ${marker} ${pc.dim(`${i + 1}.`)} ${choice}`);
	}

	const hint = pc.dim(` (enter numbers separated by comma, e.g., "1,3,5")`);
	if (defaults.length > 0) {
		const defaultStr = defaults.join(", ");
		rl.write(`${pc.dim(` Default: ${defaultStr}`)}${hint}\n`);
	} else {
		rl.write(`${hint}\n`);
	}
	rl.prompt();

	while (true) {
		const answer = await readLine(rl);

		// If empty and there's a default, use it
		if (!answer && defaults.length > 0) {
			return defaults;
		}

		if (!answer) {
			console.log(pc.red("  Please select at least one choice"));
			rl.prompt();
			continue;
		}

		// Parse comma-separated numbers
		const parts = answer.split(",").map((s) => s.trim());
		const selected: string[] = [];
		let invalid = false;

		for (const part of parts) {
			const num = Number.parseInt(part, 10);
			if (Number.isNaN(num) || num < 1 || num > question.choices.length) {
				invalid = true;
				break;
			}
			const choice = question.choices[num - 1];
			if (!selected.includes(choice)) {
				selected.push(choice);
			}
		}

		if (invalid) {
			console.log(pc.red(`  Invalid choice. Please enter numbers 1-${question.choices.length}`));
			rl.prompt();
			continue;
		}

		if (selected.length > 0) {
			return selected;
		}

		console.log(pc.red("  Please select at least one choice"));
		rl.prompt();
	}
}

/**
 * Ask a confirmation question
 */
async function askConfirm(rl: readline.Interface, question: WizardQuestion): Promise<boolean> {
	const defaultValue = question.default !== undefined ? question.default : true;
	const hint = defaultValue ? pc.dim(" (Y/n)") : pc.dim(" (y/N)");
	rl.write(`${hint}\n`);
	rl.prompt();

	const answer = await readLine(rl);

	if (!answer) {
		return defaultValue as boolean;
	}

	const lower = answer.toLowerCase();
	if (lower === "y" || lower === "yes") {
		return true;
	}
	if (lower === "n" || lower === "no") {
		return false;
	}

	console.log(pc.red("  Please answer yes (y) or no (n)"));
	return askConfirm(rl, question);
}

/**
 * Ask a single question based on its type
 */
async function askQuestion(
	rl: readline.Interface,
	question: WizardQuestion,
): Promise<string | boolean | string[]> {
	switch (question.type) {
		case "text":
			return askText(rl, question);
		case "choice":
			return askChoice(rl, question);
		case "multiChoice":
			return askMultiChoice(rl, question);
		case "confirm":
			return askConfirm(rl, question);
		default:
			throw new Error(`Unknown question type: ${question.type}`);
	}
}

/**
 * Run an interactive wizard with multiple phases and questions
 *
 * @param phases - Array of wizard phases containing questions
 * @returns Promise resolving to wizard result with answers
 *
 * @example
 * ```typescript
 * const phases = [
 *   {
 *     name: "Project Basics",
 *     questions: [
 *       { id: "name", type: "text", prompt: "Project name?" },
 *       { id: "lang", type: "choice", prompt: "Language?", choices: ["TypeScript", "Python"] }
 *     ]
 *   }
 * ];
 * const result = await runWizard(phases);
 * console.log(result.answers); // { name: "my-app", lang: "TypeScript" }
 * ```
 */
export async function runWizard(phases: WizardPhase[]): Promise<WizardResult> {
	const answers: WizardAnswers = {};
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
		prompt: pc.cyan("> "),
	});

	// Calculate total questions for progress tracking
	const totalQuestions = phases.reduce((sum, phase) => sum + phase.questions.length, 0);

	console.log(pc.bold("\n🧙 Starting wizard...\n"));

	try {
		let questionsAnswered = 0;

		for (let phaseIdx = 0; phaseIdx < phases.length; phaseIdx++) {
			const phase = phases[phaseIdx];
			const phaseNum = phaseIdx + 1;

			// Calculate and show phase progress
			const progress = calculateProgress(phaseIdx, phases.length, 0, phase.questions.length);
			console.log(formatPhaseHeader(phase.name, phaseNum, phases.length, progress.percent));

			if (phase.description) {
				console.log(pc.dim(phase.description));
			}
			console.log();

			// Ask each question in the phase
			for (let qIdx = 0; qIdx < phase.questions.length; qIdx++) {
				const question = phase.questions[qIdx];

				// Check if question should be skipped
				if (question.skip?.(answers)) {
					continue;
				}

				const questionNum = qIdx + 1;
				const questionPrompt = formatQuestionPrompt(question, questionNum, phase.questions.length);
				console.log(questionPrompt);

				// Ask the question
				const answer = await askQuestion(rl, question);

				// Validate the answer
				if (question.validate) {
					const validation = question.validate(answer);
					if (validation !== true) {
						const errorMsg =
							typeof validation === "string" ? validation : "Invalid answer, please try again";
						console.log(pc.red(`  ${errorMsg}`));
						// Re-ask the question
						qIdx--;
						continue;
					}
				}

				// Store the answer
				answers[question.id] = answer;
				questionsAnswered++;

				// Show what was selected (helpful feedback)
				if (question.type === "choice") {
					console.log(pc.green(`  ✓ Selected: ${answer}\n`));
				} else if (question.type === "multiChoice") {
					const selected = (answer as string[]).join(", ");
					console.log(pc.green(`  ✓ Selected: ${selected}\n`));
				} else if (question.type === "confirm") {
					const value = answer ? "Yes" : "No";
					console.log(pc.green(`  ✓ ${value}\n`));
				} else {
					console.log(pc.green("  ✓\n"));
				}
			}
		}

		console.log(pc.green(`\n✓ Wizard completed! (${questionsAnswered} questions answered)\n`));

		rl.close();
		return { completed: true, answers };
	} catch (error) {
		rl.close();
		console.log(pc.yellow("\n⚠ Wizard cancelled\n"));
		return { completed: false, answers };
	}
}
