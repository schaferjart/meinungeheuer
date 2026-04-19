import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';

// happy-dom v20 + vitest 3 ship a localStorage whose Proxy disallows
// property assignment and has no `.clear()` exposed. Replace it with a
// plain Map-backed mock so tests can rely on a standard Web Storage API.
function makeLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length(): number { return store.size; },
    clear: () => { store.clear(); },
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeLocalStorageMock());
});
