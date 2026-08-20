const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
let pngToIco = require('png-to-ico');
if (pngToIco.default) pngToIco = pngToIco.default;

// High-precision vector SVG representing the freestanding geometric AMS emblem (White 'A' with black ascending balance bars, 100% transparent background)
const svgLogo = `
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
  </defs>

  <!-- Group with subtle drop shadow for visibility on any desktop wallpaper -->
  <g filter="url(#shadow)">
    <!-- White 'A' Outer Frame Structure -->
    <path d="M256 50 L410 420 L330 420 L288 320 L180 320 L145 420 L65 420 Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="6" stroke-linejoin="round"/>
    
    <!-- White 'A' Inner Negative Space Cutout -->
    <path d="M234 220 L256 150 L278 220 Z" fill="none"/>

    <!-- Black Dynamic Ascending Growth Bars cutting through the A -->
    <!-- Bar 1 (Short left) -->
    <polygon points="175,340 205,340 160,430 130,430" fill="#000000"/>
    
    <!-- Bar 2 (Middle growth bar) -->
    <polygon points="215,280 255,280 185,430 145,430" fill="#000000"/>
    
    <!-- Bar 3 (Main Ascending Bar penetrating upwards) -->
    <polygon points="265,180 310,180 195,430 150,430" fill="#000000"/>

    <!-- Bar 4 (Top High-Velocity Growth Spear) -->
    <polygon points="320,80 365,80 220,390 175,390" fill="#000000"/>
    
    <!-- Precision Crossbar Divider in crisp white/black -->
    <rect x="175" y="300" width="130" height="24" rx="4" fill="#FFFFFF" stroke="#000000" stroke-width="4"/>
  </g>
</svg>
`;

async function buildTransparentBrandIcons() {
  const assetsDir = path.join(__dirname, '..', 'electron', 'assets');
  const buildDir = path.join(__dirname, '..', 'build');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
  if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

  const svgBuffer = Buffer.from(svgLogo);

  // 1. Generate 512x512 Transparent PNG
  const png512 = path.join(assetsDir, 'icon.png');
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(png512);

  // Copy to Web and Public
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

  // 2. Generate multi-resolution sizes for Windows ICO
  const sizes = [256, 128, 64, 48, 32, 16];
  const sizeFiles = [];
  for (const size of sizes) {
    const sizePath = path.join(assetsDir, `icon_${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(sizePath);
    sizeFiles.push(sizePath);
  }

  // 3. Generate native multi-frame ICO file with full alpha transparency
  const icoBuffer = await (typeof pngToIco === 'function' ? pngToIco(sizeFiles) : pngToIco.default(sizeFiles));
  const targetIco = path.join(assetsDir, 'icon.ico');
  fs.writeFileSync(targetIco, icoBuffer);
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer);

  for (const f of sizeFiles) {
    try { fs.unlinkSync(f); } catch (_e) {}
  }

  console.log('✓ Successfully created freestanding transparent AMS logo and native Windows ICO!');
}

buildTransparentBrandIcons().catch((err) => {
  console.error('Error generating transparent icons:', err);
  process.exit(1);
});
