/**
 * Admin Dashboard
 *
 * Access via: ?admin=true (+ optional &secret=... when WEBHOOK_SECRET is set)
 *
 * This is an operator tool — utilitarian white UI, NOT the art aesthetic.
 * Provides:
 *  - Current installation status
 *  - Mode + term switching
 *  - Chain controls
 *  - Definition browser with term filter
 *  - Print test
 */

import { useState, useEffect, useCallback } from 'react';
import { z } from 'zod';
import { APP_NAME, ModeSchema } from '@denkfink/installation-core';
import type { Mode, Definition } from '@denkfink/installation-core';
import { DefinitionSchema } from '@denkfink/installation-core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BACKEND_URL = import.meta.env['VITE_BACKEND_URL'] ?? 'http://localhost:3001';

// Stable empty handler — enables :active CSS on iOS Safari when attached
// to an ancestor via onTouchStart. Arrow fn at module scope avoids re-creation.
const noop = () => {};

// ---------------------------------------------------------------------------
// API response schemas
// ---------------------------------------------------------------------------

const AdminConfigResponseSchema = z.object({
  mode: ModeSchema,
  term: z.string().nullable().optional(),
  chain_context: z
    .object({
      term: z.string(),
      definition_text: z.string(),
      chain_depth: z.number().int().nullable(),
      language: z.string(),
    })
    .nullable()
    .optional(),
});
type AdminConfigResponse = z.infer<typeof AdminConfigResponseSchema>;

