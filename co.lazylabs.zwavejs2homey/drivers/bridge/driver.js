"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const homey_1 = __importDefault(require("homey"));
const pairing_1 = require("../../pairing");
module.exports = class BridgeDriver extends homey_1.default.Driver {
    async onInit() {
        this.log('BridgeDriver initialized');
    }
    hasBridgeDeviceAlreadyPaired() {
        const existingData = this.getDevices().map((device) => device.getData());
        return (0, pairing_1.hasBridgePairDeviceFromData)(existingData);
    }
    async onPairListDevices() {
        if (this.hasBridgeDeviceAlreadyPaired()) {
            this.log('Bridge device already paired, returning empty pair list');
            return [];
        }
        return [(0, pairing_1.createBridgePairCandidate)()];
    }
};
