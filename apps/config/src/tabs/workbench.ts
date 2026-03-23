/**
 * workbench.ts — Workbench mode.
 *
 * Independent sections (collapsible), no pipeline context:
 *   1. Print Card — render + preview + send to printer
 *   2. Dither — upload image, apply dithering, preview, print
 *   3. Slice — upload image, configure slicing, preview, print
 *   4. Portrait — upload photo, configure style transfer + crops, preview, print
 *   5. Raster Painter — full simulation canvas
 *   6. Texts — CRUD on texts table
 *   7. Definitions — browse, filter, export
 */

import {
  createRadioGroup,
  createTextInput,
  createTextarea,
  createSlider,
  createNumberInput,
  createSection,
  createSaveButton,
  createToggle,
} from '../lib/forms.js';
import { supabase } from '../lib/supabase.js';

// ── Shared CSS ────────────────────────────────────────────────────────────────

const WB_CSS = `
  .wb-btn {
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
  .wb-btn:hover {
    border-color: #ffffff;
    color: #ffffff;
  }
  .wb-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .wb-btn-primary {
    background: #ffffff;
    color: #000000;
    border-color: #ffffff;
  }
  .wb-btn-primary:hover {
    background: #cccccc;
    border-color: #cccccc;
    color: #000000;
  }
  .wb-btn-danger {
    color: #cc4444;
    border-color: #2a2a2a;
  }
  .wb-btn-danger:hover {
    border-color: #cc4444;
    color: #cc4444;
  }
  .wb-status {
    font-size: 12px;
    min-height: 18px;
    font-family: system-ui, sans-serif;
    color: #777777;
    margin-bottom: 10px;
  }
  .wb-btn-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }
  .wb-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    font-family: system-ui, sans-serif;
  }
  .wb-table th {
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #777777;
    padding: 6px 8px;
    border-bottom: 1px solid #2a2a2a;
  }
  .wb-table td {
    padding: 8px;
    border-bottom: 1px solid #141414;
    color: #e0e0e0;
    vertical-align: middle;
  }
  .wb-table tr:last-child td {
    border-bottom: none;
  }
  .wb-table tr:hover td {
    background: #0a0a0a;
  }
  .wb-inline-form {
    background: #0a0a0a;
    border: 1px solid #2a2a2a;
    border-radius: 6px;
    padding: 14px;
    margin-bottom: 14px;
  }
  .wb-inline-form-title {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #777777;
    margin-bottom: 12px;
    font-family: system-ui, sans-serif;
  }
  .wb-chain-badge {
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
  .wb-pagination {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
    font-size: 13px;
    font-family: system-ui, sans-serif;
    color: #777777;
  }
  .wb-filter-row {
    display: flex;
    gap: 10px;
    align-items: flex-end;
    margin-bottom: 12px;
  }
  .wb-filter-row .cf-field {
    flex: 1;
    margin-bottom: 0;
  }
  .wb-canvas-wrap {
    position: relative;
    margin-bottom: 14px;
    line-height: 0;
  }
  .wb-canvas {
    display: block;
    width: 100%;
    max-width: 100%;
    border: 1px solid #2a2a2a;
    border-radius: 5px;
    background: #ffffff;
  }
  .wb-sim-controls {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }
  .wb-divider {
    height: 1px;
    background: #2a2a2a;
    margin: 14px 0;
  }
  .wb-sublabel {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #777777;
    margin-bottom: 8px;
    margin-top: 14px;
    font-family: system-ui, sans-serif;
  }
  .wb-file-input {
    font-size: 13px;
    color: #e0e0e0;
    font-family: system-ui, sans-serif;
    cursor: pointer;
    width: 100%;
    margin-bottom: 8px;
  }
  .wb-preview-img {
    max-width: 100%;
    border: 1px solid #2a2a2a;
    border-radius: 5px;
    margin-top: 8px;
    display: none;
  }
  .wb-preview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 8px;
    margin-top: 8px;
  }
  .wb-preview-grid img {
    width: 100%;
    border: 1px solid #2a2a2a;
    border-radius: 4px;
  }
  .compare-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 12px;
  }
  .compare-item {
    flex: 1;
    min-width: 200px;
    max-width: 300px;
  }
  .compare-item img {
    width: 100%;
    border: 1px solid #333333;
    border-radius: 4px;
  }
  .compare-label {
    font-size: 11px;
    color: #777777;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 4px;
    font-family: system-ui, sans-serif;
  }
  .compare-item-failed {
    font-size: 12px;
    color: #cc4444;
    font-family: system-ui, sans-serif;
    padding: 8px 0;
  }
`;

