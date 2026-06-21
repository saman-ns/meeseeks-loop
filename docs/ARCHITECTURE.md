# Architecture

> System design, tech stack, patterns, and code organization.

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Runtime | Node.js 18+ | Latest |
| Language | TypeScript | ES2022 |
| CLI Framework | Commander.js | Latest |
| Validation | Zod | Latest |
| Linter/Formatter | Biome | Latest |

## System Architecture

Meeseeks is an autonomous AI coding loop CLI that orchestrates AI agents (Claude Code, OpenCode, Cursor, Codex, Qwen, Droid, Copilot) to execute tasks sequentially or in parallel.

```
User Input (Task/PRD)
    ↓
CLI Args Parser (Commander.js)
    ↓
Config Loader (.meeseeks/config.yaml)
    ↓
Task Source (Markdown/YAML/GitHub)
    ↓
Prompt Builder (context + rules + task)
    ↓
AI Engine (subprocess spawn)
    ↓
Result Parser (stream-json)
    ↓
Progress Tracking (.meeseeks/progress.txt)
    ↓
Context Guide Update (.meeseeks/contextguide.md)
```

## Code Organization

All source code is located in `cli/src/`:

| Directory | Purpose |
|-----------|---------|
| `cli/src/` | Main source code directory |
| `cli/src/index.ts` | Entry point - routes to command handlers |
| `cli/src/args.ts` | CLI argument parsing (Commander.js) |
| `cli/src/commands/` | Command handlers (init, config, addRule, runTask, runLoop) |
| `cli/src/config/` | Config loading, validation (Zod), auto-detection |
| `cli/src/engines/` | AI engine implementations (Claude, OpenCode, Cursor, etc.) |
| `cli/src/execution/` | Task execution logic (sequential, parallel, sandbox) |
| `cli/src/tasks/` | Task source implementations (Markdown, YAML, GitHub) |
| `cli/src/skills/` | Reusable skills (token-optimize) |
| `cli/src/notifications/` | Webhook notifications (Discord, Slack) |
| `cli/src/bin.mjs` | Global-install entry shim (registers tsx, imports `index.ts`) |
| `cli/examples/` | Example PRD files |

## Execution Flow

### 1. CLI Argument Parsing
- `cli/args.ts` uses Commander.js to parse 35+ flags into `RuntimeOptions`
- Validates and normalizes inputs

### 2. Command Routing
Commands in `cli/commands/`:
- `runInit` - Creates `.meeseeks/config.yaml` with auto-detected settings
- `showConfig` - Displays current configuration
- `addRule` - Adds coding rules to config
- `runTask` - Executes single task
- `runLoop` - Processes PRD file with multiple tasks

### 3. Configuration Loading
`config/` module:
- Loads `.meeseeks/config.yaml` (Zod-validated schema)
- Auto-detects language/framework via `detector.ts`
- Writes progress to `.meeseeks/progress.txt`
- Maintains context guide in `.meeseeks/contextguide.md`

### 4. Prompt Building
`execution/prompt.ts` - `buildPrompt()` assembles:
1. Project context (from config)
2. Context guide (cross-task memory)
3. Coding rules (from config)
4. Boundaries (never touch files)
5. Agent skills/capabilities
6. Browser automation instructions (if enabled)
7. File hints (YAML tasks only)
8. Task description
9. Step instructions (including contextguide update)

### 5. Engine Execution
`engines/` module spawns AI CLI as subprocess:
- Parses `stream-json` output for tokens/errors/progress
- Tracks token usage and costs
- Handles retries on failure
- Detects rate-limit/quota errors

### 6. Task Source Processing
`tasks/` module reads tasks from:
- Markdown files (checkbox format)
- Markdown folders (multiple .md files)
- YAML files (structured tasks)
- GitHub Issues (with optional label filtering)

## Design Patterns

### Engine Pattern
All engines extend `BaseAIEngine` and implement:
- `execute()` - Main execution method
- `executeStreaming()` - Optional streaming support

The base class provides:
- `execCommand()` - Subprocess spawning via Node.js `spawn()`
- `execCommandStreaming()` - Streaming subprocess execution
- `parseStreamJsonResult()` - Parses stream-json output and tracks token counts
- `checkForErrors()` - Error detection in output
- `detectStepFromOutput()` - Progress tracking

**Why**: Consistent interface across all AI engines while allowing engine-specific customization.

**Example**: Claude engine uses `--dangerously-skip-permissions --output-format stream-json` flags.

