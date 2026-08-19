# Extension Guard v2.0 - Real-Time Monitoring Architecture

## Overview

Extension Guard v2.0 extends the existing static analysis platform with **real-time monitoring** and **supply chain intelligence**. The system consists of:

1. **Monitoring Extension** - Chrome/Edge extension that monitors installed extensions
2. **WebSocket Service** - Real-time communication layer
3. **Supply Chain Tracker** - Version history and threat intelligence
4. **Differential Analysis** - Compare extension versions for safety

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         User's Browser                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │           Extension Guard Monitor (Chrome Extension)         │  │
│  │                                                              │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │  │
│  │  │   Service    │  │    Popup     │  │  Content Script │   │  │
│  │  │   Worker     │  │      UI      │  │   (optional)    │   │  │
│  │  │  (Background)│  │   (React)    │  │                 │   │  │
│  │  └──────┬───────┘  └──────────────┘  └─────────────────┘   │  │
│  │         │                                                    │  │
│  │         │ Monitors via Chrome APIs:                         │  │
│  │         │ • chrome.management (extension list)              │  │
│  │         │ • chrome.webRequest (network monitoring)          │  │
│  │         │ • chrome.storage (storage access tracking)        │  │
│  │         │                                                    │  │
│  └─────────┼────────────────────────────────────────────────────┘  │
│            │                                                        │
│            │ WebSocket (WSS)                                        │
│            │ + JWT Auth                                             │
│            ▼                                                        │
└────────────┼────────────────────────────────────────────────────────┘
             │
             │
┌────────────┼────────────────────────────────────────────────────────┐
│            │               Backend Services                         │
├────────────┼────────────────────────────────────────────────────────┤
│            ▼                                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Fastify API Server                        │  │
│  │                                                              │  │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐  │  │
│  │  │  WebSocket │  │   REST     │  │   Authentication     │  │  │
│  │  │   Server   │  │    API     │  │   (JWT + API Keys)   │  │  │
│  │  └─────┬──────┘  └─────┬──────┘  └──────────────────────┘  │  │
│  │        │               │                                     │  │
│  │        │               │                                     │  │
│  │  ┌─────▼───────────────▼─────────────────────────────────┐  │  │
│  │  │              Message Queue (BullMQ)                   │  │  │
│  │  │  • Monitoring events                                  │  │  │
│  │  │  • Scan jobs (existing)                               │  │  │
│  │  │  • Alert notifications                                │  │  │
│  │  │  • CWS scraping jobs                                  │  │  │
│  │  └───────┬──────────────┬──────────────┬─────────────────┘  │  │
│  │          │              │              │                     │  │
│  └──────────┼──────────────┼──────────────┼─────────────────────┘  │
│             │              │              │                        │
│             ▼              ▼              ▼                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │   Monitor    │  │  Differential │  │   CWS Store  │            │
│  │   Processor  │  │   Analysis    │  │   Scraper    │            │
│  │              │  │    Engine     │  │   Worker     │            │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘            │
│         │                 │                 │                     │
│         └─────────────────┼─────────────────┘                     │
│                           ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                   PostgreSQL Database                        │ │
│  │                                                              │ │
│  │  ┌──────────┐ ┌────────────────┐ ┌──────────────────┐      │ │
│  │  │  Scans   │ │ ExtensionVersion│ │ ThreatIntel     │      │ │
│  │  │ (existing)│ │   (versions)   │ │ (known threats) │      │ │
│  │  └──────────┘ └────────────────┘ └──────────────────┘      │ │
│  │                                                              │ │
│  │  ┌──────────────┐ ┌────────────────┐ ┌─────────────────┐   │ │
│  │  │   Users      │ │ MonitorSession │ │ CommunityReport │   │ │
│  │  │ (accounts)   │ │ (live clients) │ │ (crowdsourced)  │   │ │
│  │  └──────────────┘ └────────────────┘ └─────────────────┘   │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                      Redis Cache                             │ │
│  │  • WebSocket session state                                   │ │
│  │  • Real-time risk scores                                     │ │
│  │  • BullMQ job queue                                          │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. Monitoring Extension (Chrome Extension)

