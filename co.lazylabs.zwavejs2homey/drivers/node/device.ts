import Homey from 'homey';
import type { ZwjsClient } from '@zwavejs2homey/core';
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

module.exports = class NodeDevice extends Homey.Device {
  private zwjsEventUnsubscribers: Array<() => void> = [];

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
  ): Promise<boolean> {
    const {
      capabilityId,
      inboundSelector,
      inboundTransformRef,
      outboundTarget,
      outboundTransformRef,
    } = slice;
    if (!this.hasCapability(capabilityId)) {
      return false;
    }

    if (inboundSelector) {
      try {
        const valueResult = await client.getNodeValue(nodeId, inboundSelector);
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

    if (outboundTarget) {
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
          valueId: outboundTarget,
          value: outboundValue,
        });
        if (!mutationResult.success) {
          throw new Error(`setNodeValue failed (${mutationResult.error.errorCode ?? 'unknown'})`);
        }
      });
    }
    if (inboundSelector) {
      const unsubscribe = client.onEvent((event) => {
        if (event.type !== 'zwjs.event.node.value-updated') return;
        if (event.event.nodeId !== nodeId) return;
        if (!selectorMatchesNodeValueUpdatedEvent(inboundSelector, event.event)) return;
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
    return Boolean(inboundSelector || outboundTarget);
  }

  async onInit() {
    const app = this.homey.app as AppRuntimeAccess;
    const ctx = this.getNodeContext();
    const client = app.getZwjsClient?.();
    const clientStatus = client?.getStatus();
    const resolverStatus = app.getCompiledProfilesStatus?.();
    let selector: ReturnType<typeof buildNodeResolverSelector> | undefined;
    let match: CompiledProfileResolverMatchV1 = { by: 'none' };
    let classification = resolveNodeProfileClassification(match, resolverStatus);
    let verticalSliceApplied = false;
    this.clearZwjsEventSubscriptions();

    if (ctx.nodeId !== undefined && client) {
      try {
        const nodeStateResult = await client.getNodeState(ctx.nodeId);
        if (nodeStateResult.success) {
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
              const applied = await this.applyCapabilityVerticalSlice(
                client,
                ctx.nodeId,
                mappingSlice,
              );
              if (applied) verticalSliceApplied = true;
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
    });

    this.log('NodeDevice initialized', {
      bridgeId: ctx.bridgeId,
      nodeId: ctx.nodeId,
      zwjsTransportConnected: clientStatus?.transportConnected === true,
      zwjsLifecycle: clientStatus?.lifecycle ?? 'stopped',
      profileMatchBy: classification.matchBy,
      profileId: classification.profileId,
      fallbackReason: classification.fallbackReason,
      verticalSliceApplied,
    });
    // Phase 5 follow-up slices:
    // - register capability listeners based on resolved mappings
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
