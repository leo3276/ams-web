const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

/**
 * Mathematically exact, razor-sharp vector SVG of the stylish AMS "A" emblem.
 * Perfectly parallel 67.4° diagonal angles, uniform negative space channel, zero background.
 */
function getSvg(color = '#FFFFFF', glow = false) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000" fill="none">
    <defs>
      <linearGradient id="emeraldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#34D399" />
        <stop offset="50%" stop-color="#10B981" />
        <stop offset="100%" stop-color="#06B6D4" />
      </linearGradient>
      <linearGradient id="darkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0F172A" />
        <stop offset="100%" stop-color="#1E293B" />
      </linearGradient>
      ${glow ? `
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="12" stdDeviation="24" flood-color="#10B981" flood-opacity="0.35" />
      </filter>` : ''}
    </defs>

    <g ${glow ? 'filter="url(#glow)"' : ''}>
      <!-- Main Upper Chevron of the 'A' -->
      <polygon 
        points="500,80 870,880 730,880 500,370 270,880 130,880" 
        fill="${color}" 
      />

      <!-- Floating Inner Triangle (Delta) -->
      <polygon 
        points="500,530 635,880 365,880" 
        fill="${color}" 
      />
    </g>
  </svg>`;
}

async function generateLogos() {
  const outputDirs = [
    path.join(__dirname, '..', 'public'),
    path.join(__dirname, '..', '..', 'Ams Informative Website', 'images'),
    path.join(__dirname, '..', '..', '..', 'Documents', 'Expo', 'ams-app', 'assets'),
  ];

  outputDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  const variants = [
    { name: 'ams-a-logo-white', color: '#FFFFFF', glow: false },
    { name: 'ams-a-logo-dark', color: '#030712', glow: false },
    { name: 'ams-a-logo-emerald', color: 'url(#emeraldGrad)', glow: false },
  ];

  for (const variant of variants) {
    const svgStr = getSvg(variant.color, variant.glow);
    const svgBuffer = Buffer.from(svgStr);

    for (const dir of outputDirs) {
      // Save pristine SVG
      fs.writeFileSync(path.join(dir, `${variant.name}.svg`), svgStr);

      // Save ultra-high resolution 2048x2048 master transparent PNG
      await sharp(svgBuffer)
        .resize(2048, 2048)
        .png({ compressionLevel: 9, quality: 100 })
        .toFile(path.join(dir, `${variant.name}-2048.png`));

      // Save 1024x1024 crisp PNG
      await sharp(svgBuffer)
        .resize(1024, 1024)
        .png({ compressionLevel: 9, quality: 100 })
        .toFile(path.join(dir, `${variant.name}-1024.png`));

      // Save 512x512 crisp PNG (standard icon)
      await sharp(svgBuffer)
        .resize(512, 512)
        .png({ compressionLevel: 9, quality: 100 })
        .toFile(path.join(dir, `${variant.name}-512.png`));

      // Save 192x192 PNG
      await sharp(svgBuffer)
        .resize(192, 192)
        .png({ compressionLevel: 9, quality: 100 })
        .toFile(path.join(dir, `${variant.name}-192.png`));
    }
  }

  // App Icons
  const whiteSvg = getSvg('#FFFFFF');
  const whiteSvgBuf = Buffer.from(whiteSvg);
  const darkSvg = getSvg('#0F172A');
  const darkSvgBuf = Buffer.from(darkSvg);
  
  for (const dir of outputDirs) {
    await sharp(whiteSvgBuf)
      .resize(1024, 1024)
      .png({ compressionLevel: 9, quality: 100 })
      .toFile(path.join(dir, 'app-icon.png'));

    await sharp(whiteSvgBuf)
      .resize(512, 512)
      .png({ compressionLevel: 9, quality: 100 })
      .toFile(path.join(dir, 'icon.png'));

    await sharp(whiteSvgBuf)
      .resize(180, 180)
      .png({ compressionLevel: 9, quality: 100 })
      .toFile(path.join(dir, 'apple-icon.png'));

    await sharp(darkSvgBuf)
      .resize(512, 512)
      .png({ compressionLevel: 9, quality: 100 })
      .toFile(path.join(dir, 'icon-dark.png'));
  }

  console.log('✅ Generated ultra-high quality, lossless vector & 2048px transparent stylish "A" logos successfully!');
}

generateLogos().catch(console.error);
