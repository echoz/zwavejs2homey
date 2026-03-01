import type { DraftEditorState, ScaffoldDraft } from '../model/types';

export interface DraftValidationVocabulary {
  homeyClasses?: ReadonlySet<string>;
  capabilityIds?: ReadonlySet<string>;
}

type DraftCapabilityDirectionality = 'bidirectional' | 'inbound-only' | 'outbound-only';
type DraftInboundMappingKind = 'value' | 'event';
type DraftOutboundMappingKind = 'set_value' | 'invoke_cc_api' | 'zwjs_command';

interface DraftCapabilityShape {
  capabilityId: string;
  directionality: DraftCapabilityDirectionality;
  inboundMapping?: Record<string, unknown>;
  outboundMapping?: Record<string, unknown>;
  flags?: Record<string, unknown>;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function cloneScaffoldDraft(draft: ScaffoldDraft): ScaffoldDraft {
  return {
    ...draft,
    bundle: JSON.parse(JSON.stringify(draft.bundle)),
  };
}

function createDraftEditorState(draft: ScaffoldDraft): DraftEditorState {
  const baseDraft = cloneScaffoldDraft(draft);
  return {
    baseDraft,
    workingDraft: cloneScaffoldDraft(draft),
    dirty: false,
    errors: [],
    warnings: [],
    selectedCapabilityIndex: 0,
    selectedFieldPath: 'bundle.metadata.productName',
    lastValidatedAt: nowIso(),
  };
}

function setByPath(
  target: Record<string, unknown>,
  pathSegments: string[],
  value: unknown,
): Record<string, unknown> {
  if (pathSegments.length <= 0) return target;
  const [head, ...tail] = pathSegments;
  if (tail.length === 0) {
    return { ...target, [head]: value };
  }
  const nested =
    target[head] && typeof target[head] === 'object' && !Array.isArray(target[head])
      ? (target[head] as Record<string, unknown>)
      : {};
  return {
    ...target,
    [head]: setByPath(nested, tail, value),
  };
}

function isDirectionality(value: unknown): value is DraftCapabilityDirectionality {
  return value === 'bidirectional' || value === 'inbound-only' || value === 'outbound-only';
}

function isInboundMappingKind(value: unknown): value is DraftInboundMappingKind {
  return value === 'value' || value === 'event';
}

function isOutboundMappingKind(value: unknown): value is DraftOutboundMappingKind {
  return value === 'set_value' || value === 'invoke_cc_api' || value === 'zwjs_command';
}

function asOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function parseOptionalIntegerInput(value: unknown, fieldPath: string): number | undefined {
  const text = String(value ?? '').trim();
  if (text.length <= 0) return undefined;
  if (!/^-?\d+$/.test(text)) {
    throw new Error(`${fieldPath} must be an integer`);
  }
  return Number(text);
}

function parseOptionalPropertyTokenInput(value: unknown): string | number | undefined {
  const text = String(value ?? '').trim();
  if (text.length <= 0) return undefined;
  if (/^-?\d+$/.test(text)) return Number(text);
  return text;
}

function parseOptionalTextInput(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : undefined;
}

function normalizeToValueSelector(value: unknown): Record<string, unknown> {
  const source = asOptionalRecord(value) ?? {};
  const selector: Record<string, unknown> = {};
  if (typeof source.commandClass === 'number' && Number.isInteger(source.commandClass)) {
    selector.commandClass = source.commandClass;
  } else if (
    typeof source.commandClass === 'string' &&
    /^-?\d+$/.test(source.commandClass.trim())
  ) {
    selector.commandClass = Number(source.commandClass.trim());
  }
  if (typeof source.endpoint === 'number' && Number.isInteger(source.endpoint)) {
    selector.endpoint = source.endpoint;
  } else if (typeof source.endpoint === 'string' && /^-?\d+$/.test(source.endpoint.trim())) {
    selector.endpoint = Number(source.endpoint.trim());
  }
  const property =
    typeof source.property === 'string' || typeof source.property === 'number'
      ? parseOptionalPropertyTokenInput(source.property)
      : undefined;
  if (property !== undefined) selector.property = property;
  const propertyKey =
    typeof source.propertyKey === 'string' || typeof source.propertyKey === 'number'
      ? parseOptionalPropertyTokenInput(source.propertyKey)
      : undefined;
  if (propertyKey !== undefined) selector.propertyKey = propertyKey;
  return selector;
}

function normalizeDraftCapability(entry: unknown): DraftCapabilityShape {
  const record = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
  const capabilityId =
    typeof record.capabilityId === 'string' && record.capabilityId.trim().length > 0
      ? record.capabilityId.trim()
      : '';
  const directionality = isDirectionality(record.directionality)
    ? record.directionality
    : 'bidirectional';
  return {
    capabilityId,
    directionality,
    inboundMapping:
      record.inboundMapping && typeof record.inboundMapping === 'object'
        ? (record.inboundMapping as Record<string, unknown>)
        : undefined,
    outboundMapping:
      record.outboundMapping && typeof record.outboundMapping === 'object'
        ? (record.outboundMapping as Record<string, unknown>)
        : undefined,
    flags:
      record.flags && typeof record.flags === 'object'
        ? (record.flags as Record<string, unknown>)
        : undefined,
  };
}

function getDraftCapabilities(bundle: Record<string, unknown>): DraftCapabilityShape[] {
  const raw = Array.isArray(bundle.capabilities) ? bundle.capabilities : [];
  return raw.map((entry) => normalizeDraftCapability(entry));
}

function setDraftCapabilities(
  bundle: Record<string, unknown>,
  capabilities: DraftCapabilityShape[],
): Record<string, unknown> {
  return { ...bundle, capabilities: capabilities.map((entry) => ({ ...entry })) };
}

function selectedCapabilityPath(index: number, field: 'capabilityId' | 'directionality'): string {
  return `bundle.capabilities.${index}.${field}`;
}

function isDraftDirty(baseDraft: ScaffoldDraft, workingDraft: ScaffoldDraft): boolean {
  return JSON.stringify(baseDraft) !== JSON.stringify(workingDraft);
}

export class DraftEditorCore {
  private draftEditorState?: DraftEditorState;

