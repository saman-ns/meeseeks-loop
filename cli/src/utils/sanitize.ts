/**
 * Input sanitization utilities to prevent command injection and path traversal attacks.
 *
 * Use these functions to sanitize user inputs before passing them to shell commands,
 * file operations, or engine arguments.
 */

/**
 * Shell metacharacters that can be used for command injection
 */
const SHELL_METACHARACTERS = /[;&|`$(){}[\]<>!#*?~\\'"\n\r]/;

/**
 * Shell metacharacters for replacement (with global flag)
 */
const SHELL_METACHARACTERS_GLOBAL = /[;&|`$(){}[\]<>!#*?~\\'"\n\r]/g;

/**
 * Characters that are unsafe in file paths
 */
const UNSAFE_PATH_CHARACTERS = /[\0\n\r]/g;

/**
 * Path traversal patterns - matches .. at start, end, or surrounded by separators
 */
const PATH_TRAVERSAL_PATTERN = /(^|[/\\])\.\.([/\\]|$)/;

/**
 * Sanitize a task title by removing shell metacharacters.
 * Task titles are often displayed in logs and may be passed to engines.
 *
 * @param title - The task title to sanitize
 * @returns Sanitized task title safe for shell usage
 *
 * @example
 * ```typescript
 * sanitizeTaskTitle("Build feature; rm -rf /") // "Build feature rm -rf /"
 * sanitizeTaskTitle("$(whoami)") // "whoami"
 * ```
 */
export function sanitizeTaskTitle(title: string): string {
	return title.replace(SHELL_METACHARACTERS_GLOBAL, "").trim();
}

/**
 * Sanitize a file path by preventing path traversal attacks.
 * Removes ".." sequences and null bytes that could escape intended directories.
 *
 * @param filePath - The file path to sanitize
 * @returns Sanitized file path without traversal sequences
 *
 * @example
 * ```typescript
 * sanitizeFilePath("../../../etc/passwd") // "etc/passwd"
 * sanitizeFilePath("foo/../bar/baz") // "foo/bar/baz"
 * ```
 */
export function sanitizeFilePath(filePath: string): string {
	let sanitized = filePath
		// Remove null bytes and other control characters
		.replace(UNSAFE_PATH_CHARACTERS, "")
		// Normalize backslashes to forward slashes
		.replace(/\\/g, "/");

	// Remove path traversal sequences repeatedly until none remain
	let previous = "";
	while (sanitized !== previous) {
		previous = sanitized;
		// Replace /../ or leading ../
		sanitized = sanitized.replace(/(^|\/)\.\.(\/|$)/g, "/");
	}

	// Remove leading slashes to prevent absolute path access
	sanitized = sanitized.replace(/^\/+/, "");

	// Clean up any double slashes that resulted from replacements
	sanitized = sanitized.replace(/\/+/g, "/");

	return sanitized;
}

/**
 * Allowed engine argument patterns (whitelist approach)
 *
 * These patterns match common CLI flags that are safe to pass through.
 * Unknown arguments are rejected for security.
 */
const ALLOWED_ARG_PATTERNS = [
	// Model flags
	/^--model$/,
	/^--model=\w+$/,
	// Output/format flags
	/^--output$/,
	/^--output-format$/,
	/^--output-format=\w+$/,
	/^--format$/,
	/^--format=\w+$/,
	// Verbosity flags
	/^--verbose$/,
	/^-v$/,
	/^--quiet$/,
	/^-q$/,
	/^--debug$/,
	// Help flags
	/^--help$/,
	/^-h$/,
	// Version flags
	/^--version$/,
	// Common boolean flags (long form only for safety)
	/^--no-[\w-]+$/,
	/^--[\w-]+$/,
	// Flag values (alphanumeric with hyphens/underscores/dots, no shell metacharacters)
	/^[a-zA-Z0-9][\w.-]*$/,
];

/**
 * Sanitize engine arguments by validating against an allowlist.
 * Rejects arguments that don't match known safe patterns.
 *
 * @param args - Array of engine arguments to validate
 * @returns Array of validated arguments (invalid ones are filtered out)
 *
 * @example
 * ```typescript
 * sanitizeEngineArgs(["--model", "opus"]) // ["--model", "opus"]
 * sanitizeEngineArgs(["--model", "; rm -rf /"]) // ["--model"] (dangerous value removed)
 * sanitizeEngineArgs(["-e", "$(whoami)"]) // [] (both removed)
 * ```
 */
export function sanitizeEngineArgs(args: string[]): string[] {
	return args.filter((arg) => {
		// Check if arg matches any allowed pattern
		return ALLOWED_ARG_PATTERNS.some((pattern) => pattern.test(arg));
	});
}

/**
 * Sanitize a git branch name by removing unsafe characters.
 * Git branch names have specific restrictions.
 *
 * @param branchName - The branch name to sanitize
 * @returns Sanitized branch name
 *
 * @example
 * ```typescript
 * sanitizeBranchName("feature/my-feature") // "feature/my-feature"
 * sanitizeBranchName("..bad..name") // "bad..name"
 * sanitizeBranchName("name with spaces") // "name-with-spaces"
 * ```
 */
export function sanitizeBranchName(branchName: string): string {
	return (
		branchName
			// Replace spaces with hyphens
			.replace(/\s+/g, "-")
			// Remove characters that are invalid in git branch names
			.replace(/[~^:?*[\]\\@{}"']/g, "")
			// Remove leading dots and slashes
			.replace(/^[./]+/, "")
			// Remove trailing dots and slashes
			.replace(/[./]+$/, "")
			// Replace consecutive dots with a single dot
			.replace(/\.{2,}/g, ".")
			// Replace consecutive slashes with a single slash
			.replace(/\/{2,}/g, "/")
			// Limit length
			.slice(0, 100)
	);
}

/**
 * Sanitize a commit message by removing shell metacharacters
 * while preserving readability.
 *
 * @param message - The commit message to sanitize
 * @returns Sanitized commit message
 */
export function sanitizeCommitMessage(message: string): string {
	return (
		message
			// Remove shell metacharacters but keep common punctuation
			.replace(/[`$(){}[\]\\]/g, "")
			// Normalize whitespace
			.replace(/\s+/g, " ")
			.trim()
	);
}

/**
 * Check if a string contains potentially dangerous shell characters.
 * Use this for validation before deciding whether to sanitize or reject.
 *
 * @param input - The input string to check
 * @returns True if the input contains shell metacharacters
 */
export function containsShellMetacharacters(input: string): boolean {
	return SHELL_METACHARACTERS.test(input);
}

/**
 * Check if a path contains traversal attempts.
 *
 * @param filePath - The file path to check
 * @returns True if the path contains ".." sequences
 */
export function containsPathTraversal(filePath: string): boolean {
	return PATH_TRAVERSAL_PATTERN.test(filePath) || filePath.includes("\0");
}
