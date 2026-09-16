import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import bcrypt from 'bcrypt';
import { monitorRoutes } from '../../src/routes/monitor';
import { authRoutes } from '../../src/routes/auth';
import { prisma } from '../../src/utils/prisma';

describe('API Integration Tests', () => {
  let app: FastifyInstance;
  let authToken: string;
  let hashedPassword: string;

  beforeAll(async () => {
    hashedPassword = await bcrypt.hash('Test123!@#', 10);

    // Create test Fastify instance with plugins
    app = Fastify();
    await app.register(cors, { origin: true });
    await app.register(rateLimit, {
      max: 10,
      timeWindow: '1 minute',
    });
    await app.register(authRoutes);
    await app.register(monitorRoutes);

    app.get('/health', async () => ({ status: 'ok' }));

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    const mockUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      password_hash: hashedPassword,
      api_key: 'eg_test_api_key_123',
      created_at: new Date(),
      updated_at: new Date(),
      last_login_at: null,
    };

    (prisma.user.findUnique as any).mockImplementation(({ where }: any) => {
      if (where.email === 'test@example.com' || where.id === 'test-user-id' || where.api_key === 'eg_test_api_key_123') {
        return Promise.resolve(mockUser);
      }
      return Promise.resolve(null);
    });

    (prisma.user.create as any).mockResolvedValue(mockUser);

    (prisma.monitoredExtension.upsert as any).mockResolvedValue({
      id: 'monitored-1',
      user_id: 'test-user-id',
      extension_id: 'test-ext-1',
      extension_name: 'Test Extension',
      current_version: '1.0.0',
    });
  });

  describe('Authentication', () => {
    it('should register a new user', async () => {
      // First check returns null (user not found), so registration proceeds
      (prisma.user.findUnique as any).mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'newuser@example.com',
          password: 'Test123!@#',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.token).toBeDefined();
      expect(body.user.email).toBe('test@example.com');
    });

    it('should login with correct credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'Test123!@#',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.token).toBeDefined();
      authToken = body.token;
    });

    it('should reject login with wrong password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'test@example.com',
          password: 'WrongPassword',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject invalid email format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'invalid-email',
          password: 'Test123!@#',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject weak passwords', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'test2@example.com',
          password: '123',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Extension Monitoring', () => {
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/monitor/extensions',
        payload: {
          extensionId: 'test-ext-1',
          extensionName: 'Test Extension',
          currentVersion: '1.0.0',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should accept extension registration with valid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/monitor/extensions',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          extensionId: 'test-ext-1',
          extensionName: 'Test Extension',
          currentVersion: '1.0.0',
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('should validate extension data', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/monitor/extensions',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          extensionId: 'test-ext-2',
          // Missing required fields
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      // Send 15 requests from an isolated IP when max is 10
      const requests = Array(15).fill(null).map(() =>
        app.inject({
          method: 'POST',
          url: '/api/auth/login',
          remoteAddress: '192.168.1.99',
          payload: {
            email: 'test@example.com',
            password: 'Test123!@#',
          },
        })
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.some(r => r.statusCode === 429);

      expect(rateLimited).toBe(true);
    });
  });

  describe('CORS', () => {
    it('should include CORS headers', async () => {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/api/auth/login',
        headers: {
          origin: 'http://localhost:3000',
          'access-control-request-method': 'POST',
        },
      });

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 routes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return JSON errors', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          // Missing required fields
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });
  });
});
