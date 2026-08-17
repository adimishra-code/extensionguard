import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';
import { addScanJob, scanQueue, ScanJobData } from '../queue';
import { logger } from '../utils/logger';
import { config } from '../config';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ScanType, ScanConfig, ExtensionManifest } from '@extension-guard/shared';
import { z } from 'zod';
import AdmZip from 'adm-zip';
import crypto from 'crypto';

const UPLOAD_DIR = join(tmpdir(), 'extension-guard-uploads');

const scanTypeSchema = z.enum(['quick', 'deep', 'sandbox', 'full']).default('quick');

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().max(100).optional(),
});

const findingsQuerySchema = z.object({
  severity: z.enum(['info', 'low', 'medium', 'high', 'critical']).optional(),
  category: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

function isValidZipOrCrx(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  // ZIP: PK\x03\x04 or PK\x05\x06 or PK\x07\x08
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b && 
    ((buffer[2] === 0x03 && buffer[3] === 0x04) || 
     (buffer[2] === 0x05 && buffer[3] === 0x06) || 
     (buffer[2] === 0x07 && buffer[3] === 0x08));
  // CRX: Cr24 (0x43, 0x72, 0x32, 0x34)
  const isCrx = buffer[0] === 0x43 && buffer[1] === 0x72 && buffer[2] === 0x32 && buffer[3] === 0x34;
  return isZip || isCrx;
}

function extractZipBuffer(buffer: Buffer): Buffer {
  // If CRX header (Cr24), find the start of the embedded ZIP payload
  if (buffer[0] === 0x43 && buffer[1] === 0x72 && buffer[2] === 0x32 && buffer[3] === 0x34) {
    for (let i = 4; i < Math.min(buffer.length - 4, 100000); i++) {
      if (buffer[i] === 0x50 && buffer[i + 1] === 0x4b && buffer[i + 2] === 0x03 && buffer[i + 3] === 0x04) {
        return buffer.subarray(i);
      }
    }
  }
  return buffer;
}

async function saveUpload(file: { file: NodeJS.ReadableStream; filename: string }): Promise<{ path: string; hash: string; size: number }> {
  const hash = crypto.createHash('sha256');
  const chunks: Buffer[] = [];
  
  for await (const chunk of file.file) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(buf);
    hash.update(buf);
  }
  
  const rawBuffer = Buffer.concat(chunks);
  
  if (!isValidZipOrCrx(rawBuffer)) {
    throw new Error('Invalid file format: file header does not match ZIP or CRX signature');
  }

  const cleanZipBuffer = extractZipBuffer(rawBuffer);
  const fileHash = hash.digest('hex');
  const fileName = `${fileHash}.zip`;
  const filePath = join(UPLOAD_DIR, fileName);
  
  mkdirSync(UPLOAD_DIR, { recursive: true });
  writeFileSync(filePath, cleanZipBuffer);
  
  return { path: filePath, hash: fileHash, size: rawBuffer.length };
}

async function parseManifest(filePath: string): Promise<ExtensionManifest> {
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries();
  
  let manifestEntry = zip.getEntry('manifest.json');
  if (!manifestEntry) {
    // Check if manifest is in a subdirectory (e.g. extension_dir/manifest.json)
    manifestEntry = entries.find(e => e.entryName === 'manifest.json' || e.entryName.endsWith('/manifest.json')) || null;
  }
  
  if (!manifestEntry) {
    throw new Error('manifest.json not found in extension package');
  }
  
  let manifestContent = manifestEntry.getData().toString('utf8');
  // Strip UTF-8 BOM if present
  manifestContent = manifestContent.replace(/^\uFEFF/, '').trim();
  
  return JSON.parse(manifestContent);
}

export async function scanRoutes(fastify: FastifyInstance) {
  // POST /api/scans - Upload extension and queue scan
  fastify.post('/api/scans', async (request: FastifyRequest<{ Querystring: { scanType?: string } }>, reply: FastifyReply) => {
    const logger_ = logger.child({ route: 'POST /api/scans' });
    
    try {
      const data = await request.file();
      
      if (!data) {
        return reply.code(400).send({ error: 'No file uploaded' });
      }
      
      const filenameLower = data.filename.toLowerCase();
      if (!filenameLower.endsWith('.zip') && !filenameLower.endsWith('.crx')) {
        return reply.code(400).send({ error: 'Only .zip and .crx files are supported' });
      }
      
      let filePath: string;
      let hash: string;
      let size: number;
      
      try {
        const uploadResult = await saveUpload(data);
        filePath = uploadResult.path;
        hash = uploadResult.hash;
        size = uploadResult.size;
      } catch (uploadErr) {
        return reply.code(400).send({ 
          error: uploadErr instanceof Error ? uploadErr.message : 'Invalid upload package' 
        });
      }

      logger_.info({ filename: data.filename, hash, size }, 'File uploaded');
      
      let manifest: ExtensionManifest;
      try {
        manifest = await parseManifest(filePath);
      } catch (e) {
        rmSync(filePath, { force: true });
        return reply.code(400).send({ error: 'Invalid extension package: manifest.json not found or corrupt' });
      }
      
      const extension = await prisma.extension.upsert({
        where: { hash },
        update: { last_scanned_at: new Date() },
        create: {
          name: manifest.name || 'Unknown Extension',
          version: manifest.version || '0.0.0',
          browser: 'chrome',
          source: 'upload',
          hash,
          size_bytes: size,
          manifest_json: manifest as any,
        },
      });
      
      // Parse scanType from query or fields
      const rawScanType = request.query?.scanType || 
        ((data.fields?.scanType as any)?.value) || 
        'quick';
      const parsedScanType = scanTypeSchema.safeParse(rawScanType);
      const scanType: ScanType = parsedScanType.success ? parsedScanType.data : 'quick';
      
      const scanConfig: ScanConfig = {
        enable_static: scanType !== 'sandbox',
        enable_runtime: scanType === 'sandbox' || scanType === 'full',
        enable_network: scanType === 'deep' || scanType === 'full',
        enable_data_flow: scanType === 'deep' || scanType === 'full',
        enable_llm: false,
        runtime_timeout_seconds: 120,
        max_file_size_mb: 50,
        rulesets: ['owasp', 'malware', 'privacy'],
      };
      
      const scan = await prisma.scan.create({
        data: {
          extension_id: extension.id,
          type: scanType,
          status: 'pending',
          config_json: scanConfig as any,
          manifest_hash: hash,
          analyzer_version: config.ANALYZER_VERSION,
          ruleset_version: config.RULESET_VERSION,
        },
      });
      
      const jobData: ScanJobData = {
        scanId: scan.id,
        extensionId: extension.id,
        filePath,
        scanType,
        config: {
          enableStatic: scanConfig.enable_static,
          enableRuntime: scanConfig.enable_runtime,
          enableNetwork: scanConfig.enable_network,
          enableDataFlow: scanConfig.enable_data_flow,
          enableLLM: scanConfig.enable_llm,
          runtimeTimeoutSeconds: scanConfig.runtime_timeout_seconds,
          maxFileSizeMb: scanConfig.max_file_size_mb,
          rulesets: scanConfig.rulesets,
        },
      };
      
      await addScanJob(jobData);
      
      return reply.code(202).send({
        scan_id: scan.id,
        extension_id: extension.id,
        status: 'pending',
        message: 'Scan queued successfully',
      });
    } catch (error) {
      logger_.error({ error }, 'Scan creation failed');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // GET /api/scans - List all scans with pagination
  fastify.get('/api/scans', async (request: FastifyRequest<{ 
    Querystring: { limit?: string; offset?: string; status?: string; type?: string };
  }>, _reply: FastifyReply) => {
    const { limit, offset } = paginationSchema.parse(request.query);
    const { status, type } = request.query;

    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = type;

    const [scans, total] = await Promise.all([
      prisma.scan.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { started_at: 'desc' },
        include: {
          extension: true,
          risk_scores: true,
        },
      }),
      prisma.scan.count({ where }),
    ]);

    return { scans, total, limit, offset };
  });

  // GET /api/scans/:id - Get single scan details
  fastify.get('/api/scans/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    if (!request.params.id) {
      return reply.code(400).send({ error: 'Scan ID is required' });
    }

    const scan = await prisma.scan.findUnique({
      where: { id: request.params.id },
      include: {
        extension: true,
        findings: { orderBy: { created_at: 'desc' } },
        evidence: { orderBy: { created_at: 'desc' } },
        network_events: { orderBy: { timestamp: 'desc' } },
        code_findings: { orderBy: { file_path: 'asc' } },
        data_flows: true,
        risk_scores: true,
        permission_risks: true,
      },
    });
    
    if (!scan) {
      return reply.code(404).send({ error: 'Scan not found' });
    }
    
    return scan;
  });

  // GET /api/scans/:id/findings - Paginated findings with filters
  fastify.get('/api/scans/:id/findings', async (request: FastifyRequest<{ 
    Params: { id: string };
    Querystring: { severity?: string; category?: string; limit?: string; offset?: string };
  }>, _reply: FastifyReply) => {
    const query = findingsQuerySchema.parse(request.query);
    
    const where: any = { scan_id: request.params.id };
    if (query.severity) where.severity = query.severity;
    if (query.category) where.category = query.category;
    
    const [findings, total] = await Promise.all([
      prisma.finding.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: { created_at: 'desc' },
      }),
      prisma.finding.count({ where }),
    ]);
    
    return { findings, total, limit: query.limit, offset: query.offset };
  });

  // GET /api/scans/:id/report - Full exportable report
  fastify.get('/api/scans/:id/report', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const scan = await prisma.scan.findUnique({
      where: { id: request.params.id },
      include: {
        extension: true,
        findings: { orderBy: { created_at: 'desc' } },
        evidence: { orderBy: { created_at: 'desc' } },
        network_events: { orderBy: { timestamp: 'desc' } },
        code_findings: { orderBy: { file_path: 'asc' } },
        data_flows: true,
        risk_scores: true,
        permission_risks: true,
      },
    });
    
    if (!scan) {
      return reply.code(404).send({ error: 'Scan not found' });
    }
    
    const report = {
      scan_id: scan.id,
      generated_at: new Date().toISOString(),
      extension: scan.extension,
      scan: {
        id: scan.id,
        type: scan.type,
        status: scan.status,
        started_at: scan.started_at,
        completed_at: scan.completed_at,
        analyzer_version: scan.analyzer_version,
        ruleset_version: scan.ruleset_version,
      },
      manifest_analysis: scan.permission_risks,
      findings: scan.findings,
      evidence: scan.evidence,
      network_events: scan.network_events,
      code_findings: scan.code_findings,
      data_flows: scan.data_flows,
      risk_scores: scan.risk_scores,
      limitations: [
        'Static analysis cannot confirm runtime behavior',
        scan.type === 'sandbox' 
          ? 'Dynamic analysis completed in isolated browser sandbox'
          : 'Dynamic analysis was not performed (enable sandbox mode for runtime analysis)',
        'Network analysis limited to static URL extraction for non-sandbox scans',
        'Data flow analysis is heuristic-based',
        'LLM analysis not enabled',
      ],
    };
    
    reply.header('Content-Type', 'application/json');
    return report;
  });

  // GET /api/extensions - List extensions with search and pagination
  fastify.get('/api/extensions', async (request: FastifyRequest<{ 
    Querystring: { limit?: string; offset?: string; search?: string };
  }>, _reply: FastifyReply) => {
    const { limit, offset, search } = paginationSchema.parse(request.query);
    
    const where = search ? {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { hash: { contains: search } },
      ],
    } : {};
    
    const [extensions, total] = await Promise.all([
      prisma.extension.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { created_at: 'desc' },
        include: {
          scans: {
            take: 1,
            orderBy: { started_at: 'desc' },
            include: { risk_scores: true },
          },
        },
      }),
      prisma.extension.count({ where }),
    ]);
    
    return { extensions, total, limit, offset };
  });

  // GET /api/extensions/:id - Single extension with scan history
  fastify.get('/api/extensions/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const extension = await prisma.extension.findUnique({
      where: { id: request.params.id },
      include: {
        scans: {
          orderBy: { started_at: 'desc' },
          take: 10,
          include: { risk_scores: true, findings: true },
        },
      },
    });
    
    if (!extension) {
      return reply.code(404).send({ error: 'Extension not found' });
    }
    
    return extension;
  });

  // DELETE /api/scans/:id - Delete scan record safely
  fastify.delete('/api/scans/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const scan = await prisma.scan.findUnique({
      where: { id: request.params.id },
    });

    if (!scan) {
      return reply.code(404).send({ error: 'Scan not found' });
    }

    // Try to remove job from BullMQ queue if pending
    try {
      const job = await scanQueue.getJob(scan.id);
      if (job) {
        await job.remove();
      }
    } catch {}

    await prisma.scan.delete({ where: { id: request.params.id } });
    return { success: true };
  });
}