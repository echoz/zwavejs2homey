import Homey from 'homey';
import {
  extractZwjsDefinedValueIds,
  isZwjsNodeValueMetadataResult,
  type ZwjsClient,
  type ZwjsValueId,
} from '@zwavejs2homey/core';
import type {
  CompiledProfileResolverMatchV1,
  CompiledProfilesRuntimeStatus,
} from '../../compiled-profiles';
import {
  buildNodeResolverSelector,
  resolveNodeProfileClassification,
} from '../../compiled-profiles';
import {
  coerceCapabilityInboundValue,
  coerceCapabilityOutboundValue,
  extractCapabilityRuntimeVerticals,
  type CapabilityRuntimeVerticalSlice,
  selectorMatchesNodeValueUpdatedEvent,
} from '../../node-runtime';

interface AppRuntimeAccess {
  getZwjsClient?: () => ZwjsClient | undefined;
  getBridgeId?: () => string;
  getCompiledProfilesStatus?: () => CompiledProfilesRuntimeStatus;
  resolveCompiledProfileEntry?: (
    selector: ReturnType<typeof buildNodeResolverSelector>,
  ) => CompiledProfileResolverMatchV1;
}

type MappingGateReason =
  | 'capability_missing_on_homey_device'
  | 'inbound_selector_not_defined'
  | 'inbound_selector_not_readable'
  | 'outbound_target_not_defined'
  | 'outbound_target_not_writeable'
  | 'outbound_target_writeability_unknown';

interface MappingDirectionDiagnostic {
  configured: boolean;
  enabled: boolean;
  reason: MappingGateReason | null;
  valueId: ZwjsValueId | null;
}

interface CapabilityMappingDiagnostic {
  capabilityId: string;
  inbound: MappingDirectionDiagnostic;
  outbound: MappingDirectionDiagnostic;
}

interface ValueIdLike {
  commandClass: unknown;
  endpoint?: unknown;
  property: unknown;
  propertyKey?: unknown;
}

interface NodeDefinedValueFacts {
  readable?: boolean;
  writeable?: boolean;
}

function parseNumericIdentity(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    const parsedHex = Number.parseInt(trimmed.slice(2), 16);
    return Number.isInteger(parsedHex) && Number.isFinite(parsedHex) ? parsedHex : undefined;
  }
  if (/^\d+$/.test(trimmed)) {
    const parsedDec = Number.parseInt(trimmed, 10);
    return Number.isInteger(parsedDec) && Number.isFinite(parsedDec) ? parsedDec : undefined;
  }
  return undefined;
}

function normalizeComparableValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function toValueIdLookupKey(valueId: ValueIdLike): string | undefined {
  const commandClass = parseNumericIdentity(valueId.commandClass);
  const property = normalizeComparableValue(valueId.property);
  if (commandClass === undefined || property === undefined) return undefined;

  const endpoint = parseNumericIdentity(valueId.endpoint);
  const normalizedEndpoint = endpoint ?? 0;

  let propertyKey = '';
  if (valueId.propertyKey !== undefined) {
    const normalizedPropertyKey = normalizeComparableValue(valueId.propertyKey);
    if (normalizedPropertyKey === undefined) return undefined;
    propertyKey = normalizedPropertyKey;
  }

  return `${commandClass}|${normalizedEndpoint}|${property}|${propertyKey}`;
}

function cloneValueId(valueId: ZwjsValueId): ZwjsValueId {
  const clone: ZwjsValueId = {
    commandClass: valueId.commandClass,
    property: valueId.property,
  };
  if (valueId.endpoint !== undefined) clone.endpoint = valueId.endpoint;
  if (valueId.propertyKey !== undefined) clone.propertyKey = valueId.propertyKey;
  return clone;
}

