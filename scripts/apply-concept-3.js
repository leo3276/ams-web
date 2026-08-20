const fs = require('fs');
const path = require('path');

const sourceImage = 'C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\d94b75e0-f33f-47ba-beeb-37355ef3ef06\\ams_logo_concept_3_1787174129966.jpg';

const destinations = [
  path.join(__dirname, '..', 'app', 'icon.png'),
  path.join(__dirname, '..', 'app', 'apple-icon.png'),
  path.join(__dirname, '..', 'electron', 'assets', 'icon.png'),
  path.join(__dirname, '..', 'public', 'icon.png'),
  path.join(__dirname, '..', 'public', 'apple-icon.png'),
  'C:\\Users\\Administrator\\Documents\\Expo\\ams-app\\assets\\icon.png',
  'C:\\Users\\Administrator\\Documents\\Expo\\ams-app\\assets\\adaptive-icon.png',
  'C:\\Users\\Administrator\\Documents\\Expo\\ams-app\\assets\\splash.png',
  'C:\\Users\\Administrator\\Documents\\Expo\\ams-app\\assets\\favicon.png',
  'C:\\Users\\Administrator\\Desktop\\Ams Informative Website\\images\\app-icon.png',
];

destinations.forEach((dest) => {
  try {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(sourceImage, dest);
    console.log('✓ Updated:', dest);
  } catch (err) {
    console.error('Failed to update:', dest, err.message);
  }
});

// Build ICO for Windows
const destIco = path.join(__dirname, '..', 'electron', 'assets', 'icon.ico');
const imgBuffer = fs.readFileSync(sourceImage);
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
dirEntry.writeUInt32LE(imgBuffer.length, 8);
dirEntry.writeUInt32LE(6 + 16, 12);

const icoBuffer = Buffer.concat([header, dirEntry, imgBuffer]);
fs.writeFileSync(destIco, icoBuffer);
console.log('✓ Successfully generated Windows icon.ico for Concept 3!');
