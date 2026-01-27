import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetryHandler } from '../src/retry';

describe('RetryHandler', () => {
  beforeEach(() => {
    vi.clearAllTimers();
  });

  it('should succeed on first try', async () => {
    const handler = new RetryHandler(3, false);
    const fn = vi.fn().mockResolvedValue('success');

    const result = await handler.execute(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable errors', async () => {
    const handler = new RetryHandler(3, false);
    const fn = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('Server Error'), { status: 500 }))
      .mockRejectedValueOnce(Object.assign(new Error('Server Error'), { status: 500 }))
      .mockResolvedValue('success');

    const result = await handler.execute(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should not retry on non-retryable errors', async () => {
    const handler = new RetryHandler(3, false);
    const error = Object.assign(new Error('Unauthorized'), { status: 401 });
    const fn = vi.fn().mockRejectedValue(error);

    await expect(handler.execute(fn)).rejects.toThrow('Unauthorized');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should give up after max retries', async () => {
    const handler = new RetryHandler(2, false);
    const error = Object.assign(new Error('Server Error'), { status: 500 });
    const fn = vi.fn().mockRejectedValue(error);

    await expect(handler.execute(fn)).rejects.toThrow('Server Error');
    expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });

  it('should use exponential backoff', async () => {
    vi.useFakeTimers();
    const handler = new RetryHandler(3, false);
    const error = Object.assign(new Error('Server Error'), { status: 500 });
    const fn = vi.fn().mockRejectedValue(error);

    const promise = handler.execute(fn);

    // First attempt fails immediately
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // Second attempt after 100ms
    await vi.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(2);

    // Third attempt after 200ms
    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(3);

    // Fourth attempt after 400ms
    await vi.advanceTimersByTimeAsync(400);
    expect(fn).toHaveBeenCalledTimes(4);

    await expect(promise).rejects.toThrow('Server Error');

    vi.useRealTimers();
  });
});