### Factory Pattern
`tasks/index.ts` implements `createTaskSource()` factory that returns appropriate task source based on input type (file, folder, GitHub).

**Why**: Polymorphic task source handling without coupling to specific implementations.

### Builder Pattern
`execution/prompt.ts` uses builder pattern to construct prompts from multiple components.

**Why**: Complex prompt assembly with optional components (browser, file hints, etc.).

## Key Module Map

| Module | Purpose |
|--------|---------|
| `engines/base.ts` | `BaseAIEngine`, `execCommand`, `execCommandStreaming`, `parseStreamJsonResult`, `checkForErrors`, `detectStepFromOutput` |
| `engines/claude.ts` | Claude Code engine - uses `--dangerously-skip-permissions --output-format stream-json` |
| `engines/opencode.ts` | OpenCode engine - uses `full-auto` permission mode |
| `engines/cursor.ts` | Cursor engine - uses `--force` flag |
| `engines/codex.ts` | Codex engine implementation |
| `engines/qwen.ts` | Qwen-Code engine - uses `--approval-mode yolo` |
| `engines/droid.ts` | Factory Droid engine - uses `--auto medium` |
| `engines/copilot.ts` | GitHub Copilot engine - uses `-p` flag |
| `engines/types.ts` | `AIEngine` interface, `AIResult`, `EngineOptions` |
| `execution/sequential.ts` | Main loop: get task → build prompt → execute engine → track tokens → retry on failure |
| `execution/parallel.ts` | Multi-agent: worktree/sandbox isolation, parallel groups, AI merge conflict resolution |
| `execution/sandbox.ts` | Lightweight isolation via symlinks (avoids duplicating node_modules) |
| `execution/quota.ts` | Local cost estimation from token counts (Haiku/Sonnet/Opus pricing) |
| `execution/prompt.ts` | `buildPrompt()` and `buildParallelPrompt()` - assembles full agent prompt |
| `config/types.ts` | `MeeseeksConfigSchema` (Zod), `RuntimeOptions`, `DEFAULT_OPTIONS` |
| `config/detector.ts` | Auto-detects project language, framework, test/lint/build commands |
| `tasks/index.ts` | `createTaskSource()` factory |
| `skills/token-optimize.ts` | Generates CLAUDE.md, .claudeignore, enhanced config for target repos |
| `notifications/webhook.ts` | Discord, Slack, custom webhook notifications |

## Platform Compatibility

### Cross-Platform Support
- **Runtime**: Node.js 18+
- **Windows**: Special handling for `.cmd` wrappers
- **Line Endings**: Normalized handling for cross-platform compatibility

### Platform Detection
```typescript
// Check platform
process.platform === "win32"
```

## Code Style

- **Formatter**: Biome
- **Line Width**: 100 characters
- **Indentation**: Tabs
- **Lint Rules**: Biome recommended
- **TypeScript**: ES2022 target, strict mode
- **Imports**: Use `.ts` extensions in import paths
- **Validation**: Zod schemas for config; runtime types via `z.infer<>`

## Architectural Decisions

### Use Node.js Runtime (2024-01)
- **Context**: Need reliable execution and cross-platform support
- **Decision**: Use Node.js 18+ as runtime
- **Consequences**:
  - Broad compatibility across platforms
  - Consistent behavior
  - Bottleneck is AI API calls, not runtime speed

### Subprocess Spawning for AI Engines (2024-01)
- **Context**: Need to run multiple different AI CLIs
- **Decision**: Spawn AI CLIs as subprocesses and parse stream-json output
- **Consequences**:
  - Loose coupling - can support any AI CLI
  - Requires AI CLIs to be installed separately
  - Standard output parsing via stream-json format

### Git Worktrees for Parallel Execution (2024-03)
- **Context**: Need isolated environments for parallel agent execution
- **Decision**: Use git worktrees with fallback to sandbox mode (symlinks)
- **Consequences**:
  - Full git history access in each environment
  - Automatic branch isolation
  - Can be slow for large repos with big node_modules
  - Sandbox mode (symlinks) provides faster alternative

### Context Guide for Cross-Task Memory (2024-11)
- **Context**: Agents waste tokens re-exploring codebase
- **Decision**: Maintain `.meeseeks/contextguide.md` updated after each task
- **Consequences**:
  - Subsequent agents get warm start
  - Reduced exploration tokens
  - Living document grows over time
  - Injected into every prompt automatically
