import { MCPTrackerConfig, MCPEventPayload } from './types';
import { RetryHandler } from './retry';
import { debugLog } from './utils';

export class APIClient {
  private config: Required<MCPTrackerConfig>;
  private retryHandler: RetryHandler;

  constructor(config: Required<MCPTrackerConfig>) {
    this.config = config;
    this.retryHandler = new RetryHandler(config.retries, config.debug);
  }

  async sendEvent(payload: MCPEventPayload): Promise<{ ok: boolean }> {
    return this.retryHandler.execute<{ ok: boolean }>(async () => {
      debugLog(this.config.debug, 'Sending event:', payload);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      try {
        const response = await fetch(this.config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.config.apiKey,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Handle specific HTTP errors
        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          const error: any = new Error(`HTTP ${response.status}: ${errorBody || response.statusText}`);
          error.status = response.status;
          error.response = response;

          if (response.status === 401) {
            debugLog(this.config.debug, 'Invalid API key');
          } else if (response.status === 400) {
            debugLog(this.config.debug, 'Invalid payload:', errorBody);
          } else if (response.status === 429) {
            debugLog(this.config.debug, 'Rate limit exceeded');
          }

          throw error;
        }

        const data = await response.json() as { ok: boolean };
        debugLog(this.config.debug, 'Event sent successfully:', data);
        return data;
      } catch (error: any) {
        if (error.name === 'AbortError') {
          debugLog(this.config.debug, `Request timeout after ${this.config.timeout}ms`);
          throw new Error(`Request timeout after ${this.config.timeout}ms`);
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    });
  }
}
