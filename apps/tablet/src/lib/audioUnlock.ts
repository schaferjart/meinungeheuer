/**
 * iOS Audio Unlock
 *
 * iOS Safari (including PWA) requires a user gesture to start audio playback.
 * Once an AudioContext is resumed from a user gesture, all subsequent audio
 * playback works without new gestures — for the lifetime of the page.
 *
 * Call `unlockAudio()` on the first user tap (e.g. SleepScreen wake).
 * After that, HTMLAudioElement.play() works freely across all visitor cycles.
 */

let audioContext: AudioContext | null = null;
let unlocked = false;

/**
 * Unlock audio playback by resuming an AudioContext and playing a silent buffer.
 * Safe to call multiple times — only runs once.
 * Must be called from a user gesture event handler (click, touchend, etc.).
 */
export function unlockAudio(): void {
  if (unlocked) return;

  try {
    const ctx = audioContext ?? new AudioContext();
    audioContext = ctx;

    // Resume the context (required on iOS when created outside a gesture)
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    // Play a silent buffer to fully unlock audio playback
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);

    // Also unlock HTMLAudioElement playback by playing+pausing a silent data URI
    const silentAudio = new Audio(
      'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
    );
    silentAudio.volume = 0;
    void silentAudio.play().then(() => {
      silentAudio.pause();
      silentAudio.src = '';
    });

    unlocked = true;
    console.log('[audioUnlock] Audio unlocked for this session');
  } catch (err) {
    console.warn('[audioUnlock] Failed to unlock audio:', err);
  }
}

/** Check whether audio has been unlocked this session. */
export function isAudioUnlocked(): boolean {
  return unlocked;
}
