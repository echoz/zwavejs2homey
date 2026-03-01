import Homey from 'homey';
import { createBridgePairCandidate, hasBridgePairDeviceFromData } from '../../pairing';

module.exports = class BridgeDriver extends Homey.Driver {
  async onInit() {
    this.log('BridgeDriver initialized');
  }

  private hasBridgeDeviceAlreadyPaired(): boolean {
    const existingData = this.getDevices().map(
      (device) => device.getData() as { id?: string } | undefined,
    );
    return hasBridgePairDeviceFromData(existingData);
  }

  async onPairListDevices() {
    if (this.hasBridgeDeviceAlreadyPaired()) {
      this.log('Bridge device already paired, returning empty pair list');
      return [];
    }

    return [createBridgePairCandidate()];
  }
};
