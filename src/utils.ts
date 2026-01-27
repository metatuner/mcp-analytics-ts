import { MCPMetadata } from './types';

/**
 * Deep merge multiple metadata objects into one
 */
export function mergeMetadata(...metadatas: (MCPMetadata | undefined)[]): MCPMetadata {
  return metadatas.reduce<MCPMetadata>((acc, metadata) => {
    if (!metadata) return acc;
    return { ...acc, ...metadata };
  }, {});
}

/**
 * Log debug messages if debug mode is enabled
 */
export function debugLog(debug: boolean, message: string, ...args: any[]): void {
  if (debug) {
    console.log(`[MCPTracker] ${message}`, ...args);
  }
}

/**
 * Check if an error should be retried
 */
export function isRetryableError(error: any): boolean {
  // Network errors
  if (error.name === 'TypeError' || error.message?.includes('fetch')) {
    return true;
  }

  // HTTP errors
  if (error.status) {
    const status = error.status;
    // Don't retry client errors (except 408, 429 which we also don't retry but handle separately)
    if (status >= 400 && status < 500) {
      return false;
    }
    // Retry server errors
    if (status >= 500) {
      return true;
    }
  }

  // Default: retry
  return true;
}
