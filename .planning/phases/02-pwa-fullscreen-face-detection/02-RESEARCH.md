# Phase 2: PWA + Fullscreen + Face Detection - Research

**Researched:** 2026-03-09
**Domain:** iOS PWA standalone mode, MediaPipe face detection, iPad kiosk setup
**Confidence:** MEDIUM

## Summary

This phase transforms the tablet app into an autonomous kiosk. The codebase already has the core building blocks: PWA meta tags are present in `index.html`, a `manifest.json` exists in `public/`, `fullscreen.ts` provides a Fullscreen API wrapper, `useFaceDetection.ts` implements MediaPipe-based face detection with debounced wake/sleep, and `CameraDetector` is already mounted in `App.tsx`. The main work is fixing configuration issues, handling iOS-specific quirks, and documenting the physical setup.

The critical finding is that iOS does NOT support `display: "fullscreen"` in the manifest -- it silently falls back to `standalone`. The current `manifest.json` specifies `"display": "fullscreen"` which needs to be changed to `"display": "standalone"`. Additionally, the Fullscreen API (`requestFullscreen()`) is not reliably available on iOS Safari in standalone mode and should be skipped. Camera permissions in PWA standalone mode on iOS are re-prompted on each app launch (not persisted between sessions), but within a single session they persist -- which is acceptable for a kiosk that runs continuously. The global Safari setting (Settings > Safari > Camera > Allow) can grant blanket permission.

**Primary recommendation:** Fix manifest display mode to `standalone`, add standalone-mode detection to skip Fullscreen API calls, set Safari camera to "Allow" globally on the target iPad, and enable Guided Access for kiosk lockdown.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| R3 | PWA Standalone + Fullscreen Fix: Add PWA meta tags, skip Fullscreen API when standalone, ensure Add-to-Home-Screen works | PWA meta tags already present; manifest needs `display: standalone`; standalone detection via `navigator.standalone` or `matchMedia('(display-mode: standalone)')` to skip `requestFullscreen()` |
| R4 | Face Detection on Target Tablet: Verify MediaPipe on iPad Safari/PWA, pre-allow camera, autonomous wake/sleep cycle | MediaPipe tasks-vision works on Safari with CPU delegate; camera permission needs Safari global "Allow" setting; `useFaceDetection` hook already implements 3s wake / 30s sleep debounce; face detection runs at 2fps which is appropriate for iPad performance |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@mediapipe/tasks-vision` | ^0.10.18 | Face detection in browser | Google's official WASM-based vision ML -- BlazeFace model, ultrafast, works on Safari with CPU delegate |
| React | ^18.3.1 | UI framework | Already in use |
| Vite | ^6.1.0 | Build tool | Already in use |

### Supporting (No New Dependencies Needed)
This phase requires NO new npm packages. All functionality is achievable with existing dependencies plus browser APIs and iPad Settings configuration.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| MediaPipe face detection | TensorFlow.js BlazeFace | MediaPipe is already integrated and working; TF.js would add bundle weight for no benefit |
| PWA manifest | Capacitor/Cordova wrapper | Massive complexity increase; PWA standalone + Guided Access achieves the same kiosk result |

## Architecture Patterns

### Existing File Structure (No Changes Needed)
```
apps/tablet/
  public/
    manifest.json          # Fix display mode
  index.html               # PWA meta tags (already present)
  src/
    lib/
      fullscreen.ts        # Add standalone detection
    hooks/
      useFaceDetection.ts  # Already complete
    components/
      CameraDetector.tsx   # Already complete, mounted in App.tsx
      screens/
        SleepScreen.tsx     # Update to skip requestFullscreen() in standalone
