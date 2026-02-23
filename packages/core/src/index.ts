export interface BridgeService {
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): BridgeStatus;
}

export interface BridgeStatus {
  running: boolean;
  startedAt?: string;
}

class PlaceholderBridgeService implements BridgeService {
  private startedAt?: Date;

  async start(): Promise<void> {
    if (this.startedAt) return;
    this.startedAt = new Date();
  }

  async stop(): Promise<void> {
    this.startedAt = undefined;
  }

  getStatus(): BridgeStatus {
    return {
      running: this.startedAt !== undefined,
      startedAt: this.startedAt?.toISOString(),
    };
  }
}

export function createBridgeService(): BridgeService {
  return new PlaceholderBridgeService();
}
