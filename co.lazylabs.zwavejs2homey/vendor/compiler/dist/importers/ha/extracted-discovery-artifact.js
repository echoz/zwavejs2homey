"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HaExtractedDiscoveryArtifactError = void 0;
exports.loadHaExtractedDiscoveryArtifact = loadHaExtractedDiscoveryArtifact;
const fs = require('node:fs');
const translate_extracted_discovery_1 = require("./translate-extracted-discovery");
class HaExtractedDiscoveryArtifactError extends Error {
    constructor(message, filePath) {
        super(message);
        this.filePath = filePath;
        this.name = 'HaExtractedDiscoveryArtifactError';
    }
}
exports.HaExtractedDiscoveryArtifactError = HaExtractedDiscoveryArtifactError;
function loadHaExtractedDiscoveryArtifact(filePath) {
    let parsed;
    try {
        parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown parse/read error';
        throw new HaExtractedDiscoveryArtifactError(`Failed to read or parse extracted HA discovery artifact: ${message}`, filePath);
    }
    try {
        (0, translate_extracted_discovery_1.assertHaExtractedDiscoveryInputV1)(parsed);
    }
    catch (error) {
        if (error instanceof translate_extracted_discovery_1.HaExtractedTranslationError) {
            throw new HaExtractedDiscoveryArtifactError(error.message, filePath);
        }
        throw error;
    }
    return parsed;
}
