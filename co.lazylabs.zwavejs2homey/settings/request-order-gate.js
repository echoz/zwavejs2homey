(function attachRequestOrderGate(root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    const nextRoot = root || {};
    nextRoot.Zwjs2HomeyUi = nextRoot.Zwjs2HomeyUi || {};
    nextRoot.Zwjs2HomeyUi.requestOrderGate = api;
})(typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined'
        ? global
        : {}, function createApi() {
    function createRequestOrderGate() {
        const latestTicketByChannel = new Map();
        const inFlightCountByChannel = new Map();
        function begin(channel) {
            const normalizedChannel = channel.trim();
            const nextTicket = (latestTicketByChannel.get(normalizedChannel) ?? 0) + 1;
            latestTicketByChannel.set(normalizedChannel, nextTicket);
            inFlightCountByChannel.set(normalizedChannel, (inFlightCountByChannel.get(normalizedChannel) ?? 0) + 1);
            return nextTicket;
        }
        function isCurrent(channel, ticket) {
            const normalizedChannel = channel.trim();
            return (latestTicketByChannel.get(normalizedChannel) ?? 0) === ticket;
        }
        function finish(channel) {
            const normalizedChannel = channel.trim();
            const current = inFlightCountByChannel.get(normalizedChannel) ?? 0;
            if (current <= 1) {
                inFlightCountByChannel.delete(normalizedChannel);
                return;
            }
            inFlightCountByChannel.set(normalizedChannel, current - 1);
        }
        function getInFlightCount(channel) {
            const normalizedChannel = channel.trim();
            return inFlightCountByChannel.get(normalizedChannel) ?? 0;
        }
        function isBusy(channels) {
            if (Array.isArray(channels) && channels.length > 0) {
                return channels.some((channel) => getInFlightCount(channel) > 0);
            }
            for (const count of inFlightCountByChannel.values()) {
                if (count > 0)
                    return true;
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
});
