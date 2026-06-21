import { createSpinner } from "nanospinner";
import pc from "picocolors";
import { formatDuration } from "./logger.ts";

export type SpinnerInstance = ReturnType<typeof createSpinner>;

/**
 * Operation timing entry for tracking step durations
 */
interface OperationTiming {
	name: string;
	startTime: number;
	endTime?: number;
}

/**
 * Progress spinner with step tracking and operation timing
 *
 * Features:
 * - Shows current step with elapsed time
 * - Tracks step transitions for performance visibility
 * - Optional operation timing breakdown in success message
 */
export class ProgressSpinner {
	private spinner: SpinnerInstance;
	private startTime: number;
	private currentStep = "Thinking";
	private task: string;
	private settings: string;
	private tickInterval: ReturnType<typeof setInterval> | null = null;
	private stepHistory: OperationTiming[] = [];
	private stepStartTime: number;

	constructor(task: string, settings?: string[]) {
		this.task = task.length > 40 ? `${task.slice(0, 37)}...` : task;
		this.settings = settings?.length ? `[${settings.join(", ")}]` : "";
		this.startTime = Date.now();
		this.stepStartTime = Date.now();
		this.spinner = createSpinner(this.formatText()).start();

		// Record initial step
		this.stepHistory.push({ name: this.currentStep, startTime: this.stepStartTime });

		// Update timer every second
		this.tickInterval = setInterval(() => this.tick(), 1000);
	}

	private formatText(): string {
		const elapsed = Date.now() - this.startTime;
		const time = formatDuration(elapsed);

		const settingsStr = this.settings ? ` ${pc.yellow(this.settings)}` : "";
		return `${pc.cyan(this.currentStep)}${settingsStr} ${pc.dim(`[${time}]`)} ${this.task}`;
	}

	/**
	 * Update the current step and record timing
	 */
	updateStep(step: string): void {
		const now = Date.now();

		// Close out previous step timing
		if (this.stepHistory.length > 0) {
			const lastStep = this.stepHistory[this.stepHistory.length - 1];
			if (!lastStep.endTime) {
				lastStep.endTime = now;
			}
		}

		// Record new step
		this.currentStep = step;
		this.stepStartTime = now;
		this.stepHistory.push({ name: step, startTime: now });

		this.spinner.update({ text: this.formatText() });
	}

	/**
	 * Update spinner text (called periodically to update time)
	 */
	tick(): void {
		this.spinner.update({ text: this.formatText() });
	}

	private clearTickInterval(): void {
		if (this.tickInterval) {
			clearInterval(this.tickInterval);
			this.tickInterval = null;
		}
	}

	/**
	 * Get total elapsed time in milliseconds
	 */
	getElapsedMs(): number {
		return Date.now() - this.startTime;
	}

	/**
	 * Get step timing breakdown
	 */
	getStepTimings(): Array<{ name: string; durationMs: number }> {
		const now = Date.now();
		return this.stepHistory.map((step) => ({
			name: step.name,
			durationMs: (step.endTime || now) - step.startTime,
		}));
	}

	/**
	 * Mark as success with optional timing breakdown
	 */
	success(message?: string, showTimingBreakdown = false): void {
		this.clearTickInterval();
		const elapsed = formatDuration(this.getElapsedMs());

		let text = message || this.formatText();

		if (showTimingBreakdown && this.stepHistory.length > 1) {
			const timings = this.getStepTimings()
				.filter((t) => t.durationMs >= 1000) // Only show steps that took >= 1s
				.map((t) => `${t.name}: ${formatDuration(t.durationMs)}`)
				.join(", ");
			if (timings) {
				text = `${text} ${pc.dim(`(${timings})`)}`;
			}
		}

		this.spinner.success({ text: `${text} ${pc.green(`[${elapsed}]`)}` });
	}

	/**
	 * Mark as error
	 */
	error(message?: string): void {
		this.clearTickInterval();
		const elapsed = formatDuration(this.getElapsedMs());
		this.spinner.error({ text: `${message || this.formatText()} ${pc.red(`[${elapsed}]`)}` });
	}

	/**
	 * Stop the spinner
	 */
	stop(): void {
		this.clearTickInterval();
		this.spinner.stop();
	}
}

/**
 * Create a simple spinner
 */
export function createSimpleSpinner(text: string): SpinnerInstance {
	return createSpinner(text).start();
}

/**
 * Simple operation timer for tracking specific operations
 */
export class OperationTimer {
	private startTime: number;
	private operationName: string;

	constructor(operationName: string) {
		this.operationName = operationName;
		this.startTime = Date.now();
	}

	/**
	 * Get elapsed time in milliseconds
	 */
	elapsedMs(): number {
		return Date.now() - this.startTime;
	}

	/**
	 * Get formatted elapsed time
	 */
	elapsed(): string {
		return formatDuration(this.elapsedMs());
	}

	/**
	 * Get operation name and elapsed time
	 */
	summary(): string {
		return `${this.operationName}: ${this.elapsed()}`;
	}
}
