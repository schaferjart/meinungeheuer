/**
 * tablet-preview.ts — Scaled-down visual mockups of tablet screens.
 *
 * Each exported function returns a labelled container (label + 300x533 frame)
 * that represents how the corresponding tablet screen looks with the supplied
 * configuration values.  All DOM is created imperatively — no framework
 * dependency.
 */

// ── Shared helpers ────────────────────────────────────────────────────────────

function createTabletFrame(content: HTMLElement): HTMLElement {
  const frame = document.createElement('div');
  frame.style.cssText = [
    'width:300px',
    'height:533px',
    'background:#000000',
    'border:1px solid #333333',
    'border-radius:8px',
    'overflow:hidden',
    'position:relative',
    'flex-shrink:0',
    'box-sizing:border-box',
  ].join(';');
  frame.appendChild(content);
  return frame;
}

function createPreviewLabel(): HTMLElement {
  const label = document.createElement('div');
  label.textContent = 'TABLET PREVIEW';
  label.style.cssText = [
    'font-size:10px',
    'font-family:Helvetica,'Helvetica Neue',Arial,sans-serif',
    'font-weight:600',
    'letter-spacing:0.08em',
    'text-transform:uppercase',
    'color:#777777',
    'margin-bottom:8px',
  ].join(';');
  return label;
}

/**
 * Wraps a tablet frame with a labelled outer container ready to append into a
 * block-detail panel.
 */
function wrapWithLabel(frame: HTMLElement): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    'margin-top:24px',
    'padding-top:20px',
    'border-top:1px solid #2a2a2a',
    'display:inline-flex',
    'flex-direction:column',
    'align-items:flex-start',
  ].join(';');
  wrapper.appendChild(createPreviewLabel());
  wrapper.appendChild(frame);
  return wrapper;
}

// ── text_display preview ──────────────────────────────────────────────────────

const SAMPLE_TEXT =
  'Die Kreativität ist nicht das Gegenteil von Ordnung. ' +
  'Sie ist die Ordnung, die sich selbst überrascht.';

export function createTextDisplayPreview(config: Record<string, unknown>): HTMLElement {
  const highlightColor =
    typeof config['highlight_color'] === 'string' ? config['highlight_color'] : '#fcd34d';
  const spokenOpacity =
    typeof config['spoken_opacity'] === 'number' ? config['spoken_opacity'] : 0.6;
  const upcomingOpacity =
    typeof config['upcoming_opacity'] === 'number' ? config['upcoming_opacity'] : 1.0;

  const content = document.createElement('div');
  content.style.cssText = [
    'width:100%',
    'height:100%',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:24px 20px',
    'box-sizing:border-box',
  ].join(';');

  const textEl = document.createElement('div');
  textEl.style.cssText = [
    'font-family:Helvetica,'Helvetica Neue',Arial,sans-serif',
    'font-size:13px',
    'line-height:1.9',
    'letter-spacing:0.02em',
    'color:#ffffff',
    'text-align:left',
    'word-spacing:2px',
  ].join(';');

  const words = SAMPLE_TEXT.split(' ');
  // Mark first 3 words as spoken, 4th as active, rest as upcoming
  words.forEach((word, i) => {
    const span = document.createElement('span');
    span.textContent = word + ' ';

    if (i < 3) {
      // spoken
      span.style.opacity = String(spokenOpacity);
    } else if (i === 3) {
      // active — highlighted
      span.style.cssText = [
        `color:${highlightColor}`,
        'opacity:1',
        'transform:scale(1.05)',
        'display:inline-block',
        'transition:all 150ms ease',
      ].join(';');
    } else {
      // upcoming
      span.style.opacity = String(upcomingOpacity);
    }

    textEl.appendChild(span);
  });

  content.appendChild(textEl);

  return wrapWithLabel(createTabletFrame(content));
}

// ── term_prompt preview ───────────────────────────────────────────────────────

export function createTermPromptPreview(config: Record<string, unknown>): HTMLElement {
  const term =
    typeof config['term'] === 'string' && config['term'].trim() !== ''
      ? config['term'].toUpperCase()
      : 'KREATIVITÄT';

  const content = document.createElement('div');
  content.style.cssText = [
    'width:100%',
    'height:100%',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:24px',
    'box-sizing:border-box',
  ].join(';');

  const termEl = document.createElement('div');
  termEl.textContent = term;
  termEl.style.cssText = [
    'font-family:Helvetica,'Helvetica Neue',Arial,sans-serif',
    'font-size:28px',
    'font-weight:700',
    'color:#ffffff',
    'text-align:center',
    'letter-spacing:0.12em',
    'word-break:break-word',
  ].join(';');

  content.appendChild(termEl);

  return wrapWithLabel(createTabletFrame(content));
}

