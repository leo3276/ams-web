const fs = require('fs');
const path = require('path');

// Source chosen concept image
const sourceImage = 'C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\d94b75e0-f33f-47ba-beeb-37355ef3ef06\\ams_logo_concept_3_1787174129966.jpg';

const destWebIcon = path.join(__dirname, '..', 'app', 'icon.png');
const destWebApple = path.join(__dirname, '..', 'app', 'apple-icon.png');
const destElectronPng = path.join(__dirname, '..', 'electron', 'assets', 'icon.png');
const destElectronIco = path.join(__dirname, '..', 'electron', 'assets', 'icon.ico');

const destAppIcon = 'C:\\Users\\Administrator\\Documents\\Expo\\ams-app\\assets\\icon.png';
const destAppAdaptive = 'C:\\Users\\Administrator\\Documents\\Expo\\ams-app\\assets\\adaptive-icon.png';
const destAppSplash = 'C:\\Users\\Administrator\\Documents\\Expo\\ams-app\\assets\\splash.png';

if (fs.existsSync(sourceImage)) {
  fs.copyFileSync(sourceImage, destWebIcon);
  fs.copyFileSync(sourceImage, destWebApple);
  fs.copyFileSync(sourceImage, destElectronPng);

  if (fs.existsSync('C:\\Users\\Administrator\\Documents\\Expo\\ams-app\\assets')) {
    fs.copyFileSync(sourceImage, destAppIcon);
    fs.copyFileSync(sourceImage, destAppAdaptive);
    fs.copyFileSync(sourceImage, destAppSplash);
  }

  // Create ICO file
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
  fs.writeFileSync(destElectronIco, icoBuffer);

  console.log('✓ Successfully updated brand logo across desktop and mobile assets!');
} else {
  console.error('Source image not found:', sourceImage);
}
