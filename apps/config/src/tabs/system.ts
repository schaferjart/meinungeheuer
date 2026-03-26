/**
 * system.ts — System configuration tab.
 *
 * Four collapsible sections:
 * 1. Service URLs (backend_url, pos_server_url, print_renderer_url)
 * 2. API Keys & Secrets (secrets table)
 * 3. Service Health (live checks + recent print jobs)
 * 4. Display Styling (karaoke reader appearance)
 */

import {
  createTextInput,
  createSlider,
  createColorPicker,
  createSection,
  createSaveButton,
} from '../lib/forms.js';
import { supabase } from '../lib/supabase.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface InstallationConfigUrls {
  id: string;
  backend_url: string | null;
  pos_server_url: string | null;
  print_renderer_url: string | null;
  display_highlight_color: string;
  display_spoken_opacity: number;
  display_upcoming_opacity: number;
  display_font_size: string;
  display_line_height: number;
  display_letter_spacing: string;
  display_max_width: string;
}

interface Secrets {
  elevenlabs_api_key: string | null;
  elevenlabs_api_key_server: string | null;
  openrouter_api_key: string | null;
  webhook_secret: string | null;
  n8n_webhook_url: string | null;
  render_api_key: string | null;
}

interface PrintJob {
  id: string;
  status: string;
  printed_at: string | null;
  payload: Record<string, unknown> | null;
}

type HealthStatus = 'checking' | 'online' | 'offline' | 'cors';

