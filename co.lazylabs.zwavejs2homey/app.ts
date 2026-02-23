'use strict';

import Homey from 'homey';
import { createBridgeService, type BridgeService } from '@zwavejs2homey/core';

module.exports = class Zwavejs2HomeyApp extends Homey.App {
  private bridgeService!: BridgeService;

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.bridgeService = createBridgeService();
    await this.bridgeService.start();

    this.log('zwavejs2homey initialized');
    this.log('bridge status', this.bridgeService.getStatus());
  }

  async onUninit() {
    if (this.bridgeService) {
      await this.bridgeService.stop();
    }
  }
}
