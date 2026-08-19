import type { Config, MonitoringEvent, ServerMessage } from '@/types';

type MessageHandler = (message: ServerMessage) => void;

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private clientId: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1s
  private messageHandlers: MessageHandler[] = [];
  private isConnecting = false;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  async connect(config: Config): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      console.log('[WebSocket] Already connected or connecting');
      return;
    }

    if (!config.apiKey) {
      console.error('[WebSocket] No API key configured');
      return;
    }

    this.isConnecting = true;

    try {
      const wsUrl = config.apiUrl.replace('http://', 'ws://').replace('https://', 'wss://');
      const url = `${wsUrl}/monitor?token=${config.apiKey}`;

      console.log('[WebSocket] Connecting to:', wsUrl);

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.isConnecting = false;
      };

      this.ws.onmessage = (event) => {
        try {
          const message: ServerMessage = JSON.parse(event.data);
          console.log('[WebSocket] Message received:', message.type);
          this.messageHandlers.forEach(handler => handler(message));
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        this.isConnecting = false;
      };

      this.ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        this.ws = null;
        this.isConnecting = false;
        this.attemptReconnect(config);
      };
    } catch (error) {
      console.error('[WebSocket] Connection failed:', error);
      this.isConnecting = false;
      this.attemptReconnect(config);
    }
  }

  private async attemptReconnect(config: Config): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect(config);
    }, delay);
  }

  send(event: MonitoringEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
      console.log('[WebSocket] Sent event:', event.type);
    } else {
      console.warn('[WebSocket] Cannot send, not connected');
    }
  }

  sendHeartbeat(): void {
    this.send({
      type: 'ping',
      timestamp: Date.now(),
    });
  }

  on(event: 'message', handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
