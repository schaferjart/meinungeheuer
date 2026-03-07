import type { CacheAdapter, TTSCacheValue } from './types.js';

/**
 * Creates an in-memory cache backed by a Map.
 * Each call returns an isolated cache instance.
 * Cache errors never propagate — get returns null, set is fire-and-forget.
 */
export function createMemoryCache(): CacheAdapter {
  const store = new Map<string, TTSCacheValue>();

  return {
    async get(key: string): Promise<TTSCacheValue | null> {
      try {
        return store.get(key) ?? null;
      } catch {
        return null;
      }
    },

    async set(key: string, value: TTSCacheValue): Promise<void> {
      try {
        store.set(key, value);
      } catch {
        // Fire-and-forget: cache errors never propagate
      }
    },
  };
}

/**
 * Creates a localStorage-backed cache with an optional key prefix.
 * Cache errors (quota exceeded, unavailable storage, invalid JSON)
 * never throw — get returns null, set is fire-and-forget.
 */
export function createLocalStorageCache(prefix = 'kr-tts-'): CacheAdapter {
  return {
    async get(key: string): Promise<TTSCacheValue | null> {
      try {
        const raw = localStorage.getItem(`${prefix}${key}`);
        if (raw === null) return null;
        return JSON.parse(raw) as TTSCacheValue;
      } catch {
        return null;
      }
    },

    async set(key: string, value: TTSCacheValue): Promise<void> {
      try {
        localStorage.setItem(`${prefix}${key}`, JSON.stringify(value));
      } catch {
        // Fire-and-forget: silently catch QuotaExceededError and any other exceptions
      }
    },
  };
}