  constructor(private readonly options: { draftVocabulary?: DraftValidationVocabulary } = {}) {}

  start(draft: ScaffoldDraft): DraftEditorState {
    this.draftEditorState = createDraftEditorState(draft);
    return this.getOrThrow();
  }

  get(): DraftEditorState | undefined {
    if (!this.draftEditorState) return undefined;
    return {
      ...this.draftEditorState,
      baseDraft: cloneScaffoldDraft(this.draftEditorState.baseDraft),
      workingDraft: cloneScaffoldDraft(this.draftEditorState.workingDraft),
      errors: [...this.draftEditorState.errors],
      warnings: [...this.draftEditorState.warnings],
    };
  }

  getOrThrow(): DraftEditorState {
    if (!this.draftEditorState) {
      throw new Error('Draft editor is not active. Start edit mode first.');
    }
    return this.draftEditorState;
  }

  clear(): void {
    this.draftEditorState = undefined;
  }

  setField(path: string, value: unknown): DraftEditorState {
    const editor = this.getOrThrow();
    const workingDraft = cloneScaffoldDraft(editor.workingDraft);

    if (path === 'fileHint') {
      workingDraft.fileHint = String(value);
    } else if (path.startsWith('bundle.')) {
      const pathSegments = path
        .slice('bundle.'.length)
        .split('.')
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);
      workingDraft.bundle = setByPath(workingDraft.bundle, pathSegments, value);
    } else {
      throw new Error(`Unsupported draft editor field path: ${path}`);
    }

    this.draftEditorState = {
      ...editor,
      workingDraft,
      dirty: isDraftDirty(editor.baseDraft, workingDraft),
      lastValidatedAt: nowIso(),
    };
    return this.validate();
  }

