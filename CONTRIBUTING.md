# Contributing to Meeseeks

## Prerequisites

- Node.js 18+
- An AI CLI installed (Claude Code, OpenCode, Cursor, etc.) to run manual tests

## Dev Setup

```bash
git clone https://github.com/saman-ns/tool-meeseeks.git
cd tool-meeseeks/cli
npm install
```

The CLI runs TypeScript directly via [tsx](https://github.com/privatenumber/tsx) — there is no build step. Run it locally from the repo root:

```bash
# Using the wrapper script
./meeseeks "add a login button"

# Or directly from cli/
npm start -- "add a login button"
npm start -- --yaml ../example-prd.yaml
```

## Code Style

- **TypeScript strict mode** — no `any`, no implicit types
- **Zod** for all runtime validation (config schemas, external data)
- **Biome** for formatting and linting — tabs, 100-char line width
- **`.ts` extensions** in import paths

Run the formatter before committing:

```bash
cd cli/
npm run check
```

## Running Tests

```bash
cd cli/
npm test
```

The test suite uses Vitest and covers sanitization, analytics, retry logic, task caching, PRD generation, and the wizard type system. Tests are colocated with source files (`*.test.ts`).

## PR Process

**Branch naming:** `feature/<description>`, `fix/<description>`, or `chore/<description>`

**Commit style:** short imperative summary (e.g., `add sandbox fallback for nested worktrees`, `fix Windows .cmd resolution`)

**A good PR:**
- Solves one thing clearly
- Includes a test if the change is logic-heavy
- Keeps the diff small and readable
- Updates docs if behaviour changes

Open a draft PR early if you want feedback before the work is done.

## Adding a New AI Engine

All engines live in `cli/src/engines/`. The pattern:

1. Create `cli/src/engines/<name>.ts` — extend `BaseAIEngine` from `base.ts`
2. Implement `execute()` — spawn the CLI subprocess and return `AIResult`
3. Optionally implement `executeStreaming()` for real-time output
4. Register it in `cli/src/engines/index.ts`
5. Add the CLI flag in `cli/src/cli/args.ts` and wire it in `cli/src/index.ts`

Look at `claude.ts` or `opencode.ts` as reference implementations. The base class handles subprocess spawning, Windows `.cmd` wrapper compatibility, and `stream-json` parsing via `parseStreamJsonResult()`.
