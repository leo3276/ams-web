const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function buildMobileAssets() {
  const assetsDir = path.join('C:', 'Users', 'Administrator', 'Documents', 'Expo', 'ams-app', 'assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  // SVG of the Pure Elevated Stylish "A" Emblem
  const stylishA_Svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
    <polygon points="500,80 860,880 710,880 500,410 290,880 140,880" fill="#FFFFFF" />
    <polygon points="500,530 635,880 365,880" fill="#10B981" />
  </svg>`;

  const svgBuffer = Buffer.from(stylishA_Svg);

  // 1. Master Icon (1024x1024 on Obsidian Dark Background #0A0D14 with soft glow)
  console.log('Generating mobile icon.png (1024x1024)...');
  const emblemResized = await sharp(svgBuffer)
    .resize(700, 700, { fit: 'contain' })
    .toBuffer();

  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 10, g: 13, b: 20, alpha: 1 }
    }
  })
  .composite([{ input: emblemResized, gravity: 'center' }])
  .png({ quality: 100 })
  .toFile(path.join(assetsDir, 'icon.png'));

  // 2. Android Adaptive Icon (1024x1024 with 432px safe zone foreground)
  console.log('Generating adaptive-icon.png (1024x1024)...');
  const adaptiveEmblem = await sharp(svgBuffer)
    .resize(480, 480, { fit: 'contain' })
    .toBuffer();

  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
  .composite([{ input: adaptiveEmblem, gravity: 'center' }])
  .png({ quality: 100 })
  .toFile(path.join(assetsDir, 'adaptive-icon.png'));

  // 3. Mobile Splash Screen (2048x2048 on Obsidian Dark #0A0D14)
  console.log('Generating splash.png (2048x2048)...');
  const splashEmblem = await sharp(svgBuffer)
    .resize(600, 600, { fit: 'contain' })
    .toBuffer();

  await sharp({
    create: {
      width: 2048,
      height: 2048,
      channels: 4,
      background: { r: 10, g: 13, b: 20, alpha: 1 }
    }
  })
  .composite([{ input: splashEmblem, gravity: 'center' }])
  .png({ quality: 100 })
  .toFile(path.join(assetsDir, 'splash.png'));

  // 4. Favicon (512x512)
  console.log('Generating favicon.png (512x512)...');
  await sharp(svgBuffer)
    .resize(512, 512, { fit: 'contain' })
    .png({ quality: 100 })
    .toFile(path.join(assetsDir, 'favicon.png'));

  console.log('✅ All mobile assets generated successfully in ams-app/assets!');
}

buildMobileAssets().catch(console.error);
