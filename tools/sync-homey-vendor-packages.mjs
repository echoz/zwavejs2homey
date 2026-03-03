import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const appDir = path.join(rootDir, 'co.lazylabs.zwavejs2homey');
const vendorDir = path.join(appDir, 'vendor');

const packages = [
  { key: 'core', dir: path.join(rootDir, 'packages/core') },
  { key: 'compiler', dir: path.join(rootDir, 'packages/compiler') },
];

async function syncPackage({ key, dir }) {
  const packageJsonPath = path.join(dir, 'package.json');
  const distDir = path.join(dir, 'dist');
  const targetDir = path.join(vendorDir, key);
  const targetDistDir = path.join(targetDir, 'dist');

  const rawPackageJson = await fs.readFile(packageJsonPath, 'utf8');
  const pkg = JSON.parse(rawPackageJson);

  try {
    await fs.access(distDir);
  } catch {
    throw new Error(
      `Missing build output for ${pkg.name} at ${path.relative(rootDir, distDir)}. Run "npm run build -w ${pkg.name}" first.`,
    );
  }

  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
  await fs.cp(distDir, targetDistDir, { recursive: true });

  const vendoredPackageJson = {
    name: pkg.name,
    version: pkg.version,
    license: pkg.license,
    main: pkg.main,
    types: pkg.types,
    dependencies: pkg.dependencies ?? {},
  };

  await fs.writeFile(
    path.join(targetDir, 'package.json'),
    `${JSON.stringify(vendoredPackageJson, null, 2)}\n`,
    'utf8',
  );
}

async function main() {
  await fs.mkdir(vendorDir, { recursive: true });
  for (const pkg of packages) {
    await syncPackage(pkg);
  }
}

await main();
