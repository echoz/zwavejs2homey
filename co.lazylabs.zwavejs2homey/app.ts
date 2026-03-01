'use strict';

import Homey from 'homey';
import {
  createZwjsClient,
  type ClientLogger,
  type ZwjsClient,
  type ZwjsClientEvent,
  resolveZwjsConnectionConfig,
  ZWJS_COMMAND_NODE_SET_VALUE,
  ZWJS_CONNECTION_SETTINGS_KEY,
} from '@zwavejs2homey/core';
import type {
  CompiledProfileResolverMatchV1,
  CompiledProfileResolverSelector,
  ResolveCompiledProfileEntryOptionsV1,
} from '@zwavejs2homey/compiler';
import type { CompiledProfilesRuntime, CompiledProfilesRuntimeStatus } from './compiled-profiles';
import {
  COMPILED_PROFILES_PATH_SETTINGS_KEY,
  resolveCompiledProfileEntryFromRuntime,
  resolveCompiledProfilesArtifactPath,
  tryLoadCompiledProfilesRuntimeFromFile,
} from './compiled-profiles';
import { ZWJS_DEFAULT_BRIDGE_ID } from './pairing';

module.exports = class Zwavejs2HomeyApp extends Homey.App {
  private zwjsClient?: ZwjsClient;
  private readonly bridgeId = ZWJS_DEFAULT_BRIDGE_ID;
  private compiledProfilesRuntime?: CompiledProfilesRuntime;

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
      mutationPolicy: {
        enabled: true,
        requireAllowList: true,
        allowCommands: [ZWJS_COMMAND_NODE_SET_VALUE],
      },
    });
    nextClient.onEvent((event: ZwjsClientEvent) => {
      this.log('zwjs event', event.type);
    });
    await nextClient.start();
    this.zwjsClient = nextClient;
    this.log('zwjs status', this.zwjsClient.getStatus());
  }

  private async loadCompiledProfilesRuntime(reason: string): Promise<void> {
    const sourcePath = resolveCompiledProfilesArtifactPath(
      __dirname,
      this.homey.settings.get(COMPILED_PROFILES_PATH_SETTINGS_KEY),
    );
    const runtime = await tryLoadCompiledProfilesRuntimeFromFile(sourcePath);
    this.compiledProfilesRuntime = runtime;
    if (runtime.status.loaded) {
      this.log('Compiled profiles loaded', {
        reason,
        sourcePath,
        entryCount: runtime.status.entryCount,
        duplicateKeys: runtime.status.duplicateKeys,
      });
      return;
    }

    this.error('Compiled profiles unavailable; node profile fallback mode is active', {
      reason,
      sourcePath,
      errorMessage: runtime.status.errorMessage,
    });
  }

  private async reloadZwjsClient(reason: string): Promise<void> {
    await this.stopZwjsClient(`${reason}:reload`);
    await this.startZwjsClient(reason);
  }

  private onSettingsChanged = (key: string): void => {
    if (this.shuttingDown) return;
    if (key !== ZWJS_CONNECTION_SETTINGS_KEY && key !== COMPILED_PROFILES_PATH_SETTINGS_KEY) {
      return;
    }

    this.enqueueLifecycle(async () => {
      if (key === ZWJS_CONNECTION_SETTINGS_KEY) {
        await this.reloadZwjsClient('settings-updated');
      } else if (key === COMPILED_PROFILES_PATH_SETTINGS_KEY) {
        await this.loadCompiledProfilesRuntime('settings-updated');
      }
    }).catch((error: unknown) => {
      this.error('Failed to apply settings update', { key, error });
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
      await this.loadCompiledProfilesRuntime('startup');
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

  getZwjsClient(): ZwjsClient | undefined {
    return this.zwjsClient;
  }

  getBridgeId(): string {
    return this.bridgeId;
  }

  getCompiledProfilesStatus(): CompiledProfilesRuntimeStatus {
    if (this.compiledProfilesRuntime?.status) return this.compiledProfilesRuntime.status;
    const sourcePath = resolveCompiledProfilesArtifactPath(
      __dirname,
      this.homey.settings.get(COMPILED_PROFILES_PATH_SETTINGS_KEY),
    );
    return {
      sourcePath,
      loaded: false,
      generatedAt: null,
      entryCount: 0,
      duplicateKeys: {
        productTriple: 0,
        nodeId: 0,
        deviceKey: 0,
      },
      errorMessage: 'Compiled profile runtime not loaded',
    };
  }

  resolveCompiledProfileEntry(
    selector: CompiledProfileResolverSelector,
    options?: ResolveCompiledProfileEntryOptionsV1,
  ): CompiledProfileResolverMatchV1 {
    return resolveCompiledProfileEntryFromRuntime(this.compiledProfilesRuntime, selector, options);
  }
};
