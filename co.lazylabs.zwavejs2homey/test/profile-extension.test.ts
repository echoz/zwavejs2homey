const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  PROFILE_EXTENSION_SCHEMA_VERSION,
  ProfileExtensionRegistry,
  ProfileExtensionRegistryError,
  createProfileExtensionRegistry,
} = require(path.resolve(__dirname, '../profile-extension.js'));

function createLockUserCodeContract() {
  return {
    schemaVersion: PROFILE_EXTENSION_SCHEMA_VERSION,
    extensionId: 'lock-user-codes',
    title: 'Lock User Codes',
    description: 'Manage lock user code slots for supported lock profiles.',
    match: {
      driverTemplateIds: ['product-yale-lock'],
      homeyClasses: ['lock'],
    },
    read: {
      sections: [
        {
          sectionId: 'user-code-slots',
          title: 'User Code Slots',
          description: 'Current lock slot/code availability and status.',
        },
      ],
    },
    actions: [
      {
        actionId: 'set-user-code',
        title: 'Set User Code',
        description: 'Set or update a code for a specific slot.',
        dryRunSupported: true,
        safetyChecks: [
          'requires-supported-profile',
          'requires-node-ready',
          'requires-write-access',
          'requires-selector-writeability',
        ],
        arguments: [
          {
            name: 'slot',
            type: 'integer',
            required: true,
            description: 'Lock slot index to update.',
          },
          {
            name: 'code',
            type: 'string',
            required: true,
            description: 'PIN/code value to write for the slot.',
          },
        ],
      },
    ],
  };
}

function createThermostatContract() {
  return {
    schemaVersion: PROFILE_EXTENSION_SCHEMA_VERSION,
    extensionId: 'thermostat-schedule',
    title: 'Thermostat Schedule',
    description: 'Read thermostat scheduling details.',
    match: {
      profileIds: ['product-triple:1:2:3'],
      homeyClasses: ['thermostat'],
    },
    read: {
      sections: [
        {
          sectionId: 'schedule',
          title: 'Schedule',
          description: 'Current schedule configuration snapshot.',
        },
      ],
    },
    actions: [],
  };
}

test('profile extension registry resolves matching contracts by profile context', () => {
  const registry = createProfileExtensionRegistry([
    createLockUserCodeContract(),
    createThermostatContract(),
  ]);

  const lockMatches = registry.resolve({
    driverTemplateId: 'product-yale-lock',
    homeyClass: 'lock',
  });
  assert.deepEqual(
    lockMatches.map((entry) => entry.extensionId),
    ['lock-user-codes'],
  );

  const thermostatMatches = registry.resolve({
    profileId: 'product-triple:1:2:3',
    homeyClass: 'thermostat',
  });
  assert.deepEqual(
    thermostatMatches.map((entry) => entry.extensionId),
    ['thermostat-schedule'],
  );
});

test('profile extension registry explains non-matches with deterministic reasons', () => {
  const registry = createProfileExtensionRegistry([createLockUserCodeContract()]);

  assert.deepEqual(
    registry.explainMatch('lock-user-codes', {
      homeyClass: 'lock',
      driverTemplateId: 'unexpected-template',
    }),
    {
      extensionId: 'lock-user-codes',
      matched: false,
      reason: 'driver-template-id-mismatch',
    },
  );

  assert.deepEqual(
    registry.explainMatch('lock-user-codes', {
      driverTemplateId: 'product-yale-lock',
    }),
    {
      extensionId: 'lock-user-codes',
      matched: false,
      reason: 'missing-homey-class',
    },
  );

  assert.deepEqual(registry.explainMatch('missing-extension', {}), {
    extensionId: 'missing-extension',
    matched: false,
    reason: 'extension-not-found',
  });
});

test('profile extension registry validates duplicate extension ids', () => {
  assert.throws(
    () =>
      new ProfileExtensionRegistry([createLockUserCodeContract(), createLockUserCodeContract()]),
    (error) => {
      assert.ok(error instanceof ProfileExtensionRegistryError);
      assert.equal(error.code, 'duplicate-extension-id');
      return true;
    },
  );
});

test('profile extension registry validates minimal contract shape', () => {
  const invalidContract = {
    schemaVersion: PROFILE_EXTENSION_SCHEMA_VERSION,
    extensionId: 'invalid-contract',
    title: 'Invalid Contract',
    description: 'Missing match predicates.',
    match: {
      profileIds: [],
      driverTemplateIds: [],
      homeyClasses: [],
    },
    read: {
      sections: [
        {
          sectionId: 'x',
          title: 'X',
          description: 'X',
        },
      ],
    },
    actions: [],
  };

  assert.throws(
    () => createProfileExtensionRegistry([invalidContract]),
    (error) => {
      assert.ok(error instanceof ProfileExtensionRegistryError);
      assert.equal(error.code, 'invalid-contract');
      assert.match(error.message, /at least one predicate list/i);
      return true;
    },
  );
});

test('profile extension registry resolves action contracts', () => {
  const registry = createProfileExtensionRegistry([createLockUserCodeContract()]);

  const action = registry.resolveAction('lock-user-codes', 'set-user-code');
  assert.equal(action?.actionId, 'set-user-code');

  assert.equal(registry.resolveAction('lock-user-codes', 'remove-user-code'), undefined);
  assert.equal(registry.resolveAction('missing-extension', 'set-user-code'), undefined);
});

test('profile extension registry validates enum argument contracts', () => {
  const contract = createLockUserCodeContract();
  contract.actions.push({
    actionId: 'set-mode',
    title: 'Set Mode',
    description: 'Set operating mode.',
    dryRunSupported: true,
    safetyChecks: ['requires-supported-profile'],
    arguments: [
      {
        name: 'mode',
        type: 'enum',
        required: true,
      },
    ],
  });

  assert.throws(
    () => createProfileExtensionRegistry([contract]),
    (error) => {
      assert.ok(error instanceof ProfileExtensionRegistryError);
      assert.equal(error.code, 'invalid-contract');
      assert.match(error.message, /enumValues must be defined/i);
      return true;
    },
  );
});
