---
phase: 1
slug: package-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-07
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x |
| **Config file** | `packages/karaoke-reader/vitest.config.ts` |
| **Quick run command** | `pnpm --filter karaoke-reader test` |
| **Full suite command** | `pnpm --filter karaoke-reader test && pnpm --filter karaoke-reader run check-exports` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter karaoke-reader test`
- **After every plan wave:** Run `pnpm --filter karaoke-reader test && pnpm --filter karaoke-reader run check-exports`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| scaffold | 01 | 1 | PKG-01 | build | `pnpm --filter karaoke-reader build` | ❌ W0 | ⬜ pending |
| types | 01 | 1 | UTIL-01 | typecheck | `pnpm --filter karaoke-reader typecheck` | ❌ W0 | ⬜ pending |
| buildWordTimestamps | 01 | 1 | UTIL-02 | unit | `pnpm --filter karaoke-reader test -- buildWordTimestamps` | ❌ W0 | ⬜ pending |
| splitTextIntoChunks | 01 | 1 | UTIL-03 | unit | `pnpm --filter karaoke-reader test -- splitTextIntoChunks` | ❌ W0 | ⬜ pending |
| computeCacheKey | 01 | 1 | UTIL-04 | unit | `pnpm --filter karaoke-reader test -- computeCacheKey` | ❌ W0 | ⬜ pending |
| markdown | 01 | 1 | UTIL-05 | unit | `pnpm --filter karaoke-reader test -- markdown` | ❌ W0 | ⬜ pending |
| exports-map | 01 | 1 | PKG-02, PKG-05 | integration | `pnpm --filter karaoke-reader run check-exports` | ❌ W0 | ⬜ pending |
| react-external | 01 | 1 | PKG-03, PKG-04 | build | `grep -r "from 'react'" packages/karaoke-reader/dist/ && exit 1 \|\| echo OK` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/karaoke-reader/vitest.config.ts` — test framework config
- [ ] `packages/karaoke-reader/src/utils/buildWordTimestamps.test.ts` — 13 transferred tests
- [ ] `packages/karaoke-reader/src/utils/splitTextIntoChunks.test.ts` — 6 transferred tests
- [ ] `packages/karaoke-reader/src/utils/computeCacheKey.test.ts` — 5 new tests
- [ ] `packages/karaoke-reader/src/utils/markdown.test.ts` — ~14 new tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Import in fresh TS project | PKG-05 | Requires external project setup | Create a temp Vite project, add `karaoke-reader` as file dep, verify `import { WordTimestamp } from 'karaoke-reader'` has full type inference |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
