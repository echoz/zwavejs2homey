'use strict';

import Homey from 'homey';
import {
  createZwjsClient,
  type ClientLogger,
  type ZwjsClient,
  type ZwjsClientEvent,
  resolveZwjsConnectionConfig,
  ZWJS_CONNECTION_SETTINGS_KEY,
} from '@zwavejs2homey/core';

module.exports = class Zwavejs2HomeyApp extends Homey.App {
  private zwjsClient?: ZwjsClient;

  private readonly clientLogger: ClientLogger = {
    info: (msg: string, meta?: unknown) => this.log(msg, meta),
    warn: (msg: string, meta?: unknown) => this.error(msg, meta),
    error: (msg: string, meta?: unknown) => this.error(msg, meta),
  };

  private settingsSetListener?: (key: string) => void;

  private settingsUnsetListener?: (key: string) => void;

  private lifecycleQueue: Promise<void> = Promise.resolve();

  private shuttingDown = false;

  private enqueueLifecycle(work: () => Promise<void>): Promise<void> {
    this.lifecycleQueue = this.lifecycleQueue.then(work).catch((error: unknown) => {
      this.error('ZWJS lifecycle operation failed', error);
    });
    return this.lifecycleQueue;
  }

  private async stopZwjsClient(reason: string): Promise<void> {
    if (!this.zwjsClient) return;
    this.log(`Stopping ZWJS client (${reason})`);
    await this.zwjsClient.stop();
    this.zwjsClient = undefined;
  }

  private async startZwjsClient(reason: string): Promise<void> {
    const resolved = resolveZwjsConnectionConfig(
      this.homey.settings.get(ZWJS_CONNECTION_SETTINGS_KEY),
    );
    for (const warning of resolved.warnings) {
      this.error('ZWJS config warning', warning);
    }

    this.log(
      `Starting ZWJS client (${reason}) from ${resolved.source}: ${resolved.clientConfig.url}`,
    );
    const nextClient = createZwjsClient({
      url: resolved.clientConfig.url,
      auth: resolved.clientConfig.auth,
      logger: this.clientLogger,
    });
    nextClient.onEvent((event: ZwjsClientEvent) => {
      this.log('zwjs event', event.type);
    });
    await nextClient.start();
    this.zwjsClient = nextClient;
    this.log('zwjs status', this.zwjsClient.getStatus());
  }

  private async reloadZwjsClient(reason: string): Promise<void> {
    await this.stopZwjsClient(`${reason}:reload`);
    await this.startZwjsClient(reason);
  }

  private onSettingsChanged = (key: string): void => {
    if (this.shuttingDown) return;
    if (key !== ZWJS_CONNECTION_SETTINGS_KEY) return;
    this.enqueueLifecycle(async () => {
      await this.reloadZwjsClient('settings-updated');
    }).catch((error: unknown) => {
      this.error('Failed to reload ZWJS client after settings update', error);
    });
  };

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.settingsSetListener = (key: string) => this.onSettingsChanged(key);
    this.settingsUnsetListener = (key: string) => this.onSettingsChanged(key);
    this.homey.settings.on('set', this.settingsSetListener);
    this.homey.settings.on('unset', this.settingsUnsetListener);
    await this.enqueueLifecycle(async () => {
      await this.startZwjsClient('startup');
    });

    this.log('zwavejs2homey initialized');
  }

  async onUninit() {
    this.shuttingDown = true;
    if (this.settingsSetListener) {
      this.homey.settings.removeListener('set', this.settingsSetListener);
      this.settingsSetListener = undefined;
    }
    if (this.settingsUnsetListener) {
      this.homey.settings.removeListener('unset', this.settingsUnsetListener);
      this.settingsUnsetListener = undefined;
    }
    await this.enqueueLifecycle(async () => {
      await this.stopZwjsClient('shutdown');
    });
  }
};
