const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
let pngToIco = require('png-to-ico');
if (pngToIco.default) pngToIco = pngToIco.default;

/**
 * 100% FREESTANDING STYLISH "A" DESKTOP ICON — ZERO BACKGROUND CONTAINER.
 * Just the pure, elevated, geometric "A" with its floating delta triangle.
 * Has a subtle dark edge stroke + drop-shadow so it is razor-sharp on BOTH
 * pure white and pure dark desktop wallpapers and taskbars.
 */
const freestandingIconSvg = `
<svg width="512" height="512" viewBox="0 0 1000 1000" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="iconShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="#000000" flood-opacity="0.7"/>
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.9"/>
    </filter>
  </defs>

  <g filter="url(#iconShadow)">
    <!-- Main Upper Chevron of the 'A' -->
    <polygon 
      points="500,80 870,880 730,880 500,370 270,880 130,880" 
      fill="#FFFFFF" 
      stroke="#0F172A" 
      stroke-width="12"
      stroke-linejoin="round"
    />

    <!-- Floating Inner Triangle (Delta) -->
    <polygon 
      points="500,530 635,880 365,880" 
      fill="#FFFFFF" 
      stroke="#0F172A" 
      stroke-width="12"
      stroke-linejoin="round"
    />
  </g>
</svg>
`;

async function buildFreestandingAppIcons() {
  const assetsDir = path.join(__dirname, '..', 'electron', 'assets');
  const buildDir = path.join(__dirname, '..', 'build');
  const publicDir = path.join(__dirname, '..', 'public');
  const appDir = path.join(__dirname, '..', 'app');
  const webImagesDir = path.join(__dirname, '..', '..', 'Ams Informative Website', 'images');
  const mobileAssetsDir = path.join(__dirname, '..', '..', '..', 'Documents', 'Expo', 'ams-app', 'assets');

  [assetsDir, buildDir, publicDir, appDir, webImagesDir, mobileAssetsDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  const svgBuffer = Buffer.from(freestandingIconSvg);

  // 1. Generate 512x512 Master Freestanding PNG (Zero Background)
  const png512 = path.join(assetsDir, 'icon.png');
  await sharp(svgBuffer)
    .resize(512, 512)
    .png({ quality: 100 })
    .toFile(png512);

  // 2. Generate multi-size PNGs for ICO packaging (256, 128, 64, 48, 32, 16)
  const sizes = [256, 128, 64, 48, 32, 16];
  const sizeFiles = [];

  for (const s of sizes) {
    const filePath = path.join(assetsDir, `icon_${s}.png`);
    await sharp(svgBuffer)
      .resize(s, s)
      .png({ quality: 100 })
      .toFile(filePath);
    sizeFiles.push(filePath);
  }

  // 3. Build Windows multi-layer icon.ico
  const icoBuffer = await pngToIco(sizeFiles);
  const icoPath = path.join(assetsDir, 'icon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  fs.writeFileSync(path.join(assetsDir, 'installerIcon.ico'), icoBuffer);
  fs.writeFileSync(path.join(assetsDir, 'uninstallerIcon.ico'), icoBuffer);
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer);
  fs.writeFileSync(path.join(buildDir, 'installerIcon.ico'), icoBuffer);
  fs.writeFileSync(path.join(buildDir, 'uninstallerIcon.ico'), icoBuffer);
  fs.writeFileSync(path.join(buildDir, 'installerHeaderIcon.ico'), icoBuffer);
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);

  // 4. Distribute PNG icons across all project locations
  const distTargets = [
    path.join(buildDir, 'icon.png'),
    path.join(publicDir, 'icon.png'),
    path.join(publicDir, 'app-icon.png'),
    path.join(appDir, 'icon.png'),
    path.join(appDir, 'apple-icon.png'),
    path.join(webImagesDir, 'app-icon.png'),
    path.join(mobileAssetsDir, 'icon.png'),
    path.join(mobileAssetsDir, 'adaptive-icon.png'),
  ];

  for (const target of distTargets) {
    fs.copyFileSync(png512, target);
  }

  // 5. Clean up temp size files
  for (const f of sizeFiles) {
    try { fs.unlinkSync(f); } catch (e) {}
  }

  console.log('✅ Generated 100% ZERO-BACKGROUND Freestanding Stylish "A" Windows Desktop Icon (icon.ico + icon.png)!');
}

buildFreestandingAppIcons().catch(console.error);
