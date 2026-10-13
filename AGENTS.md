# Agent instructions

## Agent skills

### Issue tracker

Issues live in GitHub Issues on teszerrakt/keystatic, used through the `gh` CLI.
See `docs/agents/issue-tracker.md`.

### Triage labels

Default labels: needs-triage, needs-info, ready-for-agent, ready-for-human,
wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `CONTEXT.md` and `docs/adr/`. See
`docs/agents/domain.md`.

## Pull requests

Every PR body has a `## Proof` section that shows the change working, not only
passing checks.

- A change writers can see: screenshots of the editor running the PR's build on
  [keystatic-plus-sandbox](https://github.com/teszerrakt/keystatic-plus-sandbox).
  The fork's "Publish (Preview)" workflow publishes each PR commit to
  pkg.pr.new; `pnpm use-fork <sha>` and `pnpm shoot` in the sandbox run and
  capture it. Show before and after when fixing a bug.
- Anything else: the command output that proves it (tests, `tsc`, a reproduction
  before and after).
- Upload images and videos with `pnpm proof <N> <file>...` in the sandbox: it
  puts them in Cloudflare R2 and prints the Markdown. Never push a branch for
  proof.
- Never show company sites or content.
