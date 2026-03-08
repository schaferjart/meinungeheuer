# Phase 3: Printer Integration - Research

**Researched:** 2026-03-09
**Domain:** ESC/POS thermal printing, Supabase Realtime, Python-Node.js interop
**Confidence:** HIGH

## Summary

Phase 3 connects the existing printer-bridge (Node.js, already built) to the existing POS-thermal-printer server (Python/Flask, already built and running on a Raspberry Pi). Both components exist and are functional independently. The work is integration, wiring, and robustness -- not greenfield development.

The printer-bridge at `apps/printer-bridge/` already subscribes to Supabase Realtime `print_queue` INSERT events, claims jobs, validates payloads via Zod, and POSTs to a POS server URL. The POS server at `/Users/janos/Desktop/VAKUNST/code/POS/` (GitHub: `schaferjart/POS-thermal-printer`) already has a `/print/dictionary` endpoint that accepts `{word, definition, citations}` and renders image-based dictionary cards with custom fonts. Both are already in sync on the data contract.

**Primary recommendation:** Clone the POS repo into `apps/pos-server/`, add pnpm convenience scripts that manage the Python venv, add a print_queue INSERT policy for the tablet's anon key (currently missing), and wire the full end-to-end test. The printer-bridge already has the correct field mapping (`word`/`definition`/`citations` matching what `/print/dictionary` expects).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| R5 | Integrate POS Server into Monorepo: Clone POS-thermal-printer repo into `apps/pos-server/`, add pnpm convenience scripts, verify Flask server starts and `/health` responds | POS repo located at `/Users/janos/Desktop/VAKUNST/code/POS/` (GitHub: `schaferjart/POS-thermal-printer`). Has `setup.sh --deps-only` for venv+deps. Flask server runs on port 9100 with `/health` returning `{"status":"running","dummy":bool}`. Python venv needs `.gitignore` entry. pnpm scripts should activate venv and run `print_server.py`. |
| R6 | Printer Bridge End-to-End: Configure printer-bridge to point at POS server. Test full flow: insert print_queue row -> bridge picks up -> POSTs to POS server -> card prints. | Printer-bridge already built and functional. POSTs to `POS_SERVER_URL/print/dictionary` with correct field mapping. Missing: (1) RLS policy for anon INSERT on `print_queue` so tablet can enqueue jobs, (2) `persistPrintJob()` function in tablet's `persist.ts` to actually insert rows after `save_definition`, (3) end-to-end test script. |
</phase_requirements>

## Standard Stack

### Core (Already Built)
| Component | Location | Purpose | Status |
|-----------|----------|---------|--------|
| printer-bridge | `apps/printer-bridge/` | Node.js service: Supabase Realtime -> HTTP relay | COMPLETE |
| POS server | External repo (to clone) | Python Flask: HTTP -> ESC/POS printer | COMPLETE |
| print_queue table | `supabase/migrations/002_tables.sql` | Job queue with status tracking | COMPLETE |
| PrintPayload schema | `packages/shared/src/types.ts` | Zod-validated print job shape | COMPLETE |

### Key Dependencies (printer-bridge)
| Library | Version | Purpose |
|---------|---------|---------|
| `@supabase/supabase-js` | ^2.49.1 | Realtime subscription + DB ops |
| `zod` | ^3.24.2 | Payload validation |
| `tsx` | ^4.19.3 | Dev runner with watch mode |

### Key Dependencies (POS server)
| Library | Version | Purpose |
|---------|---------|---------|
| Flask | 3.1.3 | HTTP server |
| flask-cors | 5.0.1 | CORS for cross-origin requests |
| python-escpos | 3.1 | ESC/POS command generation |
| pillow | 12.1.1 | Image rendering for dictionary cards |
| pyusb | 1.3.1 | USB printer communication |
| zeroconf | 0.146.0 | Bonjour/mDNS service discovery |

## Architecture Patterns

### Data Flow (Already Implemented)

```
Tablet (save_definition)
    -> persistDefinition() writes to Supabase `definitions` table
    -> [MISSING] persistPrintJob() writes to Supabase `print_queue` table
    -> Supabase Realtime fires INSERT event
    -> printer-bridge receives event, claims job (status: pending -> printing)
    -> printer-bridge POSTs to POS server /print/dictionary
    -> POS server renders dictionary image with custom fonts
    -> POS server sends ESC/POS commands to USB printer
    -> printer-bridge marks job done (status: printing -> done)
```

