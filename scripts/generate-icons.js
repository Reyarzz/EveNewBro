// Generates build/icon.png + build/icon.ico (pure JS, no native modules).
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const buildDir = path.join(__dirname, '..', 'build');
const pngPath = path.join(buildDir, 'icon.png');
const icoPath = path.join(buildDir, 'icon.ico');
const SIZE = 512;

function insideDiamond(x, y, cx, cy, r) {
  const dx = Math.abs(x - cx);
  const dy = Math.abs(y - cy);
  return dx + dy <= r;
}

function drawIcon() {
  const png = new PNG({ width: SIZE, height: SIZE });
  const cx = SIZE / 2;
  const cy = SIZE / 2;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (SIZE * y + x) << 2;
      const edge = Math.min(x, y, SIZE - 1 - x, SIZE - 1 - y);
      const corner = edge < 48 ? edge / 48 : 1;

      let r = Math.round(8 + (18 - 8) * corner);
      let g = Math.round(13 + (28 - 13) * corner);
      let b = Math.round(18 + (36 - 18) * corner);

      if (insideDiamond(x, y, cx, cy, SIZE * 0.22)) {
        const t = (x + y) / SIZE;
        r = Math.round(42 + t * 30);
        g = Math.round(150 + t * 40);
        b = Math.round(200 + t * 20);
      } else if (insideDiamond(x, y, cx, cy, SIZE * 0.14)) {
        r = 180;
        g = 230;
        b = 255;
      }

      if (Math.hypot(x - cx, y - (cy + SIZE * 0.32)) < 8) {
        r = 77;
        g = 184;
        b = 232;
      }

      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

async function main() {
  fs.mkdirSync(buildDir, { recursive: true });

  const pngBuf = drawIcon();
  fs.writeFileSync(pngPath, pngBuf);
  console.log('Created', pngPath);

  const pngToIco = require('png-to-ico');
  const icoBuf = await pngToIco(pngPath);
  fs.writeFileSync(icoPath, icoBuf);
  console.log('Created', icoPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
