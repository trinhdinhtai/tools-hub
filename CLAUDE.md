## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on trinhdinhtai/tools-hub using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Branch per ticket

Before starting work on any ticket, create a new branch from an up-to-date `main`. Never commit ticket work directly on `main`. Name it `<type>/<issue#>-<short-slug>` (e.g. `feat/4-app-shell-base64`); drop the number when there is no issue (e.g. `chore/vietnamese-fonts`).

### Small commits

Commit ticket work as several small commits, one per logical step, so each can be reviewed on its own. Never put a whole ticket in one commit. Put new dependencies in their own `build:` commit. Every commit must stand alone: typecheck, lint and its tests pass. Fold review fixes into the commit they fix while the branch is unpushed; after that, add a small `fix:` commit.

### Triage labels

Uses the five default triage labels (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Design skills

Several design skills overlap. Pick by what is being designed:

- **Landing page / marketing site** (e.g. the Tools Hub promo page): use `design-taste-frontend`.
- **Screens inside the app** (Tools, Settings, command palette, Open Tool tabs): use `unslop`.
- Do not use `impeccable` in this repo unless the user asks for it by name.
