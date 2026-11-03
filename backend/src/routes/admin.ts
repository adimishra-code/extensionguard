import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authenticateAdmin } from '../utils/auth-middleware';
import { config } from '../config';
import { logger } from '../utils/logger';
import { readdirSync, statSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

export async function adminRoutes(fastify: FastifyInstance) {
  // All admin routes require valid JWT with role: "admin"
  fastify.addHook('preHandler', authenticateAdmin);

  /**
   * GET /api/admin/stats - High-level system & security metrics
   */
  fastify.get('/api/admin/stats', async () => {
    const [
      totalUsers,
      verifiedUsers,
      totalScans,
      totalExtensions,
      criticalFindings,
      highFindings,
      activeSessions,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { is_verified: true } }),
      prisma.scan.count(),
      prisma.extension.count(),
      prisma.finding.count({ where: { severity: 'critical' } }),
      prisma.finding.count({ where: { severity: 'high' } }),
      prisma.monitorSession.count({
        where: { disconnected_at: null },
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        verified: verifiedUsers,
        unverified: totalUsers - verifiedUsers,
      },
      scans: {
        total: totalScans,
        extensions: totalExtensions,
      },
      security: {
        critical_findings: criticalFindings,
        high_findings: highFindings,
        active_monitoring_sessions: activeSessions,
      },
    };
  });

  /**
   * GET /api/admin/users - Paginated user management table
   */
  fastify.get('/api/admin/users', async (request: FastifyRequest<{
    Querystring: { limit?: string; offset?: string; search?: string };
  }>) => {
    const limit = Math.min(parseInt(request.query.limit || '20', 10), 100);
    const offset = Math.max(parseInt(request.query.offset || '0', 10), 0);
    const search = request.query.search?.trim();

    const where: any = {};
    if (search) {
      where.email = { contains: search, mode: 'insensitive' };
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          email: true,
          role: true,
          is_verified: true,
          created_at: true,
          last_login_at: true,
          _count: {
            select: {
              sessions: true,
              alerts: true,
              community_reports: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total, limit, offset };
  });

  /**
   * POST /api/admin/users/:id/role - Promote/demote user
   */
  fastify.post('/api/admin/users/:id/role', async (request: FastifyRequest<{
    Params: { id: string };
    Body: { role: string };
  }>, reply: FastifyReply) => {
    const roleSchema = z.object({
      role: z.enum(['user', 'admin']),
    });

    const body = roleSchema.parse(request.body);
    const targetUserId = request.params.id;

    // Security guard: Admin cannot demote themselves to prevent accidental lockouts
    if (targetUserId === request.user?.userId && body.role !== 'admin') {
      return reply.code(400).send({ error: 'Security constraint: You cannot demote your own administrator account' });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      return reply.code(404).send({ error: 'User not found' });
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { role: body.role },
      select: { id: true, email: true, role: true },
    });

    logger.info({ adminId: request.user?.userId, targetUserId, newRole: body.role }, 'User role updated by admin');
    return reply.send({ message: `Role for ${updated.email} updated to ${updated.role}`, user: updated });
  });

  /**
   * DELETE /api/admin/users/:id - Delete malicious/spam user
   */
  fastify.delete('/api/admin/users/:id', async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply: FastifyReply) => {
    const targetUserId = request.params.id;

    // Security guard: Admin cannot delete their own account
    if (targetUserId === request.user?.userId) {
      return reply.code(400).send({ error: 'Security constraint: You cannot delete your own account' });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      return reply.code(404).send({ error: 'User not found' });
    }

    await prisma.user.delete({
      where: { id: targetUserId },
    });

    logger.warn({ adminId: request.user?.userId, deletedUserId: targetUserId }, 'User account deleted by admin');
    return reply.send({ success: true, message: `Account ${targetUser.email} has been deleted` });
  });

  /**
   * GET /api/admin/system - Server telemetry & process status
   */
  fastify.get('/api/admin/system', async () => {
    const memory = process.memoryUsage();

    return {
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime_seconds: Math.floor(process.uptime()),
      environment: config.NODE_ENV,
      analyzer_version: config.ANALYZER_VERSION,
      ruleset_version: config.RULESET_VERSION,
      memory: {
        heap_used_mb: Math.round(memory.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(memory.heapTotal / 1024 / 1024),
        rss_mb: Math.round(memory.rss / 1024 / 1024),
      },
      llm: {
        provider: config.LLM_PROVIDER,
        model: config.LLM_MODEL,
      },
    };
  });

  /**
   * POST /api/admin/maintenance/clean-uploads - Purge temporary upload archives
   */
  fastify.post('/api/admin/maintenance/clean-uploads', async (_request, reply) => {
    if (!existsSync(config.UPLOAD_DIR)) {
      return reply.send({ message: 'Upload directory is clean', deletedFiles: 0 });
    }

    let deletedFiles = 0;
    let reclaimedBytes = 0;

    try {
      const files = readdirSync(config.UPLOAD_DIR);
      const oneHourAgo = Date.now() - 60 * 60 * 1000;

      for (const file of files) {
        const filePath = join(config.UPLOAD_DIR, file);
        const stats = statSync(filePath);
        if (stats.isFile() && stats.mtimeMs < oneHourAgo) {
          reclaimedBytes += stats.size;
          unlinkSync(filePath);
          deletedFiles++;
        }
      }

      logger.info({ deletedFiles, reclaimedBytes }, 'Temporary uploads purged');
      return reply.send({
        message: `Purged ${deletedFiles} temporary files`,
        deletedFiles,
        reclaimedMb: (reclaimedBytes / 1024 / 1024).toFixed(2),
      });
    } catch (err) {
      logger.error({ err }, 'Failed to clean uploads');
      return reply.code(500).send({ error: 'Failed to purge uploads' });
    }
  });
}
