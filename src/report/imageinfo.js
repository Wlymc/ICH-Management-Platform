import fs from 'node:fs';

/**
 * 零依赖读取图片尺寸与格式（只需文件头，不用整图解码）。
 * 支持 JPEG / PNG / GIF / WEBP / BMP；读不出返回 null，调用方不要因此报错。
 */

function readPng(buffer) {
  if (buffer.length < 24) return null;
  if (buffer.readUInt32BE(0) !== 0x89504e47) return null;
  return { format: 'png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    // SOF0..SOF15（不含 DHT=C4、JPG=C8、DAC=CC）里带尺寸
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      if (width && height) return { format: 'jpeg', width, height };
      return null;
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength <= 0) return null;
    offset += 2 + segmentLength;
  }
  return null;
}

function readGif(buffer) {
  if (buffer.length < 10) return null;
  const signature = buffer.toString('ascii', 0, 3);
  if (signature !== 'GIF') return null;
  return { format: 'gif', width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function readBmp(buffer) {
  if (buffer.length < 26 || buffer.toString('ascii', 0, 2) !== 'BM') return null;
  return { format: 'bmp', width: buffer.readInt32LE(18), height: Math.abs(buffer.readInt32LE(22)) };
}

function readWebp(buffer) {
  if (buffer.length < 30) return null;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
    const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
    return { format: 'webp', width, height };
  }
  if (chunk === 'VP8 ') {
    return { format: 'webp', width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return { format: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

export function parseImageSize(buffer) {
  if (!buffer || buffer.length < 10) return null;
  return readPng(buffer) || readJpeg(buffer) || readGif(buffer) || readBmp(buffer) || readWebp(buffer) || null;
}

/** 读文件并返回 { format, width, height, longEdge, bytes } */
export function imageInfo(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const handle = fs.openSync(filePath, 'r');
    const head = Buffer.alloc(Math.min(65536, stat.size));
    fs.readSync(handle, head, 0, head.length, 0);
    fs.closeSync(handle);
    const size = parseImageSize(head);
    if (!size) return { format: null, width: null, height: null, longEdge: null, bytes: stat.size };
    return {
      ...size,
      longEdge: Math.max(size.width, size.height),
      bytes: stat.size,
    };
  } catch {
    return { format: null, width: null, height: null, longEdge: null, bytes: 0 };
  }
}
