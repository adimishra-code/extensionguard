import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../utils/auth';
import { prisma } from '../utils/prisma';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      userId: string;
      email: string;
    };
  }
}

/**
 * Middleware to authenticate requests using JWT
 */
export async function authenticateJWT(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const token = AuthService.extractToken(request.headers.authorization);

    if (!token) {
      return reply.code(401).send({ error: 'No token provided' });
    }

    const payload = AuthService.verifyToken(token);

    // Verify user exists in database
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true },
    });

    if (!user) {
      return reply.code(401).send({ error: 'User not found' });
    }

    // Attach user to request
    request.user = {
      userId: user.id,
      email: user.email,
    };
  } catch (error) {
    return reply.code(401).send({ error: 'Invalid token' });
  }
}

/**
 * Middleware to authenticate requests using API key
 */
export async function authenticateApiKey(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const apiKey = request.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      return reply.code(401).send({ error: 'No API key provided' });
    }

    // Find user by API key
    const user = await prisma.user.findUnique({
      where: { api_key: apiKey },
      select: { id: true, email: true },
    });

    if (!user) {
      return reply.code(401).send({ error: 'Invalid API key' });
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });

    // Attach user to request
    request.user = {
      userId: user.id,
      email: user.email,
    };
  } catch (error) {
    return reply.code(401).send({ error: 'Authentication failed' });
  }
}

/**
 * Middleware that accepts either JWT or API key
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const hasJWT = request.headers.authorization?.startsWith('Bearer ');
  const hasApiKey = !!request.headers['x-api-key'];

  if (hasJWT) {
    return authenticateJWT(request, reply);
  } else if (hasApiKey) {
    return authenticateApiKey(request, reply);
  } else {
    return reply.code(401).send({ error: 'Authentication required' });
  }
}
