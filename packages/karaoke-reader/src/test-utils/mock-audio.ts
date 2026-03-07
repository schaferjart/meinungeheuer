/**
 * MockAudio — a test double for HTMLAudioElement.
 *
 * happy-dom's Audio implementation is incomplete, so we provide a
 * controllable mock that extends EventTarget for event dispatch.
 */
export class MockAudio extends EventTarget {
  /** Current playback position in seconds. */
  currentTime = 0;

  /** Total duration in seconds (NaN until metadata loaded). */
  duration = NaN;

  /** Audio volume (0.0 – 1.0). */
  volume = 1;

  /** Whether the audio is currently paused. */
  paused = true;

  /**
   * Readiness state mirroring HTMLMediaElement.readyState.
   * 0 = HAVE_NOTHING, 4 = HAVE_ENOUGH_DATA.
   */
  readyState = 0;

  /** Media source URL. */
  src = '';

  /** Preload hint. */
  preload: '' | 'none' | 'metadata' | 'auto' = '';

  /** Starts playback. Returns a resolved promise (no real decoding). */
  play(): Promise<void> {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  }

  /** Pauses playback. */
  pause(): void {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }

  /** Simulates the browser having buffered enough data to play. */
  simulateCanPlayThrough(duration = 10): void {
    this.duration = duration;
    this.readyState = 4;
    this.dispatchEvent(new Event('canplaythrough'));
  }

  /** Simulates playback reaching the end. */
  simulateEnded(): void {
    this.currentTime = this.duration;
    this.paused = true;
    this.dispatchEvent(new Event('ended'));
  }

  /** Simulates a playback error. */
  simulateError(): void {
    this.dispatchEvent(new Event('error'));
  }

  /** Simulates a timeupdate tick at the given time. */
  simulateTimeUpdate(time: number): void {
    this.currentTime = time;
    this.dispatchEvent(new Event('timeupdate'));
  }
}
