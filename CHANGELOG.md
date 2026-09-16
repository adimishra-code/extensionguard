# Changelog
All notable changes to Extension Guard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-17

### Added
- **Full-Stack Extension Security Platform**:
  - Manifest analysis engine (MV2 & MV3 compatibility, host permissions, CSP, content scripts)
  - Static AST and regex-based code analyzer for dangerous APIs and obfuscation
  - Playwright-based runtime sandbox for isolated dynamic behavior observation
  - Multi-dimensional risk scoring engine with confidence weighting
- **Differential Analysis & Supply Chain Security**:
  - Automated version comparison between Chrome Web Store releases
  - Permission escalation and host permission expansion detection
  - Supply chain event auditing and maintainer change tracking
- **Real-Time Extension Monitoring & WebSockets**:
  - Live monitoring dashboard with WebSocket streaming (`/ws` and `/monitor`)
  - Real-time event notifications and client session management
  - Network interception layer with domain categorization and anomaly analysis
- **Threat Intelligence & Community Reporting**:
  - Malicious domain, URL, and code pattern IOC matching
  - Community report submission and review workflow
- **Production Infrastructure**:
  - Multi-stage Dockerfiles for backend and frontend with non-root security practices
  - Docker Compose configuration with healthchecks, Postgres 15, Redis 7, and Nginx proxy
  - Nginx configuration with SPA routing and WebSocket upgrade support
  - Fastify rate limiting (global 100 req/min, scan upload 10 req/min)
  - Strict environment variable validation using Zod
  - JWT authentication with frontend Axios interceptor

### Changed
- Upgraded package versions across root, backend, frontend, and shared workspaces to 1.0.0
- Replaced mock health stats with real `/api/health/detailed` database and Redis metrics
- Cleaned up navigation icons and removed development labels in production views
- Refactored WebSocket connection handling for production reverse proxy compatibility

### Fixed
- Fixed Prisma schema relations for `Alert`, `NetworkLog`, and `SupplyChainEvent`
- Resolved all TypeScript strict null check and type safety errors across all packages
- Fixed all Vitest test suites (79 passing tests across all workspaces)
- Fixed ESLint warnings to achieve 0 errors and 0 warnings
- Fixed `monitor-extension` Vite web-extension build configuration
