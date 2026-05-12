const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const files = [
  'imagewallpapers/island-dark.jpg',
  'imagewallpapers/sand-dunes-tower-tranquil-black-white-generative-ai.jpg',
];

(async () => {
  for (const f of files) {
    const inPath = path.resolve(f);
    if (!fs.existsSync(inPath)) { console.log('SKIP missing', f); continue; }
    const outPath = inPath.replace(/\.jpe?g$/i, '.avif');
    const inSize = fs.statSync(inPath).size;
    console.log('Converting', f, '(' + (inSize/1024/1024).toFixed(2) + ' MB)');
    await sharp(inPath)
      .avif({ quality: 55, effort: 6, chromaSubsampling: '4:2:0' })
      .toFile(outPath);
    const outSize = fs.statSync(outPath).size;
    console.log('  ->', path.basename(outPath), '(' + (outSize/1024/1024).toFixed(2) + ' MB) saved', ((1 - outSize/inSize)*100).toFixed(1) + '%');
  }
})().catch(e => { console.error(e); process.exit(1); });