// ── conversation preview ──────────────────────────────────────────────────────

export function createConversationPreview(config: Record<string, unknown>): HTMLElement {
  const lang = typeof config['language'] === 'string' ? config['language'] : 'de';
  const isDE = lang === 'de';

  const messages: Array<{ role: 'agent' | 'visitor'; text: string }> = isDE
    ? [
        {
          role: 'agent',
          text: 'Was bedeutet für Sie Kreativität — ist sie eine Fähigkeit oder ein Zustand?',
        },
        { role: 'visitor', text: 'Ich denke, es ist beides gleichzeitig.' },
        { role: 'agent', text: 'Interessant. Können Sie das weiter ausführen?' },
      ]
    : [
        { role: 'agent', text: 'What does creativity mean to you — is it an ability or a state?' },
        { role: 'visitor', text: 'I think it is both at the same time.' },
        { role: 'agent', text: 'Interesting. Can you elaborate on that?' },
      ];

  const content = document.createElement('div');
  content.style.cssText = [
    'width:100%',
    'height:100%',
    'display:flex',
    'flex-direction:column',
    'justify-content:flex-end',
    'padding:16px 16px 20px',
    'box-sizing:border-box',
    'gap:12px',
  ].join(';');

  // Status dot at top
  const statusRow = document.createElement('div');
  statusRow.style.cssText = [
    'position:absolute',
    'top:14px',
    'left:50%',
    'transform:translateX(-50%)',
    'display:flex',
    'align-items:center',
    'gap:6px',
  ].join(';');
  const dot = document.createElement('div');
  dot.style.cssText = [
    'width:7px',
    'height:7px',
    'border-radius:50%',
    'background:#fcd34d',
    'flex-shrink:0',
  ].join(';');
  const dotLabel = document.createElement('div');
  dotLabel.textContent = isDE ? 'Hört zu' : 'Listening';
  dotLabel.style.cssText = [
    'font-family:Helvetica,'Helvetica Neue',Arial,sans-serif',
    'font-size:9px',
    'color:#777777',
    'letter-spacing:0.04em',
  ].join(';');
  statusRow.appendChild(dot);
  statusRow.appendChild(dotLabel);

  // messages list
  const msgContainer = document.createElement('div');
  msgContainer.style.cssText = [
    'display:flex',
    'flex-direction:column',
    'gap:12px',
    'margin-top:auto',
  ].join(';');

  for (const msg of messages) {
    const msgEl = document.createElement('div');
    msgEl.style.cssText = [
      'font-family:Helvetica,'Helvetica Neue',Arial,sans-serif',
      'font-size:11px',
      'line-height:1.6',
      msg.role === 'visitor' ? 'opacity:0.55' : 'opacity:1',
      'color:#ffffff',
      msg.role === 'visitor' ? 'text-align:right' : 'text-align:left',
    ].join(';');
    msgEl.textContent = msg.text;
    msgContainer.appendChild(msgEl);
  }

  // The frame content wrapper needs relative positioning for the dot
  const frameContent = document.createElement('div');
  frameContent.style.cssText = 'width:100%;height:100%;position:relative;';

  const innerFlex = document.createElement('div');
  innerFlex.style.cssText = [
    'width:100%',
    'height:100%',
    'display:flex',
    'flex-direction:column',
    'justify-content:flex-end',
    'padding:36px 16px 20px',
    'box-sizing:border-box',
  ].join(';');

  innerFlex.appendChild(msgContainer);
  frameContent.appendChild(statusRow);
  frameContent.appendChild(innerFlex);

  const frame = document.createElement('div');
  frame.style.cssText = [
    'width:300px',
    'height:533px',
    'background:#000000',
    'border:1px solid #333333',
    'border-radius:8px',
    'overflow:hidden',
    'position:relative',
    'flex-shrink:0',
    'box-sizing:border-box',
  ].join(';');
  frame.appendChild(frameContent);

  return wrapWithLabel(frame);
}

// ── definition (print_card result) preview ───────────────────────────────────

