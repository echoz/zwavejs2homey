import Homey from 'homey';
import type { ZwjsClient } from '@zwavejs2homey/core';

interface AppRuntimeAccess {
  getZwjsClient?: () => ZwjsClient | undefined;
  getBridgeId?: () => string;
}

module.exports = class BridgeDevice extends Homey.Device {
  async onInit() {
    const app = this.homey.app as AppRuntimeAccess;
    const bridgeId = app.getBridgeId?.() ?? 'unknown';
    const status = app.getZwjsClient?.()?.getStatus();
    this.log('BridgeDevice initialized', {
      bridgeId,
      transportConnected: status?.transportConnected === true,
      lifecycle: status?.lifecycle ?? 'stopped',
    });
  }

  async onAdded() {
    this.log('BridgeDevice paired');
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
    this.log('BridgeDevice settings changed', { changedKeys });
  }

  async onRenamed(newName: string) {
    this.log('BridgeDevice renamed', { newName });
  }

  async onDeleted() {
    this.log('BridgeDevice deleted');
  }
};
