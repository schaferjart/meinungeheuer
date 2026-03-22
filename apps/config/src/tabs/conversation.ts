/**
 * conversation.ts — Conversation configuration tab.
 *
 * Five collapsible sections:
 *   1. System Prompts (per program, from `prompts` table)
 *   2. ElevenLabs (agent/voice IDs, from `installation_config`)
 *   3. Voice Settings / TTS (voice sliders + toggles, from `installation_config`)
 *   4. Voice Chain (vc_* columns, from `installation_config`)
 *   5. Embeddings (embedding_* columns, from `installation_config`)
 */

import {
  createTextInput,
  createTextarea,
  createToggle,
  createSlider,
  createNumberInput,
  createSection,
  createSaveButton,
} from '../lib/forms.js';
import { supabase } from '../lib/supabase.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const CONFIG_ID = '00000000-0000-0000-0000-000000000000';

const PROGRAMS = ['aphorism', 'free_association', 'voice_chain'] as const;
type Program = (typeof PROGRAMS)[number];

// ── Types ─────────────────────────────────────────────────────────────────────

interface PromptRow {
  program_id: string;
  system_prompt: string;
  first_message_de: string;
  first_message_en: string;
}

interface ConversationConfig {
  // ElevenLabs
  elevenlabs_agent_id: string | null;
  elevenlabs_voice_id: string | null;
  // Voice / TTS
  voice_stability: number | null;
  voice_similarity_boost: number | null;
  voice_style: number | null;
  voice_speaker_boost: boolean | null;
  // Voice Chain
  vc_remove_bg_noise: boolean | null;
  vc_retention_window: number | null;
  vc_profile_model: string | null;
  vc_profile_temperature: number | null;
  vc_profile_prompt: string | null;
  vc_icebreaker_model: string | null;
  vc_icebreaker_temperature: number | null;
  vc_icebreaker_prompt: string | null;
  vc_cold_start_de: string | null;
  vc_cold_start_en: string | null;
  vc_max_phrases: number | null;
  vc_max_favorite_words: number | null;
  // Embeddings
  embedding_model: string | null;
  embedding_dimensions: number | null;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const CONFIG_DEFAULTS: ConversationConfig = {
  elevenlabs_agent_id: '',
  elevenlabs_voice_id: '',
  voice_stability: 0.35,
  voice_similarity_boost: 0.65,
  voice_style: 0.6,
  voice_speaker_boost: true,
  vc_remove_bg_noise: false,
  vc_retention_window: 10,
  vc_profile_model: '',
  vc_profile_temperature: 0.3,
  vc_profile_prompt: '',
  vc_icebreaker_model: '',
  vc_icebreaker_temperature: 0.9,
  vc_icebreaker_prompt: '',
  vc_cold_start_de: '',
  vc_cold_start_en: '',
  vc_max_phrases: 5,
  vc_max_favorite_words: 5,
  embedding_model: '',
  embedding_dimensions: 1536,
};

const PROMPT_DEFAULTS: PromptRow = {
  program_id: '',
  system_prompt: '',
  first_message_de: '',
  first_message_en: '',
};

// ── Main render ───────────────────────────────────────────────────────────────

export function render(container: HTMLElement): void {
  container.innerHTML = '';

  // Loaded data
  let promptsByProgram: Record<Program, PromptRow> = {
    aphorism: { ...PROMPT_DEFAULTS, program_id: 'aphorism' },
    free_association: { ...PROMPT_DEFAULTS, program_id: 'free_association' },
    voice_chain: { ...PROMPT_DEFAULTS, program_id: 'voice_chain' },
  };

  // Mutable form state for installation_config fields
  const form: ConversationConfig = { ...CONFIG_DEFAULTS };

  // Status elements
  const configStatusEl = document.createElement('div');
  configStatusEl.style.cssText =
    'font-size:12px;margin-bottom:12px;min-height:18px;font-family:system-ui,sans-serif;color:#888899;';

  function setConfigStatus(msg: string, color = '#888899'): void {
    configStatusEl.textContent = msg;
    configStatusEl.style.color = color;
  }

  // Loading placeholder
  const loadingEl = document.createElement('div');
  loadingEl.textContent = 'Loading...';
  loadingEl.style.cssText = 'color:#888899;font-size:14px;font-family:system-ui,sans-serif;';
  container.appendChild(loadingEl);

  // ── Helper: create sub-heading ─────────────────────────────────────────────

  function makeSubHeading(text: string): HTMLElement {
    const el = document.createElement('h3');
    el.textContent = text;
    el.style.cssText =
      'font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;' +
      'color:#5b6cf0;margin:0 0 12px 0;font-family:system-ui,sans-serif;';
    return el;
  }

  // ── Helper: create divider ─────────────────────────────────────────────────

  function makeDivider(): HTMLElement {
    const el = document.createElement('div');
    el.style.cssText = 'border-top:1px solid #2a2a40;margin:16px 0;';
    return el;
  }

  // ── Helper: create note ────────────────────────────────────────────────────

  function makeNote(text: string): HTMLElement {
    const el = document.createElement('p');
    el.textContent = text;
    el.style.cssText =
      'font-size:11px;color:#888899;margin:0 0 10px 0;line-height:1.5;font-family:system-ui,sans-serif;';
    return el;
  }

  // ── Helper: prompt save status ─────────────────────────────────────────────

  function makePromptStatusEl(): HTMLElement {
    const el = document.createElement('div');
    el.style.cssText =
      'font-size:12px;min-height:16px;margin-bottom:8px;font-family:system-ui,sans-serif;color:#888899;';
    return el;
  }

  // ── Build UI ───────────────────────────────────────────────────────────────

  function buildUI(): void {
    container.innerHTML = '';

    // ── Section 1: System Prompts ──────────────────────────────────────────

    const { section: sec1, body: body1 } = createSection('System Prompts');

    body1.appendChild(
      makeNote('Template variables: {{term}}, {{contextText}}, {{language}}, {{speechProfile}}')
    );

    for (const program of PROGRAMS) {
      const promptData = promptsByProgram[program];

      body1.appendChild(makeSubHeading(program));

      const promptStatusEl = makePromptStatusEl();

      body1.appendChild(
        createTextarea('System prompt', promptData.system_prompt, 20, (v) => {
          promptsByProgram[program] = { ...promptsByProgram[program], system_prompt: v };
        })
      );
      body1.appendChild(
        createTextInput('First message (DE)', promptData.first_message_de, (v) => {
          promptsByProgram[program] = { ...promptsByProgram[program], first_message_de: v };
        })
      );
      body1.appendChild(
        createTextInput('First message (EN)', promptData.first_message_en, (v) => {
          promptsByProgram[program] = { ...promptsByProgram[program], first_message_en: v };
        })
      );

      body1.appendChild(promptStatusEl);

      const savePromptBtn = createSaveButton(`Save ${program}`, () => {
        void savePrompt(program, savePromptBtn, promptStatusEl);
      });
      body1.appendChild(savePromptBtn);

      if (program !== 'voice_chain') {
        body1.appendChild(makeDivider());
      }
    }

    container.appendChild(sec1);

    // ── Section 2: ElevenLabs ──────────────────────────────────────────────

    const { section: sec2, body: body2 } = createSection('ElevenLabs', true);

    body2.appendChild(
      createTextInput('Agent ID', form.elevenlabs_agent_id ?? '', (v) => {
        form.elevenlabs_agent_id = v;
      })
    );
    body2.appendChild(
      createTextInput('Voice ID', form.elevenlabs_voice_id ?? '', (v) => {
        form.elevenlabs_voice_id = v;
      })
    );

    container.appendChild(sec2);

    // ── Section 3: Voice Settings / TTS ───────────────────────────────────

    const { section: sec3, body: body3 } = createSection('Voice Settings / TTS', true);

    body3.appendChild(
      createSlider('Stability', 0, 1, 0.05, form.voice_stability ?? 0.35, (v) => {
        form.voice_stability = v;
      })
    );
    body3.appendChild(
      createSlider(
        'Similarity boost',
        0, 1, 0.05, form.voice_similarity_boost ?? 0.65, (v) => {
          form.voice_similarity_boost = v;
        }
      )
    );
    body3.appendChild(
      createSlider('Style', 0, 1, 0.05, form.voice_style ?? 0.6, (v) => {
        form.voice_style = v;
      })
    );
    body3.appendChild(
      createToggle('Speaker boost', form.voice_speaker_boost ?? true, (v) => {
        form.voice_speaker_boost = v;
      })
    );

    container.appendChild(sec3);

    // ── Section 4: Voice Chain ─────────────────────────────────────────────

    const { section: sec4, body: body4 } = createSection('Voice Chain', true);

    body4.appendChild(
      createToggle('Remove background noise', form.vc_remove_bg_noise ?? false, (v) => {
        form.vc_remove_bg_noise = v;
      })
    );
    body4.appendChild(
      createNumberInput(
        'Retention window',
        form.vc_retention_window ?? 10,
        1, 100, 1,
        (v) => { form.vc_retention_window = v; }
      )
    );

    body4.appendChild(makeSubHeading('Speech Profile'));

    body4.appendChild(
      createTextInput('Speech profile model', form.vc_profile_model ?? '', (v) => {
        form.vc_profile_model = v;
      })
    );
    body4.appendChild(
      createSlider(
        'Speech profile temperature',
        0, 1, 0.05, form.vc_profile_temperature ?? 0.3, (v) => {
          form.vc_profile_temperature = v;
        }
      )
    );
    body4.appendChild(
      createTextarea(
        'Speech profile extraction prompt',
        form.vc_profile_prompt ?? '',
        10,
        (v) => { form.vc_profile_prompt = v; }
      )
    );

    body4.appendChild(makeDivider());
    body4.appendChild(makeSubHeading('Icebreaker'));

    body4.appendChild(
      createTextInput('Icebreaker model', form.vc_icebreaker_model ?? '', (v) => {
        form.vc_icebreaker_model = v;
      })
    );
    body4.appendChild(
      createSlider(
        'Icebreaker temperature',
        0, 1, 0.05, form.vc_icebreaker_temperature ?? 0.9, (v) => {
          form.vc_icebreaker_temperature = v;
        }
      )
    );
    body4.appendChild(
      createTextarea(
        'Icebreaker generation prompt',
        form.vc_icebreaker_prompt ?? '',
        10,
        (v) => { form.vc_icebreaker_prompt = v; }
      )
    );

    body4.appendChild(makeDivider());
    body4.appendChild(makeSubHeading('Cold Start'));

    body4.appendChild(
      createTextInput('Cold start message (DE)', form.vc_cold_start_de ?? '', (v) => {
        form.vc_cold_start_de = v;
      })
    );
    body4.appendChild(
      createTextInput('Cold start message (EN)', form.vc_cold_start_en ?? '', (v) => {
        form.vc_cold_start_en = v;
      })
    );

    body4.appendChild(makeDivider());
    body4.appendChild(makeSubHeading('Limits'));

    body4.appendChild(
      createNumberInput(
        'Max phrases',
        form.vc_max_phrases ?? 5,
        1, 50, 1,
        (v) => { form.vc_max_phrases = v; }
      )
    );
    body4.appendChild(
      createNumberInput(
        'Max favorite words',
        form.vc_max_favorite_words ?? 5,
        1, 50, 1,
        (v) => { form.vc_max_favorite_words = v; }
      )
    );

    container.appendChild(sec4);

    // ── Section 5: Embeddings ─────────────────────────────────────────────

    const { section: sec5, body: body5 } = createSection('Embeddings', true);

    body5.appendChild(
      createTextInput('Model', form.embedding_model ?? '', (v) => {
        form.embedding_model = v;
      })
    );
    body5.appendChild(
      createNumberInput(
        'Dimensions',
        form.embedding_dimensions ?? 1536,
        1, 8192, 1,
        (v) => { form.embedding_dimensions = v; }
      )
    );

    container.appendChild(sec5);

    // ── Save button (sections 2–5) ────────────────────────────────────────

    const saveBtn = createSaveButton('Save Conversation Config', () => {
      void handleSaveConfig(saveBtn);
    });
    container.appendChild(saveBtn);
    container.appendChild(configStatusEl);
  }

  // ── Save: prompt row ──────────────────────────────────────────────────────

  async function savePrompt(
    program: Program,
    btn: HTMLElement,
    statusEl: HTMLElement
  ): Promise<void> {
    const btnEl = btn as HTMLButtonElement;
    btnEl.disabled = true;
    statusEl.textContent = 'Saving...';
    statusEl.style.color = '#888899';

    const row = promptsByProgram[program];
    const { error } = await supabase.from('prompts').upsert({
      program_id: row.program_id,
      system_prompt: row.system_prompt,
      first_message_de: row.first_message_de,
      first_message_en: row.first_message_en,
    });

    if (error) {
      console.error(`[conversation] prompt save error (${program}):`, error);
      statusEl.textContent = 'Save failed: ' + error.message;
      statusEl.style.color = '#e05b5b';
    } else {
      statusEl.textContent = 'Saved.';
      statusEl.style.color = '#5bba6f';
    }

    btnEl.disabled = false;
  }

  // ── Save: installation_config fields ─────────────────────────────────────

  async function handleSaveConfig(btn: HTMLElement): Promise<void> {
    const btnEl = btn as HTMLButtonElement;
    btnEl.disabled = true;
    setConfigStatus('Saving...', '#888899');

    const payload: ConversationConfig = {
      elevenlabs_agent_id: form.elevenlabs_agent_id || null,
      elevenlabs_voice_id: form.elevenlabs_voice_id || null,
      voice_stability: form.voice_stability,
      voice_similarity_boost: form.voice_similarity_boost,
      voice_style: form.voice_style,
      voice_speaker_boost: form.voice_speaker_boost,
      vc_remove_bg_noise: form.vc_remove_bg_noise,
      vc_retention_window: form.vc_retention_window,
      vc_profile_model: form.vc_profile_model || null,
      vc_profile_temperature: form.vc_profile_temperature,
      vc_profile_prompt: form.vc_profile_prompt || null,
      vc_icebreaker_model: form.vc_icebreaker_model || null,
      vc_icebreaker_temperature: form.vc_icebreaker_temperature,
      vc_icebreaker_prompt: form.vc_icebreaker_prompt || null,
      vc_cold_start_de: form.vc_cold_start_de || null,
      vc_cold_start_en: form.vc_cold_start_en || null,
      vc_max_phrases: form.vc_max_phrases,
      vc_max_favorite_words: form.vc_max_favorite_words,
      embedding_model: form.embedding_model || null,
      embedding_dimensions: form.embedding_dimensions,
    };

    const { error } = await supabase
      .from('installation_config')
      .update(payload)
      .eq('id', CONFIG_ID);

    if (error) {
      console.error('[conversation] config save error:', error);
      setConfigStatus('Save failed: ' + error.message, '#e05b5b');
    } else {
      setConfigStatus('Saved.', '#5bba6f');
    }

    btnEl.disabled = false;
  }

  // ── Fetch data then render ────────────────────────────────────────────────

  async function loadAndRender(): Promise<void> {
    const [configResult, promptsResult] = await Promise.all([
      supabase
        .from('installation_config')
        .select(
          'elevenlabs_agent_id, elevenlabs_voice_id, ' +
          'voice_stability, voice_similarity_boost, voice_style, voice_speaker_boost, ' +
          'vc_remove_bg_noise, vc_retention_window, ' +
          'vc_profile_model, vc_profile_temperature, vc_profile_prompt, ' +
          'vc_icebreaker_model, vc_icebreaker_temperature, vc_icebreaker_prompt, ' +
          'vc_cold_start_de, vc_cold_start_en, vc_max_phrases, vc_max_favorite_words, ' +
          'embedding_model, embedding_dimensions'
        )
        .eq('id', CONFIG_ID)
        .limit(1)
        .single(),
      supabase.from('prompts').select('*'),
    ]);

    if (configResult.error) {
      console.warn('[conversation] config fetch error:', configResult.error.message);
    } else if (configResult.data) {
      const d = configResult.data as Partial<ConversationConfig>;
      form.elevenlabs_agent_id = d.elevenlabs_agent_id ?? form.elevenlabs_agent_id;
      form.elevenlabs_voice_id = d.elevenlabs_voice_id ?? form.elevenlabs_voice_id;
      form.voice_stability = d.voice_stability ?? form.voice_stability;
      form.voice_similarity_boost = d.voice_similarity_boost ?? form.voice_similarity_boost;
      form.voice_style = d.voice_style ?? form.voice_style;
      form.voice_speaker_boost = d.voice_speaker_boost ?? form.voice_speaker_boost;
      form.vc_remove_bg_noise = d.vc_remove_bg_noise ?? form.vc_remove_bg_noise;
      form.vc_retention_window = d.vc_retention_window ?? form.vc_retention_window;
      form.vc_profile_model = d.vc_profile_model ?? form.vc_profile_model;
      form.vc_profile_temperature = d.vc_profile_temperature ?? form.vc_profile_temperature;
      form.vc_profile_prompt = d.vc_profile_prompt ?? form.vc_profile_prompt;
      form.vc_icebreaker_model = d.vc_icebreaker_model ?? form.vc_icebreaker_model;
      form.vc_icebreaker_temperature =
        d.vc_icebreaker_temperature ?? form.vc_icebreaker_temperature;
      form.vc_icebreaker_prompt = d.vc_icebreaker_prompt ?? form.vc_icebreaker_prompt;
      form.vc_cold_start_de = d.vc_cold_start_de ?? form.vc_cold_start_de;
      form.vc_cold_start_en = d.vc_cold_start_en ?? form.vc_cold_start_en;
      form.vc_max_phrases = d.vc_max_phrases ?? form.vc_max_phrases;
      form.vc_max_favorite_words = d.vc_max_favorite_words ?? form.vc_max_favorite_words;
      form.embedding_model = d.embedding_model ?? form.embedding_model;
      form.embedding_dimensions = d.embedding_dimensions ?? form.embedding_dimensions;
    }

    if (promptsResult.error) {
      console.warn('[conversation] prompts fetch error:', promptsResult.error.message);
    } else if (promptsResult.data) {
      for (const row of promptsResult.data as PromptRow[]) {
        const pid = row.program_id as Program;
        if (PROGRAMS.includes(pid)) {
          promptsByProgram[pid] = {
            program_id: row.program_id,
            system_prompt: row.system_prompt ?? '',
            first_message_de: row.first_message_de ?? '',
            first_message_en: row.first_message_en ?? '',
          };
        }
      }
    }

    buildUI();
  }

  void loadAndRender();
}
