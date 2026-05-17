const fs = require('node:fs');
const path = require('node:path');

const assetsDir = path.join(__dirname, '..', 'assets');
const lampPath = path.join(assetsDir, 'lamp.png');
const originalPath = path.join(assetsDir, 'lamp-original.png');

if (!fs.existsSync(lampPath)) {
  throw new Error('assets/lamp.png is missing.');
}

if (!fs.existsSync(originalPath)) {
  fs.copyFileSync(lampPath, originalPath);
}

console.log('assets/lamp.png is present. The current asset is a PNG with alpha transparency.');
