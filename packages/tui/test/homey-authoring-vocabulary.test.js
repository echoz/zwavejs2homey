const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  loadHomeyAuthoringVocabulary,
  FALLBACK_HOMEY_CLASS_OPTIONS,
} = require('../dist/service/homey-authoring-vocabulary');

test('loadHomeyAuthoringVocabulary loads valid artifact file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zwjs2homey-tui-vocab-'));
  const vocabFile = path.join(tmpDir, 'homey-vocabulary.json');
  fs.writeFileSync(
    vocabFile,
    `${JSON.stringify(
      {
        schemaVersion: 'homey-vocabulary/v1',
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
  assert.equal(loaded.source, 'artifact');
  assert.deepEqual(loaded.homeyClasses, ['socket']);
  assert.deepEqual(loaded.capabilityIds, ['onoff']);
  assert.equal(loaded.warning, undefined);
});

test('loadHomeyAuthoringVocabulary falls back when file is missing', () => {
  const loaded = loadHomeyAuthoringVocabulary('/tmp/does-not-exist-vocab.json');
  assert.equal(loaded.source, 'fallback');
  assert.deepEqual(loaded.homeyClasses, FALLBACK_HOMEY_CLASS_OPTIONS);
  assert.deepEqual(loaded.capabilityIds, []);
  assert.match(loaded.warning, /not found/i);
});