let wbStylesInjected = false;
function injectWbStyles(): void {
  if (wbStylesInjected) return;
  const style = document.createElement('style');
  style.textContent = WB_CSS;
  document.head.appendChild(style);
  wbStylesInjected = true;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProgramRow {
  id: string;
  name: string;
  config: {
    conversation?: {
      prompt_template?: string;
      first_message_de?: string;
      first_message_en?: string;
    };
  };
}

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStatusEl(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'wb-status';
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
  btn.className = `wb-btn${variant === 'primary' ? ' wb-btn-primary' : variant === 'danger' ? ' wb-btn-danger' : ''}`;
  return btn;
}

function makeSubLabel(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'wb-sublabel';
  el.textContent = text;
  return el;
}

function makeDivider(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'wb-divider';
  return el;
}

function makeFileField(label: string, accept: string, onChange: (f: File | null) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-bottom:14px;';
  const lbl = document.createElement('div');
  lbl.className = 'wb-sublabel';
  lbl.textContent = label;
  lbl.style.marginTop = '0';
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = accept;
  inp.className = 'wb-file-input';
  inp.addEventListener('change', () => { onChange(inp.files?.[0] ?? null); });
  wrap.appendChild(lbl);
  wrap.appendChild(inp);
  return wrap;
}

// ── Fetch render credentials ───────────────────────────────────────────────────

interface RenderCredentials {
  rendererUrl: string;
  renderApiKey: string;
}

async function fetchRenderCredentials(): Promise<RenderCredentials> {
  let rendererUrl = 'http://localhost:8000';
  let renderApiKey = '';

  try {
    const { data: installData } = await supabase
      .from('installation_config')
      .select('print_renderer_url')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .single();
    if (installData?.print_renderer_url) {
      rendererUrl = installData.print_renderer_url as string;
    }
  } catch {
    // continue with default
  }

  try {
    const { data: secretsData } = await supabase
      .from('secrets')
      .select('render_api_key')
      .eq('id', true)
      .single();
    renderApiKey = (secretsData?.render_api_key as string) ?? '';
  } catch {
    // continue without key
  }

  return { rendererUrl, renderApiKey };
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 1: Print Card
// ═══════════════════════════════════════════════════════════════════════════

function buildPrintCardSection(body: HTMLElement): void {
  const statusEl = makeStatusEl();
  body.appendChild(statusEl);

  let word = '';
  let definition = '';
  let citations = '';
  let language = 'de';
  let template = 'dictionary';
  let compareMode = false;

  const templateRadioWrap = document.createElement('div');
  const compareGrid = document.createElement('div');
  compareGrid.className = 'compare-grid';
  compareGrid.style.display = 'none';

  body.appendChild(createToggle('Compare mode', false, (v) => {
    compareMode = v;
    templateRadioWrap.style.display = v ? 'none' : '';
    compareGrid.style.display = v ? '' : 'none';
    previewImg.style.display = 'none';
  }));

  body.appendChild(createTextInput('Word / Term', '', (v) => { word = v; }));
  body.appendChild(createTextarea('Definition', '', 6, (v) => { definition = v; }));
  body.appendChild(createTextInput('Citations (comma-separated)', '', (v) => { citations = v; }));
  body.appendChild(
    createRadioGroup(
      'Language',
      [{ value: 'de', label: 'de — Deutsch' }, { value: 'en', label: 'en — English' }],
      language,
      (v) => { language = v; }
    )
  );

  templateRadioWrap.appendChild(
    createRadioGroup(
      'Template',
      [
        { value: 'dictionary', label: 'dictionary' },
        { value: 'helvetica', label: 'helvetica' },
        { value: 'acidic', label: 'acidic' },
      ],
      template,
      (v) => { template = v; }
    )
  );
  body.appendChild(templateRadioWrap);

  const previewImg = document.createElement('img');
  previewImg.className = 'wb-preview-img';

  const btnRow = document.createElement('div');
  btnRow.className = 'wb-btn-row';

  const previewBtn = makeButton('Preview Card');
  previewBtn.addEventListener('click', () => { void handlePreview(); });

  const printBtn = makeButton('Send to Printer', 'primary');
  printBtn.addEventListener('click', () => { void handlePrint(); });

  btnRow.appendChild(previewBtn);
  btnRow.appendChild(printBtn);
  body.appendChild(btnRow);
  body.appendChild(previewImg);
  body.appendChild(compareGrid);
  body.appendChild(statusEl);

  async function renderOneTemplate(tmpl: string, creds: RenderCredentials): Promise<string | null> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (creds.renderApiKey) headers['X-Api-Key'] = creds.renderApiKey;

      const citationsArray = citations
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const res = await fetch(`${creds.rendererUrl}/render/dictionary`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          word: word || 'BEISPIEL',
          definition: definition || 'Ein Beispiel ist ein Leuchtturm im Nebel der Abstraktion.',
          citations: citationsArray.length > 0 ? citationsArray : ['Workbench, 2026'],
          template: tmpl,
        }),
      });

      if (!res.ok) return null;
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }

  async function handlePreview(): Promise<void> {
    previewBtn.disabled = true;

    if (compareMode) {
      setStatus(statusEl, 'Rendering all templates...', '#777777');
      compareGrid.innerHTML = '';
      previewImg.style.display = 'none';

      const creds = await fetchRenderCredentials();
      const templates = ['dictionary', 'helvetica', 'acidic'];
      const results = await Promise.all(templates.map((t) => renderOneTemplate(t, creds)));

      compareGrid.innerHTML = '';
      for (let i = 0; i < templates.length; i++) {
        const item = document.createElement('div');
        item.className = 'compare-item';

        const labelEl = document.createElement('div');
        labelEl.className = 'compare-label';
        labelEl.textContent = templates[i]!;
        item.appendChild(labelEl);

        const url = results[i];
        if (url) {
          const img = document.createElement('img');
          img.src = url;
          img.alt = templates[i]!;
          item.appendChild(img);
        } else {
          const failEl = document.createElement('div');
          failEl.className = 'compare-item-failed';
          failEl.textContent = 'Failed';
          item.appendChild(failEl);
        }

        compareGrid.appendChild(item);
      }

      setStatus(statusEl, '', '#777777');
    } else {
      setStatus(statusEl, 'Rendering...', '#777777');
      previewImg.style.display = 'none';

      const creds = await fetchRenderCredentials();

      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (creds.renderApiKey) headers['X-Api-Key'] = creds.renderApiKey;

        const citationsArray = citations
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        const res = await fetch(`${creds.rendererUrl}/render/dictionary`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            word: word || 'BEISPIEL',
            definition: definition || 'Ein Beispiel ist ein Leuchtturm im Nebel der Abstraktion.',
            citations: citationsArray.length > 0 ? citationsArray : ['Workbench, 2026'],
            template,
          }),
        });

        if (!res.ok) {
          setStatus(statusEl, `Preview failed: HTTP ${res.status}`, '#cc4444');
          previewBtn.disabled = false;
          return;
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        previewImg.src = url;
        previewImg.style.display = 'block';
        setStatus(statusEl, '', '#777777');
      } catch {
        setStatus(statusEl, 'Preview unavailable — renderer not reachable.', '#cc4444');
      }
    }

    previewBtn.disabled = false;
  }

  async function handlePrint(): Promise<void> {
    if (!word.trim()) {
      setStatus(statusEl, 'Word / term is required.', '#cc4444');
      return;
    }
    printBtn.disabled = true;
    setStatus(statusEl, 'Queueing print job...', '#777777');

    const citationsArray = citations
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const { error } = await supabase.from('print_queue').insert({
      payload: {
        term: word.trim(),
        definition_text: definition,
        citations: citationsArray,
        language,
        template,
        session_number: 0,
        chain_ref: null,
        timestamp: new Date().toISOString(),
      },
      status: 'pending',
    });

    if (error) {
      setStatus(statusEl, 'Error: ' + error.message, '#cc4444');
    } else {
      setStatus(statusEl, 'Print job queued.', '#66aa66');
    }

    printBtn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 2: Dither
// ═══════════════════════════════════════════════════════════════════════════

function buildDitherSection(body: HTMLElement): void {
  const statusEl = makeStatusEl();
  body.appendChild(statusEl);

  let uploadedFile: File | null = null;
  let ditherMode = 'floyd';
  let dotSize = 6;
  let contrast = 1.3;
  let brightness = 1.0;
  let sharpness = 1.2;
  let blur = 0;
  let compareMode = false;

  const modeRadioWrap = document.createElement('div');
  const compareGrid = document.createElement('div');
  compareGrid.className = 'compare-grid';
  compareGrid.style.display = 'none';

  body.appendChild(createToggle('Compare mode', false, (v) => {
    compareMode = v;
    modeRadioWrap.style.display = v ? 'none' : '';
    compareGrid.style.display = v ? '' : 'none';
    previewImg.style.display = 'none';
  }));

  body.appendChild(makeFileField('Image', 'image/*', (f) => { uploadedFile = f; }));

  modeRadioWrap.appendChild(
    createRadioGroup(
      'Mode',
      [
        { value: 'floyd', label: 'floyd' },
        { value: 'bayer', label: 'bayer' },
        { value: 'halftone', label: 'halftone' },
      ],
      ditherMode,
      (v) => { ditherMode = v; }
    )
  );
  body.appendChild(modeRadioWrap);

  body.appendChild(
    createSlider('Dot size (halftone only)', 2, 12, 1, dotSize, (v) => { dotSize = v; })
  );
  body.appendChild(
    createSlider('Contrast', 0.5, 2.0, 0.05, contrast, (v) => { contrast = v; })
  );
  body.appendChild(
    createSlider('Brightness', 0.5, 2.0, 0.05, brightness, (v) => { brightness = v; })
  );
  body.appendChild(
    createSlider('Sharpness', 0.5, 2.0, 0.05, sharpness, (v) => { sharpness = v; })
  );
  body.appendChild(
    createSlider('Blur', 0, 30, 1, blur, (v) => { blur = v; })
  );

  const previewImg = document.createElement('img');
  previewImg.className = 'wb-preview-img';

  const btnRow = document.createElement('div');
  btnRow.className = 'wb-btn-row';

  const previewBtn = makeButton('Preview');
  previewBtn.addEventListener('click', () => { void handlePreview(); });

  const printBtn = makeButton('Send to Printer', 'primary');
  printBtn.addEventListener('click', () => { void handlePrint(); });

  btnRow.appendChild(previewBtn);
  btnRow.appendChild(printBtn);
  body.appendChild(btnRow);
  body.appendChild(previewImg);
  body.appendChild(compareGrid);
  body.appendChild(statusEl);

  async function renderOneDitherMode(mode: string, creds: RenderCredentials): Promise<string | null> {
    if (!uploadedFile) return null;
    try {
      const fd = new FormData();
      fd.append('image', uploadedFile);
      fd.append('mode', mode);
      fd.append('dot_size', String(dotSize));
      fd.append('contrast', String(contrast));
      fd.append('brightness', String(brightness));
      fd.append('sharpness', String(sharpness));
      fd.append('blur', String(blur));

      const headers: Record<string, string> = {};
      if (creds.renderApiKey) headers['X-Api-Key'] = creds.renderApiKey;

      const res = await fetch(`${creds.rendererUrl}/render/dither`, {
        method: 'POST',
        headers,
        body: fd,
      });

      if (!res.ok) return null;
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }

  async function handlePreview(): Promise<void> {
    if (!uploadedFile) {
      setStatus(statusEl, 'Select an image file first.', '#cc4444');
      return;
    }
    previewBtn.disabled = true;

    if (compareMode) {
      setStatus(statusEl, 'Dithering with all modes...', '#777777');
      compareGrid.innerHTML = '';
      previewImg.style.display = 'none';

      const creds = await fetchRenderCredentials();
      const modes = ['floyd', 'bayer', 'halftone'];
      const results = await Promise.all(modes.map((m) => renderOneDitherMode(m, creds)));

      compareGrid.innerHTML = '';
      for (let i = 0; i < modes.length; i++) {
        const item = document.createElement('div');
        item.className = 'compare-item';

        const labelEl = document.createElement('div');
        labelEl.className = 'compare-label';
        labelEl.textContent = modes[i]!;
        item.appendChild(labelEl);

        const url = results[i];
        if (url) {
          const img = document.createElement('img');
          img.src = url;
          img.alt = modes[i]!;
          item.appendChild(img);
        } else {
          const failEl = document.createElement('div');
          failEl.className = 'compare-item-failed';
          failEl.textContent = 'Failed';
          item.appendChild(failEl);
        }

        compareGrid.appendChild(item);
      }

      setStatus(statusEl, '', '#777777');
    } else {
      setStatus(statusEl, 'Dithering...', '#777777');
      previewImg.style.display = 'none';

      const creds = await fetchRenderCredentials();

      try {
        const fd = new FormData();
        fd.append('image', uploadedFile);
        fd.append('mode', ditherMode);
        fd.append('dot_size', String(dotSize));
        fd.append('contrast', String(contrast));
        fd.append('brightness', String(brightness));
        fd.append('sharpness', String(sharpness));
        fd.append('blur', String(blur));

        const headers: Record<string, string> = {};
        if (creds.renderApiKey) headers['X-Api-Key'] = creds.renderApiKey;

        const res = await fetch(`${creds.rendererUrl}/render/dither`, {
          method: 'POST',
          headers,
          body: fd,
        });

        if (!res.ok) {
          setStatus(statusEl, `Preview failed: HTTP ${res.status}`, '#cc4444');
          previewBtn.disabled = false;
          return;
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        previewImg.src = url;
        previewImg.style.display = 'block';
        setStatus(statusEl, '', '#777777');
      } catch {
        setStatus(statusEl, 'Preview unavailable — renderer not reachable.', '#cc4444');
      }
    }

    previewBtn.disabled = false;
  }

  async function handlePrint(): Promise<void> {
    if (!uploadedFile) {
      setStatus(statusEl, 'Select an image file first.', '#cc4444');
      return;
    }
    printBtn.disabled = true;
    setStatus(statusEl, 'Queueing print job...', '#777777');

    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(uploadedFile!);
      });

      const { error } = await supabase.from('print_queue').insert({
        payload: {
          type: 'dither',
          image: dataUrl,
          mode: ditherMode,
          dot_size: dotSize,
          contrast,
          brightness,
          sharpness,
          blur,
        },
        status: 'pending',
      });

      if (error) {
        setStatus(statusEl, 'Error: ' + error.message, '#cc4444');
      } else {
        setStatus(statusEl, 'Print job queued.', '#66aa66');
      }
    } catch {
      setStatus(statusEl, 'Failed to queue print job.', '#cc4444');
    }

    printBtn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 3: Slice
// ═══════════════════════════════════════════════════════════════════════════

function buildSliceSection(body: HTMLElement): void {
  const statusEl = makeStatusEl();
  body.appendChild(statusEl);

  let uploadedFile: File | null = null;
  let direction = 'vertical';
  let sliceCount = 10;
  let dotSize = 2;
  let previewUrls: string[] = [];

  body.appendChild(makeFileField('Image', 'image/*', (f) => { uploadedFile = f; }));

  body.appendChild(
    createRadioGroup(
      'Direction',
      [
        { value: 'vertical', label: 'vertical' },
        { value: 'horizontal', label: 'horizontal' },
      ],
      direction,
      (v) => { direction = v; }
    )
  );
  body.appendChild(
    createSlider('Slice count', 1, 20, 1, sliceCount, (v) => { sliceCount = v; })
  );
  body.appendChild(
    createNumberInput('Dot size (px)', dotSize, 1, 20, 1, (v) => { dotSize = v; })
  );

  const previewGrid = document.createElement('div');
  previewGrid.className = 'wb-preview-grid';

  const btnRow = document.createElement('div');
  btnRow.className = 'wb-btn-row';

  const previewBtn = makeButton('Preview Slices');
  previewBtn.addEventListener('click', () => { void handlePreview(); });

  const printBtn = makeButton('Send to Printer', 'primary');
  printBtn.addEventListener('click', () => { void handlePrint(); });

  btnRow.appendChild(previewBtn);
  btnRow.appendChild(printBtn);
  body.appendChild(btnRow);
  body.appendChild(previewGrid);
  body.appendChild(statusEl);

  function renderPreviewGrid(urls: string[]): void {
    previewGrid.innerHTML = '';
    for (const url of urls) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'slice';
      previewGrid.appendChild(img);
    }
  }

  async function handlePreview(): Promise<void> {
    if (!uploadedFile) {
      setStatus(statusEl, 'Select an image file first.', '#cc4444');
      return;
    }
    previewBtn.disabled = true;
    setStatus(statusEl, 'Slicing...', '#777777');
    previewGrid.innerHTML = '';

    const creds = await fetchRenderCredentials();

    try {
      const fd = new FormData();
      fd.append('image', uploadedFile);
      fd.append('direction', direction);
      fd.append('count', String(sliceCount));
      fd.append('dot_size', String(dotSize));

      const headers: Record<string, string> = {};
      if (creds.renderApiKey) headers['X-Api-Key'] = creds.renderApiKey;

      const res = await fetch(`${creds.rendererUrl}/render/slice`, {
        method: 'POST',
        headers,
        body: fd,
      });

      if (!res.ok) {
        setStatus(statusEl, `Preview failed: HTTP ${res.status}`, '#cc4444');
        previewBtn.disabled = false;
        return;
      }

      const json = (await res.json()) as { slices: string[] };
      previewUrls = (json.slices ?? []).map((b64: string) => {
        const byteStr = atob(b64);
        const arr = new Uint8Array(byteStr.length);
        for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i)!;
        const blob = new Blob([arr], { type: 'image/png' });
        return URL.createObjectURL(blob);
      });

      renderPreviewGrid(previewUrls);
      setStatus(statusEl, `${previewUrls.length} slices rendered.`, '#66aa66');
    } catch {
      setStatus(statusEl, 'Preview unavailable — renderer not reachable.', '#cc4444');
    }

    previewBtn.disabled = false;
  }

  async function handlePrint(): Promise<void> {
    if (!uploadedFile) {
      setStatus(statusEl, 'Select an image file first.', '#cc4444');
      return;
    }
    printBtn.disabled = true;
    setStatus(statusEl, 'Queueing print job...', '#777777');

    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(uploadedFile!);
      });

      const { error } = await supabase.from('print_queue').insert({
        payload: {
          type: 'slice',
          image: dataUrl,
          direction,
          slice_count: sliceCount,
          dot_size: dotSize,
        },
        status: 'pending',
      });

      if (error) {
        setStatus(statusEl, 'Error: ' + error.message, '#cc4444');
      } else {
        setStatus(statusEl, 'Print job queued.', '#66aa66');
      }
    } catch {
      setStatus(statusEl, 'Failed to queue print job.', '#cc4444');
    }

    printBtn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 4: Portrait
