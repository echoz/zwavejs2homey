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
  coerceDimInboundValue,
  coerceDimOutboundValue,
  coerceOnOffValue,
  extractDimCapabilityVertical,
  extractOnOffCapabilityVertical,
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

  private async applyOnOffVerticalSlice(
    client: ZwjsClient,
    nodeId: number,
    slice: NonNullable<ReturnType<typeof extractOnOffCapabilityVertical>>,
  ): Promise<boolean> {
    if (!this.hasCapability('onoff')) {
      return false;
    }

    try {
      const valueResult = await client.getNodeValue(nodeId, slice.inboundSelector);
      if (!valueResult.success) {
        this.error('NodeDevice failed to read onoff inbound value', {
          nodeId,
          error: valueResult.error,
        });
      } else {
        const nextValue = coerceOnOffValue(valueResult.result);
        if (nextValue !== undefined) {
          await this.setCapabilityValue('onoff', nextValue);
        } else {
          this.error('NodeDevice received non-boolean onoff inbound value', {
            nodeId,
            value: valueResult.result,
          });
        }
      }
    } catch (error) {
      this.error('NodeDevice failed to read onoff inbound value', {
        nodeId,
        error,
      });
    }

    this.registerCapabilityListener('onoff', async (value: unknown) => {
      const outboundValue = coerceOnOffValue(value);
      if (outboundValue === undefined) {
        throw new Error('onoff capability value must be boolean-like');
      }

      const mutationResult = await client.setNodeValue({
        nodeId,
        valueId: slice.outboundTarget,
        value: outboundValue,
      });
      if (!mutationResult.success) {
        throw new Error(`setNodeValue failed (${mutationResult.error.errorCode ?? 'unknown'})`);
      }
    });

    const unsubscribe = client.onEvent((event) => {
      if (event.type !== 'zwjs.event.node.value-updated') return;
      if (event.event.nodeId !== nodeId) return;
      if (!selectorMatchesNodeValueUpdatedEvent(slice.inboundSelector, event.event)) return;
      const nextValue = coerceOnOffValue(event.event.args?.newValue);
      if (nextValue === undefined) return;
      this.setCapabilityValue('onoff', nextValue).catch((error: unknown) => {
        this.error('NodeDevice failed to apply onoff value-updated event', {
          nodeId,
          error,
        });
      });
    });
    this.zwjsEventUnsubscribers.push(unsubscribe);
    return true;
  }

  private async applyDimVerticalSlice(
    client: ZwjsClient,
    nodeId: number,
    slice: NonNullable<ReturnType<typeof extractDimCapabilityVertical>>,
  ): Promise<boolean> {
    if (!this.hasCapability('dim')) {
      return false;
    }

    try {
      const valueResult = await client.getNodeValue(nodeId, slice.inboundSelector);
      if (!valueResult.success) {
        this.error('NodeDevice failed to read dim inbound value', {
          nodeId,
          error: valueResult.error,
        });
      } else {
        const nextValue = coerceDimInboundValue(valueResult.result, slice.inboundTransformRef);
        if (nextValue !== undefined) {
          await this.setCapabilityValue('dim', nextValue);
        } else {
          this.error('NodeDevice received non-numeric dim inbound value', {
            nodeId,
            value: valueResult.result,
          });
        }
      }
    } catch (error) {
      this.error('NodeDevice failed to read dim inbound value', {
        nodeId,
        error,
      });
    }

    this.registerCapabilityListener('dim', async (value: unknown) => {
      const outboundValue = coerceDimOutboundValue(value, slice.outboundTransformRef);
      if (outboundValue === undefined) {
        throw new Error('dim capability value must be numeric');
      }

      const mutationResult = await client.setNodeValue({
        nodeId,
        valueId: slice.outboundTarget,
        value: outboundValue,
      });
      if (!mutationResult.success) {
        throw new Error(`setNodeValue failed (${mutationResult.error.errorCode ?? 'unknown'})`);
      }
    });

    const unsubscribe = client.onEvent((event) => {
      if (event.type !== 'zwjs.event.node.value-updated') return;
      if (event.event.nodeId !== nodeId) return;
      if (!selectorMatchesNodeValueUpdatedEvent(slice.inboundSelector, event.event)) return;
      const nextValue = coerceDimInboundValue(
        event.event.args?.newValue,
        slice.inboundTransformRef,
      );
      if (nextValue === undefined) return;
      this.setCapabilityValue('dim', nextValue).catch((error: unknown) => {
        this.error('NodeDevice failed to apply dim value-updated event', {
          nodeId,
          error,
        });
      });
    });
    this.zwjsEventUnsubscribers.push(unsubscribe);
    return true;
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
            const onoffSlice = extractOnOffCapabilityVertical(match.entry.compiled.profile);
            if (onoffSlice) {
              const applied = await this.applyOnOffVerticalSlice(client, ctx.nodeId, onoffSlice);
              if (applied) verticalSliceApplied = true;
            }

            const dimSlice = extractDimCapabilityVertical(match.entry.compiled.profile);
            if (dimSlice) {
              const applied = await this.applyDimVerticalSlice(client, ctx.nodeId, dimSlice);
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
