# Contributing

Thanks for your interest in denkfink! This is a small art-installation codebase maintained in the open so other artists, educators, and tinkerers can adapt it.

## Ways to contribute

- Bug reports and reproducible issues
- Documentation improvements (setup friction is the single biggest source of drop-off)
- New print-card templates and dither modes
- New "program" modes (the three current modes live in `packages/installation-core/src/programs/`)
- Translations of the shipping texts / system prompts

## Development workflow

```bash
# 1. Fork + clone
git clone https://github.com/YOUR_FORK/denkfink.git
cd denkfink
pnpm install
pnpm build           # builds packages/installation-core

# 2. Set up env vars — see README.md ➜ Quick start ➜ Environment variables

# 3. Work on a branch
git checkout -b feat/my-change

# 4. Run checks locally before opening a PR
pnpm typecheck
pnpm test
pnpm lint

# 5. Open a PR with a clear description of the intent + a test plan
```

## Code style

- **TypeScript strict** everywhere. No `any`. Base config in [`tsconfig.base.json`](tsconfig.base.json).
- **Zod** for runtime validation at API boundaries.
- **Tailwind v4** in the tablet app — CSS-first config, no styled-components or CSS modules.
- Test files sit next to source: `foo.ts` → `foo.test.ts`. Framework: **Vitest**.
- Screen components under `apps/tablet/src/components/screens/{StateName}Screen.tsx`.
- Hooks under `apps/tablet/src/hooks/use{Name}.ts`.
- For renamed exports and removed code: just delete. Don't leave tombstone comments or re-exports.

## Commit messages

Conventional-ish. A prefix for the scope helps scanning history:

```
feat(tablet): karaoke sync for multi-paragraph texts
fix(printer-bridge): handle UTF-8 in portrait filename
chore(config): raise blur slider max from 30 to 50
docs(readme): clarify Supabase realtime setup
```

## Opening a PR

- Fill in the PR template (what / why / how to test).
- Link any relevant issue.
- CI will run typecheck + tests (see [`.github/workflows/test.yml`](.github/workflows/test.yml)). Green CI is expected before review.
- UI changes: include before/after screenshots or a short screen recording.

## Security

If you think you've found a security issue (e.g. an RLS gap, a secret in a log, an auth bypass), please open a GitHub security advisory rather than a public issue.

---

Small PRs welcome. Good-first-issue candidates are tagged in the tracker.
