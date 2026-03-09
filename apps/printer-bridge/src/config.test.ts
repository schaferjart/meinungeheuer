import { describe, it, expect, afterEach } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  const originalEnv = process.env['POS_SERVER_URL'];

  afterEach(() => {
    // Restore original env
    if (originalEnv === undefined) {
      delete process.env['POS_SERVER_URL'];
    } else {
      process.env['POS_SERVER_URL'] = originalEnv;
    }
  });

  it('defaults POS_SERVER_URL to http://localhost:9100', () => {
    delete process.env['POS_SERVER_URL'];
    const config = loadConfig();
    expect(config.posServerUrl).toBe('http://localhost:9100');
  });

  it('reads POS_SERVER_URL from env when set', () => {
    process.env['POS_SERVER_URL'] = 'http://pi:9100';
    const config = loadConfig();
    expect(config.posServerUrl).toBe('http://pi:9100');
  });
});
