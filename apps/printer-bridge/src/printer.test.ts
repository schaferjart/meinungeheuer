import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderAndPrint, printPortrait, buildTestPayload } from './printer.js';
import { PrintPayloadSchema, PortraitPrintPayloadSchema } from '@meinungeheuer/shared';

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

describe('renderAndPrint', () => {
  it('logs payload to console when POS URL is empty (console mode)', async () => {
    const spy = vi.spyOn(console, 'log');
    const payload = buildTestPayload();
    await renderAndPrint('', 'http://renderer:8000', '', payload);
    const output = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('VOGEL');
  });

  it('logs payload to console when POS URL is "console"', async () => {
    const spy = vi.spyOn(console, 'log');
    const payload = buildTestPayload();
    await renderAndPrint('console', 'http://renderer:8000', '', payload);
    const output = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('VOGEL');
  });

  it('calls render-api then POS server with rendered image', async () => {
    const pngBlob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
    const mockFetch = vi.fn()
      // First call: render-api
      .mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(pngBlob),
        text: () => Promise.resolve(''),
      })
      // Second call: POS server
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(''),
      });
    vi.stubGlobal('fetch', mockFetch);

    const payload = buildTestPayload();
    await renderAndPrint('http://pos:9100', 'http://renderer:8000', '', payload);

    expect(mockFetch).toHaveBeenCalledTimes(2);

    // First call should be to render-api
    const [renderUrl, renderOpts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(renderUrl).toBe('http://renderer:8000/render/dictionary');
    const renderBody = JSON.parse(renderOpts.body as string) as Record<string, unknown>;
    expect(renderBody['word']).toBe('VOGEL');
    expect(renderBody['template']).toBe('helvetica');

    // Second call should be to POS server /print/image
    const [posUrl] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(posUrl).toBe('http://pos:9100/print/image');
  });

  it('sends API key header when configured', async () => {
    const pngBlob = new Blob([new Uint8Array(4)], { type: 'image/png' });
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(pngBlob), text: () => Promise.resolve('') })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('') });
    vi.stubGlobal('fetch', mockFetch);

    await renderAndPrint('http://pos:9100', 'http://renderer:8000', 'secret123', buildTestPayload());

    const [, renderOpts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = renderOpts.headers as Record<string, string>;
    expect(headers['X-Api-Key']).toBe('secret123');
  });

  it('retries POS server on first failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pngBlob = new Blob([new Uint8Array(4)], { type: 'image/png' });
    const mockFetch = vi.fn()
      // render-api succeeds
      .mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(pngBlob), text: () => Promise.resolve('') })
      // POS server fails first
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      // POS server succeeds on retry
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('') });
    vi.stubGlobal('fetch', mockFetch);

    await renderAndPrint('http://pos:9100', 'http://renderer:8000', '', buildTestPayload());
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe('printPortrait', () => {
  it('logs to console when POS URL is empty', async () => {
    const spy = vi.spyOn(console, 'log');
    const payload: { type: 'portrait'; image_urls: { name: string; url: string }[]; job_id: string; timestamp: string } = {
      type: 'portrait',
      image_urls: [{ name: 'zoom_0', url: 'https://example.com/zoom_0.png' }],
      job_id: 'test-123',
      timestamp: new Date().toISOString(),
    };
    await printPortrait('', payload);
    const output = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('test-123');
  });

  it('validates against PortraitPrintPayloadSchema', () => {
    const payload = {
      type: 'portrait' as const,
      image_urls: [{ name: 'zoom_0', url: 'https://example.com/zoom_0.png' }],
      job_id: 'abc-123',
      timestamp: new Date().toISOString(),
    };
    const result = PortraitPrintPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});