  setCapabilityField(
    index: number,
    field: 'capabilityId' | 'directionality',
    value: unknown,
  ): DraftEditorState {
    const editor = this.getOrThrow();
    const workingDraft = cloneScaffoldDraft(editor.workingDraft);
    const capabilities = getDraftCapabilities(workingDraft.bundle);
    if (index < 0 || index >= capabilities.length) {
      throw new Error(`Capability index out of range: ${index}`);
    }
    const next = capabilities[index];
    if (field === 'capabilityId') {
      next.capabilityId = String(value ?? '').trim();
    } else {
      const directionality = String(value ?? '').trim();
      if (!isDirectionality(directionality)) {
        throw new Error(`Unsupported directionality: ${directionality}`);
      }
      next.directionality = directionality;
    }
    workingDraft.bundle = setDraftCapabilities(workingDraft.bundle, capabilities);
    this.draftEditorState = {
      ...editor,
      workingDraft,
      selectedCapabilityIndex: index,
      selectedFieldPath: selectedCapabilityPath(index, field),
      dirty: isDraftDirty(editor.baseDraft, workingDraft),
      lastValidatedAt: nowIso(),
    };
    return this.validate();
  }

  setCapabilityMappingField(index: number, path: string, value: unknown): DraftEditorState {
    const editor = this.getOrThrow();
    const workingDraft = cloneScaffoldDraft(editor.workingDraft);
    const capabilities = getDraftCapabilities(workingDraft.bundle);
    if (index < 0 || index >= capabilities.length) {
      throw new Error(`Capability index out of range: ${index}`);
    }
    const next = capabilities[index];
    const textValue = String(value ?? '');

    const inboundKindMatch = path.match(/^bundle\.capabilities\.\d+\.inboundMapping\.kind$/);
    const inboundSelectorMatch = path.match(
      /^bundle\.capabilities\.\d+\.inboundMapping\.selector\.(commandClass|endpoint|property|propertyKey|eventType)$/,
    );
    const outboundKindMatch = path.match(/^bundle\.capabilities\.\d+\.outboundMapping\.kind$/);
    const outboundTargetMatch = path.match(
      /^bundle\.capabilities\.\d+\.outboundMapping\.target\.(commandClass|endpoint|property|propertyKey|command)$/,
    );

    if (inboundKindMatch) {
      const inboundKind = textValue.trim();
      if (!isInboundMappingKind(inboundKind)) {
        throw new Error(`Unsupported inbound mapping kind: ${inboundKind}`);
      }
      const previous = asOptionalRecord(next.inboundMapping) ?? {};
      if (inboundKind === 'event') {
        const selector = asOptionalRecord(previous.selector) ?? {};
        const eventType = parseOptionalTextInput(selector.eventType);
        next.inboundMapping = {
          ...previous,
          kind: inboundKind,
          selector: eventType ? { eventType } : {},
        };
      } else {
        next.inboundMapping = {
          ...previous,
          kind: inboundKind,
          selector: normalizeToValueSelector(previous.selector),
        };
      }
    } else if (inboundSelectorMatch) {
      const field = inboundSelectorMatch[1];
      const previous = asOptionalRecord(next.inboundMapping) ?? {};
      const selector = asOptionalRecord(previous.selector) ?? {};
      if (field === 'eventType') {
        const eventType = parseOptionalTextInput(textValue);
        next.inboundMapping = {
          ...previous,
          kind: 'event',
          selector: eventType ? { eventType } : {},
        };
      } else {
        const valueSelector = normalizeToValueSelector(selector);
        if (field === 'commandClass' || field === 'endpoint') {
          const parsed = parseOptionalIntegerInput(textValue, field);
          if (parsed === undefined) {
            delete valueSelector[field];
          } else {
            valueSelector[field] = parsed;
          }
        } else {
          const parsed = parseOptionalPropertyTokenInput(textValue);
          if (parsed === undefined) {
            delete valueSelector[field];
          } else {
            valueSelector[field] = parsed;
          }
        }
        next.inboundMapping = {
          ...previous,
          kind: 'value',
          selector: valueSelector,
        };
      }
    } else if (outboundKindMatch) {
      const outboundKind = textValue.trim();
      if (!isOutboundMappingKind(outboundKind)) {
        throw new Error(`Unsupported outbound mapping kind: ${outboundKind}`);
      }
      const previous = asOptionalRecord(next.outboundMapping) ?? {};
      if (outboundKind === 'set_value') {
        next.outboundMapping = {
          ...previous,
          kind: outboundKind,
          target: normalizeToValueSelector(previous.target),
        };
      } else {
        const targetRecord = asOptionalRecord(previous.target) ?? {};
        const command = parseOptionalTextInput(targetRecord.command);
        next.outboundMapping = {
          ...previous,
          kind: outboundKind,
          target: command ? { command } : {},
        };
      }
    } else if (outboundTargetMatch) {
      const field = outboundTargetMatch[1];
      const previous = asOptionalRecord(next.outboundMapping) ?? {};
      const target = asOptionalRecord(previous.target) ?? {};
      if (field === 'command') {
        const command = parseOptionalTextInput(textValue);
        next.outboundMapping = {
          ...previous,
          kind:
            previous.kind === 'invoke_cc_api' || previous.kind === 'zwjs_command'
              ? previous.kind
              : 'zwjs_command',
          target: command ? { command } : {},
        };
      } else {
        const valueTarget = normalizeToValueSelector(target);
        if (field === 'commandClass' || field === 'endpoint') {
          const parsed = parseOptionalIntegerInput(textValue, field);
          if (parsed === undefined) {
            delete valueTarget[field];
          } else {
            valueTarget[field] = parsed;
          }
        } else {
          const parsed = parseOptionalPropertyTokenInput(textValue);
          if (parsed === undefined) {
            delete valueTarget[field];
          } else {
            valueTarget[field] = parsed;
          }
        }
        next.outboundMapping = {
          ...previous,
          kind: 'set_value',
          target: valueTarget,
        };
      }
    } else {
      throw new Error(`Unsupported capability mapping path: ${path}`);
    }

    workingDraft.bundle = setDraftCapabilities(workingDraft.bundle, capabilities);
    this.draftEditorState = {
      ...editor,
      workingDraft,
      selectedCapabilityIndex: index,
      selectedFieldPath: path,
      dirty: isDraftDirty(editor.baseDraft, workingDraft),
      lastValidatedAt: nowIso(),
    };
    return this.validate();
  }