// ═══════════════════════════════════════════════════════════════════════════

function buildPortraitSection(body: HTMLElement): void {
  const statusEl = makeStatusEl();
  body.appendChild(statusEl);

  let uploadedFile: File | null = null;
  let stylePrompt = '';
  let ditherMode = 'floyd';
  let blur = 10;
  let z0PadTop = 0.1;
  let z0PadBottom = 0.1;
  let z0Aspect = 0.7;
  let z1PadTop = 0.05;
  let z1PadBottom = 0.05;
  let z3StripWidth = 0.25;
  let compareMode = false;

  const compareGrid = document.createElement('div');
  compareGrid.className = 'compare-grid';
  compareGrid.style.cssText = 'display:none;flex-wrap:wrap;';

  body.appendChild(createToggle('Compare mode', false, (v) => {
    compareMode = v;
    compareGrid.style.display = v ? '' : 'none';
    previewGrid.style.display = v ? 'none' : '';
  }));

  body.appendChild(makeFileField('Portrait photo', 'image/*', (f) => { uploadedFile = f; }));

  body.appendChild(createTextarea('Style transfer prompt', '', 8, (v) => { stylePrompt = v; }));

  body.appendChild(
    createRadioGroup(
      'Dither mode',
      [
        { value: 'floyd', label: 'floyd' },
        { value: 'bayer', label: 'bayer' },
        { value: 'halftone', label: 'halftone' },
      ],
      ditherMode,
      (v) => { ditherMode = v; }
    )
  );
  body.appendChild(createSlider('Blur', 0, 30, 1, blur, (v) => { blur = v; }));

  body.appendChild(makeSubLabel('Zoom 0 Crop'));
  body.appendChild(createSlider('Pad top', 0, 1, 0.01, z0PadTop, (v) => { z0PadTop = v; }));
  body.appendChild(createSlider('Pad bottom', 0, 1, 0.01, z0PadBottom, (v) => { z0PadBottom = v; }));
  body.appendChild(createSlider('Aspect', 0.4, 1.0, 0.01, z0Aspect, (v) => { z0Aspect = v; }));

  body.appendChild(makeSubLabel('Zoom 1 Crop'));
  body.appendChild(createSlider('Pad top', 0, 0.5, 0.01, z1PadTop, (v) => { z1PadTop = v; }));
  body.appendChild(createSlider('Pad bottom', 0, 0.5, 0.01, z1PadBottom, (v) => { z1PadBottom = v; }));

  body.appendChild(makeSubLabel('Zoom 3 Crop'));
  body.appendChild(createSlider('Strip width', 0.1, 0.5, 0.01, z3StripWidth, (v) => { z3StripWidth = v; }));

  const previewGrid = document.createElement('div');
  previewGrid.className = 'wb-preview-grid';

  const btnRow = document.createElement('div');
  btnRow.className = 'wb-btn-row';

  const previewBtn = makeButton('Preview Crops');
  previewBtn.addEventListener('click', () => { void handlePreview(); });

  const printBtn = makeButton('Send to Printer', 'primary');
  printBtn.addEventListener('click', () => { void handlePrint(); });

  btnRow.appendChild(previewBtn);
  btnRow.appendChild(printBtn);
  body.appendChild(btnRow);
  body.appendChild(previewGrid);
  body.appendChild(compareGrid);
  body.appendChild(statusEl);

  function b64ToObjectUrl(b64: string): string {
    const byteStr = atob(b64);
    const arr = new Uint8Array(byteStr.length);
    for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i)!;
    const blob = new Blob([arr], { type: 'image/png' });
    return URL.createObjectURL(blob);
  }

  async function fetchAllCrops(creds: RenderCredentials): Promise<string[] | null> {
    if (!uploadedFile) return null;
    try {
      const fd = new FormData();
      fd.append('image', uploadedFile);
      fd.append('style_prompt', stylePrompt);
      fd.append('dither_mode', ditherMode);
      fd.append('blur', String(blur));
      fd.append('z0_pad_top', String(z0PadTop));
      fd.append('z0_pad_bottom', String(z0PadBottom));
      fd.append('z0_aspect', String(z0Aspect));
      fd.append('z1_pad_top', String(z1PadTop));
      fd.append('z1_pad_bottom', String(z1PadBottom));
      fd.append('z3_strip_width', String(z3StripWidth));

      const headers: Record<string, string> = {};
      if (creds.renderApiKey) headers['X-Api-Key'] = creds.renderApiKey;

      const res = await fetch(`${creds.rendererUrl}/render/portrait`, {
        method: 'POST',
        headers,
        body: fd,
      });

      if (!res.ok) return null;
      const json = (await res.json()) as { crops: string[] };
      return json.crops ?? [];
    } catch {
      return null;
    }
  }

  async function handlePreview(): Promise<void> {
    if (!uploadedFile) {
      setStatus(statusEl, 'Select a photo first.', '#cc4444');
      return;
    }
    previewBtn.disabled = true;
    setStatus(statusEl, 'Processing portrait...', '#777777');

    const creds = await fetchRenderCredentials();

    if (compareMode) {
      compareGrid.innerHTML = '';
      previewGrid.innerHTML = '';

      const crops = await fetchAllCrops(creds);

      if (!crops) {
        setStatus(statusEl, 'Preview unavailable — renderer not reachable.', '#cc4444');
        previewBtn.disabled = false;
        return;
      }

      const zoomLabels = ['zoom_0', 'zoom_1', 'zoom_2', 'zoom_3'];
      for (let i = 0; i < zoomLabels.length; i++) {
        const item = document.createElement('div');
        item.className = 'compare-item';

        const labelEl = document.createElement('div');
        labelEl.className = 'compare-label';
        labelEl.textContent = zoomLabels[i]!;
        item.appendChild(labelEl);

        const b64 = crops[i];
        if (b64) {
          const img = document.createElement('img');
          img.src = b64ToObjectUrl(b64);
          img.alt = zoomLabels[i]!;
          item.appendChild(img);
        } else {
          const failEl = document.createElement('div');
          failEl.className = 'compare-item-failed';
          failEl.textContent = 'Not available';
          item.appendChild(failEl);
        }

        compareGrid.appendChild(item);
      }

      setStatus(statusEl, `${Math.min(crops.length, 4)} zoom levels rendered.`, '#66aa66');
    } else {
      previewGrid.innerHTML = '';
      compareGrid.innerHTML = '';

      try {
        const fd = new FormData();
        fd.append('image', uploadedFile);
        fd.append('style_prompt', stylePrompt);
        fd.append('dither_mode', ditherMode);
        fd.append('blur', String(blur));
        fd.append('z0_pad_top', String(z0PadTop));
        fd.append('z0_pad_bottom', String(z0PadBottom));
        fd.append('z0_aspect', String(z0Aspect));
        fd.append('z1_pad_top', String(z1PadTop));
        fd.append('z1_pad_bottom', String(z1PadBottom));
        fd.append('z3_strip_width', String(z3StripWidth));

        const headers: Record<string, string> = {};
        if (creds.renderApiKey) headers['X-Api-Key'] = creds.renderApiKey;

        const res = await fetch(`${creds.rendererUrl}/render/portrait`, {
          method: 'POST',
          headers,
          body: fd,
        });

        if (!res.ok) {
          setStatus(statusEl, `Preview failed: HTTP ${res.status}`, '#cc4444');
          previewBtn.disabled = false;
          return;
        }

        const json = (await res.json()) as { crops: string[] };
        const crops = json.crops ?? [];
        previewGrid.innerHTML = '';

        for (const b64 of crops) {
          const url = b64ToObjectUrl(b64);
          const img = document.createElement('img');
          img.src = url;
          img.alt = 'crop';
          previewGrid.appendChild(img);
        }

        setStatus(statusEl, `${crops.length} crops rendered.`, '#66aa66');
      } catch {
        setStatus(statusEl, 'Preview unavailable — renderer not reachable.', '#cc4444');
      }
    }

    previewBtn.disabled = false;
  }

  async function handlePrint(): Promise<void> {
    if (!uploadedFile) {
      setStatus(statusEl, 'Select a photo first.', '#cc4444');
      return;
    }
    printBtn.disabled = true;
    setStatus(statusEl, 'Queueing print job...', '#777777');

    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(uploadedFile!);
      });

      const { error } = await supabase.from('print_queue').insert({
        payload: {
          type: 'portrait',
          image: dataUrl,
          style_prompt: stylePrompt,
          dither_mode: ditherMode,
          blur,
          zoom0_pad_top: z0PadTop,
          zoom0_pad_bottom: z0PadBottom,
          zoom0_aspect: z0Aspect,
          zoom1_pad_top: z1PadTop,
          zoom1_pad_bottom: z1PadBottom,
          zoom3_strip_width: z3StripWidth,
        },
        status: 'pending',
      });

      if (error) {
        setStatus(statusEl, 'Error: ' + error.message, '#cc4444');
      } else {
        setStatus(statusEl, 'Print job queued.', '#66aa66');
      }
    } catch {
      setStatus(statusEl, 'Failed to queue print job.', '#cc4444');
    }

    printBtn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 5: Raster Painter
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

