const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ZWJS_BRIDGE_DEVICE_UNIQUE_ID,
  ZWJS_DEFAULT_BRIDGE_ID,
  ZWJS_NODE_DEVICE_KIND,
  collectExistingBridgeIdsFromData,
  createBridgePairCandidate,
  createNextBridgePairCandidate,
  hasBridgePairDeviceFromData,
  pickNextBridgeId,
  collectExistingNodeIdsFromData,
  buildNodePairCandidates,
} = require('../pairing.js');

test('bridge pairing helpers build deterministic bridge ids and candidates', () => {
  assert.equal(hasBridgePairDeviceFromData([]), false);
  assert.equal(hasBridgePairDeviceFromData([{ id: 'other' }]), false);
  assert.equal(hasBridgePairDeviceFromData([{ id: ZWJS_BRIDGE_DEVICE_UNIQUE_ID }]), true);

  const existingBridgeIds = collectExistingBridgeIdsFromData([
    { id: 'zwjs-bridge-main' },
    { kind: 'zwjs-bridge', bridgeId: 'bridge-3' },
    { id: 'zwjs-bridge-bridge-2', kind: 'zwjs-bridge' },
    { id: 'zwjs-node-main:9', kind: 'zwjs-node' },
    undefined,
  ]);
  assert.deepEqual([...existingBridgeIds].sort(), ['bridge-2', 'bridge-3', 'main']);
  assert.equal(pickNextBridgeId(existingBridgeIds), 'bridge-4');

  assert.deepEqual(createBridgePairCandidate(), {
    name: 'ZWJS Bridge',
    icon: '/pair-icons/bridge.svg',
    data: {
      id: ZWJS_BRIDGE_DEVICE_UNIQUE_ID,
      kind: 'zwjs-bridge',
      bridgeId: ZWJS_DEFAULT_BRIDGE_ID,
    },
  });

  assert.deepEqual(createNextBridgePairCandidate([], 'bridge'), {
    name: 'ZWJS Bridge',
    icon: '/pair-icons/bridge.svg',
    data: {
      id: ZWJS_BRIDGE_DEVICE_UNIQUE_ID,
      kind: 'zwjs-bridge',
      bridgeId: ZWJS_DEFAULT_BRIDGE_ID,
    },
  });
  assert.deepEqual(
    createNextBridgePairCandidate([{ id: 'zwjs-bridge-main', kind: 'zwjs-bridge' }], 'bridge'),
    {
      name: 'ZWJS Bridge (bridge-2)',
      icon: '/pair-icons/bridge.svg',
      data: {
        id: 'zwjs-bridge-bridge-2',
        kind: 'zwjs-bridge',
        bridgeId: 'bridge-2',
      },
    },
  );
});

test('node pairing helpers collect existing node ids by bridge and kind', () => {
  const ids = collectExistingNodeIdsFromData(
    [
      { kind: ZWJS_NODE_DEVICE_KIND, bridgeId: 'main', nodeId: 12 },
      { kind: ZWJS_NODE_DEVICE_KIND, bridgeId: 'secondary', nodeId: 13 },
      { kind: 'other', bridgeId: 'main', nodeId: 14 },
      { kind: ZWJS_NODE_DEVICE_KIND, bridgeId: 'main', nodeId: 12 },
      { kind: ZWJS_NODE_DEVICE_KIND, bridgeId: 'main', nodeId: 15.2 },
      undefined,
    ],
    'main',
  );
  assert.deepEqual([...ids], [12]);
});

test('node pair candidates are filtered, sorted and normalized', () => {
  const candidates = buildNodePairCandidates(
    [
      { nodeId: 2, name: 'Kitchen Dimmer', ready: true },
      {
        nodeId: 9,
        manufacturer: 'Yale',
        product: 'YRD226',
        interviewStage: 7,
      },
      { nodeId: 1, name: 'Controller' },
      { nodeId: 7, product: 'Outlet', ready: false },
      { nodeId: 5, manufacturer: 'Zooz' },
    ],
    'main',
    new Set([5]),
  );

  assert.deepEqual(candidates, [
    {
      name: '[2] Kitchen Dimmer',
      icon: '/pair-icons/other.svg',
      data: {
        id: 'main:2',
        kind: 'zwjs-node',
        bridgeId: 'main',
        nodeId: 2,
      },
      store: {
        ready: true,
        manufacturer: null,
        product: null,
        location: null,
        locationMatchedZone: false,
        interviewStage: null,
        inferredHomeyClass: 'other',
      },
    },
    {
      name: '[7] Outlet',
      icon: '/pair-icons/other.svg',
      data: {
        id: 'main:7',
        kind: 'zwjs-node',
        bridgeId: 'main',
        nodeId: 7,
      },
      store: {
        ready: false,
        manufacturer: null,
        product: 'Outlet',
        location: null,
        locationMatchedZone: false,
        interviewStage: null,
        inferredHomeyClass: 'other',
      },
    },
    {
      name: '[9] YRD226',
      icon: '/pair-icons/other.svg',
      data: {
        id: 'main:9',
        kind: 'zwjs-node',
        bridgeId: 'main',
        nodeId: 9,
      },
      store: {
        ready: false,
        manufacturer: 'Yale',
        product: 'YRD226',
        location: null,
        locationMatchedZone: false,
        interviewStage: '7',
        inferredHomeyClass: 'other',
      },
    },
  ]);
});

test('node pair candidates include location in name when zone match is unavailable', () => {
  const candidates = buildNodePairCandidates(
    [{ nodeId: 12, name: 'Wall Dimmer', location: 'Upstairs Hall' }],
    'main',
    new Set(),
    undefined,
    { knownZoneNames: ['Kitchen', 'Living Room'] },
  );

  assert.equal(candidates[0]?.name, 'Wall Dimmer - Upstairs Hall');
  assert.equal(candidates[0]?.store.location, 'Upstairs Hall');
  assert.equal(candidates[0]?.store.locationMatchedZone, false);
});

test('node pair candidates keep id-prefixed naming when location maps to a Homey zone', () => {
  const candidates = buildNodePairCandidates(
    [{ nodeId: 14, name: 'Pendant', location: 'Kitchen' }],
    'main',
    new Set(),
    undefined,
    { knownZoneNames: ['kitchen'] },
  );

  assert.equal(candidates[0]?.name, '[14] Pendant');
  assert.equal(candidates[0]?.store.location, 'Kitchen');
  assert.equal(candidates[0]?.store.locationMatchedZone, true);
});

test('node pair candidates fall back to node id when both name and location are unavailable', () => {
  const candidates = buildNodePairCandidates(
    [{ nodeId: 22, name: '   ', location: '   ' }],
    'main',
    new Set(),
  );

  assert.equal(candidates[0]?.name, '22');
  assert.equal(candidates[0]?.store.location, null);
  assert.equal(candidates[0]?.store.locationMatchedZone, false);
});