  setSelectedField(path: string): DraftEditorState {
    const editor = this.getOrThrow();
    this.draftEditorState = {
      ...editor,
      selectedFieldPath: path,
      lastValidatedAt: nowIso(),
    };
    return this.getOrThrow();
  }

  addCapability(): DraftEditorState {
    const editor = this.getOrThrow();
    const workingDraft = cloneScaffoldDraft(editor.workingDraft);
    const capabilities = getDraftCapabilities(workingDraft.bundle);
    capabilities.push({
      capabilityId: '',
      directionality: 'bidirectional',
    });
    const index = capabilities.length - 1;
    workingDraft.bundle = setDraftCapabilities(workingDraft.bundle, capabilities);
    this.draftEditorState = {
      ...editor,
      workingDraft,
      selectedCapabilityIndex: index,
      selectedFieldPath: selectedCapabilityPath(index, 'capabilityId'),
      dirty: isDraftDirty(editor.baseDraft, workingDraft),
      lastValidatedAt: nowIso(),
    };
    return this.validate();
  }

  cloneCapability(index?: number): DraftEditorState {
    const editor = this.getOrThrow();
    const workingDraft = cloneScaffoldDraft(editor.workingDraft);
    const capabilities = getDraftCapabilities(workingDraft.bundle);
    if (capabilities.length === 0) {
      throw new Error('No capability rows available to clone.');
    }
    const selectedIndex = Math.max(
      0,
      Math.min(capabilities.length - 1, index ?? editor.selectedCapabilityIndex ?? 0),
    );
    const source = capabilities[selectedIndex];
    capabilities.splice(selectedIndex + 1, 0, { ...source });
    const nextIndex = selectedIndex + 1;
    workingDraft.bundle = setDraftCapabilities(workingDraft.bundle, capabilities);
    this.draftEditorState = {
      ...editor,
      workingDraft,
      selectedCapabilityIndex: nextIndex,
      selectedFieldPath: selectedCapabilityPath(nextIndex, 'capabilityId'),
      dirty: isDraftDirty(editor.baseDraft, workingDraft),
      lastValidatedAt: nowIso(),
    };
    return this.validate();
  }