function buildRasterPainterSection(body: HTMLElement): void {
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

  let grid: Float32Array = new Float32Array(params.cols * params.rows);
  let rafId = 0;
  let running = false;
  let frameCount = 0;
  const TARGET_FPS = 30;
  const FRAME_INTERVAL = 1000 / TARGET_FPS;
  let lastFrameTime = 0;

  // Canvas
  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'wb-canvas-wrap';
  const canvas = document.createElement('canvas');
  canvas.className = 'wb-canvas';
  canvas.width = params.cols * params.cellSize;
  canvas.height = params.rows * params.cellSize;
  canvasWrap.appendChild(canvas);
  body.appendChild(canvasWrap);

  const ctx = canvas.getContext('2d')!;

  function resetGrid(): void {
    grid = new Float32Array(params.cols * params.rows);
    for (let i = 0; i < grid.length; i++) {
      grid[i] = Math.random() * 0.4;
    }
    frameCount = 0;
  }
  resetGrid();

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
    const { cols, rows } = params;
    const rate = params.transferRate;
    const smooth = params.smoothing;
    const noiseAmp = params.noise;

    const next = new Float32Array(grid.length);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const n = pseudoNoise(col * 0.05, row * 0.05, t) * noiseAmp;
        const wx = baseWx + n;
        const wy = baseWy + n;

        const srcCol = col - wx;
        const srcRow = row - wy;
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
        const mixed = current * (1 - rate * 10) + advected * rate * 10;

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

  function renderGrid(): void {
    const { cols, rows } = params;
    const cs = params.cellSize;

    canvas.width = cols * cs;
    canvas.height = rows * cs;

    ctx.filter = params.blurRadius > 0 ? `blur(${params.blurRadius}px)` : 'none';

    const imageData = ctx.createImageData(cols * cs, rows * cs);
    const data = imageData.data;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const density = grid[row * cols + col]!;
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

  renderGrid();

  // Controls
  const simControls = document.createElement('div');
  simControls.className = 'wb-sim-controls';

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

  // Grid params
  body.appendChild(makeSubLabel('Grid'));
  body.appendChild(createNumberInput('Cols', params.cols, 50, 2000, 50, (v) => { params.cols = v; reset(); }));
  body.appendChild(createNumberInput('Rows', params.rows, 50, 1000, 50, (v) => { params.rows = v; reset(); }));
  body.appendChild(createNumberInput('Cell size (px)', params.cellSize, 1, 20, 1, (v) => { params.cellSize = v; reset(); }));

  body.appendChild(makeDivider());
  body.appendChild(makeSubLabel('Simulation'));

  body.appendChild(createSlider('Wind direction (deg)', 0, 360, 1, params.windDir, (v) => { params.windDir = v; }));
  body.appendChild(createSlider('Noise', 0, 1, 0.01, params.noise, (v) => { params.noise = v; }));
  body.appendChild(createSlider('Turbulence', 0.001, 0.1, 0.001, params.turbulence, (v) => { params.turbulence = v; }));
  body.appendChild(createSlider('Strength', 10, 10000, 10, params.strength, (v) => { params.strength = v; }));
  body.appendChild(createSlider('Transfer rate', 0.001, 0.1, 0.001, params.transferRate, (v) => { params.transferRate = v; }));
  body.appendChild(createSlider('Smoothing', 0.01, 0.5, 0.01, params.smoothing, (v) => { params.smoothing = v; }));

  body.appendChild(makeDivider());
  body.appendChild(makeSubLabel('Post-processing'));
  body.appendChild(createSlider('Blur radius', 0, 30, 1, params.blurRadius, (v) => { params.blurRadius = v; }));

  body.appendChild(makeDivider());

  // Output
  const outputRow = document.createElement('div');
  outputRow.className = 'wb-btn-row';

  const exportBtn = makeButton('Export PNG');
  exportBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `raster-painter-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  outputRow.appendChild(exportBtn);
  body.appendChild(outputRow);
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 6: Text Management
// ═══════════════════════════════════════════════════════════════════════════

function buildTextManagementSection(body: HTMLElement): void {
  const statusEl = makeStatusEl();

  const tableWrap = document.createElement('div');
  tableWrap.style.cssText = 'overflow-x:auto;margin-bottom:14px;';

  const formWrap = document.createElement('div');

  let texts: TextRow[] = [];
  let editingId: string | null = null;

  const formState = { title: '', content_de: '', content_en: '', terms: '' };

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
    table.className = 'wb-table';

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

      const deleteBtn = makeButton('Delete', 'danger');
      deleteBtn.style.cssText += 'padding:4px 10px;font-size:12px;';
      deleteBtn.addEventListener('click', () => { void handleDelete(text.id, text.title); });

      actionsTd.appendChild(editBtn);
      actionsTd.appendChild(deleteBtn);
      tr.appendChild(actionsTd);

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    tableWrap.appendChild(table);
  }

  const addBtn = makeButton('Add Text', 'primary');
  addBtn.style.marginBottom = '14px';
  addBtn.addEventListener('click', () => {
    if (editingId === null && formWrap.children.length > 0) {
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

  body.appendChild(statusEl);
  body.appendChild(addBtn);
  body.appendChild(tableWrap);
  body.appendChild(formWrap);

  function buildForm(title: string, onSave: () => void): HTMLElement {
    const form = document.createElement('div');
    form.className = 'wb-inline-form';

    const titleEl = document.createElement('div');
    titleEl.className = 'wb-inline-form-title';
    titleEl.textContent = title;
    form.appendChild(titleEl);

    form.appendChild(createTextInput('Title', formState.title, (v) => { formState.title = v; }));
    form.appendChild(createTextarea('Content DE', formState.content_de, 8, (v) => { formState.content_de = v; }));
    form.appendChild(createTextarea('Content EN', formState.content_en, 8, (v) => { formState.content_en = v; }));
    form.appendChild(createTextInput('Terms (comma-separated)', formState.terms, (v) => { formState.terms = v; }));

    const btnRow = document.createElement('div');
    btnRow.className = 'wb-btn-row';

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
      setStatus(statusEl, 'Title is required.', '#cc4444');
      return;
    }

    setStatus(statusEl, 'Saving...', '#777777');

    if (editingId) {
      const { error } = await supabase.from('texts').update(payload).eq('id', editingId);
      if (error) {
        setStatus(statusEl, 'Update failed: ' + error.message, '#cc4444');
        return;
      }
      setStatus(statusEl, 'Text updated.', '#66aa66');
    } else {
      const { error } = await supabase.from('texts').insert(payload);
      if (error) {
        setStatus(statusEl, 'Insert failed: ' + error.message, '#cc4444');
        return;
      }
      setStatus(statusEl, 'Text added.', '#66aa66');
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
      setStatus(statusEl, 'Delete failed: ' + error.message, '#cc4444');
      return;
    }
    setStatus(statusEl, 'Text deleted.', '#66aa66');
    await loadTexts();
  }

  async function loadTexts(): Promise<void> {
    const { data, error } = await supabase
      .from('texts')
      .select('id, title, content_de, content_en, terms')
      .order('title', { ascending: true });

    if (error) {
      setStatus(statusEl, 'Load failed: ' + error.message, '#cc4444');
      return;
    }

    texts = (data ?? []) as TextRow[];
    renderTable();
  }

  void loadTexts();
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 7: Definition Browser
// ═══════════════════════════════════════════════════════════════════════════

function buildDefinitionBrowserSection(body: HTMLElement): void {
  const PAGE_SIZE = 20;

  let currentPage = 0;
  let filterTerm = '';
  let totalCount = 0;
  let definitions: DefinitionRow[] = [];

  const statusEl = makeStatusEl();
  body.appendChild(statusEl);

  const filterRow = document.createElement('div');
  filterRow.className = 'wb-filter-row';

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

  const tableWrap = document.createElement('div');
  tableWrap.style.cssText = 'overflow-x:auto;';
  body.appendChild(tableWrap);

  const pagination = document.createElement('div');
  pagination.className = 'wb-pagination';

  const prevBtn = makeButton('Previous');
  const nextBtn = makeButton('Next');
  const pageInfo = document.createElement('span');
  pageInfo.style.fontFamily = 'system-ui, sans-serif';

  prevBtn.addEventListener('click', () => {
    if (currentPage > 0) { currentPage--; void loadDefinitions(); }
  });
  nextBtn.addEventListener('click', () => {
    if ((currentPage + 1) * PAGE_SIZE < totalCount) { currentPage++; void loadDefinitions(); }
  });

  pagination.appendChild(prevBtn);
  pagination.appendChild(pageInfo);
  pagination.appendChild(nextBtn);
  body.appendChild(pagination);

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
    table.className = 'wb-table';

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
        badge.className = 'wb-chain-badge';
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
      setStatus(statusEl, 'Load failed: ' + error.message, '#cc4444');
      return;
    }

    definitions = (data ?? []) as DefinitionRow[];
    totalCount = count ?? 0;

    setStatus(statusEl, '', '#777777');
    renderTable();
    updatePagination();
  }

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
      setStatus(statusEl, 'Export failed: ' + error.message, '#cc4444');
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

    setStatus(statusEl, `Exported ${(data ?? []).length} definitions.`, '#66aa66');
  }

  void loadDefinitions();
}

// ═══════════════════════════════════════════════════════════════════════════
// Section 8: Prompts
// ═══════════════════════════════════════════════════════════════════════════

function buildPromptsSection(body: HTMLElement): void {
  const statusEl = makeStatusEl();
  body.appendChild(statusEl);

  let programs: ProgramRow[] = [];
  let selectedId = '';
  let promptTemplate = '';
  let firstMessageDe = '';
  let firstMessageEn = '';

  // — Program selector placeholder (replaced after load) —
  const selectorWrap = document.createElement('div');
  selectorWrap.style.cssText = 'margin-bottom:14px;';
  body.appendChild(selectorWrap);

  // — Template variables reference —
  const refBox = document.createElement('div');
  refBox.style.cssText =
    'background:#0a0a0a;border:1px solid #2a2a2a;border-radius:5px;padding:10px 12px;margin-bottom:14px;font-size:12px;font-family:monospace;color:#777777;line-height:1.7;';
  refBox.innerHTML =
    '<span style="font-family:system-ui,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;display:block;margin-bottom:6px;">Template variables</span>' +
    '{{term}} &nbsp; {{contextText}} &nbsp; {{language}} &nbsp; {{speechProfile}}';
  body.appendChild(refBox);

  // — System prompt textarea —
  let promptTextarea: HTMLTextAreaElement | null = null;
  const promptWrap = document.createElement('div');
  body.appendChild(promptWrap);

  // — First messages —
  let firstDe = '';
  let firstEn = '';
  const firstDeWrap = document.createElement('div');
  const firstEnWrap = document.createElement('div');
  body.appendChild(firstDeWrap);
  body.appendChild(firstEnWrap);

  body.appendChild(makeDivider());

  // — Test interpolation —
  body.appendChild(makeSubLabel('Test Interpolation'));

  let sampleTerm = '';
  let sampleContext = '';
  let sampleLanguage = 'de';

  body.appendChild(createTextInput('Term (sample)', '', (v) => { sampleTerm = v; }));
  body.appendChild(createTextInput('Context text (sample)', '', (v) => { sampleContext = v; }));
  body.appendChild(createTextInput('Language (sample)', 'de', (v) => { sampleLanguage = v; }));

  const previewBtnRow = document.createElement('div');
  previewBtnRow.className = 'wb-btn-row';
  const previewBtn = makeButton('Preview');
  previewBtnRow.appendChild(previewBtn);
  body.appendChild(previewBtnRow);

  const previewWrap = document.createElement('div');
  previewWrap.style.cssText = 'margin-bottom:14px;display:none;';
  const previewLabel = document.createElement('div');
  previewLabel.className = 'wb-sublabel';
  previewLabel.textContent = 'Preview result';
  previewLabel.style.marginTop = '0';
  const previewOutput = document.createElement('textarea');
  previewOutput.className = 'cf-textarea';
  previewOutput.rows = 14;
  previewOutput.readOnly = true;
  previewOutput.style.cssText += 'color:#777777;resize:none;';
  previewWrap.appendChild(previewLabel);
  previewWrap.appendChild(previewOutput);
  body.appendChild(previewWrap);

  previewBtn.addEventListener('click', () => {
    const template = promptTextarea?.value ?? promptTemplate;
    let preview = template;
    preview = preview.replace(/\{\{term\}\}/g, sampleTerm);
    preview = preview.replace(/\{\{contextText\}\}/g, sampleContext);
    preview = preview.replace(/\{\{language\}\}/g, sampleLanguage);
    preview = preview.replace(/\{\{speechProfile\}\}/g, '');
    previewOutput.value = preview;
    previewWrap.style.display = 'block';
  });

  body.appendChild(makeDivider());

  // — Save button —
  const saveBtnRow = document.createElement('div');
  saveBtnRow.className = 'wb-btn-row';
  const saveBtn = makeButton('Save', 'primary');
  saveBtnRow.appendChild(saveBtn);
  body.appendChild(saveBtnRow);

  saveBtn.addEventListener('click', () => { void handleSave(); });

  // — Render program selector —
  function renderSelector(): void {
    selectorWrap.innerHTML = '';
    const label = document.createElement('div');
    label.className = 'wb-sublabel';
    label.textContent = 'Program';
    label.style.marginTop = '0';
    selectorWrap.appendChild(label);

    if (programs.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No programs found.';
      empty.style.cssText = 'color:#777777;font-size:13px;font-family:system-ui,sans-serif;';
      selectorWrap.appendChild(empty);
      return;
    }

    const sel = document.createElement('select');
    sel.className = 'cf-select';
    for (const p of programs) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === selectedId) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
      selectedId = sel.value;
      loadFromSelected();
    });
    selectorWrap.appendChild(sel);
  }

  // — Render editable fields from selected program —
  function loadFromSelected(): void {
    const prog = programs.find((p) => p.id === selectedId);
    if (!prog) return;

    promptTemplate = prog.config.conversation?.prompt_template ?? '';
    firstMessageDe = prog.config.conversation?.first_message_de ?? '';
    firstMessageEn = prog.config.conversation?.first_message_en ?? '';

    // Re-render prompt textarea
    promptWrap.innerHTML = '';
    const ta = document.createElement('div');
    ta.className = 'cf-field';
    const taLabel = document.createElement('label');
    taLabel.className = 'cf-label';
    taLabel.textContent = 'System prompt template';
    const taId = `cf-textarea-${Math.random().toString(36).slice(2)}`;
    taLabel.htmlFor = taId;
    promptTextarea = document.createElement('textarea');
    promptTextarea.id = taId;
    promptTextarea.className = 'cf-textarea';
    promptTextarea.rows = 20;
    promptTextarea.value = promptTemplate;
    promptTextarea.addEventListener('input', () => { promptTemplate = promptTextarea!.value; });
    ta.appendChild(taLabel);
    ta.appendChild(promptTextarea);
    promptWrap.appendChild(ta);

    // Re-render first messages
    firstDe = firstMessageDe;
    firstEn = firstMessageEn;
    firstDeWrap.innerHTML = '';
    firstEnWrap.innerHTML = '';
    firstDeWrap.appendChild(
      createTextInput('First message (DE)', firstMessageDe, (v) => { firstDe = v; })
    );
    firstEnWrap.appendChild(
      createTextInput('First message (EN)', firstMessageEn, (v) => { firstEn = v; })
    );

    // Hide preview when switching programs
    previewWrap.style.display = 'none';
  }

  // — Save handler —
  async function handleSave(): Promise<void> {
    if (!selectedId) {
      setStatus(statusEl, 'No program selected.', '#cc4444');
      return;
    }

    saveBtn.disabled = true;
    setStatus(statusEl, 'Saving...', '#777777');

    const prog = programs.find((p) => p.id === selectedId);
    if (!prog) {
      setStatus(statusEl, 'Program not found.', '#cc4444');
      saveBtn.disabled = false;
      return;
    }

    // Merge into existing config, preserving non-conversation keys
    const updatedConfig = {
      ...prog.config,
      conversation: {
        ...(prog.config.conversation ?? {}),
        prompt_template: promptTextarea?.value ?? promptTemplate,
        first_message_de: firstDe || firstMessageDe,
        first_message_en: firstEn || firstMessageEn,
      },
    };

    const { error } = await supabase
      .from('programs')
      .update({ config: updatedConfig })
      .eq('id', selectedId);

    if (error) {
      setStatus(statusEl, 'Save failed: ' + error.message, '#cc4444');
    } else {
      // Update local cache
      prog.config = updatedConfig;
      setStatus(statusEl, 'Saved.', '#66aa66');
    }

    saveBtn.disabled = false;
  }

  // — Initial load —
  async function loadPrograms(): Promise<void> {
    setStatus(statusEl, 'Loading programs...', '#777777');

    const { data, error } = await supabase
      .from('programs')
      .select('id, name, config')
      .order('name', { ascending: true });

    if (error) {
      setStatus(statusEl, 'Load failed: ' + error.message, '#cc4444');
      return;
    }

    programs = (data ?? []) as ProgramRow[];
    if (programs.length > 0) {
      selectedId = programs[0]!.id;
    }

    setStatus(statusEl, '', '#777777');
    renderSelector();
    loadFromSelected();
  }

  void loadPrograms();
}

// ═══════════════════════════════════════════════════════════════════════════
// Main render
// ═══════════════════════════════════════════════════════════════════════════

export function render(container: HTMLElement): void {
  injectWbStyles();
  container.innerHTML = '';

  const { section: sec1, body: body1 } = createSection('Print Card');
  buildPrintCardSection(body1);
  container.appendChild(sec1);

  const { section: sec2, body: body2 } = createSection('Dither', true);
  buildDitherSection(body2);
  container.appendChild(sec2);

  const { section: sec3, body: body3 } = createSection('Slice', true);
  buildSliceSection(body3);
  container.appendChild(sec3);

  const { section: sec4, body: body4 } = createSection('Portrait', true);
  buildPortraitSection(body4);
  container.appendChild(sec4);

  const { section: sec5, body: body5 } = createSection('Raster Painter', true);
  buildRasterPainterSection(body5);
  container.appendChild(sec5);

  const { section: sec6, body: body6 } = createSection('Texts');
  buildTextManagementSection(body6);
  container.appendChild(sec6);

  const { section: sec7, body: body7 } = createSection('Definitions', true);
  buildDefinitionBrowserSection(body7);
  container.appendChild(sec7);

  const { section: sec8, body: body8 } = createSection('Prompts', true);
  buildPromptsSection(body8);
  container.appendChild(sec8);
}
