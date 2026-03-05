import Homey from 'homey';
import type { ZwjsClient } from '@zwavejs2homey/core';
import { buildNodeResolverSelector } from '../../compiled-profiles';
import {
  buildNodePairCandidates,
  collectExistingNodeIdsFromData,
  ZWJS_DEFAULT_BRIDGE_ID,
} from '../../pairing';
import { normalizeHomeyClassForPairIcon, resolvePairIconForHomeyClass } from '../../pairing-icons';

type RecommendationActionSelection =
  | 'auto'
  | 'backfill-marker'
  | 'adopt-recommended-baseline'
  | 'none';

interface AppRuntimeAccess {
  getZwjsClient?: () => ZwjsClient | undefined;
  getBridgeId?: () => string;
  resolveCompiledProfileEntry?: (selector: ReturnType<typeof buildNodeResolverSelector>) => {
    by: string;
    entry?: {
      compiled?: {
        profile?: {
          classification?: {
            homeyClass?: unknown;
          };
        };
      };
    };
  };
  getNodeDeviceToolsSnapshot?: (options: { homeyDeviceId: string }) => Promise<unknown>;
  executeRecommendationAction?: (options: {
    homeyDeviceId: string;
    action?: RecommendationActionSelection;
  }) => Promise<unknown>;
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

interface HomeyZoneLike {
  name?: unknown;
}

interface HomeyZonesManagerLike {
  getZones?: ((callback: (error: unknown, zones?: Record<string, HomeyZoneLike>) => void) => void) &
    (() => Promise<Record<string, HomeyZoneLike>>);
}

module.exports = class NodeDriver extends Homey.Driver {
  private static readonly PAIR_FLOW_TIMEOUT_MS = 12000;

  private static readonly PAIR_NODE_LIST_TIMEOUT_MS = 8000;

  private static readonly PAIR_ZONE_LOOKUP_TIMEOUT_MS = 1500;

  private static readonly PAIR_NODE_STATE_TIMEOUT_MS = 1000;

  private static readonly PAIR_ICON_INFERENCE_CONCURRENCY = 6;

  async onInit() {
    this.log('NodeDriver initialized');
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
      let settled = false;
      const timeoutHandle = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise.then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutHandle);
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutHandle);
          reject(error);
        },
      );
    });
  }

  private async runWithConcurrencyLimit<T>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    const safeLimit = Math.max(1, Math.min(limit, items.length || 1));
    let index = 0;
    const runWorker = async () => {
      while (true) {
        const currentIndex = index;
        index += 1;
        if (currentIndex >= items.length) return;
        await worker(items[currentIndex]);
      }
    };
    await Promise.all(Array.from({ length: safeLimit }, () => runWorker()));
  }

  private extractZoneNames(source: unknown): string[] {
    const valuesToScan: unknown[] = [];
    if (Array.isArray(source)) {
      valuesToScan.push(...source);
    } else if (source && typeof source === 'object') {
      const objectSource = source as Record<string, unknown>;
      if (Array.isArray(objectSource.zones)) valuesToScan.push(...objectSource.zones);
      if (objectSource.zones && typeof objectSource.zones === 'object') {
        valuesToScan.push(...Object.values(objectSource.zones as Record<string, unknown>));
      }
      valuesToScan.push(...Object.values(objectSource));
    }

    const uniqueNames = new Set<string>();
    for (const value of valuesToScan) {
      if (!value || typeof value !== 'object') continue;
      const zone = value as HomeyZoneLike;
      if (typeof zone.name !== 'string') continue;
      const trimmed = zone.name.trim();
      if (trimmed.length > 0) uniqueNames.add(trimmed);
    }
    return [...uniqueNames];
  }

  private async loadHomeyZoneNames(): Promise<string[]> {
    const zonesManager = (this.homey as unknown as { zones?: HomeyZonesManagerLike }).zones;
    const getZones =
      typeof zonesManager?.getZones === 'function'
        ? zonesManager.getZones.bind(zonesManager)
        : undefined;
    if (typeof getZones === 'function') {
      try {
        const zones = await new Promise<Record<string, HomeyZoneLike>>((resolve, reject) => {
          if (getZones.length >= 1) {
            getZones((error: unknown, result?: Record<string, HomeyZoneLike>) => {
              if (error) {
                reject(error);
                return;
              }
              resolve(result ?? {});
            });
            return;
          }

          Promise.resolve(getZones())
            .then((result) => resolve(result ?? {}))
            .catch((error) => reject(error));
        });
        const names = this.extractZoneNames(zones);
        if (names.length > 0) return names;
      } catch (error) {
        this.error('Failed to load Homey zones via manager during node pairing', { error });
      }
    }

    return [];
  }

  async onPairListDevices() {
    const app = this.homey.app as AppRuntimeAccess;
    const client = app.getZwjsClient?.();
    if (!client) {
      throw new Error('ZWJS client unavailable. Verify bridge connection settings.');
    }

    const runPairFlow = async () => {
      const bridgeId = app.getBridgeId?.() ?? ZWJS_DEFAULT_BRIDGE_ID;
      const existingData = this.getDevices().map((device) => {
        return device.getData() as HomeyDeviceData | undefined;
      });
      const existingNodeIds = collectExistingNodeIdsFromData(existingData, bridgeId);
      let nodes = [];
      try {
        const nodeListResult = await this.withTimeout(
          client.getNodeList(),
          NodeDriver.PAIR_NODE_LIST_TIMEOUT_MS,
          'node list lookup',
        );
        nodes = Array.isArray(nodeListResult?.nodes) ? nodeListResult.nodes : [];
      } catch (error) {
        this.error('Failed to load node list during pairing', {
          error,
        });
        return [];
      }

      let knownZoneNames: string[] = [];
      try {
        knownZoneNames = await this.withTimeout(
          this.loadHomeyZoneNames(),
          NodeDriver.PAIR_ZONE_LOOKUP_TIMEOUT_MS,
          'zone lookup',
        );
      } catch (error) {
        this.error(
          'Timed out loading Homey zones during node pairing; continuing without zone hints',
          {
            error,
          },
        );
        knownZoneNames = [];
      }

      const candidates = buildNodePairCandidates(nodes, bridgeId, existingNodeIds, undefined, {
        knownZoneNames,
      });
      if (app.resolveCompiledProfileEntry) {
        try {
          await this.withTimeout(
            this.runWithConcurrencyLimit(
              candidates,
              NodeDriver.PAIR_ICON_INFERENCE_CONCURRENCY,
              async (candidate) => {
                try {
                  const nodeStateResult = await this.withTimeout(
                    client.getNodeState(candidate.data.nodeId),
                    NodeDriver.PAIR_NODE_STATE_TIMEOUT_MS,
                    `node ${candidate.data.nodeId} state lookup`,
                  );
                  if (!nodeStateResult.success) return;
                  const selector = buildNodeResolverSelector(
                    { bridgeId, nodeId: candidate.data.nodeId },
                    nodeStateResult.result?.state,
                  );
                  const match = app.resolveCompiledProfileEntry?.(selector);
                  if (match?.by === 'none') return;
                  const homeyClass = normalizeHomeyClassForPairIcon(
                    match?.entry?.compiled?.profile?.classification?.homeyClass,
                  );
                  candidate.icon = resolvePairIconForHomeyClass(homeyClass);
                  candidate.store.inferredHomeyClass = homeyClass;
                } catch (error) {
                  this.error('Failed to infer node pairing icon', {
                    bridgeId,
                    nodeId: candidate.data.nodeId,
                    error,
                  });
                }
              },
            ),
            NodeDriver.PAIR_FLOW_TIMEOUT_MS,
            'node icon inference',
          );
        } catch (error) {
          this.error(
            'Node pairing icon inference timed out; returning candidates without inferred icons',
            {
              error,
              bridgeId,
              candidates: candidates.length,
            },
          );
        }
      }

      this.log('Node pair list generated', {
        bridgeId,
        discovered: nodes.length,
        existing: existingNodeIds.size,
        candidates: candidates.length,
        knownZones: knownZoneNames.length,
      });
      return candidates;
    };

    try {
      return await this.withTimeout(
        runPairFlow(),
        NodeDriver.PAIR_FLOW_TIMEOUT_MS,
        'node pairing flow',
      );
    } catch (error) {
      this.error('Node pairing flow failed; returning empty candidate list', {
        error,
      });
      return [];
    }
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

    const executeAction = async (payload?: unknown): Promise<unknown> => {
      if (!homeyDeviceId) {
        throw new Error('Device Tools unavailable: node device ID is missing.');
      }
      if (!app.executeRecommendationAction) {
        throw new Error('Device Tools unavailable: recommendation action API is not ready.');
      }
      if (!app.getNodeDeviceToolsSnapshot) {
        throw new Error('Device Tools unavailable: app runtime snapshot API is not ready.');
      }

      const actionSelection = this.parseActionSelection(payload);
      const actionResult = await app.executeRecommendationAction({
        homeyDeviceId,
        action: actionSelection,
      });
      const snapshot = await app.getNodeDeviceToolsSnapshot({ homeyDeviceId });
      return {
        actionResult,
        snapshot,
      };
    };

    session.setHandler('device_tools:get_snapshot', async () => loadSnapshot());
    session.setHandler('device_tools:refresh', async () => loadSnapshot());
    session.setHandler('device_tools:execute_action', async (payload) => executeAction(payload));
  }

  private resolveHomeyDeviceId(device: Homey.Device): string | null {
    const data = device.getData() as HomeyDeviceData | undefined;
    if (!data || typeof data.id !== 'string') return null;
    const trimmed = data.id.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private parseActionSelection(payload: unknown): RecommendationActionSelection {
    if (!payload || typeof payload !== 'object') return 'auto';
    const { action } = payload as { action?: unknown };
    if (typeof action === 'undefined') return 'auto';
    if (typeof action !== 'string') {
      throw new Error('Invalid Device Tools action selection: action must be a string.');
    }
    const normalized = action.trim();
    const allowedSelections: RecommendationActionSelection[] = [
      'auto',
      'backfill-marker',
      'adopt-recommended-baseline',
      'none',
    ];
    if (allowedSelections.includes(normalized as RecommendationActionSelection)) {
      return normalized as RecommendationActionSelection;
    }
    throw new Error(
      'Invalid Device Tools action selection. Expected one of: auto, backfill-marker, adopt-recommended-baseline, none.',
    );
  }
};
