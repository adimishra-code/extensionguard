# Threat Intelligence System

Community-driven threat database and pattern matching engine for Extension Guard.

## Overview

The threat intelligence system provides:
- **Known Malicious Extensions Database** - Track confirmed threats
- **Malicious Domain Tracking** - Block known bad domains
- **Code Pattern Detection** - Regex-based malware signatures
- **Community Reporting** - Crowdsourced threat discovery
- **Verification Workflow** - Admin review and validation

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│           Threat Intelligence System            │
├─────────────────────────────────────────────────┤
│                                                 │
│  INPUT SOURCES                                  │
│  ├─ Community Reports (Crowdsourced)            │
│  ├─ Automated Scans (Pattern Matching)         │
│  ├─ External Feeds (Vendor Intelligence)       │
│  └─ Manual Additions (Security Researchers)    │
│                                                 │
│  THREAT DATABASE                                │
│  ├─ Malicious Extensions                       │
│  ├─ Dangerous Domains                          │
│  ├─ Code Patterns (Regex)                      │
│  ├─ Compromised Maintainers                    │
│  └─ Supply Chain Attacks                       │
│                                                 │
│  VERIFICATION                                   │
│  ├─ Pending Queue                              │
│  ├─ Admin Review                               │
│  ├─ Confidence Scoring                         │
│  └─ False Positive Handling                    │
│                                                 │
│  OUTPUT                                         │
│  ├─ Real-time Alerts                           │
│  ├─ API Queries                                │
│  └─ WebSocket Notifications                    │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Threat Types

### 1. Malicious Extensions

Complete extensions confirmed as threats:

```json
{
  "type": "extension",
  "extension_id": "abc123...",
  "severity": "critical",
  "description": "Data exfiltration extension masquerading as ad blocker",
  "confidence": 1.0,
  "metadata": {
    "iocs": ["tracking.evil.com", "collector.malware.net"],
    "behavior": "steals cookies and passwords"
  }
}
```

### 2. Malicious Domains

Known bad domains contacted by extensions:

```json
{
  "type": "domain",
  "domain": "tracking.evil.com",
  "severity": "high",
  "description": "Command & control server for extension malware",
  "confidence": 0.95
}
```

### 3. Code Patterns

Regex patterns matching malicious code:

```json
{
  "type": "code_pattern",
  "pattern": "eval\\(atob\\(['\"]([A-Za-z0-9+/=]+)['\"]\\)\\)",
  "severity": "high",
  "description": "Obfuscated code execution via base64 eval",
  "confidence": 0.85
}
```

### 4. Compromised Maintainers

Developer accounts known to be compromised:

```json
{
  "type": "maintainer",
  "description": "Developer account compromised, injected malware into popular extension",
  "severity": "critical",
  "confidence": 1.0,
  "metadata": {
    "developer_email": "compromised@example.com",
    "affected_extensions": ["ext1", "ext2"]
  }
}
```

### 5. Supply Chain Attacks

Known supply chain compromise patterns:

```json
{
  "type": "supply_chain",
  "description": "Malicious npm package bundled into extension",
  "severity": "critical",
  "confidence": 0.9,
  "metadata": {
    "package_name": "malicious-package",
    "affected_versions": ["1.2.0", "1.2.1"]
  }
}
```

---

## API Endpoints

### Check Extension

```http
POST /api/threats/check/extension
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "extensionId": "abc123..."
}
```

**Response:**
```json
{
  "extensionId": "abc123",
  "isThreat": true,
  "threats": [
    {
      "id": "threat-id",
      "type": "extension",
      "severity": "critical",
      "description": "Known malware",
      "confidence": 1.0,
      "reported_at": "2024-08-19T12:00:00.000Z"
    }
  ],
  "severity": "critical",
  "confidence": 1.0
}
```

### Check Domain

```http
POST /api/threats/check/domain
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "domain": "tracking.evil.com"
}
```

