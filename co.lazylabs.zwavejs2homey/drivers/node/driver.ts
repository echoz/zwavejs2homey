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

interface BridgeSessionLike {
  bridgeId?: string;
  getZwjsClient?: () => ZwjsClient | undefined;
}

interface AppRuntimeAccess {
  getBridgeSession?: (bridgeId?: string) => BridgeSessionLike | undefined;
  getZwjsClient?: () => ZwjsClient | undefined;
  getBridgeId?: () => string;
  getNodeRuntimeDiagnostics?: (options?: { homeyDeviceId?: string }) => Promise<{
    bridgeId: string;
    nodes: Array<{
      homeyDeviceId: string | null;
      nodeId: number | null;
      bridgeId?: string | null;
      node?: {
        manufacturer?: string | null;
        product?: string | null;
        location?: string | null;
        status?: string | null;
        ready?: boolean | null;
        isFailed?: boolean | null;
      };
      profile?: {
        homeyClass?: string | null;
        profileId?: string | null;
        matchBy?: string | null;
        matchKey?: string | null;
      };
      recommendation?: {
        available?: boolean;
        backfillNeeded?: boolean;
        reasonLabel?: string | null;
      };
    }>;
  }>;
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

interface PairSessionLike {
  setHandler: (event: string, handler: (payload?: unknown) => Promise<unknown>) => void;
}

interface ImportSummaryNodeEntry {
  homeyDeviceId: string | null;
  bridgeId: string;
  nodeId: number | null;
  name: string | null;
  manufacturer: string | null;
  product: string | null;
  location: string | null;
  status: string | null;
  profileHomeyClass: string | null;
  profileId: string | null;
  profileMatch: string | null;
  recommendationAction: string;
  recommendationReason: string | null;
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

  private static readonly PAIR_ICON_INFERENCE_TIMEOUT_MS = 7000;

  async onInit() {
    this.log('NodeDriver initialized');
  }

  async onPair(session: PairSessionLike) {
    this.log('Node pair session started');
    session.setHandler('list_devices', async () => {
      this.log('Node pair list requested');
      return await this.onPairListDevices();
    });
    session.setHandler('import_summary:get_status', async () => {
      return this.loadImportSummaryStatus();
    });
  }

  private resolveBridgeRuntime(app: AppRuntimeAccess): {
    bridgeId: string;
    client: ZwjsClient | undefined;
  } {
    const session = app.getBridgeSession?.(ZWJS_DEFAULT_BRIDGE_ID);
    const bridgeId =
      this.normalizeStringOrNull(session?.bridgeId) ??
      app.getBridgeId?.() ??
      ZWJS_DEFAULT_BRIDGE_ID;
    const client = session?.getZwjsClient?.() ?? app.getZwjsClient?.();
    return { bridgeId, client };
  }

  private countImportedNodeDevices(bridgeId: string): number {
    return this.getDevices()
      .map((device) => device.getData() as HomeyDeviceData | undefined)
      .filter((entry) => entry?.kind === 'zwjs-node' && entry.bridgeId === bridgeId)
      .filter((entry) => typeof entry?.nodeId === 'number' && Number.isInteger(entry.nodeId))
      .length;
  }

