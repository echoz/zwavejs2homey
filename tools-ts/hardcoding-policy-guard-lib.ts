import fs from 'node:fs';
import path from 'node:path';

const SOURCE_EXTENSIONS = new Set(['.ts', '.js', '.mjs', '.cjs']);
const DEFAULT_SOURCE_ROOTS = ['packages', 'co.lazylabs.zwavejs2homey'];
const DEFAULT_ALLOWED_FILES = new Set([
  'packages/compiler/src/importers/ha/extract-discovery-source-subset.ts',
  'packages/compiler/src/importers/ha/platform-output-policy.ts',
  'packages/tui/src/view/value-semantics-policy.ts',
]);
const DEFAULT_PROTECTED_LITERALS = [
  'onoff',
  'dim',
  'windowcoverings_set',
  'locked',
  'measure_generic',
  'number_value',
  'alarm_generic',
  'socket',
  'light',
  'sensor',
  'lock',
  'thermostat',
  'button',
  'fan',
  'curtain',
];
const ALLOWED_CLI_FLAGS = new Set(['--help', '-h', '--workspace-root']);

function toPosixPath(rawPath) {
  return rawPath.replaceAll(path.sep, '/');
}

function escapeRegex(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findUnsupportedLongFlag(argv) {
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const [key] = token.split('=', 2);
    if (!ALLOWED_CLI_FLAGS.has(key)) return key;
  }
  return undefined;
}

function parseFlagValue(argv, flagName) {
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === flagName) {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) return undefined;
      return next;
    }
    if (token.startsWith(`${flagName}=`)) {
      return token.slice(flagName.length + 1);
    }
  }
  return undefined;
}

function shouldSkipSourceFile(relativePath) {
  if (
    relativePath.includes('/node_modules/') ||
    relativePath.includes('/dist/') ||
    relativePath.includes('/fixtures/')
  ) {
    return true;
  }
  if (relativePath.includes('/test/') || relativePath.includes('/tests/')) return true;
  if (relativePath.includes('.test.')) return true;
  if (relativePath.endsWith('.d.ts')) return true;
  return false;
}

function collectSourceFiles(rootDirectory, workspaceRoot, accumulator) {
  if (!fs.existsSync(rootDirectory)) return;
  const entries = fs.readdirSync(rootDirectory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(rootDirectory, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(absolutePath, workspaceRoot, accumulator);
      continue;
    }
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (!SOURCE_EXTENSIONS.has(extension)) continue;
    const relativePath = toPosixPath(path.relative(workspaceRoot, absolutePath));
    if (shouldSkipSourceFile(relativePath)) continue;
    accumulator.push(relativePath);
  }
}

function findLiteralHits(fileContent, protectedLiterals) {
  const hits = [];
  for (const literal of protectedLiterals) {
    const pattern = new RegExp(`['"\`]${escapeRegex(literal)}['"\`]`);
    if (pattern.test(fileContent)) hits.push(literal);
  }
  return hits;
}

export function runPolicyHardcodingGuard(options = {}) {
  const workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd());
  const includeRoots = options.includeRoots ?? DEFAULT_SOURCE_ROOTS;
  const allowedFiles = options.allowedFiles ?? DEFAULT_ALLOWED_FILES;
  const protectedLiterals = options.protectedLiterals ?? DEFAULT_PROTECTED_LITERALS;
  const allowedSet = new Set(Array.from(allowedFiles, (item) => toPosixPath(String(item))));
  const allSourceFiles = [];

  for (const rootName of includeRoots) {
    const absoluteRoot = path.resolve(workspaceRoot, rootName);
    collectSourceFiles(absoluteRoot, workspaceRoot, allSourceFiles);
  }

  allSourceFiles.sort();
  const violations = [];
  for (const relativeFilePath of allSourceFiles) {
    if (allowedSet.has(relativeFilePath)) continue;
    const absoluteFilePath = path.join(workspaceRoot, relativeFilePath);
    const source = fs.readFileSync(absoluteFilePath, 'utf8');
    const literalHits = findLiteralHits(source, protectedLiterals);
    if (literalHits.length > 0) {
      violations.push({
        file: relativeFilePath,
        literals: literalHits,
      });
    }
  }

  return {
    ok: violations.length === 0,
    workspaceRoot,
    scannedFileCount: allSourceFiles.length,
    allowedFileCount: allowedSet.size,
    protectedLiteralCount: protectedLiterals.length,
    violations,
  };
}

export function formatGuardResult(result) {
  if (result.ok) {
    return [
      'Hardcoding policy guard passed.',
      `Scanned files: ${result.scannedFileCount}`,
      `Allowed policy files: ${result.allowedFileCount}`,
      `Protected literals: ${result.protectedLiteralCount}`,
    ].join('\n');
  }

  const lines = [
    'Hardcoding policy guard failed.',
    `Violating files: ${result.violations.length}`,
    `Scanned files: ${result.scannedFileCount}`,
    'Violations:',
  ];
  for (const violation of result.violations) {
    lines.push(`- ${violation.file}`);
    lines.push(`  literals: ${violation.literals.join(', ')}`);
  }
  lines.push(
    'Allowed files:',
    ...Array.from(DEFAULT_ALLOWED_FILES)
      .sort()
      .map((filePath) => `- ${filePath}`),
  );
  return lines.join('\n');
}

export function getUsageText() {
  return [
    'Usage:',
    '  hardcoding-policy-guard [--workspace-root <path>]',
    '',
    'Notes:',
    '  - Fails if protected Homey class/capability literals are used outside approved policy modules.',
  ].join('\n');
}

export function parseCliArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { ok: false, error: getUsageText() };

  const unsupportedFlag = findUnsupportedLongFlag(argv);
  if (unsupportedFlag) return { ok: false, error: `Unsupported flag: ${unsupportedFlag}` };

  const workspaceRoot = parseFlagValue(argv, '--workspace-root');
  if (argv.includes('--workspace-root') && !workspaceRoot) {
    return { ok: false, error: 'Missing value for --workspace-root <path>' };
  }

  return {
    ok: true,
    command: {
      workspaceRoot: workspaceRoot ? path.resolve(workspaceRoot) : process.cwd(),
    },
  };
}

export async function runGuardCommand(command, io = console) {
  const result = runPolicyHardcodingGuard({
    workspaceRoot: command.workspaceRoot,
  });
  io.log(formatGuardResult(result));
  if (!result.ok) {
    throw new Error('Hardcoding policy guard reported violations');
  }
  return result;
}

export const policyHardcodingGuardDefaults = {
  sourceRoots: [...DEFAULT_SOURCE_ROOTS],
  allowedFiles: [...DEFAULT_ALLOWED_FILES],
  protectedLiterals: [...DEFAULT_PROTECTED_LITERALS],
};