**Response:**
```json
{
  "domain": "tracking.evil.com",
  "isThreat": true,
  "threats": [...],
  "severity": "high",
  "confidence": 0.95
}
```

### Get All Threats

```http
GET /api/threats?type=extension&severity=critical&limit=50
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "threats": [
    {
      "id": "threat-id",
      "extension_id": "abc123",
      "type": "extension",
      "severity": "critical",
      "description": "...",
      "confidence": 1.0,
      "active": true,
      "verified_at": "2024-08-19T12:00:00.000Z"
    }
  ],
  "count": 1
}
```

### Add Threat (Admin)

```http
POST /api/threats
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "extensionId": "abc123",
  "type": "extension",
  "severity": "critical",
  "description": "Confirmed malware",
  "source": "manual",
  "confidence": 1.0,
  "metadata": {
    "iocs": ["evil.com"]
  }
}
```

### Verify Threat (Admin)

```http
POST /api/threats/:threatId/verify
Authorization: Bearer <JWT_TOKEN>
```

Marks threat as verified and sets confidence to 100%.

### Mark False Positive

```http
POST /api/threats/:threatId/false-positive
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "reason": "Extension is legitimate, false alarm"
}
```

---

## Community Reporting

### Submit Report

```http
POST /api/threats/report
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "extensionId": "abc123",
  "extensionName": "Suspicious Extension",
  "extensionVersion": "1.2.0",
  "reportType": "malicious",
  "description": "This extension is stealing my cookies and sending them to evil.com",
  "evidence": {
    "networkTraffic": ["evil.com", "tracker.com"],
    "screenshots": ["screenshot1.png"]
  }
}
```

**Report Types:**
- `malicious` - Confirmed malicious behavior
- `data_theft` - Stealing user data
- `privacy_violation` - Tracking without consent
- `suspicious` - Unusual behavior
- `annoying` - Spammy/adware

**Response:**
```json
{
  "message": "Report submitted successfully",
  "report": {
    "id": "report-id",
    "status": "pending",
    "reported_at": "2024-08-19T12:00:00.000Z"
  }
}
```

### Get My Reports

```http
GET /api/threats/reports/my
Authorization: Bearer <JWT_TOKEN>
```

### Get Pending Reports (Admin)

```http
GET /api/threats/reports/pending?limit=20
Authorization: Bearer <JWT_TOKEN>
```

### Review Report (Admin)

```http
POST /api/threats/reports/:reportId/review
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "action": "verify",
  "notes": "Confirmed malicious after investigation"
}
```

Actions: `verify` or `reject`

When verified, automatically creates a threat intelligence entry.

---

## Confidence Scoring

Threats have confidence scores (0.0 - 1.0):

| Source | Base Confidence |
|--------|----------------|
| Verified by admin | 1.0 (100%) |
| Automated detection | 0.8-0.9 |
| Community report | 0.7 |
| External feed | 0.6-0.8 |
| Unverified pattern | 0.5 |

**Confidence increases when:**
- Multiple independent reports
- Verified by security researcher
- Confirmed by automated scan

---

## Integration Examples

### Monitor Processor Integration

```typescript
// Check extension when installed
async handleExtensionInstalled(event) {
  const result = await threatIntel.checkExtension(event.extensionId);
  
  if (result.isThreat && result.severity === 'critical') {
    // Immediate alert
    wsManager.sendToClient(clientId, {
      type: 'alert',
      severity: 'critical',
      message: `DANGER: Known malware detected! ${result.threats[0].description}`,
      actionRequired: true,
      extensionId: event.extensionId
    });
  }
}
```

### Network Request Monitoring

```typescript
// Check domain on network request
async handleNetworkRequest(event) {
  const url = new URL(event.url);
  const result = await threatIntel.checkDomain(url.hostname);
  
  if (result.isThreat) {
    // Alert user
    wsManager.sendToClient(clientId, {
      type: 'alert',
      severity: result.severity,
      message: `Extension contacted known malicious domain: ${url.hostname}`,
      extensionId: event.extensionId
    });
  }
}
```

