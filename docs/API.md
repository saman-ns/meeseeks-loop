# API Documentation

> CLI interface, configuration schemas, and data models.

## CLI Interface

### Base Command

```bash
meeseeks [options] [task]
```

### Single Task Mode

```bash
# Execute single task
meeseeks "task description"

# With specific engine
meeseeks --opencode "task description"

# With model override
meeseeks --model sonnet "task description"
meeseeks --sonnet "task description"  # shortcut
```

### PRD Mode

```bash
# Use default PRD.md
meeseeks

# Specify PRD file
meeseeks --prd tasks.md

# Use YAML file
meeseeks --yaml tasks.yaml

# Use Markdown folder
meeseeks --prd ./prd/

# Use GitHub Issues
meeseeks --github owner/repo
meeseeks --github owner/repo --github-label "ready"
```

## CLI Options Reference

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--prd PATH` | string | PRD.md | Task file or folder |
| `--yaml FILE` | string | - | YAML task file |
| `--github REPO` | string | - | GitHub repository (owner/repo) |
| `--github-label TAG` | string | - | Filter issues by label |
| `--model NAME` | string | - | Override model for any engine |
| `--sonnet` | boolean | false | Shortcut for --claude --model sonnet |
| `--claude` | boolean | true | Use Claude Code engine |
| `--opencode` | boolean | false | Use OpenCode engine |
| `--cursor` | boolean | false | Use Cursor engine |
| `--codex` | boolean | false | Use Codex engine |
| `--qwen` | boolean | false | Use Qwen-Code engine |
| `--droid` | boolean | false | Use Factory Droid engine |
| `--copilot` | boolean | false | Use GitHub Copilot engine |
| `--parallel` | boolean | false | Enable parallel execution |
| `--max-parallel N` | number | 3 | Maximum parallel agents |
| `--sandbox` | boolean | false | Use sandboxes instead of worktrees |
| `--no-merge` | boolean | false | Skip auto-merge in parallel mode |
| `--branch-per-task` | boolean | false | Create branch per task |
| `--base-branch NAME` | string | current | Base branch for branching |
| `--create-pr` | boolean | false | Create pull requests |
| `--draft-pr` | boolean | false | Create draft pull requests |
| `--no-tests` | boolean | false | Skip test execution |
| `--no-lint` | boolean | false | Skip linting |
| `--fast` | boolean | false | Skip tests + lint |
| `--no-commit` | boolean | false | Don't auto-commit changes |
| `--max-iterations N` | number | ∞ | Stop after N tasks |
| `--max-retries N` | number | 3 | Retries per task on failure |
| `--retry-delay N` | number | 5 | Seconds between retries |
| `--dry-run` | boolean | false | Preview without execution |
| `--browser` | boolean | auto | Enable browser automation |
| `--no-browser` | boolean | false | Disable browser automation |
| `--interactive` | boolean | false | Prompt before each task |
| `--optimize-tokens` | boolean | false | Pre-check/generate optimization files |
| `--quota-interval N` | number | 5 | Check quota every N tasks |
| `-v, --verbose` | boolean | false | Enable debug output |
| `--init` | boolean | false | Setup .meeseeks/ config |
| `--config` | boolean | false | Show current config |
| `--add-rule "rule"` | string | - | Add rule to config |

## Configuration Schema

### config.yaml Structure

```yaml
project:
  name: string
  language: string
  framework: string

commands:
  test: string
  lint: string
  build: string

rules:
  - string

boundaries:
  never_touch:
    - string

capabilities:
  browser: "auto" | "true" | "false"

notifications:
  discord_webhook: string
  slack_webhook: string
  custom_webhook: string
```

### Zod Schema (TypeScript)

From `cli/src/config/types.ts`:

```typescript
export const MeeseeksConfigSchema = z.object({
  project: z.object({
    name: z.string(),
    language: z.string().optional(),
    framework: z.string().optional(),
  }),
  commands: z.object({
    test: z.string().optional(),
    lint: z.string().optional(),
    build: z.string().optional(),
  }).optional(),
  rules: z.array(z.string()).optional(),
  boundaries: z.object({
    never_touch: z.array(z.string()).optional(),
  }).optional(),
  capabilities: z.object({
    browser: z.enum(["auto", "true", "false"]).optional(),
  }).optional(),
  notifications: z.object({
    discord_webhook: z.string().optional(),
    slack_webhook: z.string().optional(),
    custom_webhook: z.string().optional(),
  }).optional(),
});