  private async loadImportSummaryStatus(): Promise<{
    generatedAt: string;
    bridgeId: string;
    zwjs: {
      available: boolean;
      transportConnected: boolean;
      lifecycle: string;
      serverVersion: string | null;
      adapterFamily: string | null;
    };
    discoveredNodes: number | null;
    importedNodes: number;
    pendingImportNodes: number | null;
    importedNodeDetails: ImportSummaryNodeEntry[];
    warnings: string[];
  }> {
    const app = this.homey.app as AppRuntimeAccess;
    const runtime = this.resolveBridgeRuntime(app);
    const bridgeId = runtime.bridgeId;
    const client = runtime.client;
    const status = client?.getStatus?.();
    const warnings: string[] = [];
    const zwjs = {
      available: Boolean(client),
      transportConnected: status?.transportConnected === true,
      lifecycle: typeof status?.lifecycle === 'string' ? status.lifecycle : 'stopped',
      serverVersion:
        typeof status?.serverVersion === 'string' && status.serverVersion.trim().length > 0
          ? status.serverVersion.trim()
          : null,
      adapterFamily:
        typeof status?.adapterFamily === 'string' && status.adapterFamily.trim().length > 0
          ? status.adapterFamily.trim()
          : null,
    };
    const discoveredNodeNames = new Map<number, string>();

    let discoveredNodes: number | null = null;
    if (client) {
      try {
        const nodeList = await client.getNodeList();
        const nodes = Array.isArray(nodeList?.nodes) ? nodeList.nodes : [];
        discoveredNodes = nodes.filter((node) => {
          const nodeId = node?.nodeId;
          if (
            typeof node?.name === 'string' &&
            typeof nodeId === 'number' &&
            Number.isInteger(nodeId)
          ) {
            const trimmedName = node.name.trim();
            if (trimmedName.length > 0) {
              discoveredNodeNames.set(nodeId, trimmedName);
            }
          }
          return typeof nodeId === 'number' && Number.isInteger(nodeId) && nodeId > 1;
        }).length;
      } catch (error) {
        this.error('Failed to load node list for node import summary status', {
          error,
          bridgeId,
        });
        warnings.push('Unable to load discovered-node count from ZWJS.');
      }
    } else {
      warnings.push('ZWJS client is unavailable; configure zwjs_connection.url in app settings.');
    }

    let importedNodeDetails: ImportSummaryNodeEntry[] = [];
    let importedNodes = this.countImportedNodeDevices(bridgeId);
    if (app.getNodeRuntimeDiagnostics) {
      try {
        const diagnostics = await app.getNodeRuntimeDiagnostics();
        if (Array.isArray(diagnostics.nodes)) {
          importedNodeDetails = diagnostics.nodes
            .filter((entry) => {
              const entryBridgeId = this.normalizeStringOrNull(entry.bridgeId);
              if (!entryBridgeId) return true;
              return entryBridgeId === bridgeId;
            })
            .map((entry) => {
              const nodeId =
                typeof entry.nodeId === 'number' && Number.isInteger(entry.nodeId)
                  ? entry.nodeId
                  : null;
              const recommendationAction = this.toRecommendationAction(entry.recommendation);
              return {
                homeyDeviceId: this.normalizeStringOrNull(entry.homeyDeviceId),
                bridgeId: this.normalizeStringOrNull(entry.bridgeId) ?? bridgeId,
                nodeId,
                name: nodeId !== null ? (discoveredNodeNames.get(nodeId) ?? null) : null,
                manufacturer: this.normalizeStringOrNull(entry.node?.manufacturer),
                product: this.normalizeStringOrNull(entry.node?.product),
                location: this.normalizeStringOrNull(entry.node?.location),
                status: this.normalizeStringOrNull(entry.node?.status),
                profileHomeyClass: this.normalizeStringOrNull(entry.profile?.homeyClass),
                profileId: this.normalizeStringOrNull(entry.profile?.profileId),
                profileMatch: this.buildProfileMatchSummary(entry.profile),
                recommendationAction,
                recommendationReason: this.normalizeStringOrNull(entry.recommendation?.reasonLabel),
              };
            })
            .sort((left, right) => {
              if (left.nodeId !== null && right.nodeId !== null && left.nodeId !== right.nodeId) {
                return left.nodeId - right.nodeId;
              }
              if (left.nodeId !== null && right.nodeId === null) return -1;
              if (left.nodeId === null && right.nodeId !== null) return 1;
              const leftId = left.homeyDeviceId ?? '';
              const rightId = right.homeyDeviceId ?? '';
              return leftId.localeCompare(rightId);
            });
          importedNodes = importedNodeDetails.length;
        }
      } catch (error) {
        this.error('Failed to load runtime node diagnostics for import summary status', {
          error,
          bridgeId,
        });
        warnings.push('Unable to load imported-node count from runtime diagnostics.');
      }
    }

    const pendingImportNodes =
      typeof discoveredNodes === 'number' ? Math.max(discoveredNodes - importedNodes, 0) : null;
    if (!zwjs.transportConnected) {
      warnings.push('ZWJS transport is not connected; discovery/import counts may be stale.');
    }

    return {
      generatedAt: new Date().toISOString(),
      bridgeId,
      zwjs,
      discoveredNodes,
      importedNodes,
      pendingImportNodes,
      importedNodeDetails,
      warnings,
    };
  }

  private normalizeStringOrNull(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private toRecommendationAction(
    recommendation:
      | {
          available?: boolean;
          backfillNeeded?: boolean;
        }
      | null
      | undefined,
  ): string {
    if (recommendation?.backfillNeeded === true) return 'backfill-marker';
    if (recommendation?.available === true) return 'adopt-recommended-baseline';
    return 'none';
  }

  private buildProfileMatchSummary(
    profile:
      | {
          matchBy?: string | null;
          matchKey?: string | null;
        }
      | null
      | undefined,
  ): string | null {
    const matchBy = this.normalizeStringOrNull(profile?.matchBy);
    const matchKey = this.normalizeStringOrNull(profile?.matchKey);
    if (!matchBy && !matchKey) return null;
    return `${matchBy ?? 'n/a'} / ${matchKey ?? 'n/a'}`;
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
    const runtime = this.resolveBridgeRuntime(app);
    const client = runtime.client;
    if (!client) {
      throw new Error(
        'ZWJS client unavailable. Configure zwjs_connection.url in app settings and connect a bridge first.',
      );
    }

    let latestCandidates: ReturnType<typeof buildNodePairCandidates> = [];
    const runPairFlow = async () => {
      const bridgeId = runtime.bridgeId;
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
      latestCandidates = candidates;
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
            NodeDriver.PAIR_ICON_INFERENCE_TIMEOUT_MS,
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
      if (latestCandidates.length > 0) {
        this.log(
          'Node pairing flow failed after candidate discovery; returning partial pair list',
          {
            candidates: latestCandidates.length,
          },
        );
        return latestCandidates;
      }
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
