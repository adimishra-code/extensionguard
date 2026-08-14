import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { Job } from 'bullmq';
import { config } from './config';
import { logger, createChildLogger } from './utils/logger';
import { connectDatabase, disconnectDatabase, prisma } from './utils/prisma';
import { redis, scanQueue, createScanWorker, ScanJobData } from './queue';
import { processScanJob } from './services/scan-orchestrator';
import { scanRoutes } from './routes/scan';

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

fastify.register(scanRoutes);

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

async function start() {
  try {
    await connectDatabase();
    await redis.connect();
    
    const worker = createScanWorker(async (job: Job<ScanJobData>) => {
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
  logger.info('Shutting down...');
  await fastify.close();
  await scanQueue.close();
  await redis.quit();
  await disconnectDatabase();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();