### Field Mapping (printer-bridge -> POS server)
The mapping in `apps/printer-bridge/src/printer.ts` line 36-44 translates:

| PrintPayload field | POS server field | Notes |
|-------------------|-----------------|-------|
| `term` | `word` | Renamed |
| `definition_text` | `definition` | Renamed |
| `citations` | `citations` | Passed through |
| `language` | `language` | Passed through |
| `session_number` | `session_number` | Passed through |
| `chain_ref` | `chain_ref` | Passed through |
| `timestamp` | `timestamp` | Passed through |

The POS `/print/dictionary` endpoint requires `word` and `definition` (validated by `_require_fields`). `citations` is optional.

### Project Structure After Integration
```
apps/
  pos-server/           # Cloned from schaferjart/POS-thermal-printer
    config.yaml         # Printer config (USB IDs, fonts, paper width)
    print_server.py     # Flask HTTP server (port 9100)
    print_cli.py        # CLI for manual prints
    printer_core.py     # USB connection + Formatter class
    templates.py        # Print layout functions (dictionary_entry)
    md_renderer.py      # Markdown -> PIL Image renderer
    image_printer.py    # Dithering pipeline
    helpers.py          # Font resolution, word wrapping
    fonts/              # Bundled .ttf files (Burra-Bold, Burra-Thin, Acidic)
    setup.sh            # venv + deps + systemd service
    requirements.txt    # Python dependencies
    venv/               # .gitignored
  printer-bridge/       # Already exists
    src/
      index.ts          # Main: Supabase Realtime subscription
      printer.ts        # HTTP relay to POS server
      config.ts         # BridgeConfig (POS_SERVER_URL)
      test-print.ts     # CLI test script
```

### Anti-Patterns to Avoid
- **Do NOT merge printer-bridge and POS server**: They are different runtimes (Node.js vs Python) and run on different machines in production (Pi runs POS, any machine can run bridge). Keep them as separate services.
- **Do NOT use git submodule**: Clone the repo directly into `apps/pos-server/`. The POS code is evolving in tandem with this project (same author). Submodules add complexity without benefit here.
- **Do NOT add python-escpos to Node.js**: The POS server already handles all ESC/POS complexity. The bridge is intentionally a thin HTTP relay.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ESC/POS formatting | Custom byte sequences | python-escpos 3.1 via POS server | USB printer quirks, character encoding, image rasterization |
| Dictionary card layout | In-memory image generation in Node | POS server `templates.dictionary_entry()` | Already renders with custom fonts (Burra), proper word wrapping, PIL Image |
| USB printer connection | Direct USB from Node.js | POS server `printer_core.connect()` | `usblp` kernel module conflicts, reconnection logic, dummy mode |
| Job queue | Custom polling or message broker | Supabase Realtime + print_queue table | Already built, RLS-protected, status tracking, retry on failure |
| Service discovery | Manual IP configuration | POS server Bonjour/mDNS registration | POS server already registers as `POS Thermal Printer._http._tcp.local.` |

## Common Pitfalls

### Pitfall 1: Missing RLS INSERT Policy for print_queue
**What goes wrong:** Tablet uses anon key. Currently NO RLS policy allows anon INSERT on `print_queue`. The backend webhook uses service role (bypasses RLS), but the backend is "unused legacy" per CLAUDE.md. If the tablet tries to insert a print job, it will get a 403/RLS error.
**Why it happens:** The original design assumed a backend webhook would insert print jobs. The current architecture has `save_definition` as a client tool, so the tablet must insert print jobs directly.
**How to avoid:** Add migration: `CREATE POLICY "tablet_insert_print_queue" ON print_queue FOR INSERT TO anon WITH CHECK (true);`
**Warning signs:** Print jobs never appear in Supabase despite `save_definition` succeeding.

### Pitfall 2: No persistPrintJob() in Tablet
**What goes wrong:** The tablet's `persist.ts` has `persistDefinition()` and `persistTranscript()` but does NOT insert into `print_queue`. The definition is saved but nothing triggers printing.
**Why it happens:** The original flow relied on the backend webhook to insert print jobs. Since save_definition is now a client tool, the tablet must also enqueue the print job.
**How to avoid:** Add `persistPrintJob()` to `apps/tablet/src/lib/persist.ts` that builds a `PrintPayload` and inserts into `print_queue` with `status: 'pending'`.
**Warning signs:** Definitions appear in Supabase but print_queue stays empty.

