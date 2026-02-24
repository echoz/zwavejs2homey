declare const require: (id: string) => unknown;

const fs = require('node:fs') as {
  readFileSync(path: string, encoding: string): string;
};

import type { MappingRule } from '../../rules/types';
import { RuleFileLoadError, validateJsonRuleArray } from '../../compiler/rule-validation';

export interface HaDerivedGeneratedRuleArtifactV1 {
  schemaVersion: 'ha-derived-rules/v1';
  source: {
    upstream: 'home-assistant';
    component: 'zwave_js';
    generatedAt: string;
    sourceRef?: string;
  };
  rules: MappingRule[];
}

export class HaGeneratedRuleArtifactError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
  ) {
    super(message);
    this.name = 'HaGeneratedRuleArtifactError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validateTopLevelShape(
  parsed: unknown,
  filePath: string,
): asserts parsed is Omit<HaDerivedGeneratedRuleArtifactV1, 'rules'> & { rules: unknown } {
  if (!isObject(parsed)) {
    throw new HaGeneratedRuleArtifactError(
      'Generated HA rule artifact must be an object',
      filePath,
    );
  }
  if (parsed.schemaVersion !== 'ha-derived-rules/v1') {
    throw new HaGeneratedRuleArtifactError(
      `Unsupported HA rule artifact schemaVersion: ${String(parsed.schemaVersion)}`,
      filePath,
    );
  }
  if (!isObject(parsed.source)) {
    throw new HaGeneratedRuleArtifactError(
      'Generated HA rule artifact is missing source metadata',
      filePath,
    );
  }
  if (parsed.source.upstream !== 'home-assistant' || parsed.source.component !== 'zwave_js') {
    throw new HaGeneratedRuleArtifactError(
      'Generated HA rule artifact source must be home-assistant/zwave_js',
      filePath,
    );
  }
  if (typeof parsed.source.generatedAt !== 'string' || parsed.source.generatedAt.length === 0) {
    throw new HaGeneratedRuleArtifactError(
      'Generated HA rule artifact source.generatedAt must be a non-empty string',
      filePath,
    );
  }
}

export function loadHaDerivedGeneratedRuleArtifact(
  filePath: string,
): HaDerivedGeneratedRuleArtifactV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse/read error';
    throw new HaGeneratedRuleArtifactError(
      `Failed to read or parse generated HA rule artifact: ${message}`,
      filePath,
    );
  }

  validateTopLevelShape(parsed, filePath);

  let rules: MappingRule[];
  try {
    rules = validateJsonRuleArray(parsed.rules, filePath);
  } catch (error) {
    if (error instanceof RuleFileLoadError) {
      throw new HaGeneratedRuleArtifactError(error.message, filePath);
    }
    throw error;
  }

  // Enforce ha-derived layer for generated artifacts in v1.
  for (const rule of rules) {
    if (rule.layer !== 'ha-derived') {
      throw new HaGeneratedRuleArtifactError(
        `Generated HA rule artifact contains non-ha-derived rule: ${rule.ruleId} (${rule.layer})`,
        filePath,
      );
    }
  }

  return {
    schemaVersion: 'ha-derived-rules/v1',
    source: {
      upstream: 'home-assistant',
      component: 'zwave_js',
      generatedAt: parsed.source.generatedAt,
      sourceRef: typeof parsed.source.sourceRef === 'string' ? parsed.source.sourceRef : undefined,
    },
    rules,
  };
}
