# Launch posts — drafts (do not post without Sami's go)

## X (personal account)

> I open-sourced Meeseeks, my fork of Michael Shimeles's ralphy
> (github.com/michaelshimeles/ralphy). It runs coding agents — Claude Code,
> Codex, Cursor, OpenCode, Qwen, Droid, Copilot — in a loop until a PRD is
> done. I added token/cost tracking, quota monitoring, and an approve-each-task
> interactive mode. MIT.
>
> github.com/saman-ns/meeseeks-loop

(If tagging: replace the ralphy GitHub link with @-handle + link once Michael's
X handle is confirmed — do not guess it.)

## LinkedIn (personal)

> I published my first open source project this week.
>
> It's called Meeseeks. It started as a fork of ralphy, an open source tool by
> Michael Shimeles that runs AI coding agents in a loop until a task list is
> done. I'd been using it heavily and kept hitting the same problem: the loop
> would quietly burn through my token budget while I wasn't watching.
>
> So I added the things I needed — per-task token and cost tracking, API quota
> monitoring, an interactive mode that asks before each task runs, and a
> pre-check that sets a repo up to waste fewer tokens. Then I cleaned it up and
> published it under MIT, same license as the original.
>
> It's a personal tool, shared as-is. If you run coding agents unattended and
> want to know what they're costing you, it might be useful:
> https://github.com/saman-ns/meeseeks-loop
>
> Credit where it's due: the multi-engine and parallel-execution foundation is
> ralphy's — https://github.com/michaelshimeles/ralphy

## Show HN

**Title:** Show HN: Meeseeks – a ralphy fork with token tracking and quota control

**Body:**

> Meeseeks runs coding-agent CLIs (Claude Code, Codex, Cursor, OpenCode, Qwen,
> Droid, Copilot) in a loop over a task list or PRD until everything is done,
> sequentially or in parallel across git worktrees.
>
> It's a fork of ralphy (https://github.com/michaelshimeles/ralphy) by Michael
> Shimeles — the multi-engine support, parallel worktrees, sandbox mode, and
> browser automation are his work. I forked at v4.7.0 because I wanted cost
> visibility: an unattended agent loop can burn a lot of tokens before you
> notice.
>
> What I added: per-task token tracking with local cost estimation, periodic
> API quota checks, an interactive mode that asks before each task runs, an
> --optimize-tokens pre-check that generates CLAUDE.md/.claudeignore so agents
> stop re-exploring the repo, a cross-task context guide, and parallel-mode
> hardening (file locking, rate-limit retry). It's Node-only now and on npm as
> meeseeks-loop.
>
> Fair warning: it runs agents with permission prompts disabled by design.
> Only point it at code you can afford to lose.
>
> MIT. Feedback welcome, especially on the token-tracking accuracy across
> engines.
>
> https://github.com/saman-ns/meeseeks-loop
