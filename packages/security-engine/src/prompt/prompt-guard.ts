/**
 * @module prompt-guard
 * Prompt security analysis for the VOLT OS Security Engine.
 *
 * Detects and mitigates prompt injection attacks, jailbreak attempts,
 * context poisoning, tool injection, and data exfiltration attempts.
 * Each detection produces structured evidence for audit trails.
 */

import pino from 'pino';
import type { PromptAnalysis, PromptThreat } from '../types.js';

const logger = pino({ name: 'volt-os:security:prompt-guard' });

/** Patterns that indicate prompt injection attacks. */
const INJECTION_PATTERNS: Array<{ pattern: RegExp; confidence: number; evidence: string }> = [
  { pattern: /ignore\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions|prompts|rules)/i, confidence: 0.9, evidence: 'instruction override attempt' },
  { pattern: /(?:you\s+are\s+now|act\s+as|pretend\s+(?:to\s+be|you\s+are))/i, confidence: 0.85, evidence: 'role hijacking attempt' },
  { pattern: /(?:system\s*prompt|system\s*message)\s*(?:[:=]|is)\s*/i, confidence: 0.9, evidence: 'system prompt manipulation' },
  { pattern: /\b(?:DAN|do\s+anything\s+now)\b/i, confidence: 0.95, evidence: 'DAN jailbreak reference' },
  { pattern: /\b(?:jailbreak|unlocked|unrestricted)\s+(?:mode|version)/i, confidence: 0.9, evidence: 'jailbreak mode request' },
  { pattern: /\[(?:INST|SYS|SYSTEM)\]/i, confidence: 0.85, evidence: 'formatted instruction injection' },
  { pattern: /<\|(?:im_start|im_end|endoftext)\|>/i, confidence: 0.9, evidence: 'tokenizer injection attempt' },
  { pattern: /(?:IMPORTANT|URGENT|CRITICAL)\s*:\s*(?:ignore|override|disregard)/i, confidence: 0.88, evidence: 'priority override injection' },
];

