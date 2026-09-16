# Extension Guard Test Suite

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Specific Test File
```bash
npm test risk-analyzer
```

---

## Test Structure

```
backend/tests/
├── setup.ts                           # Test configuration
├── unit/                              # Unit tests
│   ├── risk-analyzer.test.ts         # Risk scoring logic
│   ├── differential-analyzer.test.ts  # Version comparison
│   ├── threat-intelligence.test.ts    # Threat detection
│   └── network-monitor.test.ts        # Network tracking
└── integration/                       # Integration tests
    └── api.test.ts                    # API endpoints
```

---

## Test Coverage

Our test suite covers:

### Core Services (Unit Tests)
- ✅ Risk Analyzer - Permission and risk scoring
- ✅ Differential Analyzer - Version comparison logic
- ✅ Threat Intelligence - Threat detection and reporting
- ✅ Network Monitor - Activity tracking and analysis

### API Endpoints (Integration Tests)
- ✅ Authentication (register, login, JWT)
- ✅ Extension monitoring (sync, updates)
- ✅ Rate limiting
- ✅ CORS headers
- ✅ Error handling

---

## Writing New Tests

### Unit Test Template

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('MyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should do something', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = myFunction(input);
    
    // Assert
    expect(result).toBe('expected');
  });
});
```

### Integration Test Template

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

describe('API Integration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    // Register routes
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should respond to request', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/endpoint',
    });

    expect(response.statusCode).toBe(200);
  });
});
```

---

## Mocking

### Mock Prisma

```typescript
vi.mock('../../src/utils/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));
```

### Mock External Services

```typescript
vi.mock('../../src/services/threat-intelligence', () => ({
  threatIntel: {
    checkExtension: vi.fn().mockResolvedValue({ isThreat: false }),
  },
}));
```

---

## Test Guidelines

### DO:
- ✅ Write descriptive test names
- ✅ Test both success and error cases
- ✅ Mock external dependencies
- ✅ Clean up after tests
- ✅ Test edge cases
- ✅ Keep tests independent

### DON'T:
- ❌ Test implementation details
- ❌ Write tests that depend on each other
- ❌ Use real database in unit tests
- ❌ Skip error cases
- ❌ Write tests without assertions

---

## CI/CD Integration

Add to `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: cd backend && npm install
      
      - name: Run tests
        run: cd backend && npm test
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./backend/coverage/coverage-final.json
```

---

## Coverage Goals

Target coverage: **80%+**

Current coverage:
- Statements: Run `npm run test:coverage` to see
- Branches: Run `npm run test:coverage` to see
- Functions: Run `npm run test:coverage` to see
- Lines: Run `npm run test:coverage` to see

---

## Debugging Tests

### Run Single Test
```bash
npm test -- -t "should calculate low risk"
```

### Debug with VS Code
Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Tests",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["test"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

---

## Common Issues

### Tests timing out
Increase timeout in vitest.config.ts:
```typescript
test: {
  testTimeout: 10000,
}
```

### Prisma mocking not working
Ensure mock is before imports:
```typescript
vi.mock('./prisma', () => ({ ... }));
import { myFunction } from './file';
```

### Database errors
Use test database or mock Prisma completely

---

## Next Steps

1. Add E2E tests with Playwright
2. Add performance tests
3. Add security tests (OWASP)
4. Increase coverage to 90%+
5. Add mutation testing
