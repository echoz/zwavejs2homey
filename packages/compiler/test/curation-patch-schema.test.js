import test from 'node:test';
import assert from 'node:assert/strict';

import * as compiler from '../dist/index.js';

test('validateRuntimeCurationPatchSetV1 accepts valid patch set', () => {
  const patchSet = {
    schemaVersion: 'runtime-curation-patches/v1',
    patches: [
      {
        patchId: 'patch-1',
        targetDevice: { catalogId: 'catalog:zwjs:0184-4447-3034' },
        operations: [
          {
            op: 'replace',
            target: { scope: 'device', slot: 'identity.homeyClass' },
            value: 'socket',
          },
          {
            op: 'replace',
            target: { scope: 'capability', capabilityId: 'onoff', slot: 'outboundMapping' },
            value: {
              kind: 'set_value',
              target: { commandClass: 37, endpoint: 0, property: 'targetValue' },
            },
          },
          {
            op: 'add',
            target: { scope: 'profile', slot: 'ignoredValues' },
            value: { commandClass: 134, endpoint: 0, property: 'version' },
          },
          {
            op: 'remove',
            target: { scope: 'profile', slot: 'subscriptions' },
            value: { eventType: 'zwjs.event.driver.logging' },
          },
          {
            op: 'disable',
            target: { scope: 'capability', capabilityId: 'measure_power', slot: 'inboundMapping' },
          },
        ],
      },
    ],
  };

  const result = compiler.validateRuntimeCurationPatchSetV1(patchSet);
  assert.equal(result.ok, true);
});

test('assertRuntimeCurationPatchSetV1 rejects unsupported target and op combinations', () => {
  assert.throws(
    () =>
      compiler.assertRuntimeCurationPatchSetV1({
        schemaVersion: 'runtime-curation-patches/v1',
        patches: [
          {
            patchId: 'bad-1',
            targetDevice: { diagnosticDeviceKey: 'product-triple:1-2-3' },
            operations: [
              {
                op: 'add',
                target: { scope: 'device', slot: 'identity.homeyClass' },
                value: 'socket',
              },
            ],
          },
        ],
      }),
    /only supported for profile collection targets/,
  );

  assert.throws(
    () =>
      compiler.assertRuntimeCurationPatchSetV1({
        schemaVersion: 'runtime-curation-patches/v1',
        patches: [
          {
            patchId: 'bad-2',
            targetDevice: { diagnosticDeviceKey: 'product-triple:1-2-3' },
            operations: [
              {
                op: 'replace',
                target: { scope: 'profile', slot: 'capabilities' },
                value: [],
              },
            ],
          },
        ],
      }),
    /not supported for profile collection targets/,
  );
});

test('assertRuntimeCurationPatchSetV1 rejects missing identifiers and malformed operations', () => {
  assert.throws(
    () =>
      compiler.assertRuntimeCurationPatchSetV1({
        schemaVersion: 'runtime-curation-patches/v1',
        patches: [{ patchId: 'bad', targetDevice: {}, operations: [] }],
      }),
    /targetDevice requires catalogId or diagnosticDeviceKey/,
  );

  assert.throws(
    () =>
      compiler.assertRuntimeCurationPatchSetV1({
        schemaVersion: 'runtime-curation-patches/v1',
        patches: [
          {
            patchId: 'bad-3',
            targetDevice: { diagnosticDeviceKey: 'deviceKey:x' },
            operations: [
              {
                op: 'disable',
                target: { scope: 'capability', capabilityId: 'onoff', slot: 'flags' },
                value: false,
              },
            ],
          },
        ],
      }),
    /disable must not include value/,
  );

  const invalid = compiler.validateRuntimeCurationPatchSetV1({
    schemaVersion: 'runtime-curation-patches/v1',
    patches: [
      {
        patchId: 'bad-4',
        targetDevice: { diagnosticDeviceKey: 'deviceKey:x' },
        operations: [{ op: 'replace', target: { scope: 'capability', slot: 'flags' } }],
      },
    ],
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.match(invalid.error.message, /capabilityId is required/);
  }
});
