import zlib from 'node:zlib';

/** 最小 .xlsx 读取器：从 zip 中取出 sheet1.xml 与 sharedStrings.xml */
function readZipEntries(buffer) {
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) {
      offset += 1;
      continue;
    }
    const method = buffer.readUInt16LE(offset + 8);
    const compSize = buffer.readUInt32LE(offset + 18);
    const uncompSize = buffer.readUInt32LE(offset + 22);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString('utf8', offset + 30, offset + 30 + nameLen);
    const dataStart = offset + 30 + nameLen + extraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > buffer.length) break;
    const raw = buffer.subarray(dataStart, dataEnd);
    try {
      entries.set(name, method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw, { finishFlush: zlib.constants.Z_SYNC_FLUSH }));
    } catch {
      try {
        entries.set(name, zlib.inflateRawSync(raw));
      } catch {
        entries.set(name, raw);
      }
    }
    offset = dataEnd;
    void uncompSize;
  }
  return entries;
}

function decodeXml(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match;
  while ((match = siRegex.exec(xml))) {
    const inner = match[1];
    const parts = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]));
    out.push(parts.join(''));
  }
  return out;
}

function columnIndex(ref) {
  const letters = String(ref).replace(/\d+/g, '');
  let index = 0;
  for (const char of letters) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

function parseSheet(xml, shared) {
  const rows = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(xml))) {
    const cells = [];
    const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1]))) {
      const attrs = cellMatch[1] || '';
      const inner = cellMatch[2] || '';
      const refMatch = attrs.match(/r="([A-Z]+)\d+"/);
      const index = refMatch ? columnIndex(refMatch[1]) : cells.length;
      const typeMatch = attrs.match(/t="([^"]+)"/);
      const type = typeMatch ? typeMatch[1] : 'n';
      let value = '';
      if (type === 'inlineStr') {
        value = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('');
      } else {
        const valueMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
        const raw = valueMatch ? valueMatch[1] : '';
        value = type === 's' ? shared[Number(raw)] ?? '' : decodeXml(raw);
      }
      while (cells.length < index) cells.push('');
      cells[index] = String(value).trim();
    }
    rows.push(cells);
  }
  return rows;
}

export function readXlsx(buffer) {
  const entries = readZipEntries(buffer);
  const shared = parseSharedStrings(entries.get('xl/sharedStrings.xml')?.toString('utf8'));
  let sheetKey = 'xl/worksheets/sheet1.xml';
  if (!entries.has(sheetKey)) {
    const found = [...entries.keys()].find((name) => /^xl\/worksheets\/.*\.xml$/.test(name) && !name.includes('_rels'));
    if (found) sheetKey = found;
  }
  const sheetXml = entries.get(sheetKey)?.toString('utf8');
  if (!sheetXml) throw new Error('无法解析该 Excel 文件，请另存为 CSV 后重试');
  return parseSheet(sheetXml, shared);
}
