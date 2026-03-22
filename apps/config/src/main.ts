import { supabase, getSession, signIn, signOut } from './lib/supabase.js';
import { render as renderInstallation } from './tabs/installation.js';
import { render as renderConversation } from './tabs/conversation.js';
import { render as renderPrinting } from './tabs/printing.js';
import { render as renderTools } from './tabs/tools.js';
import { render as renderSystem } from './tabs/system.js';

// ── DOM references ──────────────────────────────────────────────────────────

const loginOverlay = document.getElementById('login-overlay') as HTMLDivElement;
const loginForm = document.getElementById('login-form') as HTMLFormElement;
const loginEmail = document.getElementById('login-email') as HTMLInputElement;
const loginPassword = document.getElementById('login-password') as HTMLInputElement;
const loginSubmit = document.getElementById('login-submit') as HTMLButtonElement;
const loginError = document.getElementById('login-error') as HTMLDivElement;
const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement;
const contentEl = document.getElementById('content') as HTMLElement;
const tabButtons = document.querySelectorAll<HTMLButtonElement>('.tab-btn');

// ── Tab registry ─────────────────────────────────────────────────────────────

type TabId = 'installation' | 'conversation' | 'printing' | 'tools' | 'system';

const tabRenderers: Record<TabId, (container: HTMLElement) => void> = {
  installation: renderInstallation,
  conversation: renderConversation,
  printing: renderPrinting,
  tools: renderTools,
  system: renderSystem,
};

let activeTab: TabId = 'installation';

// ── Public helper ─────────────────────────────────────────────────────────────

/** Returns the #content element for tab renderers that need it externally. */
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

// ── Tab switching ─────────────────────────────────────────────────────────────

function activateTab(tabId: TabId): void {
  activeTab = tabId;

  tabButtons.forEach((btn) => {
    if (btn.dataset['tab'] === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const renderer = tabRenderers[tabId];
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
  activateTab(activeTab);
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

// ── Tab clicks ────────────────────────────────────────────────────────────────

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const tabId = btn.dataset['tab'] as TabId | undefined;
    if (tabId && tabId in tabRenderers) {
      activateTab(tabId);
    }
  });
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  const session = await getSession();

  if (!session) {
    showLogin();
    return;
  }

  hideLogin();
  activateTab(activeTab);
  void checkConnections();
}

void init();
