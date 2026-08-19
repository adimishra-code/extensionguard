# WebSocket Service Documentation

Real-time communication layer for Extension Guard v2.0 monitoring.

## Overview

The WebSocket service enables real-time bidirectional communication between the monitoring Chrome extension and the backend server. It supports JWT and API key authentication, event processing, and live alerts.

---

## Connection

### Endpoint

```
ws://localhost:3001/monitor
wss://api.extensionguard.dev/monitor (production)
```

### Authentication

**Option 1: JWT Token (Web Dashboard)**
```
ws://localhost:3001/monitor?token=YOUR_JWT_TOKEN
```

**Option 2: API Key (Chrome Extension)**
```
ws://localhost:3001/monitor?apiKey=eg_abc123...
```

### Connection Example

```typescript
// Chrome Extension
const apiKey = await chrome.storage.local.get('apiKey');
const ws = new WebSocket(`ws://localhost:3001/monitor?apiKey=${apiKey}`);

ws.onopen = () => {
  console.log('Connected to Extension Guard');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Disconnected');
};
```

---

## Message Protocol

### Client → Server Messages

#### 1. Register (Initial Handshake)

Send on connection with list of installed extensions:

```json
{
  "type": "register",
  "clientId": "browser-uuid-12345",
  "userAgent": "Mozilla/5.0...",
  "extensions": [
    {
      "id": "extension-id",
      "name": "Extension Name",
      "version": "1.0.0",
      "permissions": ["tabs", "storage"],
      "enabled": true
    }
  ],
  "timestamp": 1692456789000
}
```

#### 2. Extension Installed

```json
{
  "type": "extension_installed",
  "extensionId": "abc123...",
  "timestamp": 1692456789000
}
```

#### 3. Extension Updated

```json
{
  "type": "extension_updated",
  "extensionId": "abc123...",
  "oldVersion": "1.0.0",
  "newVersion": "1.1.0",
  "timestamp": 1692456789000
}
```

#### 4. Extension Removed

```json
{
  "type": "extension_removed",
  "extensionId": "abc123...",
  "timestamp": 1692456789000
}
```

#### 5. Extension Enabled/Disabled

```json
{
  "type": "extension_enabled",
  "extensionId": "abc123...",
  "timestamp": 1692456789000
}
```

#### 6. Network Request (Optional)

```json
{
  "type": "network_request",
  "extensionId": "abc123...",
  "url": "https://tracking.example.com/collect",
  "method": "POST",
  "headers": {
    "content-type": "application/json"
  },
  "timestamp": 1692456789000
}
```

#### 7. Heartbeat/Ping

Send every 60 seconds to keep connection alive:

```json
{
  "type": "ping",
  "timestamp": 1692456789000
}
```

---

### Server → Client Messages

#### 1. Connected (Welcome Message)

Sent immediately after successful connection:

```json
{
  "type": "connected",
  "message": "Connected to Extension Guard monitoring service",
  "timestamp": 1692456789000
}
```

#### 2. Risk Score Update

```json
{
  "type": "risk_update",
  "extensionId": "abc123...",
  "riskScore": 75,
  "severity": "high",
  "reasons": [
    "Excessive permissions detected",
    "Known tracking domain contacted"
  ],
  "timestamp": 1692456789000
}
```

#### 3. Alert

```json
{
  "type": "alert",
  "extensionId": "abc123...",
  "severity": "critical",
  "message": "Known malicious extension detected",
  "actionRequired": true,
  "timestamp": 1692456789000
}
```

**Severity Levels:**
- `low` - Informational
- `medium` - Warning
- `high` - Dangerous behavior detected
- `critical` - Confirmed threat, disable immediately

#### 4. Scan Complete

```json
{
  "type": "scan_complete",
  "scanId": "scan-uuid",
  "extensionId": "abc123...",
  "reportUrl": "/reports/scan-uuid",
  "timestamp": 1692456789000
}
```

#### 5. Pong (Heartbeat Response)

```json
{
  "type": "pong",
  "timestamp": 1692456789000
}
```

#### 6. Error

```json
{
  "type": "error",
  "message": "Failed to process message",
  "timestamp": 1692456789000
}
```

---

## HTTP Endpoints

### Get Connection Stats

```http
GET /api/monitor/stats
```

**Response:**
```json
{
  "status": "ok",
  "connections": {
    "total": 42
  },
  "timestamp": "2024-08-19T12:00:00.000Z"
}
```

### Get Active Sessions

```http
GET /api/monitor/sessions
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "sessions": [
    {
      "id": "session-id",
      "client_id": "browser-uuid",
      "user_agent": "Mozilla/5.0...",
      "connected_at": "2024-08-19T12:00:00.000Z",
      "last_heartbeat": "2024-08-19T12:05:00.000Z",
      "isConnected": true
    }
  ],
  "count": 1
}
```

### Get Monitoring Events

```http
GET /api/monitor/events
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "events": [
    {
      "id": "event-id",
      "session_id": "session-id",
      "extension_id": "abc123",
      "event_type": "extension_updated",
      "data": { "oldVersion": "1.0.0", "newVersion": "1.1.0" },
      "timestamp": "2024-08-19T12:00:00.000Z"
    }
  ],
  "count": 100
}
```

### Request Extension Scan

```http
POST /api/monitor/scan
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "extensionId": "abc123..."
}
```

**Response:**
```json
{
  "message": "Scan request received",
  "extensionId": "abc123..."
}
```

### Send Test Alert

```http
POST /api/monitor/test-alert
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "message": "Test alert sent",
  "clientsSent": 2
}
```

### Get Monitored Extensions

```http
GET /api/monitor/extensions
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "extensions": [
    {
      "id": "monitored-id",
      "user_id": "user-id",
      "extension_id": "abc123",
      "extension_name": "My Extension",
      "current_version": "1.0.0",
      "auto_scan": true,
      "alert_on_update": true,
      "added_at": "2024-08-19T12:00:00.000Z",
      "last_checked_at": "2024-08-19T12:05:00.000Z"
    }
  ],
  "count": 1
}
```

### Add Monitored Extension

```http
POST /api/monitor/extensions
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "extensionId": "abc123",
  "extensionName": "My Extension",
  "currentVersion": "1.0.0",
  "autoScan": true,
  "alertOnUpdate": true
}
```

**Response:**
```json
{
  "message": "Extension added to monitoring",
  "extension": { ... }
}
```

---

## Connection Management

### Heartbeat

- Client should send `ping` every 60 seconds
- Server responds with `pong`
- Server disconnects clients with no heartbeat for 5 minutes

### Reconnection

If connection drops:

1. Wait 1 second
2. Attempt reconnection with exponential backoff (1s, 2s, 4s, 8s, 16s)
3. Max 5 reconnection attempts
4. After 5 failures, show error to user

### Example Reconnection Logic

```typescript
class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  connect(apiKey: string) {
    const url = `ws://localhost:3001/monitor?apiKey=${apiKey}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
    };

    this.ws.onclose = () => {
      this.attemptReconnect(apiKey);
    };
  }

  private attemptReconnect(apiKey: string) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(() => {
      this.connect(apiKey);
    }, delay);
  }
}
```

---

## Security

### Authentication

- JWT tokens expire after 7 days
- API keys never expire but can be regenerated
- Failed auth results in WebSocket close with code 1008

### Rate Limiting

- Global rate limit: 100 requests/minute per IP
- WebSocket messages: No limit, but suspicious patterns are detected

### Data Privacy

- All communication should use WSS (WebSocket Secure) in production
- Messages are not logged by default
- Monitoring events stored for 30 days then archived

---

## Error Codes

WebSocket close codes:

| Code | Meaning |
|------|---------|
| 1000 | Normal closure |
| 1008 | Policy violation (auth failed) |
| 1011 | Server error |

---

## Testing

### Test Connection with wscat

```bash
npm install -g wscat

# With API key
wscat -c "ws://localhost:3001/monitor?apiKey=eg_abc123"

# Send ping
> {"type":"ping","timestamp":1692456789000}

# Receive pong
< {"type":"pong","timestamp":1692456789000}
```

### Test with Browser Console

```javascript
const ws = new WebSocket('ws://localhost:3001/monitor?apiKey=eg_abc123');

ws.onopen = () => {
  console.log('Connected');
  ws.send(JSON.stringify({
    type: 'ping',
    timestamp: Date.now()
  }));
};

ws.onmessage = (event) => {
  console.log('Received:', JSON.parse(event.data));
};
```

---

## Monitoring & Debugging

### View Active Connections

```bash
curl http://localhost:3001/api/monitor/stats
```

### View Session Logs

Check server logs for WebSocket events:

```
[INFO] WebSocket client registered { userId, clientId, sessionId }
[INFO] WebSocket connection closed { userId, clientId }
[DEBUG] Processing monitoring event { eventType }
```

---

## Next Steps

1. ✅ Integrate with existing scan queue
2. ✅ Add risk scoring engine
3. ✅ Build threat intelligence system
4. ✅ Implement differential analysis
5. ✅ Add CWS scraper integration
