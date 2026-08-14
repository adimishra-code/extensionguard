import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma';
import { addScanJob, ScanJobData } from '../queue';
import { logger } from '../utils/logger';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join, extname } from 'path';
import { tmpdir } from 'os';
import { ScanType, ScanConfig } from '@extension-guard/shared';

const UPLOAD_DIR = join(tmpdir(), 'extension-guard-uploads');

async function saveUpload(file: any): Promise<{ path: string; hash: string; size: number }> {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  const chunks: Buffer[] = [];
  
  for await (const chunk of file.file) {
    chunks.push(chunk);
    hash.update(chunk);
  }
  
  const buffer = Buffer.concat(chunks);
  const fileHash = hash.digest('hex');
  const fileExt = extname(file.filename) || '.zip';
  const fileName = `${fileHash}${fileExt}`;
  const filePath = join(UPLOAD_DIR, fileName);
  
  mkdirSync(UPLOAD_DIR, { recursive: true });
  writeFileSync(filePath, buffer);
  
  return { path: filePath, hash: fileHash, size: buffer.length };
}

async function parseManifest(filePath: string): Promise<any> {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(filePath);
  const manifestEntry = zip.getEntry('manifest.json');
  
  if (!manifestEntry) {
    throw new Error('manifest.json not found in extension package');
  }
  
  return JSON.parse(manifestEntry.getData().toString('utf8'));
}

export async function scanRoutes(fastify: FastifyInstance) {
  fastify.post('/api/scans', async (request: FastifyRequest, reply: FastifyReply) => {
    const logger_ = logger.child({ route: 'POST /api/scans' });
    
    try {
      const data = await request.file();
      
      if (!data) {
        return reply.code(400).send({ error: 'No file uploaded' });
      }
      
      if (!data.filename.endsWith('.zip') && !data.filename.endsWith('.crx')) {
        return reply.code(400).send({ error: 'Only .zip and .crx files are supported' });
      }
      
      const { path: filePath, hash, size } = await saveUpload(data);
      logger_.info({ filename: data.filename, hash, size }, 'File uploaded');
      
      let manifest: any;
      try {
        manifest = await parseManifest(filePath);
      } catch (e) {
        rmSync(filePath, { force: true });
        return reply.code(400).send({ error: 'Invalid extension package: manifest.json not found' });
      }
      
      const extension = await prisma.extension.upsert({
        where: { hash },
        update: { last_scanned_at: new Date() },
        create: {
          name: manifest.name || 'Unknown',
          version: manifest.version || '0.0.0',
          browser: 'chrome',
          source: 'upload',
          hash,
          size_bytes: size,
          manifest_json: manifest,
        },
      });
      
      const scanType: ScanType = (request.body as any)?.scanType || 'quick';
      
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
          config_json: scanConfig,
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

  fastify.get('/api/scans/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
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

  fastify.get('/api/scans/:id/findings', async (request: FastifyRequest<{ 
    Params: { id: string };
    Querystring: { severity?: string; category?: string; limit?: string; offset?: string };
  }>, reply: FastifyReply) => {
    const { severity, category, limit = '50', offset = '0' } = request.query;
    
    const where: any = { scan_id: request.params.id };
    if (severity) where.severity = severity;
    if (category) where.category = category;
    
    const [findings, total] = await Promise.all([
      prisma.finding.findMany({
        where,
        take: parseInt(limit),
        skip: parseInt(offset),
        orderBy: { created_at: 'desc' },
      }),
      prisma.finding.count({ where }),
    ]);
    
    return { findings, total, limit: parseInt(limit), offset: parseInt(offset) };
  });

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

  fastify.get('/api/extensions', async (request: FastifyRequest<{ 
    Querystring: { limit?: string; offset?: string; search?: string };
  }>, reply: FastifyReply) => {
    const { limit = '20', offset = '0', search } = request.query;
    
    const where = search ? {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { hash: { contains: search } },
      ],
    } : {};
    
    const [extensions, total] = await Promise.all([
      prisma.extension.findMany({
        where,
        take: parseInt(limit),
        skip: parseInt(offset),
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
    
    return { extensions, total, limit: parseInt(limit), offset: parseInt(offset) };
  });

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

  fastify.delete('/api/scans/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    await prisma.scan.delete({ where: { id: request.params.id } });
    return { success: true };
  });
}