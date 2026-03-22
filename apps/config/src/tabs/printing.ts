/**
 * printing.ts — Printing configuration tab.
 *
 * Five collapsible sections:
 *   1. Card Template (render_config)
 *   2. Dithering (render_config.halftone_config)
 *   3. Portrait Pipeline (render_config.portrait_config + installation_config)
 *   4. Print Composer (slice, label, print)
 *   5. Test Printing
 */

import {
  createRadioGroup,
  createTextInput,
  createNumberInput,
  createTextarea,
  createToggle,
  createSlider,
  createSection,
  createSaveButton,
} from '../lib/forms.js';
import { supabase } from '../lib/supabase.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const CONFIG_ID = '00000000-0000-0000-0000-000000000000';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TemplateConfig {
  size_word: number;
  size_body: number;
  size_cite: number;
  size_date: number;
  line_spacing: number;
  gap_after_word: number;
  gap_before_cite: number;
  margin: number;
  font_word: string;
  font_body: string;
  font_cite: string;
  font_date: string;
  hard_wrap?: boolean;
}

interface HalftoneConfig {
  mode: string;
  dot_size: number;
  contrast: number;
  brightness: number;
  sharpness: number;
  blur: number;
}

interface PortraitConfig {
  selection_model: string;
  style_prompt: string;
  dither_mode: string;
  blur: number;
  zoom0_pad_top: number;
  zoom0_pad_bottom: number;
  zoom0_aspect: number;
  zoom1_pad_top: number;
  zoom1_pad_bottom: number;
  zoom3_strip_width: number;
}

interface RenderConfig {
  id: boolean;
  template: string;
  paper_px: number;
  dict_config: TemplateConfig;
  helv_config: TemplateConfig;
  acid_config: TemplateConfig & { hard_wrap: boolean };
  halftone_config: HalftoneConfig;
  portrait_config: PortraitConfig;
}