#### Manifest V3 Structure
```json
{
  "manifest_version": 3,
  "name": "Extension Guard Monitor",
  "version": "2.0.0",
  "permissions": [
    "management",       // List installed extensions
    "storage",          // Local storage for config
    "alarms",           // Periodic checks
    "notifications"     // Alert user
  ],
  "optional_permissions": [
    "webRequest",       // Network monitoring (requires user consent)
    "declarativeNetRequest"
  ],
  "host_permissions": [
    "https://api.extensionguard.dev/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup.html"
  }
}
```

#### Service Worker (background.js)

**Responsibilities:**
- Monitor installed extensions via `chrome.management.getAll()`
- Detect extension updates via `chrome.management.onInstalled` / `onEnabled` / `onDisabled`
- Track permission changes by comparing manifests
- Establish WebSocket connection to backend
- Send monitoring events to backend
- Receive risk scores and alerts from backend
- Trigger Chrome notifications for critical alerts

**Key APIs Used:**
```typescript
// List all extensions
chrome.management.getAll((extensions) => {
  // Send to backend for analysis
});

// Detect updates
chrome.management.onInstalled.addListener((info) => {
  if (info.reason === 'update') {
    // Extension was updated - trigger differential analysis
  }
});

// Network monitoring (if user grants permission)
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Track network calls made by extensions
  },
  { urls: ["<all_urls>"] }
);
```

#### Popup UI

**React-based dashboard showing:**
- List of installed extensions with real-time risk scores
- Visual indicators (🟢 Safe, 🟡 Medium, 🔴 High Risk)
- Recent alerts timeline
- Quick actions: "Scan Now", "Disable Extension", "View Report"
- Connection status to backend
- Settings: sync frequency, alert preferences

---

### 2. WebSocket Service

#### Protocol

**Connection:**
```
wss://api.extensionguard.dev/monitor
Authorization: Bearer <JWT_TOKEN>
```

**Message Types:**

**Client → Server:**
```typescript
// Initial handshake
{
  type: 'register',
  clientId: 'browser-uuid',
  userAgent: 'Chrome/120.0...',
  extensions: [
    {
      id: 'extension-id',
      name: 'Extension Name',
      version: '1.0.0',
      permissions: ['tabs', 'storage'],
      enabled: true
    }
  ]
}

// Extension update detected
{
  type: 'extension_updated',
  extensionId: 'extension-id',
  oldVersion: '1.0.0',
  newVersion: '1.1.0',
  timestamp: 1234567890
}

// Network event
{
  type: 'network_request',
  extensionId: 'extension-id',
  url: 'https://tracking.example.com/collect',
  method: 'POST',
  headers: {...},
  timestamp: 1234567890
}

// Heartbeat
{
  type: 'ping',
  timestamp: 1234567890
}
```

**Server → Client:**
```typescript
// Risk score update
{
  type: 'risk_update',
  extensionId: 'extension-id',
  riskScore: 75,
  severity: 'high',
  reasons: [
    'Excessive permissions detected',
    'Known tracking domain contacted'
  ]
}

// Alert
{
  type: 'alert',
  severity: 'critical',
  extensionId: 'extension-id',
  message: 'Extension X requested new dangerous permission',
  actionRequired: true
}

// Scan complete
{
  type: 'scan_complete',
  scanId: 'scan-uuid',
  extensionId: 'extension-id',
  reportUrl: '/reports/scan-uuid'
}

// Pong
{
  type: 'pong',
  timestamp: 1234567890
}
```

---

### 3. Database Schema Extensions

#### New Prisma Models

