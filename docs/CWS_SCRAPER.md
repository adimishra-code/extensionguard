# Chrome Web Store Scraper

Automated extension version tracking and supply chain monitoring.

## Overview

The CWS scraper automatically monitors the Chrome Web Store to:
- Track extension version releases
- Cache extension metadata
- Detect version updates in real-time
- Trigger differential analysis on updates
- Create supply chain event timeline
- Alert users monitoring extensions

---

## How It Works

```
┌──────────────────────────────────────────────────┐
│         Chrome Web Store Scraper Flow            │
├──────────────────────────────────────────────────┤
│                                                  │
│  1. SCRAPE TRIGGER                               │
│     ├─ Manual API call                          │
│     ├─ Scheduled job (every 24 hours)           │
│     ├─ User monitoring request                  │
│     └─ Extension installation detected          │
│                                                  │
│  2. FETCH FROM CWS                               │
│     ├─ Navigate to extension page               │
│     ├─ Extract metadata                         │
│     ├─ Download CRX file                        │
│     └─ Parse manifest.json                      │
│                                                  │
│  3. VERSION DETECTION                            │
│     ├─ Check if version exists in database      │
│     ├─ Store new version                        │
│     └─ Create supply chain event                │
│                                                  │
│  4. DIFFERENTIAL ANALYSIS                        │
│     ├─ Compare with previous version            │
│     ├─ Calculate risk delta                     │
│     ├─ Detect permission changes                │
│     └─ Generate findings                        │
│                                                  │
│  5. ALERT USERS                                  │
│     ├─ Send WebSocket notification              │
│     ├─ Create supply chain event                │
│     └─ Update monitored extension               │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## API Endpoints

### Scrape Single Extension

```http
POST /api/cws/scrape
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "extensionId": "nmmhkkegccagdldgiimedpiccmgmieda"
}
```

**Response:**
```json
{
  "message": "Scrape started",
  "extensionId": "nmmhkkegccagdldgiimedpiccmgmieda"
}
```

### Batch Scrape

```http
POST /api/cws/scrape/batch
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "extensionIds": [
    "nmmhkkegccagdldgiimedpiccmgmieda",
    "cjpalhdlnbpafiamejdnhcphjbkeiagm"
  ]
}
```

**Response:**
```json
{
  "message": "Batch scrape started",
  "count": 2
}
```

### Get Extension Metadata

```http
GET /api/cws/metadata/nmmhkkegccagdldgiimedpiccmgmieda
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "metadata": {
    "id": "nmmhkkegccagdldgiimedpiccmgmieda",
    "extension_id": "nmmhkkegccagdldgiimedpiccmgmieda",
    "name": "uBlock Origin",
    "author": "Raymond Hill",
    "category": "Productivity",
    "rating": 4.8,
    "rating_count": 45123,
    "user_count": 10000000,
    "current_version": "1.52.0",
    "last_updated": "2024-08-19T12:00:00.000Z",
    "homepage_url": "https://github.com/gorhill/uBlock",
    "featured": true,
    "delisted": false,
    "last_scraped_at": "2024-08-20T10:30:00.000Z"
  }
}
```

### Get Version History

```http
GET /api/cws/versions/nmmhkkegccagdldgiimedpiccmgmieda?limit=20
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "extensionId": "nmmhkkegccagdldgiimedpiccmgmieda",
  "versions": [
    {
      "id": "version-id-1",
      "extension_id": "nmmhkkegccagdldgiimedpiccmgmieda",
      "version": "1.52.0",
      "name": "uBlock Origin",
      "permissions": ["storage", "webRequest"],
      "host_permissions": ["<all_urls>"],
      "release_date": "2024-08-19T12:00:00.000Z",
      "detected_at": "2024-08-19T12:05:00.000Z",
      "supply_chain_events": [
        {
          "event_type": "version_released",
          "severity": "info",
          "description": "New version 1.52.0 released"
        }
      ]
    }
  ],
  "count": 1
}
```

### Get Supply Chain Events

```http
GET /api/cws/events/nmmhkkegccagdldgiimedpiccmgmieda?limit=50
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "extensionId": "nmmhkkegccagdldgiimedpiccmgmieda",
  "events": [
    {
      "id": "event-id",
      "extension_id": "nmmhkkegccagdldgiimedpiccmgmieda",
      "extension_version_id": "version-id",
      "event_type": "version_released",
      "severity": "info",
      "description": "New version 1.52.0 released",
      "detected_at": "2024-08-19T12:00:00.000Z",
      "extension_version": {
        "version": "1.52.0",
        "name": "uBlock Origin"
      }
    }
  ],
  "count": 1
}
```

### Get All Supply Chain Events

```http
GET /api/cws/events?severity=high&limit=50
Authorization: Bearer <JWT_TOKEN>
```

### Get High-Risk Events

```http
GET /api/cws/events/high-risk?limit=20
Authorization: Bearer <JWT_TOKEN>
```

Returns only events with severity HIGH or CRITICAL.

### Scraper Statistics

```http
GET /api/cws/stats
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "stats": {
    "totalExtensions": 1523,
    "scrapedToday": 892,
    "staleExtensions": 156,
    "inProgress": 3
  }
}
```

### Scrape Monitored Extensions

```http
POST /api/cws/scrape/monitored
Authorization: Bearer <JWT_TOKEN>
```

Scrapes all extensions that users are monitoring.

### Scrape Stale Extensions

```http
POST /api/cws/scrape/stale
Authorization: Bearer <JWT_TOKEN>
```

Scrapes extensions not scraped in 24+ hours (max 100 per run).

### Search Extensions

```http
GET /api/cws/search?q=adblock&limit=20
Authorization: Bearer <JWT_TOKEN>
```

---

## Supply Chain Event Types

| Event Type | Description | Severity |
|------------|-------------|----------|
| `version_released` | New version published | INFO |
| `permission_added` | New permission requested | MEDIUM-CRITICAL |
| `permission_removed` | Permission dropped | LOW |
| `maintainer_changed` | Developer changed | HIGH |
| `ownership_transfer` | Extension ownership transferred | HIGH |
| `delisted` | Removed from store | CRITICAL |
| `reinstated` | Restored to store | MEDIUM |
| `malware_detected` | Confirmed malicious | CRITICAL |

---

## Scheduled Jobs

### Daily Scrape Job

Run every 24 hours to keep extension data fresh:

```typescript
// Schedule with cron or BullMQ
import { cwsScraper } from './services/cws-scraper';