interface ServiceHealth {
  status: HealthStatus;
  detail: string;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const CONFIG_ID = '00000000-0000-0000-0000-000000000000';

const URL_DEFAULTS = {
  backend_url: '',
  pos_server_url: '',
  print_renderer_url: '',
};

const DISPLAY_DEFAULTS = {
  display_highlight_color: '#fcd34d',
  display_spoken_opacity: 0.4,
  display_upcoming_opacity: 0.9,
  display_font_size: 'clamp(1.2rem, 3vw, 1.8rem)',
  display_line_height: 1.8,
  display_letter_spacing: '0.02em',
  display_max_width: '700px',
};

const SECRETS_DEFAULTS: Secrets = {
  elevenlabs_api_key: '',
  elevenlabs_api_key_server: '',
  openrouter_api_key: '',
  webhook_secret: '',
  n8n_webhook_url: '',
  render_api_key: '',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function injectSystemStyles(): void {
  if (document.getElementById('cf-system-styles')) return;
  const style = document.createElement('style');
  style.id = 'cf-system-styles';
  style.textContent = `
    .cf-status-msg {
      font-size: 12px;
      min-height: 18px;
      font-family: Helvetica, 'Helvetica Neue', Arial, sans-serif;
      color: #777777;
      margin-bottom: 12px;
    }
    .cf-password-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 14px;
    }
    .cf-password-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #777777;
    }
    .cf-password-input {
      padding: 8px 10px;
      background: #0a0a0a;
      color: #e0e0e0;
      border: 1px solid #2a2a2a;
      border-radius: 5px;
      font-size: 13px;
      font-family: Helvetica, 'Helvetica Neue', Arial, sans-serif;
      outline: none;
      transition: border-color 0.15s;
      width: 100%;
      box-sizing: border-box;
    }
    .cf-password-input:focus {
      border-color: #ffffff;
    }
    .cf-health-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 12px;
      font-size: 13px;
      font-family: Helvetica, 'Helvetica Neue', Arial, sans-serif;
    }
    .cf-health-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
      margin-top: 3px;
    }
    .cf-health-dot.checking { background: #f5a623; }
    .cf-health-dot.online   { background: #5bba6f; }
    .cf-health-dot.offline  { background: #e05b5b; }
    .cf-health-dot.cors     { background: #f5a623; }
    .cf-health-info { flex: 1; }
    .cf-health-name {
      color: #e0e0e0;
      font-weight: 600;
      margin-bottom: 2px;
    }
    .cf-health-detail {
      color: #777777;
      font-size: 12px;
      line-height: 1.4;
    }
    .cf-refresh-btn {
      padding: 6px 14px;
      background: transparent;
      color: #777777;
      border: 1px solid #2a2a2a;
      border-radius: 5px;
      font-size: 12px;
      font-family: Helvetica, 'Helvetica Neue', Arial, sans-serif;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
      margin-bottom: 16px;
    }
    .cf-refresh-btn:hover {
      color: #e0e0e0;
      border-color: #ffffff;
    }
    .cf-print-jobs-title {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #777777;
      margin-bottom: 8px;
    }
    .cf-print-job-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 0;
      border-bottom: 1px solid #141414;
      font-size: 12px;
      font-family: Helvetica, 'Helvetica Neue', Arial, sans-serif;
    }
    .cf-print-job-row:last-child { border-bottom: none; }
    .cf-pj-id   { color: #777777; font-variant-numeric: tabular-nums; width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cf-pj-status {
      width: 70px;
      font-weight: 600;
    }
    .cf-pj-status.pending   { color: #f5a623; }
    .cf-pj-status.printing  { color: #ffffff; }
    .cf-pj-status.done      { color: #5bba6f; }
    .cf-pj-status.failed    { color: #e05b5b; }
    .cf-pj-time { color: #777777; flex: 1; }
    .cf-pj-word { color: #e0e0e0; }
  `;
  document.head.appendChild(style);
}

function createPasswordInput(
  label: string,
  value: string,
  onChange: (v: string) => void
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'cf-password-field';

  const labelEl = document.createElement('label');
  labelEl.className = 'cf-password-label';
  labelEl.textContent = label;

  const input = document.createElement('input');
  input.type = 'password';
  input.className = 'cf-password-input';
  input.value = value;
  input.autocomplete = 'off';

  const id = `cf-pw-${Math.random().toString(36).slice(2)}`;
  input.id = id;
  labelEl.htmlFor = id;

  input.addEventListener('input', () => onChange(input.value));

  wrapper.appendChild(labelEl);
  wrapper.appendChild(input);
  return wrapper;
}

function makeStatusEl(): { el: HTMLElement; set: (msg: string, color?: string) => void } {
  const el = document.createElement('div');
  el.className = 'cf-status-msg';
  function set(msg: string, color = '#777777'): void {
    el.textContent = msg;
    el.style.color = color;
  }
  return { el, set };
}

// ── Health check ──────────────────────────────────────────────────────────────

async function checkService(url: string): Promise<ServiceHealth> {
  if (!url) return { status: 'offline', detail: 'URL not configured' };
  try {
    const res = await fetch(url + '/health', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { status: 'offline', detail: `HTTP ${res.status}` };
    let detail = 'ok';
    try {
      const json = await res.json() as Record<string, unknown>;
      const parts: string[] = [];
      if (typeof json['status'] === 'string') parts.push(json['status']);
      if (typeof json['uptime'] === 'number') parts.push(`uptime ${Math.round(json['uptime'] as number)}s`);
      if (typeof json['printer'] === 'string') parts.push(`printer: ${json['printer']}`);
      if (typeof json['last_print'] === 'string') parts.push(`last print: ${json['last_print']}`);
      if (parts.length) detail = parts.join(' · ');
    } catch {
      // not JSON, plain text response is fine
    }
    return { status: 'online', detail };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('NetworkError') || msg.includes('Failed to fetch') || msg.includes('CORS')) {
      return { status: 'cors', detail: 'CORS blocked or unreachable' };
    }
    if (msg.includes('timeout') || msg.includes('aborted')) {
      return { status: 'offline', detail: 'Timed out (5s)' };
    }
    return { status: 'offline', detail: msg.slice(0, 80) };
  }
}

// ── Main render ───────────────────────────────────────────────────────────────

export function render(container: HTMLElement): void {
  injectSystemStyles();
  container.innerHTML = '';

  // State
  let configId = CONFIG_ID;
  let urlForm = { ...URL_DEFAULTS };
  let displayForm = { ...DISPLAY_DEFAULTS };
  let secretsForm = { ...SECRETS_DEFAULTS };
  let healthRefreshTimer: ReturnType<typeof setInterval> | null = null;

  // Health section refs (populated after build)
  let healthUrlsRef = { pos: '', renderer: '' };

  // Loading indicator
  const loadingEl = document.createElement('div');
  loadingEl.textContent = 'Loading...';
  loadingEl.style.cssText = 'color:#777777;font-size:14px;font-family:Helvetica,'Helvetica Neue',Arial,sans-serif;';
  container.appendChild(loadingEl);

  // ── Build UI ────────────────────────────────────────────────────────────────

  function buildUI(): void {
    // Clean up previous refresh timer if re-rendering
    if (healthRefreshTimer !== null) {
      clearInterval(healthRefreshTimer);
      healthRefreshTimer = null;
    }

    container.innerHTML = '';

    // ── Section 1: Service URLs ─────────────────────────────────────────────

    const { section: sec1, body: body1 } = createSection('Service URLs');

    const { el: urlStatus, set: setUrlStatus } = makeStatusEl();

    body1.appendChild(
      createTextInput('Backend URL', urlForm.backend_url, (v) => { urlForm.backend_url = v; })
    );
    body1.appendChild(
      createTextInput('POS server URL', urlForm.pos_server_url, (v) => {
        urlForm.pos_server_url = v;
        healthUrlsRef.pos = v;
      })
    );
    body1.appendChild(
      createTextInput('Print renderer URL', urlForm.print_renderer_url, (v) => {
        urlForm.print_renderer_url = v;
        healthUrlsRef.renderer = v;
      })
    );

    body1.appendChild(urlStatus);

    const urlSaveBtn = createSaveButton('Save Service URLs', () => {
      void saveUrls(urlSaveBtn, setUrlStatus);
    });
    body1.appendChild(urlSaveBtn);

    container.appendChild(sec1);

    // ── Section 2: API Keys & Secrets ────────────────────────────────────────

    const { section: sec2, body: body2 } = createSection('API Keys & Secrets', true);

    const { el: secretsStatus, set: setSecretsStatus } = makeStatusEl();

    const noteEl = document.createElement('p');
    noteEl.textContent = 'Stored in the secrets table (authenticated access only). Values are write-only once saved.';
    noteEl.style.cssText = 'font-size:12px;color:#777777;margin-bottom:14px;line-height:1.5;font-family:Helvetica,'Helvetica Neue',Arial,sans-serif;';
    body2.appendChild(noteEl);

    body2.appendChild(
      createPasswordInput('ElevenLabs API key (client)', secretsForm.elevenlabs_api_key ?? '', (v) => {
        secretsForm.elevenlabs_api_key = v;
      })
    );
    body2.appendChild(
      createPasswordInput('ElevenLabs API key (server)', secretsForm.elevenlabs_api_key_server ?? '', (v) => {
        secretsForm.elevenlabs_api_key_server = v;
      })
    );
    body2.appendChild(
      createPasswordInput('OpenRouter API key', secretsForm.openrouter_api_key ?? '', (v) => {
        secretsForm.openrouter_api_key = v;
      })
    );
    body2.appendChild(
      createPasswordInput('Webhook secret', secretsForm.webhook_secret ?? '', (v) => {
        secretsForm.webhook_secret = v;
      })
    );

    // n8n webhook URL is a regular text input (not a secret per se, but in same table)
    body2.appendChild(
      createTextInput('n8n webhook URL', secretsForm.n8n_webhook_url ?? '', (v) => {
        secretsForm.n8n_webhook_url = v;
      })
    );

    body2.appendChild(
      createPasswordInput('Render API key', secretsForm.render_api_key ?? '', (v) => {
        secretsForm.render_api_key = v;
      })
    );

    body2.appendChild(secretsStatus);

    const secretsSaveBtn = createSaveButton('Save API Keys', () => {
      void saveSecrets(secretsSaveBtn, setSecretsStatus);
    });
    body2.appendChild(secretsSaveBtn);

    container.appendChild(sec2);

    // ── Section 3: Service Health ────────────────────────────────────────────

    const { section: sec3, body: body3 } = createSection('Service Health', true);

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'cf-refresh-btn';
    refreshBtn.textContent = 'Refresh';
    refreshBtn.addEventListener('click', () => {
      void renderHealthChecks(body3);
    });
    body3.appendChild(refreshBtn);

    // Health rows container
    const healthRows = document.createElement('div');
    healthRows.id = 'cf-health-rows';
    body3.appendChild(healthRows);

    // Print jobs section
    const pjTitle = document.createElement('div');
    pjTitle.className = 'cf-print-jobs-title';
    pjTitle.textContent = 'Recent print jobs';
    pjTitle.style.marginTop = '20px';
    body3.appendChild(pjTitle);

    const pjContainer = document.createElement('div');
    pjContainer.id = 'cf-print-jobs';
    body3.appendChild(pjContainer);

    // Initial load
    void renderHealthChecks(body3);

    // Auto-refresh every 30s
    healthRefreshTimer = setInterval(() => {
      void renderHealthChecks(body3);
    }, 30000);

    container.appendChild(sec3);

    // ── Section 4: Display Styling ───────────────────────────────────────────

    const { section: sec4, body: body4 } = createSection('Display Styling', true);

    const { el: displayStatus, set: setDisplayStatus } = makeStatusEl();

    const displayNote = document.createElement('p');
    displayNote.textContent = 'Controls karaoke text reader appearance on the tablet.';
    displayNote.style.cssText = 'font-size:12px;color:#777777;margin-bottom:14px;line-height:1.5;font-family:Helvetica,'Helvetica Neue',Arial,sans-serif;';
    body4.appendChild(displayNote);

    body4.appendChild(
      createColorPicker('Highlight color', displayForm.display_highlight_color, (v) => {
        displayForm.display_highlight_color = v;
      })
    );

    const spokenSlider = createSlider(
      'Spoken word opacity',
      0, 1, 0.05, displayForm.display_spoken_opacity,
      (v) => { displayForm.display_spoken_opacity = v; }
    );
    // Override display to show decimal
    overrideSliderDisplay(spokenSlider, displayForm.display_spoken_opacity, (v) => v.toFixed(2));
    body4.appendChild(spokenSlider);

    const upcomingSlider = createSlider(
      'Upcoming word opacity',
      0, 1, 0.05, displayForm.display_upcoming_opacity,
      (v) => { displayForm.display_upcoming_opacity = v; }
    );
    overrideSliderDisplay(upcomingSlider, displayForm.display_upcoming_opacity, (v) => v.toFixed(2));
    body4.appendChild(upcomingSlider);

    body4.appendChild(
      createTextInput('Font size', displayForm.display_font_size, (v) => {
        displayForm.display_font_size = v;
      })
    );

    const lineHeightSlider = createSlider(
      'Line height',
      1.0, 3.0, 0.1, displayForm.display_line_height,
      (v) => { displayForm.display_line_height = v; }
    );
    overrideSliderDisplay(lineHeightSlider, displayForm.display_line_height, (v) => v.toFixed(1));
    body4.appendChild(lineHeightSlider);

    body4.appendChild(
      createTextInput('Letter spacing', displayForm.display_letter_spacing, (v) => {
        displayForm.display_letter_spacing = v;
      })
    );

    body4.appendChild(
      createTextInput('Max width', displayForm.display_max_width, (v) => {
        displayForm.display_max_width = v;
      })
    );

    body4.appendChild(displayStatus);

    const displaySaveBtn = createSaveButton('Save Display Styling', () => {
      void saveDisplay(displaySaveBtn, setDisplayStatus);
    });
    body4.appendChild(displaySaveBtn);

    container.appendChild(sec4);
  }

  // ── Slider display override ───────────────────────────────────────────────

  function overrideSliderDisplay(
    sliderEl: HTMLElement,
    initial: number,
    fmt: (v: number) => string
  ): void {
    const display = sliderEl.querySelector<HTMLSpanElement>('.cf-slider-value');
    const input = sliderEl.querySelector<HTMLInputElement>('input[type="range"]');
    if (display) display.textContent = fmt(initial);
    if (input && display) {
      input.addEventListener('input', () => {
        display.textContent = fmt(Number(input.value));
      });
    }
  }

  // ── Health checks ─────────────────────────────────────────────────────────

  async function renderHealthChecks(body: HTMLElement): Promise<void> {
    const rowsContainer = body.querySelector<HTMLElement>('#cf-health-rows');
    const pjContainer = body.querySelector<HTMLElement>('#cf-print-jobs');
    if (!rowsContainer) return;

    // Clear and show checking state
    rowsContainer.innerHTML = '';

    const services: Array<{ name: string; url: string; key: string }> = [
      { name: 'POS server', url: healthUrlsRef.pos, key: 'pos' },
      { name: 'Print renderer', url: healthUrlsRef.renderer, key: 'renderer' },
    ];

    // Create rows with "checking" state first
    const rowEls: Map<string, { dot: HTMLElement; detail: HTMLElement }> = new Map();

    for (const svc of services) {
      const row = document.createElement('div');
      row.className = 'cf-health-row';

      const dot = document.createElement('div');
      dot.className = 'cf-health-dot checking';

      const info = document.createElement('div');
      info.className = 'cf-health-info';

      const name = document.createElement('div');
      name.className = 'cf-health-name';
      name.textContent = svc.name;

      const detail = document.createElement('div');
      detail.className = 'cf-health-detail';
      detail.textContent = 'Checking...';

      info.appendChild(name);
      info.appendChild(detail);
      row.appendChild(dot);
      row.appendChild(info);
      rowsContainer.appendChild(row);

      rowEls.set(svc.key, { dot, detail });
    }

    // Supabase is always "online" if we got this far
    const supabaseRow = document.createElement('div');
    supabaseRow.className = 'cf-health-row';
    const supabaseDot = document.createElement('div');
    supabaseDot.className = 'cf-health-dot online';
    const supabaseInfo = document.createElement('div');
    supabaseInfo.className = 'cf-health-info';
    const supabaseName = document.createElement('div');
    supabaseName.className = 'cf-health-name';
    supabaseName.textContent = 'Supabase';
    const supabaseDetail = document.createElement('div');
    supabaseDetail.className = 'cf-health-detail';
    supabaseDetail.textContent = 'Connected (page loaded successfully)';
    supabaseInfo.appendChild(supabaseName);
    supabaseInfo.appendChild(supabaseDetail);
    supabaseRow.appendChild(supabaseDot);
    supabaseRow.appendChild(supabaseInfo);
    rowsContainer.appendChild(supabaseRow);

    // Run checks in parallel
    const results = await Promise.all(
      services.map((svc) => checkService(svc.url))
    );

    for (let i = 0; i < services.length; i++) {
      const svc = services[i];
      const result = results[i];
      const els = rowEls.get(svc!.key);
      if (!els || !result || !svc) continue;

      els.dot.className = `cf-health-dot ${result.status}`;
      els.detail.textContent = result.detail;
    }

    // Fetch recent print jobs
    if (pjContainer) {
      await renderPrintJobs(pjContainer);
    }
  }

  async function renderPrintJobs(container: HTMLElement): Promise<void> {
    container.innerHTML = '';

    const { data, error } = await supabase
      .from('print_queue')
      .select('id, status, printed_at, payload')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      const errEl = document.createElement('div');
      errEl.style.cssText = 'font-size:12px;color:#e05b5b;font-family:Helvetica,'Helvetica Neue',Arial,sans-serif;';
      errEl.textContent = 'Failed to load print jobs: ' + error.message;
      container.appendChild(errEl);
      return;
    }

    if (!data || data.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.style.cssText = 'font-size:12px;color:#777777;font-family:Helvetica,'Helvetica Neue',Arial,sans-serif;';
      emptyEl.textContent = 'No print jobs found.';
      container.appendChild(emptyEl);
      return;
    }

    for (const job of data as PrintJob[]) {
      const row = document.createElement('div');
      row.className = 'cf-print-job-row';

      const idEl = document.createElement('span');
      idEl.className = 'cf-pj-id';
      idEl.textContent = job.id.slice(0, 8);
      idEl.title = job.id;

      const statusEl = document.createElement('span');
      statusEl.className = `cf-pj-status ${job.status}`;
      statusEl.textContent = job.status;

      const timeEl = document.createElement('span');
      timeEl.className = 'cf-pj-time';
      timeEl.textContent = job.printed_at
        ? new Date(job.printed_at).toLocaleString()
        : '—';

      // Extract word/term from payload if present
      const wordEl = document.createElement('span');
      wordEl.className = 'cf-pj-word';
      if (job.payload && typeof job.payload === 'object') {
        const word = job.payload['word'] ?? job.payload['term'] ?? '';
        wordEl.textContent = typeof word === 'string' ? word : '';
      }

      row.appendChild(idEl);
      row.appendChild(statusEl);
      row.appendChild(timeEl);
      row.appendChild(wordEl);
      container.appendChild(row);
    }
  }

  // ── Save handlers ─────────────────────────────────────────────────────────

  async function saveUrls(
    btn: HTMLElement,
    setStatus: (msg: string, color?: string) => void
  ): Promise<void> {
    const btnEl = btn as HTMLButtonElement;
    btnEl.disabled = true;
    setStatus('Saving...', '#777777');

    const payload = {
      backend_url: urlForm.backend_url || null,
      pos_server_url: urlForm.pos_server_url || null,
      print_renderer_url: urlForm.print_renderer_url || null,
    };

    const { error } = await supabase
      .from('installation_config')
      .update(payload)
      .eq('id', configId);

    if (error) {
      console.error('[system] saveUrls error:', error);
      setStatus('Save failed: ' + error.message, '#e05b5b');
    } else {
      setStatus('Saved.', '#5bba6f');
      // Update health check URLs
      healthUrlsRef.pos = urlForm.pos_server_url;
      healthUrlsRef.renderer = urlForm.print_renderer_url;
    }

    btnEl.disabled = false;
  }

  async function saveSecrets(
    btn: HTMLElement,
    setStatus: (msg: string, color?: string) => void
  ): Promise<void> {
    const btnEl = btn as HTMLButtonElement;
    btnEl.disabled = true;
    setStatus('Saving...', '#777777');

    // Only include fields that have a non-empty value to avoid overwriting with blanks
    const payload: Partial<Secrets> = {};
    if (secretsForm.elevenlabs_api_key) payload.elevenlabs_api_key = secretsForm.elevenlabs_api_key;
    if (secretsForm.elevenlabs_api_key_server) payload.elevenlabs_api_key_server = secretsForm.elevenlabs_api_key_server;
    if (secretsForm.openrouter_api_key) payload.openrouter_api_key = secretsForm.openrouter_api_key;
    if (secretsForm.webhook_secret) payload.webhook_secret = secretsForm.webhook_secret;
    if (secretsForm.n8n_webhook_url !== null) payload.n8n_webhook_url = secretsForm.n8n_webhook_url || null;
    if (secretsForm.render_api_key) payload.render_api_key = secretsForm.render_api_key;

    const { error } = await supabase
      .from('secrets')
      .upsert({ id: true, ...payload })
      .eq('id', true);

    if (error) {
      console.error('[system] saveSecrets error:', error);
      setStatus('Save failed: ' + error.message, '#e05b5b');
    } else {
      setStatus('Saved.', '#5bba6f');
    }

    btnEl.disabled = false;
  }

  async function saveDisplay(
    btn: HTMLElement,
    setStatus: (msg: string, color?: string) => void
  ): Promise<void> {
    const btnEl = btn as HTMLButtonElement;
    btnEl.disabled = true;
    setStatus('Saving...', '#777777');

    const payload = {
      display_highlight_color: displayForm.display_highlight_color,
      display_spoken_opacity: displayForm.display_spoken_opacity,
      display_upcoming_opacity: displayForm.display_upcoming_opacity,
      display_font_size: displayForm.display_font_size,
      display_line_height: displayForm.display_line_height,
      display_letter_spacing: displayForm.display_letter_spacing,
      display_max_width: displayForm.display_max_width,
    };

    const { error } = await supabase
      .from('installation_config')
      .update(payload)
      .eq('id', configId);

    if (error) {
      console.error('[system] saveDisplay error:', error);
      setStatus('Save failed: ' + error.message, '#e05b5b');
    } else {
      setStatus('Saved.', '#5bba6f');
    }

    btnEl.disabled = false;
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  async function loadAndRender(): Promise<void> {
    const [configResult, secretsResult] = await Promise.all([
      supabase
        .from('installation_config')
        .select(
          'id, backend_url, pos_server_url, print_renderer_url, ' +
          'display_highlight_color, display_spoken_opacity, display_upcoming_opacity, ' +
          'display_font_size, display_line_height, display_letter_spacing, display_max_width'
        )
        .limit(1)
        .single(),
      supabase
        .from('secrets')
        .select('elevenlabs_api_key, elevenlabs_api_key_server, openrouter_api_key, webhook_secret, n8n_webhook_url, render_api_key')
        .eq('id', true)
        .single(),
    ]);

    if (configResult.error) {
      console.warn('[system] config fetch error:', configResult.error.message);
    } else if (configResult.data) {
      const c = configResult.data as unknown as InstallationConfigUrls;
      configId = c.id;
      urlForm.backend_url = c.backend_url ?? '';
      urlForm.pos_server_url = c.pos_server_url ?? '';
      urlForm.print_renderer_url = c.print_renderer_url ?? '';
      healthUrlsRef.pos = urlForm.pos_server_url;
      healthUrlsRef.renderer = urlForm.print_renderer_url;

      displayForm.display_highlight_color = c.display_highlight_color ?? DISPLAY_DEFAULTS.display_highlight_color;
      displayForm.display_spoken_opacity = c.display_spoken_opacity ?? DISPLAY_DEFAULTS.display_spoken_opacity;
      displayForm.display_upcoming_opacity = c.display_upcoming_opacity ?? DISPLAY_DEFAULTS.display_upcoming_opacity;
      displayForm.display_font_size = c.display_font_size ?? DISPLAY_DEFAULTS.display_font_size;
      displayForm.display_line_height = c.display_line_height ?? DISPLAY_DEFAULTS.display_line_height;
      displayForm.display_letter_spacing = c.display_letter_spacing ?? DISPLAY_DEFAULTS.display_letter_spacing;
      displayForm.display_max_width = c.display_max_width ?? DISPLAY_DEFAULTS.display_max_width;
    }

    if (secretsResult.error) {
      console.warn('[system] secrets fetch error:', secretsResult.error.message);
      // Secrets access requires authenticated session — graceful fallback
    } else if (secretsResult.data) {
      const s = secretsResult.data as Secrets;
      // Show placeholder asterisks for fields that have values server-side
      // We don't expose the actual values to the browser (they arrive masked)
      secretsForm.elevenlabs_api_key = s.elevenlabs_api_key ?? '';
      secretsForm.elevenlabs_api_key_server = s.elevenlabs_api_key_server ?? '';
      secretsForm.openrouter_api_key = s.openrouter_api_key ?? '';
      secretsForm.webhook_secret = s.webhook_secret ?? '';
      secretsForm.n8n_webhook_url = s.n8n_webhook_url ?? '';
      secretsForm.render_api_key = s.render_api_key ?? '';
    }

    buildUI();
  }

  void loadAndRender();

  // Cleanup on container removal (disconnect observation)
  const observer = new MutationObserver(() => {
    if (!document.contains(container)) {
      if (healthRefreshTimer !== null) {
        clearInterval(healthRefreshTimer);
        healthRefreshTimer = null;
      }
      observer.disconnect();
    }
  });
  if (container.parentElement) {
    observer.observe(container.parentElement, { childList: true });
  }
}