```

### Pattern 1: Standalone Mode Detection
**What:** Detect whether the app is running as an installed PWA (Add-to-Home-Screen) vs. in Safari browser.
**When to use:** Before calling Fullscreen API, which is unavailable/unnecessary in standalone mode.
**Example:**
```typescript
// Source: MDN + Apple docs, verified via web.dev/learn/pwa/detection
export function isStandaloneMode(): boolean {
  // iOS Safari proprietary check (works on all iOS versions)
  if ('standalone' in window.navigator) {
    return (window.navigator as { standalone?: boolean }).standalone === true;
  }
  // Standard check (Safari 15.4+, all other browsers)
  return window.matchMedia('(display-mode: standalone)').matches;
}
```

### Pattern 2: Conditional Fullscreen
**What:** Only call Fullscreen API when NOT in standalone mode. In standalone mode, the app already runs without browser chrome.
**When to use:** In `fullscreen.ts` and `SleepScreen.tsx`.
**Example:**
```typescript
export function requestFullscreen(): void {
  // In standalone PWA mode, we're already fullscreen -- skip the API call
  if (isStandaloneMode()) return;

  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };
  if (el.requestFullscreen) {
    el.requestFullscreen().catch(() => {});
  } else if (el.webkitRequestFullscreen) {
    el.webkitRequestFullscreen().catch(() => {});
  }
}
```

### Pattern 3: Camera Permission UX
**What:** Handle the iOS camera permission prompt gracefully. On first app launch, the user sees a permission dialog. In a kiosk context, the installer grants this once via Safari settings.
**When to use:** During initial kiosk setup.
**No code change needed** -- `useFaceDetection.ts` already catches camera errors and falls through to tap-to-start fallback.

### Anti-Patterns to Avoid
- **Using `display: "fullscreen"` in manifest.json on iOS:** iOS ignores this; it silently falls back to standalone. Explicitly set `"standalone"` to avoid confusion.
- **Calling `requestFullscreen()` in standalone mode:** It will either silently fail or, worse, throw in some WebKit versions. Skip it.
- **Relying on camera permission persistence in PWA mode:** iOS does NOT persist `getUserMedia` permissions across PWA launches. Must use Safari global setting (Settings > Safari > Camera > Allow) on the kiosk device.
- **Using GPU delegate for MediaPipe on iOS Safari:** The existing code correctly uses `delegate: 'CPU'`. GPU delegate has issues with OffscreenCanvas/WebGL2 in Safari. Do not change this.
- **Using `display-mode: fullscreen` media query on iOS:** This will never match on iOS. Use `display-mode: standalone` instead.
- **Hash-based routing in PWA with camera:** Hash changes can trigger camera permission re-prompts on iOS. The current app uses no router (single page with state machine), so this is not an issue.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PWA installation | Custom install flow | Safari "Add to Home Screen" + manifest.json | Apple controls the install UX; no install prompt API on iOS |
| Kiosk lockdown | Software screen lock | iPadOS Guided Access | OS-level lockdown; cannot be bypassed by web code |
| Face detection | Custom WASM model | @mediapipe/tasks-vision (already integrated) | BlazeFace is purpose-built for mobile, runs at <10ms/frame on CPU |
| Standalone detection | Build-time flag | Runtime `navigator.standalone` + `matchMedia` | Must detect at runtime; same build serves both modes |

**Key insight:** The kiosk functionality comes from iPadOS features (Guided Access, Safari settings), not from web code. The web app's job is to behave correctly when launched in standalone mode.

## Common Pitfalls

### Pitfall 1: manifest.json `display: "fullscreen"` on iOS
**What goes wrong:** iOS ignores `display: "fullscreen"` and silently falls back to `display: "standalone"`. Developers think they have fullscreen but don't understand why status bar behavior is different from Android.
**Why it happens:** Apple only supports `standalone` display mode for PWAs.
**How to avoid:** Set `display: "standalone"` explicitly in manifest.json.
**Warning signs:** Status bar visible when you expected it hidden; `matchMedia('(display-mode: fullscreen)')` never matches.

### Pitfall 2: Camera Permission Not Persisting Between PWA Sessions
**What goes wrong:** Every time the PWA is cold-launched, iOS prompts for camera permission again, which blocks the kiosk from running autonomously.
**Why it happens:** WebKit intentionally does not persist `getUserMedia` permissions for PWAs added to home screen. This is a known WebKit limitation (bug #215884, #252465).
**How to avoid:** On the kiosk iPad, set Safari camera permission globally: Settings > Apps > Safari > Camera > Allow. This grants blanket camera access without per-session prompts.
**Warning signs:** Camera permission dialog appearing on every app restart.

### Pitfall 3: `requestFullscreen()` Throwing in Standalone Mode
**What goes wrong:** The Fullscreen API call may silently fail or throw an error in standalone PWA mode, since the concept of "fullscreen" doesn't apply the same way.
**Why it happens:** In standalone mode, there's no browser chrome to hide -- the app is already "full screen."
**How to avoid:** Check `isStandaloneMode()` before calling `requestFullscreen()`.
**Warning signs:** Uncaught promise rejections in console from `requestFullscreen()`.

### Pitfall 4: `orientation` Not Supported in iOS Manifest
**What goes wrong:** Setting `"orientation": "portrait"` in manifest.json has no effect on iOS. The app can still rotate.
**Why it happens:** iOS does not support the `orientation` field in web app manifests.
**How to avoid:** Lock orientation via iPad settings (Settings > Display & Brightness > Lock Rotation) or Guided Access orientation lock.
**Warning signs:** App rotating when iPad is tilted.

### Pitfall 5: MediaPipe WASM CDN Loading in Offline/Slow Network
**What goes wrong:** MediaPipe loads its WASM runtime and model from CDN (jsdelivr). If the network is slow or down at startup, face detection silently fails.
**Why it happens:** The WASM files (~4MB) and model (~100KB) are fetched from `cdn.jsdelivr.net` and `storage.googleapis.com` at runtime.
**How to avoid:** For a production kiosk, consider caching these via a service worker or bundling them locally. However, for MVP this is acceptable since the tap-to-start fallback exists.
**Warning signs:** `[CameraDetector] Face detector init failed` in console logs.

### Pitfall 6: iPad Auto-Lock Interfering with Kiosk
**What goes wrong:** iPad goes to sleep after the system auto-lock timer, killing the PWA and requiring manual wake.
**Why it happens:** Default iPad auto-lock is 2-15 minutes.
**How to avoid:** Settings > Display & Brightness > Auto-Lock > Never. Also set in Guided Access settings.
**Warning signs:** Screen goes black after inactivity.

## Code Examples

### Standalone Detection Utility
```typescript
// Source: web.dev/learn/pwa/detection + Apple developer docs
// File: apps/tablet/src/lib/fullscreen.ts

