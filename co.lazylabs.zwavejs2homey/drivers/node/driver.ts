import Homey from 'homey';
import type { ZwjsClient } from '@zwavejs2homey/core';
import {
  buildNodePairCandidates,
  collectExistingNodeIdsFromData,
  ZWJS_DEFAULT_BRIDGE_ID,
} from '../../pairing';

interface AppRuntimeAccess {
  getZwjsClient?: () => ZwjsClient | undefined;
  getBridgeId?: () => string;
}

module.exports = class NodeDriver extends Homey.Driver {
  async onInit() {
    this.log('NodeDriver initialized');
  }

  async onPairListDevices() {
    const app = this.homey.app as AppRuntimeAccess;
    const client = app.getZwjsClient?.();
    if (!client) {
      throw new Error('ZWJS client unavailable. Verify bridge connection settings.');
    }

    const bridgeId = app.getBridgeId?.() ?? ZWJS_DEFAULT_BRIDGE_ID;
    const existingData = this.getDevices().map((device) => {
      return device.getData() as { kind?: string; bridgeId?: string; nodeId?: number } | undefined;
    });
    const existingNodeIds = collectExistingNodeIdsFromData(existingData, bridgeId);
    const { nodes } = await client.getNodeList();

    const candidates = buildNodePairCandidates(nodes, bridgeId, existingNodeIds);

    this.log('Node pair list generated', {
      bridgeId,
      discovered: nodes.length,
      existing: existingNodeIds.size,
      candidates: candidates.length,
    });
    return candidates;
  }
};