```prisma
// User accounts for authentication
model User {
  id            String          @id @default(cuid())
  email         String          @unique
  passwordHash  String
  apiKey        String          @unique @default(cuid())
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
  sessions      MonitorSession[]
  reports       CommunityReport[]
}

// Active monitoring sessions
model MonitorSession {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id])
  clientId        String    @unique
  userAgent       String
  connectedAt     DateTime  @default(now())
  lastHeartbeat   DateTime  @default(now())
  disconnectedAt  DateTime?
  
  @@index([userId])
  @@index([clientId])
}

// Extension version history
model ExtensionVersion {
  id                String    @id @default(cuid())
  extensionId       String    // Chrome Web Store ID
  version           String
  name              String
  description       String?
  permissions       Json      // Array of permissions
  hostPermissions   Json      // Host permissions
  manifest          Json      // Full manifest
  releaseDate       DateTime?
  detectedAt        DateTime  @default(now())
  scanId            String?   // Link to scan if available
  scan              Scan?     @relation(fields: [scanId], references: [id])
  diffFromPrevious  Json?     // Differential analysis results
  
  @@unique([extensionId, version])
  @@index([extensionId])
  @@index([releaseDate])
}

// Known threats database
model ThreatIntelligence {
  id              String    @id @default(cuid())
  extensionId     String?   // Specific extension (if applicable)
  pattern         String?   // Malicious code pattern (regex)
  domain          String?   // Malicious domain
  type            String    // 'extension', 'domain', 'code_pattern'
  severity        String    // 'critical', 'high', 'medium', 'low'
  description     String
  source          String    // 'community', 'automated', 'verified'
  confidence      Float     // 0.0 - 1.0
  reportedAt      DateTime  @default(now())
  verifiedAt      DateTime?
  verifiedBy      String?
  metadata        Json?     // Additional context
  
  @@index([extensionId])
  @@index([type])
  @@index([severity])
}

// Community-reported threats
model CommunityReport {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id])
  extensionId     String
  extensionName   String
  reportType      String    // 'malicious', 'suspicious', 'privacy_violation'
  description     String
  evidence        Json?     // Screenshots, logs, etc.
  status          String    @default("pending") // 'pending', 'verified', 'rejected'
  reportedAt      DateTime  @default(now())
  reviewedAt      DateTime?
  reviewedBy      String?
  
  @@index([extensionId])
  @@index([status])
}

// Real-time monitoring events (optional, could be time-series DB)
model MonitoringEvent {
  id              String    @id @default(cuid())
  sessionId       String
  extensionId     String
  eventType       String    // 'network_request', 'permission_change', 'storage_access'
  data            Json
  timestamp       DateTime  @default(now())
  
  @@index([sessionId])
  @@index([extensionId])
  @@index([timestamp])
}
```

---

### 4. Backend Services

#### A. WebSocket Server (Fastify Plugin)

```typescript
// backend/src/plugins/websocket.ts
import { FastifyPluginAsync } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';

export const websocketPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyWebsocket);
  
  fastify.get('/monitor', { websocket: true }, (connection, req) => {
    // Authenticate via JWT
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = verifyJWT(token);
    
    // Register client
    const clientId = generateClientId();
    registerMonitorSession(user.id, clientId, connection);
    
    // Handle messages
    connection.on('message', async (message) => {
      const event = JSON.parse(message.toString());
      await handleMonitorEvent(clientId, event);
    });
    
    // Cleanup on disconnect
    connection.on('close', () => {
      deregisterMonitorSession(clientId);
    });
  });
};
```

#### B. Monitor Event Processor

```typescript
// backend/src/services/monitor-processor.ts
export class MonitorProcessor {
  async processExtensionUpdate(event: ExtensionUpdateEvent) {
    // 1. Check if we have previous version in DB
    const previousVersion = await getPreviousVersion(event.extensionId);
    
    // 2. Queue differential analysis job
    if (previousVersion) {
      await queueDifferentialAnalysis({
        extensionId: event.extensionId,
        oldVersion: previousVersion.version,
        newVersion: event.newVersion
      });
    }
    
    // 3. Check against threat intelligence
    const threats = await checkThreatIntelligence(event.extensionId);
    if (threats.length > 0) {
      await sendAlert(event.clientId, {
        severity: 'critical',
        message: 'Known malicious extension detected',
        threats
      });
    }
    
    // 4. Queue full scan if high risk
    const riskScore = await calculateQuickRiskScore(event);
    if (riskScore > 70) {
      await queueFullScan(event.extensionId);
    }
  }
  
  async processNetworkEvent(event: NetworkEvent) {
    // 1. Classify domain
    const classification = classifyDomain(event.url);
    
    // 2. Check for data exfiltration patterns
    if (classification.type === 'tracking' || classification.suspicious) {
      await logSuspiciousActivity(event);
      await updateRiskScore(event.extensionId, +5);
    }
    
    // 3. Send real-time update to client
    await sendRiskUpdate(event.clientId, {
      extensionId: event.extensionId,
      reason: `Contacted ${classification.type} domain: ${event.url}`
    });
  }
}
```

