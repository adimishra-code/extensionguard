import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { monitorRoutes } from '../../src/routes/monitor';
import { authRoutes } from '../../src/routes/auth';

describe('API Integration Tests', () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    // Create test Fastify instance
    app = Fastify();
    await app.register(authRoutes);
    await app.register(monitorRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Authentication', () => {
    it('should register a new user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'Test123!@#',
        },
      });

      expect(response.statusCode).toBe(200);
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
        url: '/api/monitor/sync',
        payload: {
          extensions: [],
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should accept extension sync with valid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/monitor/sync',
        headers: {
          'x-api-key': authToken,
        },
        payload: {
          extensions: [
            {
              id: 'test-ext-1',
              name: 'Test Extension',
              version: '1.0.0',
              enabled: true,
              permissions: ['storage'],
              hostPermissions: [],
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should validate extension data', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/monitor/sync',
        headers: {
          'x-api-key': authToken,
        },
        payload: {
          extensions: [
            {
              id: 'test-ext-2',
              // Missing required fields
            },
          ],
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
      // Send many requests
      const requests = Array(101).fill(null).map(() =>
        app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: {
            email: 'test@example.com',
            password: 'Test123!@#',
          },
        })
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.some(r => r.statusCode === 429);

      // At least some should be rate limited
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
