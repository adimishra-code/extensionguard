# Differential Analysis Engine

Automatic detection of malicious or suspicious changes between extension versions.

## Overview

The differential analysis engine compares two versions of a browser extension to identify:
- New or removed permissions
- Manifest changes
- Risk score deltas
- Security regression or improvement

This is critical for detecting **supply chain attacks** where legitimate extensions are updated with malicious code.

---

## How It Works

### 1. Version Comparison

When a new version is detected:

```
Old Version (1.0.0)          New Version (1.1.0)
├─ permissions: ["storage"]  ├─ permissions: ["storage", "cookies", "<all_urls>"]
├─ host_permissions: []      ├─ host_permissions: ["*://*/*"]
└─ manifest: {...}           └─ manifest: {...}

                    ↓
            DIFFERENTIAL ANALYSIS
                    ↓

Results:
- Added permissions: ["cookies", "<all_urls>"]
- Added host_permissions: ["*://*/*"]
- Risk delta: +55 (HIGH)
- Severity: HIGH
- Alert user immediately
```

### 2. Risk Scoring

Risk delta ranges from **-100 to +100**:

| Change | Risk Impact |
|--------|-------------|
| Added dangerous permission (cookies, webRequest, etc.) | +25 per permission |
| Added `<all_urls>` or `*://*/*` | +30 |
| Added wildcard host permission | +15 |
| Added normal permission | +5 |
| Removed permission | -2 per permission |
| Weakened CSP | +20 |

### 3. Severity Classification

| Risk Delta | Severity | Action |
|------------|----------|--------|
| ≥50 | CRITICAL | Disable extension immediately |
| ≥25 | HIGH | Alert user, recommend review |
| ≥10 | MEDIUM | Notify user of changes |
| >0 | LOW | Log changes |
| ≤0 | INFO | No alert needed |

---

## API Endpoints

### Analyze Version Difference

```http
POST /api/differential/analyze
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "extensionId": "abc123...",
  "oldVersionId": "version-id-1",
  "newVersionId": "version-id-2"
}
```

**Response:**
```json
{
  "message": "Differential analysis completed",
  "analysis": {
    "extensionId": "abc123",
    "oldVersion": "1.0.0",
    "newVersion": "1.1.0",
    "permissionsAdded": ["cookies", "<all_urls>"],
    "permissionsRemoved": [],
    "hostPermissionsAdded": ["*://*/*"],
    "hostPermissionsRemoved": [],
    "manifestChanges": {
      "content_security_policy": {
        "old": "script-src 'self'",
        "new": "script-src 'self' 'unsafe-eval'"
      }
    },
    "riskDelta": 55,
    "severity": "high",
    "findingsAdded": 3,
    "findingsRemoved": 0,
    "summary": "Added 2 permission(s): cookies, <all_urls>. Added 1 host permission(s). Modified 1 manifest field(s). Risk increased by 55. Severity: high"
  }
}
```

### Get Analysis History

```http
GET /api/differential/history/abc123?limit=10
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "extensionId": "abc123",
  "history": [
    {
      "id": "analysis-id",
      "extension_id": "abc123",
      "old_version": "1.0.0",
      "new_version": "1.1.0",
      "risk_delta": 55,
      "severity": "high",
      "analysis_date": "2024-08-19T12:00:00.000Z"
    }
  ],
  "count": 1
}
```

### Get Specific Analysis

```http
GET /api/differential/analysis-id
Authorization: Bearer <JWT_TOKEN>
```

### Get Latest Analyses

```http
GET /api/differential/latest?limit=20&severity=high
Authorization: Bearer <JWT_TOKEN>
```

### Get High-Risk Updates

```http
GET /api/differential/high-risk?limit=10
Authorization: Bearer <JWT_TOKEN>
```

Returns only updates with:
- Severity: HIGH or CRITICAL
- Risk delta: ≥25

### Compare Latest Versions

Automatically compare the two most recent versions:

```http
POST /api/differential/compare-latest/abc123
Authorization: Bearer <JWT_TOKEN>
```

---

## Integration with Monitoring

When the monitoring extension detects an update:

