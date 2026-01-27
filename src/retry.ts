import { debugLog, isRetryableError } from './utils';

export class RetryHandler {
  private maxRetries: number;
  private debug: boolean;

  constructor(maxRetries: number, debug: boolean) {
    this.maxRetries = maxRetries;
    this.debug = debug;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        // Check if we should retry
        if (!isRetryableError(error)) {
          debugLog(this.debug, `Non-retryable error, giving up:`, error);
          throw error;
        }

        // Check if we have retries left
        if (attempt === this.maxRetries) {
          debugLog(this.debug, `Max retries (${this.maxRetries}) reached, giving up`);
          throw error;
        }

        // Calculate backoff delay: 100ms, 200ms, 400ms, 800ms, capped at 3000ms
        const delay = Math.min(100 * Math.pow(2, attempt), 3000);
        debugLog(this.debug, `Retry attempt ${attempt + 1}/${this.maxRetries} after ${delay}ms`, error);

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // This should never be reached, but TypeScript requires it
    throw lastError || new Error('Unexpected error in retry handler');
  }
}