### Pitfall 3: usblp Kernel Module Grabs Printer
**What goes wrong:** On Raspberry Pi, the `usblp` kernel module claims the USB printer before python-escpos can access it.
**Why it happens:** Linux default behavior loads `usblp` for any USB printer.
**How to avoid:** POS server's `setup.sh` already handles this: blacklists `usblp` in `/etc/modprobe.d/no-usblp.conf` and runs `sudo rmmod usblp`. On macOS this is not an issue.
**Warning signs:** `USBError: [Errno 13] Access denied` or printer not found.

### Pitfall 4: Python venv Not Activated
**What goes wrong:** pnpm scripts try to run `python print_server.py` but the system Python doesn't have Flask/escpos installed.
**Why it happens:** The POS server requires a Python venv with specific dependencies.
**How to avoid:** pnpm scripts must explicitly use `./venv/bin/python` (absolute path within the app directory). The `setup.sh --deps-only` creates the venv.
**Warning signs:** `ModuleNotFoundError: No module named 'flask'`

### Pitfall 5: Helvetica Font Not Available on Pi
**What goes wrong:** The `helvetica` font style in `config.yaml` references `/System/Library/Fonts/HelveticaNeue.ttc` which only exists on macOS.
**Why it happens:** Font paths are OS-specific.
**How to avoid:** Use `dictionary` style (bundled Burra fonts) on Pi. The `dictionary` style is the default and works everywhere.
**Warning signs:** `OSError: cannot open resource` on font load.

### Pitfall 6: Printer-Bridge Console Mode Masking Issues
**What goes wrong:** In dev/testing, `POS_SERVER_URL` defaults to `http://localhost:9100`. If POS server isn't running, bridge falls back to console mode (logging payload to stdout). Developer thinks printing works but it's just logging.
**Why it happens:** `printer.ts` treats empty URL or "console" as log-only mode. But connection refused to a URL that IS set will throw an error (correct behavior).
**How to avoid:** Explicitly test with POS server running. Use `--dummy` flag on POS server for testing without physical printer hardware.
**Warning signs:** Bridge logs "card printed" but no HTTP request reaches POS server.

### Pitfall 7: session_number Calculation
**What goes wrong:** The backend webhook calculates `session_number` by counting all sessions. The tablet doesn't have this logic. If the tablet inserts print jobs directly, it needs to either count sessions or use a simpler approach.
**Why it happens:** `session_number` is displayed on the printed card (e.g., "Visitor 42"). The tablet doesn't track global session count.
**How to avoid:** Either: (a) count sessions via Supabase query from tablet, or (b) use a simpler sequential counter, or (c) use a Supabase function/trigger to auto-populate. Option (a) is simplest -- the tablet already has a Supabase client.
**Warning signs:** All cards print with session_number=1.

## Code Examples

### Example 1: Insert print_queue row from tablet (NEW CODE NEEDED)
```typescript
// Source: Based on existing persistDefinition() pattern in apps/tablet/src/lib/persist.ts
export async function persistPrintJob(
  definition: { term: string; definition_text: string; citations: string[] | null; language: string },
  sessionId: string | null,
): Promise<void> {
  try {
    const supabase = getSupabaseClient();

    // Count sessions for session_number on the card
    const { count } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true });

    const printPayload = {
      term: definition.term,
      definition_text: definition.definition_text,
      citations: definition.citations ?? [],
      language: definition.language,
      session_number: count ?? 1,
      chain_ref: null,
      timestamp: new Date().toISOString(),
    };

    const { error } = await supabase.from('print_queue').insert({
      session_id: sessionId,
      payload: printPayload as unknown as Record<string, unknown>,
      status: 'pending',
    });

    if (error) {
      console.warn('[Persist] Print job insert error:', error.message);
    } else {
      console.log('[Persist] Print job enqueued for:', definition.term);
    }
  } catch (err) {
    console.warn('[Persist] Print job error:', err);
  }
}
```

### Example 2: RLS Migration for print_queue INSERT (NEW MIGRATION NEEDED)
```sql
-- Source: Pattern from supabase/migrations/007_anon_insert_definitions.sql
-- Allow tablet to insert print jobs directly via anon key
CREATE POLICY "tablet_insert_print_queue"
  ON print_queue
  FOR INSERT
  TO anon
  WITH CHECK (true);
```

