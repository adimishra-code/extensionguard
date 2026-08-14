import { NetworkEvent, Evidence, Confidence, Severity } from '@extension-guard/shared';
import { logger } from '../utils/logger';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { writeFileSync, rmSync, existsSync } from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import AdmZip from 'adm-zip';

export interface SandboxAnalysisResult {
  networkEvents: NetworkEvent[];
  evidences: Evidence[];
  errors: string[];
}

const SYNTHETIC_SITES: Record<string, {
  pages: Array<{ path: string; title: string; html: string }>;
}> = {
  'fake-mail.local': {
    pages: [
      { path: '/inbox', title: 'Inbox', html: '<h1>Inbox</h1><div class="email">From: test@example.com<br>Subject: Hello World<br>Body: This is a test email with sensitive data: user123@example.com, password: secret123</div>' },
      { path: '/compose', title: 'Compose Email', html: '<h1>Compose Email</h1><input type="text" id="to" placeholder="To:"><input type="text" id="subject" placeholder="Subject:"><textarea id="body"></textarea><button id="send">Send</button>' }
    ]
  },
  'fake-bank.local': {
    pages: [
      { path: '/', title: 'Bank Login', html: '<h1>Fake Bank</h1><form id="login"><input type="text" id="username" placeholder="Username"><input type="password" id="password" placeholder="Password"><button type="submit">Login</button></form>' },
      { path: '/account', title: 'Account Details', html: '<h1>Account Overview</h1><div class="account-info">Account: ****1234<br>Balance: $5,432.10<br>Email: user@example.com</div>' }
    ]
  },
  'fake-social.local': {
    pages: [
      { path: '/', title: 'Social Network', html: '<h1>Fake Social</h1><div class="post" data-userid="user456">Hello world! My email is friend@example.com</div><div class="post" data-userid="user789">Just had lunch at 123 Main St</div>' }
    ]
  },
  'fake-health.local': {
    pages: [
      { path: '/', title: 'Health Portal', html: '<h1>Health Portal</h1><div class="patient-info">Patient: John Doe<br>MRN: ABC123456<br>Last Visit: 2026-08-01<br>Prescription: Metformin 500mg</div>' }
    ]
  },
  'fake-documents.local': {
    pages: [
      { path: '/', title: 'Document Portal', html: '<h1>Documents</h1><div class="document" data-docid="doc789" data-sensitive="true">CONFIDENTIAL: Project Extension Guard - Internal Use Only</div>' }
    ]
  }
};

function getSyntheticSiteHtml(site: string, path: string): string {
  const siteConfig = SYNTHETIC_SITES[site];
  if (!siteConfig) return '<h1>Site Not Found</h1>';
  
  const page = siteConfig.pages.find(p => p.path === path) || siteConfig.pages[0];
  if (!page) return '<h1>Page Not Found</h1>';
  
  return page.html;
}

function isSyntheticDomain(domain: string): boolean {
  return Object.keys(SYNTHETIC_SITES).includes(domain);
}

function getSyntheticSiteInfo(domain: string): { category: string; risk: Severity } | null {
  const siteMap: Record<string, { category: string; risk: Severity }> = {
    'fake-mail.local': { category: 'email', risk: 'high' },
    'fake-bank.local': { category: 'banking', risk: 'critical' },
    'fake-social.local': { category: 'social', risk: 'medium' },
    'fake-health.local': { category: 'healthcare', risk: 'high' },
    'fake-documents.local': { category: 'documents', risk: 'medium' }
  };
  
  return siteMap[domain] || null;
}

