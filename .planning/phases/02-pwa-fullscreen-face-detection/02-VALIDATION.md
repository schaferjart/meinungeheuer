---
phase: 02
slug: pwa-fullscreen-face-detection
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `apps/tablet/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @meinungeheuer/tablet exec vitest run` |
| **Full suite command** | `pnpm test && pnpm typecheck` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @meinungeheuer/tablet exec vitest run`
- **After every plan wave:** Run `pnpm test && pnpm typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | R3 | unit | `pnpm typecheck` | ✅ | ⬜ pending |
| 02-01-02 | 01 | 1 | R3 | unit | `pnpm typecheck` | ✅ | ⬜ pending |
| 02-02-01 | 02 | 1 | R4 | manual | iPad face detection test | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PWA standalone mode fullscreen | R3 | Requires physical iPad + Add to Home Screen | Add to Home Screen, launch, verify no browser chrome |
| Face detection wake/sleep timing | R4 | Requires physical iPad camera | Walk up — wake in 3s. Walk away — sleep in 30s |
| Camera permission persistence | R4 | iOS-specific Safari behavior | Grant permission, close PWA, relaunch, check camera access |
| Guided Access kiosk lockdown | R3 | OS-level iPadOS feature | Enable Guided Access, verify app lock |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