export type MeeseeksConfig = z.infer<typeof MeeseeksConfigSchema>;
```

## Task Source Formats

### Markdown Format

```markdown
## Tasks
- [ ] uncompleted task
- [x] completed task (skipped)
- [ ] another pending task
```

### YAML Format

```yaml
tasks:
  - title: "Task description"
    completed: false
    parallel_group: 1
    files:
      - src/file1.ts
      - src/file2.ts
  - title: "Another task"
    completed: false
    parallel_group: 1
  - title: "Sequential task"
    completed: false
    parallel_group: 2
```

### YAML Task Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | yes | Task description |
| `completed` | boolean | no | Completion status (default: false) |
| `parallel_group` | number | no | Parallel execution group |
| `files` | string[] | no | File hints for agent |

## Data Models

### RuntimeOptions

```typescript
interface RuntimeOptions {
  task?: string;
  prdFile?: string;
  yamlFile?: string;
  githubRepo?: string;
  githubLabel?: string;
  engine: 'claude' | 'opencode' | 'cursor' | 'codex' | 'qwen' | 'droid' | 'copilot';
  model?: string;
  parallel: boolean;
  maxParallel: number;
  sandbox: boolean;
  noMerge: boolean;
  branchPerTask: boolean;
  baseBranch?: string;
  createPR: boolean;
  draftPR: boolean;
  noTests: boolean;
  noLint: boolean;
  noCommit: boolean;
  maxIterations?: number;
  maxRetries: number;
  retryDelay: number;
  dryRun: boolean;
  browser: 'auto' | 'true' | 'false';
  interactive: boolean;
  optimizeTokens: boolean;
  quotaInterval: number;
  verbose: boolean;
  engineArgs?: string[];
}
```

### AIResult

```typescript
interface AIResult {
  success: boolean;
  tokensIn?: number;
  tokensOut?: number;
  cost?: number;
  duration?: number;
  error?: string;
  output?: string;
}
```

### EngineOptions

```typescript
interface EngineOptions {
  task: string;
  workingDir?: string;
  verbose?: boolean;
  model?: string;
  additionalArgs?: string[];
}
```

### TaskInfo

```typescript
interface TaskInfo {
  title: string;
  completed: boolean;
  parallelGroup?: number;
  files?: string[];
}
```

## Engine-Specific Arguments

### Passing Additional Arguments

Use `--` separator to pass arguments directly to engine CLI:

```bash
# Claude Code specific
meeseeks --claude "task" -- --no-permissions-prompt

# Copilot specific
meeseeks --copilot "task" -- --allow-all-tools --stream on

# Any engine
meeseeks --opencode "task" -- --custom-flag value
```

## Stream JSON Output Format

Engines that support stream-json output:

```json
{
  "type": "token",
  "content": "...",
  "tokens_in": 1234,
  "tokens_out": 567,
  "max_tokens_in": 5000,
  "max_tokens_out": 2000
}
```

## File Locations

| File | Location | Purpose |
|------|----------|---------|
| Config | `.meeseeks/config.yaml` | Project configuration |
| Progress | `.meeseeks/progress.txt` | Task completion tracking |
| Context Guide | `.meeseeks/contextguide.md` | Cross-task memory |
| Binaries | `cli/dist/` | Compiled executables |
| Examples | `cli/examples/` | Example PRD files |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Task execution failed |
| 2 | Configuration error |
| 3 | Engine not found |
| 4 | Invalid arguments |
| 5 | Quota/rate limit error |

## Browser Automation Commands

When browser automation is enabled, agents can use:

```bash
# Navigate to URL
agent-browser open <url>

# Get element references
agent-browser snapshot

# Click element
agent-browser click @e1

# Type into input
agent-browser type @e1 "text"

# Capture screenshot
agent-browser screenshot <file>
```

## Webhook Payload Format

```json
{
  "project": "project-name",
  "status": "completed" | "failed",
  "tasks_completed": 5,
  "tasks_failed": 1,
  "duration": "15m 30s",
  "timestamp": "2024-01-15T10:30:00Z"
}
```
