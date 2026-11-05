/** Extract Photoshop's saved *merged canvas* (not layers) without Photoshop or external packages.
 * Supports RGB/greyscale 8/16-bit PSD+PSB and RAW/RLE/ZIP/ZIP-prediction.
 * Unsupported modes fail closed instead of displaying an inaccurate colour separation.
 */
import { open } from 'node:fs/promises';
import { deflateSync, inflateSync } from 'node:zlib';

const MAX_EDGE = 2400;
const MAX_OUTPUT_PIXELS = 6_000_000;
const MAX_ZIP_INPUT = 192 * 1024 * 1024;
const MAX_ZIP_OUTPUT = 256 * 1024 * 1024;
const MAX_DIMENSION = 100_000;
const crcTable = Uint32Array.from({length: 256}, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(b) {
  let c = 0xffffffff;
  for (const n of b) c = crcTable[(c ^ n) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const tag = Buffer.from(type, 'ascii');
  const count = Buffer.allocUnsafe(4);
  count.writeUInt32BE(data.length);
  const crc = Buffer.allocUnsafe(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tag, data])));
  return Buffer.concat([count, tag, data, crc]);
}
function pngFromRgba(rgba, width, height) {
  const stride = width * 4;
  const scanlines = Buffer.allocUnsafe((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    scanlines[start] = 0;
    rgba.copy(scanlines, start + 1, y * stride, (y + 1) * stride);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines, {level: 5})), chunk('IEND', Buffer.alloc(0)),
  ]);
}
function decodePackBits(input, expected) {
  const output = Buffer.allocUnsafe(expected);
  let i = 0, out = 0;
  while (i < input.length && out < expected) {
    const op = input.readInt8(i++);
    if (op >= 0) {
      const n = op + 1;
      if (i + n > input.length || out + n > expected) throw new Error('PSD_RLE_CORRUPT');
      input.copy(output, out, i, i + n);
      i += n;
      out += n;
    } else if (op >= -127) {
      const n = 1 - op;
      if (i >= input.length || out + n > expected) throw new Error('PSD_RLE_CORRUPT');
      output.fill(input[i++], out, out + n);
      out += n;
    }
  }
  if (out !== expected) throw new Error('PSD_RLE_CORRUPT');
  return output;
}
function undoZipPrediction(bytes, width, height, channels, depth) {
  const rowBytes = width * (depth / 8);
  for (let plane = 0; plane < channels; plane++) {
    for (let y = 0; y < height; y++) {
      const offset = (plane * height + y) * rowBytes;
      for (let i = 1; i < rowBytes; i++) bytes[offset + i] = (bytes[offset + i] + bytes[offset + i - 1]) & 255;
      if (depth === 16) {
        const row = Buffer.from(bytes.subarray(offset, offset + rowBytes));
        for (let x = 0; x < width; x++) {
          bytes[offset + 2 * x] = row[x];
          bytes[offset + 2 * x + 1] = row[width + x];
        }
      }
    }
  }
}

function hsbToRgb(h, s, v) {
  const sector = h * 6;
  const i = Math.floor(sector) % 6;
  const f = sector - Math.floor(sector);
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [
    [v, t, p], [q, v, p], [p, v, t],
    [p, q, v], [t, p, v], [v, p, q],
  ][i];
}

