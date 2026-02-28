const test = require('node:test');
const assert = require('node:assert/strict');

const {
  annotateNodeValue,
  classifyNodeValueSection,
  classifyNodeValueGroup,
  formatValueSemanticTag,
} = require('../dist/view/value-semantics');

test('annotateNodeValue infers onoff from binary-like multilevel switch states', () => {
  const annotation = annotateNodeValue({
    valueId: {
      commandClass: 38,
      endpoint: 0,
      property: 'targetValue',
    },
    metadata: {
      label: 'Switch',
      readable: true,
      writeable: true,
      states: { 0: 'off', 99: 'on' },
    },
    value: 99,
  });

  assert.deepEqual(annotation, {
    capabilityId: 'onoff',
    direction: 'read-write',
    confidence: 'high',
    source: 'metadata',
  });
  assert.equal(formatValueSemanticTag(annotation), '{cap:onoff dir:rw conf:high src:meta}');
});

test('annotateNodeValue infers sensor capability from metadata labels and units', () => {
  const annotation = annotateNodeValue({
    valueId: {
      commandClass: 49,
      endpoint: 0,
      property: 'Air temperature',
    },
    metadata: {
      label: 'Temperature',
      unit: 'C',
      readable: true,
      writeable: false,
    },
    value: 21.2,
  });

  assert.deepEqual(annotation, {
    capabilityId: 'measure_temperature',
    direction: 'read',
    confidence: 'high',
    source: 'metadata',
  });
});

test('annotateNodeValue falls back to enum_select when states are present on unknown class', () => {
  const annotation = annotateNodeValue({
    valueId: {
      commandClass: 112,
      endpoint: 0,
      property: 'mode',
    },
    metadata: {
      label: 'Mode',
      readable: true,
      writeable: true,
      states: { 0: 'auto', 1: 'manual' },
    },
    value: 0,
  });

  assert.deepEqual(annotation, {
    capabilityId: 'enum_select',
    direction: 'read-write',
    confidence: 'medium',
    source: 'metadata',
  });
});

test('annotateNodeValue keeps unknown values low confidence', () => {
  const annotation = annotateNodeValue({
    valueId: {
      commandClass: 250,
      endpoint: 0,
      property: 'mystery',
    },
    metadata: {
      readable: false,
      writeable: false,
    },
    value: 'x',
  });

  assert.deepEqual(annotation, {
    capabilityId: null,
    direction: 'unknown',
    confidence: 'low',
    source: 'heuristic',
  });
});

test('classifyNodeValueGroup marks writable or mapped values as interactive', () => {
  const group = classifyNodeValueGroup({
    valueId: {
      commandClass: 38,
      endpoint: 0,
      property: 'targetValue',
    },
    metadata: {
      label: 'Switch',
      readable: true,
      writeable: true,
      states: { 0: 'off', 99: 'on' },
    },
    value: 99,
  });
  assert.equal(group, 'interactive');
});

test('classifyNodeValueSection classifies writable switch as controls', () => {
  const section = classifyNodeValueSection({
    valueId: {
      commandClass: 38,
      endpoint: 0,
      property: 'targetValue',
    },
    metadata: {
      label: 'Switch',
      readable: true,
      writeable: true,
      states: { 0: 'off', 99: 'on' },
    },
    value: 99,
  });
  assert.equal(section, 'controls');
});

test('classifyNodeValueSection classifies sensor units as sensors', () => {
  const section = classifyNodeValueSection({
    valueId: {
      commandClass: 49,
      endpoint: 0,
      property: 'Air temperature',
    },
    metadata: {
      label: 'Temperature',
      unit: 'C',
      readable: true,
      writeable: false,
    },
    value: 22.1,
  });
  assert.equal(section, 'sensors');
});

test('classifyNodeValueSection classifies configuration class as config', () => {
  const section = classifyNodeValueSection({
    valueId: {
      commandClass: 112,
      endpoint: 0,
      property: 'parameter',
      propertyKey: 1,
    },
    metadata: {
      label: 'Parameter 1',
      readable: true,
      writeable: true,
    },
    value: 5,
  });
  assert.equal(section, 'config');
});

test('classifyNodeValueGroup marks status/firmware-like values as static', () => {
  const group = classifyNodeValueGroup({
    valueId: {
      commandClass: 114,
      endpoint: 0,
      property: 'firmwareVersion',
    },
    metadata: {
      label: 'Firmware Version',
      readable: true,
      writeable: false,
    },
    value: '1.0.2',
  });
  assert.equal(group, 'static');
});
