const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const problems = [];

if (!fs.existsSync(path.join(root, 'node_modules', 'electron-builder'))) {
  problems.push('electron-builder is not installed. Run:  npm install');
}
if (!fs.existsSync(path.join(root, 'node_modules', 'pngjs'))) {
  problems.push('pngjs is not installed. Run:  npm install');
}
if (!fs.existsSync(path.join(root, 'build', 'icon.ico'))) {
  problems.push('build/icon.ico is missing. Run:  npm run icons');
}

if (problems.length) {
  console.error('\nCannot build yet:\n');
  problems.forEach((p) => console.error('  • ' + p));
  console.error('\nThen run:  npm run build\n');
  process.exit(1);
}
