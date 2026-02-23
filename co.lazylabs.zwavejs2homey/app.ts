'use strict';

import Homey from 'homey';
import { createZwjsClient, type ClientLogger, type ZwjsClient, type ZwjsClientEvent } from '@zwavejs2homey/core';

module.exports = class Zwavejs2HomeyApp extends Homey.App {
  private zwjsClient!: ZwjsClient;

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    // Placeholder config until Homey settings UI/storage is added.
    const logger: ClientLogger = {
      info: (msg: string, meta?: unknown) => this.log(msg, meta),
      warn: (msg: string, meta?: unknown) => this.error(msg, meta),
      error: (msg: string, meta?: unknown) => this.error(msg, meta),
    };

    this.zwjsClient = createZwjsClient({
      url: 'ws://127.0.0.1:3000',
      auth: { type: 'none' },
      logger,
    });
    this.zwjsClient.onEvent((event: ZwjsClientEvent) => {
      this.log('zwjs event', event.type);
    });
    await this.zwjsClient.start();

    this.log('zwavejs2homey initialized');
    this.log('zwjs status', this.zwjsClient.getStatus());
  }

  async onUninit() {
    if (this.zwjsClient) {
      await this.zwjsClient.stop();
    }
  }
}
