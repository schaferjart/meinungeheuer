/**
 * tools.ts — Tools tab: Raster Painter, Text Management, Definition Browser
 */

import {
  createSlider,
  createNumberInput,
  createTextInput,
  createTextarea,
  createSection,
  createSaveButton,
} from '../lib/forms.js';
import { supabase } from '../lib/supabase.js';

// ── Shared CSS ────────────────────────────────────────────────────────────────

const TOOLS_CSS = `
  .tools-btn {
    padding: 7px 14px;
    background: transparent;
    color: #e0e0e0;
    border: 1px solid #2a2a2a;
    border-radius: 5px;
    font-size: 13px;
    font-family: system-ui, sans-serif;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
    white-space: nowrap;
  }
  .tools-btn:hover {
    border-color: #ffffff;
    color: #ffffff;
  }
  .tools-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .tools-btn-primary {
    background: #ffffff;
    color: #000000;
    border-color: #ffffff;
  }
  .tools-btn-primary:hover {
    background: #cccccc;
    border-color: #cccccc;
    color: #000000;
  }
  .tools-btn-danger {
    color: #e05b5b;
    border-color: #2a2a2a;
  }
  .tools-btn-danger:hover {
    border-color: #e05b5b;
    color: #e05b5b;
  }
  .tools-status {
    font-size: 12px;
    min-height: 18px;
    font-family: system-ui, sans-serif;
    color: #777777;
    margin-bottom: 10px;
  }
  .tools-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    font-family: system-ui, sans-serif;
  }
  .tools-table th {
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #777777;
    padding: 6px 8px;
    border-bottom: 1px solid #2a2a2a;
  }
  .tools-table td {
    padding: 8px;
    border-bottom: 1px solid #141414;
    color: #e0e0e0;
    vertical-align: middle;
  }
  .tools-table tr:last-child td {
    border-bottom: none;
  }
  .tools-table tr:hover td {
    background: #0a0a0a;
  }
  .tools-btn-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }
  .tools-inline-form {
    background: #0a0a0a;
    border: 1px solid #2a2a2a;
    border-radius: 6px;
    padding: 14px;
    margin-bottom: 14px;
  }
  .tools-inline-form-title {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #777777;
    margin-bottom: 12px;
    font-family: system-ui, sans-serif;
  }
  .tools-chain-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: #777777;
    padding: 2px 6px;
    border: 1px solid #2a2a2a;
    border-radius: 10px;
    white-space: nowrap;
  }
  .tools-pagination {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
    font-size: 13px;
    font-family: system-ui, sans-serif;
    color: #777777;
  }
  .tools-filter-row {
    display: flex;
    gap: 10px;
    align-items: flex-end;
    margin-bottom: 12px;
  }
  .tools-filter-row .cf-field {
    flex: 1;
    margin-bottom: 0;
  }
  .tools-canvas-wrap {
    position: relative;
    margin-bottom: 14px;
    line-height: 0;
  }
  .tools-canvas {
    display: block;
    width: 100%;
    border: 1px solid #2a2a2a;
    border-radius: 5px;
    background: #ffffff;
  }
  .tools-sim-controls {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }
  .tools-divider {
    height: 1px;
    background: #2a2a2a;
    margin: 14px 0;
  }
`;

