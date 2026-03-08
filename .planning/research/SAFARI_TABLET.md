# Safari Fullscreen API, Camera Permissions, and Kiosk Mode on iPad

**Context:** MeinUngeheuer art installation -- React web app running on wall-mounted iPad in Safari
**Researched:** 2026-03-08
**Overall confidence:** HIGH (verified across multiple official sources, caniuse, WebKit bugs, Apple forums)

---

## 1. Fullscreen API on Safari iPad

### Current Support Status

**iPad (iPadOS 16.4+):** `Element.requestFullscreen()` works on non-video elements (div, body, etc.). This is PARTIAL support per caniuse.com -- it works but with a **mandatory "X" overlay button** that cannot be disabled via CSS or JavaScript.

**iPhone:** `Element.requestFullscreen()` does NOT work for non-video elements. Only `video.webkitEnterFullscreen()` is available. This is irrelevant for our iPad deployment.

**Confidence:** HIGH -- verified via caniuse.com and Apple Developer Forums.

### The "X" Overlay Button Problem

When `requestFullscreen()` is called on iPad Safari, the browser shows a small "X" (exit fullscreen) button in the upper-left corner. This overlay:

- **Cannot be hidden** via CSS, JavaScript, or any web API
- **Cannot be repositioned**
- Is **less intrusive on iPad** than iPhone due to larger screen width
- Will **auto-hide after a few seconds** of no interaction, but reappears on touch
- In portrait orientation, it sits in the top-left corner

**For an art installation, this is a cosmetic annoyance, not a blocker.** The "X" is small and fades. But if a visitor taps it, they exit fullscreen and see Safari's address bar.

### Workarounds for the Overlay

1. **Design around it:** Add top padding/margin so no critical UI sits under the "X" button. The current SleepScreen's breathing dot is centered, so it avoids the issue.

2. **Don't use the Fullscreen API at all:** Use PWA standalone mode or a kiosk browser instead (see section 3).

### Vendor Prefix Status

The current code in `fullscreen.ts` checks both `requestFullscreen` and `webkitRequestFullscreen`. This is correct but the `webkit` prefix is no longer needed on iPadOS 16.4+. The unprefixed version works. Keeping both is harmless and good defensive coding.

### User Gesture Requirement

`requestFullscreen()` MUST be triggered by a direct user gesture (tap, click, keyboard event). The current implementation in `SleepScreen.tsx` correctly calls it inside `onClick` -- this is the right pattern.

You CANNOT call `requestFullscreen()` on page load, in `useEffect`, or programmatically without a gesture. Safari will silently reject it.

### Sources

