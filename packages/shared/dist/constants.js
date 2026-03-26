export const APP_NAME = 'MeinUngeheuer';
/**
 * Single font family used across all apps (tablet, archive, config, etc.).
 * Change this one value to update the font everywhere.
 */
export const FONT_FAMILY = "Helvetica, 'Helvetica Neue', Arial, sans-serif";
export const FONT_FAMILY_CSS = "Helvetica, 'Helvetica Neue', Arial, sans-serif";
export const DEFAULT_TERM = 'KREATIVITÄT';
export const DEFAULT_MODE = 'text_term';
export const FACE_DETECTION = {
    WAKE_THRESHOLD_MS: 3000,
    SLEEP_THRESHOLD_MS: 30000,
    DETECTION_INTERVAL_MS: 500,
    MIN_CONFIDENCE: 0.5,
};
export const TIMERS = {
    WELCOME_DURATION_MS: 3000,
    TERM_PROMPT_DURATION_MS: 2000,
    DEFINITION_DISPLAY_MS: 20000,
    FAREWELL_DURATION_MS: 15000,
    PRINT_TIMEOUT_MS: 30000,
};
export const PRINTER = {
    HEARTBEAT_INTERVAL_MS: 30000,
    RECONNECT_ATTEMPTS: 3,
    RECONNECT_DELAY_MS: 5000,
};
//# sourceMappingURL=constants.js.map