import { describe, expect, it } from "vitest";
import {
	containsPathTraversal,
	containsShellMetacharacters,
	sanitizeBranchName,
	sanitizeCommitMessage,
	sanitizeEngineArgs,
	sanitizeFilePath,
	sanitizeTaskTitle,
} from "./sanitize.ts";

describe("sanitize", () => {
	describe("sanitizeTaskTitle", () => {
		it("removes shell metacharacters", () => {
			expect(sanitizeTaskTitle("Build feature; rm -rf /")).toBe("Build feature rm -rf /");
			expect(sanitizeTaskTitle("$(whoami)")).toBe("whoami");
			expect(sanitizeTaskTitle("test`echo hi`")).toBe("testecho hi");
			expect(sanitizeTaskTitle("a & b | c")).toBe("a  b  c");
		});

		it("preserves normal text", () => {
			expect(sanitizeTaskTitle("Add user authentication")).toBe("Add user authentication");
			expect(sanitizeTaskTitle("Fix bug in login flow")).toBe("Fix bug in login flow");
		});

		it("trims whitespace", () => {
			expect(sanitizeTaskTitle("  task with spaces  ")).toBe("task with spaces");
		});
	});

	describe("sanitizeFilePath", () => {
		it("prevents path traversal", () => {
			expect(sanitizeFilePath("../../../etc/passwd")).toBe("etc/passwd");
			expect(sanitizeFilePath("foo/../bar")).toBe("foo/bar");
			expect(sanitizeFilePath("..\\..\\windows\\system32")).toBe("windows/system32");
		});

		it("removes leading slashes", () => {
			expect(sanitizeFilePath("/etc/passwd")).toBe("etc/passwd");
			expect(sanitizeFilePath("///foo/bar")).toBe("foo/bar");
		});

		it("removes null bytes", () => {
			expect(sanitizeFilePath("file\x00.txt")).toBe("file.txt");
		});

		it("preserves valid relative paths", () => {
			expect(sanitizeFilePath("src/components/Button.tsx")).toBe("src/components/Button.tsx");
			expect(sanitizeFilePath("package.json")).toBe("package.json");
		});

		it("handles multiple traversal attempts", () => {
			expect(sanitizeFilePath("a/../b/../c/../d")).toBe("a/b/c/d");
		});
	});

	describe("sanitizeEngineArgs", () => {
		it("allows valid flags", () => {
			expect(sanitizeEngineArgs(["--model", "opus"])).toEqual(["--model", "opus"]);
			expect(sanitizeEngineArgs(["--verbose"])).toEqual(["--verbose"]);
			expect(sanitizeEngineArgs(["-v"])).toEqual(["-v"]);
		});

		it("filters dangerous values", () => {
			expect(sanitizeEngineArgs(["--model", "; rm -rf /"])).toEqual(["--model"]);
			expect(sanitizeEngineArgs(["$(whoami)"])).toEqual([]);
			expect(sanitizeEngineArgs(["`id`"])).toEqual([]);
			expect(sanitizeEngineArgs(["--flag", "value; rm -rf"])).toEqual(["--flag"]);
		});

		it("allows hyphenated values", () => {
			expect(sanitizeEngineArgs(["--output-format", "stream-json"])).toEqual([
				"--output-format",
				"stream-json",
			]);
		});

		it("allows no-prefixed flags", () => {
			expect(sanitizeEngineArgs(["--no-session-persistence"])).toEqual([
				"--no-session-persistence",
			]);
		});
	});

	describe("sanitizeBranchName", () => {
		it("replaces spaces with hyphens", () => {
			expect(sanitizeBranchName("feature with spaces")).toBe("feature-with-spaces");
		});

		it("removes invalid characters", () => {
			expect(sanitizeBranchName("feature~1")).toBe("feature1");
			expect(sanitizeBranchName("feature^branch")).toBe("featurebranch");
			expect(sanitizeBranchName("feature:test")).toBe("featuretest");
		});

		it("removes leading dots and slashes", () => {
			expect(sanitizeBranchName("..bad")).toBe("bad");
			expect(sanitizeBranchName("./also-bad")).toBe("also-bad");
		});

		it("preserves valid branch names", () => {
			expect(sanitizeBranchName("feature/my-feature")).toBe("feature/my-feature");
			expect(sanitizeBranchName("meeseeks/add-tests")).toBe("meeseeks/add-tests");
		});

		it("limits length", () => {
			const longName = "a".repeat(150);
			expect(sanitizeBranchName(longName).length).toBe(100);
		});
	});

	describe("sanitizeCommitMessage", () => {
		it("removes dangerous characters", () => {
			expect(sanitizeCommitMessage("Fix bug `whoami`")).toBe("Fix bug whoami");
			expect(sanitizeCommitMessage("Add $(feature)")).toBe("Add feature");
		});

		it("preserves common punctuation", () => {
			expect(sanitizeCommitMessage("Fix bug! Add feature.")).toBe("Fix bug! Add feature.");
			expect(sanitizeCommitMessage("feat: add login")).toBe("feat: add login");
		});

		it("normalizes whitespace", () => {
			expect(sanitizeCommitMessage("Fix   multiple    spaces")).toBe("Fix multiple spaces");
			expect(sanitizeCommitMessage("  trim edges  ")).toBe("trim edges");
		});
	});

	describe("containsShellMetacharacters", () => {
		it("returns true for dangerous characters", () => {
			expect(containsShellMetacharacters("; rm -rf")).toBe(true);
			expect(containsShellMetacharacters("$(whoami)")).toBe(true);
			expect(containsShellMetacharacters("`id`")).toBe(true);
			expect(containsShellMetacharacters("a | b")).toBe(true);
			expect(containsShellMetacharacters("a & b")).toBe(true);
		});

		it("returns false for safe strings", () => {
			expect(containsShellMetacharacters("normal text")).toBe(false);
			expect(containsShellMetacharacters("file.txt")).toBe(false);
			expect(containsShellMetacharacters("src/components")).toBe(false);
		});
	});

	describe("containsPathTraversal", () => {
		it("returns true for traversal patterns", () => {
			expect(containsPathTraversal("../file")).toBe(true);
			expect(containsPathTraversal("foo/../bar")).toBe(true);
			expect(containsPathTraversal("..\\windows")).toBe(true);
		});

		it("returns true for null bytes", () => {
			expect(containsPathTraversal("file\x00.txt")).toBe(true);
		});

		it("returns false for safe paths", () => {
			expect(containsPathTraversal("src/components")).toBe(false);
			expect(containsPathTraversal("file.ts")).toBe(false);
			// Note: "..." is not a traversal pattern
			expect(containsPathTraversal("foo...bar")).toBe(false);
		});
	});
});
