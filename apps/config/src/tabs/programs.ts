/**
 * programs.ts — Program View mode.
 *
 * Shows the active program's pipeline as a visual flow of blocks.
 * Select a program from a dropdown, click blocks to expand config,
 * save changes back to programs.config JSONB.
 */

import {
  createRadioGroup,
  createTextInput,
  createTextarea,
  createToggle,
  createSlider,
  createSelect,
  createNumberInput,
  createSaveButton,
} from '../lib/forms.js';
import { supabase } from '../lib/supabase.js';
import {
  createTextDisplayPreview,
  createTermPromptPreview,
  createConversationPreview,
  createDefinitionPreview,
  createWelcomePreview,
  createFarewellPreview,
} from '../lib/tablet-preview.js';

// ── CSS ───────────────────────────────────────────────────────────────────────

const PROGRAMS_CSS = `
  .prog-selector-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 28px;
    flex-wrap: wrap;
  }
  .prog-selector-row label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #777777;
    white-space: nowrap;
  }
  .prog-selector-row select {
    padding: 7px 10px;
    background: #0a0a0a;
    color: #e0e0e0;
    border: 1px solid #2a2a2a;
    border-radius: 5px;
    font-size: 13px;
    font-family: Helvetica, 'Helvetica Neue', Arial, sans-serif;
    outline: none;
    cursor: pointer;
    transition: border-color 0.15s;
    min-width: 200px;
  }
  .prog-selector-row select:focus {
    border-color: #ffffff;
  }
  .prog-name {
    font-size: 22px;
    font-weight: 600;
    color: #ffffff;
    letter-spacing: 0.02em;
    margin-right: auto;
  }
  .prog-active-badge {
    font-size: 11px;
    padding: 3px 8px;
    border: 1px solid #66aa66;
    border-radius: 10px;
    color: #66aa66;
    white-space: nowrap;
  }
  .prog-set-active-btn {
    padding: 6px 14px;
    background: #ffffff;
    color: #000000;
    border: none;
    border-radius: 5px;
    font-size: 13px;
    font-family: Helvetica, 'Helvetica Neue', Arial, sans-serif;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
  }
  .prog-set-active-btn:hover {
    background: #cccccc;
  }
  .prog-set-active-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ── Pipeline visualization ── */
  .pipeline {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 20px 0;
    margin-bottom: 8px;
  }
  .pipeline-block {
    background: #1a1a1a;
    border: 1px solid #333333;
    border-radius: 6px;
    padding: 10px 16px;
    cursor: pointer;
    font-size: 13px;
    color: #e0e0e0;
    transition: border-color 0.15s, color 0.15s;
    font-family: Helvetica, 'Helvetica Neue', Arial, sans-serif;
    user-select: none;
  }
  .pipeline-block:hover {
    border-color: #ffffff;
    color: #ffffff;
  }
  .pipeline-block.selected {
    border-color: #ffffff;
    color: #ffffff;
    background: #222222;
  }
  .pipeline-arrow {
    color: #555555;
    font-size: 18px;
    user-select: none;
  }

  /* ── Block detail panel ── */
  .block-detail {
    background: #0a0a0a;
    border: 1px solid #2a2a2a;
    border-radius: 6px;
    padding: 20px 24px;
    margin-bottom: 24px;
  }
  .block-detail-header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 18px;
  }
  .block-detail-title {
    font-size: 14px;
    font-weight: 600;
    color: #ffffff;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .block-detail-subtitle {
    font-size: 12px;
    color: #777777;
  }

  /* ── Save row ── */
  .prog-save-row {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid #2a2a2a;
  }
  .prog-save-status {
    font-size: 12px;
    color: #777777;
    min-height: 18px;
    font-family: Helvetica, 'Helvetica Neue', Arial, sans-serif;
  }

  /* ── Empty state ── */
  .prog-empty {
    font-size: 14px;
    color: #777777;
    padding: 40px 0;
    text-align: center;
    font-family: Helvetica, 'Helvetica Neue', Arial, sans-serif;
  }
`;

