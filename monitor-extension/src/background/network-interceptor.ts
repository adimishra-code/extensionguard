import { logger } from '../utils/logger';

interface NetworkRequest {
  extensionId: string;
  url: string;
  method: string;
  requestHeaders?: Record<string, string>;
  statusCode?: number;
  blocked?: boolean;
}

export class NetworkInterceptor {
  private apiUrl: string;
  private apiKey: string | undefined;
  private enabled: boolean = false;

  constructor(apiUrl: string, apiKey?: string) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  /**
   * Enable network interception
   */
  async enable(): Promise<void> {
    if (this.enabled) {
      console.log('[Network Interceptor] Already enabled');
      return;
    }

    try {
      // Request webRequest permission
      const granted = await chrome.permissions.request({
        permissions: ['webRequest'],
      });

      if (!granted) {
        console.warn('[Network Interceptor] Permission denied');
        return;
      }

      this.enabled = true;

      // Listen for requests
      chrome.webRequest.onBeforeRequest.addListener(
        (details) => this.handleRequest(details),
        { urls: ['<all_urls>'] },
        ['requestBody']
      );

      // Listen for completed requests
      chrome.webRequest.onCompleted.addListener(
        (details) => this.handleCompleted(details),
        { urls: ['<all_urls>'] },
        ['responseHeaders']
      );

      console.log('[Network Interceptor] Enabled');
    } catch (error) {
      console.error('[Network Interceptor] Failed to enable:', error);
    }
  }

  /**
   * Disable network interception
   */
  disable(): void {
    if (!this.enabled) {
      return;
    }

    // Remove listeners
    chrome.webRequest.onBeforeRequest.removeListener(this.handleRequest);
    chrome.webRequest.onCompleted.removeListener(this.handleCompleted);

    this.enabled = false;
    console.log('[Network Interceptor] Disabled');
  }

  /**
   * Handle outgoing request
   */
  private handleRequest(details: chrome.webRequest.WebRequestBodyDetails): void {
    // Skip our own requests
    if (details.url.includes(this.apiUrl)) {
      return;
    }

    // Check if request is from an extension
    if (details.initiator?.startsWith('chrome-extension://')) {
      const extensionId = this.extractExtensionId(details.initiator);

      if (extensionId) {
        console.log('[Network Interceptor] Request:', extensionId, details.url);

        // Log to backend (debounced)
        this.logRequest({
          extensionId,
          url: details.url,
          method: details.method,
        });
      }
    }
  }

  /**
   * Handle completed request
   */
  private handleCompleted(details: chrome.webRequest.WebResponseHeadersDetails): void {
    // Track status code for analysis
    if (details.initiator?.startsWith('chrome-extension://')) {
      const extensionId = this.extractExtensionId(details.initiator);

      if (extensionId) {
        this.updateRequestStatus(extensionId, details.url, details.statusCode);
      }
    }
  }

  /**
   * Extract extension ID from initiator URL
   */
  private extractExtensionId(initiator: string): string | null {
    const match = initiator.match(/chrome-extension:\/\/([a-z]{32})/);
    return match ? match[1] : null;
  }

  /**
   * Log request to backend
   */
  private logRequest(request: NetworkRequest): void {
    if (!this.apiKey) {
      return;
    }

    // Send to backend
    fetch(`${this.apiUrl}/api/network/log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify(request),
    }).catch((error) => {
      console.error('[Network Interceptor] Failed to log request:', error);
    });
  }

  /**
   * Update request status
   */
  private updateRequestStatus(
    extensionId: string,
    url: string,
    statusCode: number
  ): void {
    // Could be used for more sophisticated tracking
    console.log(`[Network Interceptor] ${extensionId} -> ${url} (${statusCode})`);
  }
}
