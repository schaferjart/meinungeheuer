/**
 * The user-facing brand/installation name. Single source of truth.
 * Change this one value to rename the installation across every app
 * (system prompts, admin UI, console logs, print-card citation).
 *
 * Note: HTML <title> and manifest.json are baked at build time and
 * hold the name as a static string — update those files too when
 * rebranding (they cannot import this constant).
 */
export declare const APP_NAME = "denkfink";
/**
 * Single font family used across all apps (tablet, archive, config, etc.).
 * Change this one value to update the font everywhere.
 */
export declare const FONT_FAMILY = "Helvetica, 'Helvetica Neue', Arial, sans-serif";
export declare const FONT_FAMILY_CSS = "Helvetica, 'Helvetica Neue', Arial, sans-serif";
export declare const DEFAULT_TERM = "KREATIVIT\u00C4T";
export declare const DEFAULT_MODE: "text_term";
export declare const FACE_DETECTION: {
    readonly WAKE_THRESHOLD_MS: 3000;
    readonly SLEEP_THRESHOLD_MS: 30000;
    readonly DETECTION_INTERVAL_MS: 500;
    readonly MIN_CONFIDENCE: 0.5;
};
export declare const TIMERS: {
    readonly WELCOME_DURATION_MS: 3000;
    readonly TERM_PROMPT_DURATION_MS: 2000;
    readonly DEFINITION_DISPLAY_MS: 20000;
    readonly FAREWELL_DURATION_MS: 15000;
    readonly PRINT_TIMEOUT_MS: 30000;
};
export declare const PRINTER: {
    readonly HEARTBEAT_INTERVAL_MS: 30000;
    readonly RECONNECT_ATTEMPTS: 3;
    readonly RECONNECT_DELAY_MS: 5000;
};
//# sourceMappingURL=constants.d.ts.map