let programsStylesInjected = false;
function injectStyles(): void {
  if (programsStylesInjected) return;
  const style = document.createElement('style');
  style.textContent = PROGRAMS_CSS;
  document.head.appendChild(style);
  programsStylesInjected = true;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProgramRow {
  id: string;
  name: string;
  pipeline: string[];
  config: Record<string, Record<string, unknown>>;
  is_active: boolean;
}

interface TextOption {
  id: string;
  title: string;
}

// ── Block descriptors ─────────────────────────────────────────────────────────

const BLOCK_LABELS: Record<string, string> = {
  face_detect: 'Face Detect',
  text_display: 'Text Display',
  term_prompt: 'Term Prompt',
  conversation: 'Conversation',
  portrait_capture: 'Portrait Capture',
  portrait_process: 'Portrait Process',
  print_card: 'Print Card',
  print_image: 'Print Image',
  print_batch: 'Print Batch',
  voice_chain: 'Voice Chain',
  raster_paint: 'Raster Painter',
  slice: 'Slice',
  consent: 'Consent',
};

function getBlockLabel(blockId: string): string {
  return BLOCK_LABELS[blockId] ?? blockId;
}

// ── Block config builders ─────────────────────────────────────────────────────

type BlockConfig = Record<string, unknown>;

function buildBlockConfigForm(
  blockId: string,
  cfg: BlockConfig,
  texts: TextOption[]
): HTMLElement {
  const container = document.createElement('div');

  function n(val: unknown, fallback: number): number {
    return typeof val === 'number' ? val : fallback;
  }
  function s(val: unknown, fallback = ''): string {
    return typeof val === 'string' ? val : fallback;
  }
  function b(val: unknown, fallback = false): boolean {
    return typeof val === 'boolean' ? val : fallback;
  }

  switch (blockId) {
    case 'face_detect': {
      container.appendChild(
        createToggle('Enabled', b(cfg['enabled'], true), (v) => { cfg['enabled'] = v; })
      );
      const sliderWake = createSlider('Wake threshold (ms)', 500, 10000, 100, n(cfg['wake_ms'], 3000), (v) => { cfg['wake_ms'] = v; });
      attachMsDisplay(sliderWake, n(cfg['wake_ms'], 3000));
      container.appendChild(sliderWake);
      const sliderSleep = createSlider('Sleep threshold (ms)', 5000, 120000, 1000, n(cfg['sleep_ms'], 30000), (v) => { cfg['sleep_ms'] = v; });
      attachMsDisplay(sliderSleep, n(cfg['sleep_ms'], 30000));
      container.appendChild(sliderSleep);
      const sliderInterval = createSlider('Detection interval (ms)', 100, 2000, 50, n(cfg['interval_ms'], 500), (v) => { cfg['interval_ms'] = v; });
      attachMsDisplay(sliderInterval, n(cfg['interval_ms'], 500));
      container.appendChild(sliderInterval);
      container.appendChild(
        createSlider('Min confidence', 0.1, 1.0, 0.05, n(cfg['min_confidence'], 0.5), (v) => { cfg['min_confidence'] = v; })
      );
      break;
    }

    case 'text_display': {
      const textOptions = [
        { value: '', label: '— none —' },
        ...texts.map((t) => ({ value: t.id, label: t.title })),
      ];
      container.appendChild(
        createSelect('Text', textOptions, s(cfg['text_id']), (v) => { cfg['text_id'] = v || null; })
      );
      container.appendChild(
        createTextInput('Highlight color', s(cfg['highlight_color'], '#fcd34d'), (v) => { cfg['highlight_color'] = v; })
      );
      container.appendChild(
        createSlider('Spoken opacity', 0, 1, 0.05, n(cfg['spoken_opacity'], 0.6), (v) => { cfg['spoken_opacity'] = v; })
      );
      container.appendChild(
        createSlider('Upcoming opacity', 0, 1, 0.05, n(cfg['upcoming_opacity'], 1.0), (v) => { cfg['upcoming_opacity'] = v; })
      );
      container.appendChild(
        createTextInput('Font size', s(cfg['font_size'], 'clamp(1.2rem, 3vw, 1.8rem)'), (v) => { cfg['font_size'] = v; })
      );
      container.appendChild(
        createSlider('Line height', 1.0, 3.0, 0.05, n(cfg['line_height'], 1.8), (v) => { cfg['line_height'] = v; })
      );
      container.appendChild(
        createTextInput('Letter spacing', s(cfg['letter_spacing'], '0.02em'), (v) => { cfg['letter_spacing'] = v; })
      );
      container.appendChild(
        createTextInput('Max width', s(cfg['max_width'], '700px'), (v) => { cfg['max_width'] = v; })
      );
      break;
    }

    case 'term_prompt': {
      container.appendChild(
        createTextInput('Term', s(cfg['term']), (v) => { cfg['term'] = v; })
      );
      const sliderDuration = createSlider('Duration (ms)', 1000, 10000, 500, n(cfg['duration_ms'], 2000), (v) => { cfg['duration_ms'] = v; });
      attachMsDisplay(sliderDuration, n(cfg['duration_ms'], 2000));
      container.appendChild(sliderDuration);
      break;
    }

    case 'conversation': {
      container.appendChild(
        createTextarea('Prompt template', s(cfg['prompt_template']), 15, (v) => { cfg['prompt_template'] = v; })
      );
      container.appendChild(
        createTextInput('First message (DE)', s(cfg['first_message_de']), (v) => { cfg['first_message_de'] = v; })
      );
      container.appendChild(
        createTextInput('First message (EN)', s(cfg['first_message_en']), (v) => { cfg['first_message_en'] = v; })
      );
      container.appendChild(
        createSlider('Voice stability', 0, 1, 0.05, n(cfg['voice_stability'], 0.35), (v) => { cfg['voice_stability'] = v; })
      );
      container.appendChild(
        createSlider('Voice similarity boost', 0, 1, 0.05, n(cfg['voice_similarity_boost'], 0.65), (v) => { cfg['voice_similarity_boost'] = v; })
      );
      container.appendChild(
        createSlider('Voice style', 0, 1, 0.05, n(cfg['voice_style'], 0.6), (v) => { cfg['voice_style'] = v; })
      );
      container.appendChild(
        createToggle('Speaker boost', b(cfg['voice_speaker_boost'], true), (v) => { cfg['voice_speaker_boost'] = v; })
      );
      container.appendChild(
        createRadioGroup(
          'Language',
          [{ value: 'de', label: 'de — Deutsch' }, { value: 'en', label: 'en — English' }],
          s(cfg['language'], 'de'),
          (v) => { cfg['language'] = v; }
        )
      );
      break;
    }

    case 'portrait_capture': {
      const sliderDelay = createSlider('Capture delay (ms)', 1000, 10000, 100, n(cfg['delay_ms'], 3000), (v) => { cfg['delay_ms'] = v; });
      attachMsDisplay(sliderDelay, n(cfg['delay_ms'], 3000));
      container.appendChild(sliderDelay);
      container.appendChild(
        createSlider('JPEG quality', 0.5, 1.0, 0.05, n(cfg['jpeg_quality'], 0.85), (v) => { cfg['jpeg_quality'] = v; })
      );
      container.appendChild(
        createNumberInput('Min blob size (px)', n(cfg['min_blob_size'], 100), 10, 10000, 10, (v) => { cfg['min_blob_size'] = v; })
      );
      container.appendChild(
        createSlider('CSS blur radius', 0, 50, 1, n(cfg['blur_radius_css'], 0), (v) => { cfg['blur_radius_css'] = v; })
      );
      break;
    }

    case 'portrait_process': {
      container.appendChild(
        createTextarea('Style transfer prompt', s(cfg['style_prompt']), 15, (v) => { cfg['style_prompt'] = v; })
      );
      container.appendChild(
        createRadioGroup(
          'Dither mode',
          [
            { value: 'floyd', label: 'floyd' },
            { value: 'bayer', label: 'bayer' },
            { value: 'halftone', label: 'halftone' },
          ],
          s(cfg['dither_mode'], 'floyd'),
          (v) => { cfg['dither_mode'] = v; }
        )
      );
      container.appendChild(
        createSlider('Blur', 0, 50, 1, n(cfg['blur'], 10), (v) => { cfg['blur'] = v; })
      );
      addSubLabel(container, 'Zoom 0 Crop');
      container.appendChild(
        createSlider('Pad top', 0, 1, 0.01, n(cfg['z0_pad_top'], 0.1), (v) => { cfg['z0_pad_top'] = v; })
      );
      container.appendChild(
        createSlider('Pad bottom', 0, 1, 0.01, n(cfg['z0_pad_bottom'], 0.1), (v) => { cfg['z0_pad_bottom'] = v; })
      );
      container.appendChild(
        createSlider('Aspect', 0.4, 1.0, 0.01, n(cfg['z0_aspect'], 0.7), (v) => { cfg['z0_aspect'] = v; })
      );
      addSubLabel(container, 'Zoom 1 Crop');
      container.appendChild(
        createSlider('Pad top', 0, 0.5, 0.01, n(cfg['z1_pad_top'], 0.05), (v) => { cfg['z1_pad_top'] = v; })
      );
      container.appendChild(
        createSlider('Pad bottom', 0, 0.5, 0.01, n(cfg['z1_pad_bottom'], 0.05), (v) => { cfg['z1_pad_bottom'] = v; })
      );
      addSubLabel(container, 'Zoom 3 Crop');
      container.appendChild(
        createSlider('Strip width', 0.1, 0.5, 0.01, n(cfg['z3_strip_width'], 0.25), (v) => { cfg['z3_strip_width'] = v; })
      );
      break;
    }

    case 'print_card': {
      container.appendChild(
        createRadioGroup(
          'Template',
          [
            { value: 'dictionary', label: 'dictionary' },
            { value: 'helvetica', label: 'helvetica' },
            { value: 'acidic', label: 'acidic' },
          ],
          s(cfg['template'], 'dictionary'),
          (v) => { cfg['template'] = v; }
        )
      );
      container.appendChild(
        createRadioGroup(
          'Result display',
          [
            { value: 'aphorism', label: 'aphorism' },
            { value: 'definition', label: 'definition' },
            { value: 'raw_transcript', label: 'raw_transcript' },
          ],
          s(cfg['result_display'], 'definition'),
          (v) => { cfg['result_display'] = v; }
        )
      );
      break;
    }

    case 'voice_chain': {
      container.appendChild(
        createToggle('Remove background noise', b(cfg['remove_bg_noise'], false), (v) => { cfg['remove_bg_noise'] = v; })
      );
      container.appendChild(
        createNumberInput('Retention window', n(cfg['retention_window'], 10), 1, 100, 1, (v) => { cfg['retention_window'] = v; })
      );
      addSubLabel(container, 'Speech Profile');
      container.appendChild(
        createTextInput('Profile model', s(cfg['profile_model']), (v) => { cfg['profile_model'] = v; })
      );
      container.appendChild(
        createSlider('Profile temperature', 0, 1, 0.05, n(cfg['profile_temperature'], 0.3), (v) => { cfg['profile_temperature'] = v; })
      );
      addSubLabel(container, 'Icebreaker');
      container.appendChild(
        createTextInput('Icebreaker model', s(cfg['icebreaker_model']), (v) => { cfg['icebreaker_model'] = v; })
      );
      container.appendChild(
        createSlider('Icebreaker temperature', 0, 1, 0.05, n(cfg['icebreaker_temperature'], 0.9), (v) => { cfg['icebreaker_temperature'] = v; })
      );
      addSubLabel(container, 'Cold Start');
      container.appendChild(
        createTextInput('Cold start (DE)', s(cfg['cold_start_de']), (v) => { cfg['cold_start_de'] = v; })
      );
      container.appendChild(
        createTextInput('Cold start (EN)', s(cfg['cold_start_en']), (v) => { cfg['cold_start_en'] = v; })
      );
      addSubLabel(container, 'Limits');
      container.appendChild(
        createNumberInput('Max phrases', n(cfg['max_phrases'], 5), 1, 50, 1, (v) => { cfg['max_phrases'] = v; })
      );
      container.appendChild(
        createNumberInput('Max favorite words', n(cfg['max_favorite_words'], 5), 1, 50, 1, (v) => { cfg['max_favorite_words'] = v; })
      );
      break;
    }

    case 'print_image': {
      container.appendChild(
        createRadioGroup(
          'Dither mode',
          [
            { value: 'floyd', label: 'floyd' },
            { value: 'bayer', label: 'bayer' },
            { value: 'halftone', label: 'halftone' },
          ],
          s(cfg['dither_mode'], 'floyd'),
          (v) => { cfg['dither_mode'] = v; }
        )
      );
      container.appendChild(
        createSlider('Contrast', 0.5, 2.0, 0.05, n(cfg['contrast'], 1.3), (v) => { cfg['contrast'] = v; })
      );
      container.appendChild(
        createSlider('Brightness', 0.5, 2.0, 0.05, n(cfg['brightness'], 1.0), (v) => { cfg['brightness'] = v; })
      );
      container.appendChild(
        createSlider('Sharpness', 0.5, 2.0, 0.05, n(cfg['sharpness'], 1.2), (v) => { cfg['sharpness'] = v; })
      );
      container.appendChild(
        createSlider('Blur', 0, 50, 1, n(cfg['blur'], 0), (v) => { cfg['blur'] = v; })
      );
      break;
    }

    case 'print_batch': {
      container.appendChild(
        createRadioGroup(
          'Slice direction',
          [
            { value: 'vertical', label: 'vertical' },
            { value: 'horizontal', label: 'horizontal' },
          ],
          s(cfg['slice_direction'], 'vertical'),
          (v) => { cfg['slice_direction'] = v; }
        )
      );
      container.appendChild(
        createSlider('Slice count', 1, 20, 1, n(cfg['slice_count'], 4), (v) => { cfg['slice_count'] = v; })
      );
      break;
    }

    case 'raster_paint': {
      container.appendChild(
        createNumberInput('Cols', n(cfg['cols'], 500), 50, 2000, 50, (v) => { cfg['cols'] = v; })
      );
      container.appendChild(
        createNumberInput('Rows', n(cfg['rows'], 250), 50, 1000, 50, (v) => { cfg['rows'] = v; })
      );
      container.appendChild(
        createNumberInput('Cell size (px)', n(cfg['cell_size'], 6), 1, 20, 1, (v) => { cfg['cell_size'] = v; })
      );
      container.appendChild(
        createSlider('Wind direction (deg)', 0, 360, 1, n(cfg['wind_direction'], 27), (v) => { cfg['wind_direction'] = v; })
      );
      container.appendChild(
        createSlider('Noise', 0, 1, 0.01, n(cfg['noise'], 0.2), (v) => { cfg['noise'] = v; })
      );
      container.appendChild(
        createSlider('Turbulence', 0.001, 0.1, 0.001, n(cfg['turbulence'], 0.01), (v) => { cfg['turbulence'] = v; })
      );
      container.appendChild(
        createSlider('Strength', 10, 10000, 10, n(cfg['strength'], 600), (v) => { cfg['strength'] = v; })
      );
      container.appendChild(
        createSlider('Transfer rate', 0.001, 0.1, 0.001, n(cfg['transfer_rate'], 0.003), (v) => { cfg['transfer_rate'] = v; })
      );
      container.appendChild(
        createSlider('Smoothing', 0.01, 0.5, 0.01, n(cfg['smoothing'], 0.1), (v) => { cfg['smoothing'] = v; })
      );
      container.appendChild(
        createSlider('Blur', 0, 50, 1, n(cfg['blur'], 0), (v) => { cfg['blur'] = v; })
      );
      break;
    }

    case 'slice': {
      container.appendChild(
        createRadioGroup(
          'Direction',
          [
            { value: 'vertical', label: 'vertical' },
            { value: 'horizontal', label: 'horizontal' },
          ],
          s(cfg['direction'], 'vertical'),
          (v) => { cfg['direction'] = v; }
        )
      );
      container.appendChild(
        createSlider('Count', 1, 20, 1, n(cfg['count'], 10), (v) => { cfg['count'] = v; })
      );
      container.appendChild(
        createNumberInput('Dot size (px)', n(cfg['dot_size'], 2), 1, 20, 1, (v) => { cfg['dot_size'] = v; })
      );
      break;
    }

    case 'consent': {
      container.appendChild(
        createTextInput('Consent message (DE)', s(cfg['message_de']), (v) => { cfg['message_de'] = v; })
      );
      container.appendChild(
        createTextInput('Consent message (EN)', s(cfg['message_en']), (v) => { cfg['message_en'] = v; })
      );
      break;
    }

    default: {
      const note = document.createElement('div');
      note.textContent = 'No configuration fields defined for this block type.';
      note.style.cssText = 'font-size:13px;color:#777777;font-family:Helvetica,"Helvetica Neue",Arial,sans-serif;';
      container.appendChild(note);
    }
  }

  return container;
}

// ── Block preview dispatcher ──────────────────────────────────────────────────

function buildBlockPreview(blockId: string, cfg: BlockConfig): HTMLElement | null {
  switch (blockId) {
    case 'text_display':
      return createTextDisplayPreview(cfg);
    case 'term_prompt':
      return createTermPromptPreview(cfg);
    case 'conversation':
      return createConversationPreview(cfg);
    case 'print_card':
      return createDefinitionPreview(cfg);
    case 'face_detect':
      return createWelcomePreview();
    case 'consent':
      return createWelcomePreview();
    case 'voice_chain':
      return createConversationPreview(cfg);
    case 'farewell':
      return createFarewellPreview();
    default:
      return null;
  }
}

function addSubLabel(container: HTMLElement, text: string): void {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText =
    'font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;' +
    'color:#777777;margin-top:16px;margin-bottom:8px;font-family:Helvetica,"Helvetica Neue",Arial,sans-serif;';
  container.appendChild(el);
}

function attachMsDisplay(sliderEl: HTMLElement, initialValue: number): void {
  const input = sliderEl.querySelector<HTMLInputElement>('input[type="range"]');
  const display = sliderEl.querySelector<HTMLSpanElement>('.cf-slider-value');
  if (display) display.textContent = fmtMs(initialValue);
  if (input) {
    input.addEventListener('input', () => {
      if (display) display.textContent = fmtMs(Number(input.value));
    });
  }
}

function fmtMs(ms: number): string {
  return (ms / 1000).toFixed(1) + 's';
}

// ── Main render ───────────────────────────────────────────────────────────────

export function render(container: HTMLElement): void {
  injectStyles();
  container.innerHTML = '';

  let programs: ProgramRow[] = [];
  let texts: TextOption[] = [];
  let selectedProgramId: string | null = null;
  let selectedBlockId: string | null = null;

  // Working copy of config for the selected program — mutated by form fields
  let workingConfig: Record<string, Record<string, unknown>> = {};

  // ── Top-level layout ──────────────────────────────────────────────────────

  const loadingEl = document.createElement('div');
  loadingEl.textContent = 'Loading programs...';
  loadingEl.style.cssText = 'color:#777777;font-size:14px;font-family:Helvetica,"Helvetica Neue",Arial,sans-serif;padding:20px 0;';
  container.appendChild(loadingEl);

  // ── Build UI after data load ───────────────────────────────────────────────

  function buildUI(): void {
    container.innerHTML = '';

    if (programs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'prog-empty';
      empty.textContent = 'No programs found. Insert a row into the programs table to get started.';
      container.appendChild(empty);
      return;
    }

    // If no program selected yet, pick active or first
    if (!selectedProgramId) {
      const active = programs.find((p) => p.is_active);
      selectedProgramId = active?.id ?? programs[0]!.id;
    }

    renderProgramView();
  }

  function renderProgramView(): void {
    container.innerHTML = '';

    const prog = programs.find((p) => p.id === selectedProgramId);
    if (!prog) return;

    // Initialise working copy from the selected program's config
    workingConfig = deepClone(prog.config);
    // Ensure every pipeline block has an entry
    for (const blockId of prog.pipeline) {
      if (!workingConfig[blockId]) workingConfig[blockId] = {};
    }

    // ── Selector row ──────────────────────────────────────────────────────

    const selectorRow = document.createElement('div');
    selectorRow.className = 'prog-selector-row';

    const selectorLabel = document.createElement('label');
    selectorLabel.textContent = 'Program';
    selectorRow.appendChild(selectorLabel);

    const select = document.createElement('select');
    for (const p of programs) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name + (p.is_active ? ' (active)' : '');
      opt.selected = p.id === selectedProgramId;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => {
      selectedProgramId = select.value;
      selectedBlockId = null;
      renderProgramView();
    });
    selectorRow.appendChild(select);

    // Name + status
    const nameEl = document.createElement('div');
    nameEl.className = 'prog-name';
    nameEl.textContent = prog.name;
    selectorRow.appendChild(nameEl);

    if (prog.is_active) {
      const badge = document.createElement('span');
      badge.className = 'prog-active-badge';
      badge.textContent = 'Active';
      selectorRow.appendChild(badge);
    } else {
      const setActiveBtn = document.createElement('button');
      setActiveBtn.type = 'button';
      setActiveBtn.className = 'prog-set-active-btn';
      setActiveBtn.textContent = 'Set as Active';
      setActiveBtn.addEventListener('click', () => { void handleSetActive(setActiveBtn); });
      selectorRow.appendChild(setActiveBtn);
    }

    container.appendChild(selectorRow);

    // ── Pipeline visualization ─────────────────────────────────────────────

    const pipeline = document.createElement('div');
    pipeline.className = 'pipeline';

    for (let i = 0; i < prog.pipeline.length; i++) {
      const blockId = prog.pipeline[i]!;

      const blockEl = document.createElement('div');
      blockEl.className = 'pipeline-block' + (blockId === selectedBlockId ? ' selected' : '');
      blockEl.textContent = getBlockLabel(blockId);
      blockEl.addEventListener('click', () => {
        if (selectedBlockId === blockId) {
          selectedBlockId = null;
        } else {
          selectedBlockId = blockId;
        }
        renderBlockDetail();
      });
      pipeline.appendChild(blockEl);

      if (i < prog.pipeline.length - 1) {
        const arrow = document.createElement('span');
        arrow.className = 'pipeline-arrow';
        arrow.textContent = '→';
        pipeline.appendChild(arrow);
      }
    }

    container.appendChild(pipeline);

    // ── Block detail area ──────────────────────────────────────────────────

    const blockDetailArea = document.createElement('div');
    blockDetailArea.id = 'block-detail-area';
    container.appendChild(blockDetailArea);

    // ── Save row ───────────────────────────────────────────────────────────

    const saveRow = document.createElement('div');
    saveRow.className = 'prog-save-row';

    const saveStatus = document.createElement('div');
    saveStatus.className = 'prog-save-status';

    const saveBtn = createSaveButton('Save Program Config', () => {
      void handleSave(saveBtn as HTMLButtonElement, saveStatus);
    });

    saveRow.appendChild(saveBtn);
    saveRow.appendChild(saveStatus);
    container.appendChild(saveRow);

    // Render initial block detail if one is selected
    renderBlockDetail();

    function renderBlockDetail(): void {
      // Update pipeline block selections
      pipeline.querySelectorAll<HTMLElement>('.pipeline-block').forEach((el, idx) => {
        const bid = prog!.pipeline[idx];
        if (bid === selectedBlockId) {
          el.classList.add('selected');
        } else {
          el.classList.remove('selected');
        }
      });

      blockDetailArea.innerHTML = '';

      if (!selectedBlockId) return;

      const blockCfg = workingConfig[selectedBlockId] ?? {};

      const panel = document.createElement('div');
      panel.className = 'block-detail';

      const header = document.createElement('div');
      header.className = 'block-detail-header';

      const title = document.createElement('div');
      title.className = 'block-detail-title';
      title.textContent = getBlockLabel(selectedBlockId);
      header.appendChild(title);

      const subtitle = document.createElement('div');
      subtitle.className = 'block-detail-subtitle';
      subtitle.textContent = selectedBlockId;
      header.appendChild(subtitle);

      panel.appendChild(header);

      const form = buildBlockConfigForm(selectedBlockId, blockCfg, texts);
      panel.appendChild(form);

      // ── Tablet preview ──────────────────────────────────────────────────
      const preview = buildBlockPreview(selectedBlockId, blockCfg);
      if (preview) {
        panel.appendChild(preview);

        // Rebuild preview on any input/change inside the form (debounced)
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        form.addEventListener('input', () => {
          if (debounceTimer !== null) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            const fresh = buildBlockPreview(selectedBlockId!, blockCfg);
            if (fresh) preview.replaceWith(fresh);
          }, 300);
        });
        form.addEventListener('change', () => {
          if (debounceTimer !== null) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            const fresh = buildBlockPreview(selectedBlockId!, blockCfg);
            if (fresh) preview.replaceWith(fresh);
          }, 300);
        });
      }

      blockDetailArea.appendChild(panel);
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleSetActive(btn: HTMLButtonElement): Promise<void> {
    if (!selectedProgramId) return;
    btn.disabled = true;
    btn.textContent = 'Setting...';

    // Deactivate all, then activate selected
    const { error: deactivateError } = await supabase
      .from('programs')
      .update({ is_active: false })
      .neq('id', selectedProgramId);

    if (deactivateError) {
      console.error('[programs] deactivate error:', deactivateError);
      btn.disabled = false;
      btn.textContent = 'Set as Active';
      return;
    }

    const { error: activateError } = await supabase
      .from('programs')
      .update({ is_active: true })
      .eq('id', selectedProgramId);

    if (activateError) {
      console.error('[programs] activate error:', activateError);
      btn.disabled = false;
      btn.textContent = 'Set as Active';
      return;
    }

    // Refresh data
    await loadData();
    renderProgramView();
  }

  async function handleSave(btn: HTMLButtonElement, statusEl: HTMLElement): Promise<void> {
    if (!selectedProgramId) return;
    btn.disabled = true;
    statusEl.textContent = 'Saving...';
    statusEl.style.color = '#777777';

    const { error } = await supabase
      .from('programs')
      .update({ config: workingConfig })
      .eq('id', selectedProgramId);

    if (error) {
      console.error('[programs] save error:', error);
      statusEl.textContent = 'Save failed: ' + error.message;
      statusEl.style.color = '#cc4444';
    } else {
      statusEl.textContent = 'Saved.';
      statusEl.style.color = '#66aa66';
      // Update local cache
      const prog = programs.find((p) => p.id === selectedProgramId);
      if (prog) prog.config = deepClone(workingConfig);
    }

    btn.disabled = false;
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  async function loadData(): Promise<void> {
    const [programsResult, textsResult] = await Promise.all([
      supabase.from('programs').select('*').order('name'),
      supabase.from('texts').select('id, title'),
    ]);

    if (programsResult.error) {
      console.warn('[programs] programs fetch error:', programsResult.error.message);
    } else {
      programs = (programsResult.data ?? []) as ProgramRow[];
    }

    if (textsResult.error) {
      console.warn('[programs] texts fetch error:', textsResult.error.message);
    } else {
      texts = (textsResult.data ?? []) as TextOption[];
    }
  }

  async function init(): Promise<void> {
    await loadData();
    buildUI();
  }

  void init();
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}
