# Testing

> Test strategies, commands, patterns, and QA checklists.

## Test Status

**Current State**: 91 passing tests across 6 test files (Vitest).

**Test files:**

| File | What it covers |
|------|----------------|
| `cli/src/utils/sanitize.test.ts` | Input sanitization — task titles, file paths, branch names, commit messages, engine args, shell metacharacter detection |
| `cli/src/execution/analytics.test.ts` | Analytics data persistence, rate-limit observation, session estimates, pruning of old records |
| `cli/src/execution/retry.test.ts` | Exponential backoff, jitter, `withRetry` wrapper, `isRetryableError` classification |
| `cli/src/tasks/cached-task-source.test.ts` | Task source caching, `withCache` wrapper, completion tracking |
| `cli/src/skills/prd-generator.test.ts` | PRD generation with mock AI engine |
| `cli/src/ui/wizard.test.ts` | Wizard type system validation (stub) |

## Test Types

| Type | Framework | Location |
|------|-----------|----------|
| Unit | Vitest | `cli/src/**/*.test.ts` (colocated with source) |
| Integration | Manual | N/A |
| E2E | Manual | N/A |

## Commands

```bash
cd cli/

# Run all tests
npm test

# Watch mode
npm run test:watch

# Lint + format check
npm run check
```

## Manual Testing Commands

### Single Task Execution
```bash
# Run single task from source
npx tsx cli/src/index.ts "single task description"

# Run with YAML PRD
npx tsx cli/src/index.ts --yaml PRD.yaml

# Test with single iteration (useful for testing)
npx tsx cli/src/index.ts --max-iterations 1 --yaml PRD.yaml
```

### Config Testing
```bash
# Initialize config
meeseeks --init

# View current config
meeseeks --config

# Add a rule
meeseeks --add-rule "use TypeScript strict mode"
```

### Engine Testing
```bash
# Test different engines
meeseeks "test task"                     # Claude Code (default)
meeseeks --opencode "test task"          # OpenCode
meeseeks --cursor "test task"            # Cursor
meeseeks --codex "test task"             # Codex
meeseeks --qwen "test task"              # Qwen-Code
meeseeks --droid "test task"             # Factory Droid
meeseeks --copilot "test task"           # GitHub Copilot
```

### Parallel Execution Testing
```bash
# Test parallel execution
meeseeks --parallel --max-iterations 3 --yaml PRD.yaml

# Test sandbox mode
meeseeks --parallel --sandbox --max-iterations 3 --yaml PRD.yaml

# Test branch-per-task
meeseeks --branch-per-task --max-iterations 2 --yaml PRD.yaml
```

### Token Optimization Testing
```bash
# Test token optimization
meeseeks --optimize-tokens

# Test interactive mode
meeseeks --interactive --yaml PRD.yaml

# Test quota monitoring
meeseeks --quota-interval 2 --yaml PRD.yaml
```

## Testing Patterns

### Engine Pattern Testing
When testing a new engine, verify:
1. Engine extends `BaseAIEngine`
2. Implements `execute()` method
3. Returns `AIResult` with tokens/duration
4. Handles errors gracefully
5. Parses stream-json output correctly

### Example Engine Test
```typescript
// Manual test approach
// 1. Create minimal task
// 2. Run with new engine
// 3. Verify output format
// 4. Check error handling
```

## Manual Testing Checklists

### Pre-Release Checklist
- [ ] Test single task execution
- [ ] Test PRD file execution
- [ ] Test all supported engines
- [ ] Test parallel execution
- [ ] Test sandbox mode
- [ ] Test branch-per-task workflow
- [ ] Test token optimization
- [ ] Test interactive mode
- [ ] Test config commands (init, show, add-rule)
- [ ] Test cross-platform (Windows, macOS, Linux)
- [ ] Test GitHub Issues task source
- [ ] Test YAML task source
- [ ] Test Markdown folder task source
- [ ] Verify build outputs (dist/ binaries)

### Engine-Specific Checklist
- [ ] Claude Code - verify `--dangerously-skip-permissions` flag
- [ ] OpenCode - verify `full-auto` mode
- [ ] Cursor - verify `--force` flag
- [ ] Qwen - verify `--approval-mode yolo`
- [ ] Droid - verify `--auto medium`
- [ ] Copilot - verify `-p` flag
- [ ] Codex - verify basic execution

### Parallel Execution Checklist
- [ ] Worktree creation
- [ ] Sandbox creation (symlinks)
- [ ] Branch isolation
- [ ] Auto-merge (without --no-merge)
- [ ] AI merge conflict resolution
- [ ] PR creation (with --create-pr)
- [ ] Draft PR creation (with --draft-pr)
- [ ] Parallel groups (YAML)

### Token Optimization Checklist
- [ ] CLAUDE.md generation
- [ ] .claudeignore generation
- [ ] Enhanced config generation
- [ ] Token tracking display
- [ ] Quota interval checks
- [ ] Interactive mode prompts (Y/n/s/a/q)

### Browser Automation Checklist
- [ ] Auto-detection of agent-browser
- [ ] Browser commands in prompt
- [ ] --browser flag forces enable
- [ ] --no-browser flag forces disable
- [ ] Config option respected

## QA Procedures

### Pre-Release
1. Run manual testing checklist
2. Test on all supported platforms (Windows, macOS, Linux)
3. Verify a clean global install from the packed tarball (`npm pack` → `npm i -g`)
4. Test with real-world PRD files
5. Check error messages are helpful
7. Verify token tracking accuracy

### Post-Release
1. Monitor Discord community for issues
2. Review GitHub issues
3. Check npm download stats
4. Verify installation works (`npm install -g meeseeks-loop`)
5. Test updated version on clean environment

## Coverage

Coverage reports are generated in `cli/coverage/` directory. No automated coverage target yet.

## Known Testing Gaps

1. No CI/CD pipeline for automated testing
2. No integration tests for engine execution (requires a real AI CLI)
3. No E2E tests for full workflows

## Future Testing Plans

1. Add integration tests for engines
2. Add E2E tests for full workflows
3. Set up CI/CD pipeline
4. Add coverage requirements
