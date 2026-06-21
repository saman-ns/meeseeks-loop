# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Package manager distribution (Homebrew)
- Automated npm publishing on git tags

---

## [5.1.0] - 2024-12

### Features
- Default command now auto-detects PRD files (PRD.md → PRD.yaml)
- Token optimization enabled by default when running with no args

### Removed
- Removed the legacy bash script implementation; the CLI is now Node.js/TypeScript only

---

## [5.0.0] - 2024-11

### Added
- **Interactive mode**: `--interactive` prompts before each task with Y/n/skip/auto/quit controls
- **Token optimization**: `--optimize-tokens` pre-checks or generates CLAUDE.md, .claudeignore, and enhanced config for any repo
- **Token tracking**: Per-task and cumulative token usage display after every task
- **Quota monitoring**: `--quota-interval N` checks Anthropic API quota every N tasks
- **Reusable optimization skill**: Standalone `meeseeks --optimize-tokens` analyzes any repo and generates agent optimization files

---

## [4.5.3] - 2024-10

### Added
- Error output: Include CLI output snippet for failed engine commands
- Retry handling: Detect rate-limit/quota errors and stop early

### Changed
- Parallel reliability: Fallback to sandbox mode on worktree errors
- Merge safety: Stash local changes before merge phase and restore after

### Fixed
- Prompts: Explicitly avoid PRD and `.meeseeks` progress/sandbox/worktree edits

---

## [4.5.0] - 2024-09

### Added
- **Sandbox mode**: Lightweight isolation using symlinks for dependencies (faster than worktrees)
- **Webhook notifications**: Discord, Slack, and custom webhooks for session completion (configure in `.meeseeks/config.yaml`)
- **Engine-specific arguments**: Pass arguments to underlying CLI via `--` separator
- **Performance improvements**: Task caching, parallel merge analysis, smart branch ordering

### Changed
- Windows improvements: Better error handling for .cmd wrappers

---

## [4.4.1] - 2024-08

### Fixed
- Windows line ending handling fixes
- Windows Bun command resolution fixes

---

## [4.4.0] - 2024-08

### Added
- GitHub Copilot CLI support (`--copilot`)

---

## [4.3.0] - 2024-07

### Added
- Model override: `--model <name>` flag to override model for any engine
- `--sonnet` shortcut for `--claude --model sonnet`
- `--no-merge` flag to skip auto-merge in parallel mode
- AI-assisted merge conflict resolution during parallel auto-merge
- Root user detection: Error for Claude/Cursor, warning for other engines
- Improved OpenCode error handling and model override support

---

## [4.2.0] - 2024-06

### Added
- Browser automation: `--browser` / `--no-browser` with [agent-browser](https://agent-browser.dev)
- Auto-detects agent-browser when available
- Config option: `capabilities.browser` in `.meeseeks/config.yaml`

---

## [4.1.0] - 2024-05

### Added
- **TypeScript CLI**: `npm install -g meeseeks-loop`
- Cross-platform binaries (macOS, Linux, Windows)
- No dependencies on jq/yq/bc for npm version

---

## [4.0.0] - 2024-04

### Added
- **Single-task mode**: `meeseeks "task"` without PRD
- **Project config**: `--init` creates `.meeseeks/` with rules + auto-detection
- New flags: `--config`, `--add-rule`, `--no-commit`

### Changed
- Major API changes for configuration system

---

## [3.3.0] - 2024-03

### Added
- Factory Droid support (`--droid`)

---

## [3.2.0] - 2024-03

### Added
- Qwen-Code support (`--qwen`)

---

## [3.1.0] - 2024-02

### Added
- Cursor support (`--cursor`)
- Better task verification

---

## [3.0.0] - 2024-02

### Added
- **Parallel execution** with worktrees
- **Branch-per-task** + auto-PR
- **YAML + GitHub Issues** task sources
- **Parallel groups** in YAML

### Changed
- Major refactoring of execution engine

---

## [2.0.0] - 2024-01

### Added
- OpenCode support (`--opencode`)
- Retry logic with `--max-retries` and `--retry-delay`
- `--max-iterations` flag
- `--dry-run` mode

---

## [1.0.0] - 2024-01

### Added
- Initial release
- Claude Code integration
- Basic PRD execution
- Markdown task format
- Sequential task processing

---

## Session Summaries

### Session: 2024-11 - Token Optimization Focus
**Focus**: Reduce token waste, add cost controls

**Completed**:
- Interactive mode with Y/n/skip/auto/quit prompts
- Token optimization pre-check and generation
- Per-task and session token tracking
- Quota monitoring with configurable interval
- CLAUDE.md, .claudeignore auto-generation

**Next Steps**:
- Add automated test suite
- Implement CI/CD pipeline
- Performance benchmarking

---

### Session: 2024-09 - Performance & Notifications
**Focus**: Improve parallel execution performance and add notifications

**Completed**:
- Sandbox mode using symlinks (faster than worktrees)
- Webhook notifications (Discord, Slack, custom)
- Engine-specific argument passing
- Parallel merge optimizations

**Next Steps**:
- Token optimization features
- Interactive mode

---

### Session: 2024-05 - TypeScript Migration
**Focus**: Migrate from bash to TypeScript for better cross-platform support

**Completed**:
- Full TypeScript rewrite
- npm package distribution
- Cross-platform binary builds
- Bun and Node.js runtime support

**Next Steps**:
- Add more AI engine support
- Improve parallel execution reliability

---

### Session: 2024-02 - Parallel Execution
**Focus**: Add parallel task execution capabilities

**Completed**:
- Git worktree-based isolation
- Parallel execution with configurable agent count
- Branch-per-task workflow
- Auto-PR creation
- YAML and GitHub Issues task sources

**Next Steps**:
- Add browser automation support
- Improve merge conflict handling

---

### Session: 2024-01 - Initial Development
**Focus**: Create MVP autonomous AI coding loop

**Completed**:
- Claude Code integration
- PRD markdown parsing
- Sequential task execution
- Basic error handling and retries

**Next Steps**:
- Add parallel execution
- Support more AI engines
- Add configuration system
