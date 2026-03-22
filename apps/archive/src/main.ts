import { supabase } from './supabase';

interface Definition {
  id: string;
  session_id: string;
  term: string;
  definition_text: string;
  citations: string[] | null;
  language: string;
  chain_depth: number | null;
  created_at: string;
}

type Language = 'de' | 'en';

let currentLang: Language = 'de';
let allDefinitions: Definition[] = [];
let searchQuery = '';

const app = document.getElementById('app')!;

function getRoute(): { view: 'list' } | { view: 'single'; id: string } {
  const hash = window.location.hash;
  const match = hash.match(/^#\/definition\/(.+)$/);
  if (match) {
    return { view: 'single', id: match[1] as string };
  }
  return { view: 'list' };
}

async function fetchDefinitions(): Promise<Definition[]> {
  const { data, error } = await supabase
    .from('definitions')
    .select('id, session_id, term, definition_text, citations, language, chain_depth, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Definition[];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function filteredDefinitions(): Definition[] {
  let defs = allDefinitions.filter((d) => d.language === currentLang);
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    defs = defs.filter((d) => d.term.toLowerCase().includes(q));
  }
  return defs;
}

function renderList(): void {
  const title = currentLang === 'de' ? 'ARCHIV' : 'ARCHIVE';
  const toggleLabel = currentLang === 'de' ? 'EN' : 'DE';
  const placeholder = currentLang === 'de' ? 'Begriff suchen...' : 'Search term...';

  const defs = filteredDefinitions();

  let entriesHtml: string;
  if (defs.length === 0) {
    const emptyText =
      currentLang === 'de'
        ? 'Keine Eintr\u00e4ge gefunden.'
        : 'No entries found.';
    entriesHtml = `<div class="empty">${emptyText}</div>`;
  } else {
    entriesHtml = defs
      .map(
        (d) => `
      <div class="entry" data-id="${d.id}">
        <div class="entry-term">${escapeHtml(d.term)}</div>
        <div class="entry-definition">${escapeHtml(d.definition_text)}</div>
        ${
          d.citations && d.citations.length > 0
            ? `<div class="entry-citations">${d.citations.map((c) => escapeHtml(c)).join(' / ')}</div>`
            : ''
        }
        <div class="entry-date">${formatDate(d.created_at)}</div>
      </div>
    `,
      )
      .join('');
  }

  app.innerHTML = `
    <div class="header">
      <h1>${title}</h1>
      <button class="lang-toggle" id="lang-toggle">${toggleLabel}</button>
    </div>
    <div class="search-wrap">
      <input
        type="text"
        class="search-input"
        id="search-input"
        placeholder="${placeholder}"
        value="${escapeHtml(searchQuery)}"
      />
    </div>
    <div class="entries">${entriesHtml}</div>
  `;

  document.getElementById('lang-toggle')!.addEventListener('click', () => {
    currentLang = currentLang === 'de' ? 'en' : 'de';
    searchQuery = '';
    renderList();
  });

  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderList();
  });
  searchInput.focus();
  // Restore cursor position after re-render
  searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);

  document.querySelectorAll('.entry').forEach((el) => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset['id'];
      window.location.hash = `#/definition/${id}`;
    });
  });
}

function renderSingle(id: string): void {
  const def = allDefinitions.find((d) => d.id === id);

  if (!def) {
    const notFound = currentLang === 'de' ? 'Eintrag nicht gefunden.' : 'Entry not found.';
    app.innerHTML = `
      <a href="#/" class="back-link">&larr; ${currentLang === 'de' ? 'Zur\u00fcck' : 'Back'}</a>
      <div class="empty">${notFound}</div>
    `;
    return;
  }

  const backLabel = currentLang === 'de' ? 'Zur\u00fcck zum Archiv' : 'Back to archive';

  app.innerHTML = `
    <div class="single">
      <a href="#/" class="back-link">&larr; ${backLabel}</a>
      <div class="entry-term">${escapeHtml(def.term)}</div>
      <div class="entry-definition">${escapeHtml(def.definition_text)}</div>
      ${
        def.citations && def.citations.length > 0
          ? `<div class="entry-citations">${def.citations.map((c) => escapeHtml(c)).join(' / ')}</div>`
          : ''
      }
      <div class="entry-date">${formatDate(def.created_at)}</div>
    </div>
  `;
}

function renderLoading(): void {
  app.innerHTML = '<div class="loading">...</div>';
}

function renderError(message: string): void {
  app.innerHTML = `<div class="error">${escapeHtml(message)}</div>`;
}

async function render(): Promise<void> {
  const route = getRoute();

  if (allDefinitions.length === 0) {
    renderLoading();
    try {
      allDefinitions = await fetchDefinitions();
    } catch (err) {
      renderError(err instanceof Error ? err.message : 'Failed to load definitions.');
      return;
    }
  }

  if (route.view === 'single') {
    renderSingle(route.id);
  } else {
    renderList();
  }
}

window.addEventListener('hashchange', () => {
  void render();
});

void render();
