# Rename checklist: tool-meeseeks → meeseeks-loop

Recommendation: rename the GitHub repo to **meeseeks-loop** so it matches the
npm package name. GitHub auto-redirects the old URL (web + git remotes), so
nothing breaks, but update references anyway so redirects aren't load-bearing.

Do this BEFORE flipping visibility to public, so the launch links are final.

## Steps

1. Rename the repo:
   ```bash
   gh repo rename meeseeks-loop --repo saman-ns/meeseeks-loop
   ```
2. Update the local remote (optional — the redirect works, but be explicit):
   ```bash
   git remote set-url origin https://github.com/saman-ns/meeseeks-loop.git
   ```
3. Replace `saman-ns/meeseeks-loop` with `saman-ns/meeseeks-loop` in every
   reference found in the repo (verify with
   `grep -rn 'saman-ns/meeseeks-loop' . --exclude-dir=node_modules --exclude-dir=.git`):
   - `README.md` — CI badge URL (line ~4)
   - `SECURITY.md` — private vulnerability reporting link
   - `CONTRIBUTING.md` — git clone URL
   - `docs/DEPLOYMENT.md` — GitHub Issues link
   - `cli/README.md` — GitHub link in Community section
   - `cli/package.json` — `repository.url`
   - `cli/src/config/writer.ts` — generated-config header comment
   - `cli/src/cli/commands/init.ts` — generated-file header comment
   - `launch/launch-posts.md` — all three post drafts
4. Commit:
   ```bash
   git commit -am "chore: rename repo to meeseeks-loop, update references"
   ```
5. Re-run the grep from step 3 — it must return nothing.
