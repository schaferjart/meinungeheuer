---
phase: 04-portrait-end-to-end-polish
verified: 2026-03-09T12:15:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
---

# Phase 4: Portrait + End-to-End Polish Verification Report

**Phase Goal:** Visitor portrait captured and printed. Full loop works autonomously.
**Verified:** 2026-03-09T12:15:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Portrait frame captured from camera during conversation screen | VERIFIED | `App.tsx:263-282` — useEffect captures frame 5s into conversation via `captureFrame()`, stores blob in `portraitBlobRef` |
| 2 | Captured image POSTed to POS server /portrait/capture as multipart form-data | VERIFIED | `usePortraitCapture.ts:106-117` — FormData with `file` field and `skip_selection=true`, POST to `${posServerUrl}/portrait/capture` |
| 3 | Portrait upload does not block UI transitions or mute the face detection stream | VERIFIED | `App.tsx:149` — `void uploadPortrait(...)` fire-and-forget pattern; shared videoRef avoids second getUserMedia call |
| 4 | Portrait capture gracefully disabled when VITE_POS_SERVER_URL is unset | VERIFIED | `usePortraitCapture.ts:97-100` — early return when `!posServerUrl`; `.env.example` has `VITE_POS_SERVER_URL=` (empty default) |
| 5 | Mode A (text_term) injected text has numbered paragraphs | VERIFIED | `systemPrompt.ts:291` — `addParagraphNumbers(contextText)` called in text_term case |
| 6 | QUOTE move instructs agent to cite by paragraph number with explicit format | VERIFIED | `systemPrompt.ts:71-73` — "Read them a specific passage by paragraph number. Say 'In paragraph [N]...'" |
| 7 | System prompt requires at least 2 specific text references per conversation | VERIFIED | `systemPrompt.ts:91-93` — TEXT ENGAGEMENT block: "You MUST reference at least 2 specific paragraphs" |
| 8 | Prompt changes are compact (under 15 lines net) to avoid instruction dilution | VERIFIED | Summary confirms 14 lines net (17 insertions, 3 deletions) |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/tablet/src/hooks/usePortraitCapture.ts` | Hook for canvas frame capture and POS server upload | VERIFIED | 147 lines, exports `usePortraitCapture`, implements captureFrame/uploadPortrait/captureAndUpload |
| `apps/tablet/src/hooks/usePortraitCapture.test.ts` | Unit tests for portrait capture hook (min 40 lines) | VERIFIED | 296 lines, 10 unit tests covering all behaviors |
| `apps/tablet/src/components/CameraDetector.tsx` | CameraDetector accepting external videoRef prop | VERIFIED | Line 22: `videoRef: React.RefObject<HTMLVideoElement \| null>`, accepted in props, passed to useFaceDetection and video element via callback ref |
| `apps/tablet/src/App.tsx` | InstallationApp wiring videoRef sharing and portrait trigger | VERIFIED | Line 27: imports usePortraitCapture; Line 74: shared videoRef; Line 78: hook call; Line 263-282: capture effect; Line 148-151: upload in handleDefinitionReceived; Line 356: videoRef passed to CameraDetector |
| `apps/tablet/src/lib/systemPrompt.ts` | addParagraphNumbers helper, strengthened QUOTE move, TEXT ENGAGEMENT block | VERIFIED | Line 272-276: addParagraphNumbers; Line 71-73: QUOTE move; Line 91-93: TEXT ENGAGEMENT |
| `apps/tablet/src/lib/systemPrompt.test.ts` | Tests for paragraph numbering and citation instructions (min 60 lines) | VERIFIED | 83 lines, 13 tests total (7 existing + 6 new R8 tests) |
| `apps/tablet/src/hooks/useFaceDetection.ts` | Camera resolution upgraded to 1280x960 | VERIFIED | Line 95: `width: { ideal: 1280 }`, Line 96: `height: { ideal: 960 }`; Line 133: resolution logging |
| `apps/tablet/.env.example` | VITE_POS_SERVER_URL added | VERIFIED | Line 7: `VITE_POS_SERVER_URL=` (empty default) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `App.tsx` | `usePortraitCapture.ts` | usePortraitCapture hook call with shared videoRef | WIRED | Line 27: import; Line 78-81: hook called with `{ videoRef, posServerUrl }` |
| `App.tsx` | `CameraDetector.tsx` | videoRef prop passed down | WIRED | Line 356: `<CameraDetector ... videoRef={videoRef} />` |
| `usePortraitCapture.ts` | POS server `/portrait/capture` | fetch POST with FormData | WIRED | Line 110: template literal builds URL; Line 112-117: fetch POST with FormData body, 5-min timeout |
| `systemPrompt.ts (addParagraphNumbers)` | `systemPrompt.ts (buildModeBlock)` | Called inside text_term case | WIRED | Line 291: `${addParagraphNumbers(contextText ?? '')}` inside text_term switch case |
| `systemPrompt.ts (buildTextTermPrompt)` | ElevenLabs agent session | Prompt override at session start | WIRED | `buildSystemPrompt` called from `useConversation.ts` which passes prompt via ElevenLabs SDK overrides; TEXT ENGAGEMENT block at line 91 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| R7 | 04-01-PLAN | Portrait Capture and Print: Capture visitor face from tablet camera during conversation, POST to POS server `/portrait/capture` | SATISFIED | usePortraitCapture hook captures frame via Canvas API, uploads as multipart FormData; wired in App.tsx with deferred upload pattern |
| R8 | 04-02-PLAN | Improve Agent Text Context: Agent makes specific citations from text, references passages | SATISFIED | addParagraphNumbers numbers context text; QUOTE move specifies citation format; TEXT ENGAGEMENT requires 2+ paragraph references |

No orphaned requirements found. REQUIREMENTS.md maps R7 and R8 to this phase; both plans claim them.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| -- | -- | No anti-patterns detected | -- | -- |

No TODO/FIXME/HACK/PLACEHOLDER markers found in any modified files. No stub implementations detected. The `return null` instances in usePortraitCapture are legitimate guard clauses for video-not-ready conditions.

### Human Verification Required

### 1. Portrait Capture Quality on Target iPad

**Test:** Run the installation on the target iPad. Start a conversation. After 5 seconds, check the console for "[App] Portrait frame captured: NNN bytes" log message.
**Expected:** Blob size should be substantial (50KB+), indicating a real face frame was captured at 1280x960 resolution.
**Why human:** Requires physical iPad with camera, and a person standing in front of it.

### 2. Portrait Print End-to-End with POS Server

**Test:** With POS server running on the local network and `VITE_POS_SERVER_URL` set, complete a full conversation. After the definition is received, verify the portrait prints on the thermal printer.
**Expected:** After the definition card prints (~2s), the portrait should print (30-180s later) as a dithered face image.
**Why human:** Requires POS server, thermal printer, and physical presence. The POS server pipeline (style transfer, dithering) is external to this codebase.

### 3. Agent Text Citations in Live Conversation

**Test:** Start a Mode A (text_term) conversation with a multi-paragraph text. Observe whether the agent references at least 2 specific paragraphs using the "[N]" citation format.
**Expected:** Agent says something like "In paragraph [3], the author writes: '...' -- what does that stir in you?"
**Why human:** LLM behavior is non-deterministic. System prompt instructs but cannot guarantee citation behavior. Requires listening to actual voice conversation output.

### 4. iOS Safari Camera Stream Sharing

**Test:** On the target iPad, verify that face detection and portrait capture both work from the same camera stream. Face detection should continue to wake/sleep normally after a portrait is captured.
**Expected:** Face detection wake/sleep cycle works. Portrait captured. No "stream muted" errors in console. Camera does not restart.
**Why human:** iOS Safari stream-muting behavior (WebKit bug #179363) can only be tested on actual iOS hardware.

### Gaps Summary

No gaps found. All 8 observable truths verified against actual codebase. All artifacts exist, are substantive (not stubs), and are properly wired. All key links confirmed. Both requirements (R7, R8) are satisfied with working implementation and passing tests.

**Test results:**
- `usePortraitCapture.test.ts`: 10/10 tests passing
- `systemPrompt.test.ts`: 13/13 tests passing
- `pnpm typecheck`: clean across all workspaces

**Minor note:** ROADMAP.md still shows `04-01-PLAN.md` as `[ ]` (unchecked) despite being completed. This is a documentation inconsistency only -- the code, commits (`e520766`, `98a04f7`), and summary all confirm completion.

---

_Verified: 2026-03-09T12:15:00Z_
_Verifier: Claude (gsd-verifier)_
