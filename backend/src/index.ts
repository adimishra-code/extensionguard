import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { Job } from 'bullmq';
import { config } from './config';
import { logger } from './utils/logger';
import { connectDatabase, disconnectDatabase, prisma } from './utils/prisma';
import { redis, scanQueue, createScanWorker, ScanJobData } from './queue';
import { processScanJob } from './services/scan-orchestrator';
import { scanRoutes } from './routes/scan';
import { authRoutes } from './routes/auth';

const fastify = Fastify({
  logger: false,
  requestTimeout: 60000,
});

fastify.register(sensible);
fastify.register(cors, {
  origin: config.FRONTEND_URL,
  credentials: true,
});
fastify.register(multipart, {
  limits: {
    fileSize: config.UPLOAD_MAX_SIZE,
  },
});
fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

fastify.register(authRoutes);
fastify.register(scanRoutes);

let scanWorker: ReturnType<typeof createScanWorker> | null = null;

fastify.setErrorHandler((error, request, reply) => {
  logger.error({ url: request.url, method: request.method, error: error.message }, 'Unhandled request error');
  if (error.validation) {
    return reply.code(400).send({ error: 'Validation failed', details: error.validation });
  }
  const statusCode = error.statusCode || 500;
  return reply.code(statusCode).send({ 
    error: statusCode === 500 ? 'Internal Server Error' : error.message 
  });
});

fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString(), version: config.ANALYZER_VERSION };
});

fastify.get('/api/health', async () => {
  const dbStatus = await prisma.$queryRaw`SELECT 1`.then(() => 'connected').catch(() => 'disconnected');
  const redisStatus = await redis.ping().then(() => 'connected').catch(() => 'disconnected');
  
  return {
    status: dbStatus === 'connected' && redisStatus === 'connected' ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: config.ANALYZER_VERSION,
    services: {
      database: dbStatus,
      redis: redisStatus,
      queue: 'running',
    },
  };
});

fastify.get('/api/health/detailed', async () => {
  const dbStart = Date.now();
  const dbStatus = await prisma.$queryRaw`SELECT 1`.then(() => 'connected').catch(() => 'disconnected');
  const dbLatencyMs = Date.now() - dbStart;

  const redisStart = Date.now();
  const redisStatus = await redis.ping().then(() => 'connected').catch(() => 'disconnected');
  const redisLatencyMs = Date.now() - redisStart;

  const [scanCount, extCount] = await Promise.all([
    prisma.scan.count().catch(() => 0),
    prisma.extension.count().catch(() => 0),
  ]);

  return {
    status: dbStatus === 'connected' && redisStatus === 'connected' ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: config.ANALYZER_VERSION,
    environment: config.NODE_ENV,
    metrics: {
      total_scans: scanCount,
      total_extensions: extCount,
      database_latency_ms: dbLatencyMs,
      redis_latency_ms: redisLatencyMs,
    },
    services: {
      database: { status: dbStatus, latency_ms: dbLatencyMs },
      redis: { status: redisStatus, latency_ms: redisLatencyMs },
      worker: { status: 'running', concurrency: 2 },
    },
  };
});

async function start() {
  try {
    await connectDatabase();
    await redis.connect();
    
    scanWorker = createScanWorker(async (job: Job<ScanJobData>) => {
      await processScanJob(job.data);
    });
    
    await fastify.listen({ port: config.PORT, host: config.HOST });
    
    logger.info(`Server listening on ${config.HOST}:${config.PORT}`);
    logger.info(`Health check: http://${config.HOST}:${config.PORT}/health`);
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

async function shutdown() {
  logger.info('Shutting down gracefully...');
  if (scanWorker) {
    await scanWorker.close();
  }
  await fastify.close();
  await scanQueue.close();
  await redis.quit();
  await disconnectDatabase();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();