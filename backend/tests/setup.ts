import { beforeAll, afterAll, afterEach } from 'vitest';
import { prisma } from '../src/utils/prisma';

// Setup test database
beforeAll(async () => {
  // Could initialize test database here
  console.log('Test suite starting...');
});

// Cleanup after each test
afterEach(async () => {
  // Clean up test data if needed
});

// Cleanup after all tests
afterAll(async () => {
  await prisma.$disconnect();
  console.log('Test suite completed.');
});
