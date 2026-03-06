const fs = require('node:fs');
const path = require('node:path');

function loadFixture(...segments) {
  const filePath = path.join(__dirname, ...segments);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

module.exports = { loadFixture };
