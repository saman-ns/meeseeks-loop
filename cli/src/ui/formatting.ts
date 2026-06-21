import pc from "picocolors";

/**
 * Draw a box with a title and content lines
 */
export function drawBox(title: string, content: string[], width = 50): string {
	const lines: string[] = [];

	// Top border with title
	lines.push(`  ┌─ ${title} ${"─".repeat(Math.max(0, width - title.length - 5))}┐`);

	// Content lines
	for (const line of content) {
		const padding = " ".repeat(Math.max(0, width - line.length));
		lines.push(`  │ ${line}${padding} │`);
	}

	// Bottom border
	lines.push(`  └${"─".repeat(width + 1)}┘`);

	return lines.join("\n");
}

/**
 * Status indicator with icon and text
 */
export function statusIndicator(
	status: boolean | "warn",
	trueText: string,
	falseText: string,
): string {
	if (status === true) {
		return `${pc.green("✓")} ${trueText}`;
	}
	if (status === "warn") {
		return `${pc.yellow("⚠")} ${falseText}`;
	}
	return `${pc.red("✗")} ${falseText}`;
}

/**
 * Simple progress bar
 */
export function progressBar(current: number, total: number, width = 20): string {
	if (total === 0) return "─".repeat(width);

	const percent = current / total;
	const filled = Math.round(percent * width);
	const empty = width - filled;

	return pc.green("█".repeat(filled)) + pc.dim("░".repeat(empty));
}

/**
 * Format a number with commas for thousands
 */
export function formatNumber(num: number): string {
	return num.toLocaleString();
}

/**
 * Truncate text to fit within a max length
 */
export function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength - 3)}...`;
}
