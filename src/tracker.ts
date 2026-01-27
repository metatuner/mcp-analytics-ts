import { MCPTrackerConfig, MCPEventType, MCPMetadata, WrapOptions, TrackingResult } from './types';
import { APIClient } from './client';
import { mergeMetadata, debugLog } from './utils';

const DEFAULT_ENDPOINT = 'https://dersubrqatbvvmzwkmsj.supabase.co/functions/v1/track-mcp-event';

export class MCPTracker {
  private client: APIClient;
  private config: Required<MCPTrackerConfig>;

  constructor(config: MCPTrackerConfig) {
    this.config = {
      apiKey: config.apiKey,
      endpoint: config.endpoint || DEFAULT_ENDPOINT,
      timeout: config.timeout ?? 5000,
      retries: config.retries ?? 3,
      debug: config.debug ?? false,
    };

    this.client = new APIClient(this.config);
  }

  /**
   * Track an MCP event
   */
  async track(
    toolName: string,
    eventType: MCPEventType,
    metadata?: MCPMetadata,
    durationMs?: number
  ): Promise<TrackingResult> {
    try {
      const payload = {
        tool_name: toolName,
        event_type: eventType,
        ...(durationMs !== undefined && { duration_ms: durationMs }),
        ...(metadata && { metadata }),
      };

      await this.client.sendEvent(payload);
      return { success: true };
    } catch (error: any) {
      debugLog(this.config.debug, `Failed to track ${eventType} event for ${toolName}:`, error);
      return { success: false, error };
    }
  }

  /**
   * Track an invocation event
   */
  async trackInvocation(toolName: string, metadata?: MCPMetadata): Promise<TrackingResult> {
    return this.track(toolName, 'invocation', metadata);
  }

  /**
   * Track a success event
   */
  async trackSuccess(
    toolName: string,
    metadata?: MCPMetadata,
    durationMs?: number
  ): Promise<TrackingResult> {
    return this.track(toolName, 'success', metadata, durationMs);
  }

  /**
   * Track a failure event
   */
  async trackFailure(
    toolName: string,
    metadata?: MCPMetadata,
    durationMs?: number
  ): Promise<TrackingResult> {
    return this.track(toolName, 'failure', metadata, durationMs);
  }

  /**
   * Wrap a function with automatic MCP event tracking
   */
  wrap<TParams = any, TResult = any, TMeta = any>(
    toolName: string,
    fn: (params: TParams, meta?: TMeta) => Promise<TResult>,
    options: WrapOptions<TParams, TResult, TMeta> = {}
  ): (params: TParams, meta?: TMeta) => Promise<TResult> {
    const {
      getMetadata,
      getOutputMetadata,
      getErrorMetadata,
      trackInvocation: shouldTrackInvocation = true,
      rethrowErrors = true,
    } = options;

    return async (params: TParams, meta?: TMeta): Promise<TResult> => {
      const startTime = Date.now();
      let invocationMetadata: MCPMetadata | undefined;

      try {
        // Get initial metadata
        if (getMetadata) {
          try {
            invocationMetadata = getMetadata(params, meta);
          } catch (error: any) {
            debugLog(this.config.debug, `Error getting metadata for ${toolName}:`, error);
          }
        }

        // Track invocation
        if (shouldTrackInvocation) {
          await this.trackInvocation(toolName, invocationMetadata);
        }

        // Execute the function
        const result = await fn(params, meta);
        const duration = Date.now() - startTime;

        // Get output metadata
        let outputMetadata: MCPMetadata | undefined;
        if (getOutputMetadata) {
          try {
            outputMetadata = getOutputMetadata(result);
          } catch (error: any) {
            debugLog(this.config.debug, `Error getting output metadata for ${toolName}:`, error);
          }
        }

        // Track success
        const successMetadata = mergeMetadata(invocationMetadata, outputMetadata);
        await this.trackSuccess(toolName, successMetadata, duration);

        return result;
      } catch (error: any) {
        const duration = Date.now() - startTime;

        // Get error metadata
        let errorMetadata: MCPMetadata | undefined;
        if (getErrorMetadata) {
          try {
            errorMetadata = getErrorMetadata(error);
          } catch (metaError: any) {
            debugLog(this.config.debug, `Error getting error metadata for ${toolName}:`, metaError);
          }
        }

        // Track failure
        const failureMetadata = mergeMetadata(invocationMetadata, errorMetadata);
        await this.trackFailure(toolName, failureMetadata, duration);

        // Rethrow the original error
        if (rethrowErrors) {
          throw error;
        }

        // If not rethrowing, return undefined (caller must handle this)
        return undefined as any;
      }
    };
  }
}

/**
 * Factory function to create an MCPTracker instance
 */
export function createMCPTracker(config: MCPTrackerConfig): MCPTracker {
  return new MCPTracker(config);
}
