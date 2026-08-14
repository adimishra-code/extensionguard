import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

export const redis = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

export const scanQueue = new Queue('scan', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

scanQueue.on('error', (err) => {
  logger.error({ err }, 'Scan queue error');
});

export interface ScanJobData {
  scanId: string;
  extensionId: string;
  filePath: string;
  scanType: 'quick' | 'deep' | 'sandbox' | 'full';
  config: {
    enableStatic: boolean;
    enableRuntime: boolean;
    enableNetwork: boolean;
    enableDataFlow: boolean;
    enableLLM: boolean;
    runtimeTimeoutSeconds: number;
    maxFileSizeMb: number;
    rulesets: string[];
  };
}

export async function addScanJob(data: ScanJobData) {
  const job = await scanQueue.add('analyze', data, {
    jobId: data.scanId,
  });
  logger.info({ scanId: data.scanId, jobId: job.id }, 'Scan job added to queue');
  return job;
}

export async function getScanJobStatus(jobId: string) {
  const job = await scanQueue.getJob(jobId);
  if (!job) return null;
  const state = await job.getState();
  return { id: job.id, state, progress: job.progress };
}

export function createScanWorker(processor: (job: Job<ScanJobData>) => Promise<void>) {
  const worker = new Worker<ScanJobData>('scan', processor, {
    connection: redis,
    concurrency: 2,
    limiter: {
      max: 2,
      duration: 1000,
    },
  });

  worker.on('completed', (job) => {
    logger.info({ scanId: job.data.scanId }, 'Scan job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ scanId: job?.data.scanId, err }, 'Scan job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Scan worker error');
  });

  return worker;
}