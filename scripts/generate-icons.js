// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
#!/usr/bin/env node
/**
 * DEX Icon Generator
 * Converts the SVG icon to the raster formats the installer needs:
 * - icon.png (1024x1024) -- master
 * - icon.ico (256x256) -- Windows
 * - 256x256.png -- Windows fallback
 * - tray-icon.png (32x32) -- System tray
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ASSETS = path.join(__dirname, '..', 'assets');
const SVG_ICON = path.join(ASSETS, 'icon.svg');
const SVG_TRAY = path.join(ASSETS, 'tray-icon.svg');

async function generate() {
  console.log('[Icons] Generating app icons from SVG...');

  // Read SVG
  const svgBuffer = fs.readFileSync(SVG_ICON);
  const traySvgBuffer = fs.readFileSync(SVG_TRAY);

  // 1. Master PNG (1024x1024)
  await sharp(svgBuffer)
    .resize(1024, 1024)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(ASSETS, 'icon.png'));
  console.log('[Icons] icon.png (1024x1024)');

  // 2. 512x512 PNG (macOS)
  await sharp(svgBuffer)
    .resize(512, 512)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(ASSETS, '512x512.png'));
  console.log('[Icons] 512x512.png');

  // 3. 256x256 PNG (Windows)
  await sharp(svgBuffer)
    .resize(256, 256)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(ASSETS, '256x256.png'));
  console.log('[Icons] 256x256.png');

  // 4. Tray icon PNG (32x32, white on transparent for system tray)
  // Use dark background variant for tray on light-themed systems
  await sharp(traySvgBuffer)
    .resize(32, 32)
    .png({ quality: 100 })
    .toFile(path.join(ASSETS, 'tray-icon.png'));
  console.log('[Icons] tray-icon.png (32x32)');

  // 5. Tray icon @2x (64x64 for HiDPI)
  await sharp(traySvgBuffer)
    .resize(64, 64)
    .png({ quality: 100 })
    .toFile(path.join(ASSETS, 'tray-icon@2x.png'));
  console.log('[Icons] tray-icon@2x.png (64x64)');

  // 6. Generate ICO from 256x256 PNG (multi-size ICO is critical for Windows)
  // Create the ICO sizes explicitly
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  for (const size of icoSizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png({ quality: 100 })
      .toFile(path.join(ASSETS, `icon-${size}.png`));
  }
  console.log('[Icons] icon-{16..256}.png for ICO generation');

  // Create ICO file manually (BMP container format)
  const icoBuffer = await createIco(svgBuffer, icoSizes);
  fs.writeFileSync(path.join(ASSETS, 'icon.ico'), icoBuffer);
  console.log('[Icons] icon.ico (multi-size)');

  // Clean up individual size PNGs (not needed after ICO)
  for (const size of icoSizes) {
    fs.unlinkSync(path.join(ASSETS, `icon-${size}.png`));
  }

  console.log('[Icons] Done! All icons generated.');
}

/**
 * Create a multi-size ICO file from SVG buffer.
 * ICO format: header + directory entries + PNG image data
 */
async function createIco(svgBuffer, sizes) {
  const images = [];

  for (const size of sizes) {
    const pngData = await sharp(svgBuffer)
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toBuffer();
    images.push({ size, data: pngData });
  }

  // ICO Header: 6 bytes
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = dirEntrySize * images.length;
  let dataOffset = headerSize + dirSize;

  // Header
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);           // Reserved
  header.writeUInt16LE(1, 2);           // Type: ICO
  header.writeUInt16LE(images.length, 4); // Image count

  // Directory entries
  const dirEntries = Buffer.alloc(dirSize);
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const offset = i * dirEntrySize;
    dirEntries.writeUInt8(img.size >= 256 ? 0 : img.size, offset);     // Width (0 = 256)
    dirEntries.writeUInt8(img.size >= 256 ? 0 : img.size, offset + 1); // Height
    dirEntries.writeUInt8(0, offset + 2);                               // Color palette
    dirEntries.writeUInt8(0, offset + 3);                               // Reserved
    dirEntries.writeUInt16LE(1, offset + 4);                            // Color planes
    dirEntries.writeUInt16LE(32, offset + 6);                           // Bits per pixel
    dirEntries.writeUInt32LE(img.data.length, offset + 8);              // Data size
    dirEntries.writeUInt32LE(dataOffset, offset + 12);                  // Data offset
    dataOffset += img.data.length;
  }

  // Combine all
  return Buffer.concat([header, dirEntries, ...images.map(i => i.data)]);
}

generate().catch(err => {
  console.error('[Icons] Failed:', err);
  process.exit(1);
});