### Example 3: pnpm Script for POS Server
```json
// In root package.json
{
  "dev:pos": "cd apps/pos-server && ./venv/bin/python print_server.py --dummy",
  "start:pos": "cd apps/pos-server && ./venv/bin/python print_server.py",
  "setup:pos": "cd apps/pos-server && ./setup.sh --deps-only"
}
```

### Example 4: Existing Bridge POST to POS (ALREADY BUILT)
```typescript
// Source: apps/printer-bridge/src/printer.ts lines 36-55
const body = {
  word: payload.term,            // PrintPayload.term -> POS "word"
  definition: payload.definition_text, // PrintPayload.definition_text -> POS "definition"
  citations: payload.citations,
  language: payload.language,
  session_number: payload.session_number,
  chain_ref: payload.chain_ref,
  timestamp: payload.timestamp,
};
const url = `${posServerUrl.replace(/\/+$/, '')}/print/dictionary`;
```

### Example 5: Test Print via CLI (Verification)
```bash
# Start POS server in dummy mode
cd apps/pos-server && ./venv/bin/python print_server.py --dummy

# In another terminal, test via curl
curl -X POST http://localhost:9100/print/dictionary \
  -H "Content-Type: application/json" \
  -d '{"word":"TEST","definition":"A test definition.","citations":["test citation"]}'

# Or use the printer-bridge test script
cd apps/printer-bridge && pnpm run test-print
```

### Example 6: End-to-End Test via Supabase Insert
```sql
-- Insert a test print job directly in Supabase SQL editor
INSERT INTO print_queue (payload, status)
VALUES (
  '{"term":"VOGEL","definition_text":"Ein Vogel ist ein glucklicher Zufall.","citations":["alles was fliegt"],"language":"de","session_number":1,"chain_ref":null,"timestamp":"2026-03-09T12:00:00Z"}'::jsonb,
  'pending'
);
```

## State of the Art

| Component | Status | What Exists | What's Missing |
|-----------|--------|-------------|----------------|
| print_queue table | COMPLETE | Schema, indexes, RLS read/update, Realtime publication | RLS INSERT policy for anon |
| printer-bridge | COMPLETE | Full subscription, job claiming, HTTP relay, retry, graceful shutdown | Nothing -- ready to use |
| POS server | COMPLETE (external) | Flask server, /print/dictionary, /health, dummy mode, Bonjour | Needs cloning into monorepo |
| Tablet -> print_queue | NOT BUILT | persistDefinition() pattern exists | persistPrintJob() function |
| pnpm scripts | NOT BUILT | dev:printer exists for bridge | dev:pos, start:pos, setup:pos |
| .gitignore | PARTIAL | Has `node_modules/`, `dist/`, `.env` | Needs `venv/`, `__pycache__/`, `*.pyc` |

## Key Integration Details

### POS Server Endpoint Contract
```
POST /print/dictionary
Content-Type: application/json

Required fields: word (string), definition (string)
Optional fields: citations (string[]), qr_url (string), language, session_number, chain_ref, timestamp

Response: {"status": "ok", "template": "dictionary"}
Error: {"error": "message"} with 400/500 status

GET /health
Response: {"status": "running", "dummy": false}
```

### Supabase Realtime Configuration
- Table `print_queue` is already added to `supabase_realtime` publication (migration 004_rls.sql line 87)
- Bridge subscribes to `postgres_changes` with filter `status=eq.pending` (index exists: `idx_print_queue_status`)
- Bridge drains pre-existing pending jobs on startup before subscribing

### POS Server Deployment (Raspberry Pi)
- Pi 3 at `192.168.1.65` (home WiFi) or `10.5.x.x` (eduroam/ETH)
- systemd service: `pos-printer`, auto-restarts on failure
- Project dir on Pi: `/home/stoffel/POS-thermal-printer`
- Update: `cd ~/POS-thermal-printer && git pull origin main && sudo systemctl restart pos-printer`

