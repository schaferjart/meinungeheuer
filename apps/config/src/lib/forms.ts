/**
 * forms.ts — DOM element builder helpers for the config app.
 *
 * All helpers return a styled HTMLElement ready to append.
 * Dark theme: bg #0a0a0a, border #2a2a2a, text #e0e0e0.
 */

const CSS = `
  .cf-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
  }
  .cf-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #777777;
  }
  .cf-input, .cf-select, .cf-textarea {
    padding: 8px 10px;
    background: #0a0a0a;
    color: #e0e0e0;
    border: 1px solid #2a2a2a;
    border-radius: 5px;
    font-size: 13px;
    font-family: system-ui, sans-serif;
    outline: none;
    transition: border-color 0.15s;
    width: 100%;
  }
  .cf-input:focus, .cf-select:focus, .cf-textarea:focus {
    border-color: #ffffff;
  }
  .cf-textarea {
    resize: vertical;
    line-height: 1.5;
  }
  .cf-select option {
    background: #0a0a0a;
    color: #e0e0e0;
  }
  .cf-slider-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .cf-slider {
    flex: 1;
    accent-color: #ffffff;
    cursor: pointer;
  }
  .cf-slider-value {
    font-size: 12px;
    color: #e0e0e0;
    min-width: 36px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .cf-toggle-row {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
  }
  .cf-toggle-row input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: #ffffff;
    cursor: pointer;
    flex-shrink: 0;
  }
  .cf-toggle-label {
    font-size: 13px;
    color: #e0e0e0;
    cursor: pointer;
  }
  .cf-radio-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .cf-radio-row {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
  .cf-radio-row input[type="radio"] {
    width: 14px;
    height: 14px;
    accent-color: #ffffff;
    cursor: pointer;
    flex-shrink: 0;
  }
  .cf-radio-row-label {
    font-size: 13px;
    color: #e0e0e0;
    cursor: pointer;
  }
  .cf-color-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .cf-color-input {
    width: 40px;
    height: 30px;
    padding: 2px;
    background: #0a0a0a;
    border: 1px solid #2a2a2a;
    border-radius: 5px;
    cursor: pointer;
  }
  .cf-color-hex {
    font-size: 12px;
    color: #777777;
    font-variant-numeric: tabular-nums;
  }
  .cf-section {
    margin-bottom: 28px;
    border: 1px solid #2a2a2a;
    border-radius: 7px;
    overflow: hidden;
  }
  .cf-section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: #0a0a0a;
    cursor: pointer;
    user-select: none;
    font-size: 13px;
    font-weight: 600;
    color: #e0e0e0;
    letter-spacing: 0.02em;
    border: none;
    width: 100%;
    text-align: left;
  }
  .cf-section-header:hover {
    background: #141414;
  }
  .cf-section-chevron {
    font-size: 10px;
    color: #777777;
    transition: transform 0.2s;
    margin-left: auto;
  }
  .cf-section-header.collapsed .cf-section-chevron {
    transform: rotate(-90deg);
  }
  .cf-section-body {
    padding: 16px 14px 6px;
    background: #0a0a1a;
  }
  .cf-section-body.hidden {
    display: none;
  }
  .cf-save-btn {
    padding: 8px 20px;
    background: #ffffff;
    color: #fff;
    border: none;
    border-radius: 5px;
    font-size: 13px;
    font-weight: 600;
    font-family: system-ui, sans-serif;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
    margin-top: 4px;
    margin-bottom: 14px;
  }
  .cf-save-btn:hover {
    background: #cccccc;
  }
  .cf-save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

let stylesInjected = false;

function injectStyles(): void {
  if (stylesInjected) return;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  stylesInjected = true;
}

function makeField(label: string): { wrapper: HTMLElement; labelEl: HTMLLabelElement } {
  injectStyles();
  const wrapper = document.createElement('div');
  wrapper.className = 'cf-field';
  const labelEl = document.createElement('label');
  labelEl.className = 'cf-label';
  labelEl.textContent = label;
  wrapper.appendChild(labelEl);
  return { wrapper, labelEl };
}

/** Labeled range slider with live value display. */
export function createSlider(
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  onChange: (v: number) => void
): HTMLElement {
  const { wrapper, labelEl } = makeField(label);

  const row = document.createElement('div');
  row.className = 'cf-slider-row';

  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'cf-slider';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);

  const display = document.createElement('span');
  display.className = 'cf-slider-value';
  display.textContent = String(value);

  const id = `cf-slider-${Math.random().toString(36).slice(2)}`;
  input.id = id;
  labelEl.htmlFor = id;

  input.addEventListener('input', () => {
    const v = Number(input.value);
    display.textContent = String(v);
    onChange(v);
  });

  row.appendChild(input);
  row.appendChild(display);
  wrapper.appendChild(row);
  return wrapper;
}

/** Labeled single-line text input. */
export function createTextInput(
  label: string,
  value: string,
  onChange: (v: string) => void
): HTMLElement {
  const { wrapper, labelEl } = makeField(label);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cf-input';
  input.value = value;

  const id = `cf-input-${Math.random().toString(36).slice(2)}`;
  input.id = id;
  labelEl.htmlFor = id;

  input.addEventListener('input', () => onChange(input.value));

  wrapper.appendChild(input);
  return wrapper;
}

/** Labeled multi-line textarea. */
export function createTextarea(
  label: string,
  value: string,
  rows: number,
  onChange: (v: string) => void
): HTMLElement {
  const { wrapper, labelEl } = makeField(label);

  const textarea = document.createElement('textarea');
  textarea.className = 'cf-textarea';
  textarea.rows = rows;
  textarea.value = value;

  const id = `cf-textarea-${Math.random().toString(36).slice(2)}`;
  textarea.id = id;
  labelEl.htmlFor = id;

  textarea.addEventListener('input', () => onChange(textarea.value));

  wrapper.appendChild(textarea);
  return wrapper;
}

/** Labeled checkbox toggle. */
export function createToggle(
  label: string,
  checked: boolean,
  onChange: (v: boolean) => void
): HTMLElement {
  injectStyles();
  const wrapper = document.createElement('div');
  wrapper.className = 'cf-field';

  const row = document.createElement('label');
  row.className = 'cf-toggle-row';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;

  const labelEl = document.createElement('span');
  labelEl.className = 'cf-toggle-label';
  labelEl.textContent = label;

  input.addEventListener('change', () => onChange(input.checked));

  row.appendChild(input);
  row.appendChild(labelEl);
  wrapper.appendChild(row);
  return wrapper;
}

/** Labeled select dropdown. */
export function createSelect(
  label: string,
  options: { value: string; label: string }[],
  value: string,
  onChange: (v: string) => void
): HTMLElement {
  const { wrapper, labelEl } = makeField(label);

  const select = document.createElement('select');
  select.className = 'cf-select';

  for (const opt of options) {
    const el = document.createElement('option');
    el.value = opt.value;
    el.textContent = opt.label;
    if (opt.value === value) el.selected = true;
    select.appendChild(el);
  }

  const id = `cf-select-${Math.random().toString(36).slice(2)}`;
  select.id = id;
  labelEl.htmlFor = id;

  select.addEventListener('change', () => onChange(select.value));

  wrapper.appendChild(select);
  return wrapper;
}

/** Labeled radio button group. */
export function createRadioGroup(
  label: string,
  options: { value: string; label: string }[],
  value: string,
  onChange: (v: string) => void
): HTMLElement {
  injectStyles();
  const wrapper = document.createElement('div');
  wrapper.className = 'cf-field';

  const groupLabel = document.createElement('span');
  groupLabel.className = 'cf-label';
  groupLabel.textContent = label;
  wrapper.appendChild(groupLabel);

  const group = document.createElement('div');
  group.className = 'cf-radio-group';
  const name = `cf-radio-${Math.random().toString(36).slice(2)}`;

  for (const opt of options) {
    const row = document.createElement('label');
    row.className = 'cf-radio-row';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = opt.value;
    input.checked = opt.value === value;

    const labelEl = document.createElement('span');
    labelEl.className = 'cf-radio-row-label';
    labelEl.textContent = opt.label;

    input.addEventListener('change', () => {
      if (input.checked) onChange(input.value);
    });

    row.appendChild(input);
    row.appendChild(labelEl);
    group.appendChild(row);
  }

  wrapper.appendChild(group);
  return wrapper;
}

/** Labeled color picker with hex value display. */
export function createColorPicker(
  label: string,
  value: string,
  onChange: (v: string) => void
): HTMLElement {
  const { wrapper, labelEl } = makeField(label);

  const row = document.createElement('div');
  row.className = 'cf-color-row';

  const input = document.createElement('input');
  input.type = 'color';
  input.className = 'cf-color-input';
  input.value = value;

  const hexDisplay = document.createElement('span');
  hexDisplay.className = 'cf-color-hex';
  hexDisplay.textContent = value;

  const id = `cf-color-${Math.random().toString(36).slice(2)}`;
  input.id = id;
  labelEl.htmlFor = id;

  input.addEventListener('input', () => {
    hexDisplay.textContent = input.value;
    onChange(input.value);
  });

  row.appendChild(input);
  row.appendChild(hexDisplay);
  wrapper.appendChild(row);
  return wrapper;
}

/** Labeled number input. */
export function createNumberInput(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (v: number) => void
): HTMLElement {
  const { wrapper, labelEl } = makeField(label);

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'cf-input';
  input.value = String(value);
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);

  const id = `cf-number-${Math.random().toString(36).slice(2)}`;
  input.id = id;
  labelEl.htmlFor = id;

  input.addEventListener('input', () => {
    const v = Number(input.value);
    if (!isNaN(v)) onChange(v);
  });

  wrapper.appendChild(input);
  return wrapper;
}

/** Collapsible section container with toggle header. */
export function createSection(title: string, collapsed = false): {
  section: HTMLElement;
  body: HTMLElement;
} {
  injectStyles();
  const section = document.createElement('div');
  section.className = 'cf-section';

  const header = document.createElement('button');
  header.type = 'button';
  header.className = collapsed ? 'cf-section-header collapsed' : 'cf-section-header';

  const titleSpan = document.createElement('span');
  titleSpan.textContent = title;

  const chevron = document.createElement('span');
  chevron.className = 'cf-section-chevron';
  chevron.textContent = '▼';

  header.appendChild(titleSpan);
  header.appendChild(chevron);

  const body = document.createElement('div');
  body.className = collapsed ? 'cf-section-body hidden' : 'cf-section-body';

  header.addEventListener('click', () => {
    const isCollapsed = header.classList.contains('collapsed');
    if (isCollapsed) {
      header.classList.remove('collapsed');
      body.classList.remove('hidden');
    } else {
      header.classList.add('collapsed');
      body.classList.add('hidden');
    }
  });

  section.appendChild(header);
  section.appendChild(body);
  return { section, body };
}

/** Styled save/action button. */
export function createSaveButton(label: string, onClick: () => void): HTMLElement {
  injectStyles();
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cf-save-btn';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}
