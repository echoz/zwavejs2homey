"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectAdapter = selectAdapter;
const family_default_1 = require("./family-default");
const fallback_1 = require("./fallback");
const ADAPTERS = [new family_default_1.DefaultZwjsFamilyNormalizer()];
const FALLBACK = new fallback_1.FallbackNormalizer();
function selectAdapter(version) {
    for (const adapter of ADAPTERS) {
        if (adapter.canHandleVersion(version)) {
            return { adapter, match: version ? 'family' : 'fallback' };
        }
    }
    return { adapter: FALLBACK, match: 'fallback' };
}