export async function analyzeSandbox(
  scanId: string,
  extensionPath: string,
  options: {
    timeoutSeconds?: number;
  } = {}
): Promise<SandboxAnalysisResult> {
  const logger_ = logger.child({ scanId, service: 'sandbox-analyzer' });
  const networkEvents: NetworkEvent[] = [];
  const evidences: Evidence[] = [];
  const errors: string[] = [];
  
  let evidenceCounter = 0;
  function nextEvidenceId() {
    return `E-${scanId.slice(0, 8)}-${(++evidenceCounter).toString().padStart(3, '0')}`;
  }
  
  let networkCounter = 0;
  function nextNetworkId() {
    return `N-${scanId.slice(0, 8)}-${(++networkCounter).toString().padStart(3, '0')}`;
  }
  
  const timeoutMs = (options.timeoutSeconds || 120) * 1000;
  
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  
  try {
    logger_.info('Launching browser for sandbox analysis');
    
    // Extract extension to a temporary directory
    const tempDir = path.join(tmpdir(), `extension-guard-sandbox-${scanId}`);
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    
    // Unzip extension
    const zip = new AdmZip(extensionPath);
    zip.extractAllTo(tempDir, true);
    
    // Launch browser with extension loaded
    browser = await chromium.launch({
      headless: true,
      args: [
        `--disable-extensions-except=${tempDir}`,
        `--load-extension=${tempDir}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });
    
    // Create isolated context
    context = await browser.newContext({
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true,
      bypassCSP: true
    });
    
    // Register route handler to serve synthetic sites
    await context.route('**/*', async (route, request) => {
      const url = request.url();
      try {
        const u = new URL(url);
        const domain = u.hostname;
        
        if (isSyntheticDomain(domain)) {
          const path = u.pathname;
          const html = getSyntheticSiteHtml(domain, path);
          
          await route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: html
          });
          
          // Log the request as a network event
          const eventId = nextNetworkId();
          const siteInfo = getSyntheticSiteInfo(domain);
          
          networkEvents.push({
            id: eventId,
            scan_id: scanId,
            url: url,
            domain: domain,
            method: request.method(),
            request_headers: {},
            response_headers: {}, // Simplified for now
            request_size: 0,
            response_size: Buffer.byteLength(html),
            timestamp: new Date().toISOString(),
            initiator: '',
            stack_trace: '',
            is_third_party: false,
            risk_level: siteInfo?.risk || 'low',
            classification: siteInfo ? siteInfo.category as 'first_party' | 'third_party' | 'suspicious' | 'tracking' | 'analytics' | 'cdn' | 'api' : 'unknown'
          });
          
          return;
        }
        
        await route.continue();
      } catch (err) {
        logger_.warn({ url, error: err }, 'Error in route handler');
        await route.continue(); // Fallback to actual request
      }
    });
    
    // Create a new page for testing
    const page = await context.newPage();
    
    // Set up console message collection
    page.on('console', (msg) => {
      logger_.debug({ text: msg.text(), type: msg.type() }, 'Browser console message');
    });
    
    // Set up page error handling
    page.on('pageerror', (err) => {
      logger_.error({ error: err.message }, 'Page error');
    });
    
    // Navigate to a blank page first to ensure extension is loaded
    await page.goto('about:blank', { waitUntil: 'networkidle' });
    
    // Wait a bit for extension to initialize
    await page.waitForTimeout(2000);
    
    // Now test each synthetic site
    const testSites = Object.keys(SYNTHETIC_SITES);
    
    for (const site of testSites) {
      logger_.info({ site }, 'Testing extension on synthetic site');
      
      // Try to visit the site
      try {
        await page.goto(`http://${site}/`, { 
          waitUntil: 'networkidle',
          timeout: 10000
        });
        
        // Wait for any extension content scripts to run
        await page.waitForTimeout(3000);
        
        // Check if extension modified the page
        const pageTitle = await page.title();
        const pageContent = await page.content();
        
        // Create evidence if extension modified the page
        if (pageContent !== getSyntheticSiteHtml(site, '/')) {
          const evidenceId = nextEvidenceId();
          evidences.push({
            id: evidenceId,
            scan_id: scanId,
            type: 'runtime',
            source: 'content_script',
            description: `Extension modified content on ${site}`,
            raw_data: {
              site: site,
              original_length: getSyntheticSiteHtml(site, '/').length,
              modified_length: pageContent.length,
              title: pageTitle
            },
            confidence: 'confirmed',
            created_at: new Date().toISOString()
          });
        }
        
      } catch (err) {
        logger_.warn({ site, error: err.message }, 'Failed to load synthetic site');
        // Continue with other sites
      }
    }
    
    // Test interaction with forms if extension might be stealing data
    for (const site of testSites) {
      try {
        await page.goto(`http://${site}/`, { waitUntil: 'networkidle' });
        
        // Check if there are forms to interact with
        const forms = await page.$$('form');
        if (forms.length > 0) {
          logger_.info({ site, formCount: forms.length }, 'Found forms to test');
          
          // Fill out a form with test data
          const testData = {
            username: 'testuser',
            password: 'testpass123',
            email: 'test@example.com',
            amount: '100.00'
          };
          
          // Try to fill common form fields
          for (const [field, value] of Object.entries(testData)) {
            const selector = `input[name="${field}"], input[id="${field}"], input[placeholder*="${field}" i]`;
            const element = await page.$(selector);
            if (element) {
              await element.fill(value);
              logger_.debug({ site, field, value }, 'Filled form field');
            }
          }
          
          // Submit form if there's a submit button
          const submitBtn = await page.$('button[type="submit"], input[type="submit"], button:has-text("Submit"), button:has-text("Login")');
          if (submitBtn) {
            await submitBtn.click();
            await page.waitForTimeout(2000); // Wait for response
          }
        }
        
      } catch (err) {
        logger_.warn({ site, error: err.message }, 'Error testing forms');
      }
    }
    
    // Wait a bit more to catch any delayed behavior
    await page.waitForTimeout(5000);
    
    // Close page and context
    await page.close();
    
    logger_.info({ 
      networkEventsCount: networkEvents.length,
      evidenceCount: evidences.length 
    }, 'Sandbox analysis complete');
    
    return {
      networkEvents,
      evidences,
      errors
    };
    
  } catch (error) {
    logger_.error({ error }, 'Sandbox analysis failed');
    errors.push(error instanceof Error ? error.message : 'Unknown error');
    return {
      networkEvents,
      evidences,
      errors
    };
  } finally {
    // Clean up
    try {
      if (context) await context.close();
      if (browser) await browser.close();
      
      // Clean up temporary extension directory
const tempDir = path.join(tmpdir(), `extension-guard-sandbox-${scanId}`);
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (cleanupError) {
      logger_.warn({ error: cleanupError }, 'Error during cleanup');
    }
  }
}