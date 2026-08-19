# Extension Guard v2.0 - Database Schema Documentation

## Overview

This document describes the database schema extensions for Extension Guard v2.0, which adds real-time monitoring and supply chain tracking capabilities.

---

## New Models

### User
Stores user accounts for authentication and authorization.

| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| email | String | User email (unique) |
| password_hash | String | Bcrypt hashed password |
| api_key | String | API key for extension authentication |
| created_at | DateTime | Account creation timestamp |
| updated_at | DateTime | Last update timestamp |
| last_login_at | DateTime? | Last login timestamp |

**Relations:**
- `sessions` - MonitorSession[] (active WebSocket connections)
- `community_reports` - CommunityReport[] (user's threat reports)

---

### MonitorSession
Tracks active WebSocket connections from monitoring extensions.

| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| user_id | String | Foreign key to User |
| client_id | String | Unique client identifier (from extension) |
| user_agent | String | Browser user agent |
| ip_address | String? | Client IP address |
| connected_at | DateTime | Connection start time |
| last_heartbeat | DateTime | Last ping received |
| disconnected_at | DateTime? | Disconnect time (null if active) |

**Indexes:**
- user_id, client_id, connected_at

---

### ExtensionVersion
Tracks historical versions of extensions from Chrome Web Store.

| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| extension_id | String | Chrome Web Store extension ID |
| version | String | Version number (e.g., "1.2.3") |
| name | String | Extension name |
| description | String? | Extension description |
| permissions | Json | Array of Chrome permissions |
| host_permissions | Json | Array of host permissions |
| manifest | Json | Full manifest.json |
| release_date | DateTime? | Official release date from CWS |
| detected_at | DateTime | When we first detected this version |
| scan_id | String? | Link to Scan if performed |
| diff_from_previous | Json? | Differential analysis results |

**Unique Constraint:** (extension_id, version)

**Indexes:**
- extension_id, release_date, detected_at

**Relations:**
- `scan` - Scan? (optional scan results)
- `supply_chain_events` - SupplyChainEvent[]

---

### SupplyChainEvent
Records significant events in an extension's lifecycle.

| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| extension_version_id | String | Foreign key to ExtensionVersion |
| extension_id | String | Denormalized for fast querying |
| event_type | EventType | Type of event (enum) |
| severity | Severity | Event severity |
| description | String | Human-readable description |
| metadata | Json? | Additional event data |
| detected_at | DateTime | Event detection time |

**EventType Enum:**
- `version_released` - New version published
- `permission_added` - New permission requested
- `permission_removed` - Permission dropped
- `maintainer_changed` - Developer changed
- `ownership_transfer` - Extension ownership transferred
- `delisted` - Removed from store
- `reinstated` - Restored to store
- `malware_detected` - Confirmed malicious

**Indexes:**
- extension_id, event_type, severity, detected_at

---

### ThreatIntelligence
Database of known threats and malicious patterns.

| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| extension_id | String? | Specific extension (if applicable) |
| pattern | String? | Malicious code pattern (regex) |
| domain | String? | Malicious domain |
| type | ThreatType | Threat category |
| severity | Severity | Threat severity |
| description | String | Threat description |
| source | String | Source ('community', 'automated', 'verified', 'vendor') |
| confidence | Float | 0.0 - 1.0 confidence score |
| reported_at | DateTime | Initial report time |
| verified_at | DateTime? | Verification time |
| verified_by | String? | Verifier identifier |
| metadata | Json? | IOCs, additional context |
| active | Boolean | Is threat currently active |
| false_positive | Boolean | Marked as false positive |

**ThreatType Enum:**
- `extension` - Entire extension is malicious
- `domain` - Malicious domain
- `code_pattern` - Dangerous code pattern
- `maintainer` - Compromised developer
- `supply_chain` - Supply chain attack

**Indexes:**
- extension_id, type, severity, active, domain

---

### CommunityReport
User-submitted threat reports.

| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| user_id | String | Foreign key to User |
| extension_id | String | Reported extension ID |
| extension_name | String | Extension name |
| extension_version | String? | Specific version |
| report_type | String | Type of threat |
| description | String | User's description |
| evidence | Json? | Screenshots, logs, etc. |
| status | ReportStatus | Report status |
| reported_at | DateTime | Report submission time |
| reviewed_at | DateTime? | Review time |
| reviewed_by | String? | Reviewer identifier |
| review_notes | String? | Reviewer comments |
| threat_intel_id | String? | Link to ThreatIntelligence if verified |

**ReportStatus Enum:**
- `pending` - Awaiting review
- `verified` - Confirmed threat
- `rejected` - Not a threat
- `investigating` - Under investigation

**Indexes:**
- extension_id, status, user_id, reported_at

---

### MonitoringEvent
Real-time events from monitoring extensions.

| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| session_id | String | MonitorSession.client_id |
| extension_id | String | Extension being monitored |
| event_type | String | Event type |
| data | Json | Event data |
| timestamp | DateTime | Event time |

**Event Types:**
- `network_request` - Extension made network call
- `permission_change` - Permissions changed
- `storage_access` - Accessed storage
- `extension_installed` - New extension installed
- `extension_updated` - Extension updated
- `extension_removed` - Extension uninstalled

**Indexes:**
- session_id, extension_id, timestamp, event_type

**Note:** For high-volume deployments, consider using a time-series database (InfluxDB, TimescaleDB) instead.

---

### CWSMetadata
Cached Chrome Web Store metadata.

| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| extension_id | String | Chrome Web Store ID (unique) |
| name | String | Extension name |
| author | String? | Developer name |
| author_email | String? | Developer email |
| category | String? | CWS category |
| rating | Float? | Average rating |
| rating_count | Int? | Number of ratings |
| user_count | Int? | Number of users |
| current_version | String? | Latest version |
| last_updated | DateTime? | Last CWS update |
| homepage_url | String? | Homepage URL |
| support_url | String? | Support URL |
| privacy_policy_url | String? | Privacy policy URL |
| featured | Boolean | Is featured on CWS |
| delisted | Boolean | Removed from CWS |
| metadata | Json? | Raw CWS data |
| last_scraped_at | DateTime | Last scrape time |
| created_at | DateTime | First scrape time |

**Indexes:**
- extension_id, last_scraped_at, delisted

---

### DifferentialAnalysis
Comparison between extension versions.

| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| extension_id | String | Extension ID |
| old_version | String | Previous version |
| new_version | String | New version |
| permissions_added | Json | Array of added permissions |
| permissions_removed | Json | Array of removed permissions |
| host_permissions_added | Json | Added host permissions |
| host_permissions_removed | Json | Removed host permissions |
| manifest_changes | Json | Key manifest changes |
| code_changes_summary | String? | Summary of code changes |
| risk_delta | Int | Change in risk score (-100 to +100) |
| severity | Severity | Overall change severity |
| findings_added | Int | New findings count |
| findings_removed | Int | Resolved findings count |
| findings_comparison | Json? | Detailed findings diff |
| analysis_date | DateTime | Analysis timestamp |

**Unique Constraint:** (extension_id, old_version, new_version)

**Indexes:**
- extension_id, severity, analysis_date

---

### MonitoredExtension
Registry of extensions users are tracking.

| Field | Type | Description |
|-------|------|-------------|
| id | String (CUID) | Primary key |
| user_id | String | Foreign key to User |
| extension_id | String | Extension to monitor |
| extension_name | String | Extension name |
| current_version | String | Current tracked version |
| auto_scan | Boolean | Auto-scan on update |
| alert_on_update | Boolean | Alert on new version |
| alert_threshold | Severity | Minimum severity for alerts |
| added_at | DateTime | When monitoring started |
| last_checked_at | DateTime | Last check time |

**Unique Constraint:** (user_id, extension_id)

**Indexes:**
- user_id, extension_id, last_checked_at

---

## Migration Guide

### Step 1: Generate Migration

```bash
cd backend
npx prisma migrate dev --name add_monitoring_supply_chain
```

### Step 2: Apply Migration

```bash
npx prisma migrate deploy
```

### Step 3: Generate Client

```bash
npx prisma generate
```

### Step 4: Seed Data (Optional)

```bash
npm run db:seed
```

---

## Query Examples

### Get Extension Version History

```typescript
const versions = await prisma.extensionVersion.findMany({
  where: { extension_id: 'nmmhkkegccagdldgiimedpiccmgmieda' },
  orderBy: { detected_at: 'desc' },
  include: {
    scan: true,
    supply_chain_events: true,
  },
});
```

### Find High-Risk Updates

```typescript
const riskyUpdates = await prisma.differentialAnalysis.findMany({
  where: {
    severity: { in: ['high', 'critical'] },
    risk_delta: { gt: 20 },
  },
  orderBy: { analysis_date: 'desc' },
  take: 10,
});
```

### Get Active Threats

```typescript
const threats = await prisma.threatIntelligence.findMany({
  where: {
    active: true,
    severity: { in: ['high', 'critical'] },
  },
  orderBy: { confidence: 'desc' },
});
```

### Get User's Monitored Extensions

```typescript
const monitored = await prisma.monitoredExtension.findMany({
  where: { user_id: userId },
  orderBy: { last_checked_at: 'desc' },
});
```

---

## Performance Considerations

1. **Indexes:** All foreign keys and frequently queried fields are indexed
2. **Partitioning:** Consider partitioning MonitoringEvent by timestamp for large datasets
3. **Time-series:** For high-volume monitoring, use TimescaleDB or InfluxDB
4. **Archival:** Archive old MonitoringEvents (>30 days) to separate table
5. **Caching:** Cache CWSMetadata in Redis with 1-hour TTL

---

## Security Considerations

1. **API Keys:** Never log or expose api_key field
2. **Password Hashes:** Always use bcrypt with salt rounds >= 10
3. **PII:** ip_address and email are PII - handle per GDPR
4. **Evidence:** Sanitize uploaded evidence JSON to prevent XSS
5. **Rate Limiting:** Limit CommunityReport creation to prevent spam
