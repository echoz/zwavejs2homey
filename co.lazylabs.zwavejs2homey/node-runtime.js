'use strict';

function isObject(value) {
  return typeof value === 'object' && value !== null;
}

function parseNumericIdentity(value) {
  if (typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    const parsedHex = Number.parseInt(trimmed.slice(2), 16);
    return Number.isInteger(parsedHex) && Number.isFinite(parsedHex) ? parsedHex : undefined;
  }
  if (/^\d+$/.test(trimmed)) {
    const parsedDec = Number.parseInt(trimmed, 10);
    return Number.isInteger(parsedDec) && Number.isFinite(parsedDec) ? parsedDec : undefined;
  }
  return undefined;
}

function normalizeComparableValue(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function isSupportedCapabilityRuntimeValue(value) {
  if (typeof value === 'string') return true;
  if (typeof value === 'number' && Number.isFinite(value)) return true;
  if (typeof value === 'boolean') return true;
  return false;
}

const CAPABILITY_RUNTIME_CONTRACTS = {
  onoff: {
    inboundCommandClasses: new Set([37]),
    outboundCommandClasses: new Set([37]),
  },
  dim: {
    inboundCommandClasses: new Set([38]),
    outboundCommandClasses: new Set([38]),
  },
};

function normalizeCapabilityId(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed;
}

function isValidRuntimeValueIdShape(valueId) {
  if (!isObject(valueId)) return false;
  const commandClass = parseNumericIdentity(valueId.commandClass);
  if (commandClass === undefined) return false;
  if (normalizeComparableValue(valueId.property) === undefined) return false;
  if (valueId.endpoint !== undefined && parseNumericIdentity(valueId.endpoint) === undefined) {
    return false;
  }
  const { propertyKey } = valueId;
  if (propertyKey !== undefined && normalizeComparableValue(propertyKey) === undefined) {
    return false;
  }
  return true;
}

function matchesCommandClassContract(commandClass, contractCommandClasses) {
  if (!contractCommandClasses) return true;
  const parsedCommandClass = parseNumericIdentity(commandClass);
  if (parsedCommandClass === undefined) return false;
  return contractCommandClasses.has(parsedCommandClass);
}

function extractCapabilityRuntimeVerticals(profile) {
  if (!isObject(profile) || !Array.isArray(profile.capabilities)) {
    return [];
  }

  const slices = [];
  for (const capability of profile.capabilities) {
    if (!isObject(capability)) {
      continue;
    }
    const capabilityId = normalizeCapabilityId(capability.capabilityId);
    if (!capabilityId) {
      continue;
    }

    const inbound = capability.inboundMapping;
    const outbound = capability.outboundMapping;
    const contract = CAPABILITY_RUNTIME_CONTRACTS[capabilityId];

    let inboundCandidate;
    if (isObject(inbound) && inbound.kind === 'value') {
      if (isValidRuntimeValueIdShape(inbound.selector)) {
        inboundCandidate = inbound.selector;
      }
    }

    let outboundTargetCandidate;
    if (isObject(outbound) && outbound.kind === 'set_value' && isObject(outbound.target)) {
      if (isValidRuntimeValueIdShape(outbound.target)) {
        outboundTargetCandidate = outbound.target;
      }
    }

    let inboundSelector;
    if (inboundCandidate) {
      if (
        matchesCommandClassContract(inboundCandidate.commandClass, contract?.inboundCommandClasses)
      ) {
        inboundSelector = inboundCandidate;
      }
    }
    const inboundTransformRef = inboundSelector
      ? normalizeComparableValue(inbound.transformRef)
      : undefined;

    // Unknown capability IDs are read-only by default for safety.
    const outboundSupported = Boolean(contract);
    let outboundTarget;
    if (outboundSupported && outboundTargetCandidate) {
      if (
        matchesCommandClassContract(
          outboundTargetCandidate.commandClass,
          contract?.outboundCommandClasses,
        )
      ) {
        outboundTarget = outboundTargetCandidate;
      }
    }
    const outboundTransformRef = outboundTarget
      ? normalizeComparableValue(outbound.transformRef)
      : undefined;

    if (!inboundSelector && !outboundTarget) continue;

    slices.push({
      capabilityId,
      inboundSelector,
      inboundTransformRef,
      outboundTarget,
      outboundTransformRef,
    });
  }
  return slices;
}

function extractOnOffCapabilityVertical(profile) {
  if (!isObject(profile) || !Array.isArray(profile.capabilities)) {
    return null;
  }

  for (const capability of profile.capabilities) {
    if (!isObject(capability) || capability.capabilityId !== 'onoff') {
      continue;
    }
    const inbound = capability.inboundMapping;
    const outbound = capability.outboundMapping;
    if (!isObject(inbound) || inbound.kind !== 'value' || !isObject(inbound.selector)) {
      continue;
    }
    if (!isObject(outbound) || outbound.kind !== 'set_value' || !isObject(outbound.target)) {
      continue;
    }

    const inboundCc = parseNumericIdentity(inbound.selector.commandClass);
    const outboundCc = parseNumericIdentity(outbound.target.commandClass);
    if (inboundCc !== 37 || outboundCc !== 37) {
      continue;
    }

    return {
      capabilityId: 'onoff',
      inboundSelector: inbound.selector,
      outboundTarget: outbound.target,
    };
  }

  return null;
}

function extractDimCapabilityVertical(profile) {
  if (!isObject(profile) || !Array.isArray(profile.capabilities)) {
    return null;
  }

  for (const capability of profile.capabilities) {
    if (!isObject(capability) || capability.capabilityId !== 'dim') {
      continue;
    }
    const inbound = capability.inboundMapping;
    const outbound = capability.outboundMapping;
    if (!isObject(inbound) || inbound.kind !== 'value' || !isObject(inbound.selector)) {
      continue;
    }
    if (!isObject(outbound) || outbound.kind !== 'set_value' || !isObject(outbound.target)) {
      continue;
    }

    const inboundCc = parseNumericIdentity(inbound.selector.commandClass);
    const outboundCc = parseNumericIdentity(outbound.target.commandClass);
    if (inboundCc !== 38 || outboundCc !== 38) {
      continue;
    }

    return {
      capabilityId: 'dim',
      inboundSelector: inbound.selector,
      inboundTransformRef: normalizeComparableValue(inbound.transformRef),
      outboundTarget: outbound.target,
      outboundTransformRef: normalizeComparableValue(outbound.transformRef),
    };
  }

  return null;
}

function extractValueResultPayload(value) {
  if (isObject(value) && Object.prototype.hasOwnProperty.call(value, 'value')) {
    return value.value;
  }
  return value;
}

function normalizeNumericValue(value) {
  const payload = extractValueResultPayload(value);
  if (typeof payload === 'number' && Number.isFinite(payload)) return payload;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (trimmed.length === 0) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function coerceOnOffValue(value) {
  const payload = extractValueResultPayload(value);
  if (typeof payload === 'boolean') return payload;
  if (typeof payload === 'number') return payload !== 0;
  if (typeof payload === 'string') {
    const normalized = payload.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'on' || normalized === '1') return true;
    if (normalized === 'false' || normalized === 'off' || normalized === '0') return false;
    return undefined;
  }
  return undefined;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function coerceDimInboundValue(value, transformRef) {
  const numeric = normalizeNumericValue(value);
  if (numeric === undefined) return undefined;
  if (transformRef === 'zwave_level_0_99_to_homey_dim') {
    return clamp(numeric, 0, 99) / 99;
  }
  if (numeric >= 0 && numeric <= 1) return numeric;
  if (numeric >= 0 && numeric <= 99) return numeric / 99;
  if (numeric === 255) return 1;
  return clamp(numeric, 0, 1);
}

function coerceDimOutboundValue(value, transformRef) {
  const numeric = normalizeNumericValue(value);
  if (numeric === undefined) return undefined;
  if (transformRef === 'homey_dim_to_zwave_level_0_99') {
    return Math.round(clamp(numeric, 0, 1) * 99);
  }
  if (numeric >= 0 && numeric <= 1) return Math.round(numeric * 99);
  if (numeric >= 0 && numeric <= 99) return Math.round(numeric);
  return Math.round(clamp(numeric, 0, 99));
}

function coerceCapabilityInboundValue(capabilityId, value, transformRef) {
  if (capabilityId === 'onoff') {
    return coerceOnOffValue(value);
  }
  if (capabilityId === 'dim') {
    return coerceDimInboundValue(value, transformRef);
  }

  const payload = extractValueResultPayload(value);
  if (!isSupportedCapabilityRuntimeValue(payload)) {
    return undefined;
  }
  return payload;
}

function coerceCapabilityOutboundValue(capabilityId, value, transformRef) {
  if (capabilityId === 'onoff') {
    return coerceOnOffValue(value);
  }
  if (capabilityId === 'dim') {
    return coerceDimOutboundValue(value, transformRef);
  }

  return undefined;
}

function selectorMatchesNodeValueUpdatedEvent(selector, eventPayload) {
  if (!isObject(selector) || !isObject(eventPayload) || !isObject(eventPayload.args)) {
    return false;
  }
  const { args } = eventPayload;

  if (selector.endpoint !== undefined && args.endpoint !== undefined) {
    const selectorEndpoint = parseNumericIdentity(selector.endpoint);
    const argsEndpoint = parseNumericIdentity(args.endpoint);
    if (selectorEndpoint !== undefined && argsEndpoint !== undefined) {
      if (selectorEndpoint !== argsEndpoint) {
        return false;
      }
    }
  }

  if (selector.commandClass !== undefined && args.commandClass !== undefined) {
    const selectorCc = parseNumericIdentity(selector.commandClass);
    const argsCc = parseNumericIdentity(args.commandClass);
    if (selectorCc !== undefined && argsCc !== undefined && selectorCc !== argsCc) {
      return false;
    }
  }

  if (selector.property !== undefined) {
    const selectorProperty = normalizeComparableValue(selector.property);
    const argProperty = normalizeComparableValue(args.property);
    const argPropertyName = normalizeComparableValue(args.propertyName);
    if (selectorProperty && argProperty && selectorProperty !== argProperty) {
      return false;
    }
    if (selectorProperty && argPropertyName && selectorProperty !== argPropertyName) {
      return false;
    }
    if (selectorProperty && !argProperty && !argPropertyName) {
      return false;
    }
  }

  if (selector.propertyKey !== undefined) {
    const selectorPropertyKey = normalizeComparableValue(selector.propertyKey);
    const argPropertyKey = normalizeComparableValue(args.propertyKey);
    const argPropertyKeyName = normalizeComparableValue(args.propertyKeyName);
    if (selectorPropertyKey && argPropertyKey && selectorPropertyKey !== argPropertyKey) {
      return false;
    }
    if (selectorPropertyKey && argPropertyKeyName && selectorPropertyKey !== argPropertyKeyName) {
      return false;
    }
    if (selectorPropertyKey && !argPropertyKey && !argPropertyKeyName) {
      return false;
    }
  }

  return true;
}

module.exports = {
  extractCapabilityRuntimeVerticals,
  extractOnOffCapabilityVertical,
  extractDimCapabilityVertical,
  extractValueResultPayload,
  coerceOnOffValue,
  coerceDimInboundValue,
  coerceDimOutboundValue,
  coerceCapabilityInboundValue,
  coerceCapabilityOutboundValue,
  selectorMatchesNodeValueUpdatedEvent,
};
