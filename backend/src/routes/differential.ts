import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { authenticate } from '../utils/auth-middleware';
import { differentialAnalyzer } from '../services/differential-analyzer';
import { logger } from '../utils/logger';

const analyzeDiffSchema = z.object({
  extensionId: z.string(),
  oldVersionId: z.string(),
  newVersionId: z.string(),
});

export async function differentialRoutes(fastify: FastifyInstance) {
  /**
   * Analyze difference between two extension versions
   */
  fastify.post('/api/differential/analyze', {
    preHandler: authenticate,
  }, async (request, reply) => {
    try {
      const body = analyzeDiffSchema.parse(request.body);

      const result = await differentialAnalyzer.analyzeVersionDiff(
        body.extensionId,
        body.oldVersionId,
        body.newVersionId
      );

      if (!result) {
        return reply.code(404).send({ error: 'Failed to analyze versions' });
      }

      return reply.send({
        message: 'Differential analysis completed',
        analysis: result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      throw error;
    }
  });

  /**
   * Get differential analysis history for an extension
   */
  fastify.get('/api/differential/history/:extensionId', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { extensionId } = request.params as { extensionId: string };
    const limit = parseInt((request.query as any).limit || '10', 10);

    const history = await differentialAnalyzer.getAnalysisHistory(extensionId, limit);

    return reply.send({
      extensionId,
      history,
      count: history.length,
    });
  });

  /**
   * Get specific differential analysis by ID
   */
  fastify.get('/api/differential/:analysisId', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { analysisId } = request.params as { analysisId: string };

    const analysis = await prisma.differentialAnalysis.findUnique({
      where: { id: analysisId },
    });

    if (!analysis) {
      return reply.code(404).send({ error: 'Analysis not found' });
    }

    return reply.send({ analysis });
  });

  /**
   * Get latest differential analyses (all extensions)
   */
  fastify.get('/api/differential/latest', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const limit = parseInt((request.query as any).limit || '20', 10);
    const severityFilter = (request.query as any).severity as string | undefined;

    const where = severityFilter
      ? { severity: severityFilter as any }
      : {};

    const analyses = await prisma.differentialAnalysis.findMany({
      where,
      orderBy: { analysis_date: 'desc' },
      take: limit,
    });

    return reply.send({
      analyses,
      count: analyses.length,
    });
  });

  /**
   * Get high-risk version updates
   */
  fastify.get('/api/differential/high-risk', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const limit = parseInt((request.query as any).limit || '10', 10);

    const highRisk = await prisma.differentialAnalysis.findMany({
      where: {
        severity: { in: ['high', 'critical'] },
        risk_delta: { gte: 25 },
      },
      orderBy: { analysis_date: 'desc' },
      take: limit,
    });

    return reply.send({
      analyses: highRisk,
      count: highRisk.length,
    });
  });

  /**
   * Compare current version with previous for an extension
   */
  fastify.post('/api/differential/compare-latest/:extensionId', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { extensionId } = request.params as { extensionId: string };

    // Get last two versions
    const versions = await prisma.extensionVersion.findMany({
      where: { extension_id: extensionId },
      orderBy: { detected_at: 'desc' },
      take: 2,
    });

    if (versions.length < 2) {
      return reply.code(400).send({ error: 'Not enough versions to compare' });
    }

    const [newVersion, oldVersion] = versions;

    // Check if analysis already exists
    const existing = await prisma.differentialAnalysis.findUnique({
      where: {
        extension_id_old_version_new_version: {
          extension_id: extensionId,
          old_version: oldVersion.version,
          new_version: newVersion.version,
        },
      },
    });

    if (existing) {
      return reply.send({
        message: 'Analysis already exists',
        analysis: existing,
      });
    }

    // Perform analysis
    const result = await differentialAnalyzer.analyzeVersionDiff(
      extensionId,
      oldVersion.id,
      newVersion.id
    );

    if (!result) {
      return reply.code(500).send({ error: 'Analysis failed' });
    }

    return reply.send({
      message: 'Differential analysis completed',
      analysis: result,
    });
  });

  logger.info('Differential analysis routes registered');
}
