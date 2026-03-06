const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  loadHomeyAuthoringVocabulary,
  HomeyAuthoringVocabularyError,
} = require('../dist/service/homey-authoring-vocabulary');

test('loadHomeyAuthoringVocabulary loads valid artifact file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-tui-vocab-'));
  const vocabFile = path.join(tmpDir, 'homey-authoring-vocabulary.json');
  fs.writeFileSync(
    vocabFile,
    `${JSON.stringify(
      {
        schemaVersion: 'homey-authoring-vocabulary/v1',
        generatedAt: '2026-03-01T00:00:00.000Z',
        source: {},
        homeyClasses: [{ id: 'socket', sources: [{ source: 'homey-lib-system', sourceRef: 'x' }] }],
        capabilityIds: [{ id: 'onoff', sources: [{ source: 'homey-lib-system', sourceRef: 'x' }] }],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const loaded = loadHomeyAuthoringVocabulary(vocabFile);
  assert.deepEqual(loaded.homeyClasses, ['socket']);
  assert.deepEqual(loaded.capabilityIds, ['onoff']);
});

test('loadHomeyAuthoringVocabulary throws when file is missing', () => {
  assert.throws(
    () => loadHomeyAuthoringVocabulary('/tmp/does-not-exist-vocab.json'),
    (error) => {
      assert.equal(error instanceof HomeyAuthoringVocabularyError, true);
      assert.match(error.message, /not found/i);
      assert.match(error.message, /compiler:homey-vocabulary/i);
      return true;
    },
  );
});

test('loadHomeyAuthoringVocabulary throws when capabilityIds is empty', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-tui-vocab-empty-'));
  const vocabFile = path.join(tmpDir, 'homey-authoring-vocabulary.json');
  fs.writeFileSync(
    vocabFile,
    `${JSON.stringify(
      {
        schemaVersion: 'homey-authoring-vocabulary/v1',
        generatedAt: '2026-03-01T00:00:00.000Z',
        source: {},
        homeyClasses: [{ id: 'socket', sources: [{ source: 'homey-lib-system', sourceRef: 'x' }] }],
        capabilityIds: [],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  assert.throws(
    () => loadHomeyAuthoringVocabulary(vocabFile),
    (error) => {
      assert.equal(error instanceof HomeyAuthoringVocabularyError, true);
      assert.match(error.message, /capabilityIds must contain at least one entry/i);
      assert.match(error.message, /compiler:homey-vocabulary/i);
      return true;
    },
  );
});
