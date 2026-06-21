# Security

> Authentication, authorization, encryption, and security policies.

## Overview

Meeseeks is a CLI tool that orchestrates AI agents to execute code changes. Security considerations primarily focus on:
- Safe execution of AI-generated commands
- Protection of sensitive credentials
- Secure subprocess spawning
- Prevention of unauthorized file access

## Authentication

**Method**: None (CLI tool, not a service)

Meeseeks itself does not implement authentication. However, it integrates with external services that require authentication:

### External Service Authentication

| Service | Auth Method | Configuration |
|---------|-------------|---------------|
| GitHub | `gh` CLI token | Managed by `gh auth login` |
| Anthropic API | API key | Managed by Claude Code CLI |
| OpenCode | API key | Managed by OpenCode CLI |
| Cursor | Session/token | Managed by Cursor CLI |
| Copilot | GitHub token | Managed by Copilot CLI |

## Authorization

**Model**: File system permissions + AI engine permissions

### AI Engine Permission Models

| Engine | Permission Flag | Description |
|--------|----------------|-------------|
| Claude Code | `--dangerously-skip-permissions` | Skips permission prompts (auto-approve) |
| OpenCode | `full-auto` | Full automation mode |
| Cursor | `--force` | Force execution without prompts |
| Qwen | `--approval-mode yolo` | Auto-approve all actions |
| Droid | `--auto medium` | Medium automation level |
| Copilot | `-p` | Prompt-based interaction |

**Security Note**: These flags bypass normal safety prompts. Only use Meeseeks in trusted environments with trusted tasks.

### File Boundaries

Config supports `boundaries.never_touch` to prevent AI agents from modifying certain files:

```yaml
boundaries:
  never_touch:
    - "src/legacy/**"
    - "*.lock"
    - ".env*"
    - "credentials.json"
```

## Data Protection

### Sensitive Files

Meeseeks does NOT automatically exclude sensitive files from AI agent access. Users must:

1. Use `.claudeignore` or engine-specific ignore files
2. Configure `boundaries.never_touch` in `.meeseeks/config.yaml`
3. Review tasks before execution in `--interactive` mode

### Recommended Exclusions

Always exclude from AI agent access:
- `.env`, `.env.local`, `.env.production`
- `credentials.json`, `secrets.yaml`
- `*.pem`, `*.key`, `*.crt`
- API keys, tokens, passwords
- Private SSH keys

### Token Optimization Safety

The `--optimize-tokens` skill generates `.claudeignore` which excludes common sensitive patterns:

```
.env*
**/secrets/**
**/*.key
**/*.pem
credentials.json
```

## Subprocess Security

### Command Execution

All AI engines are executed as subprocesses using Node.js `spawn()`.

**Security Considerations**:
- On POSIX systems, commands run directly via `spawn()` with `shell: false` — no shell interpretation
- Arguments are passed as arrays, not strings (prevents injection on POSIX)
- On Windows, subprocesses run through `cmd.exe` (`shell: true`) to resolve `.cmd` wrappers; on Windows, only pass engine arguments you trust

### Platform-Specific Handling

Windows `.cmd` wrappers are handled explicitly:
```typescript
// Windows: claude.cmd instead of claude
const command = process.platform === "win32" ? `${cmd}.cmd` : cmd;
```

## Git Security

### Worktree Isolation

Parallel execution uses git worktrees for isolation:
- Each agent gets isolated branch
- Changes are merged back to base branch
- Merge conflicts resolved by AI or user

**Security Note**: Agents have full git access in worktrees.

### Sandbox Mode

Sandbox mode uses symlinks for dependencies:
- Read-only symlinks to `node_modules`, `.git`, etc.
- Write-allowed copies of source files
- Changes synced back after task completion

**Security Note**: Symlinks point to original files - agents can potentially traverse if unrestricted.

## Webhook Security

### Webhook URLs

Webhook notifications support Discord, Slack, and custom webhooks:

```yaml
notifications:
  discord_webhook: "https://discord.com/api/webhooks/..."
  slack_webhook: "https://hooks.slack.com/services/..."
  custom_webhook: "https://your-api.com/webhook"
```

**Security Recommendations**:
- Store webhook URLs in environment variables
- Don't commit `.meeseeks/config.yaml` with webhook URLs to public repos
- Use webhook secrets/validation on receiving end
- Rotate webhook URLs if compromised

### Webhook Payload

Webhooks send non-sensitive project metadata:
- Project name
- Task counts (completed/failed)
- Duration
- Timestamp

**No sensitive data** (code, secrets, tokens) is included in webhook payloads.

## Root User Detection

Meeseeks detects root user execution and:
- **Errors** for Claude/Cursor engines (unsafe)
- **Warns** for other engines

```bash
# This will error
sudo meeseeks --claude "task"

# This will warn
sudo meeseeks --opencode "task"
```

## API Rate Limiting

### Quota Monitoring

`--quota-interval N` checks Anthropic API quota every N tasks:
- Prevents unexpected quota exhaustion
- Displays remaining tokens
- Helps manage costs

No security implications, but helps prevent service disruption.

## Security Checklist

- [ ] Review tasks before execution (`--interactive` mode)
- [ ] Configure `boundaries.never_touch` for sensitive files
- [ ] Use `.claudeignore` to exclude secrets
- [ ] Don't commit webhook URLs to public repos
- [ ] Run `--optimize-tokens` to generate secure defaults
- [ ] Don't run Meeseeks as root
- [ ] Review AI engine permissions (all use auto-approve modes)
- [ ] Use `--dry-run` to preview without execution
- [ ] Monitor quota usage (`--quota-interval`)
- [ ] Keep AI CLI tools updated

## Known Security Limitations

1. **No sandboxing**: AI agents have full file system access (limited by OS permissions)
2. **Auto-approve modes**: All engines bypass safety prompts for automation
3. **No secret scanning**: Meeseeks doesn't automatically detect/prevent secret commits
4. **Subprocess trust**: Assumes AI CLI tools are trustworthy
5. **No audit log**: No comprehensive logging of agent actions (use git history)
6. **Untrusted task input**: Task, PRD, GitHub-issue, and `contextguide.md` text is injected
   into agent prompts and effectively executed; only run trusted task sources
7. **Dependency advisory (`node-notifier` → `uuid`)**: a moderate advisory affects the
   optional desktop-notification path. It requires an attacker-controlled buffer argument
   that Meeseeks never supplies (notifications use fixed strings), so it is not exploitable
   in normal use. Tracked for a future dependency update.

## Compliance

| Standard | Status |
|----------|--------|
| SOC 2 | N/A (CLI tool) |
| GDPR | N/A (no user data collection) |
| PCI DSS | N/A (not a payment system) |

## Incident Response

If AI agents commit sensitive data:

1. **Immediately** stop Meeseeks execution
2. Remove sensitive data from git history:
   ```bash
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch path/to/sensitive/file" \
     --prune-empty --tag-name-filter cat -- --all
   ```
3. Rotate compromised credentials
4. Review `.claudeignore` and `boundaries.never_touch` configuration
5. Force push cleaned history (if not yet pushed to remote)

## Future Security Improvements

1. Built-in secret scanning before commits
2. Sandboxed execution environments
3. Audit logging of all agent actions
4. Permission prompts for sensitive operations
5. Integration with secret management tools (Vault, etc.)
6. Read-only mode for code review tasks
