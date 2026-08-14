# Extension Guard

**A comprehensive browser extension security analyzer** — Static analysis, runtime sandboxing, network monitoring, and LLM-powered risk assessment for Chrome/Edge/Firefox extensions.

---

## Overview

Extension Guard is a security platform designed to analyze browser extensions for privacy risks, malicious behavior, and supply chain vulnerabilities. It combines multiple analysis engines to provide a holistic risk profile for any extension.

### Why Extension Guard?

- **180,000+ Chrome extensions** — Most users install extensions without understanding their permissions or behavior
- **Supply chain attacks** — Compromised updates, malicious maintainers, typosquatting
- **Over-permissioned extensions** — Extensions requesting far more access than needed
- **Data exfiltration** — Silent tracking, fingerprinting, credential harvesting

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Extension Guard                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Frontend   │  │   Backend    │  │  Analyzers   │          │
│  │  (React+TS)  │  │  (Fastify)   │  │  (Python/TS) │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └─────────────────┼─────────────────┘                   │
│                           ▼                                     │
│              ┌────────────────────────┐                         │
│              │      Shared Types      │                         │
│              │   (@extension-guard/   │                         │
│              │       shared)          │                         │
│              └────────────────────────┘                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS | Dashboard, scan management, report visualization |
| **Backend** | Fastify, TypeScript, Prisma, BullMQ | API server, job queue, scan orchestration |
| **Static Analyzer** | Python (AST + regex) | Permission mapping, dangerous API detection, obfuscation |
| **Runtime Sandbox** | Playwright + Chrome DevTools Protocol | Dynamic analysis in isolated browser contexts |
| **Network Monitor** | DevTools Protocol interception | Request/response capture, third-party tracking detection |
| **LLM Analyzer** | Pluggable (OpenAI, Anthropic, local) | Behavioral reasoning, purpose mismatch detection |

---

## Features

### Static Analysis
- **Manifest parsing** — MV2/MV3, permissions, host permissions, CSP, content scripts
- **Dangerous API detection** — 50+ Chrome APIs mapped to risk categories
- **Obfuscation detection** — eval, Function constructor, hex/unicode encoding, base64, string arrays
- **Suspicious URL detection** — Tracking domains, suspicious TLDs, IP addresses, fingerprinting endpoints
- **Permission risk scoring** — Cross-references declared permissions with actual code usage

### Runtime Analysis (Sandbox)
- **Isolated browser contexts** — Fresh profiles per scan, no cross-contamination
- **Behavioral observation** — Network requests, DOM mutations, storage access, API calls
- **CSP bypass detection** — Inline script injection, eval in content scripts
- **Resource timing** — Performance metrics, long-running scripts

### Network Monitoring
- **Full request/response capture** — Headers, bodies, timing
- **Third-party classification** — First-party, tracking, analytics, CDN, API, suspicious
- **Data exfiltration patterns** — Large payloads, credential fields, fingerprinting vectors
- **Cookie/Storage tracking** — Read/write operations, sync behavior

### LLM-Powered Assessment
- **Purpose mismatch** — Compares declared functionality vs actual behavior
- **Privacy policy analysis** — Cross-references policy claims with observed data flows
- **Supply chain reasoning** — Dependency risk, maintainer reputation, update patterns
- **Uncertainty quantification** — Explicit confidence levels, limitation acknowledgment

---

## Quick Start

### Prerequisites
- Node.js 20+
- Python 3.11+
- Redis (for BullMQ)
- PostgreSQL (via Prisma)

### Installation

```bash
# Clone and install
git clone https://github.com/adimishra-code/extensionguard.git
cd extensionguard

# Install all workspaces
npm install

# Generate Prisma client
npm run db:generate --workspace=backend

# Run migrations
npm run db:migrate --workspace=backend

# Seed database (optional)
npm run db:seed --workspace=backend
```

### Development

```bash
# Start all services (frontend + backend)
npm run dev

# Or individually:
npm run dev:frontend   # http://localhost:5173
npm run dev:backend    # http://localhost:3000
```

### Environment Variables

Create `.env` in `backend/`:

```env
DATABASE_URL="postgresql://user:pass@localhost:5432/extension_guard"
REDIS_URL="redis://localhost:6379"
PORT=3000
NODE_ENV=development

# Optional: LLM providers
OPENAI_API_KEY=""
ANTHROPIC_API_KEY=""
```

---

## Usage

### Web UI
1. Open `http://localhost:5173`
2. Click "New Scan"
3. Choose scan type:
   - **Quick** — Static only (~30s)
   - **Deep** — Static + network (~2min)
   - **Sandbox** — Full runtime (~5min)
   - **Full** — All analyzers + LLM (~10min)