- [caniuse.com/fullscreen](https://caniuse.com/fullscreen) -- "Partial support refers to supporting only iPad, not iPhone. Shows an overlay button which cannot be disabled."
- [Apple Developer Forums: Fullscreen API on non-video element](https://developer.apple.com/forums/thread/133248)
- [Apple webkitEnterFullscreen docs](https://developer.apple.com/documentation/webkitjs/htmlvideoelement/1633500-webkitenterfullscreen)

---

## 2. Camera Permissions on Safari iPad

### How getUserMedia Works on iPad Safari

**Basic functionality:** `navigator.mediaDevices.getUserMedia()` works in Safari on iPad. The current `useFaceDetection.ts` implementation is correct -- it requests `{ video: { facingMode: 'user' }, audio: false }` over HTTPS.

**Requirements:**
- Must be served over **HTTPS** (or localhost). HTTP will cause `navigator.mediaDevices` to be `undefined`.
- Must include `playsinline` attribute on video elements (already done in `CameraDetector.tsx`).
- Must be triggered or at least initiated from a secure context.

**Confidence:** HIGH -- getUserMedia on iPad Safari is well-documented and widely used.

### Permission Persistence (The Core Problem)

Safari on iPad has **the least persistent permissions** of any major browser:

| Scenario | Behavior |
|----------|----------|
| First visit | Prompts "Allow camera access?" |
| Same page session (SPA) | Permission persists. No re-prompt. |
| Page reload | **Re-prompts.** |
| Navigation (hash change) | **May re-prompt** (known WebKit bug #215884). |
| App restart / new tab | **Re-prompts.** |
| PWA standalone mode | Permissions granted, but **may re-prompt on hash change**. |

**For MeinUngeheuer (SPA, no page reloads):** Camera permission is requested ONCE on app load via `useFaceDetection.ts`. As long as the page is not reloaded, the permission persists. This is acceptable for an installation that runs continuously.

**Risk:** If the iPad restarts, Safari restarts, or the page reloads, the camera permission prompt will appear again. In an unattended installation, nobody is there to tap "Allow."

### Per-Site Settings (iOS 17/18)

Safari allows pre-configuring camera permissions per site:

**Method 1 -- Via Safari Settings app:**
1. Settings > Safari > Camera
2. Set to "Allow" (grants all sites camera access without prompting)

**Method 2 -- Via per-site settings:**
1. Visit the site in Safari
2. Tap the "aA" icon in the address bar
3. Select "Website Settings"
4. Set Camera to "Allow"
5. Set Microphone to "Allow"

**Important:** Setting camera to "Allow" in Safari global settings means the permission dialog will NOT appear. This is the best approach for an unattended installation running in Safari.

### Microphone Permissions (for ElevenLabs Conversation)

The same permission model applies to microphone. The ElevenLabs SDK uses `getUserMedia({ audio: true })` for the conversation. Same persistence issues apply.

**ElevenLabs-specific note:** The SDK documentation recommends requesting microphone permission via `navigator.mediaDevices.getUserMedia()` BEFORE starting the conversation, so the user sees the prompt at a predictable moment. If the prompt doesn't appear (because it's blocked), you should display a message.

### iOS Safari Audio Routing Quirk

When `getUserMedia({ audio: true })` is active on iOS Safari, the system may **force audio output to the built-in speaker** even if Bluetooth headphones are connected. This is a documented iOS behavior, not a bug. For an art installation with a built-in speaker, this is actually desirable.

### Sources

- [WebKit Bug #185448: getUserMedia in standalone mode](https://bugs.webkit.org/show_bug.cgi?id=185448) -- RESOLVED FIXED in iOS 13.4
- [WebKit Bug #215884: recurring permission prompts on hash change](https://bugs.webkit.org/show_bug.cgi?id=215884)
- [Apple Community: Repeated Camera Permission Prompts](https://discussions.apple.com/thread/256081579)
- [Scandit: Why does iOS keep asking for camera permissions?](https://support.scandit.com/hc/en-us/articles/360008443011)
- [GeekChamp: Camera and Microphone Permissions in Safari on iOS 18](https://geekchamp.com/how-to-allow-camera-and-microphone-permissions-for-website-in-safari-on-ios-18/)
- [ElevenLabs React SDK docs](https://elevenlabs.io/docs/agents-platform/libraries/react)

---

## 3. Kiosk Mode Approaches for Wall-Mounted iPad

### Option A: Safari + Guided Access (RECOMMENDED for this project)

**What it is:** Built-in iOS accessibility feature that locks the iPad to a single app (Safari). No Home button, no app switching, no notifications.

**Setup:**
1. Open the web app in Safari
2. Set camera and microphone to "Allow" in Safari settings for the site
3. Optionally call `requestFullscreen()` on first tap to hide the address bar
4. Triple-click Side button > Guided Access > Start
5. Set a passcode to exit

**Pros:**
- Free, built-in, no additional software
- Locks to Safari -- visitor cannot exit
- Disables Home button, Control Center, notifications, Siri
- Camera permission persists as long as Safari stays open
- Works with the existing web app as-is

**Cons:**
- Does NOT survive a reboot (Guided Access must be manually re-enabled after restart)
- Camera permission prompt reappears after reboot (but if Safari settings have "Allow" for the site, this should auto-grant)
- The "X" fullscreen overlay button still appears if using Fullscreen API
- No remote management

**Verdict:** Good enough for a gallery installation where someone (the artist) can restart if needed. Not suitable for fully unattended deployments over weeks.

### Option B: Safari + PWA Standalone Mode (Add to Home Screen)

**What it is:** Add the web app to the iPad home screen. It opens in its own WebView without Safari's address bar or tab UI.

**Setup:**
1. Visit the site in Safari
2. Tap Share > Add to Home Screen
3. The manifest.json already has `"display": "fullscreen"` (note: Safari treats this as `"standalone"`)
4. Open from the home screen icon
5. Combine with Guided Access for lockdown

**Pros:**
- No address bar, no tab bar -- true "app-like" experience
- No "X" fullscreen overlay (because you're not using the Fullscreen API)
- Camera/microphone via `getUserMedia` works (fixed since iOS 13.4)

**Cons:**
- `display: "fullscreen"` in manifest is treated as `"standalone"` on Safari -- still shows the status bar (clock, battery). Use `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">` to overlay content under the status bar.
- **Camera permission prompts may recur** on hash changes (WebKit bug #215884). Since MeinUngeheuer is an SPA that doesn't change the URL hash, this should not be an issue.
- PWA on iOS has its own WebView instance -- some edge-case bugs differ from Safari
- Does NOT survive a reboot unless combined with Guided Access or MDM

**Verdict:** Best option for hiding Safari UI without third-party software. Combine with Guided Access for lockdown.

### Option C: MDM + Single App Mode (Enterprise)

**What it is:** Mobile Device Management (MDM) enrolls the iPad as a supervised device and locks it to a single app. Survives reboots.

**MDM providers:** Jamf, Hexnode, SimpleMDM, Mosyle, ManageEngine

**Setup:**
1. Enroll iPad in MDM (requires Apple Business/School Manager or Apple Configurator 2)
2. Deploy a web clip or kiosk browser app via MDM profile
3. Enable Single App Mode for that app
4. Configure auto-start on boot

**Pros:**
- Survives reboots -- auto-launches the app
- Remote management (restart, update URL, push config)
- Can disable physical buttons, notifications, etc.
- Professional-grade lockdown

**Cons:**
- **Camera/microphone permissions CANNOT be auto-granted via MDM.** This is an Apple privacy limitation. The permission prompt will appear once and must be manually tapped. In Single App Mode, sometimes only one permission prompt shows at a time, requiring device reboots to see subsequent prompts.
- **Safari in kiosk mode does not support camera permissions** via MDM. The workaround is to use Hexnode Browser Lite or Kiosk Pro instead of Safari.
- Requires MDM subscription (cost varies: $1-$4/device/month)
- Setup complexity is much higher

**Verdict:** Overkill for a single art installation. The camera permission limitation makes it no better than Guided Access for this specific use case. Worth considering only if deploying to multiple venues.

### Option D: Third-Party Kiosk Browser App

**Kiosk Pro Plus** (~$39.99 one-time)
- Full-screen web browser, camera/microphone via WKWebView (iPadOS 14.3+)
- JavaScript API for native camera access
- Can combine with Guided Access or Single App Mode
- `getUserMedia` supported since iOS 14.3
- Permission prompt appears once, then persists until app is deleted

**Kiosker** (~$7.99/month or $54.99/year)
- Full-screen web browser with motion detection screensaver
- Custom CSS/JS injection
- Single App Mode support (Pro version)
- Motion detection built in (could replace our MediaPipe face detection)
- Camera/microphone support: not explicitly documented

**Hexnode Browser Lite** (part of Hexnode MDM)
- Specifically supports camera/microphone permissions in kiosk mode
- Camera permissions work when web apps open in Hexnode Browser Lite (NOT Safari)
- Requires Hexnode MDM subscription

**Verdict:** Kiosk Pro Plus is the most proven option for art installations that need camera access. However, it adds complexity and cost. For this project, Safari + Guided Access is simpler and sufficient.

### Sources

- [SimpleMDM: iOS kiosk mode](https://simplemdm.com/blog/how-to-use-ios-single-app-mode/)
- [Esper: iPad Kiosk Mode Guide](https://www.esper.io/blog/ipad-kiosk-mode-a-guide-to-ipados-guided-access-and-beyond)
- [Hexnode: Camera permissions in kiosk mode](https://www.hexnode.com/forums/topic/access-camera-permissions-in-ios-in-single-app-kiosk-mode/)
- [Kiosk Pro: WebRTC/getUserMedia support](https://support.kioskgroup.com/article/920-webrtc-getusermedia-not-supported)
- [Kiosk Pro: Granting permissions](https://support.kioskgroup.com/article/832-app-permissions)
- [Kiosker.io](https://kiosker.io/)
- [Lilitab: Ultimate Guide to iPad Kiosk Configuration](https://www.lilitab.com/blogs/news/13361673-the-ultimate-guide-to-configuring-your-ipad-for-kiosk-use)

---

## 4. Recommended Setup for MeinUngeheuer

### Strategy: PWA Standalone + Guided Access + Safari Site Settings

This combination provides fullscreen UI, persistent camera/microphone permissions, and lockdown -- all with zero cost and minimal setup.

### Step-by-Step Setup Procedure

**One-time device preparation:**

1. **Update iPad** to iPadOS 17+ (for best permission handling)

2. **Configure Safari camera/microphone for the site:**
   - Open Settings > Apps > Safari > Camera > set to "Allow"
   - Open Settings > Apps > Safari > Microphone > set to "Allow"
   - (This prevents ALL permission prompts for ALL sites -- acceptable for a dedicated kiosk)

3. **Add meta tags to the HTML** (already partially done):
   ```html
   <meta name="apple-mobile-web-app-capable" content="yes">
   <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
   ```

4. **Verify the manifest.json** (already correct):
   ```json
   {
     "name": "MeinUngeheuer",
     "display": "fullscreen",
     "orientation": "portrait",
     "background_color": "#000000"
   }
   ```

5. **Add to Home Screen:**
   - Open the app URL in Safari
   - Tap Share > Add to Home Screen
   - Name it "MeinUngeheuer"

6. **Open from Home Screen** to verify it launches in standalone mode (no address bar)

7. **Enable Guided Access:**
   - Settings > Accessibility > Guided Access > On
   - Set a passcode
   - Open the web app from the Home Screen icon
   - Triple-click Side button > Guided Access > Start

8. **Additional hardening:**
   - Settings > Display & Brightness > Auto-Lock > Never
   - Disable Auto-Brightness (prevents dimming in enclosure)
   - Disable Siri (Settings > Siri & Search > Listen for "Hey Siri" > Off)
   - Disable notification banners for all apps

### Code Changes Required

**1. Add apple-mobile-web-app meta tags to `index.html`:**

```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="MeinUngeheuer">
```

**2. Modify fullscreen strategy:**

The `requestFullscreen()` call in `SleepScreen.tsx` should be conditional. In PWA standalone mode, fullscreen is already active -- calling the Fullscreen API would be a no-op or could cause the "X" overlay. Detect standalone mode:

```typescript
function isStandaloneMode(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function requestFullscreen(): void {
  // In PWA standalone mode, we're already "fullscreen" -- skip the API call
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

**3. Ensure no hash-based routing:**

The current app uses no router (single-page state machine), so URL hash never changes. This is critical for permission persistence in PWA mode. Do NOT add hash-based routing.

**4. Camera permission pre-check (optional improvement):**

Before the face detection init, show a friendly message if permission is needed:

```typescript
// Check if permission is already granted
const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
if (permissionStatus.state === 'prompt') {
  // Show UI asking user to tap to enable camera
}
```

Note: Safari's support for `navigator.permissions.query` is limited. The safer approach is to just call `getUserMedia` and handle the error, which is what the current code already does.

---

## 5. Potential Pitfalls

### Pitfall 1: iPad Reboot Kills Guided Access
**What happens:** After a power outage or force restart, Guided Access is disabled. The iPad boots to the home screen.
**Mitigation:** Use MDM Single App Mode if truly unattended. For gallery installations, train gallery staff to re-enable Guided Access after restart.

### Pitfall 2: Camera Permission Prompt After Crash
**What happens:** If the web app process crashes and restarts, Safari may re-prompt for camera access.
**Mitigation:** Set Safari > Camera > "Allow" globally in iOS Settings. This makes the prompt auto-accept.

### Pitfall 3: iOS Updates
**What happens:** iPadOS auto-updates can reboot the device and change Safari behavior.
**Mitigation:** Disable auto-updates: Settings > General > Software Update > Automatic Updates > Off.

### Pitfall 4: Safari Tab Gets Killed
**What happens:** iOS memory management may kill the Safari tab if the iPad runs low on memory.
**Mitigation:** Close all other apps. Disable Background App Refresh. Using PWA standalone mode (separate process) is slightly more resilient.

### Pitfall 5: ElevenLabs Audio + getUserMedia Audio Conflict
**What happens:** On iOS Safari, activating `getUserMedia({ audio: true })` can reroute audio output to the earpiece speaker instead of the main speaker.
**Mitigation:** The ElevenLabs SDK has a `preferHeadphonesForIosDevices` option. For the built-in speaker scenario, test thoroughly. The face detection only uses `{ video: true, audio: false }` so this only applies when the conversation microphone is activated.

### Pitfall 6: The "X" Overlay in Fullscreen API Mode
**What happens:** Using `requestFullscreen()` on iPad Safari shows an undismissable "X" button.
**Mitigation:** Don't use the Fullscreen API. Use PWA standalone mode instead, which provides a full-screen experience without the overlay.

---

## 6. Summary Decision Matrix

| Approach | Fullscreen | Camera | Microphone | Survives Reboot | Cost | Complexity |
|----------|------------|--------|------------|-----------------|------|------------|
| Safari + Fullscreen API | Partial (X overlay) | Prompt each load | Prompt each load | No | Free | Low |
| PWA Standalone + Guided Access | Yes (no overlays) | Can pre-allow | Can pre-allow | No | Free | Low |
| PWA Standalone + MDM SAM | Yes (no overlays) | Manual first grant | Manual first grant | Yes | $1-4/mo | Medium |
| Kiosk Pro Plus + Guided Access | Yes | Grant once, persists | Grant once, persists | No | $39.99 | Medium |
| Hexnode Browser + MDM | Yes | Auto-handled | Auto-handled | Yes | $$/mo | High |

### RECOMMENDATION: PWA Standalone + Guided Access

For this art installation:
1. **Zero cost, low complexity**
2. **No "X" overlay** (avoids the Fullscreen API entirely)
3. **Camera/microphone permissions persist** within a session, and can be pre-allowed via Safari Settings
4. Gallery staff can restart Guided Access if needed after a reboot
5. The code changes are minimal (add meta tags, conditional fullscreen logic)

If the installation needs to be **truly unattended for weeks**, upgrade to Kiosk Pro Plus ($39.99 one-time) for more resilient permission handling, or MDM + Single App Mode for reboot survival.
