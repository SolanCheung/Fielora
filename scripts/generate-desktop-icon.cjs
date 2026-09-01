const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { deflateSync, inflateSync } = require('node:zlib');

const sourcePath = path.resolve(__dirname, '..', 'apps', 'desktop', 'assets', 'fielora-brand-mark.png');
const outputPath = path.resolve(__dirname, '..', 'apps', 'desktop', 'assets', 'fielora.ico');
const previewPath = process.env.FIELORA_ICON_PREVIEW ? path.resolve(process.env.FIELORA_ICON_PREVIEW) : null;
const sizes = [16, 24, 32, 48, 64, 128, 256];

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit += 1) current = (current & 1) ? (0xedb88320 ^ (current >>> 1)) : (current >>> 1);
  return current >>> 0;
});

function crc32(buffer) {
  let checksum = 0xffffffff;
  for (const value of buffer) checksum = crcTable[(checksum ^ value) & 0xff] ^ (checksum >>> 8);
  return (checksum ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return chunk;
}

function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function decodePng(png) {
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Rendered icon is not PNG');
  let cursor = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (cursor < png.length) {
    const length = png.readUInt32BE(cursor);
    const type = png.subarray(cursor + 4, cursor + 8).toString('ascii');
    const data = png.subarray(cursor + 8, cursor + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error('Rendered PNG must be non-interlaced 8-bit RGBA');
    }
    if (type === 'IDAT') idat.push(data);
    cursor += length + 12;
    if (type === 'IEND') break;
  }

  const compressed = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = compressed[source++];
    for (let x = 0; x < stride; x += 1) {
      const value = compressed[source++];
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const above = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = above;
      else if (filter === 3) predictor = Math.floor((left + above) / 2);
      else if (filter === 4) predictor = paeth(left, above, upperLeft);
      else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}`);
      pixels[y * stride + x] = (value + predictor) & 0xff;
    }
  }
  return { width, height, pixels };
}

function alphaRange(pixels) {
  let minimum = 255;
  let maximum = 0;
  for (let index = 3; index < pixels.length; index += 4) {
    minimum = Math.min(minimum, pixels[index]);
    maximum = Math.max(maximum, pixels[index]);
  }
  return { minimum, maximum };
}

function fitVisiblePixels(source, sourceWidth, sourceHeight, paddingRatio = 0.055) {
  let left = sourceWidth;
  let top = sourceHeight;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < sourceHeight; y += 1) {
    for (let x = 0; x < sourceWidth; x += 1) {
      const alpha = source[(y * sourceWidth + x) * 4 + 3];
      if (alpha <= 8) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw new Error('Rendered icon has no visible pixels');

  const cropWidth = right - left + 1;
  const cropHeight = bottom - top + 1;
  const cropped = Buffer.alloc(cropWidth * cropHeight * 4);
  for (let y = 0; y < cropHeight; y += 1) {
    const sourceStart = ((top + y) * sourceWidth + left) * 4;
    source.copy(cropped, y * cropWidth * 4, sourceStart, sourceStart + cropWidth * 4);
  }

  const available = Math.round(Math.min(sourceWidth, sourceHeight) * (1 - paddingRatio * 2));
  const scale = Math.min(available / cropWidth, available / cropHeight);
  const fittedWidth = Math.max(1, Math.round(cropWidth * scale));
  const fittedHeight = Math.max(1, Math.round(cropHeight * scale));
  const fitted = resizeRgba(cropped, cropWidth, cropHeight, fittedWidth, fittedHeight);
  const canvas = Buffer.alloc(sourceWidth * sourceHeight * 4);
  const offsetX = Math.floor((sourceWidth - fittedWidth) / 2);
  const offsetY = Math.floor((sourceHeight - fittedHeight) / 2);
  for (let y = 0; y < fittedHeight; y += 1) {
    const sourceStart = y * fittedWidth * 4;
    const targetStart = ((offsetY + y) * sourceWidth + offsetX) * 4;
    fitted.copy(canvas, targetStart, sourceStart, sourceStart + fittedWidth * 4);
  }
  return { pixels: canvas, bounds: { left, top, right, bottom, fittedWidth, fittedHeight, offsetX, offsetY } };
}

function resizeRgba(source, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  if (sourceWidth === targetWidth && sourceHeight === targetHeight) return Buffer.from(source);
  const target = Buffer.alloc(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = ((y + 0.5) * sourceHeight / targetHeight) - 0.5;
    const y0 = Math.max(0, Math.floor(sourceY));
    const y1 = Math.min(sourceHeight - 1, y0 + 1);
    const wy = Math.max(0, sourceY - y0);
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = ((x + 0.5) * sourceWidth / targetWidth) - 0.5;
      const x0 = Math.max(0, Math.floor(sourceX));
      const x1 = Math.min(sourceWidth - 1, x0 + 1);
      const wx = Math.max(0, sourceX - x0);
      const samples = [
        [x0, y0, (1 - wx) * (1 - wy)],
        [x1, y0, wx * (1 - wy)],
        [x0, y1, (1 - wx) * wy],
        [x1, y1, wx * wy],
      ];
      let alpha = 0;
      const premultiplied = [0, 0, 0];
      for (const [sampleX, sampleY, weight] of samples) {
        const offset = (sampleY * sourceWidth + sampleX) * 4;
        const sampleAlpha = source[offset + 3] / 255;
        alpha += sampleAlpha * weight;
        for (let channel = 0; channel < 3; channel += 1) premultiplied[channel] += source[offset + channel] * sampleAlpha * weight;
      }
      const targetOffset = (y * targetWidth + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) target[targetOffset + channel] = alpha > 0 ? Math.round(premultiplied[channel] / alpha) : 0;
      target[targetOffset + 3] = Math.round(alpha * 255);
    }
  }
  return target;
}

function encodeIco(images) {
  const directorySize = 6 + images.length * 16;
  const header = Buffer.alloc(directorySize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = directorySize;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(0, entry + 2);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

function main() {
  const source = decodePng(readFileSync(sourcePath));
  const sourceAlpha = alphaRange(source.pixels);
  if (sourceAlpha.minimum !== 0 || sourceAlpha.maximum !== 255) {
    throw new Error(`Brand PNG must include full transparency and opacity: ${JSON.stringify(sourceAlpha)}`);
  }

  const fittedSource = fitVisiblePixels(source.pixels, source.width, source.height);
  const images = sizes.map((size) => {
    const pixels = resizeRgba(fittedSource.pixels, source.width, source.height, size, size);
    const alpha = alphaRange(pixels);
    if (alpha.minimum !== 0 || alpha.maximum < 250) throw new Error(`Invalid alpha range for ${size}px: ${JSON.stringify(alpha)}`);
    return { size, png: encodePng(size, size, pixels) };
  });
  writeFileSync(outputPath, encodeIco(images));
  if (previewPath) writeFileSync(previewPath, images.at(-1).png);
  process.stdout.write(`Generated transparent Windows icon from ${sourcePath}: ${outputPath}\nVisible mark fitted to ${fittedSource.bounds.fittedWidth}x${fittedSource.bounds.fittedHeight}px at ${fittedSource.bounds.offsetX},${fittedSource.bounds.offsetY}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
}
