const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function createPng(width, height, r, g, b) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type (RGBA)
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type);
    const crc = Buffer.alloc(4);
    const full = Buffer.concat([typeBuf, data]);
    const crcVal = require('zlib').crc32(full);
    crc.writeUInt32BE(crcVal >>> 0, 0);
    return Buffer.concat([len, full, crc]);
  }

  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Raw image data with scanline filters (filter byte 0)
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowSize);

  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.45;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Warm amber-orange gradient #f59e0b to #ea580c
      const t = (x + y) / (width + height);
      const pr = Math.round(245 * (1 - t) + 234 * t);
      const pg = Math.round(158 * (1 - t) + 88 * t);
      const pb = Math.round(11 * (1 - t) + 12 * t);

      // Rounded rect or circle icon background
      if (dist <= radius) {
        // Simple inner symbol check (shopping bag / store outline)
        const inBag = (x > width * 0.3 && x < width * 0.7 && y > height * 0.4 && y < height * 0.75);
        if (inBag) {
          rawData[pxOffset] = 255;
          rawData[pxOffset + 1] = 255;
          rawData[pxOffset + 2] = 255;
          rawData[pxOffset + 3] = 255;
        } else {
          rawData[pxOffset] = pr;
          rawData[pxOffset + 1] = pg;
          rawData[pxOffset + 2] = pb;
          rawData[pxOffset + 3] = 255;
        }
      } else {
        rawData[pxOffset] = pr;
        rawData[pxOffset + 1] = pg;
        rawData[pxOffset + 2] = pb;
        rawData[pxOffset + 3] = 255;
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const publicDir = path.join(__dirname, '..', 'public');
fs.writeFileSync(path.join(publicDir, 'icon-192.png'), createPng(192, 192));
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), createPng(512, 512));
console.log('Icons generated successfully in public/');
