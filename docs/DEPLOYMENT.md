# Deployment

> Distribution, build model, CI, and publishing.

## Distribution

Meeseeks is distributed as a single npm package:

| Method | Package | Installation |
|--------|---------|--------------|
| npm | `meeseeks-loop` | `npm install -g meeseeks-loop` |

Installing globally exposes the `meeseeks` command. There is no bash-script or
precompiled-binary distribution.

## Build Model

There is **no build step**. The CLI ships its TypeScript sources and runs them directly
via [tsx](https://github.com/privatenumber/tsx) at runtime:

- `tsx` is a runtime `dependency` (not just a dev tool), so it is present after a global install.
- The `bin` entry (`src/bin.mjs`) registers tsx's ESM loader and imports `src/index.ts`.
- `tsconfig.json` uses `noEmit: true` and `allowImportingTsExtensions: true` — TypeScript is used for type-checking/editing only, never compilation.

```jsonc
// cli/package.json (relevant fields)
{
  "name": "meeseeks-loop",
  "version": "5.1.0",
  "type": "module",
  "bin": { "meeseeks": "src/bin.mjs" },
  "files": ["src/", "!src/**/*.test.ts", "!src/__tests__/", "LICENSE", "README.md"],
  "engines": { "node": ">=18" }
}
```

## Local Development

```bash
cd cli/
npm install        # install dependencies
npm start          # run from source (tsx src/index.ts)
npm run check      # Biome lint + format
npm test           # Vitest
```

## Continuous Integration

CI runs on every push and pull request to `main` via
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml):

1. `npm ci` (requires the committed `cli/package-lock.json`)
2. `npx biome ci .` (read-only lint)
3. `npm test` (Vitest)

## Publishing to npm

### Pre-publish checklist

- [ ] Bump `version` in `cli/package.json`
- [ ] Update `docs/CHANGELOG.md`
- [ ] `npm run check` is clean
- [ ] `npm test` passes (exit 0)
- [ ] `npm pack --dry-run` shows `LICENSE` + `src/bin.mjs` and **no** test files
- [ ] Smoke-test the tarball: `npm install -g ./meeseeks-loop-<version>.tgz && meeseeks --version`

### Publish

```bash
cd cli/
npm login          # first time only
npm publish        # or: npm publish --tag beta
```

## Environment Variables

Meeseeks itself requires no environment variables. Integrated services do:

| Service | Variable | Required For | Set Via |
|---------|----------|--------------|---------|
| Anthropic API | `ANTHROPIC_API_KEY` | Claude Code | Claude Code CLI |
| GitHub | `GITHUB_TOKEN` | GitHub Issues, PR creation | `gh auth login` |
| OpenCode | API key | OpenCode engine | OpenCode CLI config |

## External CLI Dependencies

| Dependency | Required | Purpose |
|------------|----------|---------|
| `claude` | Yes (for Claude engine) | AI code execution |
| `opencode` / `agent` / `codex` / `qwen` / `droid` / `copilot` | Optional | Alternative engines |
| `gh` | Optional | GitHub Issues, PR creation |
| `agent-browser` | Optional | Browser automation |

## Rollback

```bash
# Deprecate a bad version, then publish a fix
npm deprecate meeseeks-loop@<bad-version> "Use <good-version> instead"
npm publish
```

## Version Management

Meeseeks follows [semver](https://semver.org/). Update the version in:

1. `cli/package.json`
2. `docs/CHANGELOG.md`
3. README badges/changelog if applicable

## Community Channels

| Channel | URL |
|---------|-----|
| Discord | https://discord.gg/SZZV74mCuV |
| GitHub Issues | https://github.com/saman-ns/tool-meeseeks/issues |
| npm | https://www.npmjs.com/package/meeseeks-loop |

## Future Improvements

1. Automated npm publishing on git tags
2. Package manager distribution (Homebrew)
3. Performance benchmarking in CI
