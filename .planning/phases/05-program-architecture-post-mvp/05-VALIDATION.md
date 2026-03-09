---
phase: 5
slug: program-architecture-post-mvp
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | apps/tablet/vitest.config.ts |
| **Quick run command** | `pnpm --filter @meinungeheuer/tablet exec vitest run -x` |
| **Full suite command** | `pnpm test && pnpm typecheck` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @meinungeheuer/tablet exec vitest run -x`
- **After every plan wave:** Run `pnpm test && pnpm typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | R9 | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run -x` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | R9 | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run -x` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 2 | R9 | unit+integration | `pnpm --filter @meinungeheuer/tablet exec vitest run -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements. Vitest + TypeScript strict mode already in place.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Two programs switchable via config | R9 | Requires Supabase config + running tablet | Switch installation_config.program between 'aphorism' and 'free_association', verify different conversation behavior |
| Stage toggles work at runtime | R9 | Requires full stack running | Toggle stages (skip text reading, skip portrait) and verify flow adapts |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
