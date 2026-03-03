"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultZwjsFamilyNormalizer = void 0;
const errors_1 = require("../../errors");
const raw_frame_types_1 = require("../raw-frame-types");
const event_guards_1 = require("../event-guards");
class DefaultZwjsFamilyNormalizer {
    constructor() {
        this.family = 'zwjs-default';
    }
    canHandleVersion() {
        return true;
    }
    normalizeIncoming(message) {
        if (!(0, raw_frame_types_1.isRecord)(message)) {
            throw new errors_1.ZwjsClientError({
                code: 'PROTOCOL_ERROR',
                message: 'Incoming message is not an object',
            });
        }
        const record = message;
        const type = typeof record.type === 'string' ? record.type : undefined;
        const messageId = (0, raw_frame_types_1.isZwjsResultFrame)(record)
            ? record.messageId
            : typeof record.messageId === 'string'
                ? record.messageId
                : undefined;
        const events = [];
        let serverInfo;
        let nodesSnapshot;
        if ((0, raw_frame_types_1.isZwjsVersionFrame)(record)) {
            serverInfo = {
                serverVersion: record.serverVersion,
                zwaveJsVersion: record.driverVersion,
                schemaHints: [`min:${record.minSchemaVersion}`, `max:${record.maxSchemaVersion}`],
                raw: record,
            };
            events.push({
                type: 'server.info',
                ts: new Date().toISOString(),
                source: 'zwjs-client',
                info: serverInfo,
            });
        }
        else if (type === 'server.info' &&
            typeof record.payload === 'object' &&
            record.payload !== null) {
            const payload = record.payload;
            serverInfo = {
                serverVersion: typeof payload.serverVersion === 'string' ? payload.serverVersion : undefined,
                zwaveJsVersion: typeof payload.zwaveJsVersion === 'string' ? payload.zwaveJsVersion : undefined,
                schemaHints: Array.isArray(payload.schemaHints)
                    ? payload.schemaHints.filter((v) => typeof v === 'string')
                    : undefined,
                raw: payload,
            };
            events.push({
                type: 'server.info',
                ts: new Date().toISOString(),
                source: 'zwjs-client',
                info: serverInfo,
            });
        }
        const resultPayload = 'result' in record ? record.result : undefined;
        const candidateNodes = type === 'nodes.snapshot' && Array.isArray(record.payload)
            ? record.payload
            : typeof resultPayload === 'object' &&
                resultPayload !== null &&
                typeof resultPayload.state === 'object' &&
                resultPayload.state !== null &&
                Array.isArray(resultPayload.state.nodes)
                ? resultPayload.state
                    .nodes
                : undefined;
        if (candidateNodes) {
            const nodes = candidateNodes
                .filter((item) => typeof item === 'object' && item !== null)
                .map((node) => ({
                nodeId: typeof node.nodeId === 'number'
                    ? node.nodeId
                    : typeof node.id === 'number'
                        ? node.id
                        : -1,
                name: typeof node.name === 'string' ? node.name : undefined,
                location: typeof node.location === 'string'
                    ? node.location
                    : typeof node.loc === 'string'
                        ? node.loc
                        : undefined,
                ready: typeof node.ready === 'boolean' ? node.ready : undefined,
                status: typeof node.status === 'string' ? node.status : undefined,
            }))
                .filter((node) => node.nodeId >= 0);
            nodesSnapshot = { nodes };
            events.push({
                type: 'nodes.snapshot',
                ts: new Date().toISOString(),
                source: 'zwjs-client',
                nodes: nodesSnapshot,
            });
        }
        if ((0, raw_frame_types_1.isZwjsEventFrame)(record)) {
            const protocolEvent = record.event;
            const protocolSource = typeof protocolEvent.source === 'string' ? protocolEvent.source : undefined;
            const typedEventType = protocolSource === 'driver'
                ? 'zwjs.event.driver'
                : protocolSource === 'controller'
                    ? 'zwjs.event.controller'
                    : protocolSource === 'node'
                        ? 'zwjs.event.node'
                        : protocolSource === 'zniffer'
                            ? 'zwjs.event.zniffer'
                            : undefined;
            if (typedEventType) {
                events.push({
                    type: typedEventType,
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            if ((0, event_guards_1.isZwjsDriverLoggingEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.driver.logging',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsDriverLogConfigUpdatedEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.driver.log-config-updated',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsDriverFirmwareUpdateProgressEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.driver.firmware-update-progress',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsDriverFirmwareUpdateFinishedEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.driver.firmware-update-finished',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsControllerGrantSecurityClassesEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.controller.grant-security-classes',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsControllerValidateDskAndEnterPinEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.controller.validate-dsk-and-enter-pin',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsControllerInclusionAbortedEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.controller.inclusion-aborted',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsControllerNvmBackupProgressEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.controller.nvm-backup-progress',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsControllerNvmConvertProgressEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.controller.nvm-convert-progress',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsControllerNvmRestoreProgressEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.controller.nvm-restore-progress',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsControllerFirmwareUpdateProgressEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.controller.firmware-update-progress',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsControllerFirmwareUpdateFinishedEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.controller.firmware-update-finished',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsZnifferReadyEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.zniffer.ready',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsZnifferCorruptedFrameEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.zniffer.corrupted-frame',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsZnifferFrameEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.zniffer.frame',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsZnifferErrorEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.zniffer.error',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            if ((0, event_guards_1.isZwjsNodeValueUpdatedEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.node.value-updated',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsNodeValueAddedEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.node.value-added',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsNodeValueRemovedEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.node.value-removed',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsNodeValueNotificationEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.node.value-notification',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsNodeInterviewStartedEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.node.interview-started',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsNodeInterviewCompletedEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.node.interview-completed',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsNodeInterviewFailedEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.node.interview-failed',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsNodeInterviewStageCompletedEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.node.interview-stage-completed',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsNodeTestPowerlevelProgressEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.node.test-powerlevel-progress',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsNodeCheckLifelineHealthProgressEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.node.check-lifeline-health-progress',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsNodeCheckRouteHealthProgressEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.node.check-route-health-progress',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsNodeFirmwareUpdateProgressEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.node.firmware-update-progress',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsNodeFirmwareUpdateFinishedEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.node.firmware-update-finished',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsNodeWakeUpEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.node.wake-up',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsNodeSleepEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.node.sleep',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsNodeMetadataUpdatedEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.node.metadata-updated',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            else if ((0, event_guards_1.isZwjsNodeNotificationEvent)(protocolEvent)) {
                events.push({
                    type: 'zwjs.event.node.notification',
                    ts: new Date().toISOString(),
                    source: 'zwjs-client',
                    event: protocolEvent,
                });
            }
            events.push({
                type: 'node.event.raw-normalized',
                ts: new Date().toISOString(),
                source: 'zwjs-client',
                event: protocolEvent,
            });
        }
        else if (type && type.startsWith('node.')) {
            events.push({
                type: 'node.event.raw-normalized',
                ts: new Date().toISOString(),
                source: 'zwjs-client',
                event: { type, payload: record.payload, raw: record },
            });
        }
        const isFailedResult = (0, raw_frame_types_1.isZwjsResultFrame)(record) && record.success === false;
        return {
            events,
            requestResponse: messageId && !isFailedResult
                ? {
                    id: messageId,
                    payload: 'result' in record ? record.result : (record.payload ?? record),
                }
                : undefined,
            requestError: messageId && isFailedResult
                ? { id: messageId, error: 'error' in record ? record.error : record }
                : undefined,
            serverInfo,
            nodesSnapshot,
        };
    }
    buildInitializeRequest(id, schemaVersion, additionalUserAgentComponents) {
        return {
            messageId: id,
            command: 'initialize',
            schemaVersion,
            ...(additionalUserAgentComponents ? { additionalUserAgentComponents } : {}),
        };
    }
    buildStartListeningRequest(id) {
        return { messageId: id, command: 'start_listening' };
    }
    buildCommandRequest(id, command, args) {
        return {
            messageId: id,
            command,
            ...(args ?? {}),
        };
    }
}
exports.DefaultZwjsFamilyNormalizer = DefaultZwjsFamilyNormalizer;
