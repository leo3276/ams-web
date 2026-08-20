const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
let pngToIco = require('png-to-ico');
if (pngToIco.default) pngToIco = pngToIco.default;

const sourceImage = 'C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\d94b75e0-f33f-47ba-beeb-37355ef3ef06\\ams_logo_concept_3_1787174129966.jpg';

async function generateAllIcons() {
  const assetsDir = path.join(__dirname, '..', 'electron', 'assets');
  const buildDir = path.join(__dirname, '..', 'build');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
  if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

  // 1. Generate clean 512x512 PNG
  const png512 = path.join(assetsDir, 'icon.png');
  await sharp(sourceImage)
    .resize(512, 512)
    .png()
    .toFile(png512);

  // Copy to web and build directories
  fs.copyFileSync(png512, path.join(__dirname, '..', 'app', 'icon.png'));
  fs.copyFileSync(png512, path.join(__dirname, '..', 'app', 'apple-icon.png'));
  fs.copyFileSync(png512, path.join(__dirname, '..', 'public', 'icon.png'));
  fs.copyFileSync(png512, path.join(__dirname, '..', 'public', 'apple-icon.png'));
  fs.copyFileSync(png512, path.join(buildDir, 'icon.png'));

  // Mobile Expo copies
  const mobileDir = 'C:\\Users\\Administrator\\Documents\\Expo\\ams-app\\assets';
  if (fs.existsSync(mobileDir)) {
    fs.copyFileSync(png512, path.join(mobileDir, 'icon.png'));
    fs.copyFileSync(png512, path.join(mobileDir, 'adaptive-icon.png'));
    fs.copyFileSync(png512, path.join(mobileDir, 'splash.png'));
    fs.copyFileSync(png512, path.join(mobileDir, 'favicon.png'));
  }

  // 2. Generate multi-resolution temporary PNG files for png-to-ico
  const sizes = [256, 128, 64, 48, 32, 16];
  const sizeFiles = [];
  for (const size of sizes) {
    const sizePath = path.join(assetsDir, `icon_${size}.png`);
    await sharp(sourceImage)
      .resize(size, size)
      .png()
      .toFile(sizePath);
    sizeFiles.push(sizePath);
  }

  // 3. Generate native Windows multi-frame ICO file
  const icoBuffer = await (typeof pngToIco === 'function' ? pngToIco(sizeFiles) : pngToIco.default(sizeFiles));
  const targetIco = path.join(assetsDir, 'icon.ico');
  fs.writeFileSync(targetIco, icoBuffer);
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer);

  // Clean up temp size files
  for (const f of sizeFiles) {
    try { fs.unlinkSync(f); } catch (_e) {}
  }

  console.log('✓ Successfully generated native multi-resolution Windows ICO (16px to 256px) and 512px PNG!');
}

generateAllIcons().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
