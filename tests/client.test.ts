import { describe, it, expect, vi, beforeEach } from 'vitest';
import { APIClient } from '../src/client';
import { MCPTrackerConfig } from '../src/types';

describe('APIClient', () => {
  const mockConfig: Required<MCPTrackerConfig> = {
    apiKey: 'test-api-key',
    endpoint: 'https://test.example.com/track',
    timeout: 5000,
    retries: 3,
    debug: false,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn();
  });

  it('should send event successfully', async () => {
    const mockResponse = { ok: true };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const client = new APIClient(mockConfig);
    const result = await client.sendEvent({
      tool_name: 'test_tool',
      event_type: 'invocation',
    });

    expect(result).toEqual(mockResponse);
    expect(global.fetch).toHaveBeenCalledWith(
      mockConfig.endpoint,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': mockConfig.apiKey,
        },
        body: JSON.stringify({
          tool_name: 'test_tool',
          event_type: 'invocation',
        }),
      })
    );
  });

  it('should include metadata and duration when provided', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    const client = new APIClient(mockConfig);
    await client.sendEvent({
      tool_name: 'test_tool',
      event_type: 'success',
      duration_ms: 150,
      metadata: { foo: 'bar' },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      mockConfig.endpoint,
      expect.objectContaining({
        body: JSON.stringify({
          tool_name: 'test_tool',
          event_type: 'success',
          duration_ms: 150,
          metadata: { foo: 'bar' },
        }),
      })
    );
  });

  it('should throw on 401 error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Invalid API key',
    });

    const client = new APIClient(mockConfig);

    await expect(client.sendEvent({
      tool_name: 'test_tool',
      event_type: 'invocation',
    })).rejects.toThrow('HTTP 401');
  });

  it('should throw on 400 error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => 'Invalid payload',
    });

    const client = new APIClient(mockConfig);

    await expect(client.sendEvent({
      tool_name: 'test_tool',
      event_type: 'invocation',
    })).rejects.toThrow('HTTP 400');
  });

  it('should throw on 429 rate limit error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => 'Rate limit exceeded',
    });

    const client = new APIClient(mockConfig);

    await expect(client.sendEvent({
      tool_name: 'test_tool',
      event_type: 'invocation',
    })).rejects.toThrow('HTTP 429');
  });

  it('should handle timeout', async () => {
    const client = new APIClient({ ...mockConfig, timeout: 100, retries: 0 });

    // Mock fetch that respects abort signal
    global.fetch = vi.fn().mockImplementation((url, options) =>
      new Promise((resolve, reject) => {
        const timeout = setTimeout(() => resolve({
          ok: true,
          json: async () => ({ ok: true }),
        }), 1000);

        if (options?.signal) {
          options.signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }
      })
    );

    await expect(client.sendEvent({
      tool_name: 'test_tool',
      event_type: 'invocation',
    })).rejects.toThrow('Request timeout');
  }, 2000);
});
