---
phase: 04
slug: portrait-end-to-end-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | apps/tablet/vitest.config.ts, apps/printer-bridge/vitest.config.ts |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test && pnpm typecheck` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test && pnpm typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | R7 | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/hooks/usePortraitCapture.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | R7 | integration | `pnpm typecheck` | ✅ | ⬜ pending |
| 04-02-01 | 02 | 2 | R8 | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/lib/systemPrompt.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 2 | R7+R8 | e2e | Manual — full loop test | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/tablet/src/hooks/usePortraitCapture.test.ts` — stubs for R7 portrait capture
- [ ] `apps/tablet/src/lib/systemPrompt.test.ts` — stubs for R8 citation improvements

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Portrait frame not black on iOS | R7 | Requires physical iPad camera | Start conversation, verify captured frame contains face |
| Definition card prints with portrait | R7 | Requires physical printer | Complete full loop, verify printed output |
| System prompt produces text citations | R8 | Requires LLM conversation | Run Mode A conversation, verify agent references specific passages |
| Full autonomous loop | R7+R8 | Requires physical hardware | Walk up → read → converse → print → card appears → reset |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
