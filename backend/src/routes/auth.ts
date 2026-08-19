import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { AuthService } from '../utils/auth';
import { authenticateJWT } from '../utils/auth-middleware';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * Register a new user
   */
  fastify.post('/api/auth/register', async (request, reply) => {
    try {
      const body = registerSchema.parse(request.body);

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: body.email },
      });

      if (existingUser) {
        return reply.code(400).send({ error: 'User already exists' });
      }

      // Hash password
      const passwordHash = await AuthService.hashPassword(body.password);

      // Generate API key
      const apiKey = AuthService.generateApiKey();

      // Create user
      const user = await prisma.user.create({
        data: {
          email: body.email,
          password_hash: passwordHash,
          api_key: apiKey,
        },
        select: {
          id: true,
          email: true,
          api_key: true,
          created_at: true,
        },
      });

      // Generate JWT token
      const token = AuthService.generateToken({
        userId: user.id,
        email: user.email,
      });

      return reply.code(201).send({
        message: 'User registered successfully',
        user: {
          id: user.id,
          email: user.email,
          api_key: user.api_key,
          created_at: user.created_at,
        },
        token,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      throw error;
    }
  });

  /**
   * Login user
   */
  fastify.post('/api/auth/login', async (request, reply) => {
    try {
      const body = loginSchema.parse(request.body);

      // Find user by email
      const user = await prisma.user.findUnique({
        where: { email: body.email },
      });

      if (!user) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      // Verify password
      const isValid = await AuthService.verifyPassword(body.password, user.password_hash);

      if (!isValid) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      // Update last login
      await prisma.user.update({
        where: { id: user.id },
        data: { last_login_at: new Date() },
      });

      // Generate JWT token
      const token = AuthService.generateToken({
        userId: user.id,
        email: user.email,
      });

      return reply.send({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          api_key: user.api_key,
        },
        token,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      throw error;
    }
  });

  /**
   * Get current user profile
   */
  fastify.get('/api/auth/profile', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user!.userId },
      select: {
        id: true,
        email: true,
        api_key: true,
        created_at: true,
        updated_at: true,
        last_login_at: true,
      },
    });

    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    return reply.send({ user });
  });

  /**
   * Regenerate API key
   */
  fastify.post('/api/auth/regenerate-api-key', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const newApiKey = AuthService.generateApiKey();

    const user = await prisma.user.update({
      where: { id: request.user!.userId },
      data: { api_key: newApiKey },
      select: {
        id: true,
        email: true,
        api_key: true,
      },
    });

    return reply.send({
      message: 'API key regenerated successfully',
      user,
    });
  });

  /**
   * Change password
   */
  fastify.post('/api/auth/change-password', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    try {
      const body = z.object({
        current_password: z.string(),
        new_password: z.string().min(8).max(100),
      }).parse(request.body);

      // Get current user
      const user = await prisma.user.findUnique({
        where: { id: request.user!.userId },
      });

      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      // Verify current password
      const isValid = await AuthService.verifyPassword(body.current_password, user.password_hash);

      if (!isValid) {
        return reply.code(401).send({ error: 'Current password is incorrect' });
      }

      // Hash new password
      const newPasswordHash = await AuthService.hashPassword(body.new_password);

      // Update password
      await prisma.user.update({
        where: { id: user.id },
        data: { password_hash: newPasswordHash },
      });

      return reply.send({ message: 'Password changed successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      throw error;
    }
  });
}
