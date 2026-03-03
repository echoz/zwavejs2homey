import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');

const entries = [
  {
    from: path.join(appRoot, '.homeybuild/app.js'),
    to: path.join(appRoot, 'app.js'),
  },
  {
    from: path.join(appRoot, '.homeybuild/drivers/bridge/driver.js'),
    to: path.join(appRoot, 'drivers/bridge/driver.js'),
  },
  {
    from: path.join(appRoot, '.homeybuild/drivers/bridge/device.js'),
    to: path.join(appRoot, 'drivers/bridge/device.js'),
  },
  {
    from: path.join(appRoot, '.homeybuild/drivers/node/driver.js'),
    to: path.join(appRoot, 'drivers/node/driver.js'),
  },
  {
    from: path.join(appRoot, '.homeybuild/drivers/node/device.js'),
    to: path.join(appRoot, 'drivers/node/device.js'),
  },
];

for (const entry of entries) {
  await fs.access(entry.from);
  await fs.copyFile(entry.from, entry.to);
}