4. Upload `.crx`/`.zip` or paste Chrome Web Store URL
5. View real-time progress and final report

### API

```bash
# Create scan
curl -X POST http://localhost:3000/api/scans \
  -H "Content-Type: application/json" \
  -d '{"extensionId": "abc123", "type": "deep", "source": "upload"}'

# Get report
curl http://localhost:3000/api/scans/{scanId}/report

# List scans
curl http://localhost:3000/api/scans
```

---

## Scan Types

| Type | Analyzers | Duration | Use Case |
|------|-----------|----------|----------|
| **Quick** | Manifest + Static | ~30s | CI/CD gate, PR checks |
| **Deep** | Quick + Network + Data Flow | ~2min | Pre-release audit |
| **Sandbox** | Deep + Runtime | ~5min | High-value targets |
| **Full** | All + LLM | ~10min | Comprehensive audit |

---

## Risk Scoring

Each scan produces a **0-100 risk score** with breakdown:

| Category | Weight | Description |
|----------|--------|-------------|
| Permission Risk | 20% | Over-permissioned, unused permissions |
| Code Risk | 20% | Dangerous APIs, obfuscation, RCE vectors |
| Data Access | 15% | Cookie/storage/clipboard access |
| Exfiltration | 15% | Network patterns, suspicious domains |
| Network | 10% | Third-party requests, tracking |
| Obfuscation | 10% | Encoding, packing, anti-analysis |
| Dependencies | 5% | Vulnerable/abandoned packages |
| Purpose Mismatch | 5% | Behavior vs. claimed functionality |

### Severity Levels
- **Critical** — Active exploitation, credential theft, RCE
- **High** — Data exfiltration, broad permissions, tracking
- **Medium** — Unused permissions, suspicious patterns
- **Low** — Minor hygiene issues, deprecated APIs
- **Info** — Informational, best practice suggestions

---

## Project Structure

```
extension-guard/
├── analyzer/                 # Python static analyzer
│   └── scripts/
│       └── static_analyzer.py
├── backend/                  # Fastify API server
│   ├── prisma/
│   │   └── schema.prisma
│   └── src/
│       ├── config/
│       ├── queue/
│       ├── routes/
│       ├── services/
│       └── utils/
├── frontend/                 # React dashboard
│   ├── public/
│   └── src/
│       ├── components/
│       ├── lib/
│       ├── pages/
│       └── routes/
├── shared/                   # Shared TypeScript types
│   └── src/
│       ├── domain.ts
│       └── index.ts
├── docker/
├── docs/
├── rules/
├── scripts/
└── tests/
```

---

## Extending

### Custom Rules
Add detection rules in `rules/`:
```typescript
// rules/my-custom-rule.ts
export const myRule: Rule = {
  id: 'my-rule',
  name: 'Custom Detection',
  category: 'custom',
  severity: 'high',
  match: (code: string) => /suspicious-pattern/.test(code),
};
```

### Custom LLM Prompts
Modify `backend/src/services/llm-analyzer.ts`:
```typescript
const customPrompt = `
Analyze this extension for [specific concern]...
Extension: {{name}}
Findings: {{findings}}
Network: {{network}}
`;
```

---

## Security Considerations

- **Sandbox isolation** — Each scan runs in disposable browser profile
- **No persistent storage** — Uploaded extensions deleted after scan
- **Rate limiting** — API protected against abuse
- **Input validation** — Zod schemas on all endpoints
- **Dependency scanning** — `npm audit` in CI

---

## Contributing

```bash
# Fork, branch, commit
git checkout -b feature/my-feature
npm run lint
npm run test
git push origin feature/my-feature
# Open PR
```

### Code Style
- TypeScript strict mode
- ESLint + Prettier
- Conventional commits
- 100% type coverage on shared types

---

## License

MIT License — See [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [Chrome Extensions Documentation](https://developer.chrome.com/docs/extensions/)
- [Playwright](https://playwright.dev/) for browser automation
- [Fastify](https://www.fastify.io/) for the API framework
- [Prisma](https://www.prisma.io/) for database ORM
- [BullMQ](https://bullmq.io/) for job queues
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [Vitest](https://vitest.dev/) for testing

---

## Support

- **Issues**: [GitHub Issues](https://github.com/adimishra-code/extensionguard/issues)
- **Discussions**: [GitHub Discussions](https://github.com/adimishra-code/extensionguard/discussions)
- **Security**: Report vulnerabilities to security@extensionguard.dev

---

<div align="center">

**Built with ❤️ for a safer extension ecosystem**

</div>