/** Patterns that indicate data exfiltration attempts. */
const EXFILTRATION_PATTERNS: Array<{ pattern: RegExp; confidence: number; evidence: string }> = [
  { pattern: /(?:send|transmit|upload|exfiltrate|leak)\s+(?:all\s+)?(?:data|secrets?|credentials?|tokens?|keys?|passwords?)/i, confidence: 0.9, evidence: 'data exfiltration instruction' },
  { pattern: /(?:output|print|echo|reveal|show)\s+(?:the\s+)?(?:secret|api[_\s-]?key|token|password|credential)/i, confidence: 0.88, evidence: 'secret extraction attempt' },
  { pattern: /(?:curl|wget|fetch|http|post)\s+(?:.*(?:token|key|secret|credential|password))/i, confidence: 0.85, evidence: 'HTTP exfiltration attempt' },
  { pattern: /(?:base64|btoa|atob)\s*\(\s*(?:.*(?:secret|key|token|password))/i, confidence: 0.8, evidence: 'encoded exfiltration attempt' },
  { pattern: /(?:decode|decodeURI|decodeURIComponent)\s*\(\s*(?:.*(?:secret|key|token))/i, confidence: 0.75, evidence: 'URL-encoded exfiltration' },
  { pattern: /(?:read|cat|load)\s+(?:\/etc\/(?:passwd|shadow)|.*\.env|.*\.key)/i, confidence: 0.9, evidence: 'file-based data exfiltration' },
];

/** Patterns that indicate jailbreak attempts. */
const JAILBREAK_PATTERNS: Array<{ pattern: RegExp; confidence: number; evidence: string }> = [
  { pattern: /\b(?:DAN|DEVIL|STAN|KEVIN)\s*(?:mode)?\b/i, confidence: 0.92, evidence: 'named jailbreak persona' },
  { pattern: /(?:developer|debug|admin)\s+mode\s+(?:activated|enabled|on)/i, confidence: 0.88, evidence: 'developer mode activation' },
  { pattern: /(?:hypothetically|theoretically|in\s+a?\s?(?:fiction|story|game|simulation))\s+(?:what|how|if)/i, confidence: 0.7, evidence: 'hypothetical framing bypass' },
  { pattern: /\b(?:opposite\s+day|reverse\s+psychology)\b/i, confidence: 0.65, evidence: 'logic reversal attempt' },
  { pattern: /(?:you\s+must|you\s+will|you\s+shall)\s+(?:always|never|only)\s+(?:override|ignore|bypass)/i, confidence: 0.85, evidence: 'imperative bypass attempt' },
  { pattern: /(?:from\s+now\s+on|starting\s+now|henceforth)\s+(?:you\s+)?(?:are|will|must)/i, confidence: 0.75, evidence: 'state change instruction' },
];

/** Patterns that indicate tool/function injection. */
const TOOL_INJECTION_PATTERNS: Array<{ pattern: RegExp; confidence: number; evidence: string }> = [
  { pattern: /(?:call|invoke|execute|run)\s+(?:function|tool|method)\s*[\(:{]/i, confidence: 0.85, evidence: 'direct function invocation' },
  { pattern: /\{\{.*(?:system|exec|eval|spawn|process)\..*\}\}/i, confidence: 0.9, evidence: 'template-based tool injection' },
  { pattern: /```(?:json|javascript|typescript|python)\s*\n?\s*\{[^`]*"action"\s*:/i, confidence: 0.8, evidence: 'structured tool call injection' },
  { pattern: /<tool_call>|<function_call>|<action>/i, confidence: 0.88, evidence: 'XML-based tool injection' },
  { pattern: /"(?:type|function|tool)"\s*:\s*"(?:bash|exec|shell|system|eval)"/i, confidence: 0.92, evidence: 'JSON tool injection with dangerous function' },
];

/**
 * Prompt security guard that analyzes and sanitizes prompts.
 */
export class PromptGuard {
  /**
   * Analyze a prompt for all threat categories.
   *
   * @param prompt - The prompt text to analyze.
   * @returns A PromptAnalysis with safety verdict and detected threats.
   */
  analyze(prompt: string): PromptAnalysis {
    const threats: PromptThreat[] = [];

    threats.push(...this.checkInjection(prompt));
    threats.push(...this.checkToolInjection(prompt));
    threats.push(...this.checkContextPoisoning(prompt));
    threats.push(...this.checkJailbreak(prompt));
    threats.push(...this.checkDataExfiltration(prompt));

    const safe = threats.length === 0;

    if (!safe) {
      logger.warn(
        { threatCount: threats.length, types: threats.map((t) => t.type) },
        'Prompt threats detected',
      );
    }

    return {
      safe,
      threats,
    };
  }

  /**
   * Sanitize a prompt by identifying and documenting threats.
   *
   * @param prompt - The prompt text to sanitize.
   * @returns The sanitized prompt and detected threats.
   */
  sanitize(prompt: string): { sanitized: string; threats: PromptThreat[] } {
    const analysis = this.analyze(prompt);
    let sanitized = prompt;

    // Remove known injection patterns
    for (const injection of INJECTION_PATTERNS) {
      injection.pattern.lastIndex = 0;
      sanitized = sanitized.replace(injection.pattern, '[REMOVED]');
    }
    for (const jailbreak of JAILBREAK_PATTERNS) {
      jailbreak.pattern.lastIndex = 0;
      sanitized = sanitized.replace(jailbreak.pattern, '[REMOVED]');
    }

    return {
      sanitized,
      threats: analysis.threats,
    };
  }

  /**
   * Check for data exfiltration attempts.
   *
   * @param prompt - The prompt text to analyze.
   * @returns Array of detected exfiltration threats.
   */
  checkDataExfiltration(prompt: string): PromptThreat[] {
    return this.matchPatterns(prompt, EXFILTRATION_PATTERNS, 'data_exfiltration');
  }

  /**
   * Check for jailbreak attempts.
   *
   * @param prompt - The prompt text to analyze.
   * @returns Array of detected jailbreak threats.
   */
  checkJailbreak(prompt: string): PromptThreat[] {
    return this.matchPatterns(prompt, JAILBREAK_PATTERNS, 'jailbreak');
  }

  /**
   * Check for tool/function injection attempts.
   *
   * @param prompt - The prompt text to analyze.
   * @returns Array of detected tool injection threats.
   */
  checkToolInjection(prompt: string): PromptThreat[] {
    return this.matchPatterns(prompt, TOOL_INJECTION_PATTERNS, 'tool_injection');
  }

  /**
   * Check for prompt injection attacks.
   *
   * @param prompt - The prompt text to analyze.
   * @returns Array of detected injection threats.
   */
  checkInjection(prompt: string): PromptThreat[] {
    return this.matchPatterns(prompt, INJECTION_PATTERNS, 'injection');
  }

  /**
   * Check for context poisoning attempts.
   *
   * @param prompt - The prompt text to analyze.
   * @returns Array of detected context poisoning threats.
   */
  checkContextPoisoning(prompt: string): PromptThreat[] {
    const threats: PromptThreat[] = [];
    const patterns: Array<{ pattern: RegExp; confidence: number; evidence: string }> = [
      { pattern: /(?:assistant|system)\s*(?:override|replace|update)\s*[:=]/i, confidence: 0.85, evidence: 'context override attempt' },
      { pattern: /\b(?:forget|erase|clear|reset)\s+(?:all\s+)?(?:context|memory|history|previous)/i, confidence: 0.8, evidence: 'memory manipulation attempt' },
      { pattern: /(?:new|updated|revised)\s+(?:system\s+)?(?:instructions?|rules?|guidelines?)\s*[:=]/i, confidence: 0.82, evidence: 'instruction replacement' },
    ];

    for (const p of patterns) {
      p.pattern.lastIndex = 0;
      const match = p.pattern.exec(prompt);
      if (match) {
        threats.push({
          type: 'context_poisoning',
          confidence: p.confidence,
          evidence: `${p.evidence}: "${match[0]}"`,
          recommendation: 'Block prompt and alert administrator',
        });
      }
    }

    return threats;
  }

  /**
   * Match prompt content against a set of threat patterns.
   *
   * @private
   */
  private matchPatterns(
    prompt: string,
    patterns: Array<{ pattern: RegExp; confidence: number; evidence: string }>,
    type: PromptThreat['type'],
  ): PromptThreat[] {
    const threats: PromptThreat[] = [];

    for (const p of patterns) {
      p.pattern.lastIndex = 0;
      const match = p.pattern.exec(prompt);
      if (match) {
        threats.push({
          type,
          confidence: p.confidence,
          evidence: `${p.evidence}: "${match[0].substring(0, 60)}"`,
          recommendation: this.getRecommendation(type),
        });
      }
    }

    return threats;
  }

  /**
   * Get a recommendation for a threat type.
   *
   * @private
   */
  private getRecommendation(type: PromptThreat['type']): string {
    switch (type) {
      case 'injection':
        return 'Block prompt and reject request';
      case 'tool_injection':
        return 'Block prompt and log security event';
      case 'context_poisoning':
        return 'Block prompt and alert administrator';
      case 'jailbreak':
        return 'Block prompt and flag subject for review';
      case 'data_exfiltration':
        return 'Block prompt and emit critical security event';
    }
  }
}
