interface RequestOrderGate {
  begin: (channel: string) => number;
  isCurrent: (channel: string, ticket: number) => boolean;
  finish: (channel: string) => void;
  isBusy: (channels?: string[]) => boolean;
  getInFlightCount: (channel: string) => number;
}

interface RequestOrderGateApi {
  createRequestOrderGate: () => RequestOrderGate;
}

interface UiRoot {
  Zwjs2HomeyUi?: {
    requestOrderGate?: RequestOrderGateApi;
  };
}

(function attachRequestOrderGate(root: UiRoot | undefined, factory: () => RequestOrderGateApi) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  const nextRoot = root || {};
  nextRoot.Zwjs2HomeyUi = nextRoot.Zwjs2HomeyUi || {};
  nextRoot.Zwjs2HomeyUi.requestOrderGate = api;
})(
  typeof window !== 'undefined'
    ? (window as unknown as UiRoot)
    : typeof global !== 'undefined'
      ? (global as unknown as UiRoot)
      : ({} as UiRoot),
  function createApi() {
    function createRequestOrderGate(): RequestOrderGate {
      const latestTicketByChannel = new Map<string, number>();
      const inFlightCountByChannel = new Map<string, number>();

      function begin(channel: string): number {
        const normalizedChannel = channel.trim();
        const nextTicket = (latestTicketByChannel.get(normalizedChannel) ?? 0) + 1;
        latestTicketByChannel.set(normalizedChannel, nextTicket);
        inFlightCountByChannel.set(
          normalizedChannel,
          (inFlightCountByChannel.get(normalizedChannel) ?? 0) + 1,
        );
        return nextTicket;
      }

      function isCurrent(channel: string, ticket: number): boolean {
        const normalizedChannel = channel.trim();
        return (latestTicketByChannel.get(normalizedChannel) ?? 0) === ticket;
      }

      function finish(channel: string): void {
        const normalizedChannel = channel.trim();
        const current = inFlightCountByChannel.get(normalizedChannel) ?? 0;
        if (current <= 1) {
          inFlightCountByChannel.delete(normalizedChannel);
          return;
        }
        inFlightCountByChannel.set(normalizedChannel, current - 1);
      }

      function getInFlightCount(channel: string): number {
        const normalizedChannel = channel.trim();
        return inFlightCountByChannel.get(normalizedChannel) ?? 0;
      }

      function isBusy(channels?: string[]): boolean {
        if (Array.isArray(channels) && channels.length > 0) {
          return channels.some((channel) => getInFlightCount(channel) > 0);
        }
        for (const count of inFlightCountByChannel.values()) {
          if (count > 0) return true;
        }
        return false;
      }

      return {
        begin,
        isCurrent,
        finish,
        isBusy,
        getInFlightCount,
      };
    }

    return {
      createRequestOrderGate,
    };
  },
);
