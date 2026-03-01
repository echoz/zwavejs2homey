const test = require('node:test');
const assert = require('node:assert/strict');

const compiler = require('../dist');

test('resolveHaPlatformOutput maps platform + primary command class via policy table', () => {
  assert.deepEqual(
    compiler.resolveHaPlatformOutput('LIGHT', { commandClass: 38, property: 'currentValue' }),
    {
      homeyClass: 'light',
      driverTemplateId: 'ha-import-light',
      capabilityId: 'dim',
    },
  );

  assert.deepEqual(
    compiler.resolveHaPlatformOutput('LIGHT', { commandClass: 37, property: 'currentValue' }),
    {
      homeyClass: 'light',
      driverTemplateId: 'ha-import-light',
      capabilityId: 'onoff',
    },
  );

  assert.equal(
    compiler.resolveHaPlatformOutput('UNSUPPORTED_PLATFORM', {
      commandClass: 37,
      property: 'currentValue',
    }),
    null,
  );
});

test('resolveHaCapabilityConflict returns configured conflict policy entries', () => {
  assert.deepEqual(
    compiler.resolveHaCapabilityConflict(
      { commandClass: 38, property: 'currentValue' },
      'windowcoverings_set',
    ),
    { key: 'cover.position_control', mode: 'exclusive', priority: 90 },
  );

  assert.deepEqual(
    compiler.resolveHaCapabilityConflict({ commandClass: 38, property: 'currentValue' }, 'dim'),
    { key: 'cover.position_control', mode: 'exclusive', priority: 40 },
  );

  assert.equal(
    compiler.resolveHaCapabilityConflict({ commandClass: 50, property: 'value' }, 'measure_power'),
    undefined,
  );
});
