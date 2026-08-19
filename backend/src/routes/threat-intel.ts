import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authenticate, authenticateJWT } from '../utils/auth-middleware';
import { threatIntel } from '../services/threat-intelligence';
import { logger } from '../utils/logger';
import { Severity } from '@prisma/client';

const checkExtensionSchema = z.object({
  extensionId: z.string(),
});

const checkDomainSchema = z.object({
  domain: z.string(),
});

const addThreatSchema = z.object({
  extensionId: z.string().optional(),
  pattern: z.string().optional(),
  domain: z.string().optional(),
  type: z.enum(['extension', 'domain', 'code_pattern', 'maintainer', 'supply_chain']),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  description: z.string(),
  source: z.string(),
  confidence: z.number().min(0).max(1),
  metadata: z.any().optional(),
});

const submitReportSchema = z.object({
  extensionId: z.string(),
  extensionName: z.string(),
  extensionVersion: z.string().optional(),
  reportType: z.string(),
  description: z.string().min(10),
  evidence: z.any().optional(),
});

const reviewReportSchema = z.object({
  action: z.enum(['verify', 'reject']),
  notes: z.string().optional(),
});

export async function threatIntelRoutes(fastify: FastifyInstance) {
  /**
   * Check if an extension is a known threat
   */
  fastify.post('/api/threats/check/extension', {
    preHandler: authenticate,
  }, async (request, reply) => {
    try {
      const body = checkExtensionSchema.parse(request.body);
      const result = await threatIntel.checkExtension(body.extensionId);

      return reply.send({
        extensionId: body.extensionId,
        ...result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      throw error;
    }
  });

  /**
   * Check if a domain is a known threat
   */
  fastify.post('/api/threats/check/domain', {
    preHandler: authenticate,
  }, async (request, reply) => {
    try {
      const body = checkDomainSchema.parse(request.body);
      const result = await threatIntel.checkDomain(body.domain);

      return reply.send({
        domain: body.domain,
        ...result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      throw error;
    }
  });

  /**
   * Get all active threats
   */
  fastify.get('/api/threats', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const query = request.query as any;
    const type = query.type;
    const severity = query.severity as Severity | undefined;
    const limit = parseInt(query.limit || '50', 10);

    const threats = await threatIntel.getActiveThreats(type, severity, limit);

    return reply.send({
      threats,
      count: threats.length,
    });
  });

  /**
   * Get specific threat by ID
   */
  fastify.get('/api/threats/:threatId', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { threatId } = request.params as { threatId: string };

    const threat = await prisma.threatIntelligence.findUnique({
      where: { id: threatId },
    });

    if (!threat) {
      return reply.code(404).send({ error: 'Threat not found' });
    }

    return reply.send({ threat });
  });

  /**
   * Add a new threat (admin only - for now just authenticated)
   */
  fastify.post('/api/threats', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    try {
      const body = addThreatSchema.parse(request.body);

      const threat = await threatIntel.addThreat({
        extensionId: body.extensionId,
        pattern: body.pattern,
        domain: body.domain,
        type: body.type,
        severity: body.severity as Severity,
        description: body.description,
        source: body.source,
        confidence: body.confidence,
        metadata: body.metadata,
      });

      return reply.code(201).send({
        message: 'Threat added successfully',
        threat,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      throw error;
    }
  });

  /**
   * Verify a threat (admin action)
   */
  fastify.post('/api/threats/:threatId/verify', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const { threatId } = request.params as { threatId: string };
    const userId = request.user!.userId;

    await threatIntel.verifyThreat(threatId, userId);

    return reply.send({
      message: 'Threat verified successfully',
    });
  });

  /**
   * Mark threat as false positive
   */
  fastify.post('/api/threats/:threatId/false-positive', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const { threatId } = request.params as { threatId: string };
    const body = z.object({ reason: z.string() }).parse(request.body);

    await threatIntel.markFalsePositive(threatId, body.reason);

    return reply.send({
      message: 'Threat marked as false positive',
    });
  });

  /**
   * Submit a community report
   */
  fastify.post('/api/threats/report', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    try {
      const body = submitReportSchema.parse(request.body);
      const userId = request.user!.userId;

      const report = await threatIntel.submitCommunityReport({
        userId,
        extensionId: body.extensionId,
        extensionName: body.extensionName,
        extensionVersion: body.extensionVersion,
        reportType: body.reportType,
        description: body.description,
        evidence: body.evidence,
      });

      return reply.code(201).send({
        message: 'Report submitted successfully',
        report,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      throw error;
    }
  });

  /**
   * Get pending community reports (admin)
   */
  fastify.get('/api/threats/reports/pending', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const limit = parseInt((request.query as any).limit || '20', 10);
    const reports = await threatIntel.getPendingReports(limit);

    return reply.send({
      reports,
      count: reports.length,
    });
  });

  /**
   * Get user's community reports
   */
  fastify.get('/api/threats/reports/my', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    const userId = request.user!.userId;

    const reports = await prisma.communityReport.findMany({
      where: { user_id: userId },
      orderBy: { reported_at: 'desc' },
    });

    return reply.send({
      reports,
      count: reports.length,
    });
  });

  /**
   * Review a community report (admin)
   */
  fastify.post('/api/threats/reports/:reportId/review', {
    preHandler: authenticateJWT,
  }, async (request, reply) => {
    try {
      const { reportId } = request.params as { reportId: string };
      const body = reviewReportSchema.parse(request.body);
      const userId = request.user!.userId;

      await threatIntel.processCommunityReport(
        reportId,
        body.action,
        userId,
        body.notes
      );

      return reply.send({
        message: `Report ${body.action}ed successfully`,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      throw error;
    }
  });

  /**
   * Get threat statistics
   */
  fastify.get('/api/threats/stats', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const [totalThreats, activeThreats, criticalThreats, pendingReports] = await Promise.all([
      prisma.threatIntelligence.count(),
      prisma.threatIntelligence.count({ where: { active: true, false_positive: false } }),
      prisma.threatIntelligence.count({ where: { active: true, severity: 'critical' } }),
      prisma.communityReport.count({ where: { status: 'pending' } }),
    ]);

    return reply.send({
      stats: {
        totalThreats,
        activeThreats,
        criticalThreats,
        pendingReports,
      },
    });
  });

  logger.info('Threat intelligence routes registered');
}