#### C. Differential Analysis Engine

```typescript
// backend/src/services/differential-analysis.ts
export class DifferentialAnalyzer {
  async analyzeDiff(oldVersion: ExtensionVersion, newVersion: ExtensionVersion) {
    const diff = {
      permissionsAdded: [],
      permissionsRemoved: [],
      hostPermissionsAdded: [],
      codeChanges: [],
      riskDelta: 0,
      severity: 'low'
    };
    
    // 1. Permission diff
    const oldPerms = new Set(oldVersion.permissions);
    const newPerms = new Set(newVersion.permissions);
    
    diff.permissionsAdded = [...newPerms].filter(p => !oldPerms.has(p));
    diff.permissionsRemoved = [...oldPerms].filter(p => !newPerms.has(p));
    
    // 2. Score dangerous new permissions
    const dangerousPerms = ['cookies', 'webRequest', '<all_urls>'];
    const dangerousAdded = diff.permissionsAdded.filter(p => 
      dangerousPerms.includes(p)
    );
    
    if (dangerousAdded.length > 0) {
      diff.riskDelta += dangerousAdded.length * 20;
      diff.severity = 'high';
    }
    
    // 3. Code analysis (if we have source)
    if (oldVersion.scanId && newVersion.scanId) {
      const oldScan = await getScan(oldVersion.scanId);
      const newScan = await getScan(newVersion.scanId);
      
      diff.codeChanges = compareFindings(oldScan, newScan);
    }
    
    // 4. Store diff results
    await storeVersionDiff(newVersion.id, diff);
    
    return diff;
  }
}
```

#### D. Chrome Web Store Scraper

```typescript
// backend/src/services/cws-scraper.ts
export class CWScraper {
  async scrapeExtension(extensionId: string) {
    // Chrome Web Store doesn't have official API
    // Options:
    // 1. Scrape HTML (fragile, rate-limited)
    // 2. Use unofficial APIs
    // 3. Monitor RSS feeds
    // 4. User submissions
    
    const url = `https://chrome.google.com/webstore/detail/${extensionId}`;
    const html = await fetch(url).then(r => r.text());
    
    // Parse metadata
    const metadata = parseExtensionPage(html);
    
    // Check if version changed
    const latestVersion = await getLatestVersion(extensionId);
    if (latestVersion?.version !== metadata.version) {
      // New version detected!
      await createExtensionVersion({
        extensionId,
        version: metadata.version,
        name: metadata.name,
        permissions: metadata.permissions,
        releaseDate: metadata.updated
      });
      
      // Notify all monitoring clients
      await notifyVersionUpdate(extensionId, metadata.version);
    }
  }
  
  async scheduleScraping() {
    // Run periodically for all monitored extensions
    const monitoredExtensions = await getMonitoredExtensions();
    
    for (const ext of monitoredExtensions) {
      await this.scrapeExtension(ext.extensionId);
      await sleep(1000); // Rate limiting
    }
  }
}
```

---

## Security Considerations

### 1. Monitoring Extension Security

**The monitoring extension itself must be secure:**
- No dangerous permissions by default (only request `management`, `storage`, `alarms`)
- `webRequest` is optional - user must explicitly grant
- All data transmission over WSS (WebSocket Secure)
- API key stored in `chrome.storage.local` (encrypted)
- Content Security Policy to prevent XSS
- Regular security audits

### 2. Backend Security

- JWT authentication for WebSocket connections
- Rate limiting on all endpoints
- Input validation with Zod schemas
- SQL injection protection via Prisma
- CORS configured for frontend origin only
- No sensitive data in WebSocket messages (reference by ID)

### 3. Privacy

- User data never shared with third parties
- Extension code/files deleted after analysis
- Network logs anonymized
- User can opt-out of cloud sync (local-only mode)

---

## Data Flow Examples

### Example 1: User Installs Malicious Extension

```
1. User installs extension "PDF Converter Pro"
2. Chrome triggers chrome.management.onInstalled
3. Monitor extension detects new extension
4. Sends registration event via WebSocket:
   {
     type: 'extension_installed',
     extensionId: 'abc123',
     version: '1.0.0',
     permissions: ['cookies', '<all_urls>', 'webRequest']
   }
