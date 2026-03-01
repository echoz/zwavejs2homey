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

  private static readonly NODE_EVENT_REFRESH_TYPES = new Set<string>([
    'zwjs.event.node.interview-completed',
    'zwjs.event.node.value-added',
    'zwjs.event.node.metadata-updated',
  ]);

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
      const refreshNodeId = this.getRuntimeRefreshNodeIdFromEvent(event);
      if (refreshNodeId === undefined || this.shuttingDown) {
        return;
      }
      this.enqueueLifecycle(async () => {
        await this.refreshNodeRuntimeMappingsForNode(
          refreshNodeId,
          `event:${event.type}:node-${refreshNodeId}`,
        );
      }).catch((error: unknown) => {
        this.error('Failed to refresh node runtime mappings from event', {
          eventType: event.type,
          nodeId: refreshNodeId,
          error,
        });
      });
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

  private async refreshNodeRuntimeMappings(reason: string): Promise<void> {
    try {
      const nodeDriver = this.homey.drivers.getDriver('node');
      const devices = nodeDriver.getDevices() as Array<{
        onRuntimeMappingsRefresh?: (refreshReason: string) => Promise<void>;
      }>;
      this.log('Refreshing node runtime mappings', {
        reason,
        devices: devices.length,
      });
      for (const device of devices) {
        if (typeof device.onRuntimeMappingsRefresh === 'function') {
          await device.onRuntimeMappingsRefresh(reason);
        }
      }
    } catch (error) {
      this.error('Failed to refresh node runtime mappings', { reason, error });
    }
  }

  private getRuntimeRefreshNodeIdFromEvent(event: ZwjsClientEvent): number | undefined {
    if (!Zwavejs2HomeyApp.NODE_EVENT_REFRESH_TYPES.has(event.type)) {
      return undefined;
    }
    if (!('event' in event)) {
      return undefined;
    }
    const payload = event.event as { nodeId?: unknown } | undefined;
    if (!payload || typeof payload.nodeId !== 'number' || !Number.isFinite(payload.nodeId)) {
      return undefined;
    }
    return payload.nodeId;
  }

  private async refreshNodeRuntimeMappingsForNode(nodeId: number, reason: string): Promise<void> {
    try {
      const nodeDriver = this.homey.drivers.getDriver('node');
      const devices = nodeDriver.getDevices() as Array<{
        getData?: () => { bridgeId?: string; nodeId?: number } | undefined;
        onRuntimeMappingsRefresh?: (refreshReason: string) => Promise<void>;
      }>;

      let refreshed = 0;
      for (const device of devices) {
        const data = device.getData?.();
        if (!data || typeof data.nodeId !== 'number' || data.nodeId !== nodeId) {
          continue;
        }
        if (data.bridgeId && data.bridgeId !== this.bridgeId) {
          continue;
        }
        if (typeof device.onRuntimeMappingsRefresh === 'function') {
          await device.onRuntimeMappingsRefresh(reason);
          refreshed += 1;
        }
      }
      this.log('Refreshed node runtime mappings for node', {
        reason,
        nodeId,
        refreshed,
      });
    } catch (error) {
      this.error('Failed targeted node runtime mapping refresh', { nodeId, reason, error });
    }
  }

  private onSettingsChanged = (key: string): void => {
    if (this.shuttingDown) return;
    if (key !== ZWJS_CONNECTION_SETTINGS_KEY && key !== COMPILED_PROFILES_PATH_SETTINGS_KEY) {
      return;
    }

    this.enqueueLifecycle(async () => {
      if (key === ZWJS_CONNECTION_SETTINGS_KEY) {
        await this.reloadZwjsClient('settings-updated');
        await this.refreshNodeRuntimeMappings('zwjs-connection-updated');
      } else if (key === COMPILED_PROFILES_PATH_SETTINGS_KEY) {
        await this.loadCompiledProfilesRuntime('settings-updated');
        await this.refreshNodeRuntimeMappings('compiled-profiles-updated');
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
      await this.refreshNodeRuntimeMappings('startup');
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