// Every day at 2 AM
schedule('0 2 * * *', async () => {
  await cwsScraper.scrapeMonitoredExtensions();
  await cwsScraper.scrapeStaleExtensions();
});
```

### Real-time Monitoring

For high-priority extensions (featured, >1M users):

```typescript
// Check every hour
schedule('0 * * * *', async () => {
  const featured = await prisma.cWSMetadata.findMany({
    where: { featured: true },
    select: { extension_id: true }
  });
  
  await cwsScraper.scrapeBatch(featured.map(e => e.extension_id));
});
```

---

## Implementation Details

### Current Implementation (Mock)

The current implementation uses mock data for development. To scrape real CWS data:

### Real Implementation with Playwright

```typescript
import { chromium } from 'playwright';

async function scrapeExtension(extensionId: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // Navigate to extension page
    await page.goto(`https://chrome.google.com/webstore/detail/${extensionId}`);
    
    // Extract metadata
    const name = await page.locator('h1.e-f-w').textContent();
    const version = await page.locator('.C-b-p-D-Xe-h span').nth(1).textContent();
    const author = await page.locator('.e-f-Me').textContent();
    const rating = await page.locator('.rsw-stars').getAttribute('aria-label');
    const userCount = await page.locator('.e-f-ih').textContent();
    
    // Download CRX file
    const crxUrl = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=49.0&x=id%3D${extensionId}%26installsource%3Dondemand%26uc`;
    const crx = await page.context().request.get(crxUrl);
    
    // Parse CRX and extract manifest
    const manifest = await parseCRX(await crx.body());
    
    return {
      id: extensionId,
      name,
      version,
      author,
      rating: parseFloat(rating),
      user_count: parseUserCount(userCount),
      manifest,
      permissions: manifest.permissions || [],
      host_permissions: manifest.host_permissions || []
    };
  } finally {
    await browser.close();
  }
}
```

---

## Rate Limiting

To avoid being blocked by Google:

- **2 second delay** between requests
- **Max 50 extensions** per batch
- **User-Agent rotation**
- **Proxy rotation** (optional)
- **Exponential backoff** on errors

```typescript
// Built-in rate limiting
for (const extensionId of extensionIds) {
  await this.scrapeExtension(extensionId);
  await this.sleep(2000); // 2 second delay
}
```

---

## Data Storage

### CWSMetadata Table

Stores cached extension metadata:

```prisma
model CWSMetadata {
  id                   String    @id @default(cuid())
  extension_id         String    @unique
  name                 String
  author               String?
  current_version      String?
  user_count           Int?
  rating               Float?
  featured             Boolean   @default(false)
  delisted             Boolean   @default(false)
  last_scraped_at      DateTime
}
```

### ExtensionVersion Table

Stores version history:

```prisma
model ExtensionVersion {
  id               String   @id @default(cuid())
  extension_id     String
  version          String
  permissions      Json
  host_permissions Json
  manifest         Json
  detected_at      DateTime @default(now())
  
  @@unique([extension_id, version])
}
```

### SupplyChainEvent Table

Timeline of events:

```prisma
model SupplyChainEvent {
  id                   String   @id @default(cuid())
  extension_id         String
  extension_version_id String
  event_type           EventType
  severity             Severity
  description          String
  detected_at          DateTime @default(now())
}
```

---

## Integration with Other Systems

### Differential Analysis

When new version detected:

```typescript
const analysis = await differentialAnalyzer.analyzeVersionDiff(
  extensionId,
  oldVersionId,
  newVersionId
);

if (analysis.severity === 'high') {
  // Create supply chain event
  await prisma.supplyChainEvent.create({
    data: {
      extension_id: extensionId,
      event_type: 'permission_added',
      severity: analysis.severity,
      description: analysis.summary
    }
  });
}
```

### Threat Intelligence

Check new versions against threat database:

```typescript
const result = await threatIntel.checkExtension(extensionId);

if (result.isThreat) {
  // Alert all users monitoring this extension
  await alertMonitoringUsers(extensionId, result);
}
```

### WebSocket Alerts

Real-time notifications to users:

```typescript
wsManager.sendToUser(userId, {
  type: 'alert',
  extensionId,
  severity: 'high',
  message: 'Extension updated with new permissions',
  actionRequired: true
});
```

---

## Monitoring & Debugging

### View Scraper Stats

```bash
curl http://localhost:3001/api/cws/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Trigger Manual Scrape

```bash
curl -X POST http://localhost:3001/api/cws/scrape \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"extensionId":"nmmhkkegccagdldgiimedpiccmgmieda"}'
```

### Check Logs

```bash
# View scraping activity
grep "CWS scrape" /var/log/extension-guard/app.log

# View errors
grep "scrape failed" /var/log/extension-guard/app.log
```

---

## Performance Optimization

### Database Indexes

```sql
CREATE INDEX idx_cws_metadata_scraped ON "CWSMetadata"(last_scraped_at);
CREATE INDEX idx_extension_version_detected ON "ExtensionVersion"(extension_id, detected_at);
CREATE INDEX idx_supply_chain_events ON "SupplyChainEvent"(extension_id, detected_at);
```

### Caching

Cache frequently accessed extensions in Redis:

```typescript
const cached = await redis.get(`cws:${extensionId}`);
if (cached) return JSON.parse(cached);

const metadata = await scrapeExtension(extensionId);
await redis.setex(`cws:${extensionId}`, 3600, JSON.stringify(metadata));
```

---

## Future Enhancements

1. **Playwright Integration** - Real CWS scraping
2. **Screenshot Capture** - Visual change detection
3. **Code Diff** - Compare JavaScript between versions
4. **npm Dependency Tracking** - Monitor third-party packages
5. **Developer Verification** - Track maintainer identity
6. **Batch Processing** - Queue-based parallel scraping
7. **CDN Integration** - Cache CRX files for analysis

---

## Related Documentation

- [DIFFERENTIAL_ANALYSIS.md](./DIFFERENTIAL_ANALYSIS.md) - Version comparison
- [THREAT_INTELLIGENCE.md](./THREAT_INTELLIGENCE.md) - Threat detection
- [WEBSOCKET.md](./WEBSOCKET.md) - Real-time alerts
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Data models