interface InstallationConfig {
  id: string;
  portrait_capture_delay_ms: number;
  portrait_jpeg_quality: number;
  portrait_blur_radius_css: number;
  print_renderer_url: string | null;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = {
  size_word: 72,
  size_body: 18,
  size_cite: 14,
  size_date: 12,
  line_spacing: 1.4,
  gap_after_word: 20,
  gap_before_cite: 30,
  margin: 30,
  font_word: '',
  font_body: '',
  font_cite: '',
  font_date: '',
};

const DEFAULT_RENDER_CONFIG: RenderConfig = {
  id: true,
  template: 'dictionary',
  paper_px: 576,
  dict_config: { ...DEFAULT_TEMPLATE_CONFIG },
  helv_config: { ...DEFAULT_TEMPLATE_CONFIG },
  acid_config: { ...DEFAULT_TEMPLATE_CONFIG, hard_wrap: false },
  halftone_config: {
    mode: 'floyd',
    dot_size: 6,
    contrast: 1.3,
    brightness: 1.0,
    sharpness: 1.2,
    blur: 0,
  },
  portrait_config: {
    selection_model: '',
    style_prompt: '',
    dither_mode: 'floyd',
    blur: 10,
    zoom0_pad_top: 0.1,
    zoom0_pad_bottom: 0.1,
    zoom0_aspect: 0.7,
    zoom1_pad_top: 0.05,
    zoom1_pad_bottom: 0.05,
    zoom3_strip_width: 0.25,
  },
};

const DEFAULT_INSTALL_PORTRAIT: Pick<
  InstallationConfig,
  'portrait_capture_delay_ms' | 'portrait_jpeg_quality' | 'portrait_blur_radius_css' | 'print_renderer_url'
> = {
  portrait_capture_delay_ms: 3000,
  portrait_jpeg_quality: 0.85,
  portrait_blur_radius_css: 0,
  print_renderer_url: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStatusEl(): {
  el: HTMLElement;
  set: (msg: string, color?: string) => void;
} {
  const el = document.createElement('div');
  el.style.cssText =
    'font-size:12px;min-height:18px;font-family:system-ui,sans-serif;color:#888899;margin-bottom:8px;';
  return {
    el,
    set(msg: string, color = '#888899') {
      el.textContent = msg;
      el.style.color = color;
    },
  };
}

function deepMerge<T extends object>(defaults: T, overrides: Partial<T>): T {
  const result = { ...defaults };
  for (const key of Object.keys(overrides) as (keyof T)[]) {
    const val = overrides[key];
    if (val !== undefined && val !== null) {
      result[key] = val;
    }
  }
  return result;
}

// ── Section 1: Card Template ──────────────────────────────────────────────────

function buildTemplateSection(
  rc: RenderConfig,
  rendererUrl: string,
  onSave: (patch: Partial<RenderConfig>) => Promise<void>
): HTMLElement {
  const { section, body } = createSection('Card Template');

  const status = makeStatusEl();
  body.appendChild(status.el);

  // Local mutable state
  let activeTemplate = rc.template;
  let paperPx = rc.paper_px;
  const dictCfg = { ...rc.dict_config };
  const helvCfg = { ...rc.helv_config };
  const acidCfg = { ...rc.acid_config };

  // Active template radio
  body.appendChild(
    createRadioGroup(
      'Active template',
      [
        { value: 'dictionary', label: 'dictionary' },
        { value: 'helvetica', label: 'helvetica' },
        { value: 'acidic', label: 'acidic' },
      ],
      activeTemplate,
      (v) => {
        activeTemplate = v;
        updateTemplateVisibility();
      }
    )
  );

  // Paper width
  body.appendChild(
    createNumberInput('Paper width (px)', paperPx, 100, 2000, 1, (v) => {
      paperPx = v;
    })
  );

  // Per-template panels
  const dictPanel = buildTemplateConfigPanel('Dictionary settings', dictCfg, false);
  const helvPanel = buildTemplateConfigPanel('Helvetica settings', helvCfg, false);
  const acidPanel = buildTemplateConfigPanel('Acidic settings', acidCfg, true);

  body.appendChild(dictPanel);
  body.appendChild(helvPanel);
  body.appendChild(acidPanel);

  function updateTemplateVisibility(): void {
    dictPanel.style.display = activeTemplate === 'dictionary' ? '' : 'none';
    helvPanel.style.display = activeTemplate === 'helvetica' ? '' : 'none';
    acidPanel.style.display = activeTemplate === 'acidic' ? '' : 'none';
  }
  updateTemplateVisibility();

  // Preview area
  const previewContainer = document.createElement('div');
  previewContainer.style.cssText = 'margin-top:14px;margin-bottom:14px;';
  const previewImg = document.createElement('img');
  previewImg.style.cssText =
    'display:none;max-width:100%;border:1px solid #2a2a40;border-radius:5px;margin-top:8px;';
  const previewNote = document.createElement('div');
  previewNote.style.cssText = 'font-size:12px;color:#888899;font-family:system-ui,sans-serif;';
  previewContainer.appendChild(previewNote);
  previewContainer.appendChild(previewImg);

  const previewBtn = document.createElement('button');
  previewBtn.type = 'button';
  previewBtn.textContent = 'Preview Card';
  previewBtn.style.cssText =
    'padding:7px 16px;background:#1a1a2e;color:#e0e0e0;border:1px solid #2a2a40;border-radius:5px;font-size:13px;font-family:system-ui,sans-serif;cursor:pointer;margin-bottom:8px;';
  previewBtn.addEventListener('click', () => {
    void handlePreview();
  });
  body.appendChild(previewBtn);
  body.appendChild(previewContainer);

  async function handlePreview(): Promise<void> {
    previewNote.textContent = 'Rendering...';
    previewImg.style.display = 'none';

    const activeCfg =
      activeTemplate === 'dictionary'
        ? dictCfg
        : activeTemplate === 'helvetica'
          ? helvCfg
          : acidCfg;

    try {
      const res = await fetch(`${rendererUrl}/render/dictionary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: 'BEISPIEL',
          definition:
            'Ein Beispiel ist ein Leuchtturm im Nebel der Abstraktion.',
          citations: ['Konfiguration, 2026'],
          template: activeTemplate,
          config_override: activeCfg,
        }),
      });

      if (!res.ok) {
        previewNote.textContent = `Preview failed: HTTP ${res.status}`;
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      previewImg.src = url;
      previewImg.style.display = 'block';
      previewNote.textContent = '';
    } catch {
      previewNote.textContent = 'Preview unavailable — renderer not reachable.';
    }
  }

  // Save button
  const saveBtn = createSaveButton('Save Card Template', () => {
    void handleSave();
  });
  body.appendChild(saveBtn);

  async function handleSave(): Promise<void> {
    (saveBtn as HTMLButtonElement).disabled = true;
    status.set('Saving...', '#888899');

    await onSave({
      template: activeTemplate,
      paper_px: paperPx,
      dict_config: { ...dictCfg },
      helv_config: { ...helvCfg },
      acid_config: { ...acidCfg },
    });

    (saveBtn as HTMLButtonElement).disabled = false;
  }

  return section;
}

function buildTemplateConfigPanel(
  _title: string,
  cfg: TemplateConfig,
  isAcidic: boolean
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText =
    'border:1px solid #2a2a40;border-radius:5px;padding:12px;margin-bottom:12px;';

  const panelLabel = document.createElement('div');
  panelLabel.textContent = _title;
  panelLabel.style.cssText =
    'font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#888899;margin-bottom:12px;';
  wrapper.appendChild(panelLabel);

  // Size fields
  const sizeFields: Array<{ label: string; key: keyof TemplateConfig }> = [
    { label: 'Size word', key: 'size_word' },
    { label: 'Size body', key: 'size_body' },
    { label: 'Size cite', key: 'size_cite' },
    { label: 'Size date', key: 'size_date' },
  ];

  for (const sf of sizeFields) {
    wrapper.appendChild(
      createNumberInput(sf.label, cfg[sf.key] as number, 6, 200, 1, (v) => {
        (cfg as unknown as Record<string, unknown>)[sf.key] = v;
      })
    );
  }

  // Line spacing slider
  wrapper.appendChild(
    createSlider('Line spacing', 1.0, 2.0, 0.05, cfg.line_spacing, (v) => {
      cfg.line_spacing = v;
    })
  );

  // Gap fields
  const gapFields: Array<{ label: string; key: keyof TemplateConfig }> = [
    { label: 'Gap after word', key: 'gap_after_word' },
    { label: 'Gap before cite', key: 'gap_before_cite' },
    { label: 'Margin', key: 'margin' },
  ];

  for (const gf of gapFields) {
    wrapper.appendChild(
      createNumberInput(gf.label, cfg[gf.key] as number, 0, 300, 1, (v) => {
        (cfg as unknown as Record<string, unknown>)[gf.key] = v;
      })
    );
  }

  // Font path fields
  const fontFields: Array<{ label: string; key: keyof TemplateConfig }> = [
    { label: 'Font word path', key: 'font_word' },
    { label: 'Font body path', key: 'font_body' },
    { label: 'Font cite path', key: 'font_cite' },
    { label: 'Font date path', key: 'font_date' },
  ];

  for (const ff of fontFields) {
    wrapper.appendChild(
      createTextInput(ff.label, (cfg[ff.key] as string) ?? '', (v) => {
        (cfg as unknown as Record<string, unknown>)[ff.key] = v;
      })
    );
  }

  // Acidic hard_wrap
  if (isAcidic) {
    const acidCfg = cfg as TemplateConfig & { hard_wrap: boolean };
    wrapper.appendChild(
      createToggle('Hard wrap', acidCfg.hard_wrap ?? false, (v) => {
        acidCfg.hard_wrap = v;
      })
    );
  }

  return wrapper;
}

// ── Section 2: Dithering ──────────────────────────────────────────────────────

function buildDitheringSection(
  rc: RenderConfig,
  onSave: (halftone: HalftoneConfig) => Promise<void>
): HTMLElement {
  const { section, body } = createSection('Dithering', true);

  const status = makeStatusEl();
  body.appendChild(status.el);

  const cfg = { ...rc.halftone_config };

  body.appendChild(
    createRadioGroup(
      'Mode',
      [
        { value: 'floyd', label: 'floyd' },
        { value: 'bayer', label: 'bayer' },
        { value: 'halftone', label: 'halftone' },
      ],
      cfg.mode,
      (v) => {
        cfg.mode = v;
      }
    )
  );

  body.appendChild(
    createSlider('Dot size (halftone only)', 2, 12, 1, cfg.dot_size, (v) => {
      cfg.dot_size = v;
    })
  );

  body.appendChild(
    createSlider('Contrast', 0.5, 2.0, 0.05, cfg.contrast, (v) => {
      cfg.contrast = v;
    })
  );

  body.appendChild(
    createSlider('Brightness', 0.5, 2.0, 0.05, cfg.brightness, (v) => {
      cfg.brightness = v;
    })
  );

  body.appendChild(
    createSlider('Sharpness', 0.5, 2.0, 0.05, cfg.sharpness, (v) => {
      cfg.sharpness = v;
    })
  );

  body.appendChild(
    createSlider('Blur', 0, 30, 1, cfg.blur, (v) => {
      cfg.blur = v;
    })
  );

  const saveBtn = createSaveButton('Save Dithering', () => {
    void handleSave();
  });
  body.appendChild(saveBtn);

  async function handleSave(): Promise<void> {
    (saveBtn as HTMLButtonElement).disabled = true;
    status.set('Saving...', '#888899');
    await onSave({ ...cfg });
    (saveBtn as HTMLButtonElement).disabled = false;
  }

  return section;
}

// ── Section 3: Portrait Pipeline ─────────────────────────────────────────────

function buildPortraitSection(
  rc: RenderConfig,
  install: InstallationConfig,
  onSave: (
    portrait: PortraitConfig,
    installPatch: Partial<InstallationConfig>
  ) => Promise<void>
): HTMLElement {
  const { section, body } = createSection('Portrait Pipeline', true);

  const status = makeStatusEl();
  body.appendChild(status.el);

  const cfg = { ...rc.portrait_config };
  let captureDelay = install.portrait_capture_delay_ms ?? DEFAULT_INSTALL_PORTRAIT.portrait_capture_delay_ms;
  let jpegQuality = install.portrait_jpeg_quality ?? DEFAULT_INSTALL_PORTRAIT.portrait_jpeg_quality;
  let blurRadius = install.portrait_blur_radius_css ?? DEFAULT_INSTALL_PORTRAIT.portrait_blur_radius_css;

  body.appendChild(
    createTextInput('Selection model', cfg.selection_model ?? '', (v) => {
      cfg.selection_model = v;
    })
  );

  body.appendChild(
    createTextarea('Style transfer prompt', cfg.style_prompt ?? '', 15, (v) => {
      cfg.style_prompt = v;
    })
  );

  body.appendChild(
    createRadioGroup(
      'Dither mode',
      [
        { value: 'floyd', label: 'floyd' },
        { value: 'bayer', label: 'bayer' },
        { value: 'halftone', label: 'halftone' },
      ],
      cfg.dither_mode,
      (v) => {
        cfg.dither_mode = v;
      }
    )
  );

  body.appendChild(
    createSlider('Blur', 0, 30, 1, cfg.blur, (v) => {
      cfg.blur = v;
    })
  );

  // Crop parameters
  const cropLabel = document.createElement('div');
  cropLabel.textContent = 'Crop Parameters';
  cropLabel.style.cssText =
    'font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#888899;margin-top:14px;margin-bottom:10px;';
  body.appendChild(cropLabel);

  // Zoom 0
  const zoom0Label = document.createElement('div');
  zoom0Label.textContent = 'Zoom 0';
  zoom0Label.style.cssText = 'font-size:12px;color:#888899;margin-bottom:6px;font-family:system-ui,sans-serif;';
  body.appendChild(zoom0Label);

  body.appendChild(
    createSlider('Pad top', 0, 1, 0.01, cfg.zoom0_pad_top, (v) => {
      cfg.zoom0_pad_top = v;
    })
  );

  body.appendChild(
    createSlider('Pad bottom', 0, 1, 0.01, cfg.zoom0_pad_bottom, (v) => {
      cfg.zoom0_pad_bottom = v;
    })
  );

  body.appendChild(
    createSlider('Aspect', 0.4, 1.0, 0.01, cfg.zoom0_aspect, (v) => {
      cfg.zoom0_aspect = v;
    })
  );

  // Zoom 1
  const zoom1Label = document.createElement('div');
  zoom1Label.textContent = 'Zoom 1';
  zoom1Label.style.cssText = 'font-size:12px;color:#888899;margin-bottom:6px;margin-top:10px;font-family:system-ui,sans-serif;';
  body.appendChild(zoom1Label);

  body.appendChild(
    createSlider('Pad top', 0, 0.5, 0.01, cfg.zoom1_pad_top, (v) => {
      cfg.zoom1_pad_top = v;
    })
  );

  body.appendChild(
    createSlider('Pad bottom', 0, 0.5, 0.01, cfg.zoom1_pad_bottom, (v) => {
      cfg.zoom1_pad_bottom = v;
    })
  );

  // Zoom 3
  const zoom3Label = document.createElement('div');
  zoom3Label.textContent = 'Zoom 3';
  zoom3Label.style.cssText = 'font-size:12px;color:#888899;margin-bottom:6px;margin-top:10px;font-family:system-ui,sans-serif;';
  body.appendChild(zoom3Label);

  body.appendChild(
    createSlider('Strip width', 0.1, 0.5, 0.01, cfg.zoom3_strip_width, (v) => {
      cfg.zoom3_strip_width = v;
    })
  );

  // installation_config portrait fields
  const installLabel = document.createElement('div');
  installLabel.textContent = 'Tablet Portrait Settings';
  installLabel.style.cssText =
    'font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#888899;margin-top:18px;margin-bottom:10px;';
  body.appendChild(installLabel);

  body.appendChild(
    createSlider('Capture delay (ms)', 1000, 10000, 100, captureDelay, (v) => {
      captureDelay = v;
    })
  );

  body.appendChild(
    createSlider('JPEG quality', 0.5, 1.0, 0.05, jpegQuality, (v) => {
      jpegQuality = v;
    })
  );

  body.appendChild(
    createSlider('CSS blur radius', 0, 50, 1, blurRadius, (v) => {
      blurRadius = v;
    })
  );

  const saveBtn = createSaveButton('Save Portrait Pipeline', () => {
    void handleSave();
  });
  body.appendChild(saveBtn);

  async function handleSave(): Promise<void> {
    (saveBtn as HTMLButtonElement).disabled = true;
    status.set('Saving...', '#888899');
    await onSave(
      { ...cfg },
      {
        portrait_capture_delay_ms: captureDelay,
        portrait_jpeg_quality: jpegQuality,
        portrait_blur_radius_css: blurRadius,
      }
    );
    (saveBtn as HTMLButtonElement).disabled = false;
  }

  return section;
}

// ── Section 4: Print Composer ─────────────────────────────────────────────────

function buildComposerSection(rendererUrl: string): HTMLElement {
  const { section, body } = createSection('Print Composer', true);

  const status = makeStatusEl();
  body.appendChild(status.el);

  let uploadedFile: File | null = null;
  let direction = 'vertical';
  let sliceCount = 10;
  let labelPosition = 'below';
  let sliceLabels: string[] = Array.from({ length: 10 }, (_, i) => `Slice ${i + 1}`);
  let previewUrls: string[] = [];

  // File upload
  const uploadField = document.createElement('div');
  uploadField.style.cssText = 'margin-bottom:14px;';
  const uploadLabel = document.createElement('div');
  uploadLabel.className = 'cf-label';
  uploadLabel.textContent = 'Image';
  uploadLabel.style.cssText =
    'font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#888899;margin-bottom:6px;display:block;';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.cssText =
    'font-size:13px;color:#e0e0e0;font-family:system-ui,sans-serif;cursor:pointer;width:100%;';
  fileInput.addEventListener('change', () => {
    uploadedFile = fileInput.files?.[0] ?? null;
  });
  uploadField.appendChild(uploadLabel);
  uploadField.appendChild(fileInput);
  body.appendChild(uploadField);

  // Direction
  body.appendChild(
    createRadioGroup(
      'Direction',
      [
        { value: 'vertical', label: 'vertical' },
        { value: 'horizontal', label: 'horizontal' },
      ],
      direction,
      (v) => {
        direction = v;
      }
    )
  );

  // Slice count slider + label inputs container
  const labelsContainer = document.createElement('div');
  labelsContainer.style.cssText = 'margin-top:8px;';

  function rebuildLabelInputs(): void {
    labelsContainer.innerHTML = '';
    const hdr = document.createElement('div');
    hdr.textContent = 'Slice labels';
    hdr.style.cssText =
      'font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#888899;margin-bottom:8px;';
    labelsContainer.appendChild(hdr);
    for (let i = 0; i < sliceCount; i++) {
      const idx = i;
      labelsContainer.appendChild(
        createTextInput(`Slice ${i + 1}`, sliceLabels[idx] ?? '', (v) => {
          sliceLabels[idx] = v;
        })
      );
    }
  }

  body.appendChild(
    createSlider('Slice count', 1, 20, 1, sliceCount, (v) => {
      sliceCount = v;
      // Extend/trim labels array
      while (sliceLabels.length < v) sliceLabels.push(`Slice ${sliceLabels.length + 1}`);
      sliceLabels = sliceLabels.slice(0, v);
      rebuildLabelInputs();
    })
  );

  rebuildLabelInputs();
  body.appendChild(labelsContainer);

  // Label position
  body.appendChild(
    createRadioGroup(
      'Label position',
      [
        { value: 'above', label: 'above' },
        { value: 'below', label: 'below' },
      ],
      labelPosition,
      (v) => {
        labelPosition = v;
      }
    )
  );

  // Preview area
  const previewArea = document.createElement('div');
  previewArea.style.cssText =
    'display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;margin-bottom:12px;';
  body.appendChild(previewArea);

  function renderPreviewImages(urls: string[]): void {
    previewArea.innerHTML = '';
    for (const url of urls) {
      const img = document.createElement('img');
      img.src = url;
      img.style.cssText =
        'max-width:120px;max-height:200px;border:1px solid #2a2a40;border-radius:4px;';
      previewArea.appendChild(img);
    }
  }

  // Preview Slices button
  const previewBtn = document.createElement('button');
  previewBtn.type = 'button';
  previewBtn.textContent = 'Preview Slices';
  previewBtn.style.cssText =
    'padding:7px 16px;background:#1a1a2e;color:#e0e0e0;border:1px solid #2a2a40;border-radius:5px;font-size:13px;font-family:system-ui,sans-serif;cursor:pointer;margin-right:8px;margin-bottom:8px;';
  previewBtn.addEventListener('click', () => {
    void handlePreviewSlices();
  });

  // Print button
  const printBtn = document.createElement('button');
  printBtn.type = 'button';
  printBtn.textContent = 'Print';
  printBtn.style.cssText =
    'padding:7px 16px;background:#5b6cf0;color:#fff;border:none;border-radius:5px;font-size:13px;font-family:system-ui,sans-serif;cursor:pointer;margin-right:8px;margin-bottom:8px;';
  printBtn.addEventListener('click', () => {
    void handlePrint();
  });

  // Export ZIP button
  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.textContent = 'Export ZIP';
  exportBtn.style.cssText =
    'padding:7px 16px;background:#1a1a2e;color:#e0e0e0;border:1px solid #2a2a40;border-radius:5px;font-size:13px;font-family:system-ui,sans-serif;cursor:pointer;margin-bottom:8px;';
  exportBtn.addEventListener('click', () => {
    console.log('[composer] Export ZIP — not yet implemented');
    status.set('Export ZIP not yet implemented.', '#888899');
  });

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;';
  btnRow.appendChild(previewBtn);
  btnRow.appendChild(printBtn);
  btnRow.appendChild(exportBtn);
  body.appendChild(btnRow);

  async function handlePreviewSlices(): Promise<void> {
    if (!uploadedFile) {
      status.set('Select an image file first.', '#e05b5b');
      return;
    }
    status.set('Rendering slices...', '#888899');
    previewArea.innerHTML = '';

    try {
      const fd = new FormData();
      fd.append('image', uploadedFile);
      fd.append('direction', direction);
      fd.append('count', String(sliceCount));

      const res = await fetch(`${rendererUrl}/render/slice`, {
        method: 'POST',
        body: fd,
      });

      if (!res.ok) {
        status.set(`Slice preview failed: HTTP ${res.status}`, '#e05b5b');
        return;
      }

      const json = (await res.json()) as { slices: string[] };
      previewUrls = (json.slices ?? []).map((b64: string) => {
        const byteStr = atob(b64);
        const arr = new Uint8Array(byteStr.length);
        for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
        const blob = new Blob([arr], { type: 'image/png' });
        return URL.createObjectURL(blob);
      });

      renderPreviewImages(previewUrls);
      status.set(`${previewUrls.length} slices rendered.`, '#5bba6f');
    } catch {
      status.set('Preview unavailable — renderer not reachable.', '#e05b5b');
    }
  }

  async function handlePrint(): Promise<void> {
    if (!uploadedFile) {
      status.set('Select an image file first.', '#e05b5b');
      return;
    }
    status.set('Queueing print job...', '#888899');

    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(uploadedFile!);
      });

      const { error } = await supabase.from('print_queue').insert({
        type: 'composer',
        payload: {
          image: dataUrl,
          direction,
          slice_count: sliceCount,
          labels: sliceLabels.slice(0, sliceCount),
          label_position: labelPosition,
        },
        status: 'pending',
      });

      if (error) {
        status.set('Print queue error: ' + error.message, '#e05b5b');
      } else {
        status.set('Print job queued.', '#5bba6f');
      }
    } catch (err) {
      status.set('Failed to queue print job.', '#e05b5b');
      console.error('[composer] print error:', err);
    }
  }

  return section;
}

// ── Section 5: Test Printing ──────────────────────────────────────────────────

function buildTestPrintingSection(): HTMLElement {
  const { section, body } = createSection('Test Printing', true);

  const status = makeStatusEl();
  body.appendChild(status.el);

  // Print Test Card button
  const testCardBtn = createSaveButton('Print Test Card', () => {
    void handleTestCard();
  });
  body.appendChild(testCardBtn);

  // Print Test Image
  const imageField = document.createElement('div');
  imageField.style.cssText = 'margin-bottom:14px;margin-top:8px;';
  const imageLabel = document.createElement('div');
  imageLabel.textContent = 'Test image';
  imageLabel.style.cssText =
    'font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#888899;margin-bottom:6px;display:block;';
  const testImageInput = document.createElement('input');
  testImageInput.type = 'file';
  testImageInput.accept = 'image/*';
  testImageInput.style.cssText =
    'font-size:13px;color:#e0e0e0;font-family:system-ui,sans-serif;cursor:pointer;width:100%;margin-bottom:8px;';
  imageField.appendChild(imageLabel);
  imageField.appendChild(testImageInput);
  body.appendChild(imageField);

  const testImageBtn = createSaveButton('Print Test Image', () => {
    void handleTestImage();
  });
  body.appendChild(testImageBtn);

  // Custom text
  let customText = '';
  body.appendChild(
    createTextarea('Custom markdown text', '', 6, (v) => {
      customText = v;
    })
  );

  const testMarkdownBtn = createSaveButton('Print Markdown', () => {
    void handleMarkdownPrint();
  });
  body.appendChild(testMarkdownBtn);

  async function handleTestCard(): Promise<void> {
    (testCardBtn as HTMLButtonElement).disabled = true;
    status.set('Queueing test card...', '#888899');

    const { error } = await supabase.from('print_queue').insert({
      type: 'definition',
      payload: {
        word: 'TEST',
        definition: 'A test card generated from the config app.',
        citations: ['MeinUngeheuer Config, 2026'],
        language: 'en',
      },
      status: 'pending',
    });

    if (error) {
      status.set('Error: ' + error.message, '#e05b5b');
    } else {
      status.set('Test card queued.', '#5bba6f');
    }

    (testCardBtn as HTMLButtonElement).disabled = false;
  }

  async function handleTestImage(): Promise<void> {
    const file = testImageInput.files?.[0];
    if (!file) {
      status.set('Select an image first.', '#e05b5b');
      return;
    }

    (testImageBtn as HTMLButtonElement).disabled = true;
    status.set('Queueing test image...', '#888899');

    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      const { error } = await supabase.from('print_queue').insert({
        type: 'image',
        payload: { image: dataUrl },
        status: 'pending',
      });

      if (error) {
        status.set('Error: ' + error.message, '#e05b5b');
      } else {
        status.set('Test image queued.', '#5bba6f');
      }
    } catch (err) {
      status.set('Failed to queue image.', '#e05b5b');
      console.error('[test-printing] image error:', err);
    }

    (testImageBtn as HTMLButtonElement).disabled = false;
  }

  async function handleMarkdownPrint(): Promise<void> {
    if (!customText.trim()) {
      status.set('Enter some text first.', '#e05b5b');
      return;
    }

    (testMarkdownBtn as HTMLButtonElement).disabled = true;
    status.set('Queueing markdown print...', '#888899');

    const { error } = await supabase.from('print_queue').insert({
      type: 'markdown',
      payload: { text: customText },
      status: 'pending',
    });

    if (error) {
      status.set('Error: ' + error.message, '#e05b5b');
    } else {
      status.set('Markdown print queued.', '#5bba6f');
    }

    (testMarkdownBtn as HTMLButtonElement).disabled = false;
  }

  return section;
}

// ── Main render ────────────────────────────────────────────────────────────────

export function render(container: HTMLElement): void {
  container.innerHTML = '';

  const loadingEl = document.createElement('div');
  loadingEl.textContent = 'Loading...';
  loadingEl.style.cssText = 'color:#888899;font-size:14px;font-family:system-ui,sans-serif;';
  container.appendChild(loadingEl);

  const globalStatus = makeStatusEl();

  async function loadAndRender(): Promise<void> {
    const [rcResult, installResult] = await Promise.all([
      supabase.from('render_config').select('*').eq('id', true).single(),
      supabase.from('installation_config').select('*').eq('id', CONFIG_ID).single(),
    ]);

    if (rcResult.error) {
      console.warn('[printing] render_config fetch error:', rcResult.error.message);
    }
    if (installResult.error) {
      console.warn('[printing] installation_config fetch error:', installResult.error.message);
    }

    const rc: RenderConfig = rcResult.data
      ? (deepMerge(DEFAULT_RENDER_CONFIG, rcResult.data as Partial<RenderConfig>) as RenderConfig)
      : { ...DEFAULT_RENDER_CONFIG };

    // Ensure nested JSONB objects have defaults merged in
    rc.dict_config = deepMerge(DEFAULT_TEMPLATE_CONFIG, (rc.dict_config ?? {}) as Partial<TemplateConfig>);
    rc.helv_config = deepMerge(DEFAULT_TEMPLATE_CONFIG, (rc.helv_config ?? {}) as Partial<TemplateConfig>);
    rc.acid_config = deepMerge(
      { ...DEFAULT_TEMPLATE_CONFIG, hard_wrap: false },
      (rc.acid_config ?? {}) as Partial<TemplateConfig & { hard_wrap: boolean }>
    ) as TemplateConfig & { hard_wrap: boolean };
    rc.halftone_config = deepMerge(
      DEFAULT_RENDER_CONFIG.halftone_config,
      (rc.halftone_config ?? {}) as Partial<HalftoneConfig>
    );
    rc.portrait_config = deepMerge(
      DEFAULT_RENDER_CONFIG.portrait_config,
      (rc.portrait_config ?? {}) as Partial<PortraitConfig>
    );

    const installRaw = installResult.data as Partial<InstallationConfig> | null;
    const install: InstallationConfig = {
      id: installRaw?.id ?? CONFIG_ID,
      portrait_capture_delay_ms:
        installRaw?.portrait_capture_delay_ms ??
        DEFAULT_INSTALL_PORTRAIT.portrait_capture_delay_ms,
      portrait_jpeg_quality:
        installRaw?.portrait_jpeg_quality ?? DEFAULT_INSTALL_PORTRAIT.portrait_jpeg_quality,
      portrait_blur_radius_css:
        installRaw?.portrait_blur_radius_css ?? DEFAULT_INSTALL_PORTRAIT.portrait_blur_radius_css,
      print_renderer_url: installRaw?.print_renderer_url ?? null,
    };

    const rendererUrl = install.print_renderer_url ?? 'http://localhost:8000';

    // ── Save handlers ──────────────────────────────────────────────────────────

    async function saveRenderConfig(patch: Partial<RenderConfig>): Promise<void> {
      globalStatus.set('Saving...', '#888899');
      const { error } = await supabase
        .from('render_config')
        .update(patch)
        .eq('id', true);
      if (error) {
        console.error('[printing] render_config save error:', error);
        globalStatus.set('Save failed: ' + error.message, '#e05b5b');
      } else {
        globalStatus.set('Saved.', '#5bba6f');
      }
    }

    async function saveHalftone(cfg: HalftoneConfig): Promise<void> {
      await saveRenderConfig({ halftone_config: cfg });
    }

    async function savePortrait(
      portraitCfg: PortraitConfig,
      installPatch: Partial<InstallationConfig>
    ): Promise<void> {
      globalStatus.set('Saving...', '#888899');
      const [rcErr, instErr] = await Promise.all([
        supabase.from('render_config').update({ portrait_config: portraitCfg }).eq('id', true),
        supabase
          .from('installation_config')
          .update(installPatch)
          .eq('id', CONFIG_ID),
      ]);
      if (rcErr.error || instErr.error) {
        const msg = rcErr.error?.message ?? instErr.error?.message ?? 'Unknown error';
        globalStatus.set('Save failed: ' + msg, '#e05b5b');
      } else {
        globalStatus.set('Saved.', '#5bba6f');
      }
    }

    // ── Build UI ───────────────────────────────────────────────────────────────

    container.innerHTML = '';
    container.appendChild(globalStatus.el);

    container.appendChild(buildTemplateSection(rc, rendererUrl, saveRenderConfig));
    container.appendChild(buildDitheringSection(rc, saveHalftone));
    container.appendChild(buildPortraitSection(rc, install, savePortrait));
    container.appendChild(buildComposerSection(rendererUrl));
    container.appendChild(buildTestPrintingSection());
  }

  void loadAndRender();
}
