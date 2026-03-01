import Homey from 'homey';
import type { ZwjsClient } from '@zwavejs2homey/core';

interface AppRuntimeAccess {
  getZwjsClient?: () => ZwjsClient | undefined;
  getBridgeId?: () => string;
}

module.exports = class NodeDevice extends Homey.Device {
  private getNodeContext() {
    const data = this.getData() as { bridgeId?: string; nodeId?: number } | undefined;
    return {
      bridgeId: data?.bridgeId ?? 'unknown',
      nodeId: typeof data?.nodeId === 'number' ? data.nodeId : undefined,
    };
  }

  async onInit() {
    const app = this.homey.app as AppRuntimeAccess;
    const clientStatus = app.getZwjsClient?.()?.getStatus();
    const ctx = this.getNodeContext();
    this.log('NodeDevice initialized', {
      bridgeId: ctx.bridgeId,
      nodeId: ctx.nodeId,
      zwjsTransportConnected: clientStatus?.transportConnected === true,
      zwjsLifecycle: clientStatus?.lifecycle ?? 'stopped',
    });
    // Phase 5 follow-up slices:
    // - resolve compiled profile with shared resolver
    // - register capability listeners based on resolved mappings
  }

  async onAdded() {
    const ctx = this.getNodeContext();
    this.log('NodeDevice paired', ctx);
  }

  async onSettings({
    oldSettings: _oldSettings,
    newSettings: _newSettings,
    changedKeys,
  }: {
    oldSettings: { [key: string]: boolean | string | number | undefined | null };
    newSettings: { [key: string]: boolean | string | number | undefined | null };
    changedKeys: string[];
  }): Promise<string | void> {
    this.log('NodeDevice settings changed', { changedKeys });
  }

  async onRenamed(newName: string) {
    this.log('NodeDevice renamed', { newName });
  }

  async onDeleted() {
    const ctx = this.getNodeContext();
    this.log('NodeDevice deleted', ctx);
  }
};
