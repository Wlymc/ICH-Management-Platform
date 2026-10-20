import zlib from 'node:zlib';

/** 最小 .xlsx 读取器：从 zip 中取出工作表 XML 与 sharedStrings.xml */
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

function parseAttributes(source) {
  const out = {};
  const regex = /([A-Za-z_][\w:.-]*)="([^"]*)"/g;
  let match;
  while ((match = regex.exec(source))) out[match[1]] = decodeXml(match[2]);
  return out;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  const siRegex = /<(?:[\w.-]+:)?si\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?si>/g;
  let match;
  while ((match = siRegex.exec(xml))) {
    const inner = match[1];
    const parts = [...inner.matchAll(/<(?:[\w.-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?t>/g)].map((m) => decodeXml(m[1]));
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
  const rowRegex = /<(?:[\w.-]+:)?row\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?row>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(xml))) {
    const cells = [];
    const cellRegex = /<(?:[\w.-]+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?c>)/g;
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
        value = [...inner.matchAll(/<(?:[\w.-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?t>/g)].map((m) => decodeXml(m[1])).join('');
      } else {
        const valueMatch = inner.match(/<(?:[\w.-]+:)?v>([\s\S]*?)<\/(?:[\w.-]+:)?v>/);
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

function normalizeEntryName(target) {
  let name = String(target || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (name.startsWith('xl/')) return name;
  if (name.startsWith('../')) name = name.replace(/^\.\.\//, '');
  if (name.startsWith('worksheets/') || name.startsWith('sharedStrings') || name.startsWith('workbook')) return `xl/${name}`;
  return name;
}

function sheetEntries(entries) {
  const workbook = entries.get('xl/workbook.xml')?.toString('utf8') || '';
  const relsXml = entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8') || '';
  const rels = new Map();
  for (const match of relsXml.matchAll(/<(?:[\w.-]+:)?Relationship\b([^>]*?)\/?>/g)) {
    const attrs = parseAttributes(match[1]);
    if (attrs.Id && attrs.Target) rels.set(attrs.Id, normalizeEntryName(attrs.Target));
  }

  const sheets = [];
  let index = 0;
  for (const match of workbook.matchAll(/<(?:[\w.-]+:)?sheet\b([^>]*?)\/?>/g)) {
    const attrs = parseAttributes(match[1]);
    index += 1;
    const key = rels.get(attrs['r:id']) || `xl/worksheets/sheet${index}.xml`;
    if (entries.has(key)) sheets.push({ name: attrs.name || `Sheet${index}`, key });
  }
  if (sheets.length) return sheets;

  return [...entries.keys()]
    .filter((name) => /^xl\/worksheets\/.*\.xml$/.test(name) && !name.includes('_rels'))
    .sort()
    .map((key, i) => ({ name: `Sheet${i + 1}`, key }));
}

/** 读取工作簿内全部工作表：返回 [{ name, rows }] */
export function readXlsxSheets(buffer) {
  const entries = readZipEntries(buffer);
  const shared = parseSharedStrings(entries.get('xl/sharedStrings.xml')?.toString('utf8'));
  const sheets = sheetEntries(entries).map(({ name, key }) => {
    const xml = entries.get(key)?.toString('utf8');
    if (!xml) throw new Error(`无法解析工作表：${name}`);
    return { name, rows: parseSheet(xml, shared) };
  });
  if (!sheets.length) throw new Error('无法解析该 Excel 文件，请另存为 CSV 后重试');
  return sheets;
}

/** 兼容旧调用：读取第一张工作表 */
export function readXlsx(buffer) {
  return readXlsxSheets(buffer)[0]?.rows || [];
}
