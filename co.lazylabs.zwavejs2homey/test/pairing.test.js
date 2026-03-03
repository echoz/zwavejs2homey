const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ZWJS_BRIDGE_DEVICE_UNIQUE_ID,
  ZWJS_DEFAULT_BRIDGE_ID,
  ZWJS_NODE_DEVICE_KIND,
  createBridgePairCandidate,
  hasBridgePairDeviceFromData,
  collectExistingNodeIdsFromData,
  buildNodePairCandidates,
} = require('../pairing.js');

test('bridge pairing helpers enforce singleton identity', () => {
  assert.equal(hasBridgePairDeviceFromData([]), false);
  assert.equal(hasBridgePairDeviceFromData([{ id: 'other' }]), false);
  assert.equal(hasBridgePairDeviceFromData([{ id: ZWJS_BRIDGE_DEVICE_UNIQUE_ID }]), true);

  assert.deepEqual(createBridgePairCandidate(), {
    name: 'ZWJS Bridge',
    icon: '/assets/pair-icons/bridge.svg',
    data: {
      id: ZWJS_BRIDGE_DEVICE_UNIQUE_ID,
      kind: 'zwjs-bridge',
      bridgeId: ZWJS_DEFAULT_BRIDGE_ID,
    },
  });
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
      icon: '/assets/pair-icons/other.svg',
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
        interviewStage: null,
        inferredHomeyClass: 'other',
      },
    },
    {
      name: '[7] Outlet',
      icon: '/assets/pair-icons/other.svg',
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
        interviewStage: null,
        inferredHomeyClass: 'other',
      },
    },
    {
      name: '[9] YRD226',
      icon: '/assets/pair-icons/other.svg',
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
        interviewStage: '7',
        inferredHomeyClass: 'other',
      },
    },
  ]);
});
