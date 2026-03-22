/**
 * installation.ts — Installation configuration tab.
 *
 * Reads/writes `installation_config` from Supabase.
 * Four collapsible sections: Mode & Program, Stage Flags, Face Detection, Screen Timers.
 */

import {
  createRadioGroup,
  createTextInput,
  createSelect,
  createToggle,
  createSlider,
  createSection,
  createSaveButton,
} from '../lib/forms.js';
import { supabase } from '../lib/supabase.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface InstallationConfig {
  id: string;
  mode: string;
  program: string;
  active_term: string | null;
  active_text_id: string | null;
  language: string;
  stage_text_reading: boolean | null;
  stage_term_prompt: boolean | null;
  stage_portrait: boolean | null;
  stage_printing: boolean | null;
  face_detection_enabled: boolean;
  face_wake_ms: number;
  face_sleep_ms: number;
  face_detection_interval_ms: number;
  face_min_confidence: number;
  welcome_duration_ms: number;
  term_prompt_duration_ms: number;
  definition_display_ms: number;
  farewell_duration_ms: number;
  print_timeout_ms: number;
}

interface TextRow {
  id: string;
  title: string;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS: Omit<InstallationConfig, 'id'> = {
  mode: 'text_term',
  program: 'aphorism',
  active_term: '',
  active_text_id: null,
  language: 'de',
  stage_text_reading: null,
  stage_term_prompt: null,
  stage_portrait: null,
  stage_printing: null,
  face_detection_enabled: true,
  face_wake_ms: 3000,
  face_sleep_ms: 30000,
  face_detection_interval_ms: 500,
  face_min_confidence: 0.5,
  welcome_duration_ms: 3000,
  term_prompt_duration_ms: 2000,
  definition_display_ms: 10000,
  farewell_duration_ms: 15000,
  print_timeout_ms: 30000,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format milliseconds as seconds string: 3000 → "3.0s" */
function fmtMs(ms: number): string {
  return (ms / 1000).toFixed(1) + 's';
}

/** Update the slider value display span — locates it by being the last span sibling of the range input. */
function updateSliderDisplay(sliderEl: HTMLElement, value: number, formatter: (v: number) => string): void {
  const display = sliderEl.querySelector<HTMLSpanElement>('.cf-slider-value');
  if (display) display.textContent = formatter(value);
  const input = sliderEl.querySelector<HTMLInputElement>('input[type="range"]');
  if (input) input.value = String(value);
}

// ── Stage flag field (toggle + reset-to-null button) ──────────────────────────

interface StageFlagField {
  el: HTMLElement;
  getValue: () => boolean | null;
  setValue: (v: boolean | null) => void;
}

function createStageFlagField(label: string, initial: boolean | null): StageFlagField {
  let current: boolean | null = initial;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:14px;';

  // Toggle
  const toggleWrapper = document.createElement('label');
  toggleWrapper.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = current === true;
  checkbox.style.cssText = 'width:16px;height:16px;accent-color:#ffffff;cursor:pointer;flex-shrink:0;';

  const labelSpan = document.createElement('span');
  labelSpan.textContent = label;
  labelSpan.style.cssText = 'font-size:13px;color:#e0e0e0;cursor:pointer;';

  const nullIndicator = document.createElement('span');
  nullIndicator.style.cssText = 'font-size:11px;color:#777777;';
  nullIndicator.textContent = current === null ? '(program default)' : '';

  checkbox.addEventListener('change', () => {
    current = checkbox.checked;
    nullIndicator.textContent = '';
  });

  toggleWrapper.appendChild(checkbox);
  toggleWrapper.appendChild(labelSpan);

  // Reset button
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.textContent = 'reset';
  resetBtn.title = 'Reset to program default (null)';
  resetBtn.style.cssText = `
    padding:2px 7px;
    font-size:11px;
    background:transparent;
    color:#777777;
    border:1px solid #2a2a2a;
    border-radius:4px;
    cursor:pointer;
    font-family:system-ui,sans-serif;
    flex-shrink:0;
  `;
  resetBtn.addEventListener('mouseover', () => { resetBtn.style.color = '#e0e0e0'; });
  resetBtn.addEventListener('mouseout', () => { resetBtn.style.color = '#777777'; });

  resetBtn.addEventListener('click', () => {
    current = null;
    checkbox.checked = false;
    nullIndicator.textContent = '(program default)';
  });

  wrapper.appendChild(toggleWrapper);
  wrapper.appendChild(nullIndicator);
  wrapper.appendChild(resetBtn);

  return {
    el: wrapper,
    getValue: () => current,
    setValue: (v) => {
      current = v;
      checkbox.checked = v === true;
      nullIndicator.textContent = v === null ? '(program default)' : '';
    },
  };
}

// ── Main render ───────────────────────────────────────────────────────────────

export function render(container: HTMLElement): void {
  container.innerHTML = '';

  // State
  let config: InstallationConfig = { id: '00000000-0000-0000-0000-000000000000', ...DEFAULTS };
  let texts: TextRow[] = [];

  // Mutable form state (mirrors config, updated by onChange callbacks)
  const form = { ...DEFAULTS } as typeof DEFAULTS & { active_term: string; active_text_id: string | null };

  // Status message
  const statusEl = document.createElement('div');
  statusEl.style.cssText = `
    font-size:12px;
    margin-bottom:12px;
    min-height:18px;
    font-family:system-ui,sans-serif;
    color:#777777;
  `;

  function setStatus(msg: string, color = '#777777'): void {
    statusEl.textContent = msg;
    statusEl.style.color = color;
  }

  // Loading message
  const loadingEl = document.createElement('div');
  loadingEl.textContent = 'Loading...';
  loadingEl.style.cssText = 'color:#777777;font-size:14px;font-family:system-ui,sans-serif;';
  container.appendChild(loadingEl);

  // Stage flag refs (created after data loads, captured here)
  let stageFlagRefs: {
    textReading: StageFlagField;
    termPrompt: StageFlagField;
    portrait: StageFlagField;
    printing: StageFlagField;
  } | null = null;

  // Slider refs for update-after-load
  const sliderRefs: Record<string, HTMLElement> = {};

  // ── Build UI ──────────────────────────────────────────────────────────────

  function buildUI(): void {
    container.innerHTML = '';
    container.appendChild(statusEl);

    // ── Section 1: Mode & Program ────────────────────────────────────────────

    const { section: sec1, body: body1 } = createSection('Mode & Program');

    body1.appendChild(
      createRadioGroup(
        'Mode',
        [
          { value: 'text_term', label: 'text_term — Visitor reads text, AI picks concept' },
          { value: 'term_only', label: 'term_only — Naked term shown directly' },
          { value: 'chain', label: 'chain — Previous definition becomes next text' },
        ],
        form.mode,
        (v) => { form.mode = v; }
      )
    );

    body1.appendChild(
      createRadioGroup(
        'Program',
        [
          { value: 'aphorism', label: 'aphorism' },
          { value: 'free_association', label: 'free_association' },
          { value: 'voice_chain', label: 'voice_chain' },
        ],
        form.program,
        (v) => { form.program = v; }
      )
    );

    body1.appendChild(
      createTextInput('Active term', form.active_term ?? '', (v) => { form.active_term = v; })
    );

    const textOptions: { value: string; label: string }[] = [
      { value: '', label: '— none —' },
      ...texts.map((t) => ({ value: t.id, label: t.title })),
    ];
    body1.appendChild(
      createSelect('Active text', textOptions, form.active_text_id ?? '', (v) => {
        form.active_text_id = v === '' ? null : v;
      })
    );

    body1.appendChild(
      createRadioGroup(
        'Language',
        [
          { value: 'de', label: 'de — Deutsch' },
          { value: 'en', label: 'en — English' },
        ],
        form.language,
        (v) => { form.language = v; }
      )
    );

    container.appendChild(sec1);

    // ── Section 2: Stage Flags ────────────────────────────────────────────────

    const { section: sec2, body: body2 } = createSection('Stage Flags (override program defaults)', true);

    const noteEl = document.createElement('p');
    noteEl.textContent = 'Leave unchecked to use program defaults. Click "reset" to restore null (program default).';
    noteEl.style.cssText = 'font-size:12px;color:#777777;margin-bottom:14px;line-height:1.5;font-family:system-ui,sans-serif;';
    body2.appendChild(noteEl);

    const sfTextReading = createStageFlagField('Text reading', config.stage_text_reading);
    const sfTermPrompt = createStageFlagField('Term prompt', config.stage_term_prompt);
    const sfPortrait = createStageFlagField('Portrait capture', config.stage_portrait);
    const sfPrinting = createStageFlagField('Printing', config.stage_printing);

    body2.appendChild(sfTextReading.el);
    body2.appendChild(sfTermPrompt.el);
    body2.appendChild(sfPortrait.el);
    body2.appendChild(sfPrinting.el);

    stageFlagRefs = {
      textReading: sfTextReading,
      termPrompt: sfTermPrompt,
      portrait: sfPortrait,
      printing: sfPrinting,
    };

    container.appendChild(sec2);

    // ── Section 3: Face Detection ─────────────────────────────────────────────

    const { section: sec3, body: body3 } = createSection('Face Detection', true);

    body3.appendChild(
      createToggle('Enabled', form.face_detection_enabled, (v) => { form.face_detection_enabled = v; })
    );

    const sliderWake = createSlider(
      'Wake threshold',
      500, 10000, 100, form.face_wake_ms,
      (v) => { form.face_wake_ms = v; }
    );
    updateSliderDisplay(sliderWake, form.face_wake_ms, fmtMs);
    sliderRefs['wake'] = sliderWake;
    // Override initial display set by createSlider (shows raw number, we want "Xs")
    const wakeInput = sliderWake.querySelector<HTMLInputElement>('input[type="range"]');
    const wakeDisplay = sliderWake.querySelector<HTMLSpanElement>('.cf-slider-value');
    if (wakeDisplay) wakeDisplay.textContent = fmtMs(form.face_wake_ms);
    if (wakeInput) {
      wakeInput.addEventListener('input', () => {
        if (wakeDisplay) wakeDisplay.textContent = fmtMs(Number(wakeInput.value));
      });
    }
    body3.appendChild(sliderWake);

    const sliderSleep = createSlider(
      'Sleep threshold',
      5000, 120000, 1000, form.face_sleep_ms,
      (v) => { form.face_sleep_ms = v; }
    );
    const sleepInput = sliderSleep.querySelector<HTMLInputElement>('input[type="range"]');
    const sleepDisplay = sliderSleep.querySelector<HTMLSpanElement>('.cf-slider-value');
    if (sleepDisplay) sleepDisplay.textContent = fmtMs(form.face_sleep_ms);
    if (sleepInput) {
      sleepInput.addEventListener('input', () => {
        if (sleepDisplay) sleepDisplay.textContent = fmtMs(Number(sleepInput.value));
      });
    }
    body3.appendChild(sliderSleep);

    const sliderDetInterval = createSlider(
      'Detection interval',
      100, 2000, 50, form.face_detection_interval_ms,
      (v) => { form.face_detection_interval_ms = v; }
    );
    const detInput = sliderDetInterval.querySelector<HTMLInputElement>('input[type="range"]');
    const detDisplay = sliderDetInterval.querySelector<HTMLSpanElement>('.cf-slider-value');
    if (detDisplay) detDisplay.textContent = fmtMs(form.face_detection_interval_ms);
    if (detInput) {
      detInput.addEventListener('input', () => {
        if (detDisplay) detDisplay.textContent = fmtMs(Number(detInput.value));
      });
    }
    body3.appendChild(sliderDetInterval);

    const sliderConf = createSlider(
      'Min confidence',
      0.1, 1.0, 0.05, form.face_min_confidence,
      (v) => { form.face_min_confidence = v; }
    );
    const confInput = sliderConf.querySelector<HTMLInputElement>('input[type="range"]');
    const confDisplay = sliderConf.querySelector<HTMLSpanElement>('.cf-slider-value');
    if (confDisplay) confDisplay.textContent = String(form.face_min_confidence.toFixed(2));
    if (confInput) {
      confInput.addEventListener('input', () => {
        if (confDisplay) confDisplay.textContent = Number(confInput.value).toFixed(2);
      });
    }
    body3.appendChild(sliderConf);

    container.appendChild(sec3);

    // ── Section 4: Screen Timers ──────────────────────────────────────────────

    const { section: sec4, body: body4 } = createSection('Screen Timers', true);

    const timerFields: Array<{
      label: string;
      key: keyof typeof form;
      min: number;
      max: number;
      step: number;
    }> = [
      { label: 'Welcome duration', key: 'welcome_duration_ms', min: 1000, max: 10000, step: 500 },
      { label: 'Term prompt duration', key: 'term_prompt_duration_ms', min: 1000, max: 10000, step: 500 },
      { label: 'Definition display', key: 'definition_display_ms', min: 3000, max: 30000, step: 1000 },
      { label: 'Farewell duration', key: 'farewell_duration_ms', min: 5000, max: 60000, step: 1000 },
      { label: 'Print timeout', key: 'print_timeout_ms', min: 10000, max: 120000, step: 5000 },
    ];

    for (const tf of timerFields) {
      const currentVal = form[tf.key] as number;
      const sliderEl = createSlider(
        tf.label,
        tf.min, tf.max, tf.step, currentVal,
        (v) => { (form as Record<string, unknown>)[tf.key] = v; }
      );
      const inp = sliderEl.querySelector<HTMLInputElement>('input[type="range"]');
      const disp = sliderEl.querySelector<HTMLSpanElement>('.cf-slider-value');
      if (disp) disp.textContent = fmtMs(currentVal);
      if (inp) {
        inp.addEventListener('input', () => {
          if (disp) disp.textContent = fmtMs(Number(inp.value));
        });
      }
      body4.appendChild(sliderEl);
    }

    container.appendChild(sec4);

    // ── Save button ───────────────────────────────────────────────────────────

    const saveBtn = createSaveButton('Save Installation Config', () => {
      void handleSave(saveBtn);
    });
    container.appendChild(saveBtn);
    container.appendChild(statusEl);
  }

  // ── Save handler ─────────────────────────────────────────────────────────

  async function handleSave(btn: HTMLElement): Promise<void> {
    const btnEl = btn as HTMLButtonElement;
    btnEl.disabled = true;
    setStatus('Saving...', '#777777');

    const payload: Omit<InstallationConfig, 'id'> = {
      mode: form.mode,
      program: form.program,
      active_term: form.active_term || null,
      active_text_id: form.active_text_id || null,
      language: form.language,
      stage_text_reading: stageFlagRefs ? stageFlagRefs.textReading.getValue() : null,
      stage_term_prompt: stageFlagRefs ? stageFlagRefs.termPrompt.getValue() : null,
      stage_portrait: stageFlagRefs ? stageFlagRefs.portrait.getValue() : null,
      stage_printing: stageFlagRefs ? stageFlagRefs.printing.getValue() : null,
      face_detection_enabled: form.face_detection_enabled,
      face_wake_ms: form.face_wake_ms,
      face_sleep_ms: form.face_sleep_ms,
      face_detection_interval_ms: form.face_detection_interval_ms,
      face_min_confidence: form.face_min_confidence,
      welcome_duration_ms: form.welcome_duration_ms,
      term_prompt_duration_ms: form.term_prompt_duration_ms,
      definition_display_ms: form.definition_display_ms,
      farewell_duration_ms: form.farewell_duration_ms,
      print_timeout_ms: form.print_timeout_ms,
    };

    const { error } = await supabase
      .from('installation_config')
      .update(payload)
      .eq('id', config.id);

    if (error) {
      console.error('[installation] save error:', error);
      setStatus('Save failed: ' + error.message, '#e05b5b');
    } else {
      setStatus('Saved.', '#5bba6f');
      // Refresh config id from DB in case it changed
      config = { ...config, ...payload };
    }

    btnEl.disabled = false;
  }

  // ── Fetch data then render ────────────────────────────────────────────────

  async function loadAndRender(): Promise<void> {
    // Fetch config and texts in parallel
    const [configResult, textsResult] = await Promise.all([
      supabase.from('installation_config').select('*').limit(1).single(),
      supabase.from('texts').select('id, title'),
    ]);

    if (configResult.error) {
      console.warn('[installation] config fetch error:', configResult.error.message);
      // Keep defaults, still render
    } else if (configResult.data) {
      config = configResult.data as InstallationConfig;
      // Populate form with DB values
      form.mode = config.mode ?? form.mode;
      form.program = config.program ?? form.program;
      form.active_term = config.active_term ?? '';
      form.active_text_id = config.active_text_id ?? null;
      form.language = config.language ?? form.language;
      form.stage_text_reading = config.stage_text_reading;
      form.stage_term_prompt = config.stage_term_prompt;
      form.stage_portrait = config.stage_portrait;
      form.stage_printing = config.stage_printing;
      form.face_detection_enabled = config.face_detection_enabled ?? form.face_detection_enabled;
      form.face_wake_ms = config.face_wake_ms ?? form.face_wake_ms;
      form.face_sleep_ms = config.face_sleep_ms ?? form.face_sleep_ms;
      form.face_detection_interval_ms = config.face_detection_interval_ms ?? form.face_detection_interval_ms;
      form.face_min_confidence = config.face_min_confidence ?? form.face_min_confidence;
      form.welcome_duration_ms = config.welcome_duration_ms ?? form.welcome_duration_ms;
      form.term_prompt_duration_ms = config.term_prompt_duration_ms ?? form.term_prompt_duration_ms;
      form.definition_display_ms = config.definition_display_ms ?? form.definition_display_ms;
      form.farewell_duration_ms = config.farewell_duration_ms ?? form.farewell_duration_ms;
      form.print_timeout_ms = config.print_timeout_ms ?? form.print_timeout_ms;
    }

    if (textsResult.error) {
      console.warn('[installation] texts fetch error:', textsResult.error.message);
    } else if (textsResult.data) {
      texts = textsResult.data as TextRow[];
    }

    buildUI();
  }

  void loadAndRender();
}
