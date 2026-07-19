# Meeseeks

**Stop babysitting your coding agent.** Meeseeks runs any of **7 agent CLIs** — Claude Code,
OpenCode, Cursor, Codex, Qwen, Droid, or Copilot — on a task or PRD until it's done.
Sequentially, or **in parallel across isolated git worktrees** with AI-assisted merge-conflict
resolution. With **token & quota tracking** so it never quietly burns your budget.

It's the [ralph loop](https://ghuntley.com/ralph/) — agent in a loop until the work is
finished — but engine-agnostic, parallel, and cost-aware.

> ⚠️ **Personal project, use at your own risk.** Meeseeks runs agents fully autonomously with
> permission prompts disabled — they read, modify, and delete files and run shell commands
> without asking. Run it only on code you can afford to lose. No warranty (MIT, AS IS).

## Install

```bash
npm install -g meeseeks-loop
```

This installs the `meeseeks` command globally. To run from source, clone the repo and use `npm start` (see [CONTRIBUTING.md](../CONTRIBUTING.md)).

## Quick Start

From your project directory:

```bash
# Single task
meeseeks "add login button"

# Work through a task list
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

```bash
meeseeks --model sonnet "add feature"    # use sonnet with Claude
meeseeks --sonnet "add feature"          # shortcut for above
meeseeks --opencode --model opencode/glm-4.7-free "task"
```

### Engine-Specific Arguments

Pass additional arguments to the underlying engine CLI using `--` separator:

```bash
meeseeks --copilot "add feature" -- --allow-all-tools --stream on
meeseeks --claude "fix bug" -- --no-permissions-prompt
```

## Task Sources

**Markdown file** (default):
```bash
meeseeks --prd PRD.md
```

**Markdown folder** (for large projects):
```bash
meeseeks --prd ./prd/
```
Reads all `.md` files in the folder and aggregates tasks.

**YAML** (supports file hints):
```bash
meeseeks --yaml tasks.yaml
```

YAML tasks can include a `files` field to tell the agent which files to read first, reducing exploration overhead:

```yaml
tasks:
  - title: "Add JWT expiry validation"
    files:
      - src/middleware/auth.ts
      - src/types/user.ts
```

**GitHub Issues**:
```bash
meeseeks --github owner/repo
meeseeks --github owner/repo --github-label "ready"
```

## Parallel Execution

```bash
meeseeks --parallel                  # 3 agents default
meeseeks --parallel --max-parallel 5 # 5 agents
```

Each agent gets isolated worktree + branch. Without `--create-pr`: auto-merges back with AI conflict resolution. With `--create-pr`: keeps branches, creates PRs. With `--no-merge`: keeps branches without merging.

### Sandbox Mode and Parallel Reliability

For large repos with big `node_modules` or dependency directories, use sandbox mode instead of git worktrees:

```bash
meeseeks --parallel --sandbox
```

Sandboxes are faster because they:
- **Symlink** read-only dependencies (`node_modules`, `.git`, `vendor`, `.venv`, etc.)
- **Copy** only source files that agents might modify

This avoids duplicating gigabytes of dependencies across worktrees. Changes are synced back to the original directory after each task completes.

**Parallel execution reliability:**
- If worktree operations fail (e.g., nested worktree repos), meeseeks falls back to sandbox mode automatically
- Retryable rate-limit or quota errors are detected and deferred for later retry
- Local changes are stashed before the merge phase and restored after
- Agents should not modify PRD files, `.meeseeks/progress.txt`, `.meeseeks-worktrees`, or `.meeseeks-sandboxes`

## Branch Workflow

```bash
meeseeks --branch-per-task                # branch per task
meeseeks --branch-per-task --create-pr    # + create PRs
meeseeks --branch-per-task --draft-pr     # + draft PRs
```

## Browser Automation

Meeseeks supports browser automation via [agent-browser](https://agent-browser.dev) for testing web UIs.

```bash
meeseeks "add login form" --browser    # enable browser automation
meeseeks "fix checkout" --no-browser   # disable browser automation
```

When enabled (and agent-browser is installed), the AI can:
- Open URLs and navigate pages
- Click elements and fill forms
- Take screenshots for verification
- Test web UI changes after implementation

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
| `--base-branch BRANCH` | base branch for PRs |
| `--create-pr` | create PRs |
| `--draft-pr` | draft PRs |
| `--no-tests` | skip tests |
| `--no-lint` | skip lint |
| `--fast` | skip tests + lint |
| `--no-commit` | don't auto-commit |
| `--browser` | enable browser automation |
| `--no-browser` | disable browser automation |
| `--max-iterations N` | stop after N tasks |
| `--max-retries N` | retries per task (default: 3) |
| `--retry-delay N` | delay between retries in seconds (default: 5) |
| `--dry-run` | preview only |
| `-v, --verbose` | debug output |
| `--init` | setup .meeseeks/ config |
| `--config` | show config |
| `--add-rule "rule"` | add rule to config |

## Webhook Notifications

Get notified when sessions complete via Discord, Slack, or custom webhooks.

Configure in `.meeseeks/config.yaml`:
```yaml
notifications:
  discord_webhook: "https://discord.com/api/webhooks/..."
  slack_webhook: "https://hooks.slack.com/services/..."
  custom_webhook: "https://your-api.com/webhook"
```

## Context Guide

Meeseeks automatically instructs agents to maintain a `.meeseeks/contextguide.md` file. After each task, the agent appends notes about which files were modified, key decisions, and useful context for the next agent.

This reduces token waste by giving subsequent agents a warm start — they read the context guide instead of re-exploring the same directories.

The context guide is cumulative and grows across the session. It is automatically injected into every prompt.

## Requirements

- Node.js 18+
- AI CLI: [Claude Code](https://github.com/anthropics/claude-code), [OpenCode](https://opencode.ai/docs/), [Cursor](https://cursor.com), Codex, Qwen-Code, [Factory Droid](https://docs.factory.ai/cli/getting-started/quickstart), or [GitHub Copilot](https://docs.github.com/en/copilot)
- `gh` (optional, for GitHub issues / `--create-pr`)

## Links

- [GitHub](https://github.com/saman-ns/meeseeks-loop)
- [Discord](https://discord.gg/SZZV74mCuV)

## License

MIT