5. Backend checks threat intelligence DB
6. Match found! "PDF Converter Pro" is known malware
7. Backend sends alert to client:
   {
     type: 'alert',
     severity: 'critical',
     message: 'Malicious extension detected',
     action: 'disable_immediately'
   }
8. Monitor extension shows Chrome notification
9. Popup UI highlights extension in red
10. User clicks "Disable" button
11. Extension disabled via chrome.management.setEnabled(id, false)
```

### Example 2: Extension Updates with New Permissions

```
1. User has "Ad Blocker" v1.0.0 installed
2. Developer pushes v1.1.0 with new 'cookies' permission
3. Chrome auto-updates extension
4. Monitor detects update via chrome.management.onInstalled
5. Sends update event to backend
6. Backend retrieves v1.0.0 from ExtensionVersion table
7. Differential analyzer compares versions:
   - Added permission: 'cookies'
   - Risk delta: +20 (high)
8. Backend queues full scan of v1.1.0
9. Sends risk update to client
10. Popup shows: "⚠️ Ad Blocker updated with new cookie access"
11. User clicks "View Changes"
12. Differential report shown with permission diff
```

---

## Tech Stack Summary

| Component | Technology | Why |
|-----------|-----------|-----|
| Monitor Extension | TypeScript + Vite | Type safety, modern bundling |
| Popup UI | React 18 + Tailwind | Reuse frontend stack, fast dev |
| Background Worker | TypeScript | Service workers require modern tooling |
| WebSocket | Fastify Websocket | Already using Fastify, performant |
| Real-time State | Redis | Fast pub/sub for live updates |
| Database | PostgreSQL + Prisma | Already in use, relational data fits |
| Job Queue | BullMQ | Already in use for scans |
| Authentication | JWT | Stateless, works with WebSocket |

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Production Deployment                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Cloudflare / Nginx                      │  │
│  │  • SSL termination                                   │  │
│  │  • Rate limiting                                     │  │
│  │  • DDoS protection                                   │  │
│  └────────────────┬─────────────────────────────────────┘  │
│                   │                                         │
│         ┌─────────┴─────────┐                              │
│         ▼                   ▼                              │
│  ┌──────────────┐    ┌──────────────┐                     │
│  │   Frontend   │    │   Backend    │                     │
│  │   (Static)   │    │  (Fastify)   │                     │
│  │   Vercel/    │    │   Docker     │                     │
│  │   Cloudflare │    │   Container  │                     │
│  └──────────────┘    └──────┬───────┘                     │
│                             │                              │
│                   ┌─────────┴─────────┐                   │
│                   ▼                   ▼                   │
│            ┌─────────────┐     ┌─────────────┐           │
│            │ PostgreSQL  │     │    Redis    │           │
│            │   (RDS)     │     │  (ElastiCache) │        │
│            └─────────────┘     └─────────────┘           │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │           Worker Nodes (Background Jobs)             │ │
│  │  • CWS scraper                                       │ │
│  │  • Differential analysis                             │ │
│  │  • Full scans                                        │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Next Steps

1. **Set up extension project structure** (Task #2)
2. **Extend Prisma schema** (Task #7)
3. **Implement WebSocket service** (Task #6)
4. **Build monitoring core** (Task #3)
5. **Create popup UI** (Task #5)

Ready to start implementation!
