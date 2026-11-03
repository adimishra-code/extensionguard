import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import { AuthService } from '../utils/auth';
import { authenticateJWT } from '../utils/auth-middleware';
import { emailService } from '../services/email';
import { logger } from '../utils/logger';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const verifyEmailSchema = z.object({
  email: z.string().email().optional(),
  code: z.string().optional(),
  token: z.string().optional(),
});

const resendVerificationSchema = z.object({
  email: z.string().email(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(100),
});

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * Register a new user and dispatch verification email
   */
  fastify.post('/api/auth/register', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const body = registerSchema.parse(request.body);

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: body.email.toLowerCase().trim() },
      });

      if (existingUser) {
        return reply.code(400).send({ error: 'An account with this email address already exists' });
      }

      // Hash password
      const passwordHash = await AuthService.hashPassword(body.password);

      // Generate API key
      const apiKey = AuthService.generateApiKey();

      // Generate 6-digit OTP code and secure verification token
      const otpCode = crypto.randomInt(100000, 999999).toString();
      const rawToken = crypto.randomBytes(24).toString('hex');
      const compositeToken = `${otpCode}:${rawToken}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // First registered user automatically becomes admin, otherwise user
      const userCount = await prisma.user.count();
      const role = userCount === 0 ? 'admin' : 'user';

      // Create user
      const user = await prisma.user.create({
        data: {
          email: body.email.toLowerCase().trim(),
          password_hash: passwordHash,
          api_key: apiKey,
          role,
          is_verified: false,
          verification_token: compositeToken,
          verification_token_expires_at: expiresAt,
        },
        select: {
          id: true,
          email: true,
          api_key: true,
          role: true,
          is_verified: true,
          created_at: true,
        },
      });

      // Dispatch verification email in background
      emailService.sendVerificationEmail(user.email, otpCode, rawToken).catch((err) => {
        logger.error({ err, email: user.email }, 'Failed to dispatch verification email');
      });

      // Generate JWT token
      const token = AuthService.generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      return reply.code(201).send({
        message: 'Registration successful! A verification code has been dispatched to your email.',
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          is_verified: user.is_verified,
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
   * Verify email using 6-digit OTP code or link token
   */
  fastify.post('/api/auth/verify-email', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const body = verifyEmailSchema.parse(request.body);

      if (!body.code && !body.token) {
        return reply.code(400).send({ error: 'Please provide either a 6-digit verification code or token' });
      }

      // Find user matching token or code
      let user: any = null;

      if (body.email && body.code) {
        user = await prisma.user.findFirst({
          where: {
            email: body.email.toLowerCase().trim(),
            verification_token_expires_at: { gt: new Date() },
          },
        });

        if (user && user.verification_token) {
          const [storedCode] = user.verification_token.split(':');
          if (storedCode !== body.code.trim()) {
            return reply.code(400).send({ error: 'Invalid verification code' });
          }
        } else {
          return reply.code(400).send({ error: 'Invalid or expired verification code' });
        }
      } else if (body.token) {
        // Direct link verification
        const usersWithToken = await prisma.user.findMany({
          where: {
            verification_token_expires_at: { gt: new Date() },
          },
        });

        user = usersWithToken.find(u => {
          if (!u.verification_token) return false;
          const parts = u.verification_token.split(':');
          return parts[1] === body.token || u.verification_token === body.token;
        });

        if (!user) {
          return reply.code(400).send({ error: 'Invalid or expired verification token' });
        }
      }

      if (!user) {
        return reply.code(400).send({ error: 'Verification failed. Please request a new code.' });
      }

      // Mark user as verified
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          is_verified: true,
          verification_token: null,
          verification_token_expires_at: null,
        },
        select: {
          id: true,
          email: true,
          role: true,
          is_verified: true,
        },
      });

      return reply.send({
        success: true,
        message: 'Email verified successfully! You now have full access to ExtensionGuard.',
        user: updatedUser,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      throw error;
    }
  });

  /**
   * Resend verification email
   */
  fastify.post('/api/auth/resend-verification', {
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const body = resendVerificationSchema.parse(request.body);
      const email = body.email.toLowerCase().trim();

      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        // Return generic success to avoid user enumeration
        return reply.send({ message: 'If this account exists, a new verification code has been dispatched.' });
      }

      if (user.is_verified) {
        return reply.code(400).send({ error: 'This account is already verified' });
      }

      const otpCode = crypto.randomInt(100000, 999999).toString();
      const rawToken = crypto.randomBytes(24).toString('hex');
      const compositeToken = `${otpCode}:${rawToken}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          verification_token: compositeToken,
          verification_token_expires_at: expiresAt,
        },
      });

      emailService.sendVerificationEmail(email, otpCode, rawToken).catch((err) => {
        logger.error({ err, email }, 'Failed to resend verification email');
      });

      return reply.send({ message: 'A new verification code has been dispatched to your email.' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      throw error;
    }
  });

  /**
   * Diagnostic test endpoint for email delivery
   */
  fastify.post('/api/auth/diagnostic-email', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { email } = (request.body as any) || {};
    const target = email || 'adimishra3685@gmail.com';
    const result = await emailService.testDiagnostic(target);
    return reply.send(result);
  });

  /**
   * Request password reset link
   */
  fastify.post('/api/auth/forgot-password', {
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const body = forgotPasswordSchema.parse(request.body);
      const email = body.email.toLowerCase().trim();

      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (user) {
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await prisma.user.update({
          where: { id: user.id },
          data: {
            reset_password_token: resetToken,
            reset_password_expires_at: expiresAt,
          },
        });

        emailService.sendPasswordResetEmail(email, resetToken).catch((err) => {
          logger.error({ err, email }, 'Failed to dispatch password reset email');
        });
      }

      // Always return 200 to prevent user enumeration
      return reply.send({
        message: 'If an account exists with that email, a password reset link has been dispatched.',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      throw error;
    }
  });

  /**
   * Reset password with reset token
   */
  fastify.post('/api/auth/reset-password', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const body = resetPasswordSchema.parse(request.body);

      const user = await prisma.user.findFirst({
        where: {
          reset_password_token: body.token,
          reset_password_expires_at: { gt: new Date() },
        },
      });

      if (!user) {
        return reply.code(400).send({ error: 'Invalid or expired password reset link' });
      }

      const passwordHash = await AuthService.hashPassword(body.password);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          password_hash: passwordHash,
          reset_password_token: null,
          reset_password_expires_at: null,
        },
      });

      return reply.send({ message: 'Password has been reset successfully. You can now log in.' });
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
  fastify.post('/api/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const body = loginSchema.parse(request.body);
      const email = body.email.toLowerCase().trim();

      // Find user by email
      let user = await prisma.user.findUnique({
        where: { email },
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

      // Generate JWT token with role
      const token = AuthService.generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      return reply.send({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          is_verified: user.is_verified,
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
        role: true,
        is_verified: true,
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
      apiKey: user.api_key,
    });
  });

  /**
   * Change password
   */
  fastify.post('/api/auth/change-password', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const changePasswordSchema = z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8).max(100),
    });

    try {
      const body = changePasswordSchema.parse(request.body);

      const user = await prisma.user.findUnique({
        where: { id: request.user!.userId },
      });

      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      const isValid = await AuthService.verifyPassword(
        body.currentPassword,
        user.password_hash
      );

      if (!isValid) {
        return reply.code(401).send({ error: 'Current password is incorrect' });
      }

      const newPasswordHash = await AuthService.hashPassword(body.newPassword);

      await prisma.user.update({
        where: { id: user.id },
        data: { password_hash: newPasswordHash },
      });

      return reply.send({ message: 'Password updated successfully' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      throw error;
    }
  });
}
