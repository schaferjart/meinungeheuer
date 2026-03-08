# Milestones

## v1.0 Karaoke Text Reader (Shipped: 2026-03-08)

**Phases completed:** 4 phases, 12 plans
**Timeline:** 11 days (2026-02-25 → 2026-03-08)
**Tests:** 138 passing (111 in karaoke-reader, 27 in tablet)
**Published:** `karaoke-reader` v0.1.0 on npm

**Key accomplishments:**
- Scaffolded dual ESM+CJS npm package with TypeScript declarations, validated by publint + attw
- Extracted 5 pure utility functions (buildWordTimestamps, splitTextIntoChunks, computeCacheKey, markdown strip/parse)
- Built KaraokeReader component with 60fps rAF word sync via binary search, direct DOM manipulation (no React re-renders)
- Implemented auto-scroll with 20%-65% comfort zone and 3s manual-scroll cooldown
- Status state machine: idle → loading → ready → playing → paused → done | error
- Shipped optional ElevenLabs TTS adapter as tree-shakeable subpath export
- Built pluggable cache layer (CacheAdapter interface + memory/localStorage implementations)
- Self-contained CSS theming with 21 `--kr-*` custom properties, no Tailwind dependency
- Wired MeinUngeheuer tablet app as first consumer (deleted 820 lines of local code)
- Published to npm with README, MIT license, and prepublishOnly quality gate

**Tech debt accepted:**
- TextReader.tsx CSS custom property names don't match package CSS (visually correct by coincidence)
- TextReader.tsx dual audio element pattern bypasses KaraokeReader status machine (works in kiosk)
- supabaseCacheAdapter hardcodes voice_id: 'unknown' (data quality only)

---

