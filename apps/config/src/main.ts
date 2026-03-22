import { supabase, getSession, signIn, signOut } from './lib/supabase.js';
import { render as renderPrograms } from './tabs/programs.js';
import { render as renderWorkbench } from './tabs/workbench.js';
import { render as renderSystem } from './tabs/system.js';

// ── DOM references ──────────────────────────────────────────────────────────

const loginOverlay = document.getElementById('login-overlay') as HTMLDivElement;
const loginForm = document.getElementById('login-form') as HTMLFormElement;
const loginEmail = document.getElementById('login-email') as HTMLInputElement;
const loginPassword = document.getElementById('login-password') as HTMLInputElement;
const loginSubmit = document.getElementById('login-submit') as HTMLButtonElement;
const loginError = document.getElementById('login-error') as HTMLDivElement;
const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement;
const systemBtn = document.getElementById('system-btn') as HTMLButtonElement;
const contentEl = document.getElementById('content') as HTMLElement;
const modeButtons = document.querySelectorAll<HTMLButtonElement>('.mode-btn');

// ── Mode registry ─────────────────────────────────────────────────────────────

type ModeId = 'programs' | 'workbench' | 'system';

const modeRenderers: Record<ModeId, (container: HTMLElement) => void> = {
  programs: renderPrograms,
  workbench: renderWorkbench,
  system: renderSystem,
};

let activeMode: ModeId = 'programs';

// ── Public helper ─────────────────────────────────────────────────────────────

/** Returns the #content element for renderers that need it externally. */
export function getContentEl(): HTMLElement {
  return contentEl;
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

function showLogin(): void {
  loginOverlay.classList.remove('hidden');
  loginEmail.focus();
}

function hideLogin(): void {
  loginOverlay.classList.add('hidden');
}

// ── Mode switching ─────────────────────────────────────────────────────────────

function activateMode(modeId: ModeId): void {
  activeMode = modeId;

  // Update mode buttons (only programs/workbench, not system)
  modeButtons.forEach((btn) => {
    if (btn.dataset['mode'] === modeId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // System button highlight
  if (modeId === 'system') {
    systemBtn.classList.add('active');
  } else {
    systemBtn.classList.remove('active');
  }

  const renderer = modeRenderers[modeId];
  if (renderer) {
    renderer(contentEl);
  }
}

// ── Connection status dots ────────────────────────────────────────────────────

type DotState = 'connected' | 'disconnected' | 'checking';

function setDot(id: string, state: DotState): void {
  const container = document.getElementById(id);
  if (!container) return;
  const dot = container.querySelector('.dot');
  if (!dot) return;
  dot.className = `dot ${state}`;
}

async function checkConnections(): Promise<void> {
  // Supabase: probe with a lightweight auth call
  try {
    const { error } = await supabase.auth.getSession();
    setDot('dot-supabase', error ? 'disconnected' : 'connected');
  } catch {
    setDot('dot-supabase', 'disconnected');
  }

  // POS server: not checkable from browser (CORS), mark as checking
  setDot('dot-pos', 'checking');

  // Renderer: placeholder — not configured
  setDot('dot-renderer', 'checking');
}

// ── Login form ────────────────────────────────────────────────────────────────

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  loginSubmit.disabled = true;
  loginSubmit.textContent = 'Signing in…';

  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  const error = await signIn(email, password);

  if (error) {
    loginError.textContent = error;
    loginSubmit.disabled = false;
    loginSubmit.textContent = 'Sign in';
    return;
  }

  hideLogin();
  activateMode(activeMode);
  void checkConnections();
});

// ── Logout ────────────────────────────────────────────────────────────────────

logoutBtn.addEventListener('click', async () => {
  await signOut();
  contentEl.innerHTML = '';
  showLogin();
  setDot('dot-supabase', 'checking');
  setDot('dot-pos', 'checking');
  setDot('dot-renderer', 'checking');
});

// ── Mode button clicks ────────────────────────────────────────────────────────

modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const modeId = btn.dataset['mode'] as ModeId | undefined;
    if (modeId && modeId in modeRenderers) {
      activateMode(modeId);
    }
  });
});

// ── System button ────────────────────────────────────────────────────────────

systemBtn.addEventListener('click', () => {
  if (activeMode === 'system') {
    // Toggle back to programs if already on system
    activateMode('programs');
  } else {
    activateMode('system');
  }
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  const session = await getSession();

  if (!session) {
    showLogin();
    return;
  }

  hideLogin();
  activateMode(activeMode);
  void checkConnections();
}

void init();
