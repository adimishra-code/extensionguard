import {
  LLMAnalysisInput,
  LLMAnalysisOutput,
  Severity,
} from '@extension-guard/shared';
import { logger } from '../utils/logger';
import { config } from '../config';

export class LLMAnalyzerService {
  /**
   * Run LLM-powered security assessment comparing claimed purpose vs observed behavior
   */
  async analyze(input: LLMAnalysisInput): Promise<{
    output: LLMAnalysisOutput;
    provider: string;
    model: string;
    purposeMismatchScore: number;
  }> {
    const logger_ = logger.child({ service: 'llm-analyzer', extension: input.extension.name });

    const geminiKey = process.env.GEMINI_API_KEY || config.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY || config.OPENAI_API_KEY;
    const openrouterKey = process.env.OPENROUTER_API_KEY || config.OPENROUTER_API_KEY;

    if (openrouterKey) {
      try {
        const result = await this.analyzeWithOpenRouter(input, openrouterKey);
        if (result) {
          logger_.info('Completed analysis with OpenRouter');
          return {
            output: result,
            provider: 'openrouter',
            model: process.env.OPENROUTER_MODEL || config.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct',
            purposeMismatchScore: this.calculateMismatchScore(result),
          };
        }
      } catch (err) {
        logger_.warn({ err }, 'OpenRouter analysis failed, falling back to next provider');
      }
    }

    if (geminiKey) {
      try {
        const result = await this.analyzeWithGemini(input, geminiKey);
        if (result) {
          logger_.info('Completed analysis with Gemini');
          return {
            output: result,
            provider: 'google-gemini',
            model: config.LLM_MODEL || 'gemini-1.5-flash',
            purposeMismatchScore: this.calculateMismatchScore(result),
          };
        }
      } catch (err) {
        logger_.warn({ err }, 'Gemini analysis failed, falling back to heuristic engine');
      }
    }

    if (openaiKey) {
      try {
        const result = await this.analyzeWithOpenAI(input, openaiKey);
        if (result) {
          logger_.info('Completed analysis with OpenAI');
          return {
            output: result,
            provider: 'openai',
            model: 'gpt-4o-mini',
            purposeMismatchScore: this.calculateMismatchScore(result),
          };
        }
      } catch (err) {
        logger_.warn({ err }, 'OpenAI analysis failed, falling back to heuristic engine');
      }
    }

    // High-accuracy Semantic Heuristic Reasoner
    logger_.info('Executing semantic security reasoning heuristic engine');
    const heuristicResult = this.analyzeWithHeuristics(input);
    return {
      output: heuristicResult,
      provider: 'semantic-heuristic-v1',
      model: 'rule-based-reasoner',
      purposeMismatchScore: this.calculateMismatchScore(heuristicResult),
    };
  }