let toolsStylesInjected = false;
function injectToolsStyles(): void {
  if (toolsStylesInjected) return;
  const style = document.createElement('style');
  style.textContent = TOOLS_CSS;
  document.head.appendChild(style);
  toolsStylesInjected = true;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStatusEl(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'tools-status';
  return el;
}

function setStatus(el: HTMLElement, msg: string, color = '#777777'): void {
  el.textContent = msg;
  el.style.color = color;
}

function makeButton(label: string, variant: 'default' | 'primary' | 'danger' = 'default'): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.className = `tools-btn${variant === 'primary' ? ' tools-btn-primary' : variant === 'danger' ? ' tools-btn-danger' : ''}`;
  return btn;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TextRow {
  id: string;
  title: string;
  content_de: string;
  content_en: string;
  terms: string[];
}

interface DefinitionRow {
  id: string;
  term: string;
  definition_text: string;
  language: string;
  created_at: string;
  chain_depth: number | null;
  session_id: string | null;
}

const CONFIG_ID = '00000000-0000-0000-0000-000000000000';

// ═══════════════════════════════════════════════════════════════════════════
// Section 1: Raster Painter
// ═══════════════════════════════════════════════════════════════════════════

interface RasterParams {
  cols: number;
  rows: number;
  cellSize: number;
  windDir: number;
  noise: number;
  turbulence: number;
  strength: number;
  transferRate: number;
  smoothing: number;
  blurRadius: number;
}

function buildRasterPainter(body: HTMLElement): void {
  // Parameters
  const params: RasterParams = {
    cols: 500,
    rows: 250,
    cellSize: 6,
    windDir: 27,
    noise: 0.2,
    turbulence: 0.01,
    strength: 600,
    transferRate: 0.003,
    smoothing: 0.1,
    blurRadius: 0,
  };

  // Sim state
  let grid: Float32Array = new Float32Array(params.cols * params.rows);
  let rafId = 0;
  let running = false;
  let frameCount = 0;
  const TARGET_FPS = 30;
  const FRAME_INTERVAL = 1000 / TARGET_FPS;
  let lastFrameTime = 0;

  // Canvas
  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'tools-canvas-wrap';

  const canvas = document.createElement('canvas');
  canvas.className = 'tools-canvas';
  canvas.width = params.cols * params.cellSize;
  canvas.height = params.rows * params.cellSize;
  // Set display aspect ratio via CSS — cap width
  canvas.style.maxWidth = '100%';
  canvasWrap.appendChild(canvas);
  body.appendChild(canvasWrap);

  const ctx = canvas.getContext('2d')!;

  // ── Simulation helpers ──────────────────────────────────────────────────

  function resetGrid(): void {
    // Seed with some initial density
    grid = new Float32Array(params.cols * params.rows);
    for (let i = 0; i < grid.length; i++) {
      grid[i] = Math.random() * 0.4;
    }
    frameCount = 0;
  }

  resetGrid();

  /** Pseudo-noise using sin/cos harmonics. Returns -1..1. */
  function pseudoNoise(x: number, y: number, t: number): number {
    return (
      Math.sin(x * 0.3 + t * 0.7) * Math.cos(y * 0.2 + t * 0.5) +
      Math.sin(x * 0.17 - y * 0.13 + t * 1.1) * 0.5
    ) / 1.5;
  }

  function simulateStep(): void {
    const t = frameCount * params.turbulence;
    const radDir = (params.windDir * Math.PI) / 180;
    const baseWx = Math.cos(radDir) * params.strength * 0.001;
    const baseWy = Math.sin(radDir) * params.strength * 0.001;
    const cols = params.cols;
    const rows = params.rows;
    const rate = params.transferRate;
    const smooth = params.smoothing;
    const noiseAmp = params.noise;

    const next = new Float32Array(grid.length);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const n = pseudoNoise(col * 0.05, row * 0.05, t) * noiseAmp;
        const wx = baseWx + n;
        const wy = baseWy + n;

        // Source cell (fractional back-trace)
        const srcCol = col - wx;
        const srcRow = row - wy;

        // Bilinear sample from grid
        const c0 = Math.floor(srcCol);
        const r0 = Math.floor(srcRow);
        const fc = srcCol - c0;
        const fr = srcRow - r0;

        function safeGet(c: number, r: number): number {
          if (c < 0 || c >= cols || r < 0 || r >= rows) return 0;
          return grid[r * cols + c]!;
        }

        const v00 = safeGet(c0, r0);
        const v10 = safeGet(c0 + 1, r0);
        const v01 = safeGet(c0, r0 + 1);
        const v11 = safeGet(c0 + 1, r0 + 1);
        const advected =
          v00 * (1 - fc) * (1 - fr) +
          v10 * fc * (1 - fr) +
          v01 * (1 - fc) * fr +
          v11 * fc * fr;

        const current = grid[row * cols + col]!;

        // Mix advected with current (transfer rate controls blend)
        const mixed = current * (1 - rate * 10) + advected * rate * 10;

        // Smoothing: blend toward neighbours
        const up = safeGet(col, row - 1);
        const dn = safeGet(col, row + 1);
        const lt = safeGet(col - 1, row);
        const rt = safeGet(col + 1, row);
        const avg = (up + dn + lt + rt) / 4;
        const smoothed = mixed * (1 - smooth) + avg * smooth;

        next[row * cols + col] = Math.max(0, Math.min(1, smoothed));
      }
    }

    grid = next;
    frameCount++;
  }

  // ── Render ──────────────────────────────────────────────────────────────

  function renderGrid(): void {
    const cols = params.cols;
    const rows = params.rows;
    const cs = params.cellSize;

    canvas.width = cols * cs;
    canvas.height = rows * cs;

    if (params.blurRadius > 0) {
      ctx.filter = `blur(${params.blurRadius}px)`;
    } else {
      ctx.filter = 'none';
    }

    const imageData = ctx.createImageData(cols * cs, rows * cs);
    const data = imageData.data;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const density = grid[row * cols + col]!;
        // 0=white, 1=black
        const value = Math.floor((1 - density) * 255);

        const cellX = col * cs;
        const cellY = row * cs;

        for (let py = 0; py < cs; py++) {
          for (let px = 0; px < cs; px++) {
            const idx = ((cellY + py) * (cols * cs) + (cellX + px)) * 4;
            data[idx] = value;
            data[idx + 1] = value;
            data[idx + 2] = value;
            data[idx + 3] = 255;
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  // ── RAF loop ────────────────────────────────────────────────────────────

  function loop(timestamp: number): void {
    if (!running) return;
    rafId = requestAnimationFrame(loop);

    if (timestamp - lastFrameTime < FRAME_INTERVAL) return;
    lastFrameTime = timestamp;

    simulateStep();
    renderGrid();
  }

  function start(): void {
    if (running) return;
    running = true;
    runBtn.disabled = true;
    pauseBtn.disabled = false;
    rafId = requestAnimationFrame(loop);
  }

  function pause(): void {
    running = false;
    cancelAnimationFrame(rafId);
    runBtn.disabled = false;
    pauseBtn.disabled = true;
  }

  function reset(): void {
    pause();
    resetGrid();
    renderGrid();
  }

  // Initial render
  renderGrid();

  // ── Controls row ────────────────────────────────────────────────────────

  const simControls = document.createElement('div');
  simControls.className = 'tools-sim-controls';

  const runBtn = makeButton('Run', 'primary');
  const pauseBtn = makeButton('Pause');
  const resetBtn = makeButton('Reset');
  pauseBtn.disabled = true;

  runBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', pause);
  resetBtn.addEventListener('click', reset);

  simControls.appendChild(runBtn);
  simControls.appendChild(pauseBtn);
  simControls.appendChild(resetBtn);
  body.appendChild(simControls);

  // ── Grid parameters ─────────────────────────────────────────────────────

  const gridTitle = document.createElement('div');
  gridTitle.textContent = 'Grid';
  gridTitle.style.cssText = 'font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#777777;margin-bottom:10px;font-family:system-ui,sans-serif;';
  body.appendChild(gridTitle);

  body.appendChild(createNumberInput('Cols', params.cols, 50, 2000, 50, (v) => {
    params.cols = v;
    reset();
  }));
  body.appendChild(createNumberInput('Rows', params.rows, 50, 1000, 50, (v) => {
    params.rows = v;
    reset();
  }));
  body.appendChild(createNumberInput('Cell size (px)', params.cellSize, 1, 20, 1, (v) => {
    params.cellSize = v;
    reset();
  }));

  const divider1 = document.createElement('div');
  divider1.className = 'tools-divider';
  body.appendChild(divider1);

  const simTitle = document.createElement('div');
  simTitle.textContent = 'Simulation';
  simTitle.style.cssText = 'font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#777777;margin-bottom:10px;font-family:system-ui,sans-serif;';
  body.appendChild(simTitle);

  body.appendChild(createSlider('Wind direction (deg)', 0, 360, 1, params.windDir, (v) => { params.windDir = v; }));
  body.appendChild(createSlider('Noise', 0, 1, 0.01, params.noise, (v) => { params.noise = v; }));
  body.appendChild(createSlider('Turbulence', 0.001, 0.1, 0.001, params.turbulence, (v) => { params.turbulence = v; }));
  body.appendChild(createSlider('Strength', 10, 10000, 10, params.strength, (v) => { params.strength = v; }));
  body.appendChild(createSlider('Transfer rate', 0.001, 0.1, 0.001, params.transferRate, (v) => { params.transferRate = v; }));
  body.appendChild(createSlider('Smoothing', 0.01, 0.5, 0.01, params.smoothing, (v) => { params.smoothing = v; }));

  const divider2 = document.createElement('div');
  divider2.className = 'tools-divider';
  body.appendChild(divider2);

  const postTitle = document.createElement('div');
  postTitle.textContent = 'Post-processing';
  postTitle.style.cssText = 'font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#777777;margin-bottom:10px;font-family:system-ui,sans-serif;';
  body.appendChild(postTitle);

  body.appendChild(createSlider('Blur radius', 0, 30, 1, params.blurRadius, (v) => { params.blurRadius = v; }));

  const divider3 = document.createElement('div');
  divider3.className = 'tools-divider';
  body.appendChild(divider3);

  // ── Output buttons ──────────────────────────────────────────────────────

  const outputRow = document.createElement('div');
  outputRow.className = 'tools-btn-row';

  const exportBtn = makeButton('Export PNG');
  exportBtn.addEventListener('click', () => {
    // Ensure filter is off for export
    const prevFilter = ctx.filter;
    ctx.filter = params.blurRadius > 0 ? `blur(${params.blurRadius}px)` : 'none';
    const link = document.createElement('a');
    link.download = `raster-painter-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    ctx.filter = prevFilter;
  });

  const sendBtn = makeButton('Send to Print Composer');
  sendBtn.addEventListener('click', () => {
    console.log('[RasterPainter] Send to Print Composer — not yet implemented');
    setStatus(outputStatus, 'Sent to Print Composer (placeholder).', '#777777');
  });

  outputRow.appendChild(exportBtn);
  outputRow.appendChild(sendBtn);
  body.appendChild(outputRow);

  const outputStatus = makeStatusEl();
  body.appendChild(outputStatus);
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 2: Text Management
// ═══════════════════════════════════════════════════════════════════════════

function buildTextManagement(body: HTMLElement): void {
  const statusEl = makeStatusEl();
  body.appendChild(statusEl);

  // Table container
  const tableWrap = document.createElement('div');
  tableWrap.style.cssText = 'overflow-x:auto;margin-bottom:14px;';
  body.appendChild(tableWrap);

  // Inline form container (Add / Edit)
  const formWrap = document.createElement('div');
  body.appendChild(formWrap);

  let texts: TextRow[] = [];
  let editingId: string | null = null;

  // Form state
  const formState = {
    title: '',
    content_de: '',
    content_en: '',
    terms: '',
  };

  // ── Render table ──────────────────────────────────────────────────────────

  function renderTable(): void {
    tableWrap.innerHTML = '';

    if (texts.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No texts found.';
      empty.style.cssText = 'color:#777777;font-size:13px;font-family:system-ui,sans-serif;margin-bottom:12px;';
      tableWrap.appendChild(empty);
      return;
    }

    const table = document.createElement('table');
    table.className = 'tools-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const label of ['ID', 'Title', 'Terms', 'Actions']) {
      const th = document.createElement('th');
      th.textContent = label;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    for (const text of texts) {
      const tr = document.createElement('tr');

      const idTd = document.createElement('td');
      idTd.textContent = text.id.slice(0, 8) + '…';
      idTd.style.cssText = 'font-size:11px;color:#777777;font-family:monospace;';
      tr.appendChild(idTd);

      const titleTd = document.createElement('td');
      titleTd.textContent = text.title;
      tr.appendChild(titleTd);

      const termsTd = document.createElement('td');
      termsTd.textContent = Array.isArray(text.terms) ? text.terms.join(', ') : '';
      termsTd.style.cssText = 'font-size:12px;color:#777777;max-width:200px;';
      tr.appendChild(termsTd);

      const actionsTd = document.createElement('td');
      actionsTd.style.cssText = 'white-space:nowrap;';

      const editBtn = makeButton('Edit');
      editBtn.style.cssText += 'margin-right:6px;padding:4px 10px;font-size:12px;';
      editBtn.addEventListener('click', () => { openEditForm(text); });

      const setActiveBtn = makeButton('Set Active');
      setActiveBtn.style.cssText += 'margin-right:6px;padding:4px 10px;font-size:12px;';
      setActiveBtn.addEventListener('click', () => { void handleSetActive(text.id, setActiveBtn); });

      const deleteBtn = makeButton('Delete', 'danger');
      deleteBtn.style.cssText += 'padding:4px 10px;font-size:12px;';
      deleteBtn.addEventListener('click', () => { void handleDelete(text.id, text.title); });

      actionsTd.appendChild(editBtn);
      actionsTd.appendChild(setActiveBtn);
      actionsTd.appendChild(deleteBtn);
      tr.appendChild(actionsTd);

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    tableWrap.appendChild(table);
  }

  // ── Add button ────────────────────────────────────────────────────────────

  const addBtn = makeButton('Add Text', 'primary');
  addBtn.style.marginBottom = '14px';
  addBtn.addEventListener('click', () => {
    if (editingId === null && formWrap.children.length > 0) {
      // Already open for add — close
      formWrap.innerHTML = '';
      return;
    }
    editingId = null;
    formState.title = '';
    formState.content_de = '';
    formState.content_en = '';
    formState.terms = '';
    openAddForm();
  });
  body.insertBefore(addBtn, tableWrap);

  // ── Form builder ──────────────────────────────────────────────────────────

  function buildForm(title: string, onSave: () => void): HTMLElement {
    const form = document.createElement('div');
    form.className = 'tools-inline-form';

    const titleEl = document.createElement('div');
    titleEl.className = 'tools-inline-form-title';
    titleEl.textContent = title;
    form.appendChild(titleEl);

    form.appendChild(createTextInput('Title', formState.title, (v) => { formState.title = v; }));
    form.appendChild(createTextarea('Content DE', formState.content_de, 8, (v) => { formState.content_de = v; }));
    form.appendChild(createTextarea('Content EN', formState.content_en, 8, (v) => { formState.content_en = v; }));
    form.appendChild(createTextInput('Terms (comma-separated)', formState.terms, (v) => { formState.terms = v; }));

    const btnRow = document.createElement('div');
    btnRow.className = 'tools-btn-row';

    const saveBtn = createSaveButton('Save', onSave);

    const cancelBtn = makeButton('Cancel');
    cancelBtn.addEventListener('click', () => {
      formWrap.innerHTML = '';
      editingId = null;
    });

    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);
    form.appendChild(btnRow);

    return form;
  }

  function openAddForm(): void {
    formWrap.innerHTML = '';
    formWrap.appendChild(buildForm('Add Text', () => { void handleSave(); }));
  }

  function openEditForm(text: TextRow): void {
    editingId = text.id;
    formState.title = text.title;
    formState.content_de = text.content_de ?? '';
    formState.content_en = text.content_en ?? '';
    formState.terms = Array.isArray(text.terms) ? text.terms.join(', ') : '';
    formWrap.innerHTML = '';
    formWrap.appendChild(buildForm(`Edit: ${text.title}`, () => { void handleSave(); }));
  }

  // ── CRUD operations ───────────────────────────────────────────────────────

  async function handleSave(): Promise<void> {
    const termsArray = formState.terms
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);

    const payload = {
      title: formState.title.trim(),
      content_de: formState.content_de,
      content_en: formState.content_en,
      terms: termsArray,
    };

    if (!payload.title) {
      setStatus(statusEl, 'Title is required.', '#e05b5b');
      return;
    }

    setStatus(statusEl, 'Saving...', '#777777');

    if (editingId) {
      const { error } = await supabase
        .from('texts')
        .update(payload)
        .eq('id', editingId);

      if (error) {
        setStatus(statusEl, 'Update failed: ' + error.message, '#e05b5b');
        return;
      }
      setStatus(statusEl, 'Text updated.', '#5bba6f');
    } else {
      const { error } = await supabase.from('texts').insert(payload);

      if (error) {
        setStatus(statusEl, 'Insert failed: ' + error.message, '#e05b5b');
        return;
      }
      setStatus(statusEl, 'Text added.', '#5bba6f');
    }

    formWrap.innerHTML = '';
    editingId = null;
    await loadTexts();
  }

  async function handleDelete(id: string, title: string): Promise<void> {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;

    setStatus(statusEl, 'Deleting...', '#777777');
    const { error } = await supabase.from('texts').delete().eq('id', id);

    if (error) {
      setStatus(statusEl, 'Delete failed: ' + error.message, '#e05b5b');
      return;
    }

    setStatus(statusEl, 'Text deleted.', '#5bba6f');
    await loadTexts();
  }

  async function handleSetActive(textId: string, btn: HTMLButtonElement): Promise<void> {
    btn.disabled = true;
    setStatus(statusEl, 'Setting active text...', '#777777');

    const { error } = await supabase
      .from('installation_config')
      .update({ active_text_id: textId })
      .eq('id', CONFIG_ID);

    if (error) {
      setStatus(statusEl, 'Failed: ' + error.message, '#e05b5b');
    } else {
      setStatus(statusEl, 'Active text updated.', '#5bba6f');
    }
    btn.disabled = false;
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  async function loadTexts(): Promise<void> {
    const { data, error } = await supabase
      .from('texts')
      .select('id, title, content_de, content_en, terms')
      .order('title', { ascending: true });

    if (error) {
      setStatus(statusEl, 'Load failed: ' + error.message, '#e05b5b');
      return;
    }

    texts = (data ?? []) as TextRow[];
    renderTable();
  }

  void loadTexts();
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 3: Definition Browser
// ═══════════════════════════════════════════════════════════════════════════

function buildDefinitionBrowser(body: HTMLElement): void {
  const PAGE_SIZE = 20;

  let currentPage = 0;
  let filterTerm = '';
  let totalCount = 0;
  let definitions: DefinitionRow[] = [];

  const statusEl = makeStatusEl();
  body.appendChild(statusEl);

  // ── Filter row ───────────────────────────────────────────────────────────

  const filterRow = document.createElement('div');
  filterRow.className = 'tools-filter-row';

  const filterInput = createTextInput('Filter by term', '', (v) => {
    filterTerm = v;
    currentPage = 0;
    void loadDefinitions();
  });
  filterRow.appendChild(filterInput);

  const exportBtn = makeButton('Export JSON');
  exportBtn.style.cssText += 'flex-shrink:0;';
  exportBtn.addEventListener('click', () => { void handleExport(); });
  filterRow.appendChild(exportBtn);

  body.appendChild(filterRow);

  // ── Table container ───────────────────────────────────────────────────────

  const tableWrap = document.createElement('div');
  tableWrap.style.cssText = 'overflow-x:auto;';
  body.appendChild(tableWrap);

  // ── Pagination ────────────────────────────────────────────────────────────

  const pagination = document.createElement('div');
  pagination.className = 'tools-pagination';

  const prevBtn = makeButton('Previous');
  const nextBtn = makeButton('Next');
  const pageInfo = document.createElement('span');
  pageInfo.style.fontFamily = 'system-ui, sans-serif';

  prevBtn.addEventListener('click', () => {
    if (currentPage > 0) {
      currentPage--;
      void loadDefinitions();
    }
  });

  nextBtn.addEventListener('click', () => {
    if ((currentPage + 1) * PAGE_SIZE < totalCount) {
      currentPage++;
      void loadDefinitions();
    }
  });

  pagination.appendChild(prevBtn);
  pagination.appendChild(pageInfo);
  pagination.appendChild(nextBtn);
  body.appendChild(pagination);

  // ── Render table ──────────────────────────────────────────────────────────

  function renderTable(): void {
    tableWrap.innerHTML = '';

    if (definitions.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No definitions found.';
      empty.style.cssText = 'color:#777777;font-size:13px;font-family:system-ui,sans-serif;margin-bottom:12px;';
      tableWrap.appendChild(empty);
      return;
    }

    const table = document.createElement('table');
    table.className = 'tools-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const label of ['Term', 'Definition', 'Language', 'Created', 'Chain']) {
      const th = document.createElement('th');
      th.textContent = label;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    for (const def of definitions) {
      const tr = document.createElement('tr');

      const termTd = document.createElement('td');
      termTd.textContent = def.term;
      termTd.style.fontWeight = '600';
      tr.appendChild(termTd);

      const defTd = document.createElement('td');
      const truncated = def.definition_text
        ? def.definition_text.slice(0, 100) + (def.definition_text.length > 100 ? '…' : '')
        : '';
      defTd.textContent = truncated;
      defTd.style.cssText = 'max-width:300px;color:#777777;font-size:12px;';
      tr.appendChild(defTd);

      const langTd = document.createElement('td');
      langTd.textContent = def.language ?? '';
      langTd.style.cssText = 'font-size:12px;color:#777777;';
      tr.appendChild(langTd);

      const dateTd = document.createElement('td');
      dateTd.textContent = def.created_at
        ? new Date(def.created_at).toLocaleString('de-DE', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
          })
        : '';
      dateTd.style.cssText = 'font-size:12px;color:#777777;white-space:nowrap;';
      tr.appendChild(dateTd);

      const chainTd = document.createElement('td');
      if (def.chain_depth != null && def.chain_depth > 0) {
        const badge = document.createElement('span');
        badge.className = 'tools-chain-badge';
        badge.textContent = `${def.chain_depth}`;
        badge.title = `Chain depth: ${def.chain_depth}`;
        chainTd.appendChild(badge);
      }
      tr.appendChild(chainTd);

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    tableWrap.appendChild(table);
  }

  function updatePagination(): void {
    const start = totalCount === 0 ? 0 : currentPage * PAGE_SIZE + 1;
    const end = Math.min((currentPage + 1) * PAGE_SIZE, totalCount);
    pageInfo.textContent = `${start}–${end} of ${totalCount}`;
    prevBtn.disabled = currentPage === 0;
    nextBtn.disabled = (currentPage + 1) * PAGE_SIZE >= totalCount;
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  async function loadDefinitions(): Promise<void> {
    setStatus(statusEl, 'Loading...', '#777777');

    const offset = currentPage * PAGE_SIZE;

    let query = supabase
      .from('definitions')
      .select('id, term, definition_text, language, created_at, chain_depth, session_id', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (filterTerm.trim()) {
      query = query.ilike('term', `%${filterTerm.trim()}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      setStatus(statusEl, 'Load failed: ' + error.message, '#e05b5b');
      return;
    }

    definitions = (data ?? []) as DefinitionRow[];
    totalCount = count ?? 0;

    setStatus(statusEl, '', '#777777');
    renderTable();
    updatePagination();
  }

  // ── Export ────────────────────────────────────────────────────────────────

  async function handleExport(): Promise<void> {
    setStatus(statusEl, 'Exporting...', '#777777');

    let query = supabase
      .from('definitions')
      .select('id, term, definition_text, language, created_at, chain_depth, session_id')
      .order('created_at', { ascending: false });

    if (filterTerm.trim()) {
      query = query.ilike('term', `%${filterTerm.trim()}%`);
    }

    const { data, error } = await query;

    if (error) {
      setStatus(statusEl, 'Export failed: ' + error.message, '#e05b5b');
      return;
    }

    const json = JSON.stringify(data ?? [], null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `definitions-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);

    setStatus(statusEl, `Exported ${(data ?? []).length} definitions.`, '#5bba6f');
  }

  void loadDefinitions();
}

// ═══════════════════════════════════════════════════════════════════════════
// Main render
// ═══════════════════════════════════════════════════════════════════════════

export function render(container: HTMLElement): void {
  injectToolsStyles();
  container.innerHTML = '';

  // Section 1: Raster Painter
  const { section: sec1, body: body1 } = createSection('Raster Painter', true);
  buildRasterPainter(body1);
  container.appendChild(sec1);

  // Section 2: Text Management
  const { section: sec2, body: body2 } = createSection('Text Management');
  buildTextManagement(body2);
  container.appendChild(sec2);

  // Section 3: Definition Browser
  const { section: sec3, body: body3 } = createSection('Definition Browser', true);
  buildDefinitionBrowser(body3);
  container.appendChild(sec3);
}
