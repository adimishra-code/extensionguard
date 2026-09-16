import { beforeAll, afterAll, vi } from 'vitest';

// Mock Prisma globally to avoid requiring a real DB connection in unit tests
vi.mock('../src/utils/prisma', () => ({
  prisma: {
    $disconnect: vi.fn(),
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    scan: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    extension: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      count: vi.fn(),
    },
    finding: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
    },
    threatIntelligence: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    extensionVersion: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    differentialAnalysis: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    monitoredExtension: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
    },
    monitorSession: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    alert: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    networkLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn().mockResolvedValue([]),
    },
  },
  connectDatabase: vi.fn(),
  disconnectDatabase: vi.fn(),
}));

beforeAll(() => {
  // Test env setup — no real DB needed for unit tests
});

afterAll(async () => {
  vi.restoreAllMocks();
});
