import { describe, it, expect, vi, afterEach } from 'vitest';
import { printCard, buildTestPayload } from './printer.js';
import { PrintPayloadSchema } from '@meinungeheuer/shared';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildTestPayload', () => {
  it('returns a valid PrintPayload', () => {
    const payload = buildTestPayload();
    const result = PrintPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

describe('printCard', () => {
  it('logs payload to console when URL is empty (console mode)', async () => {
    const spy = vi.spyOn(console, 'log');
    const payload = buildTestPayload();
    await printCard('', payload);
    const output = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('VOGEL');
  });

  it('logs payload to console when URL is "console"', async () => {
    const spy = vi.spyOn(console, 'log');
    const payload = buildTestPayload();
    await printCard('console', payload);
    const output = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('VOGEL');
  });

  it('maps term to word and definition_text to definition in POST body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(''),
    });
    vi.stubGlobal('fetch', mockFetch);

    const payload = buildTestPayload();
    await printCard('http://test:9100', payload);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit & { signal?: AbortSignal }];
    expect(url).toBe('http://test:9100/print/dictionary');

    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body['word']).toBe('VOGEL');
    expect(body).not.toHaveProperty('term');
    expect(body['definition']).toBe(payload.definition_text);
    expect(body).not.toHaveProperty('definition_text');
    expect(body['template']).toBe('dictionary');
  });

  it('forwards template field from payload to POST body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(''),
    });
    vi.stubGlobal('fetch', mockFetch);

    const payload = { ...buildTestPayload(), template: 'dictionary_portrait' };
    await printCard('http://test:9100', payload);

    const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<string, unknown>;
    expect(body['template']).toBe('dictionary_portrait');
  });

  it('retries once on network error then succeeds', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(''),
      });
    vi.stubGlobal('fetch', mockFetch);

    const payload = buildTestPayload();
    await printCard('http://test:9100', payload);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('throws after retry exhaustion on persistent network error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', mockFetch);

    const payload = buildTestPayload();
    await expect(printCard('http://test:9100', payload)).rejects.toThrow('ECONNREFUSED');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