```typescript
// Extension detects update
chrome.management.onInstalled.addListener(async (info) => {
  if (info.reason === 'update') {
    // Send to backend
    ws.send(JSON.stringify({
      type: 'extension_updated',
      extensionId: info.id,
      oldVersion: '1.0.0',
      newVersion: '1.1.0',
      timestamp: Date.now()
    }));
  }
});

// Backend processes event
async handleExtensionUpdated(event) {
  // Store new version in database
  await storeExtensionVersion(event);
  
  // Trigger differential analysis
  const analysis = await differentialAnalyzer.analyzeVersionDiff(
    event.extensionId,
    oldVersionId,
    newVersionId
  );
  
  // Alert user if high risk
  if (analysis.severity === 'high' || analysis.severity === 'critical') {
    wsManager.sendToClient(clientId, {
      type: 'alert',
      severity: analysis.severity,
      message: `Extension updated with dangerous permissions: ${analysis.permissionsAdded.join(', ')}`,
      actionRequired: true
    });
  }
}
```

---

## Dangerous Permissions List

These permissions trigger high risk scores:

| Permission | Risk Score | Why Dangerous |
|------------|------------|---------------|
| `cookies` | +25 | Access all browser cookies |
| `webRequest` | +25 | Monitor all network traffic |
| `webRequestBlocking` | +25 | Block/modify requests |
| `proxy` | +25 | Control proxy settings |
| `debugger` | +25 | Debug other extensions |
| `management` | +25 | Manage other extensions |
| `<all_urls>` | +30 | Access all websites |
| `*://*/*` | +30 | Access all HTTP/HTTPS sites |
| `browsingData` | +25 | Access browsing history |
| `tabCapture` | +25 | Capture tab content |

---

## Real-World Attack Examples

### Example 1: The Great Suspender Attack

**What happened:**
- Popular productivity extension (2M users)
- Sold to new developer
- Update added tracking code and data exfiltration

**Differential Analysis would detect:**
```json
{
  "permissionsAdded": ["cookies", "webRequest"],
  "hostPermissionsAdded": ["*://analytics.suspicious-domain.com/*"],
  "riskDelta": 55,
  "severity": "critical",
  "summary": "Added dangerous permissions and contacted suspicious domain"
}
```

### Example 2: Typosquatting Update

**What happened:**
- Legitimate extension "ColorPicker"
- Malicious "ColourPicker" created
- Users tricked into installing

**Differential Analysis would detect:**
- Different extension ID
- No version history
- Flag as potential typosquatting

---

## Algorithm Details

### Permission Risk Calculation

```typescript
function calculatePermissionRisk(permission: string): number {
  const dangerousPerms = {
    'cookies': 25,
    'webRequest': 25,
    'webRequestBlocking': 25,
    'proxy': 25,
    'debugger': 25,
    'management': 25,
    '<all_urls>': 30,
    '*://*/*': 30,
  };
  
  return dangerousPerms[permission] || 5;
}
```

### Host Permission Risk

```typescript
function calculateHostRisk(hostPermission: string): number {
  if (hostPermission === '<all_urls>') return 30;
  if (hostPermission.includes('*://*/*')) return 30;
  if (hostPermission.includes('*')) return 15;
  return 5;
}
```

### Manifest Change Detection

Tracks changes to:
- `content_security_policy` - Weakened CSP = +20 risk
- `update_url` - Changed update source
- `homepage_url` - Changed homepage
- `externally_connectable` - New external connections

---

## Database Schema

```prisma
model DifferentialAnalysis {
  id                       String   @id @default(cuid())
  extension_id             String
  old_version              String
  new_version              String
  permissions_added        Json
  permissions_removed      Json
  host_permissions_added   Json
  host_permissions_removed Json
  manifest_changes         Json
  risk_delta               Int
  severity                 Severity
  findings_added           Int
  findings_removed         Int
  analysis_date            DateTime @default(now())

  @@unique([extension_id, old_version, new_version])
  @@index([extension_id])
  @@index([severity])
}
```

---

## Future Enhancements

1. **Code Diff Analysis**
   - Compare actual JavaScript code between versions
   - Detect obfuscation changes
   - Identify new external API calls

2. **Machine Learning**
   - Train model on known malicious updates
   - Predict maliciousness probability
   - Anomaly detection

3. **Behavioral Analysis**
   - Compare runtime behavior between versions
   - Network traffic patterns
   - Storage access patterns

4. **Supply Chain Tracking**
   - Track developer/maintainer changes
   - Detect ownership transfers
   - Monitor npm dependency changes

---

## Testing

### Test Analysis

```bash
curl -X POST http://localhost:3001/api/differential/analyze \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "extensionId": "abc123",
    "oldVersionId": "version-1",
    "newVersionId": "version-2"
  }'
```

### View History

```bash
curl http://localhost:3001/api/differential/history/abc123 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get High-Risk Updates

```bash
curl http://localhost:3001/api/differential/high-risk \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Related Documentation

- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Database models
- [WEBSOCKET.md](./WEBSOCKET.md) - Real-time alerts
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System overview
