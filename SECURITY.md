# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Meeseeks, please report it **privately**:

- Use GitHub's [private vulnerability reporting](https://github.com/saman-ns/tool-meeseeks/security/advisories/new), or
- Reach out on [Discord](https://discord.gg/SZZV74mCuV).

Please do not open a public issue for security reports. We aim to acknowledge reports within a few days.

## How Meeseeks Runs Code

Meeseeks is an autonomous agent loop. It runs AI CLIs (Claude Code, OpenCode, Cursor,
Codex, Qwen, Droid, Copilot) with their permission prompts **disabled**, so agents can
read, write, and delete files, run shell commands, and perform git operations without
asking. Task, PRD, and GitHub-issue text is fed to the agent and is effectively executed.

Only run Meeseeks on trusted code and trusted tasks, on a clean git branch, and never as
root. For the full threat model, permission matrix, file boundaries, and hardening
recommendations, see [docs/SECURITY.md](docs/SECURITY.md).

## Supported Versions

Only the latest published `meeseeks-loop` release receives security fixes.
