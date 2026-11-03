import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createCRC32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
}

const crcTable = createCRC32Table();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function generatePng(size: number): Buffer {
  // RGBA buffer: size x size
  const rawData = Buffer.alloc(size * (size * 4 + 1));
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.45;

  let offset = 0;
  for (let y = 0; y < size; y++) {
    rawData[offset++] = 0; // Filter type: None
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - cx) / r;
      const dy = (y + 0.5 - cy) / r;
      const d2 = dx * dx + dy * dy;

      // Shield geometry approximation
      // Top half rounded, bottom half tapers to point
      const isTop = y < cy;
      const taper = isTop ? 1.0 : Math.max(0, 1.0 - ((y - cy) / (size - cy)) * 0.7);
      const inShield = Math.abs(x - cx) <= (r * taper) && y >= (cy - r * 0.8) && y <= (cy + r * 0.95);

      if (inShield) {
        // Shield outline vs inner
        const distFromEdge = Math.min(
          r * taper - Math.abs(x - cx),
          y - (cy - r * 0.8),
          (cy + r * 0.95) - y
        );

        if (distFromEdge < size * 0.08) {
          // Dark blue border (#1D4ED8)
          rawData[offset++] = 29;
          rawData[offset++] = 78;
          rawData[offset++] = 216;
          rawData[offset++] = 255;
        } else {
          // Primary bright blue (#2563EB)
          // Add a subtle white shield emblem inside if size >= 32
          const inEmblem = (size >= 32) && Math.abs(x - cx) < size * 0.14 && Math.abs(y - cy) < size * 0.2;
          if (inEmblem) {
            rawData[offset++] = 255;
            rawData[offset++] = 255;
            rawData[offset++] = 255;
            rawData[offset++] = 240;
          } else {
            rawData[offset++] = 37;
            rawData[offset++] = 99;
            rawData[offset++] = 235;
            rawData[offset++] = 255;
          }
        }
      } else {
        // Transparent outside shield
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
      }
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const compressedData = zlib.deflateSync(rawData);

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressedData),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

const sizes = [16, 32, 48, 128];
const targetDirs = [
  path.join(__dirname, '../monitor-extension/src/icons'),
  path.join(__dirname, '../monitor-extension/public/icons'),
  path.join(__dirname, '../monitor-extension/dist/icons'),
];

for (const dir of targetDirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

for (const size of sizes) {
  const png = generatePng(size);
  for (const dir of targetDirs) {
    const filePath = path.join(dir, `icon${size}.png`);
    fs.writeFileSync(filePath, png);
    console.log(`Generated ${filePath} (${png.length} bytes)`);
  }
}

console.log('All icons generated successfully!');

