const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
let pngToIco = require('png-to-ico');
if (pngToIco.default) pngToIco = pngToIco.default;

// Exact Concept 3 vector recreation:
// Bold white geometric 'A' frame with sleek black ascending bars, floating on a 100% transparent background (like VS Code / Claude)
const svgContent = `
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000000" flood-opacity="0.3"/>
    </filter>
  </defs>

  <g filter="url(#drop)">
    <!-- White 'A' Main Framework with subtle black border for contrast on light/dark themes -->
    <!-- Left diagonal stem -->
    <polygon points="230,44 266,44 94,424 50,424" fill="#FFFFFF" stroke="#000000" stroke-width="4"/>
    
    <!-- Horizontal Crossbar in pure White -->
    <polygon points="120,314 360,314 340,360 100,360" fill="#FFFFFF" stroke="#000000" stroke-width="4"/>

    <!-- Right diagonal base leg -->
    <polygon points="314,314 424,424 374,424 280,314" fill="#FFFFFF" stroke="#000000" stroke-width="4"/>

    <!-- Black Dynamic Ascending Financial Growth Bars -->
    <!-- Lower Bar 1 -->
    <polygon points="186,360 236,256 270,256 220,360" fill="#000000"/>
    
    <!-- Main Middle Growth Bar 2 -->
    <polygon points="236,256 296,128 332,128 272,256" fill="#000000"/>

    <!-- Top Ascending Spike Bar 3 -->
    <polygon points="296,128 368,44 406,44 334,128" fill="#000000"/>
    
    <!-- Dynamic Accent Tip -->
    <polygon points="334,240 376,240 330,340 288,340" fill="#000000"/>
  </g>
</svg>
`;

async function buildFreestandingLogo() {
  const assetsDir = path.join(__dirname, '..', 'electron', 'assets');
  const buildDir = path.join(__dirname, '..', 'build');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
  if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

  const svgBuffer = Buffer.from(svgContent);

  // 1. Generate 512x512 Transparent PNG
  const png512 = path.join(assetsDir, 'icon.png');
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(png512);

  // Distribute across Web, Build, and Mobile
  fs.copyFileSync(png512, path.join(__dirname, '..', 'app', 'icon.png'));
  fs.copyFileSync(png512, path.join(__dirname, '..', 'app', 'apple-icon.png'));
  fs.copyFileSync(png512, path.join(__dirname, '..', 'public', 'icon.png'));
  fs.copyFileSync(png512, path.join(__dirname, '..', 'public', 'apple-icon.png'));
  fs.copyFileSync(png512, path.join(buildDir, 'icon.png'));

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

  // 3. Generate native multi-frame ICO file with 100% alpha transparency
  const icoBuffer = await (typeof pngToIco === 'function' ? pngToIco(sizeFiles) : pngToIco.default(sizeFiles));
  const targetIco = path.join(assetsDir, 'icon.ico');
  fs.writeFileSync(targetIco, icoBuffer);
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer);

  for (const f of sizeFiles) {
    try { fs.unlinkSync(f); } catch (_e) {}
  }

  console.log('✓ Successfully created freestanding transparent AMS icon and native Windows ICO!');
}

buildFreestandingLogo().catch((err) => {
  console.error('Error generating freestanding logo:', err);
  process.exit(1);
});