const DefinitionsResponseSchema = z.object({
  definitions: z.array(DefinitionSchema.omit({ embedding: true })),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

const ChainNodeSchema = z.object({
  depth: z.number().int(),
  term: z.string(),
  definition_text: z.string(),
  language: z.string(),
  created_at: z.string(),
  session_id: z.string().uuid().nullable(),
});
const ChainResponseSchema = z.object({
  chain: z.array(ChainNodeSchema),
});

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

function authHeader(secret: string): Record<string, string> {
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

async function apiFetch<T>(url: string, opts: RequestInit, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  const json: unknown = await res.json();
  return schema.parse(json);
}

async function fetchAdminConfig(): Promise<AdminConfigResponse> {
  return apiFetch(`${BACKEND_URL}/api/config`, { method: 'GET' }, AdminConfigResponseSchema);
}

async function updateConfig(
  secret: string,
  payload: { mode?: Mode; term?: string },
): Promise<void> {
  await apiFetch(
    `${BACKEND_URL}/api/config/update`,
    {
      method: 'POST',
      headers: authHeader(secret),
      body: JSON.stringify(payload),
    },
    z.object({ success: z.boolean() }),
  );
}

async function fetchDefinitions(
  term: string,
  limit: number,
  offset: number,
): Promise<{ definitions: Omit<Definition, 'embedding'>[]; total: number }> {
  const params = new URLSearchParams();
  if (term) params.set('term', term);
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  const res = await apiFetch(
    `${BACKEND_URL}/api/definitions?${params.toString()}`,
    { method: 'GET' },
    DefinitionsResponseSchema,
  );
  return { definitions: res.definitions, total: res.total };
}

async function fetchChain(): Promise<z.infer<typeof ChainNodeSchema>[]> {
  const res = await apiFetch(
    `${BACKEND_URL}/api/chain`,
    { method: 'GET' },
    ChainResponseSchema,
  );
  return res.chain;
}

async function insertPrintTest(secret: string): Promise<void> {
  await apiFetch(
    `${BACKEND_URL}/api/config/update`,
    {
      method: 'POST',
      headers: authHeader(secret),
      // A config update with mode=term_only and term=TEST as a simple ping
      // Real print test would hit a dedicated endpoint; this confirms auth works
      body: JSON.stringify({}),
    },
    z.object({ success: z.boolean() }),
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Admin() {
  // Grab the secret from the URL if present (e.g. ?admin=true&secret=xxx)
  const urlParams = new URLSearchParams(window.location.search);
  const secret = urlParams.get('secret') ?? '';

  // --- Status state ---
  const [config, setConfig] = useState<AdminConfigResponse | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  // --- Mode switch form ---
  const [draftMode, setDraftMode] = useState<Mode>('term_only');
  const [draftTerm, setDraftTerm] = useState('');
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  // --- Definition browser ---
  const [termFilter, setTermFilter] = useState('');
  const [definitions, setDefinitions] = useState<Omit<Definition, 'embedding'>[]>([]);
  const [defTotal, setDefTotal] = useState(0);
  const [defOffset, setDefOffset] = useState(0);
  const [defLoading, setDefLoading] = useState(false);
  const [defError, setDefError] = useState<string | null>(null);
  const DEF_LIMIT = 20;

  // --- Chain ---
  const [chain, setChain] = useState<z.infer<typeof ChainNodeSchema>[]>([]);
  const [chainLoading, setChainLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);

  // --- Print test ---
  const [printMsg, setPrintMsg] = useState<string | null>(null);

  // Load config on mount
  useEffect(() => {
    setConfigLoading(true);
    fetchAdminConfig()
      .then((cfg) => {
        setConfig(cfg);
        setDraftMode(cfg.mode);
        setDraftTerm(cfg.term ?? '');
      })
      .catch((err: unknown) => {
        setConfigError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => {
        setConfigLoading(false);
      });
  }, []);

  // Load definitions
  const loadDefinitions = useCallback(
    (filter: string, offset: number) => {
      setDefLoading(true);
      setDefError(null);
      fetchDefinitions(filter, DEF_LIMIT, offset)
        .then(({ definitions: defs, total }) => {
          setDefinitions(defs);
          setDefTotal(total);
          setDefOffset(offset);
        })
        .catch((err: unknown) => {
          setDefError(err instanceof Error ? err.message : 'Unknown error');
        })
        .finally(() => {
          setDefLoading(false);
        });
    },
    [],
  );

  useEffect(() => {
    loadDefinitions(termFilter, 0);
  // Load once on mount; user triggers subsequent loads via button
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load chain
  const loadChain = useCallback(() => {
    setChainLoading(true);
    setChainError(null);
    fetchChain()
      .then(setChain)
      .catch((err: unknown) => {
        setChainError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => {
        setChainLoading(false);
      });
  }, []);

  useEffect(() => {
    loadChain();
  }, [loadChain]);

  // Apply config
  function handleApply() {
    setApplyLoading(true);
    setApplyMsg(null);
    const payload: { mode?: Mode; term?: string } = { mode: draftMode };
    if (draftTerm.trim()) payload.term = draftTerm.trim().toUpperCase();
    updateConfig(secret, payload)
      .then(() => {
        setApplyMsg('Config updated successfully.');
        return fetchAdminConfig();
      })
      .then((cfg) => {
        setConfig(cfg);
      })
      .catch((err: unknown) => {
        setApplyMsg(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
      })
      .finally(() => {
        setApplyLoading(false);
      });
  }

  // Reset chain — sets mode back to term_only as a simple reset
  function handleResetChain() {
    if (!window.confirm('Reset chain? This will set mode to term_only and clear chain context.')) return;
    setApplyLoading(true);
    setApplyMsg(null);
    updateConfig(secret, { mode: 'term_only' })
      .then(() => {
        setApplyMsg('Chain reset. Mode set to term_only.');
        return fetchAdminConfig();
      })
      .then((cfg) => {
        setConfig(cfg);
        setDraftMode(cfg.mode);
      })
      .catch((err: unknown) => {
        setApplyMsg(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
      })
      .finally(() => {
        setApplyLoading(false);
      });
  }

  // Print test
  function handlePrintTest() {
    setPrintMsg(null);
    insertPrintTest(secret)
      .then(() => {
        setPrintMsg('Print test sent. Check the printer.');
      })
      .catch((err: unknown) => {
        setPrintMsg(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
      });
  }

  // Definition search
  function handleDefSearch() {
    loadDefinitions(termFilter, 0);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    // fixed + overflow-y-auto overrides the global `html, body, #root { overflow: hidden }`
    // set in index.css for the kiosk installation — without this, admin cannot scroll on mobile.
    // onTouchStart: empty handler enables :active CSS pseudo-class on iOS Safari.
    // Without it, all active: Tailwind classes silently fail on touch devices.
    <div
      className="fixed inset-0 overflow-y-auto overflow-x-hidden bg-white text-gray-900 font-sans"
      onTouchStart={noop}
    >
      {/* Header */}
      <header className="border-b border-gray-300 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
        <h1 className="text-base sm:text-xl font-bold tracking-wide shrink-0">{APP_NAME} — Admin</h1>
        <span className="text-[10px] sm:text-sm text-gray-500 truncate font-mono">{BACKEND_URL}</span>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8 sm:space-y-10">
        {/* ---------------------------------------------------------------- */}
        {/* Current Status                                                    */}
        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="text-lg font-semibold mb-3 border-b border-gray-200 pb-1">
            Current Status
          </h2>

          {configLoading && <p className="text-sm text-gray-500">Loading config...</p>}
          {configError && (
            <p className="text-sm text-red-600 bg-red-50 rounded p-2">{configError}</p>
          )}

          {config && !configLoading && (
            <dl className="grid grid-cols-2 gap-x-4 sm:gap-x-8 gap-y-3 text-sm">
              <div className="min-w-0">
                <dt className="font-medium text-gray-500 uppercase text-xs tracking-wider">Mode</dt>
                <dd className="mt-0.5 font-mono text-base truncate">{config.mode}</dd>
              </div>
              <div className="min-w-0">
                <dt className="font-medium text-gray-500 uppercase text-xs tracking-wider">Term</dt>
                <dd className="mt-0.5 font-mono text-base truncate">{config.term ?? '—'}</dd>
              </div>
              {config.chain_context && (
                <>
                  <div className="min-w-0">
                    <dt className="font-medium text-gray-500 uppercase text-xs tracking-wider">
                      Chain Depth
                    </dt>
                    <dd className="mt-0.5 font-mono text-base">
                      {config.chain_context.chain_depth ?? 0}
                    </dd>
                  </div>
                  <div className="col-span-2 min-w-0">
                    <dt className="font-medium text-gray-500 uppercase text-xs tracking-wider">
                      Current Chain Context
                    </dt>
                    <dd className="mt-0.5 text-sm text-gray-700 bg-gray-50 rounded p-2 break-words">
                      <span className="font-semibold">{config.chain_context.term}:</span>{' '}
                      {config.chain_context.definition_text}
                    </dd>
                  </div>
                </>
              )}
            </dl>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Mode Switch                                                        */}
        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="text-lg font-semibold mb-3 border-b border-gray-200 pb-1">
            Mode Switch
          </h2>

          <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2 sm:gap-3 mb-4">
            {(['text_term', 'term_only', 'chain'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setDraftMode(m)}
                className={`px-4 py-3 sm:py-2 rounded border text-sm font-mono transition-colors text-left sm:text-center ${
                  draftMode === m
                    ? 'bg-black text-white border-black active:bg-gray-700'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500 active:bg-gray-100'
                }`}
              >
                {m === 'text_term' ? 'Mode A: Text + Term' : m === 'term_only' ? 'Mode B: Term Only' : 'Mode C: Chain'}
              </button>
            ))}
          </div>

          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
              Term (leave blank to keep current)
            </label>
            <input
              type="text"
              value={draftTerm}
              onChange={(e) => setDraftTerm(e.target.value)}
              placeholder="e.g. BIRD"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="w-full border border-gray-300 rounded px-3 py-3 sm:py-2 text-base sm:text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <button
              type="button"
              onClick={handleApply}
              disabled={applyLoading}
              className="px-5 py-3 sm:py-2 bg-black text-white text-sm rounded hover:bg-gray-800 active:bg-gray-700 disabled:opacity-50 transition-colors min-w-[96px]"
            >
              {applyLoading ? 'Applying...' : 'Apply'}
            </button>

            {applyMsg && (
              <span
                className={`text-sm break-words min-w-0 flex-1 ${
                  applyMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'
                }`}
              >
                {applyMsg}
              </span>
            )}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Chain Controls                                                     */}
        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="text-lg font-semibold mb-3 border-b border-gray-200 pb-1">
            Chain Controls
          </h2>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm w-full sm:w-auto">
              <span className="text-gray-500 uppercase text-xs font-medium tracking-wider">
                Chain depth:{' '}
              </span>
              <span className="font-mono font-semibold">
                {chainLoading ? '...' : chain.length}
              </span>
            </div>

            <button
              type="button"
              onClick={handleResetChain}
              disabled={applyLoading}
              className="px-4 py-3 sm:py-2 border border-red-400 text-red-600 text-sm rounded hover:bg-red-50 active:bg-red-100 disabled:opacity-50 transition-colors flex-1 sm:flex-initial"
            >
              Reset Chain
            </button>

            <button
              type="button"
              onClick={loadChain}
              disabled={chainLoading}
              className="px-4 py-3 sm:py-2 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 transition-colors flex-1 sm:flex-initial"
            >
              {chainLoading ? 'Loading...' : 'Refresh Chain'}
            </button>
          </div>

          {chainError && (
            <p className="mt-2 text-sm text-red-600 bg-red-50 rounded p-2 break-words">{chainError}</p>
          )}

          {chain.length > 0 && (
            <div className="mt-4 overflow-auto max-h-64 sm:max-h-48 border border-gray-200 rounded -mx-4 sm:mx-0">
              <table className="min-w-full text-xs font-mono">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium">#</th>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium">Term</th>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium hidden sm:table-cell">Lang</th>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium">Definition (excerpt)</th>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium hidden sm:table-cell">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {chain.map((node, i) => (
                    <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-gray-400">{node.depth}</td>
                      <td className="px-3 py-1.5 font-semibold whitespace-nowrap">{node.term}</td>
                      <td className="px-3 py-1.5 text-gray-500 hidden sm:table-cell">{node.language}</td>
                      <td className="px-3 py-1.5 text-gray-700 max-w-[14rem] sm:max-w-xs truncate">
                        {node.definition_text}
                      </td>
                      <td className="px-3 py-1.5 text-gray-400 hidden sm:table-cell whitespace-nowrap">
                        {new Date(node.created_at).toLocaleString('de-DE', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Definition Browser                                                 */}
        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="text-lg font-semibold mb-3 border-b border-gray-200 pb-1">
            Definition Browser
          </h2>

          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              type="text"
              value={termFilter}
              onChange={(e) => setTermFilter(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleDefSearch(); }}
              placeholder="Filter by term (e.g. BIRD)"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 min-w-0 border border-gray-300 rounded px-3 py-3 sm:py-2 text-base sm:text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-black"
            />
            <button
              type="button"
              onClick={handleDefSearch}
              disabled={defLoading}
              className="px-4 py-3 sm:py-2 bg-black text-white text-sm rounded hover:bg-gray-800 active:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {defLoading ? 'Searching...' : 'Search'}
            </button>
          </div>

          {defError && (
            <p className="text-sm text-red-600 bg-red-50 rounded p-2 mb-3 break-words">{defError}</p>
          )}

          <p className="text-xs text-gray-500 mb-2">
            Showing {definitions.length} of {defTotal} definitions
          </p>

          <div className="overflow-auto max-h-[60vh] sm:max-h-80 border border-gray-200 rounded -mx-4 sm:mx-0">
            {definitions.length === 0 && !defLoading && (
              <p className="text-sm text-gray-400 p-4 text-center">No definitions found.</p>
            )}
            {definitions.length > 0 && (
              <table className="min-w-full text-xs font-mono">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium">Term</th>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium hidden sm:table-cell">Lang</th>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium hidden sm:table-cell">Depth</th>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium">Definition</th>
                    <th className="text-left px-3 py-2 text-gray-500 font-medium hidden sm:table-cell">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {definitions.map((def) => (
                    <tr key={def.id} className="border-t border-gray-100 hover:bg-gray-50 align-top">
                      <td className="px-3 py-1.5 font-semibold whitespace-nowrap">{def.term}</td>
                      <td className="px-3 py-1.5 text-gray-500 hidden sm:table-cell">{def.language}</td>
                      <td className="px-3 py-1.5 text-gray-400 hidden sm:table-cell">{def.chain_depth ?? 0}</td>
                      <td className="px-3 py-1.5 text-gray-700 max-w-[14rem] sm:max-w-xs">
                        <ExpandableText text={def.definition_text} />
                      </td>
                      <td className="px-3 py-1.5 text-gray-400 whitespace-nowrap hidden sm:table-cell">
                        {new Date(def.created_at).toLocaleString('de-DE', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {defTotal > DEF_LIMIT && (
            <div className="flex gap-3 mt-3 items-center justify-between">
              <button
                type="button"
                onClick={() => loadDefinitions(termFilter, Math.max(0, defOffset - DEF_LIMIT))}
                disabled={defOffset === 0 || defLoading}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50 active:bg-gray-100 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-gray-500 text-center shrink-0">
                Page {Math.floor(defOffset / DEF_LIMIT) + 1} of{' '}
                {Math.ceil(defTotal / DEF_LIMIT)}
              </span>
              <button
                type="button"
                onClick={() => loadDefinitions(termFilter, defOffset + DEF_LIMIT)}
                disabled={defOffset + DEF_LIMIT >= defTotal || defLoading}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50 active:bg-gray-100 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Print Test                                                         */}
        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="text-lg font-semibold mb-3 border-b border-gray-200 pb-1">
            Print Test
          </h2>

          <p className="text-sm text-gray-600 mb-3">
            Inserts a test job into the print queue. The printer bridge will pick it up within seconds if connected.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handlePrintTest}
              className="px-5 py-3 sm:py-2 border border-gray-400 text-gray-700 text-sm rounded hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              Send Print Test
            </button>

            {printMsg && (
              <span
                className={`text-sm break-words min-w-0 flex-1 ${
                  printMsg.startsWith('Error') ? 'text-red-600' : 'text-green-600'
                }`}
              >
                {printMsg}
              </span>
            )}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Footer                                                             */}
        {/* ---------------------------------------------------------------- */}
        <footer className="border-t border-gray-200 pt-4 text-xs text-gray-400">
          {APP_NAME} Admin — {new Date().toLocaleDateString('de-DE')}
        </footer>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small helper: expandable definition text
// ---------------------------------------------------------------------------

function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const SHORT_LEN = 80;

  if (text.length <= SHORT_LEN) return <span>{text}</span>;

  return (
    <span>
      {expanded ? text : `${text.slice(0, SHORT_LEN)}...`}{' '}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-blue-500 underline ml-1 py-2 -my-2 px-1 active:text-blue-700"
      >
        {expanded ? 'less' : 'more'}
      </button>
    </span>
  );
}