/**
 * Detect if the app is running in PWA standalone mode
 * (added to Home Screen on iOS, or installed as PWA on other platforms).
 */
export function isStandaloneMode(): boolean {
  // iOS Safari proprietary property (available since iOS 2.0)
  if ('standalone' in window.navigator) {
    return (window.navigator as { standalone?: boolean }).standalone === true;
  }
  // W3C standard media query (Safari 15.4+, Chrome, Firefox, Edge)
  return window.matchMedia('(display-mode: standalone)').matches;
}

/**
 * Request fullscreen on the document element.
 * Skips the call in standalone mode (already fullscreen).
 * Silently fails if the API is unavailable or blocked.
 */
export function requestFullscreen(): void {
  if (isStandaloneMode()) return;

  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };

  if (el.requestFullscreen) {
    el.requestFullscreen().catch(() => {});
  } else if (el.webkitRequestFullscreen) {
    el.webkitRequestFullscreen().catch(() => {});
  }
}
```

### Corrected manifest.json
```json
{
  "name": "MeinUngeheuer",
  "short_name": "MeinUngeheuer",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#000000"
}
```

Note: `"orientation": "portrait"` removed because iOS ignores it and it creates false confidence that rotation is locked.

### Status Bar Style Meta Tag
```html
<!-- Already present in index.html -->
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
```
Using `black-translucent` makes the status bar area transparent with white text, allowing the black background of the app to show through. This is the closest to "true fullscreen" achievable on iOS.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `apple-mobile-web-app-capable` meta tag alone | manifest.json `display: standalone` + meta tag as fallback | iOS 11.3 (2018) | Manifest is the primary signal; meta tag is fallback |
| Fullscreen API for immersive mode | PWA standalone mode + Guided Access | Always on iOS | Fullscreen API has never been fully supported on iOS for web apps |
| GPU delegate for MediaPipe on mobile | CPU delegate on iOS Safari | Current | GPU delegate has WebGL2/OffscreenCanvas issues in Safari; CPU is reliable |
| Hash-based routing for SPAs | History API routing | iOS 14.5 fixed the worst bug | Hash changes revoked camera permissions in standalone mode |

**Deprecated/outdated:**
- `apple-mobile-web-app-capable` meta tag as sole PWA signal: Still works as fallback, but manifest.json should be primary.
- `manifest.json` `orientation` field on iOS: Never supported, no plans to support.
- `display: "fullscreen"` on iOS: Falls back to standalone; use standalone explicitly.

## Open Questions

1. **MediaPipe Performance on Target iPad Model**
   - What we know: BlazeFace with CPU delegate at 320x240 @ 2fps is lightweight; should work on any iPad from 2018+
   - What's unclear: Exact CPU usage and thermal behavior during extended operation (hours). Battery drain when plugged in.
   - Recommendation: Test on target device. If CPU usage is high, reduce detection frequency from 500ms to 1000ms (1fps). The wake threshold is 3s so even 1fps gives 3+ detections before wake.

2. **Camera Permission Behavior After iPad Restart**
   - What we know: Safari global camera "Allow" setting should persist across reboots
   - What's unclear: Whether Guided Access preserves the Safari camera setting after force restart
   - Recommendation: Test on target device. If permission is lost after reboot, document the re-grant procedure.

3. **Status Bar Visibility with black-translucent**
   - What we know: `black-translucent` makes the status bar overlay with transparent background
   - What's unclear: Whether time/battery indicators are visible on a black background (they show in white text)
   - Recommendation: Acceptable for MVP. The status bar indicators (time, battery, wifi) will be faintly visible as white text on black. If this is visually distracting, the only option is Guided Access which can hide the status bar.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.0.5 |
| Config file | Inherits from vite.config.ts |
| Quick run command | `pnpm --filter @meinungeheuer/tablet exec vitest run` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R3-01 | `isStandaloneMode()` returns true when `navigator.standalone` is true | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/lib/fullscreen.test.ts -x` | No -- Wave 0 |
| R3-02 | `isStandaloneMode()` returns true when matchMedia matches standalone | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/lib/fullscreen.test.ts -x` | No -- Wave 0 |
| R3-03 | `requestFullscreen()` does NOT call Fullscreen API in standalone mode | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/lib/fullscreen.test.ts -x` | No -- Wave 0 |
| R3-04 | `requestFullscreen()` calls Fullscreen API in browser mode | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/lib/fullscreen.test.ts -x` | No -- Wave 0 |
| R3-05 | manifest.json has `display: "standalone"` | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/lib/fullscreen.test.ts -x` | No -- Wave 0 |
| R4-01 | Face detection wake/sleep cycle functions correctly | manual-only | N/A -- requires physical camera + face | Existing tests cover state machine transitions |
| R4-02 | Camera error falls through to tap-to-start | manual-only | N/A -- requires denying camera permission | CameraDetector already handles this |
| R4-03 | Installation state machine WAKE/FACE_LOST transitions | unit | `pnpm --filter @meinungeheuer/tablet exec vitest run src/hooks/useInstallationMachine.test.ts -x` | Yes |

