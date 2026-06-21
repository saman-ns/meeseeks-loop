# Meeseeks

[![npm version](https://img.shields.io/npm/v/meeseeks-loop.svg)](https://www.npmjs.com/package/meeseeks-loop)
[![CI](https://github.com/saman-ns/tool-meeseeks/actions/workflows/ci.yml/badge.svg)](https://github.com/saman-ns/tool-meeseeks/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> ⚠️ **Personal project — use at your own risk.** I built Meeseeks for my own use and am
> sharing it as-is, for free, with **no warranty and no support**. It is an **autonomous**
> tool: it runs AI agents that read, modify, and delete files and execute shell commands on
> your system **without asking for confirmation**. You alone are responsible for what it
> does on your machine. Read the code, run it only on code you can afford to lose (ideally a
> clean, committed git branch), and never against production or as root. By using it you
> accept the MIT license's "AS IS", no-warranty terms in full. See the **Security** section
> below before running anything.

**[Join our Discord](https://discord.gg/SZZV74mCuV)** - Questions? Want to contribute? Join the community!

![Meeseeks](assets/meeseeks.jpeg)

Autonomous AI coding loop. Runs AI agents on tasks until done.

## Install

```bash
npm install -g meeseeks-loop
```

This installs the `meeseeks` command globally. To run from source instead, see [CONTRIBUTING.md](CONTRIBUTING.md).

## ⚠️ Security: how Meeseeks runs agents

Meeseeks runs AI agents **fully autonomously with permission prompts disabled**
(`--dangerously-skip-permissions`, `--approval-mode yolo`, and equivalents). Agents can
read, modify, and delete any file your shell can reach, run shell commands, and perform
git operations (commit, push) — all without asking. Treat any task, PRD, or GitHub issue
text as code that will be executed verbatim. Only run Meeseeks:

- on code you can afford to have changed — ideally a clean, committed git branch,
- with tasks and task sources you trust,
- never as root.

Use `--interactive` to approve each task before it runs, `--dry-run` to preview, and
`boundaries.never_touch` in `.meeseeks/config.yaml` to protect sensitive paths.
See [docs/SECURITY.md](docs/SECURITY.md) for the full threat model.

## Quickstart

Run from your project directory:
```bash
cd /path/to/your/project
meeseeks "add login button"
meeseeks --prd PRD.md
```

## Two Modes

**Single task** - just tell it what to do:
```bash
meeseeks "add dark mode"
meeseeks "fix the auth bug"
```

**Task list** - work through a PRD:
```bash
meeseeks              # uses PRD.md
meeseeks --prd tasks.md
```

## Project Config

Optional. Stores rules the AI must follow.

```bash
meeseeks --init              # auto-detects project settings
meeseeks --config            # view config
meeseeks --add-rule "use TypeScript strict mode"
```

Creates `.meeseeks/config.yaml`:
```yaml
project:
  name: "my-app"
  language: "TypeScript"
  framework: "Next.js"

commands:
  test: "npm test"
  lint: "npm run lint"
  build: "npm run build"

rules:
  - "use server actions not API routes"
  - "follow error pattern in src/utils/errors.ts"

boundaries:
  never_touch:
    - "src/legacy/**"
    - "*.lock"
```

Rules apply to all tasks (single or PRD).

## AI Engines

```bash
meeseeks              # Claude Code (default)
meeseeks --opencode   # OpenCode
meeseeks --cursor     # Cursor
meeseeks --codex      # Codex
meeseeks --qwen       # Qwen-Code
meeseeks --droid      # Factory Droid
meeseeks --copilot    # GitHub Copilot
```

### Model Override

Override the default model for any engine:

```bash
meeseeks --model sonnet "add feature"                    # use sonnet with Claude
meeseeks --sonnet "add feature"                          # shortcut for above
meeseeks --opencode --model opencode/glm-4.7-free "task" # custom OpenCode model
meeseeks --qwen --model qwen-max "build api"             # custom Qwen model
```

### Engine-Specific Arguments

Pass additional arguments to the underlying engine CLI using `--` separator:

```bash
# Pass copilot-specific arguments
meeseeks --copilot --model "claude-opus-4.5" --prd PRD.md -- --allow-all-tools --allow-all-urls --stream on

# Pass claude-specific arguments
meeseeks --claude "add feature" -- --no-permissions-prompt

# Works with any engine
meeseeks --cursor "fix bug" -- --custom-arg value
```

Everything after `--` is passed directly to the engine CLI without interpretation.

### Engine Details

| Engine | CLI | Permissions | Output |
|--------|-----|-------------|--------|
| Claude | `claude` | `--dangerously-skip-permissions` | tokens + cost |
| OpenCode | `opencode` | `full-auto` | tokens + cost |
| Codex | `codex` | N/A | tokens |
| Cursor | `agent` | `--force` | duration |
| Qwen | `qwen` | `--approval-mode yolo` | tokens |
| Droid | `droid exec` | `--auto medium` | duration |
| Copilot | `copilot` | `-p` flag | duration |

When an engine exits non-zero, meeseeks includes the last lines of CLI output in the error message to make debugging easier.

## Task Sources

**Markdown file** (default):
```bash
meeseeks --prd PRD.md
```
```markdown
## Tasks
- [ ] create auth
- [ ] add dashboard
- [x] done task (skipped)
```

**Markdown folder** (for large projects):
```bash
meeseeks --prd ./prd/
```
When pointing to a folder, Meeseeks reads all `.md` files and aggregates tasks:
```
prd/
  backend.md      # - [ ] create user API
  frontend.md     # - [ ] add login page
  infra.md        # - [ ] setup CI/CD
```
Tasks are tracked per-file so completion updates the correct file.

**YAML**:
```bash
meeseeks --yaml tasks.yaml
```
```yaml
tasks:
  - title: create auth
    completed: false
  - title: add dashboard
    completed: false
```

**GitHub Issues**:
```bash
meeseeks --github owner/repo
meeseeks --github owner/repo --github-label "ready"
```

## Features

### Token-Optimized Autonomous Loop

Meeseeks adds cost control and human oversight to the autonomous loop: review tasks before execution and track token spend in real time.

### Interactive Mode (`--interactive`)

Review and approve each task before the agent executes it. Prevents wasted tokens on misaligned work.

```bash
meeseeks --interactive --yaml PRD.yaml
```

Prompt before each task:
```
Task: Write tests for ProfileService
Proceed? [Y/n/s(kip)/a(uto)/q(uit)]
```

- **Y** or Enter — proceed with this task
- **n** or **s** — skip, move to next
- **a** — switch to auto mode (stop prompting)
- **q** — quit the loop

### Token Optimization Pre-Check (`--optimize-tokens`)

Ensures your repo is set up for minimal token waste before the loop starts. Checks for `CLAUDE.md`, `.claudeignore`, and `.meeseeks/config.yaml`. If any are missing, warns you or generates them.

```bash
# Pre-check before running tasks
meeseeks --optimize-tokens --yaml PRD.yaml

# Standalone: analyze repo and generate optimization files
meeseeks --optimize-tokens
```

**What it generates:**
- **`CLAUDE.md`** — project architecture, test patterns, key files. Read by Claude Code at startup so agents don't waste tokens re-discovering your project.
- **`.claudeignore`** — excludes docs, build artifacts, generated files, lock files from agent exploration.
- **Enhanced `.meeseeks/config.yaml`** — adds rules derived from existing code patterns.

### Token & Quota Tracking

Every task logs token usage. Periodic Anthropic API quota checks (default: every 5 tasks) so you know when you're running low.

```bash
meeseeks --quota-interval 10 --yaml PRD.yaml
```

Output after each task:
```
[TOKENS] Task: 12,345 in / 4,567 out | Session total: 45,678 in / 12,345 out
[QUOTA] Tokens remaining: ~500,000 (checked after task 5)
```

### Context Guide (Cross-Task Memory)

Agents automatically maintain `.meeseeks/contextguide.md` — a living document updated after each task with files modified, decisions made, and notes for the next agent. This gives subsequent agents a warm start instead of re-exploring the codebase from scratch.

The context guide is injected into every prompt automatically. No flags needed.

### File Hints (YAML tasks)

YAML task files can include a `files` field per task to tell the agent which files to read first:

```yaml
tasks:
  - title: "Add JWT expiry validation"
    files:
      - src/middleware/auth.ts
      - src/types/user.ts
```

This reduces output tokens by cutting exploration tool calls — the agent goes straight to the relevant files instead of searching.

### Parallel Execution

```bash
meeseeks --parallel                  # 3 agents default
meeseeks --parallel --max-parallel 5 # 5 agents
```

Each agent gets isolated worktree + branch:
```
Agent 1 → /tmp/xxx/agent-1 → meeseeks/agent-1-create-auth
Agent 2 → /tmp/xxx/agent-2 → meeseeks/agent-2-add-dashboard
Agent 3 → /tmp/xxx/agent-3 → meeseeks/agent-3-build-api
```

Without `--create-pr`: auto-merges back to base branch, AI resolves conflicts.
With `--create-pr`: keeps branches, creates PRs.
With `--no-merge`: keeps branches without merging or creating PRs.

**YAML parallel groups** - control execution order:
```yaml
tasks:
  - title: Create User model
    parallel_group: 1
  - title: Create Post model
    parallel_group: 1  # same group = runs together
  - title: Add relationships
    parallel_group: 2  # runs after group 1
```

### Branch Workflow

```bash
meeseeks --branch-per-task                # branch per task
meeseeks --branch-per-task --create-pr    # + create PRs
meeseeks --branch-per-task --draft-pr     # + draft PRs
meeseeks --base-branch main               # branch from main
```

Branch naming: `meeseeks/<task-slug>`

### Browser Automation

Meeseeks can use [agent-browser](https://agent-browser.dev) to automate browser interactions during tasks.

```bash
meeseeks "test the login flow" --browser    # force enable
meeseeks "add checkout" --no-browser        # force disable
meeseeks "build feature"                    # auto-detect (default)
```

When enabled, the AI gets browser commands:
- `agent-browser open <url>` - navigate to URL
- `agent-browser snapshot` - get element refs (@e1, @e2)
- `agent-browser click @e1` - click element
- `agent-browser type @e1 "text"` - type into input
- `agent-browser screenshot <file>` - capture screenshot

**Use cases:**
- Testing UI after implementing features
- Verifying deployments
- Form filling and workflow testing

**Config** (`.meeseeks/config.yaml`):
```yaml
capabilities:
  browser: "auto"  # "auto", "true", or "false"
```

### Webhook Notifications

Get notified when sessions complete via Discord, Slack, or custom webhooks.

**Config** (`.meeseeks/config.yaml`):
```yaml
notifications:
  discord_webhook: "https://discord.com/api/webhooks/..."
  slack_webhook: "https://hooks.slack.com/services/..."
  custom_webhook: "https://your-api.com/webhook"
```

Notifications include task completion counts and status (completed/failed).

### Sandbox Mode

For large repos with big dependency directories, sandbox mode is faster than git worktrees:

```bash
meeseeks --parallel --sandbox
```

**How it works:**
- **Symlinks** read-only dependencies (`node_modules`, `.git`, `vendor`, `.venv`, `.pnpm-store`, `.yarn`, `.cache`)
- **Copies** source files that agents might modify (`src/`, `app/`, `lib/`, config files, etc.)

**Why use it:**
- Avoids duplicating gigabytes of `node_modules` across worktrees
- Much faster sandbox creation for large monorepos
- Changes sync back to original directory after each task

**When to use worktrees instead (default):**
- Need full git history access in each sandbox
- Running `git` commands that require a real repo
- Smaller repos where worktree overhead is minimal

**Parallel execution reliability:**
- If worktree operations fail (e.g., nested worktree repos), meeseeks falls back to sandbox mode automatically
- Retryable rate-limit or quota errors are detected and deferred for later retry
- Local changes are stashed before the merge phase and restored after
- Agents should not modify PRD files, `.meeseeks/progress.txt`, `.meeseeks-worktrees`, or `.meeseeks-sandboxes`

## Options

| Flag | What it does |
|------|--------------|
| `--prd PATH` | task file or folder (auto-detected, default: PRD.md) |
| `--yaml FILE` | YAML task file |
| `--github REPO` | use GitHub issues |
| `--github-label TAG` | filter issues by label |
| `--model NAME` | override model for any engine |
| `--sonnet` | shortcut for `--claude --model sonnet` |
| `--parallel` | run parallel |
| `--max-parallel N` | max agents (default: 3) |
| `--sandbox` | use lightweight sandboxes instead of git worktrees |
| `--no-merge` | skip auto-merge in parallel mode |
| `--branch-per-task` | branch per task |
| `--base-branch NAME` | base branch |
| `--create-pr` | create PRs |
| `--draft-pr` | draft PRs |
| `--no-tests` | skip tests |
| `--no-lint` | skip lint |
| `--fast` | skip tests + lint |
| `--no-commit` | don't auto-commit |
| `--max-iterations N` | stop after N tasks |
| `--max-retries N` | retries per task (default: 3) |
| `--retry-delay N` | seconds between retries |
| `--dry-run` | preview only |
| `--browser` | enable browser automation |
| `--no-browser` | disable browser automation |
| `--interactive` | prompt before each task (Y/n/s/a/q) |
| `--optimize-tokens` | pre-check or generate token optimization files |
| `--quota-interval N` | check API quota every N tasks (default: 5) |
| `-v, --verbose` | debug output |
| `--init` | setup .meeseeks/ config |
| `--config` | show config |
| `--add-rule "rule"` | add rule to config |

## Requirements

**Required:**
- AI CLI: [Claude Code](https://github.com/anthropics/claude-code), [OpenCode](https://opencode.ai/docs/), [Cursor](https://cursor.com), Codex, Qwen-Code, [Factory Droid](https://docs.factory.ai/cli/getting-started/quickstart), or [GitHub Copilot](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli)
- Node.js 18+

**Optional:**
- `gh` (for GitHub issues / `--create-pr`)
- [agent-browser](https://agent-browser.dev) (for `--browser`)

---

## Changelog

### v5.0.0
- **interactive mode**: `--interactive` prompts before each task with Y/n/skip/auto/quit controls
- **token optimization**: `--optimize-tokens` pre-checks or generates CLAUDE.md, .claudeignore, and enhanced config for any repo
- **token tracking**: per-task and cumulative token usage display after every task
- **quota monitoring**: `--quota-interval N` checks Anthropic API quota every N tasks
- **reusable optimization skill**: standalone `meeseeks --optimize-tokens` analyzes any repo and generates agent optimization files

### v4.5.3
- parallel reliability: fallback to sandbox mode on worktree errors
- error output: include CLI output snippet for failed engine commands
- retry handling: detect rate-limit/quota errors and stop early
- merge safety: stash local changes before merge phase and restore after
- prompts: explicitly avoid PRD and `.meeseeks` progress/sandbox/worktree edits

### v4.5.0
- **sandbox mode**: lightweight isolation using symlinks for dependencies (faster than worktrees)
- **performance improvements**: task caching, parallel merge analysis, smart branch ordering
- **webhook notifications**: Discord, Slack, and custom webhooks for session completion (configure in `.meeseeks/config.yaml`)
- **engine-specific arguments**: pass arguments to underlying CLI via `--` separator
- **Windows improvements**: better error handling for .cmd wrappers

### v4.4.1
- Windows line ending handling fixes
- Windows Bun command resolution fixes

### v4.4.0
- GitHub Copilot CLI support (`--copilot`)

### v4.3.0
- model override: `--model <name>` flag to override model for any engine
- `--sonnet` shortcut for `--claude --model sonnet`
- `--no-merge` flag to skip auto-merge in parallel mode
- AI-assisted merge conflict resolution during parallel auto-merge
- root user detection: error for Claude/Cursor, warning for other engines
- improved OpenCode error handling and model override support

### v4.2.0
- browser automation: `--browser` / `--no-browser` with [agent-browser](https://agent-browser.dev)
- auto-detects agent-browser when available
- config option: `capabilities.browser` in `.meeseeks/config.yaml`

### v4.1.0
- TypeScript CLI rewrite
- no dependencies on jq/yq/bc

### v4.0.0
- single-task mode: `meeseeks "task"` without PRD
- project config: `--init` creates `.meeseeks/` with rules + auto-detection
- new: `--config`, `--add-rule`, `--no-commit`

### v3.3.0
- Factory Droid support (`--droid`)

### v3.2.0
- Qwen-Code support (`--qwen`)

### v3.1.0
- Cursor support (`--cursor`)
- better task verification

### v3.0.0
- parallel execution with worktrees
- branch-per-task + auto-PR
- YAML + GitHub Issues sources
- parallel groups

### v2.0.0
- OpenCode support
- retry logic
- `--max-iterations`, `--dry-run`

### v1.0.0
- initial release

## Community

- [Discord](https://discord.gg/SZZV74mCuV)

## License

MIT