/** Returns {png,width,height,sourceWidth,sourceHeight}; never writes or changes input. */
export async function renderPsdComposite(file, options = {}) {
  const handle = await open(file, 'r');
  try {
    const size = (await handle.stat()).size;
    async function readAt(position, length) {
      if (!Number.isSafeInteger(position) || !Number.isSafeInteger(length) || position < 0 || length < 0 || position + length > size) {
        throw new Error('PSD_TRUNCATED');
      }
      const buf = Buffer.allocUnsafe(length);
      let got = 0;
      while (got < length) {
        const { bytesRead } = await handle.read(buf, got, length - got, position + got);
        if (!bytesRead) throw new Error('PSD_TRUNCATED');
        got += bytesRead;
      }
      return buf;
    }
    const head = await readAt(0, 26);
    const version = head.readUInt16BE(4);
    if (head.toString('ascii', 0, 4) !== '8BPS' || ![1, 2].includes(version)) throw new Error('NOT_PSD_OR_PSB');
    const channels = head.readUInt16BE(12);
    const sourceHeight = head.readUInt32BE(14);
    const sourceWidth = head.readUInt32BE(18);
    const depth = head.readUInt16BE(22);
    const colorMode = head.readUInt16BE(24);
    if (!sourceWidth || !sourceHeight || sourceWidth > MAX_DIMENSION || sourceHeight > MAX_DIMENSION || channels > 32) throw new Error('PSD_DIMENSIONS_UNSUPPORTED');
    if (![8, 16].includes(depth) || ![1, 3, 7].includes(colorMode)) throw new Error('PSD_COLOR_MODE_UNSUPPORTED');
    const multichannel = colorMode === 7;
    const baseChannels = colorMode === 3 ? 3 : 1;
    if (channels < baseChannels) throw new Error('PSD_CHANNELS_INVALID');
    const alphaChannel = !multichannel && channels > baseChannels ? baseChannels : -1;
    const bytesPerSample = depth / 8;
    const rowBytes = sourceWidth * bytesPerSample;
    const decompressedBytes = rowBytes * sourceHeight * channels;
    if (!Number.isSafeInteger(decompressedBytes)) throw new Error('PSD_SIZE_UNSUPPORTED');
    let position = 26;
    let spotColors = null;
    // Photoshop DisplayInfo resource 1077 contains each spot channel's
    // preview colour and opacity. Multichannel channels are inks, not RGB.
    if (multichannel) {
      const colorBytes = (await readAt(position, 4)).readUInt32BE(0);
      position += 4 + colorBytes;
      const resourceSize = (await readAt(position, 4)).readUInt32BE(0);
      position += 4;
      const resourceEnd = position + resourceSize;
      if (resourceEnd > size) throw new Error('PSD_TRUNCATED');
      while (position + 12 <= resourceEnd) {
        const header = await readAt(position, 7);
        if (header.toString('ascii', 0, 4) !== '8BIM') break;
        const id = header.readUInt16BE(4);
        const nameBytes = header[6] + 1;
        const namePadded = nameBytes + (nameBytes % 2);
        const length = (await readAt(position + 6 + namePadded, 4)).readUInt32BE(0);
        const payloadAt = position + 6 + namePadded + 4;
        if (payloadAt + length > resourceEnd) throw new Error('PSD_RESOURCE_CORRUPT');
        if (id === 1077 && length >= 4 + channels * 13 && length < 65536) {
          const info = await readAt(payloadAt, length);
          if (info.readUInt32BE(0) === 1) {
            spotColors = Array.from({length: channels}, (_, i) => {
              const offset = 4 + i * 13;
              const colorSpace = info.readUInt16BE(offset);
              const c = [0, 1, 2].map(j => info.readUInt16BE(offset + 2 + j * 2) / 65535);
              let rgb;
              if (colorSpace === 1) rgb = hsbToRgb(...c);
              else if (colorSpace === 0) rgb = c;
              else throw new Error('PSD_SPOT_COLOR_UNSUPPORTED');
              const opacity = Math.min(1, info.readUInt16BE(offset + 10) / 100);
              if (info[offset + 12] !== 2) throw new Error('PSD_SPOT_KIND_UNSUPPORTED');
              return {rgb, opacity};
            });
          }
        }
        position = payloadAt + length + (length % 2);
      }
      if (!spotColors?.length) throw new Error('PSD_SPOT_COLOR_MISSING');
      position = resourceEnd;
      const layerBytes = version === 2 ? Number((await readAt(position, 8)).readBigUInt64BE(0)) : (await readAt(position, 4)).readUInt32BE(0);
      position += (version === 2 ? 8 : 4) + layerBytes;
      if (position > size) throw new Error('PSD_TRUNCATED');
    } else for (const isLayerSection of [false, false, true]) {
      const lengthSize = isLayerSection && version === 2 ? 8 : 4;
      const field = await readAt(position, lengthSize);
      const length = lengthSize === 8 ? Number(field.readBigUInt64BE(0)) : field.readUInt32BE(0);
      if (!Number.isSafeInteger(length)) throw new Error('PSD_SIZE_UNSUPPORTED');
      position += lengthSize + length;
      if (position > size) throw new Error('PSD_TRUNCATED');
    }
    const compression = (await readAt(position, 2)).readUInt16BE(0);
    position += 2;
    if (![0, 1, 2, 3].includes(compression)) throw new Error('PSD_COMPRESSION_UNSUPPORTED');
    const requestedEdge = Math.max(256, Math.min(MAX_EDGE, Number(options.maxEdge) || MAX_EDGE));
    const scale = Math.min(1, requestedEdge / Math.max(sourceWidth, sourceHeight), Math.sqrt(MAX_OUTPUT_PIXELS / (sourceWidth * sourceHeight)));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const rgba = Buffer.alloc(width * height * 4, 255);
    let rowLengths = null, rowOffsets = null, zipped = null;
    if (compression === 1) {
      const entrySize = version === 2 ? 4 : 2;
      const count = sourceHeight * channels;
      if (count * entrySize > 32 * 1024 * 1024) throw new Error('PSD_RLE_TABLE_TOO_LARGE');
      const table = await readAt(position, count * entrySize);
      rowLengths = new Uint32Array(count);
      rowOffsets = new Float64Array(count);
      position += table.length;
      for (let i = 0; i < count; i++) {
        rowLengths[i] = entrySize === 2 ? table.readUInt16BE(i * 2) : table.readUInt32BE(i * 4);
        rowOffsets[i] = position;
        position += rowLengths[i];
      }
      if (position > size) throw new Error('PSD_RLE_TRUNCATED');
    } else if (compression === 2 || compression === 3) {
      if (decompressedBytes > MAX_ZIP_OUTPUT || size - position > MAX_ZIP_INPUT) throw new Error('PSD_ZIP_TOO_LARGE');
      zipped = inflateSync(await readAt(position, size - position), { maxOutputLength: decompressedBytes });
      if (zipped.length !== decompressedBytes) throw new Error('PSD_ZIP_CORRUPT');
      if (compression === 3) undoZipPrediction(zipped, sourceWidth, sourceHeight, channels, depth);
    }
    async function planeRow(plane, y) {
      if (compression === 0) return readAt(position + (plane * sourceHeight + y) * rowBytes, rowBytes);
      if (compression === 1) {
        const i = plane * sourceHeight + y;
        return decodePackBits(await readAt(rowOffsets[i], rowLengths[i]), rowBytes);
      }
      const begin = (plane * sourceHeight + y) * rowBytes;
      return zipped.subarray(begin, begin + rowBytes);
    }
    const planeCount = multichannel ? channels : baseChannels + (alphaChannel >= 0 ? 1 : 0);
    for (let dy = 0; dy < height; dy++) {
      const sy = Math.min(sourceHeight - 1, Math.floor((dy + 0.5) * sourceHeight / height));
      const rows = await Promise.all(Array.from({length: planeCount}, (_, ch) => planeRow(ch, sy)));
      for (let dx = 0; dx < width; dx++) {
        const sx = Math.min(sourceWidth - 1, Math.floor((dx + 0.5) * sourceWidth / width));
        const pos = sx * bytesPerSample;
        const byte = (ch) => rows[ch][pos];
        const dst = (dy * width + dx) * 4;
        if (multichannel) {
          let r = 1, g = 1, b = 1;
          for (let ch = 0; ch < channels; ch++) {
            const ink = (1 - byte(ch) / 255) * spotColors[ch].opacity;
            const [cr, cg, cb] = spotColors[ch].rgb;
            r = r * (1 - ink) + cr * ink;
            g = g * (1 - ink) + cg * ink;
            b = b * (1 - ink) + cb * ink;
          }
          rgba[dst] = Math.round(r * 255);
          rgba[dst + 1] = Math.round(g * 255);
          rgba[dst + 2] = Math.round(b * 255);
        } else {
          if (baseChannels === 1) rgba[dst] = rgba[dst + 1] = rgba[dst + 2] = byte(0);
          else { rgba[dst] = byte(0); rgba[dst + 1] = byte(1); rgba[dst + 2] = byte(2); }
          if (alphaChannel >= 0) rgba[dst + 3] = byte(alphaChannel);
        }
      }
    }
    return { png: pngFromRgba(rgba, width, height), width, height, sourceWidth, sourceHeight };
  } finally {
    await handle.close();
  }
}