  /**
   * Gemini API integration
   */
  private async analyzeWithGemini(input: LLMAnalysisInput, apiKey: string): Promise<LLMAnalysisOutput | null> {
    const model = config.LLM_MODEL || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const prompt = this.buildPrompt(input);

    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      throw new Error(`Gemini API returned HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json() as any;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    return JSON.parse(text) as LLMAnalysisOutput;
  }

  /**
   * OpenAI API integration
   */
  private async analyzeWithOpenAI(input: LLMAnalysisInput, apiKey: string): Promise<LLMAnalysisOutput | null> {
    const url = 'https://api.openai.com/v1/chat/completions';
    const prompt = this.buildPrompt(input);

    const body = {
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'You are a principal browser extension security analyst. Output valid JSON adhering to the required schema.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      throw new Error(`OpenAI API returned HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json() as any;
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    return JSON.parse(content) as LLMAnalysisOutput;
  }

  /**
   * OpenRouter API integration (Supports Llama 3.3, DeepSeek, Claude, Gemini via OpenRouter)
   */
  private async analyzeWithOpenRouter(input: LLMAnalysisInput, apiKey: string): Promise<LLMAnalysisOutput | null> {
    const url = 'https://openrouter.ai/api/v1/chat/completions';
    const model = process.env.OPENROUTER_MODEL || config.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct';
    const prompt = this.buildPrompt(input);

    const body = {
      model,
      response_format: { type: 'json_object' },
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'You are a principal browser extension security analyst. You must evaluate the extension code, permissions, and network activity vs claimed purpose. Output strictly valid JSON adhering to the required schema.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://extensionguard.io',
        'X-Title': 'Extension Guard Security Platform',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      throw new Error(`OpenRouter API returned HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json() as any;
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    const cleanJson = content.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    return JSON.parse(cleanJson) as LLMAnalysisOutput;
  }

  /**
   * Semantic Heuristic Reasoner
   */
  public analyzeWithHeuristics(input: LLMAnalysisInput): LLMAnalysisOutput {
    const nameLower = (input.extension.name || '').toLowerCase();
    const purposeLower = (input.purpose || '').toLowerCase();
    const combinedDesc = `${nameLower} ${purposeLower}`;

    const mismatches: Array<{ description: string; evidence_ids: string[] }> = [];
    const keyFindings: Array<{ claim: string; evidence_ids: string[]; severity: Severity }> = [];
    const recommendations: string[] = [];

    // Analyze high risk permissions vs purpose
    const hasCookies = input.permissions.some(p => p.permission === 'cookies');
    const hasTabs = input.permissions.some(p => p.permission === 'tabs');
    const hasWebRequest = input.permissions.some(p => p.permission === 'webRequest' || p.permission === 'webRequestBlocking');
    const hasAllUrls = input.permissions.some(p => p.permission === '<all_urls>' || p.permission === '*://*/*');
    const hasClipboard = input.permissions.some(p => p.permission.toLowerCase().includes('clipboard'));

    const isSimpleUtility = /calc|clock|timer|font|color|zoom|scroll|wallpaper|notepad|converter|weather|dark\s*mode/.test(combinedDesc);
    const isAdblocker = /adblock|ublock|blocker|privacy|firewall/.test(combinedDesc);

    if (isSimpleUtility && (hasCookies || hasAllUrls || hasClipboard || hasWebRequest)) {
      mismatches.push({
        description: `Utility extension "${input.extension.name}" requests broad cookie, clipboard, or network permissions which are unnecessary for its declared utility function.`,
        evidence_ids: input.permissions.map(p => p.id),
      });
      keyFindings.push({
        claim: 'Disproportionate permissions requested for basic utility functionality',
        evidence_ids: input.permissions.map(p => p.id),
        severity: 'high',
      });
      recommendations.push('Remove broad host permissions and replace with activeTab if interaction is only needed upon user click.');
    }

    if (isAdblocker && hasTabs && hasCookies) {
      keyFindings.push({
        claim: 'Ad blocker extension requests cookie read access across all tabs',
        evidence_ids: input.permissions.map(p => p.id),
        severity: 'medium',
      });
    }

    // Check code execution vectors
    const rceFindings = input.code_findings.filter(c => c.category === 'remote_code_execution');
    if (rceFindings.length > 0) {
      keyFindings.push({
        claim: `Detected ${rceFindings.length} instance(s) of dynamic code evaluation (eval / Function constructor) violating MV3 security principles`,
        evidence_ids: rceFindings.map(c => c.id),
        severity: 'high',
      });
      recommendations.push('Refactor dynamic eval() calls into static procedural logic to comply with Content Security Policy.');
    }

    // Check exfiltration vectors
    const exfilFindings = input.code_findings.filter(c => c.category === 'network_exfiltration');
    if (exfilFindings.length > 0) {
      keyFindings.push({
        claim: `Code contains ${exfilFindings.length} external telemetry or data collection endpoints`,
        evidence_ids: exfilFindings.map(c => c.id),
        severity: 'medium',
      });
      if (input.privacy_policy_summary && input.privacy_policy_summary.includes('no data')) {
        mismatches.push({
          description: 'Privacy policy claims zero data collection, but code actively initiates telemetry transmissions.',
          evidence_ids: exfilFindings.map(c => c.id),
        });
      }
    }

    // Check runtime sandbox network observations
    const thirdPartyNet = input.runtime_events.filter(e => e.is_third_party);
    if (thirdPartyNet.length > 0) {
      keyFindings.push({
        claim: `Extension made ${thirdPartyNet.length} unauthorized outbound requests during sandbox simulation`,
        evidence_ids: thirdPartyNet.map(e => e.id),
        severity: thirdPartyNet.some(e => e.risk_level === 'critical' || e.risk_level === 'high') ? 'critical' : 'medium',
      });
    }

    let overallSeverity: Severity = 'low';
    if (keyFindings.some(f => f.severity === 'critical') || mismatches.length >= 2) {
      overallSeverity = 'critical';
    } else if (keyFindings.some(f => f.severity === 'high') || mismatches.length >= 1) {
      overallSeverity = 'high';
    } else if (keyFindings.some(f => f.severity === 'medium')) {
      overallSeverity = 'medium';
    }

    if (recommendations.length === 0) {
      recommendations.push('Extension permissions and observed behaviors align within expected parameters for its declared category.');
    }

    const summary = mismatches.length > 0
      ? `Security assessment identified notable behavioral mismatches in "${input.extension.name}". The extension requests permissions and executes code patterns beyond what is justifiable for its declared functionality.`
      : `Security audit concluded that "${input.extension.name}" demonstrates behaviors largely consistent with its declared category.`;

    return {
      summary,
      risk_assessment: {
        severity: overallSeverity,
        confidence: 'likely',
      },
      key_findings: keyFindings,
      behavioral_mismatch: mismatches,
      recommended_actions: recommendations,
      uncertainties: [
        'Static code patterns may include bundled third-party libraries not executed during standard workflows.',
        'Dynamic behavior depends on DOM structure of visited pages during sandbox run.',
      ],
    };
  }

  public calculateMismatchScore(output: LLMAnalysisOutput): number {
    const count = output.behavioral_mismatch.length;
    if (count === 0) return 0;
    if (output.risk_assessment.severity === 'critical') return Math.min(100, 50 + count * 25);
    if (output.risk_assessment.severity === 'high') return Math.min(100, 35 + count * 20);
    return Math.min(100, count * 20);
  }

  private buildPrompt(input: LLMAnalysisInput): string {
    return `
You are an expert browser extension security analyst.
Analyze the following browser extension metadata, permissions, code findings, and observed network traffic.
Determine if there is a purpose mismatch (is it doing things beyond what it claims?) and evaluate risk.

EXTENSION:
Name: ${input.extension.name}
Version: ${input.extension.version}
Declared Purpose / Description: ${input.purpose || 'None specified'}
Privacy Policy Summary: ${input.privacy_policy_summary || 'None'}

DECLARED PERMISSIONS:
${JSON.stringify(input.permissions.map(p => ({ permission: p.permission, risk: p.risk_level })), null, 2)}

STATIC CODE FINDINGS:
${JSON.stringify(input.code_findings.slice(0, 20).map(c => ({ api: c.api, category: c.category, severity: c.severity, context: c.context })), null, 2)}

RUNTIME NETWORK EVENTS:
${JSON.stringify(input.runtime_events.slice(0, 15).map(e => ({ domain: e.domain, method: e.method, risk: e.risk_level })), null, 2)}

Return a JSON object conforming strictly to this structure:
{
  "summary": "2-3 sentences plain-English security summary",
  "risk_assessment": {
    "severity": "low" | "medium" | "high" | "critical",
    "confidence": "confirmed" | "likely" | "potential"
  },
  "key_findings": [
    { "claim": "Finding title", "evidence_ids": [], "severity": "low" | "medium" | "high" | "critical" }
  ],
  "behavioral_mismatch": [
    { "description": "Specific discrepancy between purpose and action", "evidence_ids": [] }
  ],
  "recommended_actions": [ "Action 1", "Action 2" ],
  "uncertainties": [ "Caveat 1" ]
}
`;
  }
}

export const llmAnalyzer = new LLMAnalyzerService();