module.exports = class NodeDevice extends Homey.Device {
  private zwjsEventUnsubscribers: Array<() => void> = [];

  private createMappingDiagnostic(
    slice: CapabilityRuntimeVerticalSlice,
  ): CapabilityMappingDiagnostic {
    return {
      capabilityId: slice.capabilityId,
      inbound: {
        configured: Boolean(slice.inboundSelector),
        enabled: false,
        reason: null,
        valueId: slice.inboundSelector ? cloneValueId(slice.inboundSelector) : null,
      },
      outbound: {
        configured: Boolean(slice.outboundTarget),
        enabled: false,
        reason: null,
        valueId: slice.outboundTarget ? cloneValueId(slice.outboundTarget) : null,
      },
    };
  }

  private async loadNodeDefinedValueIndex(
    client: ZwjsClient,
    nodeId: number,
  ): Promise<Map<string, NodeDefinedValueFacts>> {
    const index = new Map<string, NodeDefinedValueFacts>();
    const result = await client.getNodeDefinedValueIds(nodeId);
    if (!result.success) {
      this.error('NodeDevice failed to load node defined value IDs', {
        nodeId,
        error: result.error,
      });
      return index;
    }

    const valueIds = extractZwjsDefinedValueIds(result.result);
    for (const valueId of valueIds) {
      const key = toValueIdLookupKey(valueId);
      if (!key) continue;
      const existing = index.get(key);
      if (existing) {
        if (existing.readable === undefined && typeof valueId.readable === 'boolean') {
          existing.readable = valueId.readable;
        }
        if (existing.writeable === undefined && typeof valueId.writeable === 'boolean') {
          existing.writeable = valueId.writeable;
        }
        continue;
      }

      index.set(key, {
        readable: typeof valueId.readable === 'boolean' ? valueId.readable : undefined,
        writeable: typeof valueId.writeable === 'boolean' ? valueId.writeable : undefined,
      });
    }
    return index;
  }

  private getNodeDefinedValueFacts(
    valueIndex: Map<string, NodeDefinedValueFacts>,
    valueId: ZwjsValueId,
  ): NodeDefinedValueFacts | undefined {
    const key = toValueIdLookupKey(valueId);
    if (!key) return undefined;
    return valueIndex.get(key);
  }

  private async resolveWriteabilityFromMetadata(
    client: ZwjsClient,
    nodeId: number,
    valueId: ZwjsValueId,
    metadataWriteableCache: Map<string, boolean | null>,
  ): Promise<boolean | null> {
    const key = toValueIdLookupKey(valueId);
    if (!key) return null;
    if (metadataWriteableCache.has(key)) {
      return metadataWriteableCache.get(key) ?? null;
    }

    const metadataResult = await client.getNodeValueMetadata(nodeId, valueId);
    if (!metadataResult.success) {
      this.error('NodeDevice failed to read value metadata', {
        nodeId,
        valueId,
        error: metadataResult.error,
      });
      metadataWriteableCache.set(key, null);
      return null;
    }

    const metadata = metadataResult.result;
    if (isZwjsNodeValueMetadataResult(metadata) && typeof metadata.writeable === 'boolean') {
      metadataWriteableCache.set(key, metadata.writeable);
      return metadata.writeable;
    }
    let metadataRecord: Record<string, unknown> | undefined;
    if (metadata && typeof metadata === 'object') {
      metadataRecord = metadata as Record<string, unknown>;
    }
    if (metadataRecord && typeof metadataRecord.writeable === 'boolean') {
      const { writeable } = metadataRecord as { writeable: boolean };
      metadataWriteableCache.set(key, writeable);
      return writeable;
    }

    metadataWriteableCache.set(key, null);
    return null;
  }

  private getNodeContext() {
    const data = this.getData() as { bridgeId?: string; nodeId?: number } | undefined;
    return {
      bridgeId: data?.bridgeId ?? 'unknown',
      nodeId: typeof data?.nodeId === 'number' ? data.nodeId : undefined,
    };
  }

  private clearZwjsEventSubscriptions(): void {
    for (const unsubscribe of this.zwjsEventUnsubscribers) {
      unsubscribe();
    }
    this.zwjsEventUnsubscribers = [];
  }

  private async applyCapabilityVerticalSlice(
    client: ZwjsClient,
    nodeId: number,
    slice: CapabilityRuntimeVerticalSlice,
    valueIndex: Map<string, NodeDefinedValueFacts>,
    metadataWriteableCache: Map<string, boolean | null>,
  ): Promise<{ applied: boolean; diagnostic: CapabilityMappingDiagnostic }> {
    const {
      capabilityId,
      inboundSelector,
      inboundTransformRef,
      outboundTarget,
      outboundTransformRef,
    } = slice;
    const diagnostic = this.createMappingDiagnostic(slice);
    if (!this.hasCapability(capabilityId)) {
      if (diagnostic.inbound.configured) {
        diagnostic.inbound.reason = 'capability_missing_on_homey_device';
      }
      if (diagnostic.outbound.configured) {
        diagnostic.outbound.reason = 'capability_missing_on_homey_device';
      }
      return { applied: false, diagnostic };
    }

    let enabledInboundSelector: ZwjsValueId | undefined;
    if (inboundSelector) {
      const facts = this.getNodeDefinedValueFacts(valueIndex, inboundSelector);
      if (!facts) {
        diagnostic.inbound.reason = 'inbound_selector_not_defined';
      } else if (facts.readable === false) {
        diagnostic.inbound.reason = 'inbound_selector_not_readable';
      } else {
        enabledInboundSelector = inboundSelector;
        diagnostic.inbound.enabled = true;
      }
    }

    let enabledOutboundTarget: ZwjsValueId | undefined;
    if (outboundTarget) {
      const facts = this.getNodeDefinedValueFacts(valueIndex, outboundTarget);
      if (!facts) {
        diagnostic.outbound.reason = 'outbound_target_not_defined';
      } else {
        const { writeable: factsWriteable } = facts;
        let writeable: boolean | null | undefined = factsWriteable;
        if (writeable !== true) {
          writeable = await this.resolveWriteabilityFromMetadata(
            client,
            nodeId,
            outboundTarget,
            metadataWriteableCache,
          );
        }
        if (writeable === true) {
          enabledOutboundTarget = outboundTarget;
          diagnostic.outbound.enabled = true;
        } else if (writeable === false) {
          diagnostic.outbound.reason = 'outbound_target_not_writeable';
        } else {
          diagnostic.outbound.reason = 'outbound_target_writeability_unknown';
        }
      }
    }

    if (enabledInboundSelector) {
      try {
        const valueResult = await client.getNodeValue(nodeId, enabledInboundSelector);
        if (!valueResult.success) {
          this.error('NodeDevice failed to read inbound value', {
            nodeId,
            capabilityId,
            error: valueResult.error,
          });
        } else {
          const nextValue = coerceCapabilityInboundValue(
            capabilityId,
            valueResult.result,
            inboundTransformRef,
          );
          if (nextValue !== undefined) {
            await this.setCapabilityValue(capabilityId, nextValue);
          } else {
            this.error('NodeDevice failed to coerce inbound value', {
              nodeId,
              capabilityId,
              value: valueResult.result,
            });
          }
        }
      } catch (error) {
        this.error('NodeDevice failed to read inbound value', {
          nodeId,
          capabilityId,
          error,
        });
      }
    }

    if (enabledOutboundTarget) {
      this.registerCapabilityListener(capabilityId, async (value: unknown) => {
        const outboundValue = coerceCapabilityOutboundValue(
          capabilityId,
          value,
          outboundTransformRef,
        );
        if (outboundValue === undefined) {
          throw new Error(`${capabilityId} capability value is not supported for outbound mapping`);
        }

        const mutationResult = await client.setNodeValue({
          nodeId,
          valueId: enabledOutboundTarget,
          value: outboundValue,
        });
        if (!mutationResult.success) {
          throw new Error(`setNodeValue failed (${mutationResult.error.errorCode ?? 'unknown'})`);
        }
      });
    }
    if (enabledInboundSelector) {
      const unsubscribe = client.onEvent((event) => {
        if (event.type !== 'zwjs.event.node.value-updated') return;
        if (event.event.nodeId !== nodeId) return;
        if (!selectorMatchesNodeValueUpdatedEvent(enabledInboundSelector, event.event)) return;
        const nextValue = coerceCapabilityInboundValue(
          capabilityId,
          event.event.args?.newValue,
          inboundTransformRef,
        );
        if (nextValue === undefined) return;
        this.setCapabilityValue(capabilityId, nextValue).catch((error: unknown) => {
          this.error('NodeDevice failed to apply value-updated event', {
            nodeId,
            capabilityId,
            error,
          });
        });
      });
      this.zwjsEventUnsubscribers.push(unsubscribe);
    }
    return {
      applied: Boolean(enabledInboundSelector || enabledOutboundTarget),
      diagnostic,
    };
  }

  private async syncRuntimeMappings(syncReason: string): Promise<void> {
    const app = this.homey.app as AppRuntimeAccess;
    const ctx = this.getNodeContext();
    const client = app.getZwjsClient?.();
    const clientStatus = client?.getStatus();
    const resolverStatus = app.getCompiledProfilesStatus?.();
    let selector: ReturnType<typeof buildNodeResolverSelector> | undefined;
    let match: CompiledProfileResolverMatchV1 = { by: 'none' };
    let classification = resolveNodeProfileClassification(match, resolverStatus);
    let verticalSliceApplied = false;
    const mappingDiagnostics: CapabilityMappingDiagnostic[] = [];
    this.clearZwjsEventSubscriptions();

    if (ctx.nodeId !== undefined && client) {
      try {
        const nodeStateResult = await client.getNodeState(ctx.nodeId);
        if (nodeStateResult.success) {
          const valueIndex = await this.loadNodeDefinedValueIndex(client, ctx.nodeId);
          const metadataWriteableCache = new Map<string, boolean | null>();
          const nodeContext = {
            bridgeId: ctx.bridgeId,
            nodeId: ctx.nodeId,
          };
          selector = buildNodeResolverSelector(nodeContext, nodeStateResult.result?.state);
          match = app.resolveCompiledProfileEntry?.(selector) ?? { by: 'none' };
          classification = resolveNodeProfileClassification(match, resolverStatus);
          if (match.entry) {
            const mappingSlices = extractCapabilityRuntimeVerticals(match.entry.compiled.profile);
            for (const mappingSlice of mappingSlices) {
              const result = await this.applyCapabilityVerticalSlice(
                client,
                ctx.nodeId,
                mappingSlice,
                valueIndex,
                metadataWriteableCache,
              );
              mappingDiagnostics.push(result.diagnostic);
              if (result.applied) verticalSliceApplied = true;
            }
          }
        } else {
          classification = {
            matchBy: classification.matchBy,
            matchKey: classification.matchKey,
            profileId: classification.profileId,
            classification: classification.classification,
            fallbackReason: 'zwjs_node_state_unavailable',
          };
          this.error('NodeDevice failed to fetch node state', {
            bridgeId: ctx.bridgeId,
            nodeId: ctx.nodeId,
            error: nodeStateResult.error,
          });
        }
      } catch (error) {
        classification = {
          matchBy: classification.matchBy,
          matchKey: classification.matchKey,
          profileId: classification.profileId,
          classification: classification.classification,
          fallbackReason: 'zwjs_node_state_error',
        };
        this.error('NodeDevice failed to fetch node state', {
          bridgeId: ctx.bridgeId,
          nodeId: ctx.nodeId,
          error,
        });
      }
    } else if (!client) {
      classification = {
        matchBy: classification.matchBy,
        matchKey: classification.matchKey,
        profileId: classification.profileId,
        classification: classification.classification,
        fallbackReason: 'zwjs_client_unavailable',
      };
    }

    await this.setStoreValue('profileResolution', {
      resolvedAt: new Date().toISOString(),
      syncedAt: new Date().toISOString(),
      syncReason,
      selector: selector ?? null,
      matchBy: classification.matchBy,
      matchKey: classification.matchKey,
      profileId: classification.profileId,
      classification: classification.classification,
      fallbackReason: classification.fallbackReason,
      resolverLoaded: resolverStatus?.loaded === true,
      resolverSourcePath: resolverStatus?.sourcePath ?? null,
      resolverError: resolverStatus?.errorMessage ?? null,
      verticalSliceApplied,
      mappingDiagnostics,
    });

    this.log('NodeDevice initialized', {
      bridgeId: ctx.bridgeId,
      nodeId: ctx.nodeId,
      zwjsTransportConnected: clientStatus?.transportConnected === true,
      zwjsLifecycle: clientStatus?.lifecycle ?? 'stopped',
      syncReason,
      profileMatchBy: classification.matchBy,
      profileId: classification.profileId,
      fallbackReason: classification.fallbackReason,
      verticalSliceApplied,
    });
  }

  async onInit() {
    await this.syncRuntimeMappings('init');
  }

  async onRuntimeMappingsRefresh(reason = 'runtime-refresh') {
    await this.syncRuntimeMappings(reason);
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
    this.clearZwjsEventSubscriptions();
    const ctx = this.getNodeContext();
    this.log('NodeDevice deleted', ctx);
  }
};