export function createDefinitionPreview(config: Record<string, unknown>): HTMLElement {
  const resultDisplay =
    typeof config['result_display'] === 'string' ? config['result_display'] : 'definition';

  const isAphorism = resultDisplay === 'aphorism';

  const content = document.createElement('div');
  content.style.cssText = [
    'width:100%',
    'height:100%',
    'display:flex',
    'flex-direction:column',
    'justify-content:center',
    'padding:28px 22px',
    'box-sizing:border-box',
    'gap:16px',
  ].join(';');

  if (isAphorism) {
    // Aphorism style — centered, larger text
    const aphoText = document.createElement('div');
    aphoText.textContent =
      '"Ordnung ist nicht das Gegenteil von Freiheit — sie ist deren Bedingung."';
    aphoText.style.cssText = [
      'font-family:Helvetica,'Helvetica Neue',Arial,sans-serif',
      'font-size:14px',
      'line-height:1.7',
      'color:#ffffff',
      'text-align:center',
      'font-style:italic',
    ].join(';');
    content.appendChild(aphoText);

    const citation = document.createElement('div');
    citation.textContent = '— MeinUngeheuer, 2025';
    citation.style.cssText = [
      'font-family:Helvetica,'Helvetica Neue',Arial,sans-serif',
      'font-size:10px',
      'color:#999999',
      'text-align:center',
      'margin-top:8px',
    ].join(';');
    content.appendChild(citation);
  } else {
    // Definition style
    const termEl = document.createElement('div');
    termEl.textContent = 'KREATIVITÄT';
    termEl.style.cssText = [
      'font-family:Helvetica,'Helvetica Neue',Arial,sans-serif',
      'font-size:22px',
      'font-weight:700',
      'color:#ffffff',
      'letter-spacing:0.08em',
    ].join(';');
    content.appendChild(termEl);

    const rule = document.createElement('div');
    rule.style.cssText = 'height:1px;background:#333333;margin:4px 0;';
    content.appendChild(rule);

    const defText = document.createElement('div');
    defText.textContent =
      'Der Zustand, in dem Ordnung und Überraschung gleichzeitig bestehen und sich gegenseitig bedingen, ohne sich aufzuheben.';
    defText.style.cssText = [
      'font-family:Helvetica,'Helvetica Neue',Arial,sans-serif',
      'font-size:12px',
      'line-height:1.65',
      'color:#e0e0e0',
    ].join(';');
    content.appendChild(defText);

    const citation = document.createElement('div');
    citation.textContent = '— Aus einem Gespräch, 23. März 2025';
    citation.style.cssText = [
      'font-family:Helvetica,'Helvetica Neue',Arial,sans-serif',
      'font-size:10px',
      'color:#777777',
      'margin-left:8px',
      'margin-top:4px',
    ].join(';');
    content.appendChild(citation);

    const date = document.createElement('div');
    const today = new Date();
    date.textContent = today.toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    date.style.cssText = [
      'font-family:Helvetica,'Helvetica Neue',Arial,sans-serif',
      'font-size:9px',
      'color:#555555',
      'position:absolute',
      'bottom:16px',
      'left:22px',
    ].join(';');
    content.appendChild(date);
  }

  const frame = document.createElement('div');
  frame.style.cssText = [
    'width:300px',
    'height:533px',
    'background:#000000',
    'border:1px solid #333333',
    'border-radius:8px',
    'overflow:hidden',
    'position:relative',
    'flex-shrink:0',
    'box-sizing:border-box',
  ].join(';');
  frame.appendChild(content);

  return wrapWithLabel(frame);
}

// ── welcome preview ───────────────────────────────────────────────────────────

export function createWelcomePreview(): HTMLElement {
  const content = document.createElement('div');
  content.style.cssText = [
    'width:100%',
    'height:100%',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'gap:14px',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = 'MeinUngeheuer';
  title.style.cssText = [
    'font-family:Helvetica,'Helvetica Neue',Arial,sans-serif',
    'font-size:22px',
    'font-weight:400',
    'color:#ffffff',
    'letter-spacing:0.06em',
    'text-align:center',
    'opacity:0.95',
  ].join(';');

  const subtitle = document.createElement('div');
  subtitle.textContent = 'Näher treten';
  subtitle.style.cssText = [
    'font-family:Helvetica,'Helvetica Neue',Arial,sans-serif',
    'font-size:10px',
    'color:#555555',
    'letter-spacing:0.1em',
    'text-transform:uppercase',
  ].join(';');

  content.appendChild(title);
  content.appendChild(subtitle);

  return wrapWithLabel(createTabletFrame(content));
}

// ── farewell preview ──────────────────────────────────────────────────────────

export function createFarewellPreview(): HTMLElement {
  const content = document.createElement('div');
  content.style.cssText = [
    'width:100%',
    'height:100%',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'gap:10px',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = 'Auf Wiedersehen';
  title.style.cssText = [
    'font-family:Helvetica,'Helvetica Neue',Arial,sans-serif',
    'font-size:18px',
    'font-weight:400',
    'color:#888888',
    'letter-spacing:0.04em',
    'text-align:center',
  ].join(';');

  content.appendChild(title);

  return wrapWithLabel(createTabletFrame(content));
}
