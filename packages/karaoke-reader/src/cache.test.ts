import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMemoryCache, createLocalStorageCache } from './cache.js';
import type { TTSCacheValue } from './types.js';

const makeSample = (id = 1): TTSCacheValue => ({
  audioBase64Parts: [`base64-part-${id}`],
  wordTimestamps: [{ word: `word${id}`, startTime: 0, endTime: 1, index: 0 }],
});

describe('createMemoryCache', () => {
  it('get returns null for unknown key', async () => {
    const cache = createMemoryCache();
    expect(await cache.get('nonexistent')).toBeNull();
  });

  it('set then get returns the stored value', async () => {
    const cache = createMemoryCache();
    const sample = makeSample();
    await cache.set('key1', sample);
    expect(await cache.get('key1')).toEqual(sample);
  });

  it('two separate instances have isolated stores', async () => {
    const cache1 = createMemoryCache();
    const cache2 = createMemoryCache();
    const sample = makeSample();
    await cache1.set('shared-key', sample);

    expect(await cache1.get('shared-key')).toEqual(sample);
    expect(await cache2.get('shared-key')).toBeNull();
  });
});

describe('createLocalStorageCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('get returns null for unknown key', async () => {
    const cache = createLocalStorageCache();
    expect(await cache.get('nonexistent')).toBeNull();
  });

  it('set then get returns the stored value', async () => {
    const cache = createLocalStorageCache();
    const sample = makeSample();
    await cache.set('key1', sample);
    expect(await cache.get('key1')).toEqual(sample);
  });

  it('get returns null when localStorage.getItem throws', async () => {
    const cache = createLocalStorageCache();
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });

    // Must not throw, must return null
    const result = await cache.get('some-key');
    expect(result).toBeNull();

    spy.mockRestore();
  });

  it('get returns null when stored data is invalid JSON', async () => {
    const cache = createLocalStorageCache();
    localStorage.setItem('kr-tts-corrupted', '{not valid json!!!');

    const result = await cache.get('corrupted');
    expect(result).toBeNull();
  });

  it('set does not throw when localStorage.setItem throws', async () => {
    const cache = createLocalStorageCache();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    // Must not throw
    await expect(cache.set('key', makeSample())).resolves.toBeUndefined();

    spy.mockRestore();
  });

  it('custom prefix is applied to localStorage keys', async () => {
    const cache = createLocalStorageCache('custom-');
    const sample = makeSample();
    await cache.set('mykey', sample);

    // The key in localStorage should use the custom prefix
    const raw = localStorage.getItem('custom-mykey');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual(sample);

    // Default prefix should NOT have it
    expect(localStorage.getItem('kr-tts-mykey')).toBeNull();
  });
});
