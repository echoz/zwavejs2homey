export const PAIR_ICON_PATHS: Readonly<Record<string, string>>;

export const PAIR_ICON_CLASS_GROUPS: Readonly<Record<string, ReadonlyArray<string>>>;

export const PAIR_ICON_BY_HOMEY_CLASS: Readonly<Record<string, string>>;

export const SUPPORTED_HOMEY_PAIR_ICON_CLASSES: ReadonlyArray<string>;

export function normalizeHomeyClassForPairIcon(value: unknown): string;

export function resolvePairIconForHomeyClass(value: unknown): string;