  removeCapability(index?: number): DraftEditorState {
    const editor = this.getOrThrow();
    const workingDraft = cloneScaffoldDraft(editor.workingDraft);
    const capabilities = getDraftCapabilities(workingDraft.bundle);
    if (capabilities.length === 0) {
      throw new Error('No capability rows available to remove.');
    }
    const selectedIndex = Math.max(
      0,
      Math.min(capabilities.length - 1, index ?? editor.selectedCapabilityIndex ?? 0),
    );
    capabilities.splice(selectedIndex, 1);
    const nextIndex = Math.max(0, Math.min(capabilities.length - 1, selectedIndex));
    workingDraft.bundle = setDraftCapabilities(workingDraft.bundle, capabilities);
    this.draftEditorState = {
      ...editor,
      workingDraft,
      selectedCapabilityIndex: nextIndex,
      selectedFieldPath:
        capabilities.length > 0
          ? selectedCapabilityPath(nextIndex, 'capabilityId')
          : 'bundle.metadata.productName',
      dirty: isDraftDirty(editor.baseDraft, workingDraft),
      lastValidatedAt: nowIso(),
    };
    return this.validate();
  }

  moveCapability(index: number, delta: -1 | 1): DraftEditorState {
    const editor = this.getOrThrow();
    const workingDraft = cloneScaffoldDraft(editor.workingDraft);
    const capabilities = getDraftCapabilities(workingDraft.bundle);
    if (capabilities.length === 0) {
      throw new Error('No capability rows available to move.');
    }
    if (index < 0 || index >= capabilities.length) {
      throw new Error(`Capability index out of range: ${index}`);
    }
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= capabilities.length) {
      return this.getOrThrow();
    }
    const [moved] = capabilities.splice(index, 1);
    capabilities.splice(targetIndex, 0, moved);
    workingDraft.bundle = setDraftCapabilities(workingDraft.bundle, capabilities);
    this.draftEditorState = {
      ...editor,
      workingDraft,
      selectedCapabilityIndex: targetIndex,
      selectedFieldPath: selectedCapabilityPath(targetIndex, 'capabilityId'),
      dirty: isDraftDirty(editor.baseDraft, workingDraft),
      lastValidatedAt: nowIso(),
    };
    return this.validate();
  }

  validate(): DraftEditorState {
    const editor = this.getOrThrow();
    const errors: string[] = [];
    const warnings: string[] = [];
    if (editor.workingDraft.fileHint.trim().length <= 0) {
      errors.push('fileHint is required');
    }
    const metadata = asOptionalRecord(editor.workingDraft.bundle?.metadata);
    const homeyClass = parseOptionalTextInput(metadata?.homeyClass);
    if (
      homeyClass &&
      this.options.draftVocabulary?.homeyClasses &&
      this.options.draftVocabulary.homeyClasses.size > 0 &&
      !this.options.draftVocabulary.homeyClasses.has(homeyClass)
    ) {
      errors.push(`metadata.homeyClass is unknown: ${homeyClass}`);
    }
    const capabilities = getDraftCapabilities(editor.workingDraft.bundle);
    const seenCapabilityIds = new Set<string>();
    for (let index = 0; index < capabilities.length; index += 1) {
      const entry = capabilities[index];
      const rowId = `capabilities[${index}]`;
      if (!entry.capabilityId) {
        errors.push(`${rowId}.capabilityId is required`);
      } else {
        const key = entry.capabilityId.toLowerCase();
        if (seenCapabilityIds.has(key)) {
          warnings.push(`duplicate capabilityId: ${entry.capabilityId}`);
        } else {
          seenCapabilityIds.add(key);
        }
        if (
          this.options.draftVocabulary?.capabilityIds &&
          this.options.draftVocabulary.capabilityIds.size > 0 &&
          !this.options.draftVocabulary.capabilityIds.has(entry.capabilityId)
        ) {
          errors.push(`${rowId}.capabilityId is unknown: ${entry.capabilityId}`);
        }
      }
      if (!isDirectionality(entry.directionality)) {
        errors.push(`${rowId}.directionality is invalid`);
      }
      const inbound = asOptionalRecord(entry.inboundMapping);
      if (inbound) {
        if (!isInboundMappingKind(inbound.kind)) {
          errors.push(`${rowId}.inboundMapping.kind is invalid`);
        } else if (inbound.kind === 'event') {
          const selector = asOptionalRecord(inbound.selector);
          const eventType = parseOptionalTextInput(selector?.eventType);
          if (!eventType) {
            errors.push(`${rowId}.inboundMapping.selector.eventType is required for event`);
          }
        } else {
          const selector = asOptionalRecord(inbound.selector);
          if (!selector || typeof selector.commandClass !== 'number') {
            errors.push(`${rowId}.inboundMapping.selector.commandClass is required`);
          }
          if (!selector || !['string', 'number'].includes(typeof selector.property)) {
            errors.push(`${rowId}.inboundMapping.selector.property is required`);
          }
          if (selector?.endpoint !== undefined && typeof selector.endpoint !== 'number') {
            errors.push(`${rowId}.inboundMapping.selector.endpoint must be a number`);
          }
          if (
            selector?.propertyKey !== undefined &&
            !['string', 'number'].includes(typeof selector.propertyKey)
          ) {
            errors.push(`${rowId}.inboundMapping.selector.propertyKey must be string/number`);
          }
        }
      }

      const outbound = asOptionalRecord(entry.outboundMapping);
      if (outbound) {
        if (!isOutboundMappingKind(outbound.kind)) {
          errors.push(`${rowId}.outboundMapping.kind is invalid`);
        } else {
          const target = asOptionalRecord(outbound.target);
          if (!target) {
            errors.push(`${rowId}.outboundMapping.target is required`);
          } else if (outbound.kind === 'set_value') {
            if (typeof target.commandClass !== 'number') {
              errors.push(`${rowId}.outboundMapping.target.commandClass is required`);
            }
            if (!['string', 'number'].includes(typeof target.property)) {
              errors.push(`${rowId}.outboundMapping.target.property is required`);
            }
            if (target.endpoint !== undefined && typeof target.endpoint !== 'number') {
              errors.push(`${rowId}.outboundMapping.target.endpoint must be a number`);
            }
            if (
              target.propertyKey !== undefined &&
              !['string', 'number'].includes(typeof target.propertyKey)
            ) {
              errors.push(`${rowId}.outboundMapping.target.propertyKey must be string/number`);
            }
          } else {
            const hasCommandTarget =
              typeof target.command === 'string' && target.command.length > 0;
            const hasValueTarget =
              typeof target.commandClass === 'number' &&
              ['string', 'number'].includes(typeof target.property);
            if (!hasCommandTarget && !hasValueTarget) {
              errors.push(
                `${rowId}.outboundMapping.target requires command or value-id selector for ${outbound.kind}`,
              );
            }
          }
        }
      }
    }

    this.draftEditorState = {
      ...editor,
      errors,
      warnings,
      lastValidatedAt: nowIso(),
    };
    return this.getOrThrow();
  }

  reset(): DraftEditorState {
    const editor = this.getOrThrow();
    this.draftEditorState = {
      ...editor,
      workingDraft: cloneScaffoldDraft(editor.baseDraft),
      dirty: false,
      errors: [],
      warnings: [],
      lastValidatedAt: nowIso(),
    };
    return this.getOrThrow();
  }

  commit(): ScaffoldDraft {
    const editor = this.validate();
    if (editor.errors.length > 0) {
      throw new Error(`Draft editor has validation errors: ${editor.errors.join(', ')}`);
    }
    return cloneScaffoldDraft(editor.workingDraft);
  }
}
