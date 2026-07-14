# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Is Meeseeks

Autonomous AI coding loop CLI. Takes a task or PRD file, runs AI agents (Claude Code, OpenCode, Cursor, Codex, Qwen, Droid, Copilot) on each task sequentially or in parallel until done. Written in TypeScript, runs on Node.js 18+.

## Repository Structure

- `cli/` — Main TypeScript CLI source code
- `docs/` — Architecture, API, testing documentation

## Commands

Development (from `cli/`):
```bash
npm start                      # Run Meeseeks (src/index.ts via tsx)
npm run check                  # Lint + format (Biome)
npm test                       # Run tests (Vitest)
npm run test:watch             # Watch mode
```

Run Meeseeks on any project:
```bash
cd /path/to/your/project

# Option 1: Use wrapper script (recommended)
/path/to/meeseeks/meeseeks "single task"
/path/to/meeseeks/meeseeks --yaml PRD.yaml

# Option 2: Direct execution
tsx /path/to/meeseeks/cli/src/index.ts "single task"
node /path/to/meeseeks/cli/src/index.ts "single task"  # if built

# Option 3: Create alias in ~/.bashrc or ~/.zshrc
alias meeseeks="/path/to/meeseeks/meeseeks"
meeseeks "single task"
```

## Architecture

All source is in `cli/src/`. Entry point: `index.ts` → `parseArgs()` → routes to command handlers.

### Execution Flow

1. **CLI** (`cli/args.ts`) — Commander.js parses 35+ flags into `RuntimeOptions`
2. **Commands** (`cli/commands/`) — `runInit`, `showConfig`, `addRule`, `runTask` (single), `runLoop` (PRD)
3. **Config** (`config/`) — Loads `.meeseeks/config.yaml` (Zod-validated), auto-detects language/framework (`detector.ts`), writes progress to `.meeseeks/progress.txt`
4. **Prompt** (`execution/prompt.ts`) — `buildPrompt()` assembles: project context → context guide → rules → boundaries → agent skills → browser instructions → file hints → task → step instructions
5. **Engine** (`engines/`) — Spawns the chosen AI CLI as a subprocess, parses `stream-json` output for tokens/errors/progress
6. **Task Sources** (`tasks/`) — Reads tasks from Markdown, YAML, GitHub Issues, or folder of `.md` files

### Key Modules

| Module | Purpose |
|--------|---------|
| `engines/base.ts` | `BaseAIEngine`, `execCommand`, `execCommandStreaming`, `parseStreamJsonResult` |
| `engines/claude.ts` | Claude Code engine — uses `--dangerously-skip-permissions --output-format stream-json` |
| `execution/sequential.ts` | Main loop: get task → build prompt → execute engine → track tokens → retry on failure |
| `execution/parallel.ts` | Multi-agent: worktree/sandbox isolation, parallel groups, AI merge conflict resolution |
| `execution/sandbox.ts` | Lightweight isolation via symlinks (avoids duplicating node_modules) |
| `execution/prompt.ts` | `buildPrompt()` and `buildParallelPrompt()` — assembles full agent prompt |
| `config/types.ts` | `MeeseeksConfigSchema` (Zod), `RuntimeOptions`, `DEFAULT_OPTIONS` |
| `tasks/index.ts` | `createTaskSource()` factory |

### Engine Pattern

All engines extend `BaseAIEngine` and implement `execute()` + optional `executeStreaming()`. The base provides subprocess spawning and Windows `.cmd` wrapper compatibility. Stream-json output is parsed by `parseStreamJsonResult()` which tracks max token counts.

## Code Style

- **Formatter**: Biome — tabs, 100-char line width
- **TypeScript**: ES2022 target, strict mode
- **Imports**: Use `.ts` extensions in import paths
- **Validation**: Zod schemas for config; runtime types via `z.infer<>`
- **Platform**: Check `process.platform === "win32"` for cross-platform support
