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

interface AppRuntimeAccess {
  getZwjsClient?: () => ZwjsClient | undefined;
  getBridgeId?: () => string;
  getCompiledProfilesStatus?: () => CompiledProfilesRuntimeStatus;
  resolveCompiledProfileEntry?: (
    selector: ReturnType<typeof buildNodeResolverSelector>,
  ) => CompiledProfileResolverMatchV1;
}

module.exports = class NodeDevice extends Homey.Device {
  private getNodeContext() {
    const data = this.getData() as { bridgeId?: string; nodeId?: number } | undefined;
    return {
      bridgeId: data?.bridgeId ?? 'unknown',
      nodeId: typeof data?.nodeId === 'number' ? data.nodeId : undefined,
    };
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
    });

    this.log('NodeDevice initialized', {
      bridgeId: ctx.bridgeId,
      nodeId: ctx.nodeId,
      zwjsTransportConnected: clientStatus?.transportConnected === true,
      zwjsLifecycle: clientStatus?.lifecycle ?? 'stopped',
      profileMatchBy: classification.matchBy,
      profileId: classification.profileId,
      fallbackReason: classification.fallbackReason,
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
    const ctx = this.getNodeContext();
    this.log('NodeDevice deleted', ctx);
  }
};
