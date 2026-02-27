const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const compiler = require('../dist');

const fixturesDir = path.join(__dirname, 'fixtures');

test('loadJsonRuleFile loads valid rule arrays', () => {
  const filePath = path.join(fixturesDir, 'rules-switch-meter.json');
  const rules = compiler.loadJsonRuleFile(filePath);
  assert.equal(Array.isArray(rules), true);
  assert.equal(rules.length > 0, true);
  assert.equal(rules[0].ruleId, 'ha-onoff');
});

test('loadJsonRuleFile expands compact scalar matcher syntax to canonical arrays', () => {
  const filePath = path.join(fixturesDir, 'rules-switch-meter-compact.json');
  const rules = compiler.loadJsonRuleFile(filePath);

  assert.deepEqual(rules[0].value.commandClass, [37]);
  assert.deepEqual(rules[0].value.property, ['currentValue']);
  assert.deepEqual(rules[0].value.endpoint, [0]);

  assert.deepEqual(rules[1].device.manufacturerId, [29]);
  assert.deepEqual(rules[1].device.productType, [13313]);
  assert.deepEqual(rules[1].device.productId, [1]);
  assert.deepEqual(rules[1].device.deviceClassGeneric, ['Multilevel Switch']);
  assert.deepEqual(rules[1].value.propertyKey, [null]);
  assert.deepEqual(rules[1].value.metadataType, ['number']);
  assert.deepEqual(rules[1].constraints.requiredValues[0].commandClass, [112]);
  assert.deepEqual(rules[1].constraints.requiredValues[0].property, ['firmwareVersion']);
  assert.deepEqual(rules[1].constraints.requiredValues[0].propertyKey, [null]);

  assert.deepEqual(rules[2].value.propertyKey, [66049]);
  assert.deepEqual(rules[2].value.notPropertyKey, [null]);
});

test('loadJsonRuleFile expands compact action shorthand to canonical mapping actions', () => {
  const filePath = path.join(fixturesDir, 'rules-action-compact.json');
  const rules = compiler.loadJsonRuleFile(filePath);

  assert.deepEqual(rules[0].actions[0].inboundMapping, {
    kind: 'value',
    selector: {
      commandClass: 37,
      endpoint: 0,
      property: 'currentValue',
    },
  });
  assert.deepEqual(rules[0].actions[0].outboundMapping, {
    kind: 'set_value',
    target: {
      commandClass: 37,
      endpoint: 0,
      property: 'targetValue',
    },
  });

  assert.deepEqual(rules[1].actions[0].inboundMapping, {
    kind: 'event',
    selector: { eventType: 'notification.motion' },
  });
  assert.deepEqual(rules[1].actions[0].outboundMapping, {
    kind: 'zwjs_command',
    target: {
      command: 'zwavejs/motion/reset',
      argsTemplate: { reason: 'manual' },
    },
  });

  assert.equal(rules[2].actions[0].driverTemplateId, 'product-29-66-2');
  assert.equal('driverId' in rules[2].actions[0], false);
});

test('loadJsonRuleFile injects manifest-declared layer for no-layer rule files', () => {
  const filePath = path.join(fixturesDir, 'rules-switch-meter-generic-no-layer.json');
  const rules = compiler.loadJsonRuleFile(filePath, { declaredLayer: 'project-generic' });
  assert.equal(rules.length, 1);
  assert.equal(rules[0].layer, 'project-generic');
});

test('loadJsonRuleFile rejects per-rule layer when manifest declares layer', () => {
  const filePath = path.join(fixturesDir, 'rules-switch-meter-generic-onoff-fill.json');
  assert.throws(
    () => compiler.loadJsonRuleFile(filePath, { declaredLayer: 'project-generic' }),
    (error) =>
      error &&
      error.filePath === filePath &&
      /must not define layer when manifest declares/i.test(error.message),
  );
});

test('loadJsonRuleFile requires product-rules/v1 for manifest project-product files', () => {
  const filePath = path.join(fixturesDir, 'rules-switch-meter.json');
  assert.throws(
    () => compiler.loadJsonRuleFile(filePath, { declaredLayer: 'project-product' }),
    (error) =>
      error &&
      error.filePath === filePath &&
      /requires schemaVersion \"product-rules\/v1\" bundle files/i.test(error.message),
  );
});

test('loadJsonRuleFile loads product-rules/v1 bundles and expands target into device matcher', () => {
  const filePath = path.join(fixturesDir, 'rules-product-bundle-valid.json');
  const rules = compiler.loadJsonRuleFile(filePath);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].layer, 'project-product');
  assert.deepEqual(rules[0].device, {
    manufacturerId: [29],
    productType: [13313],
    productId: [1],
  });
});

