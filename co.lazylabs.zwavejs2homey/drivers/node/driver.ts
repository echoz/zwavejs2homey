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
  getNodeDeviceToolsSnapshot?: (options: { homeyDeviceId: string }) => Promise<unknown>;
}

interface HomeyDeviceData {
  id?: string;
  kind?: string;
  bridgeId?: string;
  nodeId?: number;
}

interface RepairSessionLike {
  setHandler: (event: string, handler: (payload?: unknown) => Promise<unknown>) => void;
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
      return device.getData() as HomeyDeviceData | undefined;
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

  async onRepair(session: RepairSessionLike, device: Homey.Device) {
    const app = this.homey.app as AppRuntimeAccess;
    const homeyDeviceId = this.resolveHomeyDeviceId(device);

    const loadSnapshot = async (): Promise<unknown> => {
      if (!homeyDeviceId) {
        throw new Error('Device Tools unavailable: node device ID is missing.');
      }
      if (!app.getNodeDeviceToolsSnapshot) {
        throw new Error('Device Tools unavailable: app runtime snapshot API is not ready.');
      }
      return app.getNodeDeviceToolsSnapshot({ homeyDeviceId });
    };

    session.setHandler('device_tools:get_snapshot', async () => loadSnapshot());
    session.setHandler('device_tools:refresh', async () => loadSnapshot());
  }

  private resolveHomeyDeviceId(device: Homey.Device): string | null {
    const data = device.getData() as HomeyDeviceData | undefined;
    if (!data || typeof data.id !== 'string') return null;
    const trimmed = data.id.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
};
