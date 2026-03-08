---
phase: 1
slug: conversation-fix-sdk-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | apps/tablet/vitest.config.ts |
| **Quick run command** | `pnpm --filter @meinungeheuer/tablet exec vitest run` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @meinungeheuer/tablet exec vitest run`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | R1 | manual | N/A (dashboard change) | N/A | ✅ done |
| 1-01-02 | 01 | 1 | R2 | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 1 | R2 | typecheck | `pnpm typecheck` | ✅ | ⬜ pending |
| 1-01-04 | 01 | 1 | R1 | manual | N/A (live conversation test) | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing vitest infrastructure covers all phase requirements
- Type checking via `pnpm typecheck` validates SDK migration

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bot does not end conversation prematurely | R1 | Requires live ElevenLabs conversation | Start conversation, talk for 10+ minutes, verify only save_definition ends it |
| Disconnect reason logging with close codes | R2 | Requires live ElevenLabs connection | Start/end conversation, check browser console for closeCode and closeReason |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
