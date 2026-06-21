/**
 * Mr. Meeseeks ASCII art mascot
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";

export function showMascot(): void {
	const blue = pc.cyan;
	const orange = pc.yellow;
	const white = pc.white;
	const bold = pc.bold;
	const dim = pc.dim;

	// Get version from package.json
	let version = "5.1.0";
	try {
		const packagePath = join(import.meta.dirname, "../../package.json");
		const packageJson = JSON.parse(readFileSync(packagePath, "utf-8"));
		version = packageJson.version;
	} catch {
		// Use default if can't read
	}

	// Get current directory (relative to home if possible)
	const cwd = process.cwd();
	const home = process.env.HOME || process.env.USERPROFILE || "";
	const displayPath = home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;

	const mascot = `
${orange("    ▖▖▖")}
${blue("  ███████")}
${blue(" ███") + white("●") + blue("█") + white("●") + blue("███")}        ${pc.cyan("Hi I'm Mr. Meeseeks look at me!")}
${blue(" █████████")}        ${dim(`Meeseeks v${version}`)}
${blue(" ██") + white("█████") + blue("██")}        ${dim(displayPath)}
${blue("  ███████")}
`;

	console.log(mascot);
}