### Sampling Rate
- **Per task commit:** `pnpm --filter @meinungeheuer/tablet exec vitest run`
- **Per wave merge:** `pnpm test && pnpm typecheck`
- **Phase gate:** Full suite green + manual iPad test (walk up -> wake 3s, walk away -> sleep 30s)

### Wave 0 Gaps
- [ ] `apps/tablet/src/lib/fullscreen.test.ts` -- covers R3-01 through R3-05 (standalone detection + conditional fullscreen)
- [ ] No new shared fixtures needed; existing test infrastructure sufficient

## Sources

### Primary (HIGH confidence)
- [firt.dev iOS PWA Compatibility](https://firt.dev/notes/pwa-ios/) -- definitive reference for iOS PWA support matrix; confirmed `display: fullscreen` not supported, falls back to standalone; confirmed `apple-mobile-web-app-status-bar-style` behavior; confirmed getUserMedia support since iOS 13
- [web.dev PWA Detection](https://web.dev/learn/pwa/detection) -- standalone mode detection via `matchMedia('(display-mode: standalone)')` and `navigator.standalone`
- [WebKit Bug #215884](https://bugs.webkit.org/show_bug.cgi?id=215884) -- getUserMedia permission re-prompts in standalone mode; resolved for hash-change case in iOS 14.5, but permissions still not persisted across PWA sessions
- [Apple Support: Guided Access](https://support.apple.com/en-us/111795) -- official setup procedure for Guided Access

### Secondary (MEDIUM confidence)
- [GeekChamp: Camera Permissions iOS 18](https://geekchamp.com/how-to-allow-camera-and-microphone-permissions-for-website-in-safari-on-ios-18/) -- Safari Settings > Camera > Allow path confirmed for iOS 18
- [STRICH KB: Camera Access Issues](https://kb.strich.io/article/29-camera-access-issues-in-ios-pwa) -- confirmed camera permission non-persistence in PWA mode; workaround of Safari global allow setting
- [MediaPipe GitHub Issue #3576](https://github.com/google/mediapipe/issues/3576) -- face detection works on Safari iOS, NOT on Chrome iOS
- [MediaPipe GitHub Issue #4835](https://github.com/google/mediapipe/issues/4835) -- GPU delegate issues on iOS; CPU delegate works; resolved

### Tertiary (LOW confidence)
- [Timmy O'Mahony: Kiosk Mode on iPads with PWA](https://timmyomahony.com/blog/kiosk-mode-on-ipads-with-pwa/) -- general Guided Access + PWA kiosk setup guide
- MediaPipe performance on iPad specifically -- no authoritative data found; extrapolated from general mobile performance claims

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies; existing code is correct
- Architecture: HIGH -- changes are minimal and well-understood (manifest fix + standalone check)
- Pitfalls: HIGH -- iOS PWA camera permission issue is extensively documented in WebKit bug tracker
- Face detection performance on target iPad: LOW -- no specific iPad benchmarks found; needs physical device testing

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (30 days -- PWA/iOS behavior is stable, changes only with major iOS releases)