### Environment Variables
| Variable | Where | Value |
|----------|-------|-------|
| `POS_SERVER_URL` | printer-bridge `.env` | `http://192.168.1.65:9100` (Pi) or `http://localhost:9100` (dev) |
| `SUPABASE_URL` | printer-bridge `.env` | Already configured |
| `SUPABASE_ANON_KEY` | printer-bridge `.env` | Already configured |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.0.5 (printer-bridge), pytest 7.0+ (POS server) |
| Config file | `apps/printer-bridge/package.json` (vitest run --passWithNoTests), POS server has no pytest config |
| Quick run command | `pnpm --filter @meinungeheuer/printer-bridge test` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R5-a | POS server venv creates and deps install | smoke | `cd apps/pos-server && ./setup.sh --deps-only && ./venv/bin/python -c "import flask"` | N/A (setup script) |
| R5-b | POS server /health responds 200 | integration | `cd apps/pos-server && ./venv/bin/python print_server.py --dummy & sleep 2 && curl -s http://localhost:9100/health` | N/A (curl test) |
| R5-c | pnpm dev:pos starts server | smoke | `pnpm dev:pos &` then curl health | N/A (manual) |
| R6-a | PrintPayload -> POS field mapping correct | unit | `pnpm --filter @meinungeheuer/printer-bridge exec vitest run` | No - Wave 0 |
| R6-b | Bridge processes job: pending -> printing -> done | unit | `pnpm --filter @meinungeheuer/printer-bridge exec vitest run` | No - Wave 0 |
| R6-c | RLS allows anon INSERT on print_queue | integration | SQL INSERT via anon key | No - migration test |
| R6-d | Realtime subscription picks up new job | integration | Insert row, observe bridge log | manual-only (requires Supabase connection) |
| R6-e | End-to-end: insert row -> card prints in <10s | e2e | manual-only | manual-only (requires physical printer) |

### Sampling Rate
- **Per task commit:** `pnpm --filter @meinungeheuer/printer-bridge test`
- **Per wave merge:** `pnpm test && pnpm typecheck`
- **Phase gate:** Insert print_queue row -> card prints within 10 seconds (manual verification with physical hardware)

### Wave 0 Gaps
- [ ] `apps/printer-bridge/src/printer.test.ts` -- unit test for printCard() field mapping and console fallback
- [ ] `apps/printer-bridge/src/config.test.ts` -- unit test for loadConfig() defaults
- [ ] `.gitignore` additions for `venv/`, `__pycache__/`, `*.pyc`
- [ ] Supabase migration for anon INSERT on print_queue

## Open Questions

1. **print_queue insertion: tablet vs backend**
   - What we know: CLAUDE.md says backend is "unused legacy." Tablet uses `save_definition` as a client tool. But the backend webhook is the only code that inserts into `print_queue`. The tablet does NOT currently insert print jobs.
   - What's unclear: Should the tablet insert print jobs directly (needs RLS policy + new persist function), or should the backend webhook be revived for this purpose?
   - Recommendation: Tablet inserts directly. This is consistent with the "no backend" architecture. Add RLS policy + `persistPrintJob()`. The backend webhook code can serve as reference for the exact payload shape.

2. **Where to run printer-bridge in production**
   - What we know: Bridge is a Node.js service that connects to Supabase (cloud) and POSTs to POS server (local). It can run on any machine with internet access.
   - What's unclear: Should it run on the same Pi as the POS server, on the laptop, or elsewhere?
   - Recommendation: Run on the Pi alongside POS server. Both services are lightweight. Bridge POSTs to `http://localhost:9100`. This avoids network hops.

3. **POS server: copy files vs git clone**
   - What we know: The POS repo is at `schaferjart/POS-thermal-printer` on GitHub. It has its own `.git` history.
   - What's unclear: Should we `git clone` (preserving history but needing nested git), copy files (losing history), or use subtree merge?
   - Recommendation: Copy the files without `.git/`. The POS server evolves infrequently and the monorepo is the source of truth. For updates, manually sync or re-copy. Add a `UPSTREAM.md` noting the source repo for provenance.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of `apps/printer-bridge/src/` (4 files, complete implementation)
- Direct codebase inspection of `/Users/janos/Desktop/VAKUNST/code/POS/` (POS server, complete implementation)
- Supabase migrations `002_tables.sql`, `003_indexes.sql`, `004_rls.sql` (schema + RLS + Realtime)
- `packages/shared/src/types.ts` (PrintPayload schema, PrintQueueRow schema)
- `apps/tablet/src/hooks/useConversation.ts` (save_definition client tool handler)
- `apps/tablet/src/lib/persist.ts` (persistDefinition pattern, no persistPrintJob)
- `apps/backend/src/routes/webhook.ts` (print_queue insertion reference code)

### Secondary (MEDIUM confidence)
- POS server CLAUDE.md and README.md (deployment notes, Pi setup)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all code directly inspected, both components already built
- Architecture: HIGH - data flow verified through 6 source files across 3 packages
- Pitfalls: HIGH - identified from actual code gaps (missing RLS policy, missing persist function)

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable -- both components are built, integration is mechanical)