### Code Scanning

```typescript
// Check code patterns during scan
async scanExtensionCode(code: string) {
  const result = await threatIntel.checkCodePattern(code);
  
  if (result.isThreat) {
    // Add finding
    findings.push({
      category: 'supply_chain',
      severity: result.severity,
      title: 'Malicious code pattern detected',
      description: result.threats[0].description,
      confidence: result.confidence
    });
  }
}
```

---

## Threat Database Seeding

### Known Malicious Extensions

Add known threats from public sources:

```typescript
await threatIntel.bulkImportThreats([
  {
    extensionId: 'great-suspender-id',
    type: 'extension',
    severity: 'critical',
    description: 'The Great Suspender - Compromised in 2020, injected tracking code',
    confidence: 1.0,
    metadata: {
      incident_date: '2020-10',
      source: 'https://github.com/greatsuspender/thegreatsuspender/issues/1175'
    }
  },
  // More threats...
], 'public_incidents');
```

### Malicious Domains

```typescript
await threatIntel.bulkImportThreats([
  {
    domain: 'tracking.evil.com',
    type: 'domain',
    severity: 'high',
    description: 'Command & control server',
    confidence: 0.95
  },
  {
    domain: 'malware-cdn.xyz',
    type: 'domain',
    severity: 'critical',
    description: 'Hosts malicious extension updates',
    confidence: 1.0
  }
], 'threat_feed');
```

### Code Patterns

```typescript
await threatIntel.addThreat({
  type: 'code_pattern',
  pattern: 'eval\\(atob\\(',
  severity: 'high',
  description: 'Base64 encoded eval - commonly used for obfuscation',
  source: 'automated',
  confidence: 0.85
});

await threatIntel.addThreat({
  type: 'code_pattern',
  pattern: 'document\\.cookie',
  severity: 'medium',
  description: 'Direct cookie access - potential data theft',
  source: 'automated',
  confidence: 0.7
});
```

---

## Statistics

### Get Threat Stats

```http
GET /api/threats/stats
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "stats": {
    "totalThreats": 1523,
    "activeThreats": 892,
    "criticalThreats": 156,
    "pendingReports": 23
  }
}
```

---

## Security Considerations

### False Positives

- Users can report false positives
- Admin review required for high-impact threats
- Confidence scoring helps filter noise

### Privacy

- Community reports are anonymized in public view
- Evidence is sanitized before storage
- PII is redacted from threat descriptions

### Abuse Prevention

- Rate limit report submissions (5 per hour per user)
- Require minimum account age for reporting
- Track reporter accuracy score
- Ban users who submit spam reports

---

## Future Enhancements

1. **Machine Learning**
   - Train model on known threats
   - Predict maliciousness from behavior
   - Automated threat classification

2. **External Feeds**
   - Integrate VirusTotal
   - Import from security vendors
   - Cross-reference with CVE database

3. **Reputation System**
   - Track reporter accuracy
   - Reward quality reports
   - Community voting on threats

4. **Real-time Sync**
   - Subscribe to threat updates
   - Instant notifications on new threats
   - Automatic extension blocking

---

## Testing

### Check Extension

```bash
curl -X POST http://localhost:3001/api/threats/check/extension \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"extensionId":"abc123"}'
```

### Submit Report

```bash
curl -X POST http://localhost:3001/api/threats/report \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "extensionId":"abc123",
    "extensionName":"Test Extension",
    "reportType":"suspicious",
    "description":"This extension seems to be tracking my browsing"
  }'
```

---

## Related Documentation

- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Threat intelligence models
- [WEBSOCKET.md](./WEBSOCKET.md) - Real-time threat alerts
- [DIFFERENTIAL_ANALYSIS.md](./DIFFERENTIAL_ANALYSIS.md) - Supply chain detection
