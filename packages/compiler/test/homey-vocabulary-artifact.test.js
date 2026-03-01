const test = require('node:test');
const assert = require('node:assert/strict');

const compiler = require('../dist/index.js');

test('createHomeyVocabularyArtifactV1 creates valid artifact', () => {
  const artifact = compiler.createHomeyVocabularyArtifactV1(
    {
      homeyClasses: [
        {
          id: 'socket',
          sources: [{ source: 'homey-lib-system', sourceRef: 'homey-lib@2.45.0:device/classes' }],
        },
        {
          id: 'light',
          sources: [{ source: 'homey-lib-system', sourceRef: 'homey-lib@2.45.0:device/classes' }],
        },
      ],
      capabilityIds: [
        {
          id: 'onoff',
          sources: [
            { source: 'homey-lib-system', sourceRef: 'homey-lib@2.45.0:capability/capabilities' },
          ],
        },
        {
          id: 'zwjs_custom',
          sources: [
            {
              source: 'homey-compose-custom',
              sourceRef: 'co.lazylabs.zwavejs2homey/.homeycompose/capabilities/zwjs_custom.json',
            },
          ],
        },
      ],
    },
    {
      homeyLibVersion: '2.45.0',
      homeyLibRoot: '/tmp/homey-lib',
      composeCapabilitiesDir: '/tmp/.homeycompose/capabilities',
    },
    new Date('2026-03-01T00:00:00.000Z'),
  );

  assert.equal(artifact.schemaVersion, 'homey-vocabulary/v1');
  assert.equal(artifact.generatedAt, '2026-03-01T00:00:00.000Z');
  assert.doesNotThrow(() => compiler.assertHomeyVocabularyArtifactV1(artifact));

  const lookup = compiler.createHomeyVocabularyLookupV1(artifact);
  assert.equal(lookup.homeyClasses.has('socket'), true);
  assert.equal(lookup.capabilityIds.has('onoff'), true);
  assert.equal(lookup.capabilityIds.has('missing_capability'), false);
});

test('assertHomeyVocabularyArtifactV1 rejects malformed artifact', () => {
  assert.throws(
    () =>
      compiler.assertHomeyVocabularyArtifactV1({
        schemaVersion: 'homey-vocabulary/v1',
        generatedAt: '2026-03-01T00:00:00.000Z',
        source: {},
        homeyClasses: [{ id: '', sources: [] }],
        capabilityIds: [],
      }),
    /homeyClasses\[0\]\.id|sources/i,
  );
});