test('loadJsonRuleFile rejects product-rules/v1 bundle rules with explicit layer', () => {
  const filePath = path.join(fixturesDir, 'rules-product-bundle-invalid-rule-layer.json');
  assert.throws(
    () => compiler.loadJsonRuleFile(filePath),
    (error) => error && error.filePath === filePath && /must not define layer/i.test(error.message),
  );
});

test('loadJsonRuleFile rejects product-rules/v1 bundle rules with explicit device', () => {
  const filePath = path.join(fixturesDir, 'rules-product-bundle-invalid-rule-device.json');
  assert.throws(
    () => compiler.loadJsonRuleFile(filePath),
    (error) =>
      error && error.filePath === filePath && /must not define device/i.test(error.message),
  );
});

test('loadJsonRuleFile rejects invalid product-rules/v1 bundle name values', () => {
  const filePath = path.join(fixturesDir, 'rules-product-bundle-invalid-name.json');
  assert.throws(
    () => compiler.loadJsonRuleFile(filePath),
    (error) =>
      error &&
      error.filePath === filePath &&
      /name must be a non-empty string/i.test(error.message),
  );
});

test('loadJsonRuleFile rejects invalid rule shapes with file context', () => {
  const filePath = path.join(fixturesDir, 'rules-invalid-shape.json');
  assert.throws(
    () => compiler.loadJsonRuleFile(filePath),
    (error) =>
      error &&
      error.name === 'RuleFileLoadError' &&
      error.filePath === filePath &&
      /(invalid action|capability action .*capabilityId)/i.test(error.message),
  );
});

test('loadJsonRuleFile rejects empty device-identity actions with clear error', () => {
  const filePath = path.join(fixturesDir, 'rules-invalid-device-identity-empty.json');
  assert.throws(
    () => compiler.loadJsonRuleFile(filePath),
    (error) =>
      error &&
      error.filePath === filePath &&
      /device-identity action .*homeyClass or driverTemplateId/i.test(error.message),
  );
});

test('loadJsonRuleFile rejects action mode not allowed by layer', () => {
  const filePath = path.join(fixturesDir, 'rules-invalid-generic-replace.json');
  assert.throws(
    () => compiler.loadJsonRuleFile(filePath),
    (error) =>
      error &&
      error.filePath === filePath &&
      /not allowed in layer \"project-generic\"/i.test(error.message),
  );
});

test('loadJsonRuleFile rejects invalid ignore-value valueId shapes', () => {
  const filePath = path.join(fixturesDir, 'rules-invalid-ignore-valueid.json');
  assert.throws(
    () => compiler.loadJsonRuleFile(filePath),
    (error) =>
      error &&
      error.filePath === filePath &&
      /ignore-value action .*invalid valueId shape/i.test(error.message),
  );
});

test('loadJsonRuleFile rejects invalid capability conflict metadata', () => {
  const filePath = path.join(fixturesDir, 'rules-invalid-capability-conflict.json');
  assert.throws(
    () => compiler.loadJsonRuleFile(filePath),
    (error) =>
      error && error.filePath === filePath && /conflict\.(key|mode|priority)/i.test(error.message),
  );
});

test('loadJsonRuleFile rejects invalid remove-capability action mode', () => {
  const filePath = path.join(fixturesDir, 'rules-invalid-remove-capability.json');
  assert.throws(
    () => compiler.loadJsonRuleFile(filePath),
    (error) =>
      error &&
      error.filePath === filePath &&
      /remove-capability action .*mode \"replace\"/i.test(error.message),
  );
});

test('loadJsonRuleFile rejects invalid matcher shapes before compile-time', () => {
  const filePath = path.join(fixturesDir, 'rules-invalid-matcher-shape.json');
  assert.throws(
    () => compiler.loadJsonRuleFile(filePath),
    (error) =>
      error &&
      error.filePath === filePath &&
      /(device\.deviceClassGeneric|value\.commandClass|constraints\.requiredValues\[0\]\.property)/i.test(
        error.message,
      ),
  );
});

test('loadJsonRuleFile rejects malformed action shorthand with clear error', () => {
  const filePath = path.join(fixturesDir, 'rules-invalid-action-shorthand.json');
  assert.throws(
    () => compiler.loadJsonRuleFile(filePath),
    (error) =>
      error &&
      error.filePath === filePath &&
      /inboundMapping shorthand must be a value-id object or eventType/i.test(error.message),
  );
});
