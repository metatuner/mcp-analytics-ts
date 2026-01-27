import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPTracker, createMCPTracker } from '../src/tracker';

describe('MCPTracker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
  });

  describe('constructor', () => {
    it('should create tracker with default config', () => {
      const tracker = new MCPTracker({ apiKey: 'test-key' });
      expect(tracker).toBeInstanceOf(MCPTracker);
    });

    it('should use custom config', () => {
      const tracker = new MCPTracker({
        apiKey: 'test-key',
        endpoint: 'https://custom.example.com',
        timeout: 10000,
        retries: 5,
        debug: true,
      });
      expect(tracker).toBeInstanceOf(MCPTracker);
    });
  });

  describe('createMCPTracker', () => {
    it('should create tracker instance', () => {
      const tracker = createMCPTracker({ apiKey: 'test-key' });
      expect(tracker).toBeInstanceOf(MCPTracker);
    });
  });

  describe('track', () => {
    it('should track invocation event', async () => {
      const tracker = new MCPTracker({ apiKey: 'test-key' });
      const result = await tracker.track('test_tool', 'invocation');

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"tool_name":"test_tool"'),
        })
      );
    });

    it('should track with metadata', async () => {
      const tracker = new MCPTracker({ apiKey: 'test-key' });
      const result = await tracker.track('test_tool', 'success', { foo: 'bar' });

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"metadata":{"foo":"bar"}'),
        })
      );
    });

    it('should track with duration', async () => {
      const tracker = new MCPTracker({ apiKey: 'test-key' });
      const result = await tracker.track('test_tool', 'success', undefined, 150);

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"duration_ms":150'),
        })
      );
    });

    it('should return error on failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const tracker = new MCPTracker({ apiKey: 'test-key', retries: 0 });
      const result = await tracker.track('test_tool', 'invocation');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('convenience methods', () => {
    it('should track invocation', async () => {
      const tracker = new MCPTracker({ apiKey: 'test-key' });
      const result = await tracker.trackInvocation('test_tool', { input: 'data' });

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"event_type":"invocation"'),
        })
      );
    });

    it('should track success', async () => {
      const tracker = new MCPTracker({ apiKey: 'test-key' });
      const result = await tracker.trackSuccess('test_tool', { output: 'result' }, 100);

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"event_type":"success"'),
        })
      );
    });

    it('should track failure', async () => {
      const tracker = new MCPTracker({ apiKey: 'test-key' });
      const result = await tracker.trackFailure('test_tool', { error: 'message' }, 50);

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"event_type":"failure"'),
        })
      );
    });
  });

  describe('wrap', () => {
    it('should track invocation and success', async () => {
      const tracker = new MCPTracker({ apiKey: 'test-key' });
      const mockFn = vi.fn().mockResolvedValue({ data: 'result' });

      const wrapped = tracker.wrap('test_tool', mockFn);
      const result = await wrapped({ input: 'test' });

      expect(result).toEqual({ data: 'result' });
      expect(mockFn).toHaveBeenCalledWith({ input: 'test' }, undefined);
      expect(global.fetch).toHaveBeenCalledTimes(2); // invocation + success
    });

    it('should track failure on error', async () => {
      const tracker = new MCPTracker({ apiKey: 'test-key' });
      const mockFn = vi.fn().mockRejectedValue(new Error('Test error'));

      const wrapped = tracker.wrap('test_tool', mockFn);

      await expect(wrapped({ input: 'test' })).rejects.toThrow('Test error');
      expect(global.fetch).toHaveBeenCalledTimes(2); // invocation + failure
    });

    it('should use getMetadata option', async () => {
      const tracker = new MCPTracker({ apiKey: 'test-key' });
      const mockFn = vi.fn().mockResolvedValue({ data: 'result' });

      const wrapped = tracker.wrap('test_tool', mockFn, {
        getMetadata: (params) => ({ input: params }),
      });

      await wrapped({ query: 'test' });

      const calls = (global.fetch as any).mock.calls;
      const invocationCall = calls[0][1].body;
      expect(invocationCall).toContain('"input":{"query":"test"}');
    });

    it('should use getOutputMetadata option', async () => {
      const tracker = new MCPTracker({ apiKey: 'test-key' });
      const mockFn = vi.fn().mockResolvedValue({ items: [1, 2, 3] });

      const wrapped = tracker.wrap('test_tool', mockFn, {
        getOutputMetadata: (result) => ({ count: result.items.length }),
      });

      await wrapped({});

      const calls = (global.fetch as any).mock.calls;
      const successCall = calls[1][1].body;
      expect(successCall).toContain('"count":3');
    });

    it('should use getErrorMetadata option', async () => {
      const tracker = new MCPTracker({ apiKey: 'test-key' });
      const mockFn = vi.fn().mockRejectedValue(new Error('Test error'));

      const wrapped = tracker.wrap('test_tool', mockFn, {
        getErrorMetadata: (error) => ({ error_message: error.message }),
      });

      try {
        await wrapped({});
      } catch (e) {
        // Expected
      }

      const calls = (global.fetch as any).mock.calls;
      const failureCall = calls[1][1].body;
      expect(failureCall).toContain('"error_message":"Test error"');
    });

    it('should skip invocation tracking when trackInvocation is false', async () => {
      const tracker = new MCPTracker({ apiKey: 'test-key' });
      const mockFn = vi.fn().mockResolvedValue({ data: 'result' });

      const wrapped = tracker.wrap('test_tool', mockFn, {
        trackInvocation: false,
      });

      await wrapped({});

      expect(global.fetch).toHaveBeenCalledTimes(1); // Only success
    });

    it('should not rethrow errors when rethrowErrors is false', async () => {
      const tracker = new MCPTracker({ apiKey: 'test-key' });
      const mockFn = vi.fn().mockRejectedValue(new Error('Test error'));

      const wrapped = tracker.wrap('test_tool', mockFn, {
        rethrowErrors: false,
      });

      const result = await wrapped({});

      expect(result).toBeUndefined();
      expect(global.fetch).toHaveBeenCalledTimes(2); // invocation + failure
    });

    it('should measure duration correctly', async () => {
      const tracker = new MCPTracker({ apiKey: 'test-key' });
      const mockFn = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { data: 'result' };
      });

      const wrapped = tracker.wrap('test_tool', mockFn);
      await wrapped({});

      const calls = (global.fetch as any).mock.calls;
      const successCall = calls[1][1].body;
      const body = JSON.parse(successCall);

      expect(body.duration_ms).toBeGreaterThanOrEqual(90); // Allow some variance
    });
  });
});
