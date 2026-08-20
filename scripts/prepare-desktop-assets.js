const fs = require('fs');
const path = require('path');

const srcIcon = 'C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\d94b75e0-f33f-47ba-beeb-37355ef3ef06\\ams_logo_concept_3_1787174129966.jpg';
const targetDir = path.join(__dirname, '..', 'electron', 'assets');

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const targetPng = path.join(targetDir, 'icon.png');
const targetIco = path.join(targetDir, 'icon.ico');

// Copy Concept 3 image
fs.copyFileSync(srcIcon, targetPng);
fs.copyFileSync(srcIcon, path.join(__dirname, '..', 'app', 'icon.png'));
fs.copyFileSync(srcIcon, path.join(__dirname, '..', 'app', 'apple-icon.png'));

// Build standard ICO file
const pngBuffer = fs.readFileSync(srcIcon);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);

const dirEntry = Buffer.alloc(16);
dirEntry.writeUInt8(0, 0); // 256px
dirEntry.writeUInt8(0, 1);
dirEntry.writeUInt8(0, 2);
dirEntry.writeUInt8(0, 3);
dirEntry.writeUInt16LE(1, 4);
dirEntry.writeUInt16LE(32, 6);
dirEntry.writeUInt32LE(pngBuffer.length, 8);
dirEntry.writeUInt32LE(6 + 16, 12);

const icoBuffer = Buffer.concat([header, dirEntry, pngBuffer]);
fs.writeFileSync(targetIco, icoBuffer);

console.log('✓ Successfully prepared Concept 3 logo assets for Electron desktop!');
