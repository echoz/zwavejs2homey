import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  createHomeyAuthoringVocabularyLookupV1,
  loadHomeyAuthoringVocabularyArtifact,
} = require('../packages/compiler/dist');

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_HOMEY_AUTHORING_VOCABULARY_FILE = path.join(
  REPO_ROOT,
  'rules',
  'homey-authoring-vocabulary.json',
);

function resolveFilePath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
}

export function resolveCompilerRuleVocabulary(vocabularyFile) {
  const resolvedVocabularyFile = resolveFilePath(
    vocabularyFile ?? DEFAULT_HOMEY_AUTHORING_VOCABULARY_FILE,
  );

  if (!fs.existsSync(resolvedVocabularyFile)) {
    throw new Error(
      `Homey vocabulary artifact not found: ${resolvedVocabularyFile}. ` +
        'Run "npm run compiler:homey-vocabulary" first, or pass --vocabulary-file explicitly.',
    );
  }

  const artifact = loadHomeyAuthoringVocabularyArtifact(resolvedVocabularyFile);
  const lookup = createHomeyAuthoringVocabularyLookupV1(artifact);

  return {
    vocabularyFile: resolvedVocabularyFile,
    vocabulary: {
      homeyClasses: lookup.homeyClasses,
      capabilityIds: lookup.capabilityIds,
    },
    counts: {
      homeyClasses: lookup.homeyClasses.size,
      capabilityIds: lookup.capabilityIds.size,
    },
  };
}
