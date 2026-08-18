const { spawnSync } = require('node:child_process');
const { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { deflateSync, inflateSync } = require('node:zlib');

const sourcePath = path.resolve(__dirname, '..', 'apps', 'desktop', 'assets', 'fielora-mark.svg');
const outputPath = path.resolve(__dirname, '..', 'apps', 'desktop', 'assets', 'fielora.ico');
const previewPath = process.env.FIELORA_ICON_PREVIEW ? path.resolve(process.env.FIELORA_ICON_PREVIEW) : null;
const sizes = [16, 24, 32, 48, 64, 128, 256];
const browserCandidates = [
  process.env.FIELORA_ICON_BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

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

function renderSource(browserPath, htmlUrl, directory) {
  const pngPath = path.join(directory, 'fielora-source.png');
  const profilePath = path.join(directory, `profile-${path.basename(browserPath, '.exe')}`);
  const result = spawnSync(browserPath, [
    '--headless=new', '--disable-gpu', '--disable-extensions', '--disable-sync', '--hide-scrollbars',
    '--run-all-compositor-stages-before-draw', '--virtual-time-budget=1000', '--force-device-scale-factor=1',
    '--default-background-color=00000000', '--no-default-browser-check', '--no-first-run',
    `--user-data-dir=${profilePath}`, '--window-size=256,256', `--screenshot=${pngPath}`, htmlUrl,
  ], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
  if (result.status !== 0 || !existsSync(pngPath)) throw new Error(result.stderr || result.stdout || `exit ${result.status}`);
  const decoded = decodePng(readFileSync(pngPath));
  const alpha = alphaRange(decoded.pixels);
  if (decoded.width !== 256 || decoded.height !== 256 || alpha.minimum !== 0 || alpha.maximum !== 255) {
    throw new Error(`Invalid source render: ${JSON.stringify({ width: decoded.width, height: decoded.height, ...alpha })}`);
  }
  return decoded;
}

function main() {
  const availableBrowsers = browserCandidates.filter((candidate) => existsSync(candidate));
  if (availableBrowsers.length === 0) throw new Error('Microsoft Edge or Google Chrome is required to generate the Windows icon');
  const directory = mkdtempSync(path.join(tmpdir(), 'fielora-icon-'));
  try {
    const svg = readFileSync(sourcePath, 'utf8');
    const htmlPath = path.join(directory, 'icon.html');
    writeFileSync(htmlPath, `<style>html,body{margin:0;overflow:hidden;background:transparent}svg{position:absolute;inset:0 auto auto 0;display:block;width:256px;height:256px}</style>${svg}`);
    const errors = [];
    let source;
    for (const browserPath of availableBrowsers) {
      try {
        source = renderSource(browserPath, pathToFileURL(htmlPath).href, directory);
        break;
      } catch (error) {
        errors.push(`${browserPath}: ${error.message || error}`);
      }
    }
    if (!source) throw new Error(`No browser could render the icon:\n${errors.join('\n')}`);

    const images = sizes.map((size) => {
      const pixels = resizeRgba(source.pixels, source.width, source.height, size, size);
      const alpha = alphaRange(pixels);
      if (alpha.minimum !== 0 || alpha.maximum !== 255) throw new Error(`Invalid alpha range for ${size}px: ${JSON.stringify(alpha)}`);
      return { size, png: encodePng(size, size, pixels) };
    });
    writeFileSync(outputPath, encodeIco(images));
    if (previewPath) writeFileSync(previewPath, images.at(-1).png);
    process.stdout.write(`Generated transparent Windows icon: ${outputPath}\n`);
  } finally {
    rmSync(directory, { recursive: true, force: true, maxRetries: 12, retryDelay: 150 });
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
}
