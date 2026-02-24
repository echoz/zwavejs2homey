declare const require: (id: string) => unknown;

const fs = require('node:fs') as {
  readFileSync(path: string, encoding: string): string;
};

import type { HaExtractedDiscoveryInputV1 } from './translate-extracted-discovery';
import {
  HaExtractedTranslationError,
  assertHaExtractedDiscoveryInputV1,
} from './translate-extracted-discovery';

export class HaExtractedDiscoveryArtifactError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
  ) {
    super(message);
    this.name = 'HaExtractedDiscoveryArtifactError';
  }
}

export function loadHaExtractedDiscoveryArtifact(filePath: string): HaExtractedDiscoveryInputV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse/read error';
    throw new HaExtractedDiscoveryArtifactError(
      `Failed to read or parse extracted HA discovery artifact: ${message}`,
      filePath,
    );
  }

  try {
    assertHaExtractedDiscoveryInputV1(parsed);
  } catch (error) {
    if (error instanceof HaExtractedTranslationError) {
      throw new HaExtractedDiscoveryArtifactError(error.message, filePath);
    }
    throw error;
  }

  return parsed;